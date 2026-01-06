/* Home doc */
/**
 * @file Codeforces data service for MongoDB operations
 * @see module:codeforcesDataService
 */

/* Module doc */
/**
 * Codeforces data service module
 * Handles all MongoDB operations for Codeforces contest data
 * @module codeforcesDataService
 */

import { logger } from '../helpers/logger.js';
import { codeforcesAPI } from '../helpers/codeforcesAPI.js';

/**
 * Codeforces Data Service
 * Provides methods for storing and retrieving Codeforces contest data from MongoDB
 */
class CodeforcesDataService {
	constructor(models) {
		this.models = models;
	}

	/**
	 * Generate problem ID from contest ID and problem index
	 * @private
	 * @param {number} contestId - Contest ID
	 * @param {string} index - Problem index
	 * @returns {string} Problem ID
	 */
	generateProblemId(contestId, index) {
		return `${contestId}:${index}`;
	}

	/**
	 * Generate participant key from contest ID and handle/team
	 * @private
	 * @param {number} contestId - Contest ID
	 * @param {string} handle - User handle
	 * @param {number} teamId - Optional team ID
	 * @returns {string} Participant key
	 */
	generateParticipantKey(contestId, handle, teamId = null) {
		if (teamId) {
			return `${contestId}:team:${teamId}`;
		}
		return `${contestId}:${handle}`;
	}

	/**
	 * Chunk array into batches of specified size
	 * @private
	 * @param {Array} array - Array to chunk
	 * @param {number} chunkSize - Size of each chunk (default: 1000)
	 * @returns {Array<Array>} Array of chunks
	 */
	chunkArray(array, chunkSize = 1000) {
		const chunks = [];
		for (let i = 0; i < array.length; i += chunkSize) {
			chunks.push(array.slice(i, i + chunkSize));
		}
		return chunks;
	}

	/**
	 * Store or update contest data
	 * @param {Object} contestData - Contest data from API
	 * @returns {Promise<Object>} Stored contest document
	 */
	async upsertContest(contestData) {
		try {
			const contest = await this.models.Contests.findOneAndUpdate(
				{ contestId: contestData.id },
				{
					$set: {
						contestId: contestData.id,
						name: contestData.name,
						type: contestData.type,
						phase: contestData.phase,
						frozen: contestData.frozen || false,
						durationSeconds: contestData.durationSeconds,
						startTimeSeconds: contestData.startTimeSeconds,
						relativeTimeSeconds: contestData.relativeTimeSeconds,
						preparedBy: contestData.preparedBy,
						websiteUrl: contestData.websiteUrl,
						description: contestData.description,
						difficulty: contestData.difficulty,
						kind: contestData.kind,
						icpcRegion: contestData.icpcRegion,
						country: contestData.country,
						city: contestData.city,
						season: contestData.season,
						isGym: contestData.type === 'GYM' || false,
						lastFetchedAt: new Date(),
						updatedAt: new Date()
					},
					$setOnInsert: {
						createdAt: new Date(),
						dataVersion: 1
					}
				},
				{ upsert: true, new: true }
			);

			logger.debug(`Upserted contest ${contestData.id}: ${contestData.name}`);
			return contest;
		} catch (error) {
			logger.error(`Error upserting contest ${contestData.id}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Store or update problem data
	 * @param {Object} problemData - Problem data from API
	 * @param {number} contestId - Contest ID
	 * @returns {Promise<Object>} Stored problem document
	 */
	async upsertProblem(problemData, contestId) {
		try {
			const problemId = this.generateProblemId(contestId, problemData.index);

			const problem = await this.models.Problems.findOneAndUpdate(
				{ problemId },
				{
					$set: {
						problemId,
						contestId,
						problemsetName: problemData.problemsetName,
						index: problemData.index,
						name: problemData.name,
						type: problemData.type,
						points: problemData.points,
						rating: problemData.rating,
						tags: problemData.tags || [],
						lastSeenAt: new Date(),
						updatedAt: new Date()
					},
					$inc: { referenceCount: 1 },
					$setOnInsert: {
						createdAt: new Date()
					}
				},
				{ upsert: true, new: true }
			);

			logger.debug(`Upserted problem ${problemId}`);
			return problem;
		} catch (error) {
			logger.error(`Error upserting problem ${problemData.index} for contest ${contestId}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Store or update standings data
	 * @param {Object} standingsData - Complete standings data from API
	 * @param {boolean} isUnofficial - Whether unofficial participants included
	 * @returns {Promise<Array>} Array of stored standings documents
	 */
	async upsertStandings(standingsData, isUnofficial = false) {
		try {
			const { contest, problems, rows } = standingsData;
			const contestId = contest.id;

			// First, ensure contest and problems are stored
			await this.upsertContest(contest);
			for (const problem of problems) {
				await this.upsertProblem(problem, contestId);
			}

			// Prepare standings documents
			const standingsDocs = rows.map(row => {
				const primaryHandle = row.party.members[0]?.handle || '';
				const participantKey = this.generateParticipantKey(
					contestId,
					primaryHandle,
					row.party.teamId
				);

				return {
					contestId,
					participantKey,
					contestName: contest.name,
					contestPhase: contest.phase,
					handle: primaryHandle,
					handles: row.party.members.map(m => m.handle),
					teamId: row.party.teamId,
					teamName: row.party.teamName,
					participantType: row.party.participantType,
					ghost: row.party.ghost || false,
					room: row.party.room,
					startTimeSeconds: row.party.startTimeSeconds,
					rank: row.rank,
					points: row.points,
					penalty: row.penalty,
					successfulHackCount: row.successfulHackCount || 0,
					unsuccessfulHackCount: row.unsuccessfulHackCount || 0,
					lastSubmissionTimeSeconds: row.lastSubmissionTimeSeconds,
					problemResults: row.problemResults || [],
					isUnofficial: isUnofficial || row.party.participantType !== 'CONTESTANT',
					lastFetchedAt: new Date()
				};
			});

			// Bulk upsert standings
			const bulkOps = standingsDocs.map(doc => ({
				updateOne: {
					filter: { contestId: doc.contestId, participantKey: doc.participantKey },
					update: { $set: doc },
					upsert: true
				}
			}));

			const result = await this.models.Standings.bulkWrite(bulkOps, { ordered: false });

			logger.info(`Upserted ${result.upsertedCount + result.modifiedCount} standings for contest ${contestId}`);
			return standingsDocs;
		} catch (error) {
			logger.error(`Error upserting standings for contest ${standingsData.contest.id}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Store or update submissions data
	 * @param {Array} submissionsData - Array of submission data from API
	 * @param {number} contestId - Contest ID
	 * @returns {Promise<Array>} Array of stored submission documents
	 */
	async upsertSubmissions(submissionsData, contestId) {
		try {
			// Prepare submission documents
			const submissionDocs = submissionsData.map(sub => {
				const primaryHandle = sub.author.members[0]?.handle || '';

				return {
					submissionId: sub.id,
					contestId: contestId || sub.contestId,
					problemIndex: sub.problem.index,
					problemName: sub.problem.name,
					problemPoints: sub.problem.points,
					handle: primaryHandle,
					handles: sub.author.members.map(m => m.handle),
					participantType: sub.author.participantType,
					creationTimeSeconds: sub.creationTimeSeconds,
					relativeTimeSeconds: sub.relativeTimeSeconds,
					programmingLanguage: sub.programmingLanguage,
					verdict: sub.verdict,
					testset: sub.testset,
					passedTestCount: sub.passedTestCount || 0,
					timeConsumedMillis: sub.timeConsumedMillis,
					memoryConsumedBytes: sub.memoryConsumedBytes,
					lastFetchedAt: new Date()
				};
			});

			// Bulk upsert submissions
			const bulkOps = submissionDocs.map(doc => ({
				updateOne: {
					filter: { submissionId: doc.submissionId },
					update: { $set: doc },
					upsert: true
				}
			}));

			const result = await this.models.Submissions.bulkWrite(bulkOps, { ordered: false });

			logger.info(`Upserted ${result.upsertedCount + result.modifiedCount} submissions for contest ${contestId}`);
			return submissionDocs;
		} catch (error) {
			logger.error(`Error upserting submissions for contest ${contestId}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Store or update rating changes data
	 * @param {Array} ratingChangesData - Array of rating change data from API
	 * @param {number} contestId - Contest ID
	 * @returns {Promise<Array>} Array of stored rating change documents
	 */
	async upsertRatingChanges(ratingChangesData, contestId) {
		try {
			if (!ratingChangesData || ratingChangesData.length === 0) {
				logger.debug(`No rating changes for contest ${contestId}`);
				return [];
			}

			// Prepare rating change documents
			const ratingChangeDocs = ratingChangesData.map(rc => ({
				contestId: contestId || rc.contestId,
				handle: rc.handle,
				contestName: rc.contestName,
				rank: rc.rank,
				ratingUpdateTimeSeconds: rc.ratingUpdateTimeSeconds,
				oldRating: rc.oldRating,
				newRating: rc.newRating,
				lastFetchedAt: new Date()
			}));

			// Bulk upsert rating changes
			const bulkOps = ratingChangeDocs.map(doc => ({
				updateOne: {
					filter: { contestId: doc.contestId, handle: doc.handle },
					update: { $set: doc },
					upsert: true
				}
			}));

			const result = await this.models.RatingChanges.bulkWrite(bulkOps, { ordered: false });

			logger.info(`Upserted ${result.upsertedCount + result.modifiedCount} rating changes for contest ${contestId}`);
			return ratingChangeDocs;
		} catch (error) {
			logger.error(`Error upserting rating changes for contest ${contestId}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Store or update hacks data
	 * @param {Array} hacksData - Array of hack data from API
	 * @param {number} contestId - Contest ID
	 * @returns {Promise<Array>} Array of stored hack documents
	 */
	async upsertHacks(hacksData, contestId) {
		try {
			if (!hacksData || hacksData.length === 0) {
				logger.debug(`No hacks for contest ${contestId}`);
				return [];
			}

			// Prepare hack documents
			const hackDocs = hacksData.map(hack => {
				const hackerHandle = hack.hacker.members[0]?.handle || '';
				const defenderHandle = hack.defender.members[0]?.handle || '';

				return {
					hackId: hack.id,
					contestId: contestId || hack.contestId,
					problemIndex: hack.problem.index,
					problemName: hack.problem.name,
					hackerHandle,
					hackerHandles: hack.hacker.members.map(m => m.handle),
					hackerParticipantType: hack.hacker.participantType,
					defenderHandle,
					defenderHandles: hack.defender.members.map(m => m.handle),
					defenderParticipantType: hack.defender.participantType,
					creationTimeSeconds: hack.creationTimeSeconds,
					verdict: hack.verdict,
					test: hack.test,
					judgeProtocol: hack.judgeProtocol,
					lastFetchedAt: new Date()
				};
			});

			// Bulk upsert hacks
			const bulkOps = hackDocs.map(doc => ({
				updateOne: {
					filter: { hackId: doc.hackId },
					update: { $set: doc },
					upsert: true
				}
			}));

			const result = await this.models.Hacks.bulkWrite(bulkOps, { ordered: false });

			logger.info(`Upserted ${result.upsertedCount + result.modifiedCount} hacks for contest ${contestId}`);
			return hackDocs;
		} catch (error) {
			logger.error(`Error upserting hacks for contest ${contestId}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Store batched standings data in separate collection (optimized for new data)
	 * @private
	 * @param {number} contestId - Contest ID
	 * @param {Array} items - Array of standings items to store
	 * @param {boolean} isNewData - Whether this is new data (no existing batches to check)
	 * @returns {Promise<number>} Total number of items stored
	 */
	async upsertBatchedStandingsBulk(contestId, items, isNewData = false) {
		if (!items || items.length === 0) {
			return 0;
		}

		const BATCH_SIZE = 1000;
		
		// For new data, use fast bulk insert
		if (isNewData) {
			// Chunk items into batches of 1000
			const chunks = this.chunkArray(items, BATCH_SIZE);
			
			// Prepare bulk operations for standings collection
			const bulkOps = chunks.map((chunk, index) => ({
				updateOne: {
					filter: { contestId, batchIndex: index },
					update: {
						$set: {
							contestId,
							batchIndex: index,
							standings: chunk,
							lastFetchedAt: new Date(),
							updatedAt: new Date()
						},
						$setOnInsert: {
							createdAt: new Date()
						}
					},
					upsert: true
				}
			}));

			// Execute bulk write
			if (bulkOps.length > 0) {
				await this.models.BatchedStandingsData.bulkWrite(bulkOps, { ordered: false });
			}

			return items.length;
		}

		// For existing data, use smart batching (find existing batches with space)
		let remainingItems = [...items];
		while (remainingItems.length > 0) {
			// Find existing batches with space
			const existingBatches = await this.models.BatchedStandingsData.find({
				contestId,
				standingsCount: { $lt: BATCH_SIZE }
			}).sort({ batchIndex: 1 }).limit(10);

			let itemsToStore = remainingItems.slice(0, BATCH_SIZE);
			let foundBatch = false;

			if (existingBatches.length > 0) {
				const batch = existingBatches[0];
				const availableSpace = BATCH_SIZE - batch.standingsCount;
				
				if (availableSpace > 0) {
					const itemsToAdd = itemsToStore.slice(0, availableSpace);
					await this.models.BatchedStandingsData.findOneAndUpdate(
						{ contestId, batchIndex: batch.batchIndex },
						{
							$push: { standings: { $each: itemsToAdd } },
							$set: {
								lastFetchedAt: new Date(),
								updatedAt: new Date()
							}
						}
					);
					remainingItems = remainingItems.slice(availableSpace);
					if (remainingItems.length > 0) continue;
					else break;
				}
			}

			// Create new batch if no space found
			if (!foundBatch) {
				const maxBatch = await this.models.BatchedStandingsData.findOne(
					{ contestId },
					{ batchIndex: 1 }
				).sort({ batchIndex: -1 });

				const targetBatchIndex = maxBatch ? maxBatch.batchIndex + 1 : 0;

				await this.models.BatchedStandingsData.findOneAndUpdate(
					{ contestId, batchIndex: targetBatchIndex },
					{
						$set: {
							contestId,
							batchIndex: targetBatchIndex,
							standings: itemsToStore,
							lastFetchedAt: new Date(),
							updatedAt: new Date()
						},
						$setOnInsert: {
							createdAt: new Date()
						}
					},
					{ upsert: true }
				);

				remainingItems = remainingItems.slice(BATCH_SIZE);
			}
		}

		return items.length;
	}

	/**
	 * Store batched data using bulk operations (optimized for new data)
	 * @private
	 * @param {number} contestId - Contest ID
	 * @param {string} dataType - Type of data: 'submissions', 'ratingChanges', 'hacks'
	 * @param {Array} items - Array of items to store
	 * @param {boolean} isNewData - Whether this is new data (no existing batches to check)
	 * @returns {Promise<number>} Total number of items stored
	 */
	async upsertBatchedDataBulk(contestId, dataType, items, isNewData = false) {
		if (!items || items.length === 0) {
			return 0;
		}

		const BATCH_SIZE = 1000;
		
		// For new data, use fast bulk insert
		if (isNewData) {
			// Chunk items into batches of 1000
			const chunks = this.chunkArray(items, BATCH_SIZE);
			
			// Prepare bulk operations
			const bulkOps = chunks.map((chunk, index) => {
				const defaultArrays = {
					submissions: [],
					ratingChanges: [],
					hacks: []
				};
				defaultArrays[dataType] = chunk;

				return {
					updateOne: {
						filter: { contestId, batchIndex: index },
						update: {
							$set: {
								contestId,
								batchIndex: index,
								...defaultArrays,
								lastFetchedAt: new Date(),
								updatedAt: new Date()
							},
							$setOnInsert: {
								createdAt: new Date()
							}
						},
						upsert: true
					}
				};
			});

			// Execute bulk write
			if (bulkOps.length > 0) {
				await this.models.BatchedContestData.bulkWrite(bulkOps, { ordered: false });
			}

			return items.length;
		}

		// For existing data, use the smart batching logic
		return this.upsertBatchedData(contestId, dataType, items);
	}

	/**
	 * Store batched data with smart batching (fills existing batches when possible)
	 * Tries to combine different data types into the same document when space allows
	 * Note: Standings are stored in separate collection, not handled here
	 * @private
	 * @param {number} contestId - Contest ID
	 * @param {string} dataType - Type of data: 'submissions', 'ratingChanges', 'hacks'
	 * @param {Array} items - Array of items to store
	 * @returns {Promise<number>} Total number of items stored
	 */
	async upsertBatchedData(contestId, dataType, items) {
		if (!items || items.length === 0) {
			return 0;
		}

		const BATCH_SIZE = 1000;
		let remainingItems = [...items];

		// Process items in batches
		while (remainingItems.length > 0) {
			let itemsToStore = remainingItems.slice(0, BATCH_SIZE);
			let targetBatchIndex = null;
			let foundExistingBatch = false;

			// Step 1: Try to find existing batches with space for this specific data type
			const countField = `${dataType}Count`;
			const batchesWithSpace = await this.models.BatchedContestData.find({
				contestId,
				[countField]: { $lt: BATCH_SIZE }
			}).sort({ batchIndex: 1 }).limit(10);

			if (batchesWithSpace.length > 0) {
				const batch = batchesWithSpace[0];
				const currentArray = batch[dataType] || [];
				const currentCount = currentArray.length;
				const availableSpace = BATCH_SIZE - currentCount;
				
				if (availableSpace > 0) {
					// Fill existing batch with available space
					const itemsToAdd = itemsToStore.slice(0, availableSpace);
					await this.models.BatchedContestData.findOneAndUpdate(
						{ contestId, batchIndex: batch.batchIndex },
						{
							$push: { [dataType]: { $each: itemsToAdd } },
							$set: {
								lastFetchedAt: new Date(),
								updatedAt: new Date()
							}
						}
					);
					remainingItems = remainingItems.slice(availableSpace);
					if (remainingItems.length > 0) continue;
					else break;
				}
			}

			// Step 2: If no space in existing batches for this type, try to find ANY batch 
			// that doesn't have this data type yet (to combine data types in same document)
			const allBatches = await this.models.BatchedContestData.find({
				contestId
			}).sort({ batchIndex: 1 }).limit(20);

			for (const batch of allBatches) {
				const currentArray = batch[dataType] || [];
				const currentCount = currentArray.length;
				
				// If this batch doesn't have this data type yet (or has space), use it
				if (currentCount === 0 || currentCount < BATCH_SIZE) {
					const availableSpace = BATCH_SIZE - currentCount;
					if (availableSpace > 0) {
						targetBatchIndex = batch.batchIndex;
						foundExistingBatch = true;
						
						const itemsToAdd = itemsToStore.slice(0, availableSpace);
						await this.models.BatchedContestData.findOneAndUpdate(
							{ contestId, batchIndex: batch.batchIndex },
							{
								$push: { [dataType]: { $each: itemsToAdd } },
								$set: {
									lastFetchedAt: new Date(),
									updatedAt: new Date()
								}
							}
						);
						remainingItems = remainingItems.slice(availableSpace);
						if (remainingItems.length > 0) continue;
						else break;
					}
				}
			}

			// Step 3: If no suitable existing batch found, create a new one
			if (!foundExistingBatch) {
				// Find the next available batchIndex
				const maxBatch = await this.models.BatchedContestData.findOne(
					{ contestId },
					{ batchIndex: 1 }
				).sort({ batchIndex: -1 });

				targetBatchIndex = maxBatch ? maxBatch.batchIndex + 1 : 0;

			// Initialize default arrays for new document
			const defaultArrays = {
				submissions: [],
				ratingChanges: [],
				hacks: []
			};
			defaultArrays[dataType] = itemsToStore;

				// Create new batch
				await this.models.BatchedContestData.findOneAndUpdate(
					{ contestId, batchIndex: targetBatchIndex },
					{
						$set: {
							contestId,
							batchIndex: targetBatchIndex,
							...defaultArrays,
							lastFetchedAt: new Date(),
							updatedAt: new Date()
						},
						$setOnInsert: {
							createdAt: new Date()
						}
					},
					{ upsert: true }
				);

				remainingItems = remainingItems.slice(BATCH_SIZE);
			}
		}

		return items.length;
	}

	/**
	 * Store batched standings data (1000 records per document)
	 * @param {Object} standingsData - Complete standings data from API
	 * @param {boolean} isUnofficial - Whether unofficial participants included
	 * @returns {Promise<number>} Total number of standings stored
	 */
	async upsertBatchedStandings(standingsData, isUnofficial = false) {
		try {
			const { contest, problems, rows } = standingsData;
			const contestId = contest.id;

			// First, ensure contest and problems are stored
			await this.upsertContest(contest);
			for (const problem of problems) {
				await this.upsertProblem(problem, contestId);
			}

			// Prepare standings items
			const standingsItems = rows.map(row => {
				const primaryHandle = row.party.members[0]?.handle || '';
				const participantKey = this.generateParticipantKey(
					contestId,
					primaryHandle,
					row.party.teamId
				);

				return {
					participantKey,
					contestName: contest.name,
					contestPhase: contest.phase,
					handle: primaryHandle,
					handles: row.party.members.map(m => m.handle),
					teamId: row.party.teamId,
					teamName: row.party.teamName,
					participantType: row.party.participantType,
					ghost: row.party.ghost || false,
					room: row.party.room,
					startTimeSeconds: row.party.startTimeSeconds,
					rank: row.rank,
					points: row.points,
					penalty: row.penalty,
					successfulHackCount: row.successfulHackCount || 0,
					unsuccessfulHackCount: row.unsuccessfulHackCount || 0,
					lastSubmissionTimeSeconds: row.lastSubmissionTimeSeconds,
					problemResults: row.problemResults || [],
					isUnofficial: isUnofficial || row.party.participantType !== 'CONTESTANT',
					lastFetchedAt: new Date()
				};
			});

			const count = await this.upsertBatchedData(contestId, 'standings', standingsItems);
			logger.info(`Upserted ${count} standings for contest ${contestId}`);
			return count;
		} catch (error) {
			logger.error(`Error upserting batched standings for contest ${standingsData.contest.id}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Store batched submissions data (1000 records per document)
	 * @param {Array} submissionsData - Array of submission data from API
	 * @param {number} contestId - Contest ID
	 * @returns {Promise<number>} Total number of submissions stored
	 */
	async upsertBatchedSubmissions(submissionsData, contestId) {
		try {
			// Prepare submission items
			const submissionItems = submissionsData.map(sub => {
				const primaryHandle = sub.author.members[0]?.handle || '';

				return {
					submissionId: sub.id,
					problemIndex: sub.problem.index,
					problemName: sub.problem.name,
					problemPoints: sub.problem.points,
					handle: primaryHandle,
					handles: sub.author.members.map(m => m.handle),
					participantType: sub.author.participantType,
					creationTimeSeconds: sub.creationTimeSeconds,
					relativeTimeSeconds: sub.relativeTimeSeconds,
					programmingLanguage: sub.programmingLanguage,
					verdict: sub.verdict,
					testset: sub.testset,
					passedTestCount: sub.passedTestCount || 0,
					timeConsumedMillis: sub.timeConsumedMillis,
					memoryConsumedBytes: sub.memoryConsumedBytes,
					lastFetchedAt: new Date()
				};
			});

			const count = await this.upsertBatchedData(contestId, 'submissions', submissionItems);
			logger.info(`Upserted ${count} submissions for contest ${contestId}`);
			return count;
		} catch (error) {
			logger.error(`Error upserting batched submissions for contest ${contestId}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Store batched rating changes data (1000 records per document)
	 * @param {Array} ratingChangesData - Array of rating change data from API
	 * @param {number} contestId - Contest ID
	 * @returns {Promise<number>} Total number of rating changes stored
	 */
	async upsertBatchedRatingChanges(ratingChangesData, contestId) {
		try {
			if (!ratingChangesData || ratingChangesData.length === 0) {
				logger.debug(`No rating changes for contest ${contestId}`);
				return 0;
			}

			// Prepare rating change items
			const ratingChangeItems = ratingChangesData.map(rc => ({
				handle: rc.handle,
				contestName: rc.contestName,
				rank: rc.rank,
				ratingUpdateTimeSeconds: rc.ratingUpdateTimeSeconds,
				oldRating: rc.oldRating,
				newRating: rc.newRating,
				ratingChange: rc.newRating - rc.oldRating,
				lastFetchedAt: new Date()
			}));

			const count = await this.upsertBatchedData(contestId, 'ratingChanges', ratingChangeItems);
			logger.info(`Upserted ${count} rating changes for contest ${contestId}`);
			return count;
		} catch (error) {
			logger.error(`Error upserting batched rating changes for contest ${contestId}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Store batched hacks data (1000 records per document)
	 * @param {Array} hacksData - Array of hack data from API
	 * @param {number} contestId - Contest ID
	 * @returns {Promise<number>} Total number of hacks stored
	 */
	async upsertBatchedHacks(hacksData, contestId) {
		try {
			if (!hacksData || hacksData.length === 0) {
				logger.debug(`No hacks for contest ${contestId}`);
				return 0;
			}

			// Prepare hack items
			const hackItems = hacksData.map(hack => {
				const hackerHandle = hack.hacker.members[0]?.handle || '';
				const defenderHandle = hack.defender.members[0]?.handle || '';

				return {
					hackId: hack.id,
					problemIndex: hack.problem.index,
					problemName: hack.problem.name,
					hackerHandle,
					hackerHandles: hack.hacker.members.map(m => m.handle),
					hackerParticipantType: hack.hacker.participantType,
					defenderHandle,
					defenderHandles: hack.defender.members.map(m => m.handle),
					defenderParticipantType: hack.defender.participantType,
					creationTimeSeconds: hack.creationTimeSeconds,
					verdict: hack.verdict,
					test: hack.test,
					judgeProtocol: hack.judgeProtocol,
					lastFetchedAt: new Date()
				};
			});

			const count = await this.upsertBatchedData(contestId, 'hacks', hackItems);
			logger.info(`Upserted ${count} hacks for contest ${contestId}`);
			return count;
		} catch (error) {
			logger.error(`Error upserting batched hacks for contest ${contestId}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Store complete contest data using batched storage (all data types)
	 * Optimized for new data with bulk operations
	 * @param {number} contestId - Contest ID
	 * @param {boolean} showUnofficial - Whether to include unofficial participants
	 * @returns {Promise<Object>} Stored data summary
	 */
	async storeCompleteContestData(contestId, showUnofficial = false) {
		const startTime = Date.now();
		try {
			logger.info(`Starting to store complete contest data for contest ${contestId}`);

			// Fetch all data from API
			const fetchStartTime = Date.now();
			const completeData = await codeforcesAPI.getCompleteContestData(contestId, showUnofficial);
			const fetchTime = Date.now() - fetchStartTime;
			logger.info(`Fetched all data for contest ${contestId} in ${fetchTime}ms`);

			// Check if data already exists (for optimization)
			// Check both collections for existing data
			const [existingContestBatches, existingStandingsBatches] = await Promise.all([
				this.models.BatchedContestData.countDocuments({ contestId }),
				this.models.BatchedStandingsData.countDocuments({ contestId })
			]);
			const isNewData = existingContestBatches === 0 && existingStandingsBatches === 0;

			if (isNewData) {
				logger.info(`Contest ${contestId} is new - using optimized bulk insert`);
			} else {
				logger.info(`Contest ${contestId} has existing data - using smart batching`);
			}

			// Prepare all data first
			const prepareStartTime = Date.now();
			
			// Prepare standings
			const contest = completeData.contest;
			const problems = completeData.problems;
			const rows = completeData.standings || [];
			const standingsItems = rows.map(row => {
				const primaryHandle = row.party.members[0]?.handle || '';
				const participantKey = this.generateParticipantKey(
					contestId,
					primaryHandle,
					row.party.teamId
				);

				return {
					participantKey,
					contestName: contest.name,
					contestPhase: contest.phase,
					handle: primaryHandle,
					handles: row.party.members.map(m => m.handle),
					teamId: row.party.teamId,
					teamName: row.party.teamName,
					participantType: row.party.participantType,
					ghost: row.party.ghost || false,
					room: row.party.room,
					startTimeSeconds: row.party.startTimeSeconds,
					rank: row.rank,
					points: row.points,
					penalty: row.penalty,
					successfulHackCount: row.successfulHackCount || 0,
					unsuccessfulHackCount: row.unsuccessfulHackCount || 0,
					lastSubmissionTimeSeconds: row.lastSubmissionTimeSeconds,
					problemResults: row.problemResults || [],
					isUnofficial: showUnofficial || row.party.participantType !== 'CONTESTANT',
					lastFetchedAt: new Date()
				};
			});

			// Prepare submissions
			const submissionItems = (completeData.submissions || []).map(sub => {
				const primaryHandle = sub.author.members[0]?.handle || '';
				return {
					submissionId: sub.id,
					problemIndex: sub.problem.index,
					problemName: sub.problem.name,
					problemPoints: sub.problem.points,
					handle: primaryHandle,
					handles: sub.author.members.map(m => m.handle),
					participantType: sub.author.participantType,
					creationTimeSeconds: sub.creationTimeSeconds,
					relativeTimeSeconds: sub.relativeTimeSeconds,
					programmingLanguage: sub.programmingLanguage,
					verdict: sub.verdict,
					testset: sub.testset,
					passedTestCount: sub.passedTestCount || 0,
					timeConsumedMillis: sub.timeConsumedMillis,
					memoryConsumedBytes: sub.memoryConsumedBytes,
					lastFetchedAt: new Date()
				};
			});

			// Prepare rating changes
			const ratingChangeItems = (completeData.ratingChanges || []).map(rc => ({
				handle: rc.handle,
				contestName: rc.contestName,
				rank: rc.rank,
				ratingUpdateTimeSeconds: rc.ratingUpdateTimeSeconds,
				oldRating: rc.oldRating,
				newRating: rc.newRating,
				ratingChange: rc.newRating - rc.oldRating,
				lastFetchedAt: new Date()
			}));

			// Prepare hacks
			const hackItems = (completeData.hacks || []).map(hack => {
				const hackerHandle = hack.hacker.members[0]?.handle || '';
				const defenderHandle = hack.defender.members[0]?.handle || '';
				return {
					hackId: hack.id,
					problemIndex: hack.problem.index,
					problemName: hack.problem.name,
					hackerHandle,
					hackerHandles: hack.hacker.members.map(m => m.handle),
					hackerParticipantType: hack.hacker.participantType,
					defenderHandle,
					defenderHandles: hack.defender.members.map(m => m.handle),
					defenderParticipantType: hack.defender.participantType,
					creationTimeSeconds: hack.creationTimeSeconds,
					verdict: hack.verdict,
					test: hack.test,
					judgeProtocol: hack.judgeProtocol,
					lastFetchedAt: new Date()
				};
			});

			const prepareTime = Date.now() - prepareStartTime;
			logger.info(`Prepared all data for contest ${contestId} in ${prepareTime}ms`);

			// Store contest and problems first
			const storeStartTime = Date.now();
			await this.upsertContest(contest);
			for (const problem of problems) {
				await this.upsertProblem(problem, contestId);
			}

			// Store all data types using optimized bulk operations
			// Standings are stored in separate BatchedStandingsData collection
			const [standingsCount, submissionsCount, ratingChangesCount, hacksCount] = await Promise.all([
				this.upsertBatchedStandingsBulk(contestId, standingsItems, isNewData),
				this.upsertBatchedDataBulk(contestId, 'submissions', submissionItems, isNewData),
				this.upsertBatchedDataBulk(contestId, 'ratingChanges', ratingChangeItems, isNewData),
				this.upsertBatchedDataBulk(contestId, 'hacks', hackItems, isNewData)
			]);

			const storeTime = Date.now() - storeStartTime;
			const totalTime = Date.now() - startTime;

			const summary = {
				contestId,
				contest: completeData.contest,
				problemsCount: completeData.problems.length,
				standingsCount,
				submissionsCount,
				ratingChangesCount,
				hacksCount,
				performance: {
					fetchTime: `${fetchTime}ms`,
					prepareTime: `${prepareTime}ms`,
					storeTime: `${storeTime}ms`,
					totalTime: `${totalTime}ms`,
					isNewData
				},
				storedAt: new Date()
			};

			logger.info(`Successfully stored complete contest data for contest ${contestId}`, summary);
			return summary;
		} catch (error) {
			const totalTime = Date.now() - startTime;
			logger.error(`Error storing complete contest data for contest ${contestId} (took ${totalTime}ms): ${error.message}`);
			throw error;
		}
	}

	/**
	 * Get all batched data for a contest
	 * @param {number} contestId - Contest ID
	 * @returns {Promise<Object>} All batched data for the contest
	 */
	async getBatchedContestData(contestId) {
		try {
			const [contestBatches, standingsBatches] = await Promise.all([
				this.models.BatchedContestData.find({ contestId }).sort({ batchIndex: 1 }),
				this.models.BatchedStandingsData.find({ contestId }).sort({ batchIndex: 1 })
			]);

			// Flatten arrays from all batches
			const result = {
				contestId,
				standings: [],
				submissions: [],
				ratingChanges: [],
				hacks: []
			};

			// Get standings from separate BatchedStandingsData collection
			standingsBatches.forEach(batch => {
				if (batch.standings && batch.standings.length > 0) {
					result.standings.push(...batch.standings);
				}
			});

			// Get other data from BatchedContestData collection
			contestBatches.forEach(batch => {
				if (batch.submissions && batch.submissions.length > 0) {
					result.submissions.push(...batch.submissions);
				}
				if (batch.ratingChanges && batch.ratingChanges.length > 0) {
					result.ratingChanges.push(...batch.ratingChanges);
				}
				if (batch.hacks && batch.hacks.length > 0) {
					result.hacks.push(...batch.hacks);
				}
			});

			return result;
		} catch (error) {
			logger.error(`Error getting batched contest data for contest ${contestId}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Get standings for a contest from batched data (separate collection)
	 * @param {number} contestId - Contest ID
	 * @param {Object} options - Query options (limit, skip, sort, isUnofficial)
	 * @returns {Promise<Object>} Object with standings array and total count
	 */
	async getBatchedStandings(contestId, options = {}) {
		try {
			// Get all batches from BatchedStandingsData collection
			const batches = await this.models.BatchedStandingsData.find({ contestId })
				.sort({ batchIndex: 1 })
				.select('standings');

			// Flatten standings from all batches
			let standings = [];
			batches.forEach(batch => {
				if (batch.standings && batch.standings.length > 0) {
					standings.push(...batch.standings);
				}
			});

			// Apply filters
			if (options.isUnofficial !== undefined) {
				standings = standings.filter(s => s.isUnofficial === options.isUnofficial);
			}

			const total = standings.length;

			// Apply sorting if specified
			if (options.sort) {
				const [field, order] = Object.entries(options.sort)[0];
				standings.sort((a, b) => {
					const aVal = a[field];
					const bVal = b[field];
					if (order === -1) return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
					return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
				});
			} else {
				// Default sort by rank
				standings.sort((a, b) => a.rank - b.rank);
			}

			// Apply pagination
			if (options.skip) standings = standings.slice(options.skip);
			if (options.limit) standings = standings.slice(0, options.limit);

			return { standings, total };
		} catch (error) {
			logger.error(`Error getting batched standings for contest ${contestId}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Get submissions for a contest from batched data
	 * @param {number} contestId - Contest ID
	 * @param {Object} options - Query options (limit, skip, sort, handle, problemIndex, verdict)
	 * @returns {Promise<Object>} Object with submissions array and total count
	 */
	async getBatchedSubmissions(contestId, options = {}) {
		try {
			const batches = await this.models.BatchedContestData.find({ contestId })
				.sort({ batchIndex: 1 })
				.select('submissions');

			let submissions = [];
			batches.forEach(batch => {
				if (batch.submissions && batch.submissions.length > 0) {
					submissions.push(...batch.submissions);
				}
			});

			// Apply filters
			if (options.handle) {
				submissions = submissions.filter(s => s.handle === options.handle);
			}
			if (options.problemIndex) {
				submissions = submissions.filter(s => s.problemIndex === options.problemIndex);
			}
			if (options.verdict) {
				submissions = submissions.filter(s => s.verdict === options.verdict);
			}

			const total = submissions.length;

			// Apply sorting if specified
			if (options.sort) {
				const [field, order] = Object.entries(options.sort)[0];
				submissions.sort((a, b) => {
					const aVal = a[field];
					const bVal = b[field];
					if (order === -1) return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
					return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
				});
			} else {
				// Default sort by creationTimeSeconds descending
				submissions.sort((a, b) => b.creationTimeSeconds - a.creationTimeSeconds);
			}

			// Apply pagination
			if (options.skip) submissions = submissions.slice(options.skip);
			if (options.limit) submissions = submissions.slice(0, options.limit);

			return { submissions, total };
		} catch (error) {
			logger.error(`Error getting batched submissions for contest ${contestId}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Store contest list
	 * @param {boolean} includeGym - Whether to include gym contests
	 * @returns {Promise<Object>} Storage summary
	 */
	async storeContestList(includeGym = false) {
		try {
			logger.info(`Fetching and storing contest list (includeGym: ${includeGym})`);

			const contests = await codeforcesAPI.getContestList(includeGym);

			const bulkOps = contests.map(contest => ({
				updateOne: {
					filter: { contestId: contest.id },
					update: {
						$set: {
							contestId: contest.id,
							name: contest.name,
							type: contest.type,
							phase: contest.phase,
							frozen: contest.frozen || false,
							durationSeconds: contest.durationSeconds,
							startTimeSeconds: contest.startTimeSeconds,
							relativeTimeSeconds: contest.relativeTimeSeconds,
							preparedBy: contest.preparedBy,
							websiteUrl: contest.websiteUrl,
							description: contest.description,
							difficulty: contest.difficulty,
							kind: contest.kind,
							icpcRegion: contest.icpcRegion,
							country: contest.country,
							city: contest.city,
							season: contest.season,
							isGym: contest.type === 'GYM' || false,
							lastFetchedAt: new Date(),
							updatedAt: new Date()
						},
						$setOnInsert: {
							createdAt: new Date(),
							dataVersion: 1
						}
					},
					upsert: true
				}
			}));

			const result = await this.models.Contests.bulkWrite(bulkOps, { ordered: false });

			const summary = {
				totalContests: contests.length,
				inserted: result.insertedCount,
				updated: result.modifiedCount,
				storedAt: new Date()
			};

			logger.info(`Successfully stored contest list`, summary);
			return summary;
		} catch (error) {
			logger.error(`Error storing contest list: ${error.message}`);
			throw error;
		}
	}
}

export { CodeforcesDataService };

