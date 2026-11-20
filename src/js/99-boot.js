/* =========================================================
   99 · BOOT
   ========================================================= */
function startApp() {
  if (appStarted) return;
  appStarted = true;
  updateHeaderDate();
  updateDashboardGreeting();
  updateRealtimeClock();
  applyFloatingMusicDockVisibility();
  if ($('kasTanggal') && !$('kasTanggal').value) $('kasTanggal').value = wibDateStr();
  taResetForm();
  resetBookmarkForm();
  applyLabels();
  recordVisit(false);
  renderAllModules();

  if (isFirebaseReady) attachRealtimeSync();
  else setConnectionStatus('off');

  initAudioEngine();
  initDropzone();
  initViewerZoom();
  setInterval(updateRealtimeClock, 1000);
  setInterval(() => { try { renderDashboardUpcoming(); } catch (e) {} }, 10 * 60 * 1000); // event otomatis naik saat masuk H-7

  let lastTab = null;
  try { lastTab = sessionStorage.getItem('hz_last_tab'); } catch (e) {}
  if (lastTab && $(lastTab)) switchTab(lastTab);
  handleDeepLink();

  loadPushConfig().then(() => { fillStoreSelects(); renderMusicModule(); renderGallery(); renderStoragePanel(); });
  initNotifications();
  sessionWatchTimer = setInterval(checkSessionExpiry, 20000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { checkSessionExpiry(); checkReminders(); pullServerInbox(); updateDashboardGreeting(); renderDashboardTodayAgenda(); renderDashboardUpcoming(); }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  defaultDocTitle = document.title || 'Nexa';
  initNavbarScroll();
  bootAuth();
});
