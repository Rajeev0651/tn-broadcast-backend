import { Router } from 'express';
import { models } from '../data/models/index.js';
import { logger } from '../helpers/logger.js';
import { isValidHashcode, isValidMediaUrl } from '../helpers/validations.js';

const router = Router();

/**
 * Create new media
 * POST /api/media
 * 
 * Body Parameters:
 * - type: string (required) - 'pre-recorded' or 'external'
 * - url: string (required) - HLS master.m3u8 URL for pre-recorded, stream URL for external
 * - name: string (required) - Media name
 * - description: string (optional) - Media description
 * - duration: number (optional) - Duration in seconds
 * - metadata: object (optional) - Additional media metadata
 */
router.post('/', async (req, res) => {
	try {
		const { type, url, name, description, duration, metadata } = req.body;

		// Validation
		if (!type || !url || !name) {
			return res.status(400).json({
				success: false,
				error: 'Missing required fields: type, url, and name are required'
			});
		}

		if (!['pre-recorded', 'external'].includes(type)) {
			return res.status(400).json({
				success: false,
				error: 'Invalid type. Must be "pre-recorded" or "external"'
			});
		}

		if (!isValidMediaUrl(url, type)) {
			return res.status(400).json({
				success: false,
				error: type === 'pre-recorded' 
					? 'Invalid URL. Pre-recorded media must have a master.m3u8 URL'
					: 'Invalid URL format'
			});
		}

		if (duration !== undefined && (typeof duration !== 'number' || duration < 0)) {
			return res.status(400).json({
				success: false,
				error: 'Duration must be a non-negative number'
			});
		}

		logger.info(`API: Creating new media - name: ${name}, type: ${type}`);

		const media = new models.Media({
			type,
			url,
			name,
			description,
			duration,
			metadata: metadata || {}
		});

		await media.save();

		res.status(200).json({
			success: true,
			message: 'Media created successfully',
			data: media
		});
	} catch (error) {
		logger.error(`API Error creating media: ${error.message}`);
		
		// Handle duplicate uniqueId or hashcode
		if (error.code === 11000) {
			return res.status(400).json({
				success: false,
				error: 'Media with this uniqueId or hashcode already exists'
			});
		}

		res.status(500).json({
			success: false,
			error: error.message || 'Failed to create media'
		});
	}
});

/**
 * List all media with pagination
 * GET /api/media
 * 
 * Query Parameters:
 * - limit: number (optional, default: 100) - Number of records to return
 * - skip: number (optional, default: 0) - Number of records to skip
 * - type: string (optional) - Filter by type ('pre-recorded' or 'external')
 */
router.get('/', async (req, res) => {
	try {
		const limit = parseInt(req.query.limit) || 100;
		const skip = parseInt(req.query.skip) || 0;
		const type = req.query.type;

		// Build query
		const query = {};
		if (type && ['pre-recorded', 'external'].includes(type)) {
			query.type = type;
		}

		// Use projection to only fetch needed fields (optimized query)
		// Uses indexes: { type: 1 }, { createdAt: -1 } (implicit)
		const [items, total] = await Promise.all([
			models.Media.find(query)
				.select('uniqueId hashcode type url name description duration metadata createdAt updatedAt')
				.sort({ createdAt: -1 })
				.limit(limit)
				.skip(skip)
				.lean(),
			models.Media.countDocuments(query)
		]);

		res.status(200).json({
			success: true,
			data: {
				items,
				pagination: {
					total,
					limit,
					skip,
					hasMore: skip + limit < total
				}
			}
		});
	} catch (error) {
		logger.error(`API Error getting media list: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message || 'Failed to get media list'
		});
	}
});

/**
 * Get media by hashcode
 * GET /api/media/hashcode/:hashcode
 * Note: This route must come before /:uniqueId to avoid route conflicts
 */
router.get('/hashcode/:hashcode', async (req, res) => {
	try {
		const { hashcode } = req.params;

		if (!isValidHashcode(hashcode)) {
			return res.status(400).json({
				success: false,
				error: 'Invalid hashcode format. Must be xxxx-xxxx-xxxx-xxxx'
			});
		}

		// Use covered query - hashcode is indexed and unique
		const media = await models.Media.findOne({ hashcode })
			.select('uniqueId hashcode type url name description duration metadata createdAt updatedAt')
			.lean();

		if (!media) {
			return res.status(404).json({
				success: false,
				error: `Media with hashcode ${hashcode} not found`
			});
		}

		res.status(200).json({
			success: true,
			data: media
		});
	} catch (error) {
		logger.error(`API Error getting media by hashcode: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message || 'Failed to get media'
		});
	}
});

/**
 * Get media by uniqueId
 * GET /api/media/:uniqueId
 * Note: This route must come after /hashcode/:hashcode to avoid route conflicts
 */
router.get('/:uniqueId', async (req, res) => {
	try {
		const uniqueId = parseInt(req.params.uniqueId);

		if (!uniqueId || isNaN(uniqueId)) {
			return res.status(400).json({
				success: false,
				error: 'Invalid uniqueId. Must be a valid integer'
			});
		}

		// Use covered query - uniqueId is indexed and unique
		const media = await models.Media.findOne({ uniqueId })
			.select('uniqueId hashcode type url name description duration metadata createdAt updatedAt')
			.lean();

		if (!media) {
			return res.status(404).json({
				success: false,
				error: `Media with uniqueId ${uniqueId} not found`
			});
		}

		res.status(200).json({
			success: true,
			data: media
		});
	} catch (error) {
		logger.error(`API Error getting media: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message || 'Failed to get media'
		});
	}
});

/**
 * Update media
 * PUT /api/media/:uniqueId
 * 
 * Body Parameters (all optional):
 * - type: string - 'pre-recorded' or 'external'
 * - url: string - Media URL
 * - name: string - Media name
 * - description: string - Media description
 * - duration: number - Duration in seconds
 * - metadata: object - Additional metadata
 * 
 * Note: uniqueId and hashcode cannot be updated
 */
router.put('/:uniqueId', async (req, res) => {
	try {
		const uniqueId = parseInt(req.params.uniqueId);

		if (!uniqueId || isNaN(uniqueId)) {
			return res.status(400).json({
				success: false,
				error: 'Invalid uniqueId. Must be a valid integer'
			});
		}

		const { type, url, name, description, duration, metadata } = req.body;

		// Use projection to only fetch needed fields for update
		const media = await models.Media.findOne({ uniqueId })
			.select('uniqueId hashcode type url name description duration metadata');

		if (!media) {
			return res.status(404).json({
				success: false,
				error: `Media with uniqueId ${uniqueId} not found`
			});
		}

		// Validation
		if (type && !['pre-recorded', 'external'].includes(type)) {
			return res.status(400).json({
				success: false,
				error: 'Invalid type. Must be "pre-recorded" or "external"'
			});
		}

		if (url && type !== undefined) {
			if (!isValidMediaUrl(url, type)) {
				return res.status(400).json({
					success: false,
					error: type === 'pre-recorded' 
						? 'Invalid URL. Pre-recorded media must have a master.m3u8 URL'
						: 'Invalid URL format'
				});
			}
		} else if (url) {
			// If only url is provided, validate against existing type
			if (!isValidMediaUrl(url, media.type)) {
				return res.status(400).json({
					success: false,
					error: media.type === 'pre-recorded' 
						? 'Invalid URL. Pre-recorded media must have a master.m3u8 URL'
						: 'Invalid URL format'
				});
			}
		}

		if (duration !== undefined && (typeof duration !== 'number' || duration < 0)) {
			return res.status(400).json({
				success: false,
				error: 'Duration must be a non-negative number'
			});
		}

		// Update fields
		if (type !== undefined) media.type = type;
		if (url !== undefined) media.url = url;
		if (name !== undefined) media.name = name;
		if (description !== undefined) media.description = description;
		if (duration !== undefined) media.duration = duration;
		if (metadata !== undefined) media.metadata = metadata;

		await media.save();

		logger.info(`API: Updated media ${uniqueId}`);

		res.status(200).json({
			success: true,
			message: 'Media updated successfully',
			data: media
		});
	} catch (error) {
		logger.error(`API Error updating media: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message || 'Failed to update media'
		});
	}
});

/**
 * Delete media
 * DELETE /api/media/:uniqueId
 * 
 * Validation: Checks if media is used by any streams
 */
router.delete('/:uniqueId', async (req, res) => {
	try {
		const uniqueId = parseInt(req.params.uniqueId);

		if (!uniqueId || isNaN(uniqueId)) {
			return res.status(400).json({
				success: false,
				error: 'Invalid uniqueId. Must be a valid integer'
			});
		}

		// Use projection to only fetch _id for deletion check
		const media = await models.Media.findOne({ uniqueId })
			.select('_id uniqueId');

		if (!media) {
			return res.status(404).json({
				success: false,
				error: `Media with uniqueId ${uniqueId} not found`
			});
		}

		// Check if media is used by any streams (uses index: { mediaId: 1 })
		const streamCount = await models.Streams.countDocuments({ mediaId: media._id });

		if (streamCount > 0) {
			return res.status(400).json({
				success: false,
				error: `Cannot delete media. It is currently used by ${streamCount} stream(s)`
			});
		}

		await models.Media.deleteOne({ uniqueId });

		logger.info(`API: Deleted media ${uniqueId}`);

		res.status(200).json({
			success: true,
			message: 'Media deleted successfully'
		});
	} catch (error) {
		logger.error(`API Error deleting media: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message || 'Failed to delete media'
		});
	}
});

export default router;

