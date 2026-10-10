// The shelf at the end of the page (components/Shelf.astro), after the product slider of Agrumea's site (agua):
//   * a mouse drag moves it the way agua's does: the shelf follows 7.5% of the way each frame, keeps the speed of the
//     release (x18) and slows by 8% a frame; the first 8 px decide whether the hand means across or down (down is left
//     to the page); fingers scroll it natively;
//   * under the pointer a card fills with the letters of its chapter's name: they fall in, bounce, roll and pile up
//     (round bodies under gravity, against the card's walls and each other), and fade when the pointer leaves.
import { finePointer, reduceMotion } from '../core/env';

const FOLLOW = 0.075;
const DECAY = 0.92;
const THROW = 18;
const LOCK = 8;

interface Body {
  el: HTMLElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  r: number;
}

export default function shelf(root: HTMLElement) {
  const track = root.querySelector<HTMLElement>('[data-shelf-track]');
  if (!track) return;
  drag(track);
  if (finePointer && !reduceMotion) track.querySelectorAll<HTMLElement>('[data-shelf-card]').forEach(letters);
}

function drag(track: HTMLElement) {
  const s = { id: -1, startX: 0, startY: 0, start: 0, lastX: 0, lastT: 0, dist: 0, vel: 0, momentum: 0, at: 0, to: 0, raf: 0, axis: '' as '' | 'x' | 'y' };
  let swallow = false;
  const max = () => Math.max(0, track.scrollWidth - track.clientWidth);
  const clamp = (v: number) => Math.max(0, Math.min(max(), v));
  const frame = () => {
    s.raf = 0;
    if (s.axis !== 'x' && Math.abs(s.momentum) > 0.05) {
      const next = clamp(s.to + s.momentum);
      if (Math.abs(next - s.to) < 0.05) s.momentum = 0;
      else {
        s.to = next;
        s.momentum *= DECAY;
        if (Math.abs(s.momentum) < 0.05) s.momentum = 0;
      }
    }
    s.at += (s.to - s.at) * FOLLOW;
    if (Math.abs(s.to - s.at) < 0.5) s.at = s.to;
    track.scrollLeft = s.at;
    if (s.axis === 'x' || Math.abs(s.to - s.at) >= 0.5 || Math.abs(s.momentum) > 0.05) s.raf = requestAnimationFrame(frame);
  };
  const run = () => {
    if (!s.raf) s.raf = requestAnimationFrame(frame);
  };
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    s.id = e.pointerId;
    s.startX = s.lastX = e.clientX;
    s.startY = e.clientY;
    s.at = s.to = s.start = track.scrollLeft;
    s.lastT = e.timeStamp || performance.now();
    s.dist = 0;
    s.vel = 0;
    s.momentum = 0;
    s.axis = '';
  });
  track.addEventListener('pointermove', (e) => {
    if (s.id === -1 || e.pointerId !== s.id) return;
    if (!s.axis) {
      const dx = Math.abs(e.clientX - s.startX);
      const dy = Math.abs(e.clientY - s.startY);
      if (dx <= LOCK && dy <= LOCK) return;
      if (dy > dx) {
        s.axis = 'y';
        s.id = -1;
        return;
      }
      s.axis = 'x';
      track.classList.add('is-dragging');
      track.setPointerCapture(e.pointerId);
    }
    const dx = e.clientX - s.startX;
    const t = e.timeStamp || performance.now();
    s.vel = s.vel * 0.76 + ((e.clientX - s.lastX) / Math.max(1, t - s.lastT)) * 0.24;
    s.lastX = e.clientX;
    s.lastT = t;
    s.dist = Math.max(s.dist, Math.abs(dx));
    s.to = clamp(s.start - dx);
    run();
  });
  const end = (e: PointerEvent) => {
    if (s.id === -1 || e.pointerId !== s.id) return;
    const wasX = s.axis === 'x';
    track.classList.remove('is-dragging');
    if (wasX) track.releasePointerCapture?.(e.pointerId);
    s.id = -1;
    s.axis = '';
    if (wasX) {
      s.momentum = -s.vel * THROW;
      run();
      if (s.dist > LOCK) {
        swallow = true;
        setTimeout(() => (swallow = false), 0);
      }
    }
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  track.addEventListener('click', (e) => swallow && (e.preventDefault(), e.stopPropagation()), true);
  track.addEventListener('dragstart', (e) => e.preventDefault());
  // the wheel and the keys move it natively: keep the smooth follow in step
  track.addEventListener('scroll', () => {
    if (!s.raf && s.id === -1) s.at = s.to = track.scrollLeft;
  });
}

function letters(card: HTMLElement) {
  const box = card.querySelector<HTMLElement>('[data-shelf-fall]');
  const word = (card.dataset.word || '').replace(/\s+/g, '');
  if (!box || !word) return;
  let bodies: Body[] = [];
  let raf = 0;
  let active = false;
  let spawnAt: number[] = [];
  let clearT = 0;

  const start = () => {
    active = true;
    clearTimeout(clearT);
    bodies.forEach((b) => b.el.remove());
    bodies = [];
    const w = card.clientWidth;
    const size = Math.round(w / 5.2);
    const now = performance.now();
    spawnAt = [...word].map((_, i) => now + i * 70);
    [...word].forEach((ch, i) => {
      const el = document.createElement('span');
      el.className = 'shelf__letter';
      el.textContent = ch.toUpperCase();
      el.style.fontSize = `${size}px`;
      el.style.opacity = '0';
      box.appendChild(el);
      bodies.push({ el, x: size * 0.6 + Math.random() * (w - size * 1.2), y: -size * (1 + i * 0.25), vx: (Math.random() - 0.5) * 2, vy: 0, a: (Math.random() - 0.5) * 0.8, va: (Math.random() - 0.5) * 0.1, r: size * 0.42 });
    });
    if (!raf) raf = requestAnimationFrame(step);
  };
  const stop = () => {
    active = false;
    bodies.forEach((b) => b.el.classList.add('is-out'));
    clearT = window.setTimeout(() => {
      bodies.forEach((b) => b.el.remove());
      bodies = [];
    }, 420);
  };

  let last = 0;
  const step = (t: number) => {
    raf = 0;
    const dt = Math.min(1 / 30, last ? (t - last) / 1000 : 1 / 60);
    last = t;
    const w = card.clientWidth;
    const h = card.clientHeight;
    const g = 2600; // px/s^2: agua's fruit fall heavily (its gravity 3.5)
    let moving = false;
    // a few small steps per frame keep the pile steady
    const sub = 3;
    for (let k = 0; k < sub; k++) {
      const d = dt / sub;
      for (const [i, b] of bodies.entries()) {
        if (t < spawnAt[i]) continue;
        b.vy += g * d;
        b.x += b.vx * d * 60;
        b.y += b.vy * d;
        b.a += b.va;
      }
      // walls and floor (the card's inside)
      for (const [i, b] of bodies.entries()) {
        if (t < spawnAt[i]) continue;
        if (b.y > h - b.r - 10) {
          b.y = h - b.r - 10;
          if (b.vy > 0) b.vy *= -0.28;
          b.vx *= 0.9;
          b.va = (b.vx * 60) / b.r / 60; // rolling
        }
        if (b.x < b.r + 6) {
          b.x = b.r + 6;
          b.vx = Math.abs(b.vx) * 0.5;
        }
        if (b.x > w - b.r - 6) {
          b.x = w - b.r - 6;
          b.vx = -Math.abs(b.vx) * 0.5;
        }
      }
      // each other: push apart along the line between centres, trade a little speed
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          if (t < spawnAt[i] || t < spawnAt[j]) continue;
          const a = bodies[i];
          const b = bodies[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.01;
          const min = a.r + b.r;
          if (dist >= min) continue;
          const nx = dx / dist;
          const ny = dy / dist;
          const push = (min - dist) / 2;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          const rel = (b.vx * 60 - a.vx * 60) * nx + (b.vy - a.vy) * ny;
          if (rel < 0) {
            const imp = -rel * 0.6;
            a.vx -= (nx * imp) / 2 / 60;
            a.vy -= (ny * imp) / 2;
            b.vx += (nx * imp) / 2 / 60;
            b.vy += (ny * imp) / 2;
          }
          a.va += nx * 0.004;
          b.va -= nx * 0.004;
        }
      }
    }
    for (const [i, b] of bodies.entries()) {
      if (t < spawnAt[i]) continue;
      b.va *= 0.96;
      if (b.el.style.opacity === '0') b.el.style.opacity = '1';
      b.el.style.transform = `translate3d(${(b.x - b.r * 1.1).toFixed(1)}px, ${(b.y - b.r * 1.2).toFixed(1)}px, 0) rotate(${b.a.toFixed(3)}rad)`;
      if (Math.abs(b.vy) > 4 || Math.abs(b.vx) > 0.05) moving = true;
    }
    if (bodies.length && (moving || spawnAt.some((s) => t < s))) raf = requestAnimationFrame(step);
    else last = 0;
  };

  card.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse' && !card.closest('.is-dragging')) start();
  });
  card.addEventListener('pointerleave', () => active && stop());
  card.addEventListener('focus', start);
  card.addEventListener('blur', () => active && stop());
}
