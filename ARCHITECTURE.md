# Project Architecture Documentation

## Table of Contents

1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Project Structure](#project-structure)
4. [Authentication & Authorization](#authentication--authorization)
5. [GraphQL API](#graphql-api)
6. [Data Layer](#data-layer)
7. [Configuration Management](#configuration-management)
8. [Logging System](#logging-system)
9. [Security Features](#security-features)
10. [Request Flow](#request-flow)
11. [Development & Production Differences](#development--production-differences)

---

## Project Overview

### Technology Stack

This backend project is built using the following technologies:

- **Node.js** (v18.15+): JavaScript runtime environment
- **GraphQL**: Query language and runtime for APIs
- **Apollo Server Express**: GraphQL server implementation
- **Express.js**: Web application framework
- **MongoDB** (v7.0+): NoSQL database
- **Mongoose**: MongoDB object modeling for Node.js
- **JWT (JSON Web Tokens)**: Authentication mechanism
- **bcrypt**: Password hashing library
- **log4js**: Logging framework
- **Helmet.js**: Security middleware
- **CORS**: Cross-Origin Resource Sharing middleware

### Project Purpose

This is a boilerplate backend application designed to provide a foundation for building GraphQL-based APIs with user authentication, role-based access control, and MongoDB integration. It serves as a starting point for new projects requiring:

- User registration and authentication
- JWT-based session management
- Admin role management
- User data persistence
- GraphQL API endpoints
- Comprehensive logging
- Security best practices

### Main Features

- ✅ User registration with email validation
- ✅ User authentication with JWT tokens
- ✅ Password hashing using bcrypt
- ✅ Admin role assignment
- ✅ User registration limits (configurable)
- ✅ GraphQL API with Apollo Server
- ✅ MongoDB database integration
- ✅ Comprehensive logging system
- ✅ Security middleware (Helmet, CORS)
- ✅ Development and production environment support

### Requirements

- **Node.js**: Version 18.15 or higher
- **MongoDB**: Version 7.0 or higher
- **npm**: For package management

---

## System Architecture

### High-Level Architecture

```mermaid
graph TB
    Client[Client Application] -->|HTTP/GraphQL| Express[Express Server]
    Express --> Apollo[Apollo Server]
    Apollo --> Context[GraphQL Context]
    Context --> Resolvers[GraphQL Resolvers]
    Resolvers --> Auth[Authentication Layer]
    Resolvers --> Models[Data Models]
    Models --> MongoDB[(MongoDB Database)]
    Auth --> JWT[JWT Validation]
    Express --> Logger[Logging System]
    Express --> Security[Security Middleware]
    
    subgraph "Application Layer"
        Apollo
        Context
        Resolvers
    end
    
    subgraph "Data Layer"
        Models
        MongoDB
    end
    
    subgraph "Security Layer"
        Auth
        JWT
        Security
    end
```

### Component Relationships

The system follows a layered architecture:

1. **Presentation Layer**: Express.js handles HTTP requests
2. **API Layer**: Apollo Server processes GraphQL queries/mutations
3. **Business Logic Layer**: Resolvers contain application logic
4. **Data Access Layer**: Mongoose models interact with MongoDB
5. **Security Layer**: Authentication and authorization middleware
6. **Infrastructure Layer**: Logging, configuration, and utilities

### Request Flow

```mermaid
sequenceDiagram
    participant Client
    participant Express
    participant Helmet
    participant CORS
    participant Apollo
    participant Context
    participant Resolver
    participant Auth
    participant Model
    participant MongoDB
    participant Logger

    Client->>Express: HTTP Request
    Express->>Helmet: Security Headers
    Helmet->>CORS: CORS Check
    CORS->>Apollo: GraphQL Request
    Apollo->>Context: Set Context
    Context->>Auth: Validate JWT (if present)
    Auth-->>Context: User Data (if valid)
    Apollo->>Resolver: Execute Resolver
    Resolver->>Auth: Check Permissions
    Auth-->>Resolver: Authorization Result
    Resolver->>Model: Database Query
    Model->>MongoDB: Execute Query
    MongoDB-->>Model: Return Data
    Model-->>Resolver: Processed Data
    Resolver-->>Apollo: GraphQL Response
    Apollo->>Logger: Log Request/Response
    Apollo-->>Express: HTTP Response
    Express-->>Client: JSON Response
```

---

## Project Structure

### Directory Tree

```
Backend/
├── src/
│   ├── config/
│   │   ├── appConfig.js          # Application configuration
│   │   └── environment.js        # Environment constants
│   ├── data/
│   │   └── models/
│   │       ├── index.js          # Model exports
│   │       └── schemas/
│   │           ├── index.js      # Schema exports
│   │           └── UsersSchema.js # User data schema
│   ├── gql/
│   │   ├── auth/
│   │   │   ├── authValidations.js # Auth validation functions
│   │   │   ├── jwt.js            # JWT creation/validation
│   │   │   └── setContext.js     # Apollo context setup
│   │   ├── resolvers/
│   │   │   ├── index.js          # Resolver aggregation
│   │   │   ├── auth.js           # Authentication resolvers
│   │   │   └── users.js          # User-related resolvers
│   │   └── types/
│   │       ├── index.js          # Type definition loader
│   │       ├── auth.js           # Auth GraphQL types
│   │       ├── users.js          # User GraphQL types
│   │       └── shared.js         # Shared GraphQL types
│   ├── helpers/
│   │   ├── getListOfIPV4Address.js # Network utility
│   │   ├── logger.js             # Logging configuration
│   │   ├── requestDevLogger.js   # Dev request logger
│   │   └── validations.js        # Input validation functions
│   ├── public/
│   │   └── favicon.ico           # Site favicon
│   ├── routes/
│   │   └── routesManager.js      # Express routes
│   └── server.js                 # Application entry point
├── tests/
│   ├── package.test.js           # Package tests
│   └── validations.test.js       # Validation tests
├── logs/                         # Application logs
├── node_modules/                 # Dependencies
├── .env                          # Environment variables (not in repo)
├── _env                          # Environment template
├── jest.config.js               # Jest configuration
├── package.json                 # Project dependencies
└── README.md                    # Project documentation
```

### Key Files and Their Purposes

#### [src/server.js](src/server.js) - Application Entry Point

The main entry point that:
- Initializes MongoDB connection
- Configures Express application
- Sets up Apollo Server with GraphQL schema
- Applies security middleware (Helmet, CORS)
- Starts the HTTP server
- Handles graceful shutdown

**Key Responsibilities**:
- Database connection management
- Server initialization
- Middleware configuration
- Error handling setup
- Logging initialization

#### [src/config/](src/config/) - Configuration Management

**appConfig.js**:
- Loads and validates environment variables
- Exports configuration objects:
  - `environmentVariablesConfig`: Database, port, environment settings
  - `securityVariablesConfig`: JWT secret and expiration
  - `globalVariablesConfig`: Application-wide settings (e.g., user limits)

**environment.js**:
- Defines environment constants (DEVELOPMENT, PRODUCTION)
- Provides type-safe environment checking

#### [src/gql/](src/gql/) - GraphQL Layer

**types/**:
- Defines GraphQL schema using SDL (Schema Definition Language)
- Loads and merges all type definitions automatically
- Contains type definitions for:
  - User types
  - Authentication types (Token, mutations)
  - Shared types (DeleteResult)

**resolvers/**:
- Implements GraphQL resolvers for queries and mutations
- Organized by domain (auth, users)
- Uses dependency injection via context

**auth/**:
- JWT token creation and validation
- Apollo Server context setup
- Authentication validation functions
- User authorization checks

#### [src/data/models/](src/data/models/) - Data Layer

**schemas/UsersSchema.js**:
- Defines Mongoose schema for User model
- Includes pre-save hooks for password hashing
- Defines user fields: email, password, isAdmin, isActive, uuid, registrationDate, lastLogin

**schemas/ContestsSchema.js**:
- Defines Mongoose schema for Codeforces contests
- Stores contest metadata and basic information
- Indexes: contestId (unique), phase, type, startTimeSeconds, text search on name/description

**schemas/ProblemsSchema.js**:
- Defines Mongoose schema for Codeforces problems (normalized)
- Stores problem information to avoid duplication
- Indexes: problemId (unique), contestId+index, tags, rating, text search

**schemas/StandingsSchema.js**:
- Defines Mongoose schema for contest standings
- Stores participant standings with embedded contest info
- Indexes: contestId+participantKey (unique), rank, handle, points, text search

**schemas/SubmissionsSchema.js**:
- Defines Mongoose schema for contest submissions
- Stores all submissions with embedded problem/author info
- Indexes: submissionId (unique), contestId, handle, problemIndex, verdict, compound indexes

**schemas/RatingChangesSchema.js**:
- Defines Mongoose schema for rating changes
- Stores rating updates after contests
- Includes pre-save hook to calculate ratingChange
- Indexes: contestId+handle (unique), rank, ratingUpdateTimeSeconds

**schemas/HacksSchema.js**:
- Defines Mongoose schema for hacks
- Stores hack information with embedded problem info
- Indexes: hackId (unique), contestId, hackerHandle, defenderHandle, verdict

**schemas/CodeforcesUsersSchema.js**:
- Defines Mongoose schema for Codeforces users (optional normalization)
- Stores user handles and metadata
- Indexes: handle (unique), rating, country, organization, text search

**index.js**:
- Exports Mongoose models for use in resolvers
- Provides centralized model access
- Models: Users, Contests, Problems, Standings, Submissions, RatingChanges, Hacks, CodeforcesUsers

#### [src/helpers/](src/helpers/) - Utility Functions

**logger.js**:
- Configures log4js with multiple appenders
- Sets up log files (trace, debug, info, error)
- Provides logger instance for application use

**validations.js**:
- Email validation using regex
- Password strength validation
- Input sanitization helpers

**requestDevLogger.js**:
- Apollo Server plugin for development
- Logs all GraphQL queries and responses
- Filters out introspection queries

**getListOfIPV4Address.js**:
- Utility to get all IPv4 addresses of the server
- Used for displaying server URLs on startup

**codeforcesAPI.js**:
- Codeforces API service layer
- Handles rate limiting (2 seconds between requests)
- Implements automatic pagination for large datasets
- Provides in-memory caching with TTL
- Implements retry logic with exponential backoff
- Methods for fetching contest data: list, standings, submissions, rating changes, hacks

#### [src/services/](src/services/) - Service Layer

**codeforcesDataService.js**:
- Codeforces data service for MongoDB operations
- Handles storing and retrieving Codeforces contest data
- Methods:
  - `upsertContest()`: Store or update contest data
  - `upsertProblem()`: Store or update problem data
  - `upsertStandings()`: Store or update standings data
  - `upsertSubmissions()`: Store or update submissions data
  - `upsertRatingChanges()`: Store or update rating changes
  - `upsertHacks()`: Store or update hacks data
  - `storeCompleteContestData()`: Store all contest data in one call
  - `storeContestList()`: Store contest list
- Uses bulk write operations for efficiency
- Handles data transformation from API format to MongoDB schema

#### [src/routes/](src/routes/) - Express Routes

**routesManager.js**:
- Defines Express routes
- Includes a basic health check route at `/`
- Registers Codeforces API routes at `/api/codeforces`

**codeforcesRoutes.js**:
- REST API endpoints for Codeforces data operations
- **POST `/api/codeforces/contests/:contestId/store`**: Fetches complete contest data from Codeforces API and stores in MongoDB
  - Query params: `showUnofficial` (boolean, optional)
  - Returns: Storage summary with counts
- **POST `/api/codeforces/contests/store-list`**: Fetches contest list from Codeforces API and stores in MongoDB
  - Query params: `includeGym` (boolean, optional)
  - Returns: Storage summary with counts
- **GET `/api/codeforces/contests/:contestId`**: Retrieves contest data from MongoDB
  - Returns: Contest info, problems, and data counts
- **GET `/api/codeforces/contests/:contestId/standings`**: Retrieves standings from MongoDB
  - Query params: `limit` (number, default: 100), `skip` (number, default: 0), `unofficial` (boolean, optional)
  - Returns: Paginated standings data
- **GET `/api/codeforces/contests/:contestId/submissions`**: Retrieves submissions from MongoDB
  - Query params: `limit` (number, default: 100), `skip` (number, default: 0), `handle` (string, optional)
  - Returns: Paginated submissions data

---

## Authentication & Authorization

### JWT-Based Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant Resolver
    participant Auth
    participant JWT
    participant Model
    participant MongoDB

    User->>Resolver: registerUser(email, password)
    Resolver->>Model: Create User
    Model->>MongoDB: Save User
    MongoDB-->>Model: User Created
    Model-->>Resolver: User Data
    Resolver->>JWT: createAuthToken(user)
    JWT-->>Resolver: JWT Token
    Resolver-->>User: Return Token

    User->>Resolver: authUser(email, password)
    Resolver->>Model: Find User
    Model->>MongoDB: Query User
    MongoDB-->>Model: User Data
    Model-->>Resolver: User
    Resolver->>Auth: Verify Password
    Auth-->>Resolver: Password Valid
    Resolver->>JWT: createAuthToken(user)
    JWT-->>Resolver: JWT Token
    Resolver-->>User: Return Token

    User->>Resolver: Query (with JWT)
    Resolver->>Context: Extract Token
    Context->>JWT: validateAuthToken(token)
    JWT-->>Context: User Data
    Context->>Auth: Check Permissions
    Auth-->>Context: Authorization Result
    Context-->>Resolver: Execute Query
```

### Context Setup in Apollo Server

The Apollo Server context is set up in [src/gql/auth/setContext.js](src/gql/auth/setContext.js):

**Context Structure**:
```javascript
{
  di: {
    model: { Users, ... },           // Database models
    authValidation: { ... },         // Auth validation functions
    jwt: { createAuthToken }         // JWT utilities
  },
  user: {                            // Authenticated user (if token valid)
    email: string,
    isAdmin: boolean,
    isActive: boolean,
    uuid: string
  }
}
```

**Context Setup Process**:
1. Extract `Authorization` header from request
2. Parse Bearer token
3. Validate token using JWT secret
4. Extract user data from token payload
5. Add user to context if token is valid
6. Inject dependencies (models, validations, utilities)

### User Roles

**Regular User**:
- Can register and authenticate
- Can delete their own account
- Cannot access admin-only queries

**Administrator** (`isAdmin: true`):
- All regular user permissions
- Can list all users (`listAllUsers` query)
- Can access admin-only operations

**User Status**:
- `isActive: true`: User can authenticate
- `isActive: false`: User cannot authenticate (login blocked)

### Authentication Validation Functions

Located in [src/gql/auth/authValidations.js](src/gql/auth/authValidations.js):

**ensureLimitOfUsersIsNotReached(count)**:
- Checks if user registration limit has been reached
- Throws `ValidationError` if limit exceeded
- Skips check if limit is set to 0

**ensureThatUserIsLogged(context)**:
- Verifies user is authenticated
- Checks for `context.user` existence
- Throws `AuthenticationError` if not logged in

**ensureThatUserIsAdministrator(context)**:
- Verifies user is authenticated AND is admin
- Checks `context.user.isAdmin === true`
- Throws `ForbiddenError` if not admin

**getUser(context)**:
- Retrieves full user data from database
- Uses UUID from context to find user
- Throws `AuthenticationError` if user not found

### JWT Token Structure

**Token Payload**:
```javascript
{
  email: string,      // User email
  isAdmin: boolean,   // Admin status
  isActive: boolean,  // Active status
  uuid: string,       // Unique user identifier
  iat: number,        // Issued at timestamp
  exp: number         // Expiration timestamp
}
```

**Token Configuration**:
- Secret: From `SECRET` environment variable
- Expiration: From `DURATION` environment variable (default: "2h")
- Algorithm: HS256 (default for jsonwebtoken)

---

## GraphQL API

### Type Definitions Structure

GraphQL types are defined using SDL (Schema Definition Language) and automatically loaded from [src/gql/types/](src/gql/types/):

**Type Loading Process**:
1. `initTypeDefinition()` in [src/gql/types/index.js](src/gql/types/index.js) loads all `.js` files
2. Uses `@graphql-tools/load-files` to discover type files
3. Merges all type definitions using `@graphql-tools/merge`
4. Returns merged schema to Apollo Server

### Available Queries

#### `listAllUsers`

**Description**: Get list of all users registered in the database

**Type**: Query

**Authorization**: Administrator only

**Returns**: `[User]`

**GraphQL Definition**:
```graphql
type Query {
  """ Get list of all users registered on database """
  listAllUsers: [User]
}
```

**Resolver**: [src/gql/resolvers/users.js](src/gql/resolvers/users.js)

**Implementation**:
- Validates user is logged in
- Validates user is administrator
- Returns users sorted by: `isAdmin` (desc), `registrationDate` (asc)

#### Codeforces Queries

All Codeforces queries are public (no authentication required) and fetch data from the Codeforces API.

**`getContestList(includeGym: Boolean)`**:
- Returns list of all Codeforces contests
- Resolver: [src/gql/resolvers/codeforces.js](src/gql/resolvers/codeforces.js)
- Uses cached data when available (1 hour TTL)

**`getContestStandings(contestId: Int!, showUnofficial: Boolean)`**:
- Returns complete contest standings with all participants
- Automatically handles pagination to fetch all rows
- Resolver: [src/gql/resolvers/codeforces.js](src/gql/resolvers/codeforces.js)

**`getContestSubmissions(contestId: Int!, handle: String)`**:
- Returns all submissions for a contest
- Optional handle parameter to filter by user
- Automatically handles pagination
- Resolver: [src/gql/resolvers/codeforces.js](src/gql/resolvers/codeforces.js)

**`getContestRatingChanges(contestId: Int!)`**:
- Returns rating changes after a contest
- Resolver: [src/gql/resolvers/codeforces.js](src/gql/resolvers/codeforces.js)

**`getContestHacks(contestId: Int!)`**:
- Returns all hacks in a contest
- Resolver: [src/gql/resolvers/codeforces.js](src/gql/resolvers/codeforces.js)

**`getCompleteContestData(contestId: Int!, showUnofficial: Boolean)`**:
- Returns all contest data in one call (standings, submissions, rating changes, hacks)
- Most efficient for fetching complete contest information
- Resolver: [src/gql/resolvers/codeforces.js](src/gql/resolvers/codeforces.js)

### Available Mutations

#### `registerUser`

**Description**: Allows users to register a new account

**Type**: Mutation

**Authorization**: Public (no authentication required)

**Parameters**:
- `email: String!` - User email address
- `password: String!` - User password

**Returns**: `Token`

**GraphQL Definition**:
```graphql
type Mutation {
  """ It allows users to register """
  registerUser(email: String!, password: String!): Token
}
```

**Resolver**: [src/gql/resolvers/auth.js](src/gql/resolvers/auth.js)

**Validation**:
- Email format validation
- Password strength validation (min 8 chars, uppercase, lowercase, number)
- User limit check (if configured)
- Duplicate email check

**Process**:
1. Validate input
2. Check user registration limit
3. Check for duplicate email
4. Create new user (password auto-hashed by Mongoose pre-save hook)
5. Generate and return JWT token

#### `authUser`

**Description**: Allows users to authenticate and receive a JWT token

**Type**: Mutation

**Authorization**: Public (no authentication required)

**Parameters**:
- `email: String!` - User email address
- `password: String!` - User password

**Returns**: `Token`

**GraphQL Definition**:
```graphql
type Mutation {
  """ It allows users to authenticate """
  authUser(email: String!, password: String!): Token
}
```

**Resolver**: [src/gql/resolvers/auth.js](src/gql/resolvers/auth.js)

**Validation**:
- User must exist
- User must be active (`isActive: true`)
- Password must match

**Process**:
1. Find user by email and active status
2. Compare provided password with hashed password
3. Update `lastLogin` timestamp
4. Generate and return JWT token

#### `deleteMyUserAccount`

**Description**: Allows authenticated users to delete their own account

**Type**: Mutation

**Authorization**: Authenticated user only

**Parameters**: None

**Returns**: `DeleteResult`

**GraphQL Definition**:
```graphql
type Mutation {
  """ It allows to user to delete their account permanently """
  deleteMyUserAccount: DeleteResult
}
```

**Resolver**: [src/gql/resolvers/auth.js](src/gql/resolvers/auth.js)

**Process**:
1. Validate user is logged in
2. Get user from database
3. Delete user by UUID
4. Return deletion result

### GraphQL Types

#### User Type

```graphql
type User {
  email: String
  isAdmin: Boolean
  isActive: Boolean
  uuid: String
  registrationDate: String
  lastLogin: String
}
```

#### Token Type

```graphql
type Token {
  token: String
}
```

#### DeleteResult Type

```graphql
type DeleteResult {
  deletedCount: Int!
}
```

### Resolver Organization

Resolvers are organized by domain and merged in [src/gql/resolvers/index.js](src/gql/resolvers/index.js):

```javascript
export const resolvers = merge(
  users,    // User-related resolvers
  auth      // Authentication resolvers
);
```

**Resolver Structure**:
```javascript
export default {
  Query: {
    // Query resolvers
  },
  Mutation: {
    // Mutation resolvers
  }
};
```

### Context Dependency Injection Pattern

The project uses a dependency injection pattern via Apollo Server context:

**Benefits**:
- Testability: Easy to mock dependencies
- Maintainability: Centralized dependency management
- Flexibility: Easy to swap implementations

**Dependency Structure**:
```javascript
context.di = {
  model: { Users, ... },              // Database models
  authValidation: {                   // Auth utilities
    ensureThatUserIsLogged,
    ensureThatUserIsAdministrator,
    ensureLimitOfUsersIsNotReached,
    getUser
  },
  jwt: {                              // JWT utilities
    createAuthToken
  }
}
```

**Usage in Resolvers**:
```javascript
const user = await context.di.model.Users.findOne({ email });
context.di.authValidation.ensureThatUserIsLogged(context);
const token = context.di.jwt.createAuthToken(...);
```

### Codeforces Integration

The project includes integration with Codeforces API for fetching contest data. This integration handles rate limiting, pagination, and caching automatically.

#### Codeforces API Service

**Location**: [src/helpers/codeforcesAPI.js](src/helpers/codeforcesAPI.js)

**Features**:
- **Rate Limiting**: Enforces 2-second minimum interval between API requests
- **Automatic Pagination**: Fetches all data regardless of API limits
- **Caching**: In-memory cache with configurable TTL for different data types
- **Error Handling**: Retry logic with exponential backoff
- **Complete Data Fetching**: Handles pagination for standings and submissions automatically

**Available Methods**:
- `getContestList(includeGym)`: Fetch all contests
- `getContestStandings(contestId, showUnofficial)`: Fetch ALL standings (handles pagination)
- `getContestSubmissions(contestId, handle)`: Fetch ALL submissions (handles pagination)
- `getContestRatingChanges(contestId)`: Fetch rating changes
- `getContestHacks(contestId)`: Fetch hacks
- `getCompleteContestData(contestId, showUnofficial)`: Fetch all contest data in one call

**Caching Strategy**:
- Contest list: 1 hour TTL
- Standings: 5 minutes (active contests) / 1 hour (finished contests)
- Submissions: 5 minutes TTL
- Rating changes: 1 hour TTL
- Hacks: 5 minutes TTL

#### Codeforces GraphQL Queries

**Type Definitions**: [src/gql/types/codeforces.js](src/gql/types/codeforces.js)

**Resolvers**: [src/gql/resolvers/codeforces.js](src/gql/resolvers/codeforces.js)

**Available Queries**:

1. **`getContestList(includeGym: Boolean)`**
   - Returns list of all Codeforces contests
   - Optional parameter to include gym contests
   - Returns: `[Contest!]!`

2. **`getContestStandings(contestId: Int!, showUnofficial: Boolean)`**
   - Returns complete contest standings (all participants)
   - Automatically handles pagination
   - Returns: `ContestStandings!` (includes contest, problems, and all rows)

3. **`getContestSubmissions(contestId: Int!, handle: String)`**
   - Returns all submissions for a contest
   - Optional handle parameter to filter by user
   - Automatically handles pagination
   - Returns: `[Submission!]!`

4. **`getContestRatingChanges(contestId: Int!)`**
   - Returns rating changes after a contest
   - Returns: `[RatingChange!]!`

5. **`getContestHacks(contestId: Int!)`**
   - Returns all hacks in a contest
   - Returns: `[Hack!]!`

6. **`getCompleteContestData(contestId: Int!, showUnofficial: Boolean)`**
   - Returns all contest data in one call (standings, submissions, rating changes, hacks)
   - Most efficient for fetching complete contest information
   - Returns: `CompleteContestData!`

**GraphQL Types**:
- `Contest`: Contest information
- `Problem`: Problem details
- `StandingsRow`: Participant standings
- `Submission`: Submission data
- `RatingChange`: Rating change data
- `Hack`: Hack information
- `ContestStandings`: Complete standings response
- `CompleteContestData`: Aggregated contest data

**Error Handling**:
- Invalid contest IDs return `UserInputError`
- Network errors are logged and return user-friendly messages
- Rate limit errors trigger automatic retry
- Missing data (rating changes, hacks) returns empty arrays

**Pagination Implementation**:
- Standings: Fetches in chunks of 10,000 (maximum per API call) until all rows retrieved
- Submissions: Fetches in chunks of 10,000 (maximum per API call) until all submissions retrieved
- Automatically combines all paginated results
- Maximizes data per call to minimize API requests and improve performance

#### MongoDB Data Storage

**Data Service**: [src/services/codeforcesDataService.js](src/services/codeforcesDataService.js)

The Codeforces data service provides methods to store all contest data in MongoDB:

**Storage Methods**:
- `storeContestList(includeGym)`: Store all contests from API
- `storeCompleteContestData(contestId, showUnofficial)`: Store all data for a contest
- Individual upsert methods for each data type

**MongoDB Collections**:
- **contests**: Contest metadata with indexes on contestId, phase, type, startTimeSeconds
- **problems**: Normalized problem data (shared across contexts) with indexes on problemId, contestId, tags
- **standings**: Participant standings with embedded contest info, indexed by contestId, rank, handle
- **submissions**: All submissions with embedded problem/author info, indexed by submissionId, contestId, handle
- **ratingChanges**: Rating updates with indexes on contestId+handle, rank, ratingUpdateTimeSeconds
- **hacks**: Hack information indexed by hackId, contestId, hackerHandle, defenderHandle
- **codeforcesUsers**: Optional normalized user data indexed by handle, rating, country
- **batchedContestData**: Batched storage collection (1000 records per document) with indexes on contestId+batchIndex

**Batched Storage Architecture**:
- **Purpose**: Optimize storage for large datasets (100K+ submissions per contest)
- **Structure**: Each document stores arrays of records (max 1000 per array)
  - `contestId` + `batchIndex` as unique identifier
  - Arrays: `standings[]`, `submissions[]`, `ratingChanges[]`, `hacks[]`
  - Each array limited to 1000 items (enforced by schema validation)
- **Benefits**:
  - Reduces document count: 110K submissions → ~110 documents instead of 110K
  - Faster queries: Fewer documents to scan
  - Better performance: Bulk operations instead of individual inserts
- **Performance Optimizations**:
  - **Bulk Write**: Uses `bulkWrite` for new data (single operation for all batches)
  - **Smart Detection**: Automatically detects new vs existing data
  - **Parallel Processing**: Prepares all data types in parallel
  - **Performance Monitoring**: Logs fetch, preparation, and storage times

**Performance Improvements**:
- **Before Optimization**: Sequential processing with individual updates
  - 110K submissions: ~30-60 seconds
  - 110+ database round-trips
- **After Optimization**: Bulk operations with parallel preparation
  - 110K submissions: ~5-10 seconds
  - Single bulk write operation
  - **6-10x faster** for new data storage

**Why It Was Slow (Before)**:
1. Multiple database queries in loop (2 queries per batch iteration)
2. Individual `findOneAndUpdate` operations (110+ for 110K submissions)
3. Sequential processing (no parallelization)
4. Unnecessary checks for existing batches on new data

**Data Architecture**: See [DATA_ENGINEERING.md](DATA_ENGINEERING.md) for complete schema design, indexing strategy, and storage optimization details.

**Features**:
- Bulk write operations for efficient data storage
- Upsert operations for idempotent data loading
- Automatic data transformation from API format to MongoDB schema
- Reference generation for normalized data (problems, participants)
- Complete data storage with all relationships maintained

---

## Data Layer

### MongoDB Connection

The application supports two MongoDB connection formats:

#### Standard Connection Format

```
mongodb://[username:password@]host:port/database
```

**Configuration**:
- `MONGO_HOST`: Database host (default: 127.0.0.1)
- `MONGO_PORT`: Database port (default: 27017)
- `MONGO_DB`: Database name (default: boilerplate_database)
- `MONGO_USER`: Username (optional)
- `MONGO_PASS`: Password (optional)

#### DNS Seedlist Connection Format

```
mongodb+srv://user:password@uri-and-options
```

**Configuration**:
- `MONGO_DNS_SEEDLIST_CONNECTION`: Full connection string

**Connection Selection**:
- If `MONGO_FORMAT_CONNECTION=DNSseedlist` and `MONGO_DNS_SEEDLIST_CONNECTION` is set, use DNS seedlist
- Otherwise, use standard format

**Connection Setup**: [src/server.js](src/server.js) lines 25-33

### User Schema Structure

Defined in [src/data/models/schemas/UsersSchema.js](src/data/models/schemas/UsersSchema.js):

```javascript
{
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
    // Hashed automatically before save
  },
  isAdmin: {
    type: Boolean,
    required: true,
    default: false
  },
  isActive: {
    type: Boolean,
    required: true,
    default: true
  },
  uuid: {
    type: String,
    required: true,
    unique: true,
    default: randomUUID
  },
  registrationDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    required: true,
    default: Date.now
  }
}
```

**Schema Features**:
- Email is unique and automatically lowercased
- UUID provides alternative identifier to MongoDB `_id`
- `isActive` allows disabling user accounts without deletion
- `isAdmin` enables role-based access control

### Model Definitions

Models are exported from [src/data/models/index.js](src/data/models/index.js):

```javascript
export const models = {
  Users: mongoose.model('users', UsersSchema),
  Contests: mongoose.model('contests', ContestsSchema),
  Problems: mongoose.model('problems', ProblemsSchema),
  Standings: mongoose.model('standings', StandingsSchema),
  Submissions: mongoose.model('submissions', SubmissionsSchema),
  RatingChanges: mongoose.model('ratingChanges', RatingChangesSchema),
  Hacks: mongoose.model('hacks', HacksSchema),
  CodeforcesUsers: mongoose.model('codeforcesUsers', CodeforcesUsersSchema)
};
```

**Model Usage**:
- Models are injected into GraphQL context
- Accessed via `context.di.model.Users`, `context.di.model.Contests`, etc.
- Provides type-safe database operations
- All models follow the schema definitions in [src/data/models/schemas/](src/data/models/schemas/)

**Codeforces Data Collections**:
- **contests**: Contest metadata (~5 MB for 10,000 contests)
- **problems**: Normalized problem data (~15 MB for 50,000 problems)
- **standings**: Participant standings (~15-20 GB for 10M documents)
- **submissions**: All submissions (~50 GB for 100M documents)
- **ratingChanges**: Rating updates (~2 GB for 10M documents)
- **hacks**: Hack information (~10-50 GB for 10M documents)
- **codeforcesUsers**: User metadata (optional, ~500 MB for 1M users)

### Password Hashing Mechanism

Password hashing is implemented using a Mongoose pre-save hook:

**Location**: [src/data/models/schemas/UsersSchema.js](src/data/models/schemas/UsersSchema.js)

**Process**:
1. Hook triggers before document save
2. Checks if password field was modified
3. Generates salt using bcrypt
4. Hashes password with generated salt
5. Replaces plain password with hash
6. Continues with save operation

**Security Features**:
- Uses bcrypt for hashing (industry standard)
- Automatic salt generation
- Only hashes when password changes
- Prevents plain text password storage

**Password Verification**:
- Done in `authUser` resolver
- Uses `bcrypt.compare()` to verify against stored hash
- Constant-time comparison prevents timing attacks

---

## Configuration Management

### Environment Variables

The application uses environment variables loaded from `.env` file (template: `_env`):

#### Server Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `4000` |
| `ENVIRONMENT` | Execution mode (`development` or `production`) | `production` |

#### Database Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGO_FORMAT_CONNECTION` | Connection format (`standard` or `DNSseedlist`) | `standard` |
| `MONGO_HOST` | Database host (standard format) | `127.0.0.1` |
| `MONGO_PORT` | Database port (standard format) | `27017` |
| `MONGO_DB` | Database name (standard format) | `boilerplate_database` |
| `MONGO_USER` | Database username (standard format) | `` |
| `MONGO_PASS` | Database password (standard format) | `` |
| `MONGO_DNS_SEEDLIST_CONNECTION` | Full connection string (DNS seedlist format) | `` |

#### Security Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET` | JWT secret key | `yoursecret` |
| `DURATION` | JWT token expiration time | `2h` |

#### Application Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `LIMIT_USERS_REGISTERED` | Maximum users allowed (0 = no limit) | `0` |

### Configuration Files

#### [src/config/appConfig.js](src/config/appConfig.js)

Exports three frozen configuration objects:

**environmentVariablesConfig**:
- Database connection settings
- Server port
- Environment mode

**securityVariablesConfig**:
- JWT secret key
- Token expiration duration

**globalVariablesConfig**:
- User registration limits
- Other global application settings

**Features**:
- Uses `Object.freeze()` to prevent modification
- Provides default values for all settings
- Validates environment variable types

#### [src/config/environment.js](src/config/environment.js)

Defines environment constants:

```javascript
export const ENVIRONMENT = Object.freeze({
  DEVELOPMENT: 'development',
  PRODUCTION: 'production'
});
```

**Usage**:
- Type-safe environment checking
- Prevents typos in environment strings
- Centralized environment definitions

### Configuration Loading

**Process**:
1. `dotenv` loads variables from `.env` file
2. `appConfig.js` reads and validates variables
3. Default values applied if variables missing
4. Configuration objects exported as frozen objects
5. Used throughout application via imports

---

## Logging System

### Log4js Configuration

Configured in [src/helpers/logger.js](src/helpers/logger.js):

**Appenders**:
- `out`: Console output (stdout)
- `trace`: Trace-level logs → `logs/application_trace.log`
- `debug`: Debug-level logs → `logs/application_debug.log`
- `info`: Info-level logs → `logs/application.log`
- `error`: Error-level logs → `logs/application_error.log`

**Log File Configuration**:
- Maximum file size: 204,800 bytes (200 KB)
- Backup files: 3
- Keep file extension: true
- Automatic rotation on size limit

**Log Levels**:
- `trace`: Lowest level, most verbose
- `debug`: Debug information
- `info`: General information
- `warn`: Warning messages
- `error`: Error messages
- `fatal`: Critical errors

### Log File Organization

```
logs/
├── application_trace.log    # Trace-level logs only
├── application_debug.log    # Debug-level logs only
├── application.log          # Info and warn logs
└── application_error.log    # Error and fatal logs
```

**Log Level Filters**:
- Each appender has a level filter
- Prevents log duplication
- Ensures appropriate log levels in each file

### Development Request Logging

Implemented in [src/helpers/requestDevLogger.js](src/helpers/requestDevLogger.js):

**Apollo Server Plugin**:
- Logs all GraphQL queries
- Logs request variables
- Logs response data
- Logs response errors
- Filters out introspection queries

**Logging Details**:
- Query string logged at debug level
- Variables logged at debug level
- Response data logged at debug level
- Errors logged with count and messages

**Usage**:
- Only active in development mode
- Configured in Apollo Server plugins
- Helps with debugging GraphQL operations

### Logger Usage

**Import**:
```javascript
import { logger, endLogger } from './helpers/logger.js';
```

**Methods**:
- `logger.trace(message)`: Trace-level logging
- `logger.debug(message)`: Debug-level logging
- `logger.info(message)`: Info-level logging
- `logger.warn(message)`: Warning logging
- `logger.error(message)`: Error logging
- `logger.fatal(message)`: Fatal error logging
- `endLogger()`: Gracefully shutdown logger

**Shutdown Handling**:
- Called on `SIGINT` signal
- Ensures all logs are written before exit
- Prevents log file corruption

---

## Security Features

### Helmet.js Configuration

**Purpose**: Sets various HTTP headers to help protect the application

**Configuration**: [src/server.js](src/server.js)

**Production Mode**:
- Full Helmet protection enabled
- All security headers active

**Development Mode**:
- Content Security Policy disabled (allows GraphQL Playground)
- Cross-Origin Embedder Policy disabled
- Other security headers still active

**Security Headers Set**:
- Content Security Policy
- X-DNS-Prefetch-Control
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy

### CORS Setup

**Configuration**: [src/server.js](src/server.js)

```javascript
app.use(cors({ credentials: true }));
```

**Settings**:
- `credentials: true`: Allows cookies and authentication headers
- Default origin: Allows all origins (configurable)

**Use Cases**:
- Enables cross-origin requests from frontend
- Supports authentication with credentials
- Required for GraphQL Playground in development

### Password Validation Rules

Defined in [src/helpers/validations.js](src/helpers/validations.js):

**Requirements**:
- Minimum 8 characters
- Must contain at least one number
- Must contain at least one lowercase letter
- Must contain at least one uppercase letter
- No spaces allowed
- Only English characters allowed
- Special characters allowed: `!*^?+-_@#$%&`

**Validation Function**: `isStrongPassword(password)`

**Regex Pattern**:
```javascript
/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])[0-9a-zA-Z!*^?+-_@#$%&]{8,}$/
```

### Email Validation

Defined in [src/helpers/validations.js](src/helpers/validations.js):

**Validation Function**: `isValidEmail(email)`

**Requirements**:
- Valid email format
- RFC 5322 compliant regex pattern

**Usage**:
- Validates email during user registration
- Prevents invalid email addresses in database

### User Registration Limits

**Configuration**:
- Set via `LIMIT_USERS_REGISTERED` environment variable
- Value of `0` disables the limit

**Implementation**:
- Checked in `registerUser` resolver
- Uses `estimatedDocumentCount()` for performance
- Throws `ValidationError` if limit reached

**Use Cases**:
- Control beta access
- Limit free tier registrations
- Manage resource usage

### Input Validation

**Validation Points**:
1. **GraphQL Resolvers**: Validate input before processing
2. **Email Format**: Regex validation
3. **Password Strength**: Complexity requirements
4. **Required Fields**: GraphQL schema enforces required fields
5. **Type Validation**: GraphQL type system validates types

**Error Handling**:
- `UserInputError`: For invalid user input
- `ValidationError`: For business rule violations
- `AuthenticationError`: For authentication failures
- `ForbiddenError`: For authorization failures

### JWT Security

**Token Security**:
- Secret key stored in environment variable
- Never exposed in code or logs
- Configurable expiration time
- Signed with HS256 algorithm

**Best Practices**:
- Use strong, random secret keys in production
- Set appropriate token expiration
- Validate tokens on every request
- Never log tokens or secrets

---

## Request Flow

### Complete Request Lifecycle

```mermaid
flowchart TD
    Start[Client Request] --> Express[Express Server]
    Express --> Helmet[Helmet Security]
    Helmet --> CORS[CORS Check]
    CORS --> Route{Route Type?}
    
    Route -->|REST| RESTRoute[Express Routes]
    Route -->|GraphQL| Apollo[Apollo Server]
    
    RESTRoute --> RESTResponse[HTTP Response]
    
    Apollo --> Context[Set Context]
    Context --> ExtractToken[Extract JWT Token]
    ExtractToken --> ValidateToken{Token Valid?}
    
    ValidateToken -->|Yes| AddUser[Add User to Context]
    ValidateToken -->|No| NoUser[Context Without User]
    
    AddUser --> ParseQuery[Parse GraphQL Query]
    NoUser --> ParseQuery
    
    ParseQuery --> Resolver[Execute Resolver]
    Resolver --> AuthCheck{Auth Required?}
    
    AuthCheck -->|Yes| CheckAuth[Validate Authentication]
    AuthCheck -->|No| ValidateInput[Validate Input]
    
    CheckAuth -->|Valid| ValidateInput
    CheckAuth -->|Invalid| AuthError[Return Auth Error]
    
    ValidateInput --> BusinessLogic[Business Logic]
    BusinessLogic --> DBQuery[Database Query]
    DBQuery --> MongoDB[(MongoDB)]
    MongoDB --> DBResult[Query Result]
    DBResult --> ProcessData[Process Data]
    ProcessData --> FormatResponse[Format GraphQL Response]
    FormatResponse --> LogRequest[Log Request/Response]
    LogRequest --> GraphQLResponse[GraphQL Response]
    GraphQLResponse --> HTTPResponse[HTTP Response]
    HTTPResponse --> End[Client Receives Response]
    
    AuthError --> HTTPResponse
    RESTResponse --> End
```

### GraphQL Query/Mutation Processing

**Step-by-Step Process**:

1. **Request Reception**
   - Express receives HTTP request
   - Security middleware applied (Helmet, CORS)

2. **Apollo Server Processing**
   - Request routed to Apollo Server
   - GraphQL query/mutation parsed

3. **Context Setup**
   - `setContext` function called
   - JWT token extracted from `Authorization` header
   - Token validated (if present)
   - User data added to context (if valid)
   - Dependencies injected (models, validations, utilities)

4. **Resolver Execution**
   - Appropriate resolver function called
   - Context passed to resolver
   - Arguments extracted from query

5. **Authorization Check**
   - Resolver checks if authentication required
   - Validates user permissions (if needed)
   - Throws error if unauthorized

6. **Input Validation**
   - Validates input data
   - Checks business rules
   - Throws `UserInputError` if invalid

7. **Business Logic**
   - Executes application logic
   - Interacts with data models
   - Performs calculations/transformations

8. **Database Interaction**
   - Mongoose models query MongoDB
   - Data retrieved/updated
   - Results returned to resolver

9. **Response Formatting**
   - Data formatted according to GraphQL schema
   - Errors formatted if any occurred
   - Response object created

10. **Logging**
    - Request logged (development mode)
    - Response logged (development mode)
    - Errors logged to error log

11. **Response Delivery**
    - JSON response sent to client
    - HTTP status code set
    - Headers included

### Error Handling

**Error Types**:

1. **UserInputError**
   - Invalid user input
   - Not logged (expected errors)
   - Returns user-friendly message

2. **AuthenticationError**
   - User not authenticated
   - Returns 401-like error
   - Logged in development

3. **ForbiddenError**
   - User lacks permissions
   - Returns 403-like error
   - Logged in development

4. **ValidationError**
   - Business rule violation
   - Returns validation message
   - Logged in development

5. **System Errors**
   - Unexpected errors
   - Always logged
   - Returns generic error message

**Error Formatting**:
- Apollo Server `formatError` function
- Filters out sensitive information
- Logs unexpected errors
- Returns user-friendly messages

---

## Development & Production Differences

### Environment-Specific Configurations

#### Development Mode

**Configuration**:
- `ENVIRONMENT=development`

**Features Enabled**:
- GraphQL Playground accessible
- GraphQL introspection enabled
- Request/response logging active
- Detailed error messages
- Relaxed Helmet security (CSP disabled)
- Debug-level logging

**GraphQL Playground**:
- Available at `/graphql` endpoint
- Interactive query interface
- Schema exploration
- Query testing

**Logging**:
- All queries logged
- All responses logged
- Debug information available
- Console output active

#### Production Mode

**Configuration**:
- `ENVIRONMENT=production`

**Features Enabled**:
- Full Helmet security
- GraphQL Playground disabled
- GraphQL introspection disabled
- Minimal logging (errors only)
- Generic error messages
- Optimized performance

**Security**:
- All security headers active
- No GraphQL Playground access
- No schema introspection
- Reduced information leakage

### GraphQL Playground Availability

**Development**:
- Enabled by default
- Accessible at server URL + `/graphql`
- Full feature set available

**Production**:
- Disabled via `ApolloServerPluginLandingPageDisabled`
- Prevents schema exposure
- Reduces attack surface

**Configuration**: [src/server.js](src/server.js) line 74

### Logging Differences

**Development Logging**:
- All log levels active
- Request/response logging
- Debug information
- Console output
- Multiple log files

**Production Logging**:
- Error and info levels only
- No request/response logging
- Minimal console output
- Focus on errors and critical events

### Security Settings

**Development**:
- Content Security Policy: Disabled (for Playground)
- Cross-Origin Embedder Policy: Disabled
- CORS: Permissive
- Error Details: Full stack traces

**Production**:
- Content Security Policy: Enabled
- Cross-Origin Embedder Policy: Enabled
- CORS: Configurable
- Error Details: Generic messages only

### Database Connection Logging

**Development**:
- Detailed connection information
- Connection string details (masked)
- Database name displayed
- Connection method shown

**Production**:
- Minimal connection logging
- Only connection status
- No sensitive information

**Configuration**: [src/server.js](src/server.js) lines 41-49

### Server Startup Information

**Development**:
- All IP addresses displayed
- GraphQL Playground URLs shown
- Detailed connection information
- Debug messages

**Production**:
- Minimal startup information
- No GraphQL Playground URLs
- Basic connection confirmation

**Configuration**: [src/server.js](src/server.js) lines 93-99

---

## Maintenance Guidelines

### When to Update This Document

Update this architecture documentation when:

1. **New Features Added**
   - Add new GraphQL types/resolvers
   - Add new database models
   - Add new authentication methods

2. **Project Structure Changes**
   - Directory reorganization
   - New modules/components
   - File location changes

3. **Dependencies Updated**
   - Major version changes
   - New dependencies added
   - Breaking changes in dependencies

4. **Configuration Changes**
   - New environment variables
   - Configuration structure changes
   - New security settings

5. **Architecture Changes**
   - New architectural patterns
   - Data flow modifications
   - Security enhancements

### Document Structure

- Keep sections organized and up-to-date
- Update diagrams when architecture changes
- Maintain code references (file paths)
- Keep examples current with codebase

### Version Information

**Current Version**: 2.0.3 (from package.json)

**Last Updated**: 2024

---

## Additional Resources

- **Project README**: [README.md](README.md)
- **Package Configuration**: [package.json](package.json)
- **Environment Template**: [_env](_env)
- **Test Files**: [tests/](tests/)

---

**Document Maintained By**: Development Team

**For Questions or Updates**: Refer to project repository

