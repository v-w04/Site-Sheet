/**
 * ============================================================
 *  Stock — inventario y negativos desde el sitio
 * ============================================================
 *
 *  Mismo camino que ya te funciona: los endpoints cacheados del
 *  sitio, no XML-RPC de Odoo. Es mas rapido y no depende de que
 *  Odoo aguante la consulta.
 *
 *  COLUMNAS: pendiente definir la estructura nueva. Mientras tanto
 *  esto escribe TODOS los campos escalares que traiga el endpoint,
 *  mas una columna BODEGAS armada desde el arreglo warehouses. Asi
 *  no se pierde nada mientras decidimos, y cuando me digas que
 *  columnas quieres, se recorta aqui en un solo lugar.
 */

function descargarStock() {
  return bajarInventario_(RUTA_STOCK, HOJA.STOCK, COLUMNAS_STOCK, true);
}

function descargarNegativos() {
  // Aqui SI es valido que venga vacio: significa que no hay negativos,
  // por eso la guarda contra vaciado va en false.
  return bajarInventario_(RUTA_NEGATIVOS, HOJA.NEGATIVOS, COLUMNAS_NEGATIVOS, false);
}

function descargarTodoStock() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_ESPERA_MS)) {
    console.log('Otra corrida de stock en curso, se omite esta.');
    return;
  }
  try {
    var a = descargarStock();
    Utilities.sleep(PAUSA_ENTRE_MS);
    var b = descargarNegativos();
    return { stock: a, negativos: b };
  } finally {
    flushLog_();
    lock.releaseLock();
  }
}

function bajarInventario_(ruta, nombreHoja, columnas, aplicarGuarda) {
  var tIni = Date.now();
  toast_('Bajando ' + nombreHoja + '...', 'INVENTARIO', 30);
  logStart_('STOCK', 'Bajando ' + nombreHoja);
  flushLog_();

  try {
    if (cuotaAgotadaHoy_()) {
      logWarn_('CUOTA', 'Cuota agotada - ' + nombreHoja + ' omitido');
      return { hoja: nombreHoja, estado: 'omitida por cuota' };
    }

    // La huella incluye las COLUMNAS, no solo la respuesta del site.
    // Si solo cubriera los datos, el dia que cambiemos que columnas se
    // escriben la hoja se quedaria con las viejas: el site devuelve lo
    // mismo, la huella coincide, y no se reescribe nada. El bug se ve
    // como "no pasa nada" y se busca en el lugar equivocado.
    var crudo = fetchSitio_(ruta, { crudo: true });
    var huella = sha256_(crudo.texto) + '.' +
                 sha256_(columnas.map(function (c) { return c[1]; }).join('|'));

    if (huella === props_().getProperty(PROP_HUELLA + nombreHoja)) {
      logInfo_('STOCK', nombreHoja + ': sin cambios, no se reescribio');
      return { hoja: nombreHoja, estado: 'sin cambio' };
    }

    var data = JSON.parse(crudo.texto);

    if (data.ok === false) {
      throw new Error('El endpoint respondio ok=false: ' + JSON.stringify(data).substring(0, 200));
    }
    if (!Array.isArray(data.items)) {
      throw new Error('El endpoint no devolvio un arreglo "items". Estructura inesperada.');
    }

    logOk_('STOCK', 'Datos recibidos', {
      total_skus: data.total_skus,
      total_uds:  data.total_uds,
      cache:      data.cache,
      edad:       data.edad,
      items:      data.items.length,
      ms_fetch:   Date.now() - tIni
    });

    if ((data.edad || 0) > CACHE_VIEJO_SEG) {
      logWarn_('STOCK', 'El cache del sitio tiene ' + data.edad +
                        's - el job del sitio pudo no haber corrido');
    }

    // Guarda: 0 items contra una hoja con datos casi siempre es un
    // problema del endpoint, no un inventario que se vacio de verdad.
    var actuales = filasDatos_(nombreHoja);
    if (aplicarGuarda && data.items.length === 0 && actuales > 0) {
      logErr_('GUARD', 'El endpoint devolvio 0 items pero la hoja tiene ' + actuales +
                       ' filas. Se ABORTA la escritura para no borrar el inventario.');
      toast_('Endpoint vacio, no se toco la hoja', 'STOCK', 10);
      return { hoja: nombreHoja, estado: 'abortada por guarda' };
    }

    revisarCamposNuevos_(data.items, columnas, nombreHoja);
    var filas = filasInventario_(data.items, columnas);
    if (filas.length) {
      escribirTabla_(nombreHoja, filas);
      props_().setProperty(PROP_HUELLA + nombreHoja, huella);
    }

    logFinish_('STOCK', nombreHoja + ' actualizado', {
      filas: Math.max(0, filas.length - 1), ms: Date.now() - tIni
    });
    flushLog_();

    return { hoja: nombreHoja, estado: 'actualizada', filas: Math.max(0, filas.length - 1) };

  } catch (e) {
    logErr_('STOCK', nombreHoja + ' fallo: ' + e.message);
    flushLog_();
    return { hoja: nombreHoja, estado: 'error', error: e.message };
  }
}

/* ================ COLUMNAS ================ */

/**
 * Las dos hojas de inventario tienen forma distinta a proposito, porque los
 * datos son distintos: el inventario actual viene por SKU, y el negativo
 * viene por NUMERO DE SERIE — trae serie, ubicacion y almacen, que en el
 * actual ni existen.
 *
 * Forzar las dos a las mismas columnas dejaria media tabla vacia y perderia
 * justo lo que hace util a la de negativos: saber que pieza, en que ubicacion.
 *
 * Cada entrada es [campo del endpoint, encabezado en la hoja].
 */
var COLUMNAS_STOCK = [
  ['sku',           'SKU'],
  ['nombre',        'Producto'],
  ['libre',         'Libre'],
  ['qty',           'Existencia'],
  ['reservado',     'Reservado'],
  ['en_transito',   'En tránsito']
];

var COLUMNAS_NEGATIVOS = [
  ['sku',           'SKU'],
  ['nombre',        'Producto'],
  ['qty',           'Cantidad'],
  ['serie',         'Serie'],
  ['ubicacion',     'Ubicación'],
  ['warehouse',     'Almacén']
];

/**
 * Arma la tabla con las columnas de arriba, mas el sello de tiempo.
 *
 * Se quito BODEGAS: el endpoint del site no manda `warehouses`, asi que esa
 * columna salia vacia en las 1,608 filas. Una columna que siempre esta vacia
 * no es neutral — hace dudar de si el dato falta o el script fallo.
 *
 * Tambien se fue `solo_transito`, que es una bandera interna, no un dato que
 * alguien vaya a leer en la hoja.
 *
 * Si el endpoint deja de mandar alguno de estos campos, la columna aparece
 * vacia pero la hoja no se rompe. Si empieza a mandar campos nuevos, no se
 * escriben: se agregan aqui a proposito, no por accidente.
 */
function filasInventario_(items, columnas) {
  if (!items.length) return [];

  var encabezados = columnas.map(function (c) { return c[1]; }).concat(['Actualizado']);
  var sello = ahora_();

  var filas = [encabezados];

  items.forEach(function (it) {
    var fila = columnas.map(function (c) {
      var v = it[c[0]];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    });
    fila.push(sello);
    filas.push(fila);
  });

  return filas;
}

/**
 * Avisa una sola vez si el endpoint empezo a mandar campos que no estamos
 * escribiendo. Sin esto, un dato nuevo del site se pierde en silencio para
 * siempre; con esto, aparece en el Log y decidimos si lo queremos.
 */
function revisarCamposNuevos_(items, columnas, etiqueta) {
  if (!items.length) return;

  var conocidos = columnas.map(function (c) { return c[0]; });
  var ignorar = ['warehouses', 'solo_transito'];
  var nuevos = [];

  for (var k in items[0]) {
    if (conocidos.indexOf(k) === -1 && ignorar.indexOf(k) === -1) nuevos.push(k);
  }

  if (nuevos.length) {
    logInfo_('STOCK', etiqueta + ': el endpoint manda campos que no escribimos: ' +
                      nuevos.join(', ') + '. Si alguno te sirve, se agrega en COLUMNAS_STOCK.');
  }
}
