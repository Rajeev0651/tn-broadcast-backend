# GraphQL Integration with NodeCG Bundle

This document describes the GraphQL API integration between the Backend GraphQL server and the NodeCG Codeforces Stats bundle.

## Overview

The Backend now exposes a GraphQL API for Codeforces contest data that the NodeCG bundle can consume. The integration allows real-time synchronization of contest statistics for broadcast graphics.

## GraphQL Schema

### Queries

#### `contestList(includeGym: Boolean): [Contest!]!`
Returns a list of all Codeforces contests.

**Example:**
```graphql
query {
  contestList(includeGym: false) {
    id
    name
    type
    phase
  }
}
```

#### `contest(id: Int!): Contest`
Get contest information by ID.

**Example:**
```graphql
query {
  contest(id: 1234) {
    id
    name
    type
    phase
    durationSeconds
    startTimeSeconds
  }
}
```

#### `contestStandings(contestId: Int!, from: Int, count: Int, showUnofficial: Boolean): ContestStandings!`
Get contest standings with pagination support.

**Parameters:**
- `contestId` (required): Contest ID
- `from` (optional): Starting rank (1-indexed)
- `count` (optional): Number of participants to fetch
- `showUnofficial` (optional): Include unofficial participants

**Example:**
```graphql
query {
  contestStandings(contestId: 1234, from: 1, count: 100) {
    contest {
      id
      name
    }
    problems {
      index
      name
      points
    }
    rows {
      rank
      points
      party {
        members {
          handle
        }
      }
    }
  }
}
```

#### `contestSubmissions(contestId: Int!, count: Int, handle: String): ContestSubmissions!`
Get contest submissions.

**Parameters:**
- `contestId` (required): Contest ID
- `count` (optional): Number of submissions to fetch
- `handle` (optional): Filter by user handle

**Example:**
```graphql
query {
  contestSubmissions(contestId: 1234, count: 50) {
    submissions {
      id
      problem {
        index
        name
      }
      author {
        members {
          handle
        }
      }
      verdict
      creationTimeSeconds
    }
  }
}
```

#### `contestProblems(contestId: Int!): [Problem!]!`
Get problem statistics for a contest.

**Example:**
```graphql
query {
  contestProblems(contestId: 1234) {
    index
    name
    points
    rating
    tags
  }
}
```

## Type Definitions

### Contest
```graphql
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
```

### Problem
```graphql
type Problem {
  contestId: Int
  index: String!
  name: String!
  type: String!
  points: Float
  rating: Int
  tags: [String!]!
}
```

### ContestStandings
```graphql
type ContestStandings {
  contest: Contest!
  problems: [Problem!]!
  rows: [StandingsRow!]!
}
```

### ContestSubmissions
```graphql
type ContestSubmissions {
  submissions: [Submission!]!
}
```

## Implementation Details

### Backend Files

1. **GraphQL Types**: `src/gql/types/codeforces.js`
   - Defines all GraphQL type definitions for Codeforces data

2. **GraphQL Resolvers**: `src/gql/resolvers/codeforces.js`
   - Implements query resolvers using the `codeforcesAPI` helper
   - Handles error cases and input validation

3. **Resolver Index**: `src/gql/resolvers/index.js`
   - Merges all resolvers using `@graphql-tools/merge`

### NodeCG Bundle Files

1. **GraphQL Client**: `bundles/codeforces-stats/extension/graphql-client.js`
   - Updated to match the new backend GraphQL schema
   - Methods:
     - `fetchContestInfo(contestId)`
     - `fetchStandings(contestId, from, count)`
     - `fetchProblemStats(contestId)`
     - `fetchSubmissions(contestId, count)`

2. **Extension**: `bundles/codeforces-stats/extension/index.js`
   - Uses the GraphQL client to fetch data
   - Updates NodeCG Replicants with fetched data

## Usage

### Starting the Backend

1. Navigate to the Backend directory:
   ```bash
   cd F:\TechNonsense\Project\Backend
   ```

2. Install dependencies (if not already done):
   ```bash
   npm install
   ```

3. Configure `.env` file (copy from `_env` template)

4. Start the server:
   ```bash
   npm start
   # or for development
   npm run dev
   ```

5. GraphQL endpoint will be available at:
   - `http://localhost:4000/graphql` (default port)
   - GraphQL Playground available in development mode

### Configuring NodeCG Bundle

1. Open NodeCG dashboard
2. Navigate to "Codeforces Control Panel"
3. Configure:
   - **GraphQL API Endpoint**: `http://localhost:4000/graphql`
   - **Contest ID**: The Codeforces contest ID you want to track
   - **Refresh Interval**: How often to poll for updates (default: 5000ms)
   - **Enable Polling**: Toggle to start/stop data fetching

### Example Configuration

- **API Endpoint**: `http://localhost:4000/graphql`
- **Contest ID**: `1234`
- **Refresh Interval**: `5000` (5 seconds)
- **Enable Polling**: ✓ Enabled

## Data Flow

1. **NodeCG Extension** polls the GraphQL API at configured intervals
2. **Backend GraphQL Resolver** receives the query
3. **CodeforcesAPI Helper** fetches data from Codeforces REST API (with rate limiting and caching)
4. **GraphQL Response** is returned to NodeCG
5. **Replicants** are updated with new data
6. **Graphics** automatically update via Replicant subscriptions

## Features

### Rate Limiting
- Backend enforces 2-second minimum interval between Codeforces API requests
- Automatic retry with exponential backoff on rate limit errors

### Caching
- Contest list: 1 hour TTL
- Standings: 5 minutes (active) / 1 hour (finished)
- Submissions: 5 minutes TTL
- Rating changes: 1 hour TTL

### Pagination
- Standings and submissions automatically handle pagination
- Fetches all data regardless of API limits
- Efficient chunk-based fetching (10,000 items per request)

### Error Handling
- Input validation for contest IDs
- User-friendly error messages
- Automatic retry on network errors
- Graceful handling of missing data

## Testing

### Test GraphQL Queries in Playground

1. Start the backend server
2. Open GraphQL Playground at `http://localhost:4000/graphql`
3. Try these example queries:

```graphql
# Get contest info
query {
  contest(id: 1234) {
    id
    name
    phase
  }
}

# Get top 10 standings
query {
  contestStandings(contestId: 1234, from: 1, count: 10) {
    contest {
      name
    }
    rows {
      rank
      points
      party {
        members {
          handle
        }
      }
    }
  }
}

# Get recent submissions
query {
  contestSubmissions(contestId: 1234, count: 10) {
    submissions {
      id
      problem {
        index
        name
      }
      author {
        members {
          handle
        }
      }
      verdict
    }
  }
}
```

## Troubleshooting

### Backend not responding
- Check if MongoDB is running
- Verify `.env` configuration
- Check server logs in `logs/` directory

### GraphQL errors
- Verify contest ID exists
- Check Codeforces API status
- Review backend logs for detailed error messages

### NodeCG bundle not updating
- Verify API endpoint URL is correct
- Check if polling is enabled
- Review NodeCG console for errors
- Verify contest ID is valid

## Future Enhancements

- [ ] Add subscriptions for real-time updates (WebSocket)
- [ ] Add mutations for storing contest data in MongoDB
- [ ] Add filtering and sorting options
- [ ] Add caching at NodeCG level
- [ ] Add support for multiple contests simultaneously

