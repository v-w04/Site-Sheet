/**
 * ============================================================
 *  Cancelaciones por PRECIO ERRONEO  (Precios erroneos -> hoja Cancelaciones)
 * ============================================================
 *
 *  Regla: una venta de Walmart que quedo MAS DE 3% POR DEBAJO del minimo (Precios erroneos, semaforo BAJO MINIMO)
 *  y que todavia se puede detener (sin cancelar y sin guia) se agrega sola a la hoja Cancelaciones con
 *  ORIGEN = PRECIO ERRONEO. Entran con las casillas APAGADAS: TU decides, venta por venta:
 *    - CANCELAR EN ODOO     -> la cancela la extension en el site (y de ahi Odoo), como el resto de Cancelaciones.
 *    - CANCELAR EN WALMART  -> menu Pedidos y casos > Cancelaciones > CANCELAR EN WALMART las marcadas (API de Walmart).
 *  Las que pierden 3% o menos no entran: se pueden seguir vendiendo. Una venta ya agregada no se vuelve a agregar.
 */

var CAN_ORI_PRECIO = 'PRECIO ERRONEO';
var CANP_TOPE_FILAS = 15;     // maximo de filas nuevas por corrida (si hay mas, algo raro paso con los minimos)

/** Texto corto de la fila: precio vendido contra minimo. */
function canpNota_(v) {
  var pct = Math.round(Math.abs(Number(v.pct) || 0) * 1000) / 10;
  return 'Precio erroneo: vendida a $' + Math.round(Number(v.precio) || 0) + ' con minimo $' + Math.round(Number(v.minimo) || 0) + ' (' + pct + '% abajo)';
}

/**
 * Arma las filas nuevas (puro, sin tocar la hoja). `mapa` = {ENCABEZADO NORMALIZADO: columna 1-based}.
 * `existentes` = { orden: true }. Devuelve { filas: [[...]], ordenes: [..], yaEstaban: n }.
 */
function canpFilas_(ventas, mapa, ancho, existentes, ahora, hoyFecha) {
  var out = { filas: [], ordenes: [], yaEstaban: 0 };
  var visto = {};
  var poner = function (fila, enc, v) { var c = mapa[normEnc_(enc)]; if (c) fila[c - 1] = v; };
  (ventas || []).forEach(function (v) {
    var o = String(v.orden || '').replace(/\.0$/, '').trim();
    if (!o) return;
    if (existentes[o] || visto[o]) { out.yaEstaban++; return; }
    visto[o] = true;
    var fila = new Array(ancho).fill('');
    poner(fila, 'FECHA LECTURA', hoyFecha);
    poner(fila, 'FECHA CORREO', ahora);
    poner(fila, 'ID CORREO', 'PRECIO-' + o);
    poner(fila, CAN_ORIGEN, CAN_ORI_PRECIO);
    poner(fila, 'ORDEN DE COMPRA#', o);
    poner(fila, 'PEDIDO#', String(v.pedido || ''));
    poner(fila, CAN_SKU_COMPLETO, String(v.sku || ''));
    poner(fila, 'SKU', String(v.sku || ''));
    poner(fila, 'QTY.', v.piezas === undefined ? '' : v.piezas);
    poner(fila, CAN_NOTA, canpNota_(v));
    poner(fila, CAN_CHECK, false);
    out.filas.push(fila); out.ordenes.push(o);
  });
  return out;
}

/** Agrega a Cancelaciones las ventas bajo el tope (casillas apagadas). Devuelve { agregadas: [ordenes], yaEstaban: n }. */
function canpAgregar_(ventas) {
  var res = { agregadas: [], yaEstaban: 0 };
  if (!ventas || !ventas.length) return res;
  var h = getHoja_(CAN_HOJA);
  canAsegurarColumnas_(h, CAN_FIJAS); canAsegurarControl_(h); canAsegurarOrigen_(h);
  var m = canMapaHoja_(h).mapa, cOrd = canColOrden_(m);
  if (!cOrd) cOrd = canAsegurarColumnas_(h, ['Orden de compra#'])[normEnc_('Orden de compra#')];
  m = canMapaHoja_(h).mapa;
  var existentes = {};
  if (h.getLastRow() > 1) h.getRange(2, cOrd, h.getLastRow() - 1, 1).getValues().forEach(function (r) { var o = canTextoOrden_(r[0]); if (o) existentes[o] = true; });
  var ancho = Math.max(h.getLastColumn(), 1);
  var lote = ventas.slice(0, 200);
  var r = canpFilas_(lote, m, ancho, existentes, new Date(), Utilities.parseDate(hoy_(), TZ, 'yyyy-MM-dd'));
  res.yaEstaban = r.yaEstaban;
  if (!r.filas.length) return res;
  if (r.filas.length > CANP_TOPE_FILAS) {
    logErr_(CAN_ETAPA, 'Precios erroneos: ' + r.filas.length + ' ventas nuevas bajo el tope de una vez (maximo ' + CANP_TOPE_FILAS + '). No se agrego ninguna: revisa los minimos en Precios EM / CVA Minimo.');
    return res;
  }
  var ini = h.getLastRow() + 1;
  escrAsegurarFilas_(h, ini, r.filas.length);
  h.getRange(ini, 1, r.filas.length, ancho).setNumberFormat('@');
  h.getRange(ini, 1, r.filas.length, ancho).setValues(r.filas);
  try { canFormato_(h); } catch (e) {}
  res.agregadas = r.ordenes;
  logWarn_(CAN_ETAPA, 'Precio erroneo (mas de 3% abajo del minimo): ' + r.ordenes.length + ' venta(s) agregadas a Cancelaciones con las casillas apagadas: ' + r.ordenes.join(', ') + '. Marca CANCELAR EN ODOO y/o CANCELAR EN WALMART las que quieras cancelar.', { ordenes: r.ordenes });
  return res;
}
