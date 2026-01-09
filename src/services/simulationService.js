import { codeforcesDataService } from './codeforcesDataService.js';
import { incrementalSimulationService } from './incrementalSimulationService.js';
import { logger } from '../helpers/logger.js';

/**
 * Simulation Service for Codeforces Contest Replay
 * Provides time-based filtering and replay functionality for finished contests
 * 
 * This service now uses the new incremental simulation system with snapshots
 * when available, falling back to the legacy recomputation method for backwards compatibility
 */
class SimulationService {
	/**
	 * Get standings at a specific timestamp (simulated)
	 * Uses incremental simulation with snapshots if available, otherwise falls back to legacy method
	 * @param {number} contestId - Contest ID
	 * @param {number} timestamp - Unix timestamp (seconds) relative to contest start
	 * @param {number} from - Starting rank (1-indexed)
	 * @param {number} count - Number of participants to fetch (if null, returns all from 'from')
	 * @param {boolean} showUnofficial - Include unofficial participants
	 * @returns {Promise<object>} Standings data at specified timestamp
	 */
	async getStandingsAtTime(contestId, timestamp, from = 1, count = null, showUnofficial = false) {
		try {
			// Try to use new incremental simulation system first
			try {
				const rankTo = count !== null ? from + count - 1 : null;
				const result = await incrementalSimulationService.getStandingsAtTime(
					contestId,
					timestamp,
					from,
					rankTo,
					showUnofficial
				);
				
				// If we got results, return them
				if (result && result.rows && result.rows.length > 0) {
					logger.debug(`Used incremental simulation for contest ${contestId} at timestamp ${timestamp}`);
					return result;
				}
				
				// If no results but contest exists, fall through to legacy method
				logger.debug(`No snapshot data found for contest ${contestId}, falling back to legacy method`);
			} catch (incError) {
				// If incremental system fails, log and fall back to legacy method
				logger.warn(`Incremental simulation failed for contest ${contestId} at timestamp ${timestamp}, using legacy method: ${incError.message}`);
			}
			
			// Fall back to legacy recomputation method
			return await this.getStandingsAtTimeLegacy(contestId, timestamp, from, count, showUnofficial);
		} catch (error) {
			logger.error(`Error simulating standings for contest ${contestId} at timestamp ${timestamp}: ${error.message}`);
			throw error;
		}
	}
	
	/**
	 * Legacy method: Get standings by recomputing from submissions
	 * Filters submissions and recalculates standings up to that point in time
	 * @param {number} contestId - Contest ID
	 * @param {number} timestamp - Unix timestamp (seconds) relative to contest start
	 * @param {number} from - Starting rank (1-indexed)
	 * @param {number} count - Number of participants to fetch
	 * @param {boolean} showUnofficial - Include unofficial participants
	 * @returns {Promise<object>} Standings data at specified timestamp
	 */
	async getStandingsAtTimeLegacy(contestId, timestamp, from = 1, count = null, showUnofficial = false) {
		try {
			// Get contest info to determine start time
			const contest = await codeforcesDataService.getContestFromDB(contestId);
			if (!contest) {
				throw new Error(`Contest ${contestId} not found`);
			}

			// Get all submissions up to the timestamp
			const allSubmissions = await codeforcesDataService.getSubmissionsFromDB(contestId, null, null);
			
			// Filter submissions by timestamp
			const contestStartTime = contest.startTimeSeconds || 0;
			const maxCreationTime = contestStartTime + timestamp;
			
			const filteredSubmissions = allSubmissions.filter(sub => 
				sub.creationTimeSeconds <= maxCreationTime
			);

			// Get all standings (final standings)
			const finalStandings = await codeforcesDataService.getStandingsFromDB(
				contestId,
				1,
				null,
				showUnofficial
			);

			// Recalculate standings based on filtered submissions
			// This is a simplified version - in reality, we'd need to recalculate points/penalties
			// For now, we'll filter standings based on who had submissions before the timestamp
			const participantSubmissions = new Map();
			
			for (const sub of filteredSubmissions) {
				const handle = sub.author.members[0]?.handle;
				if (handle) {
					if (!participantSubmissions.has(handle)) {
						participantSubmissions.set(handle, []);
					}
					participantSubmissions.get(handle).push(sub);
				}
			}

			// Filter standings to only include participants with submissions before timestamp
			// and recalculate their standings based on filtered submissions
			const simulatedRows = finalStandings.rows
				.filter(row => {
					const handle = row.party.members[0]?.handle;
					return handle && participantSubmissions.has(handle);
				})
				.map(row => {
					// Recalculate problem results based on filtered submissions
					const handle = row.party.members[0]?.handle;
					const userSubmissions = participantSubmissions.get(handle) || [];
					
					// Group submissions by problem
					const problemSubs = new Map();
					for (const sub of userSubmissions) {
						const problemIndex = sub.problem.index;
						if (!problemSubs.has(problemIndex)) {
							problemSubs.set(problemIndex, []);
						}
						problemSubs.get(problemIndex).push(sub);
					}

					// Recalculate problem results
					const newProblemResults = finalStandings.problems.map(problem => {
						const subs = problemSubs.get(problem.index) || [];
						const accepted = subs.find(s => s.verdict === 'OK');
						
						if (accepted) {
							return {
								points: problem.points || 0,
								rejectedAttemptCount: subs.filter(s => s.verdict !== 'OK' && s.creationTimeSeconds < accepted.creationTimeSeconds).length,
								type: 'FINAL',
								bestSubmissionTimeSeconds: accepted.relativeTimeSeconds
							};
						} else if (subs.length > 0) {
							return {
								points: 0,
								rejectedAttemptCount: subs.length,
								type: 'FINAL',
								bestSubmissionTimeSeconds: null
							};
						} else {
							return {
								points: 0,
								rejectedAttemptCount: 0,
								type: 'FINAL',
								bestSubmissionTimeSeconds: null
							};
						}
					});

					// Recalculate total points and penalty
					let totalPoints = 0;
					let totalPenalty = 0;
					
					for (const pr of newProblemResults) {
						if (pr.points > 0) {
							totalPoints += pr.points;
							// Penalty calculation: rejected attempts * 10 minutes + submission time in minutes
							const penaltyMinutes = (pr.bestSubmissionTimeSeconds || 0) / 60;
							totalPenalty += pr.rejectedAttemptCount * 10 + penaltyMinutes;
						}
					}

					return {
						...row,
						points: totalPoints,
						penalty: Math.floor(totalPenalty),
						problemResults: newProblemResults
					};
				})
				.sort((a, b) => {
					// Sort by points (desc), then penalty (asc)
					if (b.points !== a.points) {
						return b.points - a.points;
					}
					return a.penalty - b.penalty;
				})
				.map((row, index) => ({
					...row,
					rank: index + 1
				}));

			// Apply pagination
			const startIndex = from - 1;
			const endIndex = count !== null ? startIndex + count : undefined;
			const paginatedRows = simulatedRows.slice(startIndex, endIndex);

			return {
				contest: finalStandings.contest,
				problems: finalStandings.problems,
				rows: paginatedRows
			};
		} catch (error) {
			logger.error(`Error simulating standings for contest ${contestId} at timestamp ${timestamp}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Get submissions at a specific timestamp (simulated)
	 * @param {number} contestId - Contest ID
	 * @param {number} timestamp - Unix timestamp (seconds) relative to contest start
	 * @param {number} count - Number of submissions to fetch
	 * @param {string|null} handle - Optional user handle to filter
	 * @returns {Promise<Array>} Submissions up to the timestamp
	 */
	async getSubmissionsAtTime(contestId, timestamp, count = null, handle = null) {
		try {
			// Get contest info to determine start time
			const contest = await codeforcesDataService.getContestFromDB(contestId);
			if (!contest) {
				throw new Error(`Contest ${contestId} not found`);
			}

			// Get all submissions
			const allSubmissions = await codeforcesDataService.getSubmissionsFromDB(contestId, null, handle);
			
			// Filter by timestamp
			const contestStartTime = contest.startTimeSeconds || 0;
			const maxCreationTime = contestStartTime + timestamp;
			
			let filteredSubmissions = allSubmissions.filter(sub => 
				sub.creationTimeSeconds <= maxCreationTime
			);

			// Sort by creation time (newest first)
			filteredSubmissions.sort((a, b) => b.creationTimeSeconds - a.creationTimeSeconds);

			// Apply count limit
			if (count !== null && count > 0) {
				filteredSubmissions = filteredSubmissions.slice(0, count);
			}

			return filteredSubmissions;
		} catch (error) {
			logger.error(`Error simulating submissions for contest ${contestId} at timestamp ${timestamp}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Get simulation state information
	 * @param {number} contestId - Contest ID
	 * @param {number} currentTimestamp - Current simulation timestamp
	 * @param {number} speedMultiplier - Speed multiplier (1.0 = real-time)
	 * @returns {Promise<object>} Simulation state
	 */
	async getSimulationState(contestId, currentTimestamp, speedMultiplier = 1.0) {
		try {
			const contest = await codeforcesDataService.getContestFromDB(contestId);
			if (!contest) {
				throw new Error(`Contest ${contestId} not found`);
			}

			const contestStartTime = contest.startTimeSeconds || 0;
			const contestDuration = contest.durationSeconds || 0;
			const contestEndTime = contestStartTime + contestDuration;

			// Clamp timestamp to contest duration
			const clampedTimestamp = Math.min(currentTimestamp, contestDuration);
			const isRunning = clampedTimestamp < contestDuration;

			return {
				contestId,
				startTime: contestStartTime,
				currentTime: contestStartTime + clampedTimestamp,
				speedMultiplier,
				isRunning,
				progress: contestDuration > 0 ? (clampedTimestamp / contestDuration) * 100 : 0
			};
		} catch (error) {
			logger.error(`Error getting simulation state for contest ${contestId}: ${error.message}`);
			throw error;
		}
	}
}

// Export singleton instance
export const simulationService = new SimulationService();

