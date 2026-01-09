# Incremental Standings API Guide

Complete guide for using the Incremental Standings API endpoints.

## Base URL

```
http://localhost:4000/api/incremental-standings
```

## Quick Start

### 1. Initialize Standings State

**POST** `/api/incremental-standings/:contestId/initialize`

Initialize standings state from existing submissions. **Run this first** before creating snapshots.

```bash
curl -X POST http://localhost:4000/api/incremental-standings/1234/initialize
```

**Response:**
```json
{
  "success": true,
  "message": "Standings state initialized for contest 1234",
  "data": {
    "contestId": 1234,
    "participantCount": 10000,
    "initializationTimeMs": 5234
  }
}
```

### 2. Create Snapshots

#### Create Base Snapshot

**POST** `/api/incremental-standings/:contestId/snapshots/base`

```bash
curl -X POST http://localhost:4000/api/incremental-standings/1234/snapshots/base \
  -H "Content-Type: application/json" \
  -d '{"timestampSeconds": 0}'
```

**Body:**
```json
{
  "timestampSeconds": 0
}
```

**Response:**
```json
{
  "success": true,
  "message": "Base snapshot created for contest 1234 at timestamp 0",
  "data": {
    "contestId": 1234,
    "timestampSeconds": 0,
    "snapshotId": "...",
    "participantCount": 10000,
    "creationTimeMs": 234,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Create Delta Snapshot

**POST** `/api/incremental-standings/:contestId/snapshots/delta`

```bash
curl -X POST http://localhost:4000/api/incremental-standings/1234/snapshots/delta \
  -H "Content-Type: application/json" \
  -d '{"timestampSeconds": 10}'
```

#### Create Snapshot (Auto-detect)

**POST** `/api/incremental-standings/:contestId/snapshots`

Automatically creates base (every 120s) or delta (every 10s) snapshot.

```bash
curl -X POST http://localhost:4000/api/incremental-standings/1234/snapshots \
  -H "Content-Type: application/json" \
  -d '{"timestampSeconds": 120}'
```

### 3. Query Standings at Time

**GET** `/api/incremental-standings/:contestId/standings`

```bash
curl "http://localhost:4000/api/incremental-standings/1234/standings?timestampSeconds=120&rankFrom=1&rankTo=100"
```

**Query Parameters:**
- `timestampSeconds` (required): Timestamp relative to contest start (seconds)
- `rankFrom` (optional, default: 1): Starting rank (1-indexed)
- `rankTo` (optional, default: null): Ending rank (1-indexed, inclusive)
- `showUnofficial` (optional, default: false): Include unofficial participants

**Response:**
```json
{
  "success": true,
  "data": {
    "contestId": 1234,
    "timestampSeconds": 120,
    "rankFrom": 1,
    "rankTo": 100,
    "showUnofficial": false,
    "queryTimeMs": 57,
    "contest": {
      "id": 1234,
      "name": "Contest Name",
      ...
    },
    "problems": [...],
    "rows": [
      {
        "party": {
          "contestId": 1234,
          "members": [{"handle": "user123", "name": null}],
          "participantType": "CONTESTANT",
          ...
        },
        "rank": 1,
        "points": 2500,
        "penalty": 120,
        "successfulHackCount": 2,
        "unsuccessfulHackCount": 0,
        "problemResults": [...]
      },
      ...
    ],
    "rowCount": 100
  }
}
```

## Complete Workflow Example

### Step 1: Initialize

```bash
POST /api/incremental-standings/1234/initialize
```

### Step 2: Create Base Snapshots

Create base snapshots at key timestamps (every 120 seconds):

```bash
# At contest start (t=0)
POST /api/incremental-standings/1234/snapshots/base
Body: {"timestampSeconds": 0}

# After 2 minutes (t=120)
POST /api/incremental-standings/1234/snapshots/base
Body: {"timestampSeconds": 120}

# After 4 minutes (t=240)
POST /api/incremental-standings/1234/snapshots/base
Body: {"timestampSeconds": 240}
```

### Step 3: Create Delta Snapshots

Create delta snapshots at intermediate timestamps (every 10 seconds):

```bash
# t=10
POST /api/incremental-standings/1234/snapshots/delta
Body: {"timestampSeconds": 10}

# t=20
POST /api/incremental-standings/1234/snapshots/delta
Body: {"timestampSeconds": 20}

# ... continue for all 10-second intervals (but not at base intervals)
```

### Step 4: Query Standings

```bash
# Top 100 at 2 minutes
GET /api/incremental-standings/1234/standings?timestampSeconds=120&rankFrom=1&rankTo=100

# Top 10 at 5 minutes
GET /api/incremental-standings/1234/standings?timestampSeconds=300&rankFrom=1&rankTo=10

# Ranks 100-200 at 10 minutes
GET /api/incremental-standings/1234/standings?timestampSeconds=600&rankFrom=100&rankTo=200
```

## Utility Endpoints

### Get Standings State Info

**GET** `/api/incremental-standings/:contestId/state/info`

Check if standings state is initialized and get participant count.

```bash
curl http://localhost:4000/api/incremental-standings/1234/state/info
```

### Get Snapshot Info

**GET** `/api/incremental-standings/:contestId/snapshots/info`

Get information about all snapshots for a contest.

```bash
curl http://localhost:4000/api/incremental-standings/1234/snapshots/info
```

**Response:**
```json
{
  "success": true,
  "data": {
    "contestId": 1234,
    "baseSnapshots": {
      "count": 90,
      "first": {...},
      "last": {...},
      "sample": [...]
    },
    "deltaSnapshots": {
      "count": 1080,
      "first": {...},
      "last": {...},
      "sample": [...]
    },
    "totalSnapshots": 1170
  }
}
```

## Recommended Snapshot Intervals

For a 3-hour contest with 100k submissions:

- **Base Snapshots**: Every 120 seconds (0, 120, 240, 360, ...)
- **Delta Snapshots**: Every 10 seconds (10, 20, 30, 40, 50, 70, 80, ...)

**Note**: Don't create delta snapshots at base snapshot timestamps.

## Postman Collection

Import the Postman collection:

```
Agent/Incremental_Standings_API.postman_collection.json
```

The collection includes:
- All endpoints with examples
- Pre-configured variables (`base_url`, `contest_id`)
- Complete workflow examples
- Multiple query variants

## Error Handling

All endpoints return errors in the following format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

Common error codes:
- `400`: Bad Request (invalid parameters)
- `500`: Internal Server Error (server-side error)

## Performance Notes

- **Initialization**: Takes ~5-10 seconds for 100k submissions
- **Base Snapshot Creation**: ~200ms per snapshot
- **Delta Snapshot Creation**: ~100ms per snapshot
- **Query Time**: < 100ms typically (depends on number of deltas to apply)

## Examples

### Example: Complete Setup for Contest 1234

```bash
# 1. Initialize
curl -X POST http://localhost:4000/api/incremental-standings/1234/initialize

# 2. Create base snapshots (script)
for ts in 0 120 240 360 480 600; do
  curl -X POST http://localhost:4000/api/incremental-standings/1234/snapshots/base \
    -H "Content-Type: application/json" \
    -d "{\"timestampSeconds\": $ts}"
done

# 3. Create delta snapshots (script)
for ts in 10 20 30 40 50 70 80 90 100 110; do
  curl -X POST http://localhost:4000/api/incremental-standings/1234/snapshots/delta \
    -H "Content-Type: application/json" \
    -d "{\"timestampSeconds\": $ts}"
done

# 4. Query standings
curl "http://localhost:4000/api/incremental-standings/1234/standings?timestampSeconds=120&rankFrom=1&rankTo=100"
```

## Next Steps

1. Import Postman collection for easy testing
2. Set up automated snapshot creation (cron job or scheduler)
3. Monitor snapshot creation performance
4. Use query endpoints for real-time standings replay
