import { gql } from 'apollo-server-express';

export default /* GraphQL */ gql`
	type Query {
		""" Get list of all Codeforces contests """
		contestList(includeGym: Boolean): [Contest!]!
		
		""" Get contest information by ID """
		contest(id: Int!): Contest
		
		""" Get contest standings """
		contestStandings(contestId: Int!, from: Int, count: Int, showUnofficial: Boolean): ContestStandings!
		
		""" Get contest submissions """
		contestSubmissions(contestId: Int!, count: Int, handle: String): ContestSubmissions!
		
		""" Get problem statistics for a contest """
		contestProblems(contestId: Int!): [Problem!]!
		
		""" Get contest standings at a specific timestamp (simulated) """
		contestStandingsSimulated(contestId: Int!, timestamp: Int!, from: Int, count: Int, showUnofficial: Boolean): ContestStandings!
		
		""" Get contest submissions at a specific timestamp (simulated) """
		contestSubmissionsSimulated(contestId: Int!, timestamp: Int!, count: Int, handle: String): ContestSubmissions!
		
		""" Get simulation state for a contest """
		simulationState(contestId: Int!, currentTimestamp: Int!, speedMultiplier: Float): SimulationState!
		
		""" Get incremental standings at a specific timestamp """
		incrementalStandings(contestId: Int!, timestampSeconds: Int!, rankFrom: Int, rankTo: Int, showUnofficial: Boolean, fileMode: Boolean): ContestStandings!
	}

	type Contest {
		id: Int!
		name: String!
		type: String!
		phase: String!
		frozen: Boolean!
		durationSeconds: Int!
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

	type Problem {
		contestId: Int
		index: String!
		name: String!
		type: String!
		points: Float
		rating: Int
		tags: [String!]!
	}

	type Member {
		handle: String!
		name: String
	}

	type Party {
		contestId: Int
		members: [Member!]!
		participantType: String!
		ghost: Boolean!
		room: Int
		startTimeSeconds: Int
	}

	type ProblemResult {
		points: Float!
		rejectedAttemptCount: Int!
		type: String!
		bestSubmissionTimeSeconds: Int
	}

	type StandingsRow {
		party: Party!
		rank: Int!
		points: Float!
		penalty: Int!
		successfulHackCount: Int!
		unsuccessfulHackCount: Int!
		problemResults: [ProblemResult!]!
	}

	type ContestStandings {
		contest: Contest!
		problems: [Problem!]!
		rows: [StandingsRow!]!
	}

	type Submission {
		id: Int!
		contestId: Int
		creationTimeSeconds: Int!
		relativeTimeSeconds: Int!
		problem: Problem!
		author: Party!
		programmingLanguage: String!
		verdict: String
		testset: String!
		passedTestCount: Int!
		timeConsumedMillis: Int!
		memoryConsumedBytes: Int!
	}

	type ContestSubmissions {
		submissions: [Submission!]!
	}

	type SimulationState {
		contestId: Int!
		startTime: Int!
		currentTime: Int!
		speedMultiplier: Float!
		isRunning: Boolean!
		progress: Float!
	}
`;

