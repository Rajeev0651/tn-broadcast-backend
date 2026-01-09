/**
 * Standings State Update Logic
 * Implements incremental simulation state updates for contest standings
 * 
 * This module provides deterministic state update functions that process
 * submissions and hacks to maintain participant standings state.
 */

/**
 * Process a submission event and update participant state
 * @param {Object} state - Current participant state
 * @param {Object} submission - Submission event
 * @param {string} submission.problemIndex - Problem index (e.g., "A", "B")
 * @param {string} submission.verdict - Verdict ("OK", "WRONG_ANSWER", etc.)
 * @param {number} submission.relativeTimeSeconds - Time relative to contest start (seconds)
 * @param {number} submission.points - Points awarded for this problem (if solved)
 * @returns {Object} Updated state
 */
export function processSubmission(state, submission) {
	const { problemIndex, verdict, relativeTimeSeconds, points } = submission;
	
	// Ensure problems is a Map (convert from object if needed)
	if (!(state.problems instanceof Map)) {
		state.problems = new Map(
			state.problems ? Object.entries(state.problems) : []
		);
	}
	
	// Get or initialize problem state
	const problem = state.problems.get(problemIndex) || {
		solved: false,
		points: 0,
		rejectCount: 0,
		solveTime: null,
		firstAttemptTime: relativeTimeSeconds
	};
	
	if (verdict === 'OK' && !problem.solved) {
		// First accepted submission
		problem.solved = true;
		problem.points = points || 0;
		problem.solveTime = relativeTimeSeconds;
		
		// Update totals
		state.totalPoints += problem.points;
		// Penalty calculation: rejected attempts * 20 minutes + submission time in minutes
		// Codeforces uses 20 minutes penalty per failed attempt
		state.totalPenalty += problem.rejectCount * 20 + Math.floor(relativeTimeSeconds / 60);
		state.solvedCount += 1;
		state.lastAcTime = Math.max(state.lastAcTime || 0, relativeTimeSeconds);
		
		state.problems.set(problemIndex, problem);
	} else if (verdict !== 'OK' && !problem.solved) {
		// Failed attempt (only count if not already solved)
		problem.rejectCount += 1;
		// Update firstAttemptTime if this is the first attempt
		if (problem.firstAttemptTime === null || problem.firstAttemptTime === undefined) {
			problem.firstAttemptTime = relativeTimeSeconds;
		}
		state.problems.set(problemIndex, problem);
	}
	
	// Update last submission time (any verdict)
	state.lastSubmissionTime = Math.max(state.lastSubmissionTime || 0, relativeTimeSeconds);
	
	return state;
}

/**
 * Process a hack event and update participant state
 * @param {Object} state - Current participant state
 * @param {Object} hack - Hack event
 * @param {string} hack.verdict - Hack verdict ("SUCCESSFUL", "UNSUCCESSFUL", etc.)
 * @returns {Object} Updated state
 */
export function processHack(state, hack) {
	if (hack.verdict === 'SUCCESSFUL') {
		state.hackSuccess += 1;
		// Note: Codeforces-style contests may award points for successful hacks
		// +100 points per successful hack, -50 per failed hack
		// Uncomment if your contest rules include hack points:
		// state.totalPoints += 100;
	} else if (hack.verdict === 'UNSUCCESSFUL') {
		state.hackFail += 1;
		// Uncomment if your contest rules include hack penalties:
		// state.totalPoints = Math.max(0, state.totalPoints - 50);
	}
	return state;
}

/**
 * Compare two participants for ranking (Codeforces-style)
 * Primary: totalPoints (descending)
 * Secondary: totalPenalty (ascending - lower is better)
 * Tertiary: lastAcTime (ascending - earlier is better)
 * 
 * @param {Object} a - First participant state
 * @param {Object} b - Second participant state
 * @returns {number} Comparison result: negative if a < b, positive if a > b, 0 if equal
 */
export function compareParticipants(a, b) {
	// Primary: totalPoints (descending)
	if (b.totalPoints !== a.totalPoints) {
		return b.totalPoints - a.totalPoints;
	}
	
	// Secondary: totalPenalty (ascending - lower penalty is better)
	if (a.totalPenalty !== b.totalPenalty) {
		return a.totalPenalty - b.totalPenalty;
	}
	
	// Tertiary: lastAcTime (ascending - earlier acceptance is better)
	const aLastAc = a.lastAcTime || Infinity;
	const bLastAc = b.lastAcTime || Infinity;
	return aLastAc - bLastAc;
}

/**
 * Create initial state for a participant
 * @param {string} handle - Participant handle
 * @param {number} contestId - Contest ID
 * @param {Object} metadata - Participant metadata
 * @param {string} metadata.participantType - Participant type
 * @param {boolean} metadata.ghost - Is ghost participant
 * @param {boolean} metadata.isUnofficial - Is unofficial participant
 * @returns {Object} Initial state
 */
export function createInitialState(handle, contestId, metadata = {}) {
	return {
		contestId,
		handle,
		participantType: metadata.participantType || 'CONTESTANT',
		ghost: metadata.ghost || false,
		isUnofficial: metadata.isUnofficial || false,
		problems: new Map(),
		totalPoints: 0,
		totalPenalty: 0,
		solvedCount: 0,
		lastAcTime: null,
		hackSuccess: 0,
		hackFail: 0,
		lastSubmissionTime: null,
		snapshotVersion: 0,
		updatedAt: new Date()
	};
}

/**
 * Convert state to plain object (for storage/serialization)
 * Converts Map to object for MongoDB storage
 * @param {Object} state - State with Map for problems
 * @returns {Object} Plain object state
 */
export function stateToPlainObject(state) {
	const plainState = { ...state };
	
	// Convert problems Map to object
	if (state.problems instanceof Map) {
		const problemsObj = {};
		for (const [key, value] of state.problems.entries()) {
			problemsObj[key] = value;
		}
		plainState.problems = problemsObj;
	}
	
	return plainState;
}

/**
 * Convert plain object to state (for loading from database)
 * Converts object back to Map for problems
 * @param {Object} plainState - Plain object state from database
 * @returns {Object} State with Map for problems
 */
export function plainObjectToState(plainState) {
	const state = { ...plainState };
	
	// Convert problems object to Map
	if (plainState.problems && typeof plainState.problems === 'object' && !(plainState.problems instanceof Map)) {
		state.problems = new Map(Object.entries(plainState.problems));
	} else if (!plainState.problems) {
		state.problems = new Map();
	}
	
	return state;
}
