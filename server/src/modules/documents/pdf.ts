import PDFDocument from 'pdfkit';
import { formatPaise } from '../../lib/money';

export interface InvoicePdfData {
  number: string;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  status: string;
  customerSnapshot: any;
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    discountAmount: number;
    taxAmount: number;
  }>;
}

export function generateInvoicePdfBuffer(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const buffers: Buffer[] = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', (err) => reject(err));

    // Header
    doc.fontSize(22).text('BRIGHTLOOP SOFTWARE', { align: 'left' });
    doc.fontSize(10).fillColor('#666666').text('TAX INVOICE', { align: 'left' });
    doc.moveDown();

    // Invoice Meta & Customer
    doc.fillColor('#000000');
    doc.fontSize(12).text(`Invoice Number: ${data.number}`, { bold: true } as any);
    doc.fontSize(10).text(`Period: ${data.periodStart.toISOString().split('T')[0]} to ${data.periodEnd.toISOString().split('T')[0]}`);
    doc.text(`Due Date: ${data.dueDate.toISOString().split('T')[0]}`);
    doc.text(`Status: ${data.status}`);
    doc.moveDown();

    // Billed To
    const snap = data.customerSnapshot || {};
    doc.fontSize(12).text('Billed To:');
    doc.fontSize(10).text(`Name: ${snap.name || 'N/A'}`);
    if (snap.company) doc.text(`Company: ${snap.company}`);
    if (snap.address) doc.text(`Address: ${snap.address}`);
    if (snap.taxId) doc.text(`GSTIN/Tax ID: ${snap.taxId}`);
    doc.moveDown();

    // Table Header
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#CCCCCC');
    doc.moveDown(0.5);
    const startY = doc.y;
    doc.fontSize(10).fillColor('#000000');
    doc.text('Description', 50, startY, { width: 220 });
    doc.text('Qty', 270, startY, { width: 40 });
    doc.text('Unit Price', 320, startY, { width: 70 });
    doc.text('Disc.', 400, startY, { width: 50 });
    doc.text('Tax', 460, startY, { width: 40 });
    doc.text('Total', 510, startY, { width: 60, align: 'right' });
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#CCCCCC');
    doc.moveDown(0.5);

    // Line Items
    for (const line of data.lines) {
      const lineY = doc.y;
      const effectiveTotal = line.amount - line.discountAmount + line.taxAmount;
      doc.text(line.description, 50, lineY, { width: 220 });
      doc.text(line.quantity.toString(), 270, lineY, { width: 40 });
      doc.text(formatPaise(line.unitPrice), 320, lineY, { width: 70 });
      doc.text(line.discountAmount > 0 ? `-${formatPaise(line.discountAmount)}` : '-', 400, lineY, { width: 50 });
      doc.text(line.taxAmount > 0 ? formatPaise(line.taxAmount) : '-', 460, lineY, { width: 40 });
      doc.text(formatPaise(effectiveTotal), 500, lineY, { width: 50, align: 'right' });
      doc.moveDown(0.8);
    }

    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#CCCCCC');
    doc.moveDown();

    // Totals
    const summaryX = 350;
    doc.text(`Subtotal:`, summaryX, doc.y, { width: 100 });
    doc.text(formatPaise(data.subtotal), 460, doc.y, { width: 90, align: 'right' });
    doc.moveDown(0.5);

    if (data.discountTotal > 0) {
      doc.text(`Total Discount:`, summaryX, doc.y, { width: 100 });
      doc.text(`-${formatPaise(data.discountTotal)}`, 460, doc.y, { width: 90, align: 'right' });
      doc.moveDown(0.5);
    }

    if (data.taxTotal > 0) {
      doc.text(`Total Tax:`, summaryX, doc.y, { width: 100 });
      doc.text(formatPaise(data.taxTotal), 460, doc.y, { width: 90, align: 'right' });
      doc.moveDown(0.5);
    }

    doc.fontSize(12).text(`Grand Total:`, summaryX, doc.y, { width: 100, bold: true } as any);
    doc.text(formatPaise(data.total), 460, doc.y, { width: 90, align: 'right', bold: true } as any);
    doc.moveDown(0.5);

    doc.fontSize(10).text(`Amount Paid:`, summaryX, doc.y, { width: 100 });
    doc.text(formatPaise(data.amountPaid), 460, doc.y, { width: 90, align: 'right' });
    doc.moveDown(0.5);

    const balanceDue = data.total - data.amountPaid;
    doc.fontSize(11).text(`Balance Due:`, summaryX, doc.y, { width: 100, bold: true } as any);
    doc.text(formatPaise(balanceDue), 460, doc.y, { width: 90, align: 'right', bold: true } as any);

    doc.end();
  });
}

