/**
 * ============================================================
 *  Guias grandes — pedidos con MUCHAS PIEZAS de un mismo producto (24-nov-2026)
 * ============================================================
 *
 *  Caso real: alguien compro 10 pantallas y el sistema compro UNA sola guia. Un pedido con mas de GG_MAX_PIEZAS piezas de un mismo
 *  producto necesita dos o tres guias, y esas las genera ELLA en Seller Center. Entonces:
 *
 *   1) La extension (autoguias.js) detecta el pedido en la pagina de Guias y NO lo compra jamas (ni en prueba ni en real).
 *      Lo reporta en guias_reporte -> aqui se agrega una fila arriba en la hoja "Guias grandes" (ESTADO POR HACER) + aviso rojo en la extension.
 *   2) Ella entra a Seller Center, genera las guias que necesite y marca la casilla GUIAS LISTAS de esa fila.
 *   3) Aqui la fila pasa a POR ENVIAR y el pedido viaja en guias_lista (grandesListos). En la siguiente ronda la extension, SOLO si la pagina ya
 *      ve el pedido con guia ("ya tiene guia"), usa el mismo boton de la pagina que marca enviados SIN comprar nada, y avisa en
 *      guias_grandes_resultado -> la fila pasa a ENVIADO. Si la pagina todavia no ve las guias, la fila lo dice y se reintenta.
 *
 *  Nada de esto cancela NADA en Walmart. Marcar enviado es lo que la pagina ya hacia; aqui solo se hace cuando ella da la casilla.
 *  La hoja nunca se borra: ella llena GUIAS LISTAS y NOTAS; el script solo escribe sus columnas, ubicadas por encabezado.
 */

var GG_HOJA = 'Guias grandes';
var GG_ETAPA = 'GUIAS_GRANDES';
var GG_MAX_PIEZAS = 5;                 // MAS de esto de un mismo producto: la guia NO sale sola (la extension lo recibe en guias_lista)
var GG_TOPE_FILAS = 40;                // pedidos que se anotan por reporte (si hay mas, algo raro: se anotan 40 y se avisa)
var GG_ENC = ['ESTADO', 'ORDEN DE COMPRA', 'SKU', 'PRODUCTO', 'PIEZAS', 'DETECTADO', 'QUE HACER'];   // las escribe el script
var GG_CASILLA = 'GUIAS LISTAS';       // casilla tuya: ya generaste las guias en Seller Center
var GG_NOTAS = 'NOTAS';                // tuya
var GG_POR_HACER = 'POR HACER', GG_POR_ENVIAR = 'POR ENVIAR', GG_ENVIADO = 'ENVIADO';
var GG_ALERTA = 'gg-pendientes', GG_ALERTA_FALLO = 'gg-fallo';

/** Pura. Texto de QUE HACER segun el estado. */
function ggQueHacer_(estado, piezas) {
  if (estado === GG_ENVIADO) return 'Listo: ya se marco como enviado en Walmart.';
  if (estado === GG_POR_ENVIAR) return 'Casilla marcada: en la siguiente ronda se marca enviado (si la pagina ya ve sus guias).';
  return 'Genera las guias en Seller Center' + (piezas > 0 ? ' (' + piezas + ' piezas: varias guias)' : '') + ' y marca ' + GG_CASILLA + '. Mientras tanto NO sale sola.';
}

/** Pura. Pedidos reportados por la extension que SI son nuevos y validos: [{po, sku, producto, piezas}]. existentes = {PO: true}. */
function ggLimpiar_(grandes, maxPiezas, existentes) {
  var vistos = {}, out = [];
  (grandes || []).forEach(function (g) {
    g = g || {};
    var po = String(g.po == null ? '' : g.po).replace(/\D/g, ''), pz = Number(g.piezas);
    if (!/^\d{9,20}$/.test(po) || !(pz > maxPiezas) || vistos[po] || (existentes && existentes[po])) return;
    vistos[po] = true;
    out.push({ po: po, sku: String(g.sku || '').slice(0, 60), producto: String(g.producto || '').slice(0, 80), piezas: pz });
  });
  return out;
}

/** Pura. Siguiente estado de una fila segun su casilla: {estado, texto} o null si no cambia nada. ENVIADO ya no se mueve. */
function ggSiguiente_(estado, casilla, piezas) {
  var e = String(estado == null ? '' : estado).trim().toUpperCase();
  if (e === GG_ENVIADO) return null;
  if (casilla === true && e !== GG_POR_ENVIAR) return { estado: GG_POR_ENVIAR, texto: ggQueHacer_(GG_POR_ENVIAR, piezas) };
  if (casilla !== true && e !== GG_POR_HACER) return { estado: GG_POR_HACER, texto: ggQueHacer_(GG_POR_HACER, piezas) };
  return null;
}

/** Crea la hoja si falta y deja sus encabezados (los que falten, al final). Hoja nueva: sin filas ni columnas de sobra. */
function ggAsegurarHoja_() {
  var ss = SpreadsheetApp.getActive(), h = ss.getSheetByName(GG_HOJA), nueva = false;
  if (!h) { h = ss.insertSheet(GG_HOJA); nueva = true; }
  var m = ubicarColumnas_(h, GG_ENC.concat([GG_CASILLA, GG_NOTAS]), 1);
  if (nueva) {
    var lc = Math.max.apply(null, m.pos);
    if (h.getMaxColumns() > lc) h.deleteColumns(lc + 1, h.getMaxColumns() - lc);
    escrRecortarFilas_(h, 2);
    h.setFrozenRows(1);
  }
  return h;
}

/** Lee la hoja por encabezado: [{fila, po, estado, casilla, piezas}]. */
function ggLeer_(h) {
  if (!h || h.getLastRow() < 2) return [];
  var m = escrMapaHoja_(h, GG_ENC.concat([GG_CASILLA]), 1).col, n = h.getLastRow() - 1;
  var cPo = m[normEnc_('ORDEN DE COMPRA')];
  if (!cPo) return [];
  var leer = function (enc) { var c = m[normEnc_(enc)]; return c ? h.getRange(2, c, n, 1).getValues() : null; };
  var po = leer('ORDEN DE COMPRA'), es = leer('ESTADO'), ca = leer(GG_CASILLA), pz = leer('PIEZAS'), out = [];
  for (var i = 0; i < n; i++) {
    var o = String(po[i][0] == null ? '' : po[i][0]).replace(/\.0+$/, '').replace(/\D/g, '');   // col-fija: lectura de UNA columna ya ubicada por encabezado
    if (!o) continue;
    out.push({ fila: i + 2, po: o, estado: es ? String(es[i][0] || '').trim().toUpperCase() : '',   // col-fija: idem
      casilla: ca ? (ca[i][0] === true || String(ca[i][0]).trim().toUpperCase() === 'TRUE') : false, piezas: pz ? Number(pz[i][0]) || 0 : 0 });   // col-fija: idem
  }
  return out;
}

/** Pasa la casilla a estado, cuenta lo pendiente y mantiene el aviso rojo de la extension. Devuelve {porHacer, porEnviar, enviados}. */
function ggSincronizar_() {
  var res = { porHacer: 0, porEnviar: 0, enviados: 0 };
  var h = SpreadsheetApp.getActive().getSheetByName(GG_HOJA);
  if (!h) { try { extAlertaFijaQuitar_(GG_ALERTA); } catch (e0) {} return res; }
  var filas = ggLeer_(h), m = escrMapaHoja_(h, GG_ENC, 1).col, cE = m[normEnc_('ESTADO')], cQ = m[normEnc_('QUE HACER')];
  filas.forEach(function (f) {
    var s = ggSiguiente_(f.estado, f.casilla, f.piezas);
    if (s) { f.estado = s.estado; if (cE) h.getRange(f.fila, cE).setValue(s.estado); if (cQ) h.getRange(f.fila, cQ).setValue(s.texto); }
    if (f.estado === GG_ENVIADO) res.enviados++; else if (f.estado === GG_POR_ENVIAR) res.porEnviar++; else res.porHacer++;
  });
  try {
    if (res.porHacer > 0) extAlertaFija_(GG_ALERTA, res.porHacer + ' pedido(s) con MUCHAS PIEZAS esperan tus guias: genera las guias en Seller Center y marca GUIAS LISTAS en la hoja "' + GG_HOJA + '"');
    else extAlertaFijaQuitar_(GG_ALERTA);
  } catch (e1) {}
  return res;
}

/** POs que ella ya marco (estado POR ENVIAR): viajan a la extension para que los marque enviados si la pagina ya ve sus guias. */
function ggListosPorEnviar_() {
  try {
    var h = SpreadsheetApp.getActive().getSheetByName(GG_HOJA);
    return ggLeer_(h).filter(function (f) { return f.estado === GG_POR_ENVIAR && f.casilla; }).map(function (f) { return f.po; }).slice(0, 40);
  } catch (e) { return []; }
}

/** Lo llama guias_reporte con lo que la extension encontro: agrega arriba lo nuevo. Devuelve los PO agregados. */
function ggRecibir_(grandes) {
  var h = SpreadsheetApp.getActive().getSheetByName(GG_HOJA), existentes = {};
  if (h) ggLeer_(h).forEach(function (f) { existentes[f.po] = true; });
  var nuevas = ggLimpiar_(grandes, GG_MAX_PIEZAS, existentes), agregadas = [];
  if (nuevas.length > GG_TOPE_FILAS) {
    logErr_(GG_ETAPA, nuevas.length + ' pedidos con muchas piezas en una sola ronda (maximo ' + GG_TOPE_FILAS + '): se anotan los primeros ' + GG_TOPE_FILAS + '. Revisa la pagina de Guias.');
    nuevas = nuevas.slice(0, GG_TOPE_FILAS);
  }
  if (nuevas.length) {
    h = ggAsegurarHoja_();
    var m = ubicarColumnas_(h, GG_ENC.concat([GG_CASILLA, GG_NOTAS]), 1).col, n = nuevas.length;
    var ini = escrInsertarArriba_(h, n), ahora = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
    var poner = function (enc, vals, texto) {
      var c = m[normEnc_(enc)]; if (!c) return;
      var rg = h.getRange(ini, c, n, 1);
      if (texto) rg.setNumberFormat('@');
      rg.setValues(vals.map(function (v) { return [v]; }));
    };
    poner('ESTADO', nuevas.map(function () { return GG_POR_HACER; }));
    poner('ORDEN DE COMPRA', nuevas.map(function (x) { return x.po; }), true);
    poner('SKU', nuevas.map(function (x) { return x.sku; }), true);
    poner('PRODUCTO', nuevas.map(function (x) { return x.producto; }));
    poner('PIEZAS', nuevas.map(function (x) { return x.piezas; }));
    poner('DETECTADO', nuevas.map(function () { return ahora; }), true);
    poner('QUE HACER', nuevas.map(function (x) { return ggQueHacer_(GG_POR_HACER, x.piezas); }));
    var cC = m[normEnc_(GG_CASILLA)];
    if (cC) { var rc = h.getRange(ini, cC, n, 1); rc.setNumberFormat('0'); rc.insertCheckboxes(); rc.setValues(nuevas.map(function () { return [false]; })); rc.setHorizontalAlignment('center'); }
    SpreadsheetApp.flush();
    agregadas = nuevas.map(function (x) { return x.po; });
    logWarn_(GG_ETAPA, 'Pedidos con MUCHAS PIEZAS (mas de ' + GG_MAX_PIEZAS + ' de un mismo producto): su guia NO sale sola. Genera sus guias en Seller Center y marca ' + GG_CASILLA + ' en la hoja "' + GG_HOJA + '": ' +
      nuevas.map(function (x) { return x.po + ' (' + x.piezas + ' pzs ' + x.sku + ')'; }).join(', '), { ordenes: agregadas });
    flushLog_();
  }
  ggSincronizar_();
  return agregadas;
}

/** Web App guias_grandes_resultado: la extension cuenta que paso con los pedidos marcados LISTOS. */
function ggRecibirResultado_(p) {
  var err = csAutorizar_(p); if (err) return err;
  var limpia = function (a) { return (a || []).map(function (x) { return String(x == null ? '' : x).replace(/\D/g, ''); }).filter(function (x) { return /^\d{9,20}$/.test(x); }).slice(0, 60); };
  var marcados = limpia(p.marcados), sinGuia = limpia(p.sinGuia), fallos = [];
  (p.fallos || []).slice(0, 40).forEach(function (f) { f = f || {}; var po = limpia([f.po])[0]; if (po) fallos.push({ po: po, error: String(f.error || '').replace(/[\r\n]+/g, ' ').slice(0, 140) }); });
  var real = p.modo === 'real', errG = String(p.error || '').replace(/[\r\n]+/g, ' ').slice(0, 160);
  if (!real) {
    var simul = limpia(p.marcarian);
    if (simul.length) logOk_(GG_ETAPA, 'PRUEBA (no marca nada): se marcarian enviados ' + simul.join(', '));
    if (errG) logWarn_(GG_ETAPA, 'PRUEBA: no pude revisar los pedidos con guias listas: ' + errG);
    flushLog_();
    return { ok: true };
  }
  var h = SpreadsheetApp.getActive().getSheetByName(GG_HOJA);
  if (h) {
    var filas = ggLeer_(h), m = escrMapaHoja_(h, GG_ENC, 1).col, cE = m[normEnc_('ESTADO')], cQ = m[normEnc_('QUE HACER')];
    var cuando = Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm');
    var escribe = function (po, estado, texto) {
      filas.forEach(function (f) {
        if (f.po !== po) return;
        if (estado && cE) h.getRange(f.fila, cE).setValue(estado);
        if (texto && cQ) h.getRange(f.fila, cQ).setValue(texto);
      });
    };
    marcados.forEach(function (po) { escribe(po, GG_ENVIADO, 'Listo: marcado como enviado en Walmart el ' + cuando + '.'); });
    sinGuia.forEach(function (po) { escribe(po, '', 'Marcaste ' + GG_CASILLA + ' pero la pagina de Guias todavia no ve las guias de este pedido (' + cuando + '). Revisa en Seller Center que se generaron; se reintenta solo.'); });
    fallos.forEach(function (f) { escribe(f.po, '', 'No pude marcarlo enviado (' + cuando + '): ' + (f.error || 'sin detalle') + '. Se reintenta; si sigue, marcalo en Seller Center.'); });
  }
  if (marcados.length) logOk_(GG_ETAPA, 'Pedidos con muchas piezas marcados como enviados: ' + marcados.join(', '), { ordenes: marcados });
  if (sinGuia.length) logWarn_(GG_ETAPA, 'Marcaste GUIAS LISTAS pero la pagina todavia no ve las guias de: ' + sinGuia.join(', ') + '. Revisa en Seller Center.');
  if (fallos.length) {
    logWarn_(GG_ETAPA, 'No pude marcar enviados: ' + fallos.map(function (f) { return f.po + (f.error ? ' (' + f.error + ')' : ''); }).join('; '));
    try { extAlertaFija_(GG_ALERTA_FALLO, 'No se pudo marcar enviado un pedido con muchas piezas (' + fallos[0].po + '): ' + (fallos[0].error || 'revisa Guias')); } catch (e) {}
  } else if (marcados.length) { try { extAlertaFijaQuitar_(GG_ALERTA_FALLO); } catch (e2) {} }
  if (errG) logWarn_(GG_ETAPA, 'No pude revisar los pedidos con guias listas: ' + errG);
  flushLog_();
  ggSincronizar_();
  return { ok: true };
}

/** Para el Reporte: contadores de la hoja (o ceros si no existe). */
function ggResumen_() {
  var res = { porHacer: 0, porEnviar: 0, enviados: 0 };
  try {
    var h = SpreadsheetApp.getActive().getSheetByName(GG_HOJA);
    ggLeer_(h).forEach(function (f) { if (f.estado === GG_ENVIADO) res.enviados++; else if (f.casilla) res.porEnviar++; else res.porHacer++; });
  } catch (e) {}
  return res;
}
