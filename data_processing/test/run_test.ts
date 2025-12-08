// @ts-nocheck
import { readFileSync } from 'fs';
import { mergeAgeAndHouseData, processCharacterTimelines } from '../dataprocessing';

function loadJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function normalize(s?: string) {
  return (s || '').toString().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function firstName(s?: string) {
  return normalize(s).split(' ')[0] || '';
}

function levenshtein(a: string, b: string) {
  const A = a.split('');
  const B = b.split('');
  const m = A.length;
  const n = B.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

type AgeEntry = { [k: string]: any };
type HouseEntry = { [k: string]: any };

function scoreMatch(age: AgeEntry, house: HouseEntry) {
  let score = 0;
  const ageName = normalize(age['Character Name']);
  const houseName = normalize(house['Character Name']);
  const vsA = (age['VS Username'] || '').toString().toLowerCase();
  const vsH = (house['VS Username'] || '').toString().toLowerCase();
  const dcA = (age['Discord Username'] || '').toString().toLowerCase();
  const dcH = (house['Discord Username'] || '').toString().toLowerCase();

  if (vsA && vsH && vsA === vsH) score += 100;
  if (dcA && dcH && dcA === dcH) score += 90;
  if (ageName && houseName && ageName === houseName) score += 80;

  const fnA = firstName(age['Character Name']);
  const fnH = firstName(house['Character Name']);
  if (fnA && fnH && fnA === fnH) score += 30;

  if (age['Year of Maturity'] && house['Year of Maturity'] && Number(age['Year of Maturity']) === Number(house['Year of Maturity'])) score += 50;

  if (ageName && houseName) {
    const dist = levenshtein(ageName, houseName);
    const maxLen = Math.max(ageName.length, houseName.length) || 1;
    const rel = 1 - dist / maxLen; // similarity 0..1
    score += Math.round(rel * 40);
  }

  return score;
}

async function run() {
  const agePath = 'parsed_data/age/June 1.json';
  const housePath = 'parsed_data/house/June 1.json';

  console.log('Loading:', agePath, housePath);
  const ageData = loadJson(agePath);
  const houseData = loadJson(housePath);

  console.log('Age entries:', ageData.length, 'House entries:', houseData.length);

  // Run merge
  const merged = mergeAgeAndHouseData(ageData, houseData);
  console.log('Merged entries:', merged.length);

  // Add Date to merged entries to run timeline processing (use file's date)
  const dateStr = '2025-06-01';
  const mergedWithDate = merged.map(m => ({ ...m, Date: dateStr }));

  const timelines = processCharacterTimelines(mergedWithDate as any);
  console.log('Processed characters:', timelines.length);

  console.log('\nFirst 10 processed characters:');
  timelines.slice(0, 10).forEach((t, i) => {
    console.log(i + 1, t.name, '->', t.finalName, 'aff=', t.finalAffiliation, 'start=', t.startYear, 'end=', t.endYear, 'segments=', t.segments.length);
  });

  // Show fuzzy matches: for each age entry, find best house candidate and print if names differ but score >= threshold
  const threshold = 60;
  console.log('\nFuzzy matches (score >= ' + threshold + ' and names differ):');
  for (const a of ageData) {
    let best = -Infinity;
    let bestH: HouseEntry | null = null;
    for (const h of houseData) {
      const s = scoreMatch(a, h);
      if (s > best) {
        best = s;
        bestH = h;
      }
    }
    if (best >= threshold) {
      const na = normalize(a['Character Name']);
      const nh = normalize(bestH['Character Name']);
      if (na !== nh) {
        console.log('Age:', a['Character Name'], 'House:', bestH['Character Name'], 'score=', best);
      }
    }
  }
}

run().catch(err => console.error(err));
