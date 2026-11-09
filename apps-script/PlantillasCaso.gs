/**
 * ============================================================
 *  PlantillasCaso.gs - llena las plantillas de casos de Walmart desde el Sheet
 * ============================================================
 *
 *  Hoja "Plantillas caso": TU escribes (TIPO, PEDIDO o SKU, MEDIDAS, ESTATUS) y el menu llena el resto buscando en
 *  "Ventas Walmart" (y "Ventas septiembre") y en "Walmart". Solo escribe SUS columnas (por encabezado): mueve, agrega o
 *  da formato a las tuyas sin miedo.
 *
 *  TIPO "SIN GUIA"   = plantilla "No se generó la guía de mi pedido": fecha de la orden, ID y nombre de la tienda,
 *                      numero de pedido con guion (REFERENCIA + -1-1) y MEDIDAS (las escribes tu: largo x ancho x alto x peso).
 *  TIPO "NO VISIBLE" = plantilla "El estado de mi producto es publicado y no es visible": ESTATUS (Visible / No Visible),
 *                      GTIN de 14 digitos, nombre y precio actual, de la hoja Walmart. Escribes el SKU (o el pedido: saca su SKU).
 *
 *  Menu: SITE SHEET > 🚫 Pedidos y casos > 📄 Plantillas de caso Walmart. "Descargar" arma el .xlsx con las mismas
 *  hojas y columnas de la plantilla de Walmart (Template + Instrucciones) con tus filas, lo deja en Drive > "Descargas Site Sheet"
 *  y te da el link. Nada se manda a Walmart: la subes tu al caso.
 * ============================================================
 */

var PC_ETAPA = 'PLANTILLAS';
var PC_HOJA = 'Plantillas caso';
var PC_ENC_ENTRADA = ['TIPO', 'PEDIDO', 'SKU', 'MEDIDAS', 'ESTATUS'];
var PC_ENC_SALIDA = ['FECHA ORDEN', 'ID TIENDA', 'NOMBRE TIENDA', 'NUMERO DE PEDIDO', 'GTIN', 'NOMBRE PRODUCTO', 'PRECIO ACTUAL', 'NOTA'];
var PC_TIPOS = ['SIN GUIA', 'NO VISIBLE'];
var PC_ESTATUS = ['No Visible', 'Visible'];
var PC_TPL = {
  'SIN GUIA': {
    archivo: 'Template - No se generó la guía de mi pedido',
    enc: ['Fecha de creación de la orden', 'ID de la tienda ', 'Nombre de la Tienda', 'Número de pedido / Order number', 'Medidas del producto'],
    instrucciones: [["Definición de cada campo / Fields definition", null, null, null, null], [null, "Indica el número de pedido de la orden. Solo debes colocar un número de orden (debe incluir el guión) por celda, coloca cada orden en una fila nueva llenando la información correspondiente para cada una.", null, null, null], [null, "Provide the order number. You only have to place an order number (must include the hyphen) per cell, place each order in a new row filling in the corresponding information for each one.", null, null, null], [null, null, null, null, null], [null, null, null, null, null], [null, null, null, null, null], ["Ejemplo / Example:", null, null, null, null], [null, null, null, null, null], ["Fecha de creación de la orden", "ID de la tienda ", "Nombre de la Tienda", "Número de pedido / Order number", "Medidas del producto"], ["2023-06-26", 10001234567, "Walmart", "101536963891-1-1", "10 x 12 x 15 x 8"]]
  },
  'NO VISIBLE': {
    archivo: 'Template - El Estado De Mi Producto Es Publicado Y No Es Visible',
    enc: ['Estatus del Articulos / Product Status', 'GTIN', 'Nombre de producto/Product name', 'Precio Actual en Seller Center / Current Price in Seller Center'],
    instrucciones: [["Definición de cada campo/ Definition for each field", null, null, null, null], ["Estatus/Status", "Coloca el estatus del producto (Visible o no visible)/Place the product status (visible or not visible)", null, null, null], ["Walmart UPC", "Código de 14 dígitos de Walmart (Quita el dígito verificador y agrega cero a la izquierda)/Walmart 14-digit code (Remove the check digit and add leading zero)", null, null, null], ["GTIN", "Código GTIN de 14 dígitos lo encuentras en Seller Center./You can find the 14-digit GTIN code in the Seller Center.", null, null, null], ["Nombre de producto/Product name", "Nombre de tu artículo/Name of your item", null, null, null], [null, null, null, null, null], ["Ejemplo:", null, null, null, null], [null, null, null, null, null], ["Estatus/status", "Walmart UPC", "GTIN", "Nombre de producto/Name product", "Precio del Actual en Seller Center"], ["No Visible", 694105964581, 6941059645818, "Xiaomi Redmi 9", 5000]]
  }
};

/* ---------------- piezas puras (se prueban sin Google) ---------------- */

/** '609128785054812', 600000125180373, '600000125180373-1-1' -> '600000125180373' (solo digitos antes del primer guion). */
function pcNumPedido_(v) {
  var s = String(v == null ? '' : v).trim();
  if (typeof v === 'number') s = String(Math.round(v));
  return s.split('-')[0].replace(/\D/g, '');
}

/** Pedido tal como lo pide la plantilla: con guion. Si ya lo trae, se respeta. */
function pcPedidoConGuion_(entrada, ref) {
  var s = String(entrada == null ? '' : entrada).trim();
  return s.indexOf('-') > 0 && /^\d+-\d+/.test(s) ? s : ref + '-1-1';
}

/** GTIN a 14 digitos con ceros a la izquierda; '' si no es numerico. */
function pcGtin14_(v) {
  var s = String(v == null ? '' : v).replace(/\D/g, '');
  if (!s) return '';
  while (s.length < 14) s = '0' + s;
  return s.length === 14 ? s : '';
}

/** 'visible' / 'No visible' / 'NO VISIBLE' / '' -> 'Visible' | 'No Visible' (vacio = No Visible, que es el caso de la plantilla). */
function pcEstatus_(v) {
  var s = String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' ');
  return s === 'visible' ? 'Visible' : 'No Visible';
}

/** TIPO escrito o deducido: con SKU = NO VISIBLE; solo pedido = SIN GUIA. */
function pcTipo_(tipo, pedido, sku) {
  var t = String(tipo || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (t === 'SIN GUIA' || t === 'SIN GUÍA') return 'SIN GUIA';
  if (t === 'NO VISIBLE') return 'NO VISIBLE';
  if (String(sku || '').trim()) return 'NO VISIBLE';
  return String(pedido || '').trim() ? 'SIN GUIA' : '';
}

/* ---------------- fuentes ---------------- */

/** Indice de ventas por numero de pedido (FOLIO 609..., ORDEN ID o REFERENCIA 6000...): { num: [ {ref, fecha, sku, canal} ] }. */
function pcIndiceVentas_() {
  var idx = {};
  [VH_HOJA, VHI_HOJA_SEP].forEach(function (nombre) {
    var t = peTabla_(nombre); if (!t) return;
    var iF = peCol_(t, ['FOLIO']), iO = peCol_(t, ['ORDEN ID']), iR = peCol_(t, ['REFERENCIA']), iD = peCol_(t, ['FECHA', 'FECHA VENTA']),
        iS = peCol_(t, ['SKU']), iC = peCol_(t, ['CANAL VENTA']);
    if (iR < 0 || iD < 0) return;
    t.filas.forEach(function (f) {
      var ref = pcNumPedido_(f[iR]); if (!ref) return;
      var o = { ref: ref, fecha: peFecha_(f[iD]), sku: iS < 0 ? '' : peSku_(f[iS]), canal: iC < 0 ? '' : String(f[iC] || '').toUpperCase(), hoja: nombre };
      [iF, iO, iR].forEach(function (i) { if (i < 0) return; var k = pcNumPedido_(f[i]); if (k) (idx[k] = idx[k] || []).push(o); });
    });
  });
  return idx;
}

/** Walmart por SKU: { SKU: {gtin, nombre, precio} }. */
function pcCatalogo_() {
  var t = peTabla_('Walmart'), mapa = {};
  if (!t) return mapa;
  var iE = peCol_(t, ['ESTATUS']), iS = peCol_(t, ['SKU']), iG = peCol_(t, ['GTIN']), iN = peCol_(t, ['NOMBRE']), iP = peCol_(t, ['PRECIO']);
  if (iS < 0) return mapa;
  t.filas.forEach(function (f) {
    var s = peSku_(f[iS]); if (!s || mapa[s]) return;
    mapa[s] = { estatus: iE < 0 ? '' : String(f[iE] || '').trim(), gtin: iG < 0 ? '' : f[iG], nombre: iN < 0 ? '' : String(f[iN] || ''), precio: iP < 0 ? '' : peNum_(f[iP]) };
  });
  return mapa;
}

/** Una fila de entrada -> las columnas de salida. */
function pcResolver_(e, idx, cat) {
  var out = { fecha: '', id: '', tienda: '', pedido: '', gtin: '', nombre: '', precio: '', nota: '' };
  var tipo = pcTipo_(e.tipo, e.pedido, e.sku);
  if (!tipo) return out;
  var ped = pcNumPedido_(e.pedido), venta = null, hallazgos = ped ? (idx[ped] || []) : [];
  if (hallazgos.length) {
    venta = hallazgos.filter(function (o) { return o.canal === 'SELLER'; })[0] || hallazgos[0];
  }
  if (tipo === 'SIN GUIA') {
    if (!ped) { out.nota = '⚠️ Falta el PEDIDO'; return out; }
    if (!venta) { out.nota = '⚠️ No encontre el pedido ' + ped + ' en Ventas Walmart'; return out; }
    out.fecha = venta.fecha instanceof Date ? venta.fecha : '';
    out.id = pcTiendaId_(); out.tienda = pcTiendaNombre_();
    out.pedido = pcPedidoConGuion_(e.pedido, venta.ref);
    var med = String(e.medidas || '').trim();
    out.nota = med ? (hallazgos.length > 1 ? 'Ese pedido tiene ' + hallazgos.length + ' lineas (uso la SELLER)' : '') : '⚠️ Falta MEDIDAS (largo x ancho x alto x peso)';
    return out;
  }
  var sku = peSku_(e.sku) || (venta ? venta.sku : '');
  if (!sku) { out.nota = '⚠️ Falta el SKU (o un pedido que lo tenga)'; return out; }
  var c = cat[sku];
  if (!c) { out.nota = '⚠️ ' + sku + ' no esta en la hoja Walmart'; return out; }
  out.gtin = pcGtin14_(c.gtin); out.nombre = c.nombre; out.precio = c.precio;
  if (!out.gtin) out.nota = '⚠️ Sin GTIN de 14 digitos en la hoja Walmart';
  else if (!out.nombre) out.nota = '⚠️ Sin nombre en la hoja Walmart';
  else out.nota = 'SKU ' + sku + (c.estatus ? ' · estatus en Walmart: ' + c.estatus : '');
  return out;
}

/** ID y nombre de la tienda: salen de la config de Recoleccion (un solo lugar). */
function pcTiendaId_() { return REC_RESP.SELLER_ID; }
function pcTiendaNombre_() { return REC_RESP.CUENTA; }

/* ---------------- hoja ---------------- */

/** Crea la hoja SOLO si no existe (nunca reescribe encabezados de una hoja que ya es tuya). */
function pcHoja_() {
  var ss = vdLibro_(), h = ss.getSheetByName(PC_HOJA);
  if (h) return h;
  h = ss.insertSheet(PC_HOJA);
  var enc = PC_ENC_ENTRADA.concat(PC_ENC_SALIDA);
  h.getRange(1, 1, 1, enc.length).setValues([enc]);
  h.setFrozenRows(1);
  var col = function (n) { return enc.indexOf(n) + 1; };
  h.getRange(2, col('TIPO'), 200, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(PC_TIPOS, true).setAllowInvalid(false).build());
  h.getRange(2, col('ESTATUS'), 200, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(PC_ESTATUS, true).setAllowInvalid(false).build());
  ['PEDIDO', 'SKU', 'MEDIDAS'].forEach(function (n) { h.getRange(2, col(n), 200, 1).setNumberFormat('@'); });
  return h;
}

function pcLeer_() {
  var t = peTabla_(PC_HOJA);
  if (!t) return null;
  var c = {};
  PC_ENC_ENTRADA.concat(PC_ENC_SALIDA).forEach(function (n) { c[n] = peCol_(t, [n]); });
  var falta = PC_ENC_ENTRADA.concat(PC_ENC_SALIDA).filter(function (n) { return c[n] < 0; });
  return { t: t, c: c, falta: falta };
}

/** Menu 1: llena las columnas de salida de todas las filas con datos. */
function plantillasCasoLlenar() {
  try {
    toast_('Buscando pedidos y SKU...', 'PLANTILLAS', 30);
    var h = pcHoja_(), L = pcLeer_();
    if (!L || L.falta.some(function (n) { return PC_ENC_ENTRADA.indexOf(n) >= 0; })) {
      dlgInfo_('Plantillas de caso', 'A la hoja "' + PC_HOJA + '" le faltan columnas tuyas: ' + (L ? L.falta.join(', ') : 'toda la hoja') + '.', 'error'); return;
    }
    var idx = pcIndiceVentas_(), cat = pcCatalogo_(), c = L.c, n = 0, avisos = 0;
    var filas = L.t.filas.map(function (f) {
      var e = { tipo: f[c['TIPO']], pedido: f[c['PEDIDO']], sku: f[c['SKU']], medidas: f[c['MEDIDAS']], estatus: f[c['ESTATUS']] };
      var r = pcResolver_(e, idx, cat);
      if (pcTipo_(e.tipo, e.pedido, e.sku)) { n++; if (/^⚠️/.test(r.nota)) avisos++; }
      return [r.fecha, r.id, r.tienda, r.pedido, r.gtin, r.nombre, r.precio, r.nota];
    });
    var m = vdEscribir_(h, PC_ENC_SALIDA, filas, { vacioOk: true, clave: 'ESCR_COLS|' + PC_HOJA, texto: ['NUMERO DE PEDIDO', 'GTIN', 'ID TIENDA'] });
    vdFormato_(h, m, 'FECHA ORDEN', filas.length, 'yyyy-MM-dd');
    vdFormato_(h, m, 'PRECIO ACTUAL', filas.length, '$#,##0.00');
    logOk_(PC_ETAPA, 'Plantillas caso llenadas: ' + n + ' filas, ' + avisos + ' con aviso');
    flushLog_();
    dlgInfo_('Plantillas de caso', n + ' fila(s) llenadas' + (avisos ? ', ' + avisos + ' con ⚠️ (mira la columna NOTA)' : ', todas completas') + '.\n\nSiguiente: menu "Descargar" de la plantilla que toca.', avisos ? 'aviso' : 'ok');
  } catch (e) {
    logErr_(PC_ETAPA, 'No se pudo llenar Plantillas caso: ' + String(e.message).split('\n')[0]);
    try { flushLog_(); } catch (x) {}
    dlgInfo_('Plantillas de caso', 'Fallo: ' + String(e.message).split('\n')[0], 'error');
  }
}

/* ---------------- descarga ---------------- */

function plantillasCasoSinGuia() { pcDescargar_('SIN GUIA'); }
function plantillasCasoNoVisible() { pcDescargar_('NO VISIBLE'); }

function pcDescargar_(tipo) {
  try {
    var tpl = PC_TPL[tipo], L = pcLeer_();
    if (!L || L.falta.length) { dlgInfo_('Plantillas de caso', 'Primero usa "Llenar datos". Faltan columnas: ' + (L ? L.falta.join(', ') : 'toda la hoja') + '.', 'aviso'); return; }
    var c = L.c, filas = [], salto = 0;
    L.t.filas.forEach(function (f) {
      if (pcTipo_(f[c['TIPO']], f[c['PEDIDO']], f[c['SKU']]) !== tipo) return;
      var nota = String(f[c['NOTA']] || '');
      if (/^⚠️/.test(nota) || !String(f[c['NOMBRE PRODUCTO']] || f[c['NUMERO DE PEDIDO']] || '')) { salto++; return; }
      if (tipo === 'SIN GUIA') filas.push([f[c['FECHA ORDEN']], Number(f[c['ID TIENDA']]) || f[c['ID TIENDA']], f[c['NOMBRE TIENDA']], String(f[c['NUMERO DE PEDIDO']]), String(f[c['MEDIDAS']] || '')]);
      else filas.push([pcEstatus_(f[c['ESTATUS']]), String(f[c['GTIN']]), String(f[c['NOMBRE PRODUCTO']]), Number(f[c['PRECIO ACTUAL']]) || f[c['PRECIO ACTUAL']]]);
    });
    if (!filas.length) { dlgInfo_('Plantillas de caso', 'No hay filas ' + tipo + ' completas para descargar' + (salto ? ' (' + salto + ' con ⚠️: corrige y vuelve a llenar)' : '') + '.', 'aviso'); return; }
    toast_('Armando la plantilla...', 'PLANTILLAS', 60);
    var tmp = SpreadsheetApp.create('tmp plantilla caso'), id = tmp.getId();
    try {
      var s1 = tmp.getSheets()[0]; s1.setName('Template');
      s1.getRange(1, 1, 1, tpl.enc.length).setValues([tpl.enc]).setFontWeight('bold');
      var textoCols = tipo === 'SIN GUIA' ? [4, 5] : [2];
      textoCols.forEach(function (k) { s1.getRange(2, k, filas.length, 1).setNumberFormat('@'); });
      if (tipo === 'SIN GUIA') s1.getRange(2, 1, filas.length, 1).setNumberFormat('yyyy-mm-dd');
      s1.getRange(2, 1, filas.length, tpl.enc.length).setValues(filas);
      s1.autoResizeColumns(1, tpl.enc.length);
      var s2 = tmp.insertSheet('Instrucciones'), ins = tpl.instrucciones, w = ins.reduce(function (a, r) { return Math.max(a, r.length); }, 1);
      s2.getRange(1, 1, ins.length, w).setValues(ins.map(function (r) { var x = r.slice(); while (x.length < w) x.push(''); return x.map(function (v) { return v === null ? '' : v; }); }));
      s2.getRange(1, 1).setFontWeight('bold');
      SpreadsheetApp.flush();
      var resp = null, cod = 0;
      for (var i = 0; i <= 3; i++) {
        if (i) Utilities.sleep(2000 * Math.pow(2, i - 1));
        resp = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx', { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
        cod = resp.getResponseCode();
        if (cod === 200 || (cod !== 429 && cod < 500)) break;
      }
      if (cod !== 200) throw new Error('Google no dejo exportar (HTTP ' + cod + '). Vuelve a intentar.');
      var fecha = Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd_HHmm');
      var nombre = tpl.archivo.replace(/[\\\/:*?"<>|]/g, '-') + ' ' + fecha + '.xlsx';
      var it = DriveApp.getFoldersByName(DH_CARPETA), carpeta = it.hasNext() ? it.next() : DriveApp.createFolder(DH_CARPETA);
      var f = carpeta.createFile(resp.getBlob().setName(nombre));
      logOk_(PC_ETAPA, 'Plantilla ' + tipo + ' exportada: ' + filas.length + ' fila(s) -> ' + nombre);
      flushLog_();
      var html = HtmlService.createHtmlOutput('<div style="font-family:Arial,sans-serif;margin:16px;font-size:14px">✅ ' + filas.length + ' fila(s)' +
        (salto ? '<br>⚠️ ' + salto + ' fila(s) con aviso quedaron fuera' : '') +
        '<br><br><a href="' + f.getDownloadUrl() + '" target="_blank" style="color:#0071DC;font-weight:bold">Descargar ' + dhEsc_(nombre) + '</a><br><br>Copia en Drive &gt; ' + DH_CARPETA + '</div>').setWidth(460).setHeight(200);
      SpreadsheetApp.getUi().showModalDialog(html, '📄 Plantilla lista');
    } finally {
      try { DriveApp.getFileById(id).setTrashed(true); } catch (x) {}
    }
  } catch (e) {
    logErr_(PC_ETAPA, 'No se pudo armar la plantilla ' + tipo + ': ' + String(e.message).split('\n')[0]);
    try { flushLog_(); } catch (x) {}
    dlgInfo_('Plantillas de caso', 'Fallo: ' + String(e.message).split('\n')[0], 'error');
  }
}
