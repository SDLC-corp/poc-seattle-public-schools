import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Read-only bulk sample results imported from the district's lab spreadsheet
// ({ source_file, worksheet, columns, records: [{ SiteDesc, SampleNo, Description, Result }] })
const FILE = fileURLToPath(new URL('../../data/lab-data/sample_lab_data.json', import.meta.url));

// Includes the misspellings found in the source data ("Chyrsotile", "Temolite", "Anthophylite", "Actinole")
const MINERALS = 'chr?y?r?sotile|amosite|crocidolite|tr?emolite|actinol(?:ite|e)|anthophyl+ite|asbestos';
const MINERAL_NAME = (m) => {
  const k = m.toLowerCase();
  if (k.startsWith('ch')) return 'Chrysotile';
  if (k.startsWith('anth')) return 'Anthophyllite';
  if (k.startsWith('act')) return 'Actinolite';
  if (/^tr?emolite$/.test(k)) return 'Tremolite';
  return titleCase(k);
};
// "4% Chrysotile", "<1% CHRYSOTILE", "1-5% chrysotile", "25-30 CHRYSOTILE", "Trace Chrysotile", "2.3% asbestos"
const COMPONENT = new RegExp(`(<\\s*\\d+(?:\\.\\d+)?\\s*%?|\\d+(?:\\.\\d+)?(?:\\s*-\\s*\\d+(?:\\.\\d+)?)?\\s*%|\\d+\\s*-\\s*\\d+|trace)\\s*(?:of\\s+)?(${MINERALS})`, 'gi');
const ROOM = /\b(?:room|rm\.?)\s*#?\s*([A-Z]?\d+[A-Z]?(?:-\d+)?)\b/i;
const AREA = /^\s*(H\s?\d+[A-Z]?)\s*[-–:]\s*/i;

export const RESULT_CLASSES = {
  detected: 'Asbestos Detected',
  none: 'No Asbestos Detected',
  assumed: 'Assumed ACM',
  inconclusive: 'Not Analyzed / Inconclusive',
  // Samples sent from inspections that are still awaiting their result
  pending: 'Pending at Lab',
};

const titleCase = (s) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

// The Result column is free text typed over decades; reduce it to a class plus the asbestos components
export function classifyResult(raw) {
  const text = raw.trim();
  const components = [...text.matchAll(COMPONENT)].map(([, amount, mineral]) => {
    const a = amount.replace(/\s+/g, '');
    const qty = /trace/i.test(a) ? 'Trace' : a.endsWith('%') ? a : `${a}%`;
    return `${qty} ${MINERAL_NAME(mineral)}`;
  });
  let resultClass = 'inconclusive';
  if (components.length || (/\d\s*%/.test(text) && !/^no\b/i.test(text))) resultClass = 'detected';
  else if (/assum/i.test(text)) resultClass = 'assumed';
  else if (/^(no\b|none\b|layer\s*#)/i.test(text)) resultClass = 'none';
  const unique = [...new Set(components)];
  return {
    resultClass,
    components: unique,
    resultLabel: resultClass === 'detected' ? (unique[0] ?? 'Asbestos Detected') : RESULT_CLASSES[resultClass],
  };
}

function toSample(r, i) {
  const description = String(r.Description ?? '').trim();
  const area = description.match(AREA);
  return {
    id: String(i + 1),
    site: String(r.SiteDesc ?? '').trim(),
    sampleNo: String(r.SampleNo ?? '').trim(),
    description: area ? description.slice(area[0].length) : description,
    homogeneousArea: area ? area[1].replace(/\s/g, '').toUpperCase() : null,
    room: description.match(ROOM)?.[1].toUpperCase() ?? null,
    result: String(r.Result ?? '').trim(),
    ...classifyResult(String(r.Result ?? '')),
  };
}

let cache = { mtimeMs: 0, data: null };

// Parsed once and reloaded only when the file on disk changes
export function getLabData() {
  const { mtimeMs } = statSync(FILE);
  if (cache.mtimeMs !== mtimeMs) {
    const json = JSON.parse(readFileSync(FILE, 'utf8'));
    cache = {
      mtimeMs,
      data: {
        sourceFile: json.source_file,
        worksheet: json.worksheet,
        samples: (json.records ?? []).map(toSample),
      },
    };
  }
  return cache.data;
}
