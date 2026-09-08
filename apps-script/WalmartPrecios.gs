/**
 * WalmartPrecios.gs — Site Sheet
 *
 * Genera el archivo de la plantilla oficial de Walmart (PRICE_AND_PROMOTION)
 * para subir cambios de precio y promociones.
 *
 * Flujo:
 *   1) wmNuevoCambio()        pregunta el tipo de cambio y arma la hoja
 *                             "Cambio Walmart":
 *                               1 masivo general -> fin = primer dia del 3er mes
 *                                                        siguiente a las 05:59 UTC
 *                                                        (23:59 de Mexico del dia anterior)
 *                               2 killers        -> fin = el que trae cada killer del site
 *                               3 SKUs sueltos   -> mismo fin que el modo 1 (editable)
 *                                                  jala tambien sus variantes
 *                             El inicio siempre es ahora + 5 minutos.
 *   2) wmPegarSkus()          alternativa: pegas una lista de SKUs (killers /
 *                             ofertas especiales, con o sin -MSI) y los llena.
 *   3) Marcas las filas (checkbox en A). Ayudas: wmMarcarFiltrados(),
 *      wmMarcarPorTexto(), wmDesmarcarTodo().
 *   4) wmAplicarFactor()      cambia el % a las filas marcadas (1 = 100%).
 *      wmAplicarFechas()      pone inicio = ahora + 5 min y el fin que digas.
 *   5) wmGenerarArchivo()     crea el .xlsx listo para subir a Walmart.
 *
 * Reglas que aplica el archivo (confirmadas contra tu Precio Killers.xlsx):
 *   D  sku                       el SKU de Walmart tal cual (con -MSI si aplica)
 *   E  msrp                      vacio
 *   F  price                     = precio final x 1.3, formato 0.00
 *   G  promotionSettingAction    "Reemplazar todo"
 *   H  promotionType             "Rebaja"
 *   I  promotionPrice            precio final, formato 0.00
 *   J  promotionPriceStartDateTime   hora de Mexico + 6 h (UTC)
 *   K  promotionPriceEndDateTime     hora de Mexico + 6 h (UTC)
 *   Los datos empiezan en la fila 10. A1 lleva la firma de version intacta.
 *
 * Precio final = ENTERO(precio del site x factor / 10) * 10 + 9
 */

var HOJA_WM        = 'Cambio Walmart';
var WM_HORAS_UTC   = 6;      // Mexico centro es UTC-6 todo el año (sin horario de verano)
var WM_MIN_ADELANTO = 5;     // minutos minimos hacia adelante para que Walmart lo acepte
var WM_MULT_TACHADO = 1.3;   // price = promotionPrice x 1.3
var WM_CARPETA     = 'Archivos Walmart';
var WM_HOJA_KILLERS = 'Killers';

var WM_ENCABEZADOS = [
  '\u2713', 'SKU WALMART', 'SKU BASE', 'PRODUCTO', 'CATEGORIA', 'STOCK',
  'CANAL', 'PRECIO SITE', 'FACTOR', 'PRECIO CALC', 'PRECIO MANUAL',
  'PRECIO FINAL', 'TACHADO', 'INICIO (MX)', 'FIN (MX)'
];
var WM_COL = {
  CHK: 1, SKU: 2, BASE: 3, PROD: 4, CAT: 5, STOCK: 6, CANAL: 7,
  SITE: 8, FACTOR: 9, CALC: 10, MANUAL: 11, FINAL: 12, TACHADO: 13,
  INI: 14, FIN: 15
};

/* Filas 1 a 9 de la hoja Price, tal cual vienen de Walmart. */
var WM_TPL_PRICE = [
  ['Version=5.0.20250801-18_47_55,PRICE_AND_PROMOTION,price-mp,es,external,Price,7,7', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', 'SKU', 'Price & Promotion', '', '', '', '', '', ''],
  ['', '', '', '', '', '', 'Promo (promotionInformation)', '', '', '', ''],
  ['', '', '', '', 'MSRP', 'Selling Price', 'Promo Setting Action', 'Promo Type', 'Promo Price', 'Promo Price Start Date', 'Promo Price End Date'],
  ['', '', '', 'sku', 'msrp', 'price', 'promotionSettingAction', 'promotionType', 'promotionPrice', 'promotionPriceStartDateTime', 'promotionPriceEndDateTime'],
  ['', '', '', 'Alphanumeric, 50 characters - The string of letters and/or numbers a partner uses to identify the item. Walmart includes this value in all communications regarding item information such as orders. Example: TRVAL28726', 'Decimal, Value range: 0 to 99999999 - Manufacturer\'s suggested retail price. This is not the price that Walmart customers will pay for your product. You can use up to 8 digits before the decimal place. Do not use commas or dollar signs. Example: 19.95', 'Decimal, Value range: 0 to 99999999999999 - The price the customer pays for the product. Please do not use commas or currency symbols. Example: 100.33', 'Closed List - Sellers can define the promotion setting action based on either create/ delete or replace all promotion', 'Closed List - Sellers can choose between reduced or clearance badge to display on site for their promotion.', 'Decimal, Value range: 0 to 99999999999999 - The price you use when running a sale on that item. Promo Price price can be scheduled in future.', 'DateTime, Start date and time for the promotion. Format: YYYY-MM-DD hh:mm:ss', 'DateTime, End date and time for the promotion. Format: YYYY-MM-DD hh:mm:ss'],
  ['', '', '', '', '', '', 'Promo (promotionInformation)', '', '', '', ''],
  ['', '', '', 'SKU', 'MSRP', 'Precio', 'Acción para la promoción', 'Tipo de promoción', 'Precio promocional', 'Fecha de inicio', 'Fecha de término'],
  ['', '', '', 'Alphanumeric, 50 characters - La cadena de letras y/o números que un socio utiliza para identificar el artículo. Walmart incluye este valor en todas las comunicaciones relacionadas con la información del artículo, como los pedidos.', 'Decimal, Value range: 0 to 99999999 - Es el precio de venta sugerido por el fabricante. Este no es el precio que el cliente pagará por el producto. Puedes usar hasta 8 dígitos. No uses comas ni símbolos de divisa. Ejemplo: 14990', 'Decimal, Value range: 0 to 99999999999999 - Es el precio que el cliente paga por el producto. En caso de que estés configurando un precio promocional, este corresponde al precio base del producto (precio tachado). No uses comas ni símbolos de divisa. Ejemplo: 14990', 'Closed List - Lista cerrada – Los sellers pueden definir la acción para la promoción: Crear, Eliminar o Reemplazar todo.', 'Closed List - Lista cerrada – Los sellers pueden elegir si quieren que se vea la etiqueta de rebaja o de liquidación para su promoción.', 'Decimal, Value range: 0 to 99999999999999 - Es el precio reducido que se mostrará durante el periodo promocional. El precio promocional puede programarse para fechas futuras.', 'DateTime, Fecha y hora - Fecha y hora de inicio de la promoción. Formato: AAAA-MM-DD HH:MM:SS. Ejemplo: 2025-05-10 15:30:00', 'DateTime, Fecha y hora - Fecha y hora de término de la promoción. Formato: AAAA-MM-DD HH:MM:SS. Ejemplo: 2025-06-15 15:30:00']
];

/* Hoja oculta Hidden_price-mp, tal cual. */
var WM_TPL_HIDDEN = [
  ['ColHeader', 'promotionInformation', 'promotionInformation_promotionType', 'promotionName', 'promotionInformation_promotionPrice', 'price', 'msrp', 'promotionInformation_promotionSettingAction', 'promoid', 'sku', 'promotionInformation_promotionPriceStartDateTime', 'promotionInformation_promotionPriceEndDateTime', 'promotionGroupAction'],
  ['Attribute Name', 'Promo', 'Promo Type', 'Promo name (BE)', 'Promo Price', 'Selling Price', 'MSRP', 'Promo Setting Action', 'Promo ID', 'SKU', 'Promo Price Start Date', 'Promo Price End Date', 'Promo action (BE)'],
  ['Attribute XML Name', 'promotionInformation', 'promotionType', 'promotionName', 'promotionPrice', 'price', 'msrp', 'promotionSettingAction', 'promoid', 'sku', 'promotionPriceStartDateTime', 'promotionPriceEndDateTime', 'promotionGroupAction'],
  ['Requirement Level', 'Recommended', 'Recommended', 'Recommended', 'Recommended', 'Recommended', 'Recommended', 'Required', 'Recommended', 'Required', 'Recommended', 'Recommended', 'Recommended'],
  ['Data Type', 'Object', 'String', 'String', 'Decimal', 'Decimal', 'Decimal', 'String', 'String', 'String', 'DateTime', 'DateTime', 'String'],
  ['Member XML', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['Container XML', '', 'promotionInformation', '', 'promotionInformation', '', '', 'promotionInformation', '', '', 'promotionInformation', 'promotionInformation', ''],
  ['XSD Group Name', 'Price', 'Price', 'Price', 'Price', 'Price', 'Price', 'Price', 'Price', 'Price', 'Price', 'Price', 'Price'],
  ['JSON Path', 'Price', 'Price', 'Price', 'Price', 'Price', 'Price', 'Price', 'Price', 'Price', 'Price', 'Price', 'Price'],
  ['Is Multiselect', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N'],
  ['Is Deletable', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['Strip Values', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['Product Type', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['Read Only', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['Restrict Edit', '', '', 'Partner', '', '', '', '', '', '', '', '', 'Partner'],
  ['Is Multi Locale Enabled', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['locale', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['Is Hidden', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['data_row:9', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['Price', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['valid values header', '', 'promotionInformation_promotionType', '', '', '', '', 'promotionInformation_promotionSettingAction', '', '', '', '', 'promotionGroupAction'],
  ['valid values', '', 'Liquidación', '', '', '', '', 'Crear', '', '', '', '', 'Add'],
  ['', '', 'Rebaja', '', '', '', '', 'Eliminar', '', '', '', '', 'Remove'],
  ['', '', '', '', '', '', '', 'Reemplazar todo', '', '', '', '', '']
];

/* ================================================================== */
/*  1. Armar la hoja de trabajo                                        */
/* ================================================================== */

/**
 * Menu principal. Pregunta el tipo de cambio y de ahi sale la fecha de termino:
 *
 *   1) Cambio masivo general -> fin = primer dia del tercer mes siguiente
 *   2) Killers / Ofertas especiales -> fin = el que trae cada killer del site
 *   3) SKUs especificos -> fin = hoy + 3 meses (editable)
 *
 * El inicio siempre es ahora + 5 minutos, en los tres casos.
 */
function wmNuevoCambio() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Tipo de cambio',
    'Escribe 1, 2 o 3:\n\n' +
    '1) Cambio masivo general\n' +
    '     Mexico:  ' + wmFmt_(wmFinTercerMes_()) + '\n' +
    '     archivo: ' + wmFmtUtc_(wmFinTercerMes_()) + '  (primer dia del 3er mes, 05:59 UTC)\n\n' +
    '2) Killers / Ofertas especiales\n' +
    '     cada SKU se lleva la fecha de termino que trae el site\n\n' +
    '3) SKUs especificos que yo elija\n' +
    '     misma fecha que el modo 1 (la puedes cambiar)',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;

  var modo = String(r.getResponseText()).trim();
  if (modo === '1') return wmModoMasivo_();
  if (modo === '2') return wmModoKillers_();
  if (modo === '3') return wmPegarSkus();
  throw new Error('Escribe 1, 2 o 3.');
}

/* --- Modo 1: cambio masivo general --- */
function wmModoMasivo_() {
  var ss = SpreadsheetApp.getActive();
  var ui = SpreadsheetApp.getUi();

  var hojas = wmHojasDePrecios_(ss);
  if (!hojas.length) throw new Error('No encontre hojas de precios (las que traen la columna "Walmart Clasica").');

  var r1 = ui.prompt('Hoja de precios',
    'Escribe el numero:\n\n' + hojas.map(function (h, i) { return (i + 1) + ') ' + h; }).join('\n'),
    ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var idx = parseInt(String(r1.getResponseText()).trim(), 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= hojas.length) throw new Error('Numero invalido.');
  var nombreHoja = hojas[idx];

  var r2 = ui.prompt('Canal',
    'Escribe 1 o 2:\n\n1) Walmart Clasica  (SKU tal cual)\n2) Walmart Premium  (SKU + "-MSI")',
    ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var canal = String(r2.getResponseText()).trim() === '2' ? 'Premium' : 'Clasica';

  var fin = wmPreguntarFin_('Cambio masivo general', wmFinTercerMes_());
  if (!fin) return;

  var datos = wmLeerPrecios_(ss, nombreHoja);
  var cat = wmCatalogo_(ss);

  var filas = datos.orden.map(function (sku) {
    var d = datos.mapa[sku];
    return {
      skuWalmart: canal === 'Premium' ? sku + '-MSI' : sku,
      base: sku,
      producto: d.producto,
      categoria: (cat[sku] || ''),
      stock: d.stock,
      canal: canal,
      precio: canal === 'Premium' ? d.premium : d.clasica,
      fin: fin
    };
  });

  wmEscribirHoja_(ss, filas, nombreHoja + ' / masivo');
  SpreadsheetApp.getActive().toast(
    filas.length + ' productos de "' + nombreHoja + '" (' + canal + '), termina ' + wmFmt_(fin),
    'Cambio Walmart', 8);
}

/* --- Modo 2: killers.
 * La fecha de termino NUNCA se inventa: sale tal cual del site, porque en
 * meses de venta alta los killers cambian varias veces dentro del mismo mes.
 * Si un killer no trae termino valido, o ya vencio, no entra al archivo.
 * --------------------------------------------------------------------- */
function wmModoKillers_() {
  var ss = SpreadsheetApp.getActive();
  var ui = SpreadsheetApp.getUi();

  // 1. Traer la tanda mas reciente antes de armar nada.
  var k = ss.getSheetByName(WM_HOJA_KILLERS);
  if (typeof killersBajar === 'function') {
    var pregunta = k
      ? 'Bajar del site la tanda mas reciente de killers antes de armar la hoja?\n\n' +
        'Lo que hay ahora: ' + (wmNotaHoja_(k) || 'sin fecha de bajada')
      : 'No hay hoja "' + WM_HOJA_KILLERS + '" todavia. La bajo del site ahora?';
    var rr = ui.alert('Killers', pregunta, ui.ButtonSet.YES_NO_CANCEL);
    if (rr === ui.Button.CANCEL) return;
    if (rr === ui.Button.YES) {
      killersBajar();
      k = ss.getSheetByName(WM_HOJA_KILLERS);
    }
  }
  if (!k || k.getLastRow() < 2) {
    throw new Error('No hay hoja "' + WM_HOJA_KILLERS + '". Corre killersBajar() ' +
                    'para traerlos de electronicsmexico.site/walmart/killers.');
  }

  // 2. Hoja de precios de referencia.
  var hojas = wmHojasDePrecios_(ss);
  var r1 = ui.prompt('Hoja de precios de referencia',
    'De aqui se toma el precio del site como punto de partida.\nEscribe el numero:\n\n' +
    hojas.map(function (h, i) { return (i + 1) + ') ' + h; }).join('\n'),
    ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var idx = parseInt(String(r1.getResponseText()).trim(), 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= hojas.length) throw new Error('Numero invalido.');
  var nombreHoja = hojas[idx];

  // 3. Mapear columnas de la hoja Killers.
  var enc = k.getRange(1, 1, 1, k.getLastColumn()).getValues()[0]
    .map(function (v) { return String(v || '').toLowerCase(); });
  function col(frag) { for (var i = 0; i < enc.length; i++) if (enc[i].indexOf(frag) >= 0) return i; return -1; }
  var cSku = col('sku'), cTit = col('titulo'), cFin = col('termina'), cPago = col('pagan');
  if (cSku < 0) throw new Error('La hoja "' + WM_HOJA_KILLERS + '" no trae columna SKU.');
  if (cFin < 0) throw new Error('La hoja "' + WM_HOJA_KILLERS + '" no trae columna TERMINA. ' +
                                'Corre killersVerEstructura() y mandame la salida.');

  var datos = wmLeerPrecios_(ss, nombreHoja);
  var cat = wmCatalogo_(ss);
  var d = k.getRange(2, 1, k.getLastRow() - 1, k.getLastColumn()).getValues();
  var ahora = new Date();

  var filas = [], sinFecha = [], vencidos = [], sinPrecio = [];

  for (var i = 0; i < d.length; i++) {
    var sku = String(d[i][cSku] || '').trim();
    if (!sku) continue;

    var fin = d[i][cFin];
    if (!(fin instanceof Date) || isNaN(fin.getTime())) { sinFecha.push(sku); continue; }
    if (fin <= ahora) { vencidos.push(sku); continue; }

    var base = wmBase_(sku);
    var p = datos.mapa[base];
    if (!p) sinPrecio.push(sku);
    var esPremium = wmEsPremium_(sku);

    filas.push({
      skuWalmart: sku,
      base: base,
      producto: (cTit >= 0 && d[i][cTit]) ? d[i][cTit] : (p ? p.producto : ''),
      categoria: cat[base] || '',
      stock: p ? p.stock : '',
      canal: esPremium ? 'Premium' : 'Clasica',
      precio: p ? (esPremium ? p.premium : p.clasica) : '',
      manual: (cPago >= 0 && d[i][cPago] > 0) ? d[i][cPago] : '',
      fin: fin
    });
  }

  if (!filas.length) {
    throw new Error('Ningun killer vigente. Vencidos: ' + vencidos.length +
                    ', sin fecha: ' + sinFecha.length + '. Vuelve a correr killersBajar().');
  }

  wmEscribirHoja_(ss, filas, 'Killers / ' + nombreHoja);
  wmMarcarTodo_(true);

  var msg = filas.length + ' killers vigentes, cargados y marcados.\n' +
            'Cada uno se lleva su propia fecha de termino del site.\n\n' +
            'Rango de terminos: ' + wmRango_(filas);
  if (vencidos.length)  msg += '\n\nYa vencidos, fuera del archivo (' + vencidos.length + '):\n' + vencidos.slice(0, 10).join('\n');
  if (sinFecha.length)  msg += '\n\nSin fecha de termino, fuera del archivo (' + sinFecha.length + '):\n' + sinFecha.slice(0, 10).join('\n');
  if (sinPrecio.length) msg += '\n\nSin precio en "' + nombreHoja + '" (' + sinPrecio.length + '), captura el precio a mano:\n' + sinPrecio.slice(0, 10).join('\n');
  wmAviso_('Killers', msg);
}

/** Rango de fechas de termino de un lote, para que se vea de un vistazo. */
function wmRango_(filas) {
  var min = null, max = null;
  filas.forEach(function (f) {
    if (!min || f.fin < min) min = f.fin;
    if (!max || f.fin > max) max = f.fin;
  });
  if (!min) return '(sin fechas)';
  var a = wmFmt_(min), b = wmFmt_(max);
  return a === b ? a + ' (todos igual)' : a + '  a  ' + b;
}

function wmNotaHoja_(hoja) {
  try { return hoja.getRange(1, 1).getNote(); } catch (e) { return ''; }
}

/** Llena la hoja a partir de una lista de SKUs pegada (killers / ofertas). */
function wmPegarSkus() {
  var ss = SpreadsheetApp.getActive();
  var ui = SpreadsheetApp.getUi();

  var hojas = wmHojasDePrecios_(ss);
  var r1 = ui.prompt('Hoja de precios de referencia',
    'De aqui se toma el precio base.\nEscribe el numero:\n\n' +
    hojas.map(function (h, i) { return (i + 1) + ') ' + h; }).join('\n'),
    ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var idx = parseInt(String(r1.getResponseText()).trim(), 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= hojas.length) throw new Error('Numero invalido.');
  var nombreHoja = hojas[idx];

  var r2 = ui.prompt('SKUs',
    'Pega los SKUs de Walmart separados por coma, espacio o salto de linea.\n' +
    'Puedes pegarlos con -MSI, -MSI-2, etc.',
    ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;

  var lista = String(r2.getResponseText()).split(/[\s,;]+/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 3; });
  if (!lista.length) throw new Error('No pegaste ningun SKU.');

  // Si existe la hoja Variantes, se jalan tambien los alternos de cada familia:
  // asi al cambiarle el precio a uno se le cambia a todas sus publicaciones.
  var pedidos = lista.length;
  if (typeof variantesExpandir_ === 'function') {
    try {
      var conFamilia = variantesExpandir_(lista);
      if (conFamilia.length > lista.length) {
        var rf = ui.alert('Variantes',
          'De los ' + pedidos + ' SKUs que pegaste, sus familias suman ' +
          conFamilia.length + ' publicaciones.\n\n' +
          'Incluir todas las variantes y alternas?\n' +
          '(Si dices que no, se usan solo los ' + pedidos + ' que pegaste.)',
          ui.ButtonSet.YES_NO_CANCEL);
        if (rf === ui.Button.CANCEL) return;
        if (rf === ui.Button.YES) lista = conFamilia;
      }
    } catch (e) {}
  }

  var fin = wmPreguntarFin_('SKUs especificos', wmFinTercerMes_());
  if (!fin) return;

  var datos = wmLeerPrecios_(ss, nombreHoja);
  var cat = wmCatalogo_(ss);
  var sinPrecio = [];

  var filas = lista.map(function (skuWm) {
    var base = wmBase_(skuWm);
    var d = datos.mapa[base];
    if (!d) sinPrecio.push(skuWm);
    var esPremium = wmEsPremium_(skuWm);
    return {
      skuWalmart: skuWm,
      base: base,
      producto: d ? d.producto : '',
      categoria: cat[base] || '',
      stock: d ? d.stock : '',
      canal: esPremium ? 'Premium' : 'Clasica',
      precio: d ? (esPremium ? d.premium : d.clasica) : '',
      fin: fin
    };
  });

  wmEscribirHoja_(ss, filas, nombreHoja);
  wmMarcarTodo_(true);

  var msg = filas.length + ' SKUs cargados y marcados' +
            (filas.length > pedidos ? ' (pegaste ' + pedidos + ', el resto son sus variantes)' : '') + '.';
  if (sinPrecio.length) {
    msg += '\n\nSin precio en "' + nombreHoja + '" (' + sinPrecio.length + '):\n' +
           sinPrecio.slice(0, 15).join('\n');
  }
  wmAviso_('Cambio Walmart', msg);
}

function wmEscribirHoja_(ss, filas, origen) {
  var h = ss.getSheetByName(HOJA_WM);
  if (!h) h = ss.insertSheet(HOJA_WM);

  wmQuitarFiltro_(h);
  h.clear();
  h.clearNotes();
  try { h.getRange(1, 1, h.getMaxRows(), h.getMaxColumns()).clearDataValidations(); } catch (e) {}

  var nCols = WM_ENCABEZADOS.length;
  var sobranC = h.getMaxColumns() - nCols;
  if (sobranC > 0) h.deleteColumns(nCols + 1, sobranC);
  if (sobranC < 0) h.insertColumnsAfter(h.getMaxColumns(), -sobranC);

  var quiero = Math.max(filas.length + 1, 50);
  var sobranF = h.getMaxRows() - quiero;
  if (sobranF > 0) h.deleteRows(quiero + 1, sobranF);
  if (sobranF < 0) h.insertRowsAfter(h.getMaxRows(), -sobranF);

  h.getRange(1, 1, 1, nCols).setValues([WM_ENCABEZADOS])
   .setFontWeight('bold').setBackground('#eef2f7');
  h.setFrozenRows(1);
  h.setFrozenColumns(2);

  if (!filas.length) return;

  var ini = wmAhoraMasMinutos_(WM_MIN_ADELANTO);
  var finDef = wmFinTercerMes_();

  var cuerpo = filas.map(function (f) {
    return [
      false, f.skuWalmart, f.base, f.producto, f.categoria, f.stock,
      f.canal, f.precio, 1, '', (f.manual || ''), '', '', ini, (f.fin || finDef)
    ];
  });
  h.getRange(2, 1, cuerpo.length, nCols).setValues(cuerpo);

  var n = cuerpo.length;
  // PRECIO CALC = ENTERO(SITE * FACTOR / 10) * 10 + 9
  h.getRange(2, WM_COL.CALC, n, 1).setFormulaR1C1(
    '=IF(OR(RC[-2]="",RC[-1]=""),"",INT(RC[-2]*RC[-1]/10)*10+9)');
  // PRECIO FINAL = manual si hay, si no el calculado
  h.getRange(2, WM_COL.FINAL, n, 1).setFormulaR1C1(
    '=IF(RC[-1]<>"",RC[-1],IF(RC[-2]="","",RC[-2]))');
  // TACHADO = FINAL * 1.3
  h.getRange(2, WM_COL.TACHADO, n, 1).setFormulaR1C1(
    '=IF(RC[-1]="","",ROUND(RC[-1]*' + WM_MULT_TACHADO + ',2))');

  h.getRange(2, WM_COL.CHK, n, 1).insertCheckboxes();
  h.getRange(2, WM_COL.CANAL, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Clasica', 'Premium'], true).build());

  h.getRange(2, WM_COL.SITE, n, 1).setNumberFormat('#,##0.00');
  h.getRange(2, WM_COL.FACTOR, n, 1).setNumberFormat('0.000');
  h.getRange(2, WM_COL.CALC, n, 3).setNumberFormat('#,##0.00');
  h.getRange(2, WM_COL.TACHADO, n, 1).setNumberFormat('#,##0.00');
  h.getRange(2, WM_COL.INI, n, 2).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  h.getRange(2, WM_COL.STOCK, n, 1).setNumberFormat('#,##0');

  h.getRange(1, 1, 1, nCols).createFilter();
  h.getRange(1, 1).setNote('Origen: ' + origen + '\nGenerado: ' +
    Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm'));

  SpreadsheetApp.flush();
  h.autoResizeColumns(1, nCols);
  if (h.getColumnWidth(WM_COL.PROD) > 380) h.setColumnWidth(WM_COL.PROD, 380);
  h.setColumnWidth(WM_COL.CHK, 40);
  ss.setActiveSheet(h);
}

/* ================================================================== */
/*  2. Seleccion                                                       */
/* ================================================================== */

/** Marca las filas visibles (o sea, lo que dejo el filtro). */
function wmMarcarFiltrados() { wmMarcarVisibles_(true); }
function wmDesmarcarFiltrados() { wmMarcarVisibles_(false); }
function wmMarcarTodo() { wmMarcarTodo_(true); }
function wmDesmarcarTodo() { wmMarcarTodo_(false); }

function wmMarcarVisibles_(valor) {
  var h = wmHoja_();
  var n = h.getLastRow() - 1;
  if (n < 1) return;
  var rango = h.getRange(2, WM_COL.CHK, n, 1);
  var actual = rango.getValues();
  var cambios = 0;
  for (var i = 0; i < n; i++) {
    if (!h.isRowHiddenByFilter(i + 2)) { actual[i][0] = valor; cambios++; }
  }
  rango.setValues(actual);
  SpreadsheetApp.getActive().toast(cambios + ' filas ' + (valor ? 'marcadas' : 'desmarcadas'), 'Cambio Walmart', 5);
}

function wmMarcarTodo_(valor) {
  var h = wmHoja_();
  var n = h.getLastRow() - 1;
  if (n < 1) return;
  var arr = [];
  for (var i = 0; i < n; i++) arr.push([valor]);
  h.getRange(2, WM_COL.CHK, n, 1).setValues(arr);
}

/** Marca por texto: sirve para categoria, marca, o cualquier palabra del producto. */
function wmMarcarPorTexto() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Marcar por texto',
    'Escribe la categoria, la marca o una palabra del nombre.\n' +
    'Se marcan las filas que la contengan (en CATEGORIA, PRODUCTO o SKU).\n' +
    'Puedes poner varias separadas por coma.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;

  var claves = String(r.getResponseText()).split(',')
    .map(function (s) { return s.trim().toUpperCase(); })
    .filter(function (s) { return s; });
  if (!claves.length) return;

  var h = wmHoja_();
  var n = h.getLastRow() - 1;
  if (n < 1) return;

  var d = h.getRange(2, 1, n, WM_ENCABEZADOS.length).getValues();
  var chk = [];
  var hits = 0;
  for (var i = 0; i < n; i++) {
    var texto = (String(d[i][WM_COL.SKU - 1]) + ' ' + String(d[i][WM_COL.PROD - 1]) + ' ' +
                 String(d[i][WM_COL.CAT - 1])).toUpperCase();
    var pega = claves.some(function (k) { return texto.indexOf(k) >= 0; });
    if (pega) hits++;
    chk.push([pega ? true : d[i][WM_COL.CHK - 1] === true]);
  }
  h.getRange(2, WM_COL.CHK, n, 1).setValues(chk);
  SpreadsheetApp.getActive().toast(hits + ' filas coincidieron', 'Cambio Walmart', 5);
}

/* ================================================================== */
/*  3. Precio y fechas                                                 */
/* ================================================================== */

/** Aplica un factor a las filas marcadas. 1 = 100%, 0.98 = 98%. */
function wmAplicarFactor() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Factor de precio',
    'Escribe el porcentaje sobre el precio del site.\n\n' +
    '1     = 100% (el precio tal cual)\n' +
    '0.98  = 98%\n' +
    '0.9   = 90%\n\n' +
    'Se aplica solo a las filas marcadas. Despues se redondea al entero que termina en 9.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;

  var f = parseFloat(String(r.getResponseText()).replace(',', '.'));
  if (isNaN(f) || f <= 0 || f > 5) throw new Error('Factor invalido: ' + r.getResponseText());

  var h = wmHoja_();
  var n = h.getLastRow() - 1;
  if (n < 1) return;

  var chk = h.getRange(2, WM_COL.CHK, n, 1).getValues();
  var col = h.getRange(2, WM_COL.FACTOR, n, 1).getValues();
  var c = 0;
  for (var i = 0; i < n; i++) if (chk[i][0] === true) { col[i][0] = f; c++; }
  h.getRange(2, WM_COL.FACTOR, n, 1).setValues(col);
  SpreadsheetApp.getActive().toast('Factor ' + f + ' aplicado a ' + c + ' filas', 'Cambio Walmart', 5);
}

/** Pone inicio = ahora + 5 min y el fin que le digas, en las filas marcadas. */
function wmAplicarFechas() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActive();

  var r = ui.prompt('Fecha de termino (hora de Mexico)',
    'Formato: AAAA-MM-DD HH:MM\n\n' +
    'El inicio se pone solo: ahora + ' + WM_MIN_ADELANTO + ' minutos.\n' +
    'Al generar el archivo, las dos se convierten a UTC (+' + WM_HORAS_UTC + ' h).\n\n' +
    'Sugerida: ' + wmFmt_(wmFinTercerMes_()) + '  -> ' + wmFmtUtc_(wmFinTercerMes_()) + ' UTC',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;

  var txt = String(r.getResponseText()).trim() || wmFmt_(wmFinTercerMes_());
  var fin = wmParsearFecha_(txt);
  if (!fin) throw new Error('No entendi la fecha: ' + txt);

  var ini = wmAhoraMasMinutos_(WM_MIN_ADELANTO);

  var h = wmHoja_();
  var n = h.getLastRow() - 1;
  if (n < 1) return;

  var chk = h.getRange(2, WM_COL.CHK, n, 1).getValues();
  var cols = h.getRange(2, WM_COL.INI, n, 2).getValues();
  var c = 0;
  for (var i = 0; i < n; i++) if (chk[i][0] === true) { cols[i][0] = ini; cols[i][1] = fin; c++; }
  h.getRange(2, WM_COL.INI, n, 2).setValues(cols);
  h.getRange(2, WM_COL.INI, n, 2).setNumberFormat('yyyy-mm-dd hh:mm:ss');

  SpreadsheetApp.getActive().toast('Fechas puestas en ' + c + ' filas', 'Cambio Walmart', 5);
}

/* ================================================================== */
/*  4. Generar el archivo                                              */
/* ================================================================== */

function wmGenerarArchivo() {
  var ss = SpreadsheetApp.getActive();
  var h = wmHoja_();
  var n = h.getLastRow() - 1;
  if (n < 1) throw new Error('La hoja "' + HOJA_WM + '" esta vacia.');

  var d = h.getRange(2, 1, n, WM_ENCABEZADOS.length).getValues();
  var filas = [];
  var errores = [];

  for (var i = 0; i < n; i++) {
    if (d[i][WM_COL.CHK - 1] !== true) continue;
    var fila = i + 2;
    var sku   = String(d[i][WM_COL.SKU - 1] || '').trim();
    var final = d[i][WM_COL.FINAL - 1];
    var tach  = d[i][WM_COL.TACHADO - 1];
    var ini   = d[i][WM_COL.INI - 1];
    var fin   = d[i][WM_COL.FIN - 1];

    if (!sku)                       { errores.push('Fila ' + fila + ': sin SKU'); continue; }
    if (!(final > 0))               { errores.push('Fila ' + fila + ' (' + sku + '): sin precio final'); continue; }
    if (!(ini instanceof Date))     { errores.push('Fila ' + fila + ' (' + sku + '): fecha de inicio invalida'); continue; }
    if (!(fin instanceof Date))     { errores.push('Fila ' + fila + ' (' + sku + '): fecha de fin invalida'); continue; }
    if (fin <= ini)                 { errores.push('Fila ' + fila + ' (' + sku + '): el fin es antes del inicio'); continue; }

    if (!(tach > 0)) tach = Math.round(final * WM_MULT_TACHADO * 100) / 100;

    filas.push([
      '', '', '',                       // A B C vacias
      sku,                              // D sku
      '',                               // E msrp vacio
      Math.round(tach * 100) / 100,     // F price
      'Reemplazar todo',                // G promotionSettingAction
      'Rebaja',                         // H promotionType
      Math.round(final * 100) / 100,    // I promotionPrice
      wmAUtc_(ini),                     // J inicio en UTC
      wmAUtc_(fin)                      // K fin en UTC
    ]);
  }

  if (errores.length) {
    wmAviso_('No se genero el archivo', 'Revisa esto primero:\n\n' + errores.slice(0, 25).join('\n') +
      (errores.length > 25 ? '\n... y ' + (errores.length - 25) + ' mas' : ''));
    return;
  }
  if (!filas.length) throw new Error('No marcaste ninguna fila.');

  var archivo = wmConstruirXlsx_(filas);

  var tz = ss.getSpreadsheetTimeZone();
  var m0 = filas[0];
  wmAviso_('Archivo listo',
    filas.length + ' SKUs.\n\nAsi quedo el primer renglon del archivo:\n' +
    '  SKU            ' + m0[3] + '\n' +
    '  Precio (F)     ' + m0[5] + '\n' +
    '  Promo (I)      ' + m0[8] + '\n' +
    '  Inicio UTC (J) ' + Utilities.formatDate(m0[9], tz, 'yyyy-MM-dd HH:mm:ss') + '\n' +
    '  Fin UTC (K)    ' + Utilities.formatDate(m0[10], tz, 'yyyy-MM-dd HH:mm:ss') + '\n\n' +
    archivo.getName() + '\nCarpeta de Drive: "' + WM_CARPETA + '"\n' +
    archivo.getUrl());
  return archivo.getUrl();
}

function wmConstruirXlsx_(filas) {
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  var nombre = 'Walmart_Precios_' + Utilities.formatDate(new Date(), tz, 'yyyyMMdd_HHmm');

  var tmp = SpreadsheetApp.create(nombre);
  var idTmp = tmp.getId();

  try {
    tmp.setSpreadsheetTimeZone(tz);

    // --- hoja oculta ---
    var oculta = tmp.getSheets()[0].setName('Hidden_price-mp');
    wmAjustar_(oculta, WM_TPL_HIDDEN.length, 13);
    oculta.getRange(1, 1, WM_TPL_HIDDEN.length, 13).setValues(WM_TPL_HIDDEN);

    // --- hoja Price ---
    var price = tmp.insertSheet('Price');
    var totalFilas = 9 + filas.length;
    wmAjustar_(price, totalFilas, 11);

    price.getRange(1, 1, 9, 11).setValues(WM_TPL_PRICE);

    if (filas.length) {
      // Formatos identicos a los de tus archivos: D y E en General,
      // F e I en 0.00, G y H en texto, J y K como fecha-hora.
      price.getRange(10, 6, filas.length, 1).setNumberFormat('0.00');
      price.getRange(10, 7, filas.length, 2).setNumberFormat('@');
      price.getRange(10, 9, filas.length, 1).setNumberFormat('0.00');
      price.getRange(10, 10, filas.length, 2).setNumberFormat('yyyy-mm-dd hh:mm:ss');
      price.getRange(10, 1, filas.length, 11).setValues(filas);
    }

    oculta.hideSheet();
    tmp.setActiveSheet(price);
    SpreadsheetApp.flush();

    // --- exportar a xlsx ---
    var url = 'https://docs.google.com/spreadsheets/d/' + idTmp + '/export?format=xlsx';
    var resp = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) {
      throw new Error('No se pudo exportar el archivo (HTTP ' + resp.getResponseCode() + ').');
    }
    var blob = resp.getBlob().setName(nombre + '.xlsx');

    var carpeta = wmCarpeta_();
    return carpeta.createFile(blob);

  } finally {
    try { DriveApp.getFileById(idTmp).setTrashed(true); } catch (e) {}
  }
}

function wmAjustar_(hoja, filas, cols) {
  var sf = hoja.getMaxRows() - Math.max(filas, 1);
  if (sf > 0) hoja.deleteRows(Math.max(filas, 1) + 1, sf);
  if (sf < 0) hoja.insertRowsAfter(hoja.getMaxRows(), -sf);
  var sc = hoja.getMaxColumns() - cols;
  if (sc > 0) hoja.deleteColumns(cols + 1, sc);
  if (sc < 0) hoja.insertColumnsAfter(hoja.getMaxColumns(), -sc);
}

function wmCarpeta_() {
  var it = DriveApp.getFoldersByName(WM_CARPETA);
  return it.hasNext() ? it.next() : DriveApp.createFolder(WM_CARPETA);
}

/* ================================================================== */
/*  Lectura de datos                                                   */
/* ================================================================== */

function wmHojasDePrecios_(ss) {
  return ss.getSheets().filter(function (h) {
    if (h.getLastColumn() < 12 || h.getLastRow() < 2) return false;
    var enc = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0]
      .map(function (v) { return String(v || '').toLowerCase(); });
    return enc.some(function (v) { return v.indexOf('walmart') === 0 && v.indexOf('cl') > 0; });
  }).map(function (h) { return h.getName(); });
}

function wmLeerPrecios_(ss, nombre) {
  var h = ss.getSheetByName(nombre);
  if (!h) throw new Error('No existe la hoja "' + nombre + '".');

  var d = h.getRange(1, 1, h.getLastRow(), h.getLastColumn()).getValues();
  var enc = d[0].map(function (v) { return String(v || '').toLowerCase(); });

  function col(frag) {
    for (var i = 0; i < enc.length; i++) if (enc[i].indexOf(frag) >= 0) return i;
    return -1;
  }
  var cSku  = col('sku');
  var cProd = col('producto');
  var cStk  = col('stock');
  var cCla = -1, cPre = -1;
  for (var i = 0; i < enc.length; i++) {
    if (enc[i].indexOf('walmart') === 0) {
      if (enc[i].indexOf('prem') > 0) cPre = i; else cCla = i;
    }
  }
  if (cSku < 0 || cCla < 0) throw new Error('La hoja "' + nombre + '" no trae SKU o Walmart Clasica.');

  var mapa = {}, orden = [];
  for (var r = 1; r < d.length; r++) {
    var sku = String(d[r][cSku] || '').trim();
    if (!sku) continue;
    if (!mapa[sku]) orden.push(sku);
    mapa[sku] = {
      producto: cProd >= 0 ? d[r][cProd] : '',
      stock:    cStk  >= 0 ? d[r][cStk]  : '',
      clasica:  d[r][cCla],
      premium:  cPre >= 0 ? d[r][cPre] : d[r][cCla]
    };
  }
  return { mapa: mapa, orden: orden };
}

/** SKU -> CATEGORIA, desde la hoja Catalogo (Odoo). */
function wmCatalogo_(ss) {
  var h = ss.getSheetByName('Catalogo');
  var m = {};
  if (!h || h.getLastRow() < 2) return m;
  var d = h.getRange(2, 1, h.getLastRow() - 1, 4).getValues();
  for (var i = 0; i < d.length; i++) {
    var k = String(d[i][0] || '').trim();
    if (k) m[k] = d[i][3];
  }
  return m;
}

/* ================================================================== */
/*  Utilerias                                                          */
/* ================================================================== */

function wmHoja_() {
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA_WM);
  if (!h) throw new Error('No existe la hoja "' + HOJA_WM + '". Corre primero wmNuevoCambio o wmPegarSkus.');
  return h;
}

/**
 * El SKU padre: quita -MSI y -MSI-0..9 (esten donde esten, tambien antes del
 * -CVA) y el alterno de un digito del final. Conserva el -CVA.
 *   1HO-AUT111BLACK-NEG-0974-MSI    -> 1HO-AUT111BLACK-NEG-0974
 *   CAN-EF50MMF18-NEG-6871-MSI-2    -> CAN-EF50MMF18-NEG-6871
 *   PER-PC201076-NEG-1076-MSI-CVA   -> PER-PC201076-NEG-1076-CVA
 *   MSI-KATANA15-NEG-1234           -> MSI-KATANA15-NEG-1234   (la marca no se toca)
 */
function wmBase_(sku) {
  return String(sku).replace(/-MSI(-\d)?/ig, '').replace(/-(\d)$/, '');
}

/** Premium = trae -MSI en cualquier lugar. */
function wmEsPremium_(sku) {
  return /-MSI(-\d)?/i.test(String(sku));
}
/** Suma las 6 horas para dejarlo en UTC, conservando los componentes. */
function wmAUtc_(fecha) {
  return new Date(fecha.getTime() + WM_HORAS_UTC * 3600 * 1000);
}

function wmAhoraMasMinutos_(min) {
  var d = new Date(Date.now() + min * 60 * 1000);
  d.setSeconds(0, 0);
  return d;
}

/**
 * Cambio masivo general.
 * En el archivo tiene que quedar el PRIMER DIA DEL TERCER MES SIGUIENTE a las
 * 05:59 UTC. Como la hoja guarda hora de Mexico y al generar se le suman 6 h,
 * aqui se devuelve el dia anterior a las 23:59 de Mexico, que es lo mismo.
 *   hoy 2026-09-08  ->  hoja 2026-11-30 23:59 MX  ->  archivo 2026-12-01 05:59 UTC
 */
function wmFinTercerMes_() {
  var h = new Date();
  var primero = new Date(h.getFullYear(), h.getMonth() + 3, 1, 0, 0, 0, 0);
  return new Date(primero.getTime() - 60 * 1000);
}

function wmFmt_(d) {
  return Utilities.formatDate(d, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
}

/** Como se va a ver en el archivo: hora de Mexico + 6 h. */
function wmFmtUtc_(d) {
  return Utilities.formatDate(wmAUtc_(d),
    SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

/** Muestra la fecha sugerida y deja cambiarla. Devuelve null si cancela. */
function wmPreguntarFin_(titulo, sugerida) {
  var ui = SpreadsheetApp.getUi();
  var sug = wmFmt_(sugerida);
  var r = ui.prompt(titulo + ' - fecha de termino',
    'Hora de Mexico. Formato AAAA-MM-DD HH:MM\n' +
    'Deja el campo vacio para usar la sugerida.\n\n' +
    'Sugerida (Mexico): ' + sug + '\n' +
    'En el archivo:     ' + wmFmtUtc_(sugerida) + '  UTC',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return null;
  var txt = String(r.getResponseText()).trim();
  if (!txt) return sugerida;
  var d = wmParsearFecha_(txt);
  if (!d) throw new Error('No entendi la fecha: ' + txt);
  return d;
}

function wmParsearFecha_(txt) {
  var m = String(txt).trim()
    .match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 23, m[5] ? +m[5] : 59, m[6] ? +m[6] : 0, 0);
}

function wmQuitarFiltro_(hoja) {
  try { var f = hoja.getFilter(); if (f) f.remove(); } catch (e) {}
}

function wmAviso_(titulo, msg) {
  try { SpreadsheetApp.getUi().alert(titulo, msg, SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) { Logger.log(titulo + '\n' + msg); }
}
