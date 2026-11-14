// Shader sources for the field engine.
// Written with AI assistance (Claude); see the README.
//
// Geometry notes
// - Map coordinates are south polar stereographic metres (see pipeline/earthrise_ref/proj.py).
// - The horizon walk follows a great circle from the pixel and compares, at each step,
//   the elevation angle of the terrain. The vertical term is written as
//     (h_t - h_0) - (R + h_t) * 2 sin^2(theta/2)
//   so that it keeps its accuracy in 32-bit floats.

export const EL_MIN = -4.0
export const EL_MAX = 20.0
export const NAZ = 360 // horizon azimuths kept per pixel, 3 per layer
export const LAYERS = NAZ / 3

export const VS = `#version 300 es
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const COMMON = `#version 300 es
/*DEFINES*/
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;
const float R = 1737400.0;
const float PI = 3.14159265358979;
const float FAR_HALF = 931200.0;
const float MID_HALF = 304000.0;
const float FAR_RES = 960.0;
const float MID_RES = 160.0;
const float NODATA = -15000.0;
const float EL_MIN = ${EL_MIN.toFixed(1)};
uniform float uElMax;      // top of the stored horizon range, degrees (set per bake)
uniform sampler2D uFar;
uniform sampler2D uMid;
uniform sampler2D uFocus;
uniform vec4 uFocusRect;   // left x, top y, size in metres, 1 when a focus grid is loaded
uniform float uFocusRes;   // metres per texel of the focus grid
uniform float uGrowth;     // step growth per step, as a fraction of distance
uniform float uDmax;       // how far the horizon walk goes, metres
uniform float uFine;       // smallest step, as a fraction of the grid spacing

// Height grids are float textures. Where the GPU cannot filter those (some phones), the four
// neighbours are read and blended here instead.
#ifdef MANUAL_BILINEAR
float tex1(sampler2D s, vec2 uv){
  ivec2 sz = textureSize(s, 0);
  vec2 q = uv * vec2(sz) - 0.5;
  ivec2 i = ivec2(floor(q));
  vec2 f = q - vec2(i);
  ivec2 mx = sz - 1;
  float a = texelFetch(s, clamp(i, ivec2(0), mx), 0).r;
  float b = texelFetch(s, clamp(i + ivec2(1, 0), ivec2(0), mx), 0).r;
  float c = texelFetch(s, clamp(i + ivec2(0, 1), ivec2(0), mx), 0).r;
  float d = texelFetch(s, clamp(i + ivec2(1, 1), ivec2(0), mx), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
#else
float tex1(sampler2D s, vec2 uv){ return texture(s, uv).r; }
#endif

// Which grid to read at map point p, for a walk that has gone t metres.
// 0 focus, 1 mid (80-90 S, 160 m), 2 far (60-90 S, 960 m), 3 nothing
int levelAt(vec2 p, float t){
  if (uFocusRect.w > 0.5 && t < 10000.0) {
    vec2 f = vec2(p.x - uFocusRect.x, uFocusRect.y - p.y) / uFocusRect.z;
    if (f.x > 0.002 && f.y > 0.002 && f.x < 0.998 && f.y < 0.998) return 0;
  }
  float m = max(abs(p.x), abs(p.y));
  if (m < MID_HALF - 400.0 && t < 60000.0) return 1;
  if (m < FAR_HALF - 2000.0) return 2;
  return 3;
}
float heightL(vec2 p, int level){
  if (level == 0) return tex1(uFocus, vec2(p.x - uFocusRect.x, uFocusRect.y - p.y) / uFocusRect.z);
  if (level == 1) return tex1(uMid, vec2(p.x + MID_HALF, MID_HALF - p.y) / (2.0 * MID_HALF));
  if (level == 2) return tex1(uFar, vec2(p.x + FAR_HALF, FAR_HALF - p.y) / (2.0 * FAR_HALF));
  return -20000.0;
}
float resL(int level){ return level == 0 ? uFocusRes : (level == 1 ? MID_RES : FAR_RES); }
// The level to use when the focus grid has no data at p: the same choice levelAt makes without a focus.
int coarseLevelAt(vec2 p, float t){
  float m = max(abs(p.x), abs(p.y));
  if (m < MID_HALF - 400.0 && t < 60000.0) return 1;
  if (m < FAR_HALF - 2000.0) return 2;
  return 3;
}
float groundHeight(vec2 p){
  int l = levelAt(p, 0.0);
  float h = heightL(p, l);
  if (h < NODATA && l == 0) { l = coarseLevelAt(p, 0.0); h = heightL(p, l); }
  if (h < NODATA && l == 1) h = heightL(p, 2);
  return h;
}

// Local frame at a map point.
void frame(vec2 p, out vec3 up, out vec3 east, out vec3 north){
  float rho = max(length(p), 1e-3);
  float c = 2.0 * atan(rho / (2.0 * R));        // colatitude from the south pole
  float sl = p.x / rho, cl = p.y / rho;          // sin and cos of longitude
  if (length(p) < 1e-3) { sl = 0.0; cl = 1.0; }  // at the pole itself any longitude will do
  up = vec3(sin(c) * cl, sin(c) * sl, -cos(c));
  east = vec3(-sl, cl, 0.0);
  north = cross(up, east);
}
vec2 toMap(vec3 q){ return 2.0 * R * vec2(q.y, q.x) / (1.0 - q.z); }

// Tangent of the horizon elevation in direction dir (unit, horizontal) from a point
// with unit vector up and height h0 above the sphere. t0 is the first step.
float horizonTan(vec3 up, vec3 dir, float h0, float t0){
  float best = -10.0;
  float t = t0;
  for (int i = 0; i < 1400; i++) {
    if (t > uDmax) break;
    float th = t / R;
    float s = sin(th);
    vec3 q = up * cos(th) + dir * s;
    vec2 p = toMap(q);
    int l = levelAt(p, t);
    if (l == 3) break;
    float ht = heightL(p, l);
    if (ht < NODATA && l == 0) { l = coarseLevelAt(p, t); if (l == 3) break; ht = heightL(p, l); }
    if (ht < NODATA && l == 1) { l = 2; ht = heightL(p, l); }
    if (ht > NODATA) {
      float sh = sin(0.5 * th);
      float vert = (ht - h0) - (R + ht) * 2.0 * sh * sh;
      best = max(best, vert / ((R + ht) * s));
    }
    t += max(resL(l) * uFine, t * uGrowth);
  }
  return best;
}
float diskFraction(float elCentre, float elHorizon, float radius){
  float z = clamp((elHorizon - elCentre) / radius, -1.0, 1.0);
  return (acos(z) - z * sqrt(1.0 - z * z)) / PI;
}
`

// One draw fills one layer of the horizon cache: three azimuths, 10 bits each.
export const FS_BAKE = COMMON + `
uniform vec4 uField;     // left x, bottom y, width, height in metres
uniform vec2 uFieldPx;
uniform float uAz0;      // radians, first of the three azimuths
uniform float uAzStep;
uniform float uMast;
out vec4 o;
float enc(float tanEl){ return clamp((degrees(atan(tanEl)) - EL_MIN) / (uElMax - EL_MIN), 0.0, 1.0); }
void main(){
  vec2 p = uField.xy + uField.zw * gl_FragCoord.xy / uFieldPx;
  vec3 up, east, north; frame(p, up, east, north);
  float hg = groundHeight(p);
  float h0 = hg + uMast;
  float t0 = uFine * resL(levelAt(p, 0.0));
  vec3 v;
  for (int k = 0; k < 3; k++) {
    float az = uAz0 + float(k) * uAzStep;
    v[k] = enc(horizonTan(up, cos(az) * north + sin(az) * east, h0, t0));
  }
  o = vec4(v, 1.0);
}`

// Probe: column = point, row = azimuth. Used to check the kernel against the reference model.
export const FS_PROBE = COMMON + `
uniform sampler2D uPoints;  // x, y, mast, first step
uniform float uNaz;
out vec4 o;
void main(){
  vec4 pt = texelFetch(uPoints, ivec2(int(gl_FragCoord.x), 0), 0);
  vec3 up, east, north; frame(pt.xy, up, east, north);
  float hg = groundHeight(pt.xy);
  float az = 2.0 * PI * floor(gl_FragCoord.y) / uNaz;
  float tn = horizonTan(up, cos(az) * north + sin(az) * east, hg + pt.z, pt.w > 0.0 ? pt.w : uFine * resL(levelAt(pt.xy, 0.0)));
  o = vec4(degrees(atan(tn)), hg, 0.0, 1.0);
}`

// Direct walk toward the Sun and the Earth for one instant. Exact in azimuth.
export const FS_NOW = COMMON + `
uniform vec4 uField;
uniform vec2 uFieldPx;
uniform float uMast;
uniform vec4 uSun;     // unit vector, angular radius (rad)
uniform vec4 uEarth;   // km from Moon centre, eclipse fraction
out vec4 o;
void main(){
  vec2 p = uField.xy + uField.zw * gl_FragCoord.xy / uFieldPx;
  vec3 up, east, north; frame(p, up, east, north);
  float hg = groundHeight(p);
  float h0 = hg + uMast;
  float t0 = uFine * resL(levelAt(p, 0.0));
  // Sun
  float sEl = asin(clamp(dot(uSun.xyz, up), -1.0, 1.0));
  vec3 sh = normalize(uSun.xyz - up * dot(uSun.xyz, up));
  float sHz = sEl > -0.1 ? atan(horizonTan(up, sh, h0, t0)) : 1.0;
  float fs = diskFraction(sEl, sHz, uSun.w) * (1.0 - uEarth.w);
  // Earth
  vec3 e = uEarth.xyz - up * ((R + h0) * 1e-3);
  float ed = length(e); e /= ed;
  float eEl = asin(clamp(dot(e, up), -1.0, 1.0));
  vec3 eh = normalize(e - up * dot(e, up));
  float eHz = eEl > -0.1 ? atan(horizonTan(up, eh, h0, t0)) : 1.0;
  o = vec4(fs, degrees(sEl - sHz), degrees(eEl - eHz), degrees(sEl));
}`

// Horizon elevation (rad) at azimuth az for the fragment's own pixel, from the baked cache.
const HZ = `float hz(float az){
  float a = degrees(az) * ${(NAZ / 360).toFixed(1)};
  a = a < 0.0 ? a + ${NAZ.toFixed(1)} : a;
  float f = fract(a); int i0 = int(floor(a)) % ${NAZ}; int i1 = (i0 + 1) % ${NAZ};
  ivec2 px = ivec2(gl_FragCoord.xy);
  float v0 = texelFetch(uHorizon, ivec3(px, i0 / 3), 0)[i0 % 3];
  float v1 = texelFetch(uHorizon, ivec3(px, i1 / 3), 0)[i1 % 3];
  return radians(EL_MIN + mix(v0, v1, f) * (uElMax - EL_MIN));
}
`

// The light for one instant from the cached horizons: one lookup per pixel instead of a walk.
// A hundred times cheaper than FS_NOW, at the cache's resolution. Used while time is playing.
export const FS_NOWFAST = COMMON + `
uniform sampler2DArray uHorizon;
uniform vec4 uField;
uniform vec2 uFieldPx;
uniform float uMast;
uniform vec4 uSun;     // unit vector, angular radius (rad)
uniform vec4 uEarth;   // km from Moon centre, eclipse fraction
out vec4 o;
${HZ}
void main(){
  vec2 p = uField.xy + uField.zw * gl_FragCoord.xy / uFieldPx;
  vec3 up, east, north; frame(p, up, east, north);
  float h0 = groundHeight(p) + uMast;
  float sEl = asin(clamp(dot(uSun.xyz, up), -1.0, 1.0));
  float sHz = hz(atan(dot(uSun.xyz, east), dot(uSun.xyz, north)));
  float fs = diskFraction(sEl, sHz, uSun.w) * (1.0 - uEarth.w);
  vec3 e = normalize(uEarth.xyz - up * ((R + h0) * 1e-3));
  float eEl = asin(clamp(dot(e, up), -1.0, 1.0));
  float eHz = hz(atan(dot(e, east), dot(e, north)));
  o = vec4(fs, degrees(sEl - sHz), degrees(eEl - eHz), degrees(sEl));
}`

// Mission evaluation over a run of time steps, from the baked horizons.
// State is carried between draws so that long windows can be done in chunks.
export const FS_EVAL = COMMON + `
uniform sampler2DArray uHorizon;
uniform sampler2D uEphem;   // row 0: sun unit xyz, angular radius; row 1: earth km, dsn + eclipse
uniform sampler2D uS0;      // lit sum, dark run, longest dark, comm sum
uniform sampler2D uS1;      // comm-gap run, longest comm gap, battery Wh, hours alive
uniform sampler2D uS2;      // lowest battery Wh, sun-and-comm sum, dead flag, lit-any sum
uniform vec4 uField;
uniform vec2 uFieldPx;
uniform int uSteps;
uniform float uDt;          // hours per step
uniform float uMast;
uniform float uLitMin;      // disk fraction that counts as lit
uniform float uEarthMargin; // degrees the Earth's centre must clear the horizon
uniform float uNeedDsn;
uniform vec4 uPower;        // array W in full sun, load W when lit, load W in the dark, battery Wh
uniform vec3 uPanel;        // 1 when the array is fixed, the azimuth it faces (rad), its tilt from flat (rad)
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
${HZ}void main(){
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec4 s0 = texelFetch(uS0, px, 0), s1 = texelFetch(uS1, px, 0), s2 = texelFetch(uS2, px, 0);
  vec2 p = uField.xy + uField.zw * gl_FragCoord.xy / uFieldPx;
  vec3 up, east, north; frame(p, up, east, north);
  float h0 = groundHeight(p) + uMast;
  for (int k = 0; k < uSteps; k++) {
    vec4 sun = texelFetch(uEphem, ivec2(k, 0), 0);
    vec4 ear = texelFetch(uEphem, ivec2(k, 1), 0);
    float dsn = floor(ear.w), ecl = fract(ear.w) / 0.999;
    float sEl = asin(clamp(dot(sun.xyz, up), -1.0, 1.0));
    float fs = 0.0;
    float gain = 1.0; // share of the array's full output its orientation allows
    if (sEl > radians(EL_MIN)) {
      float sAz = atan(dot(sun.xyz, east), dot(sun.xyz, north));
      fs = diskFraction(sEl, hz(sAz), sun.w) * (1.0 - ecl);
      // a fixed array gives the cosine of the angle between its normal and the Sun
      if (uPanel.x > 0.5) gain = max(0.0, cos(sEl) * sin(uPanel.z) * cos(sAz - uPanel.y) + sin(sEl) * cos(uPanel.z));
    }
    vec3 e = ear.xyz - up * ((R + h0) * 1e-3);
    e = normalize(e);
    float eEl = asin(clamp(dot(e, up), -1.0, 1.0));
    float comm = 0.0;
    if (eEl > radians(EL_MIN)) {
      float eAz = atan(dot(e, east), dot(e, north));
      comm = (eEl - hz(eAz) >= radians(uEarthMargin)) && (dsn > 0.5 || uNeedDsn < 0.5) ? 1.0 : 0.0;
    }
    bool lit = fs >= uLitMin;
    s0.x += fs;
    s0.y = lit ? 0.0 : s0.y + uDt;
    s0.z = max(s0.z, s0.y);
    s0.w += comm;
    s1.x = comm > 0.5 ? 0.0 : s1.x + uDt;
    s1.y = max(s1.y, s1.x);
    if (s2.z < 0.5) {
      float load = lit ? uPower.y : uPower.z;
      s1.z = min(uPower.w, s1.z + (uPower.x * fs * gain - load) * uDt);
      s2.x = min(s2.x, s1.z);
      if (s1.z <= 0.0) { s2.z = 1.0; s1.z = 0.0; } else { s1.w += uDt; }
    }
    s2.y += lit && comm > 0.5 ? 1.0 : 0.0;
    s2.w += fs > 0.0 ? 1.0 : 0.0;
  }
  // no terrain here (outside the 60 S grid): never counts as meeting anything
  if (groundHeight(p) < NODATA) { s0 = vec4(0.0, 1e6, 1e6, 0.0); s1 = vec4(1e6, 1e6, 0.0, 0.0); s2 = vec4(0.0, 0.0, 1.0, 0.0); }
  o0 = s0; o1 = s1; o2 = s2;
}`

// Final picture: shaded relief under the true Sun, plus the chosen layer.
export const FS_VIEW = COMMON + `
uniform vec4 uView;       // left x, bottom y, width, height in metres
uniform vec2 uViewPx;
uniform sampler2D uNow;   // from FS_NOW
uniform vec4 uNowRect;    // field rect the now-texture covers (left, bottom, w, h); w = 0 when empty
uniform sampler2D uM0;
uniform sampler2D uM1;
uniform sampler2D uM2;
uniform vec4 uMRect;      // field rect of the metrics; w = 0 when empty
uniform vec3 uSunDir;
uniform int uMode;        // 0 light now, 1 metric, 2 where the needs are met
uniform int uMetric;
uniform vec2 uRange;      // metric value shown darkest and brightest
uniform vec3 uHue;        // colour of the bright end
uniform float uSteps;
uniform vec4 uNeeds;      // min lit fraction, max dark hours, min comm fraction, min hours alive
uniform float uPx;        // metres per screen pixel
uniform float uEarthTint; // 1: tint ground that has the Earth in view
uniform sampler2D uPsr;   // metres to permanent shadow, same grid as the metrics
uniform float uNeedPsr;   // need: permanent shadow within this many metres (0: none)
uniform float uPsrOn;     // 1 when uPsr holds data
out vec4 o;
void main(){
  vec2 p = uView.xy + uView.zw * gl_FragCoord.xy / uViewPx;
  float d = max(uPx, uFocusRect.w > 0.5 ? uFocusRes : MID_RES);
  float hx = groundHeight(p + vec2(d, 0.0)) - groundHeight(p - vec2(d, 0.0));
  float hy = groundHeight(p + vec2(0.0, d)) - groundHeight(p - vec2(0.0, d));
  vec3 up, east, north; frame(p, up, east, north);
  float rho = max(length(p), 1e-3);
  float sl = p.x / rho, cl = p.y / rho;
  vec3 X3 = cl * east + sl * north;      // map +x on the ground
  vec3 Y3 = -sl * east + cl * north;     // map +y on the ground
  vec3 n = normalize(up - (hx / (2.0 * d)) * X3 - (hy / (2.0 * d)) * Y3);
  float relief = clamp(dot(n, normalize(0.8 * up - 0.45 * X3 + 0.45 * Y3)), 0.0, 1.0);
  vec3 col;
  if (uMode == 0) {
    vec4 nw = vec4(0.0);
    if (uNowRect.z > 0.0) nw = texture(uNow, (p - uNowRect.xy) / uNowRect.zw);
    float cosi = max(dot(n, uSunDir), 0.0);
    // grazing Sun: flat ground gets cos(i) of a few percent, Sun-facing slopes ten times more.
    // A Reinhard curve keeps both readable.
    float L = nw.x * cosi;
    float lum = 1.12 * L / (L + 0.09);
    col = vec3(0.90, 0.88, 0.84) * (0.022 * relief + lum);
    if (uEarthTint > 0.5 && nw.z > 0.0) col += vec3(0.012, 0.040, 0.070) * (0.35 + 0.65 * relief);
  } else {
    vec2 uv = (p - uMRect.xy) / uMRect.zw;
    vec4 m0 = texture(uM0, uv), m1 = texture(uM1, uv), m2 = texture(uM2, uv);
    float psr = uPsrOn > 0.5 ? texture(uPsr, uv).r : 1e7;
    float v = uMetric == 0 ? m0.x / uSteps : uMetric == 1 ? m0.z : uMetric == 2 ? m0.w / uSteps
            : uMetric == 3 ? m1.y : uMetric == 4 ? m1.w : uMetric == 5 ? m2.y / uSteps : uMetric == 6 ? m2.w / uSteps : psr;
    float t = clamp((v - uRange.x) / (uRange.y - uRange.x), 0.0, 1.0);
    bool ok = m0.x / uSteps >= uNeeds.x && m0.z <= uNeeds.y && m0.w / uSteps >= uNeeds.z && m1.w >= uNeeds.w
           && (uNeedPsr <= 0.0 || psr <= uNeedPsr);
    float shade = 0.30 + 0.70 * relief;
    if (uMode == 1) {
      col = mix(vec3(0.012), uHue * uHue, pow(t, 1.3)) * shade + vec3(0.006) * relief;
      if (uMetric == 7 && psr <= 0.0) col = vec3(0.0);   // permanent shadow itself: black
      if (!ok) col = mix(col, vec3(dot(col, vec3(0.33))), 0.35) * 0.55;
    } else {
      // ground that meets the brief keeps its relief; the rest stays readable as terrain, but dark
      col = ok ? uHue * uHue * (0.16 + 0.66 * relief * relief) : vec3(0.034) * shade;
    }
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 || uMRect.z <= 0.0) col = vec3(0.012) * relief;
  }
  if (groundHeight(p) < NODATA) col = vec3(0.0);
  o = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`
