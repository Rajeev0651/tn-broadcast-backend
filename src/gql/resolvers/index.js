import { mergeResolvers } from '@graphql-tools/merge';
import codeforcesResolvers from './codeforces.js';

// Merge all resolvers
export const resolvers = mergeResolvers([
	codeforcesResolvers,
	{
		Query: {
			_empty: () => null
		}
	}
]);
