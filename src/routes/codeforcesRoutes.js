import { Router } from 'express';
import { CodeforcesDataService } from '../services/codeforcesDataService.js';
import { models } from '../data/models/index.js';
import { logger } from '../helpers/logger.js';

const router = Router();
const dataService = new CodeforcesDataService(models);

/* ============================================================================
 * WRITE APIs - Fetch from Codeforces API and Store in MongoDB
 * ============================================================================
 * 
 * These APIs fetch data from Codeforces API and store it in MongoDB.
 * They use the CodeforcesDataService to handle API calls and database operations.
 * 
 * When adding new WRITE APIs:
 * 1. Add your route handler in this section
 * 2. Use dataService methods (e.g., dataService.storeXXX())
 * 3. Follow the pattern: Fetch from API → Transform → Store in DB
 * 4. Add corresponding curl request to Agent/curl.txt
 * 5. Update ARCHITECTURE.md if needed
 * 
 * Related files:
 * - Service: src/services/codeforcesDataService.js
 * - API Helper: src/helpers/codeforcesAPI.js
 * - Models: src/data/models/index.js
 * ============================================================================ */

/**
 * Store complete contest data (standings, submissions, rating changes, hacks)
 * Fetches from Codeforces API and stores in MongoDB using batched storage
 * 
 * WRITE API: Fetches from Codeforces API → Stores in DB
 * - Standings → BatchedStandingsData collection (separate collection)
 * - Submissions, RatingChanges, Hacks → BatchedContestData collection
 * 
 * POST /api/codeforces/contests/:contestId/store
 * 
 * Query Parameters:
 * - showUnofficial: boolean (default: false) - Include unofficial participants
 * 
 * Body Parameters (optional):
 * - showUnofficial: boolean - Alternative way to pass parameter
 */
router.post('/contests/:contestId/store', async (req, res) => {
	try {
		const contestId = parseInt(req.params.contestId);
		const showUnofficial = req.query.showUnofficial === 'true' || (req.body && req.body.showUnofficial === true);

		if (!contestId || contestId <= 0) {
			return res.status(400).json({
				success: false,
				error: 'Invalid contest ID'
			});
		}

		logger.info(`API: Storing complete contest data for contest ${contestId}`);

		const result = await dataService.storeCompleteContestData(contestId, showUnofficial);

		res.status(200).json({
			success: true,
			message: `Successfully stored complete contest data for contest ${contestId}`,
			data: result
		});
	} catch (error) {
		logger.error(`API Error storing contest data: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message || 'Failed to store contest data'
		});
	}
});

/**
 * Store contest list
 * Fetches all contests from Codeforces API and stores in MongoDB
 * 
 * WRITE API: Fetches from Codeforces API → Stores in DB
 * 
 * POST /api/codeforces/contests/store-list
 * 
 * Query Parameters:
 * - includeGym: boolean (default: false) - Include gym contests
 * 
 * Body Parameters (optional):
 * - includeGym: boolean - Alternative way to pass parameter
 */
router.post('/contests/store-list', async (req, res) => {
	try {
		const includeGym = req.query.includeGym === 'true' || (req.body && req.body.includeGym === true);

		logger.info(`API: Storing contest list (includeGym: ${includeGym})`);

		const result = await dataService.storeContestList(includeGym);

		res.status(200).json({
			success: true,
			message: 'Successfully stored contest list',
			data: result
		});
	} catch (error) {
		logger.error(`API Error storing contest list: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message || 'Failed to store contest list'
		});
	}
});

/* ============================================================================
 * READ APIs - Read Data from MongoDB Only
 * ============================================================================
 * 
 * These APIs only read data from MongoDB. They do NOT fetch from Codeforces API.
 * Use these APIs when you need to retrieve data that has already been stored.
 * 
 * When adding new READ APIs:
 * 1. Add your route handler in this section
 * 2. Use models directly (e.g., models.Contests.find())
 * 3. Follow the pattern: Query DB → Return data
 * 4. Add pagination if returning large datasets
 * 5. Add corresponding curl request to Agent/curl.txt
 * 6. Update ARCHITECTURE.md if needed
 * 
 * Related files:
 * - Models: src/data/models/index.js
 * - Schemas: src/data/models/schemas/
 * ============================================================================ */

/**
 * Get contest data from database
 * Returns contest metadata, problems, and counts of related data
 * 
 * READ API: Reads from MongoDB only
 * 
 * GET /api/codeforces/contests/:contestId
 * 
 * Returns:
 * - contest: Contest metadata
 * - problems: Array of problems
 * - counts: Object with counts for standings, submissions, ratingChanges, hacks
 */
router.get('/contests/:contestId', async (req, res) => {
	try {
		const contestId = parseInt(req.params.contestId);

		if (!contestId || contestId <= 0) {
			return res.status(400).json({
				success: false,
				error: 'Invalid contest ID'
			});
		}

		const contest = await models.Contests.findOne({ contestId }).lean();
		
		if (!contest) {
			return res.status(404).json({
				success: false,
				error: `Contest ${contestId} not found in database`
			});
		}

		// Get related data counts
		// Note: Using old collections for counts. If using batched collections, 
		// you may need to query BatchedStandingsData and BatchedContestData instead
		const [problems, standingsCount, submissionsCount, ratingChangesCount, hacksCount] = await Promise.all([
			models.Problems.find({ contestId }).lean(),
			models.Standings.countDocuments({ contestId }),
			models.Submissions.countDocuments({ contestId }),
			models.RatingChanges.countDocuments({ contestId }),
			models.Hacks.countDocuments({ contestId })
		]);

		res.status(200).json({
			success: true,
			data: {
				contest,
				problems,
				counts: {
					problems: problems.length,
					standings: standingsCount,
					submissions: submissionsCount,
					ratingChanges: ratingChangesCount,
					hacks: hacksCount
				}
			}
		});
	} catch (error) {
		logger.error(`API Error getting contest data: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message || 'Failed to get contest data'
		});
	}
});

/**
 * Get contest standings from database
 * Returns standings data with pagination support
 * 
 * READ API: Reads from MongoDB only (BatchedStandingsData collection)
 * 
 * GET /api/codeforces/contests/:contestId/standings
 * 
 * Query Parameters:
 * - limit: number (default: 100) - Number of records to return
 * - skip: number (default: 0) - Number of records to skip
 * - unofficial: boolean (default: false) - Filter by unofficial participants. false = official only, true = unofficial only
 * 
 * Returns:
 * - standings: Array of standings records
 * - pagination: Object with total, limit, skip, hasMore
 */
router.get('/contests/:contestId/standings', async (req, res) => {
	try {
		const contestId = parseInt(req.params.contestId);
		const limit = parseInt(req.query.limit) || 100;
		const skip = parseInt(req.query.skip) || 0;
		// Default to false (official only) if not specified
		const isUnofficial = req.query.unofficial === 'true' ? true : false;

		if (!contestId || contestId <= 0) {
			return res.status(400).json({
				success: false,
				error: 'Invalid contest ID'
			});
		}

		// Use BatchedStandingsData collection
		// Default to official participants only (isUnofficial: false)
		const result = await dataService.getBatchedStandings(contestId, {
			limit,
			skip,
			sort: { rank: 1 },
			isUnofficial: isUnofficial
		});

		res.status(200).json({
			success: true,
			data: {
				standings: result.standings,
				pagination: {
					total: result.total,
					limit,
					skip,
					hasMore: skip + limit < result.total
				}
			}
		});
	} catch (error) {
		logger.error(`API Error getting standings: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message || 'Failed to get standings'
		});
	}
});

/**
 * Get contest submissions from database
 * Returns submissions data with pagination and filtering support
 * 
 * READ API: Reads from MongoDB only (BatchedContestData collection)
 * 
 * GET /api/codeforces/contests/:contestId/submissions
 * 
 * Query Parameters:
 * - limit: number (default: 100) - Number of records to return
 * - skip: number (default: 0) - Number of records to skip
 * - handle: string - Filter by user handle
 * 
 * Returns:
 * - submissions: Array of submission records
 * - pagination: Object with total, limit, skip, hasMore
 */
router.get('/contests/:contestId/submissions', async (req, res) => {
	try {
		const contestId = parseInt(req.params.contestId);
		const limit = parseInt(req.query.limit) || 100;
		const skip = parseInt(req.query.skip) || 0;
		const handle = req.query.handle;

		if (!contestId || contestId <= 0) {
			return res.status(400).json({
				success: false,
				error: 'Invalid contest ID'
			});
		}

		// Use BatchedContestData collection
		const result = await dataService.getBatchedSubmissions(contestId, {
			limit,
			skip,
			handle,
			sort: { creationTimeSeconds: -1 }
		});

		res.status(200).json({
			success: true,
			data: {
				submissions: result.submissions,
				pagination: {
					total: result.total,
					limit,
					skip,
					hasMore: skip + limit < result.total
				}
			}
		});
	} catch (error) {
		logger.error(`API Error getting submissions: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message || 'Failed to get submissions'
		});
	}
});

export default router;
