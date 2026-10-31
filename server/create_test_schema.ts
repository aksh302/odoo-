import prisma from './src/lib/prisma';

async function main() {
  await prisma.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS test;');
  console.log('PostgreSQL schema `test` created successfully on Neon.');
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

