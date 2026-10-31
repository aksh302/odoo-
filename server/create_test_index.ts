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
  console.log('Creating index test.invoices_one_per_period...');
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_per_period
      ON test."Invoice" ("subscriptionId", "periodStart")
      WHERE status <> 'CANCELLED' AND "isSynthetic" = false;
  `);

  const idx = await prisma.$queryRaw<any[]>`
    SELECT schemaname, indexname, tablename FROM pg_indexes WHERE indexname = 'invoices_one_per_period';
  `;
  console.log('Current invoices_one_per_period indexes in DB:', idx);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

