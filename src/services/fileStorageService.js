import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../helpers/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base directory for file storage
const FILE_STORAGE_DIR = path.join(__dirname, '..', 'data', 'fileStorage');

/**
 * File Storage Service
 * Handles file-based storage for incremental standings data
 * Each collection is stored as a JSON file named after the collection
 */
class FileStorageService {
	constructor() {
		this.baseDir = FILE_STORAGE_DIR;
		this._dirEnsured = false;
	}

	/**
	 * Ensure the file storage directory exists
	 * @returns {Promise<void>}
	 */
	async ensureDirectoryExists() {
		try {
			await fs.mkdir(this.baseDir, { recursive: true });
		} catch (error) {
			logger.error(`Error creating file storage directory: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Get file path for a collection and contest
	 * @param {string} collectionName - Collection name (e.g., 'standingsState', 'baseSnapshots')
	 * @param {number} contestId - Contest ID
	 * @returns {string} File path
	 */
	getFilePath(collectionName, contestId) {
		return path.join(this.baseDir, `${collectionName}_${contestId}.json`);
	}

	/**
	 * Read data from file
	 * @param {string} collectionName - Collection name
	 * @param {number} contestId - Contest ID
	 * @returns {Promise<Array>} Array of documents
	 */
	async read(collectionName, contestId) {
		try {
			if (!this._dirEnsured) {
				await this.ensureDirectoryExists();
				this._dirEnsured = true;
			}
			const filePath = this.getFilePath(collectionName, contestId);
			const data = await fs.readFile(filePath, 'utf-8');
			return JSON.parse(data);
		} catch (error) {
			if (error.code === 'ENOENT') {
				// File doesn't exist, return empty array
				return [];
			}
			logger.error(`Error reading file ${collectionName} for contest ${contestId}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Write data to file
	 * @param {string} collectionName - Collection name
	 * @param {number} contestId - Contest ID
	 * @param {Array} data - Array of documents to write
	 * @returns {Promise<void>}
	 */
	async write(collectionName, contestId, data) {
		try {
			if (!this._dirEnsured) {
				await this.ensureDirectoryExists();
				this._dirEnsured = true;
			}
			const filePath = this.getFilePath(collectionName, contestId);
			const jsonData = JSON.stringify(data, null, 2);
			await fs.writeFile(filePath, jsonData, 'utf-8');
		} catch (error) {
			logger.error(`Error writing file ${collectionName} for contest ${contestId}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Find documents matching query
	 * @param {string} collectionName - Collection name
	 * @param {number} contestId - Contest ID
	 * @param {Object} query - MongoDB-style query object
	 * @returns {Promise<Array>} Matching documents
	 */
	async find(collectionName, contestId, query = {}) {
		const allDocuments = await this.read(collectionName, contestId);
		return this.filterDocuments(allDocuments, query);
	}

	/**
	 * Find one document matching query
	 * @param {string} collectionName - Collection name
	 * @param {number} contestId - Contest ID
	 * @param {Object} query - MongoDB-style query object
	 * @returns {Promise<Object|null>} Matching document or null
	 */
	async findOne(collectionName, contestId, query = {}) {
		const results = await this.find(collectionName, contestId, query);
		return results.length > 0 ? results[0] : null;
	}

	/**
	 * Count documents matching query
	 * @param {string} collectionName - Collection name
	 * @param {number} contestId - Contest ID
	 * @param {Object} query - MongoDB-style query object
	 * @returns {Promise<number>} Count
	 */
	async countDocuments(collectionName, contestId, query = {}) {
		const results = await this.find(collectionName, contestId, query);
		return results.length;
	}

	/**
	 * Insert a document
	 * @param {string} collectionName - Collection name
	 * @param {number} contestId - Contest ID
	 * @param {Object} document - Document to insert
	 * @returns {Promise<Object>} Inserted document with _id
	 */
	async insertOne(collectionName, contestId, document) {
		const allDocuments = await this.read(collectionName, contestId);
		
		// Generate _id if not present
		if (!document._id) {
			document._id = this.generateId();
		}
		
		// Add timestamps if not present
		if (!document.createdAt) {
			document.createdAt = new Date().toISOString();
		}
		if (!document.updatedAt) {
			document.updatedAt = new Date().toISOString();
		}
		
		allDocuments.push(document);
		await this.write(collectionName, contestId, allDocuments);
		
		return document;
	}

	/**
	 * Insert multiple documents
	 * @param {string} collectionName - Collection name
	 * @param {number} contestId - Contest ID
	 * @param {Array} documents - Documents to insert
	 * @returns {Promise<Array>} Inserted documents
	 */
	async insertMany(collectionName, contestId, documents) {
		const allDocuments = await this.read(collectionName, contestId);
		const now = new Date().toISOString();
		
		const newDocuments = documents.map(doc => {
			if (!doc._id) {
				doc._id = this.generateId();
			}
			if (!doc.createdAt) {
				doc.createdAt = now;
			}
			if (!doc.updatedAt) {
				doc.updatedAt = now;
			}
			return doc;
		});
		
		allDocuments.push(...newDocuments);
		await this.write(collectionName, contestId, allDocuments);
		
		return newDocuments;
	}

	/**
	 * Update one document
	 * @param {string} collectionName - Collection name
	 * @param {number} contestId - Contest ID
	 * @param {Object} filter - Filter criteria
	 * @param {Object} update - Update operations ($set, etc.)
	 * @param {Object} options - Options (upsert, etc.)
	 * @returns {Promise<Object|null>} Updated document or null
	 */
	async updateOne(collectionName, contestId, filter, update, options = {}) {
		const allDocuments = await this.read(collectionName, contestId);
		let index = allDocuments.findIndex(doc => this.matchesQuery(doc, filter));
		
		if (index === -1) {
			if (options.upsert) {
				// Insert new document
				const newDoc = { ...filter, ...(update.$set || {}), ...(update.$setOnInsert || {}) };
				return await this.insertOne(collectionName, contestId, newDoc);
			}
			return null;
		}
		
		// Apply update operations
		if (update.$set) {
			allDocuments[index] = { ...allDocuments[index], ...update.$set };
		}
		if (update.$setOnInsert) {
			// Only set if document is new (but we already inserted if upsert)
		}
		
		allDocuments[index].updatedAt = new Date().toISOString();
		await this.write(collectionName, contestId, allDocuments);
		
		return allDocuments[index];
	}

	/**
	 * Find one and update (or upsert)
	 * @param {string} collectionName - Collection name
	 * @param {number} contestId - Contest ID
	 * @param {Object} filter - Filter criteria
	 * @param {Object} update - Update operations
	 * @param {Object} options - Options
	 * @returns {Promise<Object|null>} Updated document
	 */
	async findOneAndUpdate(collectionName, contestId, filter, update, options = {}) {
		return await this.updateOne(collectionName, contestId, filter, update, options);
	}

	/**
	 * Delete documents matching filter
	 * @param {string} collectionName - Collection name
	 * @param {number} contestId - Contest ID
	 * @param {Object} filter - Filter criteria
	 * @returns {Promise<number>} Number of documents deleted
	 */
	async deleteMany(collectionName, contestId, filter = {}) {
		const allDocuments = await this.read(collectionName, contestId);
		const filtered = allDocuments.filter(doc => !this.matchesQuery(doc, filter));
		const deletedCount = allDocuments.length - filtered.length;
		
		if (deletedCount > 0) {
			await this.write(collectionName, contestId, filtered);
		}
		
		return deletedCount;
	}

	/**
	 * Filter documents based on MongoDB-style query
	 * @param {Array} documents - Documents to filter
	 * @param {Object} query - Query object
	 * @returns {Array} Filtered documents
	 */
	filterDocuments(documents, query) {
		if (Object.keys(query).length === 0) {
			return documents;
		}
		
		return documents.filter(doc => this.matchesQuery(doc, query));
	}

	/**
	 * Check if document matches query
	 * @param {Object} doc - Document
	 * @param {Object} query - Query object
	 * @returns {boolean} True if matches
	 */
	matchesQuery(doc, query) {
		for (const [key, value] of Object.entries(query)) {
			const docValue = doc[key];
			
			if (key === '_id') {
				if (doc._id !== value && doc._id?.toString() !== value?.toString()) {
					return false;
				}
			} else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
				// Handle operators like $lte, $gte, $gt, $lt, $in, etc.
				if (value.$lte !== undefined) {
					if (docValue === null || docValue === undefined || docValue > value.$lte) return false;
				}
				if (value.$gte !== undefined) {
					if (docValue === null || docValue === undefined || docValue < value.$gte) return false;
				}
				if (value.$gt !== undefined) {
					if (docValue === null || docValue === undefined || docValue <= value.$gt) return false;
				}
				if (value.$lt !== undefined) {
					if (docValue === null || docValue === undefined || docValue >= value.$lt) return false;
				}
				if (value.$in !== undefined) {
					if (!Array.isArray(value.$in) || !value.$in.includes(docValue)) return false;
				}
				if (value.$ne !== undefined) {
					if (docValue === value.$ne) return false;
				}
				// If it's an empty object or has no operators, treat as exact match
				if (Object.keys(value).length === 0 && docValue !== value) {
					return false;
				}
			} else if (Array.isArray(value)) {
				if (!value.includes(docValue)) return false;
			} else {
				if (docValue !== value) return false;
			}
		}
		return true;
	}

	/**
	 * Generate a simple ID (timestamp + random)
	 * @returns {string} Generated ID
	 */
	generateId() {
		return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Sort documents (simplified - only handles single field sort)
	 * @param {Array} documents - Documents to sort
	 * @param {Object} sort - Sort specification {field: 1 or -1}
	 * @returns {Array} Sorted documents
	 */
	sortDocuments(documents, sort) {
		const sortEntries = Object.entries(sort);
		if (sortEntries.length === 0) return documents;
		
		return [...documents].sort((a, b) => {
			for (const [field, direction] of sortEntries) {
				const aVal = this.getNestedValue(a, field);
				const bVal = this.getNestedValue(b, field);
				
				if (aVal < bVal) return direction === 1 ? -1 : 1;
				if (aVal > bVal) return direction === 1 ? 1 : -1;
			}
			return 0;
		});
	}

	/**
	 * Get nested value from object using dot notation
	 * @param {Object} obj - Object
	 * @param {string} path - Dot notation path
	 * @returns {any} Value
	 */
	getNestedValue(obj, path) {
		return path.split('.').reduce((curr, prop) => curr?.[prop], obj);
	}

	/**
	 * Select specific fields (projection)
	 * @param {Array} documents - Documents
	 * @param {Object|string} projection - Fields to include/exclude (object or space-separated string)
	 * @returns {Array} Projected documents
	 */
	projectDocuments(documents, projection) {
		if (!projection || (typeof projection === 'object' && Object.keys(projection).length === 0)) {
			return documents;
		}
		
		// Convert string projection to object (e.g., "field1 field2" -> {field1: 1, field2: 1})
		if (typeof projection === 'string') {
			const fields = projection.split(/\s+/).filter(f => f.length > 0);
			projection = {};
			for (const field of fields) {
				projection[field] = 1;
			}
		}
		
		const isInclusion = Object.values(projection)[0] === 1;
		
		return documents.map(doc => {
			if (isInclusion) {
				// Inclusion projection - only include specified fields (+ _id by default)
				const projected = { _id: doc._id }; // Include _id by default (MongoDB behavior)
				for (const [key, value] of Object.entries(projection)) {
					if (value === 1 && key !== '_id') {
						const nestedValue = this.getNestedValue(doc, key);
						if (nestedValue !== undefined) {
							// Handle nested fields
							if (key.includes('.')) {
								this.setNestedValue(projected, key, nestedValue);
							} else {
								projected[key] = nestedValue;
							}
						}
					}
				}
				return projected;
			} else {
				// Exclusion projection - exclude specified fields
				const projected = { ...doc };
				for (const [key, value] of Object.entries(projection)) {
					if (value === 0) {
						if (key.includes('.')) {
							// Handle nested exclusions (simplified)
							const parts = key.split('.');
							if (parts.length === 2 && projected[parts[0]] && typeof projected[parts[0]] === 'object') {
								delete projected[parts[0]][parts[1]];
							}
						} else {
							delete projected[key];
						}
					}
				}
				return projected;
			}
		});
	}

	/**
	 * Set nested value in object using dot notation
	 * @param {Object} obj - Object
	 * @param {string} path - Dot notation path
	 * @param {any} value - Value to set
	 */
	setNestedValue(obj, path, value) {
		const parts = path.split('.');
		const lastPart = parts.pop();
		const target = parts.reduce((curr, prop) => {
			if (!curr[prop]) curr[prop] = {};
			return curr[prop];
		}, obj);
		target[lastPart] = value;
	}
}

// Export singleton instance
export const fileStorageService = new FileStorageService();
