import mongoose from 'mongoose';

const Schema = mongoose.Schema;

/**
 * Problem state sub-schema for snapshots
 */
const SnapshotProblemStateSchema = new Schema({
	solved: Boolean,
	points: Number,
	rejectCount: Number,
	solveTime: Number,
	firstAttemptTime: Number
}, { _id: false });

/**
 * Participant state sub-schema (for snapshot storage)
 * Note: problems is stored as a Map-like object (keyed by problemIndex)
 */
const ParticipantStateSchema = new Schema({
	handle: String,
	participantType: String,
	ghost: Boolean,
	isUnofficial: Boolean,
	totalPoints: Number,
	totalPenalty: Number,
	solvedCount: Number,
	lastAcTime: Number,
	problems: {
		type: Schema.Types.Mixed,  // Stored as object { "A": {...}, "B": {...} }
		default: {}
	},
	hackSuccess: Number,
	hackFail: Number,
	lastSubmissionTime: Number
}, { _id: false });

/**
 * Base Snapshot Schema
 * Stores complete state for ALL participants at a specific timestamp
 * Created infrequently (every 60 seconds)
 */
const BaseSnapshotSchema = new Schema({
	contestId: {
		type: Number,
		required: true,
		index: true
	},
	timestampSeconds: {
		type: Number,
		required: true  // Relative to contest start
	},
	snapshotType: {
		type: String,
		default: 'BASE',
		enum: ['BASE']
	},
	
	// Full state for all participants
	participants: {
		type: [ParticipantStateSchema],
		default: []
	},
	
	participantCount: {
		type: Number,
		default: 0
	},
	
	createdAt: {
		type: Date,
		default: Date.now
	}
}, {
	timestamps: false  // We manage createdAt manually
});

// Compound unique index: contestId + timestampSeconds
BaseSnapshotSchema.index({ contestId: 1, timestampSeconds: 1 }, { unique: true });

// Index for finding nearest snapshot
BaseSnapshotSchema.index({ contestId: 1, timestampSeconds: -1 });

// Pre-save hook to update participantCount
BaseSnapshotSchema.pre('save', function(next) {
	if (Array.isArray(this.participants)) {
		this.participantCount = this.participants.length;
	}
	next();
});

export { BaseSnapshotSchema };
