// Generates the synthetic PDFs listed in scripts/contract-docs.json into public/contracts/ (contract documents,
// per-invoice documents and vendor security assessments). The manifest mirrors it_license_document (migrations
// 002 and 009; export with scripts/contract-docs-manifest.sql). Every page is watermarked as a synthetic demo
// document; the buyer is a fictional entity and no vendor branding is used. The output folder is rebuilt each run.
//
//   node scripts/generate-contract-docs.mjs

import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = JSON.parse(readFileSync(join(ROOT, 'scripts/contract-docs.json'), 'utf8'));

const BUYER = 'Fleet Command Motors India Pvt. Ltd. (fictional demo entity)';
const WATERMARK = 'SYNTHETIC DEMO DOCUMENT - not a real agreement';
const inr = (v) => `INR ${Math.round(Number(v)).toLocaleString('en-IN')}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');

const CLAUSES = {
  MSA: [
    ['Scope', 'Vendor grants Customer a non-exclusive, non-transferable right to use the Subscription Services described in each Order Form for internal business purposes.'],
    ['Term and renewal', ({ start_date, end_date, auto_renew, notice_period_days }) =>
      `The initial term runs from ${fmtDate(start_date)} to ${fmtDate(end_date)}. ${auto_renew ? 'The term renews automatically for 12 months' : 'Renewal requires a new Order Form'} unless either party gives ${notice_period_days} days written notice before expiry.`],
    ['Fees and uplift', ({ uplift_cap_pct, original_currency }) =>
      `Fees are invoiced as stated in the Order Form (contract currency ${original_currency}, payable in INR). Renewal price increases are capped at ${uplift_cap_pct}% per year.`],
    ['Licence compliance', 'Customer may not exceed purchased quantities. Usage above entitlement is subject to a true-up at the then-current list price, invoiced annually.'],
    ['Data protection', 'Each party complies with the Digital Personal Data Protection Act, 2023 and the Data Processing Agreement attached to this MSA.'],
    ['Governing law', 'This Agreement is governed by the laws of India; courts at Chennai have exclusive jurisdiction.'],
  ],
  'Order Form': [
    ['Billing', ({ billing_frequency }) => `Fees are billed ${billing_frequency.toLowerCase()} in advance, net 45 days.`],
    ['Quantities', 'Quantities below are the purchased entitlement. Additional seats may be added pro-rata to the end of the term.'],
  ],
  SOW: [
    ['Services', 'Vendor provides L2/L3 support, patches, and version upgrades for the licensed on-premise software.'],
    ['Response targets', 'Severity 1: 1 hour, 24x7. Severity 2: 4 business hours. Severity 3: next business day.'],
  ],
  SLA: [
    ['Availability', 'Monthly availability target of 99.9%, excluding scheduled maintenance notified 72 hours in advance.'],
    ['Service credits', '99.0-99.9%: 5% of monthly fee. 95.0-99.0%: 10%. Below 95.0%: 25%.'],
  ],
  DPA: [
    ['Processing', 'Vendor processes personal data only on documented instructions from Customer, for the purpose of delivering the services.'],
    ['Data residency', 'Customer data is stored in India-region data centres. Cross-border transfer requires prior written approval.'],
    ['Breach notification', 'Vendor notifies Customer of a personal data breach within 24 hours of becoming aware of it.'],
  ],
  'Renewal Quote': [
    ['Proposed term', ({ end_date }) => `12 months commencing ${fmtDate(new Date(new Date(end_date).getTime() + 86400000))}.`],
    ['Pricing', ({ uplift_cap_pct }) => `Renewal pricing reflects a ${uplift_cap_pct}% uplift on current unit prices. Quantities may be reduced at renewal without penalty.`],
    ['Validity', 'This quote is valid for 30 days and is not binding until countersigned.'],
  ],
  Invoice: [
    ['Payment terms', 'Net 45 days. GST at 18% applies (shown separately on the tax invoice).'],
  ],
};

async function buildPdf(d) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${d.title} (synthetic demo)`);
  pdf.setSubject(WATERMARK);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]); // A4
  const { width, height } = page.getSize();
  const ink = rgb(0.12, 0.16, 0.22);
  const muted = rgb(0.4, 0.45, 0.52);
  let y = height - 60;

  page.drawText(WATERMARK, { x: 70, y: 250, size: 26, font: bold, color: rgb(0.85, 0.2, 0.2), opacity: 0.15, rotate: degrees(40) });

  const wrap = (text, f, size, maxWidth) => {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(next, size) > maxWidth && line) { lines.push(line); line = w; } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  const para = (text, { f = font, size = 10, color = ink, indent = 0, gap = 4 } = {}) => {
    for (const l of wrap(text, f, size, width - 100 - indent)) { page.drawText(l, { x: 50 + indent, y, size, font: f, color }); y -= size + 3; }
    y -= gap;
  };

  page.drawText(WATERMARK.toUpperCase(), { x: 50, y: height - 30, size: 8, font: bold, color: rgb(0.75, 0.15, 0.15) });
  para(d.doc_type.toUpperCase(), { f: bold, size: 9, color: muted, gap: 2 });
  para(d.title, { f: bold, size: 16, gap: 6 });
  para(`Document ${d.document_id} | Version ${d.version} | Effective ${fmtDate(d.effective_date)}${d.contract_id ? ` | Contract ${d.contract_id}` : ''}${d.expiry_date ? ` | Valid until ${fmtDate(d.expiry_date)}` : ''}`, { size: 9, color: muted, gap: 12 });

  para('Parties', { f: bold, size: 11 });
  para(`Customer: ${BUYER}`, { indent: 10, gap: 0 });
  para(`Vendor: ${d.vendor_name} (as counterparty named for demonstration only)`, { indent: 10, gap: 10 });

  const kv = (rows) => {
    for (const [k, v] of rows) {
      page.drawText(k, { x: 60, y, size: 9.5, font: bold, color: muted });
      page.drawText(String(v ?? '-'), { x: 210, y, size: 9.5, font, color: ink });
      y -= 14;
    }
    y -= 8;
  };

  if (d.doc_type === 'Security Assessment') {
    para('Assessment summary', { f: bold, size: 11 });
    kv([['Vendor', d.vendor_name], ['Vendor category', d.vendor_category], ['Headquarters', d.hq_country],
      ['Risk tier', d.risk_tier], ['Certifications', (d.certifications || []).join(', ') || 'None provided'],
      ['Assessed on', fmtDate(d.effective_date)], ['Valid until', fmtDate(d.expiry_date)]]);
    para('Areas reviewed', { f: bold, size: 11 });
    [['Access control', 'Single sign-on and MFA for administrative access; quarterly access reviews.'],
      ['Data protection', 'Encryption in transit and at rest; India-region hosting where applicable (DPDP Act 2023).'],
      ['Incident response', 'Documented process; customer notification within 24 hours of a confirmed breach.'],
      ['Business continuity', 'Annual disaster-recovery test; recovery time objective within contracted SLA.'],
    ].forEach(([h, b], i) => { para(`${i + 1}. ${h}`, { f: bold, size: 10, gap: 1 }); para(b, { indent: 12, gap: 6 }); });
    para(`Overall result: ${d.risk_tier === 'High' ? 'Conditional - remediation plan required' : 'Accepted'}. Re-assessment due by ${fmtDate(d.expiry_date)}.`, { f: bold, size: 10 });
  } else if (d.doc_type === 'Invoice' && d.invoice) {
    const inv = d.invoice;
    para('Invoice details', { f: bold, size: 11 });
    kv([['Invoice number', inv.invoice_id], ['Contract', d.contract_id], ['Product', d.software_name], ['Description', inv.description],
      ['Service period', `${fmtDate(inv.period_start)} to ${fmtDate(inv.period_end)}`], ['Invoice date', fmtDate(inv.invoice_date)],
      ['Due date', `${fmtDate(inv.due_date)} (net ${d.payment_terms_days} days)`]]);
    para('Charges', { f: bold, size: 11 });
    kv([['Subscription fee', inr(inv.amount_inr)], ['GST @ 18%', inr(inv.tax_inr)], ['Total payable', inr(Number(inv.amount_inr) + Number(inv.tax_inr))]]);
    if (inv.note) para(`Note: ${inv.note}`, { size: 9.5, color: muted });
  } else {
    para('Key terms', { f: bold, size: 11 });
    kv([
      ['Product', d.software_name], ['Deployment', d.deployment],
      ['Term', `${fmtDate(d.start_date)} to ${fmtDate(d.end_date)}`],
      ['Annual contract value', inr(d.annual_value_inr)], ['Billing', d.billing_frequency],
      ['Auto-renew', d.auto_renew ? 'Yes' : 'No'], ['Notice period', `${d.notice_period_days} days`],
      ['Uplift cap', `${d.uplift_cap_pct}% per year`], ['Business owner', d.business_owner], ['Procurement owner', d.procurement_owner],
      ...(d.contract_status === 'Expired' ? [['Contract status', 'Expired (superseded by renewal)']] : []),
    ]);

    if (['Order Form', 'Renewal Quote'].includes(d.doc_type) && d.entitlements) {
      para('Entitlements', { f: bold, size: 11 });
      const cols = [60, 220, 330, 400, 490];
      ['Edition', 'Metric', 'Qty', 'INR / month', 'INR / year'].forEach((h, i) => page.drawText(h, { x: cols[i], y, size: 9, font: bold, color: muted }));
      y -= 14;
      const factor = d.doc_type === 'Renewal Quote' ? 1 + Number(d.uplift_cap_pct) / 100 : 1;
      for (const e of d.entitlements) {
        const unit = Number(e.unit_price_inr_month) * factor;
        const row = [e.edition, e.metric, String(e.seats), Math.round(unit).toLocaleString('en-IN'), Math.round(unit * e.seats * 12).toLocaleString('en-IN')];
        row.forEach((c, i) => page.drawText(c, { x: cols[i], y, size: 9, font, color: ink }));
        y -= 13;
      }
      y -= 10;
    }

    para('Terms', { f: bold, size: 11 });
    (CLAUSES[d.doc_type] || []).forEach(([head, body], i) => {
      para(`${i + 1}. ${head}`, { f: bold, size: 10, gap: 1 });
      para(typeof body === 'function' ? body(d) : body, { indent: 12, gap: 6 });
    });
  }

  y = Math.min(y, 170);
  page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: muted });
  y -= 18;
  if (d.doc_type === 'Invoice') {
    para('Tax invoice issued electronically; no signature required.', { size: 9, color: muted });
  } else if (d.doc_type === 'Security Assessment') {
    para('Assessment attested by Customer IT Risk (demo) and Vendor security officer (demo).', { size: 9.5 });
  } else if (d.is_signed) {
    para(`Executed electronically by both parties on ${fmtDate(d.effective_date)}.`, { size: 9.5 });
    para('Customer signatory: Head of IT Sourcing (demo)        Vendor signatory: Authorised representative (demo)', { size: 9, color: muted });
  } else {
    para(d.doc_type === 'Renewal Quote' ? 'NOT YET ACCEPTED - awaiting customer countersignature.' : 'DRAFT - UNSIGNED. Not executed by either party.',
      { f: bold, size: 10.5, color: rgb(0.75, 0.15, 0.15) });
  }
  page.drawText(`${WATERMARK}. Generated for the IT dashboard demo.`, { x: 50, y: 30, size: 7.5, font, color: muted });
  return pdf.save();
}

rmSync(join(ROOT, 'public', 'contracts'), { recursive: true, force: true });
let total = 0;
for (const d of docs) {
  const out = join(ROOT, 'public', d.file_url.replace(/^\//, ''));
  mkdirSync(dirname(out), { recursive: true });
  const bytes = await buildPdf(d);
  writeFileSync(out, bytes);
  total += bytes.length;
}
console.log(`Wrote ${docs.length} PDFs (${(total / 1024).toFixed(0)} KB) to public/contracts/ (folder rebuilt)`);
