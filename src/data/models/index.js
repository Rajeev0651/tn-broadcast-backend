import mongoose from 'mongoose';

import {
	UsersSchema,
	ContestsSchema,
	ProblemsSchema,
	StandingsSchema,
	SubmissionsSchema,
	RatingChangesSchema,
	HacksSchema,
	CodeforcesUsersSchema,
	BatchedContestDataSchema,
	BatchedStandingsDataSchema
} from './schemas/index.js';

export const models = {
	Users: mongoose.model('users', UsersSchema),
	Contests: mongoose.model('contests', ContestsSchema),
	Problems: mongoose.model('problems', ProblemsSchema),
	Standings: mongoose.model('standings', StandingsSchema),
	Submissions: mongoose.model('submissions', SubmissionsSchema),
	RatingChanges: mongoose.model('ratingChanges', RatingChangesSchema),
	Hacks: mongoose.model('hacks', HacksSchema),
	CodeforcesUsers: mongoose.model('codeforcesUsers', CodeforcesUsersSchema),
	BatchedContestData: mongoose.model('batchedContestData', BatchedContestDataSchema),
	BatchedStandingsData: mongoose.model('batchedStandingsData', BatchedStandingsDataSchema)
};
