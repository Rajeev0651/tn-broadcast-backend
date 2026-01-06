import { UserInputError } from 'apollo-server-express';
import { codeforcesAPI } from '../../helpers/codeforcesAPI.js';
import { logger } from '../../helpers/logger.js';

/**
 * All resolvers related to Codeforces contest data
 * @typedef {Object}
 */
export default {
	Query: {
		/**
		 * Get list of all Codeforces contests
		 */
		getContestList: async (parent, { includeGym = false }, context) => {
			try {
				const contests = await codeforcesAPI.getContestList(includeGym);
				return contests;
			} catch (error) {
				logger.error(`Error fetching contest list: ${error.message}`);
				throw new UserInputError(`Failed to fetch contest list: ${error.message}`);
			}
		},

		/**
		 * Get complete contest standings (all participants, handles pagination automatically)
		 */
		getContestStandings: async (parent, { contestId, showUnofficial = false }, context) => {
			if (!contestId || contestId <= 0) {
				throw new UserInputError('Invalid contest ID');
			}

			try {
				const standings = await codeforcesAPI.getContestStandings(contestId, showUnofficial);
				return standings;
			} catch (error) {
				logger.error(`Error fetching contest standings for contest ${contestId}: ${error.message}`);
				
				if (error.message.includes('not found')) {
					throw new UserInputError(`Contest with ID ${contestId} not found`);
				}
				
				throw new UserInputError(`Failed to fetch contest standings: ${error.message}`);
			}
		},

		/**
		 * Get all submissions for a contest (handles pagination automatically)
		 */
		getContestSubmissions: async (parent, { contestId, handle = null }, context) => {
			if (!contestId || contestId <= 0) {
				throw new UserInputError('Invalid contest ID');
			}

			try {
				const submissions = await codeforcesAPI.getContestSubmissions(contestId, handle);
				return submissions;
			} catch (error) {
				logger.error(`Error fetching contest submissions for contest ${contestId}${handle ? ` (handle: ${handle})` : ''}: ${error.message}`);
				
				if (error.message.includes('not found')) {
					throw new UserInputError(`Contest with ID ${contestId} not found`);
				}
				
				throw new UserInputError(`Failed to fetch contest submissions: ${error.message}`);
			}
		},

		/**
		 * Get rating changes after a contest
		 */
		getContestRatingChanges: async (parent, { contestId }, context) => {
			if (!contestId || contestId <= 0) {
				throw new UserInputError('Invalid contest ID');
			}

			try {
				const ratingChanges = await codeforcesAPI.getContestRatingChanges(contestId);
				return ratingChanges;
			} catch (error) {
				logger.error(`Error fetching rating changes for contest ${contestId}: ${error.message}`);
				
				if (error.message.includes('not found')) {
					throw new UserInputError(`Contest with ID ${contestId} not found`);
				}
				
				// Rating changes may not be available for all contests
				if (error.message.includes('Rating changes are not available')) {
					return [];
				}
				
				throw new UserInputError(`Failed to fetch rating changes: ${error.message}`);
			}
		},

		/**
		 * Get hacks in a contest
		 */
		getContestHacks: async (parent, { contestId }, context) => {
			if (!contestId || contestId <= 0) {
				throw new UserInputError('Invalid contest ID');
			}

			try {
				const hacks = await codeforcesAPI.getContestHacks(contestId);
				return hacks;
			} catch (error) {
				logger.error(`Error fetching hacks for contest ${contestId}: ${error.message}`);
				
				if (error.message.includes('not found')) {
					throw new UserInputError(`Contest with ID ${contestId} not found`);
				}
				
				// Hacks may not be available for all contests
				if (error.message.includes('Hacks are not available')) {
					return [];
				}
				
				throw new UserInputError(`Failed to fetch hacks: ${error.message}`);
			}
		},

		/**
		 * Get complete contest data (standings, submissions, rating changes, hacks) in one call
		 */
		getCompleteContestData: async (parent, { contestId, showUnofficial = false }, context) => {
			if (!contestId || contestId <= 0) {
				throw new UserInputError('Invalid contest ID');
			}

			try {
				const completeData = await codeforcesAPI.getCompleteContestData(contestId, showUnofficial);
				return completeData;
			} catch (error) {
				logger.error(`Error fetching complete contest data for contest ${contestId}: ${error.message}`);
				
				if (error.message.includes('not found')) {
					throw new UserInputError(`Contest with ID ${contestId} not found`);
				}
				
				throw new UserInputError(`Failed to fetch complete contest data: ${error.message}`);
			}
		}
	}
};

