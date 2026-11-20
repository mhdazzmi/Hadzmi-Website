/* =========================================================
   04 · MUSIC — engine, library, queue, lyrics (LRC), full player
   ========================================================= */
let audioEngine = new Audio();
audioEngine.preload = "auto";
let nextSongPreloader = new Audio();
nextSongPreloader.preload = "auto";
let preloadedSongUrl = "";

let currentSongIndex = -1;
let currentSongRefId = null;
let isMusicPlaying = false;
let isMusicShuffle = false;
let isMusicRepeat = false;
let activeMusicCategory = 'All';
let musicSleepTimerTimeout = null;
let sleepTimerEndAt = null;
let sleepAtEndOfTrack = false;
let sleepTickTimer = null;
let musicEditMode = false;
let isLyricsEditing = false;
let musicQueue = [];
let pendingResumeTime = 0;
let lastPosSave = 0;
let fullPlayerPanel = 'art';
let lrcCache = { id: null, src: null, lines: null };

const FAV_CAT = '__fav', RECENT_CAT = '__recent', OFFLINE_CAT = '__offline';

function currentSong() { return appState.musicLibrary[currentSongIndex] || null; }
function currentSongId() { const s = currentSong(); return s ? s.id : null; }
function getRecentIds() { return readLS('app_music_recent', []); }
function pushRecent(id) {
  const list = getRecentIds().filter(x => x !== id); list.unshift(id); writeLS('app_music_recent', list.slice(0, 25));
}
function resyncCurrentSongIndex() {
  if (!currentSongRefId) return;
  const idx = appState.musicLibrary.findIndex(s => s.id === currentSongRefId);
  currentSongIndex = idx;
  if (idx === -1) currentSongRefId = null;
  musicQueue = musicQueue.filter(id => appState.musicLibrary.some(s => s.id === id));
}
// ---------- Sumber audio & cover (R2/Drive bertanda tangan, offline, atau direct link) ----------
const OFFLINE_CACHE = 'hz-offline-music';
const offlineUrls = new Map();
function offlineIndex() { return readLS('app_music_offline', {}); }
function isSongOffline(id) { return !!offlineIndex()[id]; }
function offlineTotalBytes() { const idx = offlineIndex(); return Object.keys(idx).reduce((n, k) => n + (idx[k].bytes || 0), 0); }
function songCoverUrl(song) {
  if (!song) return '';
  if (offlineUrls.has(song.id + ':cover')) return offlineUrls.get(song.id + ':cover');
  if (song.coverId) return signedUrlSync(song.coverId) || '';
  return (song.cover || '').trim();
}
function songAudioUrlSync(song) {
  if (!song) return '';
  if (offlineUrls.has(song.id)) return offlineUrls.get(song.id);
  if (song.fileId) return signedUrlSync(song.fileId) || '';
  return song.url || '';
}
let preparingUrls = null;
function prepareSongUrls() {
  if (preparingUrls) return preparingUrls;
  preparingUrls = (async () => {
    try {
      const lib = appState.musicLibrary || [];
      if (typeof signIds === 'function' && firebaseAuth && firebaseAuth.currentUser && pushConfig) {
        await signIds(lib.flatMap(m => [m.fileId, m.coverId]).filter(Boolean));
      }
      const idx = offlineIndex();
      if ('caches' in window && Object.keys(idx).length) {
        const cache = await caches.open(OFFLINE_CACHE);
        for (const id of Object.keys(idx)) {
          if (!offlineUrls.has(id)) { const r = await cache.match('/offline-song/' + id); if (r) offlineUrls.set(id, URL.createObjectURL(await r.blob())); }
          if (!offlineUrls.has(id + ':cover')) { const c = await cache.match('/offline-cover/' + id); if (c) offlineUrls.set(id + ':cover', URL.createObjectURL(await c.blob())); }
        }
      }
    } catch (e) { console.warn('prepareSongUrls', e); }
    preparingUrls = null;
    renderMusicSongsList(); updateCurrentSongDisplayUI();
  })();
  return preparingUrls;
}
async function fetchSongBlob(song) {
  if (song.fileId) {
    const token = await getIdTokenOrThrow();
    const r = await fetch('/api/files/' + song.fileId, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('Gagal mengunduh lagu (' + r.status + ')');
    return r.blob();
  }
  try { const r = await fetch(song.url, { mode: 'cors' }); if (r.ok) return await r.blob(); } catch (e) {}
  const token = await getIdTokenOrThrow();
  const r = await fetch('/api/proxy?url=' + encodeURIComponent(song.url), { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('Sumber lagu menolak diunduh (' + r.status + ')');
  return r.blob();
}
async function saveSongOffline(id) {
  const song = appState.musicLibrary.find(s => s.id === id); if (!song) return;
  if (!('caches' in window)) return showToast('Browser ini tidak mendukung penyimpanan offline.', false);
  try {
    showToast(`Mengunduh "${song.title}" untuk offline…`);
    const blob = await fetchSongBlob(song);
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.put('/offline-song/' + id, new Response(blob, { headers: { 'Content-Type': blob.type || 'audio/mpeg' } }));
    let coverBytes = 0;
    try {
      const cu = song.coverId ? await signedUrl(song.coverId) : song.cover;
      if (cu) { const cr = await fetch(cu, { mode: 'cors' }); if (cr.ok) { const cb = await cr.blob(); coverBytes = cb.size; await cache.put('/offline-cover/' + id, new Response(cb, { headers: { 'Content-Type': cb.type || 'image/jpeg' } })); offlineUrls.set(id + ':cover', URL.createObjectURL(cb)); } }
    } catch (e) {}
    offlineUrls.set(id, URL.createObjectURL(blob));
    const idx = offlineIndex(); idx[id] = { bytes: blob.size + coverBytes, at: Date.now() }; writeLS('app_music_offline', idx);
    renderMusicSongsList(); renderStoragePanel();
    showToast(`"${song.title}" tersedia offline (${formatBytes(blob.size)})`);
  } catch (err) { showToast('Gagal simpan offline: ' + err.message, false); }
}
async function removeSongOffline(id, silent) {
  try { const cache = await caches.open(OFFLINE_CACHE); await cache.delete('/offline-song/' + id); await cache.delete('/offline-cover/' + id); } catch (e) {}
  [id, id + ':cover'].forEach(k => { if (offlineUrls.has(k)) { URL.revokeObjectURL(offlineUrls.get(k)); offlineUrls.delete(k); } });
  const idx = offlineIndex(); delete idx[id]; writeLS('app_music_offline', idx);
  if (!silent) { renderMusicSongsList(); renderStoragePanel(); showToast('Versi offline dihapus dari perangkat.'); }
}
async function clearAllOfflineSongs() {
  const ids = Object.keys(offlineIndex()); if (!ids.length) return;
  if (!(await iosConfirm('Hapus semua lagu offline?', `${ids.length} lagu (${formatBytes(offlineTotalBytes())}) akan dihapus dari perangkat ini. Lagu tetap ada di library.`, 'Hapus', true))) return;
  for (const id of ids) await removeSongOffline(id, true);
  try { await caches.delete(OFFLINE_CACHE); } catch (e) {}
  renderMusicSongsList(); renderStoragePanel(); showToast('Semua lagu offline dihapus.');
}

function songThumbHTML(song, opts = {}) {
  const coverU = songCoverUrl(song);
  const hasCover = !!coverU;
  const eq = opts.eq ? `<span class="eq ${opts.paused ? 'paused' : ''}"><i></i><i></i><i></i></span>` : '';
  return `<div class="thumb ${opts.eq ? 'has-eq' : ''}" style="background:${hasCover ? '#ddd' : `linear-gradient(135deg, ${colorFor(song ? song.title : '')}, #AF52DE)`}">${hasCover ? `<img src="${esc(coverU)}" alt="" loading="lazy" onerror="this.remove()">` : '<i class="fas fa-music"></i>'}${eq}</div>`;
}

// ---------- ENGINE ----------
function initAudioEngine() {
  audioEngine.addEventListener('loadedmetadata', updateAudioDurationUI);
  audioEngine.addEventListener('durationchange', updateAudioDurationUI);
  audioEngine.addEventListener('play', () => { isMusicPlaying = true; updateMusicPlayerUI(); updateMediaSessionLockscreen(); });
  audioEngine.addEventListener('pause', () => { isMusicPlaying = false; updateMusicPlayerUI(); document.title = defaultDocTitle; saveLastPosition(true); });
  audioEngine.addEventListener('timeupdate', () => {
    const cur = audioEngine.currentTime || 0;
    const dur = audioEngine.duration || 0;
    const max = isFinite(dur) && dur > 0 ? Math.floor(dur) : 100;
    const pct = isFinite(dur) && dur > 0 ? (cur / dur) * 100 : 0;
    ['audioSeekBar', 'fpSeek'].forEach(id => {
      const bar = $(id); if (!bar) return;
      bar.max = max; bar.value = Math.floor(cur); bar.style.setProperty('--p', pct + '%');
    });
    const t = formatAudioTime(cur);
    if ($('audioCurrentTime')) $('audioCurrentTime').textContent = t;
    if ($('fpCur')) $('fpCur').textContent = t;
    if (isFinite(dur) && dur > 0) {
      const d = formatAudioTime(dur);
      if ($('audioDuration')) $('audioDuration').textContent = d;
      if ($('fpDur')) $('fpDur').textContent = d;
    }
    const prog = $('dockProgress'); if (prog) prog.style.width = pct + '%';
    if (dur > 0 && ((cur / dur) >= 0.40)) triggerNextTrackPreload();
    highlightLrc(cur);
    saveLastPosition(false);
  });

  audioEngine.addEventListener('ended', () => {
    ['audioSeekBar', 'fpSeek'].forEach(id => { const b = $(id); if (b) { b.value = 0; b.style.setProperty('--p', '0%'); } });
    if ($('audioCurrentTime')) $('audioCurrentTime').textContent = "00:00";

    if (sleepAtEndOfTrack) {
      sleepAtEndOfTrack = false; clearSleepTimerUI();
      isMusicPlaying = false; updateMusicPlayerUI();
      showToast('Sleep Timer: musik berhenti di akhir lagu.');
      if (typeof pushNotification === 'function') pushNotification({ key: 'sleep_' + Date.now(), title: 'Sleep Timer', body: 'Musik dihentikan di akhir lagu. Selamat tidur 🌙', icon: 'fa-moon', color: 'bg-indigo', pref: 'focus' });
      return;
    }
    if (isMusicRepeat) {
      audioEngine.currentTime = 0;
      audioEngine.play().catch(err => console.log('Repeat autoplay blocked:', err));
    } else if (musicQueue.length > 0) {
      const nextSongId = musicQueue.shift();
      const nextIdx = appState.musicLibrary.findIndex(s => s.id === nextSongId);
      if (nextIdx !== -1) { currentSongIndex = nextIdx; loadAndPlaySong(); }
      else playNextSong();
      renderQueueListUI();
    } else {
      playNextSong();
    }
  });

  audioEngine.addEventListener('error', () => {
    if (!audioEngine.getAttribute('src')) return;
    const statusEl = $('musicPlayerStatus');
    if (statusEl) { statusEl.textContent = 'Audio Error'; statusEl.className = 'badge tint-red'; }
    isMusicPlaying = false;
    updateMusicPlayerUI();
    showToast('Gagal memutar audio. Pastikan direct link valid.', false);
  });

  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    const set = (a, fn) => { try { ms.setActionHandler(a, fn); } catch (e) {} };
    set('play', () => togglePlayMusic());
    set('pause', () => togglePlayMusic());
    set('previoustrack', () => playPrevSong());
    set('nexttrack', () => playNextSong());
    set('seekto', d => { if (d && typeof d.seekTime === 'number') audioEngine.currentTime = d.seekTime; });
    set('seekbackward', d => { audioEngine.currentTime = Math.max(0, audioEngine.currentTime - ((d && d.seekOffset) || 10)); });
    set('seekforward', d => { audioEngine.currentTime = Math.min(audioEngine.duration || 0, audioEngine.currentTime + ((d && d.seekOffset) || 10)); });
  }

  // Lanjutkan lagu terakhir (tanpa autoplay)
  const last = readLS('app_music_last', null);
  if (last && last.id) {
    const idx = appState.musicLibrary.findIndex(s => s.id === last.id);
    if (idx !== -1) { currentSongIndex = idx; currentSongRefId = last.id; pendingResumeTime = last.time || 0; }
  }
  const vol = parseFloat(readLS('app_music_volume', 0.8));
  if (!isNaN(vol)) { audioEngine.volume = vol; ['audioVolumeBar', 'fpVolume'].forEach(id => { if ($(id)) $(id).value = vol; }); }
  updateCurrentSongDisplayUI();
  updateMusicPlayerUI();

  document.addEventListener('keydown', e => {
    if (e.code !== 'Space' || /input|textarea|select/i.test((e.target.tagName || '')) || e.target.isContentEditable) return;
    if (currentTabId === 'tab-music' || $('fullPlayer').classList.contains('open')) { e.preventDefault(); togglePlayMusic(); }
  });
}

function saveLastPosition(force) {
  const s = currentSong(); if (!s) return;
  const now = Date.now();
  if (!force && now - lastPosSave < 5000) return;
  lastPosSave = now;
  writeLS('app_music_last', { id: s.id, time: Math.floor(audioEngine.currentTime || 0) });
}

function updateMediaSessionLockscreen() {
  const song = currentSong();
  if (song) {
    const titleText = song.title || 'Unknown Track';
    const artistText = song.artist || song.category || 'Music Library';
    const cu = songCoverUrl(song);
    const coverArt = cu && !/^blob:/.test(cu) ? new URL(cu, location.href).href : new URL('icons/icon-512.png?v=4', location.href).href;
    document.title = `${titleText} - ${artistText}`;
    if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: titleText, artist: artistText, album: song.category || 'Nexa Music',
        artwork: ['96x96', '128x128', '192x192', '256x256', '384x384', '512x512'].map(sz => ({ src: coverArt, sizes: sz, type: 'image/jpeg' }))
      });
      try {
        if (isFinite(audioEngine.duration) && audioEngine.duration > 0 && navigator.mediaSession.setPositionState) {
          navigator.mediaSession.setPositionState({ duration: audioEngine.duration, playbackRate: audioEngine.playbackRate, position: Math.min(audioEngine.currentTime, audioEngine.duration) });
        }
      } catch (e) {}
    }
  } else {
    document.title = defaultDocTitle;
  }
}

function updateAudioDurationUI() {
  const dur = audioEngine.duration || 0;
  if (isFinite(dur) && dur > 0) {
    if ($('audioDuration')) $('audioDuration').textContent = formatAudioTime(dur);
    if ($('fpDur')) $('fpDur').textContent = formatAudioTime(dur);
  }
}

function formatAudioTime(sec) {
  if (!isFinite(sec) || isNaN(sec)) return "00:00";
  const m = Math.floor(sec / 60) || 0;
  const s = Math.floor(sec % 60) || 0;
  return `${pad2(m)}:${pad2(s)}`;
}

// ---------- RENDER ----------
function renderMusicModule() {
  if ((appState.musicLibrary || []).some(m => (m.fileId && !signedUrlSync(m.fileId)) || (m.coverId && !signedUrlSync(m.coverId))) || (Object.keys(offlineIndex()).some(id => !offlineUrls.has(id)))) prepareSongUrls();
  renderMusicCategories();
  renderMusicSongsList();
  populateMusicCategorySelect();
  renderQueueListUI();
}

function toggleMusicCustomizeMode() {
  musicEditMode = !musicEditMode;
  const btn = $('btnMusicCustomize');
  if (btn) { btn.textContent = musicEditMode ? 'Selesai' : 'Edit'; btn.className = musicEditMode ? 'btn btn-filled btn-sm' : 'btn btn-gray btn-sm'; }
  renderMusicSongsList();
  updateCurrentSongDisplayUI();
  showToast(musicEditMode ? 'Music Customize Mode active.' : 'Music Customize Mode disabled.');
}

function setCoverInto(imgEl, fallbackEl, song) {
  const coverU = songCoverUrl(song);
  const hasCover = !!coverU;
  if (imgEl) {
    if (hasCover) { if (imgEl.getAttribute('src') !== coverU) imgEl.src = coverU; imgEl.classList.remove('hidden'); }
    else { imgEl.classList.add('hidden'); imgEl.removeAttribute('src'); }
  }
  if (fallbackEl) fallbackEl.classList.toggle('hidden', !!hasCover);
  return hasCover;
}

function updateCurrentSongDisplayUI() {
  const song = currentSong();
  const playing = isMusicPlaying;
  const title = song ? song.title : 'No track playing';
  const artist = song ? (song.artist || song.category) : 'Select a track from the library';

  if ($('currentSongTitle')) $('currentSongTitle').textContent = title;
  if ($('currentSongArtist')) $('currentSongArtist').textContent = artist;
  const coverBox = $('coverBoxContainer');
  const hasCover = setCoverInto($('currentSongCoverImg'), $('musicDiscAnim'), song);
  if (coverBox) {
    coverBox.classList.toggle('paused', !playing);
    coverBox.style.background = hasCover ? '#000' : '';
  }
  const disc = $('musicDiscAnim'); if (disc) disc.classList.toggle('spin', playing && !hasCover);

  // Dock
  if ($('dockSongTitle')) $('dockSongTitle').textContent = title;
  if ($('dockSongArtist')) $('dockSongArtist').textContent = song ? artist : 'Tap untuk membuka player';
  setCoverInto($('dockSongCoverImg'), $('dockSongIcon'), song);
  if ($('dockPlayPauseBtn')) $('dockPlayPauseBtn').innerHTML = playing ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';

  // Dashboard widget
  if ($('dashNpTitle')) $('dashNpTitle').textContent = song ? song.title : 'Tidak ada lagu';
  if ($('dashNpArtist')) $('dashNpArtist').textContent = song ? artist : 'Pilih lagu di Library';
  if ($('dashNpThumb')) {
    const th = $('dashNpThumb');
    const cu = songCoverUrl(song);
    th.innerHTML = cu ? `<img src="${esc(cu)}" alt="" onerror="this.remove()">` : '<i class="fas fa-music"></i>';
    th.style.background = cu ? '#ddd' : '';
  }
  if ($('dashNpPlay')) $('dashNpPlay').innerHTML = playing ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';

  // Full player
  if ($('fpTitle')) $('fpTitle').textContent = title;
  if ($('fpArtist')) $('fpArtist').textContent = song ? artist : '—';
  if ($('fpCategory')) $('fpCategory').textContent = song ? (song.category || 'Library') : 'Library';
  setCoverInto($('fpCover'), $('fpGlyph'), song);
  const fpArt = $('fpArtwork'); if (fpArt) fpArt.classList.toggle('paused', !playing);
  const bg = $('fpBg');
  if (bg) {
    const cu = songCoverUrl(song);
    if (cu) { bg.classList.remove('fallback'); bg.style.backgroundImage = `url("${cu.replace(/"/g, '%22')}")`; }
    else { bg.classList.add('fallback'); bg.style.backgroundImage = ''; }
  }
  if ($('fpPlay')) $('fpPlay').innerHTML = playing ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';

  const fav = !!(song && song.favorite);
  ['npFavBtn', 'fpFavBtn'].forEach(id => { const b = $(id); if (b) b.innerHTML = fav ? '<i class="fas fa-heart" style="color:var(--pink)"></i>' : '<i class="far fa-heart"></i>'; });
}

function renderMusicCategories() {
  const pills = $('musicCategoryPills'); if (!pills) return;
  const cats = [['All', 'Semua'], [FAV_CAT, '♥ Favorit'], [OFFLINE_CAT, '⬇︎ Offline'], [RECENT_CAT, 'Terakhir Diputar'], ...(appState.musicCategories || []).map(c => [c, c])];
  pills.innerHTML = cats.map(([val, label]) => `<button class="chip ${activeMusicCategory === val ? 'active pink' : ''}" data-cat="${esc(val)}">${esc(label)}</button>`).join('');
  pills.querySelectorAll('button').forEach(b => b.onclick = () => filterMusicCategory(b.dataset.cat));
}

function filterMusicCategory(cat) {
  activeMusicCategory = cat;
  renderMusicCategories();
  renderMusicSongsList();
  updateCurrentSongDisplayUI();
}

function getFilteredSongs() {
  const search = ($('musicSearchInput') ? $('musicSearchInput').value : '').toLowerCase();
  const library = appState.musicLibrary || [];
  let list;
  if (activeMusicCategory === RECENT_CAT) list = getRecentIds().map(id => library.find(s => s.id === id)).filter(Boolean);
  else if (activeMusicCategory === OFFLINE_CAT) { const idx = offlineIndex(); list = library.filter(s => idx[s.id]); }
  else list = library.filter(s => activeMusicCategory === 'All' || (activeMusicCategory === FAV_CAT ? s.favorite : s.category === activeMusicCategory));
  list = list.filter(s => (s.title + ' ' + (s.artist || '')).toLowerCase().includes(search));
  const sort = $('musicSortSelect') ? $('musicSortSelect').value : 'default';
  if (sort === 'title') list = list.slice().sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  if (sort === 'artist') list = list.slice().sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
  return list;
}

function renderMusicSongsList() {
  const container = $('musicSongsContainer'); if (!container) return;
  const library = appState.musicLibrary || [];
  const filtered = getFilteredSongs();
  const countEl = $('musicLibraryCount');
  if (countEl) countEl.textContent = `${filtered.length} lagu${activeMusicCategory !== 'All' ? ' di tampilan ini' : ''} · total ${library.length}`;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty"><i class="fas fa-music"></i><div class="e-title">Tidak ada lagu</div><div class="e-sub">${activeMusicCategory === FAV_CAT ? 'Tap ♥ pada lagu untuk menambah favorit.' : 'Upload lagu baru dengan tombol + Lagu.'}</div></div>`;
    return;
  }
  const curId = currentSongId();
  container.innerHTML = filtered.map(song => {
    const isCur = curId === song.id;
    const qIdx = musicQueue.indexOf(song.id);
    return `
      <div class="row tappable song-row ${isCur ? 'playing' : ''}" onclick="playSongById('${esc(song.id)}')">
        ${songThumbHTML(song, { eq: isCur, paused: !isMusicPlaying })}
        <div class="flex-1">
          <div class="s-title truncate">${esc(song.title)}</div>
          <div class="row-sub truncate">${isSongOffline(song.id) ? '<i class="fas fa-circle-down c-green" style="font-size:10px" title="Tersedia offline"></i> ' : song.fileId ? '<i class="fas fa-cloud" style="font-size:10px; color:var(--label3)" title="Tersimpan di cloud"></i> ' : ''}${song.favorite ? '<i class="fas fa-heart c-pink" style="font-size:10px"></i> ' : ''}${esc(song.artist || 'Unknown Artist')} · ${esc(song.category || '')}${song.lyrics ? ' · <i class="fas fa-quote-left" style="font-size:9px"></i>' : ''}</div>
        </div>
        ${qIdx !== -1 ? `<span class="badge tint-orange">#${qIdx + 1}</span>` : ''}
        <div class="flex items-center gap-4" onclick="event.stopPropagation()">
          ${musicEditMode ? `
            <button type="button" onclick="editMusicSong('${esc(song.id)}')" class="icon-btn sm" title="Edit"><i class="fas fa-pen"></i></button>
            <button type="button" onclick="deleteMusicSong('${esc(song.id)}')" class="icon-btn sm red" title="Hapus"><i class="fas fa-trash"></i></button>
          ` : `<button type="button" onclick="addToNextQueue('${esc(song.id)}')" class="icon-btn sm clear" title="Tambah ke antrean" style="color:var(--pink)"><i class="fas fa-plus"></i></button>`}
          <button type="button" onclick="openSongActions('${esc(song.id)}')" class="icon-btn sm clear" style="color:var(--label2)" title="Lainnya"><i class="fas fa-ellipsis"></i></button>
        </div>
      </div>`;
  }).join('');
}

function playCurrentView(shuffle) {
  let list = getFilteredSongs().map(s => s.id);
  if (!list.length) return showToast('Tidak ada lagu di tampilan ini.', false);
  if (shuffle) { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } }
  const first = list.shift();
  musicQueue = list;
  currentSongIndex = appState.musicLibrary.findIndex(s => s.id === first);
  loadAndPlaySong();
  renderQueueListUI(); renderMusicSongsList();
  showToast(shuffle ? 'Memutar acak tampilan ini' : 'Memutar semua lagu di tampilan ini');
}

// ---------- QUEUE ----------
function addToNextQueue(id) {
  if (!musicQueue.includes(id)) {
    musicQueue.push(id);
    const song = appState.musicLibrary.find(s => s.id === id);
    renderMusicSongsList(); renderQueueListUI();
    showToast(`Added "${song ? song.title : 'song'}" to Next Queue!`);
  } else {
    showToast('Song is already in Next Queue!', false);
  }
}
function playNextInQueue(id) {
  musicQueue = musicQueue.filter(q => q !== id);
  musicQueue.unshift(id);
  renderMusicSongsList(); renderQueueListUI();
  showToast('Akan diputar berikutnya.');
}
function removeFromQueue(id) {
  musicQueue = musicQueue.filter(qId => qId !== id);
  renderMusicSongsList(); renderQueueListUI();
  showToast('Removed from queue.');
}
function moveQueueItem(index, dir) {
  const j = index + dir; if (j < 0 || j >= musicQueue.length) return;
  [musicQueue[index], musicQueue[j]] = [musicQueue[j], musicQueue[index]];
  renderQueueListUI(); renderMusicSongsList();
}
function clearAllNextQueue() {
  musicQueue = [];
  renderMusicSongsList(); renderQueueListUI();
  showToast('All next queue items cleared.');
}
function toggleQueueListPanel() { openQueueSheet(); }
function openQueueSheet() { renderQueueListUI(); openSheet('sheetQueue'); }

function queueRowsHTML(dark) {
  if (musicQueue.length === 0) return `<div class="empty" style="${dark ? 'color:rgba(255,255,255,.6)' : ''}"><i class="fas fa-list-ul"></i><div class="e-sub">Belum ada lagu dalam antrean.<br>Setelah antrean habis, library diputar berurutan.</div></div>`;
  return `<div class="list">${musicQueue.map((id, index) => {
    const song = appState.musicLibrary.find(s => s.id === id); if (!song) return '';
    return `<div class="row song-row">
      ${songThumbHTML(song)}
      <div class="flex-1"><div class="s-title truncate">${index + 1}. ${esc(song.title)}</div><div class="row-sub truncate" ${dark ? 'style="color:rgba(255,255,255,.6)"' : ''}>${esc(song.artist || 'Unknown')}</div></div>
      <button onclick="moveQueueItem(${index}, -1)" class="icon-btn sm clear" ${index === 0 ? 'disabled style="opacity:.3"' : ''}><i class="fas fa-chevron-up"></i></button>
      <button onclick="moveQueueItem(${index}, 1)" class="icon-btn sm clear" ${index === musicQueue.length - 1 ? 'disabled style="opacity:.3"' : ''}><i class="fas fa-chevron-down"></i></button>
      <button onclick="removeFromQueue('${esc(song.id)}')" class="icon-btn sm red"><i class="fas fa-minus"></i></button>
    </div>`;
  }).join('')}</div>`;
}
function renderQueueListUI() {
  const countLabel = $('nextQueueCountLabel'); if (countLabel) countLabel.textContent = musicQueue.length;
  const c = $('queueItemsContainer'); if (c) c.outerHTML = `<div id="queueItemsContainer">${queueRowsHTML(false)}</div>`;
  const f = $('fpQueueList'); if (f) f.innerHTML = queueRowsHTML(true);
}

// ---------- LYRICS (plain + LRC sync) ----------
function parseLrc(text) {
  if (!text) return null;
  const lines = []; let timed = 0;
  text.split(/\r?\n/).forEach(raw => {
    const tags = [...raw.matchAll(/\[(\d{1,2}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
    const content = raw.replace(/\[[^\]]*\]/g, '').trim();
    if (tags.length) { tags.forEach(t => { lines.push({ t: (+t[1]) * 60 + parseFloat(t[2].replace(':', '.')), text: content }); timed++; }); }
    else if (content && !/^\[/.test(raw)) lines.push({ t: null, text: content });
  });
  if (timed < 2) return null;
  return lines.filter(l => l.t !== null).sort((a, b) => a.t - b.t);
}
function getLrcLines(song) {
  if (!song) return null;
  if (lrcCache.id === song.id && lrcCache.src === song.lyrics) return lrcCache.lines;
  lrcCache = { id: song.id, src: song.lyrics, lines: parseLrc(song.lyrics || '') };
  return lrcCache.lines;
}
function lyricsHTML(song) {
  const lines = getLrcLines(song);
  if (lines) return lines.map((l, i) => `<span class="lrc-line" data-i="${i}" onclick="seekAudioTrack(${l.t})" style="cursor:pointer">${esc(l.text) || '♪'}</span>`).join('');
  return null;
}
function renderLyricsInto(el, song, emptyText) {
  if (!el) return;
  const html = lyricsHTML(song);
  if (html) { el.innerHTML = html; el.dataset.lrc = '1'; }
  else { el.dataset.lrc = ''; el.textContent = song && song.lyrics && song.lyrics.trim() !== '' ? song.lyrics : emptyText; }
  el.dataset.active = '-1';
}
let lastLrcIdx = -1;
function highlightLrc(cur) {
  const song = currentSong(); const lines = getLrcLines(song); if (!lines) return;
  let idx = -1; for (let i = 0; i < lines.length; i++) { if (lines[i].t <= cur + 0.25) idx = i; else break; }
  ['inlineLyricsContent', 'fpLyrics', 'lyricsReadOnlyContainer'].forEach(id => {
    const box = $(id); if (!box || box.dataset.lrc !== '1' || box.dataset.active === String(idx)) return;
    box.dataset.active = String(idx);
    box.querySelectorAll('.lrc-line').forEach((el, i) => { el.classList.toggle('active', i === idx); el.classList.toggle('past', i < idx); });
    const act = box.querySelector('.lrc-line.active');
    if (act && box.offsetParent !== null) {
      const top = box.scrollTop + (act.getBoundingClientRect().top - box.getBoundingClientRect().top) - (box.clientHeight - act.offsetHeight) / 2;
      box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    } else if (idx < 0) box.scrollTo({ top: 0 });
  });
  // Mini player & widget Home menampilkan baris yang sedang dinyanyikan
  const lineText = idx >= 0 && lines[idx] ? lines[idx].text : '';
  const dockA = $('dockSongArtist'), dashA = $('dashNpArtist');
  if (lineText && isMusicPlaying) { if (dockA) dockA.textContent = '♪ ' + lineText; if (dashA) dashA.textContent = '♪ ' + lineText; }
  else if (idx !== lastLrcIdx && song) { const art = song.artist || song.category || ''; if (dockA) dockA.textContent = art; if (dashA) dashA.textContent = art; }
  lastLrcIdx = idx;
}

function toggleInlineLyricsDisplay() {
  const panel = $('inlineLyricsPanel'); if (!panel) return;
  panel.classList.toggle('hidden');
  updateInlineLyricsContent();
}
function updateInlineLyricsContent() {
  renderLyricsInto($('inlineLyricsContent'), currentSong(), "Belum ada lirik untuk lagu ini. Klik 'Edit / Perbesar' untuk menyunting lirik.");
  if (fullPlayerPanel === 'lyrics') renderLyricsInto($('fpLyrics'), currentSong(), 'Belum ada lirik untuk lagu ini.');
  highlightLrc(audioEngine.currentTime || 0);
}

function openLyricsFullScreenModal() {
  const song = currentSong();
  if (!song) return showToast('Pilih lagu terlebih dahulu!', false);
  $('lyricsModalSongTitle').textContent = `${song.title} (${song.artist || song.category})`;
  $('lyricsTextInput').value = song.lyrics || '';
  renderLyricsInto($('lyricsReadOnlyContainer'), song, '(Belum ada lirik untuk lagu ini. Klik "Edit" untuk menambahkan lirik baru)');
  if ($('btnClearLyricSync')) $('btnClearLyricSync').classList.toggle('hidden', !getLrcLines(song));
  isLyricsEditing = false; applyLyricsModeUI();
  openSheet('musicLyricsModal');
  highlightLrc(audioEngine.currentTime || 0);
}
function closeLyricsFullScreenModal() { if (tapTimer) exitTapSync(); closeSheet('musicLyricsModal'); }
function toggleEditLyricsMode() { isLyricsEditing = !isLyricsEditing; applyLyricsModeUI(); }
function applyLyricsModeUI() {
  const read = $('lyricsReadOnlyContainer'), edit = $('lyricsEditContainer'), btnT = $('btnToggleEditLyrics'), btnS = $('btnSaveLyricsModal'), lock = $('lyricsLockStatusLabel');
  if (isLyricsEditing) {
    read.classList.add('hidden'); edit.classList.remove('hidden'); btnS.classList.remove('hidden');
    lock.className = 'badge tint-orange'; lock.innerHTML = '<i class="fas fa-pen"></i> Mode Edit Lirik';
    btnT.innerHTML = '<span>Kunci</span>';
  } else {
    read.classList.remove('hidden'); edit.classList.add('hidden'); btnS.classList.add('hidden');
    lock.className = 'badge tint-green'; lock.innerHTML = '<i class="fas fa-lock"></i> Mode Terkunci (Read-Only)';
    btnT.innerHTML = '<span>Edit</span>';
  }
}
function saveLyricsForCurrentSong() {
  const song = currentSong();
  if (!song) return showToast('Pilih lagu terlebih dahulu!', false);
  const inputVal = $('lyricsTextInput').value;
  song.lyrics = inputVal ? inputVal.trim() : '';
  saveStateToLocal();
  renderLyricsInto($('lyricsReadOnlyContainer'), song, '(Belum ada lirik untuk lagu ini)');
  isLyricsEditing = false; applyLyricsModeUI();
  updateInlineLyricsContent(); renderMusicSongsList();
  showToast(getLrcLines(song) ? 'Lirik tersinkron (LRC) disimpan & disinkronkan!' : 'Lirik lagu berhasil disimpan & disinkronkan!');
}

// ---------- PLAYBACK ----------
function playSongById(id) {
  const idx = appState.musicLibrary.findIndex(s => s.id === id);
  if (idx !== -1) {
    if (currentSongIndex === idx && audioEngine.getAttribute('src')) togglePlayMusic();
    else { currentSongIndex = idx; loadAndPlaySong(); }
  }
}

function getNextAnticipatedSong() {
  if (appState.musicLibrary.length === 0) return null;
  if (musicQueue.length > 0) {
    const queued = appState.musicLibrary.find(s => s.id === musicQueue[0]);
    if (queued) return queued;
  }
  if (isMusicShuffle) return null;
  const nextIndex = (currentSongIndex + 1) % appState.musicLibrary.length;
  return appState.musicLibrary[nextIndex] || null;
}

function triggerNextTrackPreload() {
  const nextSong = getNextAnticipatedSong();
  const nextUrl = songAudioUrlSync(nextSong);
  if (nextSong && nextUrl && !/^blob:/.test(nextUrl) && nextUrl !== preloadedSongUrl && nextUrl !== audioEngine.src) {
    preloadedSongUrl = nextUrl;
    nextSongPreloader.src = nextUrl;
  }
}

function loadAndPlaySong(resumeAt) {
  const song = currentSong();
  if (!song) return;
  currentSongRefId = song.id;
  pushRecent(song.id);
  updateCurrentSongDisplayUI();
  ['audioSeekBar', 'fpSeek'].forEach(id => { const b = $(id); if (b) { b.value = 0; b.style.setProperty('--p', '0%'); } });
  if ($('audioCurrentTime')) $('audioCurrentTime').textContent = "00:00";

  const src = songAudioUrlSync(song);
  if (!src) {
    showToast('Menyiapkan lagu… tap putar sekali lagi.');
    prepareSongUrls();
    return;
  }
  audioEngine.src = src;
  audioEngine.playbackRate = parseFloat(($('musicRateSelect') || {}).value || 1) || 1;
  preloadedSongUrl = "";
  if (resumeAt && resumeAt > 1) {
    audioEngine.addEventListener('loadedmetadata', () => { try { audioEngine.currentTime = resumeAt; } catch (e) {} }, { once: true });
  }
  updateMediaSessionLockscreen();
  updateInlineLyricsContent();
  saveLastPosition(true);

  const playPromise = audioEngine.play();
  if (playPromise !== undefined) {
    playPromise
      .then(() => { isMusicPlaying = true; updateMusicPlayerUI(); updateMediaSessionLockscreen(); })
      .catch(() => {
        audioEngine.addEventListener('canplay', () => {
          audioEngine.play()
            .then(() => { isMusicPlaying = true; updateMusicPlayerUI(); updateMediaSessionLockscreen(); })
            .catch(() => { isMusicPlaying = false; updateMusicPlayerUI(); });
        }, { once: true });
      });
  }
}

function togglePlayMusic() {
  if (currentSongIndex === -1 && appState.musicLibrary.length > 0) {
    currentSongIndex = 0; loadAndPlaySong(); return;
  }
  if (currentSongIndex >= 0 && !audioEngine.getAttribute('src')) {
    const t = pendingResumeTime; pendingResumeTime = 0; loadAndPlaySong(t); return;
  }
  if (isMusicPlaying) {
    audioEngine.pause(); isMusicPlaying = false; document.title = defaultDocTitle;
  } else {
    audioEngine.play().then(() => { isMusicPlaying = true; updateMediaSessionLockscreen(); }).catch(err => console.log(err));
  }
  updateMusicPlayerUI();
}

function playNextSong() {
  if (appState.musicLibrary.length === 0) return;
  if (musicQueue.length > 0) {
    const nextId = musicQueue.shift();
    const nextIdx = appState.musicLibrary.findIndex(s => s.id === nextId);
    if (nextIdx !== -1) { currentSongIndex = nextIdx; loadAndPlaySong(); renderQueueListUI(); return; }
  }
  if (isMusicShuffle) currentSongIndex = Math.floor(Math.random() * appState.musicLibrary.length);
  else currentSongIndex = (currentSongIndex + 1) % appState.musicLibrary.length;
  loadAndPlaySong();
}

function playPrevSong() {
  if (appState.musicLibrary.length === 0) return;
  if (audioEngine.currentTime > 4 && audioEngine.getAttribute('src')) { audioEngine.currentTime = 0; return; }
  currentSongIndex = (currentSongIndex - 1 + appState.musicLibrary.length) % appState.musicLibrary.length;
  loadAndPlaySong();
}

function updateMusicPlayerUI() {
  const playBtn = $('btnMusicPlayPause'), statusEl = $('musicPlayerStatus');
  updateCurrentSongDisplayUI();
  if (playBtn) playBtn.innerHTML = isMusicPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play" style="margin-left:4px"></i>';
  if (statusEl) {
    statusEl.textContent = isMusicPlaying ? 'Playing' : (currentSong() ? 'Paused' : 'Idle');
    statusEl.className = isMusicPlaying ? 'badge tint-green' : (currentSong() ? 'badge tint-orange' : 'badge tint-gray');
  }
  updateInlineLyricsContent();
  renderMusicSongsList();
}

function seekAudioTrack(val) { try { audioEngine.currentTime = +val; } catch (e) {} }
function changeAudioVolume(val) {
  audioEngine.volume = val; writeLS('app_music_volume', parseFloat(val));
  ['audioVolumeBar', 'fpVolume'].forEach(id => { if ($(id) && $(id).value != val) $(id).value = val; });
}
function setPlaybackRate(v) { audioEngine.playbackRate = parseFloat(v) || 1; showToast(`Kecepatan ${v}×`); }
function paintToggle(ids, on) { ids.forEach(id => { const b = $(id); if (b) b.classList.toggle('on', on); }); }
function toggleMusicShuffle() {
  isMusicShuffle = !isMusicShuffle;
  paintToggle(['btnMusicShuffle', 'fpShuffle'], isMusicShuffle);
  showToast(isMusicShuffle ? 'Shuffle Enabled' : 'Shuffle Disabled');
}
function toggleMusicRepeat() {
  isMusicRepeat = !isMusicRepeat;
  paintToggle(['btnMusicRepeat', 'fpRepeat'], isMusicRepeat);
  showToast(isMusicRepeat ? 'Repeat Track Enabled' : 'Repeat Disabled');
}

// ---------- SLEEP TIMER ----------
function clearSleepTimerUI() {
  clearInterval(sleepTickTimer); sleepTickTimer = null; sleepTimerEndAt = null;
  if ($('sleepTimerRemaining')) $('sleepTimerRemaining').textContent = 'Mati';
  if ($('musicSleepTimerSelect')) $('musicSleepTimerSelect').value = 'off';
  paintToggle(['fpSleepBtn'], false);
}
function setMusicSleepTimer(mins) {
  if (musicSleepTimerTimeout) clearTimeout(musicSleepTimerTimeout);
  musicSleepTimerTimeout = null; sleepAtEndOfTrack = false; clearInterval(sleepTickTimer);
  if ($('musicSleepTimerSelect')) $('musicSleepTimerSelect').value = mins;
  if (mins === 'off') { clearSleepTimerUI(); showToast('Sleep Timer Disabled'); return; }
  paintToggle(['fpSleepBtn'], true);
  if (mins === 'end') {
    sleepAtEndOfTrack = true; sleepTimerEndAt = null;
    if ($('sleepTimerRemaining')) $('sleepTimerRemaining').textContent = 'Berhenti di akhir lagu ini';
    showToast('Musik berhenti di akhir lagu ini.'); return;
  }
  const ms = parseInt(mins) * 60 * 1000;
  sleepTimerEndAt = Date.now() + ms;
  musicSleepTimerTimeout = setTimeout(() => {
    audioEngine.pause(); isMusicPlaying = false; updateMusicPlayerUI(); clearSleepTimerUI();
    showToast('Sleep Timer reached. Music paused.');
    if (typeof pushNotification === 'function') pushNotification({ key: 'sleep_' + Date.now(), title: 'Sleep Timer', body: 'Waktu habis — musik dijeda. Selamat tidur 🌙', icon: 'fa-moon', color: 'bg-indigo', pref: 'focus' });
  }, ms);
  const tick = () => {
    if (!sleepTimerEndAt) return;
    const left = Math.max(0, Math.round((sleepTimerEndAt - Date.now()) / 1000));
    if ($('sleepTimerRemaining')) $('sleepTimerRemaining').textContent = `Sisa ${pad2(Math.floor(left / 60))}:${pad2(left % 60)}`;
  };
  tick(); sleepTickTimer = setInterval(tick, 1000);
  showToast(`Sleep Timer set for ${mins} minutes.`);
}
function openSleepTimerActions() {
  openActionSheet({
    title: 'Sleep Timer', message: sleepTimerEndAt || sleepAtEndOfTrack ? ($('sleepTimerRemaining').textContent) : 'Hentikan musik otomatis',
    actions: [
      { text: '15 menit', value: '15' }, { text: '30 menit', value: '30' }, { text: '60 menit', value: '60' },
      { text: 'Akhir lagu ini', value: 'end' }, { text: 'Matikan Timer', value: 'off', destructive: true }
    ]
  }).then(v => { if (v) setMusicSleepTimer(v); });
}

// ---------- FAVORITES & ACTIONS ----------
function toggleFavorite(id) {
  const song = appState.musicLibrary.find(s => s.id === id); if (!song) return;
  song.favorite = !song.favorite;
  saveStateToLocal(); renderMusicSongsList(); updateCurrentSongDisplayUI();
  haptic(10);
  showToast(song.favorite ? `♥ "${song.title}" ditambahkan ke Favorit` : 'Dihapus dari Favorit');
}
function toggleFavoriteCurrent() { const id = currentSongId(); if (!id) return showToast('Pilih lagu terlebih dahulu!', false); toggleFavorite(id); }

function openSongActions(id) {
  const song = appState.musicLibrary.find(s => s.id === id);
  if (!song) return showToast('Pilih lagu terlebih dahulu!', false);
  const isCur = currentSongId() === id;
  const actions = [
    { text: 'Putar Berikutnya', icon: 'fas fa-arrow-turn-up fa-rotate-90', onClick: () => playNextInQueue(id) },
    { text: musicQueue.includes(id) ? 'Hapus dari Antrean' : 'Tambah ke Antrean', icon: 'fas fa-list-ul', onClick: () => musicQueue.includes(id) ? removeFromQueue(id) : addToNextQueue(id) },
    { text: song.favorite ? 'Hapus dari Favorit' : 'Favoritkan', icon: song.favorite ? 'fas fa-heart-crack' : 'fas fa-heart', onClick: () => toggleFavorite(id) }
  ];
  actions.push(isSongOffline(id)
    ? { text: 'Hapus Versi Offline', icon: 'fas fa-circle-minus', onClick: () => removeSongOffline(id) }
    : { text: 'Simpan Offline', icon: 'fas fa-circle-down', onClick: () => saveSongOffline(id) });
  if (isCur) actions.push({ text: 'Lirik', icon: 'fas fa-quote-left', onClick: () => { closeFullPlayer(); openLyricsFullScreenModal(); } });
  actions.push({ text: 'Edit Lagu', icon: 'fas fa-pen', onClick: () => { closeFullPlayer(); editMusicSong(id); } });
  actions.push({ text: 'Hapus dari Library', icon: 'fas fa-trash', destructive: true, onClick: () => deleteMusicSong(id) });
  openActionSheet({ title: song.title, message: song.artist || song.category, actions });
}

// ---------- FULL PLAYER ----------
function openFullPlayer() {
  if (!currentSong() && appState.musicLibrary.length === 0) return switchTab('tab-music');
  updateCurrentSongDisplayUI(); renderQueueListUI();
  setFullPlayerPanel(fullPlayerPanel === 'art' ? 'art' : fullPlayerPanel, true);
  $('fullPlayer').classList.add('open');
  paintToggle(['fpShuffle'], isMusicShuffle); paintToggle(['fpRepeat'], isMusicRepeat);
  paintToggle(['fpSleepBtn'], !!(sleepTimerEndAt || sleepAtEndOfTrack));
}
function closeFullPlayer() { $('fullPlayer').classList.remove('open'); }
function setFullPlayerPanel(panel, keep) {
  fullPlayerPanel = (!keep && fullPlayerPanel === panel) ? 'art' : panel;
  $('fpArtSection').classList.toggle('hidden', fullPlayerPanel !== 'art');
  $('fpLyricsSection').classList.toggle('hidden', fullPlayerPanel !== 'lyrics');
  $('fpQueueSection').classList.toggle('hidden', fullPlayerPanel !== 'queue');
  paintToggle(['fpLyricsBtn'], fullPlayerPanel === 'lyrics');
  paintToggle(['fpQueueBtn'], fullPlayerPanel === 'queue');
  if (fullPlayerPanel === 'lyrics') { renderLyricsInto($('fpLyrics'), currentSong(), 'Belum ada lirik untuk lagu ini.'); highlightLrc(audioEngine.currentTime || 0); }
  if (fullPlayerPanel === 'queue') renderQueueListUI();
}
(function bindFullPlayerSwipe() {
  document.addEventListener('DOMContentLoaded', () => {
    const fp = $('fullPlayer'); if (!fp) return;
    let y0 = null;
    fp.addEventListener('touchstart', e => { y0 = fp.scrollTop <= 0 && !e.target.closest('.fp-lyrics, .fp-queue, input') ? e.touches[0].clientY : null; }, { passive: true });
    fp.addEventListener('touchend', e => { if (y0 !== null && e.changedTouches[0].clientY - y0 > 120) closeFullPlayer(); y0 = null; });
  });
})();

// ---------- CATEGORIES ----------
function populateMusicCategorySelect() {
  const cats = appState.musicCategories && appState.musicCategories.length > 0 ? appState.musicCategories : DEFAULT_CATEGORIES;
  const optionsHtml = cats.map(cat => `<option value="${esc(cat)}">${esc(cat)}</option>`).join('');
  ['musicSongCategoryInput', 'quickSongCategory'].forEach(id => { const s = $(id); if (s) { const v = s.value; s.innerHTML = optionsHtml; if (v && cats.includes(v)) s.value = v; } });
}
function renderSettingsCategoryList() {
  const container = $('settingsCategoryList'); if (!container) return;
  container.innerHTML = (appState.musicCategories || []).map(cat => `
    <span class="chip"><span>${esc(cat)}</span><button data-cat="${esc(cat)}" class="c-red" style="font-size:12px" aria-label="Hapus"><i class="fas fa-circle-xmark"></i></button></span>`).join('');
  container.querySelectorAll('button[data-cat]').forEach(b => b.onclick = () => deleteMusicCategory(b.dataset.cat));
}
function saveNewMusicCategory(e) {
  e.preventDefault();
  const input = $('newCategoryNameInput'); const name = input.value.trim();
  if (!name) return;
  if (!appState.musicCategories.includes(name)) {
    appState.musicCategories.push(name);
    saveStateToLocal(); renderMusicCategories(); populateMusicCategorySelect(); renderSettingsCategoryList();
    showToast(`Category "${name}" added and synced!`);
  }
  input.value = '';
}
async function deleteMusicCategory(cat) {
  if (await iosConfirm(`Hapus kategori "${cat}"?`, 'Lagu di kategori ini tidak ikut terhapus.', 'Hapus', true)) {
    appState.musicCategories = appState.musicCategories.filter(c => c !== cat);
    if (activeMusicCategory === cat) activeMusicCategory = 'All';
    saveStateToLocal(); renderMusicCategories(); populateMusicCategorySelect(); renderSettingsCategoryList();
    showToast(`Category "${cat}" removed and synced.`);
  }
}

// ---------- ADD / EDIT / DELETE SONG ----------
let songSource = 'upload';
function setSongSource(v) {
  songSource = v;
  $('songSourceSeg').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
  $('songUploadFields').classList.toggle('hidden', v !== 'upload');
  $('songLinkFields').classList.toggle('hidden', v !== 'link');
}
function onSongFilePicked() {
  const f = $('quickSongFile').files[0]; if (!f) return;
  $('songFileLabel').textContent = `${f.name} · ${formatBytes(f.size)}`;
  if (!$('quickSongTitle').value.trim()) $('quickSongTitle').value = f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ');
}
function onSongCoverPicked() { const f = $('quickSongCoverFile').files[0]; if (f) $('songCoverLabel').textContent = `${f.name} · ${formatBytes(f.size)}`; }
function resetSongFormFiles(song) {
  $('quickSongFile').value = ''; $('quickSongCoverFile').value = '';
  $('songFileLabel').textContent = song && song.fileId ? 'File tersimpan ✓ — tap untuk ganti' : 'Pilih file audio (MP3/M4A)';
  $('songCoverLabel').textContent = song && song.coverId ? 'Cover tersimpan ✓ — tap untuk ganti' : 'Pilih cover (opsional)';
  $('songUploadProgress').classList.add('hidden');
  if (typeof fillStoreSelects === 'function') fillStoreSelects();
}
function openQuickUploadSongModal() {
  populateMusicCategorySelect();
  const form = $('quickAddSongForm'); if (form) form.reset();
  $('quickAddSongEditId').value = '';
  $('quickModalTitleHeading').textContent = 'Tambah Lagu';
  $('btnSubmitQuickSong').textContent = 'Simpan';
  if (activeMusicCategory && appState.musicCategories.includes(activeMusicCategory)) $('quickSongCategory').value = activeMusicCategory;
  resetSongFormFiles(null);
  setSongSource(pushConfig && pushConfig.stores ? 'upload' : 'link');
  openSheet('quickUploadSongModal');
}
function closeQuickUploadSongModal() { closeSheet('quickUploadSongModal'); }
let songSaving = false;
function handleQuickAddSong(e) {
  if (e) e.preventDefault();
  if (!songSaving) saveSongForm();
  return false;
}
async function compressCover(file) {
  const img = await loadImage(file);
  return (await imageToJpeg(img, 640, 0.84)).blob;
}
async function saveSongForm() {
  const title = $('quickSongTitle').value.trim();
  const artist = $('quickSongArtist').value.trim();
  const category = $('quickSongCategory').value || 'Working';
  const editId = $('quickAddSongEditId').value;
  const existing = editId ? appState.musicLibrary.find(s => s.id === editId) : null;
  if (!title) { showToast('Judul lagu wajib diisi!', false); return; }
  const btn = $('btnSubmitQuickSong'), bar = $('songUploadProgress');
  const data = { title, artist, category };
  const oldFiles = [];
  try {
    songSaving = true;
    if (songSource === 'link') {
      const url = $('quickSongUrl').value.trim(), cover = $('quickSongCoverUrl').value.trim();
      if (!url) { showToast('Direct URL audio wajib diisi!', false); return; }
      if (/youtu\.?be/i.test(url)) { showToast('Link YouTube tidak bisa diputar. Gunakan link file .mp3/.m4a atau upload file.', false); return; }
      Object.assign(data, { url, cover, fileId: null, coverId: null, size: 0 });
      if (existing) oldFiles.push(existing.fileId, existing.coverId);
    } else {
      const f = $('quickSongFile').files[0], cf = $('quickSongCoverFile').files[0];
      const store = $('quickSongStore').value || getDefaultStore();
      if (!f && !(existing && existing.fileId)) { showToast('Pilih file audio dulu.', false); return; }
      btn.disabled = true; btn.innerHTML = '<span class="spinner dark" style="display:inline-block"></span>';
      bar.classList.remove('hidden'); const fill = bar.firstElementChild;
      if (f) {
        const up = await apiUploadFile(f, f.name, p => { fill.style.width = Math.round(p * 92) + '%'; }, store);
        Object.assign(data, { fileId: up.id, size: up.size, url: '' });
        if (existing) oldFiles.push(existing.fileId);
      }
      if (cf) {
        const cblob = await compressCover(cf);
        const upc = await apiUploadFile(cblob, title + '-cover.jpg', null, store);
        Object.assign(data, { coverId: upc.id, cover: '' });
        if (existing) oldFiles.push(existing.coverId);
      }
      fill.style.width = '100%';
      if (existing && !f && !existing.fileId) data.url = existing.url;
    }
    if (existing) { Object.assign(existing, data); if (isSongOffline(existing.id) && oldFiles.length) removeSongOffline(existing.id, true); }
    else appState.musicLibrary.unshift(Object.assign({ id: 'song_' + Date.now(), url: '', cover: '', lyrics: '' }, data));
    resyncCurrentSongIndex();
    saveStateToLocal();
    oldFiles.filter(Boolean).forEach(id => apiDeleteFile(id).catch(() => {}));
    await prepareSongUrls();
    renderMusicSongsList(); updateCurrentSongDisplayUI(); updateMediaSessionLockscreen();
    closeQuickUploadSongModal();
    showToast(existing ? 'Lagu diperbarui & tersinkron!' : (data.fileId ? `Lagu ter-upload ke ${STORE_NAMES[storeOfId(data.fileId)]}!` : 'Lagu (direct link) ditambahkan!'));
  } catch (err) {
    showToast('Gagal: ' + err.message, false);
  } finally {
    songSaving = false; btn.disabled = false; btn.textContent = editId ? 'Update' : 'Simpan';
  }
}
function storeOfId(id) { return !id ? '' : id.startsWith('r2-') ? 'r2' : id.startsWith('gd-') ? 'drive' : 'kv'; }

function editMusicSong(id) {
  const song = appState.musicLibrary.find(s => s.id === id); if (!song) return;
  populateMusicCategorySelect();
  const catSelect = $('quickSongCategory');
  if (catSelect && song.category && !Array.from(catSelect.options).some(o => o.value === song.category)) {
    const opt = document.createElement('option'); opt.value = song.category; opt.textContent = song.category; catSelect.appendChild(opt);
  }
  $('quickAddSongEditId').value = song.id;
  $('quickSongTitle').value = song.title || '';
  $('quickSongArtist').value = song.artist || '';
  $('quickSongUrl').value = song.url || '';
  $('quickSongCategory').value = song.category || 'Working';
  $('quickSongCoverUrl').value = song.cover || '';
  $('quickModalTitleHeading').textContent = 'Edit Lagu';
  $('btnSubmitQuickSong').textContent = 'Update';
  resetSongFormFiles(song);
  setSongSource(song.fileId ? 'upload' : 'link');
  openSheet('quickUploadSongModal');
}

function saveMusicSongSetting(e) {
  if (e) e.preventDefault();
  const title = $('musicSongTitleInput').value.trim();
  const artist = $('musicSongArtistInput').value.trim();
  const url = $('musicSongUrlInput').value.trim();
  const category = $('musicSongCategoryInput').value || 'Working';
  const cover = $('musicSongCoverInput') ? $('musicSongCoverInput').value.trim() : '';
  if (!title || !url) { showToast('Judul lagu dan Audio Direct URL wajib diisi!', false); return false; }
  appState.musicLibrary.unshift({ id: 'song_' + Date.now(), title, artist, url, category, cover, lyrics: '' });
  resyncCurrentSongIndex();
  saveStateToLocal(); renderMusicSongsList();
  $('musicAddSongForm').reset(); populateMusicCategorySelect();
  showToast('Track berhasil ditambahkan dari Pengaturan & disinkronkan!');
  return false;
}

async function deleteMusicSong(id) {
  const song = appState.musicLibrary.find(s => s.id === id);
  if (await iosConfirm('Hapus lagu ini?', song ? song.title : '', 'Hapus', true)) {
    const wasCurrent = currentSongId() === id;
    if (song) { [song.fileId, song.coverId].filter(Boolean).forEach(fid => apiDeleteFile(fid).catch(() => {})); if (isSongOffline(id)) removeSongOffline(id, true); }
    appState.musicLibrary = appState.musicLibrary.filter(s => s.id !== id);
    musicQueue = musicQueue.filter(q => q !== id);
    if (wasCurrent) { audioEngine.pause(); audioEngine.removeAttribute('src'); currentSongIndex = -1; currentSongRefId = null; isMusicPlaying = false; }
    else resyncCurrentSongIndex();
    saveStateToLocal(); renderMusicSongsList(); updateMusicPlayerUI(); renderQueueListUI();
    showToast('Song deleted & synced.');
  }
}

// ---------- Floating dock ----------
function toggleFloatingMusicDockSetting() {
  appState.showFloatingMusicDock = !appState.showFloatingMusicDock;
  applyFloatingMusicDockVisibility();
  saveStateToLocal();
  showToast(appState.showFloatingMusicDock ? 'Floating Music Player ditampilkan.' : 'Floating Music Player disembunyikan (audio tetap berjalan).');
}
function applyFloatingMusicDockVisibility() {
  const dock = $('floatingMusicDock'), sw = $('btnToggleFloatingDock');
  const isShown = appState.showFloatingMusicDock === true;
  if (dock) dock.classList.toggle('hidden', !isShown);
  if (sw) sw.checked = isShown;
}

// ---------- LIRIK OTOMATIS (LRCLIB) & SINKRON TAP ----------
function fmtDur(sec) { sec = Math.round(sec || 0); return `${Math.floor(sec / 60)}:${pad2(sec % 60)}`; }
async function lrclibFetch(path) {
  const url = 'https://lrclib.net/api/' + path;
  try { const r = await fetch(url); if (r.ok) return await r.json(); } catch (e) {}
  const token = await getIdTokenOrThrow();
  const r = await fetch('/api/proxy?url=' + encodeURIComponent(url), { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('Layanan lirik tidak bisa dihubungi (' + r.status + ')');
  return r.json();
}
async function searchSyncedLyrics() {
  const song = currentSong();
  if (!song) return showToast('Putar lagunya dulu, lalu cari liriknya.', false);
  const cleanTitle = song.title.replace(/\(.*?\)|\[.*?\]|official.*|lyrics?|video|audio/gi, '').trim();
  showToast(`Mencari lirik "${cleanTitle}"…`);
  let results = [];
  try {
    const qs = new URLSearchParams({ track_name: cleanTitle }); if (song.artist) qs.set('artist_name', song.artist);
    results = await lrclibFetch('search?' + qs);
    if (!results.length) results = await lrclibFetch('search?' + new URLSearchParams({ q: (cleanTitle + ' ' + (song.artist || '')).trim() }));
  } catch (err) { return showToast(err.message, false); }
  results = (results || []).filter(r => !r.instrumental && (r.syncedLyrics || r.plainLyrics));
  if (!results.length) {
    const v = await iosAlert({ title: 'Lirik tidak ditemukan', message: `Tidak ada lirik untuk "${cleanTitle}" di database.\nCoba ganti judul/artis lagu agar persis, atau pakai Sinkron Tap.`, actions: [{ text: 'Tutup', value: false }, { text: 'Sinkron Tap', value: true, bold: true }] });
    if (v) startTapSync();
    return;
  }
  const dur = isFinite(audioEngine.duration) && currentSongId() === song.id ? audioEngine.duration : 0;
  results.sort((a, b) => (!!b.syncedLyrics - !!a.syncedLyrics) || (dur ? Math.abs(a.duration - dur) - Math.abs(b.duration - dur) : 0));
  const pick = await openActionSheet({
    title: 'Pilih lirik', message: dur ? `Durasi lagumu ${fmtDur(dur)} — pilih yang durasinya paling mirip` : 'Pilih yang judul & artisnya cocok',
    actions: results.slice(0, 6).map((r, i) => ({ text: `${r.syncedLyrics ? '⏱ ' : ''}${r.trackName} — ${r.artistName} (${fmtDur(r.duration)})`, value: i }))
  });
  if (pick === null || pick === undefined) return;
  const chosen = results[pick];
  if (song.lyrics && song.lyrics.trim() && !(await iosConfirm('Ganti lirik yang ada?', 'Lirik lama akan diganti dengan hasil pencarian.', 'Ganti'))) return;
  song.lyrics = (chosen.syncedLyrics || chosen.plainLyrics || '').trim();
  afterLyricsChanged(song);
  showToast(chosen.syncedLyrics ? 'Lirik tersinkron dipasang — akan mengikuti nyanyian ✓' : 'Hanya lirik biasa yang tersedia. Pakai Sinkron Tap agar mengikuti nyanyian.', !!chosen.syncedLyrics);
}
function afterLyricsChanged(song) {
  saveStateToLocal();
  if ($('btnClearLyricSync')) $('btnClearLyricSync').classList.toggle('hidden', !getLrcLines(song));
  $('lyricsTextInput').value = song.lyrics || '';
  renderLyricsInto($('lyricsReadOnlyContainer'), song, '(Belum ada lirik untuk lagu ini)');
  updateInlineLyricsContent(); renderMusicSongsList();
  highlightLrc(audioEngine.currentTime || 0);
}

let tapLines = [], tapTimes = [], tapIdx = 0, tapTimer = null;
function formatLrcTime(t) { const m = Math.floor(t / 60), s = t - m * 60; return `${pad2(m)}:${s.toFixed(2).padStart(5, '0')}`; }
function startTapSync() {
  const song = currentSong();
  if (!song) return showToast('Putar lagunya dulu.', false);
  const src = (isLyricsEditing ? $('lyricsTextInput').value : song.lyrics) || '';
  tapLines = src.split(/\r?\n/).map(l => l.replace(/\[[^\]]*\]/g, '').trim()).filter(Boolean);
  if (!tapLines.length) {
    iosAlert({ title: 'Tempel lirik dulu', message: 'Tap "Edit", tempel lirik biasa (tanpa waktu), simpan, lalu tekan Sinkron Tap.' });
    if (!isLyricsEditing) toggleEditLyricsMode();
    return;
  }
  tapTimes = []; tapIdx = 0;
  ['lyricsReadOnlyContainer', 'lyricsEditContainer', 'lyricsToolRow'].forEach(id => $(id).classList.add('hidden'));
  $('lyricsTapSync').classList.remove('hidden');
  renderTapSync();
  try { audioEngine.currentTime = 0; } catch (e) {}
  if (!isMusicPlaying) togglePlayMusic();
  clearInterval(tapTimer);
  tapTimer = setInterval(() => { if ($('tapSyncTime')) $('tapSyncTime').textContent = formatAudioTime(audioEngine.currentTime || 0); }, 250);
  showToast('Lagu diputar dari awal. Tap tombol saat tiap baris mulai dinyanyikan.');
}
function renderTapSync() {
  $('tapSyncProgress').textContent = `Baris ${Math.min(tapIdx + 1, tapLines.length)}/${tapLines.length}`;
  const box = $('tapSyncLines');
  box.innerHTML = tapLines.map((l, i) => `<span class="tl ${i < tapIdx ? 'done' : i === tapIdx ? 'cur' : ''}">${i < tapIdx ? `<small>${formatLrcTime(tapTimes[i])}</small>` : ''}${esc(l)}</span>`).join('');
  const cur = box.querySelector('.tl.cur');
  if (cur) box.scrollTo({ top: cur.offsetTop - box.offsetTop - box.clientHeight / 3, behavior: 'smooth' });
}
function tapSyncStamp() {
  if (tapIdx >= tapLines.length) return;
  tapTimes[tapIdx] = audioEngine.currentTime || 0;
  tapIdx++; haptic(8);
  if (tapIdx >= tapLines.length) return finishTapSync();
  renderTapSync();
}
function tapSyncRestart() {
  tapTimes = []; tapIdx = 0;
  try { audioEngine.currentTime = 0; } catch (e) {}
  if (!isMusicPlaying) togglePlayMusic();
  renderTapSync(); showToast('Diulang dari awal — semua tap dihapus.');
}
async function clearLyricSync() {
  const song = currentSong(); if (!song || !getLrcLines(song)) return;
  if (!(await iosConfirm('Hapus waktu sinkron?', 'Lirik tetap ada tapi tidak lagi mengikuti nyanyian. Kamu bisa Sinkron Tap ulang.', 'Hapus Waktu', true))) return;
  song.lyrics = song.lyrics.split(/\r?\n/).map(l => l.replace(/\[[^\]]*\]/g, '').trim()).filter(Boolean).join('\n');
  afterLyricsChanged(song); showToast('Waktu sinkron dihapus.');
}
function tapSyncUndo() {
  if (!tapIdx) return;
  tapIdx--; tapTimes.length = tapIdx;
  try { audioEngine.currentTime = Math.max(0, (tapIdx ? tapTimes[tapIdx - 1] : 0)); } catch (e) {}
  renderTapSync();
}
function exitTapSync() {
  clearInterval(tapTimer); tapTimer = null;
  $('lyricsTapSync').classList.add('hidden'); $('lyricsToolRow').classList.remove('hidden');
  isLyricsEditing = false; applyLyricsModeUI();
}
function cancelTapSync() { exitTapSync(); showToast('Sinkron dibatalkan, lirik tidak diubah.'); }
function finishTapSync() {
  const song = currentSong(); if (!song) return exitTapSync();
  song.lyrics = tapLines.map((l, i) => `[${formatLrcTime(tapTimes[i])}] ${l}`).join('\n');
  exitTapSync();
  afterLyricsChanged(song);
  showToast(`Selesai! ${tapLines.length} baris tersinkron — lirik akan mengikuti nyanyian ✓`);
}
