// Canvas setup constants and helper to export canvas height to CSS
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 550;
export const MARGIN_TOP = 50;
export const MARGIN_LEFT = 50;
export const MARGIN_RIGHT = 50;
export const MARGIN_BOTTOM = 50;

export const PLOT_LEFT = MARGIN_LEFT;
export const PLOT_TOP = MARGIN_TOP;
export const PLOT_WIDTH = CANVAS_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // 700
export const PLOT_HEIGHT = CANVAS_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM; // 300
export const PLOT_RIGHT = PLOT_LEFT + PLOT_WIDTH; // 750
export const PLOT_BOTTOM = PLOT_TOP + PLOT_HEIGHT; // 350

// Export helper to set CSS custom property for canvas height
export function applyCanvasHeight() {
  try {
    document.documentElement.style.setProperty('--canvas-height', `${CANVAS_HEIGHT + 20}px`);
  } catch { }
}

export default {};
