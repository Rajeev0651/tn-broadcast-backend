import { models } from '../data/models/index.js';
import { fileModels } from '../data/fileStorage/models.js';

/**
 * Model Provider
 * Returns appropriate models based on fileMode flag
 */
export function getModels(fileMode = false) {
	if (fileMode) {
		return {
			StandingsState: fileModels.StandingsState,
			BaseSnapshots: fileModels.BaseSnapshots,
			DeltaSnapshots: fileModels.DeltaSnapshots
		};
	}
	return {
		StandingsState: models.StandingsState,
		BaseSnapshots: models.BaseSnapshots,
		DeltaSnapshots: models.DeltaSnapshots
	};
}
