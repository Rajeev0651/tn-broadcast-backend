import { models } from '../data/models/index.js';
import { getModels } from './modelProvider.js';
import { snapshotService } from './snapshotService.js';
import { compareParticipants, plainObjectToState, processSubmission } from './standingsStateUpdate.js';
import { codeforcesDataService } from './codeforcesDataService.js';
import { fileStorageService } from './fileStorageService.js';
import { logger } from '../helpers/logger.js';

/**
 * Incremental Simulation Service
 * Provides efficient time-based standings queries using snapshot replay
 * Implements the query resolution flow from STEP 6
 */
class IncrementalSimulationService {
	/**
	 * Get standings at a specific timestamp using snapshot replay
	 * @param {number} contestId - Contest ID
	 * @param {number} timestampSeconds - Timestamp relative to contest start (seconds)
	 * @param {number} rankFrom - Starting rank (1-indexed)
	 * @param {number} rankTo - Ending rank (1-indexed, inclusive)
	 * @param {boolean} showUnofficial - Include unofficial participants
	 * @param {boolean} fileMode - Use file storage instead of MongoDB (default: false)
	 * @returns {Promise<Object>} Standings data at specified timestamp
	 */
	async getStandingsAtTime(contestId, timestampSeconds, rankFrom = 1, rankTo = null, showUnofficial = false, fileMode = false) {
		try {
			const operationStartTime = Date.now();
			logger.info(`[GET STANDINGS] Starting query for contest ${contestId} at timestamp ${timestampSeconds} (rank ${rankFrom}-${rankTo || 'end'}, unofficial=${showUnofficial})`);
			
			// Step 1: Find nearest base snapshot ≤ T
			logger.info(`[GET STANDINGS] Step 1: Finding base snapshot for contest ${contestId} at or before timestamp ${timestampSeconds}`);
			const baseSnapshotStartTime = Date.now();
			const baseSnapshot = await snapshotService.getBaseSnapshotAt(contestId, timestampSeconds, fileMode);
			const baseSnapshotDuration = Date.now() - baseSnapshotStartTime;
			
			if (!baseSnapshot) {
				// No snapshot yet - return empty or compute from scratch
				logger.warn(`[GET STANDINGS] No base snapshot found for contest ${contestId} at timestamp ${timestampSeconds}`);
				return {
					contest: await codeforcesDataService.getContestFromDB(contestId),
					problems: await codeforcesDataService.getProblemsFromDB(contestId),
					rows: []
				};
			}
			
			logger.info(`[GET STANDINGS] Found base snapshot at timestamp ${baseSnapshot.timestampSeconds} with ${baseSnapshot.participants?.length || 0} participants (query took ${baseSnapshotDuration}ms)`);
			
			// Step 2: Load base state into map
			logger.info(`[GET STANDINGS] Step 2: Loading base state into map (${baseSnapshot.participants?.length || 0} participants)`);
			const loadStartTime = Date.now();
			let participantMap = new Map();
			for (const p of baseSnapshot.participants) {
				participantMap.set(p.handle, { ...p });
			}
			const loadDuration = Date.now() - loadStartTime;
			logger.info(`[GET STANDINGS] Loaded ${participantMap.size} participants into map (took ${loadDuration}ms)`);
			
			// Step 3: Apply delta snapshots from baseTimestamp to T
			logger.info(`[GET STANDINGS] Step 3: Finding delta snapshots between ${baseSnapshot.timestampSeconds} and ${timestampSeconds}`);
			const deltaSearchStartTime = Date.now();
			const deltas = await snapshotService.getDeltaSnapshotsBetween(
				contestId,
				baseSnapshot.timestampSeconds,
				timestampSeconds,
				fileMode
			);
			const deltaSearchDuration = Date.now() - deltaSearchStartTime;
			logger.info(`[GET STANDINGS] Found ${deltas.length} delta snapshot(s) to apply (query took ${deltaSearchDuration}ms)`);
			
			if (deltas.length > 0) {
				logger.info(`[GET STANDINGS] Step 4: Applying ${deltas.length} delta snapshot(s)`);
				const applyStartTime = Date.now();
				let totalChanges = 0;
				for (let i = 0; i < deltas.length; i++) {
					const delta = deltas[i];
					const changeCount = delta.changes?.length || 0;
					totalChanges += changeCount;
					logger.info(`[GET STANDINGS] Applying delta ${i + 1}/${deltas.length} (timestamp: ${delta.timestampSeconds}, changes: ${changeCount})`);
					
					for (const change of delta.changes) {
						if (change.op === 'INSERT') {
							// New participant
							participantMap.set(change.handle, change.state);
						} else if (change.op === 'UPDATE') {
							// Update existing participant
							const existing = participantMap.get(change.handle);
							if (existing) {
								// Merge state changes
								Object.assign(existing, change.state);
							} else {
								// Participant not in base snapshot, treat as insert
								participantMap.set(change.handle, change.state);
							}
						}
					}
				}
				const applyDuration = Date.now() - applyStartTime;
				logger.info(`[GET STANDINGS] Applied ${totalChanges} changes from ${deltas.length} delta snapshot(s) (took ${applyDuration}ms)`);
			} else {
				logger.info(`[GET STANDINGS] No delta snapshots to apply`);
			}
			
			// Step 4: Convert to array and compute ranks
			logger.info(`[GET STANDINGS] Step 5: Computing ranks (${participantMap.size} participants)`);
			const rankStartTime = Date.now();
			let participants = Array.from(participantMap.values());
			
			// Filter unofficial if needed
			const beforeFilter = participants.length;
			if (!showUnofficial) {
				participants = participants.filter(p => !p.isUnofficial);
			}
			const afterFilter = participants.length;
			if (beforeFilter !== afterFilter) {
				logger.info(`[GET STANDINGS] Filtered to ${afterFilter} official participants (removed ${beforeFilter - afterFilter} unofficial)`);
			}
			
			// Sort by ranking criteria
			participants.sort(compareParticipants);
			
			// Assign ranks (handle ties)
			let currentRank = 1;
			for (let i = 0; i < participants.length; i++) {
				if (i > 0 && compareParticipants(participants[i - 1], participants[i]) !== 0) {
					currentRank = i + 1;
				}
				participants[i].rank = currentRank;
			}
			const rankDuration = Date.now() - rankStartTime;
			logger.info(`[GET STANDINGS] Computed ranks for ${participants.length} participants (took ${rankDuration}ms)`);
			
			// Step 5: Return rank range [A, B]
			logger.info(`[GET STANDINGS] Step 6: Paginating results (rank ${rankFrom} to ${rankTo || 'end'})`);
			const paginateStartTime = Date.now();
			const startIdx = rankFrom - 1;
			const endIdx = rankTo !== null ? rankTo : participants.length;
			const paginatedParticipants = participants.slice(startIdx, endIdx);
			
			// Transform to GraphQL/API format
			const rows = paginatedParticipants.map(participant => ({
				party: {
					contestId: contestId,
					members: [{ handle: participant.handle, name: null }],
					participantType: participant.participantType || 'CONTESTANT',
					ghost: participant.ghost || false,
					room: null,
					startTimeSeconds: null
				},
				rank: participant.rank,
				points: participant.totalPoints || 0,
				penalty: participant.totalPenalty || 0,
				successfulHackCount: participant.hackSuccess || 0,
				unsuccessfulHackCount: participant.hackFail || 0,
				problemResults: this.convertProblemsToResults(participant.problems)
			}));
			const paginateDuration = Date.now() - paginateStartTime;
			
			const operationDuration = Date.now() - operationStartTime;
			logger.info(`[GET STANDINGS] ✓ Completed query for contest ${contestId}: returned ${rows.length} rows (rank ${rankFrom}-${Math.min(endIdx, participants.length)}) - Total time: ${operationDuration}ms`);
			
			return {
				contest: await codeforcesDataService.getContestFromDB(contestId),
				problems: await codeforcesDataService.getProblemsFromDB(contestId),
				rows
			};
		} catch (error) {
			logger.error(`[GET STANDINGS] Error getting standings for contest ${contestId} at timestamp ${timestampSeconds}: ${error.message}`);
			throw error;
		}
	}
	
	/**
	 * Convert problems map/object to problemResults array format
	 * @param {Object|Map} problems - Problems state
	 * @returns {Array} Problem results array
	 */
	convertProblemsToResults(problems) {
		if (!problems) {
			return [];
		}
		
		// Handle both Map and plain object
		const problemsObj = problems instanceof Map 
			? Object.fromEntries(problems.entries())
			: problems;
		
		return Object.entries(problemsObj).map(([problemIndex, problemState]) => ({
			problemIndex,
			points: problemState.points || 0,
			penalty: 0,  // Penalty is per-problem, already included in totalPenalty
			rejectedAttemptCount: problemState.rejectCount || 0,
			type: 'FINAL',
			bestSubmissionTimeSeconds: problemState.solveTime || null
		}));
	}
	
	/**
	 * Initialize standings state from existing submissions
	 * This is used to populate the standingsState collection from raw submissions
	 * @param {number} contestId - Contest ID
	 * @param {boolean} fileMode - Use file storage instead of MongoDB (default: false)
	 * @returns {Promise<void>}
	 */
	async initializeStandingsState(contestId, fileMode = false) {
		try {
			const Models = getModels(fileMode);
			const storageMode = fileMode ? 'file' : 'MongoDB';
			const operationStartTime = Date.now();
			logger.info(`[INIT STANDINGS] ========================================`);
			logger.info(`[INIT STANDINGS] Starting initialization for contest ${contestId} (${storageMode})`);
			logger.info(`[INIT STANDINGS] ========================================`);
			
			// Get all submissions for the contest
			logger.info(`[INIT STANDINGS] Step 1: Fetching all submissions for contest ${contestId}`);
			const fetchSubmissionsStartTime = Date.now();
			const submissions = await codeforcesDataService.getSubmissionsFromDB(contestId, null, null);
			const fetchSubmissionsDuration = Date.now() - fetchSubmissionsStartTime;
			logger.info(`[INIT STANDINGS] Fetched ${submissions.length} submissions (took ${fetchSubmissionsDuration}ms)`);
			
			// Get contest info to determine start time
			logger.info(`[INIT STANDINGS] Step 2: Fetching contest info for contest ${contestId}`);
			const contest = await codeforcesDataService.getContestFromDB(contestId);
			if (!contest) {
				throw new Error(`Contest ${contestId} not found`);
			}
			const contestStartTime = contest.startTimeSeconds || 0;
			logger.info(`[INIT STANDINGS] Contest info: ${contest.name} (start time: ${contestStartTime})`);
			
			// Get problems to build problem points map
			logger.info(`[INIT STANDINGS] Step 3: Fetching problems for contest ${contestId} to get problem points`);
			const problems = await codeforcesDataService.getProblemsFromDB(contestId);
			const problemPointsMap = new Map();
			let problemsWithNoPoints = 0;
			for (const problem of problems) {
				// Store points (can be null if not set in database)
				if (problem.points === null || problem.points === undefined) {
					problemsWithNoPoints++;
				}
				problemPointsMap.set(problem.index, problem.points !== null && problem.points !== undefined ? problem.points : null);
			}
			if (problemsWithNoPoints > 0) {
				logger.warn(`[INIT STANDINGS] ${problemsWithNoPoints} problem(s) have no points in Problems collection`);
			}
			logger.info(`[INIT STANDINGS] Loaded ${problemPointsMap.size} problems with points mapping`);
			
			// Process submissions to build state
			logger.info(`[INIT STANDINGS] Step 4: Processing ${submissions.length} submissions to build state`);
			const processStartTime = Date.now();
			const stateMap = new Map(); // handle -> state
			let processedCount = 0;
			const logInterval = Math.max(1, Math.floor(submissions.length / 10)); // Log every 10%
			
			for (let i = 0; i < submissions.length; i++) {
				const submission = submissions[i];
				const handle = submission.author?.members?.[0]?.handle;
				if (!handle) {
					continue;
				}
				
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
						lastSubmissionTime: null,
						snapshotVersion: 0,
						updatedAt: new Date()
					});
				}
				
				const state = stateMap.get(handle);
				
				// Process submission
				const relativeTime = submission.relativeTimeSeconds || 0;
				
				// Ensure problems is a Map
				if (!(state.problems instanceof Map)) {
					state.problems = new Map();
				}
				
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
					relativeTimeSeconds: relativeTime,
					points: problemPoints
				});
				
				processedCount++;
				
				// Log progress periodically
				if ((i + 1) % logInterval === 0 || (i + 1) === submissions.length) {
					const progress = ((i + 1) / submissions.length * 100).toFixed(1);
					logger.info(`[INIT STANDINGS] Processed ${i + 1}/${submissions.length} submissions (${progress}%) - ${stateMap.size} unique participants so far`);
				}
			}
			
			const processDuration = Date.now() - processStartTime;
			logger.info(`[INIT STANDINGS] Processed ${processedCount} submissions - created ${stateMap.size} participant states (took ${processDuration}ms)`);
			
			// Save states to database or file
			logger.info(`[INIT STANDINGS] Step 5: Saving ${stateMap.size} participant states to ${storageMode}`);
			const saveStartTime = Date.now();
			const states = Array.from(stateMap.values());
			
			if (fileMode) {
				// For file mode, use batch replace (much more efficient - single write)
				logger.info(`[INIT STANDINGS] Using batch replace for file mode (single atomic write)`);
				
				// Convert all states to documents
				const stateDocs = states.map(state => {
					const stateDoc = {
						contestId,
						handle: state.handle,
						participantType: state.participantType,
						ghost: state.ghost,
						isUnofficial: state.isUnofficial,
						totalPoints: state.totalPoints || 0,
						totalPenalty: state.totalPenalty || 0,
						solvedCount: state.solvedCount || 0,
						lastAcTime: state.lastAcTime || null,
						hackSuccess: state.hackSuccess || 0,
						hackFail: state.hackFail || 0,
						lastSubmissionTime: state.lastSubmissionTime || null,
						snapshotVersion: state.snapshotVersion || 0,
						problems: Object.fromEntries(state.problems.entries()),
						updatedAt: new Date().toISOString()
					};
					return stateDoc;
				});
				
				// Use fileStorageService.replaceAll for atomic batch write
				await fileStorageService.replaceAll('standingsState', contestId, stateDocs);
				
				logger.info(`[INIT STANDINGS] Batch replace completed: ${stateDocs.length} states saved atomically`);
			} else {
				// For MongoDB, use bulk write (more efficient than individual upserts)
				logger.info(`[INIT STANDINGS] Using bulk write for MongoDB (batch operation)`);
				
				// Prepare bulk operations
				const bulkOps = states.map(state => {
					const stateDoc = {
						...state,
						problems: Object.fromEntries(state.problems.entries())
					};
					
					return {
						updateOne: {
							filter: { contestId, handle: state.handle },
							update: { $set: stateDoc },
							upsert: true
						}
					};
				});
				
				// Execute bulk write in batches (MongoDB limit is typically 1000 operations)
				const BATCH_SIZE = 1000;
				const saveLogInterval = Math.max(1, Math.floor(states.length / 10)); // Log every 10%
				
				for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
					const batch = bulkOps.slice(i, i + BATCH_SIZE);
					await Models.StandingsState.bulkWrite(batch, { ordered: false });
					
					const processed = Math.min(i + BATCH_SIZE, bulkOps.length);
					// Log progress periodically
					if (processed % saveLogInterval === 0 || processed === bulkOps.length) {
						const progress = ((processed / bulkOps.length) * 100).toFixed(1);
						logger.info(`[INIT STANDINGS] Bulk write progress: ${processed}/${bulkOps.length} operations (${progress}%)`);
					}
				}
			}
			
			const saveDuration = Date.now() - saveStartTime;
			const operationDuration = Date.now() - operationStartTime;
			logger.info(`[INIT STANDINGS] ========================================`);
			logger.info(`[INIT STANDINGS] ✓ Completed initialization for contest ${contestId}`);
			logger.info(`[INIT STANDINGS]   - Submissions processed: ${processedCount}`);
			logger.info(`[INIT STANDINGS]   - Participants created: ${states.length}`);
			logger.info(`[INIT STANDINGS]   - Processing time: ${processDuration}ms`);
			logger.info(`[INIT STANDINGS]   - Saving time: ${saveDuration}ms`);
			logger.info(`[INIT STANDINGS]   - Total time: ${operationDuration}ms`);
			logger.info(`[INIT STANDINGS] ========================================`);
		} catch (error) {
			logger.error(`[INIT STANDINGS] Error initializing standings state for contest ${contestId}: ${error.message}`);
			throw error;
		}
	}
}

// Export singleton instance
export const incrementalSimulationService = new IncrementalSimulationService();
