/* =========================================================
   Nexo Games — server realtime (Cloudflare Durable Object)
   Semua route /api/nexo/* : akun teman (nama + PIN), chat grup & pribadi,
   game properti "Nexo Kota Dunia", foto (R2), dan Web Push.

   Binding (wrangler.jsonc):
     NEXO   Durable Object NexoHub (SQLite, gratis)
     FILES  R2 bucket (foto chat & avatar) — sudah ada
     HUB_KV KV (kunci VAPID yang sama dengan Nexa)
   ========================================================= */
import { DurableObject } from 'cloudflare:workers';
import * as E from '../public/games/engine.js';
import { getVapid, sendPush } from './index.js';

const SESSION_DAYS = 180;
const MAX_MSG = 2000;
const HISTORY_PAGE = 40;
const OUTBOX_MAX = 25;
const MAX_UPLOAD = 8 * 1024 * 1024;
const MEDIA_RE = /^[a-z0-9-]{20,80}$/;
const IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const AUDIO_TYPES = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/aac', 'audio/x-m4a', 'audio/wav'];

const enc = new TextEncoder();
const jsonRes = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, headers) });
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; this.user = true; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randId = (n = 16) => b64u(crypto.getRandomValues(new Uint8Array(n))).replace(/[^A-Za-z0-9]/g, '').slice(0, Math.ceil(n * 1.3)).toLowerCase();
const rng = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const nameKey = s => String(s || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const cleanName = s => String(s || '').normalize('NFKC').replace(/[\u0000-\u001f<>]/g, '').trim().replace(/\s+/g, ' ').slice(0, 24);
async function sha256hex(s) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function hashPin(pin, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 20000, hash: 'SHA-256' }, key, 256);
  return b64u(new Uint8Array(bits));
}
const validPin = p => /^\d{4}$/.test(String(p || ''));
const EMOJI_COLORS = ['#007AFF', '#34C759', '#FF9500', '#FF2D55', '#AF52DE', '#5856D6', '#00C7BE', '#FF3B30', '#FFCC00', '#8E8E93'];

// ---------- Router di Worker utama ----------
export async function handleNexo(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const media = /^\/api\/nexo\/media\/([a-z0-9-]+)$/.exec(path);
  if (media && request.method === 'GET') {
    if (!MEDIA_RE.test(media[1]) || !env.FILES) return new Response('Not found', { status: 404 });
    // Mendukung Range (wajib agar voice note bisa diputar di Safari iPhone)
    const rh = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range') || '');
    let range;
    if (rh) { const head = await env.FILES.head('nexo/' + media[1]); if (!head) return new Response('Not found', { status: 404 });
      const size = head.size, start = rh[1] === '' ? Math.max(0, size - Number(rh[2])) : Number(rh[1]), end = rh[1] !== '' && rh[2] !== '' ? Math.min(size - 1, Number(rh[2])) : size - 1;
      if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      range = { offset: start, length: end - start + 1, size }; }
    const obj = await env.FILES.get('nexo/' + media[1], range ? { range: { offset: range.offset, length: range.length } } : undefined);
    if (!obj) return new Response('Not found', { status: 404 });
    const headers = { 'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable', ETag: obj.httpEtag, 'Accept-Ranges': 'bytes' };
    if (range) return new Response(obj.body, { status: 206, headers: Object.assign(headers, { 'Content-Range': `bytes ${range.offset}-${range.offset + range.length - 1}/${range.size}`, 'Content-Length': String(range.length) }) });
    return new Response(obj.body, { headers: Object.assign(headers, { 'Content-Length': String(obj.size) }) });
  }
  if (!env.NEXO) return jsonRes({ error: 'Durable Object NEXO belum diatur (lihat README Nexo Games).' }, 503);
  const stub = env.NEXO.get(env.NEXO.idFromName('nexo-hub'));
  return stub.fetch(request);
}

// ---------- Durable Object ----------
export class NexoHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.games = new Map();
    this.nudges = new Map();
    ctx.blockConcurrencyWhile(() => this.load());
    try { ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong')); } catch (e) {}
  }

  async load() {
    const s = this.ctx.storage;
    const [users, convs, index, settings] = await Promise.all([s.get('users'), s.get('convs'), s.get('gindex'), s.get('settings')]);
    this.users = users || {};
    this.convs = convs || {};
    this.gindex = index || {};
    this.settings = settings || { inviteCode: '' };
    if (!this.convs.group) this.convs.group = { id: 'group', seq: 0, last: null, reads: {} };
  }
  saveUsers() { return this.ctx.storage.put('users', this.users); }
  saveConvs() { return this.ctx.storage.put('convs', this.convs); }
  saveIndex() { return this.ctx.storage.put('gindex', this.gindex); }

  pubUser(u) {
    return { id: u.id, name: u.name, avatar: u.avatar, admin: !!u.admin, bio: u.bio || '', createdAt: u.createdAt, stats: u.stats || { played: 0, wins: 0 } };
  }
  findByName(name) { const k = nameKey(name); return Object.values(this.users).find(u => u.key === k) || null; }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');
    const method = request.method.toUpperCase();
    try {
      if (path === '/api/nexo/ws') return await this.openSocket(request, url);
      if (path === '/api/nexo/info' && method === 'GET') return jsonRes({ needInvite: !!this.settings.inviteCode, users: Object.keys(this.users).length });
      if (path === '/api/nexo/lookup' && method === 'POST') {
        const body = await readBody(request);
        const u = this.findByName(body.name);
        return jsonRes(u ? { found: true, user: { id: u.id, name: u.name, avatar: u.avatar } } : { found: false, needInvite: !!this.settings.inviteCode });
      }
      if (path === '/api/nexo/signup' && method === 'POST') return jsonRes(await this.signup(await readBody(request)));
      if (path === '/api/nexo/login' && method === 'POST') return jsonRes(await this.login(await readBody(request)));
      if (path === '/api/nexo/pending' && method === 'GET') return jsonRes(await this.pending(url));

      const uid = await this.auth(request);
      if (path === '/api/nexo/me' && method === 'GET') return jsonRes({ user: this.pubUser(this.users[uid]) });
      if (path === '/api/nexo/upload' && method === 'POST') return jsonRes(await this.upload(request, uid));
      if (path === '/api/nexo/subscribe' && method === 'POST') return jsonRes(await this.subscribe(uid, await readBody(request)));
      if (path === '/api/nexo/unsubscribe' && method === 'POST') {
        const body = await readBody(request);
        const subs = ((await this.ctx.storage.get('subs:' + uid)) || []).filter(s => s.endpoint !== body.endpoint);
        await this.ctx.storage.put('subs:' + uid, subs);
        return jsonRes({ ok: true });
      }
      if (path === '/api/nexo/test-push' && method === 'POST') {
        const n = await this.push([uid], { title: 'Tes notifikasi Nexo ✅', body: 'Notifikasi berfungsi, walau web tertutup.', tag: 'test', url: './' }, true);
        return jsonRes({ ok: true, sent: n });
      }
      if (path === '/api/nexo/logout' && method === 'POST') {
        const t = bearer(request); if (t) await this.ctx.storage.delete('sess:' + await sha256hex(t));
        return jsonRes({ ok: true });
      }
      return jsonRes({ error: 'Not found' }, 404);
    } catch (e) {
      if (!e.user) console.error('nexo', e && e.stack || e);
      return jsonRes({ error: e.user ? e.message : 'Server error' }, e.status || (e.user ? 400 : 500));
    }
  }

  // ---------- Akun ----------
  async newSession(uid) {
    const token = randId(32) + randId(16);
    await this.ctx.storage.put('sess:' + await sha256hex(token), { uid, exp: Date.now() + SESSION_DAYS * 86400000 });
    return token;
  }
  async auth(request, tokenOverride) {
    const t = tokenOverride || bearer(request);
    if (!t) fail(401, 'Silakan masuk dulu.');
    const s = await this.ctx.storage.get('sess:' + await sha256hex(t));
    if (!s || s.exp < Date.now() || !this.users[s.uid]) fail(401, 'Sesi berakhir, silakan masuk lagi.');
    return s.uid;
  }
  async signup(b) {
    const name = cleanName(b.name);
    if (name.length < 2) fail(400, 'Nama minimal 2 huruf.');
    if (this.findByName(name)) fail(409, 'Nama sudah dipakai. Pilih "Masuk".');
    if (!validPin(b.pin)) fail(400, 'PIN harus 4 angka.');
    if (this.settings.inviteCode && nameKey(b.invite) !== nameKey(this.settings.inviteCode)) fail(403, 'Kode undangan salah.');
    if (Object.keys(this.users).length >= 60) fail(403, 'Jumlah akun sudah maksimal.');
    const id = 'u' + randId(9);
    const salt = randId(12);
    const avatar = cleanAvatar(b.avatar) || { emoji: '😎', color: EMOJI_COLORS[Object.keys(this.users).length % EMOJI_COLORS.length] };
    const u = { id, name, key: nameKey(name), salt, pin: await hashPin(b.pin, salt), avatar, createdAt: Date.now(), lastSeen: Date.now(), admin: Object.keys(this.users).length === 0, stats: { played: 0, wins: 0 } };
    this.users[id] = u;
    await this.saveUsers();
    this.broadcast({ t: 'user', user: this.pubUser(u) });
    this.systemMsg(`${name} bergabung ke Nexo Games 👋`);
    return { token: await this.newSession(id), user: this.pubUser(u) };
  }
  async login(b) {
    const u = this.findByName(b.name);
    if (!u) fail(404, 'Akun tidak ditemukan.');
    const now = Date.now();
    if (u.lockUntil && u.lockUntil > now) fail(429, `Terlalu banyak percobaan. Coba lagi ${Math.ceil((u.lockUntil - now) / 60000)} menit lagi.`);
    if (!validPin(b.pin) || await hashPin(b.pin, u.salt) !== u.pin) {
      u.fails = (u.fails || 0) + 1;
      if (u.fails >= 5) { u.lockUntil = now + 5 * 60000; u.fails = 0; }
      await this.saveUsers();
      fail(401, 'PIN salah.');
    }
    u.fails = 0; u.lockUntil = 0;
    await this.saveUsers();
    return { token: await this.newSession(u.id), user: this.pubUser(u) };
  }

  // ---------- Upload foto ----------
  async upload(request, uid) {
    if (!this.env.FILES) fail(503, 'R2 (FILES) belum aktif.');
    const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!IMG_TYPES.includes(type) && !AUDIO_TYPES.includes(type)) fail(415, 'Jenis file tidak didukung.');
    const buf = await request.arrayBuffer();
    if (!buf.byteLength) fail(400, 'File kosong.');
    if (buf.byteLength > MAX_UPLOAD) fail(413, 'Gambar terlalu besar (maks 8 MB).');
    const id = crypto.randomUUID() + '-' + randId(6);
    await this.env.FILES.put('nexo/' + id, buf, { httpMetadata: { contentType: type }, customMetadata: { by: uid } });
    return { id, url: '/api/nexo/media/' + id };
  }

  // ---------- Push ----------
  async subscribe(uid, b) {
    const sub = b.subscription;
    if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint)) fail(400, 'Langganan tidak valid.');
    let subs = ((await this.ctx.storage.get('subs:' + uid)) || []).filter(s => s.endpoint !== sub.endpoint);
    subs.push({ endpoint: sub.endpoint, keys: sub.keys || null, label: String(b.label || '').slice(0, 60), at: Date.now() });
    subs = subs.slice(-6);
    await this.ctx.storage.put('subs:' + uid, subs);
    await this.ctx.storage.put('ep:' + await sha256hex(sub.endpoint), uid);
    let vapid = await getVapid(this.env, false);
    if (!vapid) vapid = await getVapid(this.env, true);
    return { ok: true, devices: subs.length };
  }
  async vapidKey() {
    let v = await getVapid(this.env, false).catch(() => null);
    if (!v && this.env.HUB_KV) v = await getVapid(this.env, true).catch(() => null);
    return v ? v.publicKey : null;
  }
  async pending(url) {
    const endpoint = url.searchParams.get('endpoint') || '';
    const since = Number(url.searchParams.get('since') || 0);
    const uid = endpoint && await this.ctx.storage.get('ep:' + await sha256hex(endpoint));
    if (!uid) fail(403, 'Unknown subscription');
    const ob = (await this.ctx.storage.get('ob:' + uid)) || [];
    const min = since > 0 ? since : Date.now() - 10 * 60000;
    return { items: ob.filter(i => i.ts > min).slice(-6), now: Date.now() };
  }
  isActive(uid) {
    return this.ctx.getWebSockets(uid).some(ws => { const a = ws.deserializeAttachment(); return a && a.visible; });
  }
  // Kirim notifikasi ke pengguna yang tidak sedang membuka web.
  async push(uids, item, force = false) {
    const targets = [...new Set(uids)].filter(u => this.users[u] && (force || !this.isActive(u)));
    if (!targets.length) return 0;
    let vapid = null;
    try { vapid = await getVapid(this.env, false); } catch (e) { console.warn('vapid', e); }
    let sent = 0;
    const now = Date.now();
    await Promise.all(targets.map(async (uid, k) => {
      const ob = ((await this.ctx.storage.get('ob:' + uid)) || []).filter(i => now - i.ts < 86400000);
      ob.push(Object.assign({ id: randId(8), ts: now + k }, item));
      await this.ctx.storage.put('ob:' + uid, ob.slice(-OUTBOX_MAX));
      if (!vapid) return;
      const subs = (await this.ctx.storage.get('subs:' + uid)) || [];
      if (!subs.length) return;
      const res = await Promise.all(subs.map(s => sendPush(s, this.env, vapid).catch(() => 0)));
      sent += res.filter(r => r >= 200 && r < 300).length;
      const dead = new Set(subs.filter((s, i) => res[i] === 404 || res[i] === 410).map(s => s.endpoint));
      if (dead.size) await this.ctx.storage.put('subs:' + uid, subs.filter(s => !dead.has(s.endpoint)));
    }));
    return sent;
  }

  // ---------- WebSocket ----------
  async openSocket(request, url) {
    if (request.headers.get('Upgrade') !== 'websocket') fail(426, 'Butuh WebSocket');
    const uid = await this.auth(request, url.searchParams.get('t'));
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const wasOnline = this.ctx.getWebSockets(uid).length > 0;
    this.ctx.acceptWebSocket(server, [uid]);
    server.serializeAttachment({ uid, visible: true, watch: null, view: '' });
    const u = this.users[uid];
    u.lastSeen = Date.now();
    this.saveUsers();
    if (!wasOnline) this.presence(uid, true);
    this.send(server, await this.initPayload(uid));
    const pendingCall = this.calls && this.calls.get(uid);
    if (pendingCall && Date.now() - pendingCall.ts < 45000) this.send(server, { t: 'call', from: pendingCall.from, data: pendingCall.data });
    return new Response(null, { status: 101, webSocket: client });
  }
  onlineIds() { return [...new Set(this.ctx.getWebSockets().map(ws => (ws.deserializeAttachment() || {}).uid).filter(Boolean))]; }
  myConvs(uid) { return Object.values(this.convs).filter(c => c.id === 'group' || c.id.split(':').includes(uid)); }
  async initPayload(uid) {
    const me = this.users[uid];
    return {
      t: 'init', me: this.pubUser(me), users: Object.values(this.users).map(u => me.admin ? Object.assign(this.pubUser(u), { lastSeen: u.lastSeen || 0 }) : this.pubUser(u)), online: this.onlineIds(),
      convs: this.myConvs(uid), games: Object.values(this.gindex), settings: { needInvite: !!this.settings.inviteCode, inviteCode: me.admin ? this.settings.inviteCode : undefined, photos: this.settings.photos || {} },
      vapidPublicKey: await this.vapidKey(), now: Date.now()
    };
  }
  // Status online terlihat semua; "terakhir online" hanya untuk admin
  presence(uid, online) {
    const ls = (this.users[uid] || {}).lastSeen || Date.now();
    for (const ws of this.ctx.getWebSockets()) { const a = ws.deserializeAttachment(); if (!a || a.uid === uid) continue; this.send(ws, (this.users[a.uid] || {}).admin ? { t: 'presence', uid, online, lastSeen: ls } : { t: 'presence', uid, online }); }
  }
  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (e) {} }
  broadcast(obj, exceptUid) { const s = JSON.stringify(obj); for (const ws of this.ctx.getWebSockets()) { const a = ws.deserializeAttachment(); if (a && a.uid !== exceptUid) try { ws.send(s); } catch (e) {} } }
  toUsers(uids, obj) { const s = JSON.stringify(obj); for (const uid of new Set(uids)) for (const ws of this.ctx.getWebSockets(uid)) try { ws.send(s); } catch (e) {} }

  async webSocketMessage(ws, raw) {
    if (raw === 'ping') return this.send(ws, 'pong');
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const att = ws.deserializeAttachment();
    if (!att || !this.users[att.uid]) { try { ws.close(4001, 'auth'); } catch (e) {} return; }
    try {
      const data = await this.handle(ws, att, m);
      if (m.rid) this.send(ws, { re: m.rid, ok: true, data });
    } catch (e) {
      if (!e.user) console.error('nexo ws', e && e.stack || e);
      if (m.rid) this.send(ws, { re: m.rid, ok: false, error: e.user ? e.message : 'Terjadi kesalahan di server.' });
    }
  }
  async webSocketClose(ws) { this.afterClose(ws); try { ws.close(1000); } catch (e) {} }
  async webSocketError(ws) { this.afterClose(ws); }
  afterClose(ws) {
    const a = ws.deserializeAttachment(); if (!a) return;
    const still = this.ctx.getWebSockets(a.uid).filter(x => x !== ws && x.readyState === 1).length;
    if (!still && this.users[a.uid]) {
      this.users[a.uid].lastSeen = Date.now(); this.saveUsers();
      this.presence(a.uid, false);
    }
  }

  async handle(ws, att, m) {
    const uid = att.uid, me = this.users[uid];
    switch (m.t) {
      case 'vis':
        att.visible = !!m.visible; att.view = String(m.view || '').slice(0, 60);
        ws.serializeAttachment(att);
        return null;
      case 'profile': {
        if (m.name !== undefined) {
          const name = cleanName(m.name);
          if (name.length < 2) fail(400, 'Nama minimal 2 huruf.');
          const other = this.findByName(name);
          if (other && other.id !== uid) fail(409, 'Nama sudah dipakai teman lain.');
          me.name = name; me.key = nameKey(name);
        }
        if (m.avatar !== undefined) { const av = cleanAvatar(m.avatar); if (av) me.avatar = av; }
        if (m.bio !== undefined) me.bio = String(m.bio || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 140);
        await this.saveUsers();
        // perbarui nama di game yang sedang berjalan
        for (const gi of Object.values(this.gindex)) if (gi.players.includes(uid) && gi.status !== 'ended') {
          const g = await this.getGame(gi.id); const p = g && E.player(g, uid); if (p) { p.name = me.name; await this.saveGame(g); }
        }
        this.broadcast({ t: 'user', user: this.pubUser(me) });
        return this.pubUser(me);
      }
      case 'pin': {
        if (await hashPin(m.old, me.salt) !== me.pin) fail(401, 'PIN lama salah.');
        if (!validPin(m.pin)) fail(400, 'PIN baru harus 4 angka.');
        me.salt = randId(12); me.pin = await hashPin(m.pin, me.salt);
        await this.saveUsers();
        return true;
      }
      case 'photo.set': {
        if (!me.admin) fail(403, 'Hanya admin yang bisa mengganti foto kota.');
        const key = String(m.key || '').slice(0, 30);
        if (!E.SPACES.some(sp => sp.key === key)) fail(400, 'Kota tidak dikenal.');
        this.settings.photos = this.settings.photos || {};
        if (m.media && MEDIA_RE.test(m.media)) this.settings.photos[key] = m.media; else delete this.settings.photos[key];
        await this.ctx.storage.put('settings', this.settings);
        this.broadcast({ t: 'photos', photos: this.settings.photos });
        return { photos: this.settings.photos };
      }
      case 'invite.set': {
        if (!me.admin) fail(403, 'Hanya admin.');
        this.settings.inviteCode = cleanName(m.code || '').slice(0, 20);
        await this.ctx.storage.put('settings', this.settings);
        return { inviteCode: this.settings.inviteCode };
      }
      case 'user.delete': {
        if (!me.admin) fail(403, 'Hanya admin.');
        const u = this.users[m.uid]; if (!u || u.id === uid) fail(400, 'Tidak bisa.');
        delete this.users[m.uid]; await this.saveUsers();
        for (const ws2 of this.ctx.getWebSockets(m.uid)) try { ws2.close(4001, 'deleted'); } catch (e) {}
        this.broadcast({ t: 'userGone', uid: m.uid });
        return true;
      }

      // ----- Chat -----
      case 'chat.history': {
        const c = this.conv(uid, m.conv, false);
        if (!c) return { msgs: [], more: false };
        const opts = { prefix: `m:${c.id}:`, reverse: true, limit: HISTORY_PAGE + 1 };
        if (m.before) opts.end = msgKey(c.id, m.before);
        const list = [...(await this.ctx.storage.list(opts)).values()];
        return { msgs: list.slice(0, HISTORY_PAGE).reverse(), more: list.length > HISTORY_PAGE };
      }
      case 'chat.send': {
        const c = this.conv(uid, m.conv, true);
        const text = String(m.text || '').replace(/\r/g, '').slice(0, MAX_MSG).trim();
        const img = m.img && MEDIA_RE.test(m.img.id) ? { id: m.img.id, w: Math.round(Number(m.img.w) || 0), h: Math.round(Number(m.img.h) || 0) } : null;
        const voice = !img && m.voice && MEDIA_RE.test(m.voice.id) ? { id: m.voice.id, dur: Math.max(0, Math.min(600, Math.round(Number(m.voice.dur) || 0))), peaks: Array.isArray(m.voice.peaks) ? m.voice.peaks.slice(0, 40).map(v => Math.max(0, Math.min(1, Math.round(Number(v) * 100) / 100))) : null } : null;
        if (!text && !img && !voice) fail(400, 'Pesan kosong.');
        let reply = null;
        if (m.reply) {
          const r = await this.ctx.storage.get(msgKey(c.id, m.reply));
          if (r) reply = { seq: r.seq, from: r.from, text: r.del ? 'Pesan dihapus' : (r.text || (r.img ? '📷 Foto' : '')).slice(0, 120), img: !!r.img };
        }
        c.seq++;
        const msg = { seq: c.seq, from: uid, text, img, voice, reply, ts: Date.now(), react: {}, cid: String(m.cid || '').slice(0, 40) || undefined };
        await this.ctx.storage.put(msgKey(c.id, c.seq), msg);
        c.last = { seq: c.seq, from: uid, text: text.slice(0, 140), img: !!img, voice: !!voice, ts: msg.ts };
        c.reads[uid] = c.seq;
        await this.saveConvs();
        const members = this.members(c);
        this.toUsers(members, { t: 'msg', conv: c.id, msg, meta: c });
        const isGroup = c.id === 'group';
        const body = text ? text.slice(0, 160) : voice ? '🎤 Pesan suara' : '📷 Mengirim foto';
        this.push(members.filter(x => x !== uid), {
          title: isGroup ? `${me.name} · Grup Nexo` : me.name, body, tag: 'chat-' + c.id, url: './?chat=' + encodeURIComponent(c.id), kind: 'chat'
        }).catch(e => console.warn('push', e));
        const link = !img && text.match(/https?:\/\/[^\s<>"']+/i);
        if (link) this.attachPreview(c.id, msg.seq, link[0].replace(/[.,;:!?)\]]+$/, '')).catch(e => console.warn('preview', e));
        return { seq: msg.seq, conv: c.id };
      }
      case 'chat.read': {
        const c = this.conv(uid, m.conv, false); if (!c) return null;
        const seq = Math.min(c.seq, Number(m.seq) || c.seq);
        if ((c.reads[uid] || 0) < seq) { c.reads[uid] = seq; await this.saveConvs(); this.toUsers(this.members(c), { t: 'read', conv: c.id, uid, seq }); }
        return null;
      }
      case 'chat.edit': {
        const c = this.conv(uid, m.conv, false); if (!c) fail(404, 'Chat tidak ada.');
        const k = msgKey(c.id, m.seq), msg = await this.ctx.storage.get(k);
        if (!msg || msg.del) fail(404, 'Pesan tidak ada.');
        if (msg.from !== uid) fail(403, 'Hanya bisa mengedit pesanmu sendiri.');
        if (msg.voice) fail(400, 'Pesan suara tidak bisa diedit.');
        if (Date.now() - msg.ts > 24 * 3600000) fail(400, 'Pesan lebih dari 24 jam tidak bisa diedit.');
        const text = String(m.text || '').replace(/\r/g, '').slice(0, MAX_MSG).trim();
        if (!text && !msg.img) fail(400, 'Pesan tidak boleh kosong.');
        if (text === msg.text) return null;
        msg.text = text; msg.edited = Date.now();
        const hadLink = msg.link; delete msg.link;
        await this.ctx.storage.put(k, msg);
        if (c.last && c.last.seq === msg.seq) { c.last.text = text.slice(0, 140); await this.saveConvs(); }
        this.toUsers(this.members(c), { t: 'msgUpdate', conv: c.id, msg, meta: c });
        const link = !msg.img && text.match(/https?:\/\/[^\s<>"']+/i);
        if (link) this.attachPreview(c.id, msg.seq, link[0].replace(/[.,;:!?)\]]+$/, '')).catch(() => {});
        return null;
      }
      case 'chat.media': {
        const c = this.conv(uid, m.conv, false); if (!c) return { media: [], links: [], voice: [] };
        const all = await this.ctx.storage.list({ prefix: `m:${c.id}:`, reverse: true, limit: 3000 });
        const media = [], links = [], voice = [];
        for (const msg of all.values()) {
          if (msg.del) continue;
          if (msg.img && media.length < 300) media.push({ seq: msg.seq, from: msg.from, ts: msg.ts, img: msg.img });
          if (msg.voice && voice.length < 200) voice.push({ seq: msg.seq, from: msg.from, ts: msg.ts, voice: msg.voice });
          if (msg.text && links.length < 300) { const found = msg.text.match(/https?:\/\/[^\s<>"']+/gi); if (found) found.forEach(u => links.push({ seq: msg.seq, from: msg.from, ts: msg.ts, url: u.replace(/[.,;:!?)\]]+$/, ''), link: msg.link && msg.link.url === u.replace(/[.,;:!?)\]]+$/, '') ? msg.link : null })); }
        }
        return { media, links, voice };
      }
      case 'chat.react': case 'chat.delete': {
        const c = this.conv(uid, m.conv, false); if (!c) fail(404, 'Chat tidak ada.');
        const k = msgKey(c.id, m.seq), msg = await this.ctx.storage.get(k);
        if (!msg) fail(404, 'Pesan tidak ada.');
        if (m.t === 'chat.react') {
          const emo = String(m.emoji || '').slice(0, 8); if (!emo) fail(400, 'Emoji kosong.');
          for (const [e, list] of Object.entries(msg.react)) { msg.react[e] = list.filter(x => x !== uid); if (!msg.react[e].length) delete msg.react[e]; }
          if (!m.remove) (msg.react[emo] = msg.react[emo] || []).push(uid);
        } else {
          if (msg.from !== uid) fail(403, 'Hanya bisa menghapus pesanmu sendiri.');
          msg.del = true; msg.text = ''; msg.img = null; msg.voice = null; msg.link = null; msg.react = {};
          if (c.last && c.last.seq === msg.seq) { c.last.text = 'Pesan dihapus'; c.last.img = false; await this.saveConvs(); }
        }
        await this.ctx.storage.put(k, msg);
        this.toUsers(this.members(c), { t: 'msgUpdate', conv: c.id, msg, meta: c });
        return null;
      }
      case 'typing': {
        const c = this.conv(uid, m.conv, false); if (!c) return null;
        this.toUsers(this.members(c).filter(x => x !== uid), { t: 'typing', conv: c.id, uid });
        return null;
      }

      // ----- Sosial: feed & story -----
      case 'feed.list': {
        const opts = { prefix: 'p:', reverse: true, limit: m.uid ? 600 : 21 };
        if (m.before) opts.end = postKey(m.before);
        let list = [...(await this.ctx.storage.list(opts)).values()];
        if (m.uid) list = list.filter(x => x.uid === m.uid).slice(0, 61);
        return { posts: list.slice(0, 20), more: list.length > 20 };
      }
      case 'post.create': {
        const text = String(m.text || '').replace(/\r/g, '').slice(0, 2000).trim();
        const img = m.img && MEDIA_RE.test(m.img.id) ? { id: m.img.id, w: Math.round(Number(m.img.w) || 0), h: Math.round(Number(m.img.h) || 0) } : null;
        if (!text && !img) fail(400, 'Postingan kosong.');
        this.settings.postSeq = (this.settings.postSeq || 0) + 1;
        await this.ctx.storage.put('settings', this.settings);
        const post = { seq: this.settings.postSeq, uid, text, img, ts: Date.now(), likes: [], comments: [] };
        await this.ctx.storage.put(postKey(post.seq), post);
        this.broadcast({ t: 'post', post });
        return post;
      }
      case 'post.like': case 'post.comment': case 'post.delete': case 'post.uncomment': {
        const k = postKey(m.seq), post = await this.ctx.storage.get(k);
        if (!post) fail(404, 'Postingan sudah dihapus.');
        if (m.t === 'post.delete') {
          if (post.uid !== uid && !me.admin) fail(403, 'Bukan postinganmu.');
          await this.ctx.storage.delete(k);
          this.broadcast({ t: 'postGone', seq: post.seq });
          return true;
        }
        if (m.t === 'post.like') {
          const had = post.likes.includes(uid);
          post.likes = had ? post.likes.filter(x => x !== uid) : post.likes.concat(uid);
          if (!had && post.uid !== uid) this.push([post.uid], { title: `❤️ ${me.name} menyukai postinganmu`, body: (post.text || '📷 Foto').slice(0, 100), tag: 'post-' + post.seq, url: './?post=' + post.seq, kind: 'social' }).catch(() => {});
        } else if (m.t === 'post.comment') {
          const text = String(m.text || '').replace(/\r/g, '').slice(0, 1000).trim();
          if (!text) fail(400, 'Komentar kosong.');
          if (post.comments.length >= 300) fail(400, 'Komentar sudah terlalu banyak.');
          post.comments.push({ id: randId(8), uid, text, ts: Date.now() });
          const notify = [...new Set([post.uid, ...post.comments.map(c => c.uid)])].filter(x => x !== uid);
          this.push(notify, { title: `💬 ${me.name} berkomentar`, body: text.slice(0, 120), tag: 'post-' + post.seq, url: './?post=' + post.seq, kind: 'social' }).catch(() => {});
        } else {
          const c = post.comments.find(x => x.id === m.cid);
          if (!c) fail(404, 'Komentar tidak ada.');
          if (c.uid !== uid && post.uid !== uid && !me.admin) fail(403, 'Tidak bisa menghapus komentar ini.');
          post.comments = post.comments.filter(x => x !== c);
        }
        await this.ctx.storage.put(k, post);
        this.broadcast({ t: 'postUpdate', post });
        return post;
      }
      case 'story.list': return { stories: await this.activeStories() };
      case 'story.create': {
        const img = m.img && MEDIA_RE.test(m.img.id) ? { id: m.img.id, w: Math.round(Number(m.img.w) || 0), h: Math.round(Number(m.img.h) || 0) } : null;
        const text = String(m.text || '').slice(0, 200).trim();
        if (!img && !text) fail(400, 'Story kosong.');
        const bg = /^#[0-9a-f]{6}$/i.test(m.bg || '') ? m.bg : '#007AFF';
        const list = await this.activeStories();
        if (list.filter(x => x.uid === uid).length >= 20) fail(400, 'Maksimal 20 story per hari.');
        list.push({ id: randId(10), uid, img, text, bg, ts: Date.now(), views: [] });
        await this.ctx.storage.put('stories', list);
        this.broadcast({ t: 'stories', stories: list });
        return true;
      }
      case 'story.view': case 'story.delete': {
        const list = await this.activeStories();
        const st = list.find(x => x.id === m.id); if (!st) return null;
        if (m.t === 'story.view') { if (st.uid === uid || st.views.includes(uid)) return null; st.views.push(uid); await this.ctx.storage.put('stories', list); this.toUsers([st.uid], { t: 'stories', stories: list }); return null; }
        if (st.uid !== uid && !me.admin) fail(403, 'Bukan story-mu.');
        const next = list.filter(x => x !== st);
        await this.ctx.storage.put('stories', next);
        this.broadcast({ t: 'stories', stories: next });
        return true;
      }

      // ----- Telepon (sinyal WebRTC) -----
      case 'call.signal': {
        const to = String(m.to || '');
        if (!this.users[to] || to === uid) fail(400, 'Teman tidak ditemukan.');
        const data = m.data || {};
        const type = String(data.type || '');
        if (!['invite', 'answer', 'ice', 'end', 'decline', 'busy', 'ringing'].includes(type)) fail(400, 'Sinyal tidak valid.');
        if (JSON.stringify(data).length > 60000) fail(400, 'Sinyal terlalu besar.');
        this.calls = this.calls || new Map();
        if (type === 'invite') this.calls.set(to, { from: uid, data, ts: Date.now() });
        if (['answer', 'end', 'decline', 'busy'].includes(type)) { this.calls.delete(uid); this.calls.delete(to); }
        const online = this.ctx.getWebSockets(to).length > 0;
        this.toUsers([to], { t: 'call', from: uid, data });
        if (type === 'invite') this.push([to], { title: `${data.video ? '📹' : '📞'} ${me.name} menelepon kamu`, body: 'Tap untuk menjawab.', tag: 'call-' + uid, url: './?call=' + uid, kind: 'call' }, true).catch(() => {});
        return { online };
      }

      // ----- Game -----
      case 'game.create': {
        const open = Object.values(this.gindex).filter(gi => gi.host === uid && gi.status !== 'ended').length;
        if (open >= 5) fail(400, 'Kamu sudah punya 5 room aktif.');
        const s = m.settings || {};
        const settings = {
          startCash: [10, 15, 20, 30].includes(Number(s.startCash) / 1000000) ? Number(s.startCash) : 20000000,
          maxPlayers: Number(s.maxPlayers) || 6, monopolyWin: s.monopolyWin !== false,
          turnSec: Number(s.turnSec) || 60, timeLimitMin: [0, 30, 45, 60, 90, 120].includes(Number(s.timeLimitMin)) ? Number(s.timeLimitMin) : 0
        };
        const g = E.newGame({ id: 'g' + randId(8), name: cleanName(m.name) || `Room ${me.name}`, host: uid, hostName: me.name, mode: m.mode, settings, now: Date.now() });
        if (m.color) { try { E.setColor(g, uid, m.color); } catch (e) {} }
        const nb = Math.max(0, Math.min(g.settings.maxPlayers - 1, Number(m.bots) || 0));
        for (let k = 0; k < nb; k++) this.addBot(g);
        await this.saveGame(g);
        const inv = (m.invite || []).filter(x => this.users[x] && x !== uid);
        if (inv.length) this.invitePush(g, me, inv);
        att.watch = g.id; ws.serializeAttachment(att);
        return this.pubGame(g);
      }
      case 'game.get': {
        const g = await this.getGame(m.id); if (!g) fail(404, 'Room tidak ditemukan.');
        att.watch = g.id; ws.serializeAttachment(att);
        return this.pubGame(g);
      }
      case 'game.unwatch': att.watch = null; ws.serializeAttachment(att); return null;
      case 'game.join': case 'game.leave': case 'game.start': case 'game.delete': case 'game.end': case 'game.kick': case 'game.settings': case 'game.color': case 'game.addbot': case 'game.botedit': {
        const g = await this.getGame(m.id); if (!g) fail(404, 'Room tidak ditemukan.');
        const isHost = g.host === uid || me.admin;
        if (g.engine !== E.ENGINE && !['game.delete', 'game.leave'].includes(m.t)) fail(400, 'Room ini versi lama. Hapus lalu buat room baru ya.');
        if (m.t === 'game.join') { try { E.addPlayer(g, uid, me.name, m.color); } catch (e) { fail(400, e.message); } }
        else if (m.t === 'game.color') { try { E.setColor(g, uid, m.color); } catch (e) { fail(400, e.message); } }
        else if (m.t === 'game.botedit') {
          if (!isHost) fail(403, 'Hanya host yang bisa mengubah bot.');
          const bp = E.player(g, m.uid); if (!bp || !String(bp.id).startsWith('bot_')) fail(404, 'Bot tidak ditemukan.');
          const nm = cleanName(m.name); if (nm.length >= 2) bp.name = nm;
          const av = cleanAvatar(m.avatar); if (av) bp.avatar = av;
        }
        else if (m.t === 'game.addbot') { if (!isHost || g.status !== 'lobby') fail(403, 'Hanya host di lobi.'); if (g.players.length >= g.settings.maxPlayers) fail(400, 'Room sudah penuh.'); this.addBot(g); }
        else if (m.t === 'game.leave') {
          if (g.status !== 'lobby') fail(400, 'Game sudah berjalan. Pakai "Menyerah".');
          if (g.host === uid) fail(400, 'Host tidak bisa keluar. Hapus room saja.');
          E.removePlayer(g, uid);
        } else if (m.t === 'game.kick') {
          if (!isHost || g.status !== 'lobby') fail(403, 'Tidak bisa.');
          E.removePlayer(g, m.uid);
        } else if (m.t === 'game.settings') {
          if (!isHost || g.status !== 'lobby') fail(403, 'Tidak bisa.');
          const s = m.settings || {};
          if (s.maxPlayers) g.settings.maxPlayers = Math.max(g.players.length, 2, Math.min(10, Number(s.maxPlayers)));
          if (s.mode) g.mode = s.mode === 'live' ? 'live' : 'santai';
        } else if (m.t === 'game.start') {
          if (!isHost) fail(403, 'Hanya host yang bisa memulai.');
          for (const p of g.players) if (this.users[p.id]) p.name = this.users[p.id].name;
          try { E.startGame(g, { now: Date.now(), rng }); } catch (e) { fail(400, e.message); }
          await this.saveGame(g);
          this.push(g.players.map(p => p.id).filter(x => x !== uid), { title: `${g.name} dimulai! 🎲`, body: `${me.name} memulai game. Ayo main!`, tag: 'game-' + g.id, url: './?game=' + g.id, kind: 'game' });
          this.sendNotifs(g, g._notify);
          return this.pubGame(g);
        } else if (m.t === 'game.end') {
          if (!isHost) fail(403, 'Hanya host yang bisa mengakhiri.');
          const notes = E.endByHost(g, { now: Date.now(), rng });
          await this.saveGame(g); this.sendNotifs(g, notes);
          return this.pubGame(g);
        } else if (m.t === 'game.delete') {
          if (!isHost) fail(403, 'Hanya host.');
          if (g.status === 'playing' && g.engine === E.ENGINE) fail(400, 'Akhiri game dulu sebelum menghapus.');
          await this.deleteGame(g.id);
          return true;
        }
        await this.saveGame(g);
        return this.pubGame(g);
      }
      case 'game.act': {
        const g0 = await this.getGame(m.id); if (!g0) fail(404, 'Room tidak ditemukan.');
        const g = structuredClone(g0);
        let notes;
        try { notes = E.act(g, uid, m.a || {}, { now: Date.now(), rng }); }
        catch (e) { fail(400, e.user ? e.message : 'Aksi gagal.'); }
        await this.saveGame(g);
        this.sendNotifs(g, notes);
        return { ver: g.ver };
      }
      case 'game.emote': {
        const g = await this.getGame(m.id); if (!g) return null;
        const emo = String(m.emoji || '').slice(0, 8);
        this.toWatchers(g, { t: 'emote', id: g.id, uid, emoji: emo });
        return null;
      }
      case 'game.nudge': {
        const g = await this.getGame(m.id); if (!g || g.status !== 'playing') fail(400, 'Game tidak berjalan.');
        const key = g.id, last = this.nudges.get(key) || 0;
        if (Date.now() - last < 60000) fail(429, 'Tunggu sebentar sebelum colek lagi.');
        this.nudges.set(key, Date.now());
        const who = E.waitingFor(g).filter(x => x !== uid);
        if (!who.length) fail(400, 'Tidak ada yang ditunggu.');
        await this.push(who, { title: `👋 ${me.name} mencolekmu`, body: `Giliranmu di ${g.name}! Yuk lanjut main.`, tag: 'nudge-' + g.id, url: './?game=' + g.id, kind: 'game' }, true);
        this.toUsers(who, { t: 'nudge', id: g.id, from: uid });
        return true;
      }
      case 'game.invite': {
        const g = await this.getGame(m.id); if (!g) fail(404, 'Room tidak ditemukan.');
        const inv = (m.uids || []).filter(x => this.users[x] && x !== uid);
        this.invitePush(g, me, inv);
        return true;
      }
      default: fail(400, 'Perintah tidak dikenal.');
    }
  }

  // ---------- Link preview (Open Graph) ----------
  async attachPreview(conv, seq, url) {
    const data = await this.unfurl(url);
    if (!data) return;
    const k = msgKey(conv, seq), msg = await this.ctx.storage.get(k);
    if (!msg || msg.del) return;
    msg.link = data;
    await this.ctx.storage.put(k, msg);
    const c = this.convs[conv]; if (!c) return;
    this.toUsers(this.members(c), { t: 'msgUpdate', conv, msg, meta: c });
  }
  async unfurl(url) {
    let u; try { u = new URL(url); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) return null;
    const key = 'uf:' + await sha256hex(u.href);
    const cached = await this.ctx.storage.get(key);
    if (cached && Date.now() - cached.at < 7 * 86400000) return cached.data;
    let data = null;
    try {
      const res = await fetch(u.href, { redirect: 'follow', signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NexoLinkPreview/1.0; +https://github.com)', Accept: 'text/html,application/xhtml+xml,image/*;q=0.8,*/*;q=0.5', 'Accept-Language': 'id,en;q=0.8' } });
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const final = res.url || u.href;
      const host = new URL(final).hostname.replace(/^www\./, '');
      if (res.ok && ct.startsWith('image/') && final.startsWith('https:')) { data = { url: u.href, image: final, title: '', site: host }; try { res.body && res.body.cancel(); } catch (e) {} }
      else if (res.ok && ct.includes('html')) {
        const meta = {}; let title = '';
        const rw = new HTMLRewriter()
          .on('meta', { element(e) { const k = (e.getAttribute('property') || e.getAttribute('name') || e.getAttribute('itemprop') || '').toLowerCase(); const v = e.getAttribute('content'); if (k && v && !(k in meta)) meta[k] = v; } })
          .on('title', { text(t) { if (title.length < 300) title += t.text; } });
        await rw.transform(new Response(res.body, { headers: { 'Content-Type': 'text/html' } })).arrayBuffer();
        const abs = x => { try { const r = new URL(decodeEntities(x), final).href; return r.startsWith('https:') ? r : null; } catch (e) { return null; } };
        const img = meta['og:image:secure_url'] || meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || meta['twitter:image:src'] || meta['image'] || '';
        data = {
          url: u.href,
          title: decodeEntities(meta['og:title'] || meta['twitter:title'] || title || '').replace(/\s+/g, ' ').trim().slice(0, 160),
          desc: decodeEntities(meta['og:description'] || meta['twitter:description'] || meta['description'] || '').replace(/\s+/g, ' ').trim().slice(0, 240),
          image: img ? abs(img) : null,
          site: decodeEntities(meta['og:site_name'] || '').slice(0, 60) || host
        };
        if (!data.title && !data.image) data = null;
      } else { try { res.body && res.body.cancel(); } catch (e) {} }
    } catch (e) { data = null; }
    await this.ctx.storage.put(key, { at: Date.now(), data });
    return data;
  }

  async activeStories() {
    const now = Date.now();
    const list = ((await this.ctx.storage.get('stories')) || []).filter(x => now - x.ts < 24 * 3600000);
    return list;
  }

  // ---------- Chat helpers ----------
  conv(uid, id, create) {
    id = String(id || '');
    if (id === 'group') return this.convs.group;
    const parts = id.split(':');
    if (parts[0] !== 'dm' || parts.length !== 3 || !parts.includes(uid)) fail(403, 'Chat tidak valid.');
    const other = parts[1] === uid ? parts[2] : parts[1];
    if (!this.users[other]) fail(404, 'Teman tidak ditemukan.');
    const norm = dmId(uid, other);
    if (!this.convs[norm] && create) this.convs[norm] = { id: norm, seq: 0, last: null, reads: {} };
    return this.convs[norm] || null;
  }
  members(c) { return c.id === 'group' ? Object.keys(this.users) : c.id.split(':').slice(1); }
  async systemMsg(text) {
    const c = this.convs.group; c.seq++;
    const msg = { seq: c.seq, from: 'sys', text, ts: Date.now(), react: {}, sys: true };
    await this.ctx.storage.put(msgKey('group', c.seq), msg);
    c.last = { seq: c.seq, from: 'sys', text, ts: msg.ts };
    await this.saveConvs();
    this.broadcast({ t: 'msg', conv: 'group', msg, meta: c });
  }

  // ---------- Game helpers ----------
  async getGame(id) {
    id = String(id || '');
    if (this.games.has(id)) return this.games.get(id);
    const g = await this.ctx.storage.get('g:' + id);
    if (g) this.games.set(id, g);
    return g || null;
  }
  addBot(g) {
    const used = new Set(g.players.map(p => String(p.name).replace(' 🤖', '')));
    const name = E.BOT_NAMES.find(n => !used.has(n)) || 'Bot ' + (g.players.length + 1);
    E.addPlayer(g, 'bot_' + randId(6), name + ' 🤖');
  }
  pubGame(g) {
    const out = Object.assign({}, g);
    delete out.decks; delete out.deck; delete out._notify; delete out._now;
    return out;
  }
  indexEntry(g) {
    return { id: g.id, name: g.name, mode: g.mode, status: g.status, host: g.host, players: g.players.map(p => p.id), max: g.settings.maxPlayers,
      waiting: E.waitingFor(g), phase: g.phase, botAt: g.status === 'playing' && E.waitingFor(g).some(x => String(x).startsWith('bot_')) ? Date.now() + 1600 : null, updatedAt: g.updatedAt, createdAt: g.createdAt, deadline: g.deadline, winner: g.winner, alive: g.players.filter(p => !p.bankrupt).map(p => p.id) };
  }
  toWatchers(g, obj) {
    const ids = new Set(g.players.map(p => p.id));
    const s = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) { const a = ws.deserializeAttachment(); if (a && (a.watch === g.id || ids.has(a.uid))) try { ws.send(s); } catch (e) {} }
  }
  async saveGame(g) {
    const wasEnded = this.gindex[g.id] && this.gindex[g.id].status === 'ended';
    g.updatedAt = Date.now();
    this.games.set(g.id, g);
    await this.ctx.storage.put('g:' + g.id, g);
    this.gindex[g.id] = this.indexEntry(g);
    if (g.status === 'ended' && !wasEnded && g.startedAt) {
      for (const p of g.players) { const u = this.users[p.id]; if (!u) continue; u.stats = u.stats || { played: 0, wins: 0 }; u.stats.played++; if (g.winner === p.id) u.stats.wins++; }
      await this.saveUsers();
      this.broadcast({ t: 'users', users: Object.values(this.users).map(u => this.pubUser(u)) });
      const w = this.users[g.winner];
      if (w) this.systemMsg(`🏆 ${w.name} memenangkan ${g.name}!`);
      await this.pruneGames();
    }
    await this.saveIndex();
    this.toWatchers(g, { t: 'game', game: this.pubGame(g) });
    this.broadcast({ t: 'gindex', entry: this.gindex[g.id] });
    await this.scheduleAlarm();
  }
  async deleteGame(id) {
    delete this.gindex[id]; this.games.delete(id);
    await this.ctx.storage.delete('g:' + id);
    await this.saveIndex();
    this.broadcast({ t: 'gindex', remove: id });
  }
  async pruneGames() {
    const ended = Object.values(this.gindex).filter(g => g.status === 'ended').sort((a, b) => b.updatedAt - a.updatedAt);
    for (const g of ended.slice(40)) await this.deleteGame(g.id);
  }
  invitePush(g, me, uids) {
    this.toUsers(uids, { t: 'invite', id: g.id, from: me.id, name: g.name });
    this.push(uids, { title: `🎲 ${me.name} mengajakmu main`, body: `Gabung ke room "${g.name}" (${g.mode === 'live' ? 'Live' : 'Santai'}).`, tag: 'invite-' + g.id, url: './?game=' + g.id, kind: 'game' }, true);
  }
  sendNotifs(g, notes) {
    if (!notes || !notes.length) return;
    const by = {};
    for (const n of notes) by[n.to] = n; // satu notifikasi terakhir per orang
    for (const n of Object.values(by)) this.push([n.to], { title: n.title, body: n.body, tag: n.tag || 'game-' + g.id, url: './?game=' + g.id, kind: 'game' }).catch(() => {});
  }
  async scheduleAlarm() {
    const ds = Object.values(this.gindex).filter(g => g.status === 'playing' && (g.deadline || g.botAt)).map(g => Math.min(g.deadline || Infinity, g.botAt || Infinity));
    if (!ds.length) return;
    const next = Math.max(Date.now() + 500, Math.min(...ds));
    const cur = await this.ctx.storage.getAlarm();
    if (!cur || cur > next || cur < Date.now() - 5000) await this.ctx.storage.setAlarm(next);
  }
  async runBot(id, now) {
    const g0 = await this.getGame(id); if (!g0 || g0.engine !== E.ENGINE || g0.status !== 'playing') return;
    const bot = E.waitingFor(g0).find(x => String(x).startsWith('bot_'));
    if (!bot) { this.gindex[id].botAt = null; await this.saveIndex(); return; }
    const g = structuredClone(g0);
    try {
      const a = E.botAction(g, bot, rng);
      if (!a) throw new Error('no action');
      const notes = E.act(g, bot, a, { now, rng });
      await this.saveGame(g); this.sendNotifs(g, notes);
    } catch (e) {
      console.warn('bot', id, e && e.message);
      const g2 = structuredClone(g0);
      try { E.act(g2, bot, { type: 'resign' }, { now, rng }); await this.saveGame(g2); } catch (er) { this.gindex[id].botAt = null; await this.saveIndex(); }
    }
  }
  async alarm() {
    const now = Date.now();
    for (const gi of Object.values(this.gindex)) {
      if (gi.status === 'playing' && gi.botAt && gi.botAt <= now) { await this.runBot(gi.id, now); continue; }
      if (gi.status !== 'playing' || !gi.deadline || gi.deadline > now) continue;
      const g0 = await this.getGame(gi.id); if (!g0) continue;
      const g = structuredClone(g0);
      try {
        const notes = E.timeout(g, { now, rng });
        if (notes) { await this.saveGame(g); this.sendNotifs(g, notes); }
        else if (g0.deadline && g0.deadline <= now) { g0.deadline = null; await this.saveGame(g0); }
      } catch (e) { console.error('timeout', gi.id, e && e.stack || e); g0.deadline = now + 30000; await this.saveGame(g0); }
    }
    await this.scheduleAlarm();
  }
}

function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|#39|nbsp);/gi, (m, e) => {
    const l = e.toLowerCase();
    if (l[0] === '#') { const n = l[1] === 'x' ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10); try { return String.fromCodePoint(n); } catch (er) { return m; } }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[l] || m;
  });
}
function postKey(seq) { return 'p:' + String(seq).padStart(9, '0'); }
function msgKey(conv, seq) { return `m:${conv}:${String(seq).padStart(9, '0')}`; }
function dmId(a, b) { return 'dm:' + [a, b].sort().join(':'); }
function bearer(request) { const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') || ''); return m ? m[1].trim() : null; }
async function readBody(request) { try { return await request.json(); } catch (e) { fail(400, 'Body harus JSON'); } }
function cleanAvatar(a) {
  if (!a || typeof a !== 'object') return null;
  if (a.photo && MEDIA_RE.test(a.photo)) return { photo: a.photo };
  const emoji = String(a.emoji || '').slice(0, 8);
  const color = /^#[0-9a-f]{6}$/i.test(a.color || '') ? a.color : EMOJI_COLORS[0];
  return emoji ? { emoji, color } : null;
}
