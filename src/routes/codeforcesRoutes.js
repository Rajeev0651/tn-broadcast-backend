import { Router } from 'express';
import { codeforcesAPI } from '../helpers/codeforcesAPI.js';
import { codeforcesDataService } from '../services/codeforcesDataService.js';
import { models } from '../data/models/index.js';
import { logger } from '../helpers/logger.js';

const router = Router();

/**
 * Store complete contest data
 * POST /api/codeforces/contests/:contestId/store
 * 
 * Query Parameters:
 * - showUnofficial: boolean (optional, default: false) - For API fetching, but always filters to CONTESTANT for storage
 * 
 * Body Parameters (alternative):
 * - showUnofficial: boolean (optional) - Can be passed in POST body instead of query
 * 
 * Fetches complete contest data from Codeforces API and stores in MongoDB.
 * Only CONTESTANT participants are saved (VIRTUAL and PRACTICE are filtered out).
 */
router.post('/contests/:contestId/store', async (req, res) => {
	try {
		const contestId = parseInt(req.params.contestId);
		
		if (!contestId || contestId <= 0) {
			return res.status(400).json({
				success: false,
				error: 'Invalid contest ID'
			});
		}

		// Get showUnofficial from query or body (default: false)
		const showUnofficial = req.query.showUnofficial === 'true' || req.body.showUnofficial === true;

		logger.info(`API: Storing contest data for contest ${contestId} (showUnofficial=${showUnofficial} for API fetch, but filtering to CONTESTANT only)`);

		const startTime = Date.now();

		// Fetch complete contest data from Codeforces API
		// Note: showUnofficial is used for API fetching, but results are always filtered to CONTESTANT
		const contestData = await codeforcesAPI.getCompleteContestData(contestId, showUnofficial);

		const fetchTime = Date.now() - startTime;

		// Store data in MongoDB using batched storage
		const storeStartTime = Date.now();
		await codeforcesDataService.storeCompleteContestData(contestId, contestData);
		const storeTime = Date.now() - storeStartTime;

		const totalTime = Date.now() - startTime;

		logger.info(`API: Stored contest ${contestId} data - Fetch: ${fetchTime}ms, Store: ${storeTime}ms, Total: ${totalTime}ms`);

		res.status(200).json({
			success: true,
			message: `Contest ${contestId} data stored successfully`,
			data: {
				contestId,
				contest: contestData.contest,
				problemsCount: contestData.problems?.length || 0,
				standingsCount: contestData.standings?.length || 0,
				submissionsCount: contestData.submissions?.length || 0,
				ratingChangesCount: contestData.ratingChanges?.length || 0,
				hacksCount: contestData.hacks?.length || 0,
				performance: {
					fetchTimeMs: fetchTime,
					storeTimeMs: storeTime,
					totalTimeMs: totalTime
				},
				note: 'Only CONTESTANT participants are stored (VIRTUAL and PRACTICE filtered out)'
			}
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
 * POST /api/codeforces/contests/store-list
 * 
 * Query Parameters:
 * - includeGym: boolean (optional, default: false) - Include gym contests
 * 
 * Body Parameters (alternative):
 * - includeGym: boolean (optional) - Can be passed in POST body instead of query
 * 
 * Fetches all contests from Codeforces API and stores in MongoDB.
 */
router.post('/contests/store-list', async (req, res) => {
	try {
		// Get includeGym from query or body (default: false)
		const includeGym = req.query.includeGym === 'true' || req.body.includeGym === true;

		logger.info(`API: Storing contest list (includeGym=${includeGym})`);

		const startTime = Date.now();

		// Fetch contest list from Codeforces API
		const contests = await codeforcesAPI.getContestList(includeGym);

		const fetchTime = Date.now() - startTime;

		// Store contest list in MongoDB
		const storeStartTime = Date.now();
		await codeforcesDataService.storeContestList(contests);
		const storeTime = Date.now() - storeStartTime;

		const totalTime = Date.now() - startTime;

		logger.info(`API: Stored contest list - Fetch: ${fetchTime}ms, Store: ${storeTime}ms, Total: ${totalTime}ms`);

		res.status(200).json({
			success: true,
			message: 'Contest list stored successfully',
			data: {
				contestsCount: contests.length,
				includeGym,
				performance: {
					fetchTimeMs: fetchTime,
					storeTimeMs: storeTime,
					totalTimeMs: totalTime
				}
			}
		});
	} catch (error) {
		logger.error(`API Error storing contest list: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message || 'Failed to store contest list'
		});
	}
});

/**
 * Get contest data from MongoDB
 * GET /api/codeforces/contests/:contestId
 * 
 * Returns contest metadata, problems, and counts of related data.
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

		const contest = await codeforcesDataService.getContestFromDB(contestId);

		if (!contest) {
			return res.status(404).json({
				success: false,
				error: `Contest ${contestId} not found in database`
			});
		}

		const problems = await codeforcesDataService.getProblemsFromDB(contestId);

		// Get counts from batched collections
		const [standingsBatches, contestDataBatches] = await Promise.all([
			models.BatchedStandingsData.find({ contestId }).select('standingsCount').lean(),
			models.BatchedContestData.find({ contestId }).select('submissionsCount ratingChangesCount hacksCount').lean()
		]);

		const standingsCount = standingsBatches.reduce((sum, batch) => sum + (batch.standingsCount || 0), 0);
		const submissionsCount = contestDataBatches.reduce((sum, batch) => sum + (batch.submissionsCount || 0), 0);
		const ratingChangesCount = contestDataBatches.reduce((sum, batch) => sum + (batch.ratingChangesCount || 0), 0);
		const hacksCount = contestDataBatches.reduce((sum, batch) => sum + (batch.hacksCount || 0), 0);

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
 * Get contest standings from MongoDB
 * GET /api/codeforces/contests/:contestId/standings
 * 
 * Query Parameters:
 * - limit: number (optional, default: 100) - Number of standings to return
 * - skip: number (optional, default: 0) - Number of standings to skip (for pagination)
 * - unofficial: boolean (optional, default: false) - Include unofficial participants
 * 
 * Returns paginated standings from BatchedStandingsData collection.
 */
router.get('/contests/:contestId/standings', async (req, res) => {
	try {
		const contestId = parseInt(req.params.contestId);

		if (!contestId || contestId <= 0) {
			return res.status(400).json({
				success: false,
				error: 'Invalid contest ID'
			});
		}

		const limit = parseInt(req.query.limit) || 100;
		const skip = parseInt(req.query.skip) || 0;
		const showUnofficial = req.query.unofficial === 'true';

		// Convert skip to from (1-indexed)
		const from = skip + 1;

		const standings = await codeforcesDataService.getStandingsFromDB(
			contestId,
			from,
			limit,
			showUnofficial
		);

		if (!standings.contest) {
			return res.status(404).json({
				success: false,
				error: `Contest ${contestId} not found in database`
			});
		}

		res.status(200).json({
			success: true,
			data: standings
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
 * Get contest submissions from MongoDB
 * GET /api/codeforces/contests/:contestId/submissions
 * 
 * Query Parameters:
 * - limit: number (optional, default: 100) - Number of submissions to return
 * - skip: number (optional, default: 0) - Number of submissions to skip (for pagination)
 * - handle: string (optional) - Filter by user handle
 * 
 * Returns paginated submissions from BatchedContestData collection.
 */
router.get('/contests/:contestId/submissions', async (req, res) => {
	try {
		const contestId = parseInt(req.params.contestId);

		if (!contestId || contestId <= 0) {
			return res.status(400).json({
				success: false,
				error: 'Invalid contest ID'
			});
		}

		const limit = parseInt(req.query.limit) || 100;
		const handle = req.query.handle || null;

		// Note: skip is not directly supported in getSubmissionsFromDB
		// We'll fetch more and slice if needed, or implement skip in the service
		const submissions = await codeforcesDataService.getSubmissionsFromDB(
			contestId,
			limit,
			handle
		);

		res.status(200).json({
			success: true,
			data: {
				submissions,
				count: submissions.length
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

