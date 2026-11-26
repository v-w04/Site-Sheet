// t111: mantenerPestanas (v1.10.7): marca "no dormir" y recarga solo lo dormido/quieto; no toca la activa ni corre ocupada.
const fs = require('fs'), path = require('path');
let ok = 0, mal = 0;
const t = (c, n) => { if (c) ok++; else { mal++; console.log('FALLA', n); } };
const src = fs.readFileSync(path.join(__dirname, '..', 'extension-cookie', 'background.js'), 'utf8');
const a = src.indexOf('const MANT_PATRONES'), b = src.indexOf("try { chrome.alarms.create('mantener'");
t(a > 0 && b > a, 'se encuentra el bloque');
const codigo = src.slice(a, b);
const SITE = 'https://electronicsmexico.site/walmart/guias', SELL = 'https://seller.walmart.com/orders', ODOO = 'https://electronicsmexico.odoo.com/web', SHEET = 'https://docs.google.com/spreadsheets/d/1Yjwyyv7EF5CJ3tJ2DgGzXO7QHxyrC0aCCSj1MHL5AKY/edit', OTRA = 'https://www.google.com/';
async function correr(tabs, ocupado) {
  const rec = [], upd = [], store = {};
  const chrome = { tabs: { query: async () => tabs, reload: async id => { rec.push(id); }, update: async (id, o) => { upd.push([id, o]); } }, storage: { local: { set: async o => Object.assign(store, o) } } };
  const f = new Function('chrome', 'scOcupado', 'cancelando', codigo + '; return mantenerPestanas;');
  const r = await f(chrome, !!ocupado, false)();
  return { r, rec, upd, store };
}
const hace = min => Date.now() - min * 60000;
(async () => {
  let x = await correr([
    { id: 1, url: SITE, discarded: true, active: false, lastAccessed: hace(5) },
    { id: 2, url: SELL, discarded: false, active: false, lastAccessed: hace(45) },
    { id: 3, url: SITE, discarded: false, active: true, lastAccessed: hace(90) },
    { id: 4, url: ODOO, discarded: false, active: false, lastAccessed: hace(120) },
    { id: 5, url: ODOO, discarded: true, active: false, lastAccessed: hace(120) },
    { id: 6, url: OTRA, discarded: true, active: false, lastAccessed: hace(500) },
    { id: 7, url: SHEET, discarded: false, active: false, lastAccessed: hace(10) },
    { id: 8, url: SELL, discarded: false, active: false, audible: true, lastAccessed: hace(99) },
    { id: 9, url: SELL, discarded: false, active: false, autoDiscardable: false, lastAccessed: hace(31) }
  ]);
  t(x.rec.includes(1), 'dormida del site se recarga');
  t(x.rec.includes(2), 'Seller quieta 45 min se recarga');
  t(!x.rec.includes(3), 'la activa no se toca');
  t(!x.rec.includes(4), 'Odoo quieta NO se recarga');
  t(x.rec.includes(5), 'Odoo dormida se revive');
  t(!x.rec.includes(6), 'pestana ajena no se toca');
  t(!x.rec.includes(7), 'Sheet usada hace 10 min no se recarga');
  t(!x.rec.includes(8), 'la que suena no se toca');
  t(x.rec.includes(9), 'quieta 31 min con autoDiscardable ya false se recarga');
  t(x.upd.some(u => u[0] === 1 && u[1].autoDiscardable === false), 'marca no dormir');
  t(!x.upd.some(u => u[0] === 6), 'no marca pestanas ajenas');
  t(!x.upd.some(u => u[0] === 9), 'ya protegida no se vuelve a marcar');
  t(x.store.estadoMant && x.store.estadoMant.recargadas === 4, 'guarda el conteo (4)');
  x = await correr([{ id: 1, url: SITE, discarded: true, active: false }], true);
  t(x.r.saltado === 'ocupado' && x.rec.length === 0 && x.upd.length === 0, 'ocupada: no hace nada');
  x = await correr([{ id: 1, url: SITE, discarded: true, active: false, lastAccessed: hace(1) }].concat([]), false);
  t(x.rec.length === 1, 'sin lastAccessed no truena');
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'extension-cookie', 'manifest.json'), 'utf8'));
  t(m.version === '1.11.1' && m.permissions.includes('tabs') && m.permissions.includes('alarms'), 'manifest 1.11.1 con tabs y alarms, sin permisos nuevos');
  t(m.permissions.length === 6 && m.host_permissions.length === 7, 'permisos iguales (6 + 7 hosts)');
  console.log('t111: ' + ok + ' ok' + (mal ? ', ' + mal + ' FALLAN' : ''));
  process.exit(mal ? 1 : 0);
})();
