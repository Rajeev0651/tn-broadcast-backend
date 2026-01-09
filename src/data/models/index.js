import mongoose from 'mongoose';

import {
	ProblemsSchema,
	BatchedContestDataSchema,
	BatchedStandingsDataSchema,
	IdCounterSchema,
	MediaSchema,
	StreamSchema,
	FetchedContestsSchema,
	ContestsSchema,
	StandingsStateSchema,
	BaseSnapshotSchema,
	DeltaSnapshotSchema
} from './schemas/index.js';

export const models = {
	Problems: mongoose.model('problems', ProblemsSchema),
	BatchedContestData: mongoose.model('batchedContestData', BatchedContestDataSchema),
	BatchedStandingsData: mongoose.model('batchedStandingsData', BatchedStandingsDataSchema),
	IdCounter: mongoose.model('idCounter', IdCounterSchema),
	Media: mongoose.model('media', MediaSchema),
	Streams: mongoose.model('streams', StreamSchema),
	FetchedContests: mongoose.model('fetchedContests', FetchedContestsSchema),
	Contests: mongoose.model('contests', ContestsSchema),
	StandingsState: mongoose.model('standingsState', StandingsStateSchema),
	BaseSnapshots: mongoose.model('baseSnapshots', BaseSnapshotSchema),
	DeltaSnapshots: mongoose.model('deltaSnapshots', DeltaSnapshotSchema)
};
