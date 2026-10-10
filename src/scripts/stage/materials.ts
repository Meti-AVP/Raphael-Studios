// Scene materials. Painted surfaces (a texture that is the final colour) are unlit; everything else is a physically based
// material lit by the studio environment. Both burn in and out with the dissolve from shaders.ts, driven by
//   visibility        the timeline's per-asset visibility
//   loadingVisibility 0 -> 1 over 400 ms once the asset is ready
import {
  AdditiveBlending,
  DoubleSide,
  Material,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { dissolveHead, dissolveMain, hologramFrag } from './shaders';

export interface DissolveState {
  visibility: number;
  loadingVisibility: number;
  time: number;
}

type Uniforms = Record<string, { value: unknown }>;

/** Adds the dissolve to a built-in material; returns the live uniforms (filled once the program compiles). */
export function withDissolve<T extends Material>(mat: T, mud: Texture): T & { dissolve: DissolveState } {
  const state: DissolveState = { visibility: 1, loadingVisibility: 0, time: 0 };
  let uniforms: Uniforms | null = null;
  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uVisibility = { value: state.visibility };
    shader.uniforms.uLoadingVisibility = { value: state.loadingVisibility };
    shader.uniforms.uTime = { value: state.time };
    shader.uniforms.uMudNormal = { value: mud };
    uniforms = shader.uniforms as Uniforms;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPosition;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${dissolveHead}`);
    const end = shader.fragmentShader.lastIndexOf('}');
    shader.fragmentShader = shader.fragmentShader.slice(0, end) + dissolveMain + shader.fragmentShader.slice(end);
  };
  // one program per material kind, not per instance
  mat.customProgramCacheKey = () => `dissolve-${mat.type}`;
  const proxy = new Proxy(state, {
    set(t, k: keyof DissolveState, v: number) {
      t[k] = v;
      if (uniforms) {
        const name = k === 'visibility' ? 'uVisibility' : k === 'loadingVisibility' ? 'uLoadingVisibility' : 'uTime';
        uniforms[name].value = v;
      }
      return true;
    },
  });
  return Object.assign(mat, { dissolve: proxy });
}

export type SceneMaterial = (MeshBasicMaterial | MeshStandardMaterial) & { dissolve: DissolveState };

/** The hologram's light over a painted material (shaders.ts: hologramFrag), with its burn-in kept. */
function withHologram<T extends SceneMaterial>(mat: T): T {
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    base.call(mat, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
${hologramFrag}`);
  };
  mat.customProgramCacheKey = () => 'dissolve-hologram';
  return mat;
}

/**
 * The reference's rule: a material with an emissive map is a painting (unlit, the emissive map is its colour).
 * Two kinds of our own, by the material's name: "holo..." a hologram (light, drawn additively, see hologramFrag),
 * "glow..." a glow (a flash, a light: its picture added to what is behind it).
 */
export function convert(src: Material, mud: Texture, env: Texture | null): SceneMaterial {
  const s = src as MeshStandardMaterial;
  if (!(src instanceof MeshStandardMaterial) || s.emissiveMap) {
    const holo = /^holo/i.test(src.name);
    const glow = /^glow/i.test(src.name);
    const light = holo || glow;
    const m = new MeshBasicMaterial({
      map: s.emissiveMap ?? s.map ?? null,
      transparent: true,
      alphaTest: light ? 0 : 0.2,
      side: DoubleSide,
      name: src.name,
      depthWrite: !light,
    });
    if (light) m.blending = AdditiveBlending;
    const d = withDissolve(m, mud);
    return holo ? withHologram(d) : d;
  }
  const m = s.clone();
  m.envMap = env;
  m.envMapIntensity = 1;
  m.side = s.side;
  return withDissolve(m, mud);
}

export function painted(map: Texture, mud: Texture): SceneMaterial {
  return withDissolve(new MeshBasicMaterial({ map, transparent: true, alphaTest: 0.2, side: DoubleSide }), mud);
}
