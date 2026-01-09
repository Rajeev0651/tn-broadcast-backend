/**
 * Utility Script: Initialize Standings State
 * 
 * Initializes the standingsState collection from existing submissions.
 * This should be run once per contest before using the incremental system.
 * 
 * Usage:
 *   node scripts/initStandingsState.js <contestId>
 * 
 * Example:
 *   node scripts/initStandingsState.js 1234
 */

import mongoose from 'mongoose';
import { incrementalSimulationService } from '../src/services/incrementalSimulationService.js';
import { codeforcesDataService } from '../src/services/codeforcesDataService.js';
import { logger } from '../src/helpers/logger.js';
import { environmentVariablesConfig } from '../src/config/appConfig.js';
import { ENVIRONMENT } from '../src/config/environment.js';

const contestId = process.argv[2] ? parseInt(process.argv[2]) : null;

if (!contestId) {
	console.error('Usage: node scripts/initStandingsState.js <contestId>');
	process.exit(1);
}

async function initializeStandingsState() {
	try {
		// Connect to MongoDB
		console.log('Connecting to MongoDB...');
		mongoose.set('strictQuery', true);
		
		let mongoUri;
		if (environmentVariablesConfig.formatConnection === 'DNSseedlist' && environmentVariablesConfig.mongoDNSseedlist !== '') {
			mongoUri = environmentVariablesConfig.mongoDNSseedlist;
		} else {
			if (environmentVariablesConfig.mongoUser !== '' && environmentVariablesConfig.mongoPass !== '') {
				mongoUri = `mongodb://${environmentVariablesConfig.mongoUser}:${environmentVariablesConfig.mongoPass}@${environmentVariablesConfig.dbHost}:${environmentVariablesConfig.dbPort}/${environmentVariablesConfig.database}`;
			} else {
				mongoUri = `mongodb://${environmentVariablesConfig.dbHost}:${environmentVariablesConfig.dbPort}/${environmentVariablesConfig.database}`;
			}
		}
		
		await mongoose.connect(mongoUri, {
			useNewUrlParser: true,
			useUnifiedTopology: true
		});
		console.log(`Connected to MongoDB: ${environmentVariablesConfig.database}\n`);

		// Check if contest exists
		console.log(`Checking contest ${contestId}...`);
		const contest = await codeforcesDataService.getContestFromDB(contestId);
		if (!contest) {
			throw new Error(`Contest ${contestId} not found`);
		}
		console.log(`✓ Contest found: ${contest.name}\n`);

		// Initialize standings state
		console.log('Initializing standings state from submissions...');
		console.log('This may take a while depending on the number of submissions...\n');
		
		const startTime = Date.now();
		await incrementalSimulationService.initializeStandingsState(contestId);
		const elapsed = Date.now() - startTime;
		
		console.log(`\n✓ Standings state initialized successfully in ${elapsed}ms`);
		console.log(`  Contest: ${contest.name} (ID: ${contestId})`);
		console.log(`\nNext steps:`);
		console.log(`  1. Create snapshots using snapshotService`);
		console.log(`  2. Test queries using testIncrementalStandings.js`);

	} catch (error) {
		console.error('\n✗ Error:', error.message);
		console.error(error.stack);
		process.exit(1);
	} finally {
		await mongoose.connection.close();
		console.log('\nMongoDB connection closed');
	}
}

initializeStandingsState();
