/**
 * ============================================================
 *  WfsHoja — la hoja WFS en este libro (traerla de Inventarios WM) y sus formulas
 * ============================================================
 *
 *  📥 Crear hoja WFS (formato de Inventarios WM) (una vez):
 *    - copia la hoja WFS de Inventarios WM tal cual (formato, colores, reglas de color y lo que tenga
 *      escrito); el siguiente calculo la deja al dia con los datos de este libro
 *    - crea AQUI, nuevos y vacios (solo encabezados), HISTORICO ENVIOS / CHOFERES / CAMIONETAS y
 *      CATALOGO CHOFERES / CAMIONETAS. Los historicos de Inventarios WM NO se traen (decision del
 *      usuario 23-oct): el historial empieza en este libro. Los choferes y camionetas se escriben a mano
 *      en los CATALOGO (CHOFER, CURP, CONTACTO / PLACAS, COLOR, TIPO) y despues se llenan solos al archivar.
 *    Nunca borra ni cambia nada en Inventarios WM. Si una hoja ya existe aqui, NO la toca.
 *    Si no puede abrir Inventarios WM, crea la hoja WFS vacia con el mismo formato.
 *
 *  Formulas de la hoja WFS (las mismas de WFS 1.0; solo cambia a que hoja apuntan):
 *    SKU | SUM de Cantidad (era una tabla dinamica)  QUERY que suma las ventas por SKU
 *    ENVIO FINAL · SKU         los SKU con Envio > 0 de MSI y CLASICA, y los de PROPUESTA
 *    ENVIO FINAL · GTIN        Concentrado (GTIN)          (antes Concentrado!AD de Inventarios WM)
 *    ENVIO FINAL · CATEGORIA   Concentrado (CATEGORIA WM)  (antes Concentrado!C)
 *    ENVIO FINAL · NOMBRE      Concentrado (NOMBRE)        (antes Concentrado!D)
 *    ENVIO FINAL · STOCK ANTES Concentrado (DISPONIBLE ODOO; los -CVA en 0, como en el calculo)
 *    ENVIO FINAL · VENDIDAS / WFS / STOCK DESPUES / UNIDADES   de la misma hoja, igual que antes
 *  Las columnas del Concentrado se buscan por ENCABEZADO (INDIRECT + MATCH), no por letra.
 *  Las de la hoja WFS se ubican por encabezado cada vez que se escriben.
 *  Se revisan en cada calculo y solo se reescriben si alguien las cambio.
 * ============================================================
 */

var WFS_ORIGEN_ID = '1roDaZHj44wPWP7O3X2aoDU6VTEaZMmjCFfWbgcToIQI';   // libro "Inventarios WM" (WFS 1.0)

/** Fila 1 de la hoja WFS de Inventarios WM (para crearla vacia si no se puede copiar). */
var WFS_FILA1 = ['🎉VENTIAPP', 'Cantidad', 'Producto', 'SKU', '🎉', 'SKU', 'SUM de Cantidad',
  '🎉MSI MÁS VENTAS', 'SKU', 'Vendidas', 'Precio', 'Killer', 'WFS', 'STOCK ANTES', 'STOCK DESPUES', 'ENVIO PROPUESTO', 'ESTADO', 'STOCK ANTES', 'STOCK DESPUES', 'Envío',
  '🎉CLÁSICA MÁS VENTAS', 'SKU', 'Vendidas', 'Precio', 'WFS', 'STOCK ANTES', 'STOCK DESPUES', 'ENVIO PROPUESTO', 'ESTADO', 'STOCK ANTES', 'STOCK DESPUES', 'Envío',
  '🎉PROPUESTA', 'PROPUESTA', 'PROPUESTA',
  '🎉ENVÍO FINAL', 'REFERENCIA', 'FECHA', 'DELIVERY', 'CHOFER', 'CURP', 'GTIN', 'CATEGORIA', 'NOMBRE', 'SKU', 'VENDIDAS', 'STOCK ANTES', 'STOCK DESPUES', 'WFS', 'UNIDADES', 'AUTORIZADO'];
/* Formato de la fila 1 y anchos, tomados de la hoja original (mismo orden que WFS_FILA1). */
var WFS_FILA1_COLOR = ['#cc4125', '#3d85c6', '#3d85c6', '#3d85c6', '#e06666', null, null,
  '#cc4125', '#e06666', '#e06666', '#e06666', '#e06666', '#e06666', '#e06666', '#e06666', '#e06666', '#e06666', '#3c78d8', '#3c78d8', '#3c78d8',
  '#cc4125', '#e06666', '#e06666', '#e06666', '#e06666', '#e06666', '#e06666', '#e06666', '#e06666', '#3c78d8', '#3c78d8', '#3c78d8',
  '#cc4125', '#3c78d8', '#3c78d8',
  '#3c78d8', '#3c78d8', '#3c78d8', '#3c78d8', '#3c78d8', '#3c78d8', '#cc4125', '#cc4125', '#cc4125', '#cc4125', '#cc4125', '#cc4125', '#cc4125', '#cc4125', '#3c78d8', '#6aa84f'];
var WFS_ANCHOS = [76, 55, 284, 211, 27, 211, 96, 113, 229, 57, 51, 44, 33, 78, 89, 104, 254, 78, 89, 39,
  134, 208, 57, 51, 33, 78, 89, 104, 286, 78, 89, 39, 86, 69, 69, 90, 71, 43, 58, 51, 39, 95, 125, 300, 229, 62, 78, 89, 33, 62, 78];
var WFS_FORMATOS = ['General', 'General', 'General', 'General', 'General', 'General', 'General', '#,##0', '#,##0', '#,##0', '"$"#,##0', '"$"#,##0', '#,##0', '#,##0', '#,##0', '#,##0', '#,##0', '#,##0', '#,##0', '#,##0',
  '"$"#,##0', '"$"#,##0', '#,##0', '"$"#,##0', 'General', '#,##0', '#,##0', '#,##0', '#,##0', '#,##0', '#,##0', '#,##0', '"$"#,##0', '"$"#,##0', 'General',
  '"$"#,##0', '"$"#,##0', '"$"#,##0', '"$"#,##0', '"$"#,##0', '"$"#,##0', '00000000000000', '"$"#,##0', '"$"#,##0', '"$"#,##0', '#,##0', '#,##0', '#,##0', '#,##0', '#,##0', '#,##0'];

/* ================ TRAER DE INVENTARIOS WM ================ */

/** Menu: 📥 Crear hoja WFS (formato de Inventarios WM) (una vez). */
function wfsTraerMenu() {
  var ui = SpreadsheetApp.getUi();
  var c = WFS_CONFIG;
  var resp = alertLog_(ui, 'Crear hoja WFS',
    '• Se copia la hoja ' + c.HOJA + ' de "Inventarios WM" (formato, colores y lo que tenga escrito).\n' +
    '• Se crean aquí, NUEVOS y vacíos: ' + c.HOJA_HIST + ', ' + c.HOJA_HIST_CHOF + ', ' + c.HOJA_HIST_CAM + ',\n' +
    '  ' + c.HOJA_CAT_CHOF + ' y ' + c.HOJA_CAT_CAM + '. Los históricos de Inventarios WM NO se traen.\n\n' +
    'En Inventarios WM NO se borra ni se cambia nada.\n' +
    'Las hojas que ya existan aquí NO se tocan.\n\n¿Continuar?', ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;
  var lock = wfsCandadoMenu_();
  if (!lock) { alertLog_(ui, 'WFS', WFS_OCUPADO, ui.ButtonSet.OK); return; }
  try {
    var res = wfsTraer_();
    wfsLogResumen_('OK', res);
    alertLog_(ui, '✅ WFS en este libro', res +
      '\n\nSiguiente: 🚚 Envíos WFS ▸ 📥 Actualizar ventas y calcular.\n' +
      'Antes del primer envío escribe tus choferes en ' + c.HOJA_CAT_CHOF + ' y tus camionetas en ' + c.HOJA_CAT_CAM + '.\n' +
      'Mientras pruebas, WFS 1.0 sigue en Inventarios WM; cuando aquí cuadre, apaga allá su automático.', ui.ButtonSet.OK);
  } catch (e) {
    wfsLogResumen_('ERROR', 'Crear hoja WFS: ' + e.message + '\n' + (e.stack || ''));
    alertLog_(ui, '❌ No se completó', e.message + '\n\nNo se pierde nada: vuelve a correr esta misma opción y continúa donde se quedó (lo ya creado no se toca).', ui.ButtonSet.OK);
  } finally {
    flushLog_();
    lock.releaseLock();
  }
}

/** Corre fn y, si Google contesta "se agoto el tiempo de espera" (el libro es grande), reintenta hasta 3 veces. */
function wfsReintentar_(nombre, fn) {
  var ultimo = null;
  for (var i = 1; i <= 3; i++) {
    try { return fn(); }
    catch (e) {
      ultimo = e;
      var m = String(e && e.message || e);
      if (!/tiempo de espera|timed out|timeout|Service Spreadsheets|Service error|Servicio/i.test(m)) throw e;
      logWarn_('WFS', nombre + ': Google tardo de mas (intento ' + i + ' de 3)');
      try { SpreadsheetApp.flush(); } catch (e2) {}
      Utilities.sleep(4000 * i);
    }
  }
  throw ultimo;
}

function wfsTraer_() {
  var ss = SpreadsheetApp.getActive();
  var c = WFS_CONFIG;
  var l = [];
  var src = null;
  try { src = wfsReintentar_('Abrir Inventarios WM', function () { return SpreadsheetApp.openById(WFS_ORIGEN_ID); }); }
  catch (e) { l.push('⚠ No pude abrir Inventarios WM (' + String(e.message).split('\n')[0] + ')'); }

  // 1) hoja WFS
  var sh = ss.getSheetByName(c.HOJA);
  if (sh) {
    l.push('• Hoja ' + c.HOJA + ': ya existía aquí, no la toqué');
  } else if (src && src.getSheetByName(c.HOJA)) {
    sh = wfsReintentar_('Copiar hoja WFS', function () {
      return src.getSheetByName(c.HOJA).copyTo(ss).setName(c.HOJA);
    });
    var tablas = 0;
    try { sh.getPivotTables().forEach(function (p) { p.remove(); tablas++; }); } catch (e) {}
    l.push('• Hoja ' + c.HOJA + ': copiada de Inventarios WM' + (tablas ? ' (la tabla dinámica de ventas ahora es fórmula)' : ''));
  } else {
    sh = wfsReintentar_('Crear hoja WFS vacia', function () { return wfsCrearHojaVacia_(ss); });
    l.push('• Hoja ' + c.HOJA + ': creada vacía con el mismo formato (no pude copiarla)');
  }
  SpreadsheetApp.flush();

  // 2) historicos y catalogos. Si la hoja existe pero quedo SIN encabezados (corrida anterior cortada) se completa.
  //    Los CATALOGO de choferes y camionetas se traen con sus datos de Inventarios WM (son pocos); los historicos NO.
  var lista = [[c.HOJA_HIST, WFS_ARCH_ENC, false], [c.HOJA_HIST_CHOF, WFS_ARCH_ENC_CHOF, false], [c.HOJA_HIST_CAM, WFS_ARCH_ENC_CAM, false],
    [c.HOJA_CAT_CHOF, WFS_CAT_ENC_CHOF, true], [c.HOJA_CAT_CAM, WFS_CAT_ENC_CAM, true]];
  lista.forEach(function (x) {
    var n = x[0], enc = x[1], traerDatos = x[2];
    wfsReintentar_(n, function () {
      var h = ss.getSheetByName(n), nueva = false;
      if (!h) { h = ss.insertSheet(n); nueva = true; }
      var vacia = String(h.getRange(1, 1).getValue() || '') === '';
      if (vacia) {
        h.getRange(1, 1, 1, enc.length).setValues([enc]).setFontWeight('bold');
        h.setFrozenRows(1);
      }
      var extra = '';
      if (traerDatos && src && (nueva || vacia || h.getLastRow() < 2)) {
        var o = src.getSheetByName(n);
        if (o && o.getLastRow() > 1) {
          var oEnc = wfsEnc_(o, 1), filas = o.getRange(2, 1, o.getLastRow() - 1, o.getLastColumn()).getValues();
          var mapa = enc.map(function (t) { return wfsBuscarCol_(oEnc, t); });   // por encabezado, no por posicion
          var sal = [];
          filas.forEach(function (r) {
            if (String(r[(mapa[0] || 1) - 1] || '').trim() === '') return;
            sal.push(mapa.map(function (m) { return m ? r[m - 1] : ''; }));
          });
          if (sal.length) { h.getRange(2, 1, sal.length, enc.length).setValues(sal); extra = ' con ' + sal.length + ' registros de Inventarios WM'; }
        }
      }
      l.push('• ' + n + ': ' + (nueva ? 'creada' : (vacia ? 'completada (estaba sin encabezados)' : 'ya existía, no la toqué')) + extra);
    });
  });
  SpreadsheetApp.flush();

  // 3) formulas (lo mas pesado): cada una se reintenta sola
  var fx = wfsAsegurarFormulas_(sh, true);
  l.push('• Fórmulas apuntando a este libro: ' + fx.escritas + ' (Concentrado por encabezado)');
  return l.join('\n');
}

/** Hoja WFS vacia con la fila 1, colores, anchos, formatos y reglas de color de la original. */
function wfsCrearHojaVacia_(ss) {
  var c = WFS_CONFIG, N = c.FILAS_FX;
  var sh = ss.insertSheet(c.HOJA);
  var nC = WFS_FILA1.length;
  if (sh.getMaxColumns() < nC) sh.insertColumnsAfter(sh.getMaxColumns(), nC - sh.getMaxColumns());
  if (sh.getMaxRows() < N) sh.insertRowsAfter(sh.getMaxRows(), N - sh.getMaxRows());
  var r1 = sh.getRange(1, 1, 1, nC);
  r1.setValues([WFS_FILA1]).setFontWeight('bold');
  r1.setBackgrounds([WFS_FILA1_COLOR]);
  r1.setFontColors([WFS_FILA1_COLOR.map(function (x) { return x ? '#ffffff' : '#000000'; })]);
  for (var i = 0; i < nC; i++) {
    sh.setColumnWidth(i + 1, WFS_ANCHOS[i] || 100);
    sh.getRange(2, i + 1, N - 1, 1).setNumberFormat(WFS_FORMATOS[i] || 'General');
  }
  sh.setFrozenRows(1);
  wfsReglasColor_(sh);
  return sh;
}

/** Las reglas de color de la hoja original (mismo texto y colores). */
function wfsReglasColor_(sh) {
  var N = WFS_CONFIG.FILAS_FX;
  var nC = WFS_FILA1.length;
  var todo = sh.getRange(1, 1, N, nC);
  var R = function () { return SpreadsheetApp.newConditionalFormatRule(); };
  var VERDE = '#d9ead3', ROJO = '#f4cccc', GRIS = '#b7b7b7';
  var enc = wfsEnc_(sh, 1);
  var cV = wfsBuscarCol_(enc, 'SKU', { desde: wfsBuscarCol_(enc, WFS_CONFIG.MARCA_CLASICA, { contiene: true }) });
  var cI = wfsBuscarCol_(enc, 'SKU', { desde: wfsBuscarCol_(enc, WFS_CONFIG.MARCA_MSI, { contiene: true }) });
  var cE = wfsBuscarCol_(enc, 'ENVIO FINAL', { contiene: true });
  var cNom = cE ? wfsBuscarCol_(enc, 'NOMBRE', { desde: cE }) : 0;
  var reglas = [
    R().whenFormulaSatisfied('=LEN(TRIM(A1))=0').setBackground(GRIS).setRanges([todo]).build(),
    R().whenTextEndsWith('-MSI').setBackground(VERDE).setRanges([todo]).build(),
    R().whenTextEndsWith('-MSI-2').setBackground(VERDE).setRanges([todo]).build(),
    R().whenTextEndsWith('-MSI-3').setBackground(VERDE).setRanges([todo]).build(),
    R().whenTextEqualTo('STOCK DISPONIBLE').setBackground(VERDE).setRanges([todo]).build(),
    R().whenTextEqualTo('AÚN CON STOCK PARA 15 DÍAS').setBackground(ROJO).setRanges([todo]).build(),
    R().whenTextEqualTo('SIN STOCK ODOO SUFICIENTE').setBackground(ROJO).setRanges([todo]).build(),
    R().whenNumberLessThanOrEqualTo(-1).setBackground(ROJO).setRanges([todo]).build(),
    R().whenNumberEqualTo(0).setBackground(ROJO).setRanges([todo]).build()
  ];
  if (cV && cI) {
    var lI = colLetra_(cI), lV = colLetra_(cV);
    reglas.push(R().whenFormulaSatisfied('=COUNTIF(ARRAYFORMULA(REGEXREPLACE($' + lI + '$2:$' + lI + N + ',"(?i)(-MSI(-[2-9])?)$","")),' +
      'REGEXREPLACE(' + lV + '2,"(?i)(-MSI(-[2-9])?)$",""))>0')
      .setBackground(ROJO).setRanges([sh.getRange(2, cV, N - 1, 1)]).build());
  }
  if (cNom) {
    var lN = colLetra_(cNom);
    reglas.push(R().whenFormulaSatisfied('=COUNTIF(' + lN + ':' + lN + ',' + lN + '1)>1')
      .setBackground(ROJO).setRanges([sh.getRange(1, cNom, N, 1)]).build());
  }
  sh.setConditionalFormatRules(reglas);
}

/* ================ FORMULAS ================ */

/**
 * Escribe (o revisa) las formulas de la hoja WFS, ubicando cada columna por su encabezado.
 * forzar = true: las escribe siempre (al traer la hoja). false: solo las que alguien cambio.
 * @return {{escritas:number}}
 */
function wfsAsegurarFormulas_(sh, forzar) {
  var c = WFS_CONFIG, N = c.FILAS_FX;
  if (sh.getMaxRows() < N) sh.insertRowsAfter(sh.getMaxRows(), N - sh.getMaxRows());
  var enc = wfsEnc_(sh, 1);
  var cols = wfsUbicarBloques_(sh);
  var L = colLetra_;
  var R = function (col) { return L(col) + '2:' + L(col) + N; };
  var C = function (col) { return L(col) + ':' + L(col); };

  // ventas: SKU | SUM de Cantidad = la segunda "SKU" del bloque de ventas. Si no tiene encabezado (al copiar la hoja
  // se quita la tabla dinamica y con ella sus encabezados) es la columna que sigue al separador "🎉" del bloque.
  var iV = wfsBuscarCol_(enc, c.MARCA_VENTAS, { contiene: true });
  var fV = wfsFinBloque_(enc, iV, wfsMarcadores_());
  var cPivSku = wfsBuscarCol_(enc, 'SKU', { desde: iV, hasta: fV, ocurrencia: 2 });
  if (!cPivSku) {
    var sep = wfsBuscarCol_(enc, '🎉', { desde: cols.sku + 1, hasta: fV });
    if (sep && sep + 1 <= fV) cPivSku = sep + 1;
  }
  if (!cPivSku) throw new Error("En la hoja '" + c.HOJA + "' no encuentro dónde van las ventas por SKU (columna SKU después del separador 🎉 del bloque VENTIAPP).");
  var cPivSum = wfsBuscarCol_(enc, 'SUM DE CANTIDAD', { desde: iV, hasta: fV }) || (cPivSku + 1);

  // MSI y CLASICA
  var cI = cols.msi, cT = cols.msi + wfsIdxEnc_(WFS_ENC_MSI, 'ENVIO', 1) - 1, cM = cols.msi + wfsIdxEnc_(WFS_ENC_MSI, 'WFS', 1) - 1;
  var cV = cols.cla, cAF = cols.cla + wfsIdxEnc_(WFS_ENC_CLA, 'ENVIO', 1) - 1, cY = cols.cla + wfsIdxEnc_(WFS_ENC_CLA, 'WFS', 1) - 1;

  // PROPUESTA: el marcador y luego dos columnas PROPUESTA (SKU y piezas)
  var cAH = wfsExigirCol_(enc, 'PROPUESTA', c.HOJA, { contiene: true, ocurrencia: 2 });
  var cAI = wfsExigirCol_(enc, 'PROPUESTA', c.HOJA, { contiene: true, ocurrencia: 3 });

  // ENVIO FINAL
  var iE = wfsExigirCol_(enc, 'ENVIO FINAL', c.HOJA, { contiene: true });
  var fE = wfsFinBloque_(enc, iE, wfsMarcadores_());
  var en = function (n) { return wfsExigirCol_(enc, n, c.HOJA, { desde: iE, hasta: fE }); };
  var cAP = en('GTIN'), cAQ = en('CATEGORIA'), cAR = en('NOMBRE'), cAS = en('SKU'), cAT = en('VENDIDAS'),
      cAU = en('STOCK ANTES'), cAV = en('STOCK DESPUES'), cAW = en('WFS'), cAX = en('UNIDADES');

  // Concentrado de este libro, por encabezado
  var H = c.HOJA_CONCENTRADO;
  var kS = fxCol_(H, 'SKU'), kG = fxCol_(H, 'GTIN'), kC = fxCol_(H, 'CATEGORIA WM'), kN = fxCol_(H, 'NOMBRE'), kD = fxCol_(H, 'DISPONIBLE ODOO');
  var AS = R(cAS);

  var fx = [];   // [columna, fila, formula]
  fx.push([cPivSku, 1, '={"SKU","SUM de Cantidad";IFERROR(QUERY({' + R(cols.sku) + ',' + R(cols.cant) + '},' +
    '"select Col1, sum(Col2) where Col1 <> \'\' group by Col1 order by sum(Col2) desc label sum(Col2) \'\'",0),{"",""})}']);
  fx.push([cAS, 1, '={"SKU";' +
    'IFERROR(QUERY({' + R(cI) + ',' + R(cT) + '},"select Col1 where Col2 is not null and Col2 > 0",0),"");' +
    'IFERROR(QUERY({' + R(cV) + ',' + R(cAF) + '},"select Col1 where Col2 is not null and Col2 > 0",0),"");' +
    'IFERROR(QUERY({' + R(cAH) + '},"select Col1 where Col1 is not null",0),"")}']);
  fx.push([cAP, 1, '=ARRAYFORMULA({"GTIN";IF(' + AS + '="","",XLOOKUP(' + AS + ',' + kS + ',' + kG + ',""))})']);
  fx.push([cAQ, 1, '=ARRAYFORMULA({"CATEGORIA";IF(' + AS + '="","",XLOOKUP(' + AS + ',' + kS + ',' + kC + ',""))})']);
  fx.push([cAR, 1, '=ARRAYFORMULA({"NOMBRE";IF(' + AS + '="","",XLOOKUP(' + AS + ',' + kS + ',' + kN + ',""))})']);
  fx.push([cAT, 2, '=ARRAYFORMULA(IF(' + AS + '="","",IFERROR(XLOOKUP(' + AS + ',' + C(cPivSku) + ',' + C(cPivSum) + '),"")))']);
  fx.push([cAU, 1, '=ARRAYFORMULA({"STOCK ANTES";IF(' + AS + '="","",IF(REGEXMATCH(' + AS + '&"","(?i)CVA"),0,' +
    'IFERROR(XLOOKUP(' + AS + ',' + kS + ',' + kD + '),0)))})']);
  fx.push([cAV, 1, '=ARRAYFORMULA({"STOCK DESPUES";IF(' + R(cAU) + '="","",IF(' + R(cAU) + '<=0,0,' + R(cAU) +
    '-IFERROR(VALUE(' + R(cAX) + '),0)))})']);
  fx.push([cAW, 2, '=ARRAYFORMULA(IF(' + AS + '="","",IFERROR(XLOOKUP(' + AS + ',' + C(cI) + ',' + C(cM) + '),' +
    'IFERROR(XLOOKUP(' + AS + ',' + C(cV) + ',' + C(cY) + '),""))))']);
  fx.push([cAX, 1, '=ARRAYFORMULA({"UNIDADES";IF(' + AS + '="","",' +
    'IF(IFERROR(XLOOKUP(' + AS + ',' + R(cI) + ',' + R(cT) + '),0)<>0,XLOOKUP(' + AS + ',' + R(cI) + ',' + R(cT) + '),' +
    'IF(IFERROR(XLOOKUP(' + AS + ',' + R(cV) + ',' + R(cAF) + '),0)<>0,XLOOKUP(' + AS + ',' + R(cV) + ',' + R(cAF) + '),' +
    'XLOOKUP(' + AS + ',' + R(cAH) + ',' + R(cAI) + '))))})']);

  var limpio = function (f) { return String(f || '').replace(/\s+/g, '').toUpperCase(); };
  var escritas = 0;
  fx.forEach(function (x) {
    var col = x[0], fila = x[1], f = x[2];
    var celda = sh.getRange(fila, col);
    if (!forzar && limpio(celda.getFormula()) === limpio(f)) return;
    wfsReintentar_('Formula columna ' + L(col), function () {
      // lo que haya debajo estorba al arreglo: se limpia SOLO esa columna (nunca AUTORIZADO ni las tuyas)
      var desde = fila + 1, alto = sh.getMaxRows() - fila;
      if (alto > 0) sh.getRange(desde, col, alto, 1).clearContent();
      if (col === cPivSku) sh.getRange(1, cPivSum, sh.getMaxRows(), 1).clearContent();
      if (fila === 2) sh.getRange(1, col).setValue(col === cAT ? 'VENDIDAS' : 'WFS');
      celda.setFormula(f);
    });
    escritas++;
  });
  if (escritas) logInfo_('COLUMNAS', 'Formulas de la hoja ' + c.HOJA + ' escritas: ' + escritas, {
    ventas: L(cPivSku) + ':' + L(cPivSum), envioFinal: L(iE) + ':' + L(fE), filas: N });
  return { escritas: escritas };
}
