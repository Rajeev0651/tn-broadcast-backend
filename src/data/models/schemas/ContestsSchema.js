import mongoose from 'mongoose';

/**
 * Schema to store contest list and metadata
 * This is separate from the batched data and stores the full contest information
 */
const ContestsSchema = new mongoose.Schema({
	contestId: {
		type: Number,
		required: true,
		unique: true,
		index: true
	},
	name: {
		type: String,
		required: true
	},
	type: {
		type: String, // "CF", "IOI", "ICPC"
		default: 'CF'
	},
	phase: {
		type: String, // "BEFORE", "CODING", "FINISHED", etc.
		default: 'BEFORE'
	},
	frozen: {
		type: Boolean,
		default: false
	},
	durationSeconds: {
		type: Number,
		default: 0
	},
	startTimeSeconds: {
		type: Number,
		default: null
	},
	relativeTimeSeconds: {
		type: Number,
		default: null
	},
	preparedBy: {
		type: String,
		default: null
	},
	websiteUrl: {
		type: String,
		default: null
	},
	description: {
		type: String,
		default: null
	},
	difficulty: {
		type: Number,
		default: null
	},
	kind: {
		type: String,
		default: null
	},
	icpcRegion: {
		type: String,
		default: null
	},
	country: {
		type: String,
		default: null
	},
	city: {
		type: String,
		default: null
	},
	season: {
		type: String,
		default: null
	},
	isGym: {
		type: Boolean,
		default: false,
		index: true
	},
	// Metadata
	lastFetchedAt: {
		type: Date,
		default: Date.now
	}
}, {
	timestamps: true
});

// Indexes for efficient queries
ContestsSchema.index({ contestId: 1 }, { unique: true });
ContestsSchema.index({ phase: 1 });
ContestsSchema.index({ type: 1 });
ContestsSchema.index({ startTimeSeconds: -1 });
ContestsSchema.index({ isGym: 1, phase: 1 });
ContestsSchema.index({ name: 'text', description: 'text' });

export { ContestsSchema };
