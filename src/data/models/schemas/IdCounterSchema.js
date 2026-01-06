import mongoose from 'mongoose';

const Schema = mongoose.Schema;

/**
 * ID Counter schema
 * @constructor IdCounter model constructor
 * @classdesc Maintains auto-incrementing integer IDs for different document types
 */
const IdCounterSchema = new Schema({
	collectionName: {
		type: String,
		required: true,
		unique: true,
		index: true
	},
	currentId: {
		type: Number,
		required: true,
		default: 0
	},
	updatedAt: {
		type: Date,
		default: Date.now
	}
}, {
	timestamps: false
});

// Indexes
IdCounterSchema.index({ collectionName: 1 }, { unique: true });

export { IdCounterSchema };

