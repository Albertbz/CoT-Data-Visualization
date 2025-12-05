import { applyCanvasHeight } from './canvassetup';
import overviewModule from './overview';
import comparisonModule from './comparison';

// Apply CSS canvas height var then initialize modules
applyCanvasHeight();
const ov = overviewModule.initOverview();
comparisonModule.initComparison();

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