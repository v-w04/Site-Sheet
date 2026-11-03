/**
 * SITE SHEET - Canceladas en camino: ventas que ya salieron y luego se cancelaron en Odoo.
 *
 * Caso: el paquete va en camino (o ya se entrego) y la venta esta cancelada en Odoo. Puede ser intento del
 * cliente, fraude, o que la paqueteria no encuentre el domicilio. Hay que seguir el paquete hasta que
 * regrese al almacen. Se detecta cruzando Ventas Walmart (site): ODOO ESTADO = cancel y ENVIO ESTADO =
 * recolectado / reparto / entregado. Las filas NO se borran; RECIBIDO y NOTAS las llenas tu.
 * Corre sola despues de cada bajada de Ventas Walmart. Solo lee: no cancela ni mueve nada.
 */
var CEC_HOJA = 'Cancelada en camino';
var CEC_ETAPA = 'CAMINO';
var CEC_ENC = ['ESTADO', 'FOLIO', 'PEDIDO', 'FECHA VENTA', 'SKU', 'PRODUCTO', 'PIEZAS', 'PRECIO', 'PAQUETERIA', 'GUIA', 'ENVIO',
               'DIAS', 'QUE PASO', 'ACCION', 'DETECTADO'];
var CEC_MANUAL = ['RECIBIDO', 'NOTAS'];            // las llenas tu; no las toca el script
var CEC_SALIDOS = { recolectado: 1, reparto: 1, entregado: 1 };
var CEC_DIAS_SEGUIR = 10;                           // en camino mas de esto sin regresar: dar seguimiento con la paqueteria

/** Funcion pura: estado, que paso y accion de una fila. d = {envio, dias, recibido, estabaEnCamino} */
function cecClasificar_(d) {
  if (d.recibido) return { estado: 'CERRADO', paso: 'Regreso al almacen', accion: '—' };
  if (d.envio === 'entregado') return { estado: 'ENTREGADA', paso: 'Entregada al cliente y cancelada en Odoo', accion: 'Reclamar con Walmart / recuperar producto' };
  if (d.envio === 'cancelado') return { estado: 'GUIA CANCELADA', paso: 'Salio y la guia se cancelo', accion: 'Confirmar que regresa y recibirlo' };
  if (d.dias >= CEC_DIAS_SEGUIR) return { estado: 'EN CAMINO', paso: 'En camino ' + d.dias + ' d, cancelada en Odoo', accion: 'Dar seguimiento con la paqueteria' };
  return { estado: 'EN CAMINO', paso: 'En camino y cancelada en Odoo', accion: 'Esperar que regrese' };
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
  var ahora = Date.now(), actuales = {};
  v.filas.forEach(function (f) {
    var folio = String(f[cFol] || '').replace(/\.0$/, '').trim();
    if (!folio || String(f[cOd]).trim().toLowerCase() !== 'cancel') return;
    var env = String(f[cEnv] || '').trim().toLowerCase();
    actuales[folio] = { f: f, env: env };
  });

  var ss = SpreadsheetApp.getActive(), h = ss.getSheetByName(CEC_HOJA);
  var previas = [], manual = {}, existentes = {};
  if (h && h.getLastRow() > 1) {
    var t = peTabla_(CEC_HOJA);
    var Q = function (n) { var j = t.pos[normEnc_(n)]; return j === undefined ? -1 : j; };
    t.filas.forEach(function (f) {
      var folio = String(f[Q('FOLIO')] || '').replace(/\.0$/, '').trim();
      if (!folio) return;
      existentes[folio] = { fila: f, q: Q };
      previas.push(folio);
    });
  }
  var nuevas = [], orden = previas.slice();
  Object.keys(actuales).forEach(function (folio) {
    var a = actuales[folio];
    if (!CEC_SALIDOS[a.env] || existentes[folio]) return;   // solo entra si ya salio
    nuevas.push(folio); orden.push(folio);
  });
  if (!orden.length) return { n: 0, nuevas: [], porEstado: {} };

  var porEstado = {}, filas = [];
  orden.forEach(function (folio) {
    var a = actuales[folio], ex = existentes[folio], f = a ? a.f : null, env, ant = ex ? ex.fila : null, q = ex ? ex.q : null;
    var recibido = ex && q('RECIBIDO') >= 0 ? ex.fila[q('RECIBIDO')] : '';
    if (a) env = a.env; else env = ant ? String(ant[q('ENVIO')] || '').toLowerCase() : '';
    var pick = function (n, nv) { return f ? g(f, n) : (ant && q(nv || n) >= 0 ? ant[q(nv || n)] : ''); };
    var fecha = pick('FECHA', 'FECHA VENTA');
    var dias = cecDias_(fecha, ahora);
    var c = cecClasificar_({ envio: env, dias: dias, recibido: recibido });
    porEstado[c.estado] = (porEstado[c.estado] || 0) + 1;
    filas.push({
      'ESTADO': c.estado, 'FOLIO': folio, 'PEDIDO': pick('REFERENCIA', 'PEDIDO'), 'FECHA VENTA': fecha, 'SKU': pick('SKU'),
      'PRODUCTO': pick('PRODUCTO'), 'PIEZAS': pick('PIEZAS'), 'PRECIO': pick('PRECIO'), 'PAQUETERIA': pick('ENVIO PAQUETERIA', 'PAQUETERIA'),
      'GUIA': pick('ENVIO GUIA', 'GUIA'), 'ENVIO': env, 'DIAS': dias, 'QUE PASO': c.paso, 'ACCION': c.accion,
      'DETECTADO': ex && q('DETECTADO') >= 0 ? ant[q('DETECTADO')] : Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')
    });
  });
  var tabla = filas.map(function (o) { return CEC_ENC.map(function (k) { return o[k]; }); });
  if (!h) h = ss.insertSheet(CEC_HOJA);
  cecQuitarVacias_(h);
  vdEscribir_(h, CEC_ENC, tabla, { texto: ['FOLIO', 'PEDIDO', 'GUIA'] });
  cecEnsure_(h);   // RECIBIDO y NOTAS al final, DESPUES de las del script
  return { n: filas.length, nuevas: nuevas, porEstado: porEstado };
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
      if (hu !== props_().getProperty('CEC_HUELLA')) { props_().setProperty('CEC_HUELLA', hu); logOk_(CEC_ETAPA, 'Canceladas en camino: ' + txt); }
    }
  } catch (e) { avisoDia_('cec-error', 'WARN', CEC_ETAPA, 'Canceladas en camino: ' + String(e.message || e).split('\n')[0].slice(0, 160)); }
}
