import mongoose from 'mongoose';

const Schema = mongoose.Schema;

/**
 * Problem result sub-schema (for standings)
 */
const ProblemResultSchema = new Schema({
	problemIndex: String,
	points: Number,
	penalty: Number,
	rejectedAttemptCount: Number,
	type: String,
	bestSubmissionTimeSeconds: Number
}, { _id: false });

/**
 * Standings item schema (embedded in batched document)
 */
const StandingsItemSchema = new Schema({
	participantKey: String,
	contestName: String,
	contestPhase: String,
	handle: String,
	handles: [String],
	teamId: Number,
	teamName: String,
	participantType: String,
	ghost: Boolean,
	room: Number,
	startTimeSeconds: Number,
	rank: Number,
	points: Number,
	penalty: Number,
	successfulHackCount: Number,
	unsuccessfulHackCount: Number,
	lastSubmissionTimeSeconds: Number,
	problemResults: [ProblemResultSchema],
	isUnofficial: Boolean,
	lastFetchedAt: Date
}, { _id: false });

/**
 * Batched Standings Data Schema
 * Stores up to 1000 standings records per document
 * Each document represents a batch of standings for a specific contest
 */
const BatchedStandingsDataSchema = new Schema({
	contestId: {
		type: Number,
		required: true,
		index: true
	},
	batchIndex: {
		type: Number,
		required: true,
		default: 0
	},
	// Array of standings (max 1000 items)
	standings: {
		type: [StandingsItemSchema],
		default: [],
		validate: {
			validator: function(v) {
				return v.length <= 1000;
			},
			message: 'Standings array cannot exceed 1000 items'
		}
	},
	// Metadata
	standingsCount: {
		type: Number,
		default: 0
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

// Compound unique index: contestId + batchIndex
BatchedStandingsDataSchema.index({ contestId: 1, batchIndex: 1 }, { unique: true });

// Indexes for querying
BatchedStandingsDataSchema.index({ contestId: 1, lastFetchedAt: -1 });
BatchedStandingsDataSchema.index({ 'standings.handle': 1, contestId: 1 });
BatchedStandingsDataSchema.index({ 'standings.rank': 1, contestId: 1 });
BatchedStandingsDataSchema.index({ 'standings.participantKey': 1 });

// Pre-save hook to update count
BatchedStandingsDataSchema.pre('save', function(next) {
	this.standingsCount = this.standings ? this.standings.length : 0;
	next();
});

export { BatchedStandingsDataSchema };

