# Snapshot Interval Analysis for 3-Hour Contest

## Scenario
- **Contest Duration**: 3 hours = 10,800 seconds
- **Total Submissions**: ~100,000 submissions
- **Submissions per Document**: 1,000 (batched storage)
- **Average Submission Rate**: ~9.26 submissions/second (peak rates much higher)

## Current Default Values
- **Base Snapshot Interval**: 60 seconds (every minute)
- **Delta Snapshot Interval**: 5 seconds

## Analysis for 3-Hour Contest

### Current Configuration (60s base, 5s delta)

**Base Snapshots:**
- Total snapshots: 10,800 / 60 = **180 base snapshots**
- Storage per snapshot: ~2 MB (assuming 10,000 participants)
- Total base storage: 180 × 2 MB = **~360 MB**

**Delta Snapshots:**
- Total snapshots: 10,800 / 5 = **2,160 delta snapshots**
- Storage per snapshot: ~100 KB (assuming 5% change rate = 500 participants)
- Total delta storage: 2,160 × 100 KB = **~216 MB**

**Total Storage**: ~576 MB per contest

**Query Performance:**
- Max deltas to apply: 60 (if query is 1 second after base snapshot)
- Average deltas to apply: ~30
- Query time: Base lookup (~1ms) + Delta application (~10ms) + Sorting (~50ms) = **~61ms**

### Recommended Configuration for 3-Hour Contest

#### Option 1: Balanced (Recommended for Most Cases)
- **Base Snapshot Interval**: **120 seconds (2 minutes)**
- **Delta Snapshot Interval**: **10 seconds**

**Rationale:**
- Better storage efficiency (fewer base snapshots)
- Still maintains good query granularity (10-second precision)
- Acceptable query performance (max 120 deltas to apply)

**Metrics:**
- Base snapshots: 10,800 / 120 = **90 snapshots**
- Delta snapshots: 10,800 / 10 = **1,080 snapshots**
- Storage: ~180 MB (base) + ~108 MB (delta) = **~288 MB** (50% reduction)
- Max deltas per query: 120 (worst case: 2 seconds after base)
- Query time: ~80ms (still acceptable)

#### Option 2: Storage Optimized (For Large Contests)
- **Base Snapshot Interval**: **300 seconds (5 minutes)**
- **Delta Snapshot Interval**: **15 seconds**

**Rationale:**
- Maximum storage efficiency
- Good for contests with many participants (20k+)
- Acceptable for historical replay (15-second granularity)

**Metrics:**
- Base snapshots: 10,800 / 300 = **36 snapshots**
- Delta snapshots: 10,800 / 15 = **720 snapshots**
- Storage: ~72 MB (base) + ~72 MB (delta) = **~144 MB** (75% reduction)
- Max deltas per query: 300
- Query time: ~150ms (still reasonable for historical queries)

#### Option 3: High Performance (For Real-Time/Active Contests)
- **Base Snapshot Interval**: **60 seconds (1 minute)**
- **Delta Snapshot Interval**: **3 seconds**

**Rationale:**
- Best query performance (minimal deltas to apply)
- Higher granularity for real-time leaderboards
- Higher storage cost (acceptable for active monitoring)

**Metrics:**
- Base snapshots: 10,800 / 60 = **180 snapshots**
- Delta snapshots: 10,800 / 3 = **3,600 snapshots**
- Storage: ~360 MB (base) + ~360 MB (delta) = **~720 MB**
- Max deltas per query: 60
- Query time: ~50ms (optimal performance)

## Submission Rate Considerations

With **100k submissions over 3 hours**:
- **Average rate**: ~9.26 submissions/second
- **Peak rate** (typically first hour): ~20-30 submissions/second
- **Steady state** (middle hour): ~8-12 submissions/second
- **Final hour**: ~15-20 submissions/second

### Adaptive Strategy (Advanced)

Consider adaptive intervals based on submission rate:

```javascript
// High activity (first hour, peak times)
if (submissionRate > 20/second) {
  baseInterval = 60;   // 1 minute
  deltaInterval = 3;   // 3 seconds
}
// Normal activity (middle hour)
else if (submissionRate > 10/second) {
  baseInterval = 120;  // 2 minutes
  deltaInterval = 10;  // 10 seconds
}
// Low activity (quiet periods)
else {
  baseInterval = 300;  // 5 minutes
  deltaInterval = 15;  // 15 seconds
}
```

## Recommended Values for Your Scenario

**For a 3-hour contest with 100k submissions:**

| Priority | Base Interval | Delta Interval | Storage | Query Time | Use Case |
|----------|--------------|----------------|---------|------------|----------|
| **Recommended** | **120 seconds** | **10 seconds** | ~288 MB | ~80ms | Balanced performance/storage |
| Storage First | 300 seconds | 15 seconds | ~144 MB | ~150ms | Large contests, archival |
| Performance First | 60 seconds | 5 seconds | ~576 MB | ~61ms | Real-time, active monitoring |

## Implementation

To configure these values, update `snapshotService.js`:

```javascript
async createSnapshot(contestId, timestampSeconds) {
  // Recommended for 3-hour contest with 100k submissions
  const BASE_INTERVAL = 120;  // 2 minutes
  const DELTA_INTERVAL = 10;  // 10 seconds
  
  // Check if this should be a base snapshot
  if (timestampSeconds % BASE_INTERVAL === 0) {
    return await this.createBaseSnapshot(contestId, timestampSeconds);
  } else {
    // Only create delta if it's at DELTA_INTERVAL boundary
    if (timestampSeconds % DELTA_INTERVAL === 0) {
      return await this.createDeltaSnapshot(contestId, timestampSeconds);
    }
    // Skip if not at an interval boundary
    return null;
  }
}
```

## Storage Breakdown (Recommended: 120s/10s)

For **10,000 participants**:
- **Base snapshot**: 10,000 participants × 200 bytes = 2 MB
- **Delta snapshot**: ~500 changed participants × 200 bytes = 100 KB
- **Total storage**: (90 × 2 MB) + (1,080 × 100 KB) = **~288 MB**

For **20,000 participants**:
- **Base snapshot**: 4 MB
- **Delta snapshot**: ~200 KB
- **Total storage**: (90 × 4 MB) + (1,080 × 200 KB) = **~576 MB**

## Query Performance Analysis

**Worst case** (query at timestamp = base + 1 second):
- Must apply all 12 deltas (10-second intervals) = ~12ms
- Base lookup: ~1ms
- Sorting 10k participants: ~50ms
- **Total: ~63ms** ✅

**Best case** (query exactly at base snapshot):
- No deltas to apply = ~1ms
- Sorting: ~50ms
- **Total: ~51ms** ✅

**Average case**:
- Apply ~6 deltas: ~6ms
- Base lookup: ~1ms
- Sorting: ~50ms
- **Total: ~57ms** ✅

## Recommendations Summary

✅ **Use 120-second base intervals + 10-second delta intervals**

**Why:**
1. **50% storage reduction** vs current (288 MB vs 576 MB)
2. **Still excellent query performance** (~80ms worst case)
3. **10-second granularity** is sufficient for historical replay
4. **Balanced** for both storage and performance
5. **Scalable** for contests with 10k-20k participants

**Trade-offs:**
- Slightly more deltas to apply (max 12 vs 12, but more consistent)
- Still maintains sub-100ms query time
- 10-second precision is acceptable for most use cases

## Next Steps

1. Update snapshot creation logic to use 120s/10s intervals
2. Monitor actual storage usage during first contest
3. Adjust if needed based on participant count and query patterns
4. Consider adaptive intervals for future optimization
