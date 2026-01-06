import mongoose from 'mongoose';

import {
	ProblemsSchema,
	BatchedContestDataSchema,
	BatchedStandingsDataSchema,
	IdCounterSchema,
	MediaSchema,
	StreamSchema
} from './schemas/index.js';

export const models = {
	Problems: mongoose.model('problems', ProblemsSchema),
	BatchedContestData: mongoose.model('batchedContestData', BatchedContestDataSchema),
	BatchedStandingsData: mongoose.model('batchedStandingsData', BatchedStandingsDataSchema),
	IdCounter: mongoose.model('idCounter', IdCounterSchema),
	Media: mongoose.model('media', MediaSchema),
	Streams: mongoose.model('streams', StreamSchema)
};
