import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { connectDB } from './utils/db.js';
import { logger } from './utils/logger.js';
import reportRoutes from './routes/reportRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 5000;

// 1. Security Headers Configuration
app.use(helmet());

// 2. CORS Policy Configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*', // Adjust for host applications in production
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
}));

// 3. Request Payloads Parsing & Sanitization
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. Rate Limiting (Prevent Brute-Force & Denial-of-Service)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Max 100 requests per IP per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: 'Too many requests from this IP, please try again later.' }
  }
});
app.use('/api/', apiLimiter);

// 5. Health Check API (DevOps SLA Verification)
app.get('/health', async (req, res) => {
  try {
    const db = await connectDB();
    // Simple ping to ensure database is online
    await db.command({ ping: 1 });
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        server: 'online',
        database: 'connected'
      }
    });
  } catch (err) {
    logger.error('Health check failed:', err);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed'
    });
  }
});

// 6. Registered Route Handlers
app.use('/api/reports', reportRoutes);

// 7. Fallback route for unknown endpoints
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { message: `Route [${req.method}] ${req.originalUrl} not found` }
  });
});

// 8. Centralized Global Error Handler Middleware
app.use(errorHandler);

// Initialize DB and launch server
async function bootstrap() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      logger.info(`Server successfully booted and listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to initialize database or start Express server:', err);
    process.exit(1);
  }
}

bootstrap();
