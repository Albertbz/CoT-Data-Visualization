import { affiliations } from './data';
import { colorOf, backdropOf } from './shared';

// Simplified lifespan module — Gantt removed, controls preserved.
export function initLifespan(containerId = 'lifespan-chart') {
  const container = document.getElementById(containerId);
  if (!container) return null;

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

  // Affiliation buttons row
  const affRow = document.createElement('div');
  affRow.style.display = 'flex';
  affRow.style.flexWrap = 'wrap';
  affRow.style.gap = '6px';
  affRow.style.justifyContent = 'center';
  affRow.style.alignItems = 'center';

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

  // ordering controls (kept)
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

  // Placeholder area where the chart used to be.
  const PLACEHOLDER_ID = 'lifespan-placeholder';
  let placeholder = document.getElementById(PLACEHOLDER_ID) as HTMLDivElement | null;
  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.id = PLACEHOLDER_ID;
    placeholder.style.width = '100%';
    placeholder.style.height = '400px';
    placeholder.style.display = 'flex';
    placeholder.style.alignItems = 'center';
    placeholder.style.justifyContent = 'center';
    placeholder.style.color = 'var(--muted)';
    placeholder.style.background = 'transparent';
    placeholder.textContent = 'Lifespan chart removed — controls preserved.';
    container.appendChild(placeholder);
  }

  // API compatibility: expose update() as a no-op (placeholder kept intentionally)
  function update(_newData?: unknown) {
    // no rendering for now; kept for callers that expect an update method
    return;
  }

  return { update };
}

export default { initLifespan };
