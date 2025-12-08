
import { affiliations, processedCharacterData, formatGameMonth, dates, gameMonthIndexFor, canonicalMembers } from './data';
import { colorOf, backdropOf } from './shared';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLOT_LEFT, PLOT_WIDTH, PLOT_HEIGHT } from './canvassetup';
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

  // ordering controls
  const orderRow = document.createElement('div');
  orderRow.style.display = 'flex';
  orderRow.style.gap = '8px';
  orderRow.style.justifyContent = 'center';
  type Order = 'start-asc' | 'end-asc' | 'duration-desc' | 'alpha';
  let order: Order = 'start-asc';
  const orderButtons: { id: Order; label: string }[] = [
    { id: 'start-asc', label: 'Start (earliest)' },
    { id: 'end-asc', label: 'End (earliest)' },
    { id: 'duration-desc', label: 'Duration (longest)' },
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

  const rowsSvg = d3.select(rowsContainer)
    .append('svg')
    .attr('width', CANVAS_WIDTH)
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
    .attr('width', CANVAS_WIDTH)
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
    const chars = (processedCharacterData as ProcChar[]).slice();
    const filtered = chars.filter((ch) => {
      const segs: Segment[] = ch.segments || [];
      for (const s of segs) {
        const can = findCanonicalAff(s.affiliation || ch.finalAffiliation || 'Wanderer');
        if (can && activeAffiliations.has(can)) return true;
      }
      return false;
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
    const NAME_COL_WIDTH = 140; // px reserved on the left for character names (reduced)
    const plotLeftOffset = PLOT_LEFT + NAME_COL_WIDTH;
    // Extend the x-axis range slightly to the right so the axis and bars
    // reach closer to the SVG edge (leave a small padding of 16px).
    const xScale = d3.scaleLinear().domain([minIdx, maxIdx]).range([plotLeftOffset, CANVAS_WIDTH - 16]);

    // rows sizing
    const rowHeight = 26;
    const contentHeight = Math.max(PLOT_HEIGHT, ids.length * rowHeight + 8);
    // set both the SVG attribute and inline style height to override global CSS
    rowsSvg.attr('height', contentHeight).style('height', `${contentHeight}px`);

    const yScale = d3.scaleBand<string>().domain(ids).range([0, ids.length * rowHeight]).padding(0.15);

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

    // Bar height multipliers per social class (relative to the row band).
    // Change these constants to tweak visual weight for each class.
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

    // draw rows
    const rows = rowsG.selectAll<SVGGElement, ProcChar>('.lifespan-row').data(filtered, (d: ProcChar) => d.id);
    const rowsEnter = rows.enter().append('g').attr('class', 'lifespan-row');
    rowsEnter.append('text').attr('class', 'name-label').attr('x', 8).attr('y', 0)
      .attr('dy', '0.75em').style('fill', 'var(--text)').style('font-size', '12px');

    const rowsMerge = rowsEnter.merge(rows) as d3.Selection<SVGGElement, ProcChar, SVGGElement, ProcChar>;
    rowsMerge.attr('transform', (d: ProcChar) => `translate(0, ${yScale(d.id) || 0})`);
    rowsMerge.select('.name-label').text((d: ProcChar) => d.finalName || d.id);

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
        .style('ry', 3)
        .on('mousemove', function (event: MouseEvent, s: Segment) {
          const originalAff = s.affiliation || d.finalAffiliation || 'Wanderer';
          const startLabel = formatGameMonth(s.start);
          const endLabel = formatGameMonth(s.end);
          const vsUser = s.vsUsername || d.vsUsername || 'Unknown';
          const discordUser = s.discordUsername || d.discordUsername || 'Unknown';
          const socialClass = s.socialClass || d.finalSocialClass || 'Unknown';
          const segName = s.name || d.finalName || d.id;
          const finalNameNote = (s.name && d.finalName && s.name !== d.finalName) ? ` (final: ${d.finalName})` : '';
          const html = `<strong>${segName}${finalNameNote}</strong><br/>` +
            `Affiliation: ${originalAff}<br/>` +
            `${startLabel} → ${endLabel}<br/>` +
            `Social class: ${socialClass}<br/>` +
            `VS: ${vsUser}<br/>` +
            `Discord: ${discordUser}`;
          try {
            const rect = container.getBoundingClientRect();
            const left = event.clientX - rect.left + 12;
            const top = event.clientY - rect.top + 12;
            tooltip.html(html)
              .style('left', `${Math.max(8, left)}px`)
              .style('top', `${Math.max(8, top)}px`)
              .style('display', 'block');
          } catch {
            tooltip.html(html)
              .style('left', (event.clientX + 12) + 'px')
              .style('top', (event.clientY + 12) + 'px')
              .style('display', 'block');
          }
        })
        .on('mouseleave', () => tooltip.style('display', 'none'));

      segEnter.merge(segSel)
        .attr('x', (s: Segment) => xScale(Math.min(s.start, s.end)))
        .attr('width', (s: Segment) => Math.max(1, xScale(Math.max(s.end, s.start)) - xScale(Math.min(s.start, s.end))))
        .attr('height', (s: Segment) => {
          const cls = (s.socialClass || d.finalSocialClass || 'Commoner');
          const mult = barHeightMultiplierFor(cls);
          const h = Math.max(1, Math.floor(yScale.bandwidth() * mult));
          return h;
        })
        .attr('y', (s: Segment) => {
          const cls = (s.socialClass || d.finalSocialClass || 'Commoner');
          const mult = barHeightMultiplierFor(cls);
          const h = Math.max(1, Math.floor(yScale.bandwidth() * mult));
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
    });

    rows.exit().remove();

    // reset scroll to top for deterministic UX when filters change
    rowsContainer.scrollTop = 0;
  }

  // initial draw
  update();

  return { update };
}

export default { initLifespan };
