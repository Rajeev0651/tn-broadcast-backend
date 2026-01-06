import { Router } from 'express';
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
 * Codeforces API routes
 */
routesManager.use('/api/codeforces', codeforcesRoutes);

export default routesManager;
