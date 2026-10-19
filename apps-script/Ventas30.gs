/**
 * ============================================================
 *  Ventas 30 dias — piezas vendidas por SKU, del site
 * ============================================================
 *
 *  Baja /compras-walmart-vendidos?dias=30 a la hoja "Ventas 30 dias":
 *  un renglon por SKU con las piezas vendidas en los ultimos 30 dias.
 *  Cada hora (killersProgramado) y a mano desde el menu Walmart.
 *
 *  La lee WFS 1.0 (otro libro): por eso SIEMPRE trae ACTUALIZADO, para que
 *  pueda avisar si la hoja se quedo vieja. Columnas fijas de la A a la F;
 *  lo que agregues a la derecha se respeta (aqui nunca se borran columnas).
 *
 *  Auth: primero la llave (si hay); si el site la rechaza en esta ruta, la
 *  cookie (la que manda la extension). Misma regla que los precios.
 */

var V30_RUTA  = '/compras-walmart-vendidos?dias=30';
var V30_DIAS  = 30;
var V30_HOJA  = 'Ventas 30 dias';
var V30_ETAPA = 'VENTAS30';
var V30_ENC   = ['SKU', 'PRODUCTO', 'PIEZAS', 'DESDE', 'HASTA', 'ACTUALIZADO'];

var V30_CAMPOS_SKU   = ['skudelcanal', 'skucanal', 'sku', 'skuwalmart'];
var V30_CAMPOS_PZAS  = ['piezas', 'cantidad', 'cant', 'unidades', 'qty', 'vendidas'];
var V30_CAMPOS_NOMBRE = ['producto', 'nombre', 'titulo', 'descripcion', 'productname'];

/** Saca el arreglo de registros venga como venga el JSON. */
function v30Arreglo_(j) {
  if (Array.isArray(j)) return j;
  var cand = ['datos', 'data', 'items', 'vendidos', 'rows', 'resultado', 'resultados', 'skus'];
  for (var i = 0; i < cand.length; i++) if (Array.isArray(j[cand[i]])) return j[cand[i]];
  var ks = Object.keys(j || {});
  for (var k = 0; k < ks.length; k++) {
    var v = j[ks[k]];
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v;
  }
  return [];
}

/** Busca una llave por varios nombres posibles (sin importar mayusculas ni simbolos). */
function v30Campo_(obj, nombres) {
  var ks = Object.keys(obj);
  for (var i = 0; i < nombres.length; i++) {
    for (var j = 0; j < ks.length; j++) {
      if (ks[j].toLowerCase().replace(/[^a-z]/g, '') === nombres[i]) return obj[ks[j]];
    }
  }
  return '';
}

/** Pide la ruta: llave primero; si la rechaza, cookie. Devuelve el texto. */
function v30Pedir_() {
  var r = fetchSitio_(V30_RUTA, { crudo: true, silencioso: true });
  if (r.codigo === 200) return r.texto;
  if (r.codigo === 401 || r.codigo === 403 || r.codigo === 302 || r.codigo === 303) {
    var c = fetchSitio_(V30_RUTA, { crudo: true, soloCookie: true });   // lanza el error claro si la cookie tambien cayo
    return c.texto;
  }
  throw new Error('El site contesto HTTP ' + r.codigo + ' en ' + V30_RUTA);
}

function v30Filas_(arr) {
  var porSku = {}, orden = [], sinSku = 0;
  arr.forEach(function (o) {
    var sku = String(v30Campo_(o, V30_CAMPOS_SKU) || '').trim();
    var q = Number(v30Campo_(o, V30_CAMPOS_PZAS)) || 0;
    var nom = String(v30Campo_(o, V30_CAMPOS_NOMBRE) || '').trim();
    if (!sku) { sinSku++; return; }
    if (q <= 0) return;
    if (!porSku[sku]) { porSku[sku] = { sku: sku, nom: nom, q: 0 }; orden.push(sku); }
    porSku[sku].q += q;
    if (!porSku[sku].nom && nom) porSku[sku].nom = nom;
  });
  var lista = orden.map(function (k) { return porSku[k]; });
  lista.sort(function (a, b) { return b.q - a.q; });

  var ahora = new Date();
  var desde = Utilities.formatDate(new Date(ahora.getTime() - V30_DIAS * 86400000), TZ, 'yyyy-MM-dd');
  var hasta = Utilities.formatDate(ahora, TZ, 'yyyy-MM-dd');
  var stamp = Utilities.formatDate(ahora, TZ, 'yyyy-MM-dd HH:mm:ss');
  var filas = lista.map(function (x) { return [x.sku, x.nom, x.q, desde, hasta, stamp]; });
  return { filas: filas, sinSku: sinSku, piezas: lista.reduce(function (s, x) { return s + x.q; }, 0) };
}

/** Escribe de la A a la F; no toca nada a la derecha. */
function v30Escribir_(sh, filas) {
  var nc = V30_ENC.length, nf = filas.length + 1;
  if (sh.getMaxRows() < nf) sh.insertRowsAfter(sh.getMaxRows(), nf - sh.getMaxRows() + 1);
  if (sh.getMaxColumns() < nc) sh.insertColumnsAfter(sh.getMaxColumns(), nc - sh.getMaxColumns());

  sh.getRange(1, 1, nf, 1).setNumberFormat('@');                 // SKU como texto
  sh.getRange(1, 4, nf, 3).setNumberFormat('@');                 // fechas como texto (WFS las lee tal cual)   // col-fija
  sh.getRange(1, 1, 1, nc).setValues([V30_ENC]);
  if (filas.length) sh.getRange(2, 1, filas.length, nc).setValues(filas);

  var previas = Math.max(0, sh.getLastRow() - nf);
  if (previas > 0) sh.getRange(nf + 1, 1, previas, nc).clearContent();

  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, nc).setFontWeight('bold');
  SpreadsheetApp.flush();
}

/** Baja y escribe. Devuelve {estado, filas, piezas}. Lanza error si algo sale mal. */
function v30Bajar_() {
  var t0 = Date.now();
  var texto = v30Pedir_();
  var j;
  try { j = JSON.parse(texto); }
  catch (e) { throw new Error('El site no devolvio JSON en ' + V30_RUTA + '. Empieza con: ' + String(texto).slice(0, 120)); }

  var arr = v30Arreglo_(j);
  var sh = getHoja_(V30_HOJA);
  var actuales = Math.max(0, sh.getLastRow() - 1);

  if (!arr.length) {
    if (actuales > 0) {
      logWarn_(V30_ETAPA, 'El site mando 0 registros y la hoja tiene ' + actuales + ' filas: no se toco.',
               { llaves: Object.keys(j || {}) });
      return { estado: 'vacio', filas: actuales, piezas: 0 };
    }
    throw new Error('El JSON no trae registros. Llaves: ' + Object.keys(j || {}).join(', '));
  }

  var r = v30Filas_(arr);
  if (!r.filas.length) {
    throw new Error('No reconoci los campos. El primer registro trae: ' + Object.keys(arr[0]).join(', '));
  }

  // Guarda: si cae a menos de la mitad de SKUs que ya habia, es casi seguro el endpoint, no las ventas.
  if (actuales >= 20 && r.filas.length < actuales * 0.5) {
    logWarn_(V30_ETAPA, 'El site mando ' + r.filas.length + ' SKUs y la hoja tiene ' + actuales +
                        ': se ignora esta lista (parcial) y se reintenta en la siguiente hora.');
    return { estado: 'parcial', filas: actuales, piezas: 0 };
  }

  // Los campos del site, una sola vez (o cuando cambien): para ajustar nombres si algun dia hace falta.
  try {
    var firma = Object.keys(arr[0]).sort().join(',');
    if (props_().getProperty('V30_CAMPOS') !== firma) {
      logInfo_(V30_ETAPA, 'Campos que manda el site', { llaves: Object.keys(j || {}), campos: Object.keys(arr[0]), ejemplo: arr[0] });
      props_().setProperty('V30_CAMPOS', firma);
    }
  } catch (e) {}

  v30Escribir_(sh, r.filas);
  logLatido_(V30_ETAPA, 'Ventas 30 dias actualizadas', {
    skus: r.filas.length, piezas: r.piezas, sinSku: r.sinSku, ms: Date.now() - t0
  });
  return { estado: 'ok', filas: r.filas.length, piezas: r.piezas };
}

/** Menu: Bajar ventas 30 dias. */
function ventas30Bajar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_ESPERA_MS)) { toast_('Otra bajada en curso. Intenta en un minuto.', 'VENTAS 30', 8); return; }
  try {
    toast_('Bajando ventas de 30 dias...', 'VENTAS 30', 30);
    var r = v30Bajar_();
    logOk_(V30_ETAPA, 'Ventas 30 dias: ' + r.filas + ' SKUs, ' + r.piezas + ' piezas (' + r.estado + ')');
    flushLog_();
    toast_(r.filas + ' SKUs · ' + r.piezas + ' piezas', 'VENTAS 30', 8);
  } catch (e) {
    logErr_(V30_ETAPA, 'No se pudieron bajar las ventas: ' + String(e.message).split('\n')[0]);
    try { flushLog_(); } catch (x) {}
    toast_('Fallo: ' + String(e.message).split('\n')[0], 'VENTAS 30', 15);
  } finally {
    lock.releaseLock();
  }
}

/** Lo llama killersProgramado() cada hora. Un error se anota una vez por dia y motivo, no cada hora. */
function ventas30Programado_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    v30Bajar_();
    try { props_().deleteProperty('V30_ULT_ERROR'); } catch (e) {}
  } catch (e) {
    var msg = String(e.message).split('\n')[0].substring(0, 160);
    var marca = hoy_() + '|' + msg;
    var previa = '';
    try { previa = props_().getProperty('V30_ULT_ERROR') || ''; } catch (x) {}
    if (previa !== marca) {
      logWarn_(V30_ETAPA, 'No se pudieron bajar las ventas de 30 dias: ' + msg + '. WFS usa la hoja anterior hasta que se arregle.');
      try { props_().setProperty('V30_ULT_ERROR', marca); } catch (x) {}
    }
  } finally {
    try { flushLog_(); } catch (x) {}
    lock.releaseLock();
  }
}
