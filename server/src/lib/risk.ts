import fs from 'fs';
import path from 'path';

export interface ModelData {
  feature_names: string[];
  coefficients: number[];
  intercept: number;
  means: number[];
  stds: number[];
  metrics: {
    accuracy: number;
    auc: number;
  };
}

export interface RiskResult {
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  riskReasons: string[];
}

export interface InvoiceRiskInput {
  customer_late_count: number;
  customer_invoice_count: number;
  amount_paise: number;
  payment_terms_days: number;
  billing_period: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  days_since_signup: number;
  prior_partial_payments: number;
}

const FEATURE_HUMAN_NAMES: Record<string, { high: string; low: string }> = {
  customer_late_count: {
    high: 'History of multiple late invoice payments',
    low: 'Consistent on-time payment record',
  },
  customer_invoice_count: {
    high: 'Established customer relationship with many invoices',
    low: 'Newer customer with fewer past invoices',
  },
  log_amount_paise: {
    high: 'Higher than average invoice amount',
    low: 'Lower invoice amount',
  },
  payment_terms_days: {
    high: 'Extended payment terms duration',
    low: 'Shorter payment terms',
  },
  period_DAILY: {
    high: 'Daily billing frequency',
    low: '',
  },
  period_WEEKLY: {
    high: 'Weekly billing frequency',
    low: '',
  },
  period_MONTHLY: {
    high: 'Monthly billing plan',
    low: '',
  },
  period_YEARLY: {
    high: 'Annual upfront billing cycle',
    low: '',
  },
  days_since_signup: {
    high: 'Long-standing customer account tenure',
    low: 'Recently created customer account',
  },
  prior_partial_payments: {
    high: 'Prior instances of partial/split invoice payments',
    low: 'Full lump-sum payment history',
  },
};

let cachedModel: ModelData | null = null;
let modelLoadAttempted = false;

export function loadModel(): ModelData | null {
  if (modelLoadAttempted) return cachedModel;
  modelLoadAttempted = true;

  try {
    const candidates = [
      path.resolve(__dirname, '../../../ml/model.json'),
      path.resolve(process.cwd(), 'ml/model.json'),
      path.resolve(process.cwd(), '../ml/model.json'),
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        cachedModel = JSON.parse(raw) as ModelData;
        break;
      }
    }
  } catch (err) {
    cachedModel = null;
  }
  return cachedModel;
}

export function computeRiskScore(input: InvoiceRiskInput): RiskResult | null {
  const model = loadModel();
  if (!model) return null;

  const rawFeatures = [
    input.customer_late_count,
    input.customer_invoice_count,
    Math.log(Math.max(1, input.amount_paise)),
    input.payment_terms_days,
    input.billing_period === 'DAILY' ? 1.0 : 0.0,
    input.billing_period === 'WEEKLY' ? 1.0 : 0.0,
    input.billing_period === 'MONTHLY' ? 1.0 : 0.0,
    input.billing_period === 'YEARLY' ? 1.0 : 0.0,
    input.days_since_signup,
    input.prior_partial_payments,
  ];

  let logit = model.intercept;
  const contributions: { name: string; impact: number; standardized: number }[] = [];

  for (let i = 0; i < rawFeatures.length; i++) {
    const std = model.stds[i] === 0 ? 1 : model.stds[i];
    const standardized = (rawFeatures[i] - model.means[i]) / std;
    const impact = model.coefficients[i] * standardized;
    logit += impact;

    contributions.push({
      name: model.feature_names[i],
      impact,
      standardized,
    });
  }

  // Sigmoid
  const probability = 1 / (1 + Math.exp(-logit));
  const riskScore = Math.round(probability * 1000) / 1000;

  // Level classification per SRS: LOW <0.33, MEDIUM <0.66, HIGH otherwise
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  if (riskScore < 0.33) {
    riskLevel = 'LOW';
  } else if (riskScore < 0.66) {
    riskLevel = 'MEDIUM';
  } else {
    riskLevel = 'HIGH';
  }

  // Top 2 contributing features (coefficient * standardized value)
  contributions.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  const top2 = contributions.slice(0, 2);

  const riskReasons = top2.map((c) => {
    const labels = FEATURE_HUMAN_NAMES[c.name];
    if (!labels) return `${c.name} impact (${c.impact > 0 ? '+' : ''}${c.impact.toFixed(2)})`;
    if (c.impact > 0) {
      return labels.high || labels.low;
    } else {
      return labels.low || labels.high;
    }
  }).filter(Boolean);

  return {
    riskScore,
    riskLevel,
    riskReasons,
  };
}
