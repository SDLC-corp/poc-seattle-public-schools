/**
 * Cost Intelligence – DEMO DATA ONLY. Everything here is illustrative sample data generated locally (seeded, so it
 * is the same on every load). It is not Seattle Public Schools financial information and nothing is fetched or
 * stored. All cost figures in the module are derived from these few tables, so cards, charts and tables reconcile.
 *
 * Keeps four kinds of figure apart:
 *  - historical actuals  → invoices dated 2023–2026 (approved invoices only count as actual spend)
 *  - current baseline    → today's contractor rates (CURRENT_YEAR) applied to the ACM quantities
 *  - estimates           → planned work priced at current rates
 *  - predictions         → planned work priced at the simulated escalation per year ("AI predicted")
 */

export const CURRENT_YEAR = 2026
export const TAX_RATE = 0.1035 // illustrative sales tax
export const DISTRICT = { id: 'district', name: 'Seattle Public Schools' }

// Seeded random numbers so the demo is stable
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = rng(20261104)
const pick = (list) => list[Math.floor(rand() * list.length)]
const between = (lo, hi) => lo + rand() * (hi - lo)
const round2 = (n) => Math.round(n * 100) / 100

export const CATEGORIES = [
  { id: 'Abatement', color: '#8b6fd6' },
  { id: 'Maintenance', color: '#2e9e4f' },
  { id: 'Inspection', color: '#2a78d6' },
  { id: 'Air Monitoring', color: '#d9a21b' },
  { id: 'Disposal', color: '#d6587a' },
]
export const CATEGORY_COLOR = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.color]))

// Contractor rates today (abatement / removal, per unit) and the observed annual escalation (illustrative)
export const MATERIALS = [
  { id: 'floor-tile', name: 'Floor Tile & Mastic', unit: 'sq ft', rate: 12.0, escalation: 0.102 },
  { id: 'ceiling-tile', name: 'Ceiling Tile', unit: 'sq ft', rate: 11.0, escalation: 0.1 },
  { id: 'pipe-insulation', name: 'Pipe Insulation (TSI)', unit: 'lf', rate: 25.0, escalation: 0.098 },
  { id: 'wallboard', name: 'Wallboard / Joint Compound', unit: 'sq ft', rate: 9.0, escalation: 0.095 },
  { id: 'boiler', name: 'Boiler Insulation', unit: 'sq ft', rate: 32.0, escalation: 0.085 },
  { id: 'duct-wrap', name: 'Duct Wrap', unit: 'lf', rate: 18.0, escalation: 0.07 },
  { id: 'window-glazing', name: 'Window Glazing', unit: 'lf', rate: 14.0, escalation: 0.06 },
]
export const MATERIAL = Object.fromEntries(MATERIALS.map((m) => [m.id, m]))
// Rate in a given year: current rate escalated (future) or discounted (past) at the material's annual rate
export const rateIn = (m, year) => round2(m.rate * (1 + m.escalation) ** (year - CURRENT_YEAR))

// Share of the full removal rate each kind of work costs
const WORK = {
  'Significantly Damaged': { category: 'Abatement', factor: 1, label: 'Removal / abatement' },
  Damaged: { category: 'Maintenance', factor: 0.35, label: 'Repair & encapsulation' },
  Good: { category: 'Maintenance', factor: 0.06, label: 'O&M upkeep' },
}

export const CONTRACTORS = [
  { id: 'ct1', name: 'Northwest Abatement Services', specialty: 'Abatement' },
  { id: 'ct2', name: 'Evergreen Environmental', specialty: 'Abatement' },
  { id: 'ct3', name: 'Cascade Facility Maintenance', specialty: 'Maintenance' },
  { id: 'ct4', name: 'Puget Sound Inspection Group', specialty: 'Inspection' },
  { id: 'ct5', name: 'ClearAir Monitoring Co.', specialty: 'Air Monitoring' },
  { id: 'ct6', name: 'Harbor Hazardous Waste Disposal', specialty: 'Disposal' },
]
const CONTRACTOR_FOR = Object.fromEntries(CATEGORIES.map((c) => [c.id, CONTRACTORS.filter((x) => x.specialty === c.id)]))

// --- Schools → buildings → floors → rooms → ACMs ---
const SCHOOL_DEFS = [
  // Names and ids match the app's school list (backend/data/schools.json); every cost figure stays illustrative
  { id: 'adamses', name: 'Adams Elementary', code: 'SCH-0042', type: 'Elementary', buildings: 3 },
  { id: 'ecksteinms', name: 'Eckstein Middle School', code: 'SCH-0057', type: 'Middle', buildings: 2 },
  { id: 'garfieldhs', name: 'Garfield High School', code: 'SCH-0063', type: 'High', buildings: 3 },
  { id: 'salmonbayk8', name: 'Salmon Bay K-8', code: 'SCH-0071', type: 'K-8', buildings: 2 },
  { id: 'bryantes', name: 'Bryant Elementary', code: 'SCH-0085', type: 'Elementary', buildings: 2 },
  { id: 'ballardhs', name: 'Ballard High School', code: 'SCH-0094', type: 'High', buildings: 3 },
]
const BUILDING_NAMES = ['Main Building', 'Gymnasium', 'Annex', 'Science Wing', 'Library Building']
const FLOOR_NAMES = ['Basement', 'Ground Floor', 'First Floor', 'Second Floor']
const ROOM_NAMES = ['Classroom', 'Corridor', 'Boiler Room', 'Cafeteria', 'Office', 'Library', 'Storage', 'Restroom', 'Mechanical Room']
const CONDITIONS = ['Good', 'Good', 'Good', 'Good', 'Good', 'Damaged', 'Damaged', 'Significantly Damaged']

export const SCHOOLS = []
export const BUILDINGS = []
export const ACMS = []
for (const sd of SCHOOL_DEFS) {
  const school = { ...sd, buildingIds: [] }
  SCHOOLS.push(school)
  for (let b = 0; b < sd.buildings; b += 1) {
    const building = { id: `${sd.id}-b${b + 1}`, schoolId: sd.id, name: `${BUILDING_NAMES[b]}`, letter: String.fromCharCode(65 + b) }
    BUILDINGS.push(building)
    school.buildingIds.push(building.id)
    const floors = 2 + Math.floor(rand() * 2)
    for (let f = 0; f < floors; f += 1) {
      const floor = FLOOR_NAMES[f]
      const rooms = 2 + Math.floor(rand() * 2)
      for (let r = 0; r < rooms; r += 1) {
        const room = `${f}${String(r + 1).padStart(2, '0')} ${pick(ROOM_NAMES)}`
        const n = 1 + Math.floor(rand() * 2)
        for (let a = 0; a < n; a += 1) {
          const m = pick(MATERIALS)
          const qty = Math.round(m.unit === 'lf' ? between(60, 420) : between(150, 1400))
          const condition = pick(CONDITIONS)
          ACMS.push({
            id: `ACM-${sd.code.slice(4)}-${building.letter}${f}${r + 1}${a + 1}`,
            schoolId: sd.id, buildingId: building.id, floor, room, materialId: m.id, material: m.name,
            qty, unit: m.unit, condition,
          })
        }
      }
    }
  }
}
export const SCHOOL = Object.fromEntries(SCHOOLS.map((s) => [s.id, s]))
export const BUILDING = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]))

// --- Historical invoices 2023 – 2026 (2026 is the year to date) ---
export const HIST_YEARS = [2023, 2024, 2025, 2026]
export const INVOICES = []
{
  let seq = 0
  const months = (y) => (y === CURRENT_YEAR ? 10 : 12)
  for (const y of HIST_YEARS) {
    for (const s of SCHOOLS) {
      const acms = ACMS.filter((a) => a.schoolId === s.id)
      // Each school: about a dozen invoices a year across the categories, a little more each year
      const count = 10 + (y - HIST_YEARS[0]) + Math.floor(rand() * 4)
      for (let i = 0; i < count; i += 1) {
        const a = pick(acms)
        const m = MATERIAL[a.materialId]
        const category = pick(['Abatement', 'Maintenance', 'Maintenance', 'Inspection', 'Air Monitoring', 'Disposal'])
        const contractor = pick(CONTRACTOR_FOR[category])
        let qty
        let unit
        let unitRate
        let description
        if (category === 'Abatement' || category === 'Maintenance') {
          qty = Math.round(a.qty * (category === 'Abatement' ? between(0.3, 0.6) : between(0.15, 0.4)))
          unit = m.unit
          unitRate = round2(rateIn(m, y) * (category === 'Abatement' ? 1 : 0.35))
          description = `${category === 'Abatement' ? 'Removal' : 'Repair & encapsulation'} – ${m.name}`
        } else if (category === 'Inspection') {
          qty = 1 + Math.floor(rand() * 3); unit = 'visit'; unitRate = round2(650 * 1.06 ** (y - CURRENT_YEAR)); description = 'AHERA inspection / surveillance'
        } else if (category === 'Air Monitoring') {
          qty = 2 + Math.floor(rand() * 6); unit = 'sample'; unitRate = round2(145 * 1.05 ** (y - CURRENT_YEAR)); description = 'PCM air sampling & analysis'
        } else {
          qty = 2 + Math.floor(rand() * 8); unit = 'cu yd'; unitRate = round2(165 * 1.07 ** (y - CURRENT_YEAR)); description = 'ACM waste transport & disposal'
        }
        const month = 1 + Math.floor(rand() * months(y))
        const subtotal = round2(qty * unitRate)
        const tax = round2(subtotal * TAX_RATE)
        seq += 1
        INVOICES.push({
          id: `INV-${y}-${String(seq).padStart(4, '0')}`, number: `${contractor.name.split(' ')[0].slice(0, 3).toUpperCase()}-${y}${String(1000 + seq)}`,
          date: `${y}-${String(month).padStart(2, '0')}-${String(1 + Math.floor(rand() * 27)).padStart(2, '0')}`, year: y, month,
          contractorId: contractor.id, contractor: contractor.name, schoolId: s.id, buildingId: a.buildingId, acmId: a.id,
          category, description, materialId: category === 'Abatement' || category === 'Maintenance' ? m.id : null,
          qty, unit, unitRate, subtotal, tax, total: round2(subtotal + tax),
          confidence: Math.round(between(86, 99)), status: 'Approved', duplicateOf: null, anomaly: null,
        })
      }
    }
  }
  // A few current-year invoices awaiting review, one duplicate and two anomalies (for the Invoice Analysis demo)
  const recent = INVOICES.filter((x) => x.year === CURRENT_YEAR).sort((a, b) => b.date.localeCompare(a.date))
  recent.slice(0, 6).forEach((x) => { x.status = 'Pending Review' })
  if (recent[1]) {
    const d = recent[1]
    seq += 1
    INVOICES.push({ ...d, id: `INV-${CURRENT_YEAR}-${String(seq).padStart(4, '0')}`, date: d.date, status: 'Pending Review', confidence: 91, duplicateOf: d.id })
  }
  if (recent[2]) { recent[2].unitRate = round2(recent[2].unitRate * 1.62); recent[2].subtotal = round2(recent[2].qty * recent[2].unitRate); recent[2].tax = round2(recent[2].subtotal * TAX_RATE); recent[2].total = round2(recent[2].subtotal + recent[2].tax); recent[2].anomaly = 'Unit rate 62% above the contractor’s recent average' }
  if (recent[4]) { recent[4].confidence = 68; recent[4].anomaly = 'Low extraction confidence on quantity and unit rate' }
}
// Only approved invoices count as actual spend
export const actualInvoices = () => INVOICES.filter((x) => x.status === 'Approved')

// --- Forecast: planned work per year, at current rates (estimate) and escalated (prediction) ---
export const FORECAST_YEARS = [2027, 2028, 2029, 2030, 2031]
// Simulated model adjustment per material (keeps "AI predicted" distinct from simple escalation)
const MODEL_ADJ = Object.fromEntries(MATERIALS.map((m) => [m.id, round2(between(0.98, 1.04))]))
export const FORECAST_ITEMS = []
const planned = { 'Significantly Damaged': 0, Damaged: 0 } // spreads one-off work evenly over the years
for (const a of ACMS) {
  const m = MATERIAL[a.materialId]
  const w = WORK[a.condition]
  // Abatement / repair happens once (earlier for worse condition); O&M upkeep recurs every year
  const years = a.condition === 'Good' ? FORECAST_YEARS : [FORECAST_YEARS[(planned[a.condition]++) % (a.condition === 'Significantly Damaged' ? 3 : 5)]]
  for (const year of years) {
    const estimated = round2(a.qty * m.rate * w.factor)
    const predicted = round2(estimated * (1 + m.escalation) ** (year - CURRENT_YEAR) * MODEL_ADJ[m.id])
    FORECAST_ITEMS.push({
      id: `${a.id}-${year}`, acmId: a.id, schoolId: a.schoolId, buildingId: a.buildingId, floor: a.floor, room: a.room,
      materialId: m.id, material: m.name, qty: a.qty, unit: a.unit, currentRate: m.rate, category: w.category, work: w.label,
      year, estimated, predicted,
    })
    // Abatement brings air monitoring (clearance) and waste disposal with it
    if (w.category === 'Abatement') {
      FORECAST_ITEMS.push({ id: `${a.id}-${year}-air`, acmId: a.id, schoolId: a.schoolId, buildingId: a.buildingId, floor: a.floor, room: a.room, materialId: m.id, material: m.name, qty: 6, unit: 'sample', currentRate: 145, category: 'Air Monitoring', work: 'Clearance air sampling', year, estimated: 870, predicted: round2(870 * 1.05 ** (year - CURRENT_YEAR)) })
      const cy = Math.max(2, Math.round(a.qty / 120))
      FORECAST_ITEMS.push({ id: `${a.id}-${year}-disp`, acmId: a.id, schoolId: a.schoolId, buildingId: a.buildingId, floor: a.floor, room: a.room, materialId: m.id, material: m.name, qty: cy, unit: 'cu yd', currentRate: 165, category: 'Disposal', work: 'Waste disposal', year, estimated: round2(cy * 165), predicted: round2(cy * 165 * 1.07 ** (year - CURRENT_YEAR)) })
    }
  }
}
// Each school's periodic inspection (3-year reinspection + 6-month surveillance), every year
for (const s of SCHOOLS) {
  for (const year of FORECAST_YEARS) {
    const visits = 2 + s.buildingIds.length
    FORECAST_ITEMS.push({ id: `${s.id}-${year}-insp`, acmId: null, schoolId: s.id, buildingId: null, floor: '', room: '', materialId: null, material: '—', qty: visits, unit: 'visit', currentRate: 650, category: 'Inspection', work: 'Surveillance & reinspection', year, estimated: visits * 650, predicted: round2(visits * 650 * 1.06 ** (year - CURRENT_YEAR)) })
  }
}

// Simulated "AI predicted" unit rate for a material in a future year (same model as the forecast items)
export const predictedRate = (m, year) => round2(m.rate * (1 + m.escalation) ** (year - CURRENT_YEAR) * MODEL_ADJ[m.id])

// Forecast scenarios around the expected prediction
export const SCENARIOS = { low: 0.9, expected: 1, high: 1.15 }

// Approved budgets (illustrative): per school per year
// (current year: around the school's spend so far, annualized; future years: around the planned work)
export const BUDGETS = Object.fromEntries(SCHOOLS.map((s) => [s.id, Object.fromEntries([CURRENT_YEAR, ...FORECAST_YEARS].map((y) => {
  const base = y === CURRENT_YEAR
    ? (INVOICES.filter((x) => x.status === 'Approved' && x.schoolId === s.id && x.year === y).reduce((n, x) => n + x.total, 0) * 12) / 10
    : FORECAST_ITEMS.filter((f) => f.schoolId === s.id && f.year === y).reduce((n, f) => n + f.estimated, 0)
  return [y, Math.round((base * between(0.92, 1.15)) / 500) * 500]
}))]))

// Past predictions vs what was actually spent (for forecast accuracy) – illustrative
export const PAST_PREDICTIONS = [2024, 2025].map((y) => {
  const actual = actualInvoices().filter((x) => x.year === y).reduce((n, x) => n + x.total, 0)
  return { year: y, predicted: Math.round(actual * between(0.9, 1.08)), actual: Math.round(actual) }
})

// Recent activity feed (from the latest invoices)
export const recentActivity = () => [...INVOICES].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)
