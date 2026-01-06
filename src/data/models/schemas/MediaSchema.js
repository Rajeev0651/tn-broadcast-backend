import mongoose from 'mongoose';
import { generateHashcode } from '../../../helpers/hashcodeGenerator.js';

const Schema = mongoose.Schema;

/**
 * Media schema
 * @constructor Media model constructor
 * @classdesc Stores video/audio content for OTT streaming platform
 */
const MediaSchema = new Schema({
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
	hashcode: {
		type: String,
		required: true,
		unique: true,
		index: true,
		validate: {
			validator: function(v) {
				// Format: xxxx-xxxx-xxxx-xxxx (4 hex groups of 4 chars each)
				return /^[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}$/i.test(v);
			},
			message: 'Hashcode must be in format xxxx-xxxx-xxxx-xxxx'
		},
		default: generateHashcode
	},
	type: {
		type: String,
		enum: ['pre-recorded', 'external'],
		required: true,
		index: true
	},
	url: {
		type: String,
		required: true
	},
	name: {
		type: String,
		required: true,
		trim: true
	},
	description: {
		type: String,
		trim: true
	},
	duration: {
		type: Number,
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
MediaSchema.pre('save', async function(next) {
	// Always set _id and uniqueId for new documents
	if (this.isNew) {
		try {
			// Access IdCounter model (should be registered before Media in index.js)
			const IdCounter = mongoose.model('idCounter');
			
			const result = await IdCounter.findOneAndUpdate(
				{ collectionName: 'media' },
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
			console.error('Error in MediaSchema pre-save hook:', error);
			return next(error);
		}
	}
	next();
});

// Indexes
MediaSchema.index({ uniqueId: 1 });
MediaSchema.index({ hashcode: 1 });
MediaSchema.index({ type: 1 });
MediaSchema.index({ name: 'text', description: 'text' });

export { MediaSchema };

