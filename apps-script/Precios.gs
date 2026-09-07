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
var PLANTILLA_GET_DEFAULT  = '?cat={master}&banda={banda}';

/**
 * El master se llama "cat" en este site — la respuesta trae cat:"elemex" y
 * catalogos:[2]. Se mandan tambien los alias por si acaso: un servidor ignora
 * los campos que no conoce, asi que sobran gratis. Lo que NO sale gratis es
 * omitir el nombre correcto: el servidor toma su default y te devuelve elemex
 * seis veces sin quejarse de nada.
 */
var PLANTILLA_POST_DEFAULT =
  '{"cat":"{master}","catalogo":"{master}","master":"{master}","m":"{master}",' +
  '"banda":"{banda}","b":"{banda}"}';

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

    // Cada combinacion son ~3 MB de JSON que hay que bajar, parsear y escribir.
    // Seis de golpe pueden pasarse de los 6 minutos que Apps Script permite y
    // morir a media hoja. Por eso hay presupuesto de tiempo y un cursor: se
    // hace lo que alcance y la siguiente corrida sigue donde se quedo.
    var combos = [];
    MASTERS.forEach(function (m) {
      BANDAS.forEach(function (b) { combos.push([m.id, b.id]); });
    });

    var cursor = Number(props_().getProperty('PRECIOS_CURSOR') || 0) % combos.length;
    var hechas = 0;

    for (var n = 0; n < combos.length; n++) {
      if (Date.now() - tIni > LIMITE_MS) {
        logWarn_('PRECIOS', 'Se acabo el presupuesto de tiempo. Faltaron ' +
                            (combos.length - n) + ' combinaciones; siguen la proxima corrida.');
        break;
      }

      var idx = (cursor + n) % combos.length;
      var hojaN = hojaPrecios_(combos[idx][0], combos[idx][1]);

      // Avisar ANTES de empezar: bajar 3 MB tarda, y sin esto parece colgado
      toast_((n + 1) + ' de ' + combos.length + ': ' + hojaN + '...', 'PRECIOS', 30);
      logInfo_('PRECIOS', 'Bajando ' + hojaN + ' (' + (n + 1) + ' de ' + combos.length + ')');
      flushLog_();

      var r = descargarCombinacion_(combos[idx][0], combos[idx][1]);
      hechas++;

      // Volcar el log en cada vuelta, no al final: asi la hoja Log se va
      // llenando mientras corre y se puede ver el avance en vivo.
      flushLog_();

      resumen.detalle.push(r);
      if (r.estado === 'actualizada')       resumen.actualizadas++;
      else if (r.estado === 'sin cambio')   resumen.sinCambio++;
      else                                   resumen.fallidas++;

      Utilities.sleep(PAUSA_ENTRE_MS);
    }

    props_().setProperty('PRECIOS_CURSOR', String((cursor + hechas) % combos.length));

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
    // La huella incluye los encabezados: si cambiamos el mapeo de columnas,
    // la hoja se reescribe aunque el site devuelva exactamente lo mismo.
    var crudo = traerPrecios_(master, banda);
    var huella = sha256_(crudo.texto) + '.' + sha256_(encabezadosPrecios_().join('|'));

    if (huella === props_().getProperty(PROP_HUELLA + hoja)) {
      logInfo_('PRECIOS', hoja + ': sin cambios, no se reescribio');
      return { hoja: hoja, estado: 'sin cambio' };
    }

    var data = JSON.parse(crudo.texto);
    var items = encontrarLista_(data);

    // Mapeo a las 23 columnas. Si el site cambiara de forma y ya no se
    // reconocieran los campos, cae al volcado generico: mejor una hoja rara
    // que una hoja vacia.
    var filas = (items.length && (items[0].sku || items[0].clave))
      ? filasPrecios_(items)
      : aFilas_(data, COLUMNAS_PRECIOS);

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


/* ================ MAPEO A LAS 23 COLUMNAS ================ */

/**
 * El site manda 45 campos por producto; la tabla que tu usas tiene 23 columnas.
 * Aqui se hace la traduccion, y es el UNICO lugar donde vive: si manana quieres
 * una columna mas o menos, se toca esto y nada mas.
 *
 * Los precios por canal vienen anidados en `precios`, asi que hay que
 * aplanarlos a una columna cada uno.
 */

/**
 * Solo los canales que de verdad se usan.
 *
 * El site manda los 12, pero aquí se escriben dos. Ojo con la expectativa:
 * esto NO reduce la llamada al site — la respuesta sigue pesando ~3 MB
 * porque el servidor manda el paquete completo y no acepta pedir menos.
 * Lo que sí baja es lo que se escribe en la hoja y lo que pesa el Sheet,
 * que es donde se sentía lento.
 *
 * Para que la llamada bajara de verdad tendría que existir un parámetro en
 * /precios-em/api/lista que permita pedir solo ciertos canales.
 */
var CANALES_COLUMNAS = [
  ['Walmart Clásica',  'walmart_clasica'],
  ['Walmart Premium',  'walmart_premium']
];

/** Banderas del producto que valen la pena ver de un vistazo. */
var AVISOS = [
  ['killer',        function (it) { return it.killer !== null && it.killer !== undefined; }],
  ['nuevo',         function (it) { return it.nuevo === true; }],
  ['openbox',       function (it) { return it.openbox === true; }],
  ['provisional',   function (it) { return (it.provisional || []).length > 0; }],
  ['sin costo',     function (it) { return it.sin_costo === true; }],
  ['sin peso',      function (it) { return it.sin_peso === true; }],
  ['sin precio',    function (it) { return !!it.sin_precio; }],
  ['sin categoría', function (it) { return it.sin_cat === true; }],
  ['revisar cat',   function (it) { return !!it.revisar_cat; }],
  ['medida rara',   function (it) { return it.medida_rara === true; }],
  ['duplicado CVA', function (it) { return it.duplicado_cva === true; }],
  ['costo manual',  function (it) { return it.costo_manual === true; }],
  ['comparte Odoo', function (it) { return it.comparte_odoo === true; }]
];

function encabezadosPrecios_() {
  var h = ['Producto', 'SKU', 'Categoría ML', 'Rango de envío', 'Envío', 'Peso kg',
           'Stock Odoo', 'Cambio de precio %', 'Precio anterior', 'Cambió el'];
  CANALES_COLUMNAS.forEach(function (c) { h.push(c[0]); });
  return h;
}

function filasPrecios_(items) {
  if (!items.length) return [];

  var filas = [encabezadosPrecios_()];
  var formaCambio = null;   // para reportar en el log si viene distinta a lo previsto

  items.forEach(function (it) {
    var precios = it.precios || {};
    var camb = cambioDe_(it.cambio);
    if (!formaCambio && !cambioReconocido_(it.cambio)) {
      formaCambio = JSON.stringify(it.cambio).substring(0, 200);
    }

    var fila = [
      it.nombre     || '',
      it.sku        || it.clave || '',
      it.cat_nombre || '',
      it.rango      || '',
      num_(it.envio),
      num_(it.peso),
      num_(it.stock_odoo),
      camb[0], camb[1], camb[2]
    ];

    CANALES_COLUMNAS.forEach(function (c) { fila.push(num_(precios[c[1]])); });

    filas.push(fila);
  });

  if (formaCambio) {
    logWarn_('PRECIOS', 'El campo cambio llego con una forma que no reconozco, ' +
                        'esas 3 columnas van a salir vacias: ' + formaCambio);
  }

  return filas;
}

/** Celda vacia en vez de 0 cuando el dato no existe: un 0 miente. */
function num_(v) {
  if (v === null || v === undefined || v === '') return '';
  var n = Number(v);
  return isNaN(n) ? v : n;
}

/**
 * `cambio` describe el ultimo cambio de precio del producto. Viene null cuando
 * no ha cambiado, y cuando si, con esta forma — confirmada contra el site:
 *
 *   {"pct": -3.62, "antes": 1389, "fecha": "2026-08-18"}
 *
 * Se aceptan tambien nombres alternos por si algun dia le mueven, pero si
 * llega algo que no reconocemos se avisa en el log en vez de escribir vacio
 * en silencio, que es como se pierden columnas sin que nadie se entere.
 */
var CAMBIO_LLAVES = {
  pct:      ['pct', 'porcentaje', 'porc', 'delta'],
  anterior: ['antes', 'anterior', 'previo', 'prev', 'old'],
  fecha:    ['fecha', 'ts', 'cuando', 'dia', 'date']
};

function cambioDe_(c) {
  if (c === null || c === undefined || c === '') return ['', '', ''];
  if (typeof c === 'number') return [c, '', ''];

  if (typeof c === 'object' && !Array.isArray(c)) {
    return [
      num_(buscarLlave_(c, CAMBIO_LLAVES.pct)),
      num_(buscarLlave_(c, CAMBIO_LLAVES.anterior)),
      buscarLlave_(c, CAMBIO_LLAVES.fecha) || ''
    ];
  }

  return [String(c), '', ''];
}

/** True si el objeto trae las tres piezas que esperamos. */
function cambioReconocido_(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return true;   // null y numeros son casos previstos
  var r = cambioDe_(c);
  return r[0] !== '' || r[1] !== '' || r[2] !== '';
}

function buscarLlave_(obj, candidatas) {
  for (var i = 0; i < candidatas.length; i++) {
    if (obj[candidatas[i]] !== undefined && obj[candidatas[i]] !== null) return obj[candidatas[i]];
  }
  return '';
}

function avisosDe_(it) {
  var avisos = [];
  AVISOS.forEach(function (a) {
    try { if (a[1](it)) avisos.push(a[0]); } catch (e) {}
  });
  return avisos.join(', ');
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
  var lista = encontrarLista_(data);
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


/**
 * Encuentra la lista de productos dentro de la respuesta.
 *
 * /precios-em/api/lista no devuelve un arreglo pelon: devuelve un objeto con
 * la configuracion de la banda, los canales, y en algun lado la tabla. En vez
 * de adivinar el nombre de la llave, se busca el arreglo de objetos mas grande
 * de la respuesta. Si manana le cambian el nombre, esto sigue funcionando.
 */
function encontrarLista_(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];

  var mejor = [];

  function revisar(valor) {
    if (!Array.isArray(valor) || valor.length <= mejor.length) return;
    // Tiene que ser un arreglo de objetos: los canales o las etiquetas no cuentan
    var primero = valor[0];
    if (!primero || typeof primero !== 'object' || Array.isArray(primero)) return;
    mejor = valor;
  }

  for (var k in data) {
    revisar(data[k]);
    // Un nivel mas adentro, por si viene envuelto en algo tipo { datos: { filas: [] } }
    if (data[k] && typeof data[k] === 'object' && !Array.isArray(data[k])) {
      for (var k2 in data[k]) revisar(data[k][k2]);
    }
  }

  return mejor;
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

  // Quitar las columnas de más.
  //
  // Cuando cambian las columnas —como al retirar BODEGAS— las viejas se
  // quedan a la derecha con sus datos de la última corrida. Nadie las
  // actualiza, pero ahí siguen, y con el tiempo alguien las lee creyendo
  // que valen. Peor todavía: se exportan al CSV y al XLSX.
  //
  // Se borran de verdad, no se vacían: una columna vacía con encabezado
  // sigue apareciendo en el dashboard y en las descargas.
  var colsDeMas = h.getMaxColumns() - cols;
  if (colsDeMas > 0) h.deleteColumns(cols + 1, colsDeMas);

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

/**
 * De "Precios CVA Maximo" a { master:'cva', banda:'maximo' }.
 * Lo usa el dashboard para refrescar SOLO la hoja que estas viendo:
 * bajar las seis son mas de un minuto de espera con la pagina congelada,
 * y casi siempre te interesa una.
 */
function comboDeHoja_(nombre) {
  var n = String(nombre || '').toLowerCase();
  if (n.indexOf('precios') !== 0) return null;

  var master = null;
  MASTERS.forEach(function (m) {
    var pista = (m.id === 'cva') ? 'cva' : 'em';
    if (n.indexOf(' ' + pista + ' ') !== -1) master = m.id;
  });

  var banda = null;
  BANDAS.forEach(function (b) { if (n.indexOf(b.id) !== -1) banda = b.id; });

  return (master && banda) ? { master: master, banda: banda } : null;
}
