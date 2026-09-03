/**
 * ============================================================
 *  Precios — 2 masters x 3 bandas = 6 hojas
 * ============================================================
 *
 *  masters: elemex (Electronics Mexico) y cva
 *  bandas:  minimo, normal, maximo
 *
 *  Los mismos que los botones de /precios-em (data-m y data-b).
 *
 *  SOBRE "no quiero tronar por llamadas":
 *
 *  La cuota de UrlFetch cuenta LLAMADAS, no datos. Seis combinaciones
 *  cada 15 minutos son 576 llamadas al dia de 20,000 disponibles. No
 *  hay riesgo por ahi.
 *
 *  Lo que si vale la pena cuidar es no reescribir el Sheet cuando nada
 *  cambio: escribir 6 hojas completas cada 15 minutos hace lenta la
 *  hoja, ensucia el historial y no aporta nada. Por eso se guarda una
 *  huella (SHA-256) de lo ultimo escrito y, si la respuesta es
 *  identica, se salta la escritura.
 *
 *  Si algun dia el servidor expone un endpoint ligero que devuelva
 *  solo la huella, se puede ahorrar tambien la bajada. Mientras tanto
 *  esto ya evita el 90% del trabajo inutil.
 */

/**
 * Como se le pide la tabla al site.
 *
 * Con GET, los filtros van en la URL:      ?m={master}&b={banda}
 * Con POST, van en el cuerpo como JSON.    {"master":"...","banda":"..."}
 *
 * La pagina de precios usa POST — sus rutas /precios-em/api/* contestan 405
 * a un GET, que es el servidor diciendo "existo, pero no asi".
 */
var PLANTILLA_GET_DEFAULT  = '?m={master}&b={banda}';
var PLANTILLA_POST_DEFAULT = '{"master":"{master}","banda":"{banda}","m":"{master}","b":"{banda}"}';

function metodoPrecios_() {
  return (props_().getProperty(PROP.METODO_PRE) || 'get').toLowerCase();
}

function plantillaPrecios_() {
  var guardada = props_().getProperty('PLANTILLA_PRECIOS');
  if (guardada) return guardada;
  return metodoPrecios_() === 'post' ? PLANTILLA_POST_DEFAULT : PLANTILLA_GET_DEFAULT;
}

function sustituir_(plantilla, master, banda) {
  return plantilla
    .replace(/\{master\}/g, master)
    .replace(/\{banda\}/g, banda);
}

/** Trae la tabla cruda de una combinacion. Devuelve { codigo, texto }. */
function traerPrecios_(master, banda) {
  var base = prop_(PROP.RUTA_PRE);

  if (metodoPrecios_() === 'post') {
    return fetchSitio_(base, {
      crudo: true,
      method: 'post',
      payload: sustituir_(plantillaPrecios_(), master, banda),
      contentType: 'application/json'
    });
  }

  var cola = sustituir_(plantillaPrecios_(), encodeURIComponent(master), encodeURIComponent(banda));
  if (cola.charAt(0) === '?' && base.indexOf('?') !== -1) cola = '&' + cola.slice(1);
  return fetchSitio_(base + cola, { crudo: true });
}

/* ================ DESCARGA ================ */

/** Todas las combinaciones. Es lo que corre el trigger. */
function descargarPrecios() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_ESPERA_MS)) {
    console.log('Otra corrida de precios en curso, se omite esta.');
    return;
  }

  var tIni = Date.now();
  logStart_('PRECIOS', 'Descarga de precios');

  var resumen = { actualizadas: 0, sinCambio: 0, fallidas: 0, detalle: [] };

  try {
    if (cuotaAgotadaHoy_()) {
      logWarn_('CUOTA', 'Cuota agotada en esta cuenta - corrida omitida');
      toast_('Cuota de UrlFetch agotada, se omite', 'PRECIOS', 8);
      return resumen;
    }

    for (var i = 0; i < MASTERS.length; i++) {
      for (var j = 0; j < BANDAS.length; j++) {
        var m = MASTERS[i].id, b = BANDAS[j].id;
        var r = descargarCombinacion_(m, b);

        resumen.detalle.push(r);
        if (r.estado === 'actualizada')  resumen.actualizadas++;
        else if (r.estado === 'sin cambio') resumen.sinCambio++;
        else resumen.fallidas++;

        Utilities.sleep(PAUSA_ENTRE_MS);
      }
    }

    logFinish_('PRECIOS', 'Precios terminado', {
      actualizadas: resumen.actualizadas,
      sin_cambio:   resumen.sinCambio,
      fallidas:     resumen.fallidas,
      ms:           Date.now() - tIni
    });

    toast_(resumen.actualizadas + ' hojas actualizadas, ' +
           resumen.sinCambio + ' sin cambios', 'PRECIOS', 6);

    return resumen;

  } catch (e) {
    logErr_('PRECIOS', 'Error fatal', { message: e.message });
    toast_(String(e.message).split('\n')[0], 'ERROR', 15);
    throw e;
  } finally {
    flushLog_();
    lock.releaseLock();
  }
}

function descargarCombinacion_(master, banda) {
  var hoja = hojaPrecios_(master, banda);

  try {
    var crudo = traerPrecios_(master, banda);
    var huella = sha256_(crudo.texto);

    if (huella === props_().getProperty(PROP_HUELLA + hoja)) {
      logInfo_('PRECIOS', hoja + ': sin cambios, no se reescribio');
      return { hoja: hoja, estado: 'sin cambio' };
    }

    var data = JSON.parse(crudo.texto);
    var filas = aFilas_(data, COLUMNAS_PRECIOS);

    if (!filas.length) {
      logWarn_('PRECIOS', hoja + ': la respuesta no trajo filas, no se toco la hoja');
      return { hoja: hoja, estado: 'vacia' };
    }

    // Guarda: si viene vacio pero la hoja tiene datos, NO la borramos.
    var actuales = filasDatos_(hoja);
    if (filas.length <= 1 && actuales > 0) {
      logErr_('GUARD', hoja + ': respuesta sin datos pero la hoja tiene ' + actuales +
                       ' filas. Se aborta la escritura para no borrarla.');
      return { hoja: hoja, estado: 'abortada por guarda' };
    }

    escribirTabla_(hoja, filas);
    props_().setProperty(PROP_HUELLA + hoja, huella);

    logOk_('PRECIOS', hoja + ': ' + (filas.length - 1) + ' productos');
    return { hoja: hoja, estado: 'actualizada', filas: filas.length - 1 };

  } catch (e) {
    logErr_('PRECIOS', hoja + ' fallo: ' + e.message);
    return { hoja: hoja, estado: 'error', error: e.message };
  }
}

/* ================ NORMALIZACION ================ */

/**
 * Convierte lo que sea que haya devuelto el sitio en una tabla con
 * encabezado en la fila 1.
 *
 * `preferidas` da el orden de las columnas conocidas. Los campos que
 * no esten en esa lista se agregan al final: si el servidor manda algo
 * nuevo, aparece en la hoja en vez de perderse en silencio.
 */
function aFilas_(data, preferidas) {
  var lista = Array.isArray(data) ? data
    : (data.items || data.rows || data.data || data.productos || data.results || []);
  if (!lista.length) return [];

  var vistas = [];
  lista.forEach(function (o) {
    for (var k in o) if (vistas.indexOf(k) === -1) vistas.push(k);
  });

  var orden = [];
  (preferidas || []).forEach(function (c) {
    var hit = calzar_(c, vistas);
    if (hit && orden.indexOf(hit) === -1) orden.push(hit);
  });
  vistas.forEach(function (k) { if (orden.indexOf(k) === -1) orden.push(k); });

  var filas = [orden.slice()];
  lista.forEach(function (o) {
    filas.push(orden.map(function (k) {
      var v = o[k];
      if (v === null || v === undefined) return '';
      return (typeof v === 'object') ? JSON.stringify(v) : v;
    }));
  });

  return filas;
}

/** Empata "Categoría ML" con "categoria_ml", "categoriaML", etc. */
function calzar_(deseada, disponibles) {
  var objetivo = normLlave_(deseada);
  for (var i = 0; i < disponibles.length; i++) {
    if (normLlave_(disponibles[i]) === objetivo) return disponibles[i];
  }
  return null;
}

/** Baja a minusculas, quita acentos y deja solo letras y numeros. */
function normLlave_(s) {
  var t = String(s).toLowerCase();
  try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { /* runtime viejo */ }
  return t.replace(/[^a-z0-9]/g, '');
}

/* ================ ESCRITURA ================ */

/**
 * Escribe la tabla completa.
 *
 * El script NO impone formato: no congela filas, no pinta encabezados,
 * no agrupa. El formato de la hoja es tuyo y reimponerlo en cada corrida
 * borra tu trabajo.
 *
 * La unica excepcion son las columnas de SKU o codigo: van en formato
 * texto ANTES de escribir, porque sin `@` Sheets convierte el codigo a
 * numero y se come los ceros de la izquierda. Eso no es estetica.
 *
 * Se escribe primero y se limpia el sobrante despues, nunca al reves:
 * un clearContents() de golpe deja la hoja vacia si el setValues truena
 * a medias, y el downstream lee cero.
 */
function escribirTabla_(nombreHoja, filas) {
  var h = getHoja_(nombreHoja);
  var cols = filas[0].length;

  if (h.getMaxRows() < filas.length) {
    h.insertRowsAfter(h.getMaxRows(), filas.length - h.getMaxRows() + 1);
  }
  if (h.getMaxColumns() < cols) {
    h.insertColumnsAfter(h.getMaxColumns(), cols - h.getMaxColumns());
  }

  filas[0].forEach(function (encabezado, i) {
    if (RE_COLUMNA_TEXTO.test(String(encabezado))) {
      h.getRange(1, i + 1, filas.length, 1).setNumberFormat('@');
    }
  });

  h.getRange(1, 1, filas.length, cols).setValues(filas);

  var sobrantes = h.getLastRow() - filas.length;
  if (sobrantes > 0) {
    h.getRange(filas.length + 1, 1, sobrantes, h.getLastColumn()).clear();
  }

  SpreadsheetApp.flush();
}

function filasDatos_(nombreHoja) {
  var ss = getSpreadsheet_();
  var h = ss.getSheetByName(nombreHoja);
  if (!h) return 0;
  return Math.max(0, h.getLastRow() - 1);
}

function leerTabla_(nombreHoja) {
  var ss = getSpreadsheet_();
  var h = ss.getSheetByName(nombreHoja);
  if (!h) return { columnas: [], filas: [] };

  var ultima = h.getLastRow(), cols = h.getLastColumn();
  if (ultima < 2 || cols < 1) return { columnas: [], filas: [] };

  var todo = h.getRange(1, 1, ultima, cols).getDisplayValues();
  return { columnas: todo[0], filas: todo.slice(1) };
}

function sha256_(s) {
  return Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)
  );
}
