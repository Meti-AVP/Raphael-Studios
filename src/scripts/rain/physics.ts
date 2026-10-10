// A small rigid-body world for the giveaways: bodies made of spheres, capsules and boxes, falling under gravity,
// colliding with each other and with the ground and the walls, with friction and a little bounce.
//
// The solver is extended position-based dynamics with small steps (Müller et al., "Detailed Rigid Body Simulation
// with Extended Position Based Dynamics", 2020): each step moves the bodies, pushes overlapping shapes apart
// (with static friction), takes the velocities from the motion, then applies the bounce and the sliding friction.
// Contacts are found fresh in every step. Good enough for a pile of thirty things, cheap enough for a phone.
import { Matrix3, Matrix4, Quaternion, Vector3 } from 'three';

export type Shape =
  | { kind: 'sphere'; r: number; c: Vector3 }
  | { kind: 'capsule'; r: number; a: Vector3; b: Vector3 }
  | { kind: 'box'; h: Vector3; c: Vector3; q: Quaternion };

export interface BodyOptions {
  mass: number;
  shapes: Shape[];
  /** half sizes of the box that approximates the body (for its inertia), unless it is a ball */
  size?: Vector3;
  /** a hollow ball (a beach ball): its inertia is 2/3 m r² */
  hollow?: boolean;
  /** air drag per second (light things float down) */
  drag?: number;
  restitution?: number;
  friction?: number;
}

export class Body {
  x = new Vector3();
  q = new Quaternion();
  v = new Vector3();
  w = new Vector3();
  prevX = new Vector3();
  prevQ = new Quaternion();
  invMass: number;
  /** inverse inertia in the body's frame (diagonal) */
  invI = new Vector3();
  shapes: Shape[];
  /** world-space copies of the shapes, refreshed each step */
  world: Shape[];
  radius = 0;
  drag: number;
  restitution: number;
  friction: number;
  /** pulled by the hand: a point on the body (its frame), where the hand is, and how hard */
  hold: { local: Vector3; target: Vector3 } | null = null;
  /** touching something in the last step */
  touching = false;
  private rot = new Matrix3();

  constructor(o: BodyOptions) {
    this.invMass = 1 / o.mass;
    this.shapes = o.shapes;
    this.world = o.shapes.map(cloneShape);
    this.drag = o.drag ?? 0.15;
    this.restitution = o.restitution ?? 0.3;
    this.friction = o.friction ?? 0.55;
    const ball = o.shapes.length === 1 && o.shapes[0].kind === 'sphere' ? o.shapes[0] : null;
    if (ball && !o.size) {
      const k = (o.hollow ? 2 / 3 : 2 / 5) * o.mass * ball.r * ball.r;
      this.invI.set(1 / k, 1 / k, 1 / k);
    } else {
      const s = o.size ?? new Vector3(0.05, 0.05, 0.05);
      const m = o.mass;
      const dx = s.x * 2, dy = s.y * 2, dz = s.z * 2;
      this.invI.set(12 / (m * (dy * dy + dz * dz)), 12 / (m * (dx * dx + dz * dz)), 12 / (m * (dx * dx + dy * dy)));
    }
    // how far the body reaches from its centre (for the broad check)
    for (const sh of o.shapes) {
      if (sh.kind === 'sphere') this.radius = Math.max(this.radius, sh.c.length() + sh.r);
      else if (sh.kind === 'capsule') this.radius = Math.max(this.radius, sh.a.length() + sh.r, sh.b.length() + sh.r);
      else this.radius = Math.max(this.radius, sh.c.length() + sh.h.length());
    }
  }

  /** I⁻¹ v, in world space */
  applyInvI(v: Vector3, out: Vector3) {
    this.rot.setFromMatrix4(_m4.makeRotationFromQuaternion(this.q));
    out.copy(v).applyMatrix3(_m3.copy(this.rot).transpose());
    out.set(out.x * this.invI.x, out.y * this.invI.y, out.z * this.invI.z);
    return out.applyMatrix3(this.rot);
  }

  /** the shapes in world space */
  refresh() {
    for (let i = 0; i < this.shapes.length; i++) {
      const s = this.shapes[i];
      const t = this.world[i];
      if (s.kind === 'sphere' && t.kind === 'sphere') t.c.copy(s.c).applyQuaternion(this.q).add(this.x);
      else if (s.kind === 'capsule' && t.kind === 'capsule') {
        t.a.copy(s.a).applyQuaternion(this.q).add(this.x);
        t.b.copy(s.b).applyQuaternion(this.q).add(this.x);
      } else if (s.kind === 'box' && t.kind === 'box') {
        t.c.copy(s.c).applyQuaternion(this.q).add(this.x);
        t.q.copy(this.q).multiply(s.q);
      }
    }
  }
}

const _m4 = new Matrix4();
const _m3 = new Matrix3();

function cloneShape(s: Shape): Shape {
  if (s.kind === 'sphere') return { kind: 'sphere', r: s.r, c: s.c.clone() };
  if (s.kind === 'capsule') return { kind: 'capsule', r: s.r, a: s.a.clone(), b: s.b.clone() };
  return { kind: 'box', h: s.h.clone(), c: s.c.clone(), q: s.q.clone() };
}

interface Contact {
  a: Body;
  b: Body | null;
  /** the normal pushes `a` out of `b` */
  n: Vector3;
  depth: number;
  /** the touching points (world) */
  pa: Vector3;
  pb: Vector3;
  /** the same points in each body's own frame (to follow them through the step) */
  la: Vector3;
  lb: Vector3;
  lambda: number;
  /** the normal speed before the step (for the bounce) */
  vn0: number;
}

export interface Bounds {
  /** the ground's height and the walls (x and z), inside which everything stays */
  floor: number;
  x: number;
  z: number;
}

const G = -9.81;

export class World {
  bodies: Body[] = [];
  private contacts: Contact[] = [];
  /** steps per frame: more is stiffer and steadier */
  substeps = 10;
  private still = 0;
  running = true;
  bounds: Bounds;

  constructor(bounds: Bounds) {
    this.bounds = bounds;
  }

  add(b: Body) {
    this.bodies.push(b);
    b.refresh();
    this.wake();
  }

  remove(b: Body) {
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
  }

  wake() {
    this.running = true;
    this.still = 0;
  }

  /** advance by dt seconds; false once everything has come to rest */
  step(dt: number): boolean {
    if (!this.running) return false;
    const h = Math.min(dt, 1 / 30) / this.substeps;
    for (let s = 0; s < this.substeps; s++) this.substep(h);
    // a body the solver lost (it cannot happen, but if it did it would spoil everything it touched): back on top
    for (const b of this.bodies) {
      if (Number.isFinite(b.x.x + b.x.y + b.x.z + b.q.x + b.q.y + b.q.z + b.q.w)) continue;
      b.x.set(0, 0.8, 0);
      b.q.identity();
      b.v.set(0, 0, 0);
      b.w.set(0, 0, 0);
      b.refresh();
    }
    // things lying on something and barely moving come to a stop (the solver's last tremble, damped out)
    for (const b of this.bodies) {
      if (b.hold || !b.touching) continue;
      if (b.v.lengthSq() < 0.0016 && b.w.lengthSq() < 0.16) {
        b.v.multiplyScalar(0.5);
        b.w.multiplyScalar(0.5);
      }
    }
    // at rest: nothing held, nothing moving, for half a second
    let moving = false;
    for (const b of this.bodies) if (b.hold || b.v.lengthSq() > 0.0009 || b.w.lengthSq() > 0.01) moving = true;
    this.still = moving ? 0 : this.still + dt;
    if (this.still > 0.5) {
      for (const b of this.bodies) {
        b.v.set(0, 0, 0);
        b.w.set(0, 0, 0);
      }
      this.running = false;
    }
    return true;
  }

  private substep(h: number) {
    const bodies = this.bodies;
    // 1. move freely
    for (const b of bodies) {
      b.prevX.copy(b.x);
      b.prevQ.copy(b.q);
      const damp = Math.exp(-b.drag * h);
      b.v.y += G * h;
      b.v.multiplyScalar(damp);
      b.w.multiplyScalar(Math.exp(-0.25 * h));
      b.x.addScaledVector(b.v, h);
      integrateRotation(b.q, b.w, h);
      b.refresh();
    }
    // 2. contacts, pushed apart (and held still by static friction)
    this.collide();
    for (const c of this.contacts) solvePosition(c);
    // the hand
    for (const b of bodies) if (b.hold) solveHold(b, h);
    // 3. velocities from the motion
    for (const b of bodies) {
      b.v.subVectors(b.x, b.prevX).divideScalar(h);
      _dq.copy(b.q).multiply(_qi.copy(b.prevQ).invert());
      b.w.set(_dq.x, _dq.y, _dq.z).multiplyScalar((2 / h) * (_dq.w >= 0 ? 1 : -1));
    }
    // 4. bounce and sliding friction
    for (const c of this.contacts) solveVelocity(c, h);
  }

  private collide() {
    this.contacts.length = 0;
    for (const b of this.bodies) b.touching = false;
    const { floor, x: X, z: Z } = this.bounds;
    const bodies = this.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      // the ground and the walls
      for (const s of a.world) planeContacts(a, s, floor, X, Z, this.contacts);
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        const rr = a.radius + b.radius;
        if (a.x.distanceToSquared(b.x) > rr * rr) continue;
        for (const sa of a.world) for (const sb of b.world) shapeContacts(a, sa, b, sb, this.contacts);
      }
    }
  }
}

const _dq = new Quaternion();
const _qi = new Quaternion();
const _t1 = new Vector3();
const _t2 = new Vector3();
const _t3 = new Vector3();
const _t4 = new Vector3();
const _ra = new Vector3();
const _rb = new Vector3();

function integrateRotation(q: Quaternion, w: Vector3, h: number) {
  const hx = 0.5 * h * w.x, hy = 0.5 * h * w.y, hz = 0.5 * h * w.z;
  const { x, y, z, w: qw } = q;
  q.set(x + hx * qw + hy * z - hz * y, y + hy * qw + hz * x - hx * z, z + hz * qw + hx * y - hy * x, qw - hx * x - hy * y - hz * z).normalize();
}

/** a positional push p at r (world offset from the centre) */
function pushPosition(b: Body, p: Vector3, r: Vector3, sign: number) {
  b.x.addScaledVector(p, sign * b.invMass);
  const dw = b.applyInvI(_t3.crossVectors(r, p).multiplyScalar(sign), _t4);
  integrateRotation(b.q, dw, 1); // q += ½ [dw, 0] q
}

/** how hard a body is to move at r along n */
function generalisedInvMass(b: Body, r: Vector3, n: Vector3) {
  const rn = _t1.crossVectors(r, n);
  const irn = b.applyInvI(rn, _t2);
  return b.invMass + rn.dot(irn);
}

function solvePosition(c: Contact) {
  const { a, b, n } = c;
  // where the touching points are now (they moved with the bodies since detection)
  _ra.copy(c.la).applyQuaternion(a.q);
  const pa = _t1.copy(_ra).add(a.x);
  let pbx = c.pb.x, pby = c.pb.y, pbz = c.pb.z;
  if (b) {
    _rb.copy(c.lb).applyQuaternion(b.q);
    pbx = b.x.x + _rb.x;
    pby = b.x.y + _rb.y;
    pbz = b.x.z + _rb.z;
  }
  const depth = -((pa.x - pbx) * n.x + (pa.y - pby) * n.y + (pa.z - pbz) * n.z);
  if (depth <= 0) return;
  const wa = generalisedInvMass(a, _ra, n);
  const wb = b ? generalisedInvMass(b, _rb, n) : 0;
  const dl = depth / (wa + wb);
  c.lambda += dl;
  const p = _t3.copy(n).multiplyScalar(dl);
  const pCopy = p.clone();
  pushPosition(a, pCopy, _ra, 1);
  if (b) pushPosition(b, pCopy, _rb, -1);
  a.refresh();
  b?.refresh();
  // static friction: undo the sliding of the touching points during this step, if the grip allows it
  const mu = Math.min(a.friction, b?.friction ?? 0.6);
  const now = _ra.clone().add(a.x);
  const before = c.la.clone().applyQuaternion(a.prevQ).add(a.prevX);
  const d = now.sub(before);
  if (b) {
    const nb = _rb.clone().add(b.x);
    const bb = c.lb.clone().applyQuaternion(b.prevQ).add(b.prevX);
    d.sub(nb.sub(bb));
  }
  const dt = d.addScaledVector(n, -d.dot(n));
  const slide = dt.length();
  if (slide < 1e-9) return;
  const t = dt.divideScalar(slide);
  const wta = generalisedInvMass(a, _ra, t);
  const wtb = b ? generalisedInvMass(b, _rb, t) : 0;
  const lt = slide / (wta + wtb);
  if (lt > mu * c.lambda) return; // it slips: sliding friction (in the velocity pass) takes over
  const q = t.multiplyScalar(-lt);
  pushPosition(a, q, _ra, 1);
  if (b) pushPosition(b, q, _rb, -1);
  a.refresh();
  b?.refresh();
}

function solveVelocity(c: Contact, h: number) {
  const { a, b, n } = c;
  _ra.copy(c.la).applyQuaternion(a.q);
  const va = _t1.copy(a.w).cross(_ra).add(a.v);
  if (b) {
    _rb.copy(c.lb).applyQuaternion(b.q);
    va.sub(_t2.copy(b.w).cross(_rb).add(b.v));
  }
  const vn = va.dot(n);
  const vt = va.clone().addScaledVector(n, -vn);
  const vtLen = vt.length();
  const dv = new Vector3();
  // sliding friction: at most mu times this step's normal impulse (lambda / h), as a change of the relative speed
  // (an impulse divided by how hard the touching points are to move along the slide)
  if (c.lambda > 0 && vtLen > 1e-6) {
    const mu = Math.min(a.friction, b?.friction ?? 0.6);
    const t = vt.divideScalar(vtLen);
    const wt = generalisedInvMass(a, _ra, t) + (b ? generalisedInvMass(b, _rb, t) : 0);
    dv.addScaledVector(t, -Math.min(mu * (c.lambda / h) * wt, vtLen));
  }
  // the bounce (only for real impacts: resting contact gets none)
  if (c.lambda > 0) {
    const e = Math.abs(c.vn0) > 2 * 9.81 * h * 4 ? Math.min(a.restitution, b?.restitution ?? 0.4) : 0;
    dv.addScaledVector(n, -vn + Math.max(-e * c.vn0, 0));
  }
  const len = dv.length();
  if (len < 1e-9) return;
  const dir = _t3.copy(dv).divideScalar(len);
  const w = generalisedInvMass(a, _ra, dir) + (b ? generalisedInvMass(b, _rb, dir) : 0);
  const p = dir.multiplyScalar(len / w);
  a.v.addScaledVector(p, a.invMass);
  a.w.add(a.applyInvI(_t4.crossVectors(_ra, p), new Vector3()));
  if (b) {
    b.v.addScaledVector(p, -b.invMass);
    b.w.sub(b.applyInvI(_t4.crossVectors(_rb, p), new Vector3()));
  }
}

/** the hand: a soft pull of the held point towards the pointer */
function solveHold(b: Body, h: number) {
  const hold = b.hold!;
  const r = hold.local.clone().applyQuaternion(b.q);
  const n = r.clone().add(b.x).sub(hold.target).negate();
  const len = n.length();
  if (len < 1e-7) return;
  n.divideScalar(len);
  const w = generalisedInvMass(b, r, n);
  // a soft pull: a quarter of the gap per step, so the object swings from the point where it is held
  void h;
  pushPosition(b, n.multiplyScalar((len / w) * 0.25), r, 1);
  b.refresh();
  // a hand also steadies what it holds
  b.v.multiplyScalar(0.995);
  b.w.multiplyScalar(0.985);
}

// ------------------------------------------------------------------------------------------------ contacts

function addContact(out: Contact[], a: Body, b: Body | null, n: Vector3, depth: number, pa: Vector3, pb: Vector3) {
  a.touching = true;
  if (b) b.touching = true;
  const la = pa.clone().sub(a.x).applyQuaternion(_qi.copy(a.q).invert());
  const lb = b ? pb.clone().sub(b.x).applyQuaternion(_qi.copy(b.q).invert()) : new Vector3();
  // the closing speed before this step's corrections
  const ra = pa.clone().sub(a.x);
  const va = a.w.clone().cross(ra).add(a.v);
  if (b) {
    const rb = pb.clone().sub(b.x);
    va.sub(b.w.clone().cross(rb).add(b.v));
  }
  out.push({ a, b, n: n.clone(), depth, pa: pa.clone(), pb: pb.clone(), la, lb, lambda: 0, vn0: va.dot(n) });
}

/** a sphere (centre c, radius r) against the ground and the walls */
function sphereVsBounds(a: Body, c: Vector3, r: number, floor: number, X: number, Z: number, out: Contact[]) {
  const planes: [number, number, number, number][] = [
    [0, 1, 0, floor],
    [1, 0, 0, -X],
    [-1, 0, 0, -X],
    [0, 0, 1, -Z],
    [0, 0, -1, -Z],
  ];
  for (const [nx, ny, nz, d] of planes) {
    const dist = c.x * nx + c.y * ny + c.z * nz - d;
    if (dist >= r) continue;
    const n = _t1.set(nx, ny, nz);
    const pa = _t2.copy(c).addScaledVector(n, -r);
    const pb = _t3.copy(c).addScaledVector(n, -dist);
    addContact(out, a, null, n, r - dist, pa, pb);
  }
}

function planeContacts(a: Body, s: Shape, floor: number, X: number, Z: number, out: Contact[]) {
  if (s.kind === 'sphere') sphereVsBounds(a, s.c, s.r, floor, X, Z, out);
  else if (s.kind === 'capsule') {
    sphereVsBounds(a, s.a, s.r, floor, X, Z, out);
    sphereVsBounds(a, s.b, s.r, floor, X, Z, out);
  } else for (const p of boxCorners(s)) sphereVsBounds(a, p, 0, floor, X, Z, out);
}

const _corners = Array.from({ length: 8 }, () => new Vector3());
function boxCorners(s: Extract<Shape, { kind: 'box' }>) {
  let k = 0;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) _corners[k++].set(sx * s.h.x, sy * s.h.y, sz * s.h.z).applyQuaternion(s.q).add(s.c);
  return _corners;
}

function closestOnSegment(p: Vector3, a: Vector3, b: Vector3, out: Vector3) {
  const ab = _t4.subVectors(b, a);
  const t = Math.max(0, Math.min(1, _t1.subVectors(p, a).dot(ab) / Math.max(1e-12, ab.lengthSq())));
  return out.copy(a).addScaledVector(ab, t);
}

/** closest points of two segments (p1-q1, p2-q2) */
function closestSegments(p1: Vector3, q1: Vector3, p2: Vector3, q2: Vector3, c1: Vector3, c2: Vector3) {
  const d1 = new Vector3().subVectors(q1, p1);
  const d2 = new Vector3().subVectors(q2, p2);
  const r = new Vector3().subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s = 0, t = 0;
  if (a <= 1e-12 && e <= 1e-12) {
    s = t = 0;
  } else if (a <= 1e-12) {
    t = Math.max(0, Math.min(1, f / e));
  } else {
    const c = d1.dot(r);
    if (e <= 1e-12) s = Math.max(0, Math.min(1, -c / a));
    else {
      const b = d1.dot(d2);
      const den = a * e - b * b;
      s = den > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.max(0, Math.min(1, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.max(0, Math.min(1, (b - c) / a));
      }
    }
  }
  c1.copy(p1).addScaledVector(d1, s);
  c2.copy(p2).addScaledVector(d2, t);
}

function spheres(a: Body, ca: Vector3, ra: number, b: Body, cb: Vector3, rb: number, out: Contact[]) {
  const d = new Vector3().subVectors(ca, cb);
  const dist = d.length();
  const pen = ra + rb - dist;
  if (pen <= 0) return;
  const n = dist > 1e-9 ? d.divideScalar(dist) : new Vector3(0, 1, 0);
  addContact(out, a, b, n, pen, ca.clone().addScaledVector(n, -ra), cb.clone().addScaledVector(n, rb));
}

const _qp = new Quaternion();
/** where a point attached to a body (now at p, world) was at the start of the step */
function previous(b: Body, p: Vector3) {
  return p.clone().sub(b.x).applyQuaternion(_qi.copy(b.q).invert()).applyQuaternion(b.prevQ).add(b.prevX);
}

/** a sphere against a box: the box's nearest point (from inside, out by the face it came through) */
function sphereBox(sa: Body, c: Vector3, r: number, bb: Body, box: Extract<Shape, { kind: 'box' }>, out: Contact[], flip: boolean) {
  const inv = _qi.copy(box.q).invert();
  const local = c.clone().sub(box.c).applyQuaternion(inv);
  const h = box.h;
  const cl = new Vector3(Math.max(-h.x, Math.min(h.x, local.x)), Math.max(-h.y, Math.min(h.y, local.y)), Math.max(-h.z, Math.min(h.z, local.z)));
  let n: Vector3;
  let pen: number;
  const d = local.clone().sub(cl);
  const dist = d.length();
  if (dist > 1e-9) {
    if (dist >= r) return;
    n = d.divideScalar(dist);
    pen = r - dist;
  } else {
    // the centre is inside: out through the face it came in by (where it was at the start of this step, in the
    // box's frame of then), or, if it was already inside, through the nearest face
    const pPrev = previous(sa, c);
    const cPrev = previous(bb, box.c);
    const qPrev = _qp.copy(bb.prevQ).multiply(_qi.copy(bb.q).invert()).multiply(box.q).invert();
    const lp = pPrev.sub(cPrev).applyQuaternion(qPrev);
    const ox = Math.abs(lp.x) - h.x, oy = Math.abs(lp.y) - h.y, oz = Math.abs(lp.z) - h.z;
    const dx = h.x - Math.abs(local.x), dy = h.y - Math.abs(local.y), dz = h.z - Math.abs(local.z);
    const came = Math.max(ox, oy, oz) > -1e-5;
    if (came ? ox >= oy && ox >= oz : dx <= dy && dx <= dz) {
      n = new Vector3(Math.sign(local.x) || 1, 0, 0);
      cl.x = n.x * h.x;
      pen = dx + r;
    } else if (came ? oy >= oz : dy <= dz) {
      n = new Vector3(0, Math.sign(local.y) || 1, 0);
      cl.y = n.y * h.y;
      pen = dy + r;
    } else {
      n = new Vector3(0, 0, Math.sign(local.z) || 1);
      cl.z = n.z * h.z;
      pen = dz + r;
    }
  }
  const nw = n.applyQuaternion(box.q);
  const onBox = cl.applyQuaternion(box.q).add(box.c);
  const onSphere = c.clone().addScaledVector(nw, -r);
  if (!flip) addContact(out, sa, bb, nw, pen, onSphere, onBox);
  else addContact(out, bb, sa, nw.negate(), pen, onBox, onSphere);
}

type Box = Extract<Shape, { kind: 'box' }>;
const axesOf = (s: Box) => [new Vector3(1, 0, 0).applyQuaternion(s.q), new Vector3(0, 1, 0).applyQuaternion(s.q), new Vector3(0, 0, 1).applyQuaternion(s.q)];
const half = (s: Box, k: number) => (k === 0 ? s.h.x : k === 1 ? s.h.y : s.h.z);

/** two boxes: the separating axis with the least overlap (15 candidates), then either the incident face clipped
 *  against the reference face (up to 8 points), or the closest points of two edges */
function boxBox(a: Body, sa: Box, b: Body, sb: Box, out: Contact[]) {
  const A = axesOf(sa);
  const B = axesOf(sb);
  const d = new Vector3().subVectors(sb.c, sa.c);
  const radius = (axes: Vector3[], s: Box, L: Vector3) => Math.abs(axes[0].dot(L)) * s.h.x + Math.abs(axes[1].dot(L)) * s.h.y + Math.abs(axes[2].dot(L)) * s.h.z;
  let best = Infinity;
  let bestAxis: Vector3 | null = null;
  let kind: 'a' | 'b' | 'e' = 'a';
  let bi = 0, bj = 0;
  const test = (L: Vector3, k: 'a' | 'b' | 'e', i: number, j: number, bias: number) => {
    const pen = radius(A, sa, L) + radius(B, sb, L) - Math.abs(d.dot(L));
    if (pen < 0) return false;
    if (pen * bias < best) {
      best = pen * bias;
      bestAxis = L.clone();
      kind = k;
      bi = i;
      bj = j;
    }
    return true;
  };
  for (let i = 0; i < 3; i++) if (!test(A[i], 'a', i, 0, 1)) return;
  for (let j = 0; j < 3; j++) if (!test(B[j], 'b', 0, j, 1)) return;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const L = new Vector3().crossVectors(A[i], B[j]);
      const l = L.length();
      if (l < 1e-5) continue;
      // edges only win clearly: faces give steadier contacts
      if (!test(L.divideScalar(l), 'e', i, j, 1.08)) return;
    }
  if (!bestAxis) return;
  const axis: Vector3 = bestAxis;
  // the normal from a to b
  const n = d.dot(axis) < 0 ? axis.clone().negate() : axis.clone();
  if (kind === 'e') {
    const depth = best / 1.08;
    // the edge of each box nearest the other
    const ea = sa.c.clone();
    for (let k = 0; k < 3; k++) if (k !== bi) ea.addScaledVector(A[k], (A[k].dot(n) > 0 ? 1 : -1) * half(sa, k));
    const eb = sb.c.clone();
    for (let k = 0; k < 3; k++) if (k !== bj) eb.addScaledVector(B[k], (B[k].dot(n) > 0 ? -1 : 1) * half(sb, k));
    const pa = new Vector3();
    const pb = new Vector3();
    closestSegments(
      ea.clone().addScaledVector(A[bi], -half(sa, bi)),
      ea.clone().addScaledVector(A[bi], half(sa, bi)),
      eb.clone().addScaledVector(B[bj], -half(sb, bj)),
      eb.clone().addScaledVector(B[bj], half(sb, bj)),
      pa,
      pb,
    );
    addContact(out, b, a, n, depth, pb, pa);
    return;
  }
  // a face: the reference box owns it, the other box's most opposed face is clipped against it
  const refIsA = kind === 'a';
  const R = refIsA ? sa : sb;
  const I = refIsA ? sb : sa;
  const RA = refIsA ? A : B;
  const IA = refIsA ? B : A;
  const k = refIsA ? bi : bj;
  const nRef = refIsA ? n.clone() : n.clone().negate(); // from the reference box towards the incident one
  const sign = RA[k].dot(nRef) > 0 ? 1 : -1;
  const fc = R.c.clone().addScaledVector(RA[k], sign * half(R, k));
  const u = RA[(k + 1) % 3];
  const v = RA[(k + 2) % 3];
  const hu = half(R, (k + 1) % 3);
  const hv = half(R, (k + 2) % 3);
  // the incident face
  let m = 0;
  let md = -Infinity;
  for (let q = 0; q < 3; q++) {
    const dd = Math.abs(IA[q].dot(nRef));
    if (dd > md) {
      md = dd;
      m = q;
    }
  }
  const isg = IA[m].dot(nRef) > 0 ? -1 : 1;
  const ic = I.c.clone().addScaledVector(IA[m], isg * half(I, m));
  const iu = IA[(m + 1) % 3].clone().multiplyScalar(half(I, (m + 1) % 3));
  const iv = IA[(m + 2) % 3].clone().multiplyScalar(half(I, (m + 2) % 3));
  let poly = [
    ic.clone().add(iu).add(iv),
    ic.clone().sub(iu).add(iv),
    ic.clone().sub(iu).sub(iv),
    ic.clone().add(iu).sub(iv),
  ];
  // clip by the reference face's four side planes
  const clip = (pts: Vector3[], dir: Vector3, limit: number) => {
    const res: Vector3[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const dp = dir.dot(_t1.subVectors(p, fc)) - limit;
      const dq = dir.dot(_t1.subVectors(q, fc)) - limit;
      if (dp <= 0) res.push(p);
      if (dp * dq < 0) res.push(p.clone().lerp(q, dp / (dp - dq)));
    }
    return res;
  };
  poly = clip(poly, u, hu);
  poly = clip(poly, u.clone().negate(), hu);
  poly = clip(poly, v, hv);
  poly = clip(poly, v.clone().negate(), hv);
  const Rb = refIsA ? a : b;
  const Ib = refIsA ? b : a;
  for (const p of poly) {
    const sep = _t1.subVectors(p, fc).dot(nRef);
    if (sep >= 0) continue;
    addContact(out, Ib, Rb, nRef, -sep, p, p.clone().addScaledVector(nRef, -sep));
  }
}

function shapeContacts(a: Body, sa: Shape, b: Body, sb: Shape, out: Contact[]) {
  if (sa.kind === 'box' && sb.kind === 'box') return boxBox(a, sa, b, sb, out);
  if (sa.kind === 'box') return shapeContacts(b, sb, a, sa, out);
  // sa is a sphere or a capsule
  if (sb.kind === 'box') {
    if (sa.kind === 'sphere') return sphereBox(a, sa.c, sa.r, b, sb, out, false);
    // a capsule against a box: its ends and middle as balls
    const mid = sa.a.clone().add(sa.b).multiplyScalar(0.5);
    for (const p of [sa.a, mid, sa.b]) sphereBox(a, p, sa.r, b, sb, out, false);
    return;
  }
  if (sa.kind === 'sphere' && sb.kind === 'sphere') return spheres(a, sa.c, sa.r, b, sb.c, sb.r, out);
  if (sa.kind === 'sphere' && sb.kind === 'capsule') return spheres(a, sa.c, sa.r, b, closestOnSegment(sa.c, sb.a, sb.b, new Vector3()), sb.r, out);
  if (sa.kind === 'capsule' && sb.kind === 'sphere') return spheres(a, closestOnSegment(sb.c, sa.a, sa.b, new Vector3()), sa.r, b, sb.c, sb.r, out);
  if (sa.kind === 'capsule' && sb.kind === 'capsule') {
    const c1 = new Vector3();
    const c2 = new Vector3();
    closestSegments(sa.a, sa.b, sb.a, sb.b, c1, c2);
    return spheres(a, c1, sa.r, b, c2, sb.r, out);
  }
}
