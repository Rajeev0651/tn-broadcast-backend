import mongoose from 'mongoose';

const Schema = mongoose.Schema;

/**
 * RatingChanges schema
 * @constructor RatingChanges model constructor
 * @classdesc Stores rating changes after contests
 */
const RatingChangesSchema = new Schema({
	contestId: {
		type: Number,
		required: true,
		index: true
	},
	handle: {
		type: String,
		required: true,
		index: true
	},
	// Embedded contest info (denormalized)
	contestName: {
		type: String
	},
	// Rating data
	rank: {
		type: Number,
		required: true,
		index: true
	},
	ratingUpdateTimeSeconds: {
		type: Number,
		required: true,
		index: true
	},
	oldRating: {
		type: Number,
		required: true
	},
	newRating: {
		type: Number,
		required: true
	},
	ratingChange: {
		type: Number,
		index: true
	},
	// Metadata
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
RatingChangesSchema.index({ contestId: 1, handle: 1 }, { unique: true });
RatingChangesSchema.index({ contestId: 1, rank: 1 });
RatingChangesSchema.index({ handle: 1, ratingUpdateTimeSeconds: -1 });
RatingChangesSchema.index({ contestId: 1, ratingChange: -1 });
RatingChangesSchema.index({ handle: 1, contestId: -1 });

// Pre-save hook to calculate ratingChange
RatingChangesSchema.pre('save', function (next) {
	if (this.isNew || this.isModified('oldRating') || this.isModified('newRating')) {
		this.ratingChange = this.newRating - this.oldRating;
	}
	next();
});

export { RatingChangesSchema };

