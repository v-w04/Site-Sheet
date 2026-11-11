/**
 * ============================================================
 *  Columnas — todo se busca por ENCABEZADO, nunca por posicion
 * ============================================================
 *
 * REGLA DEL PROYECTO: ninguna parte del codigo ni de las formulas puede
 * depender de que una columna este en la letra C o en el indice 4. Si
 * alguien mueve, inserta o borra una columna, la logica tiene que seguir
 * funcionando; y si falta una columna que se necesita, tiene que avisar
 * con un ERROR claro en el Log, no dar datos corridos en silencio.
 *
 * Dos juegos de herramientas:
 *
 *   1) Para el SCRIPT (getValues):
 *        var c = colsDe_(encabezados, ['SKU', 'MINIMO'], 'Concentrado');
 *        fila[c.MINIMO]
 *      Si falta una requerida: ERROR en el Log y se detiene.
 *
 *   2) Para las FORMULAS que el script escribe:
 *        fxCol_('Walmart', 'SKU', 2)                -> la columna SKU desde la fila 2
 *        fxBuscar_(llave, 'Catalogo', 'SKU', 'NOMBRE')  -> VLOOKUP por encabezado
 *      Usan INDIRECT con el rango escrito como TEXTO. Asi, si alguien inserta
 *      una columna en la hoja fuente, Sheets NO recorre la referencia (con
 *      'Walmart'!$A:$L normal la recorreria a $B:$M y, cuando el script
 *      reescribe la hoja desde A, la formula quedaria apuntando mal para
 *      siempre). El MATCH contra la fila 1 encuentra la columna donde este.
 */

/** Encabezado normalizado: sin acentos, mayusculas, espacios simples. */
function normEnc_(s) {
  return String(s === null || s === undefined ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Mapa {nombre pedido -> indice 0-based} a partir de una fila de encabezados.
 * `requeridas`: si falta alguna, ERROR en el Log y throw.
 * `opcionales`: si faltan, quedan en -1 (el que llama decide).
 */
function colsDe_(encabezados, requeridas, nombreHoja, opcionales) {
  var idx = {};
  (encabezados || []).forEach(function (e, i) {
    var k = normEnc_(e);
    if (k && !(k in idx)) idx[k] = i;
  });

  var out = {}, faltan = [];
  (requeridas || []).forEach(function (n) {
    var k = normEnc_(n);
    if (k in idx) out[n] = idx[k]; else faltan.push(n);
  });
  (opcionales || []).forEach(function (n) {
    var k = normEnc_(n);
    out[n] = (k in idx) ? idx[k] : -1;
  });

  if (faltan.length) {
    var msg = 'En la hoja "' + nombreHoja + '" falta la columna ' +
              faltan.map(function (x) { return '"' + x + '"'; }).join(', ') +
              '. Revisa que nadie haya renombrado o borrado el encabezado.';
    try {
      logErr_('COLUMNAS', msg, { hoja: nombreHoja, encontrados: (encabezados || []).slice(0, 40) });
      flushLog_();
    } catch (e) {}
    throw new Error(msg);
  }
  return out;
}

/** Lee la fila de encabezados de una hoja y devuelve el mapa. */
function colsHoja_(hoja, requeridas, opcionales, filaEnc) {
  filaEnc = filaEnc || 1;
  var nC = Math.max(1, hoja.getLastColumn());
  var enc = hoja.getRange(filaEnc, 1, 1, nC).getValues()[0];
  return colsDe_(enc, requeridas, hoja.getName(), opcionales);
}

/* ---------------- Formulas ---------------- */

function fxEsc_(s) { return String(s).replace(/"/g, '""'); }

/** INDIRECT("'Hoja'!rango") — referencia que Sheets no recorre al insertar columnas. */
function fxRango_(hoja, rango) {
  return 'INDIRECT("\'' + fxEsc_(String(hoja).replace(/'/g, "''")) + '\'!' + rango + '")';
}

/** Numero de columna del encabezado en la fila 1 de la hoja. */
function fxMatch_(hoja, enc) {
  return 'MATCH("' + fxEsc_(enc) + '",' + fxRango_(hoja, '1:1') + ',0)';
}

/**
 * Columna completa por encabezado. `desdeFila` = 1 la da completa (para
 * VLOOKUP), 2 la deja alineada renglon por renglon con los datos.
 *
 * Se arma la LETRA con ADDRESS(1, MATCH(...), 4) y se pide solo esa columna
 * ("'Hoja'!K:K"), asi nunca se pide un rango mas ancho que la hoja.
 */
function fxCol_(hoja, enc, desdeFila) {
  var letra = 'SUBSTITUTE(ADDRESS(1,' + fxMatch_(hoja, enc) + ',4),"1","")';
  var pref = "'" + fxEsc_(String(hoja).replace(/'/g, "''")) + "'!";
  var desde = (desdeFila && desdeFila > 1) ? String(desdeFila) : '';
  return 'INDIRECT("' + pref + '"&' + letra + '&"' + desde + ':"&' + letra + ')';
}

/** VLOOKUP por encabezados: busca `llave` en la columna encLlave y trae encValor. */
function fxBuscar_(llave, hoja, encLlave, encValor) {
  return 'VLOOKUP(' + llave + ',{' + fxCol_(hoja, encLlave) + ',' + fxCol_(hoja, encValor) + '},2,FALSE)';
}

/** ¿La llave existe en la columna encLlave? (para SI/NO) */
function fxExiste_(llave, hoja, encLlave) {
  return 'NOT(ISNA(MATCH(' + llave + ',' + fxCol_(hoja, encLlave) + ',0)))';
}

/** Letra de una columna por su posicion 1-based (para formatos de la hoja propia). */
function colLetra_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/* ---------------- Esquemas ---------------- */

/**
 * Lo que cada hoja fuente TIENE que traer para que las formulas y procesos
 * funcionen. Se revisa al armar Concentrado / Inventarios / Variantes /
 * Oportunidades y una vez al dia en el refresco. Si falta algo: ERROR en el
 * Log con la hoja y la columna.
 */
function esquemasRequeridos_() {
  return [
    { hoja: 'Walmart',            cols: ['SKU', 'ESTATUS', 'CATEGORIA', 'NOMBRE', 'PRECIO', 'GTIN', 'UPC', 'INV NORMAL', 'WFS', 'ES WFS'] },
    { hoja: 'Catalogo',           cols: ['SKU', 'REFERENCIA', 'NOMBRE', 'CATEGORIA'] },
    { hoja: 'Inventario Actual',  cols: ['SKU', 'Producto', 'Libre'] },
    { hoja: 'Killers',            cols: ['SKU', 'CUPON', 'TERMINA'], vaciaOk: true },
    { hoja: '_Marcas',            cols: ['PREFIJO', 'MARCA'] },
    { hoja: '_Colores',           cols: ['CODIGO', 'COLOR'], opcional: true },
    { hoja: '_Marcas Excepciones', cols: ['PREFIJO', 'SI EL NOMBRE TRAE', 'MARCA'], opcional: true }
  ].concat(['Precios EM Minimo', 'Precios EM Normal', 'Precios EM Maximo',
            'Precios CVA Minimo', 'Precios CVA Normal', 'Precios CVA Maximo'].map(function (n) {
    return { hoja: n, cols: ['SKU', 'Walmart Clásica', 'Walmart Premium'], opcional: true };
  }));
}

/**
 * Revisa todos los esquemas. Devuelve la lista de problemas (vacia = todo bien).
 * No truena: deja un ERROR por hoja en el Log.
 */
function revisarEsquemas_(ss) {
  ss = ss || SpreadsheetApp.getActive();
  var problemas = [];
  esquemasRequeridos_().forEach(function (e) {
    var h = ss.getSheetByName(e.hoja);
    if (!h) {
      if (!e.opcional) problemas.push('No existe la hoja "' + e.hoja + '"');
      return;
    }
    if (h.getLastRow() < 1) { if (!e.vaciaOk && !e.opcional) problemas.push('La hoja "' + e.hoja + '" esta vacia'); return; }
    var enc = h.getRange(1, 1, 1, Math.max(1, h.getLastColumn())).getValues()[0];
    var hay = {};
    enc.forEach(function (x) { hay[normEnc_(x)] = true; });
    var faltan = e.cols.filter(function (c) { return !hay[normEnc_(c)]; });
    if (faltan.length) problemas.push('Hoja "' + e.hoja + '": falta ' + faltan.join(', '));
  });

  problemas.forEach(function (p) { try { logErr_('COLUMNAS', p); } catch (x) {} });
  try { flushLog_(); } catch (x) {}
  return problemas;
}

/** Menu: revisar que todas las hojas traigan sus columnas. */
function revisarColumnas() {
  var p = revisarEsquemas_(SpreadsheetApp.getActive());
  var msg = p.length ? 'Problemas:\n\n  ' + p.join('\n  ') :
                       'Todas las hojas fuente traen las columnas que necesitan.';
  try { alertLog_(SpreadsheetApp.getUi(), 'Columnas', msg, SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) { Logger.log(msg); }
  return msg;
}

/* ---------------- Filas ---------------- */

/**
 * Concentrado e Inventarios son ARRAYFORMULA sobre un numero fijo de filas.
 * Si la fuente crece mas que eso, las filas de abajo quedarian fuera sin
 * avisar. Esto agrega filas (nunca quita) para que siempre quepa todo.
 */
function asegurarFilas_(nombreHoja, filasFuente) {
  try {
    var h = SpreadsheetApp.getActive().getSheetByName(nombreHoja);
    if (!h || h.getLastRow() < 1) return;
    var quiero = filasFuente + 20;
    if (h.getMaxRows() < quiero) {
      h.insertRowsAfter(h.getMaxRows(), quiero - h.getMaxRows() + 30);
      logInfo_('COLUMNAS', 'Se agregaron filas a "' + nombreHoja + '" para que quepan ' + filasFuente + ' renglones');
    }
  } catch (e) { console.log('asegurarFilas_: ' + e.message); }
}

/* ---------------- Blindaje de encabezados de las hojas que escribe el script ---------------- */

/**
 * Cada hoja que el script escribe con reescribirHoja_ deja en Script Properties (ESCR_COLS|hoja)
 * la lista de encabezados que genera. Con eso, una revision revisa TODAS esas hojas sin lista aparte:
 *   - REPETIDO : un encabezado del script aparece dos veces (la lectura toma la primera).
 *   - FALTA    : un encabezado del script ya no esta (se crea al final en la siguiente escritura).
 *   - COPIA    : una columna SIN encabezado repite los datos de una del script (copia vieja, desfasada).
 *   - HUERFANA : una columna sin encabezado con datos.
 * Corre cada hora dentro de ventasProgramado (modulo 'encabezados') y desde el menu. No borra ni mueve nada:
 * deja ERROR/WARN en el Log (etapa ENCABEZADOS, que Salud ya cuenta) y una nota en la celda del encabezado vacio.
 */
var ENC_ETAPA = 'ENCABEZADOS', ENC_MUESTRA = 60, ENC_TOPE_MS = 90000;

/** Problemas de UNA hoja. esperados = encabezados normalizados. Devuelve [{tipo, col, texto}]. */
function encRevisarHoja_(h, esperados, fe) {
  var out = [], lc = h.getLastColumn(), lr = h.getLastRow();
  if (lc < 1 || lr < fe) return out;
  var nf = Math.min(ENC_MUESTRA, lr - fe + 1);
  var v = h.getRange(fe, 1, nf, lc).getValues();
  var hdr = v[0], pos = {}, dup = {};
  hdr.forEach(function (x, i) {
    var k = normEnc_(x);
    if (!k) return;
    if (pos[k] === undefined) pos[k] = i; else dup[k] = (dup[k] || 1) + 1;
  });
  esperados.forEach(function (k) {
    if (dup[k]) out.push({ tipo: 'REPETIDO', texto: 'encabezado repetido "' + k + '" (' + dup[k] + ' columnas): la lectura toma la primera' });
    else if (pos[k] === undefined) out.push({ tipo: 'FALTA', texto: 'falta el encabezado "' + k + '" (se crea al final en la siguiente escritura)' });
  });
  for (var c = 0; c < lc; c++) {
    if (normEnc_(hdr[c])) continue;
    var vals = {}, n = 0;
    for (var r = 1; r < nf; r++) { var x = v[r][c]; if (x !== '' && x !== null) { vals[String(x)] = 1; n++; } }
    if (!n) continue;
    var copia = '';
    esperados.some(function (k) {
      var j = pos[k];
      if (j === undefined) return false;
      var comunes = 0, total = 0;
      for (var r2 = 1; r2 < nf; r2++) { var y = v[r2][j]; if (y !== '' && y !== null) { total++; if (vals[String(y)]) comunes++; } }
      if (total && comunes / total >= 0.5) { copia = String(hdr[j]); return true; }
      return false;
    });
    out.push({ tipo: copia ? 'COPIA' : 'HUERFANA', col: c + 1,
      texto: 'columna ' + colLetra_(c + 1) + ' sin encabezado y con datos' + (copia ? ' (copia vieja de "' + copia + '": sus filas pueden estar desfasadas)' : '') });
  }
  return out;
}

/** Revisa todas las hojas que el script escribe. opts.forzar = escribe al Log aunque no haya cambiado nada. */
function revisarEncabezadosSalida_(opts) {
  opts = opts || {};
  var t0 = Date.now(), ss = SpreadsheetApp.getActive(), todas = {}, hojas = 0, probs = [], notas = [];
  try { todas = props_().getProperties(); } catch (e) {}
  Object.keys(todas).forEach(function (key) {
    if (key.indexOf('ESCR_COLS|') !== 0 || Date.now() - t0 > ENC_TOPE_MS) return;
    var p = key.split('|'), h = ss.getSheetByName(p[1]);
    if (!h) return;
    var esp = [];
    try { esp = JSON.parse(todas[key] || '[]'); } catch (e) { return; }
    if (!esp.length) return;
    // Encabezados que se acortaron (VD_RENOMBRAR): la lista guardada puede traer el nombre viejo de una hoja que solo se escribe
    // una vez al mes. Se pasa al nombre nuevo (y se guarda asi) para no dar falsa alarma de "falta el encabezado".
    try {
      var ren = typeof VD_RENOMBRAR !== 'undefined' ? VD_RENOMBRAR[p[1]] : null;
      if (ren) {
        var nuevo = {}, cambio = false;
        Object.keys(ren).forEach(function (v) { nuevo[normEnc_(v)] = normEnc_(ren[v]); });
        esp = esp.map(function (k) { if (nuevo[k]) { cambio = true; return nuevo[k]; } return k; });
        if (cambio) props_().setProperty(key, JSON.stringify(esp));
      }
    } catch (eR) {}
    var fe = Number(p[2]) > 1 ? Number(p[2]) : 1;
    hojas++;
    encRevisarHoja_(h, esp, fe).forEach(function (x) {
      probs.push({ hoja: p[1], tipo: x.tipo, col: x.col || 0, texto: x.texto });
      if (x.col) notas.push({ h: h, fe: fe, col: x.col, texto: x.texto });
    });
  });
  notas.forEach(function (n) {
    try { var c = n.h.getRange(n.fe, n.col); if (!c.getNote()) c.setNote('⚠ ' + n.texto + '. Si es vieja, borra la columna.'); } catch (e) {}
  });
  var graves = probs.filter(function (x) { return x.tipo !== 'HUERFANA'; });
  var sig = probs.map(function (x) { return x.hoja + '|' + x.tipo + '|' + x.col; }).sort().join(';');
  var ultSig = '', ultTs = 0;
  try { ultSig = props_().getProperty('ENC_SIG') || ''; ultTs = Number(props_().getProperty('ENC_TS') || 0); } catch (e) {}
  var resumen = probs.map(function (x) { return x.hoja + ': ' + x.texto; });
  if (!probs.length) {
    logOk_(ENC_ETAPA, 'Encabezados bien en ' + hojas + ' hojas del script', { hojas: hojas, ms: Date.now() - t0 });
    try { props_().setProperty('ENC_SIG', ''); } catch (e) {}
  } else if (opts.forzar || sig !== ultSig || Date.now() - ultTs > 6 * 3600 * 1000) {
    (graves.length ? logErr_ : logWarn_)(ENC_ETAPA, 'Encabezados: ' + probs.length + ' problema(s). ' + resumen.slice(0, 3).join(' | ') + (resumen.length > 3 ? ' ...' : ''), { hojas: hojas, problemas: probs.slice(0, 30) });
    try { props_().setProperty('ENC_SIG', sig); props_().setProperty('ENC_TS', String(Date.now())); } catch (e) {}
  }
  try { flushLog_(); } catch (e) {}
  return { hojas: hojas, problemas: probs, resumen: resumen };
}

/** Modulo horario (dentro de ventasProgramado). Nunca truena la corrida. */
function encProgramado_() {
  try { revisarEncabezadosSalida_(); } catch (e) { try { logWarn_(ENC_ETAPA, 'No pude revisar encabezados: ' + e.message); } catch (x) {} }
}

/** Menu: revisar encabezados de todas las hojas que escribe el script. */
function revisarEncabezados() {
  var r = revisarEncabezadosSalida_({ forzar: true });
  var msg = r.problemas.length
    ? 'Problemas en las hojas del script (' + r.hojas + ' revisadas):\n\n  ' + r.resumen.join('\n  ') + '\n\nNo se borró ni se movió nada. Revisa esas hojas; si una columna sin encabezado es vieja, bórrala y corre la actualización de esa hoja.'
    : 'Encabezados bien en las ' + r.hojas + ' hojas que escribe el script.';
  try { alertLog_(SpreadsheetApp.getUi(), 'Encabezados', msg, SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) { Logger.log(msg); }
  return msg;
}
