import { Router } from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Contractor invoices for Invoice Analysis: the latest records in data/invoices/invoices.json and their PDFs.
// Read-only; the file is read on each request, so edits to it show without a restart.
const router = Router();
const DIR = new URL('../../data/invoices/', import.meta.url);
const LATEST = 6;

const allInvoices = () => JSON.parse(readFileSync(new URL('invoices.json', DIR), 'utf8')).invoices ?? [];
const latest = () => allInvoices()
  // By invoice date (numbers start with a contractor code, so they don't sort in time order)
  .sort((a, b) => String(a.invoice_date).localeCompare(String(b.invoice_date))).slice(-LATEST).reverse();

// Letters and digits only, upper case: "sps-ch-2026-1005 (scan).PDF" → "SPSCH20261005SCANPDF"
const squash = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// GET /api/cost-invoices/match?file=<uploaded file name> — the invoice record that file is for: its invoice number
// appears in the name, or the name is its PDF's or title's ("Invoice 5" ↔ Invoice_5.pdf). 404 when none matches.
router.get('/match', (req, res, next) => {
  try {
    const name = String(req.query.file ?? '');
    const base = squash(name.replace(/\.[^.]+$/, ''));
    if (!base) return res.status(400).json({ error: 'File name required' });
    const all = allInvoices();
    const inv = all.find((x) => base.includes(squash(x.invoice_number)))
      ?? all.find((x) => squash(String(x.pdf_file ?? '').replace(/^.*\//, '').replace(/\.[^.]+$/, '')) === base || squash(x.document_title) === base);
    if (!inv) return res.status(404).json({ error: 'No invoice record matches this file name' });
    const { pdf_file: _pdf, ...record } = inv;
    res.json({ invoice: { ...record, hasPdf: false } });
  } catch (err) {
    next(err);
  }
});

// GET /api/cost-invoices — newest first, each with hasPdf
router.get('/', (req, res, next) => {
  try {
    res.json({ invoices: latest().map(({ pdf_file: pdf, ...inv }) => ({ ...inv, hasPdf: Boolean(pdf) && existsSync(new URL(pdf, DIR)) })) });
  } catch (err) {
    next(err);
  }
});

// GET /api/cost-invoices/:number/pdf — the invoice's PDF, inline (?download=1 to save it)
router.get('/:number/pdf', (req, res, next) => {
  try {
    const inv = latest().find((x) => x.invoice_number === req.params.number);
    const file = inv?.pdf_file && new URL(inv.pdf_file, DIR);
    // Only files inside data/invoices/pdf are served
    if (!file || !file.href.startsWith(new URL('pdf/', DIR).href) || !existsSync(file)) return res.status(404).json({ error: 'Invoice PDF not found' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type('application/pdf');
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${inv.invoice_number}.pdf"`);
    res.sendFile(fileURLToPath(file));
  } catch (err) {
    next(err);
  }
});

export default router;
