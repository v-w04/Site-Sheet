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
  return bajarInventario_(RUTA_STOCK, HOJA.STOCK, 'desc', true);
}

function descargarNegativos() {
  // Aqui SI es valido que venga vacio: significa que no hay negativos.
  return bajarInventario_(RUTA_NEGATIVOS, HOJA.NEGATIVOS, 'asc', false);
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

function bajarInventario_(ruta, nombreHoja, ordenBodegas, aplicarGuarda) {
  var tIni = Date.now();
  logStart_('STOCK', 'Bajando ' + nombreHoja);

  try {
    if (cuotaAgotadaHoy_()) {
      logWarn_('CUOTA', 'Cuota agotada - ' + nombreHoja + ' omitido');
      return { hoja: nombreHoja, estado: 'omitida por cuota' };
    }

    var crudo = fetchSitio_(ruta, { crudo: true });
    var huella = sha256_(crudo.texto);

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

    var filas = filasInventario_(data.items, ordenBodegas);
    if (filas.length) {
      escribirTabla_(nombreHoja, filas);
      props_().setProperty(PROP_HUELLA + nombreHoja, huella);
    }

    logFinish_('STOCK', nombreHoja + ' actualizado', {
      filas: Math.max(0, filas.length - 1), ms: Date.now() - tIni
    });

    return { hoja: nombreHoja, estado: 'actualizada', filas: Math.max(0, filas.length - 1) };

  } catch (e) {
    logErr_('STOCK', nombreHoja + ' fallo: ' + e.message);
    return { hoja: nombreHoja, estado: 'error', error: e.message };
  }
}

/**
 * Arma la tabla: todos los campos escalares del item, mas BODEGAS.
 * `warehouses` es un arreglo y se aplana a texto; el resto pasa tal cual.
 */
function filasInventario_(items, ordenBodegas) {
  if (!items.length) return [];

  var llaves = [];
  items.forEach(function (it) {
    for (var k in it) {
      if (k === 'warehouses') continue;
      if (typeof it[k] === 'object' && it[k] !== null) continue;
      if (llaves.indexOf(k) === -1) llaves.push(k);
    }
  });

  // sku primero si viene, que es como se lee la hoja
  var i = llaves.indexOf('sku');
  if (i > 0) { llaves.splice(i, 1); llaves.unshift('sku'); }

  var encabezados = llaves.concat(['BODEGAS', 'Actualizado']);
  var sello = ahora_();

  var filas = [encabezados];
  items.forEach(function (it) {
    var fila = llaves.map(function (k) {
      var v = it[k];
      return (v === null || v === undefined) ? '' : v;
    });
    fila.push(joinBodegas_(it.warehouses, ordenBodegas));
    fila.push(sello);
    filas.push(fila);
  });

  return filas;
}

/** Bodegas ordenadas por cantidad. En negativos, los mas negativos primero. */
function joinBodegas_(warehouses, orden) {
  var arr = (warehouses || []).slice();

  var ordenadas = (orden === 'desc')
    ? arr.filter(function (w) { return Number(w.qty || 0) > 0; })
         .sort(function (a, b) { return Number(b.qty || 0) - Number(a.qty || 0); })
    : arr.sort(function (a, b) { return Number(a.qty || 0) - Number(b.qty || 0); });

  return ordenadas
    .map(function (w) { return String(w.name || '').trim(); })
    .filter(Boolean)
    .join(', ');
}
