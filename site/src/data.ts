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

// List of all raw affiliations (exclude falsy/empty and 'Unknown')
export const rawAffiliations = Array.from(new Set(dataList.map(d => d['Affiliation'] as string))).filter(a => !!a && a.trim() !== '' && a !== 'Unknown');

// Alias groups to aggregate related affiliations under canonical labels
export const aliasGroups: string[][] = [
  ['Nightlocke', 'Locke'],
  ['Ayrin', 'Du V\u011bzos'],
  ['Stout', 'Aetos'],
  ['Sabr', 'Merrick'],
  ['Rivertal', 'Dayne', 'Windstrom'],
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
