import { readFileSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const testUrl = process.env.DATABASE_URL!.includes('?')
  ? `${process.env.DATABASE_URL}&schema=test`
  : `${process.env.DATABASE_URL}?schema=test`;

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({
  datasources: { db: { url: testUrl } },
});

async function main() {
  await prisma.$executeRawUnsafe('SET search_path TO test;');
  await prisma.$executeRawUnsafe('DELETE FROM test."Payment";');
  await prisma.$executeRawUnsafe('DELETE FROM test."InvoiceLine";');
  await prisma.$executeRawUnsafe('DELETE FROM test."Invoice";');

  const sql = readFileSync(path.resolve(__dirname, 'prisma/sql/001_constraints.sql'), 'utf-8');
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt + ';');
      console.log('Executed:', stmt.slice(0, 50));
    } catch (e: any) {
      console.warn('Notice:', e.message);
    }
  }

  const idx = await prisma.$queryRaw<any[]>`
    SELECT schemaname, indexname, tablename FROM pg_indexes WHERE indexname = 'invoices_one_per_period';
  `;
  console.log('invoices_one_per_period indexes in DB:', idx);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

