/**
 * ============================================================
 *  WfsHoja — formulas de la hoja WFS y reintento para libros grandes
 * ============================================================
 *
 *  (25-nov-2026, audit) Se quito la copia de la hoja desde Inventarios WM: la hoja WFS y sus historicos/catalogos
 *  ya viven en este libro. Los choferes y camionetas se escriben a mano en los CATALOGO
 *  (CHOFER, CURP, CONTACTO / PLACAS, COLOR, TIPO) y despues se llenan solos al archivar.
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

/* ================ REINTENTO PARA LIBROS GRANDES ================ */

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
