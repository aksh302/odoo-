import { PrismaClient, Role, BillingPeriod, SubscriptionStatus, InvoiceStatus, DiscountType, DiscountScope, PaymentMethod } from '@prisma/client';
import bcrypt from 'bcrypt';
import { readFileSync } from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const LOAD = args.includes('--load');
const SYNTHETIC = args.includes('--synthetic-history');

const DEFAULT_PASSWORD = 'Brightloop@123';
const SALT_ROUNDS = 10;

// ---- Helpers ----

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function dateStr(y: number, m: number, d: number): Date {
  // Business date (no time component)
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addMonths(d: Date, months: number): Date {
  const result = new Date(d);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function today(): Date {
  const now = new Date();
  return dateStr(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

async function getNextSubNumber(): Promise<string> {
  const result = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('subscription_seq')`;
  const seq = Number(result[0].nextval);
  const year = new Date().getFullYear();
  return `SUB-${year}-${String(seq).padStart(6, '0')}`;
}

async function getNextInvNumber(): Promise<string> {
  const result = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('invoice_seq')`;
  const seq = Number(result[0].nextval);
  const year = new Date().getFullYear();
  return `INV-${year}-${String(seq).padStart(6, '0')}`;
}

// ---- Core Seed Data ----

async function seedCore() {
  console.log('🌱 Seeding core data...');

  const hash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);

  // Admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@brightloop.dev' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@brightloop.dev',
      passwordHash: hash,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  // Staff users
  const staff1 = await prisma.user.upsert({
    where: { email: 'staff1@brightloop.dev' },
    update: {},
    create: {
      name: 'Ravi Kumar',
      email: 'staff1@brightloop.dev',
      passwordHash: hash,
      role: Role.STAFF,
      isActive: true,
    },
  });

  const staff2 = await prisma.user.upsert({
    where: { email: 'staff2@brightloop.dev' },
    update: {},
    create: {
      name: 'Priya Sharma',
      email: 'staff2@brightloop.dev',
      passwordHash: hash,
      role: Role.STAFF,
      isActive: true,
    },
  });

  // Customer users (5 base customers)
  const customers = [];
  const customerData = [
    { name: 'Acme Corp', email: 'acme@example.com', company: 'Acme Corporation', phone: '+91-9876543210', address: '123 MG Road, Bangalore' },
    { name: 'TechStart India', email: 'techstart@example.com', company: 'TechStart India Pvt Ltd', phone: '+91-9876543211', address: '45 Nehru Place, Delhi' },
    { name: 'GreenLeaf Solutions', email: 'greenleaf@example.com', company: 'GreenLeaf Solutions', phone: '+91-9876543212', address: '78 Anna Salai, Chennai' },
    { name: 'CloudNine Systems', email: 'cloudnine@example.com', company: 'CloudNine Systems', phone: '+91-9876543213', address: '22 FC Road, Pune' },
    { name: 'DataFlow Analytics', email: 'dataflow@example.com', company: 'DataFlow Analytics', phone: '+91-9876543214', address: '15 Park Street, Kolkata' },
  ];

  for (const cd of customerData) {
    const user = await prisma.user.upsert({
      where: { email: cd.email },
      update: {},
      create: {
        name: cd.name,
        email: cd.email,
        passwordHash: hash,
        role: Role.CUSTOMER,
        isActive: true,
        profile: {
          create: {
            company: cd.company,
            phone: cd.phone,
            billingAddress: cd.address,
          },
        },
      },
    });
    customers.push(user);
  }

  // Taxes
  const gst18 = await prisma.tax.create({ data: { name: 'GST 18%', percent: 18.00 } });
  const gst12 = await prisma.tax.create({ data: { name: 'GST 12%', percent: 12.00 } });
  const gst5 = await prisma.tax.create({ data: { name: 'GST 5%', percent: 5.00 } });

  // Products
  const products = [];
  const productData = [
    { name: 'Brightloop CRM', type: 'software', salesPrice: 150000, costPrice: 50000, taxId: gst18.id },
    { name: 'Brightloop ERP', type: 'software', salesPrice: 300000, costPrice: 100000, taxId: gst18.id },
    { name: 'Email Marketing Add-on', type: 'addon', salesPrice: 50000, costPrice: 15000, taxId: gst18.id },
    { name: 'Cloud Storage 100GB', type: 'service', salesPrice: 25000, costPrice: 8000, taxId: gst12.id },
    { name: 'Premium Support', type: 'service', salesPrice: 75000, costPrice: 25000, taxId: gst18.id },
    { name: 'API Access Pack', type: 'addon', salesPrice: 40000, costPrice: 12000, taxId: gst18.id },
    { name: 'Analytics Dashboard', type: 'addon', salesPrice: 35000, costPrice: 10000, taxId: gst12.id },
    { name: 'Custom Domain', type: 'service', salesPrice: 15000, costPrice: 5000, taxId: gst5.id },
  ];

  for (const pd of productData) {
    const product = await prisma.product.create({ data: pd });
    products.push(product);
  }

  // Variants for CRM and ERP
  const variants = [];
  const variantData = [
    { productId: products[0].id, attribute: 'Edition', value: 'Standard', extraPrice: 0 },
    { productId: products[0].id, attribute: 'Edition', value: 'Professional', extraPrice: 50000 },
    { productId: products[0].id, attribute: 'Edition', value: 'Enterprise', extraPrice: 150000 },
    { productId: products[1].id, attribute: 'Users', value: '5 Users', extraPrice: 0 },
    { productId: products[1].id, attribute: 'Users', value: '25 Users', extraPrice: 100000 },
    { productId: products[1].id, attribute: 'Users', value: 'Unlimited', extraPrice: 300000 },
  ];

  for (const vd of variantData) {
    const variant = await prisma.variant.create({ data: vd });
    variants.push(variant);
  }

  // Plans
  const plans = [];
  const planData = [
    { name: 'Starter Monthly', price: 99900, billingPeriod: BillingPeriod.MONTHLY, startDate: dateStr(2026, 1, 1), endDate: dateStr(2028, 12, 31) },
    { name: 'Professional Monthly', price: 249900, billingPeriod: BillingPeriod.MONTHLY, startDate: dateStr(2026, 1, 1), endDate: dateStr(2028, 12, 31) },
    { name: 'Enterprise Monthly', price: 499900, billingPeriod: BillingPeriod.MONTHLY, startDate: dateStr(2026, 1, 1), endDate: dateStr(2028, 12, 31) },
    { name: 'Starter Yearly', price: 999900, billingPeriod: BillingPeriod.YEARLY, startDate: dateStr(2026, 1, 1), endDate: dateStr(2028, 12, 31) },
    { name: 'Professional Yearly', price: 2499900, billingPeriod: BillingPeriod.YEARLY, startDate: dateStr(2026, 1, 1), endDate: dateStr(2028, 12, 31) },
    { name: 'Daily Dev Plan', price: 9900, billingPeriod: BillingPeriod.DAILY, startDate: dateStr(2026, 1, 1), endDate: dateStr(2027, 12, 31) },
    { name: 'Weekly Support', price: 49900, billingPeriod: BillingPeriod.WEEKLY, startDate: dateStr(2026, 1, 1), endDate: dateStr(2028, 12, 31) },
  ];

  for (const pd of planData) {
    const plan = await prisma.plan.create({ data: pd });
    plans.push(plan);
  }

  // Discounts
  const discounts = [];
  const discountData = [
    { name: 'Launch Offer 10%', type: DiscountType.PERCENT, value: 10, scope: DiscountScope.SUBSCRIPTION, startDate: dateStr(2026, 1, 1), endDate: dateStr(2027, 6, 30), usageLimit: 100 },
    { name: 'Flat ₹500 Off', type: DiscountType.FIXED, value: 50000, scope: DiscountScope.PRODUCT, startDate: dateStr(2026, 1, 1), endDate: dateStr(2027, 12, 31), usageLimit: 50 },
    { name: 'Bulk Discount 15%', type: DiscountType.PERCENT, value: 15, scope: DiscountScope.PRODUCT, minQty: 5, startDate: dateStr(2026, 1, 1), endDate: dateStr(2028, 12, 31) },
    { name: 'Early Bird 20%', type: DiscountType.PERCENT, value: 20, scope: DiscountScope.SUBSCRIPTION, startDate: dateStr(2026, 1, 1), endDate: dateStr(2026, 6, 30), usageLimit: 20 },
  ];

  for (const dd of discountData) {
    const discount = await prisma.discount.create({ data: dd });
    discounts.push(discount);
  }

  // Link discounts to products
  await prisma.discountProduct.createMany({
    data: [
      { discountId: discounts[1].id, productId: products[0].id },
      { discountId: discounts[1].id, productId: products[1].id },
      { discountId: discounts[2].id, productId: products[0].id },
      { discountId: discounts[2].id, productId: products[2].id },
    ],
    skipDuplicates: true,
  });

  // Quotation templates
  const template1 = await prisma.quotationTemplate.create({
    data: {
      name: 'CRM Starter Bundle',
      planId: plans[0].id,
      validityDays: 30,
      lines: {
        create: [
          { productId: products[0].id, variantId: variants[0].id, quantity: 1 },
          { productId: products[2].id, quantity: 1 },
        ],
      },
    },
  });

  const template2 = await prisma.quotationTemplate.create({
    data: {
      name: 'Enterprise Full Suite',
      planId: plans[2].id,
      validityDays: 15,
      lines: {
        create: [
          { productId: products[1].id, variantId: variants[5].id, quantity: 1 },
          { productId: products[2].id, quantity: 1 },
          { productId: products[4].id, quantity: 1 },
          { productId: products[5].id, quantity: 2 },
        ],
      },
    },
  });

  // A few sample subscriptions
  const sub1Number = await getNextSubNumber();
  const sub1 = await prisma.subscription.create({
    data: {
      number: sub1Number,
      customerId: customers[0].id,
      planId: plans[0].id,
      status: SubscriptionStatus.ACTIVE,
      quotationDate: dateStr(2026, 9, 1),
      validUntil: dateStr(2026, 10, 1),
      startDate: dateStr(2026, 10, 1),
      expiryDate: dateStr(2027, 9, 30),
      anchorDay: 1,
      nextBillingDate: dateStr(2026, 11, 1),
      paymentTerms: 15,
      lines: {
        create: [
          {
            productId: products[0].id,
            variantId: variants[1].id,
            description: 'Brightloop CRM - Professional',
            quantity: 1,
            unitPrice: 200000, // salesPrice + extraPrice
            taxId: gst18.id,
            amount: 200000,
          },
        ],
      },
    },
  });

  const sub2Number = await getNextSubNumber();
  const sub2 = await prisma.subscription.create({
    data: {
      number: sub2Number,
      customerId: customers[1].id,
      planId: plans[1].id,
      status: SubscriptionStatus.ACTIVE,
      quotationDate: dateStr(2026, 8, 15),
      validUntil: dateStr(2026, 9, 15),
      startDate: dateStr(2026, 9, 15),
      expiryDate: dateStr(2027, 9, 14),
      anchorDay: 15,
      nextBillingDate: dateStr(2026, 11, 15),
      paymentTerms: 15,
      lines: {
        create: [
          {
            productId: products[1].id,
            variantId: variants[4].id,
            description: 'Brightloop ERP - 25 Users',
            quantity: 1,
            unitPrice: 400000,
            taxId: gst18.id,
            amount: 400000,
          },
          {
            productId: products[4].id,
            description: 'Premium Support',
            quantity: 1,
            unitPrice: 75000,
            taxId: gst18.id,
            amount: 75000,
          },
        ],
      },
    },
  });

  console.log(`✅ Core seed complete: ${customers.length} customers, ${products.length} products, ${plans.length} plans, 2 subscriptions`);
  return { admin, staff1, staff2, customers, products, variants, plans, discounts, gst18, gst12, gst5 };
}

// ---- Load Seed (10k subscriptions, 1k due) ----

async function seedLoad(coreData: Awaited<ReturnType<typeof seedCore>>) {
  console.log('📦 Seeding load data (10k subscriptions, ~1k due)...');

  const { customers, products, variants, plans, gst18 } = coreData;
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);

  // Fetch or create additional customers
  let allCustomers = await prisma.user.findMany({
    where: { role: Role.CUSTOMER },
  });

  if (allCustomers.length < 200) {
    const toCreate = 200 - allCustomers.length;
    const userBatch = [];
    const baseIndex = allCustomers.length + 100;
    for (let i = 0; i < toCreate; i++) {
      userBatch.push({
        name: `Customer ${baseIndex + i}`,
        email: `customer${baseIndex + i}_${Date.now()}@example.com`,
        passwordHash: hash,
        role: Role.CUSTOMER,
        isActive: true,
      });
    }
    const createdUsers = await prisma.user.createManyAndReturn({
      data: userBatch,
      select: { id: true },
    });

    const profiles = createdUsers.map((u, idx) => ({
      userId: u.id,
      company: `Company ${baseIndex + idx} Pvt Ltd`,
      phone: `+91-98765${String(baseIndex + idx).padStart(5, '0').slice(-5)}`,
      billingAddress: `${baseIndex + idx} Business Park, India`,
    }));
    await prisma.customerProfile.createMany({ data: profiles });

    allCustomers = await prisma.user.findMany({ where: { role: Role.CUSTOMER } });
  }

  console.log(`  Found/created ${allCustomers.length} total customers`);

  const currentCount = await prisma.subscription.count();
  const totalTarget = 10000;
  const needed = Math.max(0, totalTarget - currentCount);

  if (needed === 0) {
    console.log(`  Already have ${currentCount} subscriptions (>= 10,000). Skipping subscription generation.`);
    return;
  }

  console.log(`  Need to generate ${needed} subscriptions to reach 10,000...`);

  const batchSize = 1000;
  const todayDate = today();
  let totalCreated = currentCount;
  let dueCount = 0;
  const year = new Date().getFullYear();

  for (let offset = 0; offset < needed; offset += batchSize) {
    const currentBatchSize = Math.min(batchSize, needed - offset);

    // Reserve sequence numbers in single query
    const seqRes = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('subscription_seq')`;
    const baseSeq = Number(seqRes[0].nextval);
    await prisma.$executeRawUnsafe(`SELECT setval('subscription_seq', ${baseSeq + currentBatchSize})`);

    const subBatch = [];
    const metaBatch: Array<{ productId: number; variantId?: number | null; description: string; unitPrice: number }> = [];

    for (let i = 0; i < currentBatchSize; i++) {
      const customer = randomChoice(allCustomers);
      const plan = randomChoice(plans);
      const startMonth = randomInt(1, 10);
      const startDay = randomInt(1, 28);
      const startDate = dateStr(2026, startMonth, startDay);
      const expiryDate = addMonths(startDate, plan.billingPeriod === BillingPeriod.YEARLY ? 24 : 12);

      // Exactly 10% should be due for billing (nextBillingDate <= today)
      const isDue = (offset + i) % 10 === 0;
      let nextBillingDate: Date;
      if (isDue) {
        nextBillingDate = addDays(todayDate, -randomInt(0, 5));
        dueCount++;
      } else {
        nextBillingDate = addDays(todayDate, randomInt(1, 60));
      }

      const product = randomChoice(products);
      const variant = product.id === products[0].id ? randomChoice(variants.slice(0, 3)) :
                      product.id === products[1].id ? randomChoice(variants.slice(3, 6)) : null;
      const unitPrice = product.salesPrice + (variant?.extraPrice || 0);
      const subNumber = `SUB-${year}-${String(baseSeq + i).padStart(6, '0')}`;

      subBatch.push({
        number: subNumber,
        customerId: customer.id,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        quotationDate: addDays(startDate, -30),
        validUntil: addDays(startDate, -1),
        startDate,
        expiryDate,
        anchorDay: startDay,
        nextBillingDate,
        paymentTerms: randomChoice([7, 15, 30]),
      });

      metaBatch.push({
        productId: product.id,
        variantId: variant?.id,
        description: `${product.name}${variant ? ` - ${variant.value}` : ''}`,
        unitPrice,
      });
    }

    // Batch insert subscriptions
    const createdSubs = await prisma.subscription.createManyAndReturn({
      data: subBatch,
      select: { id: true },
    });

    // Batch insert subscription lines
    const lineBatch = createdSubs.map((sub, idx) => {
      const meta = metaBatch[idx];
      const qty = randomInt(1, 3);
      return {
        subscriptionId: sub.id,
        productId: meta.productId,
        variantId: meta.variantId,
        description: meta.description,
        quantity: qty,
        unitPrice: meta.unitPrice,
        taxId: gst18.id,
        amount: meta.unitPrice * qty,
      };
    });

    await prisma.subscriptionLine.createMany({
      data: lineBatch,
    });

    totalCreated += currentBatchSize;
    console.log(`  Batch inserted ${totalCreated}/${totalTarget} subscriptions (${dueCount} due)...`);
  }

  console.log(`✅ Load seed complete: ${totalCreated} total subscriptions (${dueCount} newly created due for billing)`);
}

// ---- Synthetic History for ML Training ----

async function seedSyntheticHistory(coreData: Awaited<ReturnType<typeof seedCore>>) {
  console.log('🤖 Seeding synthetic history (~2000 invoices)...');

  const { customers, plans, products, variants, gst18 } = coreData;
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);

  // Create a mix of customers: some chronic late payers, some always on time
  const syntheticCustomers = [];
  for (let i = 0; i < 50; i++) {
    const user = await prisma.user.create({
      data: {
        name: `Synth Customer ${i}`,
        email: `synth${i}@example.com`,
        passwordHash: hash,
        role: Role.CUSTOMER,
        isActive: true,
        profile: {
          create: {
            company: `Synth Co ${i}`,
            billingAddress: `${i} Synthetic Lane`,
          },
        },
      },
    });
    syntheticCustomers.push({
      user,
      // Assign a late payment probability: 10 chronic late, 10 always on time, rest mixed
      lateProbability: i < 10 ? 0.8 : i < 20 ? 0.05 : randomInt(15, 50) / 100,
    });
  }

  let invoiceCount = 0;
  let paymentCount = 0;

  for (const sc of syntheticCustomers) {
    // Each customer gets 20-60 historical invoices
    const numInvoices = randomInt(20, 60);
    const plan = randomChoice(plans.filter(p => p.billingPeriod === BillingPeriod.MONTHLY));
    const product = randomChoice(products);
    const variant = product.id === products[0].id ? randomChoice(variants.slice(0, 3)) : null;
    const unitPrice = product.salesPrice + (variant?.extraPrice || 0);

    // Create a synthetic subscription for this customer
    const subNumber = await getNextSubNumber();
    const startDate = dateStr(2024, randomInt(1, 6), randomInt(1, 28));
    const sub = await prisma.subscription.create({
      data: {
        number: subNumber,
        customerId: sc.user.id,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        quotationDate: addDays(startDate, -30),
        validUntil: addDays(startDate, -1),
        startDate,
        expiryDate: dateStr(2028, 12, 31),
        anchorDay: startDate.getUTCDate(),
        nextBillingDate: today(),
        paymentTerms: randomChoice([7, 15, 30]),
        isSynthetic: true,
        lines: {
          create: [{
            productId: product.id,
            variantId: variant?.id,
            description: `${product.name}${variant ? ` - ${variant.value}` : ''}`,
            quantity: 1,
            unitPrice,
            taxId: gst18.id,
            amount: unitPrice,
          }],
        },
      },
    });

    // Generate invoices for this subscription
    for (let m = 0; m < numInvoices && invoiceCount < 2200; m++) {
      const periodStart = addMonths(startDate, m);
      const periodEnd = addDays(addMonths(startDate, m + 1), -1);
      const dueDate = addDays(periodStart, sub.paymentTerms);

      const lineAmount = unitPrice;
      const taxPercent = 18;
      const taxAmount = Math.round(lineAmount * taxPercent / 100);
      const planFee = plan.price;
      const subtotal = planFee + lineAmount;
      const total = planFee + lineAmount + taxAmount;

      const invNumber = await getNextInvNumber();

      const invoice = await prisma.invoice.create({
        data: {
          number: invNumber,
          subscriptionId: sub.id,
          customerId: sc.user.id,
          periodStart,
          periodEnd,
          dueDate,
          subtotal,
          discountTotal: 0,
          taxTotal: taxAmount,
          total,
          amountPaid: total, // Will adjust below if late/unpaid
          status: InvoiceStatus.PAID,
          customerSnapshot: { name: sc.user.name, company: `Synth Co`, address: `Synthetic Lane` },
          isSynthetic: true,
          lines: {
            create: [
              {
                description: `Plan fee - ${plan.name}`,
                quantity: 1,
                unitPrice: planFee,
                amount: planFee,
                taxPercent: 0,
                taxAmount: 0,
              },
              {
                productId: product.id,
                description: `${product.name}${variant ? ` - ${variant.value}` : ''}`,
                quantity: 1,
                unitPrice,
                amount: lineAmount,
                taxPercent,
                taxAmount,
              },
            ],
          },
        },
      });

      // Decide if this invoice is paid late, on time, or still unpaid
      const isLate = Math.random() < sc.lateProbability;
      const isPartial = isLate && Math.random() < 0.2; // 20% of late are partial payments
      const isUnpaid = isLate && Math.random() < 0.1; // 10% of late are unpaid

      if (isUnpaid && periodStart > dateStr(2026, 6, 1)) {
        // Leave unpaid (confirmed, not paid)
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: InvoiceStatus.CONFIRMED, amountPaid: 0 },
        });
      } else {
        // Create payment
        const paymentDate = isLate
          ? addDays(dueDate, randomInt(3, 45)) // Late payment
          : addDays(periodStart, randomInt(0, Math.min(sub.paymentTerms - 1, 14))); // On time

        const paymentAmount = isPartial ? Math.round(total * randomInt(30, 70) / 100) : total;

        await prisma.payment.create({
          data: {
            invoiceId: invoice.id,
            method: randomChoice([PaymentMethod.BANK_TRANSFER, PaymentMethod.UPI, PaymentMethod.CARD]),
            amount: paymentAmount,
            date: paymentDate,
            isSynthetic: true,
          },
        });

        if (isPartial) {
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: InvoiceStatus.CONFIRMED, amountPaid: paymentAmount },
          });
        }

        paymentCount++;
      }

      invoiceCount++;
    }
  }

  console.log(`✅ Synthetic history complete: ${invoiceCount} invoices, ${paymentCount} payments across ${syntheticCustomers.length} customers`);
  console.log(`   (Chronic late payers: IDs ${syntheticCustomers.slice(0, 10).map(c => c.user.id).join(', ')})`);
  console.log(`   (Always on-time: IDs ${syntheticCustomers.slice(10, 20).map(c => c.user.id).join(', ')})`);
}

// ---- Apply raw SQL constraints ----

async function applyConstraints() {
  console.log('🔧 Applying SQL constraints...');
  const sqlPath = path.resolve(__dirname, 'sql/001_constraints.sql');
  try {
    const sql = readFileSync(sqlPath, 'utf-8');
    // Split by semicolons and execute each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      try {
        await prisma.$executeRawUnsafe(stmt + ';');
      } catch (e: any) {
        // Ignore "already exists" errors
        if (!e.message?.includes('already exists')) {
          console.warn(`  ⚠️ SQL warning: ${e.message}`);
        }
      }
    }
    console.log('✅ SQL constraints applied');
  } catch (e: any) {
    console.error(`❌ Failed to apply constraints: ${e.message}`);
  }
}

// ---- Main ----

async function main() {
  console.log('🚀 Brightloop SMS Seed Script');
  console.log(`   Flags: --load=${LOAD}, --synthetic-history=${SYNTHETIC}`);
  console.log('');

  // Apply constraints first
  await applyConstraints();

  // Always seed core data
  const coreData = await seedCore();

  if (LOAD) {
    await seedLoad(coreData);
  }

  if (SYNTHETIC) {
    await seedSyntheticHistory(coreData);
  }

  console.log('\n🎉 Seeding complete!');
  console.log('   Default password for all users: ' + DEFAULT_PASSWORD);
  console.log('   Admin login: admin@brightloop.dev');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

