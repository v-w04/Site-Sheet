/**
 * ============================================================
 *  Seller Center (lo que se ve al entrar a seller.walmart.com)
 * ============================================================
 *
 *  La extension de Chrome "Site Sheet - Cookie" (v1.3) lee en tu Seller Center, con tu sesion ya iniciada
 *  (incluye el codigo 2FA), la lista de pedidos: orden de compra, pedido, fechas, total y ESTADO (Nuevo,
 *  Aceptado, Enviado, Canceladas). Los manda aqui por POST (accion 'seller_pedidos') y quedan UNA vez por
 *  pedido en la hoja "Seller Center". Tambien le pide al Sheet que pedidos buscar ('seller_pendientes'):
 *  los de la hoja "Pedidos en riesgo" que aun no estan resueltos.
 *
 *  Solo se LEE Seller Center: no se cancela ni se cambia nada. No se guardan nombres de clientes.
 *  El estado de Seller Center se cruza en "Pedidos en riesgo" (columna ESTATUS SELLER CENTER).
 * ============================================================
 */

var SC_HOJA = 'Seller Center', SC_ETAPA = 'SELLER';
var SC_ENC = ['PEDIDO', 'ORDEN DE COMPRA', 'FECHA PEDIDO', 'ENVIO ESTIMADO', 'TOTAL', 'ESTADO SELLER CENTER', 'GRUPO', 'ACTUALIZADO'];
var SC_MAX_FILAS = 600, SC_FRESCO_H = 6, SC_MAX_PENDIENTES = 15;
var SC_SIN_RESOLVER_FUERA = ['ENVIADA CON GUIA', 'CANCELADA EN WALMART'];   // estas ya no se buscan en Seller Center

/* ---------------- piezas puras (se prueban sin Google) ---------------- */

/** 'Enviado' / 'Entregado' / 'Canceladas' / 'Sin enviar' ... -> CANCELADO | ENTREGADO | ENVIADO | ACEPTADO | NUEVO | OTRO | ''. */
function scNorm_(t) {
  var s = String(t === null || t === undefined ? '' : t).toLowerCase();
  try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
  s = s.replace(/[^a-z0-9]/g, '');
  if (!s) return '';
  if (/cancel/.test(s)) return 'CANCELADO';
  if (/sinenviar|noenviad|unshipped|nuevo|creado|created|pendiente/.test(s)) return 'NUEVO';
  if (/acept|acknowledg/.test(s)) return 'ACEPTADO';
  if (/entreg|deliver/.test(s)) return 'ENTREGADO';
  if (/envi|ship/.test(s)) return 'ENVIADO';
  return 'OTRO';
}

/** Filas que manda la extension -> filas validas (solo digitos en pedido/orden, fechas AAAA-MM-DD). Nada mas entra. */
function scLimpiar_(filas) {
  var out = [], vistos = {};
  (Array.isArray(filas) ? filas : []).slice(0, SC_MAX_FILAS).forEach(function (f) {
    if (!f || typeof f !== 'object') return;
    var ped = String(f.pedido === undefined || f.pedido === null ? '' : f.pedido).replace(/\s+/g, '');
    if (!/^\d{9,20}$/.test(ped) || vistos[ped]) return;
    vistos[ped] = true;
    var ord = String(f.orden === undefined || f.orden === null ? '' : f.orden).replace(/\s+/g, '');
    var iso = function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(String(x || '')) ? String(x) : ''; };
    var tot = Number(f.total);
    out.push({ pedido: ped, orden: /^\d{9,20}$/.test(ord) ? ord : '', fecha: iso(f.fecha), envio: iso(f.envio), total: isFinite(tot) && f.total !== '' && f.total !== null ? tot : '',
               estado: String(f.estado === undefined || f.estado === null ? '' : f.estado).replace(/\s+/g, ' ').trim().slice(0, 40) });
  });
  return out;
}

/** Que estatus usar en el cruce: Seller Center si es reciente (o si dice cancelado, que no se regresa); si no, el de Ventas Walmart (API). */
function scElegir_(sc, ventasEst, ahoraMs) {
  var ve = String(ventasEst || '');
  if (!sc || !sc.norm) return { estatus: ve, etiqueta: '' };
  var horas = sc.act ? (ahoraMs - sc.act) / 3600000 : 1e9;
  var fresco = horas <= SC_FRESCO_H;
  var viejo = horas >= 48 ? ' (hace ' + Math.floor(horas / 24) + ' d)' : ' (hace ' + Math.floor(horas) + ' h)';
  var etiqueta = sc.norm + (fresco ? '' : (sc.act ? viejo : ''));
  if (sc.norm === 'CANCELADO') return { estatus: 'Cancelled', etiqueta: etiqueta };
  if (/cancel/i.test(ve)) return { estatus: ve, etiqueta: etiqueta };
  if (fresco) {
    var m = { ENVIADO: 'Shipped', ENTREGADO: 'Delivered', ACEPTADO: 'Acknowledged', NUEVO: 'Created' };
    return { estatus: m[sc.norm] || ve, etiqueta: etiqueta };
  }
  return { estatus: ve, etiqueta: etiqueta };
}

/* ---------------- lectura del indice ---------------- */

/** { digitos de pedido u orden: {raw, norm, act(ms)} } desde la hoja Seller Center. */
function scIndice_() {
  var idx = {}, t = peTabla_(SC_HOJA);
  if (!t) return idx;
  var iP = peCol_(t, ['PEDIDO']), iO = peCol_(t, ['ORDEN DE COMPRA']), iE = peCol_(t, ['ESTADO SELLER CENTER']), iA = peCol_(t, ['ACTUALIZADO']);
  if (iE < 0) return idx;
  t.filas.forEach(function (f) {
    var o = { raw: String(f[iE] || ''), norm: scNorm_(f[iE]), act: iA >= 0 && f[iA] instanceof Date ? f[iA].getTime() : 0 };
    [iP, iO].forEach(function (i) { if (i < 0) return; var k = prDigitos_(f[i]); if (k) idx[k] = o; });
  });
  return idx;
}

/* ---------------- recibir lo que manda la extension ---------------- */

/** Guarda las filas (upsert por PEDIDO). Escribe por columna y solo si cambio. Devuelve {nuevas, cambios, estados:{...}}. */
function scGuardar_(filas, ahora, grupo) {
  var h = peHojaAsegurar_(SC_HOJA, SC_ENC), t = peTabla_(SC_HOJA);
  var ix = {}; SC_ENC.forEach(function (e) { ix[e] = peCol_(t, [e]); });
  var n = t.filas.length, pos = {}, nuevas = [], cambios = 0, estados = {};
  if (ix['PEDIDO'] >= 0) t.filas.forEach(function (f, i) { var k = prDigitos_(f[ix['PEDIDO']]); if (k) pos[k] = i; });
  var col = {}, orig = {};
  SC_ENC.forEach(function (e) {
    if (ix[e] < 0) return;
    col[e] = t.filas.map(function (f) { return f[ix[e]]; });
    orig[e] = col[e].slice();
  });
  var fecha = function (iso) { return iso ? prFecha_(iso) : ''; };
  filas.forEach(function (x) {
    var nuevo = { 'PEDIDO': "'" + x.pedido, 'ORDEN DE COMPRA': x.orden ? "'" + x.orden : '', 'FECHA PEDIDO': fecha(x.fecha), 'ENVIO ESTIMADO': fecha(x.envio), 'TOTAL': x.total,
                  'ESTADO SELLER CENTER': x.estado, 'GRUPO': grupo || '', 'ACTUALIZADO': ahora };
    var i = pos[x.pedido];
    if (i === undefined) { nuevas.push(nuevo); estados[scNorm_(x.estado)] = (estados[scNorm_(x.estado)] || 0) + 1; return; }
    SC_ENC.forEach(function (e) {
      if (!col[e] || e === 'PEDIDO') return;
      var v = nuevo[e];
      if (e === 'ORDEN DE COMPRA') v = x.orden || col[e][i];       // no borra una orden ya conocida
      if (e === 'ORDEN DE COMPRA' && x.orden) v = "'" + x.orden;
      if (v instanceof Date || (col[e][i] instanceof Date)) {
        var a = v instanceof Date ? v.getTime() : v, b = col[e][i] instanceof Date ? col[e][i].getTime() : col[e][i];
        if (a === b) return;
      } else if (String(col[e][i]).replace(/^'/, '') === String(v).replace(/^'/, '')) return;
      if (e === 'ESTADO SELLER CENTER' && scNorm_(col[e][i]) !== scNorm_(v)) { cambios++; estados[scNorm_(v)] = (estados[scNorm_(v)] || 0) + 1; }
      col[e][i] = v;
    });
  });
  if (n) SC_ENC.forEach(function (e) {
    if (!col[e]) return;
    var cambio = false;
    for (var i = 0; i < n; i++) {
      var a = col[e][i], b = orig[e][i];
      if ((a instanceof Date ? a.getTime() : a) !== (b instanceof Date ? b.getTime() : b)) { cambio = true; break; }
    }
    if (cambio) h.getRange(2, ix[e] + 1, n, 1).setValues(col[e].map(function (v) { return [v]; }));
  });
  if (nuevas.length) peAgregar_(h, SC_ENC, nuevas);
  return { nuevas: nuevas.length, cambios: cambios, estados: estados };
}

/** POST 'seller_pedidos' {clave, grupo, filas:[{pedido, orden, fecha, envio, total, estado}]}. */
function scRecibir_(p) {
  var err = csAutorizar_(p); if (err) return err;
  var filas = scLimpiar_(p.filas), grupo = String(p.grupo || '').replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 20);
  if (!filas.length) return { ok: true, recibidas: 0, nuevas: 0, cambios: 0 };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'ocupado' };
  try {
    var r = scGuardar_(filas, new Date(), grupo);
    if (r.nuevas || r.cambios) logOk_(SC_ETAPA, 'Seller Center (' + (grupo || 'lista') + '): ' + filas.length + ' pedidos leidos, ' + r.nuevas + ' nuevos, ' + r.cambios + ' cambios de estado', r.estados);
    flushLog_();
    return { ok: true, recibidas: filas.length, nuevas: r.nuevas, cambios: r.cambios };
  } catch (e) {
    logErr_(SC_ETAPA, 'No se pudo guardar Seller Center: ' + String(e.message).split('\n')[0]); flushLog_();
    return { ok: false, error: 'no_se_pudo_guardar' };
  } finally { try { lock.releaseLock(); } catch (e2) {} }
}

/** Pedidos por buscar uno por uno en Seller Center: los de "Pedidos en riesgo" sin resolver (los mas recientes primero). */
function scPedidosPorBuscar_() {
  var t = peTabla_(PRI_HOJA), out = [];
  if (!t) return out;
  var iP = peCol_(t, ['PEDIDO']), iS = peCol_(t, ['SITUACION']), iU = peCol_(t, ['ULTIMO AVISO']);
  if (iP < 0) return out;
  var filas = t.filas.map(function (f) { return { ped: prPedidoBase_(f[iP]), sit: iS < 0 ? '' : String(f[iS] || ''), u: iU >= 0 && f[iU] instanceof Date ? f[iU].getTime() : 0 }; })
    .filter(function (x) { return x.ped && SC_SIN_RESOLVER_FUERA.indexOf(x.sit) < 0; })
    .sort(function (a, b) { return b.u - a.u; });
  filas.forEach(function (x) { if (out.length < SC_MAX_PENDIENTES && out.indexOf(x.ped) < 0) out.push(x.ped); });
  return out;
}

/** POST 'seller_pendientes' {clave} -> {ok, pedidos:[...]}. */
function scPendientes_(p) {
  var err = csAutorizar_(p); if (err) return err;
  try { return { ok: true, pedidos: scPedidosPorBuscar_() }; }
  catch (e) { return { ok: false, error: 'no_se_pudo_leer' }; }
}
