/**
 * Pagination helper.
 * All list endpoints use { data, page, limit, total } response format.
 * Maximum limit is 100.
 */

import { Request } from 'express';

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/**
 * Extract pagination parameters from the request query.
 */
export function getPagination(req: Request): PaginationParams {
  let page = parseInt(req.query.page as string, 10);
  let limit = parseInt(req.query.limit as string, 10);

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

/**
 * Build a paginated response.
 */
export function paginate<T>(data: T[], total: number, params: PaginationParams): PaginatedResponse<T> {
  return {
    data,
    page: params.page,
    limit: params.limit,
    total,
  };
}

