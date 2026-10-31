import app from './app';
import { config } from './config';
import prisma from './lib/prisma';
import { describeDbError } from './lib/dbErrors';

/** Checks the database once at startup and prints a clear message if something is off. */
async function checkDatabase(): Promise<void> {
  const where = (process.env.DATABASE_URL ?? '').replace(/\/\/[^@]*@/, '//').split('?')[0] || '(DATABASE_URL is not set)';
  try {
    await prisma.$queryRaw`SELECT 1`;
    const users = await prisma.user.count();
    console.log(`Database: connected to ${where} (${users} users)`);
    if (users === 0) console.warn('Database: empty. Load the demo data with: npm --prefix server run db:setup');
  } catch (err) {
    const db = describeDbError(err);
    console.error('');
    console.error(`!! Database problem at ${where}`);
    console.error(`!! ${db ? `${db.message} ${db.hint}` : (err as Error).message}`);
    console.error('!! The app will show an error on every page until this is fixed.');
    console.error('');
  }
}

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`Brightloop SMS server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Demo mode: ${config.demoMode ? 'ON' : 'OFF'}`);
  console.log(`AI enabled: ${config.ai.enabled ? 'ON' : 'OFF'}`);
  void checkDatabase();
});

