import mongoose from 'mongoose';

const Schema = mongoose.Schema;

/**
 * Problem result sub-schema
 */
const ProblemResultSchema = new Schema({
	problemIndex: {
		type: String,
		required: true
	},
	points: {
		type: Number,
		required: true
	},
	penalty: {
		type: Number
	},
	rejectedAttemptCount: {
		type: Number,
		required: true,
		default: 0
	},
	type: {
		type: String,
		enum: ['PRELIMINARY', 'FINAL']
	},
	bestSubmissionTimeSeconds: {
		type: Number
	}
}, { _id: false });

/**
 * Standings schema
 * @constructor Standings model constructor
 * @classdesc Stores participant standings for contests
 */
const StandingsSchema = new Schema({
	contestId: {
		type: Number,
		required: true,
		index: true
	},
	participantKey: {
		type: String,
		required: true
	},
	// Embedded contest info (denormalized for performance)
	contestName: {
		type: String
	},
	contestPhase: {
		type: String
	},
	// Participant info
	handle: {
		type: String,
		index: true
	},
	handles: {
		type: [String]
	},
	teamId: {
		type: Number
	},
	teamName: {
		type: String
	},
	participantType: {
		type: String,
		enum: ['CONTESTANT', 'PRACTICE', 'VIRTUAL', 'MANAGER', 'OUT_OF_COMPETITION']
	},
	ghost: {
		type: Boolean,
		default: false
	},
	room: {
		type: Number
	},
	startTimeSeconds: {
		type: Number
	},
	// Standings data
	rank: {
		type: Number,
		required: true,
		index: true
	},
	points: {
		type: Number,
		required: true,
		index: true
	},
	penalty: {
		type: Number,
		required: true
	},
	successfulHackCount: {
		type: Number,
		default: 0
	},
	unsuccessfulHackCount: {
		type: Number,
		default: 0
	},
	lastSubmissionTimeSeconds: {
		type: Number
	},
	// Problem results (embedded array)
	problemResults: {
		type: [ProblemResultSchema],
		default: []
	},
	// Metadata
	isUnofficial: {
		type: Boolean,
		default: false,
		index: true
	},
	lastFetchedAt: {
		type: Date,
		default: Date.now
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
StandingsSchema.index({ contestId: 1, participantKey: 1 }, { unique: true });
StandingsSchema.index({ contestId: 1, rank: 1 });
StandingsSchema.index({ contestId: 1, handle: 1 });
StandingsSchema.index({ contestId: 1, points: -1 });
StandingsSchema.index({ handle: 1, contestId: -1 });
StandingsSchema.index({ contestId: 1, isUnofficial: 1, rank: 1 });
StandingsSchema.index({ handle: 'text', teamName: 'text' });

export { StandingsSchema };

