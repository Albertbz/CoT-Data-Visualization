import * as d3 from 'd3';

// Import data from data folder. Data is in JSON format, and is an array of objects.
import data from '../data/all_merged_data.json' assert { type: 'json' };

// Make type for data entries
export type DataEntry = {
  "Discord Username": string;
  "VS Username": string;
  "Character Name": string;
  "Social Class": string;
  "Affiliation": string;
  "PvE Deaths": number;
  "Year of Maturity": number;
  "Current Age": number;
  "Year 4": number;
  "Year 5": number;
  "Year 6": number;
  "Year 7": number;
  "Year 8": number;
  "Date": Date;
};

// Make data into a list of objects
export const dataList: DataEntry[] = Array.isArray(data) ? data : [data];

// Each data point has a 'Date' field; parse it to a JavaScript Date object.
const parseDate = d3.timeParse('%Y-%m-%d');
dataList.forEach(d => { d.Date = parseDate(String(d.Date))!; });

// Build per-date groupings. For each date we keep:
// - all: the full list of entries on that date
// - bySocialClass: map from social class -> entries[]
// - byAffiliation: map from affiliation -> entries[]
export const dateGroups: Record<string, {
  all: DataEntry[];
  bySocialClass: Record<string, DataEntry[]>;
  byAffiliation: Record<string, DataEntry[]>;
}> = {};

dataList.forEach(d => {
  const dateStr = d.Date.toISOString().split('T')[0];
  if (!dateGroups[dateStr]) {
    dateGroups[dateStr] = { all: [], bySocialClass: {}, byAffiliation: {} };
  }
  dateGroups[dateStr].all.push(d);

  const sc = d['Social Class'] as string | undefined;
  const aff = d['Affiliation'] as string | undefined;

  if (sc && sc !== 'Unknown') {
    if (!dateGroups[dateStr].bySocialClass[sc]) dateGroups[dateStr].bySocialClass[sc] = [];
    dateGroups[dateStr].bySocialClass[sc].push(d);
  }
  if (aff && aff !== 'Unknown') {
    if (!dateGroups[dateStr].byAffiliation[aff]) dateGroups[dateStr].byAffiliation[aff] = [];
    dateGroups[dateStr].byAffiliation[aff].push(d);
  }
});

// Prepare ordered list of dates and convenience arrays
export const dates = Object.keys(dateGroups).sort();
export const dateObjects = dates.map(d => new Date(d));

// --- Game month mapping ---
// Real-world anchor: a real date maps to a specific in-game year/month.
// By convention: real `2025-04-19` => in-game Year 5, May (month 5).
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BASE_REAL_DATE = new Date('2025-04-19');
const BASE_GAME_YEAR = 5;
const BASE_GAME_MONTH = 5; // May

// Server restart behavior: every 6 hours there's a ~6 minute restart during
// which the in-game calendar is paused. That yields 4 restarts/day * 6min = 24min/day
// of paused time. We account for these pauses when converting real time -> in-game months.
const RESTARTS_PER_DAY = 4;
const RESTART_MINUTES = 6;
const PAUSE_MINUTES_PER_DAY = RESTARTS_PER_DAY * RESTART_MINUTES; // 24
const MINUTES_PER_DAY = 24 * 60;
const ACTIVE_MINUTES_PER_DAY = MINUTES_PER_DAY - PAUSE_MINUTES_PER_DAY; // 1416

function daysBetweenUTC(a: Date, b: Date) {
  // Normalize to UTC midnight to avoid timezone issues
  const utcA = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const utcB = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((utcA - utcB) / MS_PER_DAY);
}

// Returns an integer month-index where months are numbered so that
// BASE_GAME_YEAR/BASE_GAME_MONTH corresponds to the index computed here.
// Takes server restarts into account: the in-game calendar does not advance
// during restart windows, so effective active time per real day is slightly
// less than 24 hours.
export function gameMonthIndexFor(real: Date) {
  const deltaDays = daysBetweenUTC(real, BASE_REAL_DATE);
  const baseIndex = BASE_GAME_YEAR * 12 + (BASE_GAME_MONTH - 1);
  // Compute effective number of active minutes between the two dates
  // (using whole-day granularity consistent with the rest of the code).
  const activeMinutes = deltaDays * ACTIVE_MINUTES_PER_DAY;
  // Convert active minutes into in-game months (1 month == 24*60 active minutes)
  // Use rounding so mapping is symmetric for past/future dates and preserves
  // the anchor mapping for the base date.
  const monthsDelta = Math.round(activeMinutes / MINUTES_PER_DAY);
  return baseIndex + monthsDelta;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatGameMonth(index: number) {
  const y = Math.floor(index / 12);
  const m = (index % 12 + 12) % 12; // ensure positive modulo
  // Format as "Mon 'Year" e.g. "Oct '4"
  return `${MONTH_NAMES[m]} '${y}`;
}

// Precompute game indices corresponding to the `dates` array (same ordering)
export const gameIndices = dates.map(d => gameMonthIndexFor(new Date(d)));
export const dateStrToGameIndex: Record<string, number> = {};
dates.forEach((d, i) => { dateStrToGameIndex[d] = gameIndices[i]; });

// List of all raw affiliations (exclude falsy/empty and 'Unknown')
export const rawAffiliations = Array.from(new Set(dataList.map(d => d['Affiliation'] as string))).filter(a => !!a && a.trim() !== '' && a !== 'Unknown');

// Alias groups to aggregate related affiliations under canonical labels
export const aliasGroups: string[][] = [
  ['Nightlocke', 'Locke'],
  ['Ayrin', 'Du V\u011bzos', 'Mercenary'],
  ['Stout', 'Aetos'],
  ['Sabr', 'Merrick'],
  ['Rivertal', 'Dayne', 'Windstrom'],
  ['Farring', 'Davila']
];

const normKey = (s: string) => s
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .normalize('NFC')
  .trim()
  .toLowerCase();

const canonicalMap = new Map<string, string>();
export const canonicalMembers: Record<string, string[]> = {};

aliasGroups.forEach(group => {
  const canonical = group[0];
  const nk = normKey(canonical);
  if (!canonicalMap.has(nk)) {
    canonicalMap.set(nk, canonical);
    canonicalMembers[canonical] = canonicalMembers[canonical] || [];
  }
  const canonicalLabel = canonicalMap.get(nk)!;
  group.forEach(a => {
    const na = normKey(a);
    canonicalMap.set(na, canonicalLabel);
    if (!canonicalMembers[canonicalLabel].includes(a)) canonicalMembers[canonicalLabel].push(a);
  });
});

rawAffiliations.forEach(a => {
  const nk = normKey(a);
  if (canonicalMap.has(nk)) {
    const canonicalLabel = canonicalMap.get(nk)!;
    if (!canonicalMembers[canonicalLabel].includes(a)) canonicalMembers[canonicalLabel].push(a);
  } else {
    canonicalMap.set(nk, a);
    canonicalMembers[a] = canonicalMembers[a] || [];
    if (!canonicalMembers[a].includes(a)) canonicalMembers[a].push(a);
  }
});

export const affiliations = Object.keys(canonicalMembers);

// Small helper type used by line-layer and updates
export type AffVal = { date: Date; dateStr: string; count: number };

export const affiliationSeries = affiliations.map(group => ({
  affiliation: group,
  values: dates.map(dateStr => {
    const members = canonicalMembers[group] || [group];
    const count = members.reduce((sum, member) => sum + ((dateGroups[dateStr].byAffiliation[member] || []).length), 0);
    return { date: new Date(dateStr), dateStr, count } as AffVal;
  }),
}));

export const maxCount = d3.max(affiliationSeries.flatMap(s => s.values.map(v => v.count))) || 1;

export const dataForStack = dates.map(dateStr => {
  const obj = { date: new Date(dateStr) } as Record<string, number | Date> & { date: Date };
  affiliations.forEach(group => {
    const members = canonicalMembers[group] || [group];
    obj[group] = members.reduce((s, m) => s + ((dateGroups[dateStr].byAffiliation[m] || []).length), 0);
  });
  return obj as { date: Date } & Record<string, number>;
});

// Prepare social-class series and stacked data
export const socialClasses = Array.from(new Set(Object.values(dateGroups).flatMap(g => Object.keys(g.bySocialClass))));

export const socialSeries = socialClasses.map(cls => ({
  affiliation: cls,
  values: dates.map(dateStr => ({ date: new Date(dateStr), dateStr, count: (dateGroups[dateStr].bySocialClass[cls] || []).length } as AffVal))
}));

export const dataForStackByClass = dates.map(dateStr => {
  const obj = { date: new Date(dateStr) } as Record<string, number | Date> & { date: Date };
  socialClasses.forEach(cls => {
    obj[cls] = (dateGroups[dateStr].bySocialClass[cls] || []).length;
  });
  return obj as { date: Date } & Record<string, number>;
});

console.log('data.ts: prepared', affiliations.length, 'affiliations,', dates.length, 'dates');
