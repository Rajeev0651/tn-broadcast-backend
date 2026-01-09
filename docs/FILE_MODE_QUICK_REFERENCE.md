# File Mode Quick Reference

## Quick Start

### Enable File Mode

Add `fileMode=true` to any API request:

```bash
# Initialize
POST /api/incremental-standings/1234/initialize?fileMode=true

# Create snapshot
POST /api/incremental-standings/1234/snapshots/base?fileMode=true
Body: {"timestampSeconds": 0}

# Query
GET /api/incremental-standings/1234/standings?timestampSeconds=120&fileMode=true
```

## File Locations

All files stored in: `src/data/fileStorage/`

- `standingsState_1234.json` - Participant states
- `baseSnapshots_1234.json` - Base snapshots  
- `deltaSnapshots_1234.json` - Delta snapshots

## Important Rules

1. **Be Consistent**: Use the same `fileMode` for all operations on a contest
2. **Default**: `fileMode=false` (uses MongoDB)
3. **File Mode**: `fileMode=true` (uses JSON files)

## Example: Complete File Mode Workflow

```bash
# Step 1: Initialize (file mode)
curl -X POST "http://localhost:4000/api/incremental-standings/1234/initialize?fileMode=true"

# Step 2: Create snapshots (file mode)
curl -X POST "http://localhost:4000/api/incremental-standings/1234/snapshots/base?fileMode=true" \
  -H "Content-Type: application/json" \
  -d '{"timestampSeconds": 0}'

curl -X POST "http://localhost:4000/api/incremental-standings/1234/snapshots/delta?fileMode=true" \
  -H "Content-Type: application/json" \
  -d '{"timestampSeconds": 10}'

# Step 3: Query (file mode)
curl "http://localhost:4000/api/incremental-standings/1234/standings?timestampSeconds=120&rankFrom=1&rankTo=100&fileMode=true"
```

## Check Files

```bash
# List all files
ls src/data/fileStorage/

# View a file
cat src/data/fileStorage/standingsState_1234.json | jq '.[0]'

# Count documents
cat src/data/fileStorage/standingsState_1234.json | jq 'length'
```
