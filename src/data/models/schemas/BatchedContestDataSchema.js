import mongoose from 'mongoose';

const Schema = mongoose.Schema;

/**
 * Submission item schema (embedded in batched document)
 */
const SubmissionItemSchema = new Schema({
	submissionId: Number,
	problemIndex: String,
	problemName: String,
	problemPoints: Number,
	handle: String,
	handles: [String],
	participantType: String,
	creationTimeSeconds: Number,
	relativeTimeSeconds: Number,
	programmingLanguage: String,
	verdict: String,
	testset: String,
	passedTestCount: Number,
	timeConsumedMillis: Number,
	memoryConsumedBytes: Number,
	lastFetchedAt: Date
}, { _id: false });

/**
 * Rating change item schema (embedded in batched document)
 */
const RatingChangeItemSchema = new Schema({
	handle: String,
	contestName: String,
	rank: Number,
	ratingUpdateTimeSeconds: Number,
	oldRating: Number,
	newRating: Number,
	ratingChange: Number,
	lastFetchedAt: Date
}, { _id: false });

/**
 * Judge protocol sub-schema (for hacks)
 */
const JudgeProtocolSchema = new Schema({
	manual: String,
	protocol: String,
	verdict: String
}, { _id: false });

/**
 * Hack item schema (embedded in batched document)
 */
const HackItemSchema = new Schema({
	hackId: Number,
	problemIndex: String,
	problemName: String,
	hackerHandle: String,
	hackerHandles: [String],
	hackerParticipantType: String,
	defenderHandle: String,
	defenderHandles: [String],
	defenderParticipantType: String,
	creationTimeSeconds: Number,
	verdict: String,
	test: String,
	judgeProtocol: JudgeProtocolSchema,
	lastFetchedAt: Date
}, { _id: false });

/**
 * Batched Contest Data Schema
 * Stores up to 1000 records per document in arrays
 * Each document represents a batch of data for a specific contest
 */
const BatchedContestDataSchema = new Schema({
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
	// Arrays of data (max 1000 items each)
	// Note: Standings are stored in separate BatchedStandingsData collection
	submissions: {
		type: [SubmissionItemSchema],
		default: [],
		validate: {
			validator: function(v) {
				return v.length <= 1000;
			},
			message: 'Submissions array cannot exceed 1000 items'
		}
	},
	ratingChanges: {
		type: [RatingChangeItemSchema],
		default: [],
		validate: {
			validator: function(v) {
				return v.length <= 1000;
			},
			message: 'RatingChanges array cannot exceed 1000 items'
		}
	},
	hacks: {
		type: [HackItemSchema],
		default: [],
		validate: {
			validator: function(v) {
				return v.length <= 1000;
			},
			message: 'Hacks array cannot exceed 1000 items'
		}
	},
	// Metadata
	submissionsCount: {
		type: Number,
		default: 0
	},
	ratingChangesCount: {
		type: Number,
		default: 0
	},
	hacksCount: {
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
BatchedContestDataSchema.index({ contestId: 1, batchIndex: 1 }, { unique: true });

// Indexes for querying
BatchedContestDataSchema.index({ contestId: 1, lastFetchedAt: -1 });
BatchedContestDataSchema.index({ 'submissions.handle': 1, contestId: 1 });
BatchedContestDataSchema.index({ 'submissions.submissionId': 1 });
BatchedContestDataSchema.index({ 'hacks.hackId': 1 });
BatchedContestDataSchema.index({ 'ratingChanges.handle': 1, contestId: 1 });

// Pre-save hook to update counts
BatchedContestDataSchema.pre('save', function(next) {
	this.submissionsCount = this.submissions ? this.submissions.length : 0;
	this.ratingChangesCount = this.ratingChanges ? this.ratingChanges.length : 0;
	this.hacksCount = this.hacks ? this.hacks.length : 0;
	next();
});

export { BatchedContestDataSchema };

