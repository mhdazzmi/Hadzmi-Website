/**
 * Hadzmi Hub — Penyimpanan Google Drive (untuk Galeri, Lagu, Bukti Kas, Gudang File)
 * Semua file disimpan di folder "Hadzmi Hub" di Google Drive-mu.
 * Hanya server Hadzmi Hub (Cloudflare Worker) yang tahu SECRET, jadi orang lain tidak bisa mengakses.
 *
 * Cara pasang: lihat Settings → Penyimpanan → Google Drive di website.
 */
const FOLDER_NAME = 'Hadzmi Hub';

function getSecret_() { return PropertiesService.getScriptProperties().getProperty('SECRET'); }
function folder_() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}
function inFolder_(file) {
  const parents = file.getParents(); const fid = folder_().getId();
  while (parents.hasNext()) if (parents.next().getId() === fid) return true;
  return false;
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet() { return json_({ ok: true, service: 'hadzmi-hub-drive' }); }

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  const secret = getSecret_();
  if (!secret || body.secret !== secret) return json_({ ok: false, error: 'unauthorized' });
  try {
    if (body.action === 'upload') {
      const blob = Utilities.newBlob(Utilities.base64Decode(body.data), body.mimeType || 'application/octet-stream', body.name || 'file');
      const f = folder_().createFile(blob);
      return json_({ ok: true, id: f.getId(), size: f.getSize() });
    }
    if (body.action === 'get') {
      const f = DriveApp.getFileById(body.id);
      if (!inFolder_(f)) return json_({ ok: false, error: 'not found' });
      const b = f.getBlob();
      return json_({ ok: true, name: f.getName(), mimeType: b.getContentType(), data: Utilities.base64Encode(b.getBytes()) });
    }
    if (body.action === 'delete') {
      const f = DriveApp.getFileById(body.id);
      if (inFolder_(f)) f.setTrashed(true);
      return json_({ ok: true });
    }
    if (body.action === 'usage') {
      let folderBytes = 0; const files = folder_().getFiles();
      while (files.hasNext()) folderBytes += files.next().getSize();
      return json_({ ok: true, used: DriveApp.getStorageUsed(), limit: DriveApp.getStorageLimit(), folderBytes: folderBytes });
    }
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}
