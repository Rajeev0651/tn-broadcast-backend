import { gql } from 'apollo-server-express';

export default /* GraphQL */ gql`
	""" Contest information """
	type Contest {
		id: Int!
		name: String!
		type: String
		phase: String
		frozen: Boolean
		durationSeconds: Int
		startTimeSeconds: Int
		relativeTimeSeconds: Int
		preparedBy: String
		websiteUrl: String
		description: String
		difficulty: Int
		kind: String
		icpcRegion: String
		country: String
		city: String
		season: String
	}

	""" Problem information """
	type Problem {
		contestId: Int
		problemsetName: String
		index: String!
		name: String!
		type: String
		points: Float
		rating: Int
		tags: [String]
	}

	""" Member of a party """
	type Member {
		handle: String!
		name: String
	}

	""" Party (team or individual) """
	type Party {
		contestId: Int
		members: [Member!]!
		participantType: String
		teamId: Int
		teamName: String
		ghost: Boolean!
		room: Int
		startTimeSeconds: Int
	}

	""" Problem result for a participant """
	type ProblemResult {
		points: Float!
		penalty: Int
		rejectedAttemptCount: Int!
		type: String
		bestSubmissionTimeSeconds: Int
	}

	""" Standings row for a participant """
	type StandingsRow {
		party: Party!
		rank: Int!
		points: Float!
		penalty: Int!
		successfulHackCount: Int!
		unsuccessfulHackCount: Int!
		problemResults: [ProblemResult!]!
		lastSubmissionTimeSeconds: Int
	}

	""" Complete contest standings """
	type ContestStandings {
		contest: Contest!
		problems: [Problem!]!
		rows: [StandingsRow!]!
	}

	""" Submission information """
	type Submission {
		id: Int!
		contestId: Int
		creationTimeSeconds: Int!
		relativeTimeSeconds: Int!
		problem: Problem!
		author: Party!
		programmingLanguage: String!
		verdict: String
		testset: String
		passedTestCount: Int!
		timeConsumedMillis: Int!
		memoryConsumedBytes: Int!
	}

	""" Rating change information """
	type RatingChange {
		contestId: Int!
		contestName: String!
		handle: String!
		rank: Int!
		ratingUpdateTimeSeconds: Int!
		oldRating: Int!
		newRating: Int!
	}

	""" Hack information """
	type JudgeProtocol {
		manual: String
		protocol: String
		verdict: String
	}

	type Hack {
		id: Int!
		creationTimeSeconds: Int!
		hacker: Party!
		defender: Party!
		verdict: String
		problem: Problem!
		test: String
		judgeProtocol: JudgeProtocol
	}

	""" Complete contest data aggregation """
	type CompleteContestData {
		contest: Contest!
		problems: [Problem!]!
		standings: [StandingsRow!]!
		submissions: [Submission!]!
		ratingChanges: [RatingChange!]!
		hacks: [Hack!]!
	}

	type Query {
		""" Get list of all Codeforces contests """
		getContestList(includeGym: Boolean): [Contest!]!

		""" Get complete contest standings (all participants, handles pagination automatically) """
		getContestStandings(contestId: Int!, showUnofficial: Boolean): ContestStandings!

		""" Get all submissions for a contest (handles pagination automatically) """
		getContestSubmissions(contestId: Int!, handle: String): [Submission!]!

		""" Get rating changes after a contest """
		getContestRatingChanges(contestId: Int!): [RatingChange!]!

		""" Get hacks in a contest """
		getContestHacks(contestId: Int!): [Hack!]!

		""" Get complete contest data (standings, submissions, rating changes, hacks) in one call """
		getCompleteContestData(contestId: Int!, showUnofficial: Boolean): CompleteContestData!
	}
`;

