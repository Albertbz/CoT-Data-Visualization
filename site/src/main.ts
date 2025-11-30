import * as d3 from 'd3';
import { dateObjects, dates, affiliations, canonicalMembers, affiliationSeries, dataForStack, maxCount, dateGroups, AffVal, socialClasses, socialSeries, dataForStackByClass } from './data';

// Create SVG container inside the `#visualization` wrapper
const svg = d3.select('#visualization')
  .append('svg')
  .attr('width', 800)
  .attr('height', 400);

// Scales
const xScale = d3.scaleTime()
  .domain([d3.min(dateObjects) as Date, d3.max(dateObjects) as Date])
  .range([50, 750]);

const yScale = d3.scaleLinear()
  .domain([0, maxCount])
  .range([350, 50]);

// Color scale (domain set dynamically per grouping)
const color = d3.scaleOrdinal<string, string>().range((d3.schemeCategory10 as readonly string[]).slice(0, 10));

// Chart-type buttons (in index.html)
const btnStack = document.getElementById('chart-stacked') as HTMLButtonElement | null;
const btnLines = document.getElementById('chart-lines') as HTMLButtonElement | null;
let chartType: 'stacked' | 'lines' = 'stacked';
function setActiveChartButton() {
  if (btnStack) btnStack.classList.toggle('active', chartType === 'stacked');
  if (btnLines) btnLines.classList.toggle('active', chartType === 'lines');
}

// Grouping buttons
const btnGroupAff = document.getElementById('group-aff') as HTMLButtonElement | null;
const btnGroupClass = document.getElementById('group-class') as HTMLButtonElement | null;
let grouping: 'affiliation' | 'social' = 'affiliation';
function setActiveGroupButton() {
  if (btnGroupAff) btnGroupAff.classList.toggle('active', grouping === 'affiliation');
  if (btnGroupClass) btnGroupClass.classList.toggle('active', grouping === 'social');
}

// canonical stable ordering for affiliations and social classes (alphabetical)
const canonicalOrderAffiliations = [...affiliations].sort((a, b) => a.localeCompare(b));
const canonicalOrderSocial = [...socialClasses].sort((a, b) => a.localeCompare(b));

// compute stacking order (ensure Wanderer at bottom if present)
let stackKeys = [...canonicalOrderAffiliations];
const wandererIndex = stackKeys.indexOf('Wanderer');
if (wandererIndex > 0) { stackKeys.splice(wandererIndex, 1); stackKeys.unshift('Wanderer'); }

// Track which keys are active (visible). Maintain separate sets per grouping so selections persist when switching.
const activeByAffiliations = new Set<string>(affiliations);
const activeBySocial = new Set<string>(socialClasses);
let activeAffiliations: Set<string> = activeByAffiliations; // reference to current active set

// Persistence
const STORAGE_KEY = 'cot_vis_state_v1';
type SavedState = { chartType?: string; activeAffiliationsAff?: string[]; activeAffiliationsSocial?: string[]; grouping?: string };
// Whether to include Wanderer-affiliated characters when grouping by social class
let includeWanderers = true;
type SavedStateExt = SavedState & { includeWanderers?: boolean };

function saveState() {
  try {
    const state: SavedStateExt = {
      chartType: chartType || undefined,
      activeAffiliationsAff: Array.from(activeByAffiliations),
      activeAffiliationsSocial: Array.from(activeBySocial),
      grouping,
      includeWanderers
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return;
    const parsed = JSON.parse(raw) as SavedStateExt;
    if (parsed.activeAffiliationsAff && Array.isArray(parsed.activeAffiliationsAff)) {
      activeByAffiliations.clear(); parsed.activeAffiliationsAff.forEach(a => { if (affiliations.includes(a)) activeByAffiliations.add(a); });
    }
    if (parsed.activeAffiliationsSocial && Array.isArray(parsed.activeAffiliationsSocial)) {
      activeBySocial.clear(); parsed.activeAffiliationsSocial.forEach(a => { if (socialClasses.includes(a)) activeBySocial.add(a); });
    }
    if (parsed.chartType) chartType = parsed.chartType as 'stacked' | 'lines';
    if (parsed.grouping) grouping = parsed.grouping === 'social' ? 'social' : 'affiliation';
    if (typeof parsed.includeWanderers === 'boolean') includeWanderers = parsed.includeWanderers;
    // set current active reference according to grouping
    activeAffiliations = grouping === 'social' ? activeBySocial : activeByAffiliations;
  } catch { }
}

loadState();
setActiveChartButton();
setActiveGroupButton();

// Axes groups
const xAxisG = svg.append('g').attr('class', 'x-axis').attr('transform', 'translate(0,350)');
const yAxisG = svg.append('g').attr('class', 'y-axis').attr('transform', 'translate(50,0)');
xAxisG.call(d3.axisBottom(xScale));
yAxisG.call(d3.axisLeft(yScale));

// Axis labels
xAxisG.append('text')
  .attr('class', 'x-axis-label')
  .attr('x', 400)
  .attr('y', 45)
  .attr('fill', 'white')
  .attr('text-anchor', 'middle')
  .attr('font-size', '12px')
  .text('Date');

yAxisG.append('text')
  .attr('class', 'y-axis-label')
  .attr('transform', 'rotate(-90)')
  .attr('x', -200)
  .attr('y', -35)
  .attr('fill', 'white')
  .attr('text-anchor', 'middle')
  .attr('font-size', '12px')
  .text('# of Characters');

// Stack data
type StackDatum = { date: Date } & Record<string, number>;
// dataForStack is imported from data.ts
// stack layout will be created on demand per-active-keys (see drawStackedAreas)

// Area generator
const areaGen = d3.area<d3.SeriesPoint<StackDatum>>()
  .x((d: d3.SeriesPoint<StackDatum>) => xScale(d.data.date))
  .y0((d: d3.SeriesPoint<StackDatum>) => yScale(d[0]))
  .y1((d: d3.SeriesPoint<StackDatum>) => yScale(d[1]));

// Draw initial stacked areas
function drawStackedAreas(activeKeys?: string[]) {
  const keys = (activeKeys && activeKeys.length) ? activeKeys : stackKeys;
  const stackLayout = d3.stack<StackDatum>().keys(keys as readonly string[]);
  let source: StackDatum[];
  if (grouping === 'social') {
    if (includeWanderers) {
      source = dataForStackByClass as StackDatum[];
    } else {
      source = dates.map(dateStr => {
        const obj: { date: Date; [k: string]: number | Date } = { date: new Date(dateStr) };
        canonicalOrderSocial.forEach(cls => { obj[cls] = socialCountFor(dateStr, cls); });
        return obj as StackDatum;
      });
    }
  } else {
    source = dataForStack as StackDatum[];
  }
  const stackedData = stackLayout(source as StackDatum[]);
  // update y domain
  const maxActive = d3.max(source as StackDatum[], d => keys.reduce((s, k) => s + (d[k] || 0), 0)) || 1;
  yScale.domain([0, maxActive]);
  xAxisG.call(d3.axisBottom(xScale)); yAxisG.call(d3.axisLeft(yScale));

  svg.selectAll('.area').remove();
  svg.selectAll('.area')
    .data(stackedData)
    .enter()
    .append('path')
    .attr('class', 'area')
    .attr('d', d => areaGen(d) || '')
    .attr('fill', (d: d3.Series<StackDatum, string>) => color(d.key))
    .attr('stroke', 'none')
    .attr('opacity', 0.9);

  // Add hover handlers to show affiliation + social-class breakdown for the hovered date
  svg.selectAll<SVGPathElement, d3.Series<StackDatum, string>>('.area')
    .on('mousemove', function (event, series) {
      // pointer relative to svg
      const [sx] = d3.pointer(event, svg.node() as SVGElement);
      const x0 = xScale.invert(sx as number);
      let i = bisectDate(source as StackDatum[], x0 as Date);
      if (i > 0 && i < (source as StackDatum[]).length) {
        const d1 = (source as StackDatum[])[i - 1]; const d2 = (source as StackDatum[])[i];
        i = (Math.abs(d1.date.getTime() - x0.getTime()) <= Math.abs(d2.date.getTime() - x0.getTime())) ? i - 1 : i;
      }
      i = Math.max(0, Math.min((source as StackDatum[]).length - 1, i));
      const row = (source as StackDatum[])[i];
      const dateStr = row.date.toISOString().split('T')[0];
      const key = series.key;
      if (grouping === 'social') {
        // For social-class grouping, show total + per-affiliation breakdown for this social class on this date
        const breakdown = affiliationCountsForSocial(dateStr, key);
        const affLines = breakdown.list.length ? breakdown.list.map(x => `${x.affiliation}: ${x.count}`).join('<br/>') : 'None';
        tooltip.style('display', 'block').html(`Date: ${dateStr}<br/><br/><strong>${key}</strong><br/>Total: ${breakdown.total}<br/>${affLines}`);
      } else {
        // For affiliation grouping, keep the detailed canonical-membership breakdown
        const aff = key;
        const members = canonicalMembers[aff] || [aff];
        const classes = { commoner: 0, notable: 0, noble: 0, ruler: 0 };
        members.forEach(m => {
          const entries = (dateGroups[dateStr].byAffiliation[m] || []);
          entries.forEach(e => {
            const sc = String(e['Social Class'] || '').trim().toLowerCase();
            if (sc === 'commoner') classes.commoner += 1;
            else if (sc === 'notable') classes.notable += 1;
            else if (sc === 'noble') classes.noble += 1;
            else if (sc === 'ruler') classes.ruler += 1;
          });
        });

        const totalForAff = classes.commoner + classes.notable + classes.noble + classes.ruler;

        tooltip.style('display', 'block').html(`
          Date: ${dateStr}<br/>
          <br/>
          <strong>${aff}</strong><br/>
          Total: ${totalForAff}<br/>
          Commoners: ${classes.commoner}<br/>
          Notables: ${classes.notable}<br/>
          Nobles: ${classes.noble}<br/>
          Rulers: ${classes.ruler}
        `);
      }
      // position tooltip near cursor
      tooltip.style('left', (event.pageX + 12) + 'px').style('top', (event.pageY - 28) + 'px');
    })
    .on('mouseout', () => tooltip.style('display', 'none'));
}

// Hover overlay & tooltip (placed inside `#visualization` so it's scoped to the chart container)
const tooltip = d3.select('#visualization').append('div').style('position', 'absolute').style('background', 'rgba(0,0,0,0.7)').style('color', 'white').style('padding', '5px').style('border-radius', '5px').style('display', 'none');
const bisectDate = d3.bisector((d: StackDatum) => d.date).left;

function updateStackKeys() {
  if (grouping === 'social') {
    stackKeys = [...canonicalOrderSocial];
  } else {
    stackKeys = [...canonicalOrderAffiliations];
    const wi = stackKeys.indexOf('Wanderer');
    if (wi > 0) { stackKeys.splice(wi, 1); stackKeys.unshift('Wanderer'); }
  }
}
updateStackKeys();

// Helper: count social-class members for a date, optionally excluding wanderers
function socialCountFor(dateStr: string, cls: string) {
  const entries = (dateGroups[dateStr].bySocialClass[cls] || []);
  if (includeWanderers) return entries.length;
  const wandererMembers = canonicalMembers['Wanderer'] || [];
  return entries.filter(e => !wandererMembers.includes(e['Affiliation'] || '')).length;
}

// Helper: compute affiliation breakdown for a social class on a given date
function affiliationCountsForSocial(dateStr: string, cls: string) {
  const entries = (dateGroups[dateStr].bySocialClass[cls] || []).slice();
  const countsByCanonical: Record<string, number> = {};
  // Build a reverse-lookup from member name -> canonical label using canonicalMembers
  const memberToCanonical: Record<string, string> = {};
  Object.keys(canonicalMembers).forEach(canon => {
    (canonicalMembers[canon] || []).forEach(m => { memberToCanonical[m] = canon; });
  });

  entries.forEach(e => {
    const rawAff = (e['Affiliation'] || 'Unknown');
    const canonical = memberToCanonical[rawAff] || rawAff;
    if (!includeWanderers && canonical === 'Wanderer') return;
    countsByCanonical[canonical] = (countsByCanonical[canonical] || 0) + 1;
  });

  // Produce list ordered by canonicalOrderAffiliations for stable ordering
  const list = canonicalOrderAffiliations.filter(a => (countsByCanonical[a] || 0) > 0).map(a => ({ affiliation: a, count: countsByCanonical[a] }));
  const total = list.reduce((s, x) => s + x.count, 0);
  return { total, list } as { total: number; list: { affiliation: string; count: number }[] };
}

// Render a small toggle under the legend when grouping === 'social'
// Replace earlier SVG-based toggle with an HTML button styled like other controls.
function updateWandererButton() {
  const container = document.getElementById('visualization');
  if (!container) return;
  let btn = document.getElementById('btn-wanderers') as HTMLButtonElement | null;
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'btn-wanderers';
    btn.className = 'chart-btn';
    btn.addEventListener('click', () => {
      includeWanderers = !includeWanderers;
      btn!.classList.toggle('active', includeWanderers);
      saveState();
      updateChart();
    });
    container.appendChild(btn);
  }
  // Show the button only for social grouping
  btn.style.display = grouping === 'social' ? 'inline-block' : 'none';
  // Label remains constant; active class indicates current include/exclude state
  btn.textContent = 'Include Wanderers';
  btn.classList.toggle('active', includeWanderers);
}

// Build or rebuild legend according to current grouping
const legendX = 770; const legendY = 60;
function rebuildLegend() {
  svg.selectAll('g.legend').remove();
  const keys = grouping === 'social' ? canonicalOrderSocial : canonicalOrderAffiliations;
  // Switch the active reference and preserve previous selections for each grouping
  if (grouping === 'social') {
    activeAffiliations = activeBySocial;
  } else {
    activeAffiliations = activeByAffiliations;
  }
  // Respect the saved/previous selections for this grouping (do not auto-enable all keys).
  // If the user intentionally has no active keys, keep that state so the legend shows correctly.
  color.domain(keys as readonly string[]);
  const legend = svg.append('g').attr('class', 'legend');
  const legendItems = legend.selectAll<SVGGElement, string>('g.legend-item').data(keys).enter().append('g').attr('class', 'legend-item').attr('transform', (d, i) => `translate(${legendX}, ${legendY + i * 18})`).style('cursor', 'pointer').on('click', function (event, key) { if (activeAffiliations.has(key)) activeAffiliations.delete(key); else activeAffiliations.add(key); updateLegend(); updateChart(); saveState(); });
  legendItems.append('rect').attr('width', 12).attr('height', 12).attr('fill', d => color(d));
  legendItems.append('text').attr('x', 16).attr('y', 10).attr('fill', 'white').attr('font-size', '12px').text(d => d);
  // Set initial legend appearance to match the active set
  updateLegend();
  // Update HTML wanderer button visibility/state (shown for social grouping)
  updateWandererButton();
}
function updateLegend() { svg.selectAll<SVGRectElement, string>('g.legend-item').select('rect').attr('opacity', d => activeAffiliations.has(d) ? 1 : 0.2); svg.selectAll<SVGTextElement, string>('g.legend-item').select('text').attr('opacity', d => activeAffiliations.has(d) ? 1 : 0.4); }

rebuildLegend();

// Wire chart & grouping buttons
btnStack?.addEventListener('click', () => { chartType = 'stacked'; setActiveChartButton(); updateChart(); saveState(); });
btnLines?.addEventListener('click', () => { chartType = 'lines'; setActiveChartButton(); updateChart(); saveState(); });
btnGroupAff?.addEventListener('click', () => { grouping = 'affiliation'; setActiveGroupButton(); updateStackKeys(); rebuildLegend(); updateChart(); saveState(); });
btnGroupClass?.addEventListener('click', () => { grouping = 'social'; setActiveGroupButton(); updateStackKeys(); rebuildLegend(); updateChart(); saveState(); });

svg.append('rect').attr('x', 50).attr('y', 50).attr('width', 700).attr('height', 300).attr('fill', 'transparent').attr('class', 'chart-overlay')
  .on('mousemove', (event) => {
    const [mx] = d3.pointer(event);
    const x0 = xScale.invert(mx);
    let source: StackDatum[];
    if (grouping === 'social') {
      if (includeWanderers) source = dataForStackByClass as StackDatum[];
      else source = dates.map(dateStr => {
        const obj: { date: Date; [k: string]: number | Date } = { date: new Date(dateStr) };
        canonicalOrderSocial.forEach(cls => { obj[cls] = socialCountFor(dateStr, cls); });
        return obj as StackDatum;
      });
    } else {
      source = dataForStack as StackDatum[];
    }
    const keys = grouping === 'social' ? canonicalOrderSocial : canonicalOrderAffiliations;
    let i = bisectDate(source as StackDatum[], x0 as Date);
    if (i > 0 && i < (source as StackDatum[]).length) {
      const d1 = (source as StackDatum[])[i - 1]; const d2 = (source as StackDatum[])[i];
      i = (Math.abs(d1.date.getTime() - x0.getTime()) <= Math.abs(d2.date.getTime() - x0.getTime())) ? i - 1 : i;
    }
    i = Math.max(0, Math.min((source as StackDatum[]).length - 1, i));
    const d0 = (source as StackDatum[])[i]; const dateStr = d0.date.toISOString().split('T')[0];
    const visible = keys.filter(k => (d0[k] || 0) > 0);
    const lines = visible.length ? visible.map(k => `${k}: ${d0[k] || 0}`).join('<br/>') : 'None';
    const total = keys.reduce((s, k) => s + (d0[k] || 0), 0);
    tooltip.style('display', 'block').html(`Date: ${dateStr}<br/><br/>Total: ${total}<br/>${lines}`);
    tooltip.style('left', (event.pageX + 12) + 'px').style('top', (event.pageY - 28) + 'px');
  })
  .on('mouseout', () => tooltip.style('display', 'none'));


// Draw lines for a given series (either affiliationSeries or socialSeries)
function drawLinesForSeries(seriesArray: { affiliation: string; values: AffVal[] }[]) {
  // remove existing groups then create new ones
  svg.selectAll('g.lines-layer').remove();
  const lineGen = d3.line<AffVal>().defined(v => (v.count || 0) > 0).x(d => xScale(d.date)).y(d => yScale(d.count));
  const groups = svg.selectAll<SVGGElement, { affiliation: string; values: AffVal[] }>('g.lines-layer').data(seriesArray).enter().append('g').attr('class', 'lines-layer').style('display', 'none');
  groups.each(function (d) {
    const g = d3.select(this);
    const groupAff = (d as { affiliation: string }).affiliation;
    g.append('path').attr('class', 'aff-line').attr('fill', 'none').attr('stroke', color((d as { affiliation: string }).affiliation)).attr('stroke-width', 1.5).datum(d.values).attr('d', (vals: AffVal[] | undefined) => vals ? lineGen(vals) || '' : '');
    const pts = g.selectAll('.aff-point').data(d.values.filter(v => (v.count || 0) > 0));
    pts.enter().append('circle').attr('class', 'aff-point').attr('cx', v => xScale(v.date)).attr('cy', v => yScale(v.count)).attr('r', 1).attr('fill', color((d as { affiliation: string }).affiliation));
    const hit = g.selectAll('.aff-hit').data(d.values.filter(v => (v.count || 0) > 0));
    hit.enter().append('circle').attr('class', 'aff-hit').attr('cx', v => xScale(v.date)).attr('cy', v => yScale(v.count)).attr('r', 10).attr('fill', 'transparent').style('pointer-events', 'all').attr('data-affiliation', groupAff);
  });
}

function attachHitHandlers() {
  svg.selectAll('.aff-hit')
    .on('mouseover', (event, d) => {
      const pt = d as AffVal;
      const el = event.currentTarget as HTMLElement;
      const key = el.getAttribute('data-affiliation') || '';
      const dateStr = (pt && pt.dateStr) || '';
      if (grouping === 'social') {
        const breakdown = affiliationCountsForSocial(dateStr, key);
        const affLines = breakdown.list.length ? breakdown.list.map(x => `${x.affiliation}: ${x.count}`).join('<br/>') : 'None';
        tooltip.style('display', 'block').html(`Date: ${dateStr}<br/><br/><strong>${key}</strong><br/>Total: ${breakdown.total}<br/>${affLines}`);
      } else {
        const members = canonicalMembers[key] || [key];
        const classes = { commoner: 0, notable: 0, noble: 0, ruler: 0 };
        members.forEach(m => {
          const entries = (dateGroups[dateStr].byAffiliation[m] || []);
          entries.forEach(e => {
            const sc = String(e['Social Class'] || '').trim().toLowerCase();
            if (sc === 'commoner') classes.commoner += 1;
            else if (sc === 'notable') classes.notable += 1;
            else if (sc === 'noble') classes.noble += 1;
            else if (sc === 'ruler') classes.ruler += 1;
          });
        });
        const totalForAff = classes.commoner + classes.notable + classes.noble + classes.ruler;
        tooltip.style('display', 'block').html(`Date: ${dateStr}<br/><br/><strong>${key}</strong><br/>Total: ${totalForAff}<br/>Commoners: ${classes.commoner}<br/>Notables: ${classes.notable}<br/>Nobles: ${classes.noble}<br/>Rulers: ${classes.ruler}`);
      }
    })
    .on('mousemove', (event) => tooltip.style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 28) + 'px'))
    .on('mouseout', () => tooltip.style('display', 'none'));
}

// Update chart central function
function updateChart() {
  const mode = chartType;
  const currentKeys = grouping === 'social' ? canonicalOrderSocial : canonicalOrderAffiliations;
  color.domain(currentKeys as readonly string[]);

  if (mode === 'stacked') {
    const activeKeys = stackKeys.filter(k => activeAffiliations.has(k));
    drawStackedAreas(activeKeys);
    svg.selectAll('.chart-overlay').style('display', null);
    // remove any existing line groups
    svg.selectAll('g.lines-layer').remove();
  } else {
    svg.selectAll('.area').style('display', 'none');
    svg.selectAll('.chart-overlay').style('display', 'none');
    // ensure we have line groups for the current grouping
    let seriesToUse: { affiliation: string; values: AffVal[] }[];
    if (grouping === 'social') {
      if (includeWanderers) seriesToUse = socialSeries;
      else {
        seriesToUse = canonicalOrderSocial.map(cls => ({ affiliation: cls, values: dates.map(dateStr => ({ date: new Date(dateStr), dateStr, count: socialCountFor(dateStr, cls) } as AffVal)) }));
      }
    } else {
      seriesToUse = affiliationSeries;
    }
    drawLinesForSeries(seriesToUse);
    svg.selectAll<SVGGElement, { affiliation: string }>('g.lines-layer').style('display', d => activeAffiliations.has(d.affiliation) ? null : 'none');

    const activeSeries = seriesToUse.filter(s => activeAffiliations.has(s.affiliation));
    const maxCountLines = d3.max(activeSeries.flatMap(s => s.values.map(v => v.count))) || 1;
    yScale.domain([0, maxCountLines]); xAxisG.call(d3.axisBottom(xScale)); yAxisG.call(d3.axisLeft(yScale));

    const lg = d3.line<AffVal>().defined(v => (v.count || 0) > 0).x(v => xScale(v.date)).y(v => yScale(v.count));
    svg.selectAll<SVGGElement, { affiliation: string; values: AffVal[] }>('g.lines-layer').each(function (d) {
      const g = d3.select(this);
      g.select('path.aff-line').datum(d.values).attr('d', (vals: AffVal[] | undefined) => vals ? lg(vals) || '' : '');
      const pts = g.selectAll<SVGCircleElement, AffVal>('circle.aff-point').data(d.values.filter(v => (v.count || 0) > 0), (v: AffVal) => v.dateStr);
      pts.join(
        enter => enter.append('circle').attr('class', 'aff-point').attr('cx', v => xScale(v.date)).attr('cy', v => yScale(v.count)).attr('r', 3).attr('fill', () => color((d as { affiliation: string }).affiliation)),
        update => update.attr('cx', v => xScale(v.date)).attr('cy', v => yScale(v.count)),
        exit => exit.remove()
      );
      const groupAffUpdate = (d as { affiliation: string }).affiliation;
      const hits = g.selectAll<SVGCircleElement, AffVal>('circle.aff-hit').data(d.values.filter(v => (v.count || 0) > 0), (v: AffVal) => v.dateStr);
      hits.join(
        enter => enter.append('circle').attr('class', 'aff-hit').attr('cx', v => xScale(v.date)).attr('cy', v => yScale(v.count)).attr('r', 10).attr('fill', 'transparent').style('pointer-events', 'all').attr('data-affiliation', groupAffUpdate),
        update => update.attr('cx', v => xScale(v.date)).attr('cy', v => yScale(v.count)).attr('data-affiliation', groupAffUpdate),
        exit => exit.remove()
      );
    });
    attachHitHandlers();
  }
}

// Nearest-point detection for line mode: show tooltip for the nearest visible point
// This helps when points overlap or are hard to hit directly.
svg.on('mousemove.nearest', (event) => {
  if (chartType !== 'lines') return;
  const [mx, my] = d3.pointer(event, svg.node() as SVGElement);
  const hitRadius = 12; // px
  let best: { series?: string; val?: AffVal; dist2: number } = { dist2: Infinity };

  let seriesToUse: { affiliation: string; values: AffVal[] }[] = [];
  if (grouping === 'social') {
    seriesToUse = includeWanderers ? socialSeries : canonicalOrderSocial.map(cls => ({ affiliation: cls, values: dates.map(dateStr => ({ date: new Date(dateStr), dateStr, count: socialCountFor(dateStr, cls) } as AffVal)) }));
  } else {
    seriesToUse = affiliationSeries;
  }
  seriesToUse.forEach(s => {
    if (!activeAffiliations.has(s.affiliation)) return;
    s.values.forEach(v => {
      if (!v || (v.count || 0) <= 0) return;
      const dx = xScale(v.date) - mx;
      const dy = yScale(v.count) - my;
      const d2 = dx * dx + dy * dy;
      if (d2 < best.dist2) best = { series: s.affiliation, val: v, dist2: d2 };
    });
  });

  if (best.val && Math.sqrt(best.dist2) <= hitRadius) {
    const aff = best.series || '';
    const dateStr = best.val!.dateStr;
    if (grouping === 'social') {
      const breakdown = affiliationCountsForSocial(dateStr, aff);
      const affLines = breakdown.list.length ? breakdown.list.map(x => `${x.affiliation}: ${x.count}`).join('<br/>') : 'None';
      tooltip.style('display', 'block').html(`Date: ${dateStr}<br/><br/><strong>${aff}</strong><br/>Total: ${breakdown.total}<br/>${affLines}`);
    } else {
      const members = canonicalMembers[aff] || [aff];
      const classes = { commoner: 0, notable: 0, noble: 0, ruler: 0 };
      members.forEach(m => {
        const entries = (dateGroups[dateStr].byAffiliation[m] || []);
        entries.forEach(e => {
          const sc = String(e['Social Class'] || '').trim().toLowerCase();
          if (sc === 'commoner') classes.commoner += 1;
          else if (sc === 'notable') classes.notable += 1;
          else if (sc === 'noble') classes.noble += 1;
          else if (sc === 'ruler') classes.ruler += 1;
        });
      });
      const totalForAff = classes.commoner + classes.notable + classes.noble + classes.ruler;
      tooltip.style('display', 'block').html(`
        Date: ${dateStr}<br/>
        <br/>
        <strong>${aff}</strong><br/>
        Total: ${totalForAff}<br/>
        Commoners: ${classes.commoner}<br/>
        Notables: ${classes.notable}<br/>
        Nobles: ${classes.noble}<br/>
        Rulers: ${classes.ruler}
      `);
    }
    tooltip.style('left', (event.pageX + 12) + 'px').style('top', (event.pageY - 28) + 'px');
  } else {
    tooltip.style('display', 'none');
  }
});

// Initial render
drawStackedAreas();
updateChart();

console.log('Visualization created.');