import { applyCanvasHeight } from './canvassetup';
import overviewModule from './overview';
import comparisonModule from './comparison';

// Apply CSS canvas height var then initialize modules
applyCanvasHeight();
const ov = overviewModule.initOverview();
comparisonModule.initComparison();

// Listen for date selection events from the overview and forward to comparison slider
document.addEventListener('comparison:date', (ev: Event) => {
  try {
    const detail = (ev as CustomEvent).detail as { index: number } | undefined;
    if (!detail) return;
    const idx = detail.index;
    const slider = document.getElementById('compare-date-slider') as HTMLInputElement | null;
    if (!slider) return;
    // Animate the slider change so the comparison chart updates smoothly.
    try {
      // Cancel any in-flight animation on this slider
      const sliderAny = slider as HTMLInputElement & { _cmpAnimId?: number };
      try { const prev = sliderAny._cmpAnimId; if (prev) cancelAnimationFrame(prev); } catch { }
      const start = Number(slider.value) || 0;
      const end = Number(idx) || 0;
      if (start === end) {
        // still dispatch to ensure chart updates
        slider.value = String(end);
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      const duration = 350; // ms
      const startTime = performance.now();
      const ease = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOutQuad
      let lastValue = start;
      const step = (now: number) => {
        const t = Math.min(1, (now - startTime) / duration);
        const v = Math.round(start + (end - start) * ease(t));
        if (v !== lastValue) {
          slider.value = String(v);
          slider.dispatchEvent(new Event('input', { bubbles: true }));
          lastValue = v;
        }
        if (t < 1) {
          sliderAny._cmpAnimId = requestAnimationFrame(step);
        } else {
          // ensure final value
          slider.value = String(end);
          slider.dispatchEvent(new Event('input', { bubbles: true }));
          try { delete sliderAny._cmpAnimId; } catch { }
        }
      };
      sliderAny._cmpAnimId = requestAnimationFrame(step);
    } catch {
      // fallback: instant update
      slider.value = String(idx);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } catch { /* ignore */ }
});

// Wire top-level chart & grouping buttons to the overview controller (if present)
const btnStack = document.getElementById('chart-stacked') as HTMLButtonElement | null;
const btnLines = document.getElementById('chart-lines') as HTMLButtonElement | null;
const btnGroupAff = document.getElementById('group-aff') as HTMLButtonElement | null;
const btnGroupClass = document.getElementById('group-class') as HTMLButtonElement | null;

if (ov) {
  btnStack?.addEventListener('click', () => { ov.setChartType('stacked'); });
  btnLines?.addEventListener('click', () => { ov.setChartType('lines'); });
  btnGroupAff?.addEventListener('click', () => { ov.setGrouping('affiliation'); });
  btnGroupClass?.addEventListener('click', () => { ov.setGrouping('social'); });
}

console.log('Visualization initialized.');