import mongoose from 'mongoose';

const Schema = mongoose.Schema;

/**
 * CodeforcesUsers schema
 * @constructor CodeforcesUsers model constructor
 * @classdesc Stores Codeforces user handles for normalization and additional metadata
 */
const CodeforcesUsersSchema = new Schema({
	handle: {
		type: String,
		required: true,
		unique: true,
		index: true
	},
	// User metadata (can be enriched from user.info API)
	firstName: {
		type: String
	},
	lastName: {
		type: String
	},
	country: {
		type: String,
		index: true
	},
	city: {
		type: String
	},
	organization: {
		type: String,
		index: true
	},
	rating: {
		type: Number,
		index: true
	},
	maxRating: {
		type: Number
	},
	rank: {
		type: String
	},
	maxRank: {
		type: String
	},
	registrationTimeSeconds: {
		type: Number
	},
	lastOnlineTimeSeconds: {
		type: Number,
		index: true
	},
	avatar: {
		type: String
	},
	titlePhoto: {
		type: String
	},
	// Statistics (aggregated)
	totalContests: {
		type: Number,
		default: 0
	},
	totalSubmissions: {
		type: Number,
		default: 0
	},
	totalHacks: {
		type: Number,
		default: 0
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
CodeforcesUsersSchema.index({ rating: -1 });
CodeforcesUsersSchema.index({ country: 1, rating: -1 });
CodeforcesUsersSchema.index({ organization: 1, rating: -1 });
CodeforcesUsersSchema.index({ handle: 'text', firstName: 'text', lastName: 'text' });

export { CodeforcesUsersSchema };

