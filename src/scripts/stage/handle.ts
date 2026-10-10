// The page's stage, for the modules that talk to a painted scene (the billboard, ...). app.ts settles it once the
// stage exists; it never settles on devices without one, so modules show their own 2D version instead.
import type { Stage } from './stage';

let settle: (s: Stage) => void;
export const stageReady = new Promise<Stage>((r) => (settle = r));
export function provideStage(s: Stage) {
  settle(s);
}
