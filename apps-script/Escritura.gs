/**
 * ============================================================
 *  Escritura — reescribir hojas del script SIN tocar lo tuyo
 * ============================================================
 *
 * REGLA DEL PROYECTO: en las hojas que el script reescribe puedes agregar
 * columnas (a la derecha o en medio), moverlas, ponerles formato, notas,
 * validaciones o formatos condicionales, y la siguiente corrida NO las borra
 * ni las pisa. Por eso toda hoja de salida se escribe con reescribirHoja_:
 *
 *   - cada columna del script se ubica por el NOMBRE de su encabezado, donde
 *     este (normEnc_ de Columnas.gs: sin acentos, mayusculas, espacios simples);
 *   - si falta, se crea AL FINAL (despues de la ultima columna con algo,
 *     tenga encabezado o no), nunca en medio ni encima de una tuya;
 *   - se ESCRIBE primero y se limpia el sobrante despues: si el setValues
 *     truena a medias, la hoja no queda vacia;
 *   - solo se limpian (clearContent) las filas sobrantes de SUS columnas;
 *     nunca clear() de la hoja, nunca deleteColumns(), nunca columnas ajenas;
 *   - una tabla nueva SIN datos no vacia la hoja, salvo que el que llama diga
 *     que vacia es un resultado valido (opts.vacioOk);
 *   - las columnas que el script escribia antes y ya no genera se VACIAN (no
 *     se borran): se recuerdan por encabezado en una Script Property.
 *
 * Basado en escribirPorEncabezado_ (skill del proyecto, Venta Diaria Odoo).
 */

/** Script Property donde se recuerdan las columnas que el script escribio en una hoja. */
function escrClave_(h, fe) { return 'ESCR_COLS|' + h.getName() + (fe > 1 ? '|' + fe : ''); }

function escrProp_(k) { try { return props_().getProperty(k) || ''; } catch (e) { return ''; } }
function escrSetProp_(k, v) { try { props_().setProperty(k, v); } catch (e) {} }

/** Encabezados vacios o repetidos reciben un nombre unico para no encimarse. */
function escrUnicos_(enc) {
  var vistos = {};
  return (enc || []).map(function (h, i) {
    var t = String(h === null || h === undefined ? '' : h).trim() || ('COLUMNA ' + (i + 1));
    var k = normEnc_(t);
    if (vistos[k]) { vistos[k]++; t = t + ' (' + vistos[k] + ')'; } else vistos[k] = 1;
    return t;
  });
}

/**
 * Ubica las columnas `enc` en la fila de encabezado `fe` (1 por defecto) y crea
 * al final las que falten (solo escribe SU encabezado). No toca datos.
 * Devuelve { enc, pos:[n 1-based por enc], col:{NORM:n}, nuevas:[n], fe }.
 */
function ubicarColumnas_(h, enc, fe, estilo) {
  fe = fe || 1;
  enc = escrUnicos_(enc);
  var lc = Math.max(h.getLastColumn(), 1);
  var hdr = h.getRange(fe, 1, 1, lc).getValues()[0];
  var col = {}, finEnc = 0;
  for (var i = 0; i < hdr.length; i++) {
    var k = normEnc_(hdr[i]);
    if (k) { if (col[k] === undefined) col[k] = i + 1; finEnc = i + 1; }
  }
  var faltan = enc.filter(function (x) { return col[normEnc_(x)] === undefined; });
  var fin = finEnc;
  if (faltan.length && h.getLastColumn() > finEnc && h.getLastRow() >= fe) {
    // Columnas tuyas sin encabezado a la derecha: lo nuevo va despues de ellas.
    var ancho = h.getLastColumn() - finEnc;
    var bloque = h.getRange(fe, finEnc + 1, h.getLastRow() - fe + 1, ancho).getValues();
    bloque.forEach(function (r) {
      for (var j = r.length - 1; j >= 0; j--) {
        if (r[j] !== '' && r[j] !== null) { fin = Math.max(fin, finEnc + j + 1); break; }
      }
    });
  }
  var nuevas = [];
  faltan.forEach(function (x) { fin++; col[normEnc_(x)] = fin; nuevas.push(fin); });
  if (nuevas.length) {
    if (h.getMaxColumns() < fin) h.insertColumnsAfter(h.getMaxColumns(), fin - h.getMaxColumns());
    nuevas.forEach(function (c, i) {
      var cel = h.getRange(fe, c);
      cel.setValue(faltan[i]);
      if (estilo === undefined || estilo === null) cel.setFontWeight('bold');   // false = sin formato
    });
  }
  var pos = enc.map(function (x) { return col[normEnc_(x)]; });
  return { enc: enc, pos: pos, col: col, nuevas: nuevas, fe: fe, tramos: escrTramos_(pos) };
}

/** Tramos de columnas contiguas: [{ini, fin, js:[indices de enc]}]. */
function escrTramos_(pos) {
  var orden = pos.map(function (c, j) { return { c: c, j: j }; })
                 .sort(function (a, b) { return a.c - b.c; });
  var tramos = [], t = null;
  orden.forEach(function (o) {
    if (t && o.c === t.fin + 1) { t.fin = o.c; t.js.push(o.j); }
    else { t = { ini: o.c, fin: o.c, js: [o.j] }; tramos.push(t); }
  });
  return tramos;
}

/**
 * Reescribe en `h` la tabla del script: `enc` (encabezados) y `filas` (cada una
 * en el orden de `enc`). Devuelve el mapa de ubicarColumnas_ + { filaDatos, n,
 * omitida }. Si `filas` viene vacia y no hay opts.vacioOk, no toca los datos.
 *
 * opts:
 *   filaEnc      fila del encabezado (1)
 *   vacioOk      true = una tabla sin filas es valida y vacia los datos del script
 *   texto        lista de encabezados (o RegExp) que van como texto '@' ANTES de escribir
 *   formatos     { ENCABEZADO: 'formato' } en las filas de datos, DESPUES de escribir
 *   estiloEnc    { negrita, fondo, color, centro } para SUS celdas de encabezado
 *   validaciones true = en las filas sobrantes tambien se quitan validaciones (checkbox, listas)
 *   fondos       true = en las filas sobrantes tambien se quita el color de fondo
 *   filasMin     se quitan las filas vacias del final por encima de este numero
 *                (solo filas sin nada en ninguna columna, tuyas incluidas)
 *   clave        Script Property para recordar las columnas (por defecto ESCR_COLS|hoja)
 */
function reescribirHoja_(h, enc, filas, opts) {
  opts = opts || {};
  opts.estiloEnc = escrEstiloFamilia_(h, opts.estiloEnc);   // gris claro de fabrica -> color de la familia de la hoja (Ordenar)
  filas = filas || [];
  var fe = opts.filaEnc || 1, ini = fe + 1, nf = filas.length;

  if (!nf && !opts.vacioOk) {
    var m0 = ubicarColumnas_(h, enc, fe, opts.estiloEnc);
    try { avisoDia_('escr-vacia:' + h.getName(), 'WARN', 'ESCRITURA', 'La hoja "' + h.getName() + '" no se toco: llego una tabla sin datos.'); } catch (e) {}
    m0.filaDatos = ini; m0.n = 0; m0.omitida = true;
    return m0;
  }

  var m = ubicarColumnas_(h, enc, fe, opts.estiloEnc);
  var n0 = Math.max(h.getLastRow(), fe);

  // Columnas que el script escribia antes y ya no genera: se vacian, no se borran.
  var clave = opts.clave || escrClave_(h, fe);
  var ahoraK = m.enc.map(normEnc_), viejas = [];
  try { viejas = JSON.parse(escrProp_(clave) || '[]'); } catch (e) { viejas = []; }
  try { escrAvisarDesaparecidas_(h, m, viejas); } catch (e) {}
  var sobrantes = [];
  viejas.forEach(function (k) {
    if (ahoraK.indexOf(k) < 0 && m.col[k] !== undefined) sobrantes.push(m.col[k]);
  });

  var tope = ini + nf - 1;
  if (h.getMaxRows() < tope) h.insertRowsAfter(h.getMaxRows(), tope - h.getMaxRows());

  // Texto ANTES de escribir: sin '@' un codigo pierde sus ceros a la izquierda.
  if (nf && opts.texto) {
    m.enc.forEach(function (x, j) {
      var es = (opts.texto instanceof RegExp) ? opts.texto.test(String(x))
                                              : opts.texto.some(function (t) { return normEnc_(t) === normEnc_(x); });
      if (es) h.getRange(ini, m.pos[j], nf, 1).setNumberFormat('@');
    });
  }

  // 1) escribir
  if (nf) {
    m.tramos.forEach(function (tr) {
      var datos = filas.map(function (f) { return tr.js.map(function (j) { var v = f[j]; return v === undefined || v === null ? '' : v; }); });
      h.getRange(ini, tr.ini, nf, tr.fin - tr.ini + 1).setValues(datos);
    });
  }

  // 2) limpiar lo que sobra, SOLO en las columnas del script
  var desde = ini + nf, cuantas = n0 - desde + 1;
  if (cuantas > 0) {
    m.tramos.forEach(function (tr) {
      var r = h.getRange(desde, tr.ini, cuantas, tr.fin - tr.ini + 1);
      r.clearContent();
      if (opts.validaciones) r.clearDataValidations();
      if (opts.fondos) r.setBackground(null);
    });
  }
  if (n0 >= ini) {
    sobrantes.forEach(function (c) { h.getRange(ini, c, n0 - ini + 1, 1).clearContent(); });
  }
  escrSetProp_(clave, JSON.stringify(ahoraK));

  if (nf && opts.formatos) escrFormatos_(h, m, opts.formatos, nf, ini);
  if (opts.estiloEnc) escrEstilo_(escrRangos_(h, m, fe, 1), opts.estiloEnc);
  if (opts.filasMin) escrRecortarFilas_(h, Math.max(opts.filasMin, tope));

  m.filaDatos = ini; m.n = nf; m.omitida = false;
  return m;
}

/** Un encabezado que el script ya escribia antes y hubo que crear otra vez al final: alguien lo borro, renombro o dejo vacio, y puede quedar una columna vieja sin encabezado. */
function escrAvisarDesaparecidas_(h, m, viejas) {
  var fue = [];
  m.enc.forEach(function (x, j) {
    if ((m.nuevas || []).indexOf(m.pos[j]) >= 0 && viejas.indexOf(normEnc_(x)) >= 0) fue.push(x);
  });
  if (!fue.length) return;
  logErr_('ENCABEZADOS', 'Hoja "' + h.getName() + '": el encabezado ' + fue.map(function (x) { return '"' + x + '"'; }).join(', ') + ' ya no estaba (borrado, renombrado o vacio). Se creo de nuevo AL FINAL: revisa si quedo una columna vieja sin encabezado.', { hoja: h.getName(), columnas: fue });
}

/** Columna (1-based) de un encabezado en el mapa; 0 si no es del script. */
function escrCol_(m, enc) { return m.col[normEnc_(enc)] || 0; }

/** Letra de la columna de un encabezado del mapa (para formulas y formatos condicionales). */
function escrLetra_(m, enc) {
  var c = escrCol_(m, enc);
  if (!c) throw new Error('No hay columna "' + enc + '" en la hoja');
  return colLetra_(c);
}

/** Rango de datos de UNA columna del script, por encabezado. null si no esta. */
function escrRango_(h, m, enc, n, fila) {
  var c = escrCol_(m, enc);
  if (!c || !(n > 0)) return null;
  return h.getRange(fila || m.filaDatos || (m.fe + 1), c, n, 1);
}

/** Rangos (uno por tramo contiguo) de las columnas del script en esas filas. */
function escrRangos_(h, m, fila, n) {
  if (!(n > 0)) return [];
  return m.tramos.map(function (tr) { return h.getRange(fila, tr.ini, n, tr.fin - tr.ini + 1); });
}

/** { ENCABEZADO: formato } sobre las filas de datos de esas columnas. */
function escrFormatos_(h, m, formatos, n, fila) {
  Object.keys(formatos).forEach(function (enc) {
    var r = escrRango_(h, m, enc, n, fila);
    if (r) r.setNumberFormat(formatos[enc]);
  });
}

/** Estilo de encabezado sobre una lista de rangos. */
function escrEstilo_(rangos, e) {
  rangos.forEach(function (r) {
    if (e.negrita !== false) r.setFontWeight('bold');
    if (e.fondo) r.setBackground(e.fondo);
    // Sin color explicito, el texto se elige por contraste con el fondo (letra blanca sobre
    // fondo claro dejaba el encabezado invisible: Killers bajo minimo).
    var col = e.color || (e.fondo ? escrContraste_(e.fondo) : null);
    if (col) r.setFontColor(col);
    if (e.centro) r.setHorizontalAlignment('center');
  });
}

/**
 * El estilo de encabezado de fabrica de muchas hojas era gris casi blanco (#eef2f7): se veian "sin formato"
 * y le ganaban al color que Ordenar da a cada familia. Si llega ese gris, se cambia por el color de la
 * familia de la hoja (hoja registrada en ORG_HOJAS; Parrilla X = KILLERS). Cualquier otro estilo se respeta.
 */
function escrEstiloFamilia_(h, est) {
  if (!est || String(est.fondo || '').toLowerCase() !== '#eef2f7') return est;
  try {
    var n = h.getName(), g = null;
    ORG_HOJAS.forEach(function (f) { if (f[0] === n) g = f[1]; });   // col-fija: f es una fila del registro ORG_HOJAS (nombre, grupo, ...), no una hoja
    if (!g && /^Parrilla\s+\S/.test(n)) g = 'KILLERS';
    var c = g && ORG_GRUPOS[g] && g !== 'OCULTAS' ? ORG_GRUPOS[g].color : null;
    if (!c) return est;
    var o = {}; Object.keys(est).forEach(function (k) { o[k] = est[k]; });
    o.fondo = c; return o;
  } catch (e) { return est; }
}

/** Color de letra legible (oscuro o blanco) para un fondo '#rrggbb'. */
function escrContraste_(fondo) {
  var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(fondo || ''));
  if (!m) return null;
  var lum = (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255;
  return lum > 0.6 ? '#202124' : '#FFFFFF';
}

/** Ajusta el ancho de las columnas del script (no las tuyas). */
function escrAutoAncho_(h, m) {
  m.tramos.forEach(function (tr) { h.autoResizeColumns(tr.ini, tr.fin - tr.ini + 1); });
}

/** Ancho tope de una columna del script, por encabezado. */
function escrAnchoMax_(h, m, enc, max) {
  var c = escrCol_(m, enc);
  if (c && h.getColumnWidth(c) > max) h.setColumnWidth(c, max);
}

/**
 * Ultima fila con algo en columnas que NO son del script (0 si no hay).
 * Sirve para hojas con ARRAYFORMULA, donde getLastRow() no dice nada.
 */
function escrUltimaFilaAjena_(h, m) {
  var lc = h.getLastColumn(), lr = h.getLastRow();
  if (lc < 1 || lr < 1) return 0;
  var propias = {};
  m.pos.forEach(function (c) { propias[c] = true; });
  var ult = 0, c = 1;
  while (c <= lc) {
    if (propias[c]) { c++; continue; }
    var a = c;
    while (c + 1 <= lc && !propias[c + 1]) c++;
    var v = h.getRange(1, a, lr, c - a + 1).getValues();
    for (var i = v.length - 1; i >= ult; i--) {
      if (v[i].some(function (x) { return x !== '' && x !== null; })) { ult = Math.max(ult, i + 1); break; }
    }
    c++;
  }
  return ult;
}

/**
 * Quita filas vacias del final, nunca por debajo de `minimo` ni filas con algo.
 * Con `m` (hojas de ARRAYFORMULA): solo cuentan tus columnas, porque la salida
 * de la formula llena todas las filas de las del script.
 */
function escrRecortarFilas_(h, minimo, m) {
  var lr = m ? escrUltimaFilaAjena_(h, m) : h.getLastRow(), keep = Math.max(minimo, lr, 2);
  var max = h.getMaxRows();
  if (max > keep) h.deleteRows(keep + 1, max - keep);
  else if (max < minimo) h.insertRowsAfter(max, minimo - max);
}

/**
 * Antes de escribir desde la fila `ini` hasta `ini + n - 1`: si la hoja no tiene tantas filas, las agrega.
 * Ordenar recorta las filas vacias del final (cada hoja crece solo con lo que trae), asi que TODO lo que
 * agrega renglones con getRange(getLastRow() + 1, ...) pasa por aqui; sin esto Sheets truena con
 * "las coordenadas estan fuera de la hoja".
 */
function escrAsegurarFilas_(h, ini, n) {
  var tope = ini + Math.max(n || 1, 1) - 1;
  if (h.getMaxRows() < tope) h.insertRowsAfter(h.getMaxRows(), tope - h.getMaxRows());
}

/**
 * Filtro sobre toda la tabla (encabezado en `fe`). Si ya habia uno, se rehace
 * del tamano actual (por si crecieron las filas o columnas) conservando tus
 * criterios por columna; Sheets no reaplica un filtro solo cuando cambian datos.
 */
function escrFiltro_(h, fe) {
  fe = fe || 1;
  var ur = Math.max(h.getLastRow(), fe + 1), uc = Math.max(h.getLastColumn(), 1);
  var crit = {};
  try {
    var f = h.getFilter();
    if (f) {
      var r = f.getRange();
      for (var c = r.getColumn(); c <= r.getLastColumn(); c++) {
        var k = f.getColumnFilterCriteria(c);
        if (k) crit[c] = k;
      }
      f.remove();
    }
  } catch (e) {}
  try {
    var nuevo = h.getRange(fe, 1, ur - fe + 1, uc).createFilter();
    Object.keys(crit).forEach(function (c) {
      if (Number(c) <= uc) { try { nuevo.setColumnFilterCriteria(Number(c), crit[c]); } catch (e) {} }
    });
    return nuevo;
  } catch (e) { return null; }
}

/**
 * Formatos condicionales del script SIN borrar los tuyos: se quitan solo las
 * reglas que el script puso la vez pasada (se recuerdan por su condicion) y
 * se agregan las nuevas. Tus reglas se quedan.
 */
function escrReglas_(h, nuevas, clave) {
  var k = 'ESCR_CF|' + (clave || h.getName());
  var firma = function (r) {
    try {
      var b = r.getBooleanCondition();
      return b ? String(b.getCriteriaType()) + '|' + JSON.stringify(b.getCriteriaValues()) : '';
    } catch (e) { return ''; }
  };
  var antes = [];
  try { antes = JSON.parse(escrProp_(k) || '[]'); } catch (e) { antes = []; }
  var mias = nuevas.map(firma);
  var quitar = antes.concat(mias);
  var ajenas = h.getConditionalFormatRules().filter(function (r) {
    var f = firma(r);
    return !f || quitar.indexOf(f) < 0;
  });
  h.setConditionalFormatRules(ajenas.concat(nuevas));
  escrSetProp_(k, JSON.stringify(mias));
}

/** Posiciones (1-based) de varios encabezados en la fila `fe` de la hoja, por nombre. 0 si falta. */
function escrPosDe_(h, encs, fe) {
  var lc = Math.max(h.getLastColumn(), 1);
  var hdr = h.getRange(fe || 1, 1, 1, lc).getValues()[0].map(normEnc_);
  return encs.map(function (e) { return hdr.indexOf(normEnc_(e)) + 1; });
}

/**
 * Mapa (como el de reescribirHoja_) de columnas que YA estan en la hoja, por
 * encabezado. Para dar formato despues de escribirTabla_ sin depender de la
 * posicion. Los encabezados que no aparezcan se omiten.
 */
function escrMapaHoja_(h, encs, fe) {
  fe = fe || 1;
  var p = escrPosDe_(h, encs, fe), col = {}, pos = [], enc = [];
  encs.forEach(function (e, i) { if (p[i]) { col[normEnc_(e)] = p[i]; pos.push(p[i]); enc.push(e); } });
  return { enc: enc, pos: pos, col: col, fe: fe, filaDatos: fe + 1, tramos: escrTramos_(pos), todas: p };
}

/* ---------------- Guardas y notas de "sin datos" ---------------- */

/**
 * Guarda de lista parcial (misma regla que killers): si la hoja ya tiene >= 10 filas y
 * llega menos de la mitad, NO se escribe y se avisa 1 vez al dia. true = no escribir.
 * La bajada a mano desde el menu (forzar) no pasa por aqui: asi se acepta una baja real.
 */
function guardaParcial_(etapa, hoja, nuevas, actuales) {
  if (actuales >= 10 && nuevas < actuales * 0.5) {
    avisoDia_('parcial:' + hoja, 'WARN', etapa, 'Llegaron ' + nuevas + ' filas y la hoja "' + hoja + '" tiene ' + actuales +
              ': se ignora la lista (parcial) y se reintenta en la siguiente corrida. Si la baja es real, bajala a mano desde el menu.');
    return true;
  }
  return false;
}

/** Filas de datos de una hoja por nombre (0 si no existe). */
function escrFilasHoja_(nombre) {
  var h = SpreadsheetApp.getActive().getSheetByName(nombre);
  return h ? Math.max(0, h.getLastRow() - 1) : 0;
}

/** Nota en la primera celda de encabezado del script: "Sin datos (fecha): motivo". texto '' la quita. */
function escrNotaSinDatos_(h, m, texto) {
  try {
    var c = (m && m.pos && m.pos[0]) || 1, fe = (m && m.fe) || 1, cel = h.getRange(fe, c);
    if (texto) cel.setNote('Sin datos (' + ahora_() + '): ' + texto);
    else if (/^Sin datos \(/.test(cel.getNote())) cel.setNote('');     // solo quita SU nota, no las tuyas
  } catch (e) {}
}
