import { models } from '../data/models/index.js';
import { getModels } from './modelProvider.js';
import { snapshotService } from './snapshotService.js';
import { compareParticipants, plainObjectToState, processSubmission } from './standingsStateUpdate.js';
import { codeforcesDataService } from './codeforcesDataService.js';
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
			// Step 1: Find nearest base snapshot ≤ T
			const baseSnapshot = await snapshotService.getBaseSnapshotAt(contestId, timestampSeconds, fileMode);
			
			if (!baseSnapshot) {
				// No snapshot yet - return empty or compute from scratch
				logger.warn(`No base snapshot found for contest ${contestId} at timestamp ${timestampSeconds}`);
				return {
					contest: await codeforcesDataService.getContestFromDB(contestId),
					problems: await codeforcesDataService.getProblemsFromDB(contestId),
					rows: []
				};
			}
			
			// Step 2: Load base state into map
			let participantMap = new Map();
			for (const p of baseSnapshot.participants) {
				participantMap.set(p.handle, { ...p });
			}
			
			// Step 3: Apply delta snapshots from baseTimestamp to T
			const deltas = await snapshotService.getDeltaSnapshotsBetween(
				contestId,
				baseSnapshot.timestampSeconds,
				timestampSeconds,
				fileMode
			);
			
			for (const delta of deltas) {
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
			
			// Step 4: Convert to array and compute ranks
			let participants = Array.from(participantMap.values());
			
			// Filter unofficial if needed
			if (!showUnofficial) {
				participants = participants.filter(p => !p.isUnofficial);
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
			
			// Step 5: Return rank range [A, B]
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
			
			return {
				contest: await codeforcesDataService.getContestFromDB(contestId),
				problems: await codeforcesDataService.getProblemsFromDB(contestId),
				rows
			};
		} catch (error) {
			logger.error(`Error getting standings for contest ${contestId} at timestamp ${timestampSeconds}: ${error.message}`);
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
			logger.info(`Initializing standings state for contest ${contestId} (${storageMode})`);
			
			// Get all submissions for the contest
			const submissions = await codeforcesDataService.getSubmissionsFromDB(contestId, null, null);
			
			// Get contest info to determine start time
			const contest = await codeforcesDataService.getContestFromDB(contestId);
			if (!contest) {
				throw new Error(`Contest ${contestId} not found`);
			}
			
			const contestStartTime = contest.startTimeSeconds || 0;
			
			// Process submissions to build state
			const stateMap = new Map(); // handle -> state
			
			for (const submission of submissions) {
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
				
				processSubmission(state, {
					problemIndex: submission.problem?.index || '',
					verdict: submission.verdict,
					relativeTimeSeconds: relativeTime,
					points: submission.problem?.points || 0
				});
			}
			
			// Save states to database or file
			const states = Array.from(stateMap.values());
			for (const state of states) {
				// Convert problems Map to object for storage
				const stateDoc = {
					...state,
					problems: Object.fromEntries(state.problems.entries())
				};
				
				await Models.StandingsState.findOneAndUpdate(
					{ contestId, handle: state.handle },
					{ $set: stateDoc },
					{ upsert: true }
				);
			}
			
			logger.info(`Initialized standings state for contest ${contestId} with ${states.length} participants (${storageMode})`);
		} catch (error) {
			logger.error(`Error initializing standings state for contest ${contestId}: ${error.message}`);
			throw error;
		}
	}
}

// Export singleton instance
export const incrementalSimulationService = new IncrementalSimulationService();
