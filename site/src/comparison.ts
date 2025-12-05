import * as d3 from 'd3';
import { dates, affiliations, canonicalMembers, dateGroups, gameIndices, formatGameMonth, DataEntry } from './data';
import { PLOT_WIDTH, PLOT_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT, MARGIN_LEFT, MARGIN_TOP, MARGIN_BOTTOM } from './canvassetup';
import { backdropOf, colorOf } from './shared';

export function initComparison() {
  const vizContainer = document.getElementById('overview-chart');
  if (!vizContainer) return;
  const compWrap = document.createElement('div');
  compWrap.id = 'compare-controls';
  compWrap.style.display = 'flex';
  compWrap.style.flexDirection = 'column';
  compWrap.style.gap = '8px';
  compWrap.style.marginTop = '12px';

  const buttonRow = document.createElement('div');
  buttonRow.style.display = 'flex';
  buttonRow.style.flexWrap = 'wrap';
  buttonRow.style.gap = '6px';
  buttonRow.style.justifyContent = 'center';
  buttonRow.style.alignItems = 'center';

  const STORAGE_KEY = 'compareActiveAffiliations_v1';

  function loadSavedComparison() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          // filter unknown affiliations for safety
          return new Set<string>(arr.filter((a: string) => affiliations.includes(a)));
        }
      }
    } catch {
      // ignore parse/localStorage errors and fall back to default
    }
    return new Set<string>(affiliations);
  }

  function saveComparison(set: Set<string>) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
    } catch {
      // ignore storage errors (e.g., quota, private mode)
    }
  }

  const STORAGE_KEY_SLIDER = 'compareDateIndex_v1';

  function loadSavedSlider() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SLIDER);
      if (raw) {
        const n = Number(JSON.parse(raw));
        if (!Number.isNaN(n) && Number.isFinite(n)) return Math.trunc(n);
      }
    } catch {
      // ignore
    }
    return dates.length - 1;
  }

  function saveSlider(idx: number) {
    try {
      localStorage.setItem(STORAGE_KEY_SLIDER, JSON.stringify(Number(idx)));
    } catch {
      // ignore
    }
  }

  const comparisonActive = loadSavedComparison();

  // --- Social class toggles ---
  const CLASS_STORAGE_KEY = 'compareActiveClasses_v1';
  const classOptions = ['Commoner', 'Notable', 'Noble', 'Ruler'];

  function loadSavedClasses() {
    try {
      const raw = localStorage.getItem(CLASS_STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return new Set<string>(arr.filter((c: string) => classOptions.includes(c)));
      }
    } catch {
      // ignore
    }
    return new Set<string>(classOptions);
  }

  function saveClasses(set: Set<string>) {
    try {
      localStorage.setItem(CLASS_STORAGE_KEY, JSON.stringify(Array.from(set)));
    } catch {
      // ignore
    }
  }

  const classesActive = loadSavedClasses();

  // Render affiliation buttons as icon above label
  affiliations.forEach(aff => {
    const b = document.createElement('button');
    b.className = 'compare-aff-btn';
    b.dataset['aff'] = aff;

    // icon (image)
    const img = document.createElement('img');
    // try to infer an image path relative to the images directory; fallback to empty
    img.src = `../images/${aff.toLowerCase()}.png`;
    img.alt = aff;
    img.className = 'compare-aff-icon';

    // label below
    const lbl = document.createElement('div');
    lbl.className = 'compare-aff-label';
    lbl.textContent = aff;

    b.appendChild(img);
    b.appendChild(lbl);

    // style using backdrop and text color for this affiliation
    const affBg = backdropOf(aff);
    const affTxt = colorOf(aff, () => '#fff');
    b.style.border = `1px solid ${affBg === 'transparent' ? 'rgba(255,255,255,0.06)' : affBg}`;
    b.style.background = comparisonActive.has(aff) ? affBg : 'transparent';
    b.style.color = affTxt;
    b.style.padding = '6px 8px';
    b.style.borderRadius = '8px';
    b.style.cursor = 'pointer';
    b.style.opacity = comparisonActive.has(aff) ? '1' : '0.6';

    b.addEventListener('click', () => {
      if (comparisonActive.has(aff)) comparisonActive.delete(aff);
      else comparisonActive.add(aff);
      // reflect visual state via background, border and opacity
      b.style.background = comparisonActive.has(aff) ? affBg : 'transparent';
      b.style.opacity = comparisonActive.has(aff) ? '1' : '0.6';
      b.style.border = `1px solid ${comparisonActive.has(aff) ? affBg : 'rgba(255,255,255,0.06)'}`;
      b.style.color = affTxt;
      // persist the changed state
      saveComparison(comparisonActive);
      updateComparisonChart();
    });

    buttonRow.appendChild(b);
  });

  // class toggles row (below affiliations)
  const classRow = document.createElement('div');
  classRow.style.display = 'flex';
  classRow.style.flexWrap = 'wrap';
  classRow.style.gap = '6px';
  classRow.style.justifyContent = 'center';
  classRow.style.alignItems = 'center';
  classRow.style.marginTop = '8px';

  classOptions.forEach(cl => {
    const cb = document.createElement('button');
    cb.className = 'compare-class-btn';
    cb.dataset['cls'] = cl;
    cb.textContent = cl;
    cb.style.padding = '6px 10px';
    cb.style.borderRadius = '6px';
    const col = backdropOf(cl);
    const txt = colorOf(cl, () => '#fff');
    cb.style.border = `1px solid ${col === 'transparent' ? 'rgba(255,255,255,0.08)' : col}`;
    cb.style.background = classesActive.has(cl) ? col : 'transparent';
    cb.style.color = txt;
    cb.style.cursor = 'pointer';
    cb.style.opacity = classesActive.has(cl) ? '1' : '0.35';
    cb.addEventListener('click', () => {
      if (classesActive.has(cl)) classesActive.delete(cl);
      else classesActive.add(cl);
      cb.style.opacity = classesActive.has(cl) ? '1' : '0.35';
      cb.style.background = classesActive.has(cl) ? col : 'transparent';
      cb.style.border = `1px solid ${classesActive.has(cl) ? col : 'rgba(255,255,255,0.08)'}`;
      cb.style.color = txt;
      saveClasses(classesActive);
      updateComparisonChart();
    });
    classRow.appendChild(cb);
  });

  // append affiliation buttons first, then class toggles so classes appear below
  compWrap.appendChild(buttonRow);
  compWrap.appendChild(classRow);

  const parent = vizContainer.parentElement;
  if (parent) {
    let compContainer = document.getElementById('comparison-chart') as HTMLDivElement | null;
    if (!compContainer) {
      compContainer = document.createElement('div');
      compContainer.id = 'comparison-chart';
      compContainer.style.marginTop = '20px';
      try { parent.insertBefore(compContainer, vizContainer.nextSibling); } catch { parent.appendChild(compContainer); }
    }
    compContainer.appendChild(compWrap);
  } else {
    vizContainer.appendChild(compWrap);
  }

  const compSvg = d3.select(compWrap)
    .append('svg')
    .attr('width', CANVAS_WIDTH)
    .attr('height', CANVAS_HEIGHT);

  // slider controls below the chart — stack label above the slider and center
  const sliderWrap = document.createElement('div');
  sliderWrap.style.display = 'flex';
  sliderWrap.style.flexDirection = 'column';
  sliderWrap.style.alignItems = 'center';
  sliderWrap.style.gap = '6px';
  sliderWrap.style.width = '100%';

  const dateLabel = document.createElement('div');
  dateLabel.id = 'compare-date-label';
  dateLabel.style.minWidth = '0';
  dateLabel.style.color = 'var(--muted)';
  dateLabel.style.textAlign = 'center';
  dateLabel.style.fontSize = '13px';
  dateLabel.textContent = '';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'compare-date-slider';
  slider.min = '0';
  slider.max = String(dates.length - 1);
  slider.value = String(dates.length - 1);
  // styling is handled in CSS; keep element attributes here only
  slider.addEventListener('input', () => {
    const i = Number(slider.value);
    const gi = gameIndices[i];
    dateLabel.textContent = formatGameMonth(gi);
    // persist slider selection
    saveSlider(i);
    updateComparisonChart();
  });

  // show date above the slider
  sliderWrap.appendChild(dateLabel);
  sliderWrap.appendChild(slider);
  compWrap.appendChild(sliderWrap);

  let compW = PLOT_WIDTH;
  const compH = PLOT_HEIGHT;
  // create group; we'll set the horizontal translate based on the actual SVG width
  const compG = compSvg.append('g').attr('transform', `translate(0,${MARGIN_TOP})`);

  // outer band: social classes; inner band: affiliations within each class
  const x0 = d3.scaleBand<string>().range([0, compW]).paddingInner(0.2);
  const x1 = d3.scaleBand<string>();
  const yLin = d3.scaleLinear().range([compH, 0]);

  compG.append('g').attr('class', 'x-axis-compare').attr('transform', `translate(0, ${compH})`);
  compG.append('g').attr('class', 'y-axis-compare');

  // axis labels (created once, updated on redraw)
  const xAxisLabel = compG.append('text')
    .attr('class', 'x-axis-label')
    .attr('text-anchor', 'middle')
    .attr('fill', 'white')
    .style('font-size', '13px')
    .text('Social Class');

  const yAxisLabel = compG.append('text')
    .attr('class', 'y-axis-label')
    .attr('text-anchor', 'middle')
    .attr('fill', 'white')
    .style('font-size', '13px')
    .text('# of Characters');

  function getCountsForDate(idx: number) {
    const dateStr = dates[idx];
    // produce one group per social class, each with counts per affiliation
    const groups: { class: string; values: { affiliation: string; count: number }[] }[] = [];
    // preserve classOptions order but filter by active selection
    const classesToUse = classOptions.filter(c => classesActive.has(c));
    classesToUse.forEach(cl => {
      const vals: { affiliation: string; count: number }[] = [];
      affiliations.forEach(aff => {
        // skip affiliations that are not part of the comparison active set
        if (!comparisonActive.has(aff)) return;
        const members = canonicalMembers[aff] || [aff];
        const cnt = members.reduce((s, m) => {
          const entries: DataEntry[] = (dateGroups[dateStr].byAffiliation[m] || []);
          // count only entries whose social class equals this class
          const matched = entries.filter(e => (e['Social Class'] || '') === cl);
          return s + matched.length;
        }, 0);
        vals.push({ affiliation: aff, count: cnt });
      });
      groups.push({ class: cl, values: vals });
    });
    return groups;
  }

  function updateComparisonChart() {
    const i = Number((document.getElementById('compare-date-slider') as HTMLInputElement).value);
    const groups = getCountsForDate(i);
    // remove groups with no values (e.g., no active affiliations)
    const dataToShow = groups.map(g => ({ class: g.class, values: g.values.filter(v => comparisonActive.has(v.affiliation)) })).filter(g => g.values.length > 0);

    compW = PLOT_WIDTH;
    // compute actual SVG width (responsive) and center the plotting group
    const svgNode = compSvg.node() as SVGSVGElement | null;
    const svgWidth = svgNode ? svgNode.getBoundingClientRect().width : CANVAS_WIDTH;
    const left = Math.max(MARGIN_LEFT, (svgWidth - compW) / 2);
    compG.attr('transform', `translate(${left},${MARGIN_TOP})`);
    x0.range([0, compW]).domain(dataToShow.map(d => d.class));
    // inner band domain is affiliations present across groups; we size x1 per-group based on that group's values
    const allAffs = Array.from(new Set(dataToShow.flatMap(d => d.values.map(v => v.affiliation))));
    x1.domain(allAffs).range([0, x0.bandwidth()]).padding(0.1);

    const yMax = d3.max(dataToShow.flatMap(d => d.values.map(v => v.count))) || 1;
    yLin.range([compH, 0]).domain([0, yMax]);

    const xAxis = d3.axisBottom(x0);
    const yAxis = d3.axisLeft(yLin).ticks(5).tickFormat(d3.format('d'));

    compG.select<SVGGElement>('.x-axis-compare').attr('transform', `translate(0, ${compH})`).call(xAxis).selectAll('text').attr('fill', 'white');
    compG.select<SVGGElement>('.y-axis-compare').call(yAxis).selectAll('text').attr('fill', 'white');

    // position axis labels
    xAxisLabel.attr('x', compW / 2).attr('y', compH + MARGIN_BOTTOM - 12);
    yAxisLabel.attr('transform', `translate(${-MARGIN_LEFT + 15},${compH / 2}) rotate(-90)`);

    // groups
    const groupSel = compG.selectAll<SVGGElement, { class: string; values: { affiliation: string; count: number }[] }>('g.comp-group').data(dataToShow, d => d.class);
    const groupEnter = groupSel.enter().append('g').attr('class', 'comp-group').attr('transform', d => `translate(${x0(d.class)},0)`);

    groupEnter.merge(groupSel).attr('transform', d => `translate(${x0(d.class)},0)`);

    // for each group, bind rects to its values
    const groupsAll = compG.selectAll<SVGGElement, { class: string; values: { affiliation: string; count: number }[] }>('g.comp-group');
    groupsAll.each(function(d) {
      const g = d3.select(this);
      const rects = g.selectAll<SVGRectElement, { affiliation: string; count: number }>('rect.comp-bar').data(d.values, v => v.affiliation);
      rects.enter().append('rect')
        .attr('class', 'comp-bar')
        .attr('x', v => x1(v.affiliation) || 0)
        .attr('y', v => yLin(v.count))
        .attr('width', () => x1.bandwidth())
        .attr('height', v => compH - yLin(v.count))
        .attr('fill', v => backdropOf(v.affiliation))
        .attr('opacity', 0.95);
      rects.transition().duration(200)
        .attr('x', v => x1(v.affiliation) || 0)
        .attr('y', v => yLin(v.count))
        .attr('width', () => x1.bandwidth())
        .attr('height', v => compH - yLin(v.count))
        .attr('fill', v => backdropOf(v.affiliation));
      rects.exit().remove();
    });

    groupSel.exit().remove();
  }

  // restore saved slider index (clamp to valid range)
  const savedIdxRaw = loadSavedSlider();
  const savedIdx = Math.max(0, Math.min(dates.length - 1, savedIdxRaw));
  slider.value = String(savedIdx);
  const initIdx = Number(slider.value);
  dateLabel.textContent = formatGameMonth(gameIndices[initIdx]);
  updateComparisonChart();

  return { updateComparisonChart };
}

export default { initComparison };
