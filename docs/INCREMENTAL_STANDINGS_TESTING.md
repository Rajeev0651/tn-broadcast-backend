# Incremental Standings System - Testing Guide

This guide explains how to test and verify the new incremental standings system with snapshots.

## Overview

The new system uses:
- **StandingsState**: Internal simulation state for each participant
- **BaseSnapshots**: Full state snapshots (every 60 seconds)
- **DeltaSnapshots**: Change-only snapshots (every 5 seconds)
- **Query Flow**: Replay from base snapshot + apply deltas to get standings at any time T

## Testing Steps

### Step 1: Initialize Standings State

Before using the system, you need to populate the `standingsState` collection from existing submissions:

```javascript
import { incrementalSimulationService } from './src/services/incrementalSimulationService.js';

// For a specific contest
await incrementalSimulationService.initializeStandingsState(contestId);
```

This processes all submissions and builds the initial participant states.

### Step 2: Create Snapshots

Snapshots need to be created periodically. For testing, you can create them manually:

```javascript
import { snapshotService } from './src/services/snapshotService.js';

const contestId = 1234;
const timestampSeconds = 60; // 60 seconds into contest

// Create a base snapshot (every 60 seconds)
await snapshotService.createBaseSnapshot(contestId, timestampSeconds);

// Create a delta snapshot (every 5 seconds)
await snapshotService.createDeltaSnapshot(contestId, 65);
```

### Step 3: Query Standings at Time T

Test the query flow:

```javascript
import { simulationService } from './src/services/simulationService.js';

const result = await simulationService.getStandingsAtTime(
  contestId,        // e.g., 1234
  timestampSeconds, // e.g., 120 (2 minutes into contest)
  1,                // rankFrom
  100,              // rankTo
  false             // showUnofficial
);

console.log('Contest:', result.contest);
console.log('Problems:', result.problems);
console.log('Standings:', result.rows);
```

### Step 4: Verify Results

Check that:
1. Results are returned correctly
2. Ranks are computed properly
3. Points and penalties match expected values
4. Performance is better than legacy method

## Automated Testing Script

See `scripts/testIncrementalStandings.js` for a complete test script.

## Manual Verification Checklist

- [ ] StandingsState collection has documents for all participants
- [ ] Base snapshots are created at 60-second intervals
- [ ] Delta snapshots are created at 5-second intervals
- [ ] Query returns correct standings for timestamp T
- [ ] Rankings are computed correctly (points desc, penalty asc, lastAcTime asc)
- [ ] Pagination works (rankFrom, rankTo)
- [ ] Unofficial filtering works (showUnofficial flag)
- [ ] Performance is acceptable (< 100ms for typical query)

## Common Issues

### No snapshots found
- **Cause**: Snapshots haven't been created yet
- **Solution**: Run `initializeStandingsState()` then create snapshots

### Incorrect rankings
- **Cause**: State not initialized correctly
- **Solution**: Re-run `initializeStandingsState()` and verify submission processing

### Performance issues
- **Cause**: Too many delta snapshots to apply
- **Solution**: Ensure base snapshots are created regularly (every 60s)

## Monitoring

Check MongoDB collections:

```javascript
// Check standings state
db.standingsState.find({ contestId: 1234 }).count();

// Check base snapshots
db.baseSnapshots.find({ contestId: 1234 }).sort({ timestampSeconds: 1 });

// Check delta snapshots
db.deltaSnapshots.find({ contestId: 1234 }).sort({ timestampSeconds: 1 });
```

## Next Steps

1. Set up automated snapshot creation (cron job or event-driven)
2. Monitor snapshot creation performance
3. Optimize delta snapshot change detection
4. Add caching for frequently queried timestamps
