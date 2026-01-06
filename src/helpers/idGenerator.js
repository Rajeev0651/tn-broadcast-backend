import { models } from '../data/models/index.js';

/**
 * Get and increment the next ID for a collection
 * @param {string} collectionName - Name of the collection (e.g., 'media', 'streams')
 * @returns {Promise<number>} The next available ID
 */
export const getNextId = async (collectionName) => {
	const result = await models.IdCounter.findOneAndUpdate(
		{ collectionName },
		{ 
			$inc: { currentId: 1 },
			$set: { updatedAt: new Date() }
		},
		{ 
			upsert: true, 
			new: true,
			setDefaultsOnInsert: true
		}
	);

	return result.currentId;
};

