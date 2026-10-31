/**
 * AI cache helper.
 * Caches identical AI requests for 24 hours when AI_CACHE=true.
 * Key = sha256 of feature + normalized input.
 * Placeholder - implemented in Phase 9.
 */

import crypto from 'crypto';
import prisma from './prisma';
import { config } from '../config';

/**
 * Generate a cache key from feature name and input.
 */
export function cacheKey(feature: string, input: string): string {
  return crypto.createHash('sha256').update(`${feature}:${input}`).digest('hex');
}

/**
 * Get a cached value.
 */
export async function getCached<T>(key: string): Promise<T | null> {
  if (!config.ai.cache) return null;

  const entry = await prisma.aiCache.findUnique({ where: { key } });
  if (!entry) return null;

  // Check 24-hour expiry
  const hoursSinceCreation = (Date.now() - entry.createdAt.getTime()) / (1000 * 60 * 60);
  if (hoursSinceCreation > 24) {
    await prisma.aiCache.delete({ where: { key } }).catch(() => {});
    return null;
  }

  return entry.value as T;
}

/**
 * Set a cached value.
 */
export async function setCached(key: string, value: any): Promise<void> {
  if (!config.ai.cache) return;

  await prisma.aiCache.upsert({
    where: { key },
    update: { value, createdAt: new Date() },
    create: { key, value, createdAt: new Date() },
  });
}

