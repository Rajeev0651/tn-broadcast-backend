import { UserInputError } from 'apollo-server-errors';
import { codeforcesDataService } from '../../services/codeforcesDataService.js';
import { simulationService } from '../../services/simulationService.js';
import { logger } from '../../helpers/logger.js';

export default {
	Query: {
		/**
		 * Get list of all Codeforces contests from MongoDB
		 */
		async contestList(parent, args) {
			try {
				const includeGym = args.includeGym || false;
				const contests = await codeforcesDataService.getContestListFromDB(includeGym);
				return contests;
			} catch (error) {
				logger.error(`Error fetching contest list: ${error.message}`);
				throw new UserInputError(`Failed to fetch contest list: ${error.message}`);
			}
		},

		/**
		 * Get contest information by ID from MongoDB
		 */
		async contest(parent, args) {
			try {
				const { id } = args;
				if (!id || id <= 0) {
					throw new UserInputError('Invalid contest ID');
				}

				const contest = await codeforcesDataService.getContestFromDB(id);
				if (!contest) {
					throw new UserInputError(`Contest ${id} not found in database`);
				}
				return contest;
			} catch (error) {
				logger.error(`Error fetching contest ${args.id}: ${error.message}`);
				if (error instanceof UserInputError) {
					throw error;
				}
				throw new UserInputError(`Failed to fetch contest: ${error.message}`);
			}
		},

		/**
		 * Get contest standings from MongoDB
		 */
		async contestStandings(parent, args) {
			try {
				const { contestId, from, count, showUnofficial } = args;
				
				if (!contestId || contestId <= 0) {
					throw new UserInputError('Invalid contest ID');
				}

				const standings = await codeforcesDataService.getStandingsFromDB(
					contestId,
					from,
					count,
					showUnofficial || false
				);

				if (!standings.contest) {
					throw new UserInputError(`Contest ${contestId} not found in database`);
				}

				return standings;
			} catch (error) {
				logger.error(`Error fetching standings for contest ${args.contestId}: ${error.message}`);
				if (error instanceof UserInputError) {
					throw error;
				}
				throw new UserInputError(`Failed to fetch standings: ${error.message}`);
			}
		},

		/**
		 * Get contest submissions from MongoDB
		 */
		async contestSubmissions(parent, args) {
			try {
				const { contestId, count, handle } = args;
				
				if (!contestId || contestId <= 0) {
					throw new UserInputError('Invalid contest ID');
				}

				const submissions = await codeforcesDataService.getSubmissionsFromDB(
					contestId,
					count,
					handle || null
				);

				return {
					submissions
				};
			} catch (error) {
				logger.error(`Error fetching submissions for contest ${args.contestId}: ${error.message}`);
				if (error instanceof UserInputError) {
					throw error;
				}
				throw new UserInputError(`Failed to fetch submissions: ${error.message}`);
			}
		},

		/**
		 * Get problem statistics for a contest from MongoDB
		 */
		async contestProblems(parent, args) {
			try {
				const { contestId } = args;
				
				if (!contestId || contestId <= 0) {
					throw new UserInputError('Invalid contest ID');
				}

				const problems = await codeforcesDataService.getProblemsFromDB(contestId);
				return problems;
			} catch (error) {
				logger.error(`Error fetching problems for contest ${args.contestId}: ${error.message}`);
				if (error instanceof UserInputError) {
					throw error;
				}
				throw new UserInputError(`Failed to fetch problems: ${error.message}`);
			}
		},

		/**
		 * Get contest standings at a specific timestamp (simulated)
		 */
		async contestStandingsSimulated(parent, args) {
			try {
				const { contestId, timestamp, from, count, showUnofficial } = args;
				
				if (!contestId || contestId <= 0) {
					throw new UserInputError('Invalid contest ID');
				}

				if (timestamp === undefined || timestamp < 0) {
					throw new UserInputError('Invalid timestamp');
				}

				const standings = await simulationService.getStandingsAtTime(
					contestId,
					timestamp,
					from,
					count,
					showUnofficial || false
				);

				return standings;
			} catch (error) {
				logger.error(`Error simulating standings for contest ${args.contestId}: ${error.message}`);
				if (error instanceof UserInputError) {
					throw error;
				}
				throw new UserInputError(`Failed to simulate standings: ${error.message}`);
			}
		},

		/**
		 * Get contest submissions at a specific timestamp (simulated)
		 */
		async contestSubmissionsSimulated(parent, args) {
			try {
				const { contestId, timestamp, count, handle } = args;
				
				if (!contestId || contestId <= 0) {
					throw new UserInputError('Invalid contest ID');
				}

				if (timestamp === undefined || timestamp < 0) {
					throw new UserInputError('Invalid timestamp');
				}

				const submissions = await simulationService.getSubmissionsAtTime(
					contestId,
					timestamp,
					count,
					handle || null
				);

				return {
					submissions
				};
			} catch (error) {
				logger.error(`Error simulating submissions for contest ${args.contestId}: ${error.message}`);
				if (error instanceof UserInputError) {
					throw error;
				}
				throw new UserInputError(`Failed to simulate submissions: ${error.message}`);
			}
		},

		/**
		 * Get simulation state for a contest
		 */
		async simulationState(parent, args) {
			try {
				const { contestId, currentTimestamp, speedMultiplier } = args;
				
				if (!contestId || contestId <= 0) {
					throw new UserInputError('Invalid contest ID');
				}

				if (currentTimestamp === undefined || currentTimestamp < 0) {
					throw new UserInputError('Invalid current timestamp');
				}

				const state = await simulationService.getSimulationState(
					contestId,
					currentTimestamp,
					speedMultiplier || 1.0
				);

				return state;
			} catch (error) {
				logger.error(`Error getting simulation state for contest ${args.contestId}: ${error.message}`);
				if (error instanceof UserInputError) {
					throw error;
				}
				throw new UserInputError(`Failed to get simulation state: ${error.message}`);
			}
		}
	}
};

