// t103: el Indice del libro (25-nov-2026): se arma ANTES de borrarse; si una hoja no contesta no se cae; un indice vacio se rearma. Hoja simulada; nada real.
const fs = require('fs'), vm = require('vm');
let ok = 0, bad = 0; const t = (c, m) => { c ? ok++ : (bad++, console.log('FALLA', m)); };
const src = fs.readFileSync(__dirname + '/../apps-script/Organizar.gs', 'utf8');
const log = []; let hojasLibro = [];
const ctx = { console, Date, Math, Object, Array, String, Number, JSON, RegExp, Error, isNaN, parseInt,
  Utilities: { formatDate: () => '2026-11-25 08:30' }, Session: { getScriptTimeZone: () => 'America/Mexico_City' },
  SpreadsheetApp: { WrapStrategy: { CLIP: 'CLIP' }, getActive: () => ({ getSheets: () => hojasLibro }) } };
vm.createContext(ctx); vm.runInContext(src, ctx);
const hoja = (nombre, ultima, falla) => ({ getName: () => nombre, getSheetId: () => 7, getLastRow: () => { if (falla) throw new Error('Se agoto el tiempo de espera del servicio Hojas de calculo'); return ultima; } });
const rango = () => { const r = new Proxy({}, { get: (o, k) => k === 'setValues' ? (v => { log.push('setValues:' + v.length); return r; }) : (() => r) }); return r; };
const ind = { clear: () => log.push('clear'), getMaxRows: () => 500, getMaxColumns: () => 5, insertRowsAfter: () => {}, insertColumnsAfter: () => {}, getRange: rango, setColumnWidth: () => {}, setFrozenRows: () => {}, setHiddenGridlines: () => {} };

const lista = vm.runInContext('orgListaActual_()', ctx);
const n1 = lista[0][0];
hojasLibro = [hoja(n1, 40, true), hoja('Otra', 12, false)];
const porNombre = {}; hojasLibro.forEach(h => porNombre[h.getName()] = h);

// 1) una hoja que no contesta no tumba el indice
let lanzo = null; try { vm.runInContext('orgIndice_', ctx)(ind, {}, porNombre, ['Otra'], []); } catch (e) { lanzo = e; }
t(!lanzo, 'si una hoja no contesta el indice igual se arma: ' + (lanzo && lanzo.message));
t(log.indexOf('clear') >= 0 && log.some(x => /^setValues/.test(x)), 'borra y escribe');
t(vm.runInContext('orgFilasDe_', ctx)(hoja(n1, 40, true)) === '?', 'hoja que no contesta deja ?');

// 2) si armar las filas truena (algo que no sea getLastRow), el indice viejo NO se toca
log.length = 0;
const mala = { getName: () => 'Mala', getSheetId: () => { throw new Error('boom'); }, getLastRow: () => 1 };
const pn2 = { Mala: mala }; lanzo = null;
try { vm.runInContext('orgIndice_', ctx)(ind, {}, pn2, ['Mala'], []); } catch (e) { lanzo = e; }
t(lanzo && log.indexOf('clear') < 0, 'si truena al armar, no se borro el indice anterior: ' + JSON.stringify(log));

// 3) orden en el codigo + auto-reparacion de indice vacio
const iFn = src.indexOf('function orgIndice_'), iClear = src.indexOf('ind.clear()', iFn), iHy = src.indexOf('HYPERLINK', iFn);
t(iClear > iHy, 'el borrado va despues de armar las filas');
t(/var igual = \(props\.getProperty\(ORG_PROP_HUELLA\) === huella\) && indTieneDatos/.test(src), 'un indice vacio no cuenta como hecho aunque la huella sea la misma');
console.log(bad ? ('FALLAN ' + bad) : ('t103 ok ' + ok)); process.exit(bad ? 1 : 0);
