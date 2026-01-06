import { Router } from 'express';
import { models } from '../data/models/index.js';
import { logger } from '../helpers/logger.js';
import { isValidStatusTransition } from '../helpers/validations.js';

const router = Router();

/**
 * Create new stream
 * POST /api/streams
 * 
 * Body Parameters:
 * - mediaId: number (required) - Media _id or uniqueId (integer)
 * - contestId: number (required) - Contest ID
 * - title: string (required) - Stream title
 * - description: string (optional) - Stream description
 * - status: string (optional, default: 'scheduled') - 'scheduled', 'live', 'finished', 'cancelled'
 * - startTime: date (optional) - Stream start time
 * - endTime: date (optional) - Stream end time
 * - thumbnail: string (optional) - Thumbnail URL
 * - metadata: object (optional) - Additional stream metadata
 */
router.post('/', async (req, res) => {
	try {
		const { mediaId, contestId, title, description, status, startTime, endTime, thumbnail, metadata } = req.body;

		// Validation
		if (!mediaId || !contestId || !title) {
			return res.status(400).json({
				success: false,
				error: 'Missing required fields: mediaId, contestId, and title are required'
			});
		}

		if (status && !['scheduled', 'live', 'finished', 'cancelled'].includes(status)) {
			return res.status(400).json({
				success: false,
				error: 'Invalid status. Must be "scheduled", "live", "finished", or "cancelled"'
			});
		}

		// Verify media exists (try by _id or uniqueId - they're the same)
		const mediaIdInt = parseInt(mediaId);
		if (isNaN(mediaIdInt)) {
			return res.status(400).json({
				success: false,
				error: 'Invalid mediaId. Must be a valid integer'
			});
		}

		const media = await models.Media.findOne({ 
			$or: [
				{ _id: mediaIdInt },
				{ uniqueId: mediaIdInt }
			]
		}).lean();

		if (!media) {
			return res.status(404).json({
				success: false,
				error: `Media with ID ${mediaId} not found`
			});
		}

		// Note: contestId is stored as-is, no validation against Contests collection

		logger.info(`API: Creating new stream - title: ${title}, contestId: ${contestId}`);

		const stream = new models.Streams({
			mediaId: media._id,
			contestId: parseInt(contestId),
			title,
			description,
			status: status || 'scheduled',
			startTime: startTime ? new Date(startTime) : undefined,
			endTime: endTime ? new Date(endTime) : undefined,
			thumbnail,
			metadata: metadata || {}
		});

		await stream.save();

		// Fetch media data for response (since populate doesn't work with Number references)
		const streamData = stream.toObject();
		streamData.media = media;

		res.status(200).json({
			success: true,
			message: 'Stream created successfully',
			data: streamData
		});
	} catch (error) {
		logger.error(`API Error creating stream: ${error.message}`);
		
		// Handle duplicate uniqueId
		if (error.code === 11000) {
			return res.status(400).json({
				success: false,
				error: 'Stream with this uniqueId already exists'
			});
		}

		res.status(500).json({
			success: false,
			error: error.message || 'Failed to create stream'
		});
	}
});

/**
 * List all streams with pagination and filters
 * GET /api/streams
 * 
 * Query Parameters:
 * - limit: number (optional, default: 100) - Number of records to return
 * - skip: number (optional, default: 0) - Number of records to skip
 * - contestId: number (optional) - Filter by contest ID
 * - status: string (optional) - Filter by status
 * - mediaId: number (optional) - Filter by media _id or uniqueId (integer)
 */
router.get('/', async (req, res) => {
	try {
		const limit = parseInt(req.query.limit) || 100;
		const skip = parseInt(req.query.skip) || 0;
		const contestId = req.query.contestId ? parseInt(req.query.contestId) : undefined;
		const status = req.query.status;
		const mediaId = req.query.mediaId;

		// Build query
		const query = {};
		if (contestId) {
			query.contestId = contestId;
		}
		if (status && ['scheduled', 'live', 'finished', 'cancelled'].includes(status)) {
			query.status = status;
		}
		if (mediaId) {
			const mediaIdInt = parseInt(mediaId);
			if (!isNaN(mediaIdInt)) {
				query.mediaId = mediaIdInt;
			} else {
				// Invalid mediaId, return empty result
				return res.status(200).json({
					success: true,
					data: {
						items: [],
						pagination: {
							total: 0,
							limit,
							skip,
							hasMore: false
						}
					}
				});
			}
		}

		const [items, total] = await Promise.all([
			models.Streams.find(query)
				.sort({ createdAt: -1 })
				.limit(limit)
				.skip(skip)
				.lean(),
			models.Streams.countDocuments(query)
		]);

		// Fetch media data for each stream (since populate doesn't work with Number references)
		const mediaIds = [...new Set(items.map(item => item.mediaId))];
		const mediaMap = {};
		if (mediaIds.length > 0) {
			const mediaList = await models.Media.find({ _id: { $in: mediaIds } }).lean();
			mediaList.forEach(media => {
				mediaMap[media._id] = media;
			});
		}

		// Attach media data to each stream
		const itemsWithMedia = items.map(item => ({
			...item,
			media: mediaMap[item.mediaId] || null
		}));

		res.status(200).json({
			success: true,
			data: {
				items: itemsWithMedia,
				pagination: {
					total,
					limit,
					skip,
					hasMore: skip + limit < total
				}
			}
		});
	} catch (error) {
		logger.error(`API Error getting stream list: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message || 'Failed to get stream list'
		});
	}
});

/**
 * Get all streams for a contest
 * GET /api/streams/contest/:contestId
 * Note: This route must come before /:uniqueId to avoid route conflicts
 */
router.get('/contest/:contestId', async (req, res) => {
	try {
		const contestId = parseInt(req.params.contestId);

		if (!contestId || contestId <= 0) {
			return res.status(400).json({
				success: false,
				error: 'Invalid contest ID'
			});
		}

		// Note: contestId is stored as-is, no validation against Contests collection

		const streams = await models.Streams.find({ contestId })
			.sort({ createdAt: -1 })
			.lean();

		// Fetch media data for each stream (since populate doesn't work with Number references)
		const mediaIds = [...new Set(streams.map(stream => stream.mediaId))];
		const mediaMap = {};
		if (mediaIds.length > 0) {
			const mediaList = await models.Media.find({ _id: { $in: mediaIds } }).lean();
			mediaList.forEach(media => {
				mediaMap[media._id] = media;
			});
		}

		// Attach media data to each stream
		const streamsWithMedia = streams.map(stream => ({
			...stream,
			media: mediaMap[stream.mediaId] || null
		}));

		res.status(200).json({
			success: true,
			data: streamsWithMedia
		});
	} catch (error) {
		logger.error(`API Error getting streams for contest: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message || 'Failed to get streams for contest'
		});
	}
});

/**
 * Get stream by uniqueId
 * GET /api/streams/:uniqueId
 * Note: This route must come after /contest/:contestId to avoid route conflicts
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

		const stream = await models.Streams.findOne({ uniqueId }).lean();

		if (!stream) {
			return res.status(404).json({
				success: false,
				error: `Stream with uniqueId ${uniqueId} not found`
			});
		}

		// Fetch media data (since populate doesn't work with Number references)
		const media = await models.Media.findOne({ _id: stream.mediaId }).lean();

		const streamData = {
			...stream,
			media: media || null
		};

		res.status(200).json({
			success: true,
			data: streamData
		});
	} catch (error) {
		logger.error(`API Error getting stream: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message || 'Failed to get stream'
		});
	}
});

/**
 * Update stream
 * PUT /api/streams/:uniqueId
 * 
 * Body Parameters (all optional):
 * - mediaId: number - Media _id or uniqueId (integer)
 * - contestId: number - Contest ID
 * - title: string - Stream title
 * - description: string - Stream description
 * - status: string - Stream status
 * - startTime: date - Stream start time
 * - endTime: date - Stream end time
 * - thumbnail: string - Thumbnail URL
 * - viewerCount: number - Viewer count
 * - metadata: object - Additional metadata
 * 
 * Note: uniqueId cannot be updated
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

		const { mediaId, contestId, title, description, status, startTime, endTime, thumbnail, viewerCount, metadata } = req.body;

		const stream = await models.Streams.findOne({ uniqueId });

		if (!stream) {
			return res.status(404).json({
				success: false,
				error: `Stream with uniqueId ${uniqueId} not found`
			});
		}

		// Status transition validation
		if (status && status !== stream.status) {
			if (!isValidStatusTransition(stream.status, status)) {
				return res.status(400).json({
					success: false,
					error: `Invalid status transition from "${stream.status}" to "${status}"`
				});
			}
		}

		// Validate status if provided
		if (status && !['scheduled', 'live', 'finished', 'cancelled'].includes(status)) {
			return res.status(400).json({
				success: false,
				error: 'Invalid status. Must be "scheduled", "live", "finished", or "cancelled"'
			});
		}

		// Verify media exists if mediaId is being updated
		if (mediaId !== undefined) {
			const mediaIdInt = parseInt(mediaId);
			if (isNaN(mediaIdInt)) {
				return res.status(400).json({
					success: false,
					error: 'Invalid mediaId. Must be a valid integer'
				});
			}

			const media = await models.Media.findOne({ 
				$or: [
					{ _id: mediaIdInt },
					{ uniqueId: mediaIdInt }
				]
			});

			if (!media) {
				return res.status(404).json({
					success: false,
					error: `Media with ID ${mediaId} not found`
				});
			}
			stream.mediaId = media._id;
		}

		// Update contestId if provided (no validation against Contests collection)
		if (contestId !== undefined) {
			stream.contestId = parseInt(contestId);
		}

		// Update fields
		if (title !== undefined) stream.title = title;
		if (description !== undefined) stream.description = description;
		if (status !== undefined) stream.status = status;
		if (startTime !== undefined) stream.startTime = startTime ? new Date(startTime) : undefined;
		if (endTime !== undefined) stream.endTime = endTime ? new Date(endTime) : undefined;
		if (thumbnail !== undefined) stream.thumbnail = thumbnail;
		if (viewerCount !== undefined) {
			if (typeof viewerCount !== 'number' || viewerCount < 0) {
				return res.status(400).json({
					success: false,
					error: 'Viewer count must be a non-negative number'
				});
			}
			stream.viewerCount = viewerCount;
		}
		if (metadata !== undefined) stream.metadata = metadata;

		await stream.save();

		// Fetch media data for response (since populate doesn't work with Number references)
		const media = await models.Media.findOne({ _id: stream.mediaId }).lean();
		const streamData = stream.toObject();
		streamData.media = media || null;

		logger.info(`API: Updated stream ${uniqueId}`);

		res.status(200).json({
			success: true,
			message: 'Stream updated successfully',
			data: streamData
		});
	} catch (error) {
		logger.error(`API Error updating stream: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message || 'Failed to update stream'
		});
	}
});

/**
 * Delete stream
 * DELETE /api/streams/:uniqueId
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

		const stream = await models.Streams.findOne({ uniqueId });

		if (!stream) {
			return res.status(404).json({
				success: false,
				error: `Stream with uniqueId ${uniqueId} not found`
			});
		}

		await models.Streams.deleteOne({ uniqueId });

		logger.info(`API: Deleted stream ${uniqueId}`);

		res.status(200).json({
			success: true,
			message: 'Stream deleted successfully'
		});
	} catch (error) {
		logger.error(`API Error deleting stream: ${error.message}`);
		res.status(500).json({
			success: false,
			error: error.message || 'Failed to delete stream'
		});
	}
});

export default router;

