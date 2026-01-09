import { models } from '../data/models/index.js';
import { getModels } from './modelProvider.js';
import { logger } from '../helpers/logger.js';
import { stateToPlainObject, plainObjectToState } from './standingsStateUpdate.js';

/**
 * Snapshot Service
 * Handles creation and management of base and delta snapshots
 * for efficient time-based standings replay
 */
class SnapshotService {
	/**
	 * Create a base snapshot (full state for all participants)
	 * @param {number} contestId - Contest ID
	 * @param {number} timestampSeconds - Timestamp relative to contest start (seconds)
	 * @param {boolean} fileMode - Use file storage instead of MongoDB (default: false)
	 * @returns {Promise<Object>} Created snapshot document
	 */
	async createBaseSnapshot(contestId, timestampSeconds, fileMode = false) {
		try {
			const Models = getModels(fileMode);
			
			// Fetch all participants from standingsState
			const allParticipants = await Models.StandingsState.find({ contestId })
				.select('handle participantType ghost isUnofficial totalPoints totalPenalty solvedCount lastAcTime problems hackSuccess hackFail lastSubmissionTime')
				.lean();
			
			// Convert to snapshot format
			const participants = allParticipants.map(p => {
				const participant = {
					handle: p.handle,
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
				};
				
				// Ensure problems is an object (not Map) for storage
				if (participant.problems instanceof Map) {
					const problemsObj = {};
					for (const [key, value] of participant.problems.entries()) {
						problemsObj[key] = value;
					}
					participant.problems = problemsObj;
				}
				
				return participant;
			});
			
			// Create snapshot document
			const snapshot = await Models.BaseSnapshots.create({
				contestId,
				timestampSeconds,
				snapshotType: 'BASE',
				participants,
				participantCount: participants.length,
				createdAt: new Date()
			});
			
			logger.info(`Created base snapshot for contest ${contestId} at timestamp ${timestampSeconds} with ${participants.length} participants`);
			
			return snapshot;
		} catch (error) {
			logger.error(`Error creating base snapshot for contest ${contestId} at timestamp ${timestampSeconds}: ${error.message}`);
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
	 * @param {number} contestId - Contest ID
	 * @param {number} fromTimestamp - Start timestamp (relative to contest start)
	 * @param {number} toTimestamp - End timestamp (relative to contest start)
	 * @param {boolean} fileMode - Use file storage instead of MongoDB (default: false)
	 * @returns {Promise<Array>} Array of changed participants with their changes
	 */
	async findChangedParticipants(contestId, fromTimestamp, toTimestamp, fileMode = false) {
		try {
			const Models = getModels(fileMode);
			
			// Simplified approach: Get all participants that exist in standingsState
			// In a production system, you would track changes more explicitly:
			// - Use MongoDB change streams to track document updates
			// - Maintain a change log collection
			// - Track lastSnapshotVersion per participant
			// 
			// For now, we'll get participants that have been updated recently
			// This is a heuristic - we get all current participants and assume
			// they might have changed. For optimal performance, track changes explicitly.
			
			// Get all participants from standingsState (current state)
			const allParticipants = await Models.StandingsState.find({ contestId })
				.select('handle participantType ghost isUnofficial totalPoints totalPenalty solvedCount lastAcTime problems hackSuccess hackFail lastSubmissionTime updatedAt')
				.lean();
			
			// Filter to only participants that were updated after the last snapshot
			// We use updatedAt as a heuristic (not perfect, but works for MVP)
			const changedParticipants = allParticipants.filter(p => {
				// If participant was updated recently (within the time window), include it
				// This is a simplified check - ideally we'd track snapshotVersion
				return true; // For MVP, include all current participants
			});
			
			// Convert to delta change format
			const changes = changedParticipants.map(p => {
				const state = {
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
				};
				
				// Ensure problems is an object
				if (state.problems instanceof Map) {
					const problemsObj = {};
					for (const [key, value] of state.problems.entries()) {
						problemsObj[key] = value;
					}
					state.problems = problemsObj;
				}
				
				return {
					handle: p.handle,
					op: 'UPDATE',  // For now, assume updates. Could check if participant exists for INSERT
					state
				};
			});
			
			return changes;
		} catch (error) {
			logger.error(`Error finding changed participants for contest ${contestId}: ${error.message}`);
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
			const Models = getModels(fileMode);
			
			// Find last snapshot (base or delta)
			const lastSnapshot = await this.findLastSnapshot(contestId, timestampSeconds, fileMode);
			
			if (!lastSnapshot) {
				// No previous snapshot - create base snapshot instead
				logger.warn(`No previous snapshot found for contest ${contestId}, creating base snapshot instead`);
				return await this.createBaseSnapshot(contestId, timestampSeconds, fileMode);
			}
			
			// Find changed participants since last snapshot
			const changedParticipants = await this.findChangedParticipants(
				contestId,
				lastSnapshot.timestampSeconds,
				timestampSeconds,
				fileMode
			);
			
			if (changedParticipants.length === 0) {
				// No changes - create empty delta snapshot
				logger.debug(`No changes found for contest ${contestId} between timestamps ${lastSnapshot.timestampSeconds} and ${timestampSeconds}`);
			}
			
			// Create delta snapshot
			const snapshot = await Models.DeltaSnapshots.create({
				contestId,
				timestampSeconds,
				snapshotType: 'DELTA',
				baseSnapshotTimestamp: lastSnapshot.baseTimestamp || lastSnapshot.timestampSeconds,
				changes: changedParticipants,
				changeCount: changedParticipants.length,
				createdAt: new Date()
			});
			
			logger.info(`Created delta snapshot for contest ${contestId} at timestamp ${timestampSeconds} with ${changedParticipants.length} changes`);
			
			return snapshot;
		} catch (error) {
			logger.error(`Error creating delta snapshot for contest ${contestId} at timestamp ${timestampSeconds}: ${error.message}`);
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
	async createSnapshot(contestId, timestampSeconds, fileMode = false) {
		const BASE_INTERVAL = 60;  // Base snapshots every 60 seconds
		
		// Check if this should be a base snapshot
		if (timestampSeconds % BASE_INTERVAL === 0) {
			return await this.createBaseSnapshot(contestId, timestampSeconds, fileMode);
		} else {
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
