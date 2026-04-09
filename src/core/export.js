import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Papa from 'papaparse';

// Use GHC in PDFs — jsPDF standard fonts don't support the ₵ character
const GHC = (n) => `GHC ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
const GHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

// ── CSV Export ────────────────────────────────────────────────────────────────
export function exportCSV(data, filename) {
  if (!data?.length) return;
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}-${Date.now()}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── PDF Base ──────────────────────────────────────────────────────────────────
function createPDF(title, subtitle = '', orientation = 'landscape') {
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageW = orientation === 'landscape' ? 297 : 210;
  // Header bar
  doc.setFillColor(26, 86, 219);
  doc.rect(0, 0, pageW, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text('Majupat Love Enterprise', 10, 12);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageW - 10, 12, { align: 'right' });
  // Title
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text(title, 10, 28);
  if (subtitle) {
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    // Wrap subtitle if too long
    const lines = doc.splitTextToSize(subtitle, pageW - 20);
    doc.text(lines, 10, 34);
  }
  return doc;
}

// ── Transaction Statement PDF ─────────────────────────────────────────────────
export function exportStatementPDF({ account, customer, transactions, dateFrom, dateTo }) {
  const doc = createPDF(
    `Account Statement - ${account.accountNumber}`,
    `Customer: ${customer?.name} | Period: ${dateFrom || 'All'} to ${dateTo || 'All'} | Printed: ${new Date().toLocaleString()}`
  );
  const startY = 42;
  // Account summary box
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(10, startY, 277, 22, 2, 2, 'F');
  doc.setFontSize(9); doc.setTextColor(71, 85, 105);
  const fields = [
    ['Account No.', account.accountNumber],
    ['Customer', customer?.name || '—'],
    ['Type', account.type?.replace('_', ' ')],
    ['Balance', GHC(account.balance)],
    ['Status', account.status],
  ];
  fields.forEach(([k, v], i) => {
    const x = 14 + i * 55;
    doc.setFont('helvetica', 'bold'); doc.text(k, x, startY + 8);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42);
    doc.text(String(v), x, startY + 15);
    doc.setTextColor(71, 85, 105);
  });

  const credits = transactions.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const debits = transactions.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);

  autoTable(doc, {
    startY: startY + 26,
    head: [['Date & Time', 'Reference', 'Narration', 'Type', 'Debit (GHC)', 'Credit (GHC)', 'Balance', 'Posted By']],
    body: transactions.map(t => [
      new Date(t.createdAt).toLocaleString(),
      t.reference || '—',
      (t.narration || '') + (t.reversed ? ' [REVERSED]' : ''),
      t.type.toUpperCase(),
      t.type === 'debit' ? GHC(t.amount) : '',
      t.type === 'credit' ? GHC(t.amount) : '',
      GHC(t.balanceAfter),
      t.posterName || '—',
    ]),
    foot: [['', '', 'TOTALS', '', `Debits: ${GHC(debits)}`, `Credits: ${GHC(credits)}`, `Net: ${GHC(credits - debits)}`, '']],
    styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [26, 86, 219], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [241, 245, 249], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 32 },
      2: { cellWidth: 60 },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 30, halign: 'right' },
      5: { cellWidth: 30, halign: 'right' },
      6: { cellWidth: 30, halign: 'right' },
      7: { cellWidth: 28 },
    },
  });

  doc.save(`statement-${account.accountNumber}-${Date.now()}.pdf`);
}

// ── Generic Report PDF ────────────────────────────────────────────────────────
export function exportReportPDF({ title, subtitle, columns, rows, summary = [], orientation = 'landscape' }) {
  const doc = createPDF(title, subtitle, orientation);
  const startY = subtitle ? 42 : 36;

  // Auto-calculate column widths based on count
  const pageW = orientation === 'landscape' ? 277 : 190; // usable width
  const colW = Math.floor(pageW / columns.length);
  const columnStyles = {};
  columns.forEach((_, i) => { columnStyles[i] = { cellWidth: colW }; });

  autoTable(doc, {
    startY,
    head: [columns],
    body: rows,
    styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [26, 86, 219], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles,
    tableWidth: 'auto',
  });

  if (summary.length) {
    const finalY = (doc.lastAutoTable?.finalY || 100) + 8;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
    doc.setFillColor(241, 245, 249);
    doc.rect(10, finalY - 4, pageW, 12, 'F');
    summary.forEach(([k, v], i) => {
      const x = 14 + i * Math.min(70, pageW / summary.length);
      doc.text(`${k}: ${v}`, x, finalY + 4);
    });
  }
  doc.save(`${title.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`);
}

// ── Loan Report PDF (portrait, more readable) ─────────────────────────────────
export function exportLoanReportPDF({ loans, customers, accounts, period }) {
  const doc = createPDF('Loan Portfolio Report', `Period: ${period} | Total: ${loans.length} loans | Generated: ${new Date().toLocaleString()}`, 'landscape');

  autoTable(doc, {
    startY: 42,
    head: [['Customer', 'Phone', 'Account', 'Type', 'Item', 'Principal', 'Total Repay', 'Interest', 'Outstanding', 'Rate', 'Monthly', 'Tenure', 'Status', 'Next Due']],
    body: loans.map(l => {
      const c = l.customer || customers.find(x => x.id === l.customerId);
      const a = accounts.find(x => x.id === l.accountId);
      const monthly = Number(l.monthlyPayment || 0);
      const tenure = Number(l.tenure || 0);
      const totalRepay = monthly * tenure;
      const totalInterest = totalRepay - Number(l.amount || 0);
      return [
        c?.name || '—',
        c?.phone || '—',
        a?.accountNumber || l.accountNumber || '—',
        (l.type || '').replace('_', ' '),
        l.itemName || '—',
        GHC(l.amount),
        GHC(totalRepay > 0 ? totalRepay : l.amount),
        GHC(totalInterest > 0 ? totalInterest : 0),
        GHC(l.outstanding),
        `${l.interestRate}%`,
        GHC(monthly),
        `${tenure}m`,
        l.status,
        l.nextDueDate ? new Date(l.nextDueDate).toLocaleDateString() : '—',
      ];
    }),
    styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
    headStyles: { fillColor: [26, 86, 219], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 22 },
      2: { cellWidth: 24 },
      3: { cellWidth: 20 },
      4: { cellWidth: 18 },
      5: { cellWidth: 20, halign: 'right' },
      6: { cellWidth: 20, halign: 'right' },
      7: { cellWidth: 18, halign: 'right' },
      8: { cellWidth: 20, halign: 'right' },
      9: { cellWidth: 12, halign: 'center' },
      10: { cellWidth: 20, halign: 'right' },
      11: { cellWidth: 12, halign: 'center' },
      12: { cellWidth: 16, halign: 'center' },
      13: { cellWidth: 20, halign: 'center' },
    },
  });

  const totalPrincipal = loans.reduce((s, l) => s + Number(l.amount || 0), 0);
  const totalOutstanding = loans.reduce((s, l) => s + Number(l.outstanding || 0), 0);
  const active = loans.filter(l => l.status === 'active').length;

  const finalY = (doc.lastAutoTable?.finalY || 100) + 8;
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  doc.setFillColor(241, 245, 249);
  doc.rect(10, finalY - 4, 277, 12, 'F');
  [
    ['Total Loans', loans.length],
    ['Active', active],
    ['Total Principal', GHC(totalPrincipal)],
    ['Total Outstanding', GHC(totalOutstanding)],
  ].forEach(([k, v], i) => {
    doc.text(`${k}: ${v}`, 14 + i * 68, finalY + 4);
  });

  doc.save(`loan-report-${Date.now()}.pdf`);
}

// ── HP Catalogue PDF ──────────────────────────────────────────────────────────
export function exportHPCataloguePDF(items) {
  const doc = createPDF('Hire Purchase Items Catalogue', `Total items: ${items.length} | Generated: ${new Date().toLocaleString()}`);
  autoTable(doc, {
    startY: 42,
    head: [['Item', 'Category', 'Description', 'Cash Price', 'Daily Payment', 'Weekly Payment', 'Stock', 'Status']],
    body: items.map(i => [i.name, i.category, i.description || '—', GHC(i.price), GHC(i.dailyPayment), GHC(i.weeklyPayment), i.stock, i.status]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [26, 86, 219], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 30 },
      2: { cellWidth: 70 },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
      6: { cellWidth: 16, halign: 'center' },
      7: { cellWidth: 20, halign: 'center' },
    },
  });
  doc.save(`hp-catalogue-${Date.now()}.pdf`);
}

// ── Collection Report PDF ─────────────────────────────────────────────────────
export function exportCollectionReportPDF({ collections, period }) {
  const doc = createPDF('Collection Report', `Period: ${period} | Total: ${collections.length} collections | Generated: ${new Date().toLocaleString()}`);
  const total = collections.reduce((s, c) => s + Number(c.amount || 0), 0);

  autoTable(doc, {
    startY: 42,
    head: [['Date', 'Collector', 'Customer', 'Account', 'Payment Type', 'Amount', 'Notes']],
    body: collections.map(c => [
      c.createdAt ? new Date(c.createdAt).toLocaleString() : '—',
      c.collectorName || c.collector?.name || '—',
      c.customerName || c.customer?.name || '—',
      c.account?.account_number || c.accountNumber || '—',
      (c.paymentType || c.payment_type || 'savings').replace('_', ' '),
      GHC(c.amount),
      c.notes || '—',
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [26, 86, 219], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 35 },
      2: { cellWidth: 35 },
      3: { cellWidth: 30 },
      4: { cellWidth: 28 },
      5: { cellWidth: 28, halign: 'right' },
      6: { cellWidth: 60 },
    },
  });

  const finalY = (doc.lastAutoTable?.finalY || 100) + 8;
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  doc.setFillColor(241, 245, 249);
  doc.rect(10, finalY - 4, 277, 12, 'F');
  doc.text(`Total Collections: ${collections.length}`, 14, finalY + 4);
  doc.text(`Total Amount: ${GHC(total)}`, 84, finalY + 4);

  doc.save(`collection-report-${Date.now()}.pdf`);
}
