/**
 * ============================================================
 *  Cruce EDI vs Bloqueados — para depurar Walmart
 * ============================================================
 *
 *  Cruza la hoja "Walmart EDI" (todo lo que el site tiene en Walmart,
 *  asignado o no) con "Walmart" (lo que NO esta bloqueado) y "Bloqueados"
 *  (lo que bloqueas en el dashboard), y arma la hoja "Cruce EDI" con UNA
 *  FILA POR SKU DE WALMART y un DIAGNOSTICO:
 *
 *    ASIGNAR            sin asignar y sin bloquear, pero hay un SKU parecido en Odoo
 *    BLOQUEAR           sin asignar y sin bloquear, y sin relacion con Odoo
 *    DESBLOQUEAR?       bloqueado, asignado y con stock en Odoo
 *    BLOQUEADO PERO HAY SKU PARECIDO EN ODOO
 *    FUERA DEL DASHBOARD / ASIGNADO PERO FUERA DEL DASHBOARD
 *    SOLO EN DASHBOARD  esta en Walmart/Bloqueados pero ya no en EDI
 *    BLOQUEADO CON ASIGNACION (SIN STOCK)
 *    OK / OK: BLOQUEADO SIN RELACION   (no requieren accion)
 *
 *  Lo accionable queda arriba. El script NO bloquea ni asigna nada: solo
 *  recomienda; tu decides y lo anotas en DECISION y NOTAS.
 *
 *  COLUMNAS: el script escribe de la A a la N (CRU_COLS). DECISION y NOTAS
 *  las llenas tu y SIGUEN AL SKU aunque la hoja se reordene. Lo que agregues
 *  a la DERECHA de la N no se toca (pero no sigue al SKU: usa DECISION/NOTAS).
 *  Las columnas se buscan por ENCABEZADO en las hojas fuente (Columnas.gs).
 *
 *  "SKU parecido": mismo prefijo de marca y modelo (las 2 primeras partes del
 *  SKU) en el Catalogo de Odoo. Es una pista, no una certeza: se revisa a mano.
 */

var CRU_HOJA  = 'Cruce EDI';
var CRU_ETAPA = 'CRUCE';
var CRU_COLS  = ['SKU WALMART', 'PRODUCTO', 'ESTATUS', 'ASIGNADO EDI', 'BLOQUEADO', 'SKU ODOO',
                 'STOCK ODOO', 'STOCK WALMART', 'PRECIO WALMART', 'SKU ODOO SUGERIDO',
                 'DIAGNOSTICO', 'ACCION SUGERIDA', 'DECISION', 'NOTAS'];

/** Orden en que aparecen los diagnosticos: lo accionable primero. */
var CRU_ORDEN = [
  'ASIGNAR', 'BLOQUEAR', 'DESBLOQUEAR?', 'BLOQUEADO PERO HAY SKU', 'FUERA DEL DASHBOARD',
  'ASIGNADO PERO FUERA', 'SOLO EN DASHBOARD', 'BLOQUEADO CON ASIGNACION', 'OK: BLOQUEADO', 'OK'
];

function cruzarEdiBloqueados() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_ESPERA_MS)) {
    toast_('Otra bajada en curso. Intenta en un minuto.', 'CRUCE EDI', 8);
    return { estado: 'ocupado' };
  }
  var tIni = Date.now();
  try {
    toast_('Cruzando Walmart EDI contra Bloqueados...', 'CRUCE EDI', 30);
    logStart_(CRU_ETAPA, 'Cruce EDI vs Bloqueados');
    var ss = getSpreadsheet_();

    var tEdi = cruLeer_(ss, EDI_HOJA, ['SKU Walmart', 'Producto', 'Estatus', 'Asignado', 'SKU Odoo',
                                       'Stock Walmart', 'Stock Odoo', 'Precio Walmart']);
    if (!tEdi.filas.length) {
      throw new Error('La hoja "' + EDI_HOJA + '" esta vacia. Primero: menu Walmart > Bajar lista Walmart EDI.');
    }
    var tBlq = cruLeer_(ss, 'Bloqueados', ['SKU'], ['NOMBRE', 'ESTATUS', 'PRECIO']);
    var tWm  = cruLeer_(ss, 'Walmart', ['SKU'], ['NOMBRE', 'ESTATUS', 'PRECIO']);
    var tCat = cruLeer_(ss, 'Catalogo', ['SKU', 'NOMBRE']);
    var tInv = cruLeer_(ss, 'Inventario Actual', ['SKU', 'Libre']);

    if (!tBlq.filas.length && !tWm.filas.length) {
      logWarn_(CRU_ETAPA, 'Walmart y Bloqueados estan vacias: todo saldra FUERA DEL DASHBOARD.');
    }

    var s = cruTxt_;
    var libre = {};
    tInv.filas.forEach(function (f) { libre[s(f[tInv.c['SKU']])] = Number(f[tInv.c['Libre']]) || 0; });

    // Catalogo de Odoo indexado por marca-modelo (2 primeras partes del SKU).
    var porLlave = {};
    tCat.filas.forEach(function (f) {
      var k = cruLlave_(s(f[tCat.c['SKU']]));
      if (!k) return;
      (porLlave[k] = porLlave[k] || []).push(s(f[tCat.c['SKU']]));
    });

    var enBlq = {}, enWm = {}, datosDash = {};
    tBlq.filas.forEach(function (f) {
      var k = s(f[tBlq.c['SKU']]); if (!k) return;
      enBlq[k] = true;
      datosDash[k] = cruDash_(f, tBlq);
    });
    tWm.filas.forEach(function (f) {
      var k = s(f[tWm.c['SKU']]); if (!k) return;
      enWm[k] = true;
      if (!datosDash[k]) datosDash[k] = cruDash_(f, tWm);
    });

    var vistos = {};
    var salida = [];

    tEdi.filas.forEach(function (f) {
      var sku = s(f[tEdi.c['SKU Walmart']]); if (!sku) return;
      vistos[sku] = true;
      var asig = s(f[tEdi.c['Asignado']]) === 'SI';
      var blq = !!enBlq[sku];
      var dash = blq || !!enWm[sku];
      var stockOdoo = Number(f[tEdi.c['Stock Odoo']]) || 0;
      var sug = asig ? [] : cruSugeridos_(sku, porLlave, libre);
      var d = cruDiagnostico_(asig, blq, dash, stockOdoo, sug);

      salida.push({
        orden: d.orden, sku: sku,
        fila: [sku, s(f[tEdi.c['Producto']]), s(f[tEdi.c['Estatus']]), asig ? 'SI' : 'NO',
               blq ? 'SI' : 'NO', s(f[tEdi.c['SKU Odoo']]), stockOdoo,
               Number(f[tEdi.c['Stock Walmart']]) || 0, f[tEdi.c['Precio Walmart']],
               sug.length ? sug.join(' | ') : '', d.texto, d.accion, '', '']
      });
    });

    // Estan en el dashboard pero ya no en EDI.
    Object.keys(datosDash).forEach(function (sku) {
      if (vistos[sku]) return;
      var x = datosDash[sku];
      salida.push({
        orden: CRU_ORDEN.indexOf('SOLO EN DASHBOARD'), sku: sku,
        fila: [sku, x.nombre, x.estatus, '', enBlq[sku] ? 'SI' : 'NO', '', '', '', x.precio, '',
               'SOLO EN DASHBOARD: YA NO ESTA EN EDI',
               'Revisar si es una baja o si falta bajar la lista EDI', '', '']
      });
    });

    salida.sort(function (a, b) {
      return a.orden !== b.orden ? a.orden - b.orden : (a.sku < b.sku ? -1 : (a.sku > b.sku ? 1 : 0));
    });

    var resumen = cruEscribir_(ss, salida.map(function (x) { return x.fila; }));

    logFinish_(CRU_ETAPA, 'Cruce EDI vs Bloqueados listo', {
      filas: salida.length, resumen: resumen, ms: Date.now() - tIni
    });
    flushLog_();
    toast_(salida.length + ' filas en "' + CRU_HOJA + '"', 'CRUCE EDI', 8);

    try {
      var lin = Object.keys(resumen).sort(function (a, b) { return resumen[b] - resumen[a]; })
        .map(function (k) { return resumen[k] + '  ' + k; });
      SpreadsheetApp.getUi().alert('Cruce EDI vs Bloqueados',
        salida.length + ' SKUs en la hoja "' + CRU_HOJA + '":\n\n' + lin.join('\n') +
        '\n\nLo accionable esta arriba. Tu decides: anota en DECISION y NOTAS.',
        SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (e) { /* trigger o sin UI */ }

    return { estado: 'listo', filas: salida.length, resumen: resumen };

  } catch (e) {
    logErr_(CRU_ETAPA, 'Fallo el cruce: ' + e.message);
    flushLog_();
    toast_(String(e.message).split('\n')[0], 'CRUCE EDI', 15);
    throw e;
  } finally {
    flushLog_();
    lock.releaseLock();
  }
}

/** Texto limpio (null/undefined = ''). */
function cruTxt_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }

/** Lee una hoja entera: { c: mapa encabezado->indice, filas: [...] } por ENCABEZADO. */
function cruLeer_(ss, nombre, requeridas, opcionales) {
  var sh = ss.getSheetByName(nombre);
  if (!sh) throw new Error('No existe la hoja "' + nombre + '".');
  var nf = sh.getLastRow(), nc = sh.getLastColumn();
  if (nf < 1 || nc < 1) return { c: {}, filas: [] };
  var datos = sh.getRange(1, 1, nf, nc).getValues();
  var c = colsDe_(datos[0], requeridas, nombre, opcionales);
  return { c: c, filas: datos.slice(1).filter(function (f) {
    return f.some(function (v) { return v !== '' && v !== null; });
  }) };
}

function cruDash_(f, t) {
  var g = function (n) { return (t.c[n] !== undefined && t.c[n] >= 0) ? f[t.c[n]] : ''; };
  return { nombre: cruTxt_(g('NOMBRE')), estatus: cruTxt_(g('ESTATUS')), precio: g('PRECIO') };
}

/** Marca-modelo de un SKU de Odoo/Walmart: 'ACE-A5175259SV-PLA-2999-MSI' -> 'ACE-A5175259SV'. */
function cruLlave_(sku) {
  var p = String(sku || '').toUpperCase().split('-');
  return p.length >= 3 ? p[0] + '-' + p[1] : '';
}

/** Hasta 3 SKUs de Odoo con la misma marca-modelo, los de mas stock primero. */
function cruSugeridos_(sku, porLlave, libre) {
  var k = cruLlave_(sku);
  if (!k || !porLlave[k]) return [];
  return porLlave[k].slice().sort(function (a, b) { return (libre[b] || 0) - (libre[a] || 0); })
    .slice(0, 3).map(function (x) { return x + ' (libre ' + (libre[x] || 0) + ')'; });
}

function cruDiagnostico_(asig, blq, dash, stockOdoo, sug) {
  var o = function (clave) { return CRU_ORDEN.indexOf(clave); };
  if (!dash) {
    return asig
      ? { orden: o('ASIGNADO PERO FUERA'), texto: 'ASIGNADO PERO FUERA DEL DASHBOARD',
          accion: 'Bajar catalogo de Walmart (forzado) y revisar por que no aparece' }
      : { orden: o('FUERA DEL DASHBOARD'), texto: 'FUERA DEL DASHBOARD',
          accion: 'Bajar catalogo de Walmart (forzado) y decidir si se bloquea' };
  }
  if (asig && blq) {
    return stockOdoo > 0
      ? { orden: o('DESBLOQUEAR?'), texto: 'DESBLOQUEAR?: BLOQUEADO CON STOCK EN ODOO',
          accion: 'Tiene asignacion y stock: desbloquear si debe venderse' }
      : { orden: o('BLOQUEADO CON ASIGNACION'), texto: 'BLOQUEADO CON ASIGNACION (SIN STOCK)',
          accion: 'Dejar bloqueado o quitar la asignacion' };
  }
  if (asig) return { orden: o('OK'), texto: 'OK', accion: '' };
  if (blq) {
    return sug.length
      ? { orden: o('BLOQUEADO PERO HAY SKU'), texto: 'BLOQUEADO PERO HAY SKU PARECIDO EN ODOO',
          accion: 'Revisar si debe asignarse y desbloquearse' }
      : { orden: o('OK: BLOQUEADO'), texto: 'OK: BLOQUEADO SIN RELACION', accion: '' };
  }
  return sug.length
    ? { orden: o('ASIGNAR'), texto: 'ASIGNAR: HAY SKU PARECIDO EN ODOO',
        accion: 'Revisar y asignar a ' + sug[0].replace(/ \(libre .*\)$/, '') }
    : { orden: o('BLOQUEAR'), texto: 'BLOQUEAR: SIN RELACION CON ODOO', accion: 'Bloquear en el dashboard' };
}

/**
 * Escribe la tabla POR ENCABEZADO conservando DECISION y NOTAS por SKU. No borra
 * columnas ni toca las tuyas (en medio o a la derecha). Devuelve el conteo por diagnostico.
 */
function cruEscribir_(ss, filas) {
  var sh = ss.getSheetByName(CRU_HOJA) || ss.insertSheet(CRU_HOJA);
  var nc = CRU_COLS.length;
  var iSku = 0, iDec = CRU_COLS.indexOf('DECISION'), iNot = CRU_COLS.indexOf('NOTAS');

  // Lo que ya habia anotado, por SKU (buscando las columnas por encabezado).
  var previo = {};
  if (sh.getLastRow() > 1 && sh.getLastColumn() > 0) {
    var datos = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    var enc = datos[0].map(normEnc_);
    var pS = enc.indexOf(normEnc_('SKU WALMART')), pD = enc.indexOf('DECISION'), pN = enc.indexOf('NOTAS');
    if (pS >= 0) {
      for (var r = 1; r < datos.length; r++) {
        var k = cruTxt_(datos[r][pS]); if (!k) continue;
        var d = pD >= 0 ? datos[r][pD] : '', n = pN >= 0 ? datos[r][pN] : '';
        if (d !== '' || n !== '') previo[k] = [d, n];
      }
    }
  }
  filas.forEach(function (f) {
    var p = previo[f[iSku]];
    if (p) { f[iDec] = p[0]; f[iNot] = p[1]; }
  });

  // POR ENCABEZADO (Escritura.gs): tus columnas (en medio o a la derecha) no se
  // borran ni se pisan. SKU como texto: un numero se come los ceros ("0637902715970").
  var m = reescribirHoja_(sh, CRU_COLS, filas, {
    vacioOk: true, fondos: true,
    texto: [CRU_COLS[iSku], 'SKU ODOO', 'SKU ODOO SUGERIDO']
  });

  // Color solo en la columna DIAGNOSTICO (rojo = bloquear, amarillo = revisar, verde = ok).
  var colores = filas.map(function (f) {
    var t = f[CRU_COLS.indexOf('DIAGNOSTICO')];
    if (/^BLOQUEAR/.test(t)) return ['#f4c7c3'];
    if (/^(ASIGNAR|DESBLOQUEAR|BLOQUEADO PERO|FUERA|ASIGNADO PERO|SOLO EN)/.test(t)) return ['#fce8b2'];
    if (/^OK/.test(t)) return ['#b7e1cd'];
    return ['#e8eaed'];
  });
  if (colores.length) escrRango_(sh, m, 'DIAGNOSTICO', colores.length).setBackgrounds(colores);

  sh.setFrozenRows(1);
  escrRangos_(sh, m, 1, 1).forEach(function (r) { r.setFontWeight('bold'); });
  escrFiltro_(sh, 1);   // se rehace del tamano actual (si crecieron las filas) y conserva tus criterios
  SpreadsheetApp.flush();

  var cuenta = {};
  filas.forEach(function (f) {
    var t = String(f[CRU_COLS.indexOf('DIAGNOSTICO')]).split(':')[0];
    cuenta[t] = (cuenta[t] || 0) + 1;
  });
  return cuenta;
}
