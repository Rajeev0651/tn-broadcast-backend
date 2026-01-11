import { models } from '../data/models/index.js';
import { getModels } from './modelProvider.js';
import { logger } from '../helpers/logger.js';
import { stateToPlainObject, plainObjectToState, processSubmission } from './standingsStateUpdate.js';
import { codeforcesDataService } from './codeforcesDataService.js';

/**
 * Snapshot Service
 * Handles creation and management of base and delta snapshots
 * for efficient time-based standings replay
 */
class SnapshotService {
	/**
	 * Create a base snapshot (full state for all participants at specific timestamp)
	 * Computes state by processing submissions up to timestampSeconds
	 * @param {number} contestId - Contest ID
	 * @param {number} timestampSeconds - Timestamp relative to contest start (seconds)
	 * @param {boolean} fileMode - Use file storage instead of MongoDB (default: false)
	 * @returns {Promise<Object>} Created snapshot document
	 */
	async createBaseSnapshot(contestId, timestampSeconds, fileMode = false) {
		try {
			const operationStartTime = Date.now();
			const storageMode = fileMode ? 'file' : 'MongoDB';
			logger.info(`[BASE SNAPSHOT] ========================================`);
			logger.info(`[BASE SNAPSHOT] Creating base snapshot for contest ${contestId} at timestamp ${timestampSeconds} (${storageMode})`);
			logger.info(`[BASE SNAPSHOT] ========================================`);
			
			const Models = getModels(fileMode);
			const { codeforcesDataService } = await import('./codeforcesDataService.js');
			const { processSubmission } = await import('./standingsStateUpdate.js');
			
			// Step 1: Get problems to build problem points map
			logger.info(`[BASE SNAPSHOT] Step 1: Fetching problems for contest ${contestId} to get problem points`);
			const problems = await codeforcesDataService.getProblemsFromDB(contestId);
			const problemPointsMap = new Map();
			for (const problem of problems) {
				// Store points (can be null if not set in database)
				problemPointsMap.set(problem.index, problem.points !== null && problem.points !== undefined ? problem.points : null);
				if (problem.points === null || problem.points === undefined) {
					logger.warn(`[BASE SNAPSHOT] Problem ${problem.index} has no points in Problems collection`);
				}
			}
			logger.info(`[BASE SNAPSHOT] Loaded ${problemPointsMap.size} problems with points mapping`);
			
			// Step 2: Get all submissions up to timestampSeconds
			logger.info(`[BASE SNAPSHOT] Step 2: Fetching all submissions up to timestamp ${timestampSeconds} for contest ${contestId}`);
			const fetchSubmissionsStartTime = Date.now();
			const allSubmissions = await codeforcesDataService.getSubmissionsFromDB(contestId, null, null);
			
			// Filter submissions up to timestampSeconds
			const submissionsUpToTimestamp = allSubmissions.filter(sub => {
				const relativeTime = sub.relativeTimeSeconds || 0;
				return relativeTime <= timestampSeconds;
			});
			const fetchSubmissionsDuration = Date.now() - fetchSubmissionsStartTime;
			logger.info(`[BASE SNAPSHOT] Filtered to ${submissionsUpToTimestamp.length} submissions up to t=${timestampSeconds} (out of ${allSubmissions.length} total, took ${fetchSubmissionsDuration}ms)`);
			
			// Step 3: Build state by processing submissions up to timestamp
			logger.info(`[BASE SNAPSHOT] Step 3: Building participant state by processing submissions up to timestamp ${timestampSeconds}`);
			const buildStateStartTime = Date.now();
			const stateMap = new Map(); // handle -> state
			
			// Sort submissions by time to process in chronological order
			submissionsUpToTimestamp.sort((a, b) => (a.relativeTimeSeconds || 0) - (b.relativeTimeSeconds || 0));
			
			for (const submission of submissionsUpToTimestamp) {
				const handle = submission.author?.members?.[0]?.handle;
				if (!handle) continue;
				
				// Get or create state for this participant
				if (!stateMap.has(handle)) {
					stateMap.set(handle, {
						contestId,
						handle,
						participantType: submission.author?.participantType || 'CONTESTANT',
						ghost: submission.author?.ghost || false,
						isUnofficial: submission.author?.participantType !== 'CONTESTANT',
						problems: new Map(),
						totalPoints: 0,
						totalPenalty: 0,
						solvedCount: 0,
						lastAcTime: null,
						hackSuccess: 0,
						hackFail: 0,
						lastSubmissionTime: null
					});
				}
				
				const state = stateMap.get(handle);
				const problemIndex = submission.problem?.index || '';
				// Get problem points from Problems collection, fallback to submission data, then 1
				let problemPoints = problemPointsMap.get(problemIndex);
				if (problemPoints === null || problemPoints === undefined) {
					// Problem points not in Problems collection, try submission data
					problemPoints = submission.problem?.points;
					if (problemPoints === null || problemPoints === undefined) {
						problemPoints = 1; // Default to 1 point if not available
						if (submission.verdict === 'OK') {
							logger.warn(`[BASE SNAPSHOT] Problem ${problemIndex} has no points in Problems collection or submission data, using default: 1`);
						}
					}
				}
				
				processSubmission(state, {
					problemIndex: problemIndex,
					verdict: submission.verdict,
					relativeTimeSeconds: submission.relativeTimeSeconds || 0,
					points: problemPoints
				});
			}
			const buildStateDuration = Date.now() - buildStateStartTime;
			logger.info(`[BASE SNAPSHOT] Built state for ${stateMap.size} participants (took ${buildStateDuration}ms)`);
			
			// Step 4: Convert to snapshot format
			logger.info(`[BASE SNAPSHOT] Step 4: Converting ${stateMap.size} participants to snapshot format`);
			const convertStartTime = Date.now();
			const participants = Array.from(stateMap.values()).map(state => {
				const participant = {
					handle: state.handle,
					participantType: state.participantType || 'CONTESTANT',
					ghost: state.ghost || false,
					isUnofficial: state.isUnofficial || false,
					totalPoints: state.totalPoints || 0,
					totalPenalty: state.totalPenalty || 0,
					solvedCount: state.solvedCount || 0,
					lastAcTime: state.lastAcTime || null,
					hackSuccess: state.hackSuccess || 0,
					hackFail: state.hackFail || 0,
					lastSubmissionTime: state.lastSubmissionTime || null,
					problems: {}
				};
				
				// Convert problems Map to object for storage
				if (state.problems instanceof Map) {
					const problemsObj = {};
					for (const [key, value] of state.problems.entries()) {
						problemsObj[key] = value;
					}
					participant.problems = problemsObj;
				} else if (state.problems) {
					participant.problems = state.problems;
				}
				
				return participant;
			});
			const convertDuration = Date.now() - convertStartTime;
			logger.info(`[BASE SNAPSHOT] Converted ${participants.length} participants to snapshot format (took ${convertDuration}ms)`);
			
			// Step 5: Create snapshot document
			logger.info(`[BASE SNAPSHOT] Step 5: Saving base snapshot to ${storageMode}`);
			const saveStartTime = Date.now();
			const snapshot = await Models.BaseSnapshots.create({
				contestId,
				timestampSeconds,
				snapshotType: 'BASE',
				participants,
				participantCount: participants.length,
				createdAt: new Date()
			});
			const saveDuration = Date.now() - saveStartTime;
			
			const operationDuration = Date.now() - operationStartTime;
			logger.info(`[BASE SNAPSHOT] ========================================`);
			logger.info(`[BASE SNAPSHOT] ✓ Completed base snapshot creation for contest ${contestId}`);
			logger.info(`[BASE SNAPSHOT]   - Timestamp: ${timestampSeconds}`);
			logger.info(`[BASE SNAPSHOT]   - Participants: ${participants.length}`);
			logger.info(`[BASE SNAPSHOT]   - Submissions processed: ${submissionsUpToTimestamp.length}`);
			logger.info(`[BASE SNAPSHOT]   - Fetch submissions: ${fetchSubmissionsDuration}ms`);
			logger.info(`[BASE SNAPSHOT]   - Build state: ${buildStateDuration}ms`);
			logger.info(`[BASE SNAPSHOT]   - Convert: ${convertDuration}ms`);
			logger.info(`[BASE SNAPSHOT]   - Save: ${saveDuration}ms`);
			logger.info(`[BASE SNAPSHOT]   - Total time: ${operationDuration}ms`);
			logger.info(`[BASE SNAPSHOT] ========================================`);
			
			return snapshot;
		} catch (error) {
			logger.error(`[BASE SNAPSHOT] Error creating base snapshot for contest ${contestId} at timestamp ${timestampSeconds}: ${error.message}`);
			throw error;
		}
	}
	
	/**
	 * Find the last snapshot (base or delta) before or at given timestamp
	 * @param {number} contestId - Contest ID
	 * @param {number} timestampSeconds - Timestamp relative to contest start
	 * @param {boolean} fileMode - Use file storage instead of MongoDB (default: false)
	 * @returns {Promise<Object|null>} Last snapshot or null
	 */
	async findLastSnapshot(contestId, timestampSeconds, fileMode = false) {
		try {
			const Models = getModels(fileMode);
			
			// First try to find base snapshot
			const baseSnapshot = await Models.BaseSnapshots.findOne({
				contestId,
				timestampSeconds: { $lte: timestampSeconds }
			})
			.sort({ timestampSeconds: -1 })
			.lean();
			
			if (baseSnapshot) {
				return {
					timestampSeconds: baseSnapshot.timestampSeconds,
					baseTimestamp: baseSnapshot.timestampSeconds,
					type: 'BASE'
				};
			}
			
			// Fallback to delta snapshot
			const deltaSnapshot = await Models.DeltaSnapshots.findOne({
				contestId,
				timestampSeconds: { $lte: timestampSeconds }
			})
			.sort({ timestampSeconds: -1 })
			.lean();
			
			if (deltaSnapshot) {
				return {
					timestampSeconds: deltaSnapshot.timestampSeconds,
					baseTimestamp: deltaSnapshot.baseSnapshotTimestamp,
					type: 'DELTA'
				};
			}
			
			return null;
		} catch (error) {
			logger.error(`Error finding last snapshot for contest ${contestId} at timestamp ${timestampSeconds}: ${error.message}`);
			throw error;
		}
	}
	
	/**
	 * Find changed participants since last snapshot
	 * For delta snapshots, we need to compute state at toTimestamp by processing submissions
	 * between fromTimestamp and toTimestamp, then compare against last snapshot state
	 * @param {number} contestId - Contest ID
	 * @param {number} fromTimestamp - Start timestamp (relative to contest start)
	 * @param {number} toTimestamp - End timestamp (relative to contest start)
	 * @param {boolean} fileMode - Use file storage instead of MongoDB (default: false)
	 * @returns {Promise<Array>} Array of changed participants with their changes
	 */
	async findChangedParticipants(contestId, fromTimestamp, toTimestamp, fileMode = false) {
		try {
			logger.info(`[FIND CHANGES] Finding changed participants for contest ${contestId} between timestamps ${fromTimestamp} and ${toTimestamp}`);
			const findStartTime = Date.now();
			
			const Models = getModels(fileMode);
			
			// Step 1: Get the last snapshot state
			logger.info(`[FIND CHANGES] Step 1: Loading last snapshot state at timestamp ${fromTimestamp}`);
			const loadSnapshotStartTime = Date.now();
			const lastSnapshot = await this.findLastSnapshot(contestId, fromTimestamp, fileMode);
			const lastSnapshotStateMap = new Map();
			
			if (lastSnapshot) {
				// Get base snapshot using baseTimestamp
				const baseTimestamp = lastSnapshot.baseTimestamp || lastSnapshot.timestampSeconds;
				logger.info(`[FIND CHANGES] Loading base snapshot at timestamp ${baseTimestamp}`);
				
				const baseSnapshot = await Models.BaseSnapshots.findOne({
					contestId,
					timestampSeconds: baseTimestamp
				}).lean();
				
				if (baseSnapshot && baseSnapshot.participants) {
					for (const p of baseSnapshot.participants) {
						lastSnapshotStateMap.set(p.handle, {
							participantType: p.participantType || 'CONTESTANT',
							ghost: p.ghost || false,
							isUnofficial: p.isUnofficial || false,
							totalPoints: p.totalPoints || 0,
							totalPenalty: p.totalPenalty || 0,
							solvedCount: p.solvedCount || 0,
							lastAcTime: p.lastAcTime || null,
							hackSuccess: p.hackSuccess || 0,
							hackFail: p.hackFail || 0,
							lastSubmissionTime: p.lastSubmissionTime || null,
							problems: p.problems || {}
						});
					}
					logger.info(`[FIND CHANGES] Loaded ${baseSnapshot.participants.length} participants from base snapshot at t=${baseTimestamp}`);
				} else {
					logger.warn(`[FIND CHANGES] Base snapshot at timestamp ${baseTimestamp} not found`);
				}
				
				// Apply deltas between baseTimestamp and fromTimestamp
				const deltasUpToFrom = await Models.DeltaSnapshots.find({
					contestId,
					timestampSeconds: {
						$gt: baseTimestamp,
						$lte: fromTimestamp
					}
				}).sort({ timestampSeconds: 1 }).lean();
				
				if (deltasUpToFrom.length > 0) {
					logger.info(`[FIND CHANGES] Applying ${deltasUpToFrom.length} delta snapshot(s) between t=${baseTimestamp} and t=${fromTimestamp}`);
					for (const delta of deltasUpToFrom) {
						if (delta.changes) {
							for (const change of delta.changes) {
								if (change.op === 'INSERT' || change.op === 'UPDATE') {
									lastSnapshotStateMap.set(change.handle, change.state);
								}
							}
						}
					}
					logger.info(`[FIND CHANGES] State map now has ${lastSnapshotStateMap.size} participants after applying deltas`);
				}
			}
			const loadSnapshotDuration = Date.now() - loadSnapshotStartTime;
			logger.info(`[FIND CHANGES] Loaded ${lastSnapshotStateMap.size} participants from last snapshot (took ${loadSnapshotDuration}ms)`);
			
			// Step 2: Get problems to build problem points map
			logger.info(`[FIND CHANGES] Step 2: Fetching problems for contest ${contestId} to get problem points`);
			const problems = await codeforcesDataService.getProblemsFromDB(contestId);
			const problemPointsMap = new Map();
			for (const problem of problems) {
				// Store points (can be null if not set in database)
				problemPointsMap.set(problem.index, problem.points !== null && problem.points !== undefined ? problem.points : null);
			}
			logger.info(`[FIND CHANGES] Loaded ${problemPointsMap.size} problems with points mapping`);
			
			// Step 3: Get submissions between fromTimestamp and toTimestamp
			logger.info(`[FIND CHANGES] Step 3: Fetching submissions between timestamps ${fromTimestamp} and ${toTimestamp}`);
			const fetchSubmissionsStartTime = Date.now();
			const allSubmissions = await codeforcesDataService.getSubmissionsFromDB(contestId, null, null);
			
			// Filter submissions in the time window
			const submissionsInWindow = allSubmissions.filter(sub => {
				const relativeTime = sub.relativeTimeSeconds || 0;
				return relativeTime > fromTimestamp && relativeTime <= toTimestamp;
			});
			const fetchSubmissionsDuration = Date.now() - fetchSubmissionsStartTime;
			logger.info(`[FIND CHANGES] Found ${submissionsInWindow.length} submissions in time window (out of ${allSubmissions.length} total, took ${fetchSubmissionsDuration}ms)`);
			
			if (submissionsInWindow.length === 0) {
				logger.info(`[FIND CHANGES] No submissions in time window, no participants changed`);
				return [];
			}
			
			// Step 4: Build state at toTimestamp for participants with submissions in window
			logger.info(`[FIND CHANGES] Step 4: Computing state at timestamp ${toTimestamp} for participants with submissions in window`);
			const computeStateStartTime = Date.now();
			const currentStateMap = new Map();
			
			// Start from last snapshot state
			for (const [handle, state] of lastSnapshotStateMap.entries()) {
				// Convert problems to Map for processing
				const problemsMap = new Map();
				if (state.problems && typeof state.problems === 'object' && !(state.problems instanceof Map)) {
					for (const [key, value] of Object.entries(state.problems)) {
						problemsMap.set(key, value);
					}
				}
				
				currentStateMap.set(handle, {
					...state,
					problems: problemsMap
				});
			}
			
			// Process submissions in the time window to update state
			// Sort submissions by time to process in order
			submissionsInWindow.sort((a, b) => (a.relativeTimeSeconds || 0) - (b.relativeTimeSeconds || 0));
			
			for (const submission of submissionsInWindow) {
				const handle = submission.author?.members?.[0]?.handle;
				if (!handle) continue;
				
				// Get or create state for this participant (start from last snapshot state if exists)
				if (!currentStateMap.has(handle)) {
					const lastState = lastSnapshotStateMap.get(handle);
					if (lastState) {
						// Start from last snapshot state
						const problemsMap = new Map();
						if (lastState.problems && typeof lastState.problems === 'object' && !(lastState.problems instanceof Map)) {
							for (const [key, value] of Object.entries(lastState.problems)) {
								problemsMap.set(key, value);
							}
						}
						currentStateMap.set(handle, {
							...lastState,
							problems: problemsMap
						});
					} else {
						// New participant not in last snapshot
						currentStateMap.set(handle, {
							participantType: submission.author?.participantType || 'CONTESTANT',
							ghost: submission.author?.ghost || false,
							isUnofficial: submission.author?.participantType !== 'CONTESTANT',
							totalPoints: 0,
							totalPenalty: 0,
							solvedCount: 0,
							lastAcTime: null,
							hackSuccess: 0,
							hackFail: 0,
							lastSubmissionTime: null,
							problems: new Map()
						});
					}
				}
				
				const state = currentStateMap.get(handle);
				const problemIndex = submission.problem?.index || '';
				// Get problem points from Problems collection, fallback to submission data, then 1
				let problemPoints = problemPointsMap.get(problemIndex);
				if (problemPoints === null || problemPoints === undefined) {
					// Problem points not in Problems collection, try submission data
					problemPoints = submission.problem?.points;
					if (problemPoints === null || problemPoints === undefined) {
						problemPoints = 1; // Default to 1 point if not available
					}
				}
				
				processSubmission(state, {
					problemIndex: problemIndex,
					verdict: submission.verdict,
					relativeTimeSeconds: submission.relativeTimeSeconds || 0,
					points: problemPoints
				});
			}
			const computeStateDuration = Date.now() - computeStateStartTime;
			logger.info(`[FIND CHANGES] Computed state for ${currentStateMap.size} participants (took ${computeStateDuration}ms)`);
			
			// Step 5: Compare states and find changes
			logger.info(`[FIND CHANGES] Step 5: Comparing states to find changes`);
			const compareStartTime = Date.now();
			const changes = [];
			
			for (const [handle, currentState] of currentStateMap.entries()) {
				const lastState = lastSnapshotStateMap.get(handle);
				
				// Convert problems to objects for comparison
				const currentProblemsObj = currentState.problems instanceof Map 
					? Object.fromEntries(currentState.problems.entries())
					: currentState.problems || {};
				const lastProblemsObj = lastState?.problems 
					? (lastState.problems instanceof Map 
						? Object.fromEntries(lastState.problems.entries())
						: lastState.problems)
					: {};
				
				// Check if state changed
				const stateChanged = !lastState ||
					currentState.totalPoints !== (lastState.totalPoints || 0) ||
					currentState.totalPenalty !== (lastState.totalPenalty || 0) ||
					currentState.solvedCount !== (lastState.solvedCount || 0) ||
					currentState.hackSuccess !== (lastState.hackSuccess || 0) ||
					currentState.hackFail !== (lastState.hackFail || 0) ||
					JSON.stringify(currentProblemsObj) !== JSON.stringify(lastProblemsObj);
				
				if (stateChanged) {
					const state = {
						participantType: currentState.participantType || 'CONTESTANT',
						ghost: currentState.ghost || false,
						isUnofficial: currentState.isUnofficial || false,
						totalPoints: currentState.totalPoints || 0,
						totalPenalty: currentState.totalPenalty || 0,
						solvedCount: currentState.solvedCount || 0,
						lastAcTime: currentState.lastAcTime || null,
						hackSuccess: currentState.hackSuccess || 0,
						hackFail: currentState.hackFail || 0,
						lastSubmissionTime: currentState.lastSubmissionTime || null,
						problems: currentProblemsObj
					};
					
					changes.push({
						handle,
						op: lastState ? 'UPDATE' : 'INSERT',
						state
					});
				}
			}
			const compareDuration = Date.now() - compareStartTime;
			
			const findDuration = Date.now() - findStartTime;
			const insertCount = changes.filter(c => c.op === 'INSERT').length;
			const updateCount = changes.filter(c => c.op === 'UPDATE').length;
			logger.info(`[FIND CHANGES] ✓ Found ${changes.length} changed participants (${insertCount} new, ${updateCount} updated) - Total time: ${findDuration}ms`);
			logger.info(`[FIND CHANGES]   - Load snapshot: ${loadSnapshotDuration}ms`);
			logger.info(`[FIND CHANGES]   - Fetch submissions: ${fetchSubmissionsDuration}ms`);
			logger.info(`[FIND CHANGES]   - Compute state: ${computeStateDuration}ms`);
			logger.info(`[FIND CHANGES]   - Compare: ${compareDuration}ms`);
			
			return changes;
		} catch (error) {
			logger.error(`[FIND CHANGES] Error finding changed participants for contest ${contestId}: ${error.message}`);
			throw error;
		}
	}
	
	/**
	 * Create a delta snapshot (changes only)
	 * @param {number} contestId - Contest ID
	 * @param {number} timestampSeconds - Timestamp relative to contest start (seconds)
	 * @param {boolean} fileMode - Use file storage instead of MongoDB (default: false)
	 * @returns {Promise<Object>} Created snapshot document
	 */
	async createDeltaSnapshot(contestId, timestampSeconds, fileMode = false) {
		try {
			const operationStartTime = Date.now();
			const storageMode = fileMode ? 'file' : 'MongoDB';
			logger.info(`[DELTA SNAPSHOT] ========================================`);
			logger.info(`[DELTA SNAPSHOT] Creating delta snapshot for contest ${contestId} at timestamp ${timestampSeconds} (${storageMode})`);
			logger.info(`[DELTA SNAPSHOT] ========================================`);
			
			const Models = getModels(fileMode);
			
			// Find last snapshot (base or delta)
			logger.info(`[DELTA SNAPSHOT] Step 1: Finding last snapshot for contest ${contestId} at or before timestamp ${timestampSeconds}`);
			const findLastStartTime = Date.now();
			const lastSnapshot = await this.findLastSnapshot(contestId, timestampSeconds, fileMode);
			const findLastDuration = Date.now() - findLastStartTime;
			
			if (!lastSnapshot) {
				// No previous snapshot - create base snapshot instead
				logger.warn(`[DELTA SNAPSHOT] No previous snapshot found for contest ${contestId}, creating base snapshot instead`);
				return await this.createBaseSnapshot(contestId, timestampSeconds, fileMode);
			}
			
			logger.info(`[DELTA SNAPSHOT] Found last snapshot at timestamp ${lastSnapshot.timestampSeconds} (type: ${lastSnapshot.type}, base: ${lastSnapshot.baseTimestamp || 'N/A'}) (took ${findLastDuration}ms)`);
			
			// Find changed participants since last snapshot
			logger.info(`[DELTA SNAPSHOT] Step 2: Finding changed participants between timestamp ${lastSnapshot.timestampSeconds} and ${timestampSeconds}`);
			const findChangesStartTime = Date.now();
			const changedParticipants = await this.findChangedParticipants(
				contestId,
				lastSnapshot.timestampSeconds,
				timestampSeconds,
				fileMode
			);
			const findChangesDuration = Date.now() - findChangesStartTime;
			
			if (changedParticipants.length === 0) {
				// No changes - create empty delta snapshot
				logger.info(`[DELTA SNAPSHOT] No changes found for contest ${contestId} between timestamps ${lastSnapshot.timestampSeconds} and ${timestampSeconds} (took ${findChangesDuration}ms)`);
			} else {
				logger.info(`[DELTA SNAPSHOT] Found ${changedParticipants.length} changed participants (took ${findChangesDuration}ms)`);
			}
			
			// Create delta snapshot
			logger.info(`[DELTA SNAPSHOT] Step 3: Saving delta snapshot to ${storageMode}`);
			const saveStartTime = Date.now();
			const snapshot = await Models.DeltaSnapshots.create({
				contestId,
				timestampSeconds,
				snapshotType: 'DELTA',
				baseSnapshotTimestamp: lastSnapshot.baseTimestamp || lastSnapshot.timestampSeconds,
				changes: changedParticipants,
				changeCount: changedParticipants.length,
				createdAt: new Date()
			});
			const saveDuration = Date.now() - saveStartTime;
			
			const operationDuration = Date.now() - operationStartTime;
			logger.info(`[DELTA SNAPSHOT] ========================================`);
			logger.info(`[DELTA SNAPSHOT] ✓ Completed delta snapshot creation for contest ${contestId}`);
			logger.info(`[DELTA SNAPSHOT]   - Timestamp: ${timestampSeconds}`);
			logger.info(`[DELTA SNAPSHOT]   - Base timestamp: ${lastSnapshot.baseTimestamp || lastSnapshot.timestampSeconds}`);
			logger.info(`[DELTA SNAPSHOT]   - Changes: ${changedParticipants.length}`);
			logger.info(`[DELTA SNAPSHOT]   - Find last snapshot time: ${findLastDuration}ms`);
			logger.info(`[DELTA SNAPSHOT]   - Find changes time: ${findChangesDuration}ms`);
			logger.info(`[DELTA SNAPSHOT]   - Save time: ${saveDuration}ms`);
			logger.info(`[DELTA SNAPSHOT]   - Total time: ${operationDuration}ms`);
			logger.info(`[DELTA SNAPSHOT] ========================================`);
			
			return snapshot;
		} catch (error) {
			logger.error(`[DELTA SNAPSHOT] Error creating delta snapshot for contest ${contestId} at timestamp ${timestampSeconds}: ${error.message}`);
			throw error;
		}
	}
	
	/**
	 * Create snapshot (base or delta) based on schedule
	 * Base snapshots: every 60 seconds (t = 0, 60, 120, ...)
	 * Delta snapshots: every 5 seconds (t = 5, 10, 15, ..., 55, 65, 70, ...)
	 * @param {number} contestId - Contest ID
	 * @param {number} timestampSeconds - Timestamp relative to contest start (seconds)
	 * @param {boolean} fileMode - Use file storage instead of MongoDB (default: false)
	 * @returns {Promise<Object>} Created snapshot document
	 */
	/**
	 * Create snapshot (auto-detect base or delta based on timestamp)
	 * This method is called by the route handler which already validates intervals
	 * Route uses: BASE every 120s, DELTA every 10s (but not at base intervals)
	 * @param {number} contestId - Contest ID
	 * @param {number} timestampSeconds - Timestamp relative to contest start (seconds)
	 * @param {boolean} fileMode - Use file storage instead of MongoDB (default: false)
	 * @returns {Promise<Object>} Created snapshot document
	 */
	async createSnapshot(contestId, timestampSeconds, fileMode = false) {
		const BASE_INTERVAL = 120;  // Base snapshots every 120 seconds (matches route)
		const DELTA_INTERVAL = 10;  // Delta snapshots every 10 seconds (matches route)
		
		// Check if this should be a base snapshot
		const isBaseSnapshot = timestampSeconds % BASE_INTERVAL === 0;
		
		// Check if this should be a delta snapshot (but not at base interval)
		const isDeltaSnapshot = !isBaseSnapshot && (timestampSeconds % DELTA_INTERVAL === 0);
		
		if (isBaseSnapshot) {
			return await this.createBaseSnapshot(contestId, timestampSeconds, fileMode);
		} else if (isDeltaSnapshot) {
			return await this.createDeltaSnapshot(contestId, timestampSeconds, fileMode);
		} else {
			// This shouldn't happen if route validation is working, but handle gracefully
			logger.warn(`[CREATE SNAPSHOT] Timestamp ${timestampSeconds} is not at a snapshot interval. Creating delta snapshot anyway.`);
			return await this.createDeltaSnapshot(contestId, timestampSeconds, fileMode);
		}
	}
	
	/**
	 * Get base snapshot at or before given timestamp
	 * @param {number} contestId - Contest ID
	 * @param {number} timestampSeconds - Timestamp relative to contest start
	 * @param {boolean} fileMode - Use file storage instead of MongoDB (default: false)
	 * @returns {Promise<Object|null>} Base snapshot or null
	 */
	async getBaseSnapshotAt(contestId, timestampSeconds, fileMode = false) {
		try {
			const Models = getModels(fileMode);
			
			const snapshot = await Models.BaseSnapshots.findOne({
				contestId,
				timestampSeconds: { $lte: timestampSeconds }
			})
			.sort({ timestampSeconds: -1 })
			.lean();
			
			return snapshot;
		} catch (error) {
			logger.error(`Error getting base snapshot for contest ${contestId} at timestamp ${timestampSeconds}: ${error.message}`);
			throw error;
		}
	}
	
	/**
	 * Get delta snapshots between two timestamps
	 * @param {number} contestId - Contest ID
	 * @param {number} fromTimestamp - Start timestamp (exclusive)
	 * @param {number} toTimestamp - End timestamp (inclusive)
	 * @param {boolean} fileMode - Use file storage instead of MongoDB (default: false)
	 * @returns {Promise<Array>} Array of delta snapshots
	 */
	async getDeltaSnapshotsBetween(contestId, fromTimestamp, toTimestamp, fileMode = false) {
		try {
			const Models = getModels(fileMode);
			
			const snapshots = await Models.DeltaSnapshots.find({
				contestId,
				timestampSeconds: {
					$gt: fromTimestamp,
					$lte: toTimestamp
				}
			})
			.sort({ timestampSeconds: 1 })
			.lean();
			
			return snapshots;
		} catch (error) {
			logger.error(`Error getting delta snapshots for contest ${contestId} between ${fromTimestamp} and ${toTimestamp}: ${error.message}`);
			throw error;
		}
	}
}

// Export singleton instance
export const snapshotService = new SnapshotService();
