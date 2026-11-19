/* =========================================================
   11 · WEB PUSH — notifikasi saat website tertutup (butuh hosting Cloudflare)
   ========================================================= */
const PUSH_API = '/api';
const PUSH_SCHED_KEY = 'app_push_sched';
let pushConfig = null;
let pushSyncTimer = null;
let pushBusy = false;

function pushHostSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window &&
    (location.protocol === 'https:' || location.hostname === 'localhost') && !/blogspot\.|blogger\./i.test(location.hostname);
}
async function loadPushConfig() {
  if (pushConfig !== null) return pushConfig;
  if (!/^https?:$/.test(location.protocol) || /blogspot\.|blogger\./i.test(location.hostname)) return (pushConfig = false);
  try {
    const r = await fetch(PUSH_API + '/config', { cache: 'no-store' });
    pushConfig = r.ok && /json/.test(r.headers.get('content-type') || '') ? await r.json() : false;
  } catch (e) { pushConfig = false; }
  return pushConfig;
}
async function authFetch(path, opts = {}) {
  const user = firebaseAuth && firebaseAuth.currentUser;
  if (!user) throw new Error('Belum login ke Firebase');
  const token = await user.getIdToken();
  const res = await fetch(PUSH_API + path, Object.assign({}, opts, {
    headers: Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, opts.headers || {})
  }));
  if (!res.ok) {
    let msg = res.status + '';
    try { msg = (await res.json()).error || msg; } catch (e) {}
    throw new Error(msg);
  }
  return res.json();
}
function urlB64ToUint8Array(b64) {
  const s = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s); const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Perangkat';
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return `${os}${br ? ' · ' + br : ''}`;
}
async function getPushSubscription() {
  if (!swRegistration || !swRegistration.pushManager) return null;
  try { return await swRegistration.pushManager.getSubscription(); } catch (e) { return null; }
}

async function initPush() {
  const cfg = await loadPushConfig();
  updatePushUI();
  if (!cfg || !cfg.pushReady) return;
  // Perbarui langganan di server (bisa saja dihapus karena kadaluarsa)
  const sub = await getPushSubscription();
  if (sub) authFetch('/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON(), label: deviceLabel() }) }).catch(() => {});
  syncPushSchedule(true);
  pullServerInbox();
}

async function updatePushUI() {
  const row = $('pushRow'), testRow = $('pushTestRow'), lbl = $('pushStatusLabel'), btn = $('pushToggleBtn');
  if (!row) return;
  const cfg = pushConfig;
  row.classList.remove('hidden');
  if (!cfg) {
    lbl.textContent = /blogspot/i.test(location.hostname) ? 'Tidak tersedia di Blogspot — pakai versi Cloudflare' : 'Server push tidak terhubung';
    btn.classList.add('hidden'); testRow.classList.add('hidden'); return;
  }
  if (!cfg.pushReady) {
    lbl.textContent = 'Server belum dikonfigurasi: ' + (cfg.missing || []).join(', ');
    btn.classList.add('hidden'); testRow.classList.add('hidden'); return;
  }
  if (!pushHostSupported()) {
    lbl.textContent = /iphone|ipad/i.test(navigator.userAgent) ? 'iPhone: Tambah ke Layar Utama, lalu buka dari ikon' : 'Browser tidak mendukung Web Push';
    btn.classList.add('hidden'); testRow.classList.add('hidden'); return;
  }
  const sub = await getPushSubscription();
  btn.classList.remove('hidden');
  btn.textContent = sub ? 'Matikan' : 'Aktifkan';
  btn.className = sub ? 'btn btn-danger-tinted btn-xs' : 'btn btn-tinted btn-xs';
  lbl.textContent = sub ? `Aktif di perangkat ini (${deviceLabel()})` : 'Nonaktif di perangkat ini';
  testRow.classList.toggle('hidden', !sub);
}

async function togglePush() {
  if (pushBusy) return;
  pushBusy = true;
  try {
    const sub = await getPushSubscription();
    if (sub) {
      await authFetch('/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
      await sub.unsubscribe();
      showToast('Push dimatikan di perangkat ini.');
    } else {
      if (Notification.permission !== 'granted') {
        const p = await Notification.requestPermission();
        updateNotifPermissionUI();
        if (p !== 'granted') throw new Error('Izin notifikasi tidak diberikan');
      }
      if (!swRegistration) swRegistration = await navigator.serviceWorker.register('sw.js');
      await navigator.serviceWorker.ready;
      if (!pushConfig.vapidPublicKey) pushConfig.vapidPublicKey = (await authFetch('/setup-vapid', { method: 'POST', body: '{}' })).vapidPublicKey;
      const newSub = await swRegistration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(pushConfig.vapidPublicKey) });
      await authFetch('/subscribe', { method: 'POST', body: JSON.stringify({ subscription: newSub.toJSON(), label: deviceLabel() }) });
      await syncPushSchedule(true, true);
      showToast('Push aktif! Pengingat tetap masuk walau website ditutup.');
    }
  } catch (e) {
    showToast('Gagal: ' + (e.message || e), false);
  } finally {
    pushBusy = false;
    updatePushUI();
  }
}

async function sendTestPush() {
  try {
    const r = await authFetch('/test-push', { method: 'POST', body: '{}' });
    const ok = (r.results || []).filter(x => x.status >= 200 && x.status < 300).length;
    showToast(ok ? `Push tes dikirim ke ${ok} perangkat. Tutup website untuk mencoba.` : 'Push tes gagal terkirim (cek perangkat).', !!ok);
  } catch (e) { showToast('Gagal: ' + e.message, false); }
}

function hashString(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h >>> 0); }

/** Kirim jadwal pengingat ke server (dibatasi: hanya jika berubah, atau tiap 6 jam). */
function syncPushSchedule(force, immediate) {
  clearTimeout(pushSyncTimer);
  const run = async () => {
    if (!pushConfig || !pushConfig.pushReady || !firebaseAuth || !firebaseAuth.currentUser) return;
    const events = buildReminderEvents(Date.now()).map(e => ({ key: e.key, at: e.at, until: e.until, title: e.title, body: e.body, icon: e.icon, color: e.color, action: e.action || null }));
    const h = hashString(JSON.stringify(events));
    const last = readLS(PUSH_SCHED_KEY, {});
    if (!force && last.h === h && Date.now() - (last.t || 0) < 6 * 3600000) return;
    try {
      await authFetch('/schedule', { method: 'POST', body: JSON.stringify({ events }) });
      writeLS(PUSH_SCHED_KEY, { h, t: Date.now() });
    } catch (e) { console.warn('schedule sync failed', e); }
  };
  if (immediate) return run();
  pushSyncTimer = setTimeout(run, force ? 1500 : 5000);
}

/** Notifikasi yang dikirim server (saat website tertutup) dimasukkan ke inbox & ditandai sudah terkirim. */
function mergeServerNotifications(items, live) {
  if (!items || !items.length) return;
  const fired = readLS(NOTIF_FIRED_KEY, {});
  let inbox = getInbox(); let added = 0;
  items.forEach(i => {
    if (!i.key || /^test_/.test(i.key) && !live) return;
    if (fired[i.key]) return;
    if (inbox.some(n => n.srvId === i.id)) return;
    fired[i.key] = fired[i.key] || i.ts || Date.now();
    inbox.unshift({ id: 'n_' + (i.ts || Date.now()) + Math.random().toString(36).slice(2, 6), srvId: i.id, title: i.title, body: i.body || '', icon: i.icon || 'fa-bell', color: i.color || 'bg-red', ts: i.ts || Date.now(), read: false, action: i.action || null });
    added++;
  });
  if (!added) return;
  writeLS(NOTIF_FIRED_KEY, fired);
  inbox.sort((a, b) => b.ts - a.ts);
  setInbox(inbox);
}
async function pullServerInbox() {
  if (!pushConfig || !pushConfig.pushReady) return;
  try { const r = await authFetch('/inbox'); mergeServerNotifications(r.items || [], false); } catch (e) {}
}

// Deep link dari klik notifikasi: ?go=tab:sub:filter
function handleDeepLink() {
  try {
    const params = new URLSearchParams(location.search);
    const go = params.get('go'); if (!go) return;
    const [tab, sub, filter] = go.split(':');
    history.replaceState(null, '', location.pathname);
    if (tab && $(tab)) runNotifAction({ tab, sub: sub || null, filter: filter || null });
  } catch (e) {}
}
