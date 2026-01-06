# Data Engineering Architecture - Codeforces Contest Data

## Table of Contents

1. [Overview](#overview)
2. [Design Principles](#design-principles)
3. [Collection Schema Design](#collection-schema-design)
4. [Indexing Strategy](#indexing-strategy)
5. [Data Relationships](#data-relationships)
6. [Query Patterns & Optimization](#query-patterns--optimization)
7. [Storage Optimization](#storage-optimization)
8. [Data Update Strategy](#data-update-strategy)
9. [Migration & Maintenance](#migration--maintenance)

---

## Overview

This document outlines the MongoDB data architecture for storing Codeforces contest data. The design focuses on:

- **Complete Data Storage**: All data from Codeforces API is stored
- **Query Optimization**: Fast retrieval for frontend needs
- **Space Efficiency**: Normalization and references to minimize duplication
- **Scalability**: Designed to handle large datasets (1000+ contests, millions of submissions)
- **Flexibility**: Support for various query patterns

### Data Sources

Data is fetched from multiple Codeforces API endpoints:
- `contest.list` → Contests
- `contest.standings` → Contests, Problems, Standings
- `contest.status` → Submissions
- `contest.ratingChanges` → Rating Changes
- `contest.hacks` → Hacks

---

## Design Principles

### 1. Normalization Strategy

**Normalized Collections** (to avoid duplication):
- **Problems**: Problems can appear in multiple contexts (contests, submissions, hacks)
- **CodeforcesUsers**: User handles are referenced across multiple collections

**Denormalized Collections** (for query performance):
- **Contests**: Frequently accessed, relatively small
- **Standings**: Contest info embedded for fast access
- **Submissions**: Problem and author info embedded for common queries

### 2. Reference vs Embedding

**Use References When**:
- Data is large and frequently updated independently
- Data is shared across multiple documents
- Need to avoid duplication

**Use Embedding When**:
- Data is small and rarely changes
- Data is always accessed together
- Query performance is critical

### 3. Indexing Philosophy

- **Primary Indexes**: On unique identifiers (contestId, submissionId, etc.)
- **Query Indexes**: On frequently queried fields
- **Compound Indexes**: For multi-field queries
- **Text Indexes**: For search functionality
- **TTL Indexes**: For temporary/cache data (if needed)

---

## Collection Schema Design

### 1. Contests Collection

**Purpose**: Store contest metadata and basic information

**Schema**:
```javascript
{
  _id: ObjectId,
  contestId: Number,           // Codeforces contest ID (unique)
  name: String,
  type: String,                // "CF", "IOI", "ICPC"
  phase: String,               // "BEFORE", "CODING", "FINISHED", etc.
  frozen: Boolean,
  durationSeconds: Number,
  startTimeSeconds: Number,
  relativeTimeSeconds: Number,
  preparedBy: String,
  websiteUrl: String,
  description: String,
  difficulty: Number,
  kind: String,
  icpcRegion: String,
  country: String,
  city: String,
  season: String,
  
  // Metadata
  lastFetchedAt: Date,         // When data was last fetched from API
  dataVersion: Number,          // Version for cache invalidation
  isGym: Boolean,               // Whether it's a gym contest
  
  // Timestamps
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
```javascript
// Primary index
{ contestId: 1 } // Unique

// Query indexes
{ phase: 1 }
{ type: 1 }
{ startTimeSeconds: -1 } // For sorting by date
{ isGym: 1, phase: 1 } // Compound for filtering

// Text search
{ name: "text", description: "text" }
```

**Storage Considerations**:
- Relatively small documents (~500 bytes each)
- Estimated: ~10,000 contests = ~5 MB
- Low update frequency (only when contest phase changes)

---

### 2. Problems Collection

**Purpose**: Store problem information (normalized to avoid duplication)

**Schema**:
```javascript
{
  _id: ObjectId,
  problemId: String,           // Composite: "contestId:index" (e.g., "566:A")
  contestId: Number,           // Reference to contest
  problemsetName: String,      // If from problemset
  index: String,               // Problem index (A, B, C, etc.)
  name: String,
  type: String,                // "PROGRAMMING", "QUESTION"
  points: Number,
  rating: Number,
  tags: [String],
  
  // Metadata
  lastSeenAt: Date,            // Last time this problem was referenced
  referenceCount: Number,       // How many times referenced (for cleanup)
  
  // Timestamps
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
```javascript
// Primary index
{ problemId: 1 } // Unique

// Query indexes
{ contestId: 1, index: 1 } // Compound for contest problems
{ tags: 1 } // For tag-based search
{ rating: 1 } // For difficulty filtering
{ problemsetName: 1 } // For problemset queries

// Text search
{ name: "text", tags: "text" }
```

**Storage Considerations**:
- Small documents (~300 bytes each)
- Estimated: ~50,000 problems = ~15 MB
- Problems are shared across submissions, hacks, standings

---

### 3. Standings Collection

**Purpose**: Store participant standings for contests

**Schema**:
```javascript
{
  _id: ObjectId,
  contestId: Number,           // Reference to contest
  participantKey: String,       // Composite: "contestId:handle" or "contestId:teamId"
  
  // Embedded contest info (denormalized for performance)
  contestName: String,
  contestPhase: String,
  
  // Participant info
  handle: String,              // Primary handle (for individual)
  handles: [String],           // All handles (for teams)
  teamId: Number,              // If team
  teamName: String,            // If team
  participantType: String,     // "CONTESTANT", "VIRTUAL", etc.
  ghost: Boolean,
  room: Number,
  startTimeSeconds: Number,
  
  // Standings data
  rank: Number,
  points: Number,
  penalty: Number,
  successfulHackCount: Number,
  unsuccessfulHackCount: Number,
  lastSubmissionTimeSeconds: Number,
  
  // Problem results (embedded array)
  problemResults: [{
    problemIndex: String,       // Reference to problem index
    points: Number,
    penalty: Number,
    rejectedAttemptCount: Number,
    type: String,              // "PRELIMINARY", "FINAL"
    bestSubmissionTimeSeconds: Number
  }],
  
  // Metadata
  isUnofficial: Boolean,        // Whether unofficial participant
  lastFetchedAt: Date,
  
  // Timestamps
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
```javascript
// Primary index
{ contestId: 1, participantKey: 1 } // Compound unique

// Query indexes
{ contestId: 1, rank: 1 } // For standings by rank
{ contestId: 1, handle: 1 } // For user-specific queries
{ contestId: 1, points: -1 } // For sorting by points
{ handle: 1, contestId: -1 } // For user's contest history
{ contestId: 1, isUnofficial: 1, rank: 1 } // Compound for filtering

// Text search
{ handle: "text", teamName: "text" }
```

**Storage Considerations**:
- Medium documents (~1-2 KB each)
- Estimated: 10,000 participants × 1,000 contests = 10M documents = ~15-20 GB
- High update frequency during active contests
- Consider sharding by contestId for very large datasets

---

### 4. Submissions Collection

**Purpose**: Store all contest submissions

**Schema**:
```javascript
{
  _id: ObjectId,
  submissionId: Number,        // Codeforces submission ID (unique)
  contestId: Number,           // Reference to contest
  
  // Embedded problem info (denormalized for common queries)
  problemIndex: String,
  problemName: String,
  problemPoints: Number,
  
  // Embedded author info (denormalized)
  handle: String,              // Primary handle
  handles: [String],           // All handles if team
  participantType: String,
  
  // Submission data
  creationTimeSeconds: Number,
  relativeTimeSeconds: Number,
  programmingLanguage: String,
  verdict: String,             // "OK", "WRONG_ANSWER", etc.
  testset: String,
  passedTestCount: Number,
  timeConsumedMillis: Number,
  memoryConsumedBytes: Number,
  
  // Metadata
  lastFetchedAt: Date,
  
  // Timestamps
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
```javascript
// Primary index
{ submissionId: 1 } // Unique

// Query indexes
{ contestId: 1, creationTimeSeconds: -1 } // For contest submissions by time
{ contestId: 1, handle: 1, creationTimeSeconds: -1 } // For user's submissions in contest
{ handle: 1, creationTimeSeconds: -1 } // For user's all submissions
{ contestId: 1, problemIndex: 1 } // For problem-specific submissions
{ contestId: 1, verdict: 1 } // For filtering by verdict
{ contestId: 1, programmingLanguage: 1 } // For language statistics

// Compound indexes for common queries
{ contestId: 1, handle: 1, problemIndex: 1, verdict: 1 }
{ handle: 1, contestId: -1, creationTimeSeconds: -1 }
```

**Storage Considerations**:
- Medium documents (~500 bytes each)
- Estimated: 100,000 submissions × 1,000 contests = 100M documents = ~50 GB
- Very high write volume
- Consider TTL or archival strategy for old submissions
- Sharding recommended by contestId or handle

---

### 5. RatingChanges Collection

**Purpose**: Store rating changes after contests

**Schema**:
```javascript
{
  _id: ObjectId,
  contestId: Number,           // Reference to contest
  handle: String,              // Codeforces handle
  
  // Embedded contest info (denormalized)
  contestName: String,
  
  // Rating data
  rank: Number,
  ratingUpdateTimeSeconds: Number,
  oldRating: Number,
  newRating: Number,
  ratingChange: Number,        // Calculated: newRating - oldRating
  
  // Metadata
  lastFetchedAt: Date,
  
  // Timestamps
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
```javascript
// Primary index
{ contestId: 1, handle: 1 } // Compound unique

// Query indexes
{ contestId: 1, rank: 1 } // For standings by rank
{ handle: 1, ratingUpdateTimeSeconds: -1 } // For user's rating history
{ contestId: 1, ratingChange: -1 } // For biggest gains/losses
{ handle: 1, contestId: -1 } // For user's contest history
```

**Storage Considerations**:
- Small documents (~200 bytes each)
- Estimated: 10,000 participants × 1,000 contests = 10M documents = ~2 GB
- Low update frequency (only after contest ends)
- Good candidate for archival after some time

---

### 6. Hacks Collection

**Purpose**: Store hack information

**Schema**:
```javascript
{
  _id: ObjectId,
  hackId: Number,              // Codeforces hack ID (unique)
  contestId: Number,           // Reference to contest
  
  // Embedded problem info (denormalized)
  problemIndex: String,
  problemName: String,
  
  // Hacker info
  hackerHandle: String,
  hackerHandles: [String],     // If team
  hackerParticipantType: String,
  
  // Defender info
  defenderHandle: String,
  defenderHandles: [String],  // If team
  defenderParticipantType: String,
  
  // Hack data
  creationTimeSeconds: Number,
  verdict: String,             // "HACK_SUCCESSFUL", "HACK_UNSUCCESSFUL", etc.
  test: String,                // Test case data (can be large)
  judgeProtocol: {
    manual: String,
    protocol: String,
    verdict: String
  },
  
  // Metadata
  lastFetchedAt: Date,
  
  // Timestamps
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
```javascript
// Primary index
{ hackId: 1 } // Unique

// Query indexes
{ contestId: 1, creationTimeSeconds: -1 } // For contest hacks by time
{ contestId: 1, hackerHandle: 1 } // For hacker's hacks
{ contestId: 1, defenderHandle: 1 } // For defender's hacks
{ contestId: 1, verdict: 1 } // For filtering by verdict
{ contestId: 1, problemIndex: 1 } // For problem-specific hacks
{ hackerHandle: 1, creationTimeSeconds: -1 } // For hacker's history
```

**Storage Considerations**:
- Variable document size (~500 bytes - 5 KB, depending on test data)
- Estimated: 10,000 hacks × 1,000 contests = 10M documents = ~10-50 GB
- Consider storing test data separately if very large
- Low update frequency

---

### 7. CodeforcesUsers Collection (Optional Normalization)

**Purpose**: Store Codeforces user handles for normalization and additional metadata

**Schema**:
```javascript
{
  _id: ObjectId,
  handle: String,             // Codeforces handle (unique)
  
  // User metadata (can be enriched from user.info API)
  firstName: String,
  lastName: String,
  country: String,
  city: String,
  organization: String,
  rating: Number,
  maxRating: Number,
  rank: String,
  maxRank: String,
  registrationTimeSeconds: Number,
  lastOnlineTimeSeconds: Number,
  avatar: String,
  titlePhoto: String,
  
  // Statistics (aggregated)
  totalContests: Number,
  totalSubmissions: Number,
  totalHacks: Number,
  
  // Metadata
  lastFetchedAt: Date,
  
  // Timestamps
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
```javascript
// Primary index
{ handle: 1 } // Unique

// Query indexes
{ rating: -1 } // For top users
{ country: 1, rating: -1 } // For country rankings
{ organization: 1, rating: -1 } // For organization rankings
{ lastOnlineTimeSeconds: -1 } // For active users

// Text search
{ handle: "text", firstName: "text", lastName: "text" }
```

**Storage Considerations**:
- Small documents (~500 bytes each)
- Estimated: ~1M users = ~500 MB
- Can be populated incrementally as users are encountered
- Optional collection - can be added later if needed

---

## Indexing Strategy

### Index Types

#### 1. Single Field Indexes
Used for simple queries on single fields:
```javascript
{ contestId: 1 }
{ handle: 1 }
{ verdict: 1 }
```

#### 2. Compound Indexes
Used for multi-field queries. Order matters (equality → sort → range):
```javascript
// Equality first, then sort
{ contestId: 1, rank: 1 }
{ contestId: 1, handle: 1, creationTimeSeconds: -1 }

// Equality, then range
{ contestId: 1, creationTimeSeconds: 1, verdict: 1 }
```

#### 3. Text Indexes
For full-text search:
```javascript
{ name: "text", description: "text" }
{ handle: "text" }
```

#### 4. Unique Indexes
For ensuring data integrity:
```javascript
{ contestId: 1 } // Unique
{ submissionId: 1 } // Unique
{ problemId: 1 } // Unique
```

### Index Creation Strategy

**Priority Order**:
1. **Unique indexes** (data integrity)
2. **Primary query indexes** (most frequent queries)
3. **Compound indexes** (multi-field queries)
4. **Text indexes** (search functionality)
5. **Secondary indexes** (less frequent queries)

**Index Maintenance**:
- Monitor index usage with `db.collection.aggregate([{$indexStats: {}}])`
- Remove unused indexes to save space
- Rebuild indexes periodically if needed

---

## Data Relationships

### Relationship Diagram

```
Contests (1) ──→ (N) Standings
    │
    ├──→ (N) Problems
    │
    ├──→ (N) Submissions
    │
    ├──→ (N) RatingChanges
    │
    └──→ (N) Hacks

Problems (1) ──→ (N) Submissions
    │
    └──→ (N) Hacks

CodeforcesUsers (1) ──→ (N) Standings
    │
    ├──→ (N) Submissions
    │
    ├──→ (N) RatingChanges
    │
    ├──→ (N) Hacks (as hacker)
    │
    └──→ (N) Hacks (as defender)
```

### Reference Strategy

**Embedded References** (Denormalized):
- Contest info in Standings (for fast access)
- Problem info in Submissions (for common queries)
- Author info in Submissions (for user queries)

**Foreign Key References** (Normalized):
- `contestId` in all collections (references Contests)
- `problemId` in Submissions and Hacks (references Problems)
- `handle` in Standings, Submissions, RatingChanges (references CodeforcesUsers)

**Lookup Strategy**:
- Use `$lookup` aggregation for normalized data when needed
- Prefer embedded data for common query patterns
- Use references when data is large or frequently updated

---

## Query Patterns & Optimization

### Common Query Patterns

#### 1. Get Contest Standings
```javascript
// Query
db.standings.find({ contestId: 566 })
  .sort({ rank: 1 })
  .limit(100)

// Index used: { contestId: 1, rank: 1 }
```

#### 2. Get User's Submissions in Contest
```javascript
// Query
db.submissions.find({ 
  contestId: 566, 
  handle: "tourist" 
})
  .sort({ creationTimeSeconds: -1 })

// Index used: { contestId: 1, handle: 1, creationTimeSeconds: -1 }
```

#### 3. Get All Submissions for a Problem
```javascript
// Query
db.submissions.find({ 
  contestId: 566, 
  problemIndex: "A" 
})
  .sort({ creationTimeSeconds: 1 })

// Index used: { contestId: 1, problemIndex: 1, creationTimeSeconds: 1 }
```

#### 4. Get User's Rating History
```javascript
// Query
db.ratingChanges.find({ handle: "tourist" })
  .sort({ ratingUpdateTimeSeconds: -1 })

// Index used: { handle: 1, ratingUpdateTimeSeconds: -1 }
```

#### 5. Get Contest Statistics
```javascript
// Aggregation pipeline
db.submissions.aggregate([
  { $match: { contestId: 566 } },
  { $group: {
      _id: "$verdict",
      count: { $sum: 1 }
    }
  }
])

// Index used: { contestId: 1, verdict: 1 }
```

### Query Optimization Tips

1. **Use Covered Queries**: Include only indexed fields in projection
2. **Limit Results**: Always use `.limit()` for pagination
3. **Use Projection**: Only fetch needed fields
4. **Batch Operations**: Use bulk writes for inserts/updates
5. **Aggregation Pipeline**: Use for complex queries instead of multiple finds

---

## Storage Optimization

### 1. Field Naming
- Use short but descriptive field names
- Avoid redundant prefixes (e.g., `contestId` not `contest_id` or `codeforces_contest_id`)

### 2. Data Types
- Use appropriate types (Number vs String)
- Use Date objects for timestamps (not strings)
- Use arrays only when needed

### 3. Compression
- Enable MongoDB compression (WiredTiger default: snappy)
- Consider zstd for better compression (MongoDB 4.2+)

### 4. Document Size
- Keep documents under 16 MB (MongoDB limit)
- For large text fields (like hack test data), consider GridFS or separate collection

### 5. Archival Strategy
- Archive old submissions (>1 year) to separate collection
- Use TTL indexes for temporary data
- Compress archived data

### Storage Estimates

**Per Contest (10,000 participants, 100,000 submissions)**:
- Contest: ~500 bytes
- Problems (10): ~3 KB
- Standings (10,000): ~15 MB
- Submissions (100,000): ~50 MB
- RatingChanges (10,000): ~2 MB
- Hacks (1,000): ~5 MB
- **Total per contest: ~72 MB**

**For 1,000 contests**: ~72 GB

---

## Data Update Strategy

### Update Patterns

#### 1. Initial Data Load
- Fetch complete contest data from API
- Insert all documents in bulk operations
- Create indexes after initial load

#### 2. Incremental Updates
- Check `lastFetchedAt` to determine if update needed
- Update only changed documents
- Use `upsert` operations for idempotency

#### 3. Real-time Updates (Active Contests)
- Poll API more frequently for active contests
- Update standings and submissions incrementally
- Use `findOneAndUpdate` for atomic operations

#### 4. Batch Updates
- Process multiple contests in batches
- Use bulk write operations
- Handle rate limiting

### Update Operations

```javascript
// Upsert contest
db.contests.updateOne(
  { contestId: 566 },
  { 
    $set: { 
      phase: "FINISHED",
      updatedAt: new Date()
    },
    $setOnInsert: {
      createdAt: new Date()
    }
  },
  { upsert: true }
)

// Bulk insert submissions
db.submissions.insertMany(submissions, { ordered: false })

// Update standings
db.standings.updateMany(
  { contestId: 566 },
  { $set: { lastFetchedAt: new Date() } }
)
```

### Conflict Resolution

- Use `lastFetchedAt` timestamps to determine latest data
- Prefer API data over cached data
- Handle race conditions with atomic operations

---

## Migration & Maintenance

### Initial Setup

1. **Create Collections**:
```javascript
db.createCollection("contests")
db.createCollection("problems")
db.createCollection("standings")
db.createCollection("submissions")
db.createCollection("ratingChanges")
db.createCollection("hacks")
db.createCollection("codeforcesUsers")
```

2. **Create Indexes**:
```javascript
// See Indexing Strategy section for all indexes
db.contests.createIndex({ contestId: 1 }, { unique: true })
db.problems.createIndex({ problemId: 1 }, { unique: true })
// ... etc
```

3. **Load Initial Data**:
- Use bulk insert operations
- Process contests in batches
- Monitor progress and errors

### Maintenance Tasks

#### Daily
- Update active contests
- Refresh standings for ongoing contests
- Monitor index usage

#### Weekly
- Update finished contests
- Refresh rating changes
- Analyze query performance

#### Monthly
- Archive old data
- Rebuild indexes if needed
- Analyze storage usage
- Clean up unused data

### Monitoring

**Key Metrics**:
- Collection sizes
- Index sizes
- Query performance
- Write/read ratios
- Storage growth rate

**Tools**:
- MongoDB Compass
- `db.stats()`
- `db.collection.stats()`
- `explain()` for query analysis

---

## Implementation Notes

### Schema Files Location

All Mongoose schemas should be created in:
```
src/data/models/schemas/
  ├── ContestsSchema.js
  ├── ProblemsSchema.js
  ├── StandingsSchema.js
  ├── SubmissionsSchema.js
  ├── RatingChangesSchema.js
  ├── HacksSchema.js
  └── CodeforcesUsersSchema.js
```

### Model Registration

Models should be registered in:
```
src/data/models/index.js
```

### Data Service Layer

Create a service layer for data operations:
```
src/services/
  └── codeforcesDataService.js
```

This service will handle:
- Data fetching from API
- Data transformation
- Database operations
- Error handling
- Caching logic

---

## Future Considerations

### 1. Sharding
- Shard by `contestId` for very large datasets
- Consider sharding Submissions collection first (largest)

### 2. Replication
- Use replica sets for high availability
- Read from secondaries for analytics

### 3. Caching Layer
- Redis for frequently accessed data
- Cache contest standings for active contests
- Cache user statistics

### 4. Analytics
- Create materialized views for statistics
- Pre-aggregate common metrics
- Use aggregation pipeline for complex analytics

### 5. Data Retention
- Implement data retention policies
- Archive old data to cold storage
- Compress historical data

---

## Summary

This data architecture provides:

✅ **Complete Data Storage**: All Codeforces data is stored
✅ **Optimized Queries**: Indexes support all common query patterns
✅ **Space Efficiency**: Normalization and references minimize duplication
✅ **Scalability**: Designed to handle millions of documents
✅ **Flexibility**: Supports various frontend needs
✅ **Maintainability**: Clear structure and documentation

**Estimated Storage**:
- Small scale (100 contests): ~7 GB
- Medium scale (1,000 contests): ~72 GB
- Large scale (10,000 contests): ~720 GB

**Performance Targets**:
- Query response time: <100ms for indexed queries
- Bulk insert: >10,000 documents/second
- Update operations: <50ms for single document updates

---

**Document Version**: 1.0  
**Last Updated**: 2024  
**Maintained By**: Data Engineering Team

