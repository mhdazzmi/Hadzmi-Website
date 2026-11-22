/* =====================================================================
   LARI PASAR 3D (Three.js): lari di jalan pasar, 3 jalur, hindari gerobak & rintangan.
   Modul ini hanya mengurus tampilan 3D + simulasi pelari. Sinkronisasi online,
   meja, bot, jeda & podium diatur games3.js lewat sistem game di games.js.
   ===================================================================== */
import * as THREE from './vendor/three.module.min.js';

const LX = [-2.3, 0, 2.3];
const RUN_START = 8, RUN_MAX = 16;

/* ---------- angka acak dengan seed (lintasan sama di semua HP) ---------- */
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = n => Math.floor(Math.random() * n);

/* ---------- tekstur & material bersama ---------- */
function canvasTex(w, h, fn, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); }
  return t;
}
const FONT = '800 52px system-ui,-apple-system,sans-serif';
const _m = document.createElement('canvas').getContext('2d');
function labelTex(txt, bg) {
  _m.font = FONT; const w = Math.max(160, Math.ceil(_m.measureText(txt).width) + 64);
  const t = canvasTex(w, 96, (g, w, h) => {
    g.fillStyle = bg; g.beginPath(); if (g.roundRect) g.roundRect(6, 8, w - 12, h - 16, 40); else g.rect(6, 8, w - 12, h - 16); g.fill();
    g.fillStyle = '#fff'; g.font = FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w / 2, h / 2 + 2);
  });
  t.userData = { aspect: w / 96 }; return t;
}
const M = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .75 }, o || {}));
let SH = null;   // sumber daya bersama, dibuat sekali
function shared() {
  if (SH) return SH;
  const stripeTex = c => canvasTex(128, 32, (g, w, h) => { for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#fff' : c; g.fillRect(i * w / 6, 0, w / 6, h); } g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, h - 5, w, 5); });
  SH = {
    roadTex: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#8A8A90'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},.05)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.fillStyle = '#F4F4F4'; for (const x of [w / 3, w * 2 / 3]) g.fillRect(x - 3, 20, 6, 110);
      g.fillStyle = '#C9C9CC'; g.fillRect(0, 0, 8, h); g.fillRect(w - 8, 0, 8, h);
    }, [1, 8]),
    woodTex: canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = '#C8873E'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#8A5527'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
      g.lineWidth = 5; g.beginPath(); g.moveTo(4, 4); g.lineTo(w - 4, h - 4); g.moveTo(w - 4, 4); g.lineTo(4, h - 4); g.stroke();
    }),
    batikTex: canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#8D5524'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#F3C98B'; g.lineWidth = 3;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const cx = x * 32 + 16 + (y % 2) * 16, cy = y * 32 + 16;
        g.beginPath(); g.moveTo(cx, cy - 11); g.lineTo(cx + 11, cy); g.lineTo(cx, cy + 11); g.lineTo(cx - 11, cy); g.closePath(); g.stroke();
        g.fillStyle = '#3E2210'; g.beginPath(); g.arc(cx, cy, 3.5, 0, 7); g.fill();
      }
    }, [2, 1]),
    stripeMats: ['#E8325A', '#1E7BE0', '#2DB84D', '#F7B500', '#AF52DE'].map(c => M(0xffffff, { map: stripeTex(c) })),
    sand: M(0xE2C08E), wood: M(0xA0703E), dark: M(0x5A3A1E), wheel: M(0x2C2C2E, { roughness: .5 }), cart: M(0x7A4A22),
    coin: M(0xF5B800, { metalness: .6, roughness: .3, emissive: 0x553300, emissiveIntensity: .25 }),
    puddle: new THREE.MeshStandardMaterial({ color: 0x5AA8F0, roughness: .05, metalness: .2, transparent: true, opacity: .8 }),
    leaf: M(0x4CAF50), trunk: M(0x7A5230), signs: {},
  };
  return SH;
}
const sign = (txt, bg) => { const S = shared(); return S.signs[txt] || (S.signs[txt] = M(0xffffff, { map: labelTex(txt, bg) })); };

/* =====================================================================
   KARAKTER (nama = nama kucing, sama dengan nama bot di Ludo)
   ===================================================================== */
export const CHARS = [
  { id: 'oren', name: 'Cello', tag: '#F57C00', animal: 'cat', fur: 0xFF9A2E, belly: 0xFFE0B2 },
  { id: 'hitam', name: 'Itam Buruak', tag: '#3A3A3C', animal: 'cat', fur: 0x2B2B2E, belly: 0x4A4A4E, eye: 0xFFD54F, mouth: 0xFF8A9A },
  { id: 'abu', name: 'Celek', tag: '#78909C', animal: 'cat', fur: 0xA7ADB4, belly: 0xF2F2F2 },
  { id: 'kelinci', name: 'Momoy', tag: '#8E8E93', animal: 'bunny', fur: 0xF7F7F7, belly: 0xFFD6E0 },
  { id: 'bapak', name: 'Alang', tag: '#8A4B14', skin: 0xE2AE7E, shirt: 'batik', arm: 0xE2AE7E, pants: 0x2C3E50, shoe: 0x3A2A1A, hat: 'peci', mustache: true },
  { id: 'ibu', name: 'Manis', tag: '#D81B60', skin: 0xF1C9A0, shirt: 0xC2185B, arm: 0xC2185B, pants: 0xC2185B, shoe: 0xFFFFFF, hat: 'hijab', hijab: 0xF8A5C2, skirt: true },
  { id: 'anak', name: 'Ujang', tag: '#1E7BE0', skin: 0xE2AE7E, shirt: 0xE53935, arm: 0xE2AE7E, pants: 0x1E5BD8, shoe: 0xFFFFFF, hat: 'cap', cap: 0xFFC107 },
];
export const charById = id => CHARS.find(c => c.id === id) || CHARS[0];

function makeChar(spec, label, tagCol) {
  const S = shared();
  const mm = (c, o) => M(c, Object.assign({ transparent: true }, o || {}));
  const gp = new THREE.Group(), body = new THREE.Group(); gp.add(body);
  const an = spec.animal;
  const skinM = mm(an ? spec.fur : spec.skin, { roughness: .6 });
  const shirtM = an ? mm(spec.fur) : spec.shirt === 'batik' ? mm(0xffffff, { map: S.batikTex }) : mm(spec.shirt);
  const legM = an ? mm(spec.fur) : mm(spec.pants);
  const armM = an ? mm(spec.fur) : mm(spec.arm);
  const shoeM = an ? mm(spec.belly) : mm(spec.shoe);
  const dark = mm(0x2C1A0C, { roughness: .3 }), eyeM = spec.eye ? mm(spec.eye, { roughness: .3 }) : dark, white = mm(0xffffff, { roughness: .3 }), pink = mm(0xFF8A9A);
  const add = (geo, m, x, y, z, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; (parent || body).add(o); return o; };
  add(new THREE.CapsuleGeometry(.34, .42, 6, 16), shirtM, 0, 1.02, 0);
  if (an) add(new THREE.SphereGeometry(.27, 16, 12), mm(spec.belly), 0, .98, -.22).scale.set(1, 1.3, .55);
  if (spec.skirt) add(new THREE.CylinderGeometry(.33, .52, .62, 20), shirtM, 0, .62, 0);
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * .16, .66, 0); body.add(leg);
    add(new THREE.CapsuleGeometry(.12, .3, 4, 10), legM, 0, -.25, 0, leg);
    add(new THREE.SphereGeometry(.15, 12, 10), shoeM, 0, -.5, -.06, leg).scale.set(1, .65, 1.4);
    legs.push(leg);
    const arm = new THREE.Group(); arm.position.set(s * .44, 1.32, 0); arm.rotation.z = s * .25; body.add(arm);
    add(new THREE.CapsuleGeometry(.1, .34, 4, 10), armM, 0, -.24, 0, arm);
    add(new THREE.SphereGeometry(.12, 12, 10), skinM, 0, -.48, 0, arm);
    arms.push(arm);
  }
  // kepala (wajah menghadap arah lari = -z)
  const head = new THREE.Group(); head.position.y = 1.98; body.add(head);
  add(new THREE.SphereGeometry(.52, 28, 20), skinM, 0, 0, 0, head);
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(.075, 12, 10), eyeM, s * .18, .04, -.47, head).scale.set(1, 1.25, .6);
    if (spec.eye) add(new THREE.SphereGeometry(.03, 8, 6), dark, s * .18, .04, -.52, head).scale.set(.6, 1.6, .5);
    add(new THREE.SphereGeometry(.025, 8, 6), white, s * .18 + .025, .08, -.52, head);
    add(new THREE.SphereGeometry(.07, 10, 8), pink, s * .3, -.12, -.42, head).scale.set(1, .6, .4);
  }
  add(new THREE.TorusGeometry(.08, .022, 6, 14, Math.PI), spec.mouth ? mm(spec.mouth) : dark, 0, -.13, -.49, head).rotation.z = Math.PI;
  if (spec.mustache) for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(.04, .14, 4, 8), dark, s * .08, -.06, -.5, head).rotation.z = s * 1.2;
  if (spec.hat === 'peci') add(new THREE.CylinderGeometry(.4, .44, .3, 24), mm(0x1C1C1E, { roughness: .4 }), 0, .4, 0, head);
  if (spec.hat === 'cap') {
    add(new THREE.SphereGeometry(.54, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.1), mm(spec.cap), 0, .06, 0, head);
    add(new THREE.BoxGeometry(.5, .05, .4), mm(spec.cap), 0, .12, -.6, head);
    add(new THREE.SphereGeometry(.535, 20, 12, Math.PI / 2 - 1.3, 2.6, .4, Math.PI * .4), mm(0x2C1A0C), 0, 0, .01, head);
  }
  if (spec.hat === 'hijab') {
    const hm = mm(spec.hijab, { side: THREE.DoubleSide });
    add(new THREE.SphereGeometry(.58, 28, 20, Math.PI * 1.5 + .85, Math.PI * 2 - 1.7, 0, Math.PI * .78), hm, 0, .02, .02, head);
    add(new THREE.ConeGeometry(.62, .75, 24, 1, true), hm, 0, 1.42, 0);
  }
  if (an === 'cat') {
    for (const s of [-1, 1]) add(new THREE.ConeGeometry(.17, .32, 4), skinM, s * .3, .46, 0, head).rotation.z = -s * .35;
    for (const s of [-1, 1]) for (const k of [-1, 1]) add(new THREE.CylinderGeometry(.007, .007, .32), spec.eye ? white : dark, s * .3, -.05 + k * .04, -.45, head).rotation.z = Math.PI / 2 + s * k * .15;
    add(new THREE.SphereGeometry(.04, 8, 6), pink, 0, -.04, -.52, head);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, .85, .3), new THREE.Vector3(0, .95, .7), new THREE.Vector3(0, 1.45, .85), new THREE.Vector3(.12, 1.7, .7)]);
    add(new THREE.TubeGeometry(curve, 20, .07, 8), skinM, 0, 0, 0);
  }
  if (an === 'bunny') {
    for (const s of [-1, 1]) { add(new THREE.CapsuleGeometry(.1, .5, 4, 10), skinM, s * .17, .7, .05, head).rotation.z = -s * .15; add(new THREE.CapsuleGeometry(.05, .4, 4, 8), pink, s * .17, .7, -.03, head).rotation.z = -s * .15; }
    add(new THREE.SphereGeometry(.16, 12, 10), white, 0, .82, .38);
    add(new THREE.SphereGeometry(.045, 8, 6), pink, 0, -.04, -.52, head);
  }
  if (label) {
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(label, tagCol || spec.tag), depthTest: false }));
    tag.scale.set(.48 * tag.material.map.userData.aspect, .48, 1); tag.position.y = 3.25; tag.renderOrder = 9; gp.add(tag);
    gp.userData.tag = tag;
  }
  Object.assign(gp.userData, { body, legs, arms });
  return gp;
}
function animChar(m, ph, jumping, running, fall) {
  const u = m.userData, sw = Math.sin(ph);
  if (jumping) { u.legs.forEach(l => l.rotation.x = .7); u.arms.forEach(a => a.rotation.x = -2.6); }
  else { u.legs[0].rotation.x = sw * .8; u.legs[1].rotation.x = -sw * .8; u.arms[0].rotation.x = -sw * .9; u.arms[1].rotation.x = sw * .9; }
  u.body.position.y = running && !jumping ? Math.abs(Math.sin(ph)) * .1 : 0;
  u.body.rotation.x = (running ? -.12 : 0) - fall * 1.35;
}

/* ---------- gambar kecil karakter untuk pilihan di layar game ---------- */
let thumbCache = null;
export function thumbnails() {
  if (thumbCache) return thumbCache;
  const cv = document.createElement('canvas'); cv.width = 160; cv.height = 200;
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xFFF2E0, 0xB08560, 1.6));
  const l = new THREE.DirectionalLight(0xffffff, 1.6); l.position.set(2, 4, -5); sc.add(l);
  const cam = new THREE.PerspectiveCamera(30, 160 / 200, .1, 50); cam.position.set(0, 1.7, -6.4); cam.lookAt(0, 1.45, 0);
  thumbCache = {};
  for (const c of CHARS) {
    const m = makeChar(c); m.rotation.y = .35; animChar(m, .9, false, false, 0); sc.add(m);
    r.render(sc, cam); thumbCache[c.id] = cv.toDataURL('image/png'); sc.remove(m);
  }
  r.dispose(); r.forceContextLoss();
  return thumbCache;
}

/* =====================================================================
   RINTANGAN
   ===================================================================== */
const CARTS = [['BAKSO', '#E8325A'], ['SATE', '#8D5524'], ['ES TEH', '#1E7BE0'], ['MARTABAK', '#F7B500'], ['SIOMAY', '#2DB84D'], ['CILOK', '#AF52DE'], ['GORENGAN', '#FF7A00'], ['ES DAWET', '#00A3A3'], ['NASI GORENG', '#D32F2F'], ['BAKWAN', '#795548']];
const shadowAll = gp => { gp.traverse(m => { if (m.isMesh) m.castShadow = true; }); return gp; };
const mesh = (geo, m, x, y, z, gp) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); gp.add(o); return o; };
const objMesh = {
  // TINGGI (harus pindah jalur): gerobak jajanan bernama beda-beda, atau motor parkir
  tall(v) {
    const S = shared(), gp = new THREE.Group();
    if (v >= 10) {
      const col = M([0xE53935, 0x1E88E5, 0x43A047, 0x212121, 0xFDD835][v % 5], { roughness: .4 });
      mesh(new THREE.BoxGeometry(.5, .5, 1.6), col, 0, .75, 0, gp);
      mesh(new THREE.BoxGeometry(.45, .14, .8), S.wheel, 0, 1.06, .25, gp);
      mesh(new THREE.BoxGeometry(.5, .9, .25), col, 0, 1.05, -.75, gp).rotation.x = .25;
      mesh(new THREE.CylinderGeometry(.04, .04, .9), S.wheel, 0, 1.55, -.85, gp).rotation.z = Math.PI / 2;
      mesh(new THREE.SphereGeometry(.12, 10, 8), M(0xFFF59D, { emissive: 0x665500 }), 0, 1.3, -.92, gp);
      for (const z of [-.75, .7]) mesh(new THREE.TorusGeometry(.3, .12, 8, 18), S.wheel, 0, .4, z, gp).rotation.y = Math.PI / 2;
      return shadowAll(gp);
    }
    const [name, col] = CARTS[v];
    mesh(new THREE.BoxGeometry(1.7, 1, 1.2), S.cart, 0, .9, 0, gp);
    _m.font = FONT; const sw = Math.min(1.6, .25 + _m.measureText(name).width / 190);
    mesh(new THREE.PlaneGeometry(sw, .42), sign(name, col), 0, .95, .61, gp);
    mesh(new THREE.BoxGeometry(2, .12, 1.5), M(new THREE.Color(col)), 0, 2.1, 0, gp);
    for (const x of [-.8, .8]) for (const z of [-.45, .45]) mesh(new THREE.CylinderGeometry(.05, .05, .7), S.dark, x, 1.75, z, gp);
    for (const x of [-.6, .6]) mesh(new THREE.CylinderGeometry(.32, .32, .15, 18), S.wheel, x * 1.45, .32, 0, gp).rotation.z = Math.PI / 2;
    if (v % 2) mesh(new THREE.CylinderGeometry(.25, .25, .5, 16), M(0xC0C0C0, { metalness: .6, roughness: .3 }), -.45, 1.65, 0, gp);
    return shadowAll(gp);
  },
  // RENDAH (bisa dilompati): peti, karung beras, keranjang buah, ban bekas, tumpukan semangka
  low(v) {
    const S = shared(), gp = new THREE.Group();
    if (v === 0) mesh(new THREE.BoxGeometry(1.25, 1, 1), M(0xffffff, { map: S.woodTex }), 0, .5, 0, gp);
    else if (v === 1) { for (const [x, y, r] of [[-.33, .32, .2], [.33, .32, -.15], [0, .78, .05]]) { const k = mesh(new THREE.CapsuleGeometry(.3, .35, 6, 12), sign('BERAS', '#8D6E63'), x, y, 0, gp); k.rotation.z = Math.PI / 2 + r; k.scale.set(1, 1, .8); } }
    else if (v === 2) {
      mesh(new THREE.CylinderGeometry(.6, .45, .6, 18), M(0xB07A3C, { roughness: .9 }), 0, .3, 0, gp);
      const fc = [0xFF7043, 0xFFCA28, 0x66BB6A, 0xEF5350];
      for (let k = 0; k < 7; k++) mesh(new THREE.SphereGeometry(.18, 10, 8), M(fc[k % 4]), Math.cos(k) * .3, .65 + (k % 2) * .1, Math.sin(k) * .3, gp);
    }
    else if (v === 3) { for (let k = 0; k < 3; k++) mesh(new THREE.TorusGeometry(.42, .17, 10, 22), S.wheel, 0, .17 + k * .32, 0, gp).rotation.x = Math.PI / 2; }
    else { for (const [x, y] of [[-.35, .3], [.35, .3], [0, .75]]) mesh(new THREE.SphereGeometry(.34, 16, 12), M(0x2E7D32, { roughness: .4 }), x, y, 0, gp).scale.set(1.15, .95, 1); }
    return shadowAll(gp);
  },
  puddle() { const gp = new THREE.Group(); const m = mesh(new THREE.CircleGeometry(1, 24), shared().puddle, 0, .02, 0, gp); m.rotation.x = -Math.PI / 2; m.scale.set(1, .6, 1); return gp; },
  coin() { const gp = new THREE.Group(); const m = mesh(new THREE.CylinderGeometry(.32, .32, .08, 24), shared().coin, 0, .6, 0, gp); m.rotation.x = Math.PI / 2; m.castShadow = true; gp.userData.spin = m; return gp; },
};

/* =====================================================================
   BALAPAN
   opt: { root, seed, startAt, me (kursi sendiri / null kalau menonton),
          runners: [{ seat, label, char, tag? }], lanes,
          driver(): boolean  → HP ini yang menjalankan bot,
          bots: Set(kursi bot), paused(): boolean, sfx,
          send(seat, data), fin(seat, {d, k}), restore: { [seat]: data } }
   ===================================================================== */
export function createRace(opt) {
  const S = shared();
  const root = opt.root;
  root.innerHTML = `<div class="lr-hud"><span class="lr-chip" data-r="dist">0 m</span><span class="lr-chip"><i class="lr-coin"></i><span data-r="coin">0</span></span></div>
    <div class="lr-race hidden" data-r="race"></div><div class="lr-msg hidden" data-r="msg"></div><div class="lr-count hidden" data-r="count"></div>
    <div class="lr-help" data-r="help"><span>👈 Kiri</span><span>Tengah: lompat ⬆️</span><span>Kanan 👉</span></div>`;
  const q = k => root.querySelector(`[data-r="${k}"]`);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'lr-canvas';
  root.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const SKY = 0xFFC58F;
  scene.background = new THREE.Color(SKY); scene.fog = new THREE.Fog(SKY, 30, 85);
  const cam = new THREE.PerspectiveCamera(58, 1, .1, 200);
  cam.position.set(0, 5, 8); cam.lookAt(0, 1.2, -7);
  scene.add(new THREE.HemisphereLight(0xFFF2E0, 0xB08560, 1.25));
  const sun = new THREE.DirectionalLight(0xFFE2B8, 1.9);
  sun.position.set(-6, 14, 6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 12, bottom: -14, near: 1, far: 40 });
  scene.add(sun); scene.add(sun.target); sun.target.position.set(0, 0, -4);

  // jalan, tanah, lapak, rumah, pohon
  const roadTex = S.roadTex.clone(); roadTex.needsUpdate = true;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 120), M(0xffffff, { map: roadTex, roughness: .9 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -45); road.receiveShadow = true; scene.add(road);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 160), S.sand);
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.02, -50); ground.receiveShadow = true; scene.add(ground);
  for (const s of [-1, 1]) { const curb = new THREE.Mesh(new THREE.BoxGeometry(.4, .18, 120), M(0xDCDCDC)); curb.position.set(s * 3.8, .09, -45); curb.receiveShadow = true; scene.add(curb); }
  const deco = [];
  const goodsCol = [0xFF7043, 0xFFCA28, 0x66BB6A, 0xEF5350, 0xFFA726].map(c => M(c));
  function makeStall(side) {
    const gp = new THREE.Group();
    const b = mesh(new THREE.BoxGeometry(2.6, 1.1, 1.8), S.wood, 0, .55, 0, gp); b.castShadow = b.receiveShadow = true;
    mesh(new THREE.BoxGeometry(2.7, .08, 1.9), S.dark, 0, 1.12, 0, gp);
    for (const [x, z] of [[-1.25, -.85], [1.25, -.85], [-1.25, .85], [1.25, .85]]) mesh(new THREE.CylinderGeometry(.06, .06, 2.3), S.dark, x, 1.15, z, gp);
    const aw = mesh(new THREE.BoxGeometry(3, .12, 2.3), S.stripeMats[0], 0, 2.35, 0, gp); aw.rotation.z = side * .12; aw.castShadow = true;
    const goods = [];
    for (let i = 0; i < 6; i++) { const g = mesh(new THREE.SphereGeometry(.2, 12, 10), goodsCol[0], -.9 + (i % 3) * .9, 1.3, i < 3 ? -.35 : .35, gp); g.castShadow = true; goods.push(g); }
    gp.userData.spin = () => { aw.material = S.stripeMats[rnd(S.stripeMats.length)]; goods.forEach(g => g.material = goodsCol[rnd(5)]); };
    gp.userData.spin(); gp.rotation.y = side * Math.PI / 2;
    return gp;
  }
  function makeHouse() {
    const gp = new THREE.Group(), h = 3 + Math.random() * 3, w = 3.5 + Math.random() * 1.5;
    const b = mesh(new THREE.BoxGeometry(w, h, 4), M([0xF6E3C6, 0xFFD6A5, 0xE9C7A0, 0xFCE8D8, 0xF2D0B0][rnd(5)]), 0, h / 2, 0, gp); b.castShadow = b.receiveShadow = true;
    const r = mesh(new THREE.ConeGeometry(w * .8, 1.6, 4), M([0xC0504D, 0x8E5A3C, 0xD9733B][rnd(3)]), 0, h + .8, 0, gp); r.rotation.y = Math.PI / 4; r.castShadow = true;
    for (let k = 0; k < 2; k++) mesh(new THREE.PlaneGeometry(.8, .8), M(0x6FA8DC, { roughness: .2 }), -w / 4 + k * w / 2, h * .6, 2.01, gp);
    return gp;
  }
  function makeTree() {
    const gp = new THREE.Group();
    mesh(new THREE.CylinderGeometry(.15, .22, 1.8), S.trunk, 0, .9, 0, gp).castShadow = true;
    const l = mesh(new THREE.IcosahedronGeometry(1, 0), S.leaf, 0, 2.3, 0, gp); l.scale.set(1, 1.1, 1); l.castShadow = true;
    return gp;
  }
  for (let z = 6; z > -84; z -= 7) for (const s of [-1, 1]) {
    const st = makeStall(s); st.position.set(s * 5.6, 0, z + (s > 0 ? 3.5 : 0)); scene.add(st); deco.push(st);
    const hs = makeHouse(); hs.position.set(s * 10.5, 0, z + rnd(3)); hs.rotation.y = s * -Math.PI / 2; scene.add(hs); deco.push(hs);
    if (Math.random() < .5) { const tr = makeTree(); tr.position.set(s * 7.6, 0, z - 3); scene.add(tr); deco.push(tr); }
  }

  /* ---------- lintasan (sama persis di semua HP karena seed) ---------- */
  const rng = mulberry(opt.seed || 1);
  const ri = n => Math.floor(rng() * n);
  let course = [], genTo = 0;
  const lowV = () => ri(5), tallV = () => rng() < .25 ? 10 + ri(5) : ri(CARTS.length);
  function add(t, lane, c, v, h) { course.push({ t, lane, c, v, h: h || 0, mesh: null, taken: {} }); }
  function coinRow(lane, c) { for (let i = 0; i < 4; i++) add('coin', lane, c + 3 + i * 2.2); }
  function generate(upto) {
    while (genTo < upto) {
      const c = genTo, r = rng(), L = [0, 1, 2].sort(() => rng() - .5);
      if (c < 25) { coinRow(1, c + 6); genTo += 16; continue; }
      if (r < .35) { add('tall', L[0], c, tallV()); coinRow(L[1], c); }
      else if (r < .6) { if (rng() < .5) add('tall', L[0], c, tallV()); else add('low', L[0], c, lowV()); add('low', L[1], c, lowV()); coinRow(L[2], c); }
      else if (r < .78 && c > 120) { const v = lowV(); L.forEach(l => add('low', l, c, v)); add('coin', L[0], c, 0, 1.9); }
      else { add('puddle', L[0], c); coinRow(L[1], c - 2); }
      genTo += Math.max(9, 15 - c / 160) + rng() * 6;    // makin jauh makin rapat
    }
  }
  const blocks = o => o.t === 'tall' || o.t === 'low';

  /* ---------- pelari ---------- */
  const lanes = opt.lanes || [1, 0, 2];
  const runners = opt.runners.map((x, i) => {
    const isMe = x.seat === opt.me;
    const m = makeChar(x.char, isMe ? 'Kamu' : x.label, isMe ? '#EA6A0A' : null);
    if (isMe && opt.runners.length < 2) m.userData.tag.visible = false;
    scene.add(m);
    const L = lanes[i % lanes.length];
    return { charId: x.char.id, seat: x.seat, label: isMe ? 'Kamu' : x.label, col: isMe ? '#EA6A0A' : x.char.tag, isMe, mesh: m, d: 0, lane: L, lx: LX[L], jy: 0, jv: 0, slow: 0, alive: true, coins: 0, fall: 0, decided: new Set(), cd: {}, sim: false, net: null, finSent: false, sendAt: 0 };
  });
  const bySeat = s => runners.find(r => r.seat === s);
  const me = opt.me === null || opt.me === undefined ? null : bySeat(opt.me);
  // lanjutkan game tersimpan: ambil posisi terakhir
  let resumed = false;
  for (const r of runners) {
    const x = (opt.restore || {})[r.seat];
    if (x && typeof x.d === 'number') { r.d = x.d; r.lane = x.l | 0; r.lx = LX[r.lane]; r.alive = x.a !== 0; r.coins = x.k | 0; r.fall = r.alive ? 0 : 1; r.finSent = !!x.f; if (r === me && x.d > 0) resumed = true; }
  }
  if (opt.restore) for (const r of runners) r.net = opt.restore[r.seat] ? Object.assign({ at: performance.now() }, opt.restore[r.seat]) : null;
  const t0 = performance.now();
  // hitung mundur: pakai waktu mulai bersama; kalau game lama dilanjutkan, beri 3 detik
  let goAt = Math.max(opt.startAt - Date.now(), resumed || (me && me.d > 0) ? 3000 : 0) + t0;
  if (opt.startAt - Date.now() < -60000 && !(me && me.d > 0)) goAt = t0 + 3000;

  const speedOf = r => Math.min(RUN_MAX, RUN_START + r.d / 170) * (r.slow > 0 ? .6 : 1);
  const sfx = opt.sfx || {};
  const tone = (...a) => { try { sfx.tone && sfx.tone(...a); } catch (e) { } };
  let shake = 0, toastT = 0;
  function toast(s, ms) { const el = q('msg'); el.textContent = s; el.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.add('hidden'), ms || 1600); }

  function act(r, a) {
    if (!r || !r.alive || !running()) return;
    if (a === 'L' && r.lane > 0) { r.lane--; if (r.isMe) tone(520, .05, 'sine', .12); }
    if (a === 'R' && r.lane < 2) { r.lane++; if (r.isMe) tone(520, .05, 'sine', .12); }
    if (a === 'J' && r.jy <= .01) { r.jv = 9.2; if (r.isMe) tone(700, .08, 'sine', .12); }
  }
  function botThink(r) {
    const sp = speedOf(r);
    const ahead = course.filter(o => blocks(o) && o.c - r.d > .8 && o.c - r.d < sp * .75 && !r.decided.has(o.c));
    if (!ahead.length) return;
    const c = Math.min(...ahead.map(o => o.c));
    const row = course.filter(o => o.c === c && blocks(o));
    const blocked = l => row.some(o => o.lane === l);
    if (!blocked(r.lane)) { r.decided.add(c); return; }
    if (Math.random() < .035 + r.d / 9000) { r.decided.add(c); return; }     // kadang telat bereaksi
    if (row.length === 3) { if (c - r.d < sp * .26) { act(r, 'J'); r.decided.add(c); } return; }
    const free = [0, 1, 2].filter(l => !blocked(l)).sort((a, b) => Math.abs(a - r.lane) - Math.abs(b - r.lane))[0];
    if (Math.abs(free - r.lane) === 2 && row.some(o => o.lane === 1 && o.t === 'tall')) { r.decided.add(c); return; }
    act(r, free < r.lane ? 'L' : 'R');
  }
  function crash(r) {
    r.alive = false;
    if (r.isMe) { tone(160, .4, 'sawtooth', .12); shake = .5; toast('Kamu tertabrak! 💥'); }
    else toast(`${r.label} tertabrak! 💥`);
  }
  // senggolan antarpemain: hanya kalau benar-benar sejajar di jalur yang sama
  function senggol(r, now) {
    for (const o of runners) {
      if (o === r || !o.alive || !r.alive) continue;
      if (Math.round((o.lx + 2.3) / 2.3) !== Math.round((r.lx + 2.3) / 2.3) || Math.abs(o.d - r.d) > .9 || r.jy > .5 || o.jy > .5) continue;
      if ((r.cd[o.seat] || 0) > now) continue;
      r.cd[o.seat] = now + 2000;
      if (r.d < o.d) r.slow = Math.max(r.slow, .7);              // yang di belakang kena senggol, melambat sebentar
      const dir = r.seat < o.seat ? -1 : 1, to = r.lane + dir;
      const aman = to >= 0 && to <= 2 && !course.some(x => blocks(x) && x.lane === to && x.c - r.d > -1 && x.c - r.d < 4);
      if (aman) r.lane = to;
      r.jv = Math.max(r.jv, 4);
      if (r.isMe || o.isMe) { tone(330, .12, 'sine', .16, 0, 660); tone(660, .14, 'sine', .1, .08, 330); if (r.isMe) { shake = .2; toast('Senggolan! 😆', 1000); } }
    }
  }

  /* ---------- input ---------- */
  let x0 = 0, y0 = 0;
  const cv = renderer.domElement;
  const onDown = e => { x0 = e.clientX; y0 = e.clientY; };
  const onUp = e => {
    if (!me) return;
    q('help').classList.add('hidden');
    const dx = e.clientX - x0, dy = e.clientY - y0, rc = cv.getBoundingClientRect();
    if (Math.abs(dx) > 35 || Math.abs(dy) > 35) { if (Math.abs(dx) > Math.abs(dy)) act(me, dx < 0 ? 'L' : 'R'); else if (dy < 0) act(me, 'J'); }
    else { const f = (e.clientX - rc.left) / rc.width; act(me, f < .33 ? 'L' : f > .67 ? 'R' : 'J'); }
  };
  const onKey = e => { const m = { ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'J', ' ': 'J' }[e.key]; if (m && me) { e.preventDefault(); act(me, m); } };
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointerup', onUp); addEventListener('keydown', onKey);

  /* ---------- data online dari pemain lain ---------- */
  function gantiKarakter(r, id) {
    const spec = charById(id), m = makeChar(spec, r.label, r.isMe ? '#EA6A0A' : null);
    if (r.isMe && runners.length < 2) m.userData.tag.visible = false;
    scene.remove(r.mesh); r.mesh.traverse(o => o.geometry && o.geometry.dispose());
    scene.add(m); r.mesh = m; r.charId = id; if (!r.isMe) r.col = spec.tag;
    const race = q('race'); race.innerHTML = '';
  }
  function setLive(all) {
    const now = performance.now();
    for (const r of runners) {
      const x = all && all[r.seat];
      if (x && x.c && x.c !== r.charId && !r.isMe && CHARS.some(c => c.id === x.c)) gantiKarakter(r, x.c);
      if (!x || r.sim) continue;
      r.net = Object.assign({ at: now }, x);
      if (x.f) r.finSent = true;
    }
  }

  /* ---------- loop ---------- */
  let raf = 0, last = performance.now(), dead = false, t = 0, focus = me || runners[0], lastFocusD = 0, lastCount = '';
  const running = () => performance.now() >= goAt && !opt.paused();
  function step(dt, now) {
    const isDrv = opt.driver();
    for (const r of runners) {
      const sim = r === me || (opt.bots.has(r.seat) && isDrv);
      if (sim && !r.sim && r.net && r !== me) { r.d = r.net.d; r.lane = r.net.l | 0; r.alive = r.net.a !== 0; r.coins = r.net.k | 0; }   // ambil alih bot dari HP lain
      r.sim = sim;
    }
    for (const r of runners) {
      if (!r.alive) { r.fall = Math.min(1, r.fall + dt * 3); continue; }
      if (!r.sim) {     // pemain di HP lain: ikuti data online
        const n = r.net; if (!n) continue;
        const ahead = n.a !== 0 && running() ? speedOf(r) * Math.min(.6, (now - n.at) / 1000) : 0;
        r.d += ((n.d + ahead) - r.d) * Math.min(1, dt * 8);
        r.lane = n.l | 0; r.lx += (LX[r.lane] - r.lx) * Math.min(1, dt * 13);
        r.jy += ((n.j || 0) - r.jy) * Math.min(1, dt * 15);
        r.coins = n.k | 0;
        if (n.a === 0 && r.alive) { r.alive = false; r.d = n.d; toast(`${r.label} tertabrak! 💥`); }
        continue;
      }
      if (!running()) continue;
      r.slow = Math.max(0, r.slow - dt);
      r.d += speedOf(r) * dt;
      r.lx += (LX[r.lane] - r.lx) * Math.min(1, dt * 13);
      r.jv -= 24 * dt; r.jy = Math.max(0, r.jy + r.jv * dt); if (r.jy === 0) r.jv = 0;
      if (r !== me) botThink(r);
      const li = Math.round((r.lx + 2.3) / 2.3);
      for (const o of course) {
        if (Math.abs(o.c - r.d) > .6 || o.lane !== li || Math.abs(LX[o.lane] - r.lx) > 1) continue;
        if (o.t === 'coin') { if (!o.taken[r.seat] && (o.h ? r.jy > 1 : r.jy < 1.6)) { o.taken[r.seat] = 1; r.coins++; if (r.isMe) tone(1300, .06, 'square', .06); } }
        else if (o.t === 'tall' || (o.t === 'low' && r.jy < .85)) { crash(r); break; }
        else if (o.t === 'puddle' && r.jy < .3 && !o.taken['p' + r.seat]) { o.taken['p' + r.seat] = 1; r.slow = 1.1; if (r.isMe) { tone(200, .15, 'triangle', .12); shake = .25; } }
      }
      if (r.alive) senggol(r, now);
    }
    // kirim posisi (pemain sendiri lebih sering, bot sedikit lebih jarang)
    for (const r of runners) {
      if (!r.sim) continue;
      const gap = r.isMe ? 130 : 220;
      if (now - r.sendAt < (r.alive ? gap : 2500)) continue;     // yang sudah tertabrak: kirim ulang sesekali supaya hasilnya pasti sampai
      r.sendAt = now;
      const data = { d: Math.round(r.d * 100) / 100, l: r.lane, j: Math.round(r.jy * 100) / 100, a: r.alive ? 1 : 0, k: r.coins, c: r.isMe ? opt.myChar : undefined };
      if (data.c === undefined) delete data.c;
      if (!r.alive) { data.f = 1; if (!r.finSent) { r.finSent = true; opt.fin(r.seat, { d: r.d, k: r.coins }); } }
      opt.send(r.seat, data);
    }
  }
  function frame(nowMs) {
    if (dead) return;
    if (!root.isConnected) { destroy(); return; }
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (nowMs - last) / 1000); last = nowMs; t += dt;
    // ukuran
    const w = root.clientWidth, h = root.clientHeight;
    if (w && h && (cv.width !== Math.round(w * renderer.getPixelRatio()) || cv.height !== Math.round(h * renderer.getPixelRatio()))) {
      renderer.setSize(w, h); cam.aspect = w / h; cam.fov = cam.aspect < .7 ? 72 : 55; cam.updateProjectionMatrix();
    }
    step(dt, nowMs);
    // hitung mundur
    const left = goAt - nowMs, cEl = q('count');
    const txt = opt.paused() ? '' : left > 0 ? String(Math.ceil(left / 1000)) : left > -700 ? 'Lari!' : '';
    if (txt !== lastCount) { lastCount = txt; cEl.textContent = txt; cEl.classList.toggle('hidden', !txt); if (txt) tone(txt === 'Lari!' ? 990 : 600, .12, 'sine', .14); }
    // kamera ikut pemain sendiri; kalau sudah tertabrak, ikut pemain terdepan yang masih lari
    const alive = runners.filter(r => r.alive);
    if ((!focus.alive && focus.fall >= 1 && alive.length) || (!me && alive.length && focus !== alive.reduce((a, b) => (b.d > a.d ? b : a)))) {
      const nx = alive.reduce((a, b) => (b.d > a.d ? b : a));
      if (nx !== focus) { focus = nx; if (me) toast(`Menonton ${nx.label}…`); }
    }
    const F = focus;
    generate(Math.max(...runners.map(r => r.d)) + 90);
    const minD = Math.min(...runners.map(r => r.d));
    course = course.filter(o => { if (o.c < minD - 12) { if (o.mesh) { scene.remove(o.mesh); o.mesh.traverse(m => m.geometry && m.geometry.dispose()); } return false; } return true; });
    for (const o of course) {
      const z = -(o.c - F.d);
      if (z < -90) { if (o.mesh) o.mesh.visible = false; continue; }
      if (!o.mesh) { o.mesh = objMesh[o.t](o.v); scene.add(o.mesh); }
      o.mesh.position.set(LX[o.lane], o.h, z);
      o.mesh.visible = !(o.t === 'coin' && o.taken[F.seat]);
      if (o.mesh.userData.spin) o.mesh.userData.spin.rotation.z = t * 3 + o.c;
    }
    for (const r of runners) {
      const m = r.mesh;
      // dua pemain sejajar di jalur yang sama: geser sedikit supaya berdampingan
      let off = 0;
      for (const o of runners) if (o !== r && Math.abs(o.lx - r.lx) < .6 && Math.abs(o.d - r.d) < 1.2) off += r.seat < o.seat ? -.42 : .42;
      m.position.set(r.lx + off, r.jy, -(r.d - F.d));
      m.visible = Math.abs(r.d - F.d) < 60;
      const lari = running() && r.alive;
      animChar(m, lari ? t * 13 : 0, r.jy > .05, lari, r.fall);
      m.userData.body.rotation.z = (LX[r.lane] - r.lx) * -.12;
    }
    const dz = F.d - lastFocusD; lastFocusD = F.d;
    roadTex.offset.y = (F.d / 15) % 1;
    for (const d of deco) { d.position.z += dz; if (d.position.z > 10) { d.position.z -= 90; d.userData.spin && d.userData.spin(); } }
    const camX = F.lx * .55;
    cam.position.lerp(new THREE.Vector3(camX, 5 + F.jy * .3, 8), Math.min(1, dt * 6));
    if (shake > 0) { cam.position.x += (Math.random() - .5) * shake; cam.position.y += (Math.random() - .5) * shake; shake = Math.max(0, shake - dt); }
    cam.lookAt(camX * .6, 1.2, -7);
    // HUD
    const H = me || F;
    q('dist').textContent = Math.floor(H.d / 2) + ' m'; q('coin').textContent = H.coins;
    if (runners.length > 1) {
      const race = q('race'); race.classList.remove('hidden');
      if (!race.children.length) race.innerHTML = runners.map(r => `<div class="lr-row"><span>${r.label.replace(/[<>&]/g, '')}</span><span class="lr-trk"><b style="background:${r.col}"></b></span><small></small></div>`).join('');
      const mx = Math.max(60, ...runners.map(r => r.d));
      runners.forEach((r, i) => { const row = race.children[i]; row.querySelector('b').style.width = (r.d / mx * 100) + '%'; row.querySelector('small').textContent = (r.alive ? '' : '💥 ') + Math.floor(r.d / 2) + ' m'; });
    }
    renderer.render(scene, cam);
  }
  raf = requestAnimationFrame(frame);

  function destroy() {
    if (dead) return; dead = true;
    cancelAnimationFrame(raf); clearTimeout(toastT);
    removeEventListener('keydown', onKey);
    scene.traverse(m => { if (m.geometry) m.geometry.dispose(); });
    roadTex.dispose();
    renderer.dispose(); renderer.forceContextLoss();
    if (opt.onDestroy) opt.onDestroy();
  }
  return {
    setLive, destroy,
    get dead() { return dead; },
    results: () => runners.map(r => ({ seat: r.seat, d: r.d, k: r.coins, alive: r.alive, fin: r.finSent || !r.alive })),
  };
}
