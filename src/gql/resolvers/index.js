import merge from 'lodash.merge';

import users from './users.js';
import auth from './auth.js';
import codeforces from './codeforces.js';

export const resolvers = merge(
	users,
	auth,
	codeforces
);
