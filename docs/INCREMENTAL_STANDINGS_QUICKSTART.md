# Incremental Standings System - Quick Start Guide

## Overview

The new incremental standings system allows you to query contest standings at any timestamp T efficiently using snapshots, avoiding expensive recomputation from raw submissions.

## Quick Test Flow

### Step 1: Initialize Standings State

First, populate the `standingsState` collection from existing submissions for a contest:

```bash
node scripts/initStandingsState.js <contestId>
```

**Example:**
```bash
node scripts/initStandingsState.js 1234
```

This will:
- Process all submissions for the contest
- Build participant states incrementally
- Store minimal state needed for replay

### Step 2: Create Snapshots

Snapshots can be created manually or automatically. For testing:

```javascript
import { snapshotService } from './src/services/snapshotService.js';

// Create base snapshot (full state) - every 60 seconds
await snapshotService.createBaseSnapshot(contestId, 0);    // Contest start
await snapshotService.createBaseSnapshot(contestId, 60);   // After 1 minute
await snapshotService.createBaseSnapshot(contestId, 120);  // After 2 minutes

// Create delta snapshots (changes only) - every 5 seconds
await snapshotService.createDeltaSnapshot(contestId, 5);
await snapshotService.createDeltaSnapshot(contestId, 10);
await snapshotService.createDeltaSnapshot(contestId, 65);  // After base at 60
```

### Step 3: Run Complete Test

Run the comprehensive test script:

```bash
node scripts/testIncrementalStandings.js <contestId>
```

**Example:**
```bash
node scripts/testIncrementalStandings.js 1234
```

This will:
- Check existing data
- Initialize standings state if needed
- Create test snapshots
- Test queries at various timestamps
- Compare performance with legacy method

### Step 4: Query Standings

Use the simulation service (automatically uses new system if snapshots exist):

```javascript
import { simulationService } from './src/services/simulationService.js';

const result = await simulationService.getStandingsAtTime(
  contestId,      // e.g., 1234
  120,            // timestampSeconds (2 minutes into contest)
  1,              // rankFrom
  100,            // rankTo
  false           // showUnofficial
);

console.log('Top 100 at 2 minutes:', result.rows);
```

## Using the API

The existing API endpoints automatically use the new system:

```javascript
// GraphQL Query
query {
  contestStandings(
    contestId: 1234
    timestampSeconds: 120
    rankFrom: 1
    rankTo: 100
    showUnofficial: false
  ) {
    contest { id name }
    problems { index name points }
    rows {
      rank
      points
      penalty
      party { members { handle } }
      problemResults { points rejectedAttemptCount }
    }
  }
}
```

## Verification Checklist

After running the test, verify:

- [ ] `standingsState` collection has participant documents
- [ ] `baseSnapshots` collection has snapshots at 60s intervals
- [ ] `deltaSnapshots` collection has snapshots at 5s intervals
- [ ] Queries return correct standings
- [ ] Rankings are accurate (points desc, penalty asc)
- [ ] Performance is better than legacy method

## MongoDB Collections to Monitor

```javascript
// Check standings state
db.standingsState.find({ contestId: 1234 }).count()

// Check snapshots
db.baseSnapshots.find({ contestId: 1234 }).sort({ timestampSeconds: 1 })
db.deltaSnapshots.find({ contestId: 1234 }).sort({ timestampSeconds: 1 })

// Sample participant state
db.standingsState.findOne({ contestId: 1234 })
```

## Common Commands

```bash
# Initialize state for a contest
node scripts/initStandingsState.js 1234

# Run full test suite
node scripts/testIncrementalStandings.js 1234

# Check MongoDB collections
mongo <database>
> db.standingsState.find({ contestId: 1234 }).count()
> db.baseSnapshots.find({ contestId: 1234 })
> db.deltaSnapshots.find({ contestId: 1234 })
```

## Troubleshooting

**No snapshots found:**
- Run `initStandingsState.js` first
- Create snapshots manually or set up automated creation

**Incorrect rankings:**
- Re-initialize standings state
- Verify submissions are processed correctly

**Performance issues:**
- Ensure base snapshots are created every 60 seconds
- Check delta snapshot sizes (should be < 5% of participants changed)

## Next Steps

1. Set up automated snapshot creation (cron job or event-driven)
2. Monitor snapshot storage growth
3. Optimize change detection for delta snapshots
4. Add caching for frequently accessed timestamps
