import * as THREE from './three.module.min.js';

/* ------------------------------------------------------------------
   Sacred Mandala — 3D world
   A single continuous WebGL space: gold mandala geometry, drifting
   motes, photographic monoliths in fog, and a filmed jungle backdrop.
------------------------------------------------------------------- */

const GOLD = 0xc9a86a;
const FOG = new THREE.Color(0x0b1410);

const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/* ---------- helpers ---------- */

function radialSprite() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const photoVert = /* glsl */ `
  varying vec2 vUv;
  varying float vDist;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = length(mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const photoFrag = /* glsl */ `
  uniform sampler2D tMap;
  uniform float uOpacity, uRadius, uImgAspect, uPlaneAspect, uFogDensity, uGrain, uTime, uGlobal;
  uniform vec3 uFogColor, uBorder, uTint;
  varying vec2 vUv;
  varying float vDist;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uPlaneAspect, 1.0);
    vec2 hs = vec2(uPlaneAspect, 1.0) * 0.5 - uRadius;
    vec2 q = abs(p) - hs;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
    float mask = 1.0 - smoothstep(-0.006, 0.006, d);

    float k = uPlaneAspect / uImgAspect;
    vec2 tuv = vUv;
    if (k > 1.0) tuv.y = (vUv.y - 0.5) / k + 0.5;
    else         tuv.x = (vUv.x - 0.5) * k + 0.5;

    vec3 col = texture2D(tMap, clamp(tuv, 0.001, 0.999)).rgb;

    // filmic grade: lift shadows toward forest, warm highlights
    col = pow(col, vec3(0.96, 0.98, 1.02));
    col = mix(col, col * uTint, 0.3);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 1.07);
    col = pow(col, vec3(0.92));
    col = clamp((col - 0.5) * 1.08 + 0.5, 0.0, 1.0);

    // gold hairline frame
    float edge = 1.0 - smoothstep(0.0, 0.0075, abs(d + 0.0055));
    col = mix(col, uBorder, edge * 0.85);

    // vignette inside the frame
    col *= 1.0 - 0.28 * pow(length((vUv - 0.5) * 1.42), 2.4);

    // fog
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist);
    col = mix(col, uFogColor, fog);

    float n = hash(vUv * 900.0 + uTime) - 0.5;
    col += n * uGrain;

    gl_FragColor = vec4(col, mask * uOpacity * uGlobal * (1.0 - fog * 0.55));
    if (mask < 0.002) discard;
  }
`;

const backdropVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const backdropFrag = /* glsl */ `
  uniform sampler2D tA, tB;
  uniform float uMix, uTime, uImgAspectA, uImgAspectB, uPlaneAspect, uOpacity;
  uniform vec3 uTint;
  varying vec2 vUv;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }

  vec2 cover(vec2 uv, float planeA, float imgA) {
    float k = planeA / imgA;
    if (k > 1.0) uv.y = (uv.y - 0.5) / k + 0.5;
    else         uv.x = (uv.x - 0.5) * k + 0.5;
    return uv;
  }

  void main() {
    vec2 drift = vec2(sin(uTime * 0.05) * 0.012, cos(uTime * 0.037) * 0.010);
    vec2 uv = vUv + drift;
    vec3 a = texture2D(tA, clamp(cover(uv, uPlaneAspect, uImgAspectA), 0.002, 0.998)).rgb;
    vec3 b = texture2D(tB, clamp(cover(uv, uPlaneAspect, uImgAspectB), 0.002, 0.998)).rgb;
    vec3 col = mix(a, b, uMix);
    col = mix(col, col * uTint, 0.8);

    // deep vignette + top/bottom falloff so type stays legible
    float v = length((vUv - 0.5) * vec2(1.05, 1.25));
    col *= smoothstep(1.05, 0.16, v);
    col *= 1.30;

    float n = hash(vUv * 700.0 + fract(uTime) * 11.0) - 0.5;
    col += n * 0.035;
    gl_FragColor = vec4(col, uOpacity);
  }
`;

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.mouse = new THREE.Vector2();
    this.smoothMouse = new THREE.Vector2();
    this.stops = [];
    this.keyframes = [
      { p: [0, 0.10, 11.0], l: [0, 0, 0] },
      { p: [0, 0.15, 2.2], l: [0, 0, -2.2] },
      { p: [-4.6, 0.30, -26.5], l: [-4.6, 0.0, -44] },
      { p: [-4.4, 0.80, -62.0], l: [-4.4, 0.0, -81] },
      { p: [-6.0, 0.60, -112.0], l: [-6.0, 0.15, -126] },
      { p: [-4.8, 0.30, -146.0], l: [-4.8, 0.10, -164] },
      { p: [-2.0, 0.20, -172.0], l: [-2.0, 0.10, -188] },
      { p: [0, 0.05, -193], l: [0, 0, -203] }
    ];
    this.keyframesNarrow = [
      { p: [0, 0.10, 15.0], l: [0, 0, 0] },
      { p: [0, 0.15, 2.2], l: [0, 0, -2.2] },
      { p: [0, 0.25, -30.0], l: [0, 0.0, -44] },
      { p: [0, 0.70, -66.0], l: [0, 0.0, -81] },
      { p: [0, 0.45, -100.0], l: [0, 0.10, -112] },
      { p: [0, 0.20, -150.0], l: [0, 0.05, -164] },
      { p: [0, 0.15, -172.0], l: [0, 0.05, -188] },
      { p: [0, 0.05, -196], l: [0, 0, -203] }
    ];
    this.roomIndex = 0;
    this.scroll = 0;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.isNarrow = window.innerWidth < 820;
    this.tiles = [];
    this.exploreTiles = [];
    this._build();
  }

  _build() {
    const { canvas } = this;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(FOG, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(FOG.getHex(), 0.0105);

    this.camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 400);
    this.camera.position.set(0, 0.2, 11);
    this.look = new THREE.Vector3(0, 0, 0);
    this.lookTarget = new THREE.Vector3(0, 0, 0);

    this.loader = new THREE.TextureLoader();
    this.loader.crossOrigin = 'anonymous';
    this.aniso = this.renderer.capabilities.getMaxAnisotropy();

    this._backdrop();
    this._mandala();
    this._motes();
    this._stageSpace();
    this._stageExplore();
    this._stageRooms();
    this._stageDay();
    this._stageCta();

    this._fitStages();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /* portrait screens get the same clusters, folded in to fit the frame */
  _fitStages() {
    const k = this.isNarrow ? 0.30 : 1;
    const centred = this.isNarrow ? 0 : null;
    const apply = (g, baseX, baseY = 0) => {
      if (!g) return;
      g.scale.setScalar(k);
      g.position.x = this.isNarrow ? (centred ?? 0) : baseX;
      if (this.isNarrow) g.position.y = baseY;
    };
    apply(this.spaceGroup, 0);
    apply(this.exploreGroup, 0, 0.1);
    apply(this.roomsGroup, 4.4, 0.1);
    apply(this.dayGroup, -1.6, 0.2);
  }

  tex(url) {
    const t = this.loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.aniso;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }

  /* ---------- camera-fixed atmospheric backdrop ---------- */
  _backdrop() {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.bgA = this.tex('img/poster.jpg');
    this.bgB = this.tex('img/mist-jungle.jpg');

    this.bgMat = new THREE.ShaderMaterial({
      vertexShader: backdropVert,
      fragmentShader: backdropFrag,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        tA: { value: this.bgA },
        tB: { value: this.bgB },
        uMix: { value: 0.0 },
        uTime: { value: 0 },
        uImgAspectA: { value: 4 / 3 },
        uImgAspectB: { value: 1.0 },
        uPlaneAspect: { value: 1 },
        uOpacity: { value: 0.85 },
        uTint: { value: new THREE.Color(0x98b3a2) }
      }
    });
    const bg = new THREE.Mesh(geo, this.bgMat);
    bg.scale.set(1, 1, 1);
    bg.position.set(0, 0, -44);
    bg.renderOrder = -10;
    bg.frustumCulled = false;
    this.bgMesh = bg;
    this.camera.add(bg);
    this.scene.add(this.camera);
  }

  _sizeBackdrop() {
    const d = 44;
    const h = 2 * Math.tan((this.camera.fov * Math.PI) / 360) * d;
    const w = h * this.camera.aspect;
    this.bgMesh.scale.set(w * 1.06, h * 1.06, 1);
    this.bgMat.uniforms.uPlaneAspect.value = w / h;
  }

  /* ---------- the brand mandala, extruded into 3D ---------- */
  _mandala() {
    const group = new THREE.Group();
    this.mandala = group;

    const circle = (r, seg = 128) => {
      const curve = new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2, false, 0);
      return new THREE.BufferGeometry().setFromPoints(curve.getPoints(seg));
    };

    const mat = new THREE.LineBasicMaterial({
      color: GOLD, transparent: true, opacity: 0.62,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const matSoft = new THREE.LineBasicMaterial({
      color: GOLD, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false
    });

    // structure: concentric rings
    const rings = new THREE.Group();
    [[2.15, mat], [2.95, matSoft], [3.62, mat], [4.44, matSoft]].forEach(([r, m], i) => {
      rings.add(new THREE.LineLoop(circle(r, 200), m));
    });

    // nine petals
    const petals = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const l = new THREE.LineLoop(circle(1.32), mat);
      l.position.set(Math.cos(a) * 2.62, Math.sin(a) * 2.62, 0);
      petals.add(l);
    }

    // eighteen beads on the outer rim
    const beads = new THREE.Group();
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const l = new THREE.LineLoop(circle(0.46, 48), matSoft);
      l.position.set(Math.cos(a) * 4.86, Math.sin(a) * 4.86, 0);
      beads.add(l);
    }

    // radial ticks between the rings
    const ticks = new THREE.Group();
    const tickMat = new THREE.LineBasicMaterial({
      color: GOLD, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const pts = [
        new THREE.Vector3(Math.cos(a) * 3.68, Math.sin(a) * 3.68, 0),
        new THREE.Vector3(Math.cos(a) * 3.96, Math.sin(a) * 3.96, 0)
      ];
      ticks.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), tickMat));
    }

    petals.position.z = 0.35;
    beads.position.z = -0.45;
    rings.position.z = 0;
    ticks.position.z = 0.1;

    group.add(rings, petals, beads, ticks);
    this.mandalaRings = [
      { obj: petals, speed: 0.05 },
      { obj: beads, speed: -0.028 },
      { obj: rings, speed: 0.008 },
      { obj: ticks, speed: 0.014 }
    ];

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialSprite(), color: 0xffe3b0, transparent: true,
      opacity: 0.46, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glow.scale.set(3.8, 3.8, 1);
    group.add(glow);
    this.mandalaGlow = glow;

    group.position.set(0, 0, -2.6);
    group.scale.setScalar(0.78);
    this.scene.add(group);
  }

  /* ---------- dust / motes ---------- */
  _motes() {
    const N = this.reduced ? 260 : 900;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const r = 4 + Math.random() * 26;
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 26;
      pos[i * 3 + 2] = Math.sin(a) * r - 40 + Math.random() * 40;
      seed[i] = Math.random() * Math.PI * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.moteSeed = seed;
    this.motePos = pos;
    const m = new THREE.PointsMaterial({
      size: 0.11, map: radialSprite(), color: 0xffd79a, transparent: true,
      opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    this.motes = new THREE.Points(g, m);
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);
  }

  /* ---------- photo monolith ---------- */
  photo(url, w, h, imgAspect, opts = {}) {
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.ShaderMaterial({
      vertexShader: photoVert,
      fragmentShader: photoFrag,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: {
        tMap: { value: this.tex(url) },
        uOpacity: { value: opts.opacity ?? 1 },
        uRadius: { value: opts.radius ?? 0.03 },
        uImgAspect: { value: imgAspect },
        uPlaneAspect: { value: w / h },
        uFogDensity: { value: 0.0085 },
        uFogColor: { value: FOG },
        uBorder: { value: new THREE.Color(GOLD) },
        uTint: { value: new THREE.Color(opts.tint ?? 0xfff4e4) },
        uGrain: { value: 0.035 },
        uTime: { value: 0 },
        uGlobal: { value: 1 }
      }
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.baseScale = 1;
    return mesh;
  }

  /* ---------- 02 · sanctuary stills ---------- */
  _stageSpace() {
    const g = new THREE.Group();
    g.position.set(0, 0, -44);
    this.scene.add(g);

    const a = this.photo('img/space-pool.jpg', 6.0, 4.0, 1536 / 1024, { radius: 0.018 });
    a.position.set(1.7, -0.75, -1.2);
    a.rotation.y = -0.12;
    g.add(a);

    const b = this.photo('img/yoga.jpg', 4.2, 5.25, 1800 / 2400, { radius: 0.018 });
    b.position.set(-3.6, 0.55, -3.6);
    b.rotation.y = 0.22;
    g.add(b);

    const c = this.photo('img/breakfast-spread.jpg', 2.9, 3.6, 1707 / 2560, { radius: 0.018 });
    c.position.set(4.7, 1.55, -2.4);
    c.rotation.y = -0.3;
    g.add(c);

    this.spaceGroup = g;
    this.spaceTiles = [a, b, c];
  }

  /* ---------- 03 · the spaces ring ---------- */
  _stageExplore() {
    const g = new THREE.Group();
    g.position.set(0, 0, -80);
    this.scene.add(g);

    // four above, three below — a curated mosaic, not a pile
    const items = [
      ['img/yoga-class.jpg', 1048 / 1398, [-4.0, 1.75, 0.4], 3.0, 3.05, 0.10],
      ['img/space-pool.jpg', 1536 / 1024, [-0.4, 1.80, -0.3], 3.0, 3.05, -0.04],
      ['img/space-sauna.jpg', 1, [3.2, 1.75, -1.0], 3.0, 3.05, -0.12],
      ['img/space-ice-bath.jpg', 1672 / 941, [6.8, 1.80, -1.8], 3.0, 3.05, -0.18],
      ['img/space-massage.jpg', 960 / 1280, [-2.2, -1.45, -0.6], 3.0, 2.25, 0.08],
      ['img/space-river.jpg', 1672 / 941, [1.4, -1.50, 0.4], 3.0, 2.25, -0.02],
      ['img/space-jungle.jpg', 1672 / 941, [5.0, -1.45, -1.2], 3.0, 2.25, -0.14]
    ];

    items.forEach(([url, asp, pos, w, h, rot], i) => {
      const m = this.photo(url, w, h, asp, { radius: 0.016 });
      m.position.set(pos[0], pos[1], pos[2]);
      m.rotation.y = rot;
      m.userData.idx = i;
      g.add(m);
      this.exploreTiles.push(m);
    });

    this.exploreGroup = g;
  }

  /* ---------- 04 · the seven rooms ---------- */
  _stageRooms() {
    const g = new THREE.Group();
    g.position.set(4.4, 0, -112);
    this.scene.add(g);

    const rooms = [
      ['img/lakshmi-room.jpg', 1920 / 2560],
      ['img/saraswati-room.jpg', 2000 / 1125],
      ['img/shiva-room.jpg', 2000 / 2666],
      ['img/parvati-room.jpg', 1920 / 2498],
      ['img/ganesha-room.jpg', 1028 / 1371],
      ['img/vishnu-room.jpg', 1536 / 1024],
      ['img/buddha-house.jpg', 1536 / 1024]
    ];

    const R = 14;
    rooms.forEach(([url, asp], i) => {
      const a = (i / rooms.length) * Math.PI * 2;
      const m = this.photo(url, 4.0, 5.3, asp, { radius: 0.012 });
      m.position.set(Math.sin(a) * R, 0.25 + Math.sin(i * 1.3) * 0.22, -Math.cos(a) * R);
      m.lookAt(0, 0.25, 0);
      g.add(m);
      this.tiles.push(m);
    });

    // floor mandala under the rooms
    const floor = new THREE.Group();
    [3.4, 7.2, 11.4].forEach((r, i) => {
      const curve = new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2, false, 0);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(180));
      const line = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({
        color: GOLD, transparent: true, opacity: 0.16 - i * 0.03,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      line.rotation.x = -Math.PI / 2;
      line.position.y = -2.9;
      floor.add(line);
    });
    g.add(floor);

    this.roomsGroup = g;
    this.roomRotation = 0;
    this.dragRot = 0;
    this.dragVel = 0;
  }

  /* ---------- 05 · a day ---------- */
  _stageDay() {
    const g = new THREE.Group();
    g.position.set(-1.6, 0.2, -160);
    this.scene.add(g);

    const days = [
      ['img/morning.jpg', 1800 / 2400, -3.2, 0.95, 0.2, 0.10],
      ['img/daytime.jpg', 1170 / 1724, 0.2, 0.45, -0.6, 0.02],
      ['img/evening.jpg', 1707 / 2560, 3.6, -0.05, -1.6, -0.06],
      ['img/night.jpg', 960 / 1280, 7.0, -0.55, -2.4, -0.14]
    ];

    days.forEach(([url, asp, x, y, z, rot]) => {
      const m = this.photo(url, 3.0, 4.15, asp, { radius: 0.016, opacity: 0.95 });
      m.position.set(x, y, z);
      m.rotation.y = rot;
      g.add(m);
    });

    this.dayGroup = g;
  }

  /* ---------- 06 · cta mandala ---------- */
  _stageCta() {
    const g = new THREE.Group();
    g.position.set(0, 0, -203);
    const curveGeo = [];
    for (let i = 0; i < 4; i++) {
      const R = 1.6 + i * 1.6;
      const curve = new THREE.EllipseCurve(0, 0, R, R, 0, Math.PI * 2, false, 0);
      curveGeo.push(new THREE.BufferGeometry().setFromPoints(curve.getPoints(160)));
    }
    const mat = new THREE.LineBasicMaterial({
      color: GOLD, transparent: true, opacity: 0.18,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    this.ctaRings = [];
    for (let i = 0; i < 5; i++) {
      const line = new THREE.LineLoop(curveGeo[i % 4], mat);
      line.rotation.set(Math.random() * 0.6, Math.random() * 0.6, 0);
      line.position.z = -i * 1.4;
      g.add(line);
      this.ctaRings.push(line);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialSprite(), color: 0xffe3b0, transparent: true,
      opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glow.scale.set(9, 9, 1);
    g.add(glow);
    g.scale.setScalar(0.55);
    this.scene.add(g);
    this.ctaGroup = g;
  }

  /* ---------- public api ---------- */
  setStops(stops) { this.stops = stops; }

  highlight(i) {
    this.exploreTiles.forEach((t, k) => (t.userData.hot = k === i));
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.isNarrow = w < 820;
    this._fitStages();
    this._sizeBackdrop();
  }

  onPointer(x, y) { this.mouse.set(x, y); }

  onDrag(dx) {
    this.dragVel += dx * 0.00035;
  }

  update(scrollY, time, dt) {
    const vh = window.innerHeight;
    const cur = scrollY / vh;

    /* ---- camera path (section-relative, holds while pinned) ---- */
    let idx = 0;
    for (let i = 0; i < this.stops.length; i++) if (cur >= this.stops[i].top) idx = i;
    const sec = this.stops[Math.min(idx, this.stops.length - 1)];
    const local = clamp((cur - sec.top) / Math.max(0.0001, sec.height));
    const t = smooth(clamp((local - 0.62) / 0.38));

    const kf = this.isNarrow ? this.keyframesNarrow : this.keyframes;
    const a = kf[Math.min(idx, kf.length - 1)];
    const b = kf[Math.min(idx + 1, kf.length - 1)];
    const px = a.p[0] + (b.p[0] - a.p[0]) * t;
    const py = a.p[1] + (b.p[1] - a.p[1]) * t;
    const pz = a.p[2] + (b.p[2] - a.p[2]) * t;
    const lx = a.l[0] + (b.l[0] - a.l[0]) * t;
    const ly = a.l[1] + (b.l[1] - a.l[1]) * t;
    const lz = a.l[2] + (b.l[2] - a.l[2]) * t;

    this.smoothMouse.x = damp(this.smoothMouse.x, this.mouse.x, 2.4, dt);
    this.smoothMouse.y = damp(this.smoothMouse.y, this.mouse.y, 2.4, dt);

    this.camera.position.x = damp(this.camera.position.x, px + this.smoothMouse.x * 0.85, 3.2, dt);
    this.camera.position.y = damp(this.camera.position.y, py - this.smoothMouse.y * 0.55, 3.2, dt);
    this.camera.position.z = damp(this.camera.position.z, pz, 3.2, dt);

    this.lookTarget.set(
      lx + this.smoothMouse.x * 0.35,
      ly - this.smoothMouse.y * 0.22,
      lz
    );
    this.look.lerp(this.lookTarget, 1 - Math.exp(-3.4 * dt));
    this.camera.lookAt(this.look);

    /* ---- mandala life ---- */
    if (this.mandala) {
      this.mandala.rotation.y = Math.sin(time * 0.1) * 0.26 + this.smoothMouse.x * 0.2;
      this.mandala.rotation.x = Math.cos(time * 0.08) * 0.12 - this.smoothMouse.y * 0.1;
      this.mandalaRings.forEach((r) => { r.obj.rotation.z = time * r.speed; });
      const breath = 1 + Math.sin(time * 0.5) * 0.02;
      const shrink = 1 - Math.min(cur, 1.6) * 0.16;
      this.mandala.scale.setScalar(0.78 * breath * shrink);
      this.mandalaGlow.material.opacity = 0.4 + Math.sin(time * 0.8) * 0.07;
    }

    /* ---- motes drift ---- */
    if (this.motes) {
      const p = this.motePos;
      for (let i = 0; i < this.moteSeed.length; i++) {
        const s = this.moteSeed[i];
        p[i * 3] += Math.sin(time * 0.25 + s) * 0.0016;
        p[i * 3 + 1] += Math.cos(time * 0.2 + s * 1.3) * 0.0012 + 0.0009;
        if (p[i * 3 + 1] > 13) p[i * 3 + 1] = -13;
      }
      this.motes.geometry.attributes.position.needsUpdate = true;
      this.motes.position.z = this.camera.position.z;
      this.motes.rotation.y = time * 0.008;
    }

    /* ---- per-stage motion ---- */
    const pulse = (g, amt = 0.012) => {
      if (!g) return;
      g.position.y = Math.sin(time * 0.6) * amt;
      g.rotation.y = Math.sin(time * 0.18) * 0.02;
    };
    pulse(this.spaceGroup);
    pulse(this.dayGroup);

    if (this.exploreGroup) {
      this.exploreGroup.rotation.y = Math.sin(time * 0.12) * 0.025;
      this.exploreGroup.position.y = Math.sin(time * 0.5) * 0.05;
      this.exploreTiles.forEach((m, i) => {
        const target = m.userData.hot ? 1.10 : 1.0;
        m.userData.baseScale = damp(m.userData.baseScale, target, 6, dt);
        m.scale.setScalar(m.userData.baseScale);
        m.material.uniforms.uOpacity.value = damp(
          m.material.uniforms.uOpacity.value, m.userData.hot ? 1 : 0.94, 5, dt
        );
      });
    }

    /* ---- rooms carousel ---- */
    if (this.roomsGroup) {
      const roomsEl = document.getElementById('stay');
      if (roomsEl) {
        const top = roomsEl.offsetTop;
        const h = roomsEl.offsetHeight;
        const p = clamp((scrollY + vh * 0.5 - top) / h);
        this.dragVel *= 0.94;
        this.dragRot += this.dragVel;
        this.dragRot *= 0.996;
        const base = -p * Math.PI * 2;
        this.roomsGroup.rotation.y = damp(
          this.roomsGroup.rotation.y, base + this.dragRot, 2.6, dt
        );
        const step = (Math.PI * 2) / 7;
        let ri = Math.round((-this.roomsGroup.rotation.y) / step) % 7;
        if (ri < 0) ri += 7;
        this.roomIndex = ri;

        // only the frames facing you stay bright
        const rot = this.roomsGroup.rotation.y;
        this.tiles.forEach((m, i) => {
          const eff = ((i * step + rot) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          const d = Math.min(eff, Math.PI * 2 - eff);
          const o = Math.max(0.06, 1 - Math.pow(d / step, 1.6) * 0.94);
          m.material.uniforms.uOpacity.value = damp(m.material.uniforms.uOpacity.value, o, 4, dt);
        });
      }
    }

    if (this.ctaRings) {
      this.ctaGroup.rotation.z = time * 0.05;
      this.ctaRings.forEach((r, i) => {
        r.rotation.y += 0.0012 * (i % 2 ? -1 : 1);
        r.rotation.x += 0.0008 * (i % 3 ? 1 : -1);
      });
    }

    /* ---- backdrop & atmosphere by section ---- */
    this.bgMat.uniforms.uTime.value = time;
    const targetMix = clamp((cur - 1.2) / 2.2);
    this.bgMat.uniforms.uMix.value = damp(this.bgMat.uniforms.uMix.value, targetMix, 1.6, dt);
    this.bgMat.uniforms.uOpacity.value = damp(
      this.bgMat.uniforms.uOpacity.value,
      cur < 1.5 ? 0.96 : cur > 6.2 ? 0.46 : 0.26,
      2, dt
    );

    const warm = clamp((cur - 3.4) / 2.2);
    const tint = new THREE.Color(0x93ac9b).lerp(new THREE.Color(0xd9bb92), warm * 0.3);
    this.bgMat.uniforms.uTint.value.lerp(tint, 1 - Math.exp(-2 * dt));
    FOG.copy(new THREE.Color(0x0b1410).lerp(new THREE.Color(0x120e0a), warm * 0.45));
    this.renderer.setClearColor(FOG, 1);

    // keep photo fog uniforms in sync
    const f = FOG;
    const syncFog = (m) => {
      m.material.uniforms.uFogColor.value.copy(f);
      m.material.uniforms.uTime.value = time;
    };
    const dim = this.isNarrow ? 0.8 : 1;
    const allTiles = [...this.spaceTiles, ...this.exploreTiles, ...this.tiles, ...this.dayGroup.children];
    allTiles.forEach((m) => {
      if (!m.material || !m.material.uniforms || !m.material.uniforms.uGlobal) return;
      m.material.uniforms.uGlobal.value = damp(m.material.uniforms.uGlobal.value, dim, 3, dt);
    });

    this.spaceTiles.forEach(syncFog);
    this.exploreTiles.forEach(syncFog);
    this.tiles.forEach(syncFog);

    this.renderer.render(this.scene, this.camera);
  }

  start(getScroll) {
    const loop = () => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.update(getScroll(), this.clock.elapsedTime, dt);
      requestAnimationFrame(loop);
    };
    loop();
  }
}
