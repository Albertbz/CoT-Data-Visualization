
import { affiliations, processedCharacterData, formatGameMonth, dates, gameMonthIndexFor, canonicalMembers } from './data';
import { colorOf, backdropOf } from './shared';
import { CANVAS_WIDTH, PLOT_LEFT, PLOT_HEIGHT } from './canvassetup';
import * as d3 from 'd3';

// Clean, typed Lifespan Gantt with scrollable rows and fixed x-axis
export function initLifespan(containerId = 'lifespan-chart') {
  const container = document.getElementById(containerId);
  if (!container) return null;

  // Controls wrapper (keeps previous controls intact)
  const CONTROLS_WRAP_ID = 'lifespan-controls';
  let controlsWrap = document.getElementById(CONTROLS_WRAP_ID) as HTMLDivElement | null;
  if (!controlsWrap) {
    controlsWrap = document.createElement('div');
    controlsWrap.id = CONTROLS_WRAP_ID;
    controlsWrap.style.display = 'flex';
    controlsWrap.style.flexDirection = 'column';
    controlsWrap.style.gap = '8px';
    controlsWrap.style.marginTop = '12px';
    container.appendChild(controlsWrap);
  } else {
    controlsWrap.innerHTML = '';
  }

  // Affiliation filter buttons
  const STORAGE_KEY = 'lifespanActiveAff_v1';
  function loadSavedAffiliations() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return new Set<string>(JSON.parse(raw));
    } catch {}
    return new Set<string>(affiliations);
  }
  function saveAffiliations(set: Set<string>) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set))); } catch {}
  }
  const activeAffiliations = loadSavedAffiliations();

  const affRow = document.createElement('div');
  affRow.style.display = 'flex';
  affRow.style.flexWrap = 'wrap';
  affRow.style.gap = '6px';
  affRow.style.justifyContent = 'center';
  affRow.style.alignItems = 'center';

  affiliations.forEach(aff => {
    const b = document.createElement('button');
    b.className = 'compare-aff-btn';
    b.dataset['aff'] = aff;
    b.style.width = '88px';
    b.style.minWidth = '88px';
    b.style.maxWidth = '88px';
    const img = document.createElement('img');
    img.src = `../images/${aff.toLowerCase()}.png`;
    img.alt = aff;
    img.className = 'compare-aff-icon';
    const lbl = document.createElement('div');
    lbl.className = 'compare-aff-label';
    lbl.textContent = aff;
    b.appendChild(img); b.appendChild(lbl);
    const affBg = backdropOf(aff);
    const affTxt = colorOf(aff, () => '#fff');
    b.style.border = `1px solid ${affBg === 'transparent' ? 'rgba(255,255,255,0.06)' : affBg}`;
    b.style.background = activeAffiliations.has(aff) ? affBg : 'transparent';
    b.style.color = affTxt;
    b.style.padding = '6px 8px';
    b.style.borderRadius = '8px';
    b.style.cursor = 'pointer';
    b.style.opacity = activeAffiliations.has(aff) ? '1' : '0.6';
    b.addEventListener('click', () => {
      if (activeAffiliations.has(aff)) activeAffiliations.delete(aff); else activeAffiliations.add(aff);
      b.style.background = activeAffiliations.has(aff) ? affBg : 'transparent';
      b.style.opacity = activeAffiliations.has(aff) ? '1' : '0.6';
      saveAffiliations(activeAffiliations);
      update();
    });
    affRow.appendChild(b);
  });
  controlsWrap.appendChild(affRow);

  // Social-class filter toggles (include characters who have held any selected class)
  const CLASS_FILTER_KEY = 'lifespanActiveClass_v1';
  function loadSavedClassFilters() {
    try {
      const raw = localStorage.getItem(CLASS_FILTER_KEY);
      if (raw) return new Set<string>(JSON.parse(raw));
    } catch { }
    return new Set<string>(['Commoner', 'Notable', 'Noble', 'Ruler']);
  }
  function saveClassFilters(set: Set<string>) {
    try { localStorage.setItem(CLASS_FILTER_KEY, JSON.stringify(Array.from(set))); } catch { }
  }

  const socialFilterRow = document.createElement('div');
  socialFilterRow.style.display = 'flex';
  socialFilterRow.style.gap = '8px';
  socialFilterRow.style.justifyContent = 'center';
  socialFilterRow.style.alignItems = 'center';
  socialFilterRow.style.marginTop = '6px';

  const classOptions = ['Commoner', 'Notable', 'Noble', 'Ruler'];
  const activeClassFilters = loadSavedClassFilters();
  // Collect created buttons so we can normalize their heights to the largest one
  const lifespanClassButtons: Array<{ btn: HTMLButtonElement; barPx: number }> = [];

  // Bar height multipliers per social class (relative to the row band).
  // Defined here so controls can read them before buttons are created.
  const BAR_HEIGHT_MULTIPLIERS: Record<string, number> = {
    commoner: 0.4,
    notable: 0.6,
    noble: 0.8,
    ruler: 1.0,
    default: 0.6
  };

  function barHeightMultiplierFor(clsRaw?: string) {
    const key = (clsRaw || 'default').toLowerCase();
    return BAR_HEIGHT_MULTIPLIERS[key] ?? BAR_HEIGHT_MULTIPLIERS['default'];
  }

  // Zoom configuration: ctrl/cmd + wheel to zoom rows and bars.
  // Tweak these constants to control zoom behavior and thresholds.
  const ZOOM_STEP = 0.005; // fractional change per wheel notch (20%) — larger jump per event
  const ZOOM_MIN = 0.12; // maximum zoomed-out (smallest spacing)
  const ZOOM_MAX = 1.0; // maximum zoomed-in (default size)
  const ROW_HEIGHT_BASE = 26; // base per-row height at zoom = 1
  const NAME_SMALL_ROW_HEIGHT = 16; // when row height <= this, reduce name size
  const NAME_HIDE_ROW_HEIGHT = 6; // when row height <= this, hide names and show ticks
  const BAR_SHRINK_START = 0.5; // when zoom <= this, start shrinking bar widths
  const BAR_MIN_PX = 2; // minimum bar width at max zoom-out
  // Right-side padding for the plotted timeline area (pixels).
  // Increase to add breathing room between the plotted area and the SVG edge.
  // Change this number to control how far the axis/bars stop from the right edge.
  const PLOT_RIGHT_PADDING = 24;
  // persistence key for lifespan zoom
  const LIFESPAN_ZOOM_KEY = 'lifespanZoom_v1';
  function loadSavedLifespanZoom() {
    try {
      const raw = localStorage.getItem(LIFESPAN_ZOOM_KEY);
      if (raw) {
        const n = Number(raw);
        if (!Number.isNaN(n)) return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, n));
      }
    } catch { }
    return 1.0;
  }
  function saveLifespanZoom(v: number) {
    try { localStorage.setItem(LIFESPAN_ZOOM_KEY, String(v)); } catch { }
  }

  let lifespanZoom = loadSavedLifespanZoom(); // current zoom multiplier (restored)
  // Precompute nominal band used to calculate button top-bar pixels so
  // the same logic is shared between buttons and chart rendering.
  const DEFAULT_BAND_PADDING = 0.15; // same value used in the chart
  const nominalBand = Math.max(1, Math.floor(ROW_HEIGHT_BASE * (1 - DEFAULT_BAND_PADDING)));

  classOptions.forEach(cl => {
    // Render uniform buttons that encode the social-class -> bar-thickness
    // mapping via a small colored bar at the top of each button. The button
    // body uses a neutral style so the top bar is the visual focus.
    const cb = document.createElement('button');
    cb.className = 'lifespan-class-btn';
    cb.dataset['cls'] = cl;
    cb.style.display = 'flex';
    cb.style.flexDirection = 'column';
    cb.style.alignItems = 'stretch';
    cb.style.justifyContent = 'flex-start';
    cb.style.padding = '6px 8px';
    cb.style.borderRadius = '6px';
    cb.style.width = '96px';
    cb.style.minWidth = '96px';
    cb.style.cursor = 'pointer';
    // visual state: filled background when active, transparent when inactive
    cb.style.color = 'var(--text)';
    cb.style.opacity = activeClassFilters.has(cl) ? '1' : '0.6';
    if (activeClassFilters.has(cl)) {
      cb.style.background = 'rgba(59,130,246,0.12)';
      cb.style.border = '1px solid rgba(59,130,246,0.18)';
    } else {
      cb.style.background = 'transparent';
      cb.style.border = '1px solid rgba(255,255,255,0.06)';
    }

    // compute bar pixel height using the precomputed nominalBand
    const mult = barHeightMultiplierFor(cl);
    // bar pixel height should match chart's visible bar height at default zoom
    const barPx = Math.max(2, Math.round(nominalBand * mult));

    // container to center the bar vertically (so it mirrors the chart's vertical centering)
    const barWrap = document.createElement('div');
    barWrap.className = 'lifespan-class-barwrap';
    barWrap.style.display = 'flex';
    barWrap.style.alignItems = 'center';
    barWrap.style.justifyContent = 'center';
    barWrap.style.flex = '1';

    const topBar = document.createElement('div');
    topBar.className = 'lifespan-class-topbar';
    topBar.style.height = `${barPx}px`;
    // width smaller than full button so it reads as a bar; keep it consistent
    topBar.style.width = '72%';
    topBar.style.borderRadius = '6px';
    topBar.style.background = 'var(--accent)';

    // label area below the bar
    const lbl = document.createElement('div');
    lbl.className = 'lifespan-class-label';
    lbl.textContent = cl;

    barWrap.appendChild(topBar);
    cb.appendChild(barWrap);
    cb.appendChild(lbl);

    cb.addEventListener('click', () => {
      if (activeClassFilters.has(cl)) {
        activeClassFilters.delete(cl);
      } else {
        activeClassFilters.add(cl);
      }
      const isActive = activeClassFilters.has(cl);
      cb.style.opacity = isActive ? '1' : '0.6';
      if (isActive) {
        cb.style.background = 'rgba(59,130,246,0.12)';
        cb.style.border = '1px solid rgba(59,130,246,0.18)';
      } else {
        cb.style.background = 'transparent';
        cb.style.border = '1px solid rgba(255,255,255,0.06)';
      }
      saveClassFilters(activeClassFilters);
      update();
    });
    socialFilterRow.appendChild(cb);
    // record for post-processing (we'll equalize button sizes to largest)
    lifespanClassButtons.push({ btn: cb, barPx });
  });
  // Append the class buttons row first so the browser can compute layout,
  // then measure the rendered button heights and equalize them to the
  // largest actual height so labels align precisely.
  controlsWrap.appendChild(socialFilterRow);
  try {
    if (lifespanClassButtons.length > 0) {
      // Defer measurement to the next animation frame to ensure layout is settled
      requestAnimationFrame(() => {
        try {
          let maxH = 0;
          for (const x of lifespanClassButtons) {
            const h = x.btn.offsetHeight || x.btn.getBoundingClientRect().height || 0;
            if (h > maxH) maxH = h;
          }
          if (maxH > 0) {
            lifespanClassButtons.forEach(x => {
              try {
                x.btn.style.minHeight = `${maxH}px`;
                x.btn.style.height = `${maxH}px`;
              } catch { }
            });
          }
        } catch { }
      });
    }
  } catch { }

  // ordering controls
  const orderRow = document.createElement('div');
  orderRow.style.display = 'flex';
  orderRow.style.gap = '8px';
  orderRow.style.justifyContent = 'center';
  type Order = 'start-asc' | 'end-asc' | 'duration-desc' | 'alpha';
  let order: Order = 'start-asc';
  const orderButtons: { id: Order; label: string }[] = [
    { id: 'start-asc', label: 'Chronological' },
    { id: 'end-asc', label: 'Termination' },
    { id: 'duration-desc', label: 'Longevity' },
    { id: 'alpha', label: 'Alphabetical' }
  ];
  function setOrderButtonActive(btn: HTMLButtonElement, active: boolean) {
    btn.style.borderColor = active ? 'var(--accent)' : 'rgba(255,255,255,0.06)';
    btn.style.boxShadow = active ? '0 6px 22px rgba(59, 130, 246, 0.12)' : 'none';
  }
  orderButtons.forEach(o => {
    const b = document.createElement('button');
    b.className = 'chart-btn';
    b.textContent = o.label;
    b.addEventListener('click', () => {
      order = o.id;
      orderRow.querySelectorAll('button').forEach((el) => setOrderButtonActive(el as HTMLButtonElement, el === b));
      update();
    });
    setOrderButtonActive(b, o.id === order);
    orderRow.appendChild(b);
  });
  controlsWrap.appendChild(orderRow);

  // Placeholder (kept for compatibility if needed)
  const PLACEHOLDER_ID = 'lifespan-placeholder';
  let placeholder = document.getElementById(PLACEHOLDER_ID) as HTMLDivElement | null;
  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.id = PLACEHOLDER_ID;
    placeholder.style.width = '100%';
    placeholder.style.height = '420px';
    placeholder.style.display = 'flex';
    placeholder.style.alignItems = 'center';
    placeholder.style.justifyContent = 'center';
    placeholder.style.color = 'var(--muted)';
    placeholder.style.background = 'transparent';
    placeholder.textContent = 'Lifespan chart will render below.';
    container.appendChild(placeholder);
  }

  // Chart container
  const SVG_ID = 'lifespan-svg';
  let svgWrap = document.getElementById(SVG_ID) as HTMLDivElement | null;
  if (!svgWrap) {
    svgWrap = document.createElement('div');
    svgWrap.id = SVG_ID;
    svgWrap.style.width = '100%';
    // let the wrapper size to its content (we'll adjust it after drawing)
    svgWrap.style.height = 'auto';
    svgWrap.style.overflow = 'hidden';
    svgWrap.style.marginTop = '12px';
    container.appendChild(svgWrap);
    if (placeholder) placeholder.style.display = 'none';
  } else {
    svgWrap.innerHTML = '';
  }

  // Rows container (scrollable) and fixed axis SVG
  const rowsContainer = document.createElement('div');
  rowsContainer.id = 'lifespan-rows-container';
  rowsContainer.style.width = '100%';
  // give the rows container extra height so more rows are visible before scrolling
  rowsContainer.style.height = `${PLOT_HEIGHT + 80}px`;
  rowsContainer.style.overflowY = 'auto';
  rowsContainer.style.position = 'relative';
  svgWrap.appendChild(rowsContainer);

  // Track the last computed content height so we can restore scroll position
  // proportionally after updates. Initialize to the plot height.
  let lastContentHeight = PLOT_HEIGHT;


  // Bar height multipliers per social class (relative to the row band).
  // Defined at outer scope so controls can mirror the same proportions.
  // (definitions moved earlier so button rendering can access them)

  // Wheel handler: require ctrl/cmd be held to activate zooming.
  // Use 1:1 discrete zoom steps per wheel event (no multiplicative smoothing).
  rowsContainer.addEventListener('wheel', (ev: WheelEvent) => {
    try {
      if (!(ev.ctrlKey || ev.metaKey)) return; // only when modifier is held
      ev.preventDefault();
      // Each wheel event moves the zoom by a fixed additive step.
      const step = ev.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      lifespanZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, lifespanZoom + step));
      // update HUD (if present) to reflect new zoom
      try {
        if (zoomHud) {
          zoomHud.textContent = `Zoom: ${Math.round(lifespanZoom * 100)}%`;
          zoomHud.style.display = 'block';
          if (zoomHudTimeout) window.clearTimeout(zoomHudTimeout);
          zoomHudTimeout = window.setTimeout(() => { try { if (zoomHud) zoomHud.style.display = 'none'; } catch {} }, 700);
        }
      } catch {}
      try { saveLifespanZoom(lifespanZoom); } catch {}
      update();
    } catch { }
  }, { passive: false });

  const rowsSvg = d3.select(rowsContainer)
    .append('svg')
    .attr('width', (svgWrap.clientWidth || CANVAS_WIDTH))
    .attr('height', PLOT_HEIGHT)
    .style('height', `${PLOT_HEIGHT}px`)
    .style('display', 'block')
    .style('background', 'transparent');

  // Add a reusable defs filter for a soft inner shadow to improve contrast
  try {
    if (rowsSvg.select('defs #lifespan-inner-shadow').empty()) {
      const defs = rowsSvg.append('defs');
      const filt = defs.append('filter').attr('id', 'lifespan-inner-shadow')
        .attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
      filt.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 1.2).attr('result', 'blur');
      filt.append('feOffset').attr('dx', 0).attr('dy', 1).attr('result', 'offsetBlur');
      // create inner shadow by subtracting the source alpha
      filt.append('feComposite').attr('in', 'offsetBlur').attr('in2', 'SourceAlpha').attr('operator', 'arithmetic').attr('k2', -1).attr('k3', 1).attr('result', 'innerShadow');
      filt.append('feFlood').attr('flood-color', '#000').attr('flood-opacity', 0.14).attr('result', 'color');
      filt.append('feComposite').attr('in', 'color').attr('in2', 'innerShadow').attr('operator', 'in').attr('result', 'shadowColor');
      const merge = filt.append('feMerge');
      merge.append('feMergeNode').attr('in', 'shadowColor');
      merge.append('feMergeNode').attr('in', 'SourceGraphic');
    }
  } catch { /* ignore if defs not available yet */ }

  const axisSvg = d3.select(svgWrap)
    .append('svg')
    .attr('width', (svgWrap.clientWidth || CANVAS_WIDTH))
    // Reduce axis area height so it fits the axis labels more tightly
    .attr('height', 40)
    .style('height', `40px`)
    .style('display', 'block')
    .style('background', 'transparent');

  const rowsG = rowsSvg.append('g').attr('transform', `translate(0, 0)`);
  const axisG = axisSvg.append('g').attr('transform', `translate(0, 0)`);

  // Ensure divider lines exist immediately so they are visible on first render.
  // Creating them early avoids a timing issue where the first update() may run
  // before the browser has fully painted the SVG, causing the line to sometimes
  // not appear until a subsequent interaction triggers an update.
  try {
    if (rowsSvg.select('.name-divider').empty()) {
      rowsSvg.append('line').attr('class', 'name-divider')
        .style('stroke', 'rgba(255,255,255,0.06)').style('stroke-width', '1px');
    }
    if (axisSvg.select('.name-divider-axis').empty()) {
      axisSvg.append('line').attr('class', 'name-divider-axis')
        .style('stroke', 'rgba(255,255,255,0.06)').style('stroke-width', '1px');
    }
  } catch { /* defensive: ignore if SVG not ready */ }

  // Tooltip attached to container for easy positioning
  const tooltip = d3.select(container)
    .append('div')
    .style('position', 'absolute')
    .style('background', 'rgba(0,0,0,0.75)')
    .style('color', 'white')
    .style('padding', '6px 8px')
    .style('border-radius', '6px')
    .style('font-size', '12px')
    .style('pointer-events', 'none')
    .style('z-index', '1000')
    .style('display', 'none');

  // Small on-screen HUD showing current zoom while the user is zooming
  let zoomHud: HTMLDivElement | null = null;
  let zoomHudTimeout: number | undefined;
  try {
    zoomHud = document.createElement('div');
    zoomHud.id = 'lifespan-zoom-hud';
    zoomHud.style.position = 'absolute';
    // center the HUD over the chart area
    zoomHud.style.left = '50%';
    zoomHud.style.top = '50%';
    zoomHud.style.transform = 'translate(-50%, -50%)';
    zoomHud.style.padding = '6px 10px';
    zoomHud.style.background = 'rgba(0,0,0,0.7)';
    zoomHud.style.color = 'white';
    zoomHud.style.borderRadius = '6px';
    zoomHud.style.fontSize = '12px';
    zoomHud.style.zIndex = '1200';
    zoomHud.style.pointerEvents = 'none';
    zoomHud.style.display = 'none';
    // append to the svg wrapper so the HUD is visually centered over the chart
    svgWrap.appendChild(zoomHud);
  } catch { zoomHud = null; }

  // Local typings for clarity
  interface Segment {
    start: number;
    end: number;
    socialClass?: string;
    affiliation?: string;
    name?: string;
    vsUsername?: string;
    discordUsername?: string;
  }

  interface ProcChar {
    id: string;
    finalName?: string;
    finalAffiliation?: string;
    finalSocialClass?: string;
    vsUsername?: string;
    discordUsername?: string;
    startYear?: number;
    endYear?: number;
    firstAppearanceDateStr?: string;
    lastAppearanceDateStr?: string;
    firstAppearanceIndex?: number;
    lastAppearanceIndex?: number;
    segments: Segment[];
  }

  function normKey(s: string) {
    return s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC').trim().toLowerCase();
  }

  function findCanonicalAff(raw: string | undefined | null): string | undefined | null {
    if (!raw) return raw;
    const nk = normKey(raw);
    for (const can of Object.keys(canonicalMembers)) {
      if (normKey(can) === nk) return can;
      const members = canonicalMembers[can] || [];
      for (const m of members) {
        if (normKey(m) === nk) return can;
      }
    }
    return raw;
  }

  // Core update/draw
  function update() {
    // preserve previous scroll position and content height to avoid jumping
    const prevScrollTop = rowsContainer.scrollTop;
    const prevContentHeight = lastContentHeight;
    const chars = (processedCharacterData as ProcChar[]).slice();
    // Prepare active class filters (case-insensitive lookup)
    const activeClassLower = new Set<string>(Array.from(activeClassFilters).map(s => String(s).toLowerCase()));

    function charHasSelectedClass(ch: ProcChar) {
      const segs: Segment[] = ch.segments || [];
      for (const s of segs) {
        const sc = String(s.socialClass || ch.finalSocialClass || '').trim().toLowerCase();
        if (sc && activeClassLower.has(sc)) return true;
      }
      // fallback to final class
      const finalSc = String(ch.finalSocialClass || '').trim().toLowerCase();
      if (finalSc && activeClassLower.has(finalSc)) return true;
      return false;
    }

    function charHasSelectedAffiliation(ch: ProcChar) {
      const segs: Segment[] = ch.segments || [];
      for (const s of segs) {
        const can = findCanonicalAff(s.affiliation || ch.finalAffiliation || 'Wanderer');
        if (can && activeAffiliations.has(can)) return true;
      }
      return false;
    }

    const filtered = chars.filter((ch) => {
      return charHasSelectedAffiliation(ch) && charHasSelectedClass(ch);
    });

    // ordering
    filtered.sort((a, b) => {
      if (order === 'start-asc') return ((a.firstAppearanceIndex ?? 1e9) - (b.firstAppearanceIndex ?? 1e9));
      if (order === 'end-asc') return (a.endYear || 0) - (b.endYear || 0);
      if (order === 'duration-desc') return ((b.endYear || 0) - (b.startYear || 0)) - ((a.endYear || 0) - (a.startYear || 0));
      return (a.finalName || '').localeCompare(b.finalName || '');
    });

    const ids = filtered.map(d => d.id);

    // compute domain in game-month indices across all segments
    let minIdx = Infinity; let maxIdx = -Infinity;
    filtered.forEach((ch: ProcChar) => {
      (ch.segments || []).forEach((s: Segment) => {
        if (typeof s.start === 'number') minIdx = Math.min(minIdx, s.start);
        if (typeof s.end === 'number') maxIdx = Math.max(maxIdx, s.end);
      });
      if (ch.firstAppearanceIndex != null) minIdx = Math.min(minIdx, ch.firstAppearanceIndex);
      if (ch.lastAppearanceIndex != null) maxIdx = Math.max(maxIdx, ch.lastAppearanceIndex);
    });
    if (!isFinite(minIdx)) minIdx = d3.min(dates.map(d => gameMonthIndexFor(new Date(d)))) as number;
    if (!isFinite(maxIdx)) maxIdx = d3.max(dates.map(d => gameMonthIndexFor(new Date(d)))) as number;

    // x scale (shared)
    // Reserve a left column for names so labels have more room.
    const NAME_COL_WIDTH = 110; // px reserved on the left for character names (reduced)
    const plotLeftOffset = PLOT_LEFT + NAME_COL_WIDTH;
    // Use the actual wrapper width when available so the chart fills the
    // container. Fall back to CANVAS_WIDTH if clientWidth is not present.
    const svgClientWidth = (svgWrap && svgWrap.clientWidth) ? svgWrap.clientWidth : CANVAS_WIDTH;
    // Update SVG element widths so they match the wrapper (responsive)
    try { rowsSvg.attr('width', svgClientWidth); axisSvg.attr('width', svgClientWidth); } catch {}
    // Extend the x-axis range slightly to the right so the axis and bars
    // reach closer to the SVG edge (controlled by PLOT_RIGHT_PADDING).
    const xScale = d3.scaleLinear().domain([minIdx, maxIdx]).range([plotLeftOffset, svgClientWidth - PLOT_RIGHT_PADDING]);

    // compute average pixel spacing per month/index so we can extend
    // each segment slightly beyond its exact tick. This gives visual
    // breathing room for very short segments.
    const avgStepPx = (maxIdx > minIdx)
      ? (xScale(maxIdx) - xScale(minIdx)) / (maxIdx - minIdx)
      : Math.max(6, (CANVAS_WIDTH - plotLeftOffset) * 0.02);
    // Portion of the average tick spacing to extend each segment on both ends.
    // Increasing this makes very-short segments visually larger.
    const EXTEND_RATIO = 0.30; // 30% of avg spacing
    const extendPx = avgStepPx * EXTEND_RATIO;

    // rows sizing (responsive to zoom)
    const rowHeight = Math.max(4, Math.floor(ROW_HEIGHT_BASE * lifespanZoom));
    // padding between bands decreases as we zoom out so rows compress smoothly
    const bandPadding = Math.max(0, 0.15 * lifespanZoom);
    const contentHeight = Math.max(PLOT_HEIGHT, ids.length * rowHeight + 8);
    // set both the SVG attribute and inline style height to override global CSS
    rowsSvg.attr('height', contentHeight).style('height', `${contentHeight}px`);

    const yScale = d3.scaleBand<string>().domain(ids).range([0, ids.length * rowHeight]).padding(bandPadding);

    // name display modes based on row height
    const showNamesFull = rowHeight > NAME_SMALL_ROW_HEIGHT; // normal size
    const showNamesSmall = rowHeight > NAME_HIDE_ROW_HEIGHT && rowHeight <= NAME_SMALL_ROW_HEIGHT; // smaller text

    // Draw a subtle vertical divider between the name column and the timeline
    const dividerX = plotLeftOffset - 8; // small gap before the plotted area
    const divSel = rowsSvg.selectAll<SVGLineElement, number>('.name-divider').data([0]);
    divSel.enter()
      .append('line')
      .attr('class', 'name-divider');
    divSel
      .attr('x1', dividerX)
      .attr('x2', dividerX)
      .attr('y1', 0)
      .attr('y2', contentHeight)
      .style('stroke', 'rgba(255,255,255,0.06)')
      .style('stroke-width', '1px');
    divSel.exit().remove();

    // Axis-area divider (so the axis also aligns with the divider)
    const axisDiv = axisSvg.selectAll<SVGLineElement, number>('.name-divider-axis').data([0]);
    axisDiv.enter()
      .append('line')
      .attr('class', 'name-divider-axis');
    axisDiv
      .attr('x1', dividerX)
      .attr('x2', dividerX)
      .attr('y1', 0)
      // y2 will be updated after the axis is rendered so it fits tightly
      .attr('y2', 1)
      .style('stroke', 'rgba(255,255,255,0.06)')
      .style('stroke-width', '1px');
    axisDiv.exit().remove();

    // draw axis into fixed axisG
    axisG.selectAll('*').remove();
    const tickStep = Math.max(1, Math.ceil((maxIdx - minIdx) / 8));
    const tickValues = d3.range(minIdx, maxIdx + 1, tickStep);
    const xAxis = d3.axisBottom(xScale)
      .tickValues(tickValues)
      .tickFormat((d: number) => formatGameMonth(Number(d)));
    // place the axis within the axis SVG; compute a tight height after rendering
    const axisPaddingTop = 6; // small top offset so ticks/labels aren't touching the top
    const axisInner = axisG.append('g').attr('class', 'lifespan-axis x-axis').attr('transform', `translate(0, ${axisPaddingTop})`);
    axisInner.call(xAxis).selectAll('text').style('fill', 'white').style('font-size', '11px');

    // measure the rendered axis and resize the axis SVG to fit its content exactly
    try {
      const bbox = (axisInner.node() as SVGGElement).getBBox();
      const newAxisHeight = Math.max(12, Math.ceil(bbox.y + bbox.height + axisPaddingTop + 6));
      axisSvg.attr('height', newAxisHeight).style('height', `${newAxisHeight}px`);
      // update the axis-area divider to span the new axis height
      axisSvg.selectAll<SVGLineElement, number>('.name-divider-axis').attr('y2', newAxisHeight);
    } catch {
      // if measurement fails, keep the previous height
    }

    // helper: merge adjacent segments when only usernames change
    // Treat null/undefined/empty/'Unknown' as missing values when deciding
    // what username to show for the merged segment. If exactly one unique
    // non-missing username exists across merged ranges, keep it; otherwise
    // leave undefined so higher-level fallbacks are used.
    function normalizeUser(u?: string | null) {
      if (!u) return null;
      const cu = String(u).trim();
      if (cu === '' || cu.toLowerCase() === 'unknown') return null;
      return cu;
    }

    function mergeSegmentsIgnoringUsernames(raw: Segment[]): Segment[] {
      if (!raw || raw.length === 0) return [];
      // sort by start to ensure correct ordering
      const segs = raw.slice().sort((a, b) => (a.start || 0) - (b.start || 0));
      const out: Segment[] = [];
      let cur = Object.assign({}, segs[0]);

      // track seen non-missing usernames across the merged run
      const vsSeen = new Set<string>();
      const discordSeen = new Set<string>();
      const addIf = (set: Set<string>, v?: string | null) => { const n = normalizeUser(v); if (n) set.add(n); };

      addIf(vsSeen, cur.vsUsername ?? null);
      addIf(discordSeen, cur.discordUsername ?? null);

      for (let i = 1; i < segs.length; i++) {
        const s = segs[i];
        // consider canonical aliases equivalent (e.g. 'Locke' vs 'Nightlocke')
        const sCan = findCanonicalAff(s.affiliation ?? null);
        const curCan = findCanonicalAff(cur.affiliation ?? null);
        let affSame = false;
        if (sCan && curCan) affSame = sCan === curCan;
        else affSame = (s.affiliation || '') === (cur.affiliation || '');
        // allow merging when the only differences are usernames or the character's
        // displayed `name`. That is, if affiliation (canonical) and social
        // class are the same we merge adjacent ranges even if their `name`
        // properties differ — usernames are already considered merge-ignorable.
        const classSame = (s.socialClass || '') === (cur.socialClass || '');
        if (affSame && classSame) {
          // merge ranges
          cur.end = Math.max(cur.end || 0, s.end || 0);
          // prefer the later segment's display name so merged ranges reflect
          // the most recent character name shown in-game
          if (s.name && s.name.trim() !== '') cur.name = s.name;
          // record any non-missing usernames
          addIf(vsSeen, s.vsUsername ?? null);
          addIf(discordSeen, s.discordUsername ?? null);
        } else {
          // finalize cur: if exactly one unique non-missing username present, keep it
          cur.vsUsername = vsSeen.size === 1 ? Array.from(vsSeen)[0] : undefined;
          cur.discordUsername = discordSeen.size === 1 ? Array.from(discordSeen)[0] : undefined;
          out.push(cur);
          // start new run
          cur = Object.assign({}, s);
          vsSeen.clear(); discordSeen.clear();
          addIf(vsSeen, cur.vsUsername ?? null);
          addIf(discordSeen, cur.discordUsername ?? null);
        }
      }
      // push last
      cur.vsUsername = vsSeen.size === 1 ? Array.from(vsSeen)[0] : undefined;
      cur.discordUsername = discordSeen.size === 1 ? Array.from(discordSeen)[0] : undefined;
      out.push(cur);
      return out;
    }



    // draw rows
    const rows = rowsG.selectAll<SVGGElement, ProcChar>('.lifespan-row').data(filtered, (d: ProcChar) => d.id);
    const rowsEnter = rows.enter().append('g').attr('class', 'lifespan-row');
    // right-align the name so it sits flush against the timeline divider
    rowsEnter.append('text').attr('class', 'name-label')
      .attr('x', plotLeftOffset - 8)
      .attr('text-anchor', 'end')
      .attr('y', yScale.bandwidth() / 2)
      .attr('dominant-baseline', 'middle')
      .style('fill', 'var(--text)').style('font-size', '12px');
    // no extra tick; names will simply hide when zoomed out

    const rowsMerge = rowsEnter.merge(rows) as d3.Selection<SVGGElement, ProcChar, SVGGElement, ProcChar>;
    rowsMerge.attr('transform', (d: ProcChar) => `translate(0, ${yScale(d.id) || 0})`);
    // ensure label remains vertically centered if bandwidth changes
    rowsMerge.select('.name-label')
      .attr('x', plotLeftOffset - 8)
      .attr('text-anchor', 'end')
      .attr('y', yScale.bandwidth() / 2)
      .attr('dominant-baseline', 'middle')
      .text((d: ProcChar) => ((showNamesFull || showNamesSmall) ? (d.finalName || d.id) : ''))
      .style('display', (showNamesFull || showNamesSmall) ? null : 'none')
      .style('font-size', showNamesFull ? '12px' : (showNamesSmall ? '10px' : '12px'));
    // names are hidden when showNames === false (no ticks shown)

    // segments
    rowsMerge.each(function (d: ProcChar) {
      const g = d3.select(this);
      const rawSegs: Segment[] = d.segments || [];
      const segs: Segment[] = mergeSegmentsIgnoringUsernames(rawSegs);
      const segSel = g.selectAll<SVGRectElement, Segment>('.seg-rect').data(segs, (s: Segment) => `${d.id}::${s.start}::${s.end}`);

      const segEnter = segSel.enter().append('rect').attr('class', 'seg-rect')
        .attr('y', 0)
        .attr('height', Math.max(1, yScale.bandwidth()))
        .style('rx', 3)
        .style('ry', 3)
        .style('rx', 3)
        .style('ry', 3);

      segEnter.merge(segSel)
        .attr('x', (s: Segment) => {
          const a = Math.min(s.start, s.end);
          const left = xScale(a) - extendPx;
          return Math.max(plotLeftOffset, left);
        })
        .attr('width', (s: Segment) => {
          const a = Math.min(s.start, s.end);
          const b = Math.max(s.start, s.end);
          const left = Math.max(plotLeftOffset, xScale(a) - extendPx);
          const right = Math.min(svgClientWidth - PLOT_RIGHT_PADDING, xScale(b) + extendPx);
          return Math.max(1, right - left);
        })
        .attr('height', (s: Segment) => {
          const cls = (s.socialClass || d.finalSocialClass || 'Commoner');
          const mult = barHeightMultiplierFor(cls);
          const baseH = Math.max(1, Math.floor(yScale.bandwidth() * mult));
          // when zoomed out past BAR_SHRINK_START, scale the visible bar height
          if (lifespanZoom <= BAR_SHRINK_START) {
            const sf = Math.max(0, lifespanZoom / BAR_SHRINK_START);
            return Math.max(BAR_MIN_PX, Math.round(baseH * sf));
          }
          return baseH;
        })
        .attr('y', (s: Segment) => {
          const cls = (s.socialClass || d.finalSocialClass || 'Commoner');
          const mult = barHeightMultiplierFor(cls);
          const baseH = Math.max(1, Math.floor(yScale.bandwidth() * mult));
          const h = (lifespanZoom <= BAR_SHRINK_START)
            ? Math.max(BAR_MIN_PX, Math.round(baseH * Math.max(0, lifespanZoom / BAR_SHRINK_START)))
            : baseH;
          return Math.max(0, Math.round((yScale.bandwidth() - h) / 2));
        })
        .style('fill', (s: Segment) => {
          const can = findCanonicalAff(s.affiliation || d.finalAffiliation || 'Wanderer');
          return backdropOf((can as string) || s.affiliation || 'Wanderer');
        })
        // use no stroke when conveying social class via bar height
        .style('stroke', 'none')
        .style('filter', 'url(#lifespan-inner-shadow)');

      segSel.exit().remove();

      // Add an invisible, slightly larger hit target so hovering is easier.
      const segHitSel = g.selectAll<SVGRectElement, Segment>('.seg-hit').data(segs, (s: Segment) => `${d.id}::${s.start}::${s.end}`);
      const segHitEnter = segHitSel.enter().append('rect').attr('class', 'seg-hit')
        .style('fill', 'transparent')
        .style('pointer-events', 'all')
        .style('cursor', 'pointer');

      // Make hit targets exactly match the visible segment rects (no extra padding)
      segHitEnter.merge(segHitSel)
        .attr('x', (s: Segment) => {
          const a = Math.min(s.start, s.end);
          return Math.max(plotLeftOffset, xScale(a) - extendPx);
        })
        .attr('width', (s: Segment) => {
          const a = Math.min(s.start, s.end);
          const b = Math.max(s.start, s.end);
          const left = Math.max(plotLeftOffset, xScale(a) - extendPx);
          const right = Math.min(svgClientWidth - PLOT_RIGHT_PADDING, xScale(b) + extendPx);
          return Math.max(1, right - left);
        })
        .attr('y', (s: Segment) => {
          const cls = (s.socialClass || d.finalSocialClass || 'Commoner');
          const mult = barHeightMultiplierFor(cls);
          const baseH = Math.max(1, Math.floor(yScale.bandwidth() * mult));
          const h = (lifespanZoom <= BAR_SHRINK_START)
            ? Math.max(BAR_MIN_PX, Math.round(baseH * Math.max(0, lifespanZoom / BAR_SHRINK_START)))
            : baseH;
          return Math.max(0, Math.round((yScale.bandwidth() - h) / 2));
        })
        .attr('height', (s: Segment) => {
          const cls = (s.socialClass || d.finalSocialClass || 'Commoner');
          const mult = barHeightMultiplierFor(cls);
          const baseH = Math.max(1, Math.floor(yScale.bandwidth() * mult));
          const h = (lifespanZoom <= BAR_SHRINK_START)
            ? Math.max(BAR_MIN_PX, Math.round(baseH * Math.max(0, lifespanZoom / BAR_SHRINK_START)))
            : baseH;
          return h;
        })
        ;

      segHitSel.exit().remove();

    // end rowsMerge.each
    });

    // centralized hit-testing: choose the nearest segment horizontally and vertically
    // across all seg-rects so tooltip always corresponds to the visually nearest bar.
    try {
      // attach once: d3.on will replace previous handler so safe on repeated updates
      rowsSvg.on('mousemove.hitselect', function (event: MouseEvent) {
        try {
          const nodes = rowsSvg.selectAll<SVGRectElement, unknown>('.seg-rect').nodes();
          let best: SVGRectElement | null = null;
          let bestDist = Infinity;
          const ex = event.clientX; const ey = event.clientY;
          for (const n of nodes) {
            const r = (n as SVGGraphicsElement).getBoundingClientRect();
            // require pointer to be within the visible rect bounds (no extra padding)
            if (ex < r.left || ex > r.right) continue;
            if (ey < r.top || ey > r.bottom) continue;
            const centerY = r.top + r.height / 2;
            const dist = Math.abs(ey - centerY);
            if (dist < bestDist) { bestDist = dist; best = n as SVGRectElement; }
          }
          if (!best) { tooltip.style('display', 'none'); return; }
          // find segment data and parent character datum
          const s = d3.select(best).datum() as Segment | undefined;
          const parent = best.parentElement;
          const ch = parent ? d3.select(parent).datum() as ProcChar : null;
          if (!s) { tooltip.style('display', 'none'); return; }
          const originalAff = s.affiliation || (ch && ch.finalAffiliation) || 'Wanderer';
          const startLabel = formatGameMonth(s.start);
          const endLabel = formatGameMonth(s.end);
          const vsUser = s.vsUsername || (ch && ch.vsUsername) || 'Unknown';
          const discordUser = s.discordUsername || (ch && ch.discordUsername) || 'Unknown';
          const socialClass = s.socialClass || (ch && ch.finalSocialClass) || 'Unknown';
          const segName = s.name || (ch && ch.finalName) || (ch && ch.id) || 'Unknown';
          const finalNameNote = (s.name && ch && ch.finalName && s.name !== ch.finalName) ? ` (final: ${ch.finalName})` : '';
          const html = `<strong>${segName}${finalNameNote}</strong><br/>` +
            `Affiliation: ${originalAff}<br/>` +
            `${startLabel} → ${endLabel}<br/>` +
            `Social class: ${socialClass}<br/>` +
            `VS: ${vsUser}<br/>` +
            `Discord: ${discordUser}`;
          // position tooltip near pointer within container bounds
          try {
            const rectC = container.getBoundingClientRect();
            const left = event.clientX - rectC.left + 12;
            const top = event.clientY - rectC.top + 12;
            tooltip.html(html)
              .style('left', `${Math.max(8, left)}px`)
              .style('top', `${Math.max(8, top)}px`)
              .style('display', 'block');
          } catch {
            tooltip.html(html).style('left', (event.clientX + 12) + 'px').style('top', (event.clientY + 12) + 'px').style('display', 'block');
          }
        } catch { /* ignore inner errors */ }
      });
      rowsSvg.on('mouseleave.hitselect', () => tooltip.style('display', 'none'));
    } catch { /* non-fatal */ }

    rows.exit().remove();

    // Restore scroll position proportionally so the view doesn't jump to top
    try {
      const visiblePortion = Math.max(0, prevContentHeight - rowsContainer.clientHeight);
      let newScrollTop = 0;
      if (visiblePortion > 0) {
        const ratio = prevScrollTop / visiblePortion;
        const newMaxScrollable = Math.max(0, contentHeight - rowsContainer.clientHeight);
        newScrollTop = Math.round(ratio * newMaxScrollable);
      } else {
        // No previous scrollable area — keep top
        newScrollTop = Math.min(prevScrollTop, Math.max(0, contentHeight - rowsContainer.clientHeight));
      }
      rowsContainer.scrollTop = Math.max(0, Math.min(newScrollTop, Math.max(0, contentHeight - rowsContainer.clientHeight)));
    } catch { /* ignore scroll restoration errors */ }

    // record for next update
    lastContentHeight = contentHeight;
  }

  // initial draw
  update();

  return { update };
}

export default { initLifespan };
