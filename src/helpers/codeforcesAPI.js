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
	 * @param {string} progressContext - Optional context for progress logging (e.g., "Page 2/5")
	 * @returns {Promise<Object>} API response
	 */
	async makeRequest(endpoint, params = {}, retryCount = 0, progressContext = '') {
		await this.waitForRateLimit();

		const queryString = new URLSearchParams(params).toString();
		const url = `${BASE_URL}${endpoint}?${queryString}`;

		try {
			const startTime = Date.now();
			const contextPrefix = progressContext ? `[${progressContext}] ` : '';
			logger.info(`${contextPrefix}Codeforces API Request: ${endpoint}${queryString ? ` (${Object.keys(params).length} params)` : ''}`);
			if (queryString) {
				logger.debug(`${contextPrefix}Full URL: ${url}`);
			}

			const response = await fetch(url);
			const data = await response.json();

			if (data.status === 'FAILED') {
				// Handle rate limit exceeded
				if (data.comment && data.comment.includes('Call limit exceeded')) {
					if (retryCount < MAX_RETRIES) {
						logger.warn(`${contextPrefix}Rate limit exceeded, retrying in ${RETRY_DELAY}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
						await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
						return this.makeRequest(endpoint, params, retryCount + 1, progressContext);
					}
					throw new Error('Codeforces API rate limit exceeded. Please try again later.');
				}

				// Handle other errors
				throw new Error(data.comment || 'Codeforces API request failed');
			}

			const duration = Date.now() - startTime;
			const resultSize = Array.isArray(data.result) ? data.result.length : (typeof data.result === 'object' ? 'object' : 'single value');
			logger.info(`${contextPrefix}API Request completed: ${endpoint} - Duration: ${duration}ms, Result: ${resultSize}`);

			return data.result;
		} catch (error) {
			if (error.message.includes('rate limit')) {
				throw error;
			}

			const contextPrefix = progressContext ? `[${progressContext}] ` : '';

			// Network or other errors
			if (retryCount < MAX_RETRIES) {
				logger.warn(`${contextPrefix}Request failed, retrying in ${RETRY_DELAY * (retryCount + 1)}ms (attempt ${retryCount + 1}/${MAX_RETRIES}): ${error.message}`);
				await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)));
				return this.makeRequest(endpoint, params, retryCount + 1, progressContext);
			}

			logger.error(`${contextPrefix}Codeforces API request failed after ${MAX_RETRIES} retries: ${error.message}`);
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
			logger.info(`[CACHE HIT] Returning cached contest list (includeGym=${includeGym})`);
			return cached;
		}

		logger.info(`[CONTEST LIST] Fetching contest list (includeGym=${includeGym})`);
		const operationStartTime = Date.now();

		const params = {};
		if (includeGym) {
			params.gym = 'true';
		}

		const result = await this.makeRequest('contest.list', params, 0, 'Contest List');
		this.setCache(cacheKey, result);

		const operationDuration = Date.now() - operationStartTime;
		logger.info(`[CONTEST LIST] ✓ Completed fetching contest list: ${result.length} contests - Total time: ${operationDuration}ms`);

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
			logger.info(`[CACHE HIT] Returning cached standings for contest ${contestId}`);
			return cached;
		}

		logger.info(`[STANDINGS] Starting to fetch standings for contest ${contestId} (showUnofficial=${showUnofficial})`);
		const operationStartTime = Date.now();

		const allRows = [];
		let from = 1;
		const count = MAX_ITEMS_PER_REQUEST; // Fetch maximum rows per call
		let contest = null;
		let problems = null;
		let hasMore = true;
		let pageNumber = 1;

		while (hasMore) {
			const params = {
				contestId: contestId.toString(),
				from: from.toString(),
				count: count.toString()
			};

			if (showUnofficial) {
				params.showUnofficial = 'true';
			}

			const progressContext = `Standings Page ${pageNumber} (from=${from})`;
			const result = await this.makeRequest('contest.standings', params, 0, progressContext);

			// Store contest and problems info from first request
			if (!contest) {
				contest = result.contest;
				problems = result.problems;
				
				logger.info(`[STANDINGS] Contest info: ${contest.name} (ID: ${contestId}, Phase: ${contest.phase})`);
				
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
				
				logger.info(`[STANDINGS] Page ${pageNumber} complete: ${filteredRows.length} CONTESTANT participants (Total so far: ${allRows.length})`);
				
				// If we got fewer rows than requested, we've reached the end
				if (result.rows.length < count) {
					hasMore = false;
					logger.info(`[STANDINGS] Reached end of standings (got ${result.rows.length} < ${count} requested)`);
				} else {
					from += count;
					pageNumber++;
				}
			} else {
				hasMore = false;
				logger.info(`[STANDINGS] No more rows available (page ${pageNumber})`);
			}
		}

		const completeStandings = {
			contest,
			problems,
			rows: allRows
		};

		this.setCache(cacheKey, completeStandings);
		const operationDuration = Date.now() - operationStartTime;
		logger.info(`[STANDINGS] ✓ Completed fetching standings for contest ${contestId}: ${allRows.length} CONTESTANT participants in ${pageNumber} page(s) - Total time: ${operationDuration}ms`);

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
			logger.info(`[CACHE HIT] Returning cached submissions for contest ${contestId}${handle ? ` (handle: ${handle})` : ''}${contestantsOnly ? ' (CONTESTANT only)' : ''}`);
			return cached;
		}

		const filterDesc = handle ? `handle=${handle}` : 'all handles';
		const typeDesc = contestantsOnly ? 'CONTESTANT only' : 'all participants';
		logger.info(`[SUBMISSIONS] Starting to fetch submissions for contest ${contestId} (${filterDesc}, ${typeDesc})`);
		const operationStartTime = Date.now();

		const allSubmissions = [];
		let from = 1;
		const count = MAX_ITEMS_PER_REQUEST; // Fetch maximum submissions per call
		let hasMore = true;
		let pageNumber = 1;

		while (hasMore) {
			const params = {
				contestId: contestId.toString(),
				from: from.toString(),
				count: count.toString()
			};

			if (handle) {
				params.handle = handle;
			}

			const progressContext = `Submissions Page ${pageNumber} (from=${from}${handle ? `, handle=${handle}` : ''})`;
			const result = await this.makeRequest('contest.status', params, 0, progressContext);

			if (result && result.length > 0) {
				// Always filter to only CONTESTANT participants for storage
				// Codeforces API may return submissions from VIRTUAL and PRACTICE participants
				const filteredSubmissions = contestantsOnly 
					? result.filter(sub => 
						sub.author && sub.author.participantType === 'CONTESTANT'
					)
					: result;
				
				allSubmissions.push(...filteredSubmissions);
				
				logger.info(`[SUBMISSIONS] Page ${pageNumber} complete: ${filteredSubmissions.length} submissions${contestantsOnly ? ' (CONTESTANT)' : ''} (Total so far: ${allSubmissions.length})`);
				
				// If we got fewer submissions than requested, we've reached the end
				if (result.length < count) {
					hasMore = false;
					logger.info(`[SUBMISSIONS] Reached end of submissions (got ${result.length} < ${count} requested)`);
				} else {
					from += count;
					pageNumber++;
				}
			} else {
				hasMore = false;
				logger.info(`[SUBMISSIONS] No more submissions available (page ${pageNumber})`);
			}
		}

		this.setCache(cacheKey, allSubmissions);
		const operationDuration = Date.now() - operationStartTime;
		logger.info(`[SUBMISSIONS] ✓ Completed fetching submissions for contest ${contestId}${handle ? ` (handle: ${handle})` : ''}${contestantsOnly ? ' (CONTESTANT only)' : ''}: ${allSubmissions.length} total in ${pageNumber} page(s) - Total time: ${operationDuration}ms`);

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
			logger.info(`[CACHE HIT] Returning cached rating changes for contest ${contestId}`);
			return cached;
		}

		logger.info(`[RATING CHANGES] Fetching rating changes for contest ${contestId}`);
		const operationStartTime = Date.now();

		const params = {
			contestId: contestId.toString()
		};

		const result = await this.makeRequest('contest.ratingChanges', params, 0, `Rating Changes (contestId=${contestId})`);
		this.setCache(cacheKey, result);

		const operationDuration = Date.now() - operationStartTime;
		logger.info(`[RATING CHANGES] ✓ Completed fetching rating changes for contest ${contestId}: ${result.length} changes - Total time: ${operationDuration}ms`);

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
			logger.info(`[CACHE HIT] Returning cached hacks for contest ${contestId}`);
			return cached;
		}

		logger.info(`[HACKS] Fetching hacks for contest ${contestId}`);
		const operationStartTime = Date.now();

		const params = {
			contestId: contestId.toString()
		};

		const result = await this.makeRequest('contest.hacks', params, 0, `Hacks (contestId=${contestId})`);
		this.setCache(cacheKey, result);

		const operationDuration = Date.now() - operationStartTime;
		logger.info(`[HACKS] ✓ Completed fetching hacks for contest ${contestId}: ${result.length} hacks - Total time: ${operationDuration}ms`);

		return result;
	}

	/**
	 * Get complete contest data (all data in one call)
	 * @param {number} contestId - Contest ID
	 * @param {boolean} showUnofficial - Include unofficial participants in standings (for API fetching, but always filtered to CONTESTANT for storage)
	 * @returns {Promise<Object>} Complete contest data
	 */
	async getCompleteContestData(contestId, showUnofficial = false) {
		logger.info(`[COMPLETE DATA] ========================================`);
		logger.info(`[COMPLETE DATA] Starting to fetch complete contest data for contest ${contestId}`);
		logger.info(`[COMPLETE DATA] Configuration: showUnofficial=${showUnofficial} (for API), but filtering to CONTESTANT only`);
		logger.info(`[COMPLETE DATA] ========================================`);
		const overallStartTime = Date.now();

		// Always filter to only CONTESTANT participants for storage
		// showUnofficial parameter is used for API fetching but we always filter to CONTESTANT
		const contestantsOnly = true;

		logger.info(`[COMPLETE DATA] Fetching data in parallel: standings, submissions, ratingChanges, hacks`);

		const [standings, submissions, ratingChanges, hacks] = await Promise.all([
			this.getContestStandings(contestId, showUnofficial),
			this.getContestSubmissions(contestId, null, contestantsOnly),
			this.getContestRatingChanges(contestId).catch((error) => {
				logger.warn(`[COMPLETE DATA] Rating changes not available for contest ${contestId}: ${error.message}`);
				return [];
			}),
			this.getContestHacks(contestId).catch((error) => {
				logger.warn(`[COMPLETE DATA] Hacks not available for contest ${contestId}: ${error.message}`);
				return [];
			})
		]);

		const overallDuration = Date.now() - overallStartTime;
		logger.info(`[COMPLETE DATA] ========================================`);
		logger.info(`[COMPLETE DATA] ✓ Completed fetching all data for contest ${contestId}:`);
		logger.info(`[COMPLETE DATA]   - Standings: ${standings.rows.length} participants`);
		logger.info(`[COMPLETE DATA]   - Submissions: ${submissions.length} submissions`);
		logger.info(`[COMPLETE DATA]   - Rating Changes: ${ratingChanges.length} changes`);
		logger.info(`[COMPLETE DATA]   - Hacks: ${hacks.length} hacks`);
		logger.info(`[COMPLETE DATA]   - Total time: ${overallDuration}ms`);
		logger.info(`[COMPLETE DATA] ========================================`);

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

