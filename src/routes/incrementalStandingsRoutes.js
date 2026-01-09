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
 * Query/Body Parameters:
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
		const fileMode = req.query.fileMode === 'true' || req.body.fileMode === true;
		
		if (!contestId || contestId <= 0) {
			return res.status(400).json({
				success: false,
				error: 'Invalid contest ID'
			});
		}

		const storageMode = fileMode ? 'file' : 'MongoDB';
		logger.info(`API: Initializing standings state for contest ${contestId} (${storageMode})`);

		const startTime = Date.now();
		
		await incrementalSimulationService.initializeStandingsState(contestId, fileMode);
		
		const elapsed = Date.now() - startTime;

		// Get participant count
		const Models = getModels(fileMode);
		const participantCount = await Models.StandingsState.countDocuments({ contestId });

		logger.info(`API: Initialized standings state for contest ${contestId} - ${participantCount} participants in ${elapsed}ms (${storageMode})`);

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
 * Body/Query Parameters:
 * - timestampSeconds: number (required) - Timestamp relative to contest start (seconds)
 * - fileMode: boolean (optional, default: false) - Use file storage instead of MongoDB
 * 
 * Creates a base snapshot (full state for all participants) at the specified timestamp.
 */
router.post('/:contestId/snapshots/base', async (req, res) => {
	try {
		const contestId = parseInt(req.params.contestId);
		const { timestampSeconds } = req.body;
		const fileMode = req.query.fileMode === 'true' || req.body.fileMode === true;
		
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
		logger.info(`API: Creating base snapshot for contest ${contestId} at timestamp ${timestampSeconds} (${storageMode})`);

		const startTime = Date.now();
		
		const snapshot = await snapshotService.createBaseSnapshot(contestId, timestampSeconds, fileMode);
		
		const elapsed = Date.now() - startTime;

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
 * Body/Query Parameters:
 * - timestampSeconds: number (required) - Timestamp relative to contest start (seconds)
 * - fileMode: boolean (optional, default: false) - Use file storage instead of MongoDB
 * 
 * Creates a delta snapshot (changes only) at the specified timestamp.
 */
router.post('/:contestId/snapshots/delta', async (req, res) => {
	try {
		const contestId = parseInt(req.params.contestId);
		const { timestampSeconds } = req.body;
		const fileMode = req.query.fileMode === 'true' || req.body.fileMode === true;
		
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
		logger.info(`API: Creating delta snapshot for contest ${contestId} at timestamp ${timestampSeconds} (${storageMode})`);

		const startTime = Date.now();
		
		const snapshot = await snapshotService.createDeltaSnapshot(contestId, timestampSeconds, fileMode);
		
		const elapsed = Date.now() - startTime;

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
 * Body/Query Parameters:
 * - timestampSeconds: number (required) - Timestamp relative to contest start (seconds)
 * - fileMode: boolean (optional, default: false) - Use file storage instead of MongoDB
 * 
 * Automatically creates a base snapshot (every 120 seconds) or delta snapshot (every 10 seconds).
 * Uses recommended intervals: 120s for base, 10s for delta.
 */
router.post('/:contestId/snapshots', async (req, res) => {
	try {
		const contestId = parseInt(req.params.contestId);
		const { timestampSeconds } = req.body;
		const fileMode = req.query.fileMode === 'true' || req.body.fileMode === true;
		
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
		logger.info(`API: Creating ${snapshotType} snapshot for contest ${contestId} at timestamp ${timestampSeconds} (${storageMode})`);

		const startTime = Date.now();
		
		const snapshot = await snapshotService.createSnapshot(contestId, timestampSeconds, fileMode);
		
		const elapsed = Date.now() - startTime;

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
		logger.info(`API: Getting standings for contest ${contestId} at timestamp ${timestampSeconds} (rank ${rankFrom} to ${rankTo || 'end'}, unofficial=${showUnofficial}, ${storageMode})`);

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
