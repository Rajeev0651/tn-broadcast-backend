import mongoose from 'mongoose';

const Schema = mongoose.Schema;

/**
 * Problems schema
 * @constructor Problems model constructor
 * @classdesc Stores Codeforces problem information (normalized to avoid duplication)
 */
const ProblemsSchema = new Schema({
	problemId: {
		type: String,
		required: true,
		unique: true,
		index: true
	},
	contestId: {
		type: Number,
		required: true,
		index: true
	},
	problemsetName: {
		type: String,
		index: true
	},
	index: {
		type: String,
		required: true
	},
	name: {
		type: String,
		required: true
	},
	type: {
		type: String,
		enum: ['PROGRAMMING', 'QUESTION']
	},
	points: {
		type: Number
	},
	rating: {
		type: Number,
		index: true
	},
	tags: {
		type: [String],
		index: true
	},
	// Metadata
	lastSeenAt: {
		type: Date,
		default: Date.now
	},
	referenceCount: {
		type: Number,
		default: 0
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

// Indexes
ProblemsSchema.index({ contestId: 1, index: 1 });
ProblemsSchema.index({ tags: 1 });
ProblemsSchema.index({ problemsetName: 1 });
ProblemsSchema.index({ name: 'text', tags: 'text' });

export { ProblemsSchema };

