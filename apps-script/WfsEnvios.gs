/**
 * ============================================================
 *  WfsEnvios — nuevo envio (hoja "ENVIO N") y archivar envios (traspaso de WFS 1.0 v3.8)
 * ============================================================
 *  Copiado tal cual de code.gs de WFS 1.0. Solo cambia: los nombres llevan el prefijo wfs (para
 *  no chocar con el resto de este libro), el resumen va al Log y el candado es el del libro.
 *  El dialogo del nuevo envio llama a wfsDatosNuevoEnvio() y wfsCrearEnvio().
 * ============================================================
 */

// ============================================================
// ARCHIVAR ENVIOS  —  limpieza del libro (30/09/2026)
//
// Junta todas las hojas "ENVIO N" en historicos y arma los
// catalogos de choferes y camionetas. Luego borra las originales.
//
// LO QUE HAY QUE ENTENDER DEL BLOQUE E:I DE LAS HOJAS ENVIO:
// son DOS LISTAS INDEPENDIENTES puestas una al lado de la otra,
// igual que en Listas!I:K (choferes) y Listas!M:N (camionetas):
//   - CHOFER / CURP / CONTACTO  = quienes van ese dia
//   - PLACAS / CAMIONETA        = que unidades se usan ese dia
// NO es "un chofer = una camioneta". Pueden ir 2 choferes en una
// unidad, 1 en cada una, 2 en dos y 1 en otra, etc. Por eso una
// fila puede traer chofer sin placas o placas sin chofer.
// TODOS los que aparecen son choferes; no hay acompanantes.
//
// La PRIMERA fila del bloque no es un chofer: es la cabecera del
// envio (razon social | seller | TRANSPORTISTA | correo del QR).
//
// Layouts (se mapean POR ENCABEZADO, nunca por letra):
//   Tipo A (ENVIO 5..19) · Tipo B (ENVIO 2,3,4) · Tipo C (ENVIO 1)
//
// NO borra nada si la consolidacion no cuadra con lo leido.
// ============================================================

const WFS_ARCH_ENC       = ['ENVIO', 'ID ENVIO', 'FECHA CITA', 'HORA', 'DELIVERY', 'FOLIO ODOO',
  'SKU', 'SKU BASE', 'GTIN', 'CATEGORIA', 'NOMBRE', 'UNIDADES'];
const WFS_ARCH_ENC_CHOF  = ['ENVIO', 'CHOFER', 'CURP', 'CONTACTO'];
const WFS_ARCH_ENC_CAM   = ['ENVIO', 'PLACAS', 'COLOR', 'TIPO'];
const WFS_CAT_ENC_CHOF   = ['CHOFER', 'CURP', 'CONTACTO', 'VECES', 'ULTIMO ENVIO'];
const WFS_CAT_ENC_CAM    = ['PLACAS', 'COLOR', 'TIPO', 'VECES', 'ULTIMO ENVIO'];

function wfsArchivarEnvios() {
  const ui = SpreadsheetApp.getUi();
  const c = WFS_CONFIG;
  const ss = SpreadsheetApp.getActive();
  const hojas = ss.getSheets().filter(function (sh) { return /^ENVIO\s/i.test(sh.getName()); });

  if (!hojas.length) {
    ui.alert('No hay hojas que empiecen con "ENVIO ". Nada que archivar.');
    return;
  }

  const resp = ui.alert(
    'Archivar envíos y limpiar',
    'Se van a juntar ' + hojas.length + ' hojas de envío en:\n' +
    '  • ' + c.HOJA_HIST + '  (una fila por SKU)\n' +
    '  • ' + c.HOJA_HIST_CHOF + '  ·  ' + c.HOJA_HIST_CAM + '\n' +
    '  • ' + c.HOJA_CAT_CHOF + '  ·  ' + c.HOJA_CAT_CAM + '  (para elegir en el próximo envío)\n\n' +
    'Después se BORRAN las hojas originales. Esto no se puede deshacer.\n' +
    'Si algo no cuadra, no se borra nada.\n\n¿Continuar?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) { ui.alert('WFS', WFS_OCUPADO, ui.ButtonSet.OK); return; }
  try {
    const res = wfsArchivar_(ss, hojas);
    wfsLogResumen_('OK', res);
    ui.alert('✅ Archivado', res, ui.ButtonSet.OK);
  } catch (e) {
    const msg = 'ERROR: ' + e.message;
    wfsLogResumen_('ERROR', msg + '\n' + (e.stack || ''));
    ui.alert('❌ No se archivó nada', msg, ui.ButtonSet.OK);
  } finally {
    flushLog_();
    lock.releaseLock();
  }
}

function wfsNumEnvio_(nom) {
  const m = /^ENVIO\s+(\d+)/i.exec(nom);
  return m ? Number(m[1]) : 9999;
}

function wfsArchivar_(ss, hojas) {
  logStart_('ARCHIVO', 'Archivar ' + hojas.length + ' hojas de envío');
  const t0 = Date.now();
  const c = WFS_CONFIG;
  const detalle = [], choferes = [], camionetas = [];
  const lineas = [];

  // De menor a mayor: asi el ultimo envio es el que manda en los catalogos
  hojas.sort(function (a, b) { return wfsNumEnvio_(a.getName()) - wfsNumEnvio_(b.getName()); });

  hojas.forEach(function (sh) {
    const d = wfsLeerHojaEnvio_(sh);
    d.detalle.forEach(function (r) { detalle.push(r); });
    d.choferes.forEach(function (r) { choferes.push(r); });
    d.camionetas.forEach(function (r) { camionetas.push(r); });
  });

  if (!detalle.length) throw new Error('No encontré ninguna línea de SKU en las hojas de envío.');

  // Lo que YA estaba archivado se conserva: se escribe lo de antes + lo nuevo.
  // (WFS 1.0 reescribia los historicos solo con las hojas de esta vez: sirvio para la primera
  // consolidacion, pero un segundo archivado habria borrado los envios anteriores y los catalogos.)
  const previo = wfsLeerArchivo_(ss, c.HOJA_HIST, WFS_ARCH_ENC);
  const yaArchivadas = {};
  previo.forEach(function (r) { yaArchivadas[String(r[0]).trim().toUpperCase()] = true; });
  const repetidas = hojas.filter(function (sh) { return yaArchivadas[sh.getName().trim().toUpperCase()]; })
    .map(function (sh) { return sh.getName(); });
  if (repetidas.length) {
    throw new Error('Estas hojas ya están en ' + c.HOJA_HIST + ': ' + repetidas.join(', ') +
      '. Si las archivo otra vez quedarían repetidas. No borré nada.');
  }
  const nuevas = detalle.length;
  previo.forEach(function (r, i) { detalle.splice(i, 0, r); });
  wfsLeerArchivo_(ss, c.HOJA_HIST_CHOF, WFS_ARCH_ENC_CHOF).forEach(function (r, i) { choferes.splice(i, 0, r); });
  wfsLeerArchivo_(ss, c.HOJA_HIST_CAM, WFS_ARCH_ENC_CAM).forEach(function (r, i) { camionetas.splice(i, 0, r); });

  // La columna del GTIN se saca de WFS_ARCH_ENC por nombre: va como texto
  // para no perder los ceros de la izquierda.
  wfsEscribirArchivo_(ss, c.HOJA_HIST, WFS_ARCH_ENC, detalle, wfsIdxEnc_(WFS_ARCH_ENC, 'GTIN'));
  wfsEscribirArchivo_(ss, c.HOJA_HIST_CHOF, WFS_ARCH_ENC_CHOF, choferes, 0);
  wfsEscribirArchivo_(ss, c.HOJA_HIST_CAM, WFS_ARCH_ENC_CAM, camionetas, 0);

  // Lo que escribiste a mano en los catalogos y todavia no sale en ningun envio se conserva (va al final).
  const juntar = function (nuevo, nombre, enc) {
    const ya = {};
    nuevo.forEach(function (r) { ya[String(r[0]).trim().toUpperCase()] = true; });
    wfsLeerArchivo_(ss, nombre, enc).forEach(function (r) {
      const k = String(r[0] || '').trim().toUpperCase();
      if (k && !ya[k]) { nuevo.push(r); ya[k] = true; }
    });
    return nuevo;
  };
  const catChof = juntar(wfsCatalogo_(choferes, 1, [2, 3]), c.HOJA_CAT_CHOF, WFS_CAT_ENC_CHOF);   // clave = CHOFER, datos = CURP, CONTACTO
  const catCam = juntar(wfsCatalogo_(camionetas, 1, [2, 3]), c.HOJA_CAT_CAM, WFS_CAT_ENC_CAM);    // clave = PLACAS, datos = COLOR, TIPO
  wfsEscribirArchivo_(ss, c.HOJA_CAT_CHOF, WFS_CAT_ENC_CHOF, catChof, 0);
  wfsEscribirArchivo_(ss, c.HOJA_CAT_CAM, WFS_CAT_ENC_CAM, catCam, 0);

  // ── Verificacion antes de borrar ──────────────────────────
  const hist = ss.getSheetByName(c.HOJA_HIST);
  const escritas = hist.getLastRow() - 1;
  if (escritas !== detalle.length) {
    throw new Error('La hoja ' + c.HOJA_HIST + ' quedó con ' + escritas +
      ' filas y esperaba ' + detalle.length + '. No borré nada.');
  }

  let piezas = 0;
  detalle.slice(detalle.length - nuevas).forEach(function (r) { piezas += Number(r[11]) || 0; });   // col-fija: fila armada aqui en el orden de WFS_ARCH_ENC

  lineas.push('• ' + hojas.length + ' hojas de envío leídas');
  lineas.push('• ' + c.HOJA_HIST + ': +' + nuevas + ' líneas · ' + piezas + ' piezas (total archivado: ' + detalle.length + ')');
  lineas.push('• ' + c.HOJA_HIST_CHOF + ': ' + choferes.length + ' · ' +
    c.HOJA_HIST_CAM + ': ' + camionetas.length);
  lineas.push('• ' + c.HOJA_CAT_CHOF + ': ' + catChof.length + ' choferes · ' +
    c.HOJA_CAT_CAM + ': ' + catCam.length + ' camionetas');

  let sinGtin = 0;
  detalle.slice(detalle.length - nuevas).forEach(function (r) { if (!r[8]) sinGtin++; });   // col-fija: fila armada aqui en el orden de WFS_ARCH_ENC
  if (sinGtin) lineas.push('⚠ ' + sinGtin + ' líneas sin GTIN (no se podrían subir a Walmart)');

  hojas.forEach(function (sh) { ss.deleteSheet(sh); });
  lineas.push('• Hojas borradas: ' + hojas.length);
  lineas.push('⏱ ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s · v' + c.VERSION);
  return lineas.join('\n');
}

// Lee lo que ya esta en una hoja de archivo, en el orden de `encabezados` (por nombre de columna).
function wfsLeerArchivo_(ss, nombre, encabezados) {
  const sh = ss.getSheetByName(nombre);
  if (!sh || sh.getLastRow() < 2) return [];
  const m = colsHoja_(sh, encabezados);
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues()
    .filter(function (r) { return r.some(function (v) { return v !== '' && v !== null; }); })
    .map(function (r) { return encabezados.map(function (e) { return r[m[e]]; }); });
}

// Arma un catalogo unico: ultima aparicion gana, y cuenta en cuantos envios salio
function wfsCatalogo_(filas, ixClave, ixDatos) {
  const mapa = {}, veces = {}, orden = [];
  filas.forEach(function (r) {
    const k = String(r[ixClave]).toUpperCase();
    if (!k) return;
    if (!(k in mapa)) orden.push(k);
    veces[k] = (veces[k] || 0) + 1;
    const fila = [r[ixClave]];
    ixDatos.forEach(function (i) { fila.push(r[i]); });
    fila.push(r[0]);               // ultimo envio donde aparecio
    mapa[k] = fila;                // el ultimo sobreescribe
  });
  return orden
    .map(function (k) {
      const f = mapa[k].slice();
      const ult = f.pop();
      f.push(veces[k]);
      f.push(ult);
      return f;
    })
    .sort(function (a, b) { return b[b.length - 2] - a[a.length - 2]; });
}

// Lee UNA hoja ENVIO mapeando por encabezado de la fila 1
function wfsLeerHojaEnvio_(sh) {
  const nom = sh.getName();
  const nCols = Math.max(sh.getLastColumn(), 1);
  const enc = sh.getRange(1, 1, 1, nCols).getDisplayValues()[0]
    .map(function (v) { return String(v || '').toUpperCase().replace(/[^A-Z ]/g, '').trim(); });

  const col = function (nombre, desde) {
    for (let i = (desde || 0); i < enc.length; i++) if (enc[i] === nombre) return i + 1;
    return 0;
  };
  const colContiene = function (txt) {
    for (let i = 0; i < enc.length; i++) if (enc[i].indexOf(txt) >= 0) return i + 1;
    return 0;
  };

  // Cabecera: el valor vive en la fila 2 de esa columna
  const v2 = function (cc) { return cc ? sh.getRange(2, cc).getDisplayValue() : ''; };
  const esEnvioFinal = enc[0] && (enc[0].indexOf('ENVO FINAL') >= 0 || enc[0].indexOf('ENVIO FINAL') >= 0);
  const cab = {
    id: v2(colContiene('ID ENVIO')),
    hora: v2(col('HORA')),
    fecha: v2(col('FECHA')),
    delivery: v2(col('DELIVERY')),
    folio: esEnvioFinal ? sh.getRange(2, 1).getDisplayValue() : '',
  };

  // ── Detalle (SKU del detalle: a la derecha del separador) ──
  const cSku = col('SKU', 9) || col('SKU MSI', 9) || col('SKU');
  const cAut = col('AUTORIZADO');
  const cUni = col('UNIDADES');
  const cCat = col('CATEGORIA');
  const cNom = col('NOMBRE');
  let cGtin = col('GTIN') || col('GTIN FINAL');
  if (!cGtin && cAut) cGtin = cAut + 1;   // tipo A: esa columna no tiene encabezado

  const detalle = [];
  const last = sh.getLastRow();
  if (cSku && last > 1) {
    // Primero solo la columna del SKU, para no leer 18,000 filas de ancho completo
    const skus = sh.getRange(2, cSku, last - 1, 1).getDisplayValues();
    let ultima = -1;
    for (let i = 0; i < skus.length; i++) if (String(skus[i][0]).trim()) ultima = i;
    if (ultima >= 0) {
      const ancho = Math.max(cSku, cAut, cUni, cCat, cNom, cGtin);
      const data = sh.getRange(2, 1, ultima + 1, ancho).getDisplayValues();
      const g = function (row, cc) { return cc && cc <= row.length ? String(row[cc - 1]).trim() : ''; };
      data.forEach(function (row) {
        const sku = g(row, cSku);
        if (!sku) return;
        const uni = g(row, cAut) || g(row, cUni);
        detalle.push([nom, cab.id, cab.fecha, cab.hora, cab.delivery, cab.folio,
          sku, sku.replace(WFS_RE_MSI, ''), g(row, cGtin), g(row, cCat), g(row, cNom),
          uni === '' ? '' : Number(uni.replace(/,/g, '')) || 0]);
      });
    }
  }

  // ── Choferes y camionetas: DOS listas independientes ───────
  const choferes = [], camionetas = [];
  const cChof = col('CHOFER'), cCur = col('CURP'), cCon = col('CONTACTO'),
    cPla = col('PLACAS'), cCam = col('CAMIONETA');
  if ((cChof || cPla) && last > 1) {
    const anchoC = Math.max(cChof, cCur, cCon, cPla, cCam);
    const dc = sh.getRange(2, 1, Math.min(last - 1, 60), anchoC).getDisplayValues();
    const g = function (row, cc) { return cc && cc <= row.length ? String(row[cc - 1]).trim() : ''; };
    dc.forEach(function (row) {
      const nombre = wfsLimpia_(g(row, cChof));
      const curp = wfsLimpia_(g(row, cCur));
      const tipo = wfsLimpia_(g(row, cCam));
      const placas = wfsLimpia_(g(row, cPla));

      // Cabecera del envio: correo en el CURP, o tipo = TRANSPORTISTA, o la razon social
      const esCab = curp.indexOf('@') >= 0 || tipo.toUpperCase() === 'TRANSPORTISTA' ||
        nombre.toUpperCase().indexOf('PROMOTORA RESTREPO') >= 0 ||
        placas.toUpperCase() === 'ELECTRONICS.MEXICO';

      if (!esCab && nombre) choferes.push([nom, nombre, curp, g(row, cCon)]);
      if (!esCab && placas) {
        // "C80AFV BLANCO" → placas + color
        const p = placas.split(/\s+/);
        camionetas.push([nom, p[0], p.slice(1).join(' '), tipo]);
      }
    });
  }

  return { detalle: detalle, choferes: choferes, camionetas: camionetas };
}

function wfsLimpia_(v) {
  return String(v || '').replace(/,\s*$/, '').replace(/\s+/g, ' ').trim();
}

// Crea/reescribe una hoja de archivo. colTexto = columna (1-based en `encabezados`) que va como texto '@' (0 = ninguna).
// Se escribe POR ENCABEZADO (Escritura.gs): si le agregas columnas o formatos a la hoja, se respetan;
// solo se reescriben las columnas del archivo. (WFS 1.0 hacia sh.clear() de toda la hoja.)
function wfsEscribirArchivo_(ss, nombre, encabezados, filas, colTexto) {
  let sh = ss.getSheetByName(nombre);
  if (!sh) sh = ss.insertSheet(nombre);
  const alto = filas.length + 1;
  if (sh.getMaxRows() < alto) sh.insertRowsAfter(sh.getMaxRows(), alto - sh.getMaxRows());
  reescribirHoja_(sh, encabezados, filas, { vacioOk: true, texto: colTexto ? [encabezados[colTexto - 1]] : null });
  sh.setFrozenRows(1);
}

// ============================================================
// NUEVO ENVIO  —  arma la hoja "ENVIO N" del envio en curso
//
// De donde sale cada cosa:
//   detalle   → bloque ENVIO FINAL de la hoja WFS.
//               Si la columna AUTORIZADO trae numeros, manda esa;
//               si esta vacia, usa UNIDADES (la propuesta).
//   choferes  → los que marques del CATALOGO CHOFERES
//   camionetas→ las que marques del CATALOGO CAMIONETAS
//   cabecera  → razon social / seller / correo, fijos
//
// ID ENVIO y DELIVERY se dejan VACIOS: los da Walmart despues.
// Layout: el mismo de las hojas ENVIO 13..19 (16 columnas), porque
// esa hoja se comparte con el personal que autoriza.
//
// Choferes (E,H,I) y camionetas (F,G) son DOS LISTAS independientes:
// no se empareja un chofer con una unidad.
// ============================================================

const WFS_ENV_ENC = ['🎉 ID ENVIO', 'HORA', 'FECHA', 'DELIVERY', 'CHOFER', 'PLACAS',
  'CAMIONETA', 'CURP', 'CONTACTO', '', 'CATEGORIA', 'NOMBRE', 'SKU', 'AUTORIZADO', '', 'SKU'];

function wfsNuevoEnvio() {
  const html = HtmlService.createHtmlOutput(wfsHtmlNuevoEnvio_())
    .setWidth(620).setHeight(640);
  SpreadsheetApp.getUi().showModalDialog(html, 'Nuevo envío a WFS');
}

// Lo que necesita el dialogo (lo llama el HTML)
function wfsDatosNuevoEnvio() {
  const ss = SpreadsheetApp.getActive();
  const prop = wfsLeerEnvioFinal_(ss);
  return {
    choferes: wfsLeerCatalogoEnvio_(ss, WFS_CONFIG.HOJA_CAT_CHOF),
    camionetas: wfsLeerCatalogoEnvio_(ss, WFS_CONFIG.HOJA_CAT_CAM),
    skus: prop.filas.length,
    piezas: prop.piezas,
    fuente: prop.fuente,
    sinGtin: prop.sinGtin,
    siguiente: wfsSiguienteEnvio_(ss),
  };
}

function wfsLeerCatalogoEnvio_(ss, nombre) {
  const sh = ss.getSheetByName(nombre);
  if (!sh || sh.getLastRow() < 2) return [];
  const n = sh.getLastColumn();
  return sh.getRange(2, 1, sh.getLastRow() - 1, n).getDisplayValues()
    .filter(function (r) { return String(r[0]).trim(); })
    .map(function (r) {
      return { a: r[0], b: r[1] || '', c: r[2] || '', veces: r[3] || '', ultimo: r[4] || '' };   // col-fija: catalogo que escribe este script (WFS_CAT_ENC_*)
    });
}

// Lee el bloque ENVIO FINAL: SKU + unidades + GTIN + categoria + nombre
function wfsLeerEnvioFinal_(ss) {
  const c = WFS_CONFIG;
  const sh = ss.getSheetByName(c.HOJA);
  if (!sh) throw new Error("No existe la hoja '" + c.HOJA + "'");
  const enc = wfsEnc_(sh, 1);

  // El bloque empieza en el marcador "ENVIO FINAL" (con o sin acento)
  const ini = wfsBuscarCol_(enc, 'ENVIO FINAL', { contiene: true });
  if (!ini) {
    throw new Error("En la hoja '" + c.HOJA + "' no encuentro el marcador 'ENVÍO FINAL' en la fila 1.");
  }
  const fin = wfsFinBloque_(enc, ini, wfsMarcadores_());

  const col = function (nombre) {
    return wfsBuscarCol_(enc, nombre, { desde: ini, hasta: fin });
  };
  const cSku = wfsExigirCol_(enc, 'SKU', c.HOJA, { desde: ini, hasta: fin });
  const cUni = col('UNIDADES'), cAut = col('AUTORIZADO');
  const cGtin = col('GTIN'), cCat = col('CATEGORIA'), cNom = col('NOMBRE');
  if (!cUni && !cAut) {
    throw new Error('El bloque ENVÍO FINAL no trae ni UNIDADES ni AUTORIZADO: no sé qué cantidad mandar.');
  }
  logInfo_('COLUMNAS', 'ENVÍO FINAL ubicado', {
    bloque: colLetra_(ini) + ':' + colLetra_(fin),
    sku: colLetra_(cSku), unidades: cUni ? colLetra_(cUni) : '-',
    autorizado: cAut ? colLetra_(cAut) : '-', gtin: cGtin ? colLetra_(cGtin) : '-',
  });

  const last = sh.getLastRow();
  const ancho = Math.max(cSku, cUni, cAut, cGtin, cCat, cNom);
  const data = sh.getRange(2, 1, last - 1, ancho).getDisplayValues();
  const g = function (row, cc) { return cc ? String(row[cc - 1] || '').trim() : ''; };
  const num = function (t) { return Number(String(t).replace(/,/g, '')) || 0; };

  // ¿Hay algo escrito en AUTORIZADO? Entonces esa manda.
  let hayAut = false;
  data.forEach(function (row) { if (g(row, cSku) && num(g(row, cAut)) > 0) hayAut = true; });
  const cCant = hayAut ? cAut : cUni;

  const filas = [];
  let piezas = 0, sinGtin = 0;
  data.forEach(function (row) {
    const sku = g(row, cSku);
    if (!sku) return;
    const q = num(g(row, cCant));
    if (q <= 0) return;
    const gtin = g(row, cGtin);
    if (!gtin) sinGtin++;
    piezas += q;
    filas.push({ sku: sku, cant: q, gtin: gtin, cat: g(row, cCat), nom: g(row, cNom) });
  });
  filas.sort(function (a, b) { return b.cant - a.cant; });
  return {
    filas: filas, piezas: piezas, sinGtin: sinGtin,
    fuente: hayAut ? 'AUTORIZADO' : 'UNIDADES (la propuesta)',
  };
}

// El numero que sigue, mirando las hojas ENVIO y el HISTORICO
function wfsSiguienteEnvio_(ss) {
  let max = 0;
  ss.getSheets().forEach(function (sh) {
    const m = /^ENVIO\s+(\d+)/i.exec(sh.getName());
    if (m) max = Math.max(max, Number(m[1]));
  });
  const h = ss.getSheetByName(WFS_CONFIG.HOJA_HIST);
  if (h && h.getLastRow() > 1) {
    h.getRange(2, 1, h.getLastRow() - 1, 1).getDisplayValues().forEach(function (r) {
      const m = /^ENVIO\s+(\d+)/i.exec(String(r[0]));
      if (m) max = Math.max(max, Number(m[1]));
    });
  }
  return max + 1;
}

// Lo llama el dialogo al dar "Crear hoja"
function wfsCrearEnvio(opts) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) throw new Error(WFS_OCUPADO);
  try {
    const res = wfsCrearHojaEnvio_(opts);
    wfsLogResumen_('OK', res);
    return res;
  } catch (e) {
    wfsLogResumen_('ERROR', 'Nuevo envío: ' + e.message + '\n' + (e.stack || ''));
    throw e;
  } finally {
    flushLog_();
    lock.releaseLock();
  }
}

function wfsCrearHojaEnvio_(opts) {
  logStart_('ENVIO', 'Crear hoja del envío', opts);
  const t0 = Date.now();
  const c = WFS_CONFIG;
  const ss = SpreadsheetApp.getActive();

  const choferes = opts.choferes || [];
  const camionetas = opts.camionetas || [];
  if (!choferes.length) throw new Error('No elegiste ningún chofer.');
  if (!camionetas.length) throw new Error('No elegiste ninguna camioneta.');

  const prop = wfsLeerEnvioFinal_(ss);
  if (!prop.filas.length) throw new Error('El bloque ENVÍO FINAL no tiene nada con unidades.');

  const num = opts.numero || wfsSiguienteEnvio_(ss);
  const nombre = 'ENVIO ' + num + ' ' + (opts.etiqueta || '');
  if (ss.getSheetByName(nombre.trim())) throw new Error('Ya existe la hoja "' + nombre.trim() + '".');

  // ── Donde va cada cosa: se saca de WFS_ENV_ENC por nombre ──
  // Esta hoja la crea el script, asi que WFS_ENV_ENC es su contrato. Si un
  // dia se reordena o se le mete una columna, todo lo de abajo se mueve
  // solo; antes estaba a mano (col 5, col 8, col 11...) y reordenar el
  // arreglo dejaba los CURP escritos en la columna de las placas.
  const NC = WFS_ENV_ENC.length;
  const P = {
    hora: wfsIdxEnc_(WFS_ENV_ENC, 'HORA'),
    fecha: wfsIdxEnc_(WFS_ENV_ENC, 'FECHA'),
    chofer: wfsIdxEnc_(WFS_ENV_ENC, 'CHOFER'),
    placas: wfsIdxEnc_(WFS_ENV_ENC, 'PLACAS'),
    camioneta: wfsIdxEnc_(WFS_ENV_ENC, 'CAMIONETA'),
    curp: wfsIdxEnc_(WFS_ENV_ENC, 'CURP'),
    contacto: wfsIdxEnc_(WFS_ENV_ENC, 'CONTACTO'),
    categoria: wfsIdxEnc_(WFS_ENV_ENC, 'CATEGORIA'),
    nombre: wfsIdxEnc_(WFS_ENV_ENC, 'NOMBRE'),
    sku: wfsIdxEnc_(WFS_ENV_ENC, 'SKU', 1),
    autorizado: wfsIdxEnc_(WFS_ENV_ENC, 'AUTORIZADO'),
    skuBase: wfsIdxEnc_(WFS_ENV_ENC, 'SKU', 2),
  };
  // El GTIN es la columna sin encabezado que va junto a AUTORIZADO
  // (asi nacieron las hojas ENVIO 13..19 y asi las lee el personal).
  P.gtin = P.autorizado + 1;

  const filas = Math.max(prop.filas.length, choferes.length + 1, camionetas.length + 1) + 1;
  const sh = ss.insertSheet(nombre.trim(), 0);
  if (sh.getMaxRows() < filas) sh.insertRowsAfter(sh.getMaxRows(), filas - sh.getMaxRows());
  if (sh.getMaxColumns() < NC) sh.insertColumnsAfter(sh.getMaxColumns(), NC - sh.getMaxColumns());

  // ── Encabezado ──
  sh.getRange(1, 1, 1, NC).setValues([WFS_ENV_ENC]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange(1, P.gtin, sh.getMaxRows(), 1).setNumberFormat('@');   // GTIN como texto
  sh.getRange(1, P.fecha, sh.getMaxRows(), 1).setNumberFormat('dd/MM/yyyy');
  sh.getRange(1, P.hora, sh.getMaxRows(), 1).setNumberFormat('HH:mm');

  // ── Cabecera del envio: ID y DELIVERY vacios, los da Walmart ──
  if (opts.fecha) sh.getRange(2, P.fecha).setValue(new Date(opts.fecha + 'T12:00:00'));
  if (opts.hora) sh.getRange(2, P.hora).setValue(opts.hora);
  sh.getRange(2, P.chofer).setValue(c.RAZON_SOCIAL);
  sh.getRange(2, P.placas).setValue(c.SELLER);
  sh.getRange(2, P.camioneta).setValue('TRANSPORTISTA');
  sh.getRange(2, P.curp).setValue(c.CORREO_QR);

  // ── Choferes y camionetas: DOS listas independientes ──
  choferes.forEach(function (x, i) {
    sh.getRange(3 + i, P.chofer).setValue(x.nombre);
    sh.getRange(3 + i, P.curp).setValue(x.curp);
    sh.getRange(3 + i, P.contacto).setValue(x.contacto);
  });
  camionetas.forEach(function (x, i) {
    sh.getRange(3 + i, P.placas).setValue((x.placas + ' ' + (x.color || '')).trim());
    sh.getRange(3 + i, P.camioneta).setValue(x.tipo || '');
  });

  // ── Detalle: va en bloque, de CATEGORIA a SKU BASE ──
  const det = prop.filas.map(function (f) {
    const r = new Array(P.skuBase - P.categoria + 1).fill('');
    r[P.categoria - P.categoria] = f.cat;
    r[P.nombre - P.categoria] = f.nom;
    r[P.sku - P.categoria] = f.sku;
    r[P.autorizado - P.categoria] = f.cant;
    r[P.gtin - P.categoria] = f.gtin;
    r[P.skuBase - P.categoria] = f.sku.replace(WFS_RE_MSI, '');
    return r;
  });
  sh.getRange(2, P.categoria, det.length, P.skuBase - P.categoria + 1).setValues(det);

  sh.setColumnWidth(P.chofer, 240); sh.setColumnWidth(P.nombre, 300);
  sh.setColumnWidth(P.sku, 240); sh.setColumnWidth(P.gtin, 150);
  sh.setColumnWidth(P.skuBase, 220);
  logInfo_('COLUMNAS', 'Hoja del envío escrita según WFS_ENV_ENC', P);

  const lineas = [];
  lineas.push('• Hoja creada: ' + nombre.trim());
  lineas.push('• Detalle: ' + prop.filas.length + ' SKUs · ' + prop.piezas + ' piezas (de ' + prop.fuente + ')');
  lineas.push('• Choferes: ' + choferes.length + ' · Camionetas: ' + camionetas.length);
  if (prop.sinGtin) {
    lineas.push('⚠ ' + prop.sinGtin + ' SKU sin GTIN: esos NO se pueden subir a Walmart.');
  }
  lineas.push('• ID ENVIO y DELIVERY quedan vacíos: los da Walmart.');
  lineas.push('⏱ ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s · v' + c.VERSION);
  return lineas.join('\n');
}

// ------------------------------------------------------------
// El dialogo
// ------------------------------------------------------------
function wfsHtmlNuevoEnvio_() {
  return '' +
'<!DOCTYPE html><html><head><base target="_top"><meta charset="utf-8">' +
'<style>' +
'body{font:13px/1.45 Roboto,Arial,sans-serif;margin:0;padding:14px 16px;color:#1f2328}' +
'h3{margin:0 0 2px;font-size:15px}' +
'.sub{color:#59636e;margin:0 0 12px}' +
'.row{display:flex;gap:16px}.col{flex:1;min-width:0}' +
'fieldset{border:1px solid #d8dee4;border-radius:6px;padding:8px 10px;margin:0 0 12px}' +
'legend{font-weight:600;color:#1f94f9;padding:0 4px}' +
'label.it{display:block;padding:3px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
'label.it span.m{color:#59636e;font-size:11px}' +
'.f{display:flex;gap:10px;align-items:flex-end;margin-bottom:10px}' +
'.f div{display:flex;flex-direction:column}' +
'.f label{font-size:11px;color:#59636e;margin-bottom:2px}' +
'input[type=text],input[type=date],input[type=time]{border:1px solid #d8dee4;border-radius:4px;padding:5px 6px;font:13px Roboto,Arial}' +
'button{background:#1f94f9;color:#fff;border:0;border-radius:5px;padding:8px 18px;font:600 13px Roboto,Arial;cursor:pointer}' +
'button:disabled{background:#9fc9f0;cursor:default}' +
'#res{white-space:pre-wrap;margin-top:10px;padding:8px;border-radius:5px;display:none}' +
'.ok{background:#e8f5e9;color:#1b5e20}.err{background:#fdecea;color:#b3261e}' +
'.warn{color:#b3261e;font-weight:600}' +
'</style></head><body>' +
'<h3>Nuevo envío a WFS</h3><p class="sub" id="resumen">Cargando…</p>' +
'<div class="f">' +
'<div><label>N° de envío</label><input type="text" id="num" size="4"></div>' +
'<div><label>Fecha de la cita</label><input type="date" id="fecha"></div>' +
'<div><label>Hora</label><input type="time" id="hora" value="08:00"></div>' +
'</div>' +
'<div class="row">' +
'<div class="col"><fieldset><legend>¿Quiénes van?</legend><div id="chof"></div></fieldset></div>' +
'<div class="col"><fieldset><legend>¿Qué camionetas?</legend><div id="cam"></div></fieldset></div>' +
'</div>' +
'<button id="btn" onclick="crear()" disabled>Crear hoja del envío</button>' +
'<div id="res"></div>' +
'<script>' +
'var D=null;' +
'function esc(t){return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");}' +
'google.script.run.withSuccessHandler(pinta).withFailureHandler(function(e){muestra("err",e.message);}).wfsDatosNuevoEnvio();' +
'function pinta(d){D=d;' +
' document.getElementById("num").value=d.siguiente;' +
' var s="Detalle: "+d.skus+" SKUs · "+d.piezas+" piezas, tomadas de "+d.fuente+".";' +
' if(d.sinGtin) s+=\' <span class="warn">\'+d.sinGtin+" sin GTIN.</span>";' +
' document.getElementById("resumen").innerHTML=s;' +
' var h="";d.choferes.forEach(function(x,i){h+=\'<label class="it"><input type="checkbox" class="ch" data-i="\'+i+\'"> \'+esc(x.a)+\' <span class="m">(\'+esc(x.veces)+")</span></label>";});' +
' document.getElementById("chof").innerHTML=h||"(catálogo vacío)";' +
' var g="";d.camionetas.forEach(function(x,i){g+=\'<label class="it"><input type="checkbox" class="cm" data-i="\'+i+\'"> \'+esc(x.a)+" "+esc(x.b)+\' <span class="m">\'+esc(x.c)+"</span></label>";});' +
' document.getElementById("cam").innerHTML=g||"(catálogo vacío)";' +
' document.getElementById("btn").disabled=false;}' +
'function marcados(cls,arr,map){var o=[];var n=document.querySelectorAll("."+cls);' +
' for(var i=0;i<n.length;i++){if(n[i].checked){o.push(map(arr[+n[i].getAttribute("data-i")]));}}return o;}' +
'function crear(){' +
' var ch=marcados("ch",D.choferes,function(x){return {nombre:x.a,curp:x.b,contacto:x.c};});' +
' var cm=marcados("cm",D.camionetas,function(x){return {placas:x.a,color:x.b,tipo:x.c};});' +
' if(!ch.length){muestra("err","Marca al menos un chofer.");return;}' +
' if(!cm.length){muestra("err","Marca al menos una camioneta.");return;}' +
' var f=document.getElementById("fecha").value;' +
' if(!f){muestra("err","Pon la fecha de la cita.");return;}' +
' var et=f.split("-");var etiqueta=et[2]+"/"+et[1]+"/"+et[0].slice(2);' +
' document.getElementById("btn").disabled=true;muestra("ok","Creando…");' +
' google.script.run.withSuccessHandler(function(r){muestra("ok",r);})' +
'  .withFailureHandler(function(e){document.getElementById("btn").disabled=false;muestra("err",e.message);})' +
'  .wfsCrearEnvio({numero:document.getElementById("num").value,etiqueta:etiqueta,fecha:f,hora:document.getElementById("hora").value,choferes:ch,camionetas:cm});}' +
'function muestra(cls,t){var r=document.getElementById("res");r.className=cls;r.style.display="block";r.textContent=t;}' +
'</script></body></html>';
}
