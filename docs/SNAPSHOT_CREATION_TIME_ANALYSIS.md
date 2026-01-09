# Snapshot Creation Time Analysis

## Scenario
- **Contest Duration**: 3 hours = 10,800 seconds
- **Total Submissions**: ~100,000 submissions
- **Participants**: ~10,000 (typical Codeforces contest)
- **Recommended Configuration**: 120s base interval, 10s delta interval

## Snapshot Creation Operations

### Base Snapshot Creation Time

**Operations:**
1. Query all participants from `standingsState` collection: `find({ contestId })`
2. Transform data (convert Map to object for problems)
3. Insert snapshot document into `baseSnapshots` collection

**Time Breakdown (per base snapshot):**

| Operation | Time (10k participants) | Time (20k participants) |
|-----------|------------------------|-------------------------|
| MongoDB query (indexed) | ~50-100ms | ~100-200ms |
| Data transformation | ~20-50ms | ~40-100ms |
| Document insertion (2 MB) | ~50-100ms | ~100-200ms |
| **Total per base snapshot** | **~120-250ms** | **~240-500ms** |

### Delta Snapshot Creation Time

**Operations:**
1. Find last snapshot (base or delta)
2. Find changed participants (current implementation: fetches all)
3. Transform and insert delta document

**Time Breakdown (per delta snapshot):**

| Operation | Time (500 changed) | Time (1000 changed) |
|-----------|-------------------|---------------------|
| Find last snapshot (indexed) | ~1-5ms | ~1-5ms |
| Find changed participants* | ~50-100ms | ~100-200ms |
| Data transformation | ~10-20ms | ~20-40ms |
| Document insertion (100 KB) | ~10-20ms | ~20-40ms |
| **Total per delta snapshot** | **~71-145ms** | **~131-285ms** |

*Note: Current implementation fetches all participants - can be optimized with change tracking

## Total Creation Time for 3-Hour Contest

### Recommended Configuration (120s base / 10s delta)

**Base Snapshots:**
- Count: 90 snapshots
- Time per snapshot: ~120-250ms (10k participants)
- **Total base time**: 90 × 200ms (avg) = **~18 seconds**

**Delta Snapshots:**
- Count: 1,080 snapshots
- Time per snapshot: ~71-145ms (assuming 500 changed participants avg)
- **Total delta time**: 1,080 × 100ms (avg) = **~108 seconds**

**Total Snapshot Creation Time**: **~126 seconds (~2.1 minutes)**

### Storage Optimized Configuration (300s base / 15s delta)

**Base Snapshots:**
- Count: 36 snapshots
- Total base time: 36 × 200ms = **~7.2 seconds**

**Delta Snapshots:**
- Count: 720 snapshots
- Total delta time: 720 × 100ms = **~72 seconds**

**Total Snapshot Creation Time**: **~79 seconds (~1.3 minutes)**

### Performance Optimized Configuration (60s base / 5s delta)

**Base Snapshots:**
- Count: 180 snapshots
- Total base time: 180 × 200ms = **~36 seconds**

**Delta Snapshots:**
- Count: 2,160 snapshots
- Total delta time: 2,160 × 100ms = **~216 seconds**

**Total Snapshot Creation Time**: **~252 seconds (~4.2 minutes)**

## Real-Time Creation During Contest

### Creation Strategy

**Option 1: Scheduled Creation (Recommended)**
- Create snapshots at fixed intervals using a cron job or scheduler
- Base snapshots: Every 120 seconds
- Delta snapshots: Every 10 seconds (between base snapshots)
- **Overhead per interval**: ~100-200ms (non-blocking, async)

**Example Schedule:**
```
t=0s:   Base snapshot (takes ~200ms)
t=10s:  Delta snapshot (takes ~100ms)
t=20s:  Delta snapshot
...
t=120s: Base snapshot
t=130s: Delta snapshot
...
```

**Impact**: Minimal - each snapshot creation is async and doesn't block other operations.

### Option 2: Event-Driven Creation

- Create snapshots when significant changes occur
- Trigger base snapshot when submission rate exceeds threshold
- More complex but potentially more efficient

## Backfilling Snapshots (Post-Contest)

If creating snapshots after contest ends:

### Sequential Creation (Single Process)

**Recommended Configuration (120s/10s):**
- Total snapshots: 90 base + 1,080 delta = 1,170 snapshots
- Sequential time: ~126 seconds
- **Can be parallelized** for faster creation

### Parallel Creation (Optimized)

**With 4 parallel workers:**
- Base snapshots: 90 / 4 = ~23 per worker × 200ms = ~4.6s
- Delta snapshots: 1,080 / 4 = ~270 per worker × 100ms = ~27s
- **Total parallel time**: ~32 seconds (4x faster)

**With 8 parallel workers:**
- Base snapshots: 90 / 8 = ~12 per worker × 200ms = ~2.4s
- Delta snapshots: 1,080 / 8 = ~135 per worker × 100ms = ~13.5s
- **Total parallel time**: ~16 seconds (8x faster)

## Performance Optimizations

### Current Implementation Issues

1. **Delta snapshot finds all participants** - should track only changed ones
2. **Synchronous creation** - can be parallelized
3. **No batching** - each snapshot is individual insert

### Optimization Opportunities

**1. Change Tracking**
```javascript
// Track which participants changed since last snapshot
// Only fetch those, reducing query time by ~90%
// Delta snapshot time: ~71-145ms → ~10-30ms
```

**2. Batch Inserts**
```javascript
// Use bulkWrite for multiple snapshots
// Reduces database round-trips
// 50% faster for batch creation
```

**3. Parallel Processing**
```javascript
// Create multiple snapshots in parallel
// For backfilling: 4-8x faster
```

## Estimated Times Summary

| Configuration | Base | Delta | Total Snapshots | Sequential Time | Parallel (4 workers) | Parallel (8 workers) |
|--------------|------|-------|-----------------|-----------------|---------------------|---------------------|
| **Recommended (120s/10s)** | 90 | 1,080 | 1,170 | **~2.1 min** | **~32 sec** | **~16 sec** |
| Storage Optimized (300s/15s) | 36 | 720 | 756 | **~1.3 min** | **~20 sec** | **~10 sec** |
| Performance Optimized (60s/5s) | 180 | 2,160 | 2,340 | **~4.2 min** | **~63 sec** | **~32 sec** |

*Times assume 10,000 participants and current implementation (no optimizations)*

## Real-World Considerations

### Network Latency
- MongoDB connection latency: +5-20ms per operation
- For remote MongoDB: add 20-50ms per snapshot

### Database Load
- High write load: +10-30% overhead
- Index maintenance: minimal impact (async)

### System Resources
- CPU: Minimal (data transformation)
- Memory: ~2-4 MB per snapshot in memory during creation
- I/O: Write operations (can be optimized with write concern)

## Recommendations

### For Real-Time Creation (During Contest)
✅ **Use recommended configuration (120s/10s)**
- Minimal overhead: ~100-200ms per interval
- Async creation: doesn't block queries
- **Total overhead: < 0.5% of contest time**

### For Backfilling (After Contest)
✅ **Use parallel processing (4-8 workers)**
- Sequential: ~2.1 minutes
- Parallel (8 workers): ~16 seconds
- **8x faster with minimal complexity**

### Future Optimizations
1. Implement change tracking for delta snapshots (90% time reduction)
2. Use bulk operations for batch creation
3. Consider incremental snapshots (only changed fields)

## Conclusion

For a **3-hour contest with 100k submissions**:

- **Real-time creation**: Negligible overhead (~0.5% of contest time)
- **Post-contest backfilling**: ~2.1 minutes sequential, ~16 seconds with 8 parallel workers
- **Recommended configuration (120s/10s)**: Best balance of creation time and query performance

The snapshot creation time is **not a bottleneck** - queries are the primary concern, and snapshots significantly improve query performance.
