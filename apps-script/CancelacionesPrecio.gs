/**
 * ============================================================
 *  Cancelaciones por PRECIO ERRONEO  (Precios erroneos -> hoja Cancelaciones)
 * ============================================================
 *
 *  Regla: TODA venta de Walmart bajo el minimo (Precios erroneos, semaforo BAJO MINIMO; los killers cuentan con su % de
 *  perdida de "Killers bajo minimo") que todavia se puede detener (sin cancelar y sin guia) se agrega sola a la hoja
 *  Cancelaciones con ORIGEN = PRECIO ERRONEO. La casilla CANCELAR EN ODOO decide si se cancela:
 *    - pierde MAS de 5%    -> entra con la casilla MARCADA: la extension la cancela en el site (y de ahi Odoo) sola.
 *    - pierde 5% o menos   -> entra con la casilla APAGADA: no se cancela; TU decides y si la marcas se cancela en la siguiente vuelta.
 *  (5% exacto lo decides tu: solo lo que pasa de 5.000000% se cancela solo.)
 *  Cancelar en Walmart (Seller Center) lo haces tu; este script no cancela nada en Walmart.
 *  Una venta ya agregada no se vuelve a agregar.
 */

var CANP_TOPE_AUTO = -0.05;   // pierde MAS que esto (fraccion negativa) -> casilla marcada y se cancela sola

/** true si la perdida (fraccion negativa, ej. -0.07) pasa del tope: se compara a 6 decimales para que 5% exacto NO se cancele solo. */
function canpAuto_(pct) {
  var p = Number(pct);
  if (isNaN(p)) return false;
  return Math.round(p * 1e6) / 1e6 < CANP_TOPE_AUTO;
}

var CAN_ORI_PRECIO = 'PRECIO ERRONEO';
var CANP_TOPE_FILAS = 15;     // maximo de filas nuevas por corrida (si hay mas, algo raro paso con los minimos)

/** Texto corto de la fila: precio vendido contra minimo. */
function canpNota_(v) {
  var pct = Math.round(Math.abs(Number(v.pct) || 0) * 1000) / 10;
  return 'Precio erroneo: vendida a $' + Math.round(Number(v.precio) || 0) + ' con minimo $' + Math.round(Number(v.minimo) || 0) + ' (' + pct + '% abajo)' +
    (canpAuto_(v.pct) ? '' : ' · pierde 5% o menos: marca CANCELAR EN ODOO si la quieres cancelar');
}

/**
 * Arma las filas nuevas (puro, sin tocar la hoja). `mapa` = {ENCABEZADO NORMALIZADO: columna 1-based}.
 * `existentes` = { orden: true }. Devuelve { filas: [[...]], ordenes: [..], yaEstaban: n }.
 */
function canpFilas_(ventas, mapa, ancho, existentes, ahora, hoyFecha) {
  var out = { filas: [], ordenes: [], yaEstaban: 0, auto: [], espera: [] };
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
    var auto = canpAuto_(v.pct);
    poner(fila, CAN_CHECK, auto);
    out.filas.push(fila); out.ordenes.push(o);
    if (auto) out.auto.push(o); else out.espera.push(o);
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
  res.agregadas = r.ordenes; res.auto = r.auto; res.espera = r.espera;
  logWarn_(CAN_ETAPA, 'Precio erroneo: ' + r.ordenes.length + ' venta(s) agregadas a Cancelaciones. ' +
    (r.auto.length ? 'Se cancelan solas (pierden mas de 5%): ' + r.auto.join(', ') + '. ' : '') +
    (r.espera.length ? 'Esperan tu casilla CANCELAR EN ODOO (pierden 5% o menos): ' + r.espera.join(', ') + '. ' : '') +
    'En Walmart las cancelas tu.', { ordenes: r.ordenes, auto: r.auto, espera: r.espera });
  return res;
}
