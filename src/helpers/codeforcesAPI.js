/* Home doc */
/**
 * @file Codeforces API service for fetching contest data
 * @see module:codeforcesAPI
 */

/* Module doc */
/**
 * Codeforces API service module
 * Handles rate limiting, pagination, caching, and all contest-related API calls
 * @module codeforcesAPI
 */

import { logger } from './logger.js';

const BASE_URL = 'https://codeforces.com/api/';
const RATE_LIMIT_INTERVAL = 2000; // 2 seconds in milliseconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 3000; // 3 seconds
const MAX_ITEMS_PER_REQUEST = 10000; // Maximum items per API call (Codeforces API practical limit)

// Cache configuration
const CACHE_TTL = {
	contestList: 3600000, // 1 hour
	standings: {
		active: 300000, // 5 minutes for active contests
		finished: 3600000 // 1 hour for finished contests
	},
	submissions: 300000, // 5 minutes
	ratingChanges: 3600000, // 1 hour
	hacks: 300000 // 5 minutes
};

/**
 * In-memory cache for API responses
 */
const cache = new Map();

/**
 * Codeforces API service class
 * Handles all interactions with Codeforces API including rate limiting, pagination, and caching
 */
class CodeforcesAPI {
	constructor() {
		this.lastRequestTime = 0;
		this.requestQueue = [];
		this.processingQueue = false;
	}

	/**
	 * Wait for rate limit interval to pass
	 * @private
	 * @returns {Promise<void>}
	 */
	async waitForRateLimit() {
		const now = Date.now();
		const timeSinceLastRequest = now - this.lastRequestTime;

		if (timeSinceLastRequest < RATE_LIMIT_INTERVAL) {
			const waitTime = RATE_LIMIT_INTERVAL - timeSinceLastRequest;
			await new Promise(resolve => setTimeout(resolve, waitTime));
		}

		this.lastRequestTime = Date.now();
	}

	/**
	 * Make a request to Codeforces API with rate limiting and retry logic
	 * @private
	 * @param {string} endpoint - API endpoint
	 * @param {Object} params - Query parameters
	 * @param {number} retryCount - Current retry attempt
	 * @returns {Promise<Object>} API response
	 */
	async makeRequest(endpoint, params = {}, retryCount = 0) {
		await this.waitForRateLimit();

		const queryString = new URLSearchParams(params).toString();
		const url = `${BASE_URL}${endpoint}?${queryString}`;

		try {
			logger.debug(`Codeforces API Request: ${url}`);

			const response = await fetch(url);
			const data = await response.json();

			if (data.status === 'FAILED') {
				// Handle rate limit exceeded
				if (data.comment && data.comment.includes('Call limit exceeded')) {
					if (retryCount < MAX_RETRIES) {
						logger.warn(`Rate limit exceeded, retrying in ${RETRY_DELAY}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
						await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
						return this.makeRequest(endpoint, params, retryCount + 1);
					}
					throw new Error('Codeforces API rate limit exceeded. Please try again later.');
				}

				// Handle other errors
				throw new Error(data.comment || 'Codeforces API request failed');
			}

			return data.result;
		} catch (error) {
			if (error.message.includes('rate limit')) {
				throw error;
			}

			// Network or other errors
			if (retryCount < MAX_RETRIES) {
				logger.warn(`Request failed, retrying in ${RETRY_DELAY}ms (attempt ${retryCount + 1}/${MAX_RETRIES}): ${error.message}`);
				await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)));
				return this.makeRequest(endpoint, params, retryCount + 1);
			}

			logger.error(`Codeforces API request failed after ${MAX_RETRIES} retries: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Get cache key for a request
	 * @private
	 * @param {string} type - Data type
	 * @param {Object} params - Request parameters
	 * @returns {string} Cache key
	 */
	getCacheKey(type, params) {
		const keyParts = [type];
		if (params.contestId) keyParts.push(`contest:${params.contestId}`);
		if (params.handle) keyParts.push(`handle:${params.handle}`);
		if (params.gym !== undefined) keyParts.push(`gym:${params.gym}`);
		if (params.showUnofficial !== undefined) keyParts.push(`unofficial:${params.showUnofficial}`);
		return keyParts.join(':');
	}

	/**
	 * Check if cached data is still valid
	 * @private
	 * @param {string} key - Cache key
	 * @param {number} ttl - Time to live in milliseconds
	 * @returns {Object|null} Cached data or null if expired
	 */
	getCached(key, ttl) {
		const cached = cache.get(key);
		if (!cached) return null;

		const age = Date.now() - cached.timestamp;
		if (age > ttl) {
			cache.delete(key);
			return null;
		}

		return cached.data;
	}

	/**
	 * Store data in cache
	 * @private
	 * @param {string} key - Cache key
	 * @param {*} data - Data to cache
	 */
	setCache(key, data) {
		cache.set(key, {
			data,
			timestamp: Date.now()
		});
	}

	/**
	 * Get list of all contests
	 * @param {boolean} includeGym - Include gym contests
	 * @returns {Promise<Array>} List of contests
	 */
	async getContestList(includeGym = false) {
		const cacheKey = this.getCacheKey('contestList', { gym: includeGym });
		const cached = this.getCached(cacheKey, CACHE_TTL.contestList);

		if (cached) {
			logger.debug('Returning cached contest list');
			return cached;
		}

		const params = {};
		if (includeGym) {
			params.gym = 'true';
		}

		const result = await this.makeRequest('contest.list', params);
		this.setCache(cacheKey, result);

		return result;
	}

	/**
	 * Get complete contest standings (handles pagination automatically)
	 * @param {number} contestId - Contest ID
	 * @param {boolean} showUnofficial - Include unofficial participants
	 * @returns {Promise<Object>} Complete standings with contest info, problems, and all rows
	 */
	async getContestStandings(contestId, showUnofficial = false) {
		const cacheKey = this.getCacheKey('standings', { contestId, showUnofficial });
		
		// Determine TTL based on contest phase (we'll check after first request)
		let ttl = CACHE_TTL.standings.finished;

		// Check cache
		const cached = this.getCached(cacheKey, ttl);
		if (cached) {
			logger.debug(`Returning cached standings for contest ${contestId}`);
			return cached;
		}

		const allRows = [];
		let from = 1;
		const count = MAX_ITEMS_PER_REQUEST; // Fetch maximum rows per call
		let contest = null;
		let problems = null;
		let hasMore = true;

		while (hasMore) {
			const params = {
				contestId: contestId.toString(),
				from: from.toString(),
				count: count.toString()
			};

			if (showUnofficial) {
				params.showUnofficial = 'true';
			}

			const result = await this.makeRequest('contest.standings', params);

			// Store contest and problems info from first request
			if (!contest) {
				contest = result.contest;
				problems = result.problems;
				
				// Determine TTL based on contest phase
				if (contest.phase === 'FINISHED' || contest.phase === 'SYSTEM_TEST') {
					ttl = CACHE_TTL.standings.finished;
				} else {
					ttl = CACHE_TTL.standings.active;
				}
			}

			if (result.rows && result.rows.length > 0) {
				// Always filter to only CONTESTANT participants for storage
				// Codeforces API may return VIRTUAL and PRACTICE participants
				// We only save CONTESTANT participants regardless of showUnofficial parameter
				const filteredRows = result.rows.filter(row => 
					row.party && row.party.participantType === 'CONTESTANT'
				);
				
				allRows.push(...filteredRows);
				
				// If we got fewer rows than requested, we've reached the end
				if (result.rows.length < count) {
					hasMore = false;
				} else {
					from += count;
				}
			} else {
				hasMore = false;
			}

			logger.debug(`Fetched ${allRows.length} standings rows for contest ${contestId} (CONTESTANT only)`);
		}

		const completeStandings = {
			contest,
			problems,
			rows: allRows
		};

		this.setCache(cacheKey, completeStandings);
		logger.info(`Fetched complete standings for contest ${contestId}: ${allRows.length} participants`);

		return completeStandings;
	}

	/**
	 * Get all submissions for a contest (handles pagination automatically)
	 * @param {number} contestId - Contest ID
	 * @param {string|null} handle - Optional user handle to filter submissions
	 * @param {boolean} contestantsOnly - If true, only return submissions from CONTESTANT participants (default: true for storage)
	 * @returns {Promise<Array>} All submissions
	 */
	async getContestSubmissions(contestId, handle = null, contestantsOnly = true) {
		const cacheKey = this.getCacheKey('submissions', { contestId, handle, contestantsOnly });
		const cached = this.getCached(cacheKey, CACHE_TTL.submissions);

		if (cached) {
			logger.debug(`Returning cached submissions for contest ${contestId}${handle ? ` (handle: ${handle})` : ''}${contestantsOnly ? ' (CONTESTANT only)' : ''}`);
			return cached;
		}

		const allSubmissions = [];
		let from = 1;
		const count = MAX_ITEMS_PER_REQUEST; // Fetch maximum submissions per call
		let hasMore = true;

		while (hasMore) {
			const params = {
				contestId: contestId.toString(),
				from: from.toString(),
				count: count.toString()
			};

			if (handle) {
				params.handle = handle;
			}

			const result = await this.makeRequest('contest.status', params);

			if (result && result.length > 0) {
				// Always filter to only CONTESTANT participants for storage
				// Codeforces API may return submissions from VIRTUAL and PRACTICE participants
				const filteredSubmissions = contestantsOnly 
					? result.filter(sub => 
						sub.author && sub.author.participantType === 'CONTESTANT'
					)
					: result;
				
				allSubmissions.push(...filteredSubmissions);
				
				// If we got fewer submissions than requested, we've reached the end
				if (result.length < count) {
					hasMore = false;
				} else {
					from += count;
				}
			} else {
				hasMore = false;
			}

			logger.debug(`Fetched ${allSubmissions.length} submissions for contest ${contestId}${handle ? ` (handle: ${handle})` : ''}${contestantsOnly ? ' (CONTESTANT only)' : ''}`);
		}

		this.setCache(cacheKey, allSubmissions);
		logger.info(`Fetched all submissions for contest ${contestId}${handle ? ` (handle: ${handle})` : ''}${contestantsOnly ? ' (CONTESTANT only)' : ''}: ${allSubmissions.length} total`);

		return allSubmissions;
	}

	/**
	 * Get rating changes after a contest
	 * @param {number} contestId - Contest ID
	 * @returns {Promise<Array>} Rating changes
	 */
	async getContestRatingChanges(contestId) {
		const cacheKey = this.getCacheKey('ratingChanges', { contestId });
		const cached = this.getCached(cacheKey, CACHE_TTL.ratingChanges);

		if (cached) {
			logger.debug(`Returning cached rating changes for contest ${contestId}`);
			return cached;
		}

		const params = {
			contestId: contestId.toString()
		};

		const result = await this.makeRequest('contest.ratingChanges', params);
		this.setCache(cacheKey, result);

		logger.info(`Fetched rating changes for contest ${contestId}: ${result.length} changes`);

		return result;
	}

	/**
	 * Get hacks in a contest
	 * @param {number} contestId - Contest ID
	 * @returns {Promise<Array>} List of hacks
	 */
	async getContestHacks(contestId) {
		const cacheKey = this.getCacheKey('hacks', { contestId });
		const cached = this.getCached(cacheKey, CACHE_TTL.hacks);

		if (cached) {
			logger.debug(`Returning cached hacks for contest ${contestId}`);
			return cached;
		}

		const params = {
			contestId: contestId.toString()
		};

		const result = await this.makeRequest('contest.hacks', params);
		this.setCache(cacheKey, result);

		logger.info(`Fetched hacks for contest ${contestId}: ${result.length} hacks`);

		return result;
	}

	/**
	 * Get complete contest data (all data in one call)
	 * @param {number} contestId - Contest ID
	 * @param {boolean} showUnofficial - Include unofficial participants in standings (for API fetching, but always filtered to CONTESTANT for storage)
	 * @returns {Promise<Object>} Complete contest data
	 */
	async getCompleteContestData(contestId, showUnofficial = false) {
		logger.info(`Fetching complete contest data for contest ${contestId} (CONTESTANT only - showUnofficial=${showUnofficial} for API fetch)`);

		// Always filter to only CONTESTANT participants for storage
		// showUnofficial parameter is used for API fetching but we always filter to CONTESTANT
		const contestantsOnly = true;

		const [standings, submissions, ratingChanges, hacks] = await Promise.all([
			this.getContestStandings(contestId, showUnofficial),
			this.getContestSubmissions(contestId, null, contestantsOnly),
			this.getContestRatingChanges(contestId).catch(() => []), // Rating changes may not be available
			this.getContestHacks(contestId).catch(() => []) // Hacks may not be available
		]);

		return {
			contest: standings.contest,
			problems: standings.problems,
			standings: standings.rows,
			submissions,
			ratingChanges,
			hacks
		};
	}
}

// Export singleton instance
export const codeforcesAPI = new CodeforcesAPI();

