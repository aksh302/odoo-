import prisma from './src/lib/prisma';

async function main() {
  const result = await prisma.$queryRaw<any[]>`
    SELECT 
      schemaname, 
      indexname, 
      tablename, 
      indexdef 
    FROM pg_indexes 
    WHERE indexname = 'invoices_one_per_period'
    ORDER BY schemaname;
  `;

  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

