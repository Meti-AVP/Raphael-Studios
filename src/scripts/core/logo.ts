// A logo the reader gives a studio (the atelier, the giveaways): read from its file, kept to a sensible size, and
// its ground made clear where it has none (a JPEG's white box would otherwise print as a box).
/** a logo file as a picture with a transparent ground: where it has none, the light ground round its edges is cleared */
export async function cutOut(file: File): Promise<ImageBitmap> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 768 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  let clear = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) clear++;
  if (clear < w * h * 0.01) {
    // opaque: flood the light ground in from the edges (white inside the mark stays)
    const light = (i: number) => d[i * 4] > 232 && d[i * 4 + 1] > 232 && d[i * 4 + 2] > 232;
    const seen = new Uint8Array(w * h);
    const stack: number[] = [];
    for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
    while (stack.length) {
      const i = stack.pop()!;
      if (seen[i] || !light(i)) continue;
      seen[i] = 1;
      d[i * 4 + 3] = 0;
      const x = i % w;
      if (x > 0) stack.push(i - 1);
      if (x < w - 1) stack.push(i + 1);
      if (i >= w) stack.push(i - w);
      if (i < w * (h - 1)) stack.push(i + w);
    }
    g.putImageData(img, 0, 0);
  }
  return createImageBitmap(c);
}
