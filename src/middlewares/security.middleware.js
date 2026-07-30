const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('mongo-sanitize');

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // 5 login attempts per 15 minutes
  message: 'Too many login attempts, please try again later',
  skipSuccessfulRequests: true,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: 'Too many API requests, please try again later',
});

// Security headers middleware
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

// Data sanitization middleware
const dataSanitization = (req, res, next) => {
  // Sanitize data against NoSQL injection
  req.body = mongoSanitize(req.body);
  req.query = mongoSanitize(req.query);
  req.params = mongoSanitize(req.params);
  next();
};

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'development'
    ? true // allow any origin in dev
    : (process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:3000']),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
};

// Request validation middleware
const validateContentType = (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    if (!req.is('application/json')) {
      return res.status(400).json({
        success: false,
        message: 'Content-Type must be application/json',
      });
    }
  }
  next();
};

// Request size limiting
const requestSizeLimit = (req, res, next) => {
  const maxSize = 5 * 1024 * 1024; // 5MB
  let dataSize = 0;

  req.on('data', (chunk) => {
    dataSize += chunk.length;
    if (dataSize > maxSize) {
      req.connection.destroy();
    }
  });

  next();
};

// Prevent MIME type sniffing
const preventMimeSniff = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
};

module.exports = {
  limiter,
  authLimiter,
  apiLimiter,
  securityHeaders,
  dataSanitization,
  corsOptions,
  validateContentType,
  requestSizeLimit,
  preventMimeSniff,
};
