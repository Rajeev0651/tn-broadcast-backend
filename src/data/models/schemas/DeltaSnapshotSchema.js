import mongoose from 'mongoose';

const Schema = mongoose.Schema;

/**
 * Delta change sub-schema
 */
const DeltaChangeSchema = new Schema({
	handle: {
		type: String,
		required: true
	},
	op: {
		type: String,
		required: true,
		enum: ['UPDATE', 'INSERT']
	},
	state: {
		type: Schema.Types.Mixed,  // Partial state - only changed fields
		required: true
	}
}, { _id: false });

/**
 * Delta Snapshot Schema
 * Stores only participants whose state changed since last snapshot
 * Created frequently (every 5 seconds)
 */
const DeltaSnapshotSchema = new Schema({
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
		default: 'DELTA',
		enum: ['DELTA']
	},
	baseSnapshotTimestamp: {
		type: Number,
		required: true  // Reference to base snapshot timestamp
	},
	
	// Only changed participants
	changes: {
		type: [DeltaChangeSchema],
		default: []
	},
	
	changeCount: {
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
DeltaSnapshotSchema.index({ contestId: 1, timestampSeconds: 1 }, { unique: true });

// Index for delta queries (finding deltas for a base snapshot)
DeltaSnapshotSchema.index({ contestId: 1, baseSnapshotTimestamp: 1, timestampSeconds: 1 });

// Index for finding snapshots
DeltaSnapshotSchema.index({ contestId: 1, timestampSeconds: -1 });

// Pre-save hook to update changeCount
DeltaSnapshotSchema.pre('save', function(next) {
	if (Array.isArray(this.changes)) {
		this.changeCount = this.changes.length;
	}
	next();
});

export { DeltaSnapshotSchema };
