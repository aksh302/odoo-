import { describe, it, expect } from 'vitest';
import { computeRiskScore, loadModel } from '../src/lib/risk';

describe('lib/risk', () => {
  it('loads the exported model.json', () => {
    const model = loadModel();
    expect(model).not.toBeNull();
    expect(model?.feature_names.length).toBe(10);
    expect(model?.coefficients.length).toBe(10);
  });

  it('scores chronic late payer higher than always-on-time customer with identical invoice', () => {
    // Late customer
    const lateScore = computeRiskScore({
      customer_late_count: 8,
      customer_invoice_count: 10,
      amount_paise: 250000,
      payment_terms_days: 15,
      billing_period: 'MONTHLY',
      days_since_signup: 180,
      prior_partial_payments: 2,
    });

    // On-time customer
    const onTimeScore = computeRiskScore({
      customer_late_count: 0,
      customer_invoice_count: 10,
      amount_paise: 250000,
      payment_terms_days: 15,
      billing_period: 'MONTHLY',
      days_since_signup: 180,
      prior_partial_payments: 0,
    });

    expect(lateScore).not.toBeNull();
    expect(onTimeScore).not.toBeNull();
    expect(lateScore!.riskScore).toBeGreaterThan(onTimeScore!.riskScore);
    expect(['MEDIUM', 'HIGH']).toContain(lateScore!.riskLevel);
    expect(onTimeScore!.riskLevel).toBe('LOW');
    expect(lateScore!.riskReasons.length).toBeGreaterThanOrEqual(1);
  });
});

