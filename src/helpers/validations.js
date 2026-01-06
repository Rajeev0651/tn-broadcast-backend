/**
 * Check if email is valid
 * @param {string} email
 * @returns {boolean}
 */
export const isValidEmail = (email) => {
	if (!email) {
		return false;
	}
	const emailValidPattern = new RegExp(/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
	return emailValidPattern.test(email);
};

/**
 * Check if password is secure. Rules: At least 8 characters. It must contain numbers, lowercase letters and uppercase letters. The spaces are not allowed. Only english characters are allowed. This characters are not allowed: { } ( ) | ~ € ¿ ¬
 * @param {string} password
 * @returns {boolean}
 */
export const isStrongPassword = (password) => {
	if (!password) {
		return false;
	}
	const passwordValidPattern = new RegExp(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])[0-9a-zA-Z!*^?+-_@#$%&]{8,}$/);
	return passwordValidPattern.test(password);
};

/**
 * Check if hashcode is in valid format (xxxx-xxxx-xxxx-xxxx)
 * @param {string} hashcode
 * @returns {boolean}
 */
export const isValidHashcode = (hashcode) => {
	if (!hashcode) {
		return false;
	}
	const hashcodePattern = new RegExp(/^[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}$/i);
	return hashcodePattern.test(hashcode);
};

/**
 * Check if media URL is valid (HLS master.m3u8 for pre-recorded or any URL for external)
 * @param {string} url
 * @param {string} type - 'pre-recorded' or 'external'
 * @returns {boolean}
 */
export const isValidMediaUrl = (url, type) => {
	if (!url || !type) {
		return false;
	}
	
	// Basic URL validation
	try {
		new URL(url);
	} catch {
		return false;
	}
	
	// For pre-recorded, URL should end with master.m3u8
	if (type === 'pre-recorded') {
		return url.endsWith('master.m3u8') || url.includes('master.m3u8');
	}
	
	// For external, any valid URL is acceptable
	return true;
};

/**
 * Check if stream status transition is valid
 * @param {string} currentStatus - Current status
 * @param {string} newStatus - New status
 * @returns {boolean}
 */
export const isValidStatusTransition = (currentStatus, newStatus) => {
	if (!currentStatus || !newStatus) {
		return false;
	}
	
	// Valid transitions
	const validTransitions = {
		'scheduled': ['live', 'cancelled'],
		'live': ['finished', 'cancelled'],
		'finished': [], // Cannot transition from finished
		'cancelled': [] // Cannot transition from cancelled
	};
	
	return validTransitions[currentStatus]?.includes(newStatus) || false;
};
