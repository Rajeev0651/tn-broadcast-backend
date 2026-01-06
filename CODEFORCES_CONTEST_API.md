# Codeforces Contest API Documentation

## Table of Contents

1. [Introduction](#introduction)
2. [Contest API Methods](#contest-api-methods)
3. [Authentication](#authentication)
4. [Rate Limiting](#rate-limiting)
5. [Response Format](#response-format)
6. [Usage Examples](#usage-examples)
7. [Data Models](#data-models)
8. [Best Practices](#best-practices)
9. [References](#references)

---

## Introduction

The Codeforces API provides programmatic access to contest data, problems, submissions, and user information. This document focuses specifically on contest-related API endpoints.

### Base URL

All API requests should be made to:
```
https://codeforces.com/api/
```

### API Overview

- **Format**: REST API returning JSON responses
- **Authentication**: Optional (required for private data)
- **Rate Limit**: 1 request per 2 seconds
- **JSONP Support**: Available via `jsonp` parameter

### General Response Structure

All API responses follow this structure:

```json
{
  "status": "OK" | "FAILED",
  "result": [...],
  "comment": "Error message (if status is FAILED)"
}
```

---

## Contest API Methods

### 1. contest.list

Returns a list of all contests.

**Endpoint**: `contest.list`

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `gym` | Boolean | No | If `true`, includes gym contests. Default: `false` |

**Example Request**:

```
GET https://codeforces.com/api/contest.list?gym=false
```

**Example Response**:

```json
{
  "status": "OK",
  "result": [
    {
      "id": 1,
      "name": "Codeforces Beta Round #1",
      "type": "CF",
      "phase": "FINISHED",
      "frozen": false,
      "durationSeconds": 7200,
      "startTimeSeconds": 1266588000,
      "relativeTimeSeconds": 2147483647
    },
    ...
  ]
}
```

**Response Fields**:

- `id`: Contest ID
- `name`: Contest name
- `type`: Contest type (CF, IOI, ICPC, etc.)
- `phase`: Contest phase (BEFORE, CODING, PENDING_SYSTEM_TEST, SYSTEM_TEST, FINISHED)
- `frozen`: Boolean indicating if contest is frozen
- `durationSeconds`: Contest duration in seconds
- `startTimeSeconds`: Contest start time (Unix timestamp)
- `relativeTimeSeconds`: Relative time from start

---

### 2. contest.standings

Returns the description of the contest and the requested part of the standings.

**Endpoint**: `contest.standings`

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contestId` | Integer | Yes | The ID of the contest |
| `from` | Integer | No | 1-based index of the first row to return. Default: 1 |
| `count` | Integer | No | Number of rows to return. Default: all. Maximum recommended: 10000 per request |
| `handles` | String | No | Semicolon-separated list of handles. Returns only these users |
| `room` | Integer | No | If specified, only participants from this room are shown |
| `showUnofficial` | Boolean | No | If `true`, shows all participants including unofficial. Default: `false` |

**Example Request**:

```
GET https://codeforces.com/api/contest.standings?contestId=566&from=1&count=5&showUnofficial=true
```

**Example Response**:

```json
{
  "status": "OK",
  "result": {
    "contest": {
      "id": 566,
      "name": "VK Cup 2015 - Finals, online mirror",
      "type": "CF",
      "phase": "FINISHED",
      ...
    },
    "problems": [
      {
        "contestId": 566,
        "index": "A",
        "name": "Matching Names",
        "type": "PROGRAMMING",
        "points": 500.0,
        "tags": ["strings", "trees"]
      },
      ...
    ],
    "rows": [
      {
        "party": {
          "contestId": 566,
          "members": [{"handle": "tourist"}],
          "participantType": "CONTESTANT",
          "ghost": false,
          "room": 1,
          "startTimeSeconds": 1438279800
        },
        "rank": 1,
        "points": 5000.0,
        "penalty": 0,
        "successfulHackCount": 0,
        "unsuccessfulHackCount": 0,
        "problemResults": [...]
      },
      ...
    ]
  }
}
```

---

### 3. contest.status

Returns submissions for specified contest.

**Endpoint**: `contest.status`

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contestId` | Integer | Yes | The ID of the contest |
| `handle` | String | No | Codeforces user handle. If specified, returns only submissions by this user |
| `from` | Integer | No | 1-based index of the first submission to return. Default: 1 |
| `count` | Integer | No | Number of submissions to return. Default: all. Maximum recommended: 10000 per request |

**Example Request**:

```
GET https://codeforces.com/api/contest.status?contestId=566&handle=tourist&from=1&count=10
```

**Example Response**:

```json
{
  "status": "OK",
  "result": [
    {
      "id": 12345678,
      "contestId": 566,
      "creationTimeSeconds": 1438279800,
      "relativeTimeSeconds": 120,
      "problem": {
        "contestId": 566,
        "index": "A",
        "name": "Matching Names",
        "type": "PROGRAMMING",
        "points": 500.0,
        "tags": ["strings", "trees"]
      },
      "author": {
        "contestId": 566,
        "members": [{"handle": "tourist"}],
        "participantType": "CONTESTANT",
        "ghost": false,
        "room": 1,
        "startTimeSeconds": 1438279800
      },
      "programmingLanguage": "GNU C++14",
      "verdict": "OK",
      "testset": "TESTS",
      "passedTestCount": 50,
      "timeConsumedMillis": 1000,
      "memoryConsumedBytes": 256000000
    },
    ...
  ]
}
```

**Verdict Values**:

- `OK`: Accepted
- `WRONG_ANSWER`: Wrong answer
- `TIME_LIMIT_EXCEEDED`: Time limit exceeded
- `MEMORY_LIMIT_EXCEEDED`: Memory limit exceeded
- `RUNTIME_ERROR`: Runtime error
- `COMPILATION_ERROR`: Compilation error
- `CHALLENGED`: Challenged (hacked)
- And others...

---

### 4. contest.hacks

Returns list of hacks in the specified contest.

**Endpoint**: `contest.hacks`

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contestId` | Integer | Yes | The ID of the contest |
| `asManager` | Boolean | No | If `true`, returns information available to contest managers. Requires authentication |

**Example Request**:

```
GET https://codeforces.com/api/contest.hacks?contestId=566
```

**Example Response**:

```json
{
  "status": "OK",
  "result": [
    {
      "id": 12345,
      "creationTimeSeconds": 1438279800,
      "hacker": {
        "contestId": 566,
        "members": [{"handle": "hacker"}],
        "participantType": "CONTESTANT",
        "ghost": false,
        "room": 1,
        "startTimeSeconds": 1438279800
      },
      "defender": {
        "contestId": 566,
        "members": [{"handle": "defender"}],
        "participantType": "CONTESTANT",
        "ghost": false,
        "room": 1,
        "startTimeSeconds": 1438279800
      },
      "verdict": "HACK_SUCCESSFUL",
      "problem": {
        "contestId": 566,
        "index": "A",
        "name": "Matching Names",
        "type": "PROGRAMMING",
        "points": 500.0,
        "tags": ["strings", "trees"]
      },
      "test": "test case data",
      "judgeProtocol": {
        "manual": "false",
        "protocol": "protocol details"
      }
    },
    ...
  ]
}
```

**Verdict Values**:

- `HACK_SUCCESSFUL`: Hack was successful
- `HACK_UNSUCCESSFUL`: Hack was unsuccessful
- `INVALID_INPUT`: Invalid input
- `GENERATOR_INCOMPILABLE`: Generator compilation error
- `GENERATOR_CRASHED`: Generator crashed
- `IGNORED`: Ignored
- `TESTING`: Testing
- `OTHER`: Other verdict

---

### 5. contest.ratingChanges

Returns rating changes after the contest.

**Endpoint**: `contest.ratingChanges`

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contestId` | Integer | Yes | The ID of the contest |

**Example Request**:

```
GET https://codeforces.com/api/contest.ratingChanges?contestId=566
```

**Example Response**:

```json
{
  "status": "OK",
  "result": [
    {
      "contestId": 566,
      "contestName": "VK Cup 2015 - Finals, online mirror",
      "handle": "tourist",
      "rank": 1,
      "ratingUpdateTimeSeconds": 1438280100,
      "oldRating": 3000,
      "newRating": 3050
    },
    ...
  ]
}
```

**Response Fields**:

- `contestId`: Contest ID
- `contestName`: Contest name
- `handle`: User handle
- `rank`: User rank in the contest
- `ratingUpdateTimeSeconds`: Time when rating was updated (Unix timestamp)
- `oldRating`: Rating before the contest
- `newRating`: Rating after the contest

**Note**: This method only returns results for finished contests that affect ratings.

---

## Authentication

### Public Access

Most contest data is publicly available and does not require authentication. You can access:
- Contest list
- Contest standings (public data)
- Public submissions
- Rating changes
- Public hacks

### Authenticated Access

Authentication is required for:
- Private contest data
- Manager-level information (using `asManager` parameter)
- Accessing hacks during a contest

### API Key Generation

1. Log in to your Codeforces account
2. Go to [API Settings](https://codeforces.com/settings/api)
3. Generate an API key and secret

### Request Signature

For authenticated requests, you must generate a signature using SHA-512:

**Signature Generation Process**:

1. Generate a random 6-character string (alphanumeric)
2. Create the signature string:
   ```
   <rand>/<methodName>?<sortedParams>#<secret>
   ```
   Where:
   - `<rand>`: 6-character random string
   - `<methodName>`: API method name (e.g., `contest.hacks`)
   - `<sortedParams>`: All parameters (including `apiKey` and `time`) sorted lexicographically and joined with `&`
   - `<secret>`: Your API secret

3. Compute SHA-512 hash of the signature string
4. Append the random string to the hash: `<rand><hash>`

**Example**:

```javascript
// Pseudocode
const rand = "123456";
const methodName = "contest.hacks";
const params = {
  contestId: 566,
  apiKey: "your_api_key",
  time: 1438279800
};
const sortedParams = "apiKey=your_api_key&contestId=566&time=1438279800";
const secret = "your_secret";
const signatureString = `${rand}/${methodName}?${sortedParams}#${secret}`;
const hash = sha512(signatureString);
const apiSig = `${rand}${hash}`;
```

**Authenticated Request Example**:

```
GET https://codeforces.com/api/contest.hacks?contestId=566&apiKey=YOUR_API_KEY&time=1438279800&apiSig=123456<sha512_hash>
```

### Node.js Authentication Example

```javascript
import crypto from 'crypto';

function generateApiSignature(methodName, params, secret) {
  // Generate random 6-character string
  const rand = Math.random().toString(36).substring(2, 8);
  
  // Add apiKey and time to params
  params.apiKey = 'YOUR_API_KEY';
  params.time = Math.floor(Date.now() / 1000);
  
  // Sort parameters lexicographically
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  
  // Create signature string
  const signatureString = `${rand}/${methodName}?${sortedParams}#${secret}`;
  
  // Compute SHA-512 hash
  const hash = crypto.createHash('sha512').update(signatureString).digest('hex');
  
  // Return random string + hash
  return {
    apiKey: params.apiKey,
    time: params.time,
    apiSig: `${rand}${hash}`
  };
}

// Usage
const params = { contestId: 566 };
const secret = 'YOUR_SECRET';
const auth = generateApiSignature('contest.hacks', params, secret);

const url = `https://codeforces.com/api/contest.hacks?contestId=566&apiKey=${auth.apiKey}&time=${auth.time}&apiSig=${auth.apiSig}`;
```

---

## Rate Limiting

### Limits

- **Maximum Frequency**: 1 request per 2 seconds
- **Violation**: Exceeding the limit results in a "Call limit exceeded" error

### Error Response

```json
{
  "status": "FAILED",
  "comment": "Call limit exceeded"
}
```

### Best Practices

1. **Implement Request Throttling**: Add delays between requests
2. **Cache Responses**: Store frequently accessed data locally
3. **Batch Requests**: Combine multiple queries when possible
4. **Error Handling**: Implement retry logic with exponential backoff

### Node.js Rate Limiting Example

```javascript
class CodeforcesAPI {
  constructor() {
    this.lastRequestTime = 0;
    this.minInterval = 2000; // 2 seconds in milliseconds
  }

  async makeRequest(url) {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
    
    const response = await fetch(url);
    return response.json();
  }
}
```

---

## Response Format

### Standard Response Structure

All API responses follow this format:

```json
{
  "status": "OK" | "FAILED",
  "result": <data> | null,
  "comment": <error_message> | null
}
```

### Status Values

- **OK**: Request was successful
- **FAILED**: Request failed (check `comment` for details)

### Error Response Example

```json
{
  "status": "FAILED",
  "comment": "contestId: Contest with id 999999 not found"
}
```

### JSONP Support

The API supports JSONP for cross-origin requests. Add the `jsonp` parameter:

**Example**:

```
GET https://codeforces.com/api/contest.list?jsonp=parseResponse
```

**Response**:

```javascript
parseResponse({"status":"OK","result":[...]});
```

---

## Usage Examples

### Basic GET Request (Node.js)

```javascript
async function getContestList(includeGym = false) {
  const url = `https://codeforces.com/api/contest.list?gym=${includeGym}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK') {
      return data.result;
    } else {
      throw new Error(data.comment);
    }
  } catch (error) {
    console.error('Error fetching contest list:', error);
    throw error;
  }
}
```

### Get Contest Standings

```javascript
async function getContestStandings(contestId, from = 1, count = 10) {
  const url = `https://codeforces.com/api/contest.standings?contestId=${contestId}&from=${from}&count=${count}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK') {
      return {
        contest: data.result.contest,
        problems: data.result.problems,
        standings: data.result.rows
      };
    } else {
      throw new Error(data.comment);
    }
  } catch (error) {
    console.error('Error fetching contest standings:', error);
    throw error;
  }
}
```

### Get User Submissions in Contest

```javascript
async function getUserContestSubmissions(contestId, handle, count = 10) {
  const url = `https://codeforces.com/api/contest.status?contestId=${contestId}&handle=${handle}&count=${count}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK') {
      return data.result;
    } else {
      throw new Error(data.comment);
    }
  } catch (error) {
    console.error('Error fetching submissions:', error);
    throw error;
  }
}
```

### Error Handling Example

```javascript
async function safeApiCall(url) {
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'FAILED') {
      // Handle specific error cases
      if (data.comment.includes('Call limit exceeded')) {
        console.error('Rate limit exceeded. Please wait before retrying.');
        // Implement retry logic with delay
        await new Promise(resolve => setTimeout(resolve, 3000));
        return safeApiCall(url); // Retry
      } else if (data.comment.includes('not found')) {
        throw new Error('Resource not found');
      } else {
        throw new Error(data.comment);
      }
    }
    
    return data.result;
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error. Please check your connection.');
    }
    throw error;
  }
}
```

### Integration with Express/GraphQL (Example)

```javascript
// Express route example
app.get('/api/contests/:contestId/standings', async (req, res) => {
  try {
    const { contestId } = req.params;
    const { from = 1, count = 10 } = req.query;
    
    const standings = await getContestStandings(
      parseInt(contestId),
      parseInt(from),
      parseInt(count)
    );
    
    res.json(standings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## Data Models

### Contest Object

```typescript
interface Contest {
  id: number;
  name: string;
  type: "CF" | "IOI" | "ICPC";
  phase: "BEFORE" | "CODING" | "PENDING_SYSTEM_TEST" | "SYSTEM_TEST" | "FINISHED";
  frozen: boolean;
  durationSeconds: number;
  startTimeSeconds?: number;
  relativeTimeSeconds?: number;
  preparedBy?: string;
  websiteUrl?: string;
  description?: string;
  difficulty?: number;
  kind?: string;
  icpcRegion?: string;
  country?: string;
  city?: string;
  season?: string;
}
```

### Problem Object

```typescript
interface Problem {
  contestId?: number;
  problemsetName?: string;
  index: string;
  name: string;
  type: "PROGRAMMING" | "QUESTION";
  points?: number;
  rating?: number;
  tags: string[];
}
```

### Submission Object

```typescript
interface Submission {
  id: number;
  contestId?: number;
  creationTimeSeconds: number;
  relativeTimeSeconds: number;
  problem: Problem;
  author: Party;
  programmingLanguage: string;
  verdict?: "OK" | "WRONG_ANSWER" | "TIME_LIMIT_EXCEEDED" | "MEMORY_LIMIT_EXCEEDED" | "RUNTIME_ERROR" | "COMPILATION_ERROR" | "CHALLENGED" | "FAILED" | "PARTIAL" | "SECURITY_VIOLATION" | "CRASHED" | "INPUT_PREPARATION_CRASHED" | "CHALLENGED" | "SKIPPED" | "TESTING" | "REJECTED";
  testset: "SAMPLES" | "PRETESTS" | "TESTS" | "CHALLENGES" | "TESTS" | "HTESTS";
  passedTestCount: number;
  timeConsumedMillis: number;
  memoryConsumedBytes: number;
}
```

### Party Object

```typescript
interface Party {
  contestId?: number;
  members: Member[];
  participantType: "CONTESTANT" | "PRACTICE" | "VIRTUAL" | "MANAGER" | "OUT_OF_COMPETITION";
  teamId?: number;
  teamName?: string;
  ghost: boolean;
  room?: number;
  startTimeSeconds?: number;
}
```

### Member Object

```typescript
interface Member {
  handle: string;
  name?: string;
}
```

### RatingChange Object

```typescript
interface RatingChange {
  contestId: number;
  contestName: string;
  handle: string;
  rank: number;
  ratingUpdateTimeSeconds: number;
  oldRating: number;
  newRating: number;
}
```

### Hack Object

```typescript
interface Hack {
  id: number;
  creationTimeSeconds: number;
  hacker: Party;
  defender: Party;
  verdict?: "HACK_SUCCESSFUL" | "HACK_UNSUCCESSFUL" | "INVALID_INPUT" | "GENERATOR_INCOMPILABLE" | "GENERATOR_CRASHED" | "IGNORED" | "TESTING" | "OTHER";
  problem: Problem;
  test?: string;
  judgeProtocol?: {
    manual: string;
    protocol: string;
    verdict: string;
  };
}
```

### Standings Row Object

```typescript
interface StandingsRow {
  party: Party;
  rank: number;
  points: number;
  penalty: number;
  successfulHackCount: number;
  unsuccessfulHackCount: number;
  problemResults: ProblemResult[];
  lastSubmissionTimeSeconds?: number;
}
```

### ProblemResult Object

```typescript
interface ProblemResult {
  points: number;
  penalty?: number;
  rejectedAttemptCount: number;
  type: "PRELIMINARY" | "FINAL";
  bestSubmissionTimeSeconds?: number;
}
```

---

## Best Practices

### 1. Caching Strategies

**Why Cache?**
- Reduce API calls and avoid rate limiting
- Improve response times
- Handle temporary API unavailability

**What to Cache:**
- Contest list (changes infrequently)
- Contest standings (update periodically)
- Problem information (rarely changes)

**Implementation Example**:

```javascript
class CachedCodeforcesAPI {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = {
      contestList: 3600000, // 1 hour
      standings: 60000,     // 1 minute
      problems: 86400000    // 24 hours
    };
  }

  async getContestList(useCache = true) {
    const cacheKey = 'contestList';
    
    if (useCache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL.contestList) {
        return cached.data;
      }
    }
    
    const data = await fetchContestList();
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
    
    return data;
  }
}
```

### 2. Error Handling

**Always Check Status**:
```javascript
if (response.status === 'FAILED') {
  // Handle error appropriately
  throw new Error(response.comment);
}
```

**Handle Network Errors**:
```javascript
try {
  const response = await fetch(url);
  // ...
} catch (error) {
  if (error.name === 'TypeError') {
    // Network error
  } else {
    // Other errors
  }
}
```

**Retry Logic**:
```javascript
async function fetchWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetch(url);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

### 3. Request Optimization

**Batch Requests When Possible**:
- Instead of multiple individual requests, combine data fetching
- Use pagination parameters (`from`, `count`) efficiently

**Use Specific Parameters**:
- Use `handles` parameter to filter standings instead of fetching all
- Use `showUnofficial=false` when you only need official participants

**Example**:
```javascript
// Instead of fetching all standings and filtering
const allStandings = await getContestStandings(contestId, 1, 10000);
const userStandings = allStandings.filter(s => s.party.members[0].handle === handle);

// Use handles parameter
const userStandings = await getContestStandings(contestId, 1, 1, handle);
```

### 4. Common Pitfalls

**1. Rate Limiting**
- ❌ Making requests in loops without delays
- ✅ Implement request throttling

**2. Not Handling Errors**
- ❌ Assuming all requests succeed
- ✅ Always check `status` field

**3. Not Validating Input**
- ❌ Passing invalid contest IDs
- ✅ Validate parameters before making requests

**4. Ignoring Cache**
- ❌ Fetching same data repeatedly
- ✅ Implement caching for static/semi-static data

**5. Not Handling Missing Data**
- ❌ Assuming all fields exist
- ✅ Use optional chaining or default values

### 5. Performance Tips

1. **Parallel Requests**: When fetching independent data, use `Promise.all()`
   ```javascript
   const [contests, standings] = await Promise.all([
     getContestList(),
     getContestStandings(contestId)
   ]);
   ```

2. **Pagination**: For large datasets, fetch in chunks
   ```javascript
   async function getAllStandings(contestId, chunkSize = 10000) {
     let allStandings = [];
     let from = 1;
     
     while (true) {
       const chunk = await getContestStandings(contestId, from, chunkSize);
       if (chunk.length === 0) break;
       allStandings.push(...chunk);
       from += chunkSize;
     }
     
     return allStandings;
   }
   ```

3. **Request Deduplication**: Prevent duplicate requests
   ```javascript
   const pendingRequests = new Map();
   
   async function deduplicatedRequest(url) {
     if (pendingRequests.has(url)) {
       return pendingRequests.get(url);
     }
     
     const promise = fetch(url).then(res => res.json());
     pendingRequests.set(url, promise);
     
     try {
       const result = await promise;
       return result;
     } finally {
       pendingRequests.delete(url);
     }
   }
   ```

---

## References

### Official Documentation

- **Codeforces API Help**: [https://codeforces.com/apiHelp](https://codeforces.com/apiHelp)
- **Codeforces API Methods**: [https://codeforces.com/apiHelp/methods](https://codeforces.com/apiHelp/methods)
- **API Settings**: [https://codeforces.com/settings/api](https://codeforces.com/settings/api)

### Related Resources

- **Codeforces Website**: [https://codeforces.com](https://codeforces.com)
- **Codeforces Blog**: [https://codeforces.com/blog](https://codeforces.com/blog)

### Additional Notes

- All timestamps are in Unix time (seconds since epoch)
- Contest IDs are unique and persistent
- Some data may not be available immediately after a contest ends
- Rating changes are only available for rated contests
- Gym contests may have different data availability

---

## Changelog

- **2024**: Initial documentation created
- Keep this document updated as Codeforces API evolves

---

**Last Updated**: Based on Codeforces API as of 2024

**Maintained By**: Project Team

