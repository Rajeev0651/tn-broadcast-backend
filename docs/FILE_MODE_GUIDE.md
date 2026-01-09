# File Mode Guide - Incremental Standings API

## Overview

The Incremental Standings API supports **file-based storage mode** as an alternative to MongoDB. When `fileMode=true`, all collection data is stored in JSON files instead of MongoDB collections.

## File Storage Location

All files are stored in:
```
src/data/fileStorage/
```

## File Structure

Each collection creates a separate JSON file per contest:

| Collection | File Name | Description |
|------------|-----------|-------------|
| `standingsState` | `standingsState_{contestId}.json` | Participant state data |
| `baseSnapshots` | `baseSnapshots_{contestId}.json` | Base snapshot data |
| `deltaSnapshots` | `deltaSnapshots_{contestId}.json` | Delta snapshot data |

### Example Files

For contest ID `1234`:
- `src/data/fileStorage/standingsState_1234.json`
- `src/data/fileStorage/baseSnapshots_1234.json`
- `src/data/fileStorage/deltaSnapshots_1234.json`

## File Format

Each file contains an array of documents in JSON format:

```json
[
  {
    "_id": "1704067200000_abc123",
    "contestId": 1234,
    "handle": "user123",
    "totalPoints": 2500,
    "totalPenalty": 120,
    "problems": {
      "A": {
        "solved": true,
        "points": 500,
        "rejectCount": 2,
        "solveTime": 300,
        "firstAttemptTime": 60
      }
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

## Usage

### Enable File Mode

Add `fileMode=true` as a query parameter or in the request body:

**Query Parameter:**
```bash
POST /api/incremental-standings/1234/initialize?fileMode=true
```

**Request Body:**
```json
{
  "timestampSeconds": 0,
  "fileMode": true
}
```

### Complete File Mode Workflow

```bash
# 1. Initialize with file mode
POST /api/incremental-standings/1234/initialize?fileMode=true

# 2. Create base snapshot with file mode
POST /api/incremental-standings/1234/snapshots/base?fileMode=true
Body: {"timestampSeconds": 0}

# 3. Create delta snapshot with file mode
POST /api/incremental-standings/1234/snapshots/delta?fileMode=true
Body: {"timestampSeconds": 10}

# 4. Query with file mode
GET /api/incremental-standings/1234/standings?timestampSeconds=120&rankFrom=1&rankTo=100&fileMode=true
```

## Important Notes

### Consistency Requirement

**You must use the same `fileMode` value for all operations on the same contest:**

- If you initialize with `fileMode=true`, all snapshots and queries must use `fileMode=true`
- If you initialize with `fileMode=false`, all snapshots and queries must use `fileMode=false`
- **Mixing modes will cause data to be read from/written to different storage locations**

### MongoDB vs File Mode

| Feature | MongoDB (fileMode=false) | File Mode (fileMode=true) |
|---------|-------------------------|---------------------------|
| Storage | MongoDB collections | JSON files in `src/data/fileStorage/` |
| Persistence | Database | File system |
| Performance | Optimized for queries | Slightly slower (file I/O) |
| Backup | MongoDB backup | Copy files |
| Portability | Requires MongoDB | Self-contained JSON files |
| Best For | Production, large scale | Development, testing, portability |

### File Management

**Automatic:**
- Files are created automatically when data is written
- Directory is created if it doesn't exist
- Files are overwritten on updates (entire file rewritten)

**Manual:**
- Files can be backed up by copying the directory
- Files can be deleted to reset state
- Files can be edited manually (not recommended)

### File Size Considerations

For a contest with 10,000 participants:
- `standingsState_1234.json`: ~2-3 MB
- `baseSnapshots_1234.json`: ~2 MB per snapshot × number of snapshots
- `deltaSnapshots_1234.json`: ~100 KB per snapshot × number of snapshots

**For 3-hour contest with recommended intervals:**
- Total file storage: ~300-400 MB

## API Examples

### Initialize with File Mode

```bash
curl -X POST "http://localhost:4000/api/incremental-standings/1234/initialize?fileMode=true"
```

**Response:**
```json
{
  "success": true,
  "message": "Standings state initialized for contest 1234",
  "data": {
    "contestId": 1234,
    "participantCount": 10000,
    "initializationTimeMs": 5234,
    "fileMode": true,
    "storageMode": "file"
  }
}
```

### Create Snapshot with File Mode

```bash
curl -X POST "http://localhost:4000/api/incremental-standings/1234/snapshots/base?fileMode=true" \
  -H "Content-Type: application/json" \
  -d '{"timestampSeconds": 0}'
```

### Query with File Mode

```bash
curl "http://localhost:4000/api/incremental-standings/1234/standings?timestampSeconds=120&rankFrom=1&rankTo=100&fileMode=true"
```

## File Inspection

### View File Contents

```bash
# View standings state
cat src/data/fileStorage/standingsState_1234.json

# View base snapshots
cat src/data/fileStorage/baseSnapshots_1234.json

# View delta snapshots  
cat src/data/fileStorage/deltaSnapshots_1234.json
```

### Count Documents in File

```bash
# Using jq (if installed)
cat src/data/fileStorage/standingsState_1234.json | jq 'length'

# Or using Node.js
node -e "console.log(JSON.parse(require('fs').readFileSync('src/data/fileStorage/standingsState_1234.json', 'utf8')).length)"
```

## Migration Between Modes

### Export from MongoDB to Files

1. Query data from MongoDB (fileMode=false)
2. Re-initialize with fileMode=true
3. Re-create snapshots with fileMode=true

### Import from Files to MongoDB

1. Delete MongoDB data (if any)
2. Re-initialize with fileMode=false
3. Re-create snapshots with fileMode=false

**Note:** There's no automatic migration - you need to re-process the data.

## Troubleshooting

### File Not Found

**Error:** `ENOENT: no such file or directory`

**Solution:** 
- Files are created automatically on first write
- Ensure the directory exists: `src/data/fileStorage/`
- Check file permissions

### File Corruption

**Symptoms:** JSON parse errors, missing data

**Solution:**
- Check file is valid JSON
- Restore from backup
- Re-initialize and re-create snapshots

### Performance Issues

**File mode is slower than MongoDB for:**
- Large files (>10 MB)
- Frequent writes
- Complex queries

**Solutions:**
- Use MongoDB for production (fileMode=false)
- Optimize by reducing snapshot frequency
- Consider file compression for archival

## Best Practices

1. **Use MongoDB for Production**: Better performance and scalability
2. **Use File Mode for Development**: Easy to inspect and debug
3. **Be Consistent**: Always use the same fileMode for a contest
4. **Backup Files**: Copy `src/data/fileStorage/` directory regularly
5. **Monitor File Sizes**: Large files can impact performance
6. **Git Ignore**: Files are ignored by git (already configured in `.gitignore`)

## Limitations

- **No Transactions**: File writes are not transactional
- **Concurrency**: Not optimized for concurrent writes (may cause data loss)
- **Query Performance**: Slower than MongoDB for complex queries
- **File Size**: Large files may impact performance
- **No Indexes**: Full file scan for queries (acceptable for small-medium datasets)

## Use Cases

✅ **Use File Mode When:**
- Testing and development
- Need portable, self-contained data
- Want to inspect data easily
- Small to medium datasets (<50k participants)
- Single-user scenarios

❌ **Don't Use File Mode When:**
- Production environment
- High concurrency requirements
- Very large datasets (>100k participants)
- Need MongoDB features (indexes, aggregation, etc.)
