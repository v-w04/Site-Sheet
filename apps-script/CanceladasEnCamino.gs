/**
 * SITE SHEET - Canceladas en camino: ventas que ya salieron y luego se cancelaron en Odoo.
 *
 * Caso: el paquete va en camino (o ya se entrego) y la venta esta cancelada en Odoo. Puede ser intento del
 * cliente, fraude, o que la paqueteria no encuentre el domicilio. Hay que seguir el paquete hasta que
 * regrese al almacen. Se detecta cruzando Ventas Walmart (site): ODOO ESTADO = cancel y ENVIO ESTADO =
 * recolectado / reparto / entregado. Las filas NO se borran; RECIBIDO y NOTAS las llenas tu.
 * Corre sola despues de cada bajada de Ventas Walmart. Solo lee: no cancela ni mueve nada.
 *
 * Ademas, al final de la hoja van las ALERTAS DE ENVIO (se rehacen en cada bajada; desaparecen cuando el pedido se arregla):
 *   GUIA SIN MOVIMIENTO    Walmart sigue en Created, la guia existe y la paqueteria no tiene movimientos (2 d o mas).
 *   RECOLECTADO DETENIDO   recolectado y sin avance 5 d o mas.
 *   RASTREO SIN ACTUALIZAR el site no consulta el rastreo desde hace 2 d o mas (pedido no entregado).
 * Todo sale de los datos del site (Ventas Walmart), no de Odoo ni de las paqueterias.
 */
var CEC_HOJA = 'Cancelada en camino';
var CEC_ETAPA = 'CAMINO';
var CEC_ENC = ['ESTADO', 'FOLIO', 'PEDIDO', 'FECHA VENTA', 'SKU', 'PRODUCTO', 'PIEZAS', 'PRECIO', 'PAQUETERIA', 'GUIA', 'ENVIO',
               'DIAS', 'QUE PASO', 'ACCION', 'DETECTADO'];
var CEC_MANUAL = ['RECIBIDO', 'NOTAS'];            // las llenas tu; no las toca el script
var CEC_SALIDOS = { recolectado: 1, reparto: 1, entregado: 1 };
var CEC_ALERTAS = ['GUIA SIN MOVIMIENTO', 'RECOLECTADO DETENIDO', 'RASTREO SIN ACTUALIZAR'];
var CEC_DIAS_GUIA = 2, CEC_DIAS_DETENIDO = 5, CEC_DIAS_RASTREO = 2;
var CEC_DIAS_SEGUIR = 10;                           // en camino mas de esto sin regresar: dar seguimiento con la paqueteria

/** Funcion pura: estado, que paso y accion de una fila. d = {envio, dias, recibido, estabaEnCamino} */
function cecClasificar_(d) {
  if (d.recibido) return { estado: 'CERRADO', paso: 'Regreso al almacen', accion: '—' };
  if (d.salida && d.envio !== 'entregado' && d.envio !== 'cancelado') {   // la entrega de salida ya se hizo en Odoo y la cancelacion no se pudo aplicar ahi
    return { estado: 'SALIDA HECHA', paso: 'Salida hecha en Odoo; Walmart pidio cancelar y Odoo no la deja cancelar',
             accion: d.dias >= CEC_DIAS_SEGUIR ? 'Dar seguimiento con la paqueteria' : 'Confirmar si el paquete salio y que regrese' };
  }
  if (d.envio === 'entregado') return { estado: 'ENTREGADA', paso: 'Entregada al cliente y cancelada en Odoo', accion: 'Reclamar con Walmart / recuperar producto' };
  if (d.envio === 'cancelado') return { estado: 'GUIA CANCELADA', paso: 'Salio y la guia se cancelo', accion: 'Confirmar que regresa y recibirlo' };
  if (d.dias >= CEC_DIAS_SEGUIR) return { estado: 'EN CAMINO', paso: 'En camino ' + d.dias + ' d, cancelada en Odoo', accion: 'Dar seguimiento con la paqueteria' };
  return { estado: 'EN CAMINO', paso: 'En camino y cancelada en Odoo', accion: 'Esperar que regrese' };
}

/**
 * Pedidos de la hoja Cancelaciones cuya entrega de salida (WH/OUT) ya esta hecha: salio del almacen y Walmart pidio cancelar.
 * Devuelve { orden de compra: true }. Si la hoja no existe o falla, {}.
 */
function cecSalidasHechas_() {
  var r = {};
  try {
    var t = peTabla_('Cancelaciones');
    if (!t) return r;
    var cOrd = -1; Object.keys(t.pos).forEach(function (k) { if (cOrd < 0 && /^ORDEN DE COMPRA/.test(k)) cOrd = t.pos[k]; });
    var cTod = t.pos[normEnc_('TODAS LAS ENTREGAS')];
    if (cOrd < 0 || cTod === undefined) return r;
    t.filas.forEach(function (f) {
      var o = String(f[cOrd] || '').replace(/\.0$/, '').trim();
      if (o && /WH\/OUT\/\d+\s*\(done\)/i.test(String(f[cTod] || ''))) r[o] = true;
    });
  } catch (e) {}
  return r;
}

function cecMs_(x) { var d = (x instanceof Date) ? x : new Date(String(x || '')); var t = d.getTime(); return isNaN(t) ? 0 : t; }

/**
 * Funcion pura: alerta de envio de un pedido que sigue vivo. d = {estatus, env, ultTxt, guia, ts, consultado, dias}
 * (ts y consultado en ms, 0 si no hay; dias = desde la venta). Devuelve {estado, paso, accion} o null.
 */
function cecAlerta_(d, ahoraMs) {
  var dia = 86400000;
  if (!d.guia || d.env === 'entregado' || d.env === 'cancelado' || /cancel|deliver/i.test(String(d.estatus || ''))) return null;
  var dMov = d.ts ? Math.floor((ahoraMs - d.ts) / dia) : -1;
  var dGuia = dMov >= 0 ? dMov : d.dias;
  if (/^created$/i.test(String(d.estatus || '').trim()) && /gu[ií]a creada/i.test(String(d.ultTxt || '')) && dGuia >= CEC_DIAS_GUIA) {
    return { estado: CEC_ALERTAS[0], paso: 'Guia creada hace ' + dGuia + ' d y la paqueteria no tiene movimientos',
             accion: 'Confirmar con bodega si el paquete salio; si no, despachar ya o avisar a Walmart' };
  }
  if (d.env === 'recolectado' && dMov >= CEC_DIAS_DETENIDO) {
    return { estado: CEC_ALERTAS[1], paso: 'Recolectado y sin avance desde hace ' + dMov + ' d', accion: 'Dar seguimiento con la paqueteria' };
  }
  var dCons = d.consultado ? Math.floor((ahoraMs - d.consultado) / dia) : -1;
  if (dCons >= CEC_DIAS_RASTREO && d.dias >= CEC_DIAS_RASTREO) {
    return { estado: CEC_ALERTAS[2], paso: 'El site no actualiza el rastreo desde hace ' + dCons + ' d', accion: 'Pedir al site que lo consulte otra vez y revisar el rastreo' };
  }
  return null;
}

/** Filas de alerta (objetos con las columnas de CEC_ENC) de Ventas Walmart. excluir = { folio: true } los que ya van como canceladas. */
function cecAlertasFilas_(v, g, ahora, excluir) {
  var P = function (n) { var j = v.pos[normEnc_(n)]; return j === undefined ? -1 : j; };
  var cFol = P('FOLIO'), out = [];
  if (cFol < 0) return out;
  v.filas.forEach(function (f) {
    var folio = String(f[cFol] || '').replace(/\.0$/, '').trim();
    if (!folio || (excluir && excluir[folio])) return;
    if (/fulfillment/i.test(String(g(f, 'FULFILLMENT') || ''))) return;   // WFS: la surte Walmart
    var fecha = g(f, 'FECHA'), env = String(g(f, 'ENVIO ESTADO') || '').trim().toLowerCase();
    var dias = cecDias_(fecha, ahora);
    var a = cecAlerta_({ estatus: g(f, 'ESTATUS'), env: env, ultTxt: g(f, 'ENVIO ULT TXT'), guia: String(g(f, 'ENVIO GUIA') || '').trim(),
                         ts: cecMs_(g(f, 'ENVIO TS')), consultado: cecMs_(g(f, 'ENVIO CONSULTADO')), dias: dias }, ahora);
    if (!a) return;
    out.push({
      'ESTADO': a.estado, 'FOLIO': folio, 'PEDIDO': g(f, 'REFERENCIA'), 'FECHA VENTA': fecha, 'SKU': g(f, 'SKU'), 'PRODUCTO': g(f, 'PRODUCTO'),
      'PIEZAS': g(f, 'PIEZAS'), 'PRECIO': g(f, 'PRECIO'), 'PAQUETERIA': g(f, 'ENVIO PAQUETERIA'), 'GUIA': g(f, 'ENVIO GUIA'),
      'ENVIO': env, 'DIAS': dias, 'QUE PASO': a.paso, 'ACCION': a.accion, 'DETECTADO': Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')
    });
  });
  var peso = {}; CEC_ALERTAS.forEach(function (k, i) { peso[k] = i; });
  out.sort(function (x, y) { return (peso[x.ESTADO] - peso[y.ESTADO]) || (y.DIAS - x.DIAS); });
  return out;
}

function cecDias_(fecha, ahoraMs) {
  var d = (fecha instanceof Date) ? fecha : new Date(String(fecha || '').replace(' ', 'T'));   // la hoja la devuelve como Date o como texto
  return isNaN(d.getTime()) ? 0 : Math.max(0, Math.floor((ahoraMs - d.getTime()) / 86400000));
}

/** Cruza Ventas Walmart con la hoja propia, escribe y devuelve {n, nuevas:[folio], porEstado:{}} */
function cecActualizar_() {
  var v = peTabla_('Ventas Walmart');
  if (!v) return { n: 0, nuevas: [], porEstado: {} };
  var P = function (n) { var j = v.pos[normEnc_(n)]; return j === undefined ? -1 : j; };
  var cOd = P('ODOO ESTADO'), cEnv = P('ENVIO ESTADO'), cFol = P('FOLIO');
  if (cOd < 0 || cEnv < 0 || cFol < 0) return { n: 0, nuevas: [], porEstado: {} };
  var g = function (f, n) { var j = P(n); return j < 0 ? '' : f[j]; };
  var ahora = Date.now(), actuales = {}, salidas = cecSalidasHechas_();
  v.filas.forEach(function (f) {
    var folio = String(f[cFol] || '').replace(/\.0$/, '').trim();
    if (!folio) return;
    var env = String(f[cEnv] || '').trim().toLowerCase();
    if (String(f[cOd]).trim().toLowerCase() === 'cancel') actuales[folio] = { f: f, env: env };
    else if (salidas[folio]) actuales[folio] = { f: f, env: env, salida: true };   // salida hecha y Odoo no dejo cancelar
  });

  var ss = SpreadsheetApp.getActive(), h = ss.getSheetByName(CEC_HOJA);
  var previas = [], manual = {}, existentes = {};
  if (h && h.getLastRow() > 1) {
    var t = peTabla_(CEC_HOJA);
    var Q = function (n) { var j = t.pos[normEnc_(n)]; return j === undefined ? -1 : j; };
    t.filas.forEach(function (f) {
      if (CEC_ALERTAS.indexOf(String(f[Q('ESTADO')] || '').trim()) >= 0) return;   // las alertas se rehacen cada vez
      var folio = String(f[Q('FOLIO')] || '').replace(/\.0$/, '').trim();
      if (!folio) return;
      existentes[folio] = { fila: f, q: Q };
      previas.push(folio);
    });
  }
  var nuevas = [], orden = previas.slice();
  Object.keys(actuales).forEach(function (folio) {
    var a = actuales[folio];
    if ((!CEC_SALIDOS[a.env] && !a.salida) || existentes[folio]) return;   // solo entra si ya salio
    nuevas.push(folio); orden.push(folio);
  });
  var alertas = cecAlertasFilas_(v, g, ahora, actuales);
  if (!orden.length && !alertas.length && !(h && h.getLastRow() > 1)) return { n: 0, nuevas: [], porEstado: {} };

  var porEstado = {}, filas = [];
  orden.forEach(function (folio) {
    var a = actuales[folio], ex = existentes[folio], f = a ? a.f : null, env, ant = ex ? ex.fila : null, q = ex ? ex.q : null;
    var recibido = ex && q('RECIBIDO') >= 0 ? ex.fila[q('RECIBIDO')] : '';
    if (a) env = a.env; else env = ant ? String(ant[q('ENVIO')] || '').toLowerCase() : '';
    var pick = function (n, nv) { return f ? g(f, n) : (ant && q(nv || n) >= 0 ? ant[q(nv || n)] : ''); };
    var fecha = pick('FECHA', 'FECHA VENTA');
    var dias = cecDias_(fecha, ahora);
    var c = cecClasificar_({ envio: env, dias: dias, recibido: recibido, salida: !!(a && a.salida) });
    porEstado[c.estado] = (porEstado[c.estado] || 0) + 1;
    filas.push({
      'ESTADO': c.estado, 'FOLIO': folio, 'PEDIDO': pick('REFERENCIA', 'PEDIDO'), 'FECHA VENTA': fecha, 'SKU': pick('SKU'),
      'PRODUCTO': pick('PRODUCTO'), 'PIEZAS': pick('PIEZAS'), 'PRECIO': pick('PRECIO'), 'PAQUETERIA': pick('ENVIO PAQUETERIA', 'PAQUETERIA'),
      'GUIA': pick('ENVIO GUIA', 'GUIA'), 'ENVIO': env, 'DIAS': dias, 'QUE PASO': c.paso, 'ACCION': c.accion,
      'DETECTADO': ex && q('DETECTADO') >= 0 ? ant[q('DETECTADO')] : Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')
    });
  });
  var tabla = filas.map(function (o) { return CEC_ENC.map(function (k) { return o[k]; }); });
  alertas.forEach(function (o) { porEstado[o.ESTADO] = (porEstado[o.ESTADO] || 0) + 1; tabla.push(CEC_ENC.map(function (k) { return o[k]; })); });
  if (!h) h = ss.insertSheet(CEC_HOJA);
  cecQuitarVacias_(h);
  vdEscribir_(h, CEC_ENC, tabla, { texto: ['FOLIO', 'PEDIDO', 'GUIA'], vacioOk: true });
  cecEnsure_(h);   // RECIBIDO y NOTAS al final, DESPUES de las del script
  return { n: tabla.length, nuevas: nuevas, porEstado: porEstado };
}

/** Arreglo de la primera version: RECIBIDO y NOTAS quedaron en P:Q con A:O vacias. Si las primeras columnas estan 100% vacias, se quitan (no toca nada con datos). */
function cecQuitarVacias_(h) {
  var nc = h.getLastColumn(), nf = h.getLastRow();
  if (nc < 16 || nf < 1) return;
  var v = h.getRange(1, 1, nf, 15).getValues();
  for (var i = 0; i < v.length; i++) for (var j = 0; j < 15; j++) if (String(v[i][j]) !== '') return;
  h.deleteColumns(1, 15);
}

/** Deja los encabezados de las columnas manuales (RECIBIDO, NOTAS) si faltan: al final, sin tocar lo demas. */
function cecEnsure_(h) {
  var n = Math.max(h.getLastColumn(), 1);
  var enc = h.getRange(1, 1, 1, n).getValues()[0].map(function (x) { return String(x).trim().toUpperCase(); });
  CEC_MANUAL.forEach(function (m) {
    if (enc.indexOf(m) >= 0) return;
    var col = Math.max(h.getLastColumn(), CEC_ENC.length) + 1;
    h.getRange(1, col).setValue(m);
    enc[col - 1] = m;
  });
}

/** Lo llama la bajada de Ventas Walmart. Log solo cuando entra una nueva o cambia el resumen. */
function cecDespuesDeBajar_() {
  try {
    var r = cecActualizar_();
    if (!r.n) return;
    var txt = Object.keys(r.porEstado).map(function (k) { return k + ' ' + r.porEstado[k]; }).join(' · ');
    if (r.nuevas.length) logWarn_(CEC_ETAPA, 'Cancelada en Odoo y ya en camino: ' + r.nuevas.length + ' nueva(s): ' + r.nuevas.join(', ') + ' · ' + txt);
    else {
      var hu = sha256_(txt);
      if (hu !== props_().getProperty('CEC_HUELLA')) {
        props_().setProperty('CEC_HUELLA', hu);
        var hayAlerta = Object.keys(r.porEstado).some(function (k) { return CEC_ALERTAS.indexOf(k) >= 0; });
        (hayAlerta ? logWarn_ : logOk_)(CEC_ETAPA, 'Canceladas en camino y alertas de envio: ' + txt);
      }
    }
  } catch (e) { avisoDia_('cec-error', 'WARN', CEC_ETAPA, 'Canceladas en camino: ' + String(e.message || e).split('\n')[0].slice(0, 160)); }
}
