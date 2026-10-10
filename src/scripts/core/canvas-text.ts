// Fitting a line of text on a canvas. Every new font size costs the browser a font lookup (a phone spends tens of
// milliseconds on a handful), so the size is found from one measure at a reference size, not by trying sizes.

/** the largest size (px, at most `max`) at which `text` is no wider than `maxWidth` */
export function fitSize(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, text: string, font: (px: number) => string, maxWidth: number, max: number, tracking = 0) {
  const ref = 100;
  ctx.font = font(ref);
  const width = ctx.measureText(text).width + tracking * ref * Math.max(0, [...text].length - 1);
  if (!(width > 0)) return Math.round(max);
  // a whole pixel, and a hair under, so rounding never makes it spill
  return Math.max(1, Math.min(Math.round(max), Math.floor((ref * maxWidth * 0.99) / width)));
}
