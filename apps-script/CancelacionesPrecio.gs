/**
 * ============================================================
 *  Cancelaciones por PRECIO ERRONEO  (Precios erroneos -> hoja Cancelaciones)
 * ============================================================
 *
 *  Regla: una venta de Walmart bajo el minimo (Precios erroneos, semaforo BAJO MINIMO; los killers cuentan con su % de
 *  perdida de "Killers bajo minimo") que todavia se puede detener (sin cancelar y sin guia) se agrega sola a la hoja
 *  Cancelaciones con ORIGEN = PRECIO ERRONEO, segun cuanto pierde (los dos topes estan abajo y se cambian en una linea):
 *    - pierde CANP_ENTRA_PCT (3%) o menos        -> se permite: NO entra a Cancelaciones.
 *    - pierde mas de 3% y hasta CANP_AUTO_PCT (5%) -> entra con la casilla APAGADA: no se cancela; TU decides y si la marcas se cancela en la siguiente vuelta.
 *    - pierde MAS de CANP_AUTO_PCT (5%)           -> entra con la casilla MARCADA: la extension la cancela en el site (y de ahi Odoo) sola.
 *  (Exacto en el tope lo decides tu: solo lo que pasa del tope, a 6 decimales, cambia de zona.)
 *  Cancelar en Walmart (Seller Center) lo haces tu; este script no cancela nada en Walmart.
 *  Una venta ya agregada no se vuelve a agregar.
 */

var CANP_ENTRA_PCT = 3;   // pierde MAS que esto (%) -> entra a Cancelaciones (menos o igual es permitido). Igual que el tope de "Killers bajo minimo".
var CANP_AUTO_PCT  = 5;   // pierde MAS que esto (%) -> casilla marcada y se cancela sola. Entre ENTRA y AUTO decides tu. Ej.: 7 = solo lo de mas de 7% se cancela solo.
var CANP_TOPE_AUTO = -CANP_AUTO_PCT / 100;   // la misma cifra como fraccion negativa

/** true si la perdida (fraccion negativa, ej. -0.04) pasa de CANP_ENTRA_PCT: se compara a 6 decimales. */
function canpEntra_(pct) {
  var p = Number(pct);
  if (isNaN(p)) return false;
  return Math.round(p * 1e6) / 1e6 < -CANP_ENTRA_PCT / 100;
}

/** true si la perdida (fraccion negativa, ej. -0.07) pasa del tope: se compara a 6 decimales para que 5% exacto NO se cancele solo. */
function canpAuto_(pct) {
  var p = Number(pct);
  if (isNaN(p)) return false;
  return Math.round(p * 1e6) / 1e6 < CANP_TOPE_AUTO;
}

var CAN_ORI_PRECIO = 'PRECIO ERRONEO';
var CANP_TOPE_FILAS = 15;     // maximo de filas nuevas por corrida (si hay mas, algo raro paso con los minimos)

var CANP_COL_PERDIDA = 'PERDIDA';

/** 1234.5 -> '1,235' */
function canpMiles_(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/**
 * Las filas nuevas se escriben todas como texto ('@'), y en una celda de texto la casilla marcada NO queda como casilla: queda apagada y la extension no la toma.
 * Despues de escribir filas nuevas se vuelve a dejar la columna CANCELAR EN ODOO de esas filas como casilla de verdad (formato '0' + casilla) con su valor.
 * `datos` = las filas recien escritas (cada una con true/false en la columna de la casilla), `ini` = fila de la hoja donde empezaron.
 */
function canFijarCasillas_(h, ini, datos) {
  try {
    var c = canMapaHoja_(h).mapa[normEnc_(CAN_CHECK)];
    if (!c || !datos || !datos.length) return;
    var rg = h.getRange(ini, c, datos.length, 1);
    rg.setNumberFormat('0');
    rg.insertCheckboxes();
    rg.setValues(datos.map(function (f) { return [f[c - 1] === true]; }));
  } catch (e) { try { logWarn_(CAN_ETAPA, 'No pude dejar las casillas de las filas nuevas: ' + String(e.message || e).split('\n')[0]); } catch (x) {} }
}

/** Una vez: las dos ventas de precio erroneo de las 13:40 del 11-nov (de mas de 5%) quedaron con la casilla apagada por ese error: se marcan como debian. */
function canpReparaCasillas_() {
  try {
    if (props_().getProperty('CAN_REPARA_PE_V1') === '1') return 0;
    var h = getHoja_(CAN_HOJA);
    if (!h || h.getLastRow() < 2) return 0;
    var m = canMapaHoja_(h).mapa, cK = m[normEnc_(CAN_CHECK)], cO = m[normEnc_('Orden de compra#')], cE = m[normEnc_(CAN_ESTADO)], n = h.getLastRow() - 1, cuantas = 0;
    if (!cK || !cO || !cE) return 0;
    var ords = h.getRange(2, cO, n, 1).getValues(), chk = h.getRange(2, cK, n, 1).getValues(), est = h.getRange(2, cE, n, 1).getValues();
    var lista = { '609131694301179': 1, '609131694294215': 1 };
    for (var i = 0; i < n; i++) {
      var o = String(ords[i][0] === null || ords[i][0] === undefined ? '' : ords[i][0]).replace(/\.0+$/, '').trim();
      if (lista[o] && chk[i][0] !== true && !/^CANCELAD/i.test(String(est[i][0] || '').trim())) { chk[i][0] = true; cuantas++; }
    }
    if (cuantas) { var rg = h.getRange(2, cK, n, 1); rg.setNumberFormat('0'); rg.insertCheckboxes(); rg.setValues(chk); logWarn_(CAN_ETAPA, 'Casillas CANCELAR EN ODOO marcadas en ' + cuantas + ' venta(s) de precio erroneo de mas de ' + CANP_AUTO_PCT + '% que habian quedado apagadas por un error de formato.'); }
    props_().setProperty('CAN_REPARA_PE_V1', '1');
    return cuantas;
  } catch (e) { return 0; }
}

/** Texto de la columna PERDIDA: solo el porcentaje que pierde contra el minimo. Ej. "7.2%" ("7.2% · mín. subió" si el minimo subio despues de la venta). */
function canpPerdida_(v) {
  var pct = Math.round(Math.abs(Number(v.pct) || 0) * 1000) / 10;
  if (!(pct > 0)) {
    var min = Number(v.minimo) || 0, pr = Number(v.precio) || 0;
    if (!(min > 0) || !(min > pr)) return '';
    pct = Math.round((min - pr) / min * 1000) / 10;
  }
  return pct.toFixed(1) + '%' + (Number(v.minAntes) > 0 ? ' · mín. subió' : '');
}

/** { orden: texto PERDIDA } de la hoja Ventas Walmart (precio, minimo y % ya calculados por Precios erroneos). Sirve para las filas cuya nota ya no trae los datos. */
function canpPerdidasVentas_() {
  var out = {};
  try {
    var h = SpreadsheetApp.getActive().getSheetByName(typeof VH_HOJA !== 'undefined' ? VH_HOJA : 'Ventas Walmart');
    if (!h || h.getLastRow() < 2) return out;
    var n = h.getLastRow() - 1, lc = h.getLastColumn(), pos = {};
    h.getRange(1, 1, 1, lc).getValues()[0].forEach(function (x, i) { var k = normEnc_(x); if (k && pos[k] === undefined) pos[k] = i + 1; });
    var col = function (k) { return pos[normEnc_(k)] ? h.getRange(2, pos[normEnc_(k)], n, 1).getValues() : null; };
    var ids = [col('FOLIO'), col('ORDEN ID'), col('REFERENCIA')], pz = col('PIEZAS'), pu = col('PRECIO UNITARIO'), mi = col('MINIMO APLICADO'),
        pc = col('DIFERENCIA %'), se = col('SEMAFORO'), nt = col('NOTAS PRECIO');
    if (!se || !mi || !pc) return out;
    var id = function (x) { var s = String(x === null || x === undefined ? '' : x).trim(); return /^\d+(\.0+)?$/.test(s) ? s.replace(/\.0+$/, '') : s; };
    for (var i = 0; i < n; i++) {
      var sem = String(se[i][0] || '').trim(), txt = '', ma = null;
      if (sem === 'BAJO MINIMO') {
        ma = nt ? /se evaluo con \$([\d.,]+)/.exec(String(nt[i][0] || '')) : null;
        txt = canpPerdida_({ minimo: Number(mi[i][0]) || 0, pct: Number(pc[i][0]), piezas: pz ? pz[i][0] : 1, precio: pu ? Number(pu[i][0]) : 0,
                             minAntes: ma ? Number(ma[1].replace(/,/g, '')) : 0 });
      } else if (sem === 'KILLER') txt = 'Killer vigente (ver Killers bajo minimo)';
      if (!txt) continue;
      var antes = sem === 'BAJO MINIMO' && ma && Number(ma[1].replace(/,/g, '')) > 0;
      ids.forEach(function (a) { if (a) { var k = id(a[i][0]); if (k && !out[k]) out[k] = { txt: txt, antes: !!antes }; } });
    }
  } catch (e) {}
  return out;
}

/** La columna PERDIDA existe y va al principio, junto a ORIGEN (la acomoda canOrdenar_; si ya existia en otro lugar, tambien la mueve). */
function canAsegurarPerdida_(h) {
  var pos = canMapaHoja_(h).mapa[normEnc_(CANP_COL_PERDIDA)];
  if (pos === 2) return;
  if (!pos) canAsegurarColumnas_(h, [CANP_COL_PERDIDA]);
  canOrdenar_(h);
}

/** Llena PERDIDA en las filas de PRECIO ERRONEO que no la traen (las de antes), leyendo precio, minimo y % de su nota. */
function canpCompletarPerdida_() {
  var h = getHoja_(CAN_HOJA);
  if (!h || h.getLastRow() < 2) return 0;
  canAsegurarPerdida_(h);
  var m = canMapaHoja_(h).mapa, n = h.getLastRow() - 1;
  var cP = m[normEnc_(CANP_COL_PERDIDA)], cO = m[normEnc_(CAN_ORIGEN)], cN = m[normEnc_(CAN_NOTA)], cQ = m[normEnc_('QTY.')];
  if (!cP || !cO || !cN) return 0;
  var per = h.getRange(2, cP, n, 1).getValues(), ori = h.getRange(2, cO, n, 1).getValues(), nota = h.getRange(2, cN, n, 1).getValues();
  var qty = cQ ? h.getRange(2, cQ, n, 1).getValues() : null, cambios = 0;
  var cOC = m[normEnc_('Orden de compra#')], cPd = m[normEnc_('Pedido#')];
  var oc = cOC ? h.getRange(2, cOC, n, 1).getValues() : null, pd = cPd ? h.getRange(2, cPd, n, 1).getValues() : null;
  try { canpReparaCasillas_(); } catch (eRp) {}
  var ventas = canpPerdidasVentas_(), sin = [];
  var idc = function (x) { var s = String(x === null || x === undefined ? '' : x).trim(); return /^\d+(\.0+)?$/.test(s) ? s.replace(/\.0+$/, '') : s; };
  for (var i = 0; i < n; i++) {
    if (String(ori[i][0] || '').toUpperCase() !== CAN_ORI_PRECIO) continue;
    var previo = String(per[i][0] || '').trim();
    if (previo) {   // formato anterior ("$1,910 · 7.0% (2 pzas)", "(era $1,869)"): se deja solo el porcentaje, el valor no cambia
      var corto = previo.replace(/^\$[\d,]+ · /, '').replace(/ \(\d+ pzas\)/, '').replace(/ · mín\. subió \(era \$[\d,]+\)/, ' · mín. subió');
      if (corto !== previo) { per[i][0] = corto; cambios++; }
      continue;
    }
    var tvo = (oc && ventas[idc(oc[i][0])]) || (pd && ventas[idc(pd[i][0])]) || null;
    if (tvo) { per[i][0] = tvo.txt; cambios++; continue; }
    var mm = /vendida a \$([\d.,]+) con minimo \$([\d.,]+) \(([\d.]+)% abajo\)/.exec(String(nota[i][0] || ''));
    if (!mm) { sin.push(oc ? idc(oc[i][0]) : String(i + 2)); continue; }
    var p = Number(mm[1].replace(/,/g, '')), mn = Number(mm[2].replace(/,/g, '')), pc = Number(mm[3]);
    var pz = Math.max(Number(qty ? qty[i][0] : 1) || 1, 1);
    per[i][0] = pc.toFixed(1) + '%';
    cambios++;
  }
  if (cambios) h.getRange(2, cP, n, 1).setNumberFormat('@').setValues(per);
  if (sin.length) { try { logWarn_('PRECIOS_ERR', 'PERDIDA sin dato en ' + sin.length + ' fila(s) de Cancelaciones (no estan en Ventas Walmart ni la nota trae el precio): ' + sin.join(', ')); } catch (e) {} }
  return cambios;
}

/** Texto corto de la fila: precio vendido contra minimo. */
function canpNota_(v) {
  var pct = Math.round(Math.abs(Number(v.pct) || 0) * 1000) / 10;
  return 'Precio erroneo: vendida a $' + Math.round(Number(v.precio) || 0) + ' con minimo $' + Math.round(Number(v.minimo) || 0) + ' (' + pct + '% abajo)' +
    (Number(v.minAntes) > 0 ? ' · el minimo subio despues de la venta (era $' + Math.round(Number(v.minAntes)) + '): marca CANCELAR EN ODOO si la quieres cancelar' :
      (canpAuto_(v.pct) ? '' : ' · pierde ' + CANP_AUTO_PCT + '% o menos: marca CANCELAR EN ODOO si la quieres cancelar'));
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
    if (!canpEntra_(v.pct)) return;   // pierde CANP_ENTRA_PCT (3%) o menos: se permite, no entra
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
    poner(fila, CANP_COL_PERDIDA, canpPerdida_(v));
    var auto = canpAuto_(v.pct) && !(Number(v.minAntes) > 0);   // si el minimo subio despues de la venta, la venta era valida al venderse: decides tu
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
  canAsegurarColumnas_(h, CAN_FIJAS); canAsegurarControl_(h); canAsegurarOrigen_(h); canAsegurarPerdida_(h);
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
  canFijarCasillas_(h, ini, r.filas);
  try { canFormato_(h); } catch (e) {}
  res.agregadas = r.ordenes; res.auto = r.auto; res.espera = r.espera;
  logWarn_(CAN_ETAPA, 'Precio erroneo: ' + r.ordenes.length + ' venta(s) agregadas a Cancelaciones. ' +
    (r.auto.length ? 'Se cancelan solas (pierden mas de ' + CANP_AUTO_PCT + '%): ' + r.auto.join(', ') + '. ' : '') +
    (r.espera.length ? 'Esperan tu casilla CANCELAR EN ODOO (pierden mas de ' + CANP_ENTRA_PCT + '% y hasta ' + CANP_AUTO_PCT + '%): ' + r.espera.join(', ') + '. ' : '') +
    'En Walmart las cancelas tu.', { ordenes: r.ordenes, auto: r.auto, espera: r.espera });
  return res;
}
