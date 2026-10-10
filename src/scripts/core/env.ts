// What the device can do. Read once; components ask here instead of re-testing media queries.
const html = document.documentElement;

export const reduceMotion = html.classList.contains('reduce-motion');
export const finePointer = html.classList.contains('fine-pointer');
export const isTouch = !finePointer;

let tierCache: 0 | 1 | 2 | null = null;

/**
 * A rough device tier for 3D: 0 = no WebGL scenes (posters only), 1 = light, 2 = full. Decided from what the
 * browser tells for free (no WebGL probe: that alone costs a context). Software rendering is caught where a
 * renderer is really created (isSoftwareRenderer), and the scene then steps back to its poster.
 */
export function gpuTier(): 0 | 1 | 2 {
  if (tierCache !== null) return tierCache;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const memory = nav.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  if (reduceMotion || nav.connection?.saveData || memory <= 2 || cores <= 2 || !('WebGL2RenderingContext' in window)) return (tierCache = 0);
  return (tierCache = isTouch || memory <= 4 || cores <= 4 ? 1 : 2);
}

/** true when WebGL runs on the CPU (SwiftShader, llvmpipe…): too slow for these scenes */
export function isSoftwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  return /swiftshader|llvmpipe|software|basic render/i.test(name);
}

/** A 3D scene could not start: expected on software WebGL (the poster stays), a real error otherwise. */
export function glFailed(name: string, err: unknown) {
  if (/software WebGL/.test(String(err))) console.info(`[${name}] ${String((err as Error)?.message ?? err)}`);
  else console.error(`[${name}] 3D unavailable`, err);
}
