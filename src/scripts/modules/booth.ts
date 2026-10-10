// The events studio: instant prints on a table. Each print is a rigid card: held by the point you grab (a soft
// spring, so it turns to trail your hand like a real one), slowed by the table's friction, bouncing off the table's
// edges and the camera. The camera hands out the studio's event pictures (or, if you allow it, a picture of you,
// which never leaves your device); a fresh print develops over a few seconds, and you can take it home.
import { onTick } from '../core/ticker';
import { finePointer, reduceMotion } from '../core/env';
import { whatsapp } from '../core/whatsapp';

interface Photo {
  src: string;
  alt: string;
  caption: string;
}

interface Card {
  el: HTMLElement;
  /** centre (px on the table), turn (rad), and their speeds */
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  va: number;
  /** size (px) */
  w: number;
  h: number;
  /** held: the grabbed point in the card's own frame, and where the hand is */
  hold: { lx: number; ly: number; tx: number; ty: number; id: number } | null;
  /** coming out of the camera: time since it started */
  eject: number | null;
  born: number;
}

const MAX_CARDS = 8;
const EJECT_TIME = 1.5;

export default function booth(root: HTMLElement) {
  const stage = root.querySelector<HTMLElement>('.booth__stage');
  const table = root.querySelector<HTMLElement>('[data-booth-table]');
  const camera = root.querySelector<HTMLElement>('[data-booth-camera-body]');
  const form = root.querySelector<HTMLFormElement>('[data-booth-form]');
  const first = table?.querySelector<HTMLElement>('.polaroid');
  if (!stage || !table || !camera || !form || !first) return;
  const template = first.cloneNode(true) as HTMLElement;
  const queue: Photo[] = JSON.parse(root.dataset.photos || '[]');
  let next = 0;
  /** the caption, sized by its length (long event names get smaller writing) */
  const setCaption = (el: HTMLElement, text: string) => {
    const f = el.querySelector<HTMLElement>('figcaption')!;
    f.textContent = text;
    f.style.setProperty('--len', String(Math.max(8, text.length)));
  };
  const flash = root.querySelector<HTMLElement>('.booth__flash')!;
  const video = root.querySelector<HTMLVideoElement>('.booth__live')!;
  const caption = root.querySelector<HTMLElement>('[data-booth-caption]');
  const hint = root.querySelector<HTMLElement>('[data-booth-hint]');
  const shootBtn = root.querySelector<HTMLButtonElement>('[data-booth-shoot]')!;
  const liveBtn = root.querySelector<HTMLButtonElement>('[data-booth-live]')!;
  const saveBtn = root.querySelector<HTMLButtonElement>('[data-booth-save]')!;
  const privacy = root.querySelector<HTMLElement>('[data-booth-privacy]');
  const input = form.querySelector<HTMLInputElement>('input[name="event"]')!;
  if (hint && !finePointer) hint.textContent = 'Slide the prints around · tap the camera';

  // the table, in CSS pixels
  let W = stage.clientWidth;
  let H = stage.clientHeight;
  let camRect = { x0: 0, y0: 0, x1: 0, y1: 0, slotX: 0, slotY: 0 };
  const measureCamera = () => {
    const s = stage.getBoundingClientRect();
    const c = camera.getBoundingClientRect();
    const k = c.width / 360; // the drawing's units
    camRect = {
      x0: c.left - s.left + 14 * k,
      y0: c.top - s.top + 20 * k,
      x1: c.left - s.left + 346 * k,
      y1: c.top - s.top + 232 * k,
      slotX: c.left - s.left + 180 * k,
      slotY: c.top - s.top + 229 * k,
    };
  };

  const cards: Card[] = [];
  let z = 10;
  const place = (c: Card) => {
    c.el.style.transform = `translate3d(${(c.x - c.w / 2).toFixed(2)}px, ${(c.y - c.h / 2).toFixed(2)}px, 0) rotate(${c.a.toFixed(4)}rad)`;
  };
  // the prints already on the table: take over from their CSS placement
  for (const el of table.querySelectorAll<HTMLElement>('.polaroid')) {
    const st = getComputedStyle(el);
    const x = (parseFloat(st.getPropertyValue('--x')) / 100) * W;
    const y = (parseFloat(st.getPropertyValue('--y')) / 100) * H;
    const a = (parseFloat(st.getPropertyValue('--r')) * Math.PI) / 180;
    cards.push({ el, x, y, a, vx: 0, vy: 0, va: 0, w: el.offsetWidth, h: el.offsetHeight, hold: null, eject: null, born: 0 });
    el.style.zIndex = String(z++);
  }
  root.classList.add('is-live-physics');
  measureCamera();
  cards.forEach(place);

  new ResizeObserver(() => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    for (const c of cards) {
      c.x *= w / W;
      c.y *= h / H;
      c.w = c.el.offsetWidth;
      c.h = c.el.offsetHeight;
      place(c);
    }
    W = w;
    H = h;
    measureCamera();
  }).observe(stage);

  // ---------------------------------------------------------------------------------------------------- physics
  const inertia = (c: Card) => (c.w * c.w + c.h * c.h) / 12;
  const corners = (c: Card) => {
    const hw = c.w / 2;
    const hh = c.h / 2;
    const co = Math.cos(c.a);
    const si = Math.sin(c.a);
    return [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ].map(([lx, ly]) => ({ rx: lx * co - ly * si, ry: lx * si + ly * co }));
  };
  /** push a corner out of a wall with an impulse at that corner (restitution e) */
  const bounce = (c: Card, rx: number, ry: number, nx: number, ny: number, depth: number, I: number) => {
    c.x += nx * depth;
    c.y += ny * depth;
    const vx = c.vx - c.va * ry;
    const vy = c.vy + c.va * rx;
    const vn = vx * nx + vy * ny;
    if (vn >= 0) return;
    const rn = rx * ny - ry * nx;
    const j = (-(1 + 0.35) * vn) / (1 + (rn * rn) / I);
    c.vx += j * nx;
    c.vy += j * ny;
    c.va += (rn * j) / I;
    // the edge also rubs: lose some sliding along it
    c.vx *= 0.9;
    c.vy *= 0.9;
    c.va *= 0.9;
  };

  const step = (c: Card, dt: number) => {
    const I = inertia(c);
    let w = c.va;
    if (c.hold) {
      // the hand pulls the grabbed point through a soft spring; the card turns about it
      const co = Math.cos(c.a);
      const si = Math.sin(c.a);
      const rx = c.hold.lx * co - c.hold.ly * si;
      const ry = c.hold.lx * si + c.hold.ly * co;
      const vax = c.vx - w * ry;
      const vay = c.vy + w * rx;
      const k = 520;
      const d = 2 * Math.sqrt(k) * 0.85;
      const fx = k * (c.hold.tx - (c.x + rx)) - d * vax;
      const fy = k * (c.hold.ty - (c.y + ry)) - d * vay;
      c.vx += fx * dt;
      c.vy += fy * dt;
      w += ((rx * fy - ry * fx) / I) * dt;
      // a fingertip pressing on paper also resists turning (friction under the finger)
      w -= w * Math.min(1, 7 * dt);
    }
    // the table's friction: a steady drag against sliding and turning (Coulomb), as paper on a tabletop
    const speed = Math.hypot(c.vx, c.vy);
    const slow = W * 1.6 * dt;
    if (speed <= slow) {
      c.vx = 0;
      c.vy = 0;
    } else {
      c.vx -= (c.vx / speed) * slow;
      c.vy -= (c.vy / speed) * slow;
    }
    const turnSlow = 7 * dt;
    w = Math.abs(w) <= turnSlow ? 0 : w - Math.sign(w) * turnSlow;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.a += w * dt;
    c.va = w;
    // the table's edges and the camera
    for (const { rx, ry } of corners(c)) {
      const px = c.x + rx;
      const py = c.y + ry;
      if (px < 0) bounce(c, rx, ry, 1, 0, -px, I);
      if (px > W) bounce(c, rx, ry, -1, 0, px - W, I);
      if (py < 0) bounce(c, rx, ry, 0, 1, -py, I);
      if (py > H) bounce(c, rx, ry, 0, -1, py - H, I);
      const r = camRect;
      if (px > r.x0 && px < r.x1 && py > r.y0 && py < r.y1) {
        // out by the nearest side (mostly down: the camera sits at the top)
        const dl = px - r.x0, dr = r.x1 - px, du = py - r.y0, dd = r.y1 - py;
        const m = Math.min(dl, dr, du, dd);
        if (m === dd) bounce(c, rx, ry, 0, 1, dd, I);
        else if (m === dl) bounce(c, rx, ry, -1, 0, dl, I);
        else if (m === dr) bounce(c, rx, ry, 1, 0, dr, I);
        else bounce(c, rx, ry, 0, -1, du, I);
      }
    }
  };

  /** the print coming out of the slot, in the motor's short pushes, then let go onto the table */
  const ejectStep = (c: Card, dt: number) => {
    c.eject! += dt;
    const t = Math.min(1, c.eject! / EJECT_TIME);
    const motor = t + Math.sin(t * Math.PI * 7) * 0.018 * (1 - t);
    c.x = camRect.slotX;
    c.y = camRect.slotY - c.h / 2 + 4 + motor * (c.h * 0.92);
    c.a = 0;
    if (t >= 1) {
      c.eject = null;
      // it drops out with a little push and a turn
      c.vy = W * (0.55 + Math.random() * 0.35);
      c.vx = W * (Math.random() - 0.5) * 0.7;
      c.va = (Math.random() - 0.5) * 3;
    }
  };

  let running = false;
  const tick = (_t: number, dt: number) => {
    if (!running) return;
    const h = Math.min(dt, 1 / 30) / 4;
    let moving = false;
    for (const c of cards) {
      if (c.eject !== null) {
        ejectStep(c, h * 4);
        moving = true;
      } else {
        for (let i = 0; i < 4; i++) step(c, h);
        if (c.hold || Math.abs(c.vx) + Math.abs(c.vy) > 0.5 || Math.abs(c.va) > 0.002) moving = true;
      }
      place(c);
    }
    if (!moving) running = false;
  };
  onTick(tick);
  const wake = () => (running = true);

  // ------------------------------------------------------------------------------------------------- the hand
  const toStage = (e: PointerEvent) => {
    const s = stage.getBoundingClientRect();
    return { x: e.clientX - s.left, y: e.clientY - s.top };
  };
  table.addEventListener('pointerdown', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.polaroid');
    const c = el && cards.find((k) => k.el === el);
    if (!c || c.eject !== null) return;
    e.preventDefault();
    el!.setPointerCapture(e.pointerId);
    const p = toStage(e);
    const co = Math.cos(-c.a);
    const si = Math.sin(-c.a);
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    c.hold = { lx: dx * co - dy * si, ly: dx * si + dy * co, tx: p.x, ty: p.y, id: e.pointerId };
    el!.style.zIndex = String(++z);
    el!.classList.add('is-held');
    wake();
  });
  table.addEventListener('pointermove', (e) => {
    const c = cards.find((k) => k.hold?.id === e.pointerId);
    if (!c) return;
    const p = toStage(e);
    c.hold!.tx = p.x;
    c.hold!.ty = p.y;
    wake();
  });
  const drop = (e: PointerEvent) => {
    const c = cards.find((k) => k.hold?.id === e.pointerId);
    if (!c) return;
    c.hold = null;
    c.el.classList.remove('is-held');
    wake();
  };
  table.addEventListener('pointerup', drop);
  table.addEventListener('pointercancel', drop);

  // ------------------------------------------------------------------------------------------------ the camera
  let stream: MediaStream | null = null;
  const eventName = () => input.value.trim();
  const newCard = (src: string, alt: string, text: string) => {
    const el = template.cloneNode(true) as HTMLElement;
    const img = el.querySelector('img')!;
    img.src = src;
    img.alt = alt;
    img.loading = 'eager';
    setCaption(el, text);
    el.style.zIndex = String(++z);
    if (!reduceMotion) el.classList.add('is-developing');
    // under the camera's front while it comes out (the motor shakes the camera a little)
    table.appendChild(el);
    if (!reduceMotion) {
      camera.classList.add('is-ejecting');
      setTimeout(() => camera.classList.remove('is-ejecting'), EJECT_TIME * 1000);
    }
    const c: Card = { el, x: camRect.slotX, y: camRect.slotY, a: 0, vx: 0, vy: 0, va: 0, w: el.offsetWidth, h: el.offsetHeight, hold: null, eject: reduceMotion ? null : 0, born: performance.now() };
    if (reduceMotion) {
      c.x = W * (0.2 + Math.random() * 0.6);
      c.y = H * (0.55 + Math.random() * 0.25);
      c.a = (Math.random() - 0.5) * 0.4;
    }
    cards.push(c);
    place(c);
    // the oldest print that nobody holds leaves the table
    if (cards.length > MAX_CARDS) {
      const old = cards.find((k) => !k.hold && k.eject === null);
      if (old) {
        cards.splice(cards.indexOf(old), 1);
        old.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400 }).onfinish = () => old.el.remove();
        const src = old.el.querySelector('img')?.src;
        if (src?.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(src), 500);
      }
    }
    last = c;
    saveBtn.disabled = false;
    wake();
    return c;
  };
  let last: Card | null = null;
  let busy = false;

  const shoot = async () => {
    if (busy) return;
    busy = true;
    camera.classList.add('is-shooting');
    flash.classList.remove('is-on');
    void flash.offsetWidth;
    flash.classList.add('is-on');
    setTimeout(() => camera.classList.remove('is-shooting'), 180);
    const name = eventName();
    // the camera is on but has not shown a frame yet: wait for it (a moment), rather than print someone else
    if (stream && !video.videoWidth)
      await new Promise<void>((r) => {
        const t = setTimeout(r, 1500);
        video.addEventListener('loadeddata', () => (clearTimeout(t), r()), { once: true });
      });
    if (stream && video.videoWidth) {
      // the picture of you: a square from the middle of the frame, as a mirror shows it
      const s = Math.min(video.videoWidth, video.videoHeight);
      const cv = document.createElement('canvas');
      cv.width = cv.height = 640;
      const x = cv.getContext('2d')!;
      x.translate(640, 0);
      x.scale(-1, 1);
      x.drawImage(video, (video.videoWidth - s) / 2, (video.videoHeight - s) / 2, s, s, 0, 0, 640, 640);
      const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/jpeg', 0.9));
      if (blob) newCard(URL.createObjectURL(blob), 'Your picture from the instant camera', name || 'Me, at the booth');
    } else {
      const p = queue[next++ % queue.length];
      newCard(p.src, p.alt, name || p.caption);
    }
    if (caption) caption.textContent = name ? `Printed for ${name}` : 'Fresh from the camera';
    setTimeout(() => (busy = false), 700);
  };
  shootBtn.addEventListener('click', shoot);
  camera.addEventListener('click', shoot);

  const stopCamera = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
    root.classList.remove('is-camera-on');
    liveBtn.textContent = 'Use my camera';
    if (privacy) privacy.hidden = true;
  };
  liveBtn.addEventListener('click', async () => {
    if (stream) return stopCamera();
    if (!navigator.mediaDevices?.getUserMedia) {
      liveBtn.textContent = 'No camera here';
      liveBtn.disabled = true;
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 960 } }, audio: false });
      video.srcObject = stream;
      await video.play();
      root.classList.add('is-camera-on');
      liveBtn.textContent = 'Stop my camera';
      if (privacy) privacy.hidden = false;
      if (caption) caption.textContent = 'Smile: you are in the lens';
    } catch {
      stopCamera();
      if (caption) caption.textContent = 'No camera: the studio’s pictures, then';
    }
  });
  // the camera goes off when the booth leaves the screen
  new IntersectionObserver((es) => {
    if (!es[es.length - 1].isIntersecting && stream) stopCamera();
  }).observe(stage);

  // ------------------------------------------------------------------------------------------ take it home
  saveBtn.addEventListener('click', async () => {
    const c = last ?? cards[cards.length - 1];
    if (!c) return;
    const img = c.el.querySelector('img')!;
    await img.decode().catch(() => {});
    await document.fonts.load('80px "Imperial Script"').catch(() => {});
    // the print at 10 px per millimetre
    const cv = document.createElement('canvas');
    cv.width = 880;
    cv.height = 1070;
    const x = cv.getContext('2d')!;
    x.fillStyle = '#f4f1ea';
    x.fillRect(0, 0, 880, 1070);
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    x.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 45, 45, 790, 790);
    x.fillStyle = '#213a6b';
    x.font = '400 92px "Imperial Script", cursive';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(c.el.querySelector('figcaption')!.textContent || '', 440, 952, 790);
    x.fillStyle = 'rgba(40,40,28,0.45)';
    x.font = '700 20px Philosopher, Georgia, serif';
    x.textAlign = 'right';
    x.fillText('RAPHAEL STUDIOS · EVENTS', 835, 1040);
    const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/jpeg', 0.92));
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(eventName() || 'raphael-studios-event').replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}-print.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  // ---------------------------------------------------------------------------------------------- the order
  const order = root.querySelector<HTMLAnchorElement>('[data-booth-order]');
  const updateOrder = () => {
    if (!order) return;
    const n = eventName();
    const msg = `Hello Raphael Studios, we are planning ${n ? `an event (${n})` : 'an event'} and would like a branded photo booth with instant prints for our guests.`;
    order.href = whatsapp(msg);
  };
  input.addEventListener('input', () => {
    updateOrder();
    // the name goes on the newest print too, while it is still fresh
    if (last && eventName() && performance.now() - last.born < 12000) setCaption(last.el, eventName());
  });
  updateOrder();
}
