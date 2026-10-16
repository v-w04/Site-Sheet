/**
 * ============================================================
 *  Walmart EDI — lista de importacion del site, completa
 * ============================================================
 *
 *  Baja /importacion-data?canal=Walmart EDI a la hoja "Walmart EDI":
 *  UNA FILA POR PUBLICACION de Walmart, asignada o no (hoy ~3,400:
 *  ~1,800 asignadas y ~1,500 sin asignar). Sirve para depurar:
 *    - bloquear lo que ya no tiene sentido ni relacion,
 *    - ubicar lo que SI deberia estar asignado y no lo esta
 *      (Asignado = NO con producto que si existe en Odoo).
 *  El cruce con la hoja Bloqueados se hace despues, con SKU Walmart.
 *
 *  Columnas del script: siempre de la A en adelante (ver EDI_COLUMNAS).
 *  Lo que tu agregues A LA DERECHA (notas, cruces, filtros) se respeta:
 *  aqui nunca se borran columnas ni se toca nada fuera de las del script.
 *
 *  Auth: la misma que el resto del site (llave si hay, si no la cookie).
 */

var EDI_RUTA   = '/importacion-data?canal=Walmart%20EDI';
var EDI_HOJA   = 'Walmart EDI';
var EDI_ETAPA  = 'EDI';

/** [campo del site, encabezado, tipo]  tipo: t = texto, b = SI/NO, f = fecha, n = tal cual */
var EDI_COLUMNAS = [
  ['sku_canal',        'SKU Walmart',         't'],
  ['item_id',          'Item ID',             't'],
  ['titulo',           'Producto',            'n'],
  ['status',           'Estatus',             'n'],
  ['asignado',         'Asignado',            'b'],
  ['sku_odoo',         'SKU Odoo',            't'],
  ['sku_precio',       'SKU Precio',          't'],
  ['stock_canal',      'Stock Walmart',       'n'],
  ['stock_odoo',       'Stock Odoo',          'n'],
  ['precio',           'Precio Walmart',      'n'],
  ['precio_ref',       'Precio Ref',          'n'],
  ['precio_dif',       'Dif Precio',          'n'],
  ['precio_ref_canal', 'Canal Ref',           'n'],
  ['precio_ref_motivo','Motivo sin precio',   'n'],
  ['fuente',           'Fuente',              'n'],
  ['fuente_auto',      'Fuente Auto',         'n'],
  ['auto',             'Auto',                'b'],
  ['auto_ts',          'Auto Fecha',          'f'],
  ['ob_cruzado',       'OB Cruzado',          'b'],
  ['ob_sugerido',      'OB Sugerido',         'n'],
  ['permalink',        'Link',                'n'],
  ['stock_canal_ts',   'Stock Walmart Fecha', 'f']
];

/** Campos que el site manda y a proposito NO se escriben (son constantes del canal). */
var EDI_IGNORAR = ['canal', 'canal_skumap'];

/** Menu: Walmart > Bajar lista Walmart EDI. */
function ediBajar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_ESPERA_MS)) {
    toast_('Otra bajada en curso. Intenta en un minuto.', 'WALMART EDI', 8);
    return { estado: 'ocupado' };
  }
  var tIni = Date.now();
  try {
    toast_('Bajando lista Walmart EDI...', 'WALMART EDI', 30);
    logStart_(EDI_ETAPA, 'Bajando lista Walmart EDI');
    flushLog_();

    var data = fetchSitio_(EDI_RUTA);
    if (data.ok === false) {
      throw new Error('El site respondio ok=false: ' + JSON.stringify(data).substring(0, 200));
    }
    if (!Array.isArray(data.items)) {
      throw new Error('El site no devolvio el arreglo "items". Estructura inesperada.');
    }

    var sh = getHoja_(EDI_HOJA);
    var actuales = Math.max(0, sh.getLastRow() - 1);

    // Guarda: 0 items contra una hoja con datos casi siempre es el endpoint, no que se vaciara.
    if (data.items.length === 0 && actuales > 0) {
      logErr_('GUARD', EDI_HOJA + ': el site mando 0 items y la hoja tiene ' + actuales +
                       ' filas. No se toco la hoja.');
      flushLog_();
      toast_('Lista vacia, no se toco la hoja', 'WALMART EDI', 10);
      return { estado: 'abortada por guarda' };
    }

    ediAvisarCamposNuevos_(data.items);
    var filas = ediFilas_(data.items);
    ediEscribir_(sh, filas);

    var asig = 0;
    data.items.forEach(function (it) { if (it.asignado === true) asig++; });

    logFinish_(EDI_ETAPA, 'Lista Walmart EDI actualizada', {
      filas: data.items.length, asignados: asig,
      sin_asignar: data.items.length - asig,
      total_site: data.total, ms: Date.now() - tIni
    });
    flushLog_();
    toast_(data.items.length + ' filas (' + asig + ' asignadas, ' +
           (data.items.length - asig) + ' sin asignar)', 'WALMART EDI', 8);
    return { estado: 'actualizada', filas: data.items.length, asignados: asig };

  } catch (e) {
    logErr_(EDI_ETAPA, 'Fallo la bajada: ' + e.message);
    flushLog_();
    toast_(String(e.message).split('\n')[0], 'WALMART EDI', 15);
    throw e;
  } finally {
    flushLog_();
    lock.releaseLock();
  }
}

/** Encabezados + una fila por publicacion + sello de tiempo. */
function ediFilas_(items) {
  var sello = ahora_();
  var filas = [EDI_COLUMNAS.map(function (c) { return c[1]; }).concat(['Actualizado'])];

  items.forEach(function (it) {
    var fila = EDI_COLUMNAS.map(function (c) {
      var v = it[c[0]];
      if (c[2] === 'b') return v === true ? 'SI' : (v === false ? 'NO' : '');
      if (c[2] === 'f') return ediFecha_(v);
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    });
    fila.push(sello);
    filas.push(fila);
  });
  return filas;
}

/** Fecha del site: epoch en segundos o ms, o texto ISO. 0 / vacio = sin fecha. */
function ediFecha_(v) {
  if (v === null || v === undefined || v === '' || v === 0) return '';
  var d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd HH:mm:ss');
}

/**
 * Escribe SOLO las columnas del script (A..N+1). Primero los datos nuevos y
 * despues se limpia el sobrante, nunca al reves: si el setValues truena a
 * medias la hoja no queda vacia. No borra columnas ni toca las de la derecha.
 */
function ediEscribir_(sh, filas) {
  var nf = filas.length, nc = filas[0].length;

  if (sh.getMaxRows() < nf) sh.insertRowsAfter(sh.getMaxRows(), nf - sh.getMaxRows() + 1);
  if (sh.getMaxColumns() < nc) sh.insertColumnsAfter(sh.getMaxColumns(), nc - sh.getMaxColumns());

  // SKU, Item ID y similares como TEXTO: un numero se come los ceros de la izquierda
  // ("0637902715970") y un id tipo 2E100 se vuelve notacion cientifica.
  EDI_COLUMNAS.forEach(function (c, i) {
    if (c[2] === 't') sh.getRange(1, i + 1, nf, 1).setNumberFormat('@');
  });

  sh.getRange(1, 1, nf, nc).setValues(filas);

  var previas = Math.max(0, sh.getLastRow() - nf);
  if (previas > 0) sh.getRange(nf + 1, 1, previas, nc).clearContent();

  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, nc).setFontWeight('bold');
  SpreadsheetApp.flush();
}

/** Avisa una sola vez cuando el site manda campos que no escribimos. */
function ediAvisarCamposNuevos_(items) {
  if (!items.length) return;
  var conocidos = EDI_COLUMNAS.map(function (c) { return c[0]; }).concat(EDI_IGNORAR);
  var nuevos = [];
  for (var k in items[0]) { if (conocidos.indexOf(k) === -1) nuevos.push(k); }

  var llave = 'CAMPOS_NUEVOS_EDI';
  var firma = nuevos.slice().sort().join(',');
  var previa = '';
  try { previa = props_().getProperty(llave) || ''; } catch (e) {}
  if (firma !== previa) {
    if (nuevos.length) {
      logInfo_(EDI_ETAPA, 'El site manda campos que no escribimos: ' + nuevos.join(', ') +
                          '. Si alguno te sirve, se agrega en EDI_COLUMNAS.');
    }
    try { props_().setProperty(llave, firma); } catch (e) {}
  }
}
