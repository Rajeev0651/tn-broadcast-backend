import { randomBytes } from 'crypto';

/**
 * Generates a hashcode in the format xxxx-xxxx-xxxx-xxxx
 * Each segment is 4 hexadecimal characters
 * @returns {string} Hashcode in format xxxx-xxxx-xxxx-xxxx
 */
export const generateHashcode = () => {
	// Generate 16 random bytes (128 bits) which gives us 32 hex characters
	// We'll split them into 4 groups of 4 characters each
	const bytes = randomBytes(16);
	const hex = bytes.toString('hex');
	
	// Format as xxxx-xxxx-xxxx-xxxx
	return `${hex.substring(0, 4)}-${hex.substring(4, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}`;
};

