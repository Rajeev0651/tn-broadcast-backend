import { Router } from 'express';
import mediaRoutes from './mediaRoutes.js';
import streamRoutes from './streamRoutes.js';
import codeforcesRoutes from './codeforcesRoutes.js';

const routesManager = Router();

/**
 * Health check route
 */
routesManager.get('/', (req, res) => {
	const status = 200;
	res.status(status).end();
});

/**
 * Media API routes
 */
routesManager.use('/api/media', mediaRoutes);

/**
 * Streams API routes
 */
routesManager.use('/api/streams', streamRoutes);

/**
 * Codeforces API routes
 */
routesManager.use('/api/codeforces', codeforcesRoutes);

export default routesManager;
