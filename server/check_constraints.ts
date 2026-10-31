import prisma from './src/lib/prisma';

async function check() {
  const indexes = await prisma.$queryRaw<any[]>`
    SELECT indexname FROM pg_indexes WHERE indexname = 'invoices_one_per_period'
  `;
  const sequences = await prisma.$queryRaw<any[]>`
    SELECT sequencename FROM pg_sequences WHERE sequencename IN ('invoice_seq', 'subscription_seq')
  `;
  const constraints = await prisma.$queryRaw<any[]>`
    SELECT conname FROM pg_constraint WHERE conname IN ('paid_not_over_total', 'discount_percent_range', 'discount_usage_cap', 'payment_positive')
  `;

  console.log('--- VERIFICATION RESULTS ---');
  console.log('INDEXES:', indexes.map(i => i.indexname));
  console.log('SEQUENCES:', sequences.map(s => s.sequencename));
  console.log('CONSTRAINTS:', constraints.map(c => c.conname));
  await prisma.$disconnect();
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});

