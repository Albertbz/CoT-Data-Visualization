import * as d3 from 'd3';
import {
  dates,
  affiliations,
  canonicalMembers,
  affiliationSeries,
  dataForStack,
  maxCount,
  dateGroups,
  AffVal,
  socialClasses,
  socialSeries,
  dataForStackByClass,
  gameMonthIndexFor,
  formatGameMonth,
  gameIndices
} from './data';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PLOT_LEFT,
  PLOT_TOP,
  PLOT_WIDTH,
  PLOT_HEIGHT,
  PLOT_RIGHT,
  PLOT_BOTTOM
} from './canvassetup';
import { canonicalOrderAffiliations, canonicalOrderSocial, SOCIAL_PREFERRED_LEGEND_ORDER, LEGEND_IMAGE_PATHS, colorOf as sharedColorOf, backdropOf as sharedBackdropOf } from './shared';

// Create SVG container inside the `#overview-chart` wrapper
export function initOverview() {
  const svg = d3.select('#overview-chart')
    .append('svg')
    .attr('width', CANVAS_WIDTH)
    .attr('height', CANVAS_HEIGHT);

  try {
    document.documentElement.style.setProperty('--canvas-height', `${CANVAS_HEIGHT + 20}px`);
  } catch { }

  // Scales
  const xScale = d3.scaleLinear()
    .domain([d3.min(gameIndices) as number, d3.max(gameIndices) as number])
    .range([PLOT_LEFT, PLOT_RIGHT]);

  const yScale = d3.scaleLinear()
    .domain([0, maxCount])
    .range([PLOT_BOTTOM, PLOT_TOP]);

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

  // compute stacking order (ensure Wanderer is drawn last so it appears on top)
  let stackKeys = [...canonicalOrderAffiliations];
  const wandererIndex = stackKeys.indexOf('Wanderer');
  if (wandererIndex > 0) { stackKeys.splice(wandererIndex, 1); stackKeys.push('Wanderer'); }

  // Track which keys are active (visible). Maintain separate sets per grouping so selections persist when switching.
  const activeByAffiliations = new Set<string>(affiliations);
  const activeBySocial = new Set<string>(socialClasses);
  let activeAffiliations: Set<string> = activeByAffiliations; // reference to current active set

  // Persistence
  const STORAGE_KEY = 'cot_vis_state_v1';
  type SavedState = { chartType?: string; activeAffiliationsAff?: string[]; activeAffiliationsSocial?: string[]; grouping?: string };
  // Whether to include Wanderer-affiliated characters when grouping by social class
  let includeWanderers = true;
  type SavedStateExt = SavedState & { includeWanderers?: boolean; orderMethod?: string };

  // Ordering heuristics available for stacking. Default: 'variance'.
  type OrderMethod = 'variance' | 'coefvar' | 'mean-weighted' | 'alphabetical' | 'deriv-std';
  let orderMethod: OrderMethod = 'variance';

  const ORDER_METHODS: { id: OrderMethod; label: string }[] = [
    { id: 'variance', label: 'Variance' },
    { id: 'coefvar', label: 'CoefVar' },
    { id: 'mean-weighted', label: 'Mean×Var' },
    { id: 'deriv-std', label: 'Deriv SD' },
    { id: 'alphabetical', label: 'Alpha' }
  ];

  function saveState() {
    try {
      const state: SavedStateExt = {
        chartType: chartType || undefined,
        activeAffiliationsAff: Array.from(activeByAffiliations),
        activeAffiliationsSocial: Array.from(activeBySocial),
        grouping,
        includeWanderers,
        orderMethod
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
      if (parsed.orderMethod && typeof parsed.orderMethod === 'string') {
        if ((['variance', 'coefvar', 'mean-weighted', 'alphabetical', 'deriv-std'] as string[]).includes(parsed.orderMethod)) {
          orderMethod = parsed.orderMethod as OrderMethod;
        }
      }
      // set current active reference according to grouping
      activeAffiliations = grouping === 'social' ? activeBySocial : activeByAffiliations;
    } catch { }
  }

  loadState();
  setActiveChartButton();
  setActiveGroupButton();

  // Build ordering control UI (bottom-left buttons)
  function updateOrderControls() {
    const container = document.getElementById('overview-chart');
    if (!container) return;
    let ctrl = document.getElementById('order-control') as HTMLDivElement | null;
    if (!ctrl && grouping === 'affiliation' && chartType === 'stacked') {
      const created = document.createElement('div');
      created.id = 'order-control';
      created.className = 'order-control';

      const selBtn = document.createElement('button');
      selBtn.id = 'order-selected';
      selBtn.className = 'chart-btn';
      const findLabel = ORDER_METHODS.find(x => x.id === orderMethod)?.label || ORDER_METHODS[0].label;
      selBtn.textContent = findLabel;
      selBtn.title = 'Current ordering';
      selBtn.classList.toggle('active', true);

      const expandBtn = document.createElement('button');
      expandBtn.id = 'order-expand';
      expandBtn.className = 'chart-btn';
      expandBtn.textContent = '▸';
      expandBtn.title = 'Show ordering options';

      const hiddenWrap = document.createElement('div');
      hiddenWrap.id = 'order-hidden-wrap';
      hiddenWrap.style.display = 'none';
      hiddenWrap.style.gap = '6px';
      hiddenWrap.style.alignItems = 'center';

      const collapseHidden = () => {
        hiddenWrap.style.display = 'none';
        try { created.insertBefore(expandBtn, hiddenWrap); } catch { }
        expandBtn.textContent = '▸';
        expandBtn.style.marginLeft = '';
        selBtn.style.display = 'inline-block';
        selBtn.classList.add('active');
        selBtn.textContent = ORDER_METHODS.find(x => x.id === orderMethod)?.label || '';
        hiddenWrap.querySelectorAll('button').forEach((b: Element) => {
          const btn = b as HTMLButtonElement;
          if (btn.dataset && btn.dataset['method']) btn.classList.toggle('active', btn.dataset['method'] === orderMethod);
        });
      };

      const expandHidden = () => {
        hiddenWrap.style.display = 'flex';
        selBtn.style.display = 'none';
        try { hiddenWrap.appendChild(expandBtn); expandBtn.style.marginLeft = 'auto'; } catch { }
        expandBtn.textContent = '◂';
        hiddenWrap.querySelectorAll('button').forEach((b: Element) => {
          const btn = b as HTMLButtonElement;
          if (btn.dataset && btn.dataset['method']) btn.classList.toggle('active', btn.dataset['method'] === orderMethod);
        });
      };

      ORDER_METHODS.forEach(m => {
        const btn = document.createElement('button');
        btn.className = 'chart-btn';
        btn.textContent = m.label;
        btn.dataset['method'] = m.id;
        if (m.id === orderMethod) btn.classList.add('active');
        btn.addEventListener('click', () => {
          orderMethod = m.id;
          hiddenWrap.querySelectorAll('button').forEach((b: Element) => b.classList.remove('active'));
          btn.classList.add('active');
          saveState();
          updateStackKeys();
          updateChart();
          collapseHidden();
        });
        hiddenWrap.appendChild(btn);
      });

      expandBtn.addEventListener('click', () => {
        if (hiddenWrap.style.display === 'none' || hiddenWrap.style.display === '') expandHidden();
        else collapseHidden();
      });

      selBtn.addEventListener('click', () => {
        if (hiddenWrap.style.display === 'none' || hiddenWrap.style.display === '') expandHidden();
        else collapseHidden();
      });

      created.appendChild(selBtn);
      created.appendChild(expandBtn);
      created.appendChild(hiddenWrap);
      container.appendChild(created);
      ctrl = created;
    }
    if (ctrl) {
      ctrl.style.display = (grouping === 'affiliation' && chartType === 'stacked') ? 'inline-block' : 'none';
      const hw = document.getElementById('order-hidden-wrap') as HTMLDivElement | null;
      const sel = document.getElementById('order-selected') as HTMLButtonElement | null;
      const ex = document.getElementById('order-expand') as HTMLButtonElement | null;
      if (hw) hw.style.display = 'none';
      if (sel) {
        sel.style.display = 'inline-block';
        sel.classList.toggle('active', true);
      }
      if (ex) {
        try { ctrl.insertBefore(ex, hw); } catch { }
        ex.style.marginLeft = '';
        ex.textContent = '▸';
      }
    }
  }
  updateOrderControls();

  // Axes groups
  const xAxisG = svg.append('g').attr('class', 'x-axis').attr('transform', `translate(0, ${PLOT_BOTTOM})`);
  const yAxisG = svg.append('g').attr('class', 'y-axis').attr('transform', `translate(${PLOT_LEFT},0)`);
  function updateXAxis() {
    const maxTicks = 12;
    let tickVals = xScale.ticks(maxTicks);
    const firstIdx = gameIndices[0];
    const lastIdx = gameIndices[gameIndices.length - 1];
    if (tickVals.length === 0) tickVals = [firstIdx, lastIdx];
    if (tickVals[0] > firstIdx) tickVals.unshift(firstIdx);
    if (tickVals[tickVals.length - 1] < lastIdx) tickVals.push(lastIdx);
    tickVals = Array.from(new Set(tickVals.map(v => Math.round(Number(v))))).sort((a, b) => a - b);
    tickVals = tickVals.filter(v => v !== firstIdx && v !== lastIdx);
    if (tickVals.length === 0) tickVals = [Math.round((firstIdx + lastIdx) / 2)];
    xAxisG.call(d3.axisBottom(xScale).tickValues(tickVals).tickFormat((v: d3.NumberValue) => formatGameMonth(Math.round(Number(v)))));
  }
  updateXAxis();
  yAxisG.call(d3.axisLeft(yScale));

  // Axis labels
  xAxisG.append('text')
    .attr('class', 'x-axis-label')
    .attr('x', CANVAS_WIDTH / 2)
    .attr('y', 45)
    .attr('fill', 'white')
    .attr('text-anchor', 'middle')
    .attr('font-size', '12px')
    .text("Date (Mon 'Year)");

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

  // Area generator
  const areaGen = d3.area<d3.SeriesPoint<StackDatum>>()
    .x((d: d3.SeriesPoint<StackDatum>) => xScale(gameMonthIndexFor(d.data.date)))
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
          const obj: { date: Date;[k: string]: number | Date } = { date: new Date(dateStr) };
          canonicalOrderSocial.forEach(cls => { obj[cls] = socialCountFor(dateStr, cls); });
          return obj as StackDatum;
        });
      }
    } else {
      source = dataForStack as StackDatum[];
    }
    const stackedData = stackLayout(source as StackDatum[]);
    const dom = xScale.domain();
    const domMin = Math.min(Number(dom[0]), Number(dom[1]));
    const domMax = Math.max(Number(dom[0]), Number(dom[1]));
    const rows = (source as StackDatum[]).filter(r => {
      const idx = gameMonthIndexFor(r.date);
      return idx >= domMin && idx <= domMax;
    });
    const rowsToCheck = rows.length ? rows : (source as StackDatum[]);
    const maxActive = d3.max(rowsToCheck, d => keys.reduce((s, k) => s + (d[k] || 0), 0)) || 1;
    yScale.domain([0, maxActive]);
    updateXAxis(); yAxisG.call(d3.axisLeft(yScale));

    plot.selectAll('.area').remove();
    plot.selectAll('.area')
      .data(stackedData)
      .enter()
      .append('path')
      .attr('class', 'area')
      .attr('d', d => areaGen(d) || '')
      .attr('fill', (d: d3.Series<StackDatum, string>) => backdropOf(d.key))
      .attr('stroke', 'none')
      .attr('opacity', 0.9);

    // Add affiliation icons onto the stacked areas (if available).
    plot.selectAll('image.area-icon').remove();
    if (grouping === 'affiliation') {
      const ICON_MAX = 28; const ICON_MIN = 10;
      (stackedData as d3.Series<StackDatum, string>[]).forEach(series => {
        const key = series.key;
        const imgPath = LEGEND_IMAGE_PATHS[key];
        if (!imgPath) return;
        const [domainMin, domainMax] = xScale.domain();
        const candidates: number[] = [];
        for (let i = 0; i < series.length; i++) {
          const gameIdx = gameIndices[i];
          if (gameIdx > domainMin && gameIdx < domainMax) candidates.push(i);
        }

        let chosenIdx = -1;
        let chosenHeightPx = -Infinity;

        const heightPxAt = (i: number) => {
          const seg = series[i] as unknown as d3.SeriesPoint<StackDatum> & [number, number];
          const v0 = seg[0] as number; const v1 = seg[1] as number;
          if (!(v1 - v0 > 0)) return -Infinity;
          return Math.abs(yScale(v0) - yScale(v1));
        };

        if (candidates.length > 0) {
          candidates.forEach(i => {
            const h = heightPxAt(i);
            if (h > chosenHeightPx) { chosenHeightPx = h; chosenIdx = i; }
          });
        } else {
          const midIdx = (domainMin + domainMax) / 2;
          let j = bisectIndex(gameIndices, midIdx);
          if (j > 0) j = j - 1;
          if (j < 0) j = 0;
          if (j >= series.length - 1) j = series.length - 2;
          const segA = series[j] as unknown as d3.SeriesPoint<StackDatum> & [number, number];
          const segB = series[j + 1] as unknown as d3.SeriesPoint<StackDatum> & [number, number];
          const gA = gameIndices[j]; const gB = gameIndices[j + 1];
          const t = (gB === gA) ? 0 : ((midIdx - gA) / (gB - gA));
          const v0Mid = (segA[0] as number) + t * ((segB[0] as number) - (segA[0] as number));
          const v1Mid = (segA[1] as number) + t * ((segB[1] as number) - (segA[1] as number));
          const heightMid = v1Mid - v0Mid;
          chosenHeightPx = Math.abs(yScale(v0Mid) - yScale(v1Mid));
          chosenIdx = -1;
          if (!(heightMid > 0)) return;
          let x = xScale(midIdx);
          const y = yScale((v0Mid + v1Mid) / 2);
          const iconSize = Math.min(ICON_MAX, Math.max(ICON_MIN, Math.floor(chosenHeightPx * 0.7)));
          const leftBound = PLOT_LEFT + iconSize / 2;
          const rightBound = PLOT_RIGHT - iconSize / 2;
          x = Math.max(leftBound, Math.min(rightBound, x));
          plot.append('image')
            .attr('class', 'area-icon')
            .attr('href', imgPath)
            .attr('width', iconSize)
            .attr('height', iconSize)
            .attr('x', x - iconSize / 2)
            .attr('y', y - iconSize / 2)
            .attr('opacity', 0.95)
            .style('pointer-events', 'none');
          return;
        }

        if (chosenIdx < 0) return;
        const bestSeg = series[chosenIdx] as unknown as d3.SeriesPoint<StackDatum> & [number, number];
        const vMid = ((bestSeg[0] as number) + (bestSeg[1] as number)) / 2;
        let x = xScale(gameIndices[chosenIdx]);
        let y = yScale(vMid);
        if (chosenHeightPx < ICON_MIN * 0.6) return;
        const iconSize = Math.min(ICON_MAX, Math.max(ICON_MIN, Math.floor(chosenHeightPx * 0.7)));
        const leftBound = PLOT_LEFT + iconSize / 2;
        const rightBound = PLOT_RIGHT - iconSize / 2;
        const topBound = PLOT_TOP + iconSize / 2;
        const bottomBound = PLOT_BOTTOM - iconSize / 2;
        x = Math.max(leftBound, Math.min(rightBound, x));
        y = Math.max(topBound, Math.min(bottomBound, y));
        plot.append('image')
          .attr('class', 'area-icon')
          .attr('href', imgPath)
          .attr('width', iconSize)
          .attr('height', iconSize)
          .attr('x', x - iconSize / 2)
          .attr('y', y - iconSize / 2)
          .attr('opacity', 0.95)
          .style('pointer-events', 'none');
      });
    }

    // Add hover handlers to show affiliation + social-class breakdown for the hovered date
    plot.selectAll<SVGPathElement, d3.Series<StackDatum, string>>('.area')
      .on('mousemove', function (event, series) {
        const [sx] = d3.pointer(event, svg.node() as SVGElement);
        const x0 = xScale.invert(sx as number) as number;
        let i = bisectIndex(gameIndices, x0);
        if (i > 0 && i < gameIndices.length) {
          const g1 = gameIndices[i - 1]; const g2 = gameIndices[i];
          i = (Math.abs(g1 - x0) <= Math.abs(g2 - x0)) ? i - 1 : i;
        }
        i = Math.max(0, Math.min((source as StackDatum[]).length - 1, i));
        const dateStr = dates[i];
        const dateLabel = formatGameMonth(gameIndices[i]);
        const key = series.key;
        if (grouping === 'social') {
          const breakdown = affiliationCountsForSocial(dateStr, key);
          const affLines = breakdown.list.length ? breakdown.list.map(x => `${x.affiliation}: ${x.count}`).join('<br/>') : 'None';
          tooltip.style('display', 'block').html(`Date: ${dateLabel}<br/><br/><strong>${key}</strong><br/>Total: ${breakdown.total}<br/>${affLines}`);
        } else {
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

          tooltip.style('display', 'block').html(`\n    Date: ${dateLabel}<br/>\n    <br/>\n    <strong>${aff}</strong><br/>\n    Total: ${totalForAff}<br/>\n    Commoners: ${classes.commoner}<br/>\n    Notables: ${classes.notable}<br/>\n    Nobles: ${classes.noble}<br/>\n    Rulers: ${classes.ruler}\n  `);
        }
        positionTooltip(event as unknown as MouseEvent, 12, -28);
      })
      .on('mouseout', () => tooltip.style('display', 'none'));
  }

  // Hover overlay & tooltip
  const tooltip = d3.select('#overview-chart').append('div').style('position', 'absolute').style('background', 'rgba(0,0,0,0.7)').style('color', 'white').style('padding', '5px').style('border-radius', '5px').style('display', 'none');
  function positionTooltip(event: MouseEvent, offsetX = 12, offsetY = -28) {
    const container = document.getElementById('overview-chart');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const left = (event.clientX - rect.left) + offsetX;
    const top = (event.clientY - rect.top) + offsetY;
    tooltip.style('left', left + 'px').style('top', top + 'px');
  }
  const bisectIndex = d3.bisector((d: number) => d).left;

  function updateStackKeys() {
    const computeVariance = (arr: number[]) => {
      if (!arr.length) return 0;
      const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
      const variance = arr.reduce((s, v) => s + (v - mean) * (v - mean), 0) / arr.length;
      return variance;
    };
    const computeStd = (arr: number[]) => Math.sqrt(computeVariance(arr));
    const computeCoefVar = (arr: number[]) => {
      const mean = arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
      if (mean === 0) return Infinity;
      return computeStd(arr) / mean;
    };
    const computeMeanWeighted = (arr: number[]) => {
      const mean = arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
      return computeVariance(arr) * mean;
    };
    const metricFor = (values: number[]) => {
      switch (orderMethod) {
        case 'variance': return computeVariance(values);
        case 'coefvar': return computeCoefVar(values);
        case 'mean-weighted': return computeMeanWeighted(values);
        case 'deriv-std': {
          if (!values || values.length < 2) return 0;
          const diffs: number[] = [];
          for (let i = 0; i < values.length - 1; i++) {
            diffs.push(values[i + 1] - values[i]);
          }
          return computeStd(diffs);
        }
        case 'alphabetical': return 0;
        default: return computeVariance(values);
      }
    };

    if (orderMethod === 'alphabetical') {
      if (grouping === 'social') {
        stackKeys = SOCIAL_PREFERRED_LEGEND_ORDER.filter(k => socialClasses.includes(k));
        const rest = socialClasses.filter(k => !stackKeys.includes(k));
        if (rest.length) stackKeys = [...stackKeys, ...rest];
      }
      else {
        stackKeys = [...canonicalOrderAffiliations];
        const wi = stackKeys.indexOf('Wanderer'); if (wi > 0) { stackKeys.splice(wi, 1); stackKeys.push('Wanderer'); }
      }
      return;
    }

    if (grouping === 'social') {
      stackKeys = SOCIAL_PREFERRED_LEGEND_ORDER.filter(k => socialClasses.includes(k));
      const rest = socialClasses.filter(k => !stackKeys.includes(k));
      if (rest.length) stackKeys = [...stackKeys, ...rest];
    } else {
      const metrics = canonicalOrderAffiliations.map(key => {
        const values = (dataForStack as StackDatum[]).map((row: StackDatum) => Number(row[key] || 0));
        return { key, m: metricFor(values) };
      });
      metrics.sort((a, b) => a.m - b.m);
      stackKeys = metrics.map(v => v.key);
      const wi = stackKeys.indexOf('Wanderer'); if (wi > 0) { stackKeys.splice(wi, 1); stackKeys.push('Wanderer'); }
    }
  }
  updateStackKeys();

  function socialCountFor(dateStr: string, cls: string) {
    const entries = (dateGroups[dateStr].bySocialClass[cls] || []);
    if (includeWanderers) return entries.length;
    const wandererMembers = canonicalMembers['Wanderer'] || [];
    return entries.filter(e => !wandererMembers.includes(e['Affiliation'] || '')).length;
  }

  function affiliationCountsForSocial(dateStr: string, cls: string) {
    const entries = (dateGroups[dateStr].bySocialClass[cls] || []).slice();
    const countsByCanonical: Record<string, number> = {};
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

    const list = canonicalOrderAffiliations.filter(a => (countsByCanonical[a] || 0) > 0).map(a => ({ affiliation: a, count: countsByCanonical[a] }));
    const total = list.reduce((s, x) => s + x.count, 0);
    return { total, list } as { total: number; list: { affiliation: string; count: number }[] };
  }

  function updateWandererButton() {
    const container = document.getElementById('overview-chart');
    if (!container) return;
    let ctrl = document.getElementById('wanderer-control') as HTMLDivElement | null;
    if (!ctrl) {
      const created = document.createElement('div');
      created.id = 'wanderer-control';
      created.className = 'order-control';
      const btn = document.createElement('button');
      btn.id = 'btn-wanderers';
      btn.className = 'chart-btn';
      btn.textContent = 'Include Wanderers';
      btn.addEventListener('click', () => {
        includeWanderers = !includeWanderers;
        btn.classList.toggle('active', includeWanderers);
        saveState();
        updateChart();
      });
      created.appendChild(btn);
      container.appendChild(created);
      ctrl = created;
    }
    ctrl.style.display = grouping === 'social' ? 'flex' : 'none';
    const inner = document.getElementById('btn-wanderers') as HTMLButtonElement | null;
    if (inner) inner.classList.toggle('active', includeWanderers);
  }

  const legendX = 770; const legendY = 60;
  function rebuildLegend() {
    svg.selectAll('g.legend').remove();
    const keys = grouping === 'social' ? canonicalOrderSocial : canonicalOrderAffiliations;
    const legendKeys = ((): string[] => {
      if (grouping === 'social') {
        const pref = SOCIAL_PREFERRED_LEGEND_ORDER.filter(k => canonicalOrderSocial.includes(k));
        const rest = canonicalOrderSocial.filter(k => !pref.includes(k));
        return [...pref, ...rest];
      } else {
        const arr = [...keys];
        const wi = arr.indexOf('Wanderer');
        if (wi >= 0) { arr.splice(wi, 1); arr.push('Wanderer'); }
        return arr;
      }
    })();
    if (grouping === 'social') {
      activeAffiliations = activeBySocial;
    } else {
      activeAffiliations = activeByAffiliations;
    }
    color.domain(keys as readonly string[]);
    const legend = svg.append('g').attr('class', 'legend');
    const ICON_SIZE = 32;
    const ITEM_SPACING = 40;
    const TEXT_X = ICON_SIZE + 8;
    const legendItems = legend.selectAll<SVGGElement, string>('g.legend-item').data(legendKeys).enter().append('g').attr('class', 'legend-item').attr('transform', (d, i) => `translate(${legendX}, ${legendY + i * ITEM_SPACING})`).style('cursor', 'pointer').on('click', function (event, key) { if (activeAffiliations.has(key)) activeAffiliations.delete(key); else activeAffiliations.add(key); updateLegend(); updateChart(); saveState(); });
    legendItems.each(function (d) {
      const g = d3.select(this);
      const imgPath = LEGEND_IMAGE_PATHS[d];
      if (imgPath) {
        g.append('image').attr('class', 'legend-icon').attr('href', imgPath).attr('width', ICON_SIZE).attr('height', ICON_SIZE).attr('x', 0).attr('y', -4);
      }
    });
    legendItems.each(function (d) {
      const g = d3.select(this);
      const imgPath = LEGEND_IMAGE_PATHS[d];
      const itemSpacing = imgPath ? ITEM_SPACING : 25;
      g.attr('transform', `translate(${legendX}, ${legendY + legendItems.nodes().indexOf(this) * itemSpacing})`);
      const txtX = imgPath ? TEXT_X : 6;
      const txt = g.append('text').attr('x', txtX).attr('y', 16).attr('fill', d => colorOf(d as string)).attr('font-size', '13px').text(String(d));
      try {
        const node = txt.node() as SVGTextElement;
        const bb = node.getBBox();
        const pad = 12;
        const bx = bb.x - 6;
        const by = bb.y - 2;
        const bw = bb.width + pad;
        const bh = bb.height + 4;
        g.insert('rect', 'text').attr('class', 'legend-backdrop').attr('x', bx).attr('y', by).attr('width', bw).attr('height', bh).attr('rx', 4).attr('ry', 4).attr('fill', backdropOf(d)).lower();
        const icon = g.select<SVGElement>('.legend-icon');
        if (!icon.empty()) {
          const centerY = by + bh / 2;
          const iconY = centerY - ICON_SIZE / 2;
          icon.attr('y', iconY);
        }
      } catch {
        const fallbackBy = -2;
        const fallbackBh = 20;
        g.insert('rect', 'text').attr('class', 'legend-backdrop').attr('x', txtX - 4).attr('y', fallbackBy).attr('width', 120).attr('height', fallbackBh).attr('rx', 4).attr('ry', 4).attr('fill', backdropOf(d)).lower();
        const icon = g.select<SVGElement>('.legend-icon');
        if (!icon.empty()) {
          const centerY = fallbackBy + fallbackBh / 2;
          const iconY = centerY - ICON_SIZE / 2;
          icon.attr('y', iconY);
        }
      }
    });
    updateLegend();
    updateWandererButton();
  }
  function updateLegend() {
    svg.selectAll<SVGGElement, string>('g.legend-item').select('rect').attr('opacity', d => activeAffiliations.has(d) ? 1 : 0.2);
    svg.selectAll<SVGGElement, string>('g.legend-item').select('image').attr('opacity', d => activeAffiliations.has(d) ? 1 : 0.2);
    svg.selectAll<SVGGElement, string>('g.legend-item').select('rect.legend-backdrop').attr('opacity', d => activeAffiliations.has(d) ? 1 : 0.2);
    svg.selectAll<SVGTextElement, string>('g.legend-item').select('text').attr('opacity', d => activeAffiliations.has(d) ? 1 : 0.2);
  }

  rebuildLegend();

  // --- Comparison chart controls + chart ---
  // (comparison chart is created in comparison module; overview only provides the container)

  // Wire chart & grouping buttons will be connected after functions exist
  // Create a small overlay rectangle for pointer interactions
  svg.append('rect').attr('x', PLOT_LEFT).attr('y', PLOT_TOP).attr('width', PLOT_WIDTH).attr('height', PLOT_HEIGHT).attr('fill', 'transparent').attr('class', 'chart-overlay')
    .on('mousemove', (event) => {
      const [mx] = d3.pointer(event, svg.node() as SVGElement);
      const x0 = xScale.invert(mx) as number;
      let source: StackDatum[];
      if (grouping === 'social') {
        if (includeWanderers) source = dataForStackByClass as StackDatum[];
        else source = dates.map(dateStr => {
          const obj: { date: Date;[k: string]: number | Date } = { date: new Date(dateStr) };
          canonicalOrderSocial.forEach(cls => { obj[cls] = socialCountFor(dateStr, cls); });
          return obj as StackDatum;
        });
      } else {
        source = dataForStack as StackDatum[];
      }
      const keys = grouping === 'social' ? canonicalOrderSocial : canonicalOrderAffiliations;
      let i = bisectIndex(gameIndices, x0);
      if (i > 0 && i < gameIndices.length) {
        const g1 = gameIndices[i - 1]; const g2 = gameIndices[i];
        i = (Math.abs(g1 - x0) <= Math.abs(g2 - x0)) ? i - 1 : i;
      }
      i = Math.max(0, Math.min((source as StackDatum[]).length - 1, i));
      const d0 = (source as StackDatum[])[i]; const dateLabel = formatGameMonth(gameIndices[i]);
      const visible = keys.filter(k => (d0[k] || 0) > 0);
      const lines = visible.length ? visible.map(k => `${k}: ${d0[k] || 0}`).join('<br/>') : 'None';
      const total = keys.reduce((s, k) => s + (d0[k] || 0), 0);
      tooltip.style('display', 'block').html(`Date: ${dateLabel}<br/><br/>Total: ${total}<br/>${lines}`);
      positionTooltip(event as unknown as MouseEvent, 12, -28);
    })
    .on('mouseout', () => tooltip.style('display', 'none'));

  // --- Horizontal brushing: allow selecting an x-range and zooming the x-axis ---
  svg.append('defs').append('clipPath').attr('id', 'clip-chart').append('rect').attr('x', PLOT_LEFT).attr('y', PLOT_TOP).attr('width', PLOT_WIDTH).attr('height', PLOT_HEIGHT);

  const plot = svg.append('g').attr('class', 'plot').attr('clip-path', 'url(#clip-chart)');

  const brush = d3.brushX()
    .extent([[PLOT_LEFT, PLOT_TOP], [PLOT_RIGHT, PLOT_BOTTOM]])
    .on('start', () => { try { plot.lower(); } catch { } try { (brushG as unknown as d3.Selection<SVGGElement, unknown, null, undefined>).style('pointer-events', 'all'); } catch { } })
    .on('end', (event: d3.D3BrushEvent<unknown>) => {
      const selection = event.selection;
      if (!selection) {
        try { plot.raise(); } catch { }
        try { (brushG as unknown as d3.Selection<SVGGElement, unknown, null, undefined>).style('pointer-events', 'none'); } catch { }
        return;
      }
      const [x0, x1] = selection;
      let i0 = Math.round(xScale.invert(x0));
      let i1 = Math.round(xScale.invert(x1));
      if (i0 === i1) i1 = i0 + 1;
      const newMin = Math.min(i0, i1);
      const newMax = Math.max(i0, i1);
      xScale.domain([newMin, newMax]);
      updateXAxis();
      drawStackedAreas();
      updateChart();
      brushG.call(brush.move, null);
      try { plot.raise(); } catch { }
      try { (brushG as unknown as d3.Selection<SVGGElement, unknown, null, undefined>).style('pointer-events', 'none'); } catch { }
    });

  const brushG = svg.append('g').attr('class', 'x-brush').attr('clip-path', 'url(#clip-chart)').call(brush);
  try { (brushG as unknown as d3.Selection<SVGGElement, unknown, null, undefined>).style('pointer-events', 'none'); } catch { }

  svg.on('dblclick.reset-x', () => {
    xScale.domain([d3.min(gameIndices) as number, d3.max(gameIndices) as number]);
    updateXAxis();
    drawStackedAreas();
    updateChart();
    brushG.call(brush.move, null);
    try { plot.raise(); } catch { }
    try { (brushG as unknown as d3.Selection<SVGGElement, unknown, null, undefined>).style('pointer-events', 'none'); } catch { }
  });

  function drawLinesForSeries(seriesArray: { affiliation: string; values: AffVal[] }[]) {
    plot.selectAll('g.lines-layer').remove();
    const lineGen = d3.line<AffVal>().defined(v => (v.count || 0) > 0).x(d => xScale(gameMonthIndexFor(d.date))).y(d => yScale(d.count));
    const groups = plot.selectAll<SVGGElement, { affiliation: string; values: AffVal[] }>('g.lines-layer').data(seriesArray).enter().append('g').attr('class', 'lines-layer').style('display', 'none');
    groups.each(function (d) {
      const g = d3.select(this);
      const groupAff = (d as { affiliation: string }).affiliation;
      g.append('path').attr('class', 'aff-line').attr('fill', 'none').attr('stroke', backdropOf((d as { affiliation: string }).affiliation)).attr('stroke-width', 1.5).datum(d.values).attr('d', (vals: AffVal[] | undefined) => vals ? lineGen(vals) || '' : '');
      const pts = g.selectAll('.aff-point').data(d.values.filter(v => (v.count || 0) > 0));
      pts.enter().append('circle').attr('class', 'aff-point').attr('cx', v => xScale(gameMonthIndexFor(v.date))).attr('cy', v => yScale(v.count)).attr('r', 0).attr('opacity', 0).attr('fill', () => backdropOf((d as { affiliation: string }).affiliation));
      const hit = g.selectAll('.aff-hit').data(d.values.filter(v => (v.count || 0) > 0));
      hit.enter().append('circle').attr('class', 'aff-hit').attr('cx', v => xScale(gameMonthIndexFor(v.date))).attr('cy', v => yScale(v.count)).attr('r', 10).attr('fill', 'transparent').style('pointer-events', 'all').attr('data-affiliation', groupAff);
    });
  }

  function attachHitHandlers() {
    plot.selectAll('.aff-hit')
      .on('mouseover', (event, d) => {
        const pt = d as AffVal;
        const el = event.currentTarget as HTMLElement;
        const key = el.getAttribute('data-affiliation') || '';
        const dateStr = (pt && pt.dateStr) || '';
        const gameLabel = dateStr ? formatGameMonth(gameMonthIndexFor(new Date(dateStr))) : '';
        if (grouping === 'social') {
          const breakdown = affiliationCountsForSocial(dateStr, key);
          const affLines = breakdown.list.length ? breakdown.list.map(x => `${x.affiliation}: ${x.count}`).join('<br/>') : 'None';
          tooltip.style('display', 'block').html(`Date: ${gameLabel}<br/><br/><strong>${key}</strong><br/>Total: ${breakdown.total}<br/>${affLines}`);
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
          tooltip.style('display', 'block').html(`Date: ${gameLabel}<br/><br/><strong>${key}</strong><br/>Total: ${totalForAff}<br/>Commoners: ${classes.commoner}<br/>Notables: ${classes.notable}<br/>Nobles: ${classes.noble}<br/>Rulers: ${classes.ruler}`);
        }
      })
      .on('mousemove', (event) => positionTooltip(event as unknown as MouseEvent, 10, -28))
      .on('mouseout', () => tooltip.style('display', 'none'));
  }

  function updateChart() {
    const mode = chartType;
    const currentKeys = grouping === 'social' ? canonicalOrderSocial : canonicalOrderAffiliations;
    color.domain(currentKeys as readonly string[]);

    if (mode === 'stacked') {
      const activeKeys = stackKeys.filter(k => activeAffiliations.has(k));
      drawStackedAreas(activeKeys);
      svg.selectAll('.chart-overlay').style('display', null);
      plot.selectAll('g.lines-layer').remove();
    } else {
      svg.selectAll('.area').style('display', 'none');
      svg.selectAll('.chart-overlay').style('display', 'none');
      svg.selectAll('image.area-icon').remove();
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
      plot.selectAll<SVGGElement, { affiliation: string }>('g.lines-layer').style('display', d => activeAffiliations.has(d.affiliation) ? null : 'none');

      const activeSeries = seriesToUse.filter(s => activeAffiliations.has(s.affiliation));
      const dom = xScale.domain();
      const domMin = Math.min(Number(dom[0]), Number(dom[1]));
      const domMax = Math.max(Number(dom[0]), Number(dom[1]));
      const maxCountLines = d3.max(activeSeries.flatMap(s => s.values.filter(v => {
        const gi = gameMonthIndexFor(v.date);
        return gi >= domMin && gi <= domMax;
      }).map(v => v.count))) || 1;
      yScale.domain([0, maxCountLines]); updateXAxis(); yAxisG.call(d3.axisLeft(yScale));

      const lg = d3.line<AffVal>().defined(v => (v.count || 0) > 0).x(v => xScale(gameMonthIndexFor(v.date))).y(v => yScale(v.count));
      plot.selectAll<SVGGElement, { affiliation: string; values: AffVal[] }>('g.lines-layer').each(function (d) {
        const g = d3.select(this);
        g.select('path.aff-line').datum(d.values).attr('d', (vals: AffVal[] | undefined) => vals ? lg(vals) || '' : '');
        const pts = g.selectAll<SVGCircleElement, AffVal>('circle.aff-point').data(d.values.filter(v => (v.count || 0) > 0), (v: AffVal) => v.dateStr);
        pts.join(
          enter => enter.append('circle').attr('class', 'aff-point').attr('cx', v => xScale(gameMonthIndexFor(v.date))).attr('cy', v => yScale(v.count)).attr('r', 0).attr('opacity', 0).attr('fill', () => backdropOf((d as { affiliation: string }).affiliation)),
          update => update.attr('cx', v => xScale(gameMonthIndexFor(v.date))).attr('cy', v => yScale(v.count)).attr('r', 0).attr('opacity', 0),
          exit => exit.remove()
        );
        const groupAffUpdate = (d as { affiliation: string }).affiliation;
        const hits = g.selectAll<SVGCircleElement, AffVal>('circle.aff-hit').data(d.values.filter(v => (v.count || 0) > 0), (v: AffVal) => v.dateStr);
        hits.join(
          enter => enter.append('circle').attr('class', 'aff-hit').attr('cx', v => xScale(gameMonthIndexFor(v.date))).attr('cy', v => yScale(v.count)).attr('r', 10).attr('fill', 'transparent').style('pointer-events', 'all').attr('data-affiliation', groupAffUpdate),
          update => update.attr('cx', v => xScale(gameMonthIndexFor(v.date))).attr('cy', v => yScale(v.count)).attr('data-affiliation', groupAffUpdate),
          exit => exit.remove()
        );
      });
      attachHitHandlers();
    }
  }

  // Nearest-point detection for line mode
  svg.on('mousemove.nearest', (event) => {
    if (chartType !== 'lines') return;
    const [mx, my] = d3.pointer(event, svg.node() as SVGElement);
    const hitRadius = 12;
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
        const dx = xScale(gameMonthIndexFor(v.date)) - mx;
        const dy = yScale(v.count) - my;
        const d2 = dx * dx + dy * dy;
        if (d2 < best.dist2) best = { series: s.affiliation, val: v, dist2: d2 };
      });
    });

    if (best.val && Math.sqrt(best.dist2) <= hitRadius) {
      const aff = best.series || '';
      const dateStr = best.val!.dateStr;
      const gameLabel = dateStr ? formatGameMonth(gameMonthIndexFor(new Date(dateStr))) : '';
      if (grouping === 'social') {
        const breakdown = affiliationCountsForSocial(dateStr, aff);
        const affLines = breakdown.list.length ? breakdown.list.map(x => `${x.affiliation}: ${x.count}`).join('<br/>') : 'None';
        tooltip.style('display', 'block').html(`Date: ${gameLabel}<br/><br/><strong>${aff}</strong><br/>Total: ${breakdown.total}<br/>${affLines}`);
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
        tooltip.style('display', 'block').html(`\n        Date: ${gameLabel}<br/>\n        <br/>\n        <strong>${aff}</strong><br/>\n        Total: ${totalForAff}<br/>\n        Commoners: ${classes.commoner}<br/>\n        Notables: ${classes.notable}<br/>\n        Nobles: ${classes.noble}<br/>\n        Rulers: ${classes.ruler}\n      `);
      }
      positionTooltip(event as unknown as MouseEvent, 12, -28);
    } else {
      tooltip.style('display', 'none');
    }
  });

  // Draw initial
  drawStackedAreas();
  updateChart();
  try { plot.raise(); } catch { }

  // Expose some controls wiring to outer scope via returned object
  // Return handlers so main module or other modules can attach control events
  return {
    svg,
    updateChart: () => updateChart(),
    updateStackKeys: () => { updateStackKeys(); },
    rebuildLegend: () => rebuildLegend(),
    updateOrderControls: () => updateOrderControls(),
    saveState: () => saveState(),
    setChartType: (t: 'stacked' | 'lines') => { chartType = t; setActiveChartButton(); updateChart(); updateOrderControls(); saveState(); },
    setGrouping: (g: 'affiliation' | 'social') => { grouping = g; setActiveGroupButton(); updateStackKeys(); rebuildLegend(); updateChart(); updateOrderControls(); saveState(); }
  };
}

// Local helpers using shared utilities
function colorOf(key: string) { return sharedColorOf(key, (k) => k); }
function backdropOf(key: string) { return sharedBackdropOf(key); }

export default { initOverview };
