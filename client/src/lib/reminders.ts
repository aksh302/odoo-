import dayjs from 'dayjs'
import { upiLink } from '../components/UpiQr'
import { company } from './company'
import { formatINR } from './money'
import type { Invoice } from './types'

/** Friendly reminder text, firmer once the invoice is well past due. */
export function reminderText(inv: Invoice): string {
  const balance = inv.total - inv.amountPaid
  const name = inv.customerSnapshot.name.split(' ')[0]
  const late = dayjs().diff(dayjs(inv.dueDate), 'day')
  const when = late > 0 ? `was due on ${dayjs(inv.dueDate).format('D MMM YYYY')} (${late} days ago)` : `is due on ${dayjs(inv.dueDate).format('D MMM YYYY')}`
  const opener = late > 15 ? `Hi ${name}, invoice ${inv.number} is now ${late} days overdue.` : `Hi ${name}, a quick reminder about invoice ${inv.number}.`
  return [
    opener,
    `${formatINR(balance)} ${when}.`,
    `Pay by UPI to ${company.upiId}, quoting ${inv.number}: ${upiLink(balance, inv.number)}`,
    `If you've already paid, please reply with the UTR so we can match it. Thank you!`,
    `- ${company.name}`,
  ].join('\n')
}

/** wa.me link with the reminder pre-written. Indian numbers get the 91 country code. */
export function whatsappLink(inv: Invoice): string | null {
  const digits = (inv.customerSnapshot.phone ?? '').replace(/\D/g, '')
  if (digits.length < 10) return null
  const phone = digits.length === 10 ? `91${digits}` : digits
  return `https://wa.me/${phone}?text=${encodeURIComponent(reminderText(inv))}`
}
