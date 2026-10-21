/**
 * ============================================================
 *  Cobro distinto — "Walmart cobró distinto" y "Killers que no cubren tu mínimo"
 * ============================================================
 *
 *  Baja /walmart/killers/api/dashboard (el mismo JSON de la pestaña Dashboard del site):
 *   - Hoja "Cobro distinto": un renglon por SKU (los que cuenta el Dashboard).
 *   - Hoja "Cobro distinto detalle": un renglon por pedido, con SKU y corte.
 *   - Hoja "Killers sin minimo": los killers que no cubren tu minimo.
 *  Las columnas salen de los campos que manda el site (no se inventan nombres): si el
 *  site agrega un campo, aparece solo. Cada hora (killersProgramado) y a mano desde el menu.
 *  Solo se borra el ancho de la tabla anterior: lo que agregues a la derecha se respeta.
 *  Auth: llave primero; si el site la rechaza, cookie (igual que Ventas 30 dias).
 */

var CD_RUTA   = '/walmart/killers/api/dashboard';
var CD_HOJA   = 'Cobro distinto';
var CD_HOJA2  = 'Killers sin minimo';
var CD_HOJA3  = 'Cobro distinto detalle';
var CD_ETAPA  = 'COBRODIST';

function cdPedir_() {
  var r = fetchSitio_(CD_RUTA, { crudo: true, silencioso: true });
  if (r.codigo === 200) return r.texto;
  if (r.codigo === 401 || r.codigo === 403 || r.codigo === 302 || r.codigo === 303) {
    return fetchSitio_(CD_RUTA, { crudo: true, soloCookie: true }).texto;
  }
  throw new Error('El site contesto HTTP ' + r.codigo + ' en ' + CD_RUTA);
}

function cdEsEscalar_(v) { return v === null || v === undefined || typeof v !== 'object'; }

/** Campos escalares de un objeto (objetos anidados se aplanan con "_"; arreglos de escalares se unen). */
function cdPlano_(o, pref, out) {
  out = out || {};
  Object.keys(o || {}).forEach(function (k) {
    var v = o[k], nombre = pref ? pref + '_' + k : k;
    if (Array.isArray(v)) {
      if (v.length && v.every(cdEsEscalar_)) out[nombre] = v.join(', ');
    } else if (v && typeof v === 'object') {
      cdPlano_(v, nombre, out);
    } else {
      out[nombre] = (v === null || v === undefined) ? '' : v;
    }
  });
  return out;
}

/** Une dos mapas; si la llave ya existe, la nueva lleva el prefijo del nivel. */
function cdMezclar_(base, extra, nivel) {
  var r = {}, k;
  for (k in base) r[k] = base[k];
  for (k in extra) r[r.hasOwnProperty(k) ? nivel + '_' + k : k] = extra[k];
  return r;
}

function cdArregloDe_(o, preferidos) {
  for (var i = 0; i < preferidos.length; i++) if (Array.isArray(o[preferidos[i]])) return { clave: preferidos[i], arr: o[preferidos[i]] };
  return null;
}

/** Une valores de un campo en varias filas: si todos son iguales, uno; si no, los distintos con " / ". */
function cdUnir_(vals) {
  var u = [];
  vals.forEach(function (v) { if (u.indexOf(v) === -1) u.push(v); });
  return u.length === 1 ? u[0] : u.join(' / ');
}

/** Campos que no se repiten en el detalle por pedido (ya van en la hoja resumen). */
var CD_NO_DETALLE = ['base', 'pedidos', 'pesos', 'cat_cobra', 'cat_debida', 'causa', 'promo_cat', 'pub', 'k', 'fila_pedidos', 'fila_sku', 'pedido_sku'];
var CD_PRIMERAS   = ['sku', 'corte', 'pedido'];

function cdSkus_(j) {
  var c = (j && j.cortes) || {};
  return Array.isArray(c.skus) ? c.skus : (Array.isArray(c) ? c : []);
}

/** Resumen: un renglon por SKU (los que cuenta el Dashboard), con sus cortes juntos. */
function cdFilasResumen_(j) {
  return cdSkus_(j).map(function (s) {
    var o = cdPlano_(s), filas = Array.isArray(s.filas) ? s.filas : [];
    var planas = filas.map(function (f) { return cdPlano_(f); });
    var claves = [];
    planas.forEach(function (p) { Object.keys(p).forEach(function (k) { if (claves.indexOf(k) === -1) claves.push(k); }); });
    claves.forEach(function (k) {
      if (k === 'dif' || k === 'pedidos' || o.hasOwnProperty(k)) return;     // dif y pedidos ya vienen sumados a nivel SKU
      o[k] = cdUnir_(planas.map(function (p) { return p.hasOwnProperty(k) ? p[k] : ''; }));
    });
    return o;
  });
}

/** Detalle: un renglon por pedido, con SKU y corte al frente. */
function cdFilasDetalle_(j) {
  var out = [];
  cdSkus_(j).forEach(function (s) {
    var filas = Array.isArray(s.filas) ? s.filas : [];
    filas.forEach(function (f) {
      var baseF = cdPlano_(f);
      var det = Array.isArray(f.detalle) ? f.detalle : [];
      var filasP = det.length ? det.map(function (d) { return cdMezclar_(baseF, cdPlano_(d), 'pedido'); }) : [baseF];
      filasP.forEach(function (o) {
        var r = {};
        CD_PRIMERAS.forEach(function (k) { if (o.hasOwnProperty(k)) r[k] = o[k]; });
        Object.keys(o).forEach(function (k) {
          if (!r.hasOwnProperty(k) && CD_NO_DETALLE.indexOf(k) === -1) r[k] = o[k];
        });
        out.push(r);
      });
    });
  });
  return out;
}

function cdFilasFalta_(j) {
  var a = Array.isArray(j.killers_falta) ? j.killers_falta : [];
  return a.map(function (o) { return cdPlano_(o); });
}

/** Convierte objetos planos a tabla: encabezados = union de llaves en orden de aparicion. */
function cdTabla_(objs) {
  var enc = [], vistos = {};
  objs.forEach(function (o) { Object.keys(o).forEach(function (k) { if (!vistos[k]) { vistos[k] = 1; enc.push(k); } }); });
  var filas = objs.map(function (o) { return enc.map(function (k) { return o.hasOwnProperty(k) ? o[k] : ''; }); });
  return { enc: enc.map(function (k) { return String(k).replace(/_/g, ' ').toUpperCase(); }), filas: filas };
}


var CD_FMT_DINERO = '$#,##0.00';
var CD_FMT_PCT    = '0.0"%"';
var CD_FORMATOS = {
  'PESOS': CD_FMT_DINERO, 'DIF': CD_FMT_DINERO, 'VENTA': CD_FMT_DINERO, 'COM': CD_FMT_DINERO,
  'ENVIO': CD_FMT_DINERO, 'KCOM': CD_FMT_DINERO, 'ACTUAL': CD_FMT_DINERO, 'CUPON': CD_FMT_DINERO,
  'KAM FALTA': CD_FMT_DINERO, 'KAM MINIMO': CD_FMT_DINERO, 'RECIBIMOS': CD_FMT_DINERO,
  'COBRADO': CD_FMT_PCT, 'DEBIDO': CD_FMT_PCT, 'T': CD_FMT_PCT,
  'CORTE': 'yyyy-mm-dd', 'FECHA': 'yyyy-mm-dd hh:mm', 'INI': 'yyyy-mm-dd hh:mm', 'FIN': 'yyyy-mm-dd hh:mm',
  'PEDIDO': '0', 'PEDIDOS': '0', 'K': '@', 'DIAS RESTANTES': '0'
};

/** Formato por encabezado (dinero, %, fechas, numero de pedido) en las filas de datos. */
function cdFormato_(sh, enc, nFilas) {
  if (nFilas < 1) return;
  enc.forEach(function (h, i) {
    var f = CD_FORMATOS[String(h).toUpperCase()];
    if (!f) return;
    var r = sh.getRange(2, i + 1, nFilas, 1);
    r.setNumberFormat(f);
    if (f !== '@' && f !== '0') r.setHorizontalAlignment('right');
  });
}

function cdEscribir_(sh, tabla, claveAncho) {
  var nc = tabla.enc.length, nf = tabla.filas.length + 1;
  if (sh.getMaxRows() < nf) sh.insertRowsAfter(sh.getMaxRows(), nf - sh.getMaxRows() + 1);
  if (sh.getMaxColumns() < nc) sh.insertColumnsAfter(sh.getMaxColumns(), nc - sh.getMaxColumns());
  var prevC = 0;
  try { prevC = parseInt(props_().getProperty(claveAncho) || '0', 10) || 0; } catch (e) {}
  var limpiarC = Math.max(nc, prevC);
  var prevF = sh.getLastRow();
  if (prevF > 1) sh.getRange(2, 1, prevF - 1, limpiarC).clearContent();
  if (prevC > nc) sh.getRange(1, nc + 1, 1, prevC - nc).clearContent();
  sh.getRange(1, 1, 1, nc).setValues([tabla.enc]).setFontWeight('bold');
  if (tabla.filas.length) sh.getRange(2, 1, tabla.filas.length, nc).setValues(tabla.filas);
  cdFormato_(sh, tabla.enc, tabla.filas.length);
  sh.setFrozenRows(1);
  try { props_().setProperty(claveAncho, String(nc)); } catch (e) {}
  SpreadsheetApp.flush();
}

/** Baja y escribe. Devuelve {cobro, falta}. Lanza error si algo sale mal. */
function cdBajar_() {
  var texto = cdPedir_(), j;
  try { j = JSON.parse(texto); }
  catch (e) { throw new Error('El site no devolvio JSON en ' + CD_RUTA + '. Empieza con: ' + String(texto).slice(0, 120)); }
  if (!j || (!j.cortes && !j.killers_falta)) throw new Error('El JSON no trae cortes ni killers_falta. Llaves: ' + Object.keys(j || {}).join(', '));

  var cobro = cdTabla_(cdFilasResumen_(j));
  var detalle = cdTabla_(cdFilasDetalle_(j));
  var falta = cdTabla_(cdFilasFalta_(j));

  try {   // campos una sola vez (o cuando cambien), para ajustar si hace falta
    var firma = cobro.enc.join(',') + '|' + detalle.enc.join(',') + '|' + falta.enc.join(',');
    if (props_().getProperty('CD_CAMPOS') !== firma) {
      logInfo_(CD_ETAPA, 'Campos que manda el site', { cobro: cobro.enc, detalle: detalle.enc, killersFalta: falta.enc });
      props_().setProperty('CD_CAMPOS', firma);
    }
  } catch (e) {}

  var sh3 = getHoja_(CD_HOJA3);
  var sh1 = getHoja_(CD_HOJA), sh2 = getHoja_(CD_HOJA2);
  var prev1 = Math.max(0, sh1.getLastRow() - 1), prev2 = Math.max(0, sh2.getLastRow() - 1);

  // Guarda: sin columnas o lista vacia con hoja llena = casi seguro sesion/endpoint, no que todo se arreglo.
  if (!cobro.enc.length && prev1 > 0) logWarn_(CD_ETAPA, 'El site mando 0 renglones de cobro distinto y la hoja tiene ' + prev1 + ': no se toco.');
  else if (cobro.enc.length) cdEscribir_(sh1, cobro, 'CD_ANCHO1');
  if (!falta.enc.length && prev2 > 0) logWarn_(CD_ETAPA, 'El site mando 0 killers sin minimo y la hoja tiene ' + prev2 + ': no se toco.');
  else if (falta.enc.length) cdEscribir_(sh2, falta, 'CD_ANCHO2');

  if (detalle.enc.length) cdEscribir_(sh3, detalle, 'CD_ANCHO3');

  logLatido_(CD_ETAPA, 'Cobro distinto actualizado', { skus: cobro.filas.length, pedidos: detalle.filas.length, killersSinMinimo: falta.filas.length });
  return { cobro: cobro.filas.length, pedidos: detalle.filas.length, falta: falta.filas.length };
}

/** Menu: Bajar cobro distinto. */
function cobroDistintoBajar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_ESPERA_MS)) { toast_('Otra bajada en curso. Intenta en un minuto.', 'COBRO DISTINTO', 8); return; }
  try {
    toast_('Bajando cobro distinto...', 'COBRO DISTINTO', 30);
    var r = cdBajar_();
    logOk_(CD_ETAPA, 'Cobro distinto: ' + r.cobro + ' SKUs, ' + r.pedidos + ' pedidos · Killers sin minimo: ' + r.falta);
    flushLog_();
    toast_(r.cobro + ' SKUs · ' + r.pedidos + ' pedidos · ' + r.falta + ' killers sin minimo', 'COBRO DISTINTO', 8);
  } catch (e) {
    logErr_(CD_ETAPA, 'No se pudo bajar cobro distinto: ' + String(e.message).split('\n')[0]);
    try { flushLog_(); } catch (x) {}
    toast_('Fallo: ' + String(e.message).split('\n')[0], 'COBRO DISTINTO', 15);
  } finally {
    lock.releaseLock();
  }
}

/** Lo llama killersProgramado() cada hora. Un error se anota una vez por dia y motivo. */
function cobroDistintoProgramado_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    cdBajar_();
    try { props_().deleteProperty('CD_ULT_ERROR'); } catch (e) {}
  } catch (e) {
    var msg = String(e.message).split('\n')[0].substring(0, 160);
    var marca = hoy_() + '|' + msg, previa = '';
    try { previa = props_().getProperty('CD_ULT_ERROR') || ''; } catch (x) {}
    if (previa !== marca) {
      logWarn_(CD_ETAPA, 'No se pudo bajar cobro distinto: ' + msg + '. Las hojas quedan como estaban.');
      try { props_().setProperty('CD_ULT_ERROR', marca); } catch (x) {}
    }
  } finally {
    try { flushLog_(); } catch (x) {}
    lock.releaseLock();
  }
}
