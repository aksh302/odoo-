"""
Late-Payment Risk Model Training Script (ml/train.py)
SRS Feature A:
LogisticRegression on:
  - customer_late_count
  - customer_invoice_count
  - log(amount_paise)
  - payment_terms_days
  - billing_period (one-hot: DAILY, WEEKLY, MONTHLY, YEARLY)
  - days_since_signup
  - prior_partial_payments

Label: invoice paid later than its due date or still unpaid after due date.
Standardize features, export ml/model.json with coefficients, intercept, feature means and stds,
plus printed accuracy and AUC on a held-out split.
"""

import json
import math
import os
import sys
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

FEATURE_NAMES = [
    "customer_late_count",
    "customer_invoice_count",
    "log_amount_paise",
    "payment_terms_days",
    "period_DAILY",
    "period_WEEKLY",
    "period_MONTHLY",
    "period_YEARLY",
    "days_since_signup",
    "prior_partial_payments",
]

def generate_synthetic_training_data(n_samples=2500, random_seed=42):
    np.random.seed(random_seed)
    
    # Generate customer traits
    customer_invoice_count = np.random.randint(1, 40, size=n_samples)
    late_ratio = np.random.beta(a=0.5, b=1.5, size=n_samples) # skewed distribution
    customer_late_count = np.clip(np.round(customer_invoice_count * late_ratio), 0, customer_invoice_count)
    
    # Amounts: 99 INR (9900 paise) to 500,000 INR (50,000,000 paise)
    amount_paise = np.random.lognormal(mean=11.5, sigma=1.0, size=n_samples)
    amount_paise = np.clip(amount_paise, 9900, 50000000)
    log_amount_paise = np.log(amount_paise)
    
    payment_terms_days = np.random.choice([7, 15, 30, 45], size=n_samples, p=[0.2, 0.5, 0.2, 0.1])
    
    period_idx = np.random.choice([0, 1, 2, 3], size=n_samples, p=[0.05, 0.1, 0.7, 0.15])
    period_DAILY = (period_idx == 0).astype(float)
    period_WEEKLY = (period_idx == 1).astype(float)
    period_MONTHLY = (period_idx == 2).astype(float)
    period_YEARLY = (period_idx == 3).astype(float)
    
    days_since_signup = np.random.randint(10, 750, size=n_samples)
    prior_partial_payments = np.random.poisson(lam=0.4, size=n_samples)
    
    X = np.column_stack([
        customer_late_count,
        customer_invoice_count,
        log_amount_paise,
        payment_terms_days,
        period_DAILY,
        period_WEEKLY,
        period_MONTHLY,
        period_YEARLY,
        days_since_signup,
        prior_partial_payments,
    ])
    
    # Ground truth logistic signal
    logits = (
        0.45 * customer_late_count
        - 0.08 * customer_invoice_count
        + 0.35 * (log_amount_paise - 11.5)
        - 0.03 * (payment_terms_days - 15)
        + 0.20 * period_DAILY
        - 0.10 * period_YEARLY
        - 0.002 * days_since_signup
        + 0.50 * prior_partial_payments
        - 1.2  # Base intercept
    )
    
    # Add realistic noise
    noise = np.random.normal(0, 0.6, size=n_samples)
    probs = 1 / (1 + np.exp(-(logits + noise)))
    y = (probs >= 0.5).astype(int)
    
    return X, y

def main():
    print("🚀 Training Late-Payment Risk Model...")
    X, y = generate_synthetic_training_data()
    
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    model = LogisticRegression(max_iter=1000, random_state=42)
    model.fit(X_train_scaled, y_train)
    
    y_pred = model.predict(X_test_scaled)
    y_pred_proba = model.predict_proba(X_test_scaled)[:, 1]
    
    acc = accuracy_score(y_test, y_pred)
    auc = roc_auc_score(y_test, y_pred_proba)
    
    print(f"✅ Accuracy on test split: {acc:.4f} ({acc*100:.2f}%)")
    print(f"✅ ROC AUC on test split:  {auc:.4f}")
    
    model_export = {
        "feature_names": FEATURE_NAMES,
        "coefficients": model.coef_[0].tolist(),
        "intercept": float(model.intercept_[0]),
        "means": scaler.mean_.tolist(),
        "stds": scaler.scale_.tolist(),
        "metrics": {
            "accuracy": float(acc),
            "auc": float(auc),
        }
    }
    
    out_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(out_dir, "model.json")
    with open(model_path, "w", encoding="utf-8") as f:
        json.dump(model_export, f, indent=2)
        
    print(f"📁 Model exported to {model_path}")

if __name__ == "__main__":
    main()

