// Brightloop's own details, printed on invoices and used for UPI and GST.
// Change them in .env (VITE_COMPANY_*) without touching code.

const env = import.meta.env

export const company = {
  name: env.VITE_COMPANY_NAME || 'Brightloop Software',
  address: env.VITE_COMPANY_ADDRESS || 'Chennai, Tamil Nadu',
  /** 15-character GSTIN. The first two digits are the state code (33 = Tamil Nadu). */
  gstin: env.VITE_COMPANY_GSTIN || '33AABCB1234L1Z9',
  /** UPI ID that receives payments. Replace with the real one before going live. */
  upiId: env.VITE_UPI_ID || 'brightloop@upi',
}

export const companyStateCode = company.gstin.slice(0, 2)
