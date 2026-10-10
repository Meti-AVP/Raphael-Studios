// "Your name on the hill": the reader types their brand and the billboard in the outdoor chapter's painting carries it
// (a canvas texture on the scene's billboard plane). Without 3D, the same poster is shown as a picture under the field.
import { stageReady } from '../stage/handle';
import { fitSize } from '../core/canvas-text';

// the billboard's plane is nearly square (0.93 : 1 in the scene)
const W = 1024;
const H = 1104;

function draw(ctx: CanvasRenderingContext2D, brand: string) {
  const name = brand.trim() || 'Your brand';
  const g = ctx.createRadialGradient(W * 0.72, H * 0.28, 0, W * 0.72, H * 0.28, W * 1.1);
  g.addColorStop(0, '#0f7d74');
  g.addColorStop(0.6, '#0a4f49');
  g.addColorStop(1, '#062b28');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // the name, as large as it fits on one or two lines
  ctx.fillStyle = '#f7f5ee';
  ctx.textBaseline = 'alphabetic';
  const words = name.split(/\s+/);
  const lines = words.length > 1 && name.length > 9 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [name];
  const face = (px: number) => `700 ${px}px Philosopher, Georgia, serif`;
  const longest = lines.reduce((a, l) => (l.length > a.length ? l : a), '');
  const size = Math.max(40, fitSize(ctx, longest, face, W * 0.86, lines.length > 1 ? 230 : 280));
  ctx.font = face(size);
  const lh = size * 0.98;
  const top = H * 0.5 - (lh * (lines.length - 1)) / 2;
  lines.forEach((l, i) => ctx.fillText(l, W * 0.07, top + i * lh));
  ctx.fillStyle = '#3ee0d1';
  ctx.font = `400 ${Math.round(W * 0.085)}px "Imperial Script", cursive`;
  ctx.fillText('Outdoor by Raphael Studios', W * 0.075, H * 0.88);
  ctx.font = `700 ${Math.round(W * 0.07)}px Philosopher, Georgia, serif`;
  ctx.fillStyle = '#f7f5ee';
  ctx.fillText('R', W * 0.07, H * 0.14);
}

export default async function billboard(root: HTMLElement) {
  const input = root.querySelector<HTMLInputElement>('input');
  const preview = root.querySelector<HTMLCanvasElement>('canvas');
  if (!input) return;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  await document.fonts.load('700 40px Philosopher').catch(() => {});
  await document.fonts.load('40px "Imperial Script"').catch(() => {});
  let texture: { needsUpdate: boolean } | null = null;
  const render = () => {
    draw(ctx, input.value);
    if (texture) texture.needsUpdate = true;
    if (preview) {
      const p = preview.getContext('2d')!;
      p.drawImage(canvas, 0, 0, preview.width, preview.height);
    }
  };
  render();
  let raf = 0;
  input.addEventListener('input', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(render);
  });
  // with 3D: put the canvas on the billboard once the outdoor scene's models exist
  const stage = await stageReady;
  const { CanvasTexture, SRGBColorSpace } = await import('three');
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  texture = tex;
  const scene = stage.scenes.find((s) => s?.id === 'outdoor');
  if (!scene) return;
  root.classList.add('is-live');
  const apply = () => {
    if (!input.value.trim()) return; // until the reader types, the hill keeps the studio's own poster
    if (!scene.setPlaneMap('asset-3', tex)) setTimeout(apply, 500);
  };
  input.addEventListener('input', apply, { once: true });
}
