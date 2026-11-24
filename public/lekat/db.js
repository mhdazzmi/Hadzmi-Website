// Lekat — penyimpanan lokal (IndexedDB) + model koleksi ala Anki.
// Seluruh koleksi dimuat ke memori (Map) saat start; setiap perubahan langsung ditulis ke IndexedDB.
(function (G) {
  'use strict';
  const DB_NAME = 'lekat', DB_VER = 1;
  const STORES = ['notes', 'cards', 'decks', 'presets', 'notetypes', 'revlog', 'media', 'meta'];
  let idb = null;
  const mem = {};
  STORES.forEach(s => mem[s] = new Map());

  function open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function all(store) {
    return new Promise((res, rej) => {
      const t = idb.transaction(store, 'readonly').objectStore(store).getAll();
      t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
    });
  }
  // Antrian tulis dikelompokkan per tick supaya hemat transaksi
  let pending = new Map(), flushTimer = null;
  function queue(store, op, val) {
    if (!pending.has(store)) pending.set(store, []);
    pending.get(store).push([op, val]);
    if (!flushTimer) flushTimer = setTimeout(flush, 0);
  }
  function flush() {
    flushTimer = null;
    if (!pending.size) return Promise.resolve();
    const work = pending; pending = new Map();
    return new Promise((res) => {
      const tx = idb.transaction([...work.keys()], 'readwrite');
      for (const [store, ops] of work) {
        const os = tx.objectStore(store);
        for (const [op, val] of ops) op === 'put' ? os.put(val) : os.delete(val);
      }
      tx.oncomplete = () => res(); tx.onerror = () => { console.error(tx.error); res(); };
    });
  }

  const DB = {
    mem,
    async init() {
      idb = await open();
      for (const s of STORES) {
        if (s === 'media') { (await all(s)).forEach(m => mem.media.set(m.id, m)); continue; }
        (await all(s)).forEach(o => mem[s].set(o.id, o));
      }
    },
    get(store, id) { return mem[store].get(id); },
    list(store) { return [...mem[store].values()]; },
    put(store, obj) { obj.mod = Date.now(); mem[store].set(obj.id, obj); queue(store, 'put', obj); return obj; },
    putRaw(store, obj) { mem[store].set(obj.id, obj); queue(store, 'put', obj); return obj; },
    del(store, id) { mem[store].delete(id); queue(store, 'del', id); },
    flush,
    async wipe() {
      for (const s of STORES) mem[s].clear();
      await new Promise((res) => {
        const tx = idb.transaction(STORES, 'readwrite');
        STORES.forEach(s => tx.objectStore(s).clear());
        tx.oncomplete = res; tx.onerror = res;
      });
    },
    meta(key, val) {
      if (val === undefined) { const m = mem.meta.get(key); return m ? m.v : undefined; }
      DB.putRaw('meta', { id: key, v: val }); return val;
    }
  };

  let lastId = 0;
  DB.newId = function () { let id = Date.now(); if (id <= lastId) id = lastId + 1; lastId = id; return id; };

  G.DB = DB;
})(window);
