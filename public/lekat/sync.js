// Lekat — sinkron: teks (deck, kartu, jadwal, riwayat) ke Firebase Realtime DB, media (gambar/audio) ke Cloudflare R2.
// IndexedDB di perangkat tetap jadi cache, jadi aplikasi jalan offline dan menyinkron saat online lagi.
// Tanpa login: semua perangkat yang membuka /lekat/ memakai data yang sama (node hadzmi_lekat_data dibuka di aturan Firebase).
(function (G) {
  'use strict';
  const { DB, UI } = G;
  const { $, $$, esc, icon } = UI;

  const firebaseConfig = {
    apiKey: 'AIzaSyBoTr_A9JQsRTHri47o0ZPIQH21SxlBjh0',
    authDomain: 'web-hadzmi-new.firebaseapp.com',
    databaseURL: 'https://web-hadzmi-new-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'web-hadzmi-new',
    storageBucket: 'web-hadzmi-new.firebasestorage.app',
    messagingSenderId: '664176294351',
    appId: '1:664176294351:web:5706e50b47d9cec546baba'
  };
  const ROOT = 'hadzmi_lekat_data';
  const STORES = ['notes', 'cards', 'decks', 'presets', 'notetypes', 'revlog', 'media', 'meta'];
  const META_SYNC = new Set(['nextPos', 'rollover', 'learnAhead', 'starterInstalled', 'onboarded', 'addHist']);
  const MARGIN = 120000; // toleransi beda jam antar-perangkat

  let readyResolve; const firstSync = new Promise(r => { readyResolve = r; });
  const S = { state: 'local', root: null, ready: false, applying: false, pending: new Map(), timer: null, refs: [], offset: 0, signed: new Map(), uploading: new Set(), downloading: false, lastErr: '' };

  // ---------- util ----------
  // kunci Firebase tidak boleh berisi . # $ / [ ]
  const encKey = (id) => String(id).replace(/[.#$\/\[\]%]/g, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'));
  const localMod = (store, o) => store === 'revlog' ? o.id : (o.mod || 0);
  const serverNow = () => Date.now() + S.offset;
  function syncable(store, o) {
    if (store === 'meta') return META_SYNC.has(o.id);
    if (store === 'media') return !!o.r2;
    return true;
  }
  function encode(store, o) {
    let obj = o;
    if (store === 'media') obj = { id: o.id, type: o.type, size: o.size, r2: o.r2, mod: o.mod };
    return { mod: localMod(store, o), t: firebase.database.ServerValue.TIMESTAMP, j: JSON.stringify(obj) };
  }
  const meta = (k, v) => v === undefined ? DB.meta(k) : DB.meta(k, v); // kunci berawalan _ tidak ikut sinkron

  // ---------- status ----------
  const LABEL = { local: 'Di perangkat saja', syncing: 'Menyinkron…', on: 'Tersinkron', offline: 'Offline', error: 'Gagal sinkron' };
  function setState(s, err) {
    S.state = s; if (err) S.lastErr = err;
    $$('.sync-pill').forEach(p => { p.className = 'sync-pill glass st-' + s; p.innerHTML = pillInner(); });
  }
  const pillInner = () => `<i class="dot"></i><span>${LABEL[S.state]}</span>`;
  function pillHtml() { return `<button type="button" class="sync-pill glass st-${S.state}" id="syncPill">${pillInner()}</button>`; }

  // ---------- perubahan lokal → antre ke Firebase ----------
  DB.onChange((store, op, val) => {
    if (S.applying || !STORES.includes(store)) return;
    if (op === 'put') {
      if (store === 'meta' || store === 'media') val.mod = Date.now();
      if (store === 'media' && val.blob && !val.r2) { uploadMedia(val); return; }
      if (!syncable(store, val)) return;
      queue(store, encKey(val.id), val, false);
    } else if (op === 'del') {
      if (store === 'meta' && !META_SYNC.has(val)) return;
      const tomb = { id: val, mod: Date.now() };
      const tombs = meta('_tombs') || {}; tombs[store + '/' + encKey(val)] = tomb; meta('_tombs', tombs);
      queue(store, encKey(val), tomb, true);
    }
  });
  function queue(store, key, o, del) {
    S.pending.set(store + '/' + key, { store, o, del });
    if (S.ready && !S.timer) S.timer = setTimeout(flush, 700);
  }
  async function flush() {
    S.timer = null;
    if (!S.ready || !S.root || !S.pending.size) return;
    const startedAt = Date.now();
    const items = [...S.pending.entries()]; S.pending.clear();
    try {
      for (let i = 0; i < items.length; i += 400) {
        const upd = {};
        for (const [path, it] of items.slice(i, i + 400)) {
          upd[path] = it.del ? { mod: it.o.mod, t: firebase.database.ServerValue.TIMESTAMP, del: 1, j: JSON.stringify({ id: it.o.id }) } : encode(it.store, it.o);
        }
        await S.root.update(upd);
      }
      const tombs = meta('_tombs') || {}; let ch = false;
      for (const [path, it] of items) if (it.del && tombs[path]) { delete tombs[path]; ch = true; }
      if (ch) meta('_tombs', tombs);
      if (!S.pending.size) meta('_pushT', startedAt);
      if (S.state !== 'on') setState(navigator.onLine === false ? 'offline' : 'on');
    } catch (e) {
      console.warn('sync flush', e);
      for (const [path, it] of items) if (!S.pending.has(path)) S.pending.set(path, it);
      setState('error', /permission/i.test(String(e && e.message)) ? 'Ditolak aturan Firebase. Pasang aturan hadzmi_lekat_data dari database.rules.json.' : String(e && e.message || e));
      S.timer = setTimeout(flush, 15000);
    }
  }

  // ---------- data dari Firebase → lokal ----------
  let refreshT = null, dedupeT = null;
  function afterRemote() {
    clearTimeout(dedupeT); dedupeT = setTimeout(dedupe, 400);
    clearTimeout(refreshT); refreshT = setTimeout(() => {
      if (!G.App || (G.Review && G.Review.active()) || document.querySelector('.sheet, .alert-back, .actsheet')) return;
      if (['decks', 'stats', 'browse'].includes(G.App.tab)) G.App.refresh();
    }, 700);
  }
  function applyRemote(store, rec) {
    if (!rec || !rec.j) return false;
    let obj; try { obj = JSON.parse(rec.j); } catch (e) { return false; }
    if (obj == null || obj.id == null) return false;
    const local = DB.get(store, obj.id);
    const lm = local ? localMod(store, local) : -1;
    if (rec.t && rec.t > (meta('_pullT') || 0)) S.maxT = Math.max(S.maxT || 0, rec.t);
    if (rec.del) {
      if (local && lm <= rec.mod) { S.applying = true; DB.del(store, obj.id); S.applying = false; return true; }
      return false;
    }
    if (local && lm >= rec.mod) return false;
    if (store === 'meta' && obj.id === 'nextPos' && local) obj.v = Math.max(+obj.v || 0, +local.v || 0);
    if (store === 'media') { if (local && local.blob) obj.blob = local.blob; }
    obj = normalize(store, obj);
    S.applying = true; DB.putRaw(store, obj); S.applying = false;
    if (store === 'media' && !obj.blob) S.needMedia = true;
    return true;
  }
  function normalize(store, o) {
    if (store === 'notes') { o.tags = o.tags || []; o.fields = o.fields || {}; }
    if (store === 'decks' && !o.filtered) o.today = o.today || {};
    return o;
  }

  // Dua perangkat bisa membuat note type bawaan / deck bernama sama dengan id berbeda → satukan (id terkecil menang).
  function dedupe() {
    let changed = false;
    const byKey = new Map();
    for (const t of DB.list('notetypes')) if (t.key) { if (!byKey.has(t.key)) byKey.set(t.key, []); byKey.get(t.key).push(t); }
    for (const list of byKey.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => a.id - b.id);
      const keep = list[0];
      for (const t of list.slice(1)) {
        for (const n of DB.list('notes')) if (n.typeId === t.id) { n.typeId = keep.id; DB.put('notes', n); }
        DB.del('notetypes', t.id); changed = true;
      }
    }
    const byName = new Map();
    for (const d of DB.list('decks')) if (!d.filtered) { const k = d.name.toLowerCase(); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(d); }
    for (const list of byName.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => a.id - b.id);
      const keep = list[0];
      for (const d of list.slice(1)) {
        for (const c of DB.list('cards')) if (c.deckId === d.id) { c.deckId = keep.id; DB.put('cards', c); }
        DB.del('decks', d.id); changed = true;
      }
    }
    if (changed) afterRemote();
  }

  // ---------- mulai / berhenti ----------
  async function start() {
    if (typeof firebase === 'undefined' || !firebase.apps.length) { setState('local'); readyResolve(); return; }
    stop();
    setState('syncing');
    try {
      const db = firebase.database();
      S.root = db.ref(ROOT);
      db.ref('.info/serverTimeOffset').on('value', s => { S.offset = s.val() || 0; });
      const pullT = meta('_pullT') || 0, pushT = meta('_pushT') || 0;
      const t0 = serverNow();
      S.maxT = 0;
      const remoteMod = {};
      // 1) tarik perubahan dari server (penuh saat pertama kali, selanjutnya hanya yang baru)
      for (const store of STORES) {
        const ref = S.root.child(store);
        const q = pullT ? ref.orderByChild('t').startAt(pullT - MARGIN) : ref;
        const snap = await q.once('value');
        const val = snap.val() || {};
        remoteMod[store] = new Map();
        for (const k in val) { applyRemote(store, val[k]); if (val[k]) remoteMod[store].set(k, val[k].mod || 0); }
      }
      // 2) dorong perubahan lokal yang belum terkirim
      for (const store of STORES) {
        for (const o of DB.list(store)) {
          if (!syncable(store, o)) continue;
          const key = encKey(o.id), rm = remoteMod[store].get(key);
          if (rm != null && rm >= localMod(store, o)) continue; // server sudah punya versi ini
          if (!pullT || !pushT || localMod(store, o) > pushT - MARGIN) queue(store, key, o, false);
        }
      }
      const tombs = meta('_tombs') || {};
      for (const path in tombs) { const [store, ...rest] = path.split('/'); queue(store, rest.join('/'), tombs[path], true); }
      dedupe();
      S.ready = true;
      await flush();
      meta('_pullT', Math.max(t0, S.maxT || 0));
      // 3) dengarkan perubahan dari perangkat lain secara realtime
      for (const store of STORES) {
        const q = S.root.child(store).orderByChild('t').startAt(t0 - MARGIN);
        const h = s => { if (applyRemote(store, s.val())) afterRemote(); if (S.maxT && S.maxT > (meta('_pullT') || 0)) savePullT(); if (S.needMedia) { S.needMedia = false; fetchMissingMedia(); } };
        q.on('child_added', h); q.on('child_changed', h);
        S.refs.push(q);
      }
      db.ref('.info/connected').on('value', s => { if (!S.ready) return; setState(s.val() ? 'on' : 'offline'); if (s.val()) flush(); });
      S.refs.push(db.ref('.info/connected'));
      if (S.state === 'syncing') setState('on');
      afterRemote();
      // media
      DB.list('media').filter(m => m.blob && !m.r2).forEach(uploadMedia);
      fetchMissingMedia();
    } catch (e) {
      console.warn('sync start', e);
      S.ready = false;
      setState('error', /permission/i.test(String(e && e.message)) ? 'Ditolak aturan Firebase. Pasang aturan hadzmi_lekat_data dari database.rules.json.' : String(e && e.message || e));
      setTimeout(() => { if (!S.ready) start(); }, 30000);
    }
    readyResolve();
  }
  let pullSaveT = null;
  function savePullT() { clearTimeout(pullSaveT); pullSaveT = setTimeout(() => { if (S.maxT) meta('_pullT', S.maxT); }, 3000); }
  function stop() {
    S.ready = false;
    for (const r of S.refs) { try { r.off(); } catch (e) {} }
    S.refs = [];
  }

  // ---------- media di R2 (rute publik khusus Lekat) ----------
  const fileUrl = id => '/api/lekat/files/' + encodeURIComponent(id);
  async function uploadMedia(m) {
    if (!S.ready || S.uploading.has(m.id) || !m.blob) return;
    S.uploading.add(m.id);
    try {
      const res = await fetch('/api/lekat/files', { method: 'POST', headers: { 'Content-Type': m.type || m.blob.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(m.id) }, body: m.blob });
      const data = await res.json().catch(() => ({}));
      if (res.status === 413 || res.status === 415) { console.warn('media ditolak', m.id, data.error); S.lastErr = 'Media "' + m.id + '": ' + (data.error || res.status); return; } // tidak diulang
      if (!res.ok || !data.id) throw new Error(data.error || 'upload ' + res.status);
      const cur = DB.get('media', m.id); if (!cur) return;
      cur.r2 = data.id; cur.size = cur.size || data.size;
      DB.putRaw('media', cur); // memicu sinkron metadata ke Firebase
    } catch (e) { console.warn('upload media', m.id, e); setTimeout(() => { S.uploading.delete(m.id); if (S.ready) uploadMedia(DB.get('media', m.id) || m); }, 60000); return; }
    S.uploading.delete(m.id);
  }
  // unduh media yang belum ada di perangkat ini, simpan untuk offline
  async function fetchMissingMedia() {
    if (!S.ready || S.downloading) return;
    const missing = DB.list('media').filter(m => !m.blob && m.r2);
    if (!missing.length) return;
    S.downloading = true;
    for (const m of missing) {
      try {
        const r = await fetch(fileUrl(m.r2)); if (!r.ok) continue;
        const blob = await r.blob();
        const cur = DB.get('media', m.id); if (!cur) continue;
        cur.blob = blob; DB.putLocal('media', cur);
      } catch (e) {}
    }
    S.downloading = false;
  }
  function signedUrl(m) { return m && m.r2 ? fileUrl(m.r2) : null; }

  // ---------- hapus semua di server ----------
  async function wipeRemote() {
    if (!S.root || !S.ready) return;
    stop();
    await S.root.remove();
    meta('_pullT', 0); meta('_pushT', 0); meta('_tombs', {});
    S.pending.clear();
  }

  // ---------- panel status ----------
  function statusSheet() {
    if (S.state === 'local') return UI.info('Belum tersambung', 'Firebase tidak termuat, jadi data sementara hanya tersimpan di perangkat ini. Periksa internet lalu muat ulang; data akan ikut tersinkron.');
    const media = DB.list('media');
    const up = media.filter(m => m.r2).length, notUp = media.filter(m => m.blob && !m.r2).length;
    const sh = UI.sheet({ title: 'Sinkron', body: `
      <div class="list">
        <div class="row"><div class="grow">Status</div><div class="detail">${LABEL[S.state]}</div></div>
        <div class="row"><div class="grow">Teks (deck, kartu, riwayat)</div><div class="detail">Firebase</div></div>
        <div class="row"><div class="grow">Media di R2</div><div class="detail">${up} file${notUp ? ` · ${notUp} menunggu` : ''}</div></div>
        <div class="row"><div class="grow">Menunggu dikirim</div><div class="detail">${S.pending.size}</div></div>
      </div>
      ${S.state === 'error' && S.lastErr ? `<p class="section-f" style="color:var(--red-ink)">${esc(S.lastErr)}</p>` : ''}
      <p class="section-f">Semua perangkat yang membuka Lekat memakai data yang sama, tanpa login. Data juga disimpan di perangkat ini, jadi tetap bisa dipakai offline.</p>
      <div class="list" style="margin-top:14px"><button type="button" class="row tint" id="syNow">${icon('reset')} Sinkron ulang sekarang</button></div>` });
    $('#syNow', sh.body).onclick = () => { sh.close(); start(); };
  }

  // ---------- boot ----------
  function init() {
    try {
      if (typeof firebase === 'undefined') { setState('local'); readyResolve(); return; }
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    } catch (e) { console.warn(e); setState('local'); readyResolve(); return; }
    start();
    window.addEventListener('online', () => { if (S.ready) flush(); else start(); });
    document.addEventListener('click', e => { if (e.target.closest('#syncPill')) statusSheet(); });
  }

  G.Sync = { init, start, pillHtml, statusSheet, firstSync: () => Promise.race([firstSync, new Promise(r => setTimeout(r, 8000))]), signedUrl, wipeRemote, isOn: () => S.ready, state: () => S.state, _S: S };
})(window);
