import mongoose from 'mongoose';

const Schema = mongoose.Schema;

/**
 * Judge protocol sub-schema
 */
const JudgeProtocolSchema = new Schema({
	manual: {
		type: String
	},
	protocol: {
		type: String
	},
	verdict: {
		type: String
	}
}, { _id: false });

/**
 * Hacks schema
 * @constructor Hacks model constructor
 * @classdesc Stores hack information
 */
const HacksSchema = new Schema({
	hackId: {
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
	// Embedded problem info (denormalized)
	problemIndex: {
		type: String,
		required: true,
		index: true
	},
	problemName: {
		type: String
	},
	// Hacker info
	hackerHandle: {
		type: String,
		required: true,
		index: true
	},
	hackerHandles: {
		type: [String]
	},
	hackerParticipantType: {
		type: String,
		enum: ['CONTESTANT', 'PRACTICE', 'VIRTUAL', 'MANAGER', 'OUT_OF_COMPETITION']
	},
	// Defender info
	defenderHandle: {
		type: String,
		required: true,
		index: true
	},
	defenderHandles: {
		type: [String]
	},
	defenderParticipantType: {
		type: String,
		enum: ['CONTESTANT', 'PRACTICE', 'VIRTUAL', 'MANAGER', 'OUT_OF_COMPETITION']
	},
	// Hack data
	creationTimeSeconds: {
		type: Number,
		required: true,
		index: true
	},
	verdict: {
		type: String,
		enum: ['HACK_SUCCESSFUL', 'HACK_UNSUCCESSFUL', 'INVALID_INPUT', 'GENERATOR_INCOMPILABLE', 'GENERATOR_CRASHED', 'IGNORED', 'TESTING', 'OTHER'],
		index: true
	},
	test: {
		type: String
	},
	judgeProtocol: {
		type: JudgeProtocolSchema
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
HacksSchema.index({ contestId: 1, creationTimeSeconds: -1 });
HacksSchema.index({ contestId: 1, hackerHandle: 1 });
HacksSchema.index({ contestId: 1, defenderHandle: 1 });
HacksSchema.index({ contestId: 1, verdict: 1 });
HacksSchema.index({ contestId: 1, problemIndex: 1 });
HacksSchema.index({ hackerHandle: 1, creationTimeSeconds: -1 });

export { HacksSchema };

