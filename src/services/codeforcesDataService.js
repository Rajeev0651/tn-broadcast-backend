import { models } from '../data/models/index.js';
import { logger } from '../helpers/logger.js';

/**
 * MongoDB Data Service for Codeforces Contest Data
 * Retrieves stored contest data from MongoDB collections
 */
class CodeforcesDataService {
	/**
	 * Get contest information from MongoDB
	 * Contest info is embedded in standings data, so we extract it from the first standings batch
	 * @param {number} contestId - Contest ID
	 * @returns {Promise<object|null>} Contest info or null if not found
	 */
	async getContestFromDB(contestId) {
		try {
			// Get first standings batch to extract contest info
			// Use projection to only fetch needed fields (optimized query)
			const firstBatch = await models.BatchedStandingsData.findOne({ contestId })
				.sort({ batchIndex: 1 })
				.limit(1)
				.select('standings.contestName standings.contestPhase standings.startTimeSeconds')
				.lean();

			if (!firstBatch || !firstBatch.standings || firstBatch.standings.length === 0) {
				return null;
			}

			// Extract contest info from first standings entry
			const firstStanding = firstBatch.standings[0];
			return {
				id: contestId,
				name: firstStanding.contestName || `Contest ${contestId}`,
				type: 'CF', // Default, could be extracted if stored
				phase: firstStanding.contestPhase || 'FINISHED',
				frozen: false,
				durationSeconds: 0, // Not stored in standings
				startTimeSeconds: firstStanding.startTimeSeconds || null,
				relativeTimeSeconds: null,
				preparedBy: null,
				websiteUrl: null,
				description: null,
				difficulty: null,
				kind: null,
				icpcRegion: null,
				country: null,
				city: null,
				season: null
			};
		} catch (error) {
			logger.error(`Error fetching contest ${contestId} from DB: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Get contest list from MongoDB
	 * @param {boolean} includeGym - Include gym contests
	 * @returns {Promise<Array>} List of contests
	 */
	async getContestListFromDB(includeGym = false) {
		try {
			// Get unique contest IDs from standings
			const distinctContests = await models.BatchedStandingsData.distinct('contestId');
			
			const contests = [];
			for (const contestId of distinctContests) {
				const contest = await this.getContestFromDB(contestId);
				if (contest) {
					contests.push(contest);
				}
			}

			// Sort by contest ID descending (newest first)
			return contests.sort((a, b) => b.id - a.id);
		} catch (error) {
			logger.error(`Error fetching contest list from DB: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Get problems for a contest from MongoDB
	 * @param {number} contestId - Contest ID
	 * @returns {Promise<Array>} List of problems
	 */
	async getProblemsFromDB(contestId) {
		try {
			// Use projection to only fetch needed fields (covered query optimization)
			// Uses compound index: { contestId: 1, index: 1 }
			const problems = await models.Problems.find({ contestId })
				.select('contestId index name type points rating tags')
				.sort({ index: 1 })
				.lean();

			return problems.map(p => ({
				contestId: p.contestId,
				index: p.index,
				name: p.name,
				type: p.type || 'PROGRAMMING',
				points: p.points || null,
				rating: p.rating || null,
				tags: p.tags || []
			}));
		} catch (error) {
			logger.error(`Error fetching problems for contest ${contestId} from DB: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Get standings from MongoDB
	 * @param {number} contestId - Contest ID
	 * @param {number} from - Starting rank (1-indexed)
	 * @param {number} count - Number of participants to fetch
	 * @param {boolean} showUnofficial - Include unofficial participants
	 * @returns {Promise<object>} Standings data
	 */
	async getStandingsFromDB(contestId, from = 1, count = null, showUnofficial = false) {
		try {
			// Optimization: Each batch stores exactly 1000 standings
			// Batch 0: ranks 1-1000, Batch 1: ranks 1001-2000, etc.
			// Calculate which batches we need to fetch
			const BATCH_SIZE = 1000;
			const startRank = from;
			const endRank = count !== null ? from + count - 1 : null;
			
			// Calculate batch indices (0-indexed)
			const startBatchIndex = Math.floor((startRank - 1) / BATCH_SIZE);
			const endBatchIndex = endRank !== null ? Math.floor((endRank - 1) / BATCH_SIZE) : null;
			
			// Build query to fetch only needed batches
			// If filtering unofficial, we might need extra batches to account for filtered items
			// For safety, fetch one extra batch when filtering unofficial
			const batchQuery = { contestId };
			if (endBatchIndex !== null) {
				const maxBatchIndex = showUnofficial ? endBatchIndex : endBatchIndex + 1;
				batchQuery.batchIndex = { $gte: startBatchIndex, $lte: maxBatchIndex };
			} else {
				// No count limit - fetch from startBatchIndex onwards
				batchQuery.batchIndex = { $gte: startBatchIndex };
			}

			// Fetch only the batches we need (optimized query)
			// Uses compound index: { contestId: 1, batchIndex: 1 }
			// Note: Batches are stored in sorted order (batch0 to batch N)
			// and standings within each batch are pre-sorted by rank
			const batches = await models.BatchedStandingsData.find(batchQuery)
				.select('standings batchIndex')
				.sort({ batchIndex: 1 })
				.lean();

			if (batches.length === 0) {
				return {
					contest: await this.getContestFromDB(contestId),
					problems: await this.getProblemsFromDB(contestId),
					rows: []
				};
			}

			// Aggregate standings from fetched batches
			// Data is already sorted: batches by batchIndex, standings by rank within each batch
			let allStandings = [];
			for (const batch of batches) {
				if (batch.standings && batch.standings.length > 0) {
					allStandings.push(...batch.standings);
				}
			}

			// Filter unofficial if needed
			// Note: After filtering, we maintain sorted order since we filter in-place
			if (!showUnofficial) {
				allStandings = allStandings.filter(s => !s.isUnofficial);
			}

			// No need to sort - data is already sorted by rank across all batches
			// Batches are sorted by batchIndex, and standings within each batch are sorted by rank

			// Apply pagination
			// Calculate offset: account for the starting rank of the first fetched batch
			// First batch starts at rank: startBatchIndex * BATCH_SIZE + 1
			const firstRankInFetchedBatches = startBatchIndex * BATCH_SIZE + 1;
			const startIndex = from - firstRankInFetchedBatches; // Offset within fetched data
			const endIndex = count !== null ? startIndex + count : undefined;
			const paginatedStandings = allStandings.slice(startIndex, endIndex);

			// Transform to GraphQL format
			const rows = paginatedStandings.map(standing => ({
				party: {
					contestId: contestId,
					members: (standing.handles || [standing.handle]).map(handle => ({
						handle: handle,
						name: null
					})),
					participantType: standing.participantType || 'CONTESTANT',
					ghost: standing.ghost || false,
					room: standing.room || null,
					startTimeSeconds: standing.startTimeSeconds || null
				},
				rank: standing.rank,
				points: standing.points || 0,
				penalty: standing.penalty || 0,
				successfulHackCount: standing.successfulHackCount || 0,
				unsuccessfulHackCount: standing.unsuccessfulHackCount || 0,
				problemResults: (standing.problemResults || []).map(pr => ({
					points: pr.points || 0,
					rejectedAttemptCount: pr.rejectedAttemptCount || 0,
					type: pr.type || 'FINAL',
					bestSubmissionTimeSeconds: pr.bestSubmissionTimeSeconds || null
				}))
			}));

			return {
				contest: await this.getContestFromDB(contestId),
				problems: await this.getProblemsFromDB(contestId),
				rows
			};
		} catch (error) {
			logger.error(`Error fetching standings for contest ${contestId} from DB: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Get submissions from MongoDB
	 * @param {number} contestId - Contest ID
	 * @param {number} count - Number of submissions to fetch
	 * @param {string|null} handle - Optional user handle to filter
	 * @returns {Promise<Array>} List of submissions
	 */
	async getSubmissionsFromDB(contestId, count = null, handle = null) {
		try {
			// Get all batches for this contest
			// Use projection to only fetch submissions array (optimized query)
			// Uses compound index: { contestId: 1, batchIndex: 1 }
			const batches = await models.BatchedContestData.find({ contestId })
				.select('submissions')
				.sort({ batchIndex: 1 })
				.lean();

			if (batches.length === 0) {
				return [];
			}

			// Aggregate all submissions from all batches
			let allSubmissions = [];
			for (const batch of batches) {
				if (batch.submissions && batch.submissions.length > 0) {
					allSubmissions.push(...batch.submissions);
				}
			}

			// Filter by handle if provided
			if (handle) {
				allSubmissions = allSubmissions.filter(s => 
					s.handle === handle || (s.handles && s.handles.includes(handle))
				);
			}

			// Sort by creation time (newest first)
			allSubmissions.sort((a, b) => b.creationTimeSeconds - a.creationTimeSeconds);

			// Apply count limit
			if (count !== null && count > 0) {
				allSubmissions = allSubmissions.slice(0, count);
			}

			// Transform to GraphQL format
			return allSubmissions.map(sub => ({
				id: sub.submissionId,
				contestId: contestId,
				creationTimeSeconds: sub.creationTimeSeconds,
				relativeTimeSeconds: sub.relativeTimeSeconds || 0,
				problem: {
					contestId: contestId,
					index: sub.problemIndex || '',
					name: sub.problemName || '',
					type: 'PROGRAMMING',
					points: sub.problemPoints || null,
					rating: null,
					tags: []
				},
				author: {
					contestId: contestId,
					members: (sub.handles || [sub.handle]).map(h => ({
						handle: h,
						name: null
					})),
					participantType: sub.participantType || 'CONTESTANT',
					ghost: false,
					room: null,
					startTimeSeconds: null
				},
				programmingLanguage: sub.programmingLanguage || '',
				verdict: sub.verdict || null,
				testset: sub.testset || 'TESTS',
				passedTestCount: sub.passedTestCount || 0,
				timeConsumedMillis: sub.timeConsumedMillis || 0,
				memoryConsumedBytes: sub.memoryConsumedBytes || 0
			}));
		} catch (error) {
			logger.error(`Error fetching submissions for contest ${contestId} from DB: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Store complete contest data in MongoDB using batched storage
	 * @param {number} contestId - Contest ID
	 * @param {Object} contestData - Complete contest data from API
	 * @returns {Promise<void>}
	 */
	async storeCompleteContestData(contestId, contestData) {
		try {
			const BATCH_SIZE = 1000;
			const now = new Date();

			// 1. Store Problems
			if (contestData.problems && contestData.problems.length > 0) {
				const problemOps = contestData.problems.map(problem => ({
					updateOne: {
						filter: { problemId: `${contestId}:${problem.index}` },
						update: {
							$set: {
								problemId: `${contestId}:${problem.index}`,
								contestId: contestId,
								index: problem.index,
								name: problem.name || '',
								type: problem.type || 'PROGRAMMING',
								points: problem.points || null,
								rating: problem.rating || null,
								tags: problem.tags || [],
								lastSeenAt: now,
								updatedAt: now
							},
							$setOnInsert: {
								createdAt: now
							}
						},
						upsert: true
					}
				}));

				await models.Problems.bulkWrite(problemOps, { ordered: false });
				logger.info(`Stored ${contestData.problems.length} problems for contest ${contestId}`);
			}

			// 2. Store Standings in BatchedStandingsData (1000 per batch)
			if (contestData.standings && contestData.standings.length > 0) {
				// Transform standings to batched format
				const standingsBatches = [];
				for (let i = 0; i < contestData.standings.length; i += BATCH_SIZE) {
					const batch = contestData.standings.slice(i, i + BATCH_SIZE);
					const batchIndex = Math.floor(i / BATCH_SIZE);

					const transformedStandings = batch.map(row => {
						const members = row.party?.members || [];
						const primaryHandle = members[0]?.handle || '';
						const handles = members.map(m => m.handle);

						return {
							participantKey: `${contestId}:${primaryHandle}`,
							contestName: contestData.contest?.name || '',
							contestPhase: contestData.contest?.phase || '',
							handle: primaryHandle,
							handles: handles,
							teamId: null,
							teamName: null,
							participantType: row.party?.participantType || 'CONTESTANT',
							ghost: row.party?.ghost || false,
							room: row.party?.room || null,
							startTimeSeconds: row.party?.startTimeSeconds || null,
							rank: row.rank || 0,
							points: row.points || 0,
							penalty: row.penalty || 0,
							successfulHackCount: row.successfulHackCount || 0,
							unsuccessfulHackCount: row.unsuccessfulHackCount || 0,
							lastSubmissionTimeSeconds: null,
							problemResults: (row.problemResults || []).map(pr => ({
								problemIndex: null, // Will be set from problem index
								points: pr.points || 0,
								penalty: 0,
								rejectedAttemptCount: pr.rejectedAttemptCount || 0,
								type: pr.type || 'FINAL',
								bestSubmissionTimeSeconds: pr.bestSubmissionTimeSeconds || null
							})),
							isUnofficial: row.party?.participantType !== 'CONTESTANT',
							lastFetchedAt: now
						};
					});

					standingsBatches.push({
						contestId,
						batchIndex,
						standings: transformedStandings,
						lastFetchedAt: now
					});
				}

				// Bulk upsert standings batches
				const standingsOps = standingsBatches.map(batch => ({
					updateOne: {
						filter: { contestId: batch.contestId, batchIndex: batch.batchIndex },
						update: {
							$set: {
								contestId: batch.contestId,
								batchIndex: batch.batchIndex,
								standings: batch.standings,
								lastFetchedAt: batch.lastFetchedAt,
								updatedAt: now
							},
							$setOnInsert: {
								createdAt: now
							}
						},
						upsert: true
					}
				}));

				await models.BatchedStandingsData.bulkWrite(standingsOps, { ordered: false });
				logger.info(`Stored ${contestData.standings.length} standings in ${standingsBatches.length} batches for contest ${contestId}`);
			}

			// 3. Store Submissions, RatingChanges, Hacks in BatchedContestData (1000 per batch)
			const contestDataBatches = [];

			// Process submissions
			if (contestData.submissions && contestData.submissions.length > 0) {
				for (let i = 0; i < contestData.submissions.length; i += BATCH_SIZE) {
					const batch = contestData.submissions.slice(i, i + BATCH_SIZE);
					const batchIndex = Math.floor(i / BATCH_SIZE);

					const transformedSubmissions = batch.map(sub => {
						const members = sub.author?.members || [];
						const primaryHandle = members[0]?.handle || '';
						const handles = members.map(m => m.handle);

						return {
							submissionId: sub.id,
							problemIndex: sub.problem?.index || '',
							problemName: sub.problem?.name || '',
							problemPoints: sub.problem?.points || null,
							handle: primaryHandle,
							handles: handles,
							participantType: sub.author?.participantType || 'CONTESTANT',
							creationTimeSeconds: sub.creationTimeSeconds || 0,
							relativeTimeSeconds: sub.relativeTimeSeconds || 0,
							programmingLanguage: sub.programmingLanguage || '',
							verdict: sub.verdict || null,
							testset: sub.testset || 'TESTS',
							passedTestCount: sub.passedTestCount || 0,
							timeConsumedMillis: sub.timeConsumedMillis || 0,
							memoryConsumedBytes: sub.memoryConsumedBytes || 0,
							lastFetchedAt: now
						};
					});

					contestDataBatches.push({
						contestId,
						batchIndex,
						submissions: transformedSubmissions,
						ratingChanges: [],
						hacks: [],
						lastFetchedAt: now
					});
				}
			}

			// Process rating changes
			if (contestData.ratingChanges && contestData.ratingChanges.length > 0) {
				logger.debug(`Processing ${contestData.ratingChanges.length} rating changes for contest ${contestId}`);
				for (let i = 0; i < contestData.ratingChanges.length; i += BATCH_SIZE) {
					const batch = contestData.ratingChanges.slice(i, i + BATCH_SIZE);
					const batchIndex = Math.floor(i / BATCH_SIZE);

					const transformedRatingChanges = batch.map(rc => ({
						handle: rc.handle || '',
						contestName: contestData.contest?.name || '',
						rank: rc.rank || 0,
						ratingUpdateTimeSeconds: rc.ratingUpdateTimeSeconds || 0,
						oldRating: rc.oldRating || 0,
						newRating: rc.newRating || 0,
						ratingChange: (rc.newRating || 0) - (rc.oldRating || 0),
						lastFetchedAt: now
					}));

					// Find or create batch for this index
					let batchDoc = contestDataBatches.find(b => b.batchIndex === batchIndex);
					if (!batchDoc) {
						batchDoc = {
							contestId,
							batchIndex,
							submissions: [],
							ratingChanges: transformedRatingChanges,
							hacks: [],
							lastFetchedAt: now
						};
						contestDataBatches.push(batchDoc);
						logger.debug(`Created new batch ${batchIndex} for rating changes (${transformedRatingChanges.length} items)`);
					} else {
						batchDoc.ratingChanges = transformedRatingChanges;
						logger.debug(`Updated batch ${batchIndex} with rating changes (${transformedRatingChanges.length} items)`);
					}
				}
			}

			// Process hacks
			if (contestData.hacks && contestData.hacks.length > 0) {
				logger.debug(`Processing ${contestData.hacks.length} hacks for contest ${contestId}`);
				for (let i = 0; i < contestData.hacks.length; i += BATCH_SIZE) {
					const batch = contestData.hacks.slice(i, i + BATCH_SIZE);
					const batchIndex = Math.floor(i / BATCH_SIZE);

					const transformedHacks = batch.map(hack => {
						const hackerMembers = hack.hacker?.members || [];
						const defenderMembers = hack.defender?.members || [];
						const hackerHandle = hackerMembers[0]?.handle || '';
						const defenderHandle = defenderMembers[0]?.handle || '';

						return {
							hackId: hack.id,
							problemIndex: hack.problem?.index || '',
							problemName: hack.problem?.name || '',
							hackerHandle: hackerHandle,
							hackerHandles: hackerMembers.map(m => m.handle),
							hackerParticipantType: hack.hacker?.participantType || 'CONTESTANT',
							defenderHandle: defenderHandle,
							defenderHandles: defenderMembers.map(m => m.handle),
							defenderParticipantType: hack.defender?.participantType || 'CONTESTANT',
							creationTimeSeconds: hack.creationTimeSeconds || 0,
							verdict: hack.verdict || null,
							test: hack.test || null,
							judgeProtocol: hack.judgeProtocol || null,
							lastFetchedAt: now
						};
					});

					// Find or create batch for this index
					let batchDoc = contestDataBatches.find(b => b.batchIndex === batchIndex);
					if (!batchDoc) {
						batchDoc = {
							contestId,
							batchIndex,
							submissions: [],
							ratingChanges: [],
							hacks: transformedHacks,
							lastFetchedAt: now
						};
						contestDataBatches.push(batchDoc);
						logger.debug(`Created new batch ${batchIndex} for hacks (${transformedHacks.length} items)`);
					} else {
						batchDoc.hacks = transformedHacks;
						logger.debug(`Updated batch ${batchIndex} with hacks (${transformedHacks.length} items)`);
					}
				}
			}

			// Bulk upsert contest data batches
			if (contestDataBatches.length > 0) {
				// Log batch summary before storing
				const submissionsCount = contestDataBatches.reduce((sum, b) => sum + (b.submissions?.length || 0), 0);
				const ratingChangesCount = contestDataBatches.reduce((sum, b) => sum + (b.ratingChanges?.length || 0), 0);
				const hacksCount = contestDataBatches.reduce((sum, b) => sum + (b.hacks?.length || 0), 0);
				logger.info(`Preparing to store contest data: ${submissionsCount} submissions, ${ratingChangesCount} rating changes, ${hacksCount} hacks in ${contestDataBatches.length} batches`);

				// Validate batch sizes (each array should be <= 1000)
				for (const batch of contestDataBatches) {
					if (batch.submissions && batch.submissions.length > BATCH_SIZE) {
						logger.error(`Batch ${batch.batchIndex} has ${batch.submissions.length} submissions (exceeds ${BATCH_SIZE})`);
					}
					if (batch.ratingChanges && batch.ratingChanges.length > BATCH_SIZE) {
						logger.error(`Batch ${batch.batchIndex} has ${batch.ratingChanges.length} rating changes (exceeds ${BATCH_SIZE})`);
					}
					if (batch.hacks && batch.hacks.length > BATCH_SIZE) {
						logger.error(`Batch ${batch.batchIndex} has ${batch.hacks.length} hacks (exceeds ${BATCH_SIZE})`);
					}
				}

				const contestDataOps = contestDataBatches.map((batch, idx) => {
					// Ensure all arrays exist
					const batchData = {
						contestId: batch.contestId,
						batchIndex: batch.batchIndex,
						submissions: Array.isArray(batch.submissions) ? batch.submissions : [],
						ratingChanges: Array.isArray(batch.ratingChanges) ? batch.ratingChanges : [],
						hacks: Array.isArray(batch.hacks) ? batch.hacks : [],
						lastFetchedAt: batch.lastFetchedAt || now,
						updatedAt: now
					};

					if (idx < 3) {
						logger.debug(`Batch ${batch.batchIndex} preview: ${batchData.submissions.length} submissions, ${batchData.ratingChanges.length} rating changes, ${batchData.hacks.length} hacks`);
					}

					return {
						updateOne: {
							filter: { contestId: batchData.contestId, batchIndex: batchData.batchIndex },
							update: {
								$set: batchData,
								$setOnInsert: {
									createdAt: now
								}
							},
							upsert: true
						}
					};
				});

				try {
					logger.info(`Executing bulkWrite with ${contestDataOps.length} operations for contest ${contestId}`);
					const result = await models.BatchedContestData.bulkWrite(contestDataOps, { ordered: false });
					logger.info(`BulkWrite result: ${result.insertedCount} inserted, ${result.modifiedCount} modified, ${result.matchedCount} matched, ${result.upsertedCount} upserted`);
					
					if (result.writeErrors && result.writeErrors.length > 0) {
						logger.error(`BulkWrite had ${result.writeErrors.length} write errors`);
						result.writeErrors.slice(0, 5).forEach((err, idx) => {
							logger.error(`Write error ${idx + 1}: ${err.errmsg || JSON.stringify(err)}`);
						});
					}
					
					logger.info(`Stored contest data in ${contestDataBatches.length} batches for contest ${contestId}`);
				} catch (bulkError) {
					logger.error(`BulkWrite error for contest ${contestId}: ${bulkError.message}`);
					logger.error(`Error stack: ${bulkError.stack}`);
					if (bulkError.writeErrors && bulkError.writeErrors.length > 0) {
						logger.error(`Write errors count: ${bulkError.writeErrors.length}`);
						bulkError.writeErrors.slice(0, 5).forEach((err, idx) => {
							logger.error(`Write error ${idx + 1}: ${JSON.stringify(err)}`);
						});
					}
					throw bulkError;
				}
			} else {
				logger.warn(`No contest data batches to store for contest ${contestId} - submissions: ${contestData.submissions?.length || 0}, ratingChanges: ${contestData.ratingChanges?.length || 0}, hacks: ${contestData.hacks?.length || 0}`);
			}

			logger.info(`Successfully stored complete contest data for contest ${contestId}`);
		} catch (error) {
			logger.error(`Error storing contest data for contest ${contestId}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Store contest list in MongoDB
	 * Note: Contests are currently stored embedded in standings, so this method
	 * may need to be updated if a separate Contests collection is created
	 * @param {Array} contests - Array of contest objects from API
	 * @returns {Promise<void>}
	 */
	async storeContestList(contests) {
		try {
			// For now, contests are stored embedded in standings data
			// If a separate Contests collection is needed, it should be created here
			logger.info(`Contest list storage: ${contests.length} contests received (currently stored embedded in standings)`);
			
			// TODO: Implement separate Contests collection if needed
			// For now, contests are stored when standings are stored
			
			logger.info(`Contest list storage completed (${contests.length} contests)`);
		} catch (error) {
			logger.error(`Error storing contest list: ${error.message}`);
			throw error;
		}
	}
}

// Export singleton instance
export const codeforcesDataService = new CodeforcesDataService();

