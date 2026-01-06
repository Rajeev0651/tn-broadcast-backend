import mongoose from 'mongoose';

const Schema = mongoose.Schema;

/**
 * Stream schema
 * @constructor Stream model constructor
 * @classdesc Represents a streaming session assigned to a Contest event
 */
const StreamSchema = new Schema({
	_id: {
		type: Number,
		required: false // Will be set in pre-save hook
	},
	uniqueId: {
		type: Number,
		required: false, // Will be set in pre-save hook
		unique: true,
		index: true
	},
	mediaId: {
		type: Number,
		required: true,
		index: true
		// References Media._id (integer)
	},
	contestId: {
		type: Number,
		required: true,
		index: true
		// Stores contestId as Number (no foreign key validation)
	},
	title: {
		type: String,
		required: true,
		trim: true
	},
	description: {
		type: String,
		trim: true
	},
	status: {
		type: String,
		enum: ['scheduled', 'live', 'finished', 'cancelled'],
		default: 'scheduled',
		index: true
	},
	startTime: {
		type: Date
	},
	endTime: {
		type: Date
	},
	thumbnail: {
		type: String,
		trim: true
	},
	viewerCount: {
		type: Number,
		default: 0,
		min: 0
	},
	metadata: {
		type: Schema.Types.Mixed,
		default: {}
	},
	// Timestamps
	createdAt: {
		type: Date,
		default: Date.now
	},
	updatedAt: {
		type: Date,
		default: Date.now
	}
}, {
	timestamps: true
});

// Auto-increment _id and uniqueId before save using centralized ID counter
StreamSchema.pre('save', async function(next) {
	// Always set _id and uniqueId for new documents
	if (this.isNew) {
		try {
			// Access IdCounter model (should be registered before Streams in index.js)
			const IdCounter = mongoose.model('idCounter');
			
			const result = await IdCounter.findOneAndUpdate(
				{ collectionName: 'streams' },
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
			const newId = result.currentId;
			// Set both _id and uniqueId to the same value
			this._id = newId;
			this.uniqueId = newId;
		} catch (error) {
			// Log error for debugging
			console.error('Error in StreamSchema pre-save hook:', error);
			return next(error);
		}
	}
	next();
});

// Indexes
StreamSchema.index({ uniqueId: 1 });
StreamSchema.index({ mediaId: 1 });
StreamSchema.index({ contestId: 1 });
StreamSchema.index({ status: 1 });
StreamSchema.index({ contestId: 1, status: 1 });
StreamSchema.index({ title: 'text', description: 'text' });

export { StreamSchema };

