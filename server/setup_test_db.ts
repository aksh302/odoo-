import { readFileSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

// We connect specifically to schema=test
const testUrl = process.env.DATABASE_URL!.includes('?')
  ? `${process.env.DATABASE_URL}&schema=test`
  : `${process.env.DATABASE_URL}?schema=test`;

process.env.DATABASE_URL = testUrl;

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({
  datasources: { db: { url: testUrl } },
});

async function setup() {
  console.log('Applying constraints to `test` schema...');
  const sql = readFileSync(path.resolve(__dirname, 'prisma/sql/001_constraints.sql'), 'utf-8');
  
  // Set search_path to test so tables, sequences, indexes are created inside test schema
  await prisma.$executeRawUnsafe('SET search_path TO test, public;');

  const statements = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--')) // drop comment lines, keep the SQL under them
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt + ';');
    } catch (e: any) {
      console.warn('SQL Notice:', e.message);
    }
  }

  console.log('✅ Constraints and sequences applied to `test` schema.');
  await prisma.$disconnect();
}

setup().catch(err => {
  console.error(err);
  process.exit(1);
});

