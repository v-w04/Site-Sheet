/**
 * ============================================================
 *  Casos Walmart — registro y seguimiento de casos con Walmart (traido de Venta Diaria Odoo)
 * ============================================================
 *
 *  Hoja "Casos Walmart": cada caso es una fila y NUNCA se borra; cuando se resuelve cambias ESTADO a CERRADO
 *  (y llenas RESOLUCION y FECHA CIERRE). Estados: POR ABRIR · ABIERTO · EN ESPERA WALMART · CERRADO.
 *  La llenas tu; el script solo AGREGA filas (POR ABRIR, DETECTADO = AUTO):
 *    - de Comparar Walmart: precio $0, SYSTEM_PROBLEM, no esta en Walmart, precio distinto a la carga, si el mismo
 *      error dura 12 h o mas; se registran solo en las revisiones de las 6:00 y las 12:00.
 *    - de Cobro distinto: cada SKU una sola vez.
 *  Solo agrega si el SKU no tiene ya un caso vigente. Comparar Walmart muestra el caso vigente en CASO WALMART.
 * ============================================================
 */

var CAW_HOJA = 'Casos Walmart', CAW_ETAPA = 'CASOS';
var CAW_ENC = ['FOLIO WALMART', 'FECHA ABIERTO', 'SKU', 'PRODUCTO', 'TIPO', 'MOTIVO', 'ESTADO', 'CORREO ENVIADO',
               'SEGUIMIENTO', 'RESOLUCION', 'FECHA CIERRE', 'DETECTADO'];
var CAW_HORAS_ERROR = 12, CAW_HORAS_REVISION = [6, 12];
var CAW_ESTADOS = ['POR ABRIR', 'ABIERTO', 'EN ESPERA WALMART', 'CERRADO'];
var CAW_COLOR = { 'POR ABRIR': '#fff2cc', 'ABIERTO': '#fce5cd', 'EN ESPERA WALMART': '#cfe2f3', 'CERRADO': '#d9d9d9' };
var CAW_SEMILLA = ['LOG-910007565-NEG-7548-MSI', 'LOG-920012593-BLA-4060-MSI'];   // Walmart los deja en $0 (bug conocido)

function cawHoy_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }

/** Fila de caso nueva (objeto por encabezado). */
function cawFila_(sku, producto, tipo, motivo, detectado) {
  return { 'FECHA ABIERTO': cawHoy_(), 'SKU': sku, 'PRODUCTO': producto || '', 'TIPO': tipo, 'MOTIVO': motivo, 'ESTADO': 'POR ABRIR', 'CORREO ENVIADO': 'NO', 'DETECTADO': detectado };
}

/** Crea la hoja si falta (con la semilla y sus listas). No toca una hoja que ya tenga datos. */
function cawAsegurarHoja_() {
  var ss = vdLibro_(), h = ss.getSheetByName(CAW_HOJA);
  if (h && h.getLastRow() > 1) return h;
  h = peHojaAsegurar_(CAW_HOJA, CAW_ENC);
  if (h.getLastRow() < 2 && vdProp_('CAW_SEMBRADA') !== '1') {
    peAgregar_(h, CAW_ENC, CAW_SEMILLA.map(function (s) { return cawFila_(s, '', 'PRECIO EN $0 EN WALMART', 'El precio queda en $0 en Walmart (bug de Walmart): enviar correo y abrir caso', 'MANUAL'); }));
    vdSetProp_('CAW_SEMBRADA', '1');
    try { cawFormato_(h); } catch (e) { logWarn_(CAW_ETAPA, 'No se pudo poner listas y colores: ' + String(e.message).split('\n')[0]); }
  }
  return h;
}

/** { SKU: {folio, estado} } de los casos vigentes (ESTADO distinto de CERRADO). */
function cawVigentes_() {
  var out = {}, t = peTabla_(CAW_HOJA);
  if (!t) return out;
  var iS = peCol_(t, ['SKU']), iF = peCol_(t, ['FOLIO WALMART']), iE = peCol_(t, ['ESTADO']);
  if (iS < 0) return out;
  t.filas.forEach(function (f) {
    var s = peSku_(f[iS]); if (!s) return;
    var est = iE < 0 ? '' : String(f[iE] || '').trim();
    if (normEnc_(est) === 'CERRADO') return;
    out[s] = { folio: iF < 0 ? '' : String(f[iF] || '').trim(), estado: est || 'POR ABRIR' };
  });
  return out;
}

/** Texto para CASO WALMART de Comparar ('' si no hay caso vigente). */
function cawTexto_(casos, sku) {
  var c = casos && casos[sku];
  if (!c) return '';
  return (c.folio ? 'Caso ' + c.folio : 'Caso sin folio') + ' · ' + c.estado;
}

/** ¿Toca registrar? Una vez por cada revision del dia (la primera corrida desde las 6:00 y desde las 12:00). */
function cawTocaRevision_(prop) {
  var hora = Number(Utilities.formatDate(new Date(), TZ, 'H')), ranura = null;
  CAW_HORAS_REVISION.forEach(function (h) { if (hora >= h) ranura = h; });
  if (ranura === null) return false;
  var llave = cawHoy_() + '|' + ranura;
  if (vdProp_(prop) === llave) return false;
  vdSetProp_(prop, llave);
  return true;
}

/** Errores de hoy [{sku, producto, tipo, detalle}]: agrega los que llevan 12 h o mas y no tienen caso. Devuelve cuantos. */
function cawDetectar_(errores, casos) {
  var visto = {};
  try { visto = JSON.parse(vdProp_('CAW_ERRORES_VISTOS') || '{}'); } catch (e) { visto = {}; }
  var ahora = Date.now(), nuevo = {}, porSku = {}, toca = cawTocaRevision_('CAW_ULTIMA_REVISION');
  errores.forEach(function (x) {
    var k = x.sku + '|' + x.tipo, desde = visto[k] || ahora;
    nuevo[k] = desde;
    if (!toca || ahora - desde < CAW_HORAS_ERROR * 3600000 || casos[x.sku]) return;
    var e = porSku[x.sku] || (porSku[x.sku] = { producto: x.producto, tipos: [], detalles: [] });
    e.tipos.push(x.tipo); if (x.detalle) e.detalles.push(x.detalle);
  });
  var txt = JSON.stringify(nuevo);
  if (txt.length > 8500) txt = '{}';    // tope de una Script Property; se vuelve a contar desde cero
  vdSetProp_('CAW_ERRORES_VISTOS', txt);
  var skus = Object.keys(porSku);
  if (!skus.length) return 0;
  var h = cawAsegurarHoja_();
  peAgregar_(h, CAW_ENC, skus.map(function (s) {
    var e = porSku[s];
    return cawFila_(s, e.producto, e.tipos.join(' + '), 'Detectado por el script (' + CAW_HORAS_ERROR + ' h o más)' + (e.detalles.length ? ': ' + e.detalles.join('; ') : ''), 'AUTO ' + cawHoy_());
  }));
  logWarn_(CAW_ETAPA, skus.length + ' caso(s) nuevo(s) por abrir con Walmart', { skus: skus });
  return skus.length;
}

/** Cobro distinto: cada SKU se registra UNA vez como caso por abrir. */
function cawDetectarCobro_() {
  var primera = vdProp_('CAW_COBRO_INICIAL') !== '1';
  if (!primera && !cawTocaRevision_('CAW_ULTIMA_REVISION_COBRO')) return 0;
  vdSetProp_('CAW_COBRO_INICIAL', '1');
  var cd = vdCobroDistinto_(), t = peTabla_(CAW_HOJA), ya = {};
  if (t) {
    var iS = peCol_(t, ['SKU']), iT = peCol_(t, ['TIPO']);
    if (iS >= 0 && iT >= 0) t.filas.forEach(function (f) { if (normEnc_(f[iT]).indexOf('COBRO DISTINTO') >= 0) ya[peSku_(f[iS])] = true; });
  }
  var filas = [];
  Object.keys(cd).forEach(function (s) {
    if (ya[s]) return;
    var c = cd[s], det = [];
    if (c.pedidos !== '' && c.pedidos !== undefined) det.push(c.pedidos + ' pedido(s)');
    if (c.pesos !== '' && c.pesos !== undefined) det.push('$' + c.pesos + ' cobrados de más');
    if (c.causa) det.push(String(c.causa));
    filas.push(cawFila_(s, '', 'COBRO DISTINTO', 'Walmart cobró distinto a lo debido' + (det.length ? ': ' + det.join(' · ') : ''), 'AUTO ' + cawHoy_()));
  });
  if (!filas.length) return 0;
  peAgregar_(cawAsegurarHoja_(), CAW_ENC, filas);
  logWarn_(CAW_ETAPA, filas.length + ' caso(s) nuevo(s) por abrir (cobro distinto)', { skus: filas.map(function (f) { return f.SKU; }) });
  return filas.length;
}

/** Listas (ESTADO, CORREO ENVIADO) y color de ESTADO, por encabezado, solo en esas columnas. Idempotente. */
function cawFormato_(sh) {
  var h = sh || vdLibro_().getSheetByName(CAW_HOJA);
  if (!h) return;
  var m = ubicarColumnas_(h, CAW_ENC, 1), filas = 1999;
  var cE = escrCol_(m, 'ESTADO'), cC = escrCol_(m, 'CORREO ENVIADO');
  if (h.getMaxRows() < filas + 1) h.insertRowsAfter(h.getMaxRows(), filas + 1 - h.getMaxRows());
  if (cE) {
    var rango = h.getRange(2, cE, filas, 1);
    rango.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(CAW_ESTADOS, true).setAllowInvalid(true).build());
    var propias = function (r) {
      var rs = r.getRanges(), cond = r.getBooleanCondition();
      var vals = cond ? cond.getCriteriaValues() : [];
      return rs.length === 1 && rs[0].getColumn() === cE && vals.length === 1 && CAW_ESTADOS.indexOf(String(vals[0])) >= 0;
    };
    var reglas = h.getConditionalFormatRules().filter(function (r) { return !propias(r); });
    CAW_ESTADOS.forEach(function (e) { reglas.push(SpreadsheetApp.newConditionalFormatRule().setRanges([rango]).whenTextEqualTo(e).setBackground(CAW_COLOR[e]).build()); });
    h.setConditionalFormatRules(reglas);
  }
  if (cC) h.getRange(2, cC, filas, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['SI', 'NO'], true).setAllowInvalid(true).build());
}

/** Menu: revisa ya (cobro distinto + lo que diga Comparar) y pone listas y colores. */
function casosWalmartRevisar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(90000)) { dlgInfo_('Casos Walmart', 'Otra corrida tiene el candado. Espera un minuto y vuelve a darle.', 'aviso'); return; }
  try {
    var h = cawAsegurarHoja_();
    vdSetProp_('CAW_ULTIMA_REVISION_COBRO', '');
    var nCobro = cawDetectarCobro_();
    cawFormato_(h);
    var vig = cawVigentes_();
    var txt = 'Casos vigentes (no CERRADO): ' + Object.keys(vig).length + '\nNuevos por cobro distinto: ' + nCobro +
      '\n\nLos de Comparar Walmart (precio $0, SYSTEM_PROBLEM, precio distinto a la carga…) entran solos a las 6:00 y 12:00 si el error dura 12 h o más.';
    logOk_(CAW_ETAPA, 'Casos Walmart revisados: ' + Object.keys(vig).length + ' vigentes, ' + nCobro + ' nuevos por cobro distinto');
    flushLog_();
    h.activate();
    dlgInfo_('Casos Walmart', txt, 'ok');
  } catch (e) {
    logErr_(CAW_ETAPA, 'No se pudo revisar Casos Walmart: ' + String(e.message).split('\n')[0]);
    try { flushLog_(); } catch (x) {}
    dlgInfo_('Casos Walmart', 'Fallo: ' + String(e.message).split('\n')[0], 'error');
  } finally { lock.releaseLock(); }
}

/** Traer TODO de Venta Diaria: copia CASOS WALMART (sin duplicar por SKU + TIPO + FECHA ABIERTO). Devuelve texto. */
function cawTraerDeVentaDiaria_() {
  var o = peLeerViejo_(SpreadsheetApp.openById(VD_LIBRO_VIEJO), 'CASOS WALMART');
  if (!o) return 'no habia casos en Venta Diaria';
  var h = peHojaAsegurar_(CAW_HOJA, CAW_ENC), t = peTabla_(CAW_HOJA), ya = {};
  var llave = function (s, tp, f) { return peSku_(s) + '|' + normEnc_(tp) + '|' + String(f instanceof Date ? Utilities.formatDate(f, TZ, 'yyyy-MM-dd') : f).slice(0, 10); };
  var vigente = function (est) { return normEnc_(est) !== 'CERRADO'; };
  if (t) {
    var iS = peCol_(t, ['SKU']), iT = peCol_(t, ['TIPO']), iF = peCol_(t, ['FECHA ABIERTO']), iE = peCol_(t, ['ESTADO']);
    t.filas.forEach(function (f) {
      var tp = iT < 0 ? '' : f[iT];
      ya[llave(f[iS], tp, iF < 0 ? '' : f[iF])] = true;
      if (vigente(iE < 0 ? '' : f[iE])) ya[peSku_(f[iS]) + '|' + normEnc_(tp) + '|VIGENTE'] = true;   // la semilla de aqui y la de alla no se duplican
    });
  }
  var nuevas = [];
  o.filas.forEach(function (r) {
    var s = peGet_(o, r, ['SKU']); if (!peSku_(s)) return;
    var k = llave(s, peGet_(o, r, ['TIPO']), peGet_(o, r, ['FECHA ABIERTO']));
    var kv = peSku_(s) + '|' + normEnc_(peGet_(o, r, ['TIPO'])) + '|VIGENTE';
    if (ya[k] || (vigente(peGet_(o, r, ['ESTADO'])) && ya[kv])) return;
    ya[k] = true;
    var f = {}; CAW_ENC.forEach(function (e) { f[e] = peGet_(o, r, [e]); });
    nuevas.push(f);
  });
  if (nuevas.length) peAgregar_(h, CAW_ENC, nuevas);
  vdSetProp_('CAW_SEMBRADA', '1');
  try { cawFormato_(h); } catch (e) {}
  return nuevas.length + ' caso(s) nuevo(s) de ' + o.filas.length;
}
