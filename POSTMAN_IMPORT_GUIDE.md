# Postman Collection Import Guide

## Importing the GraphQL API Collection

### Step 1: Import Collection
1. Open Postman
2. Click **Import** button (top left)
3. Select **File** tab
4. Choose `Codeforces_GraphQL_API.postman_collection.json`
5. Click **Import**

### Step 2: Configure Environment Variable
1. Click on the collection name
2. Go to **Variables** tab
3. Set `baseUrl` to your backend URL:
   - Development: `http://localhost:4000`
   - Production: `https://your-production-url.com`

### Step 3: Test Queries

#### Basic Queries
- **Get Contest List**: Returns all contests stored in MongoDB
- **Get Contest by ID**: Get specific contest information
- **Get Contest Problems**: Get all problems for a contest

#### Standings Queries
- **Get Contest Standings**: Get standings with pagination
- **Get Top 10 Standings**: Quick query for top 10 participants

#### Submissions Queries
- **Get Contest Submissions**: Get recent submissions
- **Get User Submissions**: Filter submissions by user handle

#### Simulation Queries
- **Get Simulated Standings**: Get standings at a specific timestamp
- **Get Simulated Submissions**: Get submissions up to a timestamp
- **Get Simulation State**: Get simulation progress information

#### Complete Data Query
- **Get Complete Contest Data**: Fetch all contest data in one query

## Example Variables

### Get Contest List
```json
{
  "includeGym": false
}
```

### Get Contest Standings
```json
{
  "contestId": 1234,
  "from": 1,
  "count": 100,
  "showUnofficial": false
}
```

### Get Simulated Standings (at 1 hour mark)
```json
{
  "contestId": 1234,
  "timestamp": 3600,
  "from": 1,
  "count": 10
}
```

### Get User Submissions
```json
{
  "contestId": 1234,
  "handle": "tourist"
}
```

## Notes

- All queries fetch data from MongoDB (not live Codeforces API)
- Simulation queries require a valid timestamp (seconds from contest start)
- Replace `1234` with actual contest IDs from your database
- The `baseUrl` variable should point to your GraphQL endpoint (usually `/graphql`)

## Troubleshooting

### Error: "Contest not found in database"
- Make sure the contest ID exists in MongoDB
- Verify that contest data has been stored using the data storage service

### Error: "Invalid timestamp"
- Timestamp must be >= 0
- For simulation, timestamp should be within contest duration

### Connection Errors
- Verify backend server is running
- Check `baseUrl` variable is correct
- Ensure GraphQL endpoint is accessible

