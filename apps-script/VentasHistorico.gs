/**
 * ============================================================
 *  Ventas Walmart (historico) — todas las ventas del canal WL, del site
 * ============================================================
 *
 *  Baja /ventas-general-data?canal=WL (paginado) a la hoja "Ventas Walmart":
 *  una fila por venta (folio 609...), con TODOS los campos que manda el site.
 *  Empieza limpio: solo ventas desde VH_DESDE (1-oct-2026; se cambia con la Script Property VH_DESDE).
 *  - La primera vez (o 1 vez al dia, "barrido") recorre todas las paginas; si no
 *    alcanza el tiempo guarda en que pagina va y sigue en la siguiente corrida.
 *  - El resto del dia solo mira las primeras paginas (lo nuevo).
 *  - Nunca duplica (llave FOLIO). Lo que cambia en el site (estatus, tracking...) se actualiza.
 *  - Nunca borra filas ni columnas tuyas: las columnas se ubican por encabezado y las que
 *    falten se crean al final; las filas solo se agregan.
 *  Auth: la misma que el resto (llave, o cookie de la extension).
 */

var VH_HOJA  = 'Ventas Walmart';
var VH_ETAPA = 'VENTAS_HIST';
var VH_DESDE_DEFECTO = '2026-10-01';
var VH_RUTA  = '/ventas-general-data';
var VH_POR_PAG = 100;   // el site entrega maximo 100 por pagina (pedir 500 devolvia 100 y la bajada creia que ya era la ultima)
var VH_QS_VACIOS = 'solo_falta=&paqueteria=&envio=&tipo=&desde=&hasta=&envio_est=&cancel=&estado=&cant=';
// _V2: la primera bajada (2-nov) se corto en la pagina 1; con llaves nuevas vuelve a barrer todo desde el 1-oct.
var VH_PROP_PAG = 'VH_PAGINA_V2', VH_PROP_BARRIDO = 'VH_BARRIDO_DIA_V2', VH_PROP_MODO = 'VH_MODO_V2', VH_PROP_MUESTRA = 'VH_MUESTRA_LOG';

// campo del site -> encabezado de la hoja (orden de las columnas nuevas). El resto de campos escalares
// que mande el site se agregan solos con su nombre en mayusculas.
var VH_CAMPOS = [
  ['folio', 'FOLIO'], ['MES', 'MES'], ['CANAL_VENTA', 'CANAL VENTA'], ['orden_id', 'ORDEN ID'], ['referencia', 'REFERENCIA'], ['odoo_id', 'ODOO ID'],
  ['canal', 'CANAL'], ['cuenta', 'CUENTA'], ['fecha_iso', 'FECHA'], ['creado', 'CREADO'], ['actualizado', 'ACTUALIZADO'],
  ['sku', 'SKU'], ['SKUS_ODOO', 'SKUS ODOO'], ['piezas', 'PIEZAS'], ['items', 'ITEMS'], ['precio', 'PRECIO'], ['PRECIO_UNITARIO', 'PRECIO UNITARIO'],
  ['producto', 'PRODUCTO'], ['estatus', 'ESTATUS'], ['estado_norm', 'ESTADO NORM'], ['fulfillment', 'FULFILLMENT'],
  ['tipo_venta', 'TIPO VENTA'], ['tracking', 'TRACKING'], ['cliente', 'CLIENTE'], ['direccion', 'DIRECCION'],
  ['ITEMS_META', 'ITEMS META']
];
var VH_SALTAR = { imagen: 1, items_meta: 1, cuenta_id: 1, vg_falta: 1 };   // items_meta va resumido en SKUS ODOO / ITEMS META
var VH_MUTABLES = ['FECHA', 'MES', 'CANAL VENTA', 'PRECIO UNITARIO', 'ESTATUS', 'ESTADO NORM', 'FULFILLMENT', 'TRACKING', 'ACTUALIZADO'];   // FECHA: corrige las filas que se bajaron con la hora corrida

function vhTexto_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/**
 * Fecha ISO del site -> texto "yyyy-MM-dd HH:mm:ss" en hora de Mexico (ordena bien como texto).
 * utc = true: el texto viene en UTC aunque no traiga zona (fecha_iso del site: sin esto salia 6 h adelantada).
 */
function vhFecha_(v, utc) {
  var s = String(v || '');
  if (!s) return '';
  if (utc && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s = s.replace(' ', 'T') + 'Z';
  var d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd HH:mm:ss');
}

/** Un registro del site -> { ENCABEZADO: valor }. */
function vhFila_(o) {
  var f = {};
  var meta = Array.isArray(o.items_meta) ? o.items_meta : [];
  var odoo = [];
  meta.forEach(function (x) { var s = String((x && (x.sku_odoo || x.sku)) || '').trim(); if (s && odoo.indexOf(s) < 0) odoo.push(s); });
  VH_CAMPOS.forEach(function (par) {
    var k = par[0], v;
    if (k === 'SKUS_ODOO') v = odoo.join(' | ');
    else if (k === 'ITEMS_META') v = meta.length > 1 ? JSON.stringify(meta.map(function (x) { return { sku: x.sku, sku_odoo: x.sku_odoo, pid: x.pid }; })) : '';
    else if (k === 'MES') { var fm = vhFecha_(o.fecha_iso, true); v = /^\d{4}-\d{2}/.test(fm) ? new Date(Number(fm.slice(0, 4)), Number(fm.slice(5, 7)) - 1, 1) : ''; }   // fecha del dia 1, formato mes
    else if (k === 'CANAL_VENTA') v = /fulfil|wfs/i.test(String(o.fulfillment || '')) ? 'WFS' : (o.fulfillment ? 'SELLER' : '');
    else if (k === 'PRECIO_UNITARIO') v = Number(o.precio) > 0 ? Math.round(Number(o.precio) / Math.max(Number(o.piezas) || 1, 1) * 100) / 100 : '';   // el PRECIO del site es el total de la orden
    else v = vhTexto_(o[k]);
    if (k === 'fecha_iso') v = vhFecha_(v, true);
    else if (k === 'creado' || k === 'actualizado') v = vhFecha_(v);
    f[par[1]] = v;
  });
  Object.keys(o).forEach(function (k) {
    if (VH_SALTAR[k]) return;
    for (var i = 0; i < VH_CAMPOS.length; i++) if (VH_CAMPOS[i][0] === k) return;
    f[String(k).toUpperCase().replace(/_/g, ' ')] = vhTexto_(o[k]);
  });
  return f;
}

/** Fecha minima de lo que se guarda (yyyy-MM-dd). */
function vhDesde_() {
  var d = '';
  try { d = String(props_().getProperty('VH_DESDE') || ''); } catch (e) {}
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : VH_DESDE_DEFECTO;
}

function vhEsWalmart_(o) {
  return o && (String(o.canal || '').toUpperCase() === 'WL' || /^609\d{12}$/.test(String(o.folio || o.orden_id || '')));
}

/** Una pagina del site: { arr, total, ok }. */
function vhPedirPagina_(pag) {
  var ruta = VH_RUTA + '?por_pag=' + VH_POR_PAG + '&page=' + pag + '&canal=WL&q=&' + VH_QS_VACIOS;
  var r = fetchSitio_(ruta, { crudo: true, silencioso: true }) || {};
  var t = String(r.texto || '').trim();
  if (r.codigo !== 200 || !/^[\[{]/.test(t)) throw new Error('El site no devolvio ventas en la pagina ' + pag + ' (HTTP ' + r.codigo + ')');
  var j = JSON.parse(t);
  return { arr: cpArregloPedidos_(j), total: (j && (j.total || j.total_pedidos || j.count)) || 0 };
}

/** Lee la hoja: { m, folios:{folio:fila}, ultima }. Solo crea la hoja y los encabezados que falten. */
function vhHoja_(enc) {
  var h = vdHoja_(VH_HOJA);
  var m = ubicarColumnas_(h, enc, 1, { negrita: true, fondo: '#0b5394', color: '#ffffff', centro: true });
  if (h.getFrozenRows() < 1) h.setFrozenRows(1);
  var cMes = escrCol_(m, 'MES');
  if (cMes && vdProp_('VH_FMT_MES') !== '1') { h.getRange(2, cMes, Math.max(h.getMaxRows() - 1, 1), 1).setNumberFormat('mmmm yyyy'); vdSetProp_('VH_FMT_MES', '1'); }   // una vez: MES se ve "octubre 2026"
  var ult = h.getLastRow(), folios = {};
  var cF = escrCol_(m, 'FOLIO');
  if (ult > 1 && cF) h.getRange(2, cF, ult - 1, 1).getValues().forEach(function (r, i) { var k = String(r[0]).trim(); if (k) folios[k] = i + 2; });
  return { h: h, m: m, folios: folios, ultima: ult };
}

/**
 * Corre el ciclo. opciones.ms = tiempo maximo. Devuelve { nuevas, actualizadas, paginas, fin, total }.
 * Primero se arma la lista de columnas con el primer registro (campos que mande el site).
 */
function vhBajar_(ms) {
  var t0 = Date.now(), p = props_();
  var hoy = hoy_();
  var completo = !p.getProperty(VH_PROP_BARRIDO) || p.getProperty(VH_PROP_BARRIDO) !== hoy || p.getProperty(VH_PROP_MODO) === 'completo';
  var pag = completo ? Number(p.getProperty(VH_PROP_PAG) || 1) : 1;
  if (completo && p.getProperty(VH_PROP_MODO) !== 'completo') { p.setProperty(VH_PROP_MODO, 'completo'); pag = 1; }
  var maxPag = completo ? 1000 : 4;
  var res = { nuevas: 0, actualizadas: 0, paginas: 0, fin: false, total: 0, modo: completo ? 'completo' : 'reciente' };

  var primera = vhPedirPagina_(pag);
  res.total = primera.total;
  var arrWl = primera.arr.filter(vhEsWalmart_);
  var encSet = {}, enc = [];
  VH_CAMPOS.forEach(function (c) { encSet[c[1]] = 1; enc.push(c[1]); });
  arrWl.forEach(function (o) { Object.keys(vhFila_(o)).forEach(function (k) { if (!encSet[k]) { encSet[k] = 1; enc.push(k); } }); });
  var H = vhHoja_(enc);
  var colMut = VH_MUTABLES.map(function (n) { return escrCol_(H.m, n); });

  var paginaActual = primera, nuevasEnPag;
  while (true) {
    var wlTodas = paginaActual.arr.filter(vhEsWalmart_);
    var desde = vhDesde_();
    var wl = wlTodas.filter(function (o) { return vhFecha_(o.fecha_iso, true).slice(0, 10) >= desde; });
    var soloViejas = wlTodas.length > 0 && wl.length === 0;
    var orden = true;
    for (var q = 1; q < wlTodas.length; q++) if (String(wlTodas[q].fecha_iso) > String(wlTodas[q - 1].fecha_iso) && vhFecha_(wlTodas[q].fecha_iso, true) > vhFecha_(wlTodas[q - 1].fecha_iso, true)) { orden = false; break; }
    res.paginas++;
    // muestra de campos y de ventas con varios items (una vez): sirve para revisar que significa PRECIO
    if (!p.getProperty(VH_PROP_MUESTRA) && wl.length) {
      var multi = wl.filter(function (o) { return Number(o.items) > 1 || Number(o.piezas) > 1; }).slice(0, 5)
        .map(function (o) { return { folio: o.folio, piezas: o.piezas, items: o.items, precio: o.precio, skus: (o.items_meta || []).map(function (x) { return x.sku_odoo || x.sku; }) }; });
      logInfo_(VH_ETAPA, 'Muestra del site (campos y ventas con varias piezas o items)', { campos: Object.keys(wl[0]), ejemplo: wl[0], multi: multi, ordenFechas: [wl[0].fecha_iso, wl[wl.length - 1].fecha_iso] });
      p.setProperty(VH_PROP_MUESTRA, '1');
    }
    var nuevas = [], cambios = {};
    wl.forEach(function (o) {
      var f = vhFila_(o), k = String(f['FOLIO'] || f['ORDEN ID']).trim();
      if (!k) return;
      if (H.folios[k]) { cambios[H.folios[k]] = f; return; }
      H.folios[k] = -1;                                   // ya visto en esta corrida (marca)
      nuevas.push(f);
    });
    nuevasEnPag = nuevas.length;
    if (nuevas.length) {
      var ini = H.h.getLastRow() + 1;
      H.m.enc.forEach(function (e) {
        var c = escrCol_(H.m, e);
        if (!c) return;
        H.h.getRange(ini, c, nuevas.length, 1).setValues(nuevas.map(function (f) { return [f[e] === undefined ? '' : f[e]]; }));
      });
      nuevas.forEach(function (f, i) { H.folios[String(f['FOLIO'] || f['ORDEN ID']).trim()] = ini + i; });
      res.nuevas += nuevas.length;
    }
    // actualiza lo que cambia en el site (estatus, tracking...) solo si es distinto
    var filasCamb = Object.keys(cambios).map(Number);
    if (filasCamb.length) {
      VH_MUTABLES.forEach(function (n, j) {
        var c = colMut[j]; if (!c) return;
        var rango = H.h.getRange(2, c, Math.max(H.h.getLastRow() - 1, 1), 1), vals = rango.getValues(), toca = false;
        filasCamb.forEach(function (fila) {
          var nuevo = cambios[fila][n]; if (nuevo === undefined) return;
          var viejo = vals[fila - 2] ? vals[fila - 2][0] : undefined;
          if (viejo !== undefined && String(viejo) !== String(nuevo)) { vals[fila - 2][0] = nuevo; toca = true; res.actualizadas++; }
        });
        if (toca) rango.setValues(vals);
      });
    }
    SpreadsheetApp.flush();

    var tam = primera.arr.length || VH_POR_PAG;                       // lo que de verdad manda el site por pagina
    var ultimaPag = paginaActual.arr.length === 0 || paginaActual.arr.length < tam || (res.total && pag * tam >= res.total);
    if (ultimaPag) { res.fin = true; break; }
    if (soloViejas && orden) { res.fin = true; break; }               // ya paso de la fecha de inicio (las paginas vienen de la mas nueva a la mas vieja)
    if (!completo && nuevasEnPag === 0) { res.fin = true; break; }     // lo reciente ya estaba: no hace falta seguir
    if (res.paginas >= maxPag) break;
    if (Date.now() - t0 > ms) break;
    pag++;
    if (completo) p.setProperty(VH_PROP_PAG, String(pag));
    paginaActual = vhPedirPagina_(pag);
  }
  if (completo) {
    if (res.fin) { p.setProperty(VH_PROP_BARRIDO, hoy); p.setProperty(VH_PROP_MODO, ''); p.setProperty(VH_PROP_PAG, '1'); }
    else p.setProperty(VH_PROP_PAG, String(pag + 1));      // la siguiente pagina por bajar
  }
  return res;
}

function vhResumen_(r) {
  return r.nuevas + ' nuevas, ' + r.actualizadas + ' actualizadas · ' + r.paginas + ' pagina(s) · ' + r.modo +
         (r.fin ? ' · terminado' : ' · sigue en la proxima corrida');
}

/** Menu: baja el historico a mano (hasta ~4.5 min por corrida; si falta, se vuelve a correr). */
function ventasHistoricoBajar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_ESPERA_MS)) { toast_('Otra bajada en curso. Intenta en un minuto.', 'VENTAS WALMART', 8); return; }
  var r = null;
  try {
    toast_('Bajando ventas de Walmart del site...', 'VENTAS WALMART', 60);
    r = vhBajar_(240000);
    logOk_(VH_ETAPA, 'Ventas Walmart: ' + vhResumen_(r), r);
    if (!r.fin) tgUnaVez_('ventasHistoricoContinuar', 60 * 1000);   // sigue sola, sin mas clics
    flushLog_();
  } catch (e) {
    logErr_(VH_ETAPA, 'No se pudieron bajar las ventas de Walmart: ' + String(e.message).split('\n')[0]);
    try { flushLog_(); } catch (x) {}
    dlgInfo_('Ventas Walmart', 'Fallo: ' + String(e.message).split('\n')[0], 'error');
    return;
  } finally { lock.releaseLock(); }
  dlgInfo_('Ventas Walmart', vhResumen_(r) + (r.fin ? '\n\nYa esta todo: la bajada completa termino.' :
    '\n\nSigue sola en segundo plano (no hace falta volver a darle). Cuando termine, el Log dice "Ventas Walmart: bajada completa terminada".'), 'ok');
}

/** Corrida de una vez (la agenda la bajada cuando no le alcanzo el tiempo): sigue hasta terminar y se vuelve a agendar sola. */
function ventasHistoricoContinuar() {
  tgBorrarUnaVez_('ventasHistoricoContinuar');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(VD_LOCK_MS)) { tgUnaVez_('ventasHistoricoContinuar', 2 * 60 * 1000); return; }
  try {
    var r = vhBajar_(270000);
    if (r.fin) logRow_('FINISH', VH_ETAPA, 'Ventas Walmart: bajada completa terminada (' + vhResumen_(r) + ')', r);
    else { logOk_(VH_ETAPA, 'Ventas Walmart: ' + vhResumen_(r), r); tgUnaVez_('ventasHistoricoContinuar', 60 * 1000); }
  } catch (e) {
    logWarn_(VH_ETAPA, 'Bajada de ventas: fallo esta vuelta, sigue en 5 min: ' + String(e.message).split('\n')[0]);
    tgUnaVez_('ventasHistoricoContinuar', 5 * 60 * 1000);
  } finally { try { flushLog_(); } catch (x) {} lock.releaseLock(); }
}

/** Lo llama killersProgramado() cada hora (corre poco tiempo: lo pesado se hace en varias horas). */
function ventasHistoricoProgramado_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(VD_LOCK_MS)) { avisoDia_('vh-ocupado', 'INFO', VH_ETAPA, 'Ventas Walmart saltada: otra corrida tenia el candado.'); return; }
  try {
    var r = vhBajar_(90000);
    if (r.nuevas || r.actualizadas || !r.fin) logOk_(VH_ETAPA, 'Ventas Walmart: ' + vhResumen_(r), r);
    if (!r.fin) tgUnaVez_('ventasHistoricoContinuar', 60 * 1000);   // no le alcanzo: sigue sola en un minuto
    else vdLatido_(VH_ETAPA, 'Ventas Walmart al dia (sin ventas nuevas)');
  } catch (e) {
    var msg = String(e.message).split('\n')[0].substring(0, 160);
    avisoDia_('vh-error:' + msg, 'WARN', VH_ETAPA, 'No se pudieron bajar las ventas de Walmart: ' + msg);
  } finally {
    try { flushLog_(); } catch (x) {}
    lock.releaseLock();
  }
}
