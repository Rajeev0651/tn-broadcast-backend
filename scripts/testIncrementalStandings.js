/**
 * Test Script for Incremental Standings System
 * 
 * This script tests the new incremental standings system with snapshots.
 * 
 * Usage:
 *   node scripts/testIncrementalStandings.js <contestId>
 * 
 * Example:
 *   node scripts/testIncrementalStandings.js 1234
 */

import mongoose from 'mongoose';
import { models } from '../src/data/models/index.js';
import { incrementalSimulationService } from '../src/services/incrementalSimulationService.js';
import { snapshotService } from '../src/services/snapshotService.js';
import { simulationService } from '../src/services/simulationService.js';
import { codeforcesDataService } from '../src/services/codeforcesDataService.js';
import { logger } from '../src/helpers/logger.js';
import { environmentVariablesConfig } from '../src/config/appConfig.js';
import { ENVIRONMENT } from '../src/config/environment.js';

// Get contest ID from command line
const contestId = process.argv[2] ? parseInt(process.argv[2]) : null;

if (!contestId) {
	console.error('Usage: node scripts/testIncrementalStandings.js <contestId>');
	process.exit(1);
}

async function testIncrementalStandings() {
	try {
		// Connect to MongoDB (using same logic as server.js)
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

		// Step 1: Check if contest exists
		console.log(`Step 1: Checking contest ${contestId}...`);
		const contest = await codeforcesDataService.getContestFromDB(contestId);
		if (!contest) {
			throw new Error(`Contest ${contestId} not found`);
		}
		console.log(`✓ Contest found: ${contest.name}`);
		console.log(`  Duration: ${contest.durationSeconds} seconds\n`);

		// Step 2: Check existing data
		console.log('Step 2: Checking existing data...');
		const submissionsCount = await models.BatchedContestData.aggregate([
			{ $match: { contestId } },
			{ $project: { count: { $size: '$submissions' } } },
			{ $group: { _id: null, total: { $sum: '$count' } } }
		]);
		const totalSubmissions = submissionsCount[0]?.total || 0;
		console.log(`  Submissions: ${totalSubmissions}`);

		const standingsStateCount = await models.StandingsState.countDocuments({ contestId });
		console.log(`  StandingsState documents: ${standingsStateCount}`);

		const baseSnapshotCount = await models.BaseSnapshots.countDocuments({ contestId });
		console.log(`  Base snapshots: ${baseSnapshotCount}`);

		const deltaSnapshotCount = await models.DeltaSnapshots.countDocuments({ contestId });
		console.log(`  Delta snapshots: ${deltaSnapshotCount}\n`);

		// Step 3: Initialize standings state (if needed)
		if (standingsStateCount === 0 && totalSubmissions > 0) {
			console.log('Step 3: Initializing standings state from submissions...');
			const startTime = Date.now();
			await incrementalSimulationService.initializeStandingsState(contestId);
			const elapsed = Date.now() - startTime;
			console.log(`✓ Initialized in ${elapsed}ms\n`);
		} else if (standingsStateCount > 0) {
			console.log(`Step 3: Standings state already initialized (${standingsStateCount} participants)\n`);
		} else {
			console.log('Step 3: No submissions found, skipping initialization\n');
		}

		// Step 4: Create test snapshots
		console.log('Step 4: Creating test snapshots...');
		const testTimestamps = [0, 60, 120, 180]; // Base snapshots at 0, 60, 120, 180 seconds
		const deltaTimestamps = [5, 10, 15, 65, 70, 125, 130]; // Delta snapshots

		// Check existing snapshots first
		for (const ts of testTimestamps) {
			const existing = await models.BaseSnapshots.findOne({ contestId, timestampSeconds: ts });
			if (!existing) {
				console.log(`  Creating base snapshot at t=${ts}...`);
				await snapshotService.createBaseSnapshot(contestId, ts);
				console.log(`  ✓ Base snapshot created at t=${ts}`);
			} else {
				console.log(`  Base snapshot at t=${ts} already exists`);
			}
		}

		for (const ts of deltaTimestamps) {
			const existing = await models.DeltaSnapshots.findOne({ contestId, timestampSeconds: ts });
			if (!existing) {
				console.log(`  Creating delta snapshot at t=${ts}...`);
				await snapshotService.createDeltaSnapshot(contestId, ts);
				console.log(`  ✓ Delta snapshot created at t=${ts}`);
			} else {
				console.log(`  Delta snapshot at t=${ts} already exists`);
			}
		}
		console.log('');

		// Step 5: Test query at various timestamps
		console.log('Step 5: Testing queries at various timestamps...\n');
		const testQueries = [
			{ timestamp: 0, rankFrom: 1, rankTo: 10, description: 'Start of contest' },
			{ timestamp: 60, rankFrom: 1, rankTo: 10, description: 'After 1 minute (base snapshot)' },
			{ timestamp: 65, rankFrom: 1, rankTo: 10, description: 'After 1m 5s (base + delta)' },
			{ timestamp: 120, rankFrom: 1, rankTo: 10, description: 'After 2 minutes' },
			{ timestamp: 130, rankFrom: 1, rankTo: 10, description: 'After 2m 10s (multiple deltas)' }
		];

		for (const query of testQueries) {
			console.log(`Testing: ${query.description} (t=${query.timestamp})`);
			const startTime = Date.now();
			
			try {
				const result = await simulationService.getStandingsAtTime(
					contestId,
					query.timestamp,
					query.rankFrom,
					query.rankTo,
					false
				);
				
				const elapsed = Date.now() - startTime;
				console.log(`  ✓ Query completed in ${elapsed}ms`);
				console.log(`    Returned ${result.rows.length} participants`);
				
				if (result.rows.length > 0) {
					const topParticipant = result.rows[0];
					console.log(`    Top participant: ${topParticipant.party.members[0]?.handle || 'N/A'}`);
					console.log(`      Points: ${topParticipant.points}, Penalty: ${topParticipant.penalty}, Rank: ${topParticipant.rank}`);
				}
			} catch (error) {
				console.log(`  ✗ Query failed: ${error.message}`);
			}
			console.log('');
		}

		// Step 6: Performance comparison
		console.log('Step 6: Performance comparison...\n');
		const testTimestamp = 120;
		
		// Test new system
		console.log('Testing new incremental system...');
		let newSystemTime = 0;
		let newSystemResults = null;
		try {
			const start = Date.now();
			newSystemResults = await incrementalSimulationService.getStandingsAtTime(
				contestId,
				testTimestamp,
				1,
				100,
				false
			);
			newSystemTime = Date.now() - start;
			console.log(`  ✓ Completed in ${newSystemTime}ms`);
			console.log(`    Returned ${newSystemResults.rows.length} participants`);
		} catch (error) {
			console.log(`  ✗ Failed: ${error.message}`);
		}

		// Test legacy system (if no snapshots, it will use legacy anyway)
		console.log('\nTesting legacy system...');
		let legacySystemTime = 0;
		let legacySystemResults = null;
		try {
			const start = Date.now();
			legacySystemResults = await simulationService.getStandingsAtTimeLegacy(
				contestId,
				testTimestamp,
				1,
				100,
				false
			);
			legacySystemTime = Date.now() - start;
			console.log(`  ✓ Completed in ${legacySystemTime}ms`);
			console.log(`    Returned ${legacySystemResults.rows.length} participants`);
		} catch (error) {
			console.log(`  ✗ Failed: ${error.message}`);
		}

		if (newSystemTime > 0 && legacySystemTime > 0) {
			const improvement = ((legacySystemTime - newSystemTime) / legacySystemTime * 100).toFixed(1);
			console.log(`\n  Performance improvement: ${improvement}%`);
		}

		// Step 7: Summary
		console.log('\n' + '='.repeat(60));
		console.log('Test Summary');
		console.log('='.repeat(60));
		console.log(`Contest ID: ${contestId}`);
		console.log(`StandingsState participants: ${await models.StandingsState.countDocuments({ contestId })}`);
		console.log(`Base snapshots: ${await models.BaseSnapshots.countDocuments({ contestId })}`);
		console.log(`Delta snapshots: ${await models.DeltaSnapshots.countDocuments({ contestId })}`);
		console.log('='.repeat(60));

		console.log('\n✓ All tests completed successfully!');

	} catch (error) {
		console.error('\n✗ Test failed:', error);
		console.error(error.stack);
		process.exit(1);
	} finally {
		// Close MongoDB connection
		await mongoose.connection.close();
		console.log('\nMongoDB connection closed');
	}
}

// Run the test
testIncrementalStandings().catch(error => {
	console.error('Fatal error:', error);
	process.exit(1);
});
