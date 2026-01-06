import mongoose from 'mongoose';

const Schema = mongoose.Schema;

/**
 * Submissions schema
 * @constructor Submissions model constructor
 * @classdesc Stores all contest submissions
 */
const SubmissionsSchema = new Schema({
	submissionId: {
		type: Number,
		required: true,
		unique: true,
		index: true
	},
	contestId: {
		type: Number,
		required: true,
		index: true
	},
	// Embedded problem info (denormalized for common queries)
	problemIndex: {
		type: String,
		required: true,
		index: true
	},
	problemName: {
		type: String
	},
	problemPoints: {
		type: Number
	},
	// Embedded author info (denormalized)
	handle: {
		type: String,
		required: true,
		index: true
	},
	handles: {
		type: [String]
	},
	participantType: {
		type: String,
		enum: ['CONTESTANT', 'PRACTICE', 'VIRTUAL', 'MANAGER', 'OUT_OF_COMPETITION']
	},
	// Submission data
	creationTimeSeconds: {
		type: Number,
		required: true,
		index: true
	},
	relativeTimeSeconds: {
		type: Number,
		required: true
	},
	programmingLanguage: {
		type: String,
		required: true,
		index: true
	},
	verdict: {
		type: String,
		enum: ['OK', 'WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'RUNTIME_ERROR', 'COMPILATION_ERROR', 'CHALLENGED', 'FAILED', 'PARTIAL', 'SECURITY_VIOLATION', 'CRASHED', 'INPUT_PREPARATION_CRASHED', 'SKIPPED', 'TESTING', 'REJECTED'],
		index: true
	},
	testset: {
		type: String,
		enum: ['SAMPLES', 'PRETESTS', 'TESTS', 'CHALLENGES', 'HTESTS']
	},
	passedTestCount: {
		type: Number,
		required: true,
		default: 0
	},
	timeConsumedMillis: {
		type: Number,
		required: true
	},
	memoryConsumedBytes: {
		type: Number,
		required: true
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
SubmissionsSchema.index({ contestId: 1, creationTimeSeconds: -1 });
SubmissionsSchema.index({ contestId: 1, handle: 1, creationTimeSeconds: -1 });
SubmissionsSchema.index({ handle: 1, creationTimeSeconds: -1 });
SubmissionsSchema.index({ contestId: 1, problemIndex: 1 });
SubmissionsSchema.index({ contestId: 1, verdict: 1 });
SubmissionsSchema.index({ contestId: 1, programmingLanguage: 1 });
SubmissionsSchema.index({ contestId: 1, handle: 1, problemIndex: 1, verdict: 1 });
SubmissionsSchema.index({ handle: 1, contestId: -1, creationTimeSeconds: -1 });

export { SubmissionsSchema };

