/* Papan Monopoli 3D (Three.js): papan bertekstur foto landmark, bidak 3D melompat,
   dadu 3D dilempar & memantul, rumah muncul saat kota dibeli, kamera mengikuti pemain. */
import * as THREE from './vendor/three.module.min.js';

const T = 2;            // ukuran satu petak (unit dunia)
const HALF = 7;         // setengah lebar papan (7 petak × 2 / 2)
const CS = 2048;        // resolusi tekstur papan
const cellXY = i => i <= 6 ? [6, 6 - i] : i <= 12 ? [6 - (i - 6), 0] : i <= 18 ? [0, i - 12] : [i - 18, 6];
const tileWorld = i => { const [r, c] = cellXY(i); return new THREE.Vector3((c - 3) * T, 0, (r - 3) * T); };
const OFF = [[-.42, -.36], [.42, -.36], [-.42, .38], [.42, .38]];

function loadImg(src) { return new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }); }
function svgImg(svg) { return loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" '))); }
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

export function createBoard(cfg) {
  const { tiles, grp, col, dark, icons } = cfg;
  const canvas = document.createElement('canvas');
  canvas.className = 'mp-gl-canvas';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(40, 1, .1, 200);
  cam.position.set(0, 16, 18);
  const camTarget = new THREE.Vector3(0, 0, 0), lookNow = new THREE.Vector3(0, 0, 0);

  // cahaya
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7FA88A, 1.05));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(7, 18, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 50 });
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  // papan
  const base = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 1.2, .5, HALF * 2 + 1.2), new THREE.MeshStandardMaterial({ color: 0x2E7D4F, roughness: .7 }));
  base.position.y = -.55; base.receiveShadow = true; scene.add(base);
  const body = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + .3, .6, HALF * 2 + .3), new THREE.MeshStandardMaterial({ color: 0x6BB98A, roughness: .6 }));
  body.position.y = -.3; body.receiveShadow = true; body.castShadow = true; scene.add(body);
  const tc = document.createElement('canvas'); tc.width = tc.height = CS;
  const tex = new THREE.CanvasTexture(tc); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const top = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: .78 }));
  top.rotation.x = -Math.PI / 2; top.position.y = .005; top.receiveShadow = true; scene.add(top);

  const imgs = {};
  function drawBoard() {
    const g = tc.getContext('2d'); const C = CS / 7, P = 7;
    const bg = g.createLinearGradient(0, 0, CS, CS); bg.addColorStop(0, '#D6F3E0'); bg.addColorStop(1, '#AEE2C3');
    g.fillStyle = bg; g.fillRect(0, 0, CS, CS);
    // tengah papan
    g.save(); rr(g, C + 14, C + 14, C * 5 - 28, C * 5 - 28, 40); g.clip();
    const cg = g.createRadialGradient(CS / 2, CS * .42, 40, CS / 2, CS / 2, CS * .45); cg.addColorStop(0, '#F1FFF6'); cg.addColorStop(1, '#BFE9CF'); g.fillStyle = cg; g.fillRect(0, 0, CS, CS);
    g.globalAlpha = .07; g.fillStyle = '#12865A';
    for (let k = 0; k < 40; k++) { g.beginPath(); g.arc(C + 60 + (k * 263) % (C * 5 - 120), C + 60 + (k * 419) % (C * 5 - 120), 26 + (k % 5) * 8, 0, Math.PI * 2); g.fill(); }
    g.restore(); g.globalAlpha = 1;
    g.save(); g.translate(CS / 2, CS * .33); g.rotate(-.1);
    g.font = '900 150px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 18; g.strokeStyle = '#fff'; g.strokeText('MONOPOLI', 0, 0); g.fillStyle = '#C62828'; g.fillText('MONOPOLI', 0, 0);
    g.font = '800 92px Inter, system-ui, sans-serif'; g.lineWidth = 12; g.strokeText('Nusantara', 0, 130); g.fillStyle = '#12865A'; g.fillText('Nusantara', 0, 130);
    g.restore();
    // petak
    tiles.forEach((tl, i) => {
      const [r, c] = cellXY(i); const x = c * C + P, y = r * C + P, w = C - P * 2, h = C - P * 2;
      g.save(); rr(g, x, y, w, h, 22); g.clip();
      const corner = i % 6 === 0;
      g.fillStyle = corner ? '#FFE9B8' : tl.t === 'kesempatan' ? '#FFF1E0' : tl.t === 'dana' ? '#FCE8F3' : tl.t === 'pajak' ? '#EEF0F4' : '#FFFDF7';
      g.fillRect(x, y, w, h);
      const ph = tl.t === 'kota' && imgs['p:' + tl.n];
      if (ph) {
        const iy = y + h * .12, ih = h * .58;
        const s = Math.max(w / ph.width, ih / ph.height), sw = w / s, sh = ih / s;
        g.drawImage(ph, (ph.width - sw) / 2, (ph.height - sh) / 2, sw, sh, x, iy, w, ih);
        g.fillStyle = grp[tl.g]; g.fillRect(x, y, w, h * .12);
      } else {
        const ic = imgs['i:' + i];
        if (ic) { const sz = corner ? h * .55 : h * .5; g.drawImage(ic, x + (w - sz) / 2, y + (corner ? h * .1 : h * .12), sz, sz); }
        if (tl.g) { g.fillStyle = grp[tl.g]; g.fillRect(x, y, w, h * .12); }
      }
      // nama
      g.fillStyle = '#1C1C1E'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      const nm = tl.n; let fs = 44; g.font = `800 ${fs}px Inter, system-ui, sans-serif`;
      while (g.measureText(nm).width > w - 16 && fs > 26) { fs -= 2; g.font = `800 ${fs}px Inter, system-ui, sans-serif`; }
      if (g.measureText(nm).width > w - 16 && nm.includes(' ')) {
        const [a, b] = [nm.slice(0, nm.indexOf(' ')), nm.slice(nm.indexOf(' ') + 1)];
        g.fillText(a, x + w / 2, y + h * .8); g.fillText(b, x + w / 2, y + h * .8 + fs);
      } else g.fillText(nm, x + w / 2, y + h * (tl.t === 'kota' ? .82 : .86));
      if (tl.t === 'kota') { g.font = '800 34px Inter, system-ui, sans-serif'; g.fillStyle = '#6E6E73'; g.fillText(cfg.fmt ? cfg.fmt(tl.p) : 'Rp' + tl.p, x + w / 2, y + h * .95); }
      g.restore();
      g.save(); rr(g, x, y, w, h, 22); g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.12)'; g.stroke(); g.restore();
    });
    tex.needsUpdate = true;
  }
  drawBoard();
  Promise.all([
    ...tiles.map((tl, i) => tl.t === 'kota' ? loadImg(cfg.photos + tl.n + '.jpg').then(im => { if (im) imgs['p:' + tl.n] = im; }) : Promise.resolve()),
    ...tiles.map((tl, i) => { const sv = tl.t === 'kota' ? null : (tl.t === 'pajak' ? (i === 20 ? icons.mewah : icons.pajak) : icons[tl.t]); return sv ? svgImg(sv).then(im => { if (im) imgs['i:' + i] = im; }) : Promise.resolve(); })
  ]).then(drawBoard);

  // sorotan petak aktif
  const hc = document.createElement('canvas'); hc.width = hc.height = 256;
  { const g = hc.getContext('2d'); rr(g, 10, 10, 236, 236, 34); g.lineWidth = 18; g.strokeStyle = '#FFD60A'; g.shadowColor = '#FFB300'; g.shadowBlur = 16; g.stroke(); }
  const hiTex = new THREE.CanvasTexture(hc); hiTex.colorSpace = THREE.SRGBColorSpace;
  const hiMesh = new THREE.Mesh(new THREE.PlaneGeometry(T * 1.04, T * 1.04), new THREE.MeshBasicMaterial({ map: hiTex, transparent: true, depthWrite: false }));
  hiMesh.rotation.x = -Math.PI / 2; hiMesh.position.y = .03; scene.add(hiMesh);

  // bidak
  const pawnGeo = new THREE.LatheGeometry([[0, 0], [.46, 0], [.48, .07], [.4, .16], [.24, .28], [.17, .62], [.24, .7], [.14, .76], [.13, .8]].map(p => new THREE.Vector2(p[0], p[1])), 28);
  const headGeo = new THREE.SphereGeometry(.26, 24, 18);
  const pawns = [];
  function pawn(s) {
    if (pawns[s]) return pawns[s];
    const gp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: col[s], roughness: .32, metalness: .15 });
    const b = new THREE.Mesh(pawnGeo, mat); b.castShadow = true; gp.add(b);
    const h = new THREE.Mesh(headGeo, mat); h.position.y = 1.02; h.castShadow = true; gp.add(h);
    gp.scale.setScalar(1.05);
    gp.userData.seat = s;
    scene.add(gp);
    const lc = document.createElement('canvas'); lc.width = 512; lc.height = 128;
    const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt, transparent: true, depthTest: false }));
    label.scale.set(2.6, .65, 1); label.renderOrder = 10; label.visible = false; scene.add(label);
    return pawns[s] = { label, lc, lt, name: '', g: gp, tile: -1, from: new THREE.Vector3(), to: new THREE.Vector3(), t0: 0, dur: 1, arc: 0, alive: true };
  }

  function setLabel(pw, s, name) {
    if (pw.name === name) return; pw.name = name;
    const g = pw.lc.getContext('2d'); g.clearRect(0, 0, 512, 128);
    g.font = '800 54px Inter, system-ui, sans-serif'; const tw = Math.min(470, g.measureText(name).width + 56);
    const x = (512 - tw) / 2; rr(g, x, 22, tw, 84, 42); g.fillStyle = 'rgba(255,255,255,.95)'; g.fill();
    g.lineWidth = 8; g.strokeStyle = col[s]; g.stroke();
    g.fillStyle = '#1C1C1E'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 256, 66, 440);
    pw.lt.needsUpdate = true;
  }
  // rumah milik
  const houses = {};
  const roofGeo = new THREE.ConeGeometry(.42, .34, 4); roofGeo.rotateY(Math.PI / 4);
  const wallGeo = new THREE.BoxGeometry(.5, .36, .5);
  function house(i, s) {
    if (houses[i] && houses[i].s === s) return;
    if (houses[i]) scene.remove(houses[i].g);
    const gh = new THREE.Group();
    const w = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ color: 0xFFFDF5, roughness: .6 })); w.position.y = .18; w.castShadow = true; gh.add(w);
    const rf = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: col[s], roughness: .45 })); rf.position.y = .53; rf.castShadow = true; gh.add(rf);
    const p = tileWorld(i); const [r, c] = cellXY(i);
    const inward = new THREE.Vector3(-(c - 3), 0, -(r - 3)).normalize().multiplyScalar(.62);
    gh.position.copy(p).add(inward).add(new THREE.Vector3(inward.z * .9, 0, -inward.x * .9));
    gh.scale.setScalar(.001);
    scene.add(gh);
    houses[i] = { g: gh, s, t0: performance.now() };
  }

  // dadu
  const PIP = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  function faceTex(v) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 128, 128); gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(1, '#E9E9EE');
    g.fillStyle = gr; rr(g, 2, 2, 124, 124, 22); g.fill();
    PIP[v].forEach(k => { const cx = 26 + ((k - 1) % 3) * 38, cy = 26 + Math.floor((k - 1) / 3) * 38; g.beginPath(); g.arc(cx, cy, 11, 0, Math.PI * 2); g.fillStyle = v === 1 ? '#D32F2F' : '#1C1C1E'; g.fill(); });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // urutan sisi BoxGeometry: +x, -x, +y, -y, +z, -z
  const FACE = [3, 4, 1, 6, 2, 5];
  const dieMats = FACE.map(v => new THREE.MeshStandardMaterial({ map: faceTex(v), roughness: .35 }));
  const UP = { 1: new THREE.Euler(0, 0, 0), 6: new THREE.Euler(Math.PI, 0, 0), 2: new THREE.Euler(-Math.PI / 2, 0, 0), 5: new THREE.Euler(Math.PI / 2, 0, 0), 3: new THREE.Euler(0, 0, Math.PI / 2), 4: new THREE.Euler(0, 0, -Math.PI / 2) };
  const DS = .9;
  const dice = [0, 1].map(k => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(DS, DS, DS), dieMats); m.castShadow = true;
    m.position.set(k ? .75 : -.75, DS / 2, 1.9); scene.add(m);
    return { m, rest: new THREE.Vector3(k ? .75 : -.75, DS / 2, 1.9), roll: null, v: 0 };
  });
  function finalQuat(v, yaw) { const q = new THREE.Quaternion().setFromEuler(UP[v]); return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q); }
  function setDie(d, v) { if (d.v === v && !d.roll) return; d.v = v; d.m.quaternion.copy(finalQuat(v, (d === dice[0] ? -.25 : .3))); d.m.position.copy(d.rest); }
  function throwDie(d, v, k) {
    d.v = v;
    const start = new THREE.Vector3(-3.5 + k * .9, 4.2 + k * .4, 5.2);
    const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    const spin = new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize();
    d.roll = { t0: performance.now(), dur: 780, start, q0, spin, qf: finalQuat(v, (k ? .3 : -.25)) };
  }

  // koin berhamburan
  const coins = [];
  const coinGeo = new THREE.CylinderGeometry(.16, .16, .05, 18);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xFFC107, metalness: .6, roughness: .3, emissive: 0x6B4A00, emissiveIntensity: .25 });
  function burst(at) {
    for (let k = 0; k < 14; k++) {
      const m = new THREE.Mesh(coinGeo, coinMat); m.position.copy(at).add(new THREE.Vector3(0, 1.2, 0)); scene.add(m);
      coins.push({ m, v: new THREE.Vector3((Math.random() - .5) * 5, 4 + Math.random() * 3, (Math.random() - .5) * 5), r: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0), t0: performance.now() });
    }
  }

  // status
  const S = { view: 'side', turn: 0, focus: 0, names: true, hi: 0, n: 0, alive: true, running: false, lastBurst: 0 };
  // ketuk bidak → lihat aset pemain
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let down = null;
  canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 10) return;
    const rc = canvas.getBoundingClientRect();
    ptr.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
    ray.setFromCamera(ptr, cam);
    const objs = []; pawns.forEach(pw => { if (pw && pw.alive) { objs.push(pw.g); if (pw.label.visible) objs.push(pw.label); } });
    const hit = ray.intersectObjects(objs, true)[0];
    if (!hit) return;
    let o = hit.object; while (o && o.userData.seat === undefined && o.parent) o = o.parent;
    let seat = o && o.userData.seat;
    if (seat === undefined) seat = pawns.findIndex(pw => pw && pw.label === hit.object);
    if (seat >= 0 && cfg.onPick) cfg.onPick(seat);
  });
  let W = 1, Hh = 1;
  function resize() {
    const p = canvas.parentElement; if (!p) return;
    const w = p.clientWidth, h = p.clientHeight; if (!w || !h) return;
    if (w === W && h === Hh) return; W = w; Hh = h;
    renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => resize()) : null;

  function desiredCam(t) {
    const a = cam.aspect || 1;
    if (S.view === 'top') {
      const fit = (HALF + .9) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const h = fit / Math.min(a, 1);
      return { pos: new THREE.Vector3(0, h, .001), look: new THREE.Vector3(0, 0, 0) };
    }
    const f = pawns[S.focus] && pawns[S.focus].alive ? pawns[S.focus] : null;
    const p = f ? f.g.position : new THREE.Vector3();
    const cl = v => Math.max(-5.2, Math.min(5.2, v));
    const look = new THREE.Vector3(cl(p.x), 0, cl(p.z) + .3);
    const k = a < .75 ? 1.06 : a < 1 ? .98 : .9;
    const sway = Math.sin(t / 2600) * .4;
    return { pos: new THREE.Vector3(look.x * .55 + sway, 8.4 * k, look.z + 8.8 * k), look };
  }

  function loop(t) {
    if (!canvas.isConnected) { S.running = false; return; }
    requestAnimationFrame(loop);
    resize();
    const now = performance.now();
    // bidak melompat
    pawns.forEach(pw => {
      if (!pw) return;
      const k = Math.min(1, (now - pw.t0) / pw.dur);
      const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      pw.g.position.lerpVectors(pw.from, pw.to, e);
      pw.g.position.y = Math.sin(k * Math.PI) * pw.arc;
      const sq = k < 1 ? 1 + Math.sin(k * Math.PI) * .08 : 1;
      pw.g.scale.set(1.05 / Math.sqrt(sq), 1.05 * sq, 1.05 / Math.sqrt(sq));
      if (!pw.alive) pw.g.scale.multiplyScalar(Math.max(.001, 1 - (now - pw.deadAt) / 500));
    });
    if (pawns[S.focus] && pawns[S.focus].alive && (now - pawns[S.focus].t0) > pawns[S.focus].dur) pawns[S.focus].g.position.y = Math.abs(Math.sin(now / 380)) * .12;
    pawns.forEach(pw => { if (!pw) return; pw.label.visible = S.names && pw.alive; pw.label.position.set(pw.g.position.x, pw.g.position.y + 1.95, pw.g.position.z); });
    // rumah muncul memantul
    Object.values(houses).forEach(h => { const k = Math.min(1, (now - h.t0) / 520); const s = k < 1 ? (1 - Math.pow(1 - k, 3)) * (1 + Math.sin(k * Math.PI) * .35) : 1; h.g.scale.setScalar(Math.max(.001, s)); });
    // dadu
    dice.forEach(d => {
      if (!d.roll) return;
      const k = Math.min(1, (now - d.roll.t0) / d.roll.dur);
      d.m.position.lerpVectors(d.roll.start, d.rest, 1 - Math.pow(1 - k, 2));
      const bounce = Math.abs(Math.cos(k * Math.PI * 2.5)) * (1 - k) * 2.2;
      d.m.position.y = DS / 2 + bounce + (1 - k) * (1 - k) * 2;
      if (k < .7) { const q = new THREE.Quaternion().setFromAxisAngle(d.roll.spin, k * 22); d.m.quaternion.copy(d.roll.q0).premultiply(q); d.roll.qMid = d.m.quaternion.clone(); }
      else d.m.quaternion.slerpQuaternions(d.roll.qMid || d.roll.q0, d.roll.qf, (k - .7) / .3);
      if (k >= 1) { d.m.quaternion.copy(d.roll.qf); d.m.position.copy(d.rest); d.roll = null; }
    });
    // koin
    for (let k = coins.length - 1; k >= 0; k--) {
      const c = coins[k], dt = 1 / 60, age = (now - c.t0) / 1000;
      c.v.y -= 12 * dt; c.m.position.addScaledVector(c.v, dt); c.m.rotation.x += c.r.x * dt; c.m.rotation.y += c.r.y * dt;
      if (age > 1.3) { scene.remove(c.m); coins.splice(k, 1); }
    }
    // sorotan berdenyut
    const hp = tileWorld(S.hi); hiMesh.position.x = hp.x; hiMesh.position.z = hp.z;
    hiMesh.material.opacity = .55 + Math.sin(now / 260) * .4;
    // kamera
    const dc = desiredCam(now);
    const fast = S.view === 'side' ? .11 : .06;
    cam.position.lerp(dc.pos, fast); lookNow.lerp(dc.look, fast + .03); cam.lookAt(lookNow);
    renderer.render(scene, cam);
  }

  return {
    canvas,
    mount(el) {
      if (canvas.parentElement !== el) el.appendChild(canvas);
      if (ro) { ro.disconnect(); ro.observe(el); }
      W = 0; resize();
      if (!S.running) { S.running = true; requestAnimationFrame(loop); }
    },
    update(o) {
      S.view = o.view || 'side'; S.turn = o.turn; S.hi = o.hi; S.focus = o.focus !== undefined ? o.focus : o.turn; S.names = !!o.names;
      const now = performance.now();
      o.pos.forEach((tile, s) => {
        const pw = pawn(s);
        if (o.names && o.names[s]) setLabel(pw, s, o.names[s]);
        if (o.out[s]) { if (pw.alive) { pw.alive = false; pw.deadAt = now; } return; }
        pw.alive = true;
        const same = o.pos.map((p, k) => !o.out[k] && p === tile ? k : -1).filter(k => k >= 0);
        const idx = same.indexOf(s), off = same.length > 1 ? OFF[idx % 4] : [0, 0];
        const target = tileWorld(tile).add(new THREE.Vector3(off[0] * T * .55, 0, off[1] * T * .55));
        if (pw.tile === -1) { pw.from.copy(target); pw.to.copy(target); pw.g.position.copy(target); pw.tile = tile; pw.t0 = 0; return; }
        if (!pw.to.equals(target)) {
          const far = pw.tile !== tile && Math.abs(((tile - pw.tile) + 24) % 24) > 1;
          pw.from.copy(pw.g.position); pw.from.y = 0; pw.to.copy(target);
          pw.t0 = now; pw.dur = pw.tile === tile ? 180 : far ? 520 : 215; pw.arc = pw.tile === tile ? .2 : far ? 2.4 : .9;
          pw.tile = tile;
        }
      });
      Object.keys(houses).forEach(i => { if (o.own[i] === undefined) { scene.remove(houses[i].g); delete houses[i]; } });
      Object.keys(o.own).forEach(i => house(+i, o.own[i]));
      if (o.rolling && !S.rolling) { throwDie(dice[0], o.dice[0], 0); throwDie(dice[1], o.dice[1], 1); }
      else if (!o.rolling && !dice[0].roll) { setDie(dice[0], o.dice[0]); setDie(dice[1], o.dice[1]); }
      S.rolling = !!o.rolling;
      if (o.burst && o.burstKey !== S.lastBurst) { S.lastBurst = o.burstKey; const p = pawns[o.burst.s]; if (p) burst(p.to); }
    }
  };
}
