/* =========================================================
   08 · SETTINGS — backup JSON, reset, panel state
   ========================================================= */
function renderSettingsPanel() {
  updateSessionUI();
  const prefs = getNotifPrefs();
  document.querySelectorAll('[data-notif]').forEach(inp => { inp.checked = !!prefs[inp.dataset.notif]; });
  if ($('notifLeadSelect')) $('notifLeadSelect').value = String(prefs.lead || 30);
  updateNotifPermissionUI();
  if ($('gmailDefaultTo')) $('gmailDefaultTo').value = getGmailDefault();
}

function exportDataJSON() {
  const blob = new Blob([JSON.stringify(appState, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `hadzmi-hub-backup-${wibDateStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  showToast('JSON backup file downloaded!');
}

function importDataJSON(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async function (event) {
    try {
      const imported = JSON.parse(event.target.result);
      if (!imported || typeof imported !== 'object' || Array.isArray(imported)) throw new Error('bad');
      const ok = await iosConfirm('Import data?', 'Data di file ini akan MENGGANTIKAN data yang ada di Firebase & semua perangkat.', 'Import', true);
      if (ok) {
        appState = { ...appState, ...imported };
        saveStateToLocal();
        resyncCurrentSongIndex();
        applyFloatingMusicDockVisibility();
        renderAllModules();
        showToast('JSON data successfully imported & synced to Firebase!');
      }
    } catch (err) { showToast('Invalid JSON file format!', false); }
    e.target.value = '';
  };
  reader.readAsText(file);
}

async function resetAllAppData() {
  const typed = await iosAlert({
    title: 'Reset semua data?',
    message: 'Ini akan menghapus PERMANEN semua data di Firebase dan di semua perangkat.\nKetik RESET untuk melanjutkan.',
    input: { placeholder: 'RESET' },
    actions: [{ text: 'Batal', value: false }, { text: 'Hapus Semua', value: true, destructive: true }]
  });
  if (typed === null || typed === undefined) return;
  if (String(typed).trim().toUpperCase() !== 'RESET') return showToast('Reset dibatalkan (konfirmasi tidak cocok).', false);
  try {
    Object.keys(localStorage).filter(k => k.startsWith('app_')).forEach(k => localStorage.removeItem(k));
  } catch (err) {}
  appState = { todos: [], countdowns: [], notes: [], kas: [], links: [], contacts: [], uploads: [], customWebLinks: [], focusHistory: [], musicCategories: DEFAULT_CATEGORIES.slice(), musicLibrary: [], showFloatingMusicDock: false };
  audioEngine.pause(); audioEngine.removeAttribute('src'); currentSongIndex = -1; currentSongRefId = null; musicQueue = [];
  saveStateToLocal(); applyFloatingMusicDockVisibility(); renderAllModules(); updateMusicPlayerUI();
  showToast('All application data has been reset.');
}
