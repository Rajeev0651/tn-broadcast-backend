import mongoose from 'mongoose';

/**
 * Schema to track which contests have been fetched and stored
 * This ensures one-time write - contests are only fetched once
 */
const FetchedContestsSchema = new mongoose.Schema({
	contestId: {
		type: Number,
		required: true,
		unique: true,
		index: true
	},
	fetchedAt: {
		type: Date,
		required: true,
		default: Date.now
	},
	// Metadata about what was stored
	hasStandings: {
		type: Boolean,
		default: false
	},
	hasSubmissions: {
		type: Boolean,
		default: false
	},
	hasRatingChanges: {
		type: Boolean,
		default: false
	},
	hasHacks: {
		type: Boolean,
		default: false
	}
}, {
	timestamps: true
});

// Index for fast lookups
FetchedContestsSchema.index({ contestId: 1 }, { unique: true });

export { FetchedContestsSchema };
