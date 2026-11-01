// Generates SAMPLE notifications (last 45 days) → data/notifications.json.
// Notifications raised by the app itself (sample: false) are kept; previous samples are replaced.
// Usage: npm run generate:notifications
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const FILE = new URL('../data/notifications.json', import.meta.url);
const COUNT = 64;
const UNREAD_SHARE = 0.4;

function rng(seedText) {
  let seed = 0;
  for (const ch of seedText) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng('sps-notifications');
const pick = (list) => list[Math.floor(rand() * list.length)];
const num = (min, max) => Math.floor(min + rand() * (max - min + 1));

const { schools } = read('schools.json');
const { buildings } = read('buildings.json');
const acm = () => `ACM-${String(num(1, 99999)).padStart(5, '0')}`;
const room = () => `Room ${num(1, 3)}${String(num(1, 40)).padStart(2, '0')}`;
const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Each template gets (school, building, createdAt) and returns notification fields
const TEMPLATES = [
  [8, 'inspection', (s, b, at) => {
    const days = pick([7, 14, 30]); const due = new Date(at.getTime() + days * 86400000);
    return { priority: days <= 7 ? 'high' : 'medium', title: 'Inspection Due Soon',
      message: `Periodic surveillance inspection is due in ${days} days.`, dueDate: due.toISOString(), rooms: `Multiple (${num(4, 20)})`,
      description: `The 6-month periodic surveillance for ${s.name} is due on ${fmt(due)}. Complete it on or before the due date to stay compliant with AHERA.`,
      link: '/inspections/upcoming', linkLabel: 'View Inspection' };
  }],
  [6, 'inspection', (s) => ({ priority: 'low', title: 'Inspection Completed',
    message: 'Surveillance inspection marked as completed.', rooms: `Multiple (${num(4, 20)})`,
    description: `The periodic surveillance inspection at ${s.name} was completed and the report is ready for review.`,
    link: '/inspections/history', linkLabel: 'View Inspection' })],
  [3, 'inspection', (s, b, at) => {
    const due = new Date(at.getTime() + num(30, 90) * 86400000);
    return { priority: 'medium', title: '3-Year Reinspection Scheduled',
      message: `AHERA 3-year reinspection scheduled for ${fmt(due)}.`, dueDate: due.toISOString(),
      description: `An accredited inspector has been scheduled to reinspect all known and assumed ACM at ${s.name} (${b?.name ?? 'all buildings'}).`,
      link: '/inspections/upcoming', linkLabel: 'View Inspection' };
  }],
  [7, 'compliance', (s, b, at) => {
    const id = acm(); const days = pick([3, 5, 10]); const due = new Date(at.getTime() + days * 86400000);
    return { priority: days <= 5 ? 'high' : 'medium', title: 'Compliance Deadline Approaching',
      message: `Response action for ${id} is due in ${days} days.`, dueDate: due.toISOString(), rooms: room(),
      description: `The response action for ${id} at ${s.name} must be completed by ${fmt(due)}. Assign a contractor or update the action status.`,
      link: '/response-actions', linkLabel: 'View Response Action' };
  }],
  [4, 'compliance', (s) => {
    const id = acm();
    return { priority: 'high', title: 'Action Overdue', message: `Corrective action for ${id} is overdue.`, rooms: room(),
      description: `The corrective action for ${id} at ${s.name} passed its due date and is still open. Escalate or record the completed work.`,
      link: '/response-actions', linkLabel: 'View Response Action' };
  }],
  [3, 'compliance', (s) => ({ priority: 'medium', title: 'Annual AHERA Notification Due',
    message: 'Annual notice to parents, staff and guardians is due.',
    description: `AHERA requires ${s.name} to notify parents, teachers and employee organizations of asbestos inspections, response actions and post-response activities at least once each school year.`,
    link: '/documents/notifications', linkLabel: 'View Notifications' })],
  [7, 'acm', (s, b) => {
    const r = room();
    return { priority: 'low', title: 'ACM Record Updated', message: `ACM material details updated in ${b?.name ?? 'Main Building'} – ${r}.`, rooms: r,
      description: `An ACM record at ${s.name} was updated (condition and quantity). Review the change in the ACM inventory.`,
      link: '/acm/locations', linkLabel: 'View ACM Record' };
  }],
  [4, 'acm', (s, b) => {
    const r = room();
    return { priority: 'high', title: 'ACM Damage Reported', message: `Damaged ${pick(['pipe insulation', 'ceiling tile', 'floor tile'])} reported in ${r}.`, rooms: r,
      description: `Custodial staff reported damaged material in ${b?.name ?? 'Main Building'}, ${r} at ${s.name}. Restrict access to the area and assess within 24 hours.`,
      link: '/acm/locations', linkLabel: 'View ACM Record' };
  }],
  [3, 'system', (s, b, at) => {
    const d = new Date(at.getTime() + num(2, 6) * 86400000);
    return { priority: 'low', title: 'System Maintenance', message: `Scheduled system maintenance on ${fmt(d)}, 2:00 AM – 4:00 AM.`, all: true,
      description: 'The platform will be unavailable during the maintenance window. Save your work beforehand.' };
  }],
  [2, 'system', () => ({ priority: 'medium', title: 'Lab Results Import Failed', message: 'A lab results file could not be processed.', all: true,
    description: 'The latest lab results upload had missing sample IDs. Ask the lab to resend the file.', link: '/sampling/lab-results', linkLabel: 'View Lab Results' })],
  [3, 'other', (s) => ({ priority: 'low', title: 'Contractor Training Expiring', message: 'Asbestos worker accreditation expires in 30 days.',
    description: `A contractor assigned to ${s.name} has an accreditation expiring soon. Request an updated certificate.`,
    link: '/personnel', linkLabel: 'View Training Records' })],
  [2, 'other', (s) => ({ priority: 'low', title: 'Management Plan Reviewed', message: 'Management plan review completed.',
    description: `The AHERA management plan for ${s.name} was reviewed and signed off.`, link: '/management-plans', linkLabel: 'View Plan' })],
];
const total = TEMPLATES.reduce((n, t) => n + t[0], 0);
const pickTemplate = () => {
  let r = rand() * total;
  return TEMPLATES.find((t) => (r -= t[0]) < 0) ?? TEMPLATES[0];
};

function buildSamples() {
  const now = Date.now();
  return Array.from({ length: COUNT }, (_, i) => {
    const [, type, make] = pickTemplate();
    const school = pick(schools);
    const bs = buildings.filter((b) => b.schoolId === school.id);
    const building = bs.length ? pick(bs) : null;
    const createdAt = new Date(now - num(0, 45) * 86400000 - num(0, 86399) * 1000);
    const made = make(school, building, createdAt);
    const all = made.all === true;
    return {
      id: `SAMPLE-NTF-${String(i + 1).padStart(4, '0')}`,
      type,
      priority: made.priority,
      title: made.title,
      message: made.message,
      description: made.description,
      schoolId: all ? null : school.id,
      schoolName: all ? null : school.name,
      buildingName: all ? null : building?.name ?? null,
      rooms: made.rooms ?? null,
      dueDate: made.dueDate ?? null,
      link: made.link ?? null,
      linkLabel: made.linkLabel ?? null,
      createdAt: createdAt.toISOString(),
      // Recent ones are more likely to still be unread
      read: rand() > UNREAD_SHARE * (1.6 - (now - createdAt.getTime()) / (45 * 86400000)),
      sample: true,
    };
  });
}

async function main() {
  const existing = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')).notifications : [];
  const real = existing.filter((n) => !n.sample);
  const notifications = [...real, ...buildSamples()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  await writeFile(FILE, JSON.stringify({ notifications }, null, 2));
  const unread = notifications.filter((n) => !n.read).length;
  console.log(`Wrote ${notifications.length} notifications (${real.length} raised by the app, ${COUNT} sample; ${unread} unread)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
