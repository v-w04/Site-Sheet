/**
 * ============================================================
 *  Ventas CVA — ventas de SKUs -CVA de CUALQUIER plataforma (Odoo) + correo por venta
 * ============================================================
 *
 *  Hoja "Pedidos CVA": una fila por linea de venta de Odoo (12 columnas, las mismas de Venta Diaria Odoo).
 *  - Baja de Odoo las lineas nuevas de productos -CVA (cada hora y a mano), sin duplicar (llave ID LINEA).
 *  - Un barrido por hora de los ultimos 2 dias: ordenes confirmadas tarde.
 *  - Una vez, "Traer historico de Venta Diaria": copia lo que ya tenia PEDIDOS CVA del libro viejo
 *    (solo lectura de ese libro) y deja la marca para no reenviar ese historico por correo.
 *  - UN correo al dia (desde las 8 am) a victor.walmart.04@gmail.com con lo vendido desde el correo anterior.
 *    Si no hubo ventas no manda nada.
 *  Columnas por encabezado: puedes moverlas, agregar otras o darles formato; nunca se borran filas ni columnas.
 */

var VC_HOJA = 'Pedidos CVA';
var VC_ETAPA = 'CVA_VENTAS';
var VC_ENC = ['ID Línea', 'Número (SO)', 'Fecha creación', 'Cliente', 'Vendedor', 'Estado SO', 'SKU', 'Producto',
              'Cantidad', 'Precio unitario', 'Importe línea', 'Total orden'];
var VC_HOJA_VIEJA = 'PEDIDOS CVA';
var VC_CORREO = 'victor.walmart.04@gmail.com';
var VC_EMPRESA = 'ElectronicsMexico';
var VC_SUFIJO = '-CVA';
var VC_DIAS_BARRIDO = 2;
var VC_MAX_LINEAS = 3000;
var VC_PROP_ULTIMO = 'VC_ULTIMO_ID', VC_PROP_BARRIDO = 'VC_ULTIMO_BARRIDO', VC_PROP_AVISADA = 'VC_FILA_AVISADA', VC_PROP_DIA = 'VC_DIA_REPORTE';

/** Fecha de Odoo (UTC, "2026-09-14 06:29:00") -> Date. */
function vcFecha_(s) {
  var t = String(s || '').trim();
  if (!t) return '';
  var d = new Date(t.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? '' : 'Z'));
  return isNaN(d.getTime()) ? t : d;
}

function vcM2o_(v) { return (v && v.length > 1) ? String(v[1]) : ''; }   // col-fija: fila armada por el script en el orden de VC_ENC

/** Hoja con sus columnas ubicadas por encabezado. { h, m, ids:{ID:fila}, colId } */
function vcHoja_() {
  var h = vdHoja_(VC_HOJA);
  var m = ubicarColumnas_(h, VC_ENC, 1, { negrita: true, fondo: '#674ea7', color: '#ffffff', centro: true });
  if (h.getFrozenRows() < 1) h.setFrozenRows(1);
  var colId = escrCol_(m, VC_ENC[0]), ids = {}, ult = h.getLastRow();
  if (ult > 1 && colId) h.getRange(2, colId, ult - 1, 1).getValues().forEach(function (r, i) {
    if (r[0] !== '' && r[0] !== null) ids[String(Number(r[0]) || r[0])] = i + 2;
  });
  return { h: h, m: m, ids: ids, colId: colId };
}

/** Agrega al final (por encabezado, solo las columnas del script) las filas que no esten. Devuelve las agregadas. */
function vcAgregar_(H, filas) {
  var nuevas = filas.filter(function (f) { var k = String(Number(f[0]) || f[0]); if (H.ids[k]) return false; H.ids[k] = -1; return true; });
  if (!nuevas.length) return [];
  var ini = H.h.getLastRow() + 1;
  if (H.colId) { var vac = H.h.getRange(1, H.colId, H.h.getMaxRows(), 1).getValues(); var u = 0; for (var i = vac.length - 1; i >= 0; i--) if (vac[i][0] !== '' && vac[i][0] !== null) { u = i + 1; break; } ini = Math.max(u + 1, 2); }
  escrAsegurarFilas_(H.h, ini, nuevas.length);
  VC_ENC.forEach(function (e, j) {
    var c = escrCol_(H.m, e); if (!c) return;
    H.h.getRange(ini, c, nuevas.length, 1).setValues(nuevas.map(function (f) { return [f[j] === undefined || f[j] === null ? '' : f[j]]; }));
  });
  nuevas.forEach(function (f, i) { H.ids[String(Number(f[0]) || f[0])] = ini + i; });
  SpreadsheetApp.flush();
  return nuevas;
}

function vcCompany_() {
  var g = props_().getProperty('VC_COMPANY_ID');
  if (g) return Number(g);
  var f = odooExecute_('res.company', 'search_read', [[['name', '=', VC_EMPRESA]]], { fields: ['id', 'name'], limit: 1 });
  if (!f || !f.length) return 0;
  props_().setProperty('VC_COMPANY_ID', String(f[0].id));
  return f[0].id;
}

/**
 * Baja de Odoo las lineas -CVA nuevas. Devuelve { revisadas, nuevas, llamadas }.
 * Normal: id mayor al ultimo. Barrido (cada hora): ultimos 2 dias completos.
 */
function vcBajar_() {
  var p = props_(), t0 = Date.now(), llamadas = 0;
  var ultimo = Number(p.getProperty(VC_PROP_ULTIMO) || 0);
  var barrido = (Date.now() - Number(p.getProperty(VC_PROP_BARRIDO) || 0)) > 3600000;
  var desde = Utilities.formatDate(new Date(Date.now() - (barrido || !ultimo ? VC_DIAS_BARRIDO : 7) * 86400000), 'UTC', 'yyyy-MM-dd HH:mm:ss');
  var dom = [['create_date', '>=', desde], ['state', 'in', ['sale', 'done']], ['product_id.default_code', 'ilike', VC_SUFIJO]];
  var comp = vcCompany_(); llamadas++;
  if (comp) dom.push(['company_id', '=', comp]);
  if (!barrido && ultimo) dom.push(['id', '>', ultimo]);

  var lineas = [], off = 0, pag = 500;
  while (true) {
    var tr = odooExecute_('sale.order.line', 'search_read', [dom], { fields: ['id', 'order_id', 'product_id', 'product_uom_qty', 'price_unit', 'price_subtotal'], limit: pag, offset: off, order: 'id asc' });
    llamadas++;
    if (!tr || !tr.length) break;
    lineas = lineas.concat(tr);
    if (tr.length < pag || lineas.length >= VC_MAX_LINEAS || Date.now() - t0 > 200000) break;
    off += pag;
  }
  if (barrido) p.setProperty(VC_PROP_BARRIDO, String(Date.now()));
  var maxId = ultimo;
  lineas.forEach(function (l) { if (Number(l.id) > maxId) maxId = Number(l.id); });

  var H = vcHoja_();
  lineas = lineas.filter(function (l) { return !H.ids[String(l.id)]; });
  var res = { revisadas: lineas.length, nuevas: 0, llamadas: llamadas };
  if (lineas.length) {
    var ords = {}, prods = {};
    lineas.forEach(function (l) { if (l.order_id && l.order_id[0]) ords[l.order_id[0]] = 1; if (l.product_id && l.product_id[0]) prods[l.product_id[0]] = 1; });
    var oMap = {}, pMap = {};
    odooExecute_('sale.order', 'read', [Object.keys(ords).map(Number)], { fields: ['id', 'name', 'date_order', 'partner_id', 'user_id', 'state', 'amount_total'] }).forEach(function (o) { oMap[o.id] = o; });
    odooExecute_('product.product', 'read', [Object.keys(prods).map(Number)], { fields: ['id', 'default_code', 'display_name', 'name'] }).forEach(function (x) { pMap[x.id] = x; });
    res.llamadas += 2;
    var filas = [];
    lineas.forEach(function (l) {
      var o = oMap[l.order_id && l.order_id[0]]; if (!o) return;
      var x = pMap[l.product_id && l.product_id[0]] || {};
      filas.push([l.id, o.name || '', vcFecha_(o.date_order), vcM2o_(o.partner_id), vcM2o_(o.user_id), o.state || '',
                  String(x.default_code || '').trim().toUpperCase(), x.display_name || x.name || vcM2o_(l.product_id),
                  peNum_(l.product_uom_qty), peNum_(l.price_unit), peNum_(l.price_subtotal), peNum_(o.amount_total)]);
    });
    vcMarcaInicial_(H);
    res.nuevas = vcAgregar_(H, filas).length;
  }
  if (maxId > ultimo) p.setProperty(VC_PROP_ULTIMO, String(maxId));
  return res;
}

/** La primera vez fija la marca del correo en la ultima fila actual: no se reenvia el historico. */
function vcMarcaInicial_(H) {
  var p = props_();
  if (p.getProperty(VC_PROP_AVISADA) !== null && p.getProperty(VC_PROP_AVISADA) !== '') return;
  p.setProperty(VC_PROP_AVISADA, String(Math.max(H.h.getLastRow(), 1)));
}

/** Menu: baja ventas CVA de Odoo. */
function ventasCvaBajar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_ESPERA_MS)) { toast_('Otra bajada en curso. Intenta en un minuto.', 'VENTAS CVA', 8); return; }
  try {
    toast_('Bajando ventas CVA de Odoo...', 'VENTAS CVA', 60);
    var r = vcBajar_();
    logOk_(VC_ETAPA, 'Ventas CVA: ' + r.nuevas + ' lineas nuevas de ' + r.revisadas + ' revisadas', r);
    var enviado = vcCorreo_();
    try { vcResumen_(); } catch (e) { logWarn_(VC_ETAPA, 'No se pudo armar el Resumen venta CVA: ' + String(e.message).split('\n')[0]); }
    flushLog_();
    toast_(r.nuevas + ' lineas nuevas' + (enviado ? ' · correo enviado' : ''), 'VENTAS CVA', 10);
  } catch (e) {
    logErr_(VC_ETAPA, 'No se pudieron bajar las ventas CVA: ' + String(e.message).split('\n')[0]);
    try { flushLog_(); } catch (x) {}
    toast_('Fallo: ' + String(e.message).split('\n')[0], 'VENTAS CVA', 15);
  } finally { lock.releaseLock(); }
}

/** Cada hora (cadena de killersProgramado). */
function ventasCvaProgramado_() {
  if (odooApagado_()) { avisoDia_('vc-odoo-apagado', 'INFO', VC_ETAPA, 'Odoo apagado: no se bajan ventas CVA'); return; }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(VD_LOCK_MS)) { avisoDia_('vc-ocupado', 'INFO', VC_ETAPA, 'Ventas CVA saltada: otra corrida tenia el candado.'); return; }
  try {
    var r = vcBajar_();
    if (r.nuevas) logOk_(VC_ETAPA, 'Ventas CVA: ' + r.nuevas + ' lineas nuevas', r);
    else vdLatido_(VC_ETAPA, 'Ventas CVA al dia (sin lineas nuevas)');
    vcCorreo_();
    vcResumen_();
  } catch (e) {
    var msg = String(e.message).split('\n')[0].substring(0, 160);
    avisoDia_('vc-error:' + msg, 'WARN', VC_ETAPA, 'No se pudieron bajar las ventas CVA: ' + msg);
  } finally { try { flushLog_(); } catch (x) {} lock.releaseLock(); }
}

/** Copia PEDIDOS CVA de Venta Diaria (sin duplicar) y deja las marcas. Devuelve texto; lanza si no se pudo. */
function vcTraerHistorico_() {
  var libro = SpreadsheetApp.openById(VD_LIBRO_VIEJO), sh = libro.getSheetByName(VC_HOJA_VIEJA);
  if (!sh || sh.getLastRow() < 2) return 'en Venta Diaria no hay hoja "' + VC_HOJA_VIEJA + '" con datos';
  var d = sh.getRange(1, 1, sh.getLastRow(), Math.max(sh.getLastColumn(), 1)).getValues();
  var pos = {};
  d[0].forEach(function (x, i) { var k = normEnc_(x); if (k && pos[k] === undefined) pos[k] = i; });
  // En la hoja vieja alguien escribio encima del titulo de la columna A (ID Linea): si no esta, es la columna A.
  if (pos[normEnc_(VC_ENC[0])] === undefined && !VC_ENC.some(function (e) { return normEnc_(e) === normEnc_(d[0][0]); })) pos[normEnc_(VC_ENC[0])] = 0;   // col-fija: titulo borrado en la hoja de Venta Diaria
  var faltan = VC_ENC.filter(function (e) { return pos[normEnc_(e)] === undefined; });
  if (faltan.length) throw new Error('La hoja vieja no trae estas columnas: ' + faltan.join(', ') + '. No copie nada.');
  var filas = d.slice(1).filter(function (r) { return r[pos[normEnc_(VC_ENC[0])]] !== '' && r[pos[normEnc_(VC_ENC[0])]] !== null; })
    .map(function (r) { return VC_ENC.map(function (e) { return r[pos[normEnc_(e)]]; }); });
  var H = vcHoja_();
  var n = vcAgregar_(H, filas).length;
  var maxId = Number(props_().getProperty(VC_PROP_ULTIMO) || 0);
  filas.forEach(function (f) { if (Number(f[0]) > maxId) maxId = Number(f[0]); });   // col-fija: fila armada en el orden de VC_ENC
  props_().setProperty(VC_PROP_ULTIMO, String(maxId));
  props_().setProperty(VC_PROP_AVISADA, String(Math.max(H.h.getLastRow(), 1)));   // lo viejo no se reenvia por correo
  logOk_(VC_ETAPA, 'Historico CVA copiado de Venta Diaria: ' + n + ' lineas nuevas de ' + filas.length, { ultimoId: maxId });
  return 'copie ' + n + ' linea(s) nuevas de ' + filas.length + ' (sin duplicar)';
}

/** Correo CVA: sale cada vez que hay lineas nuevas (se revisa cada hora). Devuelve true si mando. */
function vcCorreo_(manual) {
  try {
    if (!manual && !vdCorreoCvaActivo_()) return false;   // un solo remitente: apagado hasta "Pasar el correo CVA a Site Sheet"
    var p = props_();
    var H = vcHoja_();
    var hasta = H.h.getLastRow(), desde = Number(p.getProperty(VC_PROP_AVISADA) || hasta);
    if (hasta <= desde) return false;
    var cols = VC_ENC.map(function (e) { return escrCol_(H.m, e); });
    var vals = H.h.getRange(desde + 1, 1, hasta - desde, Math.max(H.h.getLastColumn(), 1)).getValues();
    var filas = vals.map(function (r) { return cols.map(function (c) { return c ? r[c - 1] : ''; }); })
      .filter(function (f) { return f[0] !== '' && f[0] !== null; });
    p.setProperty(VC_PROP_AVISADA, String(hasta));
    if (!filas.length) return false;
    var total = 0, pzas = 0;
    filas.forEach(function (f) { total += peNum_(f[10]); pzas += peNum_(f[8]); });   // col-fija: fila armada por el script en el orden de VC_ENC
    MailApp.sendEmail({ to: VC_CORREO, subject: 'Venta CVA — $' + vcDinero_(total) + ' · ' + pzas + ' pieza(s)', htmlBody: vcHtml_(filas, total, pzas), name: 'Site Sheet' });
    logOk_(VC_ETAPA, 'Correo de venta CVA enviado', { lineas: filas.length, piezas: pzas, total: total, a: VC_CORREO });
    return true;
  } catch (e) {
    logErr_(VC_ETAPA, 'No se pudo mandar el correo de venta CVA: ' + String(e.message).split('\n')[0]);
    return false;
  }
}

function vcDinero_(n) { return Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function vcEsc_(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function vcHtml_(filas, total, pzas) {
  var td = 'padding:6px 10px;border-bottom:1px solid #eee;', th = 'padding:6px 10px;border-bottom:2px solid #ccc;text-align:left;';
  var tr = filas.map(function (f) {
    var fd = (f[2] instanceof Date) ? f[2] : new Date(f[2]);   // col-fija: fila armada por el script en el orden de VC_ENC
    var fecha = isNaN(fd.getTime()) ? String(f[2]).slice(0, 10) : Utilities.formatDate(fd, TZ, 'dd/MM');   // col-fija: fila armada por el script en el orden de VC_ENC
    return '<tr><td style="' + td + '">' + vcEsc_(fecha) + '</td><td style="' + td + '">' + vcEsc_(f[3]) + '</td>' + // col-fija: fila armada por el script en el orden de VC_ENC
      '<td style="' + td + 'font-family:monospace">' + vcEsc_(f[6]) + '</td>' + // col-fija: fila armada por el script en el orden de VC_ENC
      '<td style="' + td + '">' + vcEsc_(String(f[7]).replace(/^\[[^\]]*\]\s*/, '').slice(0, 55)) + '</td>' + // col-fija: fila armada por el script
      '<td style="' + td + 'text-align:right">' + peNum_(f[8]) + '</td><td style="' + td + 'text-align:right">$' + vcDinero_(peNum_(f[10])) + '</td></tr>'; // col-fija: fila armada por el script
  }).join('');
  return '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p style="font-size:16px;margin:0 0 12px"><b>Ventas CVA: $' + vcDinero_(total) + '</b> · ' + pzas + ' pieza(s)</p>' +
    '<table style="border-collapse:collapse;font-size:13px"><tr><th style="' + th + '">Fecha</th><th style="' + th + '">Plataforma</th><th style="' + th + '">SKU</th><th style="' + th + '">Producto</th>' +
    '<th style="' + th + 'text-align:right">Piezas</th><th style="' + th + 'text-align:right">Importe</th></tr>' + tr + '</table></div>';
}

/** Menu: manda el correo pendiente aunque ya sea otro dia (si hay lineas sin avisar). */
function ventasCvaCorreoAhora() {
  var ok = vcCorreo_(true);
  flushLog_();
  dlgInfo_('Correo CVA', ok ? 'Enviado a ' + VC_CORREO + '.' : 'Sin ventas CVA nuevas desde el último correo.', ok ? 'ok' : 'aviso');
}

/* ---------------- resumen mensual CVA (aparte de Walmart) ---------------- */

var VC_HOJA_RES = 'Resumen venta CVA';

/**
 * Resumen por mes de Pedidos CVA (todas las plataformas; NO se suma a Walmart). Solo pedidos confirmados (sale / done).
 * VENTA TOTAL = cantidad x precio unitario (con IVA, como la venta de Walmart); VENTA SIN IVA = importe de la linea.
 * VENTA ACUMULADA = la suma desde el primer mes. Una columna por plataforma (cliente). El mes mas nuevo arriba.
 */
function vcResumen_() {
  var t = peTabla_(VC_HOJA);
  if (!t) return 0;
  var c = function (n) { return peCol_(t, [n]); };
  var iF = c('Fecha creación'), iE = c('Estado SO'), iC = c('Cliente'), iQ = c('Cantidad'), iP = c('Precio unitario'), iI = c('Importe línea');
  if (iF < 0 || iQ < 0) return 0;
  var por = {}, clientes = {}, mesActual = Utilities.formatDate(new Date(), TZ, 'yyyy-MM');
  t.filas.forEach(function (f) {
    var est = iE < 0 ? 'sale' : String(f[iE] || '').toLowerCase();
    if (est && est !== 'sale' && est !== 'done') return;               // borradores y cancelados no son venta
    var d = f[iF] instanceof Date ? f[iF] : vcFecha_(f[iF]);
    if (!(d instanceof Date)) return;
    var mes = Utilities.formatDate(d, TZ, 'yyyy-MM'), q = peNum_(f[iQ]), venta = q * (iP < 0 ? 0 : peNum_(f[iP])), cli = iC < 0 ? '' : String(f[iC] || 'SIN CLIENTE').trim();
    var x = por[mes] = por[mes] || { lineas: 0, piezas: 0, venta: 0, sinIva: 0, cli: {} };
    x.lineas++; x.piezas += q; x.venta += venta; x.sinIva += iI < 0 ? 0 : peNum_(f[iI]);
    x.cli[cli] = (x.cli[cli] || 0) + venta; clientes[cli] = (clientes[cli] || 0) + venta;
  });
  var listaCli = Object.keys(clientes).sort(function (a, b) { return clientes[b] - clientes[a]; });
  var enc = ['MES', 'ESTADO', 'VENTA TOTAL', 'VENTA SIN IVA', 'LINEAS', 'PIEZAS', 'VENTA ACUMULADA'].concat(listaCli.map(function (k) { return 'VENTA ' + k; }), ['ACTUALIZADO']);
  var acum = 0, filas = Object.keys(por).sort().map(function (mes) {
    var x = por[mes]; acum += x.venta;
    return [PE_MESES[Number(mes.slice(5, 7)) - 1] + ' ' + mes.slice(0, 4), mes === mesActual ? 'EN CURSO' : 'CERRADO', x.venta, x.sinIva, x.lineas, x.piezas, acum]
      .concat(listaCli.map(function (k) { return x.cli[k] || 0; }), [new Date()]);
  }).reverse();
  var huella = sha256_(JSON.stringify(filas.map(function (f) { return f.slice(0, -1); })));   // col-fija: la ultima es ACTUALIZADO
  if (vdLibro_().getSheetByName(VC_HOJA_RES) && vdProp_('VC_RES_HUELLA') === huella) return filas.length;
  var h = vdHoja_(VC_HOJA_RES);
  var m = vdEscribir_(h, enc, filas, { vacioOk: true, clave: 'ESCR_COLS|' + VC_HOJA_RES, texto: ['MES'] });
  enc.forEach(function (e) { if (/^VENTA/.test(e)) vdFormato_(h, m, e, filas.length, '$#,##0'); });
  vdFormato_(h, m, 'ACTUALIZADO', filas.length, 'dd/MM/yyyy HH:mm');
  if (h.getFrozenRows() < 1) h.setFrozenRows(1);
  vdSetProp_('VC_RES_HUELLA', huella);
  logOk_(VC_ETAPA, 'Resumen venta CVA actualizado: ' + filas.length + ' mes(es)');
  return filas.length;
}
