// The atelier's other garments (scripts/tee/view.ts): the parts that make its sewn shirt a polo (a collar, a placket,
// two buttons) or a sweatshirt (long sleeves, ribbed cuffs), made on the shirt where its physics has it at rest. The
// view binds each part to the cloth, so it follows the shirt as it moves.
//
//   node tools/tee/garments.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../scenes/remake/glbkit.mjs';
import { poloParts, sweatParts } from '../scenes/remake/garments.mjs';

const r = (a) => a.map((x) => Math.round(x * 1e4) / 1e4);
const part = (g) => ({ pos: r(g.pos), tri: g.tri });
const polo = poloParts(true);
const sweat = sweatParts(true);
const out = {
  polo: { collar: part(polo.collar), placket: part(polo.placket), buttons: polo.buttons.map(r) },
  // (a sleeve is 11 rings of points from the hem down, a cuff 4: ring is the points in each)
  sweat: sweat.map((s) => ({ sleeve: part(s.sleeve), cuff: part(s.cuff), ring: s.sleeve.pos.length / 3 / 11 })),
};
const file = path.join(ROOT, 'public/tee/garments.json');
fs.writeFileSync(file, JSON.stringify(out));
console.log(`  public/tee/garments.json: ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
