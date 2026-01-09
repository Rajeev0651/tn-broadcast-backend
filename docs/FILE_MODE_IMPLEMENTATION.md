# File Mode Implementation Summary

## Overview

File mode support has been added to the Incremental Standings API, allowing all data to be stored in JSON files instead of MongoDB when `fileMode=true` is specified.

## Implementation Details

### New Files Created

1. **`src/services/fileStorageService.js`**
   - Handles all file I/O operations
   - Provides MongoDB-like interface for file operations
   - Supports find, findOne, countDocuments, insertOne, updateOne, etc.
   - Handles query operators ($lte, $gte, $gt, $lt, $in, $ne)
   - Supports projection and sorting

2. **`src/data/fileStorage/models.js`**
   - FileModel class that mimics Mongoose model interface
   - FileQuery class for chainable queries
   - Provides same API as MongoDB models for seamless switching

3. **`src/services/modelProvider.js`**
   - Returns appropriate models based on fileMode flag
   - Centralized model selection logic

### Modified Files

1. **`src/services/snapshotService.js`**
   - Added `fileMode` parameter to all methods
   - Uses `getModels(fileMode)` to select storage backend

2. **`src/services/incrementalSimulationService.js`**
   - Added `fileMode` parameter to all methods
   - Supports both MongoDB and file storage

3. **`src/routes/incrementalStandingsRoutes.js`**
   - All endpoints accept `fileMode` query/body parameter
   - Passes fileMode to underlying services
   - Returns storageMode in responses

4. **`.gitignore`**
   - Added `src/data/fileStorage/` to ignore file storage directory

5. **`Agent/Incremental_Standings_API.postman_collection.json`**
   - Added fileMode parameter to all requests
   - Added File Mode Examples section
   - Updated descriptions with fileMode information

## File Storage Structure

### Directory
```
src/data/fileStorage/
```

### Files Created
- `standingsState_{contestId}.json` - Participant state data
- `baseSnapshots_{contestId}.json` - Base snapshot data
- `deltaSnapshots_{contestId}.json` - Delta snapshot data

### File Format
Each file contains an array of JSON documents:
```json
[
  {
    "_id": "...",
    "contestId": 1234,
    ...document fields...
  }
]
```

## API Usage

### Query Parameter (Preferred)
```bash
GET /api/incremental-standings/1234/standings?timestampSeconds=120&fileMode=true
POST /api/incremental-standings/1234/initialize?fileMode=true
```

### Request Body
```json
{
  "timestampSeconds": 0,
  "fileMode": true
}
```

## Features

✅ **MongoDB-like Interface**: Same API, works with existing code
✅ **Query Support**: Supports find, findOne, countDocuments with filters
✅ **Operators**: $lte, $gte, $gt, $lt, $in, $ne
✅ **Projection**: Field selection with .select()
✅ **Sorting**: Order results with .sort()
✅ **Pagination**: Limit results with .limit()
✅ **Automatic Directory Creation**: Creates directory on first use
✅ **Error Handling**: Graceful handling of missing files

## Limitations

⚠️ **Performance**: Slower than MongoDB for large datasets
⚠️ **Concurrency**: Not optimized for concurrent writes
⚠️ **No Transactions**: File writes are not transactional
⚠️ **File Size**: Entire file rewritten on each update
⚠️ **No Indexes**: Full file scan for queries

## Testing

### Test with File Mode

```bash
# 1. Initialize with file mode
curl -X POST "http://localhost:4000/api/incremental-standings/1234/initialize?fileMode=true"

# 2. Check file was created
ls src/data/fileStorage/standingsState_1234.json

# 3. Create snapshot with file mode
curl -X POST "http://localhost:4000/api/incremental-standings/1234/snapshots/base?fileMode=true" \
  -H "Content-Type: application/json" \
  -d '{"timestampSeconds": 0}'

# 4. Query with file mode
curl "http://localhost:4000/api/incremental-standings/1234/standings?timestampSeconds=0&rankFrom=1&rankTo=10&fileMode=true"
```

### Verify File Contents

```bash
# View standings state
cat src/data/fileStorage/standingsState_1234.json | jq '.[0]'

# Count participants
cat src/data/fileStorage/standingsState_1234.json | jq 'length'

# View snapshots
cat src/data/fileStorage/baseSnapshots_1234.json | jq '.[0]'
```

## Next Steps

1. Test file mode with real contest data
2. Verify performance is acceptable
3. Consider adding file compression for large files
4. Add file locking for concurrent access (if needed)
5. Implement file-based snapshot cleanup/archival
