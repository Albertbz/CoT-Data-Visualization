import * as d3 from 'd3';
import { dates, dateObjects, affiliations, canonicalMembers, affiliationSeries, dataForStack, maxCount, dateGroups, AffVal } from './data';

// Create SVG container
const svg = d3.select('#app')
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

// Color scale for canonical affiliations
const color = d3.scaleOrdinal<string, string>()
  .domain(affiliations)
  .range((d3.schemeCategory10 as readonly string[]).slice(0, Math.max(affiliations.length, 1)));

// Chart-type dropdown lives in index.html as <select id="chart-type">
const selectEl = document.getElementById('chart-type') as HTMLSelectElement | null;
if (selectEl && selectEl.options.length === 0) {
  const optStack = document.createElement('option'); optStack.value = 'stacked'; optStack.text = 'Stacked area'; selectEl.add(optStack);
  const optLines = document.createElement('option'); optLines.value = 'lines'; optLines.text = 'Simple lines'; selectEl.add(optLines);
}

// compute stacking order (ensure Wanderer at bottom if present)
const stackKeys = [...affiliations];
const wandererIndex = stackKeys.indexOf('Wanderer');
if (wandererIndex > 0) { stackKeys.splice(wandererIndex, 1); stackKeys.unshift('Wanderer'); }

// Track which affiliations are active (visible)
const activeAffiliations = new Set<string>(affiliations);

// Persistence
const STORAGE_KEY = 'cot_vis_state_v1';
type SavedState = { chartType?: string; activeAffiliations?: string[] };

function saveState() {
  try {
    const state: SavedState = { chartType: (selectEl && selectEl.value) || undefined, activeAffiliations: Array.from(activeAffiliations) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return;
    const parsed = JSON.parse(raw) as SavedState;
    if (parsed.activeAffiliations && Array.isArray(parsed.activeAffiliations)) {
      activeAffiliations.clear(); parsed.activeAffiliations.forEach(a => { if (affiliations.includes(a)) activeAffiliations.add(a); });
    }
    if (parsed.chartType && selectEl) selectEl.value = parsed.chartType;
  } catch { }
}

loadState();

// Axes groups
const xAxisG = svg.append('g').attr('class', 'x-axis').attr('transform', 'translate(0,350)');
const yAxisG = svg.append('g').attr('class', 'y-axis').attr('transform', 'translate(50,0)');
xAxisG.call(d3.axisBottom(xScale));
yAxisG.call(d3.axisLeft(yScale));

// Stack data
type StackDatum = { date: Date } & Record<string, number>;
// dataForStack is imported from data.ts
const stack = d3.stack<StackDatum>().keys(stackKeys as readonly string[]);

// Area generator
const areaGen = d3.area<d3.SeriesPoint<StackDatum>>()
  .x((d: d3.SeriesPoint<StackDatum>) => xScale(d.data.date))
  .y0((d: d3.SeriesPoint<StackDatum>) => yScale(d[0]))
  .y1((d: d3.SeriesPoint<StackDatum>) => yScale(d[1]));

// Draw initial stacked areas
function drawStackedAreas(activeKeys?: string[]) {
  const keys = activeKeys ?? stackKeys;
  const stackLayout = d3.stack<StackDatum>().keys(keys as readonly string[]);
  const stackedData = stackLayout(dataForStack as StackDatum[]);
  // update y domain
  const maxActive = d3.max(dataForStack as StackDatum[], d => keys.reduce((s, k) => s + (d[k] || 0), 0)) || 1;
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
}

// Hover overlay & tooltip
const tooltip = d3.select('#app').append('div').style('position', 'absolute').style('background', 'rgba(0,0,0,0.7)').style('color', 'white').style('padding', '5px').style('border-radius', '5px').style('display', 'none');
const bisectDate = d3.bisector((d: StackDatum) => d.date).left;

svg.append('rect').attr('x', 50).attr('y', 50).attr('width', 700).attr('height', 300).attr('fill', 'transparent').attr('class', 'chart-overlay')
  .on('mousemove', (event) => {
    const [mx] = d3.pointer(event);
    const x0 = xScale.invert(mx);
    let i = bisectDate(dataForStack as StackDatum[], x0 as Date);
    if (i > 0 && i < dataForStack.length) {
      const d1 = (dataForStack as StackDatum[])[i - 1]; const d2 = (dataForStack as StackDatum[])[i];
      i = (Math.abs(d1.date.getTime() - x0.getTime()) <= Math.abs(d2.date.getTime() - x0.getTime())) ? i - 1 : i;
    }
    i = Math.max(0, Math.min((dataForStack as StackDatum[]).length - 1, i));
    const d0 = (dataForStack as StackDatum[])[i]; const dateStr = d0.date.toISOString().split('T')[0];
    const lines = affiliations.map(aff => `${aff}: ${d0[aff] || 0}`).join('<br/>');
    const total = affiliations.reduce((s, a) => s + (d0[a] || 0), 0);
    tooltip.style('display', 'block').html(`Date: ${dateStr}<br/>Total: ${total}<br/>${lines}`);
  })
  .on('mouseout', () => tooltip.style('display', 'none'));

// Draw lines layer
function drawLinesLayer() {
  const lineGen = d3.line<AffVal>().defined(v => (v.count || 0) > 0).x(d => xScale(d.date)).y(d => yScale(d.count));
  const groups = svg.selectAll<SVGGElement, { affiliation: string; values: AffVal[] }>('g.lines-layer').data(affiliationSeries).enter().append('g').attr('class', 'lines-layer').style('display', 'none');
  groups.each(function (d) {
    const g = d3.select(this);
    g.append('path').attr('class', 'aff-line').attr('fill', 'none').attr('stroke', color(d.affiliation)).attr('stroke-width', 1.5).datum(d.values).attr('d', (vals: AffVal[] | undefined) => vals ? lineGen(vals) || '' : '');
    const pts = g.selectAll('.aff-point').data(d.values.filter(v => (v.count || 0) > 0));
    pts.enter().append('circle').attr('class', 'aff-point').attr('cx', v => xScale(v.date)).attr('cy', v => yScale(v.count)).attr('r', 1).attr('fill', color(d.affiliation));
  });
}

drawLinesLayer();

// Update chart central function
function updateChart() {
  const mode = (selectEl && selectEl.value) || 'stacked';
  if (mode === 'stacked') {
    const activeKeys = stackKeys.filter(k => activeAffiliations.has(k));
    drawStackedAreas(activeKeys);
    svg.selectAll('.chart-overlay').style('display', null);
    svg.selectAll('.lines-layer').style('display', 'none');
  } else {
    svg.selectAll('.area').style('display', 'none');
    svg.selectAll('.chart-overlay').style('display', 'none');
    svg.selectAll<SVGGElement, { affiliation: string }>('g.lines-layer').style('display', d => activeAffiliations.has(d.affiliation) ? null : 'none');
    const activeAffs = affiliations.filter(a => activeAffiliations.has(a));
    const maxCountLines = d3.max(activeAffs.map(group => d3.max(dates.map(ds => { const members = canonicalMembers[group] || [group]; return members.reduce((s, m) => s + ((dateGroups[ds].byAffiliation[m] || []).length), 0); })) || 0)) || 1;
    yScale.domain([0, maxCountLines]); xAxisG.call(d3.axisBottom(xScale)); yAxisG.call(d3.axisLeft(yScale));

    const lg = d3.line<AffVal>().defined(v => (v.count || 0) > 0).x(v => xScale(v.date)).y(v => yScale(v.count));
    svg.selectAll<SVGGElement, { affiliation: string; values: AffVal[] }>('g.lines-layer').each(function (d) {
      const g = d3.select(this);
      g.select('path.aff-line').datum(d.values).attr('d', (vals: AffVal[] | undefined) => vals ? lg(vals) || '' : '');
      const pts = g.selectAll<SVGCircleElement, AffVal>('circle.aff-point').data(d.values.filter(v => (v.count || 0) > 0), (v: AffVal) => v.dateStr);
      pts.join(enter => enter.append('circle').attr('class', 'aff-point').attr('cx', v => xScale(v.date)).attr('cy', v => yScale(v.count)).attr('r', 3).attr('fill', () => color(d.affiliation)), update => update.attr('cx', v => xScale(v.date)).attr('cy', v => yScale(v.count)), exit => exit.remove());
    });
  }
}

// Wire select change
selectEl?.addEventListener('change', () => { updateChart(); saveState(); });

// Interactive legend
const legendX = 770; const legendY = 60;
const legend = svg.append('g').attr('class', 'legend');
const legendItems = legend.selectAll<SVGGElement, string>('g.legend-item').data(affiliations).enter().append('g').attr('class', 'legend-item').attr('transform', (d, i) => `translate(${legendX}, ${legendY + i * 18})`).style('cursor', 'pointer').on('click', function (event, aff) { if (activeAffiliations.has(aff)) activeAffiliations.delete(aff); else activeAffiliations.add(aff); updateLegend(); updateChart(); saveState(); });
legendItems.append('rect').attr('width', 12).attr('height', 12).attr('fill', d => color(d));
legendItems.append('text').attr('x', 16).attr('y', 10).attr('fill', 'white').attr('font-size', '12px').text(d => d);
function updateLegend() { legend.selectAll<SVGRectElement, string>('g.legend-item').select('rect').attr('opacity', d => activeAffiliations.has(d) ? 1 : 0.2); legend.selectAll<SVGTextElement, string>('g.legend-item').select('text').attr('opacity', d => activeAffiliations.has(d) ? 1 : 0.4); }
updateLegend();

// Title
svg.append('text').attr('x', 400).attr('y', 30).attr('text-anchor', 'middle').attr('font-size', '16px').attr('font-weight', 'bold').attr('fill', 'white').text('# of Characters Over Time');

// Point tooltips
svg.selectAll('.aff-point').on('mouseover', (event, d) => { const pt = d as unknown as { dateStr: string; count: number; affiliation?: string }; tooltip.style('display', 'block').html(`Date: ${pt.dateStr}<br/>Count: ${pt.count}`); }).on('mousemove', (event) => { tooltip.style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 28) + 'px'); }).on('mouseout', () => tooltip.style('display', 'none'));

// Initial render
drawStackedAreas();
updateChart();

console.log('Visualization created.');