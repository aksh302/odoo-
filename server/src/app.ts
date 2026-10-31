import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// Security headers
app.use(helmet());

// CORS allow-list
app.use(cors({
  origin: config.clientUrl ? config.clientUrl.split(',') : '*',
  credentials: true,
}));

// Body parsing with 1 MB limit
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth module
import authRoutes from './modules/auth/routes';
app.use('/api/auth', authRoutes);

// Catalog module (products, variants, plans, taxes)
import catalogRoutes from './modules/catalog/routes';
app.use('/api/catalog', catalogRoutes);

// Quotation templates
import quotationRoutes from './modules/quotations/routes';
app.use('/api/quotations', quotationRoutes);

// Subscriptions module
import subscriptionRoutes from './modules/subscriptions/routes';
app.use('/api/subscriptions', subscriptionRoutes);

// Pricing module (discounts)
import pricingRoutes from './modules/pricing/routes';
app.use('/api/pricing', pricingRoutes);

// Billing module (billing run, confirm, cancel)
import billingRoutes from './modules/billing/routes';
app.use('/api/billing', billingRoutes);

// Payments module (record, void)
import paymentRoutes from './modules/payments/routes';
app.use('/api/payments', paymentRoutes);

// Reports module (KPIs, aging, CSV export, audit log)
import reportRoutes from './modules/reports/routes';
app.use('/api/reports', reportRoutes);

// Documents module (Invoice PDF, Email)
import documentRoutes from './modules/documents/routes';
app.use('/api/documents', documentRoutes);
app.use('/api/invoices', documentRoutes);

// Portal module (Customer self-service)
import portalRoutes from './modules/portal/routes';
app.use('/api/portal', portalRoutes);

// AI features module (Copilot, Reminders, Explain, Risk)
import aiRoutes from './modules/ai/routes';
app.use('/api/ai', aiRoutes);

// Error handler (must be last)
app.use(errorHandler);

export default app;

