/**
 * ============================================================
 *  Guias automaticas — lado del Sheet (la extension "Site Sheet - Cookie" hace los clics en la pagina de Guias)
 * ============================================================
 *
 *  La pagina /walmart/guias del site compra las guias y marca "enviado". Aqui el Sheet SOLO dice a la extension
 *  QUE pedidos NO debe enviar (RETENER) y cuales SI aunque la venta este cancelada en Odoo (ENVIAR). Todo lo demas
 *  lo deciden los candados de la propia pagina (precio, medidas, venta en Odoo, relectura del servidor).
 *
 *  Reglas del dueño (15-nov-2026), en este ORDEN: 1) se cancela en Odoo/site, 2) se revisa lo cancelado y lo pendiente (QUE HACER), 3) se envia la guia.
 *   - Un pedido que esta en Cancelaciones solo se envia cuando TODAS sus filas ya dicen CANCELADO EN ODOO / EN SITE. Mientras siga
 *     pendiente, con ERROR u OJO, la guia espera (nunca se manda sin saber su estatus en el Sheet y en Odoo).
 *   - Correo del cliente, FRAUDE y MANUAL (lo que cancelas tu en el site): ya cancelados en Odoo/site, se compra la guia y se envia sola.
 *   - PRECIO ERRONEO (3-5% y mas de 5%): su guia NUNCA sale sola; se queda en Guias de Walmart esperando que tu la envies a mano.
 *   - SOBREVENTA: se cancela en Odoo/site pero su guia NUNCA se manda (la cancelas tu a mano en Walmart).
 *   - Unica excepcion de precio erroneo: un 3-5% con ENVIAR marcado (sin CANCELAR): tu decidiste que si se vaya, y se compra/envia sola.
 *     ENVIAR y CANCELAR a la vez: se avisa en el Log y no se envia.
 *   - Lo que cancelas en el site y no esta en la hoja: la extension lo reporta y aqui se agrega como MANUAL / CANCELADO EN ODOO (gaAgregarManuales_);
 *     la siguiente corrida lo envia (siempre con el candado de precio de la pagina).
 *   - Sin medidas en Odoo: la pagina no deja comprar; la extension los salta y se avisan en el Reporte.
 *   - Sin tope por corrida (decision del dueño): se envia todo lo que pase las reglas.
 *
 *  Nada de esto cancela NADA en Walmart (ver CancelacionesWalmart.gs / pruebas/t73.js). Comprar guia y marcar enviado es
 *  lo que ya hacia la pagina con una persona; aqui solo se automatizan sus dos clics, apagado por defecto en la extension.
 *
 *  Acciones del Web App (POST, con la misma clave de la extension):
 *    guias_lista    -> { ok, retener:[PO], enviar:[PO], forzados:[PO] (ENVIAR marcado: salta el candado de precio), conflictos:[PO], umbralPct }   (falla cerrado: si no hay lista, la extension NO envia)
 *    guias_reporte  -> la extension cuenta lo que hizo; queda en el Log y en el Reporte.
 */

var GA_ETAPA = 'GUIAS_AUTO';
var GA_PROP_ULTIMA = 'GA_ULTIMA';          // JSON de la ultima corrida (chico)
var GA_PROP_SINMED = 'GA_SINMEDIDAS_VISTO'; // SKUs sin medidas ya avisados (para no repetir el aviso cada hora)
var GA_ESPERA_MIN = 30;                    // minutos que un pedido espera antes de comprar su guia (por si llega su cancelacion)
var GA_ENVIAR = 'ENVIAR';                  // casilla de Cancelaciones: tu decides ENVIAR (no cancelar) un precio erroneo de 3-5%

/** Pura. filas: [{orden, origen, estado, casilla, enviar}] -> { retener:[PO], enviar:[PO], forzados:[PO], conflictos:[PO] } (PO sin sufijos, solo digitos).
 *  Orden de las cosas (regla del dueño): 1) se cancela en Odoo/site, 2) se revisa lo cancelado y lo pendiente, 3) SOLO entonces se envia la guia.
 *  Un pedido que esta en Cancelaciones se puede enviar unicamente si TODAS sus filas ya dicen CANCELADO (en Odoo o site) o tu marcaste ENVIAR
 *  en un precio erroneo. Si la fila sigue pendiente, con error, OJO o sin estado: se ESPERA (retener). Sobreventa: nunca. */
function gaListas_(filas) {
  var po = {};   // PO -> {ret, forz, conf, filas, lib}
  (filas || []).forEach(function (f) {
    var o = String(f.orden == null ? '' : f.orden).replace(/\.0+$/, '').replace(/\D/g, '');
    if (!o) return;
    var ori = String(f.origen == null ? '' : f.origen).toUpperCase().trim();
    var est = String(f.estado == null ? '' : f.estado).trim();
    var x = po[o] = po[o] || { ret: false, forz: false, conf: false, filas: 0, lib: 0 };
    var cancelar = f.casilla === true, enviar = f.enviar === true, cancelado = /^CANCELADO/i.test(est);
    x.filas++;
    if (/^SOBREVENTA/.test(ori)) { x.ret = true; return; }                       // sobreventa: se cancela en site/Odoo, pero su guia NUNCA se manda
    if (enviar && cancelar) x.conf = true;
    if (/^PRECIO/.test(ori)) {                                                    // precio erroneo: su guia NUNCA sale sola, salvo tu ENVIAR en un 3-5%
      if (enviar && !cancelar && !cancelado) { x.forz = true; x.lib++; } else x.ret = true;
      return;                                                                     // (cancelado = lo cancelas tu en Walmart a mano; su guia se queda en Guias de Walmart)
    }
    if (cancelado) { x.lib++; return; }                                           // ya cancelada en Odoo/site: ahora si se puede enviar su guia
    x.ret = true;                                                                 // todavia no esta cancelada: se espera
  });
  var out = { retener: [], enviar: [], forzados: [], conflictos: [] };
  Object.keys(po).sort().forEach(function (o) {
    var x = po[o];
    if (x.ret || x.lib < x.filas) out.retener.push(o);
    else { out.enviar.push(o); if (x.forz) out.forzados.push(o); }
    if (x.conf) out.conflictos.push(o);
  });
  return out;
}

/** Lee la hoja Cancelaciones y arma las listas. Devuelve null si no se puede leer (la extension no envia nada). */
function gaLeerListas_() {
  var h = getHoja_(CAN_HOJA);
  if (!h || h.getLastRow() < 2) return h ? { retener: [], enviar: [], forzados: [], conflictos: [] } : null;
  var m = canMapaHoja_(h).mapa, n = h.getLastRow() - 1;
  var cOrd = canColOrden_(m);
  if (!cOrd || !m[normEnc_(CAN_ORIGEN)]) return null;
  var ord = canColVals_(h, cOrd, n), ori = canColVals_(h, m[normEnc_(CAN_ORIGEN)], n),
      chk = canColVals_(h, m[normEnc_(CAN_CHECK)], n), env = canColVals_(h, m[normEnc_(GA_ENVIAR)], n),
      est = m[normEnc_(CAN_ESTADO)] ? canColVals_(h, m[normEnc_(CAN_ESTADO)], n) : [];
  var filas = [];
  for (var i = 0; i < n; i++) filas.push({ orden: canTextoOrden_(ord[i]), origen: ori[i], estado: est[i], casilla: chk[i], enviar: env[i] });
  return gaListas_(filas);
}

/** Web App: la extension pide la lista de pedidos que NO debe enviar. */
function gaEntregarLista_(p) {
  var err = csAutorizar_(p); if (err) return err;
  var l = null;
  try { l = gaLeerListas_(); } catch (e) { l = null; }
  if (!l) return { ok: false, error: 'sin_hoja_cancelaciones' };   // falla cerrado
  if (l.conflictos.length) {
    try { logWarn_(GA_ETAPA, 'Marcaste ENVIAR y CANCELAR EN ODOO a la vez en: ' + l.conflictos.join(', ') + '. Se retienen: deja solo una casilla.'); flushLog_(); } catch (e2) {}
  }
  var lect = Number(props_().getProperty('CAN_LECT_OK_TS') || 0);
  return { ok: true, retener: l.retener, enviar: l.enviar, forzados: l.forzados, conflictos: l.conflictos, umbralPct: CANP_ENTRA_PCT,
    esperaMin: GA_ESPERA_MIN, lecturaMin: lect ? Math.max(0, Math.round((Date.now() - lect) / 60000)) : 9999, ts: new Date().getTime() };
}

/** Pura. Texto corto de una corrida para el Log. c = {modo, comprados, saltados, sinMedidas, resultados, error}. */
function gaTextoCorrida_(c) {
  c = c || {};
  var comp = (c.comprados || []).length, partes = [];
  var res = c.resultados || {};
  partes.push((c.modo === 'real' ? 'REAL' : 'PRUEBA (no se compro nada)') + ': ' + (c.modo === 'real' ? (res.ok || 0) + ' con guia y enviados' : comp + ' se enviarian'));
  if (c.modo === 'real' && (res.pend || res.mal)) partes.push((res.pend || 0) + ' con guia pagada sin marcar, ' + (res.mal || 0) + ' sin guia');
  var sal = c.saltados || {}, mot = Object.keys(sal).filter(function (k) { return (sal[k] || []).length; });
  if (mot.length) partes.push('no se envian: ' + mot.map(function (k) { return sal[k].length + ' ' + k; }).join(', '));
  var sm = c.sinMedidas || [];
  if (sm.length) partes.push('SIN MEDIDAS (' + sm.length + '): ' + sm.slice(0, 5).map(function (x) { return String(x.sku || '?'); }).join(', ') + (sm.length > 5 ? ' y ' + (sm.length - 5) + ' mas' : ''));
  if (c.error) partes.push('ERROR: ' + c.error);
  return partes.join(' · ');
}

/** Web App: la extension cuenta lo que hizo. Se guarda la ultima corrida y se deja en el Log. */
function gaRecibirReporte_(p) {
  var err = csAutorizar_(p); if (err) return err;
  var c = p.corrida || {};
  var limpio = {
    modo: c.modo === 'real' ? 'real' : 'prueba',
    comprados: (c.comprados || []).map(String).filter(function (x) { return /^\d{9,20}$/.test(x); }).slice(0, 60),
    saltados: {}, sinMedidas: [], resultados: { ok: Number((c.resultados || {}).ok) || 0, pend: Number((c.resultados || {}).pend) || 0, mal: Number((c.resultados || {}).mal) || 0 },
    error: String(c.error || '').slice(0, 200), ts: new Date().getTime()
  };
  Object.keys(c.saltados || {}).slice(0, 12).forEach(function (k) {
    limpio.saltados[String(k).slice(0, 60)] = (c.saltados[k] || []).map(String).filter(function (x) { return /^\d{9,20}$/.test(x); }).slice(0, 60);
  });
  (c.sinMedidas || []).slice(0, 60).forEach(function (x) {
    limpio.sinMedidas.push({ po: String(x.po || '').replace(/\D/g, '').slice(0, 20), sku: String(x.sku || '').slice(0, 60), producto: String(x.producto || '').slice(0, 80) });
  });
  // Guias que acaban de comprarse: si el pedido ya tenia cancelacion fue DESPUES de cancelar (normal); si no, se recuerda por si su cancelacion llega despues (CancelacionesGuia.gs)
  try { if (limpio.modo === 'real' && limpio.comprados.length && typeof cgRegistrarCompras_ === 'function') { cgRegistrarCompras_(limpio.comprados); canQueHacerSync_(); } } catch (eCg) { try { logWarn_(GA_ETAPA, 'No pude anotar las guias compradas: ' + String(eCg.message || eCg).split('\n')[0]); } catch (eL) {} }
  var texto = gaTextoCorrida_(limpio);
  var hayProblema = !!limpio.error || limpio.resultados.mal > 0 || limpio.resultados.pend > 0;
  if (hayProblema) logWarn_(GA_ETAPA, texto, limpio); else logOk_(GA_ETAPA, texto, limpio);
  try { props_().setProperty(GA_PROP_ULTIMA, JSON.stringify(limpio)); } catch (e) {}
  // Sin medidas: se avisa en Warn solo cuando cambia la lista de SKUs (no cada hora)
  try {
    var skus = limpio.sinMedidas.map(function (x) { return x.sku; }).filter(Boolean).sort().filter(function (v, i, a) { return a.indexOf(v) === i; });
    var visto = String(props_().getProperty(GA_PROP_SINMED) || '');
    var ahora = skus.join('|');
    if (ahora !== visto) {
      props_().setProperty(GA_PROP_SINMED, ahora);
      if (skus.length) logWarn_(GA_ETAPA, 'Pedidos SIN MEDIDAS en Odoo (no se pueden enviar solos). Escribe la caja una vez por SKU en la pagina de Guias: ' +
        limpio.sinMedidas.slice(0, 10).map(function (x) { return x.sku + ' (pedido ' + x.po + ')'; }).join(', '));
    }
  } catch (e2) {}
  // Cancelados en el site que no estan en Cancelaciones (los cancelaste tu): se anotan como MANUAL para que la siguiente corrida envie su guia
  try {
    var sinFila = (c.canceladasSinFila || []).map(String).filter(function (x) { return /^\d{9,20}$/.test(x); });
    if (sinFila.length) {
      var ag = gaAgregarManuales_(sinFila);
      if (ag.agregadas.length) logWarn_(GA_ETAPA, 'Pedidos cancelados en el site que NO estaban en Cancelaciones (los cancelaste tu): se anotaron como MANUAL y su guia se enviara en la siguiente corrida: ' + ag.agregadas.join(', ') +
        '. Si alguno era precio erroneo o sobreventa y no lo cancelaste en Walmart, borra la fila ANTES de la siguiente hora.', { ordenes: ag.agregadas });
    }
  } catch (e3) { try { logWarn_(GA_ETAPA, 'No pude anotar los cancelados a mano: ' + String(e3.message || e3).split('\n')[0]); } catch (e4) {} }
  flushLog_();
  return { ok: true };
}

var GA_TOPE_MANUALES = 40;   // maximo de filas MANUAL que se anotan por reporte (si hay mas, algo raro: no se anota ninguna y se avisa)

/** Agrega a Cancelaciones una fila MANUAL / CANCELADO EN ODOO por cada pedido (solo digitos) que no este ya en la hoja. Devuelve {agregadas:[PO], yaEstaban:n}. */
function gaAgregarManuales_(pos) {
  var res = { agregadas: [], yaEstaban: 0 };
  var h = getHoja_(CAN_HOJA);
  if (!h) return res;
  var vistos = {}, lista = [];
  (pos || []).forEach(function (o) { o = String(o || '').replace(/\D/g, ''); if (o && !vistos[o]) { vistos[o] = true; lista.push(o); } });
  if (!lista.length) return res;
  if (lista.length > GA_TOPE_MANUALES) { logErr_(GA_ETAPA, lista.length + ' pedidos cancelados sin fila en una sola corrida (maximo ' + GA_TOPE_MANUALES + '): no se anoto ninguno, revisa que paso.'); return res; }
  canAsegurarColumnas_(h, CAN_FIJAS); canAsegurarControl_(h); canAsegurarOrigen_(h);
  var m = canMapaHoja_(h).mapa, cOrd = canColOrden_(m);
  if (!cOrd) cOrd = canAsegurarColumnas_(h, ['Orden de compra#'])[normEnc_('Orden de compra#')];
  canAsegurarColumnas_(h, [CAN_OBS]);
  m = canMapaHoja_(h).mapa;
  var existentes = {};
  if (h.getLastRow() > 1) canColVals_(h, cOrd, h.getLastRow() - 1).forEach(function (v) { var o = canTextoOrden_(v); if (o) existentes[o] = true; });
  var ancho = Math.max(h.getLastColumn(), 1), ahora = new Date(), hoyD = Utilities.parseDate(hoy_(), TZ, 'yyyy-MM-dd');
  var poner = function (fila, enc, v) { var c = m[normEnc_(enc)]; if (c) fila[c - 1] = v; };
  var filas = [];
  lista.forEach(function (o) {
    if (existentes[o]) { res.yaEstaban++; return; }
    var f = new Array(ancho).fill('');
    poner(f, CAN_ORIGEN, CAN_ORI_MANUAL);
    poner(f, 'FECHA LECTURA', hoyD); poner(f, 'FECHA CORREO', ahora);
    poner(f, 'ID CORREO', 'MANUAL-SITE-' + o);
    f[cOrd - 1] = o;
    poner(f, CAN_ESTADO, 'CANCELADO EN ODOO');
    poner(f, CAN_OBS, 'Ya estaba cancelado en Odoo/site (lo cancelaste tu); la extension lo encontro en Guias y lo anoto.');
    poner(f, CAN_CHECK, false);
    filas.push(f); res.agregadas.push(o);
  });
  if (!filas.length) return res;
  canAsegurarOrden_(h);
  canNuevasPrimero_(filas, m[normEnc_('FECHA CORREO')]);
  var ini = escrInsertarArriba_(h, filas.length);
  h.getRange(ini, 1, filas.length, ancho).setNumberFormat('@');
  h.getRange(ini, 1, filas.length, ancho).setValues(filas);
  canFijarCasillas_(h, ini, filas);
  SpreadsheetApp.flush();
  try { canFormato_(h); } catch (e) {}
  try { canQueHacerSync_(h); } catch (e2) {}
  return res;
}

/** Para el Reporte: devuelve la ultima corrida (o null). */
function gaUltima_() {
  try { var j = props_().getProperty(GA_PROP_ULTIMA); return j ? JSON.parse(j) : null; } catch (e) { return null; }
}

/** Casillas de verdad en ENVIAR (la columna se crea al final si falta; la mueves donde quieras). Conserva lo ya marcado. */
function gaCasillas_(h) {
  var m = canMapaHoja_(h).mapa;
  if (m[normEnc_(GA_ENVIAR)] === undefined) { canAsegurarColumnas_(h, [GA_ENVIAR]); m = canMapaHoja_(h).mapa; }
  var c = m[normEnc_(GA_ENVIAR)], n = h.getLastRow() - 1;
  if (!c || n < 1) return 0;
  var rg = h.getRange(2, c, n, 1);
  var vals = rg.getValues().map(function (f) { var v = f[0]; return [v === true || String(v).trim().toUpperCase() === 'TRUE']; });
  rg.setNumberFormat('0');
  rg.insertCheckboxes();
  rg.setValues(vals);
  rg.setHorizontalAlignment('center');
  return n;
}
