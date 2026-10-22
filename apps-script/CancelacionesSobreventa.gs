/**
 * ============================================================
 *  Cancelaciones por SOBREVENTA  (hoja de sobreventa de Pick -> Cancelaciones -> Odoo)
 * ============================================================
 *
 *  Regla (decidida por el usuario el 22-oct-2026):
 *   - Toda venta que aparezca en la hoja de sobreventa de Pick con al menos un SKU SIN "-CVA" se cancela
 *     COMPLETA en Odoo, aunque traiga otros productos (con o sin "-CVA").
 *   - Si TODOS sus SKU en sobreventa traen "-CVA", no se cancela: se queda solo en la hoja de sobreventa.
 *   - Va dentro de la cancelacion automatica de 6-7am (cancelacionesAutoProgramado_, trigger de la cuenta
 *     de cancelaciones), con la MISMA mecanica de la hoja Cancelaciones: se agrega la fila con
 *     ORIGEN = SOBREVENTA y la cancela el mismo flujo (mismas revisiones: cliente WALMART, salida hecha,
 *     1 intento por dia, relectura del estado en Odoo).
 *   - Antes de decidir se vuelve a bajar la sobreventa de Odoo (nunca se cancela con una foto vieja).
 *   - Tope: si en una corrida hay mas de CAN_SOB_TOPE ventas nuevas por sobreventa, no se agrega ni se
 *     cancela NINGUNA y queda ERROR en el Log (puede ser una falla de inventario en Odoo).
 *   - Prueba: antes de CAN_SOB_REAL_DESDE solo se anota en Cancelaciones con ORIGEN = SOBREVENTA PRUEBA
 *     (casilla apagada, no se cancela). El primer dia real esas filas pasan a SOBREVENTA si la venta sigue
 *     en sobreventa.
 *   - Cancelar en Odoo no cancela en Walmart: el resumen del Log lista las ordenes para cancelarlas a mano
 *     en el Seller Center antes de aceptar las guias del dia.
 */

var CAN_SOB_TOPE = 5;                     // maximo de ventas por sobreventa por corrida
var CAN_SOB_REAL_DESDE = '2026-10-24';    // antes de este dia: solo prueba (no cancela)
var CAN_SOB_CVA = /-CVA/i;                // SKU con "-CVA" en cualquier lugar: no se cancela por sobreventa

function canSobModoReal_() { return hoy_() >= CAN_SOB_REAL_DESDE; }
function canSobEsCva_(sku) { return CAN_SOB_CVA.test(String(sku || '')); }

/** Hoja de sobreventa que se cancela: el destino de SOBREVENTA (Sobreventa.gs) marcado con cancela: true. */
function canSobHoja_() {
  var d = SOBREVENTA.DESTINOS.filter(function (x) { return x.cancela; })[0];
  if (!d) throw new Error('En SOBREVENTA (Sobreventa.gs) ningun destino tiene cancela: true.');
  return d.hoja;
}

/** Columna (1-based) de "Orden de compra#" en Cancelaciones; 0 si no esta. */
function canColOrden_(mapa) {
  var c = 0;
  Object.keys(mapa).forEach(function (k) { if (!c && /^ORDEN DE COMPRA/.test(k)) c = mapa[k]; });
  return c;
}

/** Valores de una columna de datos (fila 2 hacia abajo) como lista simple. */
function canColVals_(h, c, n) {
  if (!c || !(n > 0)) return [];
  return h.getRange(2, c, n, 1).getValues().map(function (r) { return r[0]; });
}

/** Numero de venta como texto (Sheets puede traerlo como numero). */
function canTextoOrden_(v) {
  if (typeof v === 'number') return v.toFixed(0);
  return String(v == null ? '' : v).trim();
}

/**
 * Lee la hoja de sobreventa de Pick por ENCABEZADO y la agrupa por venta (Documento origen = Orden de compra#).
 * { ventas: {orden: {lineas:[{ref, sku, nombre, qty}], noCva}}, cancelar:[ordenes], soloCva:[ordenes], sinOrigen }
 */
function canSobLeer_(hoja, soloMarcadas, out) {
  out = out || { ventas: {}, cancelar: [], soloCva: [], sinOrigen: 0 };
  hoja = hoja || canSobHoja_();
  var h = getSpreadsheet_().getSheetByName(hoja);
  if (!h || h.getLastRow() < 2) return out;
  var c = colsHoja_(h, ['Referencia', 'Documento origen', 'SKU', 'Qty demandada'], ['Nombre producto', SOB_COL_CHECK]);
  var datos = h.getRange(2, 1, h.getLastRow() - 1, Math.max(h.getLastColumn(), 1)).getValues();
  datos.forEach(function (f) {
    if (soloMarcadas && !(c[SOB_COL_CHECK] >= 0 && f[c[SOB_COL_CHECK]] === true)) return;
    var orden = canTextoOrden_(f[c['Documento origen']]);
    var ref = String(f[c['Referencia']] || '').trim();
    if (!orden) { if (ref) out.sinOrigen++; return; }
    var v = out.ventas[orden] || (out.ventas[orden] = { lineas: [], noCva: false });
    var sku = String(f[c['SKU']] || '').trim();
    v.lineas.push({
      ref: ref, sku: sku, qty: f[c['Qty demandada']], hoja: hoja,
      nombre: c['Nombre producto'] >= 0 ? String(f[c['Nombre producto']] || '') : ''
    });
    if (!canSobEsCva_(sku)) v.noCva = true;
  });
  out.cancelar = []; out.soloCva = [];
  Object.keys(out.ventas).forEach(function (o) { (out.ventas[o].noCva ? out.cancelar : out.soloCva).push(o); });
  return out;
}

/** "SKU x1, SKU2 x2" de una venta en sobreventa. */
function canSobSkus_(v) {
  return ((v && v.lineas) || []).map(function (l) { return (l.sku || '(sin SKU)') + ' x' + (l.qty === '' ? '?' : l.qty); }).join(', ');
}

/** Ventas que ya estan en Cancelaciones: { orden: [{fila, origen}] }. */
function canOrdenesEnHoja_(h) {
  var res = {}, n = h.getLastRow() - 1;
  if (n < 1) return res;
  var m = canMapaHoja_(h).mapa;
  var ord = canColVals_(h, canColOrden_(m), n), ori = canColVals_(h, m[normEnc_(CAN_ORIGEN)], n);
  ord.forEach(function (o0, i) {
    var o = canTextoOrden_(o0);
    if (!o) return;
    (res[o] = res[o] || []).push({ fila: i + 2, origen: String(ori[i] || '').trim().toUpperCase() });
  });
  return res;
}

/**
 * Columna ORIGEN (CORREO / SOBREVENTA / SOBREVENTA PRUEBA / MANUAL). Si no existe se crea por encabezado,
 * se llena en las filas que ya estaban (MANUAL si el ID CORREO empieza con MANUAL-, si no CORREO) y se
 * acomoda como primera columna con el orden de siempre (canOrdenar_).
 */
function canAsegurarOrigen_(h) {
  if (canMapaHoja_(h).mapa[normEnc_(CAN_ORIGEN)]) return;
  var col = canAsegurarColumnas_(h, [CAN_ORIGEN])[normEnc_(CAN_ORIGEN)];
  var n = h.getLastRow() - 1;
  if (n > 0) {
    var m = canMapaHoja_(h).mapa;
    var ids = canColVals_(h, m[normEnc_('ID CORREO')], n), ord = canColVals_(h, canColOrden_(m), n);
    var vals = [];
    for (var i = 0; i < n; i++) {
      var id = String(ids[i] || ''), o = canTextoOrden_(ord[i]);
      vals.push([!id && !o ? '' : (/^MANUAL-/i.test(id) ? CAN_ORI_MANUAL : CAN_ORI_CORREO)]);
    }
    h.getRange(2, col, n, 1).setNumberFormat('@').setValues(vals);
  }
  try { canOrdenar_(h); } catch (e) {}
}

/** Agrega a Cancelaciones una fila por cada linea en sobreventa de esas ventas (por encabezado). */
function canSobAgregar_(h, ordenes, ventas, origen) {
  canAsegurarColumnas_(h, CAN_FIJAS); canAsegurarControl_(h); canAsegurarOrigen_(h);
  var m = canMapaHoja_(h).mapa;
  if (!canColOrden_(m)) canAsegurarColumnas_(h, ['Orden de compra#']);
  canAsegurarColumnas_(h, [CAN_SKU_COMPLETO, 'Qty.', CAN_OBS]);
  m = canMapaHoja_(h).mapa;
  var cOrd = canColOrden_(m), ancho = Math.max(h.getLastColumn(), 1);
  var hoyD = Utilities.parseDate(hoy_(), TZ, 'yyyy-MM-dd'), ahora = new Date();
  var poner = function (fila, enc, v) { var c = m[normEnc_(enc)]; if (c) fila[c - 1] = v; };
  var datos = [];
  ordenes.forEach(function (o) {
    (ventas[o].lineas || []).forEach(function (l) {
      var fila = new Array(ancho).fill('');
      poner(fila, CAN_ORIGEN, origen);
      poner(fila, 'FECHA LECTURA', hoyD);
      poner(fila, 'FECHA CORREO', ahora);
      poner(fila, 'ID CORREO', 'SOBREVENTA-' + (l.ref || o));
      fila[cOrd - 1] = o;
      poner(fila, CAN_SKU_COMPLETO, l.sku);
      poner(fila, 'Qty.', String(l.qty === '' || l.qty == null ? '' : l.qty));
      poner(fila, CAN_OBS, 'Sobreventa en ' + (l.hoja || canSobHoja_()) + ': ' + l.ref + (l.nombre ? ' · ' + l.nombre.substring(0, 90) : ''));
      poner(fila, CAN_CHECK, origen !== CAN_ORI_PRUEBA);
      datos.push(fila);
    });
  });
  if (!datos.length) return 0;
  var ini = h.getLastRow() + 1;
  if (h.getMaxRows() < ini + datos.length) h.insertRowsAfter(h.getMaxRows(), ini + datos.length - h.getMaxRows());
  h.getRange(ini, 1, datos.length, ancho).setNumberFormat('@');
  h.getRange(ini, m[normEnc_('FECHA LECTURA')], datos.length, 1).setNumberFormat('dd/mm/yyyy');
  h.getRange(ini, m[normEnc_('FECHA CORREO')], datos.length, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  h.getRange(ini, 1, datos.length, ancho).setValues(datos);
  SpreadsheetApp.flush();
  try { canFormato_(h); } catch (e) { logWarn_(CAN_ETAPA, 'No se pudo dar formato: ' + e.message); }
  return datos.length;
}

/** Dia real: las filas de PRUEBA de una venta que sigue en sobreventa pasan a SOBREVENTA (casilla prendida). */
function canSobConvertir_(h, ordenes, ya) {
  var m = canMapaHoja_(h).mapa, cOri = m[normEnc_(CAN_ORIGEN)], cChk = m[normEnc_(CAN_CHECK)], cEst = m[normEnc_(CAN_ESTADO)];
  ordenes.forEach(function (o) {
    (ya[o] || []).forEach(function (x) {
      if (cOri) h.getRange(x.fila, cOri).setValue(CAN_ORI_SOB);
      if (cChk) h.getRange(x.fila, cChk).setValue(true);
      if (cEst) h.getRange(x.fila, cEst).setValue('');
    });
  });
  SpreadsheetApp.flush();
}

/**
 * Paso de sobreventa (con el candado ya tomado). Vuelve a bajar la sobreventa de Odoo y decide.
 * aplicar = true escribe en Cancelaciones; false solo calcula (para ver antes, desde el menu).
 * Devuelve { modo, nuevas:[{orden, skus}], soloCva:[{orden, skus}], yaEstaban:[ordenes], tope, error, sinOrigen }.
 */
function canSobPaso_(h, aplicar) {
  var real = canSobModoReal_();
  var r = { modo: real ? 'REAL' : 'PRUEBA', nuevas: [], soloCva: [], yaEstaban: [], tope: false, error: '', sinOrigen: 0 };
  try { sobreventa_(); }
  catch (e) { r.error = 'No se pudo bajar la sobreventa de Odoo: ' + String(e && e.message || e).split('\n')[0].substring(0, 160); return r; }
  var s = canSobLeer_();
  r.sinOrigen = s.sinOrigen;
  r.soloCva = s.soloCva.map(function (o) { return { orden: o, skus: canSobSkus_(s.ventas[o]) }; });
  var ya = canOrdenesEnHoja_(h), nuevas = [], convertir = [];
  s.cancelar.forEach(function (o) {
    var filas = ya[o];
    if (!filas) { nuevas.push(o); return; }
    var soloPrueba = filas.every(function (x) { return x.origen === CAN_ORI_PRUEBA; });
    if (real && soloPrueba) convertir.push(o); else r.yaEstaban.push(o);
  });
  var todas = nuevas.concat(convertir);
  r.nuevas = todas.map(function (o) { return { orden: o, skus: canSobSkus_(s.ventas[o]) }; });
  if (todas.length > CAN_SOB_TOPE) { r.tope = true; return r; }
  if (!aplicar || !todas.length) return r;
  if (nuevas.length) canSobAgregar_(h, nuevas, s.ventas, real ? CAN_ORI_SOB : CAN_ORI_PRUEBA);
  if (convertir.length) canSobConvertir_(h, convertir, ya);
  return r;
}

function canSobLista_(xs, max) {
  max = max || 10;
  return xs.slice(0, max).map(function (x) { return x.orden + ' (' + x.skus + ')'; }).join(' | ') + (xs.length > max ? ' | ... y ' + (xs.length - max) + ' mas' : '');
}

/**
 * Resumen del dia en el Log (lo usa el reporte): cuantas se cancelaron por correo y cuantas por sobreventa,
 * cuales hay que cancelar en el Seller Center y cuales se quedaron por -CVA.
 */
function canSobResumen_(h, objetivos, sob) {
  var porCorreo = 0, sobCanceladas = [];
  var n = h.getLastRow() - 1;
  if (n > 0 && objetivos.length) {
    var m = canMapaHoja_(h).mapa;
    var ord = canColVals_(h, canColOrden_(m), n), est = canColVals_(h, m[normEnc_(CAN_ESTADO)], n),
        ori = canColVals_(h, m[normEnc_(CAN_ORIGEN)], n), sku = canColVals_(h, m[normEnc_(CAN_SKU_COMPLETO)], n);
    var buscadas = {}, contadas = {};
    objetivos.forEach(function (x) { buscadas[x.orden] = true; });
    for (var i = 0; i < n; i++) {
      var o = canTextoOrden_(ord[i]);
      if (!buscadas[o] || !/^CANCELADO/.test(String(est[i] || ''))) continue;
      var esSob = String(ori[i] || '').toUpperCase() === CAN_ORI_SOB;
      if (!contadas[o]) {
        contadas[o] = esSob ? { orden: o, skus: [] } : true;
        if (esSob) sobCanceladas.push(contadas[o]); else porCorreo++;
      }
      if (esSob && contadas[o] !== true) contadas[o].skus.push(String(sku[i] || ''));
    }
    sobCanceladas.forEach(function (x) { x.skus = x.skus.filter(String).join(', '); });
  }
  var partes = ['por correo: ' + porCorreo + ' canceladas', 'por sobreventa: ' + sobCanceladas.length + ' canceladas'];
  if (sobCanceladas.length) partes.push('CANCELAR EN SELLER CENTER (sobreventa automatica, sin -CVA): ' + canSobLista_(sobCanceladas, 20));
  if (sob.modo === 'PRUEBA' && sob.nuevas.length) partes.push('PRUEBA (no se cancelo): se cancelarian ' + sob.nuevas.length + ': ' + canSobLista_(sob.nuevas));
  if (sob.soloCva.length) partes.push('sobreventa con -CVA (no se cancela): ' + sob.soloCva.length + ': ' + canSobLista_(sob.soloCva));
  logOk_(CAN_ETAPA, 'Resumen 6-7am · ' + partes.join(' · '),
    { modo: sob.modo, porCorreo: porCorreo, porSobreventa: sobCanceladas, prueba: sob.modo === 'PRUEBA' ? sob.nuevas : [], soloCva: sob.soloCva, yaEstaban: sob.yaEstaban });
  // Linea aparte y corta para el reporte diario: cuantas y cuales ventas NO CVA se cancelaron por sobreventa (solo numeros, para copiarlos al Seller Center)
  logOk_(CAN_ETAPA, 'SOBREVENTA NO CVA CANCELADAS EN ODOO: ' + sobCanceladas.length + (sobCanceladas.length ? ' · cancelar en Seller Center: ' + sobCanceladas.map(function (x) { return x.orden; }).join(', ') : ''),
    { ventas: sobCanceladas.map(function (x) { return x.orden; }), modo: sob.modo });
  if (sob.tope) {
    logErr_(CAN_ETAPA, 'Sobreventa: ' + sob.nuevas.length + ' ventas nuevas (tope ' + CAN_SOB_TOPE + '): no se agrego ni se cancelo NINGUNA. Revisa la hoja ' +
            canSobHoja_() + ' (puede ser una falla de inventario en Odoo).', { ventas: sob.nuevas });
  }
  if (sob.error) logWarn_(CAN_ETAPA, 'Sobreventa: ' + sob.error + '. Hoy no se cancelo nada por sobreventa.');
  if (sob.sinOrigen) logWarn_(CAN_ETAPA, 'Sobreventa: ' + sob.sinOrigen + ' linea(s) sin Documento origen en ' + canSobHoja_() + ': no se pueden cancelar solas.');
}

/** Menu: muestra que cancelaria la sobreventa en la corrida de 6-7am. Baja la sobreventa de Odoo; NO cancela ni escribe en Cancelaciones. */
function cancelacionesSobreventaVer() {
  var ui = SpreadsheetApp.getUi();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_ESPERA_MS)) { toast_('Otra corrida en curso. Intenta en un minuto.', 'CANCELACIONES', 8); return; }
  try {
    var r = canSobPaso_(getHoja_(CAN_HOJA), false);
    if (r.error) { ui.alert('Sobreventa', r.error, ui.ButtonSet.OK); return; }
    var t = 'Modo: ' + (r.modo === 'REAL' ? 'REAL (cancela en Odoo a las 6-7am)' : 'PRUEBA (solo anota; cancela de verdad desde el ' + CAN_SOB_REAL_DESDE + ')') + '\n\n';
    t += 'Se cancelarian completas: ' + r.nuevas.length + (r.nuevas.length ? '\n  ' + r.nuevas.map(function (x) { return x.orden + '  ' + x.skus; }).join('\n  ') : '') + '\n\n';
    t += 'Con -CVA (se quedan solo en ' + canSobHoja_() + '): ' + r.soloCva.length + (r.soloCva.length ? '\n  ' + r.soloCva.map(function (x) { return x.orden + '  ' + x.skus; }).join('\n  ') : '') + '\n\n';
    t += 'Ya estaban en Cancelaciones: ' + r.yaEstaban.length;
    if (r.tope) t += '\n\nTOPE: son mas de ' + CAN_SOB_TOPE + ' ventas nuevas. La corrida de 6-7am NO cancelaria ninguna y dejaria ERROR en el Log.';
    if (r.sinOrigen) t += '\n\n' + r.sinOrigen + ' linea(s) sin Documento origen: no se pueden cancelar solas.';
    logInfo_(CAN_ETAPA, 'Vista de sobreventa (modo ' + r.modo + '): se cancelarian ' + r.nuevas.length + (r.nuevas.length ? ': ' + canSobLista_(r.nuevas) : '') + ' · con -CVA (no se cancelan solas): ' + r.soloCva.length + (r.soloCva.length ? ': ' + canSobLista_(r.soloCva) : '') + ' · ya estaban en Cancelaciones: ' + r.yaEstaban.length + (r.tope ? ' · TOPE superado' : ''));
    ui.alert('Sobreventa -> Cancelaciones', t.substring(0, 4000), ui.ButtonSet.OK);
  } catch (e) {
    logErr_(CAN_ETAPA, 'Vista de sobreventa fallo: ' + String(e.message || e).split('\n')[0]);
    ui.alert('Fallo', String(e.message || e).split('\n')[0], ui.ButtonSet.OK);
  } finally {
    try { flushLog_(); } catch (x) {}
    lock.releaseLock();
  }
}


/**
 * Menu: cancela en Odoo TODAS las ventas con la casilla CANCELAR EN ODOO marcada en las hojas de sobreventa
 * (Pick o WFS), con o sin "-CVA": la casilla es la orden del usuario. Mismo mecanismo que Cancelaciones
 * (queda una fila con ORIGEN = SOBREVENTA CVA o SOBREVENTA MANUAL, mismas revisiones, relectura del estado en Odoo).
 * La venta se cancela COMPLETA. Despues se desmarcan las casillas de las que Odoo ya dice canceladas y se vuelve a bajar
 * la sobreventa: las canceladas salen de las hojas de sobreventa y quedan solo en Cancelaciones.
 */
function cancelacionesSobreventaMarcadas() {
  var ui = SpreadsheetApp.getUi();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_ESPERA_MS)) { toast_('Otra corrida en curso. Intenta en un minuto.', 'CANCELACIONES', 8); return; }
  var pin = '';
  try {
    if (!canOdooConectado_()) { ui.alert('Odoo no esta conectado: menu Configuracion > Conectar Odoo.'); return; }
    var persona = props_().getProperty(CAN_PROP_PERSONA) || CAN_PERSONA_DEFECTO;
    pin = props_().getProperty(CAN_PROP_PIN);
    if (!pin) { ui.alert('Falta guardar quien cancela y el PIN: menu Cancelaciones > Guardar PIN y quien cancela.'); return; }

    var s = { ventas: {}, cancelar: [], soloCva: [], sinOrigen: 0 };
    SOBREVENTA.DESTINOS.forEach(function (d) { canSobLeer_(d.hoja, true, s); });
    var ordenes = Object.keys(s.ventas);
    if (!ordenes.length) { ui.alert('Sobreventa', 'No hay casillas marcadas en las hojas de sobreventa.' + (s.sinOrigen ? '\n\n' + s.sinOrigen + ' marcada(s) sin Documento origen: no se pueden cancelar.' : ''), ui.ButtonSet.OK); return; }
    if (ordenes.length > CAN_MAX_POR_CORRIDA) { ui.alert('Demasiadas', 'Marcaste ' + ordenes.length + ' ventas; el maximo por vez es ' + CAN_MAX_POR_CORRIDA + '. Desmarca algunas y vuelve a correrlo.', ui.ButtonSet.OK); return; }

    var lista = ordenes.slice(0, 15).map(function (o) { return o + '  ' + canSobSkus_(s.ventas[o]) + (s.ventas[o].noCva ? '' : '  (-CVA)'); }).join('\n');
    var r = ui.alert('Cancelar en Odoo (sobreventa)',
      'Vas a CANCELAR COMPLETAS ' + ordenes.length + ' venta(s) en Odoo con tu usuario y PIN, aunque traigan -CVA:\n\n' + lista +
      (ordenes.length > 15 ? '\n... y ' + (ordenes.length - 15) + ' mas' : '') + '\n\nRecuerda cancelarlas tambien en el Seller Center.\n\n¿Continuar?', ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;

    var h = getHoja_(CAN_HOJA);
    var accion = canAccionConfirmar_();
    toast_('Cancelando en Odoo...', 'CANCELACIONES', 120);
    logStart_(CAN_ETAPA, 'Cancelando por sobreventa (marcadas a mano) ' + ordenes.length + ' ventas');

    // 1) dejar cada venta en Cancelaciones con su casilla prendida
    // ORIGEN: SOBREVENTA CVA si la venta trae un SKU con -CVA; SOBREVENTA MANUAL si no (cada uno con su color)
    var oriDe = function (o) { return s.ventas[o].lineas.some(function (l) { return canSobEsCva_(l.sku); }) ? CAN_ORI_SOB_CVA : CAN_ORI_SOB_MANUAL; };
    var ya = canOrdenesEnHoja_(h), nuevas = [];
    ordenes.forEach(function (o) { if (!ya[o]) nuevas.push(o); });
    [CAN_ORI_SOB_CVA, CAN_ORI_SOB_MANUAL].forEach(function (ori) {
      var grupo = nuevas.filter(function (o) { return oriDe(o) === ori; });
      if (grupo.length) canSobAgregar_(h, grupo, s.ventas, ori);
    });
    var m0 = canMapaHoja_(h).mapa, cOri = m0[normEnc_(CAN_ORIGEN)], cChk = m0[normEnc_(CAN_CHECK)];
    ordenes.forEach(function (o) {
      (ya[o] || []).forEach(function (x) {
        if (cChk) h.getRange(x.fila, cChk).setValue(true);
        if (cOri && x.origen === CAN_ORI_PRUEBA) h.getRange(x.fila, cOri).setValue(oriDe(o));
      });
    });
    SpreadsheetApp.flush();

    // 2) las filas pendientes de esas ventas y cancelar con el flujo de siempre
    var m = canMapaHoja_(h).mapa, n = h.getLastRow() - 1;
    var ord = canColVals_(h, canColOrden_(m), n), est = canColVals_(h, m[normEnc_(CAN_ESTADO)], n);
    var pedidas = {}; ordenes.forEach(function (o) { pedidas[o] = true; });
    var objetivos = [];
    for (var i = 0; i < n; i++) {
      var o = canTextoOrden_(ord[i]);
      if (pedidas[o] && !/^CANCELADO/.test(String(est[i] || ''))) objetivos.push({ fila: i + 2, orden: o });
    }
    var rs = objetivos.length ? canCancelarFilas_(h, objetivos, accion, persona, pin, 'sobreventa marcada a mano') : { canceladas: 0, nErr: 0 };

    // 3) desmarcar las casillas de las ventas que ya estan canceladas en Odoo
    est = canColVals_(h, m[normEnc_(CAN_ESTADO)], h.getLastRow() - 1); ord = canColVals_(h, canColOrden_(m), h.getLastRow() - 1);
    var hechas = {};
    for (var k = 0; k < ord.length; k++) { if (/^CANCELADO/.test(String(est[k] || ''))) hechas[canTextoOrden_(ord[k])] = true; }
    var desmarcadas = 0;
    SOBREVENTA.DESTINOS.forEach(function (d) { desmarcadas += canSobDesmarcar_(d.hoja, hechas); });
    // 4) volver a bajar la sobreventa: las canceladas ya no estan en espera en Odoo y salen de las hojas ahora mismo
    try { sobreventa_(); } catch (er) { logWarn_(CAN_ETAPA, 'No se pudo refrescar la sobreventa tras cancelar (se refresca sola en 30 min): ' + String(er.message || er).split('\n')[0]); }
    flushLog_();
    var ok = ordenes.filter(function (o) { return hechas[o]; }), mal = ordenes.filter(function (o) { return !hechas[o]; });
    logOk_(CAN_ETAPA, 'Sobreventa marcada a mano: ' + ok.length + ' canceladas, ' + mal.length + ' sin cancelar' +
      (ok.length ? ' · CANCELAR EN SELLER CENTER (marcadas a mano): ' + ok.join(', ') : ''), { canceladas: ok, sinCancelar: mal });
    flushLog_();
    ui.alert('Resultado',
      ok.length + ' venta(s) canceladas en Odoo' + (ok.length ? ':\n  ' + ok.join('\n  ') + '\n\nCancelalas tambien en el Seller Center.' : '.') +
      (mal.length ? '\n\nSin cancelar (' + mal.length + '): ver ESTADO ODOO y NOTA ODOO en la hoja Cancelaciones:\n  ' + mal.join('\n  ') : ''), ui.ButtonSet.OK);
  } catch (e) {
    var txt = canTextoError_(e, pin);
    logErr_(CAN_ETAPA, 'Fallo al cancelar la sobreventa marcada: ' + txt);
    try { flushLog_(); } catch (x) {}
    ui.alert('Fallo', txt, ui.ButtonSet.OK);
  } finally {
    lock.releaseLock();
  }
}

/** Desmarca la casilla de las lineas cuya venta (Documento origen) esta en `hechas`. Devuelve cuantas. */
function canSobDesmarcar_(hoja, hechas) {
  var h = getSpreadsheet_().getSheetByName(hoja);
  if (!h || h.getLastRow() < 2) return 0;
  var c = colsHoja_(h, ['Documento origen'], [SOB_COL_CHECK]);
  if (c[SOB_COL_CHECK] < 0) return 0;
  var n = h.getLastRow() - 1, datos = h.getRange(2, 1, n, Math.max(h.getLastColumn(), 1)).getValues(), cuantas = 0;
  datos.forEach(function (f, i) {
    if (f[c[SOB_COL_CHECK]] === true && hechas[canTextoOrden_(f[c['Documento origen']])]) {
      h.getRange(i + 2, c[SOB_COL_CHECK] + 1).setValue(false); cuantas++;
    }
  });
  return cuantas;
}
