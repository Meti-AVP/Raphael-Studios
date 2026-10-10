// GLSL for the stage: the scene-to-scene transition (the painting burns away into a sketch and reveals the next one),
// the paper overlay that wipes over a scene when the cream content arrives, the burn-in of models as they load,
// a mip-chain bloom (it is what turns the 8x-bright burning edges into embers) and the final output.
//
// The transition, overlay and burn-in follow the reference site (Shopify Editions Winter '26) closely; they are
// written here as stand-alone fragment shaders for three.js.

export const fullscreenVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** Shared helpers: the pre-computed tileable noise (in 0..1, centred to -1..1 here). */
const noiseHelpers = /* glsl */ `
  float sampleNoise(vec2 uv) {
    return texture2D(tNoise, uv).r * 2.0 - 1.0;
  }
  float easeInOutCubic(float t) {
    return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
  }
`;

/**
 * Composite: current scene -> next scene transition, darkening, then the paper overlay.
 * uProgress 0..1 is the transition from tCurrent to tNext. uIsHero switches to the circular intro reveal
 * (from the scene's centre, following the mouse a little). uOverlay in -1..1: -1 hidden, 0 covering, 1 gone the other way.
 */
export const compositeFrag = /* glsl */ `
  uniform sampler2D tCurrent;
  uniform sampler2D tNext;
  uniform sampler2D tMudNormal;
  uniform sampler2D tNoise;
  uniform float uProgress;
  uniform float uAspect;
  uniform float uTime;
  uniform vec2 uMouse;
  uniform float uIsHero;
  uniform float uIsFallback;
  uniform vec2 uSceneCenter;
  uniform float uDarken;
  uniform float uFlash;
  uniform float uOverlay;
  uniform vec3 uOverlayColor;
  uniform float uGlow;
  varying vec2 vUv;

  ${noiseHelpers}

  vec4 crossFade(vec2 uv) {
    bool isHero = uIsHero > 0.5;
    bool isFallback = uIsFallback > 0.5;
    float progress = isHero ? smoothstep(0.0, 1.5, uProgress) : uProgress;
    vec2 sceneCenter = isFallback ? vec2(0.5, 0.65) : uSceneCenter;

    vec2 currentUV = uv;
    vec2 nextUV = uv;
    if (isHero) {
      currentUV = (uv - sceneCenter) * (1.0 - smoothstep(0.2, 1.0, uProgress) * 0.1) + sceneCenter;
      nextUV = (uv - sceneCenter) * (1.0 + smoothstep(0.8, 0.0, uProgress) * 0.1) + sceneCenter;
    } else if (isFallback) {
      currentUV.y -= easeInOutCubic(uProgress) * 0.1;
      nextUV.y += easeInOutCubic(1.0 - uProgress) * 0.1;
    }

    vec4 current = texture2D(tCurrent, currentUV);
    vec4 next = texture2D(tNext, nextUV);

    // the scenes turn into their own outlines while they cross (edges from the luminance derivative)
    vec3 currentEdges = vec3(0.0);
    vec3 nextEdges = vec3(0.0);
    if ((uProgress > 0.01 && uProgress < 0.99) || uDarken > 0.001) {
      float currentLuma = dot(current.rgb, vec3(0.299, 0.587, 0.114));
      currentEdges = vec3(fwidth(currentLuma) * mix(5.0, 10.0, progress));
      float nextLuma = dot(next.rgb, vec3(0.299, 0.587, 0.114));
      nextEdges = vec3(fwidth(nextLuma) * mix(5.0, 10.0, 1.0 - progress));
    }

    vec3 mudNormal = texture2D(tMudNormal, uv * 2.0).rgb;
    float mudStrength = isHero ? mix(0.2, 0.4, 0.5 + 0.5 * sin(uTime - uv.x * 10.0))
                               : mix(0.3, 0.6, 0.5 + 0.5 * sin(uTime - uv.x * 10.0));
    float mudOffset = (mudNormal.r - 0.5) * mudStrength;

    vec2 aspectUv = vec2(uv.x * uAspect, uv.y) + vec2(0.0, uTime * 0.02);
    float noiseSpeed = isHero ? 0.07 : 0.05;
    float currentNoise = sampleNoise(aspectUv * 0.25 - uTime * noiseSpeed * 0.125);

    vec2 maskCenter = isHero ? mix(sceneCenter, uMouse, 0.1) : vec2(0.5);

    float threshold;
    if (isHero) {
      float dist = length((uv - maskCenter) * vec2(uAspect, 1.0)) * 0.8;
      threshold = mix(dist, uv.x, smoothstep(0.6, -0.4, abs(uv.x - sceneCenter.x)) * mix(0.0, 0.4, smoothstep(0.05, 0.5, progress)));
      threshold = mix(threshold, 0.0, smoothstep(0.9, 1.0, uProgress));
    } else {
      float ease = mix(progress * progress * (3.0 - 2.0 * progress), progress, 0.25);
      threshold = mix(uv.y, uv.x, smoothstep(0.6, -0.4, abs(uv.x - 0.5)) * 0.5);
      progress = ease;
    }
    threshold = threshold * 2.0 - 1.0;
    threshold = threshold / 1.2 + currentNoise * 0.2 + mudOffset;
    threshold = threshold * 0.5 + 0.5;

    float edge = progress - threshold;
    float aa = fwidth(edge) * 10.0;
    float blendFactor = smoothstep(-aa, aa, edge);

    current = mix(current, vec4(currentEdges, 1.0), smoothstep(0.0, 0.5, progress));
    next = mix(next, vec4(nextEdges, 1.0), smoothstep(0.2, 0.8, 1.0 - progress));

    if (uDarken > 0.001) {
      current = mix(current, vec4(0.02 * uDarken + currentEdges * 0.1, 1.0), uDarken);
    }

    vec4 color = mix(current, next, blendFactor);

    // the burning edge: multiplied far above 1.0, the bloom turns it into embers
    float glowStrength = isHero ? mix(40.0, 8.0, smoothstep(0.05, 0.25, progress)) : mix(2.0, 10.0, 0.5);
    float glowThreshold = isHero ? glowStrength * 0.001 : 0.003;
    float glowFactor = smoothstep(0.0, glowThreshold, abs(edge));
    float glowMult = isHero ? mix(glowStrength * 0.5, glowStrength, 0.5 + 0.5 * currentNoise * sin(uTime + uv.x * 10.0))
                            : mix(2.0, 10.0, 0.5 + 0.5 * currentNoise * sin(uTime + uv.x * 10.0));
    glowMult = mix(1.0, glowMult, uGlow);
    if (uProgress > 0.0005 && uProgress < 0.9995) color.rgb = mix(color.rgb, color.rgb * glowMult, 1.0 - glowFactor);
    // a camera's flash (the hero's photographer): the whole picture goes white-hot for a moment
    if (uFlash > 0.001) color.rgb = mix(color.rgb, vec3(1.0, 0.985, 0.95) * 1.6, clamp(uFlash, 0.0, 1.0) * 0.9);
    return color;
  }

  vec3 overlay(vec3 inputColor, vec2 uv) {
    if (abs(uOverlay) >= 1.0) return inputColor;
    vec3 mudNormal = texture2D(tMudNormal, uv * 2.0).rgb;
    float mudOffset = (mudNormal.r - 0.5) * mix(0.3, 0.6, 0.5 + 0.5 * sin(uTime - uv.x * 10.0)) * 0.1;
    vec2 aspectUv = vec2(uv.x * uAspect, uv.y) + vec2(0.0, uTime * 0.02);
    float noiseValue = sampleNoise(aspectUv * 0.375 - uTime * 0.00625);

    float threshold = mix(uv.y, uv.x, smoothstep(0.6, -0.4, abs(uv.x - 0.4)) * 0.5);
    threshold = threshold * 2.0 - 1.0;
    threshold = threshold / 1.2 + noiseValue * 0.2 + mudOffset;
    threshold = threshold * 0.5 + 0.5;

    float progress;
    float thresholdFinal = threshold;
    if (uOverlay <= 0.0) {
      progress = uOverlay + 1.0;
    } else {
      progress = 1.0 - uOverlay;
      thresholdFinal = 1.0 - threshold;
    }
    float edge = progress - thresholdFinal;
    float aa = fwidth(edge) * 10.0;
    float alpha = smoothstep(-aa, aa, edge);
    float glowFactor = smoothstep(0.0, 0.005, abs(edge));
    vec3 color = uOverlayColor;
    color = mix(color, color * mix(2.0, 4.0, 0.5 + 0.5 * sin(uTime + uv.x * 10.0)), (1.0 - glowFactor) * uGlow);
    return mix(inputColor, color, alpha);
  }

  void main() {
    vec4 c = crossFade(vUv);
    gl_FragColor = vec4(overlay(c.rgb, vUv), 1.0);
  }
`;

/** Bloom, step 1: keep what is brighter than 1.0 (soft knee), at half resolution. */
export const bloomPrefilterFrag = /* glsl */ `
  uniform sampler2D tInput;
  uniform vec2 uTexel;
  uniform float uThreshold;
  varying vec2 vUv;
  void main() {
    // 4 taps: a small blur on the way down
    vec3 c = texture2D(tInput, vUv + uTexel * vec2(-0.5, -0.5)).rgb
           + texture2D(tInput, vUv + uTexel * vec2( 0.5, -0.5)).rgb
           + texture2D(tInput, vUv + uTexel * vec2(-0.5,  0.5)).rgb
           + texture2D(tInput, vUv + uTexel * vec2( 0.5,  0.5)).rgb;
    c *= 0.25;
    float l = max(c.r, max(c.g, c.b));
    float knee = 0.25;
    float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-4);
    float w = max(soft, l - uThreshold) / max(l, 1e-4);
    gl_FragColor = vec4(c * w, 1.0);
  }
`;

/** Bloom, step 2: 13-tap downsample (the "mip blur" of Call of Duty / pmndrs postprocessing). */
export const bloomDownFrag = /* glsl */ `
  uniform sampler2D tInput;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec2 t = uTexel;
    vec3 a = texture2D(tInput, vUv + t * vec2(-2.0, 2.0)).rgb;
    vec3 b = texture2D(tInput, vUv + t * vec2( 0.0, 2.0)).rgb;
    vec3 c = texture2D(tInput, vUv + t * vec2( 2.0, 2.0)).rgb;
    vec3 d = texture2D(tInput, vUv + t * vec2(-2.0, 0.0)).rgb;
    vec3 e = texture2D(tInput, vUv).rgb;
    vec3 f = texture2D(tInput, vUv + t * vec2( 2.0, 0.0)).rgb;
    vec3 g = texture2D(tInput, vUv + t * vec2(-2.0,-2.0)).rgb;
    vec3 h = texture2D(tInput, vUv + t * vec2( 0.0,-2.0)).rgb;
    vec3 i = texture2D(tInput, vUv + t * vec2( 2.0,-2.0)).rgb;
    vec3 j = texture2D(tInput, vUv + t * vec2(-1.0, 1.0)).rgb;
    vec3 k = texture2D(tInput, vUv + t * vec2( 1.0, 1.0)).rgb;
    vec3 l = texture2D(tInput, vUv + t * vec2(-1.0,-1.0)).rgb;
    vec3 m = texture2D(tInput, vUv + t * vec2( 1.0,-1.0)).rgb;
    vec3 o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
    gl_FragColor = vec4(o, 1.0);
  }
`;

/** Bloom, step 3: tent upsample added onto the next larger level. */
export const bloomUpFrag = /* glsl */ `
  uniform sampler2D tInput;
  uniform sampler2D tBase;
  uniform vec2 uTexel;
  uniform float uRadius;
  varying vec2 vUv;
  void main() {
    vec2 t = uTexel * uRadius;
    vec3 s = texture2D(tInput, vUv + vec2(-t.x, t.y)).rgb
           + texture2D(tInput, vUv + vec2(0.0, t.y)).rgb * 2.0
           + texture2D(tInput, vUv + vec2(t.x, t.y)).rgb
           + texture2D(tInput, vUv + vec2(-t.x, 0.0)).rgb * 2.0
           + texture2D(tInput, vUv).rgb * 4.0
           + texture2D(tInput, vUv + vec2(t.x, 0.0)).rgb * 2.0
           + texture2D(tInput, vUv + vec2(-t.x, -t.y)).rgb
           + texture2D(tInput, vUv + vec2(0.0, -t.y)).rgb * 2.0
           + texture2D(tInput, vUv + vec2(t.x, -t.y)).rgb;
    gl_FragColor = vec4(texture2D(tBase, vUv).rgb + s / 16.0, 1.0);
  }
`;

/** Output: composite + bloom, to sRGB, with a whisper of grain so flat paper does not band. */
export const outputFrag = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tBloom;
  uniform float uBloom;
  uniform float uTime;
  varying vec2 vUv;
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec3 toSRGB(vec3 c) {
    c = max(c, 0.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  void main() {
    vec3 c = texture2D(tColor, vUv).rgb + texture2D(tBloom, vUv).rgb * uBloom;
    c = toSRGB(min(c, vec3(1.0)));
    c += (hash12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
    gl_FragColor = vec4(c, 1.0);
  }
`;

/** Plain copy (used to show a single scene without a transition). */
export const copyFrag = /* glsl */ `
  uniform sampler2D tInput;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(tInput, vUv); }
`;

/** Injected into scene materials: the burn-in/out of a model (world-space noise front with a bright edge). */
export const dissolveHead = /* glsl */ `
  varying vec3 vWorldPosition;
  uniform float uVisibility;
  uniform float uLoadingVisibility;
  uniform float uTime;
  uniform sampler2D uMudNormal;

  vec3 dHash(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }
  float dNoise(in vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(dot(dHash(i + vec3(0.0, 0.0, 0.0)), f - vec3(0.0, 0.0, 0.0)), dot(dHash(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0)), u.x),
          mix(dot(dHash(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0)), dot(dHash(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0)), u.x), u.y),
      mix(mix(dot(dHash(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0)), dot(dHash(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0)), u.x),
          mix(dot(dHash(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0)), dot(dHash(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0)), u.x), u.y), u.z);
  }
  float dFbm(vec3 p) {
    mat3 m = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
    float f = 0.0;
    vec3 q = 8.0 * p;
    f += 0.5000 * dNoise(q); q = m * q * 2.01;
    f += 0.2500 * dNoise(q); q = m * q * 2.02;
    f += 0.1250 * dNoise(q); q = m * q * 2.03;
    f += 0.0625 * dNoise(q);
    return f;
  }
`;

export const dissolveMain = /* glsl */ `
  float combinedVisibility = uVisibility * uLoadingVisibility;
  if (combinedVisibility < 1.0) {
    vec3 mudNormal = texture2D(uMudNormal, vWorldPosition.xy).rgb;
    float mudOffset = (mudNormal.r - 0.5) * 0.5;
    float noiseValue = dFbm(vWorldPosition * 0.0375 + length(vWorldPosition.xy) * 0.025 + 2.0 + uTime * 0.0015 + uVisibility * 0.05);
    noiseValue = smoothstep(-0.5, 0.5, noiseValue);
    noiseValue += mudOffset * smoothstep(0.5, 0.45, abs(combinedVisibility - 0.5));
    float transition = smoothstep(combinedVisibility, combinedVisibility - 0.1, length(vWorldPosition.xy) * 0.06);
    transition = mix(transition, noiseValue, mix(0.3, 0.8, combinedVisibility));
    transition = mix(transition, 1.0, smoothstep(0.5, 1.0, combinedVisibility));
    float threshold = 1.0 - combinedVisibility;
    if (transition < threshold) discard;
    float edge = smoothstep(threshold, threshold + 0.02, transition);
    gl_FragColor.rgb = mix(gl_FragColor.rgb * 8.0, gl_FragColor.rgb, edge);
  }
`;

/**
 * The hologram (painted materials whose name starts with "holo"): the picture becomes a projection of turquoise light,
 * its outlines brightest, crossed by fine scan lines that run upward, a slow brighter band sweeping through it, and
 * a faint flicker. Drawn additively: dark parts of the picture are simply not there.
 */
export const hologramFrag = /* glsl */ `
  {
    float hLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    float hEdge = clamp(fwidth(hLuma) * 7.0, 0.0, 1.0);
    float hScan = 0.62 + 0.38 * sin(vWorldPosition.y * 150.0 - uTime * 4.0);
    float hBand = smoothstep(0.0, 0.25, fract(vWorldPosition.y * 0.18 - uTime * 0.07)) * smoothstep(1.0, 0.75, fract(vWorldPosition.y * 0.18 - uTime * 0.07));
    float hFlicker = 0.93 + 0.07 * sin(uTime * 41.0) * sin(uTime * 13.7);
    vec3 hTint = mix(vec3(0.05, 0.62, 0.66), vec3(0.55, 1.0, 0.95), hEdge);
    float hLight = (pow(hLuma, 1.4) * 0.55 + hEdge * 1.2) * hScan * hFlicker * (0.8 + hBand * 0.7) * 0.62;
    diffuseColor.rgb = hTint * hLight;
    diffuseColor.a *= clamp(hLight * 1.4, 0.0, 1.0);
  }
`;

