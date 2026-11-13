/**
 * ============================================================
 *  Casos Decidir — la cola de casos con Walmart que te tocan a ti
 * ============================================================
 *
 *  Hoja "Casos Decidir": toma de "Casos Walmart" los casos que esperan algo de ti (POR ABRIR, PIDE INFO, RESPUESTA WALMART,
 *  RESUELTO por confirmar) y los pone en una lista corta para decidir. Tu solo llenas la columna DECISION (lista):
 *    ABRIR · ABRIR JUNTOS (varios SKU del mismo tipo en un solo caso) · RESPONDER · SEGUIMIENTO · CERRAR · ESPERAR · DESCARTAR
 *  Menu "Casos: decidir y generar textos": escribe en TEXTO LISTO el asunto y el mensaje de cada caso segun tu DECISION
 *  (para pegar en Seller Center o en la respuesta). DESCARTAR = no era un caso: lo pasa a CERRADO en Casos Walmart
 *  (RESOLUCION "DESCARTADO...") y deja de aparecer; el detector no lo vuelve a abrir en 30 dias.
 *  El resto lo sigue haciendo solo (correos y extension): cuando abres o Walmart responde, el caso cambia de estado y sale de la lista.
 *  Las filas salen solas cuando el caso ya no te toca; tu DECISION y NOTA se quedan con su caso. No guarda datos de clientes.
 * ============================================================
 */

var CDEC_HOJA = 'Casos Decidir', CDEC_ETAPA = 'CASOS';
var CDEC_ENC = ['FOLIO WALMART', 'TIPO', 'SKU', 'PEDIDO', 'ESTADO', 'FECHA ABIERTO', 'DETALLE', 'SUGERENCIA', 'DECISION', 'TEXTO LISTO', 'NOTA'];
var CDEC_DECISIONES = ['ABRIR', 'ABRIR JUNTOS', 'RESPONDER', 'SEGUIMIENTO', 'CERRAR', 'ESPERAR', 'DESCARTAR'];
var CDEC_CON_TEXTO = ['ABRIR', 'ABRIR JUNTOS', 'RESPONDER', 'SEGUIMIENTO', 'CERRAR'];
var CDEC_EN_COLA = ['POR ABRIR', 'PIDE INFO', 'RESPUESTA WALMART', 'RESUELTO'];
var CDEC_SUGERENCIA = { 'POR ABRIR': 'ABRIR', 'PIDE INFO': 'RESPONDER', 'RESPUESTA WALMART': 'RESPONDER', 'RESUELTO': 'CERRAR' };
var CDEC_DESCARTADO = 'DESCARTADO (no era caso)';

function cdecTxt_(v) { return String(v === null || v === undefined ? '' : v).replace(/^'/, '').trim(); }
function cdecFolio_(v) { var t = cdecTxt_(v).replace(/\.0+$/, ''); return /^\d{6,10}$/.test(t) ? t : ''; }
function cdecClave_(folio, sku, tipo, pedido) {
  var f = cdecFolio_(folio);
  return f ? 'F' + f : 'S' + normEnc_(cdecTxt_(sku)) + '|' + normEnc_(cdecTxt_(tipo)) + '|' + normEnc_(cdecTxt_(pedido));
}

/** Casos que te tocan: [{clave, folio, tipo, sku, pedido, estado, fecha, detalle, producto, fila}] (fila = fila de Casos Walmart). Ordenados por tipo y fecha. */
function cdecCola_(t) {
  if (!t) return [];
  var ix = function (n) { return peCol_(t, [n]); };
  var iF = ix('FOLIO WALMART'), iT = ix('TIPO'), iS = ix('SKU'), iP = ix('PEDIDO'), iE = ix('ESTADO'), iD = ix('FECHA ABIERTO'), iM = ix('MOTIVO'), iU = ix('ULTIMO CORREO'), iN = ix('PRODUCTO');
  var tx = function (f, i) { return i < 0 ? '' : cdecTxt_(f[i]); };
  var vistos = {}, out = [];
  t.filas.forEach(function (f, k) {
    var est = (tx(f, iE) || 'POR ABRIR').toUpperCase();
    if (CDEC_EN_COLA.indexOf(est) < 0) return;
    var folio = cdecFolio_(tx(f, iF)), sku = tx(f, iS), tipo = tx(f, iT), pedido = tx(f, iP);
    if (!folio && !sku && !pedido) return;
    var clave = cdecClave_(folio, sku, tipo, pedido);
    if (vistos[clave]) return;
    vistos[clave] = true;
    var det = [tx(f, iM), tx(f, iU)].filter(function (x) { return x; }).join(' · ');
    out.push({ clave: clave, folio: folio, tipo: tipo, sku: sku, pedido: pedido, estado: est, fecha: iD < 0 ? '' : f[iD], detalle: det.length > 220 ? det.substring(0, 217) + '...' : det, producto: tx(f, iN), fila: k + 2 });
  });
  var ms = function (x) { var d = x.fecha instanceof Date ? x.fecha.getTime() : Date.parse(String(x.fecha)); return isNaN(d) ? 0 : d; };
  return out.map(function (x, i) { return { x: x, i: i }; })
    .sort(function (a, b) { return a.x.tipo < b.x.tipo ? -1 : a.x.tipo > b.x.tipo ? 1 : ms(a.x) - ms(b.x) || a.i - b.i; }).map(function (p) { return p.x; });
}

/** Lo que se le pide a Walmart segun el tipo de caso. */
function cdecPedido_(tipo) {
  var u = String(tipo || '').toUpperCase();
  if (/\$\s*0|PRECIO EN 0/.test(u)) return 'El precio de este producto aparece en $0 en Walmart. Solicito corregirlo.';
  if (/COBRO DISTINTO/.test(u)) return 'Walmart aplicó un cobro distinto al esperado en los pedidos de este producto. Solicito revisar y aclarar la diferencia.';
  if (/DASHBOARD/.test(u)) return 'El producto no aparece en el dashboard. Solicito revisar por qué no se muestra y corregirlo.';
  if (/PRECIO DISTINTO/.test(u)) return 'El precio publicado en Walmart no coincide con el precio que cargamos. Solicito revisarlo y corregirlo.';
  if (/SIN GUIA/.test(u)) return 'No se generó la guía de envío del pedido. Solicito su apoyo para generarla o indicarnos cómo proceder.';
  if (/GARANTIA|GARANTÍA/.test(u)) return 'Solicito información y seguimiento sobre la garantía de este pedido.';
  if (/SYSTEM_PROBLEM|NO ESTA EN WALMART|NO ESTÁ EN WALMART/.test(u)) return 'El producto presenta un problema en Walmart (no aparece o falla el sistema). Solicito revisarlo y corregirlo.';
  return 'Solicito su apoyo para revisar este tema.';
}

function cdecRef_(c) {
  return [c.sku ? 'SKU: ' + c.sku : '', c.producto ? 'Producto: ' + c.producto : '', c.pedido ? 'Pedido: ' + c.pedido : '', c.folio ? 'Caso: ' + c.folio : ''].filter(function (x) { return x; }).join('\n');
}

/** Texto de un caso segun la decision. `grupo` = los casos de ABRIR JUNTOS del mismo tipo (solo para ABRIR JUNTOS). */
function cdecTexto_(c, decision, grupo) {
  var tipo = c.tipo || 'Caso', caso = c.folio ? 'caso ' + c.folio : tipo;
  if (decision === 'ABRIR') {
    return 'ASUNTO: ' + tipo + (c.sku ? ' - ' + c.sku : '') + '\n\nHola, buen día.\n\n' + cdecPedido_(c.tipo) + '\n' + cdecRef_(c) +
      (c.detalle ? '\nDetalle: ' + c.detalle : '') + '\n\nQuedo atento a su respuesta. Gracias.';
  }
  if (decision === 'ABRIR JUNTOS') {
    var g = grupo || [c];
    return 'ASUNTO: ' + tipo + ' - ' + g.length + ' producto(s)\n\nHola, buen día.\n\n' + cdecPedido_(c.tipo) + '\nAplica a estos ' + g.length + ' producto(s):\n' +
      g.slice(0, 100).map(function (x) { return '- ' + x.sku + (x.pedido ? ' (pedido ' + x.pedido + ')' : ''); }).join('\n') +
      (g.length > 100 ? '\n... y ' + (g.length - 100) + ' más' : '') + '\n\nQuedo atento a su respuesta. Gracias.';
  }
  if (decision === 'RESPONDER') {
    return 'ASUNTO: Re: ' + (c.folio ? 'Caso ' + c.folio : tipo) + '\n\nHola, buen día.\n\nEn respuesta a su mensaje sobre el ' + caso + ':\n' + cdecRef_(c) +
      '\n\n[ESCRIBE AQUÍ TU RESPUESTA]\n\nQuedo atento. Gracias.';
  }
  if (decision === 'SEGUIMIENTO') {
    return 'ASUNTO: Seguimiento ' + (c.folio ? 'caso ' + c.folio : tipo) + '\n\nHola, buen día.\n\nDoy seguimiento al ' + caso + ', que no tiene actualización reciente:\n' + cdecRef_(c) +
      '\n\n¿Me pueden compartir el estatus y la fecha estimada de solución?\n\nGracias.';
  }
  if (decision === 'CERRAR') {
    return 'ASUNTO: Cierre ' + (c.folio ? 'caso ' + c.folio : tipo) + '\n\nHola, buen día.\n\nConfirmamos que el tema del ' + caso + ' quedó resuelto:\n' + cdecRef_(c) + '\n\nFavor de cerrarlo. Gracias.';
  }
  return '';
}

/** Lee la hoja Casos Decidir por encabezado: {h, m, n, c:{ENC:[valores]}}. */
function cdecLeer_() {
  var h = peHojaAsegurar_(CDEC_HOJA, CDEC_ENC), m = ubicarColumnas_(h, CDEC_ENC, 1), n = Math.max(h.getLastRow() - 1, 0), c = {};
  CDEC_ENC.forEach(function (e) { var k = escrCol_(m, e); c[e] = (k && n) ? h.getRange(2, k, n, 1).getValues().map(function (r) { return r[0]; }) : []; });
  return { h: h, m: m, n: n, c: c };
}
function cdecEscribirCol_(L, enc) {
  var k = escrCol_(L.m, enc);
  if (k && L.n) L.h.getRange(2, k, L.n, 1).setValues(L.c[enc].map(function (x) { return [x]; }));
}

/** Pone la lista al dia: filas nuevas al final, datos del caso al dia, y quita las que ya no te tocan. Devuelve {total, sinDecision, nuevas, quitadas}. */
function cdecActualizar_() {
  var cola = cdecCola_(peTabla_(CAW_HOJA)), mapa = {};
  cola.forEach(function (x) { mapa[x.clave] = x; });
  var L = cdecLeer_(), h = L.h, n = L.n, existentes = {}, quitar = [];
  for (var i = 0; i < n; i++) {
    var k = cdecClave_(L.c['FOLIO WALMART'][i], L.c['SKU'][i], L.c['TIPO'][i], L.c['PEDIDO'][i]);
    var x = mapa[k];
    if (!x || existentes[k]) { if (cdecTxt_(L.c['SKU'][i]) || cdecTxt_(L.c['FOLIO WALMART'][i]) || cdecTxt_(L.c['TIPO'][i])) quitar.push(i); continue; }
    existentes[k] = true;
    L.c['ESTADO'][i] = x.estado; L.c['FECHA ABIERTO'][i] = x.fecha; L.c['DETALLE'][i] = x.detalle; L.c['SUGERENCIA'][i] = CDEC_SUGERENCIA[x.estado] || '';
  }
  ['ESTADO', 'FECHA ABIERTO', 'DETALLE', 'SUGERENCIA'].forEach(function (e) { cdecEscribirCol_(L, e); });
  // las que ya no te tocan se quitan (de abajo hacia arriba, en bloques)
  if (quitar.length) {
    var bloques = [], ini = quitar[0], ant = quitar[0];
    for (var j = 1; j < quitar.length; j++) { if (quitar[j] === ant + 1) { ant = quitar[j]; continue; } bloques.push({ de: ini, a: ant }); ini = quitar[j]; ant = quitar[j]; }
    bloques.push({ de: ini, a: ant });
    if (h.getMaxRows() - Math.max(h.getFrozenRows(), 1) <= quitar.length) h.insertRowsAfter(h.getMaxRows(), 1);
    for (var b = bloques.length - 1; b >= 0; b--) h.deleteRows(bloques[b].de + 2, bloques[b].a - bloques[b].de + 1);
  }
  var nuevas = cola.filter(function (x) { return !existentes[x.clave]; });
  if (nuevas.length) {
    peAgregar_(h, CDEC_ENC, nuevas.map(function (x) {
      return { 'FOLIO WALMART': x.folio, 'TIPO': x.tipo, 'SKU': x.sku, 'PEDIDO': x.pedido, 'ESTADO': x.estado, 'FECHA ABIERTO': x.fecha, 'DETALLE': x.detalle, 'SUGERENCIA': CDEC_SUGERENCIA[x.estado] || '' };
    }));
  }
  try { cdecFormato_(h); } catch (e) { logWarn_(CDEC_ETAPA, 'Casos Decidir: no se pudo dar formato: ' + String(e.message || e).split('\n')[0]); }
  var F = cdecLeer_();
  return { total: F.n, sinDecision: F.c['DECISION'].filter(function (v) { return !cdecTxt_(v); }).length, nuevas: nuevas.length, quitadas: quitar.length, hoja: h };
}

/** Lista desplegable en DECISION, anchos y colores del ESTADO. Solo toca columnas propias. */
function cdecFormato_(h) {
  var m = ubicarColumnas_(h, CDEC_ENC, 1);
  var ancho = { 'FOLIO WALMART': 100, 'TIPO': 190, 'SKU': 230, 'PEDIDO': 140, 'ESTADO': 140, 'FECHA ABIERTO': 100, 'DETALLE': 360, 'SUGERENCIA': 110, 'DECISION': 130, 'TEXTO LISTO': 520, 'NOTA': 200 };
  CDEC_ENC.forEach(function (e) { var c = escrCol_(m, e); if (c && h.getColumnWidth(c) < 90 && ancho[e]) h.setColumnWidth(c, ancho[e]); });
  var nf = h.getLastRow() - 1;
  if (nf < 1) return;
  var cD = escrCol_(m, 'DECISION');
  if (cD) h.getRange(2, cD, nf, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(CDEC_DECISIONES, true).setAllowInvalid(false).build()).setHorizontalAlignment('center');
  ['DETALLE', 'TEXTO LISTO', 'NOTA', 'TIPO', 'SKU'].forEach(function (e) { var c = escrCol_(m, e); if (c) h.getRange(2, c, nf, 1).setWrap(true); });
  h.getRange(2, 1, nf, h.getLastColumn()).setVerticalAlignment('top');
  var cF = escrCol_(m, 'FECHA ABIERTO');
  if (cF) h.getRange(2, cF, nf, 1).setNumberFormat('yyyy-mm-dd');
  var cE = escrCol_(m, 'ESTADO');
  if (cE && !h.getConditionalFormatRules().length) {
    var rango = h.getRange(2, cE, Math.max(h.getMaxRows() - 1, 1), 1), colores = { 'POR ABRIR': '#fff2cc', 'PIDE INFO': '#f4cccc', 'RESPUESTA WALMART': '#d9ead3', 'RESUELTO': '#b6d7a8' };
    h.setConditionalFormatRules(Object.keys(colores).map(function (k) {
      return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(k).setBackground(colores[k]).setRanges([rango]).build();
    }));
  }
}

/** Genera TEXTO LISTO segun la DECISION y aplica DESCARTAR en Casos Walmart. Devuelve {textos, descartados}. */
function cdecGenerar_() {
  var t = peTabla_(CAW_HOJA), cola = cdecCola_(t), mapa = {};
  cola.forEach(function (x) { mapa[x.clave] = x; });
  var L = cdecLeer_(), n = L.n, textos = 0, descartar = [];
  var dec = function (i) { return String(cdecTxt_(L.c['DECISION'][i])).toUpperCase(); };
  var caso = function (i) {
    var k = cdecClave_(L.c['FOLIO WALMART'][i], L.c['SKU'][i], L.c['TIPO'][i], L.c['PEDIDO'][i]);
    return mapa[k] || { clave: k, folio: cdecFolio_(L.c['FOLIO WALMART'][i]), tipo: cdecTxt_(L.c['TIPO'][i]), sku: cdecTxt_(L.c['SKU'][i]), pedido: cdecTxt_(L.c['PEDIDO'][i]), detalle: cdecTxt_(L.c['DETALLE'][i]), producto: '' };
  };
  var grupos = {};
  for (var i = 0; i < n; i++) if (dec(i) === 'ABRIR JUNTOS') { var c0 = caso(i), g = normEnc_(c0.tipo); (grupos[g] = grupos[g] || []).push({ i: i, c: c0 }); }
  for (var r = 0; r < n; r++) {
    var d = dec(r);
    if (d === 'DESCARTAR') { descartar.push(caso(r).clave); continue; }
    if (CDEC_CON_TEXTO.indexOf(d) < 0) continue;
    var c = caso(r), txt;
    if (d === 'ABRIR JUNTOS') {
      var gr = grupos[normEnc_(c.tipo)];
      txt = gr[0].i === r ? cdecTexto_(c, d, gr.map(function (p) { return p.c; })) : 'Va junto con los demás de este tipo, en el texto de la fila ' + (gr[0].i + 2) + '.';
    } else txt = cdecTexto_(c, d);
    L.c['TEXTO LISTO'][r] = txt; textos++;
  }
  cdecEscribirCol_(L, 'TEXTO LISTO');
  var desc = descartar.length ? cdecDescartar_(t, cola, descartar) : 0;
  return { textos: textos, descartados: desc };
}

/** DESCARTAR: pasa a CERRADO en Casos Walmart (ESTADO, RESOLUCION, FECHA CIERRE, ACCION). Devuelve cuantos. */
function cdecDescartar_(t, cola, claves) {
  var h = vdLibro_().getSheetByName(CAW_HOJA);
  if (!h || !t) return 0;
  var m = ubicarColumnas_(h, ['ESTADO', 'RESOLUCION', 'FECHA CIERRE', 'ACCION'], 1), n = h.getLastRow() - 1;
  if (n < 1) return 0;
  var col = {}; ['ESTADO', 'RESOLUCION', 'FECHA CIERRE', 'ACCION'].forEach(function (e) { var k = escrCol_(m, e); col[e] = { k: k, v: k ? h.getRange(2, k, n, 1).getValues() : null }; });
  var set = {}; claves.forEach(function (c) { set[c] = true; });
  var hoy = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), hechos = 0;
  cola.forEach(function (x) {
    if (!set[x.clave]) return;
    var i = x.fila - 2; if (i < 0 || i >= n) return;
    if (col['ESTADO'].v) col['ESTADO'].v[i][0] = 'CERRADO';
    if (col['RESOLUCION'].v) col['RESOLUCION'].v[i][0] = CDEC_DESCARTADO;
    if (col['FECHA CIERRE'].v) col['FECHA CIERRE'].v[i][0] = hoy;
    if (col['ACCION'].v) col['ACCION'].v[i][0] = '';
    hechos++;
  });
  Object.keys(col).forEach(function (e) { if (col[e].v) h.getRange(2, col[e].k, n, 1).setValues(col[e].v); });
  return hechos;
}

/** La llama Salud cada hora: solo pone la lista al dia (no genera textos ni descarta). */
function casosDecidirProgramado_() {
  try { cdecActualizar_(); } catch (e) { logWarn_(CDEC_ETAPA, 'Casos Decidir: ' + String(e.message || e).split('\n')[0]); }
}

/** Menu: lista al dia + textos + descartes, y abre la hoja. */
function casosDecidirMenu() {
  cdecActualizar_();
  var g = cdecGenerar_();
  var r = cdecActualizar_();
  logOk_(CDEC_ETAPA, 'Casos Decidir: ' + r.total + ' en la lista, ' + r.sinDecision + ' sin decidir, ' + g.textos + ' texto(s) listos' + (g.descartados ? ', ' + g.descartados + ' descartados' : ''));
  flushLog_();
  SpreadsheetApp.getActive().setActiveSheet(r.hoja);
  dlgInfo_('📝 Casos: decidir y generar textos',
    r.total + ' caso(s) te tocan; ' + r.sinDecision + ' sin decisión.\n' + g.textos + ' texto(s) listos en la columna TEXTO LISTO' + (g.descartados ? '\n' + g.descartados + ' descartado(s): pasaron a CERRADO' : '') +
    '\n\nCómo se usa: elige la DECISION de cada caso (lista desplegable) y vuelve a correr este menú. Copia el texto y pégalo en Seller Center.', r.sinDecision ? 'aviso' : 'ok');
}
