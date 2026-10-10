// One requestAnimationFrame loop for the whole page: smooth scroll, 3D scenes and effects all hang off it,
// so the browser never runs competing loops. Subscribers get the time (ms) and the frame delta (s).
type Tick = (time: number, delta: number) => void;

const subscribers = new Set<Tick>();
let last = 0;
let running = false;
let frame = 0;

function loop(time: number) {
  const delta = last ? Math.min(0.1, (time - last) / 1000) : 1 / 60;
  last = time;
  for (const fn of subscribers) fn(time, delta);
  frame = requestAnimationFrame(loop);
}

export function onTick(fn: Tick): () => void {
  subscribers.add(fn);
  if (!running) {
    running = true;
    last = 0;
    frame = requestAnimationFrame(loop);
  }
  return () => {
    subscribers.delete(fn);
    if (!subscribers.size && running) {
      running = false;
      cancelAnimationFrame(frame);
    }
  };
}
