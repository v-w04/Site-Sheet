/**
 * SITE SHEET - Sobreventa WFS: que paso con cada pedido y que hacer.
 *
 * La hoja Sobreventa WFS (Sobreventa.gs) trae de Odoo las salidas WFS de Walmart que siguen sin surtir.
 * Aqui se cruza cada una con:
 *   - el SITE (por la referencia 6000...): estado en Walmart, canal (WFS / seller), envio y fecha;
 *   - ODOO: stock en la ubicacion WFS (la de la columna Desde) por SKU;
 *   - la hoja Traslados Odoo: traslados a WFS que aun no se validan.
 * y se escriben columnas cortas: QUE PASO y ACCION. Corre sola despues de cada bajada de sobreventa.
 * El site se consulta 1 vez cada 6 h por pedido (CacheService); lo demas en cada vuelta.
 * Solo lee: no cancela ni valida nada en Odoo.
 */

var SW_HOJA = 'Sobreventa WFS';
var SW_ENC = ['ESTADO WM', 'ENVIO', 'CANAL', 'FECHA VENTA', 'FOLIO', 'STOCK WFS', 'EN TRASLADO', 'QUE PASO', 'ACCION', 'REVISADO'];
var SW_CACHE_S = 6 * 3600;          // cada cuanto se vuelve a preguntar al site por un pedido
var SW_DIAS_ESPERA = 3;             // Walmart aun no surte: antes de esto se espera, despues se revisa
var SW_ETAPA = 'SOBREVENTA';

/** Lo que dijo el site de cada referencia: de la cache o consultando lo que falte. {ref: d|null} */
function swSitio_(refs) {
  var cache = CacheService.getScriptCache(), out = {}, faltan = [];
  var guardado = refs.length ? cache.getAll(refs.map(function (r) { return 'SW_' + r; })) : {};
  refs.forEach(function (r) {
    var v = guardado['SW_' + r];
    if (v) { var d = JSON.parse(v); out[r] = d.nada ? null : d; } else faltan.push(r);
  });
  if (!faltan.length || typeof cpLeerSitio_ !== 'function') return out;
  var res = cpLeerSitio_(faltan, true), poner = {};
  faltan.forEach(function (r) {
    var d = res.porFolio[r];
    if (d) {
      out[r] = { estatus: d.estatus || d.estadoCanal, norm: d.estadoNorm, canal: d.fulfillment, envio: d.envioTxt || d.estatusEnvio, fecha: d.fecha, folio: d.folio };
      poner['SW_' + r] = JSON.stringify(out[r]);
    } else if (res.ruta) {   // el site contesto y no lo tiene
      out[r] = null; poner['SW_' + r] = JSON.stringify({ nada: 1 });
    }
  });
  if (Object.keys(poner).length) cache.putAll(poner, SW_CACHE_S);
  return out;
}

/** Stock libre por SKU en una ubicacion de Odoo (nombre completo, p. ej. W-ELE/Existencias). {SKU: n} o null si Odoo no contesta. */
function swStockOdoo_(ubicacion, skus) {
  if (!skus.length || (typeof odooApagado_ === 'function' && odooApagado_())) return null;
  try {
    var company = sobCompanyId_(), ctx = company ? { company_id: company } : null, out = {};
    sobBuscar_('stock.quant', [['location_id.complete_name', '=', ubicacion], ['product_id.default_code', 'in', skus]],
      ['product_id', 'quantity', 'reserved_quantity'], ctx).forEach(function (q) {
      var m = Array.isArray(q.product_id) ? String(q.product_id[1]).match(/^\[([^\]]+)\]/) : null;
      if (!m) return;
      var k = m[1].trim().toUpperCase();
      out[k] = (out[k] || 0) + Math.max(0, sobNum_(q.quantity) - sobNum_(q.reserved_quantity));
    });
    return out;
  } catch (e) { logWarn_(SW_ETAPA, 'Sin stock WFS de Odoo: ' + e.message); return null; }
}

/** Traslados a la ubicacion WFS que siguen abiertos (hoja Traslados Odoo). {SKU: {qty, refs[]}} */
function swTraslados_(ubicacion) {
  var out = {}, h = SpreadsheetApp.getActive().getSheetByName('Traslados Odoo');
  if (!h || h.getLastRow() < 2) return out;
  var c;
  try { c = colsHoja_(h, ['SKU', 'Cantidad', 'Estado', 'Destino', 'Referencia']); } catch (e) { return out; }
  h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues().forEach(function (f) {
    var est = String(f[c.Estado] || '').toLowerCase();
    if (/done|cancel|hecho|cancelad/.test(est) || String(f[c.Destino] || '').trim() !== ubicacion) return;
    var k = String(f[c.SKU] || '').trim().toUpperCase(); if (!k) return;
    var o = out[k] || (out[k] = { qty: 0, refs: [] });
    o.qty += sobNum_(f[c.Cantidad]);
    var r = String(f[c.Referencia] || '').trim(); if (r && o.refs.indexOf(r) < 0) o.refs.push(r);
  });
  return out;
}

/**
 * QUE PASO y ACCION de una linea (puro, sin Sheets). s = lo del site (o null / undefined si no se pudo preguntar),
 * libre = stock WFS que le toca a esta linea despues de las mas viejas, tras = traslado abierto del SKU.
 */
function swClasificar_(s, qty, libre, tras, ahoraMs) {
  if (s === undefined) return ['Sin respuesta del site', 'Se revisa en la siguiente vuelta'];
  if (s === null) return ['No esta en el site', 'Buscar en Seller Center'];
  var est = String(s.estatus || '').toUpperCase(), norm = String(s.norm || '').toLowerCase(), canal = String(s.canal || '').toLowerCase();
  if (/CANCEL/.test(est) || norm === 'cancelada') return ['Cancelada en Walmart', 'Cancelar en Odoo'];
  if (canal && canal.indexOf('fulfillment') < 0) return ['Venta seller con salida WFS', 'Revisar: se surte de bodega'];
  if (/SHIPPED|DELIVERED/.test(est)) {
    if (libre !== null && libre >= qty) return ['WFS la surtio · hay stock WFS', 'Comprobar disponibilidad y validar'];
    if (tras && tras.qty > 0) return ['WFS la surtio · stock en traslado', 'Validar ' + tras.refs.slice(0, 2).join(', ') + ' y luego esta salida'];
    return ['WFS la surtio · Odoo sin stock WFS', 'Cargar stock WFS en Odoo y validar'];
  }
  var f = peFecha_(s.fecha), dias = f instanceof Date ? Math.floor((ahoraMs - f.getTime()) / 86400000) : null;
  if (dias !== null && dias <= SW_DIAS_ESPERA) return ['Walmart aun no la surte', 'Esperar'];
  return ['Walmart no la surte' + (dias !== null ? ' (' + dias + ' d)' : ''), 'Revisar en Seller Center'];
}

/** Lee la hoja, cruza todo y escribe las columnas de analisis. Devuelve {n, porQue:{QUE PASO: n}}. */
function swAnalizar_() {
  var h = SpreadsheetApp.getActive().getSheetByName(SW_HOJA);
  if (!h || h.getLastRow() < 2) return { n: 0, porQue: {} };
  var c = colsHoja_(h, ['Referencia', 'Desde', 'Documento origen', 'SKU', 'Qty demandada', 'Fecha programada']);
  var datos = h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues().filter(function (f) { return String(f[c.Referencia] || '').trim(); });
  if (!datos.length) return { n: 0, porQue: {} };
  var refs = [], skus = [], ubic = '';
  datos.forEach(function (f) {
    var r = String(f[c['Documento origen']] || '').replace(/\.0$/, '').trim().split('-')[0];
    if (/^\d{15}$/.test(r) && refs.indexOf(r) < 0) refs.push(r);
    var k = String(f[c.SKU] || '').trim().toUpperCase(); if (k && skus.indexOf(k) < 0) skus.push(k);
    ubic = ubic || String(f[c.Desde] || '').trim();
  });
  var sitio = {};
  try { sitio = swSitio_(refs); } catch (e) { logWarn_(SW_ETAPA, 'Sin respuesta del site: ' + e.message); }
  var stock = swStockOdoo_(ubic, skus), tras = swTraslados_(ubic);
  // el stock WFS se reparte de la salida mas vieja a la mas nueva
  var orden = datos.map(function (f, i) { return i; }).sort(function (a, b) {
    var fa = peFecha_(datos[a][c['Fecha programada']]), fb = peFecha_(datos[b][c['Fecha programada']]);
    return (fa instanceof Date ? fa.getTime() : 0) - (fb instanceof Date ? fb.getTime() : 0);
  });
  var resta = {}, libreDe = [];
  orden.forEach(function (i) {
    var k = String(datos[i][c.SKU] || '').trim().toUpperCase(), q = sobNum_(datos[i][c['Qty demandada']]) || 1;
    if (!stock) { libreDe[i] = null; return; }
    if (resta[k] === undefined) resta[k] = stock[k] || 0;
    libreDe[i] = resta[k]; resta[k] -= q;
  });
  var ahora = new Date(), porQue = {};
  var filas = datos.map(function (f, i) {
    var r = String(f[c['Documento origen']] || '').replace(/\.0$/, '').trim().split('-')[0];
    var k = String(f[c.SKU] || '').trim().toUpperCase(), q = sobNum_(f[c['Qty demandada']]) || 1;
    var s = sitio.hasOwnProperty(r) ? sitio[r] : undefined;
    var qa = swClasificar_(s, q, libreDe[i], tras[k], ahora.getTime());
    porQue[qa[0]] = (porQue[qa[0]] || 0) + 1;
    var fv = s && s.fecha ? (typeof vhFecha_ === 'function' ? vhFecha_(s.fecha, true) : peFecha_(s.fecha)) : '';
    return [s ? s.estatus : '', s ? s.envio : '', s ? (/fulfillment/i.test(s.canal) ? 'WFS' : (s.canal ? 'SELLER' : '')) : '',
      fv instanceof Date ? fv : '', s ? s.folio : '', stock ? (stock[k] || 0) : '', tras[k] ? tras[k].qty : '', qa[0], qa[1], ahora];
  });
  // las filas vacias del final quedan fuera: se escribe en el mismo orden que la hoja
  vdEscribir_(h, SW_ENC, filas, { clave: 'SW_COLS', vacioOk: true, texto: ['FOLIO'] });
  return { n: filas.length, porQue: porQue };
}

/** Resumen corto para el Log: "51 · Cancelar en Odoo 10 · Sin stock WFS 30". */
function swResumen_(r) {
  return r.n + ' pedidos · ' + Object.keys(r.porQue).sort(function (a, b) { return r.porQue[b] - r.porQue[a]; })
    .map(function (k) { return k + ' ' + r.porQue[k]; }).join(' · ');
}

/** Despues de cada bajada de sobreventa (automatica o menu). Nunca tumba la corrida. */
function swDespuesDeBajar_(manual) {
  try {
    var r = swAnalizar_();
    if (!r.n) return '';
    var txt = swResumen_(r), huella = sha256_(txt);
    if (manual || huella !== sobProp_('SW_HUELLA')) { sobSetProp_('SW_HUELLA', huella); logOk_(SW_ETAPA, 'WFS: ' + txt); }
    return txt;
  } catch (e) { logWarn_(SW_ETAPA, 'Analisis WFS: ' + e.message); return ''; }
}
