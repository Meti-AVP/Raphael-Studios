// Typed access to the prepared images (tools/content/build_media.py writes media.generated.json and the files).
import type { ImageMetadata } from 'astro';
import generated from './media.generated.json';

export interface MediaEntry {
  id: string;
  alt: string;
  chapter?: string;
  file: string;
  width: number;
  height: number;
  alpha: boolean;
  top: string;
  bottom: string;
  /** the subject cut out (bbox: left, top, right, bottom as fractions of the picture) */
  subject?: { file: string; plate: string; bbox: [number, number, number, number] };
  depth?: string;
  /** the picture as a line drawing (the 3D chapter's wireframe reveal) */
  lines?: string;
}

const files = import.meta.glob<{ default: ImageMetadata }>('../assets/media/*.{jpg,png}', { eager: true });
const all = generated as unknown as Record<string, MediaEntry>;

export function media(id: string): MediaEntry {
  const m = all[id];
  if (!m) throw new Error(`Unknown media id "${id}" (run tools/content/build_media.py?)`);
  return m;
}

export function file(name: string): ImageMetadata {
  const f = files[`../assets/media/${name}`];
  if (!f) throw new Error(`Missing image file ${name}`);
  return f.default;
}

export const allMedia = all;
