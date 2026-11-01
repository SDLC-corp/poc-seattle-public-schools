// Scrapes the Seattle Public Schools directory and writes data/schools.json.
// Usage: npm run scrape:schools
import { writeFile, mkdir } from 'node:fs/promises';
import * as cheerio from 'cheerio';

const LIST_URL = 'https://www.seattleschools.org/schools/';
const OUT_FILE = new URL('../data/schools.json', import.meta.url);
const CONCURRENCY = 4;
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (school-directory-poc)' };

const clean = (s) => (s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

async function getHtml(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return res.text();
}

function schoolType(name) {
  if (/K-?8/i.test(name)) return 'K-8';
  if (/High|9-12/i.test(name)) return 'High';
  if (/Middle/i.test(name)) return 'Middle';
  if (/Elementary/i.test(name)) return 'Elementary';
  return 'Other';
}

function parseAddress($, el) {
  // <address>street<br>City, ST zip<br><a>About</a></address>
  const lines = $(el)
    .clone().find('a').remove().end()
    .html()?.split(/<br\s*\/?>/i)
    .map((l) => clean(cheerio.load(l).text()))
    .filter(Boolean) ?? [];
  const [street = '', cityLine = ''] = lines;
  const m = cityLine.match(/^(.*),\s*([A-Z]{2})\s+(\d{5})/);
  return {
    street: street.replace(/\s+\./g, '.'),
    city: m?.[1] ?? '',
    state: m?.[2] ?? '',
    zip: m?.[3] ?? '',
    full: [street, cityLine].filter(Boolean).join(', '),
  };
}

function parseList(html) {
  const $ = cheerio.load(html);
  return $('.sps-school-list .list-item').map((_, item) => {
    const link = $(item).find('.list-item-title a');
    const profileUrl = link.attr('href');
    const name = clean(link.text());
    const website = $(item).find('a[target="_blank"]').attr('href') ?? null;
    return {
      id: profileUrl.split('/').filter(Boolean).pop(),
      name,
      type: schoolType(name),
      address: parseAddress($, $(item).find('address')),
      website,
      profileUrl,
    };
  }).get();
}

function parseProfile(html) {
  const $ = cheerio.load(html);
  const body = $('.article-body');
  const officeText = clean(body.find('address').next('div').text());

  const li = (pattern) => body.find('li').filter((_, el) =>
    pattern.test(clean($(el).find('strong').first().text()))).first();

  // Label varies ("Principal", "Interim Principal"); the name may or may not be in its own <strong>
  const principalLi = li(/Principal/);
  const principalTitle = clean(principalLi.find('strong').first().text()).replace(/:$/, '') || null;
  const principalEmail = principalLi.find('a[href^="mailto:"]').first().text() || null;
  const principal = clean(
    principalLi.clone().find('strong').first().remove().end().end().find('a').remove().end().text(),
  ).replace(/^[\s:,]+|[\s:,]+$/g, '') || null;

  const boardLink = li(/^School Board/).find('a').first();
  const boardMatch = clean(boardLink.text()).match(/District\s+(\d+)/i);

  const category = clean(body.text())
    .match(/(Attendance Area|Option|Service|Alternative Learning Experience) School/)?.[0] ?? null;

  return {
    category,
    phone: officeText.match(/(?:Office|Phone|Main)[^:]*:\s*(\d{3}-\d{3}-\d{4})/)?.[1] ?? null,
    fax: officeText.match(/Fax:\s*(\d{3}-\d{3}-\d{4})/)?.[1] ?? null,
    principal,
    principalTitle,
    principalEmail,
    boardDistrict: boardMatch ? Number(boardMatch[1]) : null,
    boardDistrictUrl: boardLink.attr('href') ?? null,
  };
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }));
  return results;
}

// US Census batch geocoder: free, no API key, up to 10k addresses per request.
async function geocode(schools) {
  const rows = schools
    .filter((s) => s.address.street)
    .map((s) => [s.id, s.address.street, s.address.city, s.address.state, s.address.zip]
      .map((v) => `"${v.replace(/"/g, '')}"`).join(','));

  const form = new FormData();
  form.append('benchmark', 'Public_AR_Current');
  form.append('addressFile', new Blob([rows.join('\n')], { type: 'text/csv' }), 'addresses.csv');

  const res = await fetch('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', {
    method: 'POST', body: form,
  });
  if (!res.ok) throw new Error(`Geocoder returned ${res.status}`);

  const coords = new Map();
  for (const line of (await res.text()).split('\n')) {
    const cols = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    if (cols[2] !== 'Match') continue;
    const [lng, lat] = cols[5].split(',').map(Number);
    coords.set(cols[0], { lat, lng });
  }

  // Retry misses one at a time with the single-line endpoint, which is more forgiving
  for (const s of schools.filter((s) => !coords.has(s.id))) {
    const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
    url.search = new URLSearchParams({ address: s.address.full, benchmark: 'Public_AR_Current', format: 'json' });
    const match = (await (await fetch(url)).json()).result?.addressMatches?.[0];
    if (match) coords.set(s.id, { lat: match.coordinates.y, lng: match.coordinates.x });
  }
  return coords;
}

async function main() {
  console.log(`Fetching ${LIST_URL}`);
  const schools = parseList(await getHtml(LIST_URL));
  console.log(`Found ${schools.length} schools, fetching profiles...`);

  const profiles = await mapLimit(schools, CONCURRENCY, async (s) => {
    try {
      return parseProfile(await getHtml(s.profileUrl));
    } catch (err) {
      console.warn(`  profile failed for ${s.name}: ${err.message}`);
      return {};
    }
  });

  console.log('Geocoding addresses...');
  let coords = new Map();
  try {
    coords = await geocode(schools);
  } catch (err) {
    console.warn(`  geocoding failed: ${err.message}`);
  }

  const data = schools.map((s, i) => ({
    ...s,
    ...profiles[i],
    location: coords.get(s.id) ?? null,
  }));

  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify({
    source: LIST_URL,
    scrapedAt: new Date().toISOString(),
    count: data.length,
    schools: data,
  }, null, 2));

  const missing = data.filter((s) => !s.location).map((s) => s.name);
  console.log(`Wrote ${data.length} schools to data/schools.json`);
  if (missing.length) console.log(`No coordinates for ${missing.length}: ${missing.join('; ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
