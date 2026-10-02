/**
 * WalmartPrecios.gs — Site Sheet
 *
 * Genera el archivo de la plantilla oficial de Walmart (PRICE_AND_PROMOTION)
 * para subir cambios de precio y promociones.
 *
 * Flujo:
 *   1) wmNuevoCambio()        pregunta el tipo de cambio y arma la hoja
 *                             "Cambio Walmart":
 *                               1 masivo general -> todas las publicaciones de la hoja
 *                                                  Walmart, alternas incluidas; fin = primer dia del 3er mes
 *                                                        siguiente a las 05:59 UTC
 *                                                        (23:59 de Mexico del dia anterior)
 *                               2 killers        -> precio = NEGOCIADO; fin = el que trae cada killer del site
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
/* Factor de reduccion por default. 0.98 = 98% del precio del site.
   Es el ajuste que el dueno hacia a mano en la columna U de la hoja EXPORTAR
   del libro CAMBIO DE PRECIOS WALMART 2026: U = ENTERO(normal * 0.98 / 10) * 10 + 9.
   Comprobado contra 1,621 filas de ese libro: factor exacto en todas. */
var WM_FACTOR_DEF  = 0.98;
var WM_CARPETA     = 'Archivos Walmart';
var WM_HOJA_KILLERS = 'Killers';

var WM_ENCABEZADOS = [
  '\u2713', 'SKU WALMART', 'SKU BASE', 'PRODUCTO', 'CATEGORIA', 'STOCK',
  'CANAL', 'PRECIO SITE', 'FACTOR', 'PRECIO CALC', 'PRECIO MANUAL',
  'PRECIO FINAL', 'TACHADO', 'INICIO (MX)', 'FIN (MX)'
];
/* Nombre corto -> encabezado. WM_COL (posiciones al ESCRIBIR) sale de
   WM_ENCABEZADOS; al LEER la hoja se usa wmIdx_(), por encabezado, porque
   en "Cambio Walmart" se edita a mano y alguien puede mover columnas. */
var WM_NOMBRE = {
  CHK: '\u2713', SKU: 'SKU WALMART', BASE: 'SKU BASE', PROD: 'PRODUCTO', CAT: 'CATEGORIA',
  STOCK: 'STOCK', CANAL: 'CANAL', SITE: 'PRECIO SITE', FACTOR: 'FACTOR', CALC: 'PRECIO CALC',
  MANUAL: 'PRECIO MANUAL', FINAL: 'PRECIO FINAL', TACHADO: 'TACHADO', INI: 'INICIO (MX)', FIN: 'FIN (MX)'
};
var WM_COL = (function () {
  var o = {};
  Object.keys(WM_NOMBRE).forEach(function (k) { o[k] = WM_ENCABEZADOS.indexOf(WM_NOMBRE[k]) + 1; });
  return o;
})();

/** Columnas (1-based) de la hoja "Cambio Walmart" TAL COMO ESTA. Si falta una: ERROR y se detiene. */
function wmIdx_(h) {
  var m = colsHoja_(h, Object.keys(WM_NOMBRE).map(function (k) { return WM_NOMBRE[k]; }));
  var o = {};
  Object.keys(WM_NOMBRE).forEach(function (k) { o[k] = m[WM_NOMBRE[k]] + 1; });
  return o;
}

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

/* --- Modo 1: cambio masivo general ---
 * Se arma con TODAS las publicaciones de la hoja Walmart (ya sin bloqueados),
 * no con la lista de precios: asi entran tambien las repetidas.
 *   <base>, <base>-2, -3 ...         -> precio Walmart Clasica de <base>
 *   <base>-MSI, -MSI-2, -MSI-3 ...   -> precio Walmart Premium de <base>
 * Se elige la banda (Minimo / Normal / Maximo) y se juntan las hojas de esa
 * banda (EM + CVA), porque los -CVA viven en la hoja CVA.
 * --------------------------------------------------------------------- */
function wmModoMasivo_() {
  var ss = SpreadsheetApp.getActive();
  var ui = SpreadsheetApp.getUi();

  var banda = wmElegirBanda_(ss, 'Banda de precios', '');
  if (!banda) return;

  var fin = wmPreguntarFin_('Cambio masivo general', wmFinTercerMes_());
  if (!fin) return;

  var datos = wmLeerVarias_(ss, banda.hojas);
  var cat = wmCatalogo_(ss);
  var pubs = wmPublicaciones_(ss);

  var existe = wmExiste_(datos, cat);
  var filas = [], sinPrecio = [], alternas = 0;
  pubs.forEach(function (pub) {
    var base = skuBase_(pub.sku, existe);
    var p = datos.mapa[base];
    if (!p) { sinPrecio.push(pub.sku); return; }
    var prem = skuEsPremium_(pub.sku);
    if (skuEsAlterna_(pub.sku, existe)) alternas++;
    filas.push({
      skuWalmart: pub.sku,
      base: base,
      producto: p.producto || pub.nombre,
      categoria: cat[base] || '',
      stock: p.stock,
      canal: prem ? 'Premium' : 'Clasica',
      precio: prem ? p.premium : p.clasica,
      fin: fin
    });
  });
  if (!filas.length) throw new Error('Ninguna publicacion de Walmart encontro precio en ' + banda.hojas.join(' + ') + '.');

  // Cada familia junta: base, sus alternas, y luego su premium con las suyas.
  filas.sort(function (a, b) {
    if (a.base !== b.base) return a.base < b.base ? -1 : 1;
    if (a.canal !== b.canal) return a.canal === 'Clasica' ? -1 : 1;
    return a.skuWalmart < b.skuWalmart ? -1 : 1;
  });

  wmEscribirHoja_(ss, filas, banda.etiqueta + ' / masivo');
  var msg = filas.length + ' publicaciones de Walmart con precio ' + banda.etiqueta + ' (' + alternas + ' son repetidas -2, -MSI-2...).\n' +
            'Termina ' + wmFmt_(fin) + '.\n\nMarca las que quieras subir y genera el archivo.';
  if (sinPrecio.length) {
    msg += '\n\nSin precio en el site, fuera de la hoja (' + sinPrecio.length + '):\n' +
           sinPrecio.slice(0, 15).join('\n') + (sinPrecio.length > 15 ? '\n...' : '');
  }
  wmAviso_('Cambio masivo', msg);
}

/** Pregunta la banda (Minimo / Normal / Maximo). Devuelve {etiqueta, hojas} o null si cancela. */
function wmElegirBanda_(ss, titulo, intro) {
  var ui = SpreadsheetApp.getUi();
  var bandas = wmBandas_(wmHojasDePrecios_(ss));
  if (!bandas.length) throw new Error('No encontre hojas de precios (las que traen la columna "Walmart Clasica").');
  var r = ui.prompt(titulo,
    (intro ? intro + '\n' : '') + 'Escribe el numero:\n\n' + bandas.map(function (b, i) {
      return (i + 1) + ') ' + b.etiqueta + '   (' + b.hojas.join(' + ') + ')';
    }).join('\n'),
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return null;
  var idx = parseInt(String(r.getResponseText()).trim(), 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= bandas.length) throw new Error('Numero invalido.');
  return bandas[idx];
}

/** Agrupa las hojas de precios por banda: "Precios EM Minimo" + "Precios CVA Minimo" -> Minimo. */
function wmBandas_(hojas) {
  var orden = [], mapa = {};
  hojas.forEach(function (n) {
    var k = String(n).replace(/\b(EM|CVA)\b/ig, ' ').replace(/^\s*Precios\s*/i, '').replace(/\s+/g, ' ').trim() || n;
    if (!mapa[k]) { mapa[k] = { etiqueta: k, hojas: [] }; orden.push(k); }
    mapa[k].hojas.push(n);
  });
  return orden.map(function (k) { return mapa[k]; });
}

/** ¿Este SKU existe tal cual en precios o en Catalogo? Para no quitarle un -1 que es suyo. */
function wmExiste_(datos, cat) {
  return function (x) { return !!datos.mapa[x] || (cat && cat[x] !== undefined); };
}

/** Junta varias hojas de precios en un solo mapa SKU -> precios. */
function wmLeerVarias_(ss, nombres) {
  var mapa = {}, orden = [];
  nombres.forEach(function (n) {
    var d = wmLeerPrecios_(ss, n);
    d.orden.forEach(function (sku) {
      if (!mapa[sku]) orden.push(sku);
      mapa[sku] = d.mapa[sku];
    });
  });
  return { mapa: mapa, orden: orden };
}

/** Las publicaciones vivas: la hoja Walmart (ya sin bloqueados). Por encabezado. */
function wmPublicaciones_(ss) {
  var h = ss.getSheetByName('Walmart');
  if (!h || h.getLastRow() < 2) throw new Error('Falta la hoja "Walmart". Corre primero wmWalmartBajar().');
  var c = colsHoja_(h, ['SKU'], ['NOMBRE']);
  var d = h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues();
  var out = [], visto = {};
  d.forEach(function (f) {
    var sku = String(f[c.SKU] || '').trim();
    if (!sku || visto[sku.toUpperCase()] || /^(RES|WL|OB)-/i.test(sku)) return;
    visto[sku.toUpperCase()] = 1;
    out.push({ sku: sku, nombre: c.NOMBRE >= 0 ? f[c.NOMBRE] : '' });
  });
  return out;
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

  // 2. Banda de referencia (solo para comparar; el precio que va es el NEGOCIADO).
  var banda = wmElegirBanda_(ss, 'Precios de referencia',
    'Solo para comparar: el precio que va al archivo es el NEGOCIADO.');
  if (!banda) return;
  var nombreHoja = banda.etiqueta;

  // 3. Mapear columnas de la hoja Killers.
  // Por encabezado EXACTO: "SKU" no debe confundirse con "SKU BASE".
  // El precio del killer es el NEGOCIADO con el KAM: ese es el que va al archivo.
  var kc = colsHoja_(k, ['SKU', 'TERMINA', 'NEGOCIADO'], ['TITULO']);
  var cSku = kc.SKU, cTit = kc.TITULO, cFin = kc.TERMINA, cNeg = kc.NEGOCIADO;
  if (cSku < 0) throw new Error('La hoja "' + WM_HOJA_KILLERS + '" no trae columna SKU.');
  if (cFin < 0) throw new Error('La hoja "' + WM_HOJA_KILLERS + '" no trae columna TERMINA. ' +
                                'Corre killersVerEstructura() y mandame la salida.');

  var datos = wmLeerVarias_(ss, banda.hojas);
  var cat = wmCatalogo_(ss);
  var existe = wmExiste_(datos, cat);
  var d = k.getRange(2, 1, k.getLastRow() - 1, k.getLastColumn()).getValues();
  var ahora = new Date();

  var filas = [], sinFecha = [], vencidos = [], sinPrecio = [], sinNegociado = [];

  for (var i = 0; i < d.length; i++) {
    var sku = String(d[i][cSku] || '').trim();
    if (!sku) continue;

    var fin = d[i][cFin];
    if (!(fin instanceof Date) || isNaN(fin.getTime())) { sinFecha.push(sku); continue; }
    if (fin <= ahora) { vencidos.push(sku); continue; }

    var base = wmBase_(sku, existe);
    var p = datos.mapa[base];
    if (!p) sinPrecio.push(sku);
    var esPremium = wmEsPremium_(sku);
    var neg = Number(d[i][cNeg]);
    if (!(neg > 0)) sinNegociado.push(sku);

    filas.push({
      skuWalmart: sku,
      base: base,
      producto: (cTit >= 0 && d[i][cTit]) ? d[i][cTit] : (p ? p.producto : ''),
      categoria: cat[base] || '',
      stock: p ? p.stock : '',
      canal: esPremium ? 'Premium' : 'Clasica',
      precio: p ? (esPremium ? p.premium : p.clasica) : '',
      manual: neg > 0 ? neg : '',
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
            'Precio = NEGOCIADO de la hoja Killers. Cada uno se lleva su propia fecha de termino del site.\n\n' +
            'Rango de terminos: ' + wmRango_(filas);
  if (vencidos.length)  msg += '\n\nYa vencidos, fuera del archivo (' + vencidos.length + '):\n' + vencidos.slice(0, 10).join('\n');
  if (sinFecha.length)  msg += '\n\nSin fecha de termino, fuera del archivo (' + sinFecha.length + '):\n' + sinFecha.slice(0, 10).join('\n');
  if (sinNegociado.length) msg += '\n\nSin NEGOCIADO en la hoja Killers (' + sinNegociado.length + '), quedan con el precio del site; revisalos:\n' + sinNegociado.slice(0, 10).join('\n');
  if (sinPrecio.length) msg += '\n\nSin precio en "' + nombreHoja + '" (' + sinPrecio.length + '), solo informativo:\n' + sinPrecio.slice(0, 10).join('\n');
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

  var banda = wmElegirBanda_(ss, 'Banda de precios', 'De aqui se toma el precio base.');
  if (!banda) return;
  var nombreHoja = banda.etiqueta;

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

  var datos = wmLeerVarias_(ss, banda.hojas);
  var cat = wmCatalogo_(ss);
  var existe = wmExiste_(datos, cat);
  var sinPrecio = [];

  var filas = lista.map(function (skuWm) {
    var base = wmBase_(skuWm, existe);
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
      f.canal, f.precio, WM_FACTOR_DEF, '', (f.manual || ''), '', '', ini, (f.fin || finDef)
    ];
  });
  h.getRange(2, 1, cuerpo.length, nCols).setValues(cuerpo);

  var n = cuerpo.length;
  // PRECIO CALC = ENTERO(SITE * FACTOR / 10) * 10 + 9
  var Lw = function (k) { return colLetra_(WM_COL[k]) + '2'; };
  h.getRange(2, WM_COL.CALC, n, 1).setFormula(
    '=IF(OR(' + Lw('SITE') + '="",' + Lw('FACTOR') + '=""),"",INT(' + Lw('SITE') + '*' + Lw('FACTOR') + '/10)*10+9)');
  // PRECIO FINAL = manual si hay, si no el calculado
  h.getRange(2, WM_COL.FINAL, n, 1).setFormula(
    '=IF(' + Lw('MANUAL') + '<>"",' + Lw('MANUAL') + ',IF(' + Lw('CALC') + '="","",' + Lw('CALC') + '))');
  // TACHADO = FINAL * 1.3
  h.getRange(2, WM_COL.TACHADO, n, 1).setFormula(
    '=IF(' + Lw('FINAL') + '="","",ROUND(' + Lw('FINAL') + '*' + WM_MULT_TACHADO + ',2))');

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
  var C = wmIdx_(h);   // por encabezado
  var n = h.getLastRow() - 1;
  if (n < 1) return;
  var rango = h.getRange(2, C.CHK, n, 1);
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
  var C = wmIdx_(h);   // por encabezado
  var n = h.getLastRow() - 1;
  if (n < 1) return;
  var arr = [];
  for (var i = 0; i < n; i++) arr.push([valor]);
  h.getRange(2, C.CHK, n, 1).setValues(arr);
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
  var C = wmIdx_(h);   // por encabezado
  var n = h.getLastRow() - 1;
  if (n < 1) return;

  var d = h.getRange(2, 1, n, h.getLastColumn()).getValues();
  var chk = [];
  var hits = 0;
  for (var i = 0; i < n; i++) {
    var texto = (String(d[i][C.SKU - 1]) + ' ' + String(d[i][C.PROD - 1]) + ' ' +
                 String(d[i][C.CAT - 1])).toUpperCase();
    var pega = claves.some(function (k) { return texto.indexOf(k) >= 0; });
    if (pega) hits++;
    chk.push([pega ? true : d[i][C.CHK - 1] === true]);
  }
  h.getRange(2, C.CHK, n, 1).setValues(chk);
  SpreadsheetApp.getActive().toast(hits + ' filas coincidieron', 'Cambio Walmart', 5);
}

/* ================================================================== */
/*  3. Precio y fechas                                                 */
/* ================================================================== */

/** Aplica un factor a las filas marcadas. 1 = 100%; el estandar es WM_FACTOR_DEF. */
function wmAplicarFactor() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Factor de precio',
    'Escribe el porcentaje sobre el precio del site.\n\n' +
    '1     = 100% (el precio tal cual)\n' +
    WM_FACTOR_DEF + '  = ' + Math.round(WM_FACTOR_DEF * 100) + '%  (el estandar)\n' +
    '0.9   = 90%\n\n' +
    'Se aplica solo a las filas marcadas. Despues se redondea al entero que termina en 9.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;

  var f = parseFloat(String(r.getResponseText()).replace(',', '.'));
  if (isNaN(f) || f <= 0 || f > 5) throw new Error('Factor invalido: ' + r.getResponseText());

  var h = wmHoja_();
  var C = wmIdx_(h);   // por encabezado
  var n = h.getLastRow() - 1;
  if (n < 1) return;

  var chk = h.getRange(2, C.CHK, n, 1).getValues();
  var col = h.getRange(2, C.FACTOR, n, 1).getValues();
  var c = 0;
  for (var i = 0; i < n; i++) if (chk[i][0] === true) { col[i][0] = f; c++; }
  h.getRange(2, C.FACTOR, n, 1).setValues(col);
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
  var C = wmIdx_(h);   // por encabezado
  var n = h.getLastRow() - 1;
  if (n < 1) return;

  var chk = h.getRange(2, C.CHK, n, 1).getValues();
  var cols = h.getRange(2, C.INI, n, 2).getValues();
  var c = 0;
  for (var i = 0; i < n; i++) if (chk[i][0] === true) { cols[i][0] = ini; cols[i][1] = fin; c++; }
  h.getRange(2, C.INI, n, 2).setValues(cols);
  h.getRange(2, C.INI, n, 2).setNumberFormat('yyyy-mm-dd hh:mm:ss');

  SpreadsheetApp.getActive().toast('Fechas puestas en ' + c + ' filas', 'Cambio Walmart', 5);
}

/* ================================================================== */
/*  4. Generar el archivo                                              */
/* ================================================================== */

/**
 * Pregunta con que factor de reduccion se genera la plantilla y lo escribe en las
 * filas marcadas. Vacio = deja los factores que ya tiene la hoja. Cancelar = no genera.
 * Devuelve false solo si hay que abortar.
 */
function wmPreguntarFactor_(h, C, n) {
  var ui = SpreadsheetApp.getUi();

  var chk = h.getRange(2, C.CHK, n, 1).getValues();
  var fac = h.getRange(2, C.FACTOR, n, 1).getValues();
  var marcadas = [], vistos = {};
  for (var i = 0; i < n; i++) {
    if (chk[i][0] !== true) continue;
    marcadas.push(i);
    var v = fac[i][0];
    var k = (v === '' || v == null) ? '(vacio)' : String(v);
    vistos[k] = (vistos[k] || 0) + 1;
  }
  if (!marcadas.length) throw new Error('No marcaste ninguna fila.');

  var actual = Object.keys(vistos).map(function (k) {
    return k + ' en ' + vistos[k] + ' fila' + (vistos[k] === 1 ? '' : 's');
  }).join(', ');

  var r = ui.prompt('Factor de reduccion',
    marcadas.length + ' publicaciones marcadas.\n\n' +
    'Con que factor sobre el precio del site se genera?\n' +
    '  ' + WM_FACTOR_DEF + '  = ' + Math.round(WM_FACTOR_DEF * 100) + '%  (el estandar)\n' +
    '  1     = 100% (el precio tal cual)\n\n' +
    'Ahora traen: ' + actual + '\n\n' +
    'Despues se redondea al entero que termina en 9.\n' +
    'Las filas con PRECIO MANUAL no se tocan.\n\n' +
    'Vacio = dejar los factores como estan.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return false;

  var txt = String(r.getResponseText()).trim();
  if (!txt) return true;

  var f = parseFloat(txt.replace(',', '.'));
  if (isNaN(f) || f <= 0 || f > 5) throw new Error('Factor invalido: ' + txt);

  for (var j = 0; j < marcadas.length; j++) fac[marcadas[j]][0] = f;
  h.getRange(2, C.FACTOR, n, 1).setValues(fac);
  SpreadsheetApp.flush();   // sin esto se leerian los precios de antes del factor
  logInfo_('WALMART', 'Cambio de precios: factor ' + f + ' aplicado a ' + marcadas.length + ' filas antes de generar');
  return true;
}

function wmGenerarArchivo() {
  var ss = SpreadsheetApp.getActive();
  var h = wmHoja_();
  var C = wmIdx_(h);   // por encabezado
  var n = h.getLastRow() - 1;
  if (n < 1) throw new Error('La hoja "' + HOJA_WM + '" esta vacia.');

  if (wmPreguntarFactor_(h, C, n) === false) return;

  var d = h.getRange(2, 1, n, h.getLastColumn()).getValues();
  var filas = [];
  var errores = [];

  for (var i = 0; i < n; i++) {
    if (d[i][C.CHK - 1] !== true) continue;
    var fila = i + 2;
    var sku   = String(d[i][C.SKU - 1] || '').trim();
    var final = d[i][C.FINAL - 1];
    var tach  = d[i][C.TACHADO - 1];
    var ini   = d[i][C.INI - 1];
    var fin   = d[i][C.FIN - 1];

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
    if (h.getLastRow() < 2 || h.getLastColumn() < 2) return false;
    // Por encabezados, no por cuantas columnas tiene.
    var enc = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(normEnc_);
    return enc.indexOf('SKU') >= 0 && enc.indexOf(normEnc_('Walmart Clásica')) >= 0;
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
  var c = colsHoja_(h, ['SKU', 'CATEGORIA']);
  var d = h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues();
  for (var i = 0; i < d.length; i++) {
    var k = String(d[i][c.SKU] || '').trim();
    if (k) m[k] = d[i][c.CATEGORIA];
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

/** El SKU padre y el canal: misma regla de todo el libro (Config.gs, Anatomia del SKU).
 *   1HO-AUT111BLACK-NEG-0974-MSI-2  -> 1HO-AUT111BLACK-NEG-0974 (premium)
 *   PER-PC201076-NEG-1076-MSI-CVA   -> PER-PC201076-NEG-1076-CVA (premium)
 *   MSI-KATANA15-NEG-1234           -> la marca no se toca */
function wmBase_(sku, existe) { return skuBase_(sku, existe); }
function wmEsPremium_(sku) { return skuEsPremium_(sku); }

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
