/**
 * Turns database connection and setup errors into a plain explanation, so a wrong
 * DATABASE_URL shows "can't reach the database" instead of "An unexpected error occurred".
 */

export interface DbProblem {
  code: 'DATABASE_UNAVAILABLE' | 'DATABASE_NOT_SET_UP';
  message: string;
  /** what to do about it, for the server log */
  hint: string;
}

export function describeDbError(err: any): DbProblem | null {
  const code: string | undefined = err?.code ?? err?.errorCode;
  const text = String(err?.message ?? '');

  if (code === 'P1000' || /authentication failed|password authentication/i.test(text)) {
    return {
      code: 'DATABASE_UNAVAILABLE',
      message: 'The server could not log in to its database.',
      hint: 'The username or password in DATABASE_URL (server/.env) is wrong.',
    };
  }
  if (code === 'P1003' || /database ".*" does not exist/i.test(text)) {
    return {
      code: 'DATABASE_UNAVAILABLE',
      message: "The server's database doesn't exist yet.",
      hint: 'Create it (createdb brightloop, or New database in Neon), then run: npm --prefix server run db:setup',
    };
  }
  if (
    err?.name === 'PrismaClientInitializationError' ||
    ['P1001', 'P1002', 'P1008', 'P1011', 'P1017'].includes(code ?? '') ||
    /can't reach database|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|connection (refused|terminated)|Connection terminated/i.test(text)
  ) {
    return {
      code: 'DATABASE_UNAVAILABLE',
      message: "The server can't reach its database right now.",
      hint: 'Check DATABASE_URL in server/.env and that the database is running (or that you are online, for Neon).',
    };
  }
  if (code === 'P2021' || code === 'P2022' || /relation ".*" does not exist|table .* does not exist/i.test(text)) {
    return {
      code: 'DATABASE_NOT_SET_UP',
      message: "The database is missing its tables.",
      hint: 'Run: npm --prefix server run db:setup',
    };
  }
  return null;
}
