/**
 * ============================================================
 *  Cancelaciones — ¿la cancelación llegó DESPUES de que el pedido ya tenía guía?
 * ============================================================
 *
 *  Caso: el cliente compra, nosotros procesamos y aceptamos/compramos su guía, y DESPUES llega su correo de cancelación.
 *  Si la paquetería ya tiene la guía puede recoger el paquete: hay que avisarle para que lo detenga.
 *
 *  Columnas de Cancelaciones (las crea esta hoja sola):
 *    GUIA EN SITE         la escribe el script (no la edites). Valores:
 *                           "SÍ · paquetería · guía"                        el pedido YA tenía guía cuando llegó la cancelación  -> hay que avisar a la paquetería
 *                           "SÍ · comprada por el sistema el dd/MM HH:mm"    la compró la extensión ANTES de que llegara la cancelación -> avisar
 *                           "SISTEMA · …"                                    la compró la extensión DESPUES de cancelar (es lo normal, no hay nada que avisar)
 *                           "NO"                                             sin guía al llegar la cancelación
 *    PAQUETERIA AVISADA   casilla TUYA: márcala cuando ya avisaste a la paquetería; con eso QUE HACER deja de pedírtelo.
 *
 *  QUE HACER (CancelacionesEstado.gs) muestra en rojo "YA TENÍA GUÍA …: avisa a la paquetería" y el Reporte lo cuenta.
 *  De dónde sale la guía: Ventas Walmart (ENVIO GUIA / ENVIO PAQUETERIA / ENVIO ESTADO, por FOLIO = orden de compra) y las compras que
 *  hizo la extensión de guías (GA_COMPRAS: pedidos normales comprados por el sistema, para el caso en que la cancelación llega después).
 *  Solo se evalúan filas de cancelación NUEVAS (desde que se activó esto: CG_DESDE); lo anterior no se toca.
 *  Una fila se decide en cuanto hay guía; si no hay, se espera CG_CONGELA_MIN minutos desde el correo (Ventas Walmart tarda en bajar)
 *  y entonces queda en "NO". Un SÍ o un SISTEMA ya no cambia.
 *  Este módulo SOLO LEE Ventas Walmart y escribe SU columna: no cancela nada, en Odoo ni en Walmart.
 */
var CG_COL = 'GUIA EN SITE';
var CG_AVISADA = 'PAQUETERIA AVISADA';
var CG_PROP_DESDE = 'CG_DESDE';
var CG_PROP_COMPRAS = 'GA_COMPRAS';      // {PO: ms} guías compradas por la extensión de pedidos que NO tenían cancelación en ese momento
var CG_CONGELA_MIN = 75;                 // minutos desde el correo para dar por buena una fila sin guía ("NO")
var CG_COMPRAS_MAX = 250, CG_COMPRAS_DIAS = 4;

function cgMs_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') { var t = v.getTime(); return isNaN(t) ? 0 : t; }
  var s = String(v == null ? '' : v).trim(); if (!s) return 0;
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  var d = m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)) : new Date(s.replace(' ', 'T'));
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
function cgFmt_(ms) { return Utilities.formatDate(new Date(ms), TZ, 'dd/MM HH:mm'); }
function cgFijo_(cur) { return /^(S[IÍ]|SISTEMA|NO)(?=\s|$)/i.test(String(cur == null ? '' : cur).trim()); }

/** Pura. d = {cur, guia:{guia,paq,env}|null, compra:ms|0, edadMin, antes:boolean} -> texto nuevo de GUIA EN SITE. */
function cgDecidir_(d) {
  var cur = String(d.cur == null ? '' : d.cur).trim();
  if (cgFijo_(cur)) return cur;                    // ya decidida: no cambia
  if (d.antes) return cur;                         // fila anterior a la activación: no se evalúa
  var g = d.guia || null, extra = (g && g.paq ? ' · ' + g.paq : '') + (g && g.guia ? ' · ' + g.guia : '');
  if (d.compra) return 'SÍ · comprada por el sistema el ' + cgFmt_(d.compra) + ' (antes de la cancelación)' + extra;
  if (g && g.guia && g.env !== 'cancelado') return 'SÍ · ' + (g.paq || 'paquetería sin dato') + ' · ' + g.guia + (g.env ? ' · ' + g.env : '');
  if (Number(d.edadMin) >= CG_CONGELA_MIN) return 'NO';
  return '';
}

/** { FOLIO: {guia, paq, env} } de Ventas Walmart. Si no se puede leer devuelve {} (entonces solo cuentan las compras del sistema). */
function cgMapaVentas_() {
  var out = {};
  try {
    var v = peTabla_('Ventas Walmart'); if (!v) return out;
    var cF = peCol_(v, ['FOLIO']), cG = peCol_(v, ['ENVIO GUIA']), cP = peCol_(v, ['ENVIO PAQUETERIA']), cE = peCol_(v, ['ENVIO ESTADO']);
    if (cF < 0 || cG < 0) return out;
    v.filas.forEach(function (f) {
      var o = String(f[cF] == null ? '' : f[cF]).replace(/\.0+$/, '').replace(/\D/g, ''); if (!o) return;
      var g = String(f[cG] == null ? '' : f[cG]).trim();
      if (out[o] && out[o].guia) return;
      out[o] = { guia: g, paq: cP < 0 ? '' : String(f[cP] == null ? '' : f[cP]).trim(), env: cE < 0 ? '' : String(f[cE] == null ? '' : f[cE]).trim().toLowerCase() };
    });
  } catch (e) {}
  return out;
}

function cgComprasLeer_() {
  try { var j = JSON.parse(props_().getProperty(CG_PROP_COMPRAS) || '{}'); return (j && typeof j === 'object') ? j : {}; } catch (e) { return {}; }
}
function cgComprasGuardar_(mapa) {
  var corte = Date.now() - CG_COMPRAS_DIAS * 86400000, ks = Object.keys(mapa).filter(function (k) { return Number(mapa[k]) >= corte; });
  ks.sort(function (a, b) { return mapa[b] - mapa[a]; });
  var o = {}; ks.slice(0, CG_COMPRAS_MAX).forEach(function (k) { o[k] = mapa[k]; });
  props_().setProperty(CG_PROP_COMPRAS, JSON.stringify(o));
}

/** Crea las dos columnas si faltan. Devuelve el mapa de columnas vigente. */
function cgAsegurar_(h) {
  var m = canMapaHoja_(h).mapa;
  if (m[normEnc_(CG_COL)] === undefined || m[normEnc_(CG_AVISADA)] === undefined) {
    canAsegurarColumnas_(h, [CG_COL, CG_AVISADA]);
    try { canOrdenar_(h); } catch (e) {}
    m = canMapaHoja_(h).mapa;
    try { cgCasillas_(h); } catch (e2) {}
  }
  return m;
}

/** PAQUETERIA AVISADA como casilla de verdad (la llama canFormato_ y cgAsegurar_). */
function cgCasillas_(h) {
  var m = canMapaHoja_(h).mapa, c = m[normEnc_(CG_AVISADA)], n = h.getLastRow() - 1;
  if (!c || n < 1) return 0;
  var rg = h.getRange(2, c, n, 1);
  var vals = rg.getValues().map(function (f) { var v = f[0]; return [v === true || String(v).trim().toUpperCase() === 'TRUE']; });
  rg.setNumberFormat('0'); rg.insertCheckboxes(); rg.setValues(vals); rg.setHorizontalAlignment('center');
  return n;
}

/** Calcula y escribe GUIA EN SITE (solo SU columna). Devuelve cuantas celdas cambió. Nunca lanza. */
function cgSync_(h) {
  try {
    h = h || getHoja_(CAN_HOJA);
    if (!h || h.getLastRow() < 2) return 0;
    var m = cgAsegurar_(h), n = h.getLastRow() - 1, cG = m[normEnc_(CG_COL)], cOrd = canColOrden_(m);
    if (!cG || !cOrd || n < 1) return 0;
    var p = props_(), desde = Number(p.getProperty(CG_PROP_DESDE) || 0);
    if (!desde) { desde = Date.now(); p.setProperty(CG_PROP_DESDE, String(desde)); }
    var V = function (k) { var c = m[normEnc_(k)]; return c ? canColVals_(h, c, n) : []; };
    var ord = canColVals_(h, cOrd, n), fc = V('FECHA CORREO'), fl = V('FECHA LECTURA'), cur = canColVals_(h, cG, n);
    var ahora = Date.now(), info = [], hayPend = false;
    for (var i = 0; i < n; i++) {
      var o = canTextoOrden_(ord[i]), f = cgMs_(fc[i]) || cgMs_(fl[i]);
      var it = { o: o, cur: cur[i], antes: !f || f < desde, edadMin: f ? (ahora - f) / 60000 : 0 };
      it.eval = !!o && !it.antes && !cgFijo_(it.cur);
      if (it.eval) hayPend = true;
      info.push(it);
    }
    if (!hayPend) return 0;                                   // nada que decidir: no se lee Ventas Walmart
    var ventas = cgMapaVentas_(), compras = cgComprasLeer_(), cambios = 0, nuevo = [];
    info.forEach(function (it) {
      var t = it.eval ? cgDecidir_({ cur: it.cur, guia: ventas[it.o] || null, compra: Number(compras[it.o]) || 0, edadMin: it.edadMin, antes: false }) : String(it.cur == null ? '' : it.cur);
      if (t !== String(it.cur == null ? '' : it.cur)) cambios++;
      nuevo.push([t]);
    });
    if (cambios) { var rg = h.getRange(2, cG, n, 1); rg.setNumberFormat('@'); rg.setValues(nuevo); }
    return cambios;
  } catch (e) {
    try { logWarn_(CAN_ETAPA, 'No se pudo revisar si ya tenian guia: ' + String(e.message || e).split('\n')[0]); } catch (e2) {}
    return 0;
  }
}

/**
 * La extensión acaba de COMPRAR estas guías (pos = pedidos, solo dígitos). Si el pedido ya tiene fila en Cancelaciones, la compra fue DESPUES
 * de cancelar (normal): la fila queda "SISTEMA · …" y no se avisa nada. Si no tiene fila, se recuerda la compra (GA_COMPRAS): si su cancelación
 * llega después, la fila saldrá "SÍ · comprada por el sistema antes de la cancelación".
 */
function cgRegistrarCompras_(pos) {
  var lista = []; (pos || []).forEach(function (o) { o = String(o || '').replace(/\D/g, ''); if (o && lista.indexOf(o) < 0) lista.push(o); });
  if (!lista.length) return { sistema: [], recordadas: [] };
  var h = getHoja_(CAN_HOJA), ahora = Date.now(), res = { sistema: [], recordadas: [] }, filasDe = {};
  if (h && h.getLastRow() > 1) {
    var m = cgAsegurar_(h), n = h.getLastRow() - 1, cG = m[normEnc_(CG_COL)], cOrd = canColOrden_(m);
    if (cG && cOrd) {
      var ord = canColVals_(h, cOrd, n), cur = canColVals_(h, cG, n);
      ord.forEach(function (v, i) { var o = canTextoOrden_(v); if (o) (filasDe[o] = filasDe[o] || []).push(i); });
      lista.forEach(function (o) {
        if (!filasDe[o]) return;
        filasDe[o].forEach(function (i) {
          var c = String(cur[i] == null ? '' : cur[i]).trim();
          if (/^S[IÍ](?=\s|$)/i.test(c) || /^SISTEMA/i.test(c)) return;     // ya estaba decidida
          h.getRange(i + 2, cG).setNumberFormat('@').setValue('SISTEMA · guía comprada por el sistema el ' + cgFmt_(ahora) + ' (después de cancelar)');
        });
        res.sistema.push(o);
      });
    }
  }
  var compras = cgComprasLeer_();
  lista.forEach(function (o) { if (!filasDe[o]) { compras[o] = ahora; res.recordadas.push(o); } });
  if (res.recordadas.length) cgComprasGuardar_(compras);
  return res;
}

/** Menu: marca PAQUETERIA AVISADA en las cancelaciones que llegaron con la guia ya hecha (mismas que cuenta el Reporte: GUIA EN SITE = SÍ, sin marcar, ultimos 14 dias).
 *  Pide confirmacion (lista cuantas y cuales) y solo escribe SU casilla en esas filas. Todo queda en el Log. */
function cancelacionesMarcarAvisadas() {
  var ui = SpreadsheetApp.getUi(), h = getHoja_(CAN_HOJA);
  if (!h || h.getLastRow() < 2) { ui.alert('No hay cancelaciones.'); return; }
  var m = canMapaHoja_(h).mapa, n = h.getLastRow() - 1;
  var cA = m[normEnc_(CG_AVISADA)], cG = m[normEnc_(CG_COL)], cFc = m[normEnc_('FECHA CORREO')], cFl = m[normEnc_('FECHA LECTURA')], cOrd = canColOrden_(m);
  if (!cA || !cG) { ui.alert('Faltan las columnas ' + CG_AVISADA + ' o ' + CG_COL + ' en Cancelaciones.'); return; }
  var gs = canColVals_(h, cG, n), av = canColVals_(h, cA, n), fc = cFc ? canColVals_(h, cFc, n) : [], fl = cFl ? canColVals_(h, cFl, n) : [], ord = cOrd ? canColVals_(h, cOrd, n) : [];
  var limite = Date.now() - 14 * 86400000, filas = [], ids = [];
  for (var i = 0; i < n; i++) {
    var t = cgMs_(fc[i]) || cgMs_(fl[i]);
    if (/^S[IÍ](\s|$)/i.test(String(gs[i] == null ? '' : gs[i]).trim()) && !(av[i] === true || String(av[i]).trim().toUpperCase() === 'TRUE') && t && t >= limite) { filas.push(i + 2); ids.push(String(ord[i] == null ? '' : ord[i]).replace(/\D/g, '') || ('fila ' + (i + 2))); }
  }
  if (!filas.length) { ui.alert('No hay cancelaciones con guía pendientes de marcar como avisadas.'); logOk_('CANCEL_AVISADAS', 'Marcar paquetería avisada: no había pendientes'); flushLog_(); return; }
  var r = ui.alert('Marcar paquetería avisada', 'Voy a marcar PAQUETERIA AVISADA en ' + filas.length + ' cancelación(es) que llegaron con la guía ya hecha:\n\n' + ids.join('\n') + '\n\n¿Ya avisaste a la paquetería para que detenga esos paquetes?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) { logWarn_('CANCEL_AVISADAS', 'Marcar paquetería avisada: cancelado por el usuario (' + filas.length + ' pendientes)'); flushLog_(); return; }
  filas.forEach(function (f) { h.getRange(f, cA).setValue(true); });
  SpreadsheetApp.flush();
  logOk_('CANCEL_AVISADAS', 'Paquetería avisada marcada en ' + filas.length + ' cancelación(es): ' + ids.join(', '), { filas: filas });
  flushLog_();
  ui.alert('Listo: ' + filas.length + ' cancelación(es) marcadas como paquetería avisada.');
}
