const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('mongo-sanitize');

// Every limiter below returns the same JSON shape as the rest of the API
// ({success, message}) instead of a bare string. express-rate-limit sends
// whatever `message` is verbatim as the body; a plain string isn't JSON, so
// the frontend's httpClient (which only reads `data.message` when the
// response is application/json) fell back to a generic "HTTP 429: ..."
// instead of surfacing the real reason. `standardHeaders: true` (on all
// three) also keeps `RateLimit-*` / `Retry-After` response headers so a
// well-behaved client can back off automatically instead of guessing.
function rateLimitMessage(text) {
  return (req, res) => ({
    success: false,
    message: text,
    retryAfter: res.getHeader('Retry-After'),
  });
}

// General API traffic. 100/15min was sized for a handful of calls per page
// view, but a real admin session — dashboard, students, teachers, fees,
// notifications, activity log, plus the background session-check poll in
// AuthContext — comfortably exceeds that within a few minutes of normal use.
// Raised to a budget that tracks realistic usage; the session-check poll
// itself now has its own separate, more generous bucket below so it can't
// crowd out the user's actual clicks.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // per IP
  message: rateLimitMessage('Too many requests from this IP, please try again in a few minutes.'),
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /api/auth/get-me is polled in the background every ~60s by every
// logged-in tab to keep the session fresh (see AuthContext.jsx). It's cheap,
// read-only, and shouldn't compete with the user's actual actions for the
// general limiter's budget — but it still needs its own ceiling so a runaway
// poll (e.g. a stuck retry loop) can't hammer the server unbounded.
const sessionCheckLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120, // generous relative to the ~60s poll interval (≈15 expected/15min)
  message: rateLimitMessage('Too many session checks, please refresh the page in a moment.'),
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 login attempts per 15 minutes
  message: rateLimitMessage('Too many login attempts, please try again later.'),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: rateLimitMessage('Too many API requests, please slow down.'),
  standardHeaders: true,
  legacyHeaders: false,
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
// NOTE: Express 5 exposes req.query as a getter with no setter, so
// `req.query = mongoSanitize(req.query)` throws "Cannot set property query
// of #<IncomingMessage> which has only a getter" on every single request
// that has a query string. Mutate the existing object's keys in place instead
// of reassigning the property itself. req.body/req.params are plain
// per-request objects and remain safe to reassign directly.
function sanitizeInPlace(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clean = mongoSanitize(obj);
  for (const key of Object.keys(obj)) {
    if (!(key in clean)) delete obj[key];
  }
  Object.assign(obj, clean);
  return obj;
}

const dataSanitization = (req, res, next) => {
  req.body = mongoSanitize(req.body);
  req.params = mongoSanitize(req.params);
  sanitizeInPlace(req.query);
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
  sessionCheckLimiter,
  authLimiter,
  apiLimiter,
  securityHeaders,
  dataSanitization,
  corsOptions,
  validateContentType,
  requestSizeLimit,
  preventMimeSniff,
};
