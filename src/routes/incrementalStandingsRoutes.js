import { Router } from 'express';
import { incrementalSimulationService } from '../services/incrementalSimulationService.js';
import { snapshotService } from '../services/snapshotService.js';
import { simulationService } from '../services/simulationService.js';
import { models } from '../data/models/index.js';
import { getModels } from '../services/modelProvider.js';
import { logger } from '../helpers/logger.js';

const router = Router();

/**
 * Initialize Standings State
 * POST /api/incremental-standings/:contestId/initialize
 * 
 * Query Parameters:
 * - fileMode: boolean (optional, default: false) - Use file storage instead of MongoDB
 * 
 * Initializes the standingsState collection from existing submissions.
 * This processes all submissions and builds participant states incrementally.
 * 
 * This should be run once per contest before creating snapshots.
 */
router.post('/:contestId/initialize', async (req, res) => {
	try {
		const contestId = parseInt(req.params.contestId);
		const fileMode = req.query.fileMode === 'true';
		
		if (!contestId || contestId <= 0) {
			return res.status(400).json({
				success: false,
				error: 'Invalid contest ID'
			});
		}

		const storageMode = fileMode ? 'file' : 'MongoDB';
		logger.info(`[API INIT] ========================================`);
		logger.info(`[API INIT] POST /api/incremental-standings/${contestId}/initialize`);
		logger.info(`[API INIT] Parameters: fileMode=${fileMode}, storageMode=${storageMode}`);
		logger.info(`[API INIT] ========================================`);

		const startTime = Date.now();
		
		await incrementalSimulationService.initializeStandingsState(contestId, fileMode);
		
		const elapsed = Date.now() - startTime;

		// Get participant count
		const Models = getModels(fileMode);
		const participantCount = await Models.StandingsState.countDocuments({ contestId });

		logger.info(`[API INIT] ========================================`);
		logger.info(`[API INIT] ✓ Request completed successfully`);
		logger.info(`[API INIT]   - Contest ID: ${contestId}`);
		logger.info(`[API INIT]   - Participants: ${participantCount}`);
		logger.info(`[API INIT]   - Total API time: ${elapsed}ms`);
		logger.info(`[API INIT] ========================================`);

		res.status(200).json({
			success: true,
			message: `Standings state initialized for contest ${contestId}`,
			data: {
				contestId,
				participantCount,
				initializationTimeMs: elapsed,
				fileMode,
				storageMode
			}
		});
	} catch (error) {
		logger.error(`API: Error initializing standings state for contest ${req.params.contestId}: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message
		});
	}
});

/**
 * Get Standings State Info
 * GET /api/incremental-standings/:contestId/state/info
 * 
 * Query Parameters:
 * - fileMode: boolean (optional, default: false) - Use file storage instead of MongoDB
 * 
 * Returns information about the standings state for a contest.
 */
router.get('/:contestId/state/info', async (req, res) => {
	try {
		const contestId = parseInt(req.params.contestId);
		const fileMode = req.query.fileMode === 'true';
		
		if (!contestId || contestId <= 0) {
			return res.status(400).json({
				success: false,
				error: 'Invalid contest ID'
			});
		}

		const Models = getModels(fileMode);
		const participantCount = await Models.StandingsState.countDocuments({ contestId });
		
		// Get sample participant
		const sampleParticipant = await Models.StandingsState.findOne({ contestId }).lean();

		res.status(200).json({
			success: true,
			data: {
				contestId,
				participantCount,
				isInitialized: participantCount > 0,
				fileMode,
				storageMode: fileMode ? 'file' : 'MongoDB',
				sampleParticipant: sampleParticipant ? {
					handle: sampleParticipant.handle,
					totalPoints: sampleParticipant.totalPoints,
					totalPenalty: sampleParticipant.totalPenalty,
					solvedCount: sampleParticipant.solvedCount
				} : null
			}
		});
	} catch (error) {
		logger.error(`API: Error getting standings state info for contest ${contestId}: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message
		});
	}
});

/**
 * Create Base Snapshot
 * POST /api/incremental-standings/:contestId/snapshots/base
 * 
 * Body Parameters:
 * - timestampSeconds: number (required) - Timestamp relative to contest start (seconds)
 * 
 * Query Parameters:
 * - fileMode: boolean (optional, default: false) - Use file storage instead of MongoDB
 * 
 * Creates a base snapshot (full state for all participants) at the specified timestamp.
 */
router.post('/:contestId/snapshots/base', async (req, res) => {
	try {
		const contestId = parseInt(req.params.contestId);
		const { timestampSeconds } = req.body;
		const fileMode = req.query.fileMode === 'true';
		
		if (!contestId || contestId <= 0) {
			return res.status(400).json({
				success: false,
				error: 'Invalid contest ID'
			});
		}

		if (timestampSeconds === undefined || timestampSeconds === null || timestampSeconds < 0) {
			return res.status(400).json({
				success: false,
				error: 'timestampSeconds is required and must be >= 0'
			});
		}

		const storageMode = fileMode ? 'file' : 'MongoDB';
		logger.info(`[API BASE SNAPSHOT] ========================================`);
		logger.info(`[API BASE SNAPSHOT] POST /api/incremental-standings/${contestId}/snapshots/base`);
		logger.info(`[API BASE SNAPSHOT] Parameters: timestampSeconds=${timestampSeconds}, fileMode=${fileMode}, storageMode=${storageMode}`);
		logger.info(`[API BASE SNAPSHOT] ========================================`);

		const startTime = Date.now();
		
		const snapshot = await snapshotService.createBaseSnapshot(contestId, timestampSeconds, fileMode);
		
		const elapsed = Date.now() - startTime;
		
		logger.info(`[API BASE SNAPSHOT] ========================================`);
		logger.info(`[API BASE SNAPSHOT] ✓ Request completed successfully`);
		logger.info(`[API BASE SNAPSHOT]   - Contest ID: ${contestId}`);
		logger.info(`[API BASE SNAPSHOT]   - Timestamp: ${timestampSeconds}`);
		logger.info(`[API BASE SNAPSHOT]   - Participants: ${snapshot.participantCount}`);
		logger.info(`[API BASE SNAPSHOT]   - Total API time: ${elapsed}ms`);
		logger.info(`[API BASE SNAPSHOT] ========================================`);

		res.status(201).json({
			success: true,
			message: `Base snapshot created for contest ${contestId} at timestamp ${timestampSeconds}`,
			data: {
				contestId,
				timestampSeconds,
				snapshotId: snapshot._id,
				participantCount: snapshot.participantCount,
				creationTimeMs: elapsed,
				fileMode,
				storageMode,
				createdAt: snapshot.createdAt
			}
		});
	} catch (error) {
		logger.error(`API: Error creating base snapshot for contest ${contestId}: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message
		});
	}
});

/**
 * Create Delta Snapshot
 * POST /api/incremental-standings/:contestId/snapshots/delta
 * 
 * Body Parameters:
 * - timestampSeconds: number (required) - Timestamp relative to contest start (seconds)
 * 
 * Query Parameters:
 * - fileMode: boolean (optional, default: false) - Use file storage instead of MongoDB
 * 
 * Creates a delta snapshot (changes only) at the specified timestamp.
 */
router.post('/:contestId/snapshots/delta', async (req, res) => {
	try {
		const contestId = parseInt(req.params.contestId);
		const { timestampSeconds } = req.body;
		const fileMode = req.query.fileMode === 'true';
		
		if (!contestId || contestId <= 0) {
			return res.status(400).json({
				success: false,
				error: 'Invalid contest ID'
			});
		}

		if (timestampSeconds === undefined || timestampSeconds === null || timestampSeconds < 0) {
			return res.status(400).json({
				success: false,
				error: 'timestampSeconds is required and must be >= 0'
			});
		}

		const storageMode = fileMode ? 'file' : 'MongoDB';
		logger.info(`[API DELTA SNAPSHOT] ========================================`);
		logger.info(`[API DELTA SNAPSHOT] POST /api/incremental-standings/${contestId}/snapshots/delta`);
		logger.info(`[API DELTA SNAPSHOT] Parameters: timestampSeconds=${timestampSeconds}, fileMode=${fileMode}, storageMode=${storageMode}`);
		logger.info(`[API DELTA SNAPSHOT] ========================================`);

		const startTime = Date.now();
		
		const snapshot = await snapshotService.createDeltaSnapshot(contestId, timestampSeconds, fileMode);
		
		const elapsed = Date.now() - startTime;
		
		logger.info(`[API DELTA SNAPSHOT] ========================================`);
		logger.info(`[API DELTA SNAPSHOT] ✓ Request completed successfully`);
		logger.info(`[API DELTA SNAPSHOT]   - Contest ID: ${contestId}`);
		logger.info(`[API DELTA SNAPSHOT]   - Timestamp: ${timestampSeconds}`);
		logger.info(`[API DELTA SNAPSHOT]   - Changes: ${snapshot.changeCount}`);
		logger.info(`[API DELTA SNAPSHOT]   - Base timestamp: ${snapshot.baseSnapshotTimestamp}`);
		logger.info(`[API DELTA SNAPSHOT]   - Total API time: ${elapsed}ms`);
		logger.info(`[API DELTA SNAPSHOT] ========================================`);

		res.status(201).json({
			success: true,
			message: `Delta snapshot created for contest ${contestId} at timestamp ${timestampSeconds}`,
			data: {
				contestId,
				timestampSeconds,
				snapshotId: snapshot._id,
				changeCount: snapshot.changeCount,
				baseSnapshotTimestamp: snapshot.baseSnapshotTimestamp,
				creationTimeMs: elapsed,
				fileMode,
				storageMode,
				createdAt: snapshot.createdAt
			}
		});
	} catch (error) {
		logger.error(`API: Error creating delta snapshot for contest ${contestId}: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message
		});
	}
});

/**
 * Create Snapshot (Auto-detect base or delta)
 * POST /api/incremental-standings/:contestId/snapshots
 * 
 * Body Parameters:
 * - timestampSeconds: number (required) - Timestamp relative to contest start (seconds)
 * 
 * Query Parameters:
 * - fileMode: boolean (optional, default: false) - Use file storage instead of MongoDB
 * 
 * Automatically creates a base snapshot (every 120 seconds) or delta snapshot (every 10 seconds).
 * Uses recommended intervals: 120s for base, 10s for delta.
 */
router.post('/:contestId/snapshots', async (req, res) => {
	try {
		const contestId = parseInt(req.params.contestId);
		const { timestampSeconds } = req.body;
		const fileMode = req.query.fileMode === 'true';
		
		if (!contestId || contestId <= 0) {
			return res.status(400).json({
				success: false,
				error: 'Invalid contest ID'
			});
		}

		if (timestampSeconds === undefined || timestampSeconds === null || timestampSeconds < 0) {
			return res.status(400).json({
				success: false,
				error: 'timestampSeconds is required and must be >= 0'
			});
		}

		const BASE_INTERVAL = 120; // Base snapshots every 120 seconds
		const DELTA_INTERVAL = 10;  // Delta snapshots every 10 seconds

		// Check if this should be a base snapshot
		const isBaseSnapshot = timestampSeconds % BASE_INTERVAL === 0;
		
		// Check if this should be a delta snapshot (but not at base interval)
		const isDeltaSnapshot = !isBaseSnapshot && (timestampSeconds % DELTA_INTERVAL === 0);

		if (!isBaseSnapshot && !isDeltaSnapshot) {
			return res.status(400).json({
				success: false,
				error: `Timestamp ${timestampSeconds} is not at a snapshot interval. Base snapshots: every ${BASE_INTERVAL}s, Delta snapshots: every ${DELTA_INTERVAL}s`
			});
		}

		const snapshotType = isBaseSnapshot ? 'BASE' : 'DELTA';
		const storageMode = fileMode ? 'file' : 'MongoDB';
		logger.info(`[API SNAPSHOT] ========================================`);
		logger.info(`[API SNAPSHOT] POST /api/incremental-standings/${contestId}/snapshots`);
		logger.info(`[API SNAPSHOT] Parameters: timestampSeconds=${timestampSeconds}, fileMode=${fileMode}, storageMode=${storageMode}`);
		logger.info(`[API SNAPSHOT] Auto-detected snapshot type: ${snapshotType} (BASE every ${BASE_INTERVAL}s, DELTA every ${DELTA_INTERVAL}s)`);
		logger.info(`[API SNAPSHOT] ========================================`);

		const startTime = Date.now();
		
		const snapshot = await snapshotService.createSnapshot(contestId, timestampSeconds, fileMode);
		
		const elapsed = Date.now() - startTime;
		
		logger.info(`[API SNAPSHOT] ========================================`);
		logger.info(`[API SNAPSHOT] ✓ Request completed successfully`);
		logger.info(`[API SNAPSHOT]   - Contest ID: ${contestId}`);
		logger.info(`[API SNAPSHOT]   - Timestamp: ${timestampSeconds}`);
		logger.info(`[API SNAPSHOT]   - Snapshot type: ${snapshot.snapshotType}`);
		if (snapshot.snapshotType === 'BASE') {
			logger.info(`[API SNAPSHOT]   - Participants: ${snapshot.participantCount}`);
		} else {
			logger.info(`[API SNAPSHOT]   - Changes: ${snapshot.changeCount}`);
			logger.info(`[API SNAPSHOT]   - Base timestamp: ${snapshot.baseSnapshotTimestamp}`);
		}
		logger.info(`[API SNAPSHOT]   - Total API time: ${elapsed}ms`);
		logger.info(`[API SNAPSHOT] ========================================`);

		const responseData = {
			contestId,
			timestampSeconds,
			snapshotType,
			snapshotId: snapshot._id,
			creationTimeMs: elapsed,
			fileMode,
			storageMode,
			createdAt: snapshot.createdAt
		};

		if (snapshot.snapshotType === 'BASE') {
			responseData.participantCount = snapshot.participantCount;
		} else {
			responseData.changeCount = snapshot.changeCount;
			responseData.baseSnapshotTimestamp = snapshot.baseSnapshotTimestamp;
		}

		res.status(201).json({
			success: true,
			message: `${snapshotType} snapshot created for contest ${contestId} at timestamp ${timestampSeconds}`,
			data: responseData
		});
	} catch (error) {
		logger.error(`API: Error creating snapshot for contest ${contestId}: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message
		});
	}
});

/**
 * Get Standings at Time
 * GET /api/incremental-standings/:contestId/standings
 * 
 * Query Parameters:
 * - timestampSeconds: number (required) - Timestamp relative to contest start (seconds)
 * - rankFrom: number (optional, default: 1) - Starting rank (1-indexed)
 * - rankTo: number (optional, default: null) - Ending rank (1-indexed, inclusive)
 * - showUnofficial: boolean (optional, default: false) - Include unofficial participants
 * - fileMode: boolean (optional, default: false) - Use file storage instead of MongoDB
 * 
 * Returns standings at the specified timestamp using snapshot replay.
 */
router.get('/:contestId/standings', async (req, res) => {
	try {
		const contestId = parseInt(req.params.contestId);
		const timestampSeconds = req.query.timestampSeconds ? parseInt(req.query.timestampSeconds) : null;
		const rankFrom = req.query.rankFrom ? parseInt(req.query.rankFrom) : 1;
		const rankTo = req.query.rankTo ? parseInt(req.query.rankTo) : null;
		const showUnofficial = req.query.showUnofficial === 'true';
		const fileMode = req.query.fileMode === 'true';

		if (!contestId || contestId <= 0) {
			return res.status(400).json({
				success: false,
				error: 'Invalid contest ID'
			});
		}

		if (timestampSeconds === null || timestampSeconds === undefined || timestampSeconds < 0) {
			return res.status(400).json({
				success: false,
				error: 'timestampSeconds query parameter is required and must be >= 0'
			});
		}

		if (rankFrom < 1) {
			return res.status(400).json({
				success: false,
				error: 'rankFrom must be >= 1'
			});
		}

		if (rankTo !== null && rankTo < rankFrom) {
			return res.status(400).json({
				success: false,
				error: 'rankTo must be >= rankFrom'
			});
		}

		const storageMode = fileMode ? 'file' : 'MongoDB';
		logger.info(`[API GET STANDINGS] ========================================`);
		logger.info(`[API GET STANDINGS] GET /api/incremental-standings/${contestId}/standings`);
		logger.info(`[API GET STANDINGS] Parameters: timestampSeconds=${timestampSeconds}, rankFrom=${rankFrom}, rankTo=${rankTo || 'end'}, showUnofficial=${showUnofficial}, fileMode=${fileMode}, storageMode=${storageMode}`);
		logger.info(`[API GET STANDINGS] ========================================`);

		const startTime = Date.now();
		
		// Note: simulationService.getStandingsAtTime internally uses incrementalSimulationService
		// which now supports fileMode, but simulationService needs to pass it through
		// For now, we'll call incrementalSimulationService directly
		const result = await incrementalSimulationService.getStandingsAtTime(
			contestId,
			timestampSeconds,
			rankFrom,
			rankTo,
			showUnofficial,
			fileMode
		);
		
		const elapsed = Date.now() - startTime;
		
		logger.info(`[API GET STANDINGS] ========================================`);
		logger.info(`[API GET STANDINGS] ✓ Request completed successfully`);
		logger.info(`[API GET STANDINGS]   - Contest ID: ${contestId}`);
		logger.info(`[API GET STANDINGS]   - Timestamp: ${timestampSeconds}`);
		logger.info(`[API GET STANDINGS]   - Rank range: ${rankFrom}-${rankTo || 'end'}`);
		logger.info(`[API GET STANDINGS]   - Rows returned: ${result.rows.length}`);
		logger.info(`[API GET STANDINGS]   - Total API time: ${elapsed}ms`);
		logger.info(`[API GET STANDINGS] ========================================`);

		res.status(200).json({
			success: true,
			data: {
				contestId,
				timestampSeconds,
				rankFrom,
				rankTo,
				showUnofficial,
				queryTimeMs: elapsed,
				fileMode,
				storageMode,
				contest: result.contest,
				problems: result.problems,
				rows: result.rows,
				rowCount: result.rows.length
			}
		});
	} catch (error) {
		logger.error(`API: Error getting standings for contest ${contestId} at timestamp ${timestampSeconds}: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message
		});
	}
});

/**
 * Create Snapshots at Intervals (Bulk Creation)
 * POST /api/incremental-standings/:contestId/snapshots/bulk
 * 
 * Body Parameters:
 * - baseInterval: number (optional, default: 120) - Interval for base snapshots in seconds
 * - deltaInterval: number (optional, default: 10) - Interval for delta snapshots in seconds
 * - endTimestamp: number (optional) - End timestamp (relative to contest start). If not provided, uses contest duration
 * - startTimestamp: number (optional, default: 0) - Start timestamp (relative to contest start)
 * 
 * Query Parameters:
 * - fileMode: boolean (optional, default: false) - Use file storage instead of MongoDB
 * 
 * Creates base snapshots at baseInterval intervals and delta snapshots at deltaInterval intervals,
 * starting from startTimestamp (default 0) up to endTimestamp (or contest duration).
 * 
 * Note: Delta snapshots are NOT created at base snapshot timestamps.
 */
router.post('/:contestId/snapshots/bulk', async (req, res) => {
	try {
		const contestId = parseInt(req.params.contestId);
		const { baseInterval = 120, deltaInterval = 10, endTimestamp = null, startTimestamp = 0 } = req.body;
		const fileMode = req.query.fileMode === 'true';
		
		if (!contestId || contestId <= 0) {
			return res.status(400).json({
				success: false,
				error: 'Invalid contest ID'
			});
		}

		if (baseInterval <= 0 || deltaInterval <= 0) {
			return res.status(400).json({
				success: false,
				error: 'baseInterval and deltaInterval must be > 0'
			});
		}

		if (startTimestamp < 0) {
			return res.status(400).json({
				success: false,
				error: 'startTimestamp must be >= 0'
			});
		}

		if (endTimestamp !== null && endTimestamp <= startTimestamp) {
			return res.status(400).json({
				success: false,
				error: 'endTimestamp must be > startTimestamp'
			});
		}

		// Get contest to determine duration if endTimestamp not provided
		const { codeforcesDataService } = await import('../services/codeforcesDataService.js');
		const contest = await codeforcesDataService.getContestFromDB(contestId);
		
		if (!contest) {
			return res.status(404).json({
				success: false,
				error: `Contest ${contestId} not found in database. Please fetch contest data first.`
			});
		}

		const finalEndTimestamp = endTimestamp !== null ? endTimestamp : (contest.durationSeconds || 7200);
		const storageMode = fileMode ? 'file' : 'MongoDB';
		
		logger.info(`[API BULK SNAPSHOTS] ========================================`);
		logger.info(`[API BULK SNAPSHOTS] POST /api/incremental-standings/${contestId}/snapshots/bulk`);
		logger.info(`[API BULK SNAPSHOTS] Parameters: baseInterval=${baseInterval}s, deltaInterval=${deltaInterval}s, startTimestamp=${startTimestamp}, endTimestamp=${finalEndTimestamp}, fileMode=${fileMode}, storageMode=${storageMode}`);
		logger.info(`[API BULK SNAPSHOTS] Contest: ${contest.name} (Duration: ${contest.durationSeconds || 'unknown'}s)`);
		logger.info(`[API BULK SNAPSHOTS] ========================================`);

		const startTime = Date.now();
		
		// Calculate all snapshot timestamps
		const baseTimestamps = [];
		const deltaTimestamps = [];
		
		// Calculate base snapshot timestamps
		// Always start from 0 if startTimestamp is 0, otherwise from first multiple >= startTimestamp
		const firstBaseTimestamp = startTimestamp === 0 ? 0 : Math.ceil(startTimestamp / baseInterval) * baseInterval;
		for (let t = firstBaseTimestamp; t <= finalEndTimestamp; t += baseInterval) {
			baseTimestamps.push(t);
		}
		
		// Calculate delta snapshot timestamps (every deltaInterval, but not at base intervals)
		// Always start from 0 if startTimestamp is 0, otherwise from first multiple >= startTimestamp
		const firstDeltaTimestamp = startTimestamp === 0 ? 0 : Math.ceil(startTimestamp / deltaInterval) * deltaInterval;
		for (let t = firstDeltaTimestamp; t <= finalEndTimestamp; t += deltaInterval) {
			// Only add if not at a base snapshot interval
			if (t % baseInterval !== 0) {
				deltaTimestamps.push(t);
			}
		}
		
		logger.info(`[API BULK SNAPSHOTS] Will create ${baseTimestamps.length} base snapshot(s) at timestamps: [${baseTimestamps.join(', ')}]`);
		logger.info(`[API BULK SNAPSHOTS] Will create ${deltaTimestamps.length} delta snapshot(s) at timestamps: [${deltaTimestamps.slice(0, 10).join(', ')}${deltaTimestamps.length > 10 ? `, ... (${deltaTimestamps.length} total)` : ''}]`);
		
		// Create snapshots
		const createdSnapshots = {
			base: [],
			delta: [],
			errors: []
		};
		
		// Create base snapshots
		for (const timestamp of baseTimestamps) {
			try {
				logger.info(`[API BULK SNAPSHOTS] Creating base snapshot at timestamp ${timestamp} (${baseTimestamps.indexOf(timestamp) + 1}/${baseTimestamps.length})`);
				const snapshot = await snapshotService.createBaseSnapshot(contestId, timestamp, fileMode);
				createdSnapshots.base.push({
					timestampSeconds: timestamp,
					snapshotId: snapshot._id,
					participantCount: snapshot.participantCount,
					createdAt: snapshot.createdAt
				});
			} catch (error) {
				logger.error(`[API BULK SNAPSHOTS] Error creating base snapshot at timestamp ${timestamp}: ${error.message}`);
				createdSnapshots.errors.push({
					timestampSeconds: timestamp,
					type: 'BASE',
					error: error.message
				});
			}
		}
		
		// Create delta snapshots
		for (const timestamp of deltaTimestamps) {
			try {
				const progress = deltaTimestamps.indexOf(timestamp) + 1;
				if (progress % 10 === 0 || progress === deltaTimestamps.length) {
					logger.info(`[API BULK SNAPSHOTS] Creating delta snapshot at timestamp ${timestamp} (${progress}/${deltaTimestamps.length})`);
				}
				const snapshot = await snapshotService.createDeltaSnapshot(contestId, timestamp, fileMode);
				createdSnapshots.delta.push({
					timestampSeconds: timestamp,
					snapshotId: snapshot._id,
					changeCount: snapshot.changeCount,
					baseSnapshotTimestamp: snapshot.baseSnapshotTimestamp,
					createdAt: snapshot.createdAt
				});
			} catch (error) {
				logger.error(`[API BULK SNAPSHOTS] Error creating delta snapshot at timestamp ${timestamp}: ${error.message}`);
				createdSnapshots.errors.push({
					timestampSeconds: timestamp,
					type: 'DELTA',
					error: error.message
				});
			}
		}
		
		const elapsed = Date.now() - startTime;
		
		logger.info(`[API BULK SNAPSHOTS] ========================================`);
		logger.info(`[API BULK SNAPSHOTS] ✓ Bulk snapshot creation completed`);
		logger.info(`[API BULK SNAPSHOTS]   - Contest ID: ${contestId}`);
		logger.info(`[API BULK SNAPSHOTS]   - Base snapshots created: ${createdSnapshots.base.length}/${baseTimestamps.length}`);
		logger.info(`[API BULK SNAPSHOTS]   - Delta snapshots created: ${createdSnapshots.delta.length}/${deltaTimestamps.length}`);
		logger.info(`[API BULK SNAPSHOTS]   - Errors: ${createdSnapshots.errors.length}`);
		logger.info(`[API BULK SNAPSHOTS]   - Total time: ${elapsed}ms`);
		logger.info(`[API BULK SNAPSHOTS] ========================================`);

		res.status(201).json({
			success: true,
			message: `Bulk snapshot creation completed for contest ${contestId}`,
			data: {
				contestId,
				contestName: contest.name,
				baseInterval,
				deltaInterval,
				startTimestamp,
				endTimestamp: finalEndTimestamp,
				contestDuration: contest.durationSeconds,
				createdSnapshots: {
					baseCount: createdSnapshots.base.length,
					deltaCount: createdSnapshots.delta.length,
					totalCount: createdSnapshots.base.length + createdSnapshots.delta.length,
					baseSnapshots: createdSnapshots.base,
					deltaSnapshots: createdSnapshots.delta
				},
				errors: createdSnapshots.errors.length > 0 ? createdSnapshots.errors : undefined,
				creationTimeMs: elapsed,
				fileMode,
				storageMode
			}
		});
	} catch (error) {
		logger.error(`API: Error creating bulk snapshots for contest ${req.params.contestId}: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message
		});
	}
});

/**
 * Validate Incremental Standings against Batch Standings
 * GET /api/incremental-standings/:contestId/validate
 * 
 * Query Parameters:
 * - timestampSeconds: number (optional) - Timestamp to validate at (defaults to highest available snapshot)
 * - fileMode: boolean (optional, default: false) - Use file storage instead of MongoDB
 * 
 * Compares incremental standings at specified timestamp with batch standings (final standings).
 * Reports differences in participants, scores, and rankings.
 */
router.get('/:contestId/validate', async (req, res) => {
	try {
		const contestId = parseInt(req.params.contestId);
		const timestampSeconds = req.query.timestampSeconds ? parseInt(req.query.timestampSeconds) : null;
		const fileMode = req.query.fileMode === 'true';
		
		if (!contestId || contestId <= 0) {
			return res.status(400).json({
				success: false,
				error: 'Invalid contest ID'
			});
		}

		const { codeforcesDataService } = await import('../services/codeforcesDataService.js');
		const Models = getModels(fileMode);
		
		// Get the timestamp to validate at (use highest snapshot if not specified)
		let validationTimestamp = timestampSeconds;
		if (validationTimestamp === null) {
			// Find highest snapshot timestamp
			const [lastBase, lastDelta] = await Promise.all([
				Models.BaseSnapshots.findOne({ contestId })
					.select('timestampSeconds')
					.sort({ timestampSeconds: -1 })
					.lean(),
				Models.DeltaSnapshots.findOne({ contestId })
					.select('timestampSeconds')
					.sort({ timestampSeconds: -1 })
					.lean()
			]);
			
			const highestBase = lastBase?.timestampSeconds || -1;
			const highestDelta = lastDelta?.timestampSeconds || -1;
			validationTimestamp = Math.max(highestBase, highestDelta);
			
			if (validationTimestamp < 0) {
				return res.status(404).json({
					success: false,
					error: `No snapshots found for contest ${contestId}`
				});
			}
		}

		logger.info(`[VALIDATE] Starting validation for contest ${contestId} at timestamp ${validationTimestamp}`);
		
		// Get incremental standings at the timestamp
		const incrementalStandings = await incrementalSimulationService.getStandingsAtTime(
			contestId,
			validationTimestamp,
			1,
			null, // Get all ranks
			false, // showUnofficial = false
			fileMode
		);

		// Get batch standings (final standings)
		const batchStandings = await codeforcesDataService.getStandingsFromDB(
			contestId,
			1,
			null, // Get all ranks
			false // showUnofficial = false
		);

		// Compare standings
		const incrementalMap = new Map();
		const batchMap = new Map();

		// Index incremental standings by handle
		for (const row of incrementalStandings.rows) {
			const handle = row.party?.members?.[0]?.handle;
			if (handle) {
				incrementalMap.set(handle, {
					rank: row.rank,
					points: row.points,
					penalty: row.penalty,
					successfulHackCount: row.successfulHackCount,
					unsuccessfulHackCount: row.unsuccessfulHackCount
				});
			}
		}

		// Index batch standings by handle
		for (const row of batchStandings.rows) {
			const handle = row.party?.members?.[0]?.handle;
			if (handle) {
				batchMap.set(handle, {
					rank: row.rank,
					points: row.points,
					penalty: row.penalty,
					successfulHackCount: row.successfulHackCount,
					unsuccessfulHackCount: row.unsuccessfulHackCount
				});
			}
		}

		// Find differences
		const missingInIncremental = [];
		const missingInBatch = [];
		const scoreMismatches = [];
		const rankMismatches = [];

		// Check participants in incremental but not in batch
		for (const [handle, incData] of incrementalMap.entries()) {
			if (!batchMap.has(handle)) {
				missingInBatch.push({ handle, ...incData });
			}
		}

		// Check participants in batch but not in incremental
		for (const [handle, batchData] of batchMap.entries()) {
			if (!incrementalMap.has(handle)) {
				missingInIncremental.push({ handle, ...batchData });
			}
		}

		// Check for score and rank mismatches
		for (const [handle, batchData] of batchMap.entries()) {
			const incData = incrementalMap.get(handle);
			if (incData) {
				if (Math.abs(incData.points - batchData.points) > 0.001) {
					scoreMismatches.push({
						handle,
						incremental: incData.points,
						batch: batchData.points,
						difference: incData.points - batchData.points
					});
				}
				if (incData.penalty !== batchData.penalty) {
					scoreMismatches.push({
						handle,
						field: 'penalty',
						incremental: incData.penalty,
						batch: batchData.penalty,
						difference: incData.penalty - batchData.penalty
					});
				}
				if (incData.rank !== batchData.rank) {
					rankMismatches.push({
						handle,
						incremental: incData.rank,
						batch: batchData.rank,
						difference: incData.rank - batchData.rank
					});
				}
			}
		}

		const totalDifferences = missingInIncremental.length + missingInBatch.length + scoreMismatches.length + rankMismatches.length;
		const isValid = totalDifferences === 0;

		logger.info(`[VALIDATE] Validation complete: ${totalDifferences} difference(s) found`);

		res.status(200).json({
			success: true,
			data: {
				contestId,
				timestampSeconds: validationTimestamp,
				isValid,
				summary: {
					totalIncremental: incrementalStandings.rows.length,
					totalBatch: batchStandings.rows.length,
					totalDifferences,
					missingInIncremental: missingInIncremental.length,
					missingInBatch: missingInBatch.length,
					scoreMismatches: scoreMismatches.length,
					rankMismatches: rankMismatches.length
				},
				differences: {
					missingInIncremental: missingInIncremental.length > 0 ? missingInIncremental.slice(0, 50) : [],
					missingInBatch: missingInBatch.length > 0 ? missingInBatch.slice(0, 50) : [],
					scoreMismatches: scoreMismatches.length > 0 ? scoreMismatches.slice(0, 50) : [],
					rankMismatches: rankMismatches.length > 0 ? rankMismatches.slice(0, 50) : []
				},
				fileMode,
				storageMode: fileMode ? 'file' : 'MongoDB'
			}
		});
	} catch (error) {
		logger.error(`API: Error validating standings for contest ${req.params.contestId}: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message
		});
	}
});

/**
 * Get Snapshot Info
 * GET /api/incremental-standings/:contestId/snapshots/info
 * 
 * Query Parameters:
 * - fileMode: boolean (optional, default: false) - Use file storage instead of MongoDB
 * 
 * Returns information about snapshots for a contest.
 */
router.get('/:contestId/snapshots/info', async (req, res) => {
	try {
		const contestId = parseInt(req.params.contestId);
		const fileMode = req.query.fileMode === 'true';
		
		if (!contestId || contestId <= 0) {
			return res.status(400).json({
				success: false,
				error: 'Invalid contest ID'
			});
		}

		const Models = getModels(fileMode);

		const [baseCount, deltaCount, baseSnapshots, deltaSnapshots] = await Promise.all([
			Models.BaseSnapshots.countDocuments({ contestId }),
			Models.DeltaSnapshots.countDocuments({ contestId }),
			Models.BaseSnapshots.find({ contestId })
				.select('timestampSeconds participantCount createdAt')
				.sort({ timestampSeconds: 1 })
				.lean()
				.then(results => Array.isArray(results) ? results.slice(0, 10) : []),
			Models.DeltaSnapshots.find({ contestId })
				.select('timestampSeconds changeCount baseSnapshotTimestamp createdAt')
				.sort({ timestampSeconds: 1 })
				.lean()
				.then(results => Array.isArray(results) ? results.slice(0, 10) : [])
		]);

		// Get first and last snapshots
		const firstBase = baseSnapshots.length > 0 ? baseSnapshots[0] : null;
		const lastBase = await Models.BaseSnapshots.findOne({ contestId })
			.select('timestampSeconds participantCount createdAt')
			.sort({ timestampSeconds: -1 })
			.lean();

		const firstDelta = deltaSnapshots.length > 0 ? deltaSnapshots[0] : null;
		const lastDelta = await Models.DeltaSnapshots.findOne({ contestId })
			.select('timestampSeconds changeCount baseSnapshotTimestamp createdAt')
			.sort({ timestampSeconds: -1 })
			.lean();

		res.status(200).json({
			success: true,
			data: {
				contestId,
				fileMode,
				storageMode: fileMode ? 'file' : 'MongoDB',
				baseSnapshots: {
					count: baseCount,
					first: firstBase,
					last: lastBase,
					sample: baseSnapshots
				},
				deltaSnapshots: {
					count: deltaCount,
					first: firstDelta,
					last: lastDelta,
					sample: deltaSnapshots
				},
				totalSnapshots: baseCount + deltaCount
			}
		});
	} catch (error) {
		logger.error(`API: Error getting snapshot info for contest ${contestId}: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message
		});
	}
});

export default router;
