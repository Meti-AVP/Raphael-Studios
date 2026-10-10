// The mailer box as it is cut and creased: one sheet of board, panels joined by creases. Everything is described in
// the flat sheet's own coordinates (metres; x across, z front to back, y up through the board, the inside face up),
// so the fold is just each panel turning about its crease, inside its parent's frame.
//
//               tuck
//          ┌───────────┐
//     flap │    lid    │ flap
//          ├───────────┤
//      ear │   back    │ ear
//  ┌───────┼───────────┼───────┐
//  │ left  │   base    │ right │
//  └───────┼───────────┼───────┘
//      ear │   front   │ ear
//          └───────────┘
//
// A crease's pivot sits on the outer face of the board; flaps that tuck inside another wall pivot one board
// thickness in, so when folded they lie just inside it (that is what the real dieline's offsets are for).

export const W = 0.24; // inside width (x)
export const D = 0.17; // depth (z)
export const H = 0.075; // height
export const T = 0.0025; // board thickness (E-flute)

/** a convex outline in the flat sheet (x, z), anticlockwise seen from the inside */
export type Outline = [number, number][];

export interface Panel {
  id: string;
  parent: string | null;
  outline: Outline;
  /** the crease to the parent: a point on it and its direction (flat coordinates) */
  pivot: [number, number, number];
  axis: [number, number, number];
  /** the angle when the box is closed (radians, about `axis`) */
  folded: number;
  /** when it folds, as a part of the whole fold (0..1) */
  window: [number, number];
  /** reading directions for the print (flat x, z): seen from outside when closed, and from inside */
  out: { u: [number, number]; v: [number, number] };
  in: { u: [number, number]; v: [number, number] };
  /** how large its print area is, for the atlas (metres) */
  size: [number, number];
}

const rect = (x0: number, z0: number, x1: number, z1: number): Outline => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];
/** a flap: its crease edge from (a) to (b), reaching `depth` out along `dir`, its far corners cut in by `cut` */
function flap(ax: number, az: number, bx: number, bz: number, dirx: number, dirz: number, depth: number, cut: number): Outline {
  // along the crease
  const lx = bx - ax;
  const lz = bz - az;
  const len = Math.hypot(lx, lz);
  const ux = lx / len;
  const uz = lz / len;
  const far = (s: number) => [ax + ux * s + dirx * depth, az + uz * s + dirz * depth] as [number, number];
  return [[ax, az], [bx, bz], far(len - cut), far(cut)];
}

const HF = H - T; // the walls under the lid are one board lower than the back, so the lid rests on them
const LID = D; // the lid reaches the front wall's outer face
const TUCK = H * 0.8;
const FLAP = H * 0.74;
const EAR = H - T * 2;

const zBack = -D / 2;
const zLid = zBack - H; // the crease between the back wall and the lid
const zTuck = zLid - LID; // the lid's front edge (flat: its far edge)

const up = { u: [1, 0] as [number, number], v: [0, -1] as [number, number] };

export const panels: Panel[] = [
  {
    id: 'base',
    parent: null,
    outline: rect(-W / 2, -D / 2, W / 2, D / 2),
    pivot: [0, 0, 0],
    axis: [1, 0, 0],
    folded: 0,
    window: [0, 0],
    out: { u: [1, 0], v: [0, 1] },
    in: up,
    size: [W, D],
  },
  {
    id: 'front',
    parent: 'base',
    outline: rect(-W / 2, D / 2, W / 2, D / 2 + HF),
    pivot: [0, 0, D / 2],
    axis: [1, 0, 0],
    folded: -Math.PI / 2,
    window: [0.3, 0.56],
    out: { u: [1, 0], v: [0, 1] },
    in: up,
    size: [W, HF],
  },
  {
    id: 'back',
    parent: 'base',
    outline: rect(-W / 2, zLid, W / 2, zBack),
    pivot: [0, 0, zBack],
    axis: [1, 0, 0],
    folded: Math.PI / 2,
    window: [0.3, 0.56],
    out: { u: [-1, 0], v: [0, -1] },
    in: up,
    size: [W, H],
  },
  {
    id: 'left',
    parent: 'base',
    outline: rect(-W / 2 - HF, -D / 2, -W / 2, D / 2),
    pivot: [-W / 2, 0, 0],
    axis: [0, 0, 1],
    folded: -Math.PI / 2,
    window: [0, 0.26],
    out: { u: [0, 1], v: [-1, 0] },
    in: up,
    size: [D, HF],
  },
  {
    id: 'right',
    parent: 'base',
    outline: rect(W / 2, -D / 2, W / 2 + HF, D / 2),
    pivot: [W / 2, 0, 0],
    axis: [0, 0, 1],
    folded: Math.PI / 2,
    window: [0, 0.26],
    out: { u: [0, -1], v: [1, 0] },
    in: up,
    size: [D, HF],
  },
  // the ears: corner flaps of the side walls, folded in behind the front and back walls
  ...(['left', 'right'] as const).flatMap((side) => {
    const s = side === 'left' ? -1 : 1;
    const x0 = s < 0 ? -W / 2 - EAR : W / 2;
    const x1 = s < 0 ? -W / 2 : W / 2 + EAR;
    return [
      {
        id: `${side}-ear-front`,
        parent: side,
        outline: flap(x0, D / 2, x1, D / 2, 0, 1, EAR, EAR * 0.18),
        pivot: [0, 0, D / 2 - T] as [number, number, number],
        axis: [1, 0, 0] as [number, number, number],
        folded: -Math.PI / 2,
        window: [0.12, 0.34] as [number, number],
        out: { u: [1, 0] as [number, number], v: [0, 1] as [number, number] },
        in: up,
        size: [EAR, EAR] as [number, number],
      },
      {
        id: `${side}-ear-back`,
        parent: side,
        outline: flap(x1, -D / 2, x0, -D / 2, 0, -1, EAR, EAR * 0.18),
        pivot: [0, 0, -D / 2 + T] as [number, number, number],
        axis: [1, 0, 0] as [number, number, number],
        folded: Math.PI / 2,
        window: [0.12, 0.34] as [number, number],
        out: { u: [1, 0] as [number, number], v: [0, -1] as [number, number] },
        in: up,
        size: [EAR, EAR] as [number, number],
      },
    ];
  }),
  {
    id: 'lid',
    parent: 'back',
    outline: rect(-W / 2, zTuck, W / 2, zLid),
    pivot: [0, 0, zLid],
    axis: [1, 0, 0],
    folded: Math.PI / 2,
    window: [0.56, 0.9],
    out: { u: [1, 0], v: [0, 1] },
    in: up,
    size: [W, LID],
  },
  {
    id: 'tuck',
    parent: 'lid',
    outline: flap(W / 2 - 0.004, zTuck, -W / 2 + 0.004, zTuck, 0, -1, TUCK, 0.016),
    pivot: [0, 0, zTuck + T],
    axis: [1, 0, 0],
    folded: Math.PI / 2,
    window: [0.66, 0.84],
    out: { u: [1, 0], v: [0, 1] },
    in: up,
    size: [W - 0.008, TUCK],
  },
  {
    id: 'lid-flap-left',
    parent: 'lid',
    outline: flap(-W / 2, zLid - 0.012, -W / 2, zTuck + 0.012, -1, 0, FLAP, 0.02),
    pivot: [-W / 2 + T, 0, 0],
    axis: [0, 0, 1],
    folded: -Math.PI / 2,
    window: [0.5, 0.66],
    out: { u: [0, 1], v: [-1, 0] },
    in: up,
    size: [LID - 0.024, FLAP],
  },
  {
    id: 'lid-flap-right',
    parent: 'lid',
    outline: flap(W / 2, zTuck + 0.012, W / 2, zLid - 0.012, 1, 0, FLAP, 0.02),
    pivot: [W / 2 - T, 0, 0],
    axis: [0, 0, 1],
    folded: Math.PI / 2,
    window: [0.5, 0.66],
    out: { u: [0, -1], v: [1, 0] },
    in: up,
    size: [LID - 0.024, FLAP],
  },
];

/** the flat sheet's bounds (x0, z0, x1, z1) */
export const sheet = (() => {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of panels)
    for (const [x, z] of p.outline) {
      x0 = Math.min(x0, x);
      z0 = Math.min(z0, z);
      x1 = Math.max(x1, x);
      z1 = Math.max(z1, z);
    }
  return { x0, z0, x1, z1 };
})();

/** the lid's opening, about its crease: closed (on the walls) and as far back as it can go (its edge on the table) */
export const LID_CLOSED = Math.PI / 2;
export const LID_OPEN_LIMIT = -(Math.PI / 2 + Math.asin(Math.min(1, H / LID)));
export const LID_LENGTH = LID;
