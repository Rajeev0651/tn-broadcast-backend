import mongoose from 'mongoose';

const Schema = mongoose.Schema;

/**
 * Problem state sub-schema (normalized object - problemIndex as key)
 * Note: This is stored as a Map-like structure in MongoDB
 */
const ProblemStateSchema = new Schema({
	solved: {
		type: Boolean,
		default: false
	},
	points: {
		type: Number,
		default: 0
	},
	rejectCount: {
		type: Number,
		default: 0
	},
	solveTime: {
		type: Number,
		default: null
	},
	firstAttemptTime: {
		type: Number,
		default: null
	}
}, { _id: false });

/**
 * Standings State Schema
 * Stores minimal participant state needed to replay standings incrementally
 * This is the internal simulation state, not the final standings
 */
const StandingsStateSchema = new Schema({
	contestId: {
		type: Number,
		required: true,
		index: true
	},
	handle: {
		type: String,
		required: true
	},
	participantType: {
		type: String,
		default: 'CONTESTANT'
	},
	ghost: {
		type: Boolean,
		default: false
	},
	isUnofficial: {
		type: Boolean,
		default: false
	},
	
	// Per-problem state (normalized object)
	// Key: problemIndex (e.g., "A", "B", "C")
	// Value: ProblemStateSchema
	problems: {
		type: Map,
		of: ProblemStateSchema,
		default: {}
	},
	
	// Derived totals (cached for fast ranking)
	totalPoints: {
		type: Number,
		default: 0
	},
	totalPenalty: {
		type: Number,
		default: 0  // In minutes
	},
	solvedCount: {
		type: Number,
		default: 0
	},
	lastAcTime: {
		type: Number,
		default: null  // Last accepted submission time (relativeTimeSeconds)
	},
	
	// Hack counts
	hackSuccess: {
		type: Number,
		default: 0
	},
	hackFail: {
		type: Number,
		default: 0
	},
	
	// Metadata for ranking
	lastSubmissionTime: {
		type: Number,
		default: null  // Last submission (any verdict) time (relativeTimeSeconds)
	},
	
	// Snapshot metadata
	snapshotVersion: {
		type: Number,
		default: 0  // Which snapshot this state corresponds to
	},
	
	updatedAt: {
		type: Date,
		default: Date.now
	}
}, {
	timestamps: false  // We manage updatedAt manually
});

// Compound unique index: contestId + handle
StandingsStateSchema.index({ contestId: 1, handle: 1 }, { unique: true });

// Ranking query index
StandingsStateSchema.index({ contestId: 1, totalPoints: -1, totalPenalty: 1 });

// Snapshot query index
StandingsStateSchema.index({ contestId: 1, snapshotVersion: 1 });

// Pre-save hook to update updatedAt
StandingsStateSchema.pre('save', function(next) {
	this.updatedAt = new Date();
	next();
});

export { StandingsStateSchema };
