import mongoose from 'mongoose';

const Schema = mongoose.Schema;

/**
 * Contests schema
 * @constructor Contests model constructor
 * @classdesc Stores Codeforces contest metadata and basic information
 */
const ContestsSchema = new Schema({
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
		type: String,
		enum: ['CF', 'IOI', 'ICPC'],
		index: true
	},
	phase: {
		type: String,
		enum: ['BEFORE', 'CODING', 'PENDING_SYSTEM_TEST', 'SYSTEM_TEST', 'FINISHED'],
		index: true
	},
	frozen: {
		type: Boolean,
		default: false
	},
	durationSeconds: {
		type: Number
	},
	startTimeSeconds: {
		type: Number,
		index: true
	},
	relativeTimeSeconds: {
		type: Number
	},
	preparedBy: {
		type: String
	},
	websiteUrl: {
		type: String
	},
	description: {
		type: String
	},
	difficulty: {
		type: Number
	},
	kind: {
		type: String
	},
	icpcRegion: {
		type: String
	},
	country: {
		type: String
	},
	city: {
		type: String
	},
	season: {
		type: String
	},
	// Metadata
	lastFetchedAt: {
		type: Date,
		default: Date.now
	},
	dataVersion: {
		type: Number,
		default: 1
	},
	isGym: {
		type: Boolean,
		default: false,
		index: true
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
ContestsSchema.index({ phase: 1 });
ContestsSchema.index({ type: 1 });
ContestsSchema.index({ startTimeSeconds: -1 });
ContestsSchema.index({ isGym: 1, phase: 1 });
ContestsSchema.index({ name: 'text', description: 'text' });

export { ContestsSchema };

