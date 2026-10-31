/**
 * Rate limiting middleware.
 * Uses express-rate-limit.
 */

import rateLimit from 'express-rate-limit';

/**
 * General API rate limiter.
 * 100 requests per 15 minutes per IP.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later',
    },
  },
});

/**
 * Login/auth rate limiter.
 * 10 failed attempts per 15 minutes per IP. Successful logins don't count, so switching
 * between accounts (admin, staff, customer) never locks anyone out.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many authentication attempts, please try again later',
    },
  },
});

/**
 * AI routes rate limiter.
 * 20 requests per minute per user (using IP as fallback).
 */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use userId if available, otherwise IP
    return req.user?.userId?.toString() || req.ip || 'unknown';
  },
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many AI requests, please try again later',
    },
  },
});

/**
 * Forgot password rate limiter.
 * 5 requests per hour per IP.
 */
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many password reset requests, please try again later',
    },
  },
});

