/**
 * ============================================================
 *  Promos — promociones de comision de Walmart (del site)
 * ============================================================
 *
 * electronicsmexico.site/walmart/killers/api/promos (pestaña Ofertas
 * Especiales -> Promociones). Walmart baja temporalmente la comision de
 * ciertos SKUs o categorias; el site rehace el precio con la comision final.
 * Se captura con el SKU base y cubre su variante -MSI.
 *
 * Mismo modulo que los killers: misma cookie, mismo perfil de encabezados
 * (kTraer_ en Killers.gs). Se revisa cada hora dentro de killersProgramado y
 * solo se reescribe la hoja si el contenido cambio.
 *
 * La hoja se arma con las LLAVES que mande el site, en el orden en que
 * llegan: si el site agrega o quita un campo, la hoja lo refleja sola y el
 * Log lo dice. Nada aqui depende de posiciones.
 */

var PR_RUTA        = '/walmart/killers/api/promos';
var PR_HOJA        = 'Promociones';
var PR_PROP_HUELLA = 'PROMOS_HUELLA';
var PR_PROP_CAMPOS = 'PROMOS_CAMPOS';
var PR_PROP_AVISO  = 'PROMOS_AVISO_DIA';

/** Menu: baja las promociones ahora y avisa. */
function promosBajar() {
  var r = promosActualizar_(true);
  var msg = r.error ? 'No se pudo: ' + r.error
          : r.filas + ' promociones en la hoja "' + PR_HOJA + '".' +
            (r.campos ? '\n\nColumnas: ' + r.campos.join(', ') : '');
  try { SpreadsheetApp.getUi().alert('Promociones', msg, SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) { Logger.log(msg); }
  return msg;
}

/** Corrida de cada hora (la llama killersProgramado). */
function promosProgramado_() {
  promosActualizar_(false);
}

function promosActualizar_(forzar) {
  var props = PropertiesService.getScriptProperties();
  var r;
  try {
    r = kTraer_(PR_RUTA);
  } catch (e) {
    prUnaVezAlDia_('error', function () {
      logErr_('PROMOS', 'No se pudo leer ' + PR_RUTA, { error: String(e.message).substring(0, 300) });
    });
    flushLog_();
    return { error: e.message };
  }

  var lista = prLista_(r.json);
  if (!lista) {
    prUnaVezAlDia_('forma', function () {
      logWarn_('PROMOS', 'El site contesto pero no encontre la lista de promociones. ' +
                         'Llaves recibidas: ' + Object.keys(r.json || {}).join(', '));
    });
    flushLog_();
    return { error: 'sin lista' };
  }

  // Columnas = llaves que manda el site, en orden de aparicion.
  var campos = [];
  lista.forEach(function (o) {
    Object.keys(o || {}).forEach(function (k) { if (campos.indexOf(k) < 0) campos.push(k); });
  });

  var huella = sha256_(JSON.stringify(lista));
  var hoja = SpreadsheetApp.getActive().getSheetByName(PR_HOJA);
  var hayHoja = hoja && hoja.getLastRow() > 0;
  if (!forzar && hayHoja && huella === props.getProperty(PR_PROP_HUELLA)) {
    prUnaVezAlDia_('igual', function () {
      logInfo_('PROMOS', 'Sin cambios (' + lista.length + ' promociones). Se revisa cada hora.');
    });
    flushLog_();
    return { filas: lista.length, campos: campos };
  }

  // Aviso si el site cambio de campos respecto a la ultima vez.
  var antes = props.getProperty(PR_PROP_CAMPOS);
  if (antes && antes !== campos.join('|')) {
    logWarn_('PROMOS', 'El site cambio los campos de promociones', {
      antes: antes.split('|'), ahora: campos
    });
  }

  var filas = [campos.map(prEncabezado_).concat(['Actualizado'])];
  var sello = ahora_();
  lista.forEach(function (o) {
    filas.push(campos.map(function (k) { return prValor_(o[k]); }).concat([sello]));
  });
  if (filas.length === 1) filas.push(campos.map(function () { return ''; }).concat([sello]));

  escribirTabla_(PR_HOJA, filas);
  props.setProperty(PR_PROP_HUELLA, huella);
  props.setProperty(PR_PROP_CAMPOS, campos.join('|'));

  logOk_('PROMOS', 'Promociones actualizadas: ' + lista.length, { campos: campos });
  flushLog_();
  return { filas: lista.length, campos: campos };
}

/** La lista de promociones: el arreglo de objetos que mande el site. */
function prLista_(json) {
  if (!json) return null;
  if (Array.isArray(json)) return json;
  var directas = ['promos', 'promociones', 'items', 'data', 'activas', 'lista'];
  for (var i = 0; i < directas.length; i++) {
    if (Array.isArray(json[directas[i]])) return json[directas[i]];
  }
  return kEncontrarLista_(json, ['categorias', 'kam', 'por_categoria']);
}

/** Encabezado legible: sku_base -> SKU BASE. */
function prEncabezado_(k) {
  return String(k).replace(/_/g, ' ').toUpperCase();
}

/** Valores planos para la hoja: objetos y listas como texto. */
function prValor_(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(function (x) { return typeof x === 'object' ? JSON.stringify(x) : x; }).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'SI' : 'NO';
  return v;
}

function prUnaVezAlDia_(clave, fn) {
  var props = PropertiesService.getScriptProperties();
  var marca = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') + '|' + clave;
  if (props.getProperty(PR_PROP_AVISO) === marca) return;
  fn();
  props.setProperty(PR_PROP_AVISO, marca);
}
