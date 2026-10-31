/**
 * Money utility library.
 * All money values are integer paise (1 INR = 100 paise).
 * Never use floating point for money calculations.
 * Rounding is half-up per line.
 */

/**
 * Round half-up: Math.round with correct half-up behavior.
 * JavaScript Math.round already does round-half-up for positive numbers.
 */
export function roundHalfUp(value: number): number {
  return Math.round(value);
}

/**
 * Calculate line amount: quantity * unitPrice (both in paise).
 */
export function lineAmount(quantity: number, unitPricePaise: number): number {
  return quantity * unitPricePaise;
}

/**
 * Calculate discount amount on a line.
 * @param amount - line amount in paise
 * @param discountType - 'FIXED' or 'PERCENT'
 * @param discountValue - paise if FIXED, whole percent 0-100 if PERCENT
 * @returns discount amount in paise (capped at line amount)
 */
export function calcDiscount(
  amount: number,
  discountType: 'FIXED' | 'PERCENT',
  discountValue: number,
): number {
  let discount: number;
  if (discountType === 'FIXED') {
    discount = discountValue;
  } else {
    discount = roundHalfUp(amount * discountValue / 100);
  }
  // Discount cannot exceed line amount
  return Math.min(discount, amount);
}

/**
 * Calculate tax amount on a line (after discount).
 * @param amountAfterDiscount - line amount minus discount, in paise
 * @param taxPercent - tax percentage (e.g., 18 for 18%)
 * @returns tax amount in paise, rounded half-up
 */
export function calcTax(amountAfterDiscount: number, taxPercent: number): number {
  return roundHalfUp(amountAfterDiscount * taxPercent / 100);
}

/**
 * Calculate invoice line totals.
 * Order: line amount → discount → tax (prices exclude tax).
 */
export function calcLineTotals(
  quantity: number,
  unitPricePaise: number,
  discountType?: 'FIXED' | 'PERCENT',
  discountValue?: number,
  taxPercent?: number,
): {
  amount: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
} {
  const amount = lineAmount(quantity, unitPricePaise);
  const discountAmount = (discountType && discountValue != null)
    ? calcDiscount(amount, discountType, discountValue)
    : 0;
  const amountAfterDiscount = amount - discountAmount;
  const taxAmount = taxPercent ? calcTax(amountAfterDiscount, taxPercent) : 0;
  const lineTotal = amountAfterDiscount + taxAmount;

  return { amount, discountAmount, taxAmount, lineTotal };
}

/**
 * Format paise as INR string for display (e.g., 150000 → "₹1,500.00").
 */
export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Parse an INR amount string to paise. For use in seed/test only.
 */
export function toPaise(rupees: number): number {
  return roundHalfUp(rupees * 100);
}

