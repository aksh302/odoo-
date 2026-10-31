// GST presentation for Indian tax invoices.
// Same state as Brightloop -> CGST + SGST (half each). Different state -> IGST.
// The state comes from the first two digits of the customer's GSTIN; without a GSTIN
// we treat the sale as within Brightloop's state (the usual case for small buyers).

import { companyStateCode } from './company'

export const STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
}

export interface GstSplit {
  kind: 'INTRA' | 'INTER'
  placeOfSupply: string // "Tamil Nadu (33)"
  cgst: number
  sgst: number
  igst: number
}

/** Splits a tax total (paise) into CGST/SGST or IGST for the customer's state. */
export function gstSplit(taxTotal: number, customerGstin?: string | null): GstSplit {
  const code = customerGstin && /^\d{2}/.test(customerGstin) ? customerGstin.slice(0, 2) : companyStateCode
  const place = `${STATES[code] ?? 'Unknown state'} (${code})`
  if (code === companyStateCode) {
    const cgst = Math.floor(taxTotal / 2)
    return { kind: 'INTRA', placeOfSupply: place, cgst, sgst: taxTotal - cgst, igst: 0 }
  }
  return { kind: 'INTER', placeOfSupply: place, cgst: 0, sgst: 0, igst: taxTotal }
}

/** Default SAC for software subscriptions: licensing services for the right to use software. */
export const DEFAULT_SAC = '997331'
