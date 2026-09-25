/**
 * ============================================================
 *  Cotizador — licitaciones contra el inventario de CVA
 * ============================================================
 *
 * Flujo:
 *   1) cotNueva()     deja lista la hoja "Cotizador".
 *   2) Pegas Partida | Cantidad | Unidad | Descripcion TAL CUAL te la mandan.
 *   3) cotBuscar()    reconoce que es cada partida con la hoja "_Reglas Cotizador",
 *                     lee lo que pide la descripcion (GB de RAM, disco, DDR, watts,
 *                     pulgadas, color / blanco y negro, modelo...) y propone el SKU
 *                     de gama baja, media y alta. Todo lo que encontro queda en
 *                     "Cotizador Candidatos".
 *   4) Revisas. Cualquier SKU se puede cambiar a mano; varios separados por coma
 *      forman un equipo armado (CPU, monitor, kit).
 *   5) cotGenerar()   guarda la cotizacion en el libro de historial (otro Sheet):
 *                     Resumen + Baja + Media + Alta, con folio COT-0001...
 *                     Sin SKU, sin la palabra CVA y sin decir de que canal sale el
 *                     precio.
 *
 * El inventario es "Precios CVA Minimo": solo lo que tiene Stock Odoo > 0, y el
 * precio es su columna "Tienda Nube" (ya trae IVA).
 *
 * Gamas: entre los candidatos cuyo stock cubre la cantidad pedida, baja = el mas
 * barato, media = el de en medio, alta = uno de los mas caros (no el extremo si hay
 * muchos). Si ninguno cubre la cantidad se toma el de mas stock en las tres y la
 * cotizacion lo dice ("X de Y piezas").
 *
 * No usa permisos nuevos: el libro de historial se crea con SpreadsheetApp.
 */

var CZ = {
  HOJA:      'Cotizador',
  CAND:      'Cotizador Candidatos',
  REGLAS:    '_Reglas Cotizador',
  NOMBRES:   '_Nombres Cotizacion',
  FUENTE:    'Precios CVA Minimo',
  PROP_HIST: 'COT_HIST_ID',
  PROP_FOLIO:'COT_FOLIO',
  NOMBRE_HIST: 'Cotizaciones Electronics',
  FILA_ENC:  5,
  IVA:       0.16,
  MAX_CELDAS: 8500000,   // Google corta en 10 millones; se cambia de libro antes
  MAX_HOJAS:  180,
  MAX_CAND:   30
};

var CZ_COL = { PART: 1, CANT: 2, UNI: 3, DESC: 4, TIPO: 5, MANUAL: 6,
               BAJA: 7, MEDIA: 8, ALTA: 9, NBAJA: 10, NMEDIA: 11, NALTA: 12, NOTA: 13 };

var CZ_ENC = ['Partida', 'Cantidad', 'Unidad', 'Descripción solicitada (tal cual)',
              'Tipo detectado', 'Búsqueda manual (opcional)',
              'SKU gama baja', 'SKU gama media', 'SKU gama alta',
              'Producto baja', 'Producto media', 'Producto alta',
              'Nota para la cotización'];

var CZ_GAMAS = [ { id: 'baja', nombre: 'Baja', col: CZ_COL.BAJA },
                 { id: 'media', nombre: 'Media', col: CZ_COL.MEDIA },
                 { id: 'alta', nombre: 'Alta', col: CZ_COL.ALTA } ];

/* ================================================================== */
/*  Reglas: como se reconoce cada tipo de producto                     */
/* ================================================================== */

/**
 * Una fila por tipo de producto. Todo se puede editar en la hoja
 * "_Reglas Cotizador"; esto es solo lo que se siembra la primera vez.
 *
 * Columnas:
 *   Tipo | Se reconoce por (cualquiera) | No es este tipo si trae |
 *   Buscar en inventario (cualquiera) | El producto debe traer (todas) |
 *   Excluir productos con | Revisiones
 *
 * Las palabras van separadas por |. Se comparan como palabras completas, sin
 * acentos ni mayusculas, y aceptan plural (s / es).
 *
 * Cuando una descripcion encaja en varios tipos gana la palabra que aparece
 * PRIMERO en la descripcion: "DESKTOP ... 500GB DE DISCO DURO" es desktop, no
 * disco; "MEMORIA RAM PARA LAPTOP" es memoria, no laptop.
 *
 * Revisiones (lo que se lee de la descripcion y se exige al producto):
 *   RAM          GB de RAM del equipo, igual o mayor (si nadie cumple, lo mas cercano)
 *   ALMACEN      GB de disco del equipo, igual o mayor
 *   NUCLEOS      si pide 4 nucleos o mas, fuera Celeron / Atom / 2 nucleos
 *   MONITOR      si pide monitor y el equipo no es All in One, se le suma un monitor
 *   KIT          si pide teclado o mouse y el equipo no los trae, se suma un kit
 *   CAPACIDAD    GB del producto (discos, memorias, USB), igual o mayor
 *   DDR          DDR2 / DDR3 / DDR4 / DDR5 exacto
 *   WATTS        watts, igual o mayor
 *   PULGADAS     pulgadas, igual o mayor (tolera 21.5 por 22)
 *   COLOR        color o blanco y negro, exacto
 *   TECNOLOGIA   laser o tinta, exacto
 *   MULTIFUNCIONAL si lo pide, el producto tiene que ser multifuncional
 *   PILA         el codigo de pila (2032, 2025...) exacto
 *   MODELO       si la descripcion trae un modelo (M430F) se busca ese primero
 *   USB          si pide USB, fuera los que son solo bluetooth
 *   VA           VA de un no break, igual o mayor
 *   MARCA        si la descripcion nombra una marca (HP, Epson...), el producto tiene que ser de esa marca
 *   MODELO_ESTRICTO  como MODELO, pero si el modelo no esta no ofrece nada (consumibles:
 *                un toner de otro modelo no le sirve a su impresora)
 *
 * Los tipos sin revisiones de numeros (cables, consumibles, tablets, bocinas...)
 * se afinan con las palabras de la descripcion: "CABLE HDMI 3 METROS" se queda con
 * los cables que dicen HDMI y 3 metros; "TONER HP 58A" con los que dicen 58A o HP.
 */
var CZ_REGLAS_BASE = [
  ['Consumible de impresión',
   'toner|cartucho|cartuchos de tinta|botella de tinta|tinta para|tambor|drum|cinta para impresora|kit de mantenimiento',
   '', 'toner|cartucho|botella|tambor|tinta', '', 'impresora|multifuncional', 'MODELO_ESTRICTO|MARCA'],
  ['Laptop',
   'laptop|lap top|laptops|notebook|portatil|computadora portatil|computadoras portatiles|equipo portatil|equipo de computo portatil|ultrabook|chromebook|netbook|computadora movil|macbook',
   'funda|mochila|maletin|cargador|base para|soporte para|bateria para|pantalla para',
   'laptop|notebook|ultrabook|chromebook|macbook', '',
   'funda|mochila|maletin|soporte|cooler|enfriador|cargador|adaptador|cable|candado|limpiador|bolsa|sleeve|protector|hub|docking|pantalla para|toallas|memoria|sodimm|unidad de estado',
   'RAM|ALMACEN|NUCLEOS'],
  ['Desktop',
   'desktop|desktops|computadora de escritorio|computadoras de escritorio|equipo de escritorio|pc de escritorio|computadora personal|equipo de computo|computadora|computo|todo en uno|all in one|aio|mini pc|estacion de trabajo|workstation|cpu|pc',
   '', 'aio|all in one|todo en uno|pc|mini pc|desktop|thinkcentre|optiplex|prodesk|elitedesk|vostro|nuc|workstation|computadora', '',
   'disipador|funda|gabinete|fuente|pasta|limpiador|toallas|kit|cable|laptop|notebook|tablet|monitor|adaptador|tarjeta madre|tarjeta de video|unidad de estado|estado solido|ventilador|no break|regulador|mochila|maletin|smartphone|memoria|sodimm|procesador amd|procesador intel',
   'RAM|ALMACEN|NUCLEOS|MONITOR|KIT'],
  ['Monitor',
   'monitor|monitores|pantalla|display|monitor led|monitor lcd',
   'soporte|brazo|base para',
   'monitor', '',
   'soporte|brazo|cable|limpiador|toallas|no break|ups|monitoreo|camara web|kit',
   'PULGADAS|MODELO'],
  ['Impresora térmica / tickets',
   'impresora termica|impresoras termicas|impresora de tickets|impresora de ticket|miniprinter|mini printer|impresora de etiquetas|impresora de recibos|impresora punto de venta|impresora pos',
   '', 'termica|tickets|ticket|etiquetas|miniprinter|recibos|punto de venta', 'impresora',
   'papel|rollo|cinta|etiqueta adhesiva|etiquetas adhesivas|cabezal', 'MODELO'],
  ['Impresora',
   'impresora|impresoras|multifuncional|multifuncion|equipo multifuncional|printer|copiadora|fotocopiadora|impresion laser|impresora laser',
   '',
   'impresora|multifuncional', '',
   'toner|cartucho|tambor|botella|papel|rollo|termica|termico|etiqueta|cable|cabezal|cinta|kit de mantenimiento|refaccion',
   'COLOR|TECNOLOGIA|MULTIFUNCIONAL|MODELO'],
  ['Escáner',
   'escaner|scanner|digitalizador',
   '', 'escaner|scanner', '', 'impresora|multifuncional|cable', 'MODELO'],
  ['Disco externo',
   'disco duro externo|disco externo|disco portatil|ssd externo|unidad externa|almacenamiento externo',
   '', 'disco duro externo|disco externo|ssd externo|externo', '',
   'carcasa|enclosure|case|gabinete|docking|adaptador|cable|funda', 'CAPACIDAD'],
  ['Disco duro',
   'disco duro|disco duro interno|discos duros|disco solido|disco de estado solido|unidad de estado solido|hdd|ssd|almacenamiento interno|unidad de almacenamiento',
   'externo|portatil|usb',
   'estado solido|disco duro|ssd|hdd', '',
   'externo|portatil|carcasa|enclosure|case|gabinete|docking|adaptador|cable|funda|intel|ryzen|windows|win 11|core ultra|celeron|all in one|todo en uno',
   'CAPACIDAD'],
  ['Memoria USB',
   'memoria usb|memorias usb|usb flash|flash drive|pendrive|pen drive|memoria flash|unidad flash|unidad usb|usb de|usb 2.0|usb 3.0|usb 3.2|memoria portatil',
   '', 'memoria|flash|pendrive|pen drive', 'usb',
   'ram|ddr|micro|sd|tarjeta|hub|cable|adaptador|lector|mouse|teclado|audifonos|bocina|cargador|disco|carcasa|ventilador',
   'CAPACIDAD'],
  ['Memoria micro SD',
   'micro sd|microsd|tarjeta de memoria|memoria sd|tarjeta sd|memoria micro',
   '', 'micro|microsd|sd', '', 'ram|ddr|usb metalica|lector|adaptador usb', 'CAPACIDAD'],
  ['Memoria RAM',
   'memoria ram|memorias ram|modulo de memoria|modulos de memoria|ram ddr|ram|ddr|ddr2|ddr3|ddr4|ddr5|sodimm|dimm|udimm|memoria de ram|memoria para laptop|memoria para pc',
   'usb|micro sd|microsd|tarjeta de memoria',
   'memoria', '',
   'usb|micro|sd|tarjeta|mb|video|gddr|tablet|smartphone|celular|intel|ryzen|windows|ssd',
   'DDR|CAPACIDAD'],
  ['Fuente de poder',
   'fuente de poder|fuentes de poder|fuente atx|fuente de alimentacion|power supply|psu|fuente',
   'no break|regulador',
   'fuente de poder|fuente', '',
   '12 vcc|vcc|gabinete|cable|extension|adaptador|no break|laptop|cargador|camara|dahua|cctv',
   'WATTS'],
  ['Pila',
   'pila|pilas|bateria de bios|bateria cmos|pila de bios|pila de boton|pila boton|pila tipo boton|bateria de boton|cr2032|cr 2032|cr2025|cr2016',
   'laptop|celular|recargable',
   'pila|bateria|cmos|cr', '',
   'laptop|celular|notebook|recargable|power bank|cargador',
   'PILA'],
  ['Kit teclado y mouse',
   'teclado y mouse|teclado y raton|mouse y teclado|kit de teclado|kit teclado|combo teclado|combo de teclado|kit de teclado y mouse',
   '', 'kit|combo|teclado y mouse', 'teclado|mouse', 'funda|tablet|mouse pad', 'USB'],
  ['Mouse',
   'mouse|raton|ratones|mouse optico|mouse usb|mouse inalambrico',
   'mouse pad|mousepad|tapete',
   'mouse', '', 'pad|mousepad|alfombrilla|funda|tapete|limpiador|tablet|smartphone|celular|laptop|notebook|bocina|audifonos', 'USB'],
  ['Teclado',
   'teclado|teclados|keyboard|teclado usb|teclado alambrico|teclado inalambrico',
   'funda|protector',
   'teclado', '', 'funda|tablet|telefono|protector|ipad|piano|laptop|notebook', 'USB'],
  ['No break / regulador',
   'no break|nobreak|ups|regulador|regulador de voltaje|supresor de picos|respaldo de energia',
   '', 'no break|ups|regulador|supresor', '', 'cable|bateria de reemplazo|monitoreo|software', 'VA|WATTS'],
  ['Proyector',
   'proyector|proyectores|videoproyector|video proyector|cañon|canon proyector',
   'pantalla para|soporte', 'proyector', '', 'pantalla|soporte|lampara|cable', 'MODELO'],
  ['Pantalla / TV',
   'television|televisor|smart tv|tv|pantalla de tv|pantalla smart',
   '', 'tv|television|smart tv|pantalla', '', 'soporte|brazo|control|cable|antena', 'PULGADAS'],
  ['Tablet',
   'tablet|tablets|tableta|tabletas|ipad',
   'funda|protector|soporte', 'tablet|tableta|ipad', '', 'funda|protector|soporte|base|cable|cargador|teclado para|lapiz|mochila', ''],
  ['Red (switch / router)',
   'switch|router|ruteador|access point|punto de acceso|repetidor|extensor de red|antena wifi|adaptador de red|tarjeta de red',
   '', 'switch|router|access point|punto de acceso|repetidor|extensor|adaptador de red|tarjeta de red', '', 'cable|rack|patch', ''],
  ['Cámara web',
   'camara web|webcam|web cam|camara para videoconferencia',
   '', 'camara web|webcam|web cam', '', 'soporte|tripie|cable', ''],
  ['Audífonos / diadema',
   'audifonos|audifono|diadema|diademas|headset|auriculares|manos libres',
   '', 'audifonos|diadema|headset|auriculares', '', 'soporte|adaptador|cable|almohadillas|funda', ''],
  ['Bocina',
   'bocina|bocinas|altavoz|altavoces|parlante|barra de sonido',
   '', 'bocina|altavoz|barra de sonido|parlante', '', 'soporte|cable|adaptador', ''],
  ['Tarjeta de video',
   'tarjeta de video|tarjeta grafica|tarjeta de graficos|gpu',
   '', 'tarjeta de video|tarjeta grafica', '', 'cable|soporte|pc gaming|laptop|adaptador|externa|convertidor', 'CAPACIDAD|MODELO'],
  ['Tarjeta madre',
   'tarjeta madre|motherboard|placa base|placa madre',
   '', 'tarjeta madre|mb', '', 'cable|pc gaming|kit', 'MODELO'],
  ['Procesador',
   'procesador|procesadores|cpu intel|cpu amd|microprocesador',
   '', 'procesador', '', 'laptop|pc|aio|all in one|pasta|disipador|ventilador|cooler|mini pc|notebook', 'MODELO'],
  ['Gabinete',
   'gabinete|gabinetes|case para pc|chasis',
   '', 'gabinete', '', 'ventilador|fuente de poder|cable|disco', ''],
  ['Cable / adaptador',
   'cable|cables|adaptador|adaptadores|convertidor|extension|hub usb|hub|concentrador usb|docking|replicador de puertos',
   '', 'cable|adaptador|convertidor|hub|docking|replicador|extension', '', 'kit|bocina|cargador de auto', '']
];

/* ================================================================== */
/*  Menu                                                              */
/* ================================================================== */

/** Deja lista la hoja "Cotizador" (la vacia si ya existe). */
function cotNueva() {
  var ss = SpreadsheetApp.getActive();
  czAsegurarReglas_(ss);
  var h = ss.getSheetByName(CZ.HOJA);
  if (h) {
    var ui = czUi_();
    if (ui && h.getLastRow() > CZ.FILA_ENC) {
      var r = ui.alert('Nueva cotización',
        'La hoja "' + CZ.HOJA + '" ya tiene partidas.\n\n¿La vacío para empezar otra?',
        ui.ButtonSet.YES_NO);
      if (r !== ui.Button.YES) return;
    }
  } else {
    h = ss.insertSheet(CZ.HOJA, 0);
  }
  h.clear();
  try { var f = h.getFilter(); if (f) f.remove(); } catch (e) {}
  var nC = CZ_ENC.length;
  if (h.getMaxColumns() < nC) h.insertColumnsAfter(h.getMaxColumns(), nC - h.getMaxColumns());

  h.getRange('A1').setValue('COTIZADOR').setFontSize(16).setFontWeight('bold').setFontColor('#1F3A5F');
  h.getRange('A2').setValue('Cliente:').setFontWeight('bold');
  h.getRange('B2:D2').merge().setBackground('#FFF8C5');
  h.getRange('A3').setValue('Folio:').setFontWeight('bold');
  h.getRange('B3:D3').merge().setFontColor('#555555');
  h.getRange('F2').setValue('1) Pega Partida, Cantidad, Unidad y Descripción tal cual te la mandan.   ' +
                            '2) Menú Cotizaciones > Buscar productos.   3) Revisa o cambia los SKU.   ' +
                            '4) Menú Cotizaciones > Generar cotización.')
    .setFontColor('#555555').setFontSize(9);
  h.getRange('F3').setValue('Varios SKU separados por coma = un equipo armado (ej. CPU, monitor, kit). ' +
                            'Si borras los SKU de una partida y vuelves a buscar, los propone de nuevo.')
    .setFontColor('#555555').setFontSize(9);

  var enc = h.getRange(CZ.FILA_ENC, 1, 1, nC);
  enc.setValues([CZ_ENC]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1F3A5F')
     .setWrap(true).setVerticalAlignment('middle');
  h.getRange(CZ.FILA_ENC, CZ_COL.PART, 1, 4).setBackground('#2E6B3F');      // lo que pegas tu
  h.getRange(CZ.FILA_ENC, CZ_COL.MANUAL, 1, 1).setBackground('#8A6D1F');    // opcional
  h.setRowHeight(CZ.FILA_ENC, 36);
  h.setFrozenRows(CZ.FILA_ENC);

  var anchos = [60, 70, 60, 420, 140, 170, 190, 190, 190, 260, 260, 260, 260];
  anchos.forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  h.getRange(CZ.FILA_ENC + 1, 1, 200, nC).setFontFamily('Arial').setFontSize(9).setVerticalAlignment('top');
  h.getRange(CZ.FILA_ENC + 1, CZ_COL.DESC, 200, 1).setWrap(true);
  h.getRange(CZ.FILA_ENC + 1, CZ_COL.NBAJA, 200, 3).setWrap(true).setFontColor('#555555');
  h.getRange(CZ.FILA_ENC + 1, CZ_COL.BAJA, 200, 3).setNumberFormat('@');
  h.activate();
  czToast_('Pega las partidas debajo del encabezado y corre "Buscar productos".');
}

/** Reconoce cada partida y propone los SKU de las tres gamas. */
function cotBuscar() {
  var ss = SpreadsheetApp.getActive();
  var h = ss.getSheetByName(CZ.HOJA);
  if (!h) { cotNueva(); czAviso_('Cotizador', 'Te dejé la hoja lista. Pega las partidas y vuelve a correr "Buscar productos".'); return; }

  var partidas = czLeerPartidas_(h);
  if (!partidas.length) { czAviso_('Cotizador', 'No hay partidas. Pega Partida, Cantidad, Unidad y Descripción debajo del encabezado.'); return; }

  var reglas = czReglas_(ss);
  var inv = czInventario_(ss);
  var ctx = czContexto_(inv, reglas);

  var cand = [];
  var resumen = { total: partidas.length, propuestas: 0, revisar: 0, sin: 0 };
  partidas.forEach(function (p) {
    var an = czAnalizar_(p, reglas, inv, ctx);
    p.tipo = an.tipo;
    h.getRange(p.fila, CZ_COL.TIPO).setValue(an.tipo || 'REVISAR');

    an.lista.slice(0, CZ.MAX_CAND).forEach(function (c) {
      cand.push([p.partida, an.tipo || 'REVISAR', c.nombre, c.skus.join(', '), c.stockMin,
                 c.cubre ? 'Sí' : 'No', c.precio, c.gama || '', c.notas.join(' ')]);
    });

    if (!an.tipo) resumen.revisar++;
    if (!an.lista.length) { resumen.sin++; return; }

    var sel = czElegirGamas_(an.lista);
    var puso = false;
    CZ_GAMAS.forEach(function (g) {
      var celda = h.getRange(p.fila, g.col);
      if (String(celda.getValue()).trim()) return;       // lo que ya escribiste no se toca
      celda.setValue(sel[g.id].skus.join(', '));
      puso = true;
    });
    if (puso) resumen.propuestas++;
  });

  czPonerFormulasNombres_(h, partidas);
  czEscribirCandidatos_(ss, cand);

  czAviso_('Cotizador',
    'Partidas: ' + resumen.total + '\n' +
    'Con propuesta nueva: ' + resumen.propuestas + '\n' +
    'Sin productos que cumplan: ' + resumen.sin + '\n' +
    'Tipo no reconocido (escribe la búsqueda a mano): ' + resumen.revisar + '\n\n' +
    'Todas las opciones están en la hoja "' + CZ.CAND + '".\n' +
    'Revisa los SKU y luego corre "Generar cotización".');
}

/** Guarda la cotizacion (Resumen + 3 gamas) en el libro de historial. */
function cotGenerar() {
  var ss = SpreadsheetApp.getActive();
  var h = ss.getSheetByName(CZ.HOJA);
  if (!h) { czAviso_('Cotizador', 'Primero corre "Nueva cotización".'); return; }
  var partidas = czLeerPartidas_(h);
  if (!partidas.length) { czAviso_('Cotizador', 'No hay partidas que cotizar.'); return; }

  var reglas = czReglas_(ss);
  var inv = czInventario_(ss);
  var porSku = {};
  inv.forEach(function (it) { porSku[it.sku] = it; });
  var todo = czInventarioCompleto_(ss);       // tambien los de stock 0, por si escribiste uno a mano
  var nombres = czNombres_(ss);

  var cliente = String(h.getRange('B2').getValue() || '').trim();
  var datos = {};
  CZ_GAMAS.forEach(function (g) { datos[g.id] = czArmarGama_(partidas, g, reglas, porSku, todo, nombres); });

  var nuevos = [];
  CZ_GAMAS.forEach(function (g) { datos[g.id].skusSinNombre.forEach(function (s) { if (nuevos.indexOf(s) < 0) nuevos.push(s); }); });
  czRegistrarNombres_(ss, nuevos, todo);

  var libro = czLibroHistorial_(4);
  var props = PropertiesService.getScriptProperties();
  var n = Number(props.getProperty(CZ.PROP_FOLIO) || 0) + 1;
  var folio = 'COT-' + ('000' + n).slice(-4);
  props.setProperty(CZ.PROP_FOLIO, String(n));

  var fecha = new Date();
  var hojas = {};
  CZ_GAMAS.forEach(function (g) { hojas[g.id] = czEscribirGama_(libro, folio, g, datos[g.id], cliente, fecha); });
  var hRes = czEscribirResumen_(libro, folio, cliente, fecha, hojas, datos, partidas.length);
  czIndice_(libro, folio, cliente, fecha, partidas.length, hojas, hRes);

  h.getRange('B3').setValue(folio + '  ·  ' + libro.getName());
  var url = libro.getUrl() + '#gid=' + hRes.getSheetId();
  czAvisoLink_('Cotización ' + folio,
    'Quedó guardada en "' + libro.getName() + '" con 4 hojas: Resumen, Baja, Media y Alta.',
    url);
}

/** Muestra el link del libro de historial. */
function cotAbrirHistorial() {
  var id = PropertiesService.getScriptProperties().getProperty(CZ.PROP_HIST);
  if (!id) { czAviso_('Historial', 'Todavía no hay historial: se crea solo con la primera cotización.'); return; }
  var libro = SpreadsheetApp.openById(id);
  czAvisoLink_('Historial de cotizaciones', 'Libro actual: "' + libro.getName() + '".', libro.getUrl());
}

/** Para usar un libro que tu creaste en lugar del automatico. */
function cotCambiarHistorial() {
  var ui = czUi_();
  if (!ui) return;
  var r = ui.prompt('Libro de historial',
    'Pega el ID o el link del Sheet donde quieres guardar las cotizaciones.\n' +
    '(Déjalo vacío para que el sistema cree uno nuevo con la siguiente cotización.)',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var txt = String(r.getResponseText() || '').trim();
  var props = PropertiesService.getScriptProperties();
  if (!txt) { props.deleteProperty(CZ.PROP_HIST); ui.alert('Listo: la siguiente cotización crea un libro nuevo.'); return; }
  var m = txt.match(/[-\w]{25,}/);
  if (!m) { ui.alert('No reconozco ese ID.'); return; }
  var libro = SpreadsheetApp.openById(m[0]);   // truena aqui si no hay acceso
  props.setProperty(CZ.PROP_HIST, m[0]);
  ui.alert('Listo: las cotizaciones se guardarán en "' + libro.getName() + '".');
}

/** Abre (o crea) la hoja de reglas. */
function cotReglas() {
  var ss = SpreadsheetApp.getActive();
  var h = czAsegurarReglas_(ss);
  h.activate();
  czToast_('Una fila por tipo de producto. Palabras separadas por |. Se aplica en la siguiente búsqueda.');
}

/* ================================================================== */
/*  Lectura de la hoja Cotizador                                      */
/* ================================================================== */

function czLeerPartidas_(h) {
  var ult = h.getLastRow();
  if (ult <= CZ.FILA_ENC) return [];
  var d = h.getRange(CZ.FILA_ENC + 1, 1, ult - CZ.FILA_ENC, CZ_ENC.length).getValues();
  var out = [];
  d.forEach(function (f, i) {
    var desc = String(f[CZ_COL.DESC - 1] || '').trim();
    if (!desc) return;
    var cant = czNumero_(f[CZ_COL.CANT - 1]);
    out.push({
      fila: CZ.FILA_ENC + 1 + i,
      partida: String(f[CZ_COL.PART - 1] || '').trim() || String(out.length + 1),
      cant: cant > 0 ? cant : 1,
      unidad: String(f[CZ_COL.UNI - 1] || '').trim() || 'PZA',
      desc: desc,
      tipoFijo: String(f[CZ_COL.TIPO - 1] || '').trim(),
      manual: String(f[CZ_COL.MANUAL - 1] || '').trim(),
      sel: { baja: czSkus_(f[CZ_COL.BAJA - 1]), media: czSkus_(f[CZ_COL.MEDIA - 1]), alta: czSkus_(f[CZ_COL.ALTA - 1]) },
      nota: String(f[CZ_COL.NOTA - 1] || '').trim()
    });
  });
  return out;
}

function czSkus_(v) {
  return String(v || '').split(/[,;\n]+/).map(function (s) { return s.trim(); }).filter(String);
}

function czNumero_(v) {
  if (typeof v === 'number') return v;
  var m = String(v || '').replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

/** Columnas J-L: el nombre del primer SKU de cada gama, con formula (se ve al cambiar el SKU). */
function czPonerFormulasNombres_(h, partidas) {
  var F = "'" + CZ.FUENTE + "'";
  partidas.forEach(function (p) {
    var fx = CZ_GAMAS.map(function (g) {
      var c = h.getRange(p.fila, g.col).getA1Notation();
      return '=IF(' + c + '="","",IFERROR(INDEX(' + F + '!$A:$A,MATCH(TRIM(REGEXEXTRACT(' + c + ',"^[^,]+")),' +
             F + '!$B:$B,0)),"SKU no encontrado")&IF(LEN(' + c + ')-LEN(SUBSTITUTE(' + c + ',",",""))>0,' +
             '"  (+"&(LEN(' + c + ')-LEN(SUBSTITUTE(' + c + ',",","")))&" más)",""))';
    });
    h.getRange(p.fila, CZ_COL.NBAJA, 1, 3).setFormulas([fx]);
  });
}

/* ================================================================== */
/*  Inventario                                                         */
/* ================================================================== */

function czInventarioCompleto_(ss) {
  var h = ss.getSheetByName(CZ.FUENTE);
  if (!h || h.getLastRow() < 2) {
    throw new Error('No hay datos en "' + CZ.FUENTE + '". Corre primero SITE SHEET > Solo precios.');
  }
  var d = h.getDataRange().getValues();
  var enc = d[0].map(czNorm_);
  function col(n) { return enc.indexOf(czNorm_(n)); }
  var cP = col('Producto'), cS = col('SKU'), cSt = col('Stock Odoo'), cTN = col('Tienda Nube');
  if (cTN < 0) throw new Error('La hoja "' + CZ.FUENTE + '" no trae la columna "Tienda Nube". Corre SITE SHEET > Solo precios.');
  if (cP < 0 || cS < 0 || cSt < 0) throw new Error('La hoja "' + CZ.FUENTE + '" no trae Producto, SKU o Stock Odoo.');
  var out = {};
  for (var i = 1; i < d.length; i++) {
    var sku = String(d[i][cS] || '').trim();
    if (!sku) continue;
    out[sku] = czItem_(sku, d[i][cP], czNumero_(d[i][cSt]), czNumero_(d[i][cTN]));
  }
  return out;
}

function czInventario_(ss) {
  var todo = czInventarioCompleto_(ss);
  return Object.keys(todo).map(function (k) { return todo[k]; })
    .filter(function (it) { return it.st > 0 && it.precio > 0; });
}

function czItem_(sku, prod, st, precio) {
  var n = czNorm_(prod);
  return { sku: sku, prod: String(prod || ''), n: n, c: n.replace(/[^a-z0-9]/g, ''), st: st, precio: precio };
}

/* ================================================================== */
/*  Reglas                                                             */
/* ================================================================== */

function czAsegurarReglas_(ss) {
  var h = ss.getSheetByName(CZ.REGLAS);
  if (h && h.getLastRow() > 1) return h;
  if (!h) h = ss.insertSheet(CZ.REGLAS);
  var enc = ['Tipo', 'Se reconoce por (cualquiera)', 'No es este tipo si trae', 'Buscar en inventario (cualquiera)',
             'El producto debe traer (todas)', 'Excluir productos con', 'Revisiones'];
  h.clear();
  h.getRange(1, 1, 1, enc.length).setValues([enc]).setFontWeight('bold')
   .setFontColor('#FFFFFF').setBackground('#1F3A5F').setWrap(true);
  h.getRange(2, 1, CZ_REGLAS_BASE.length, enc.length).setValues(CZ_REGLAS_BASE)
   .setWrap(true).setVerticalAlignment('top').setFontFamily('Arial').setFontSize(9);
  [150, 330, 180, 260, 150, 330, 190].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  h.setFrozenRows(1);
  h.getRange(CZ_REGLAS_BASE.length + 3, 1).setValue(
    'Palabras separadas por |, sin importar acentos ni mayúsculas; aceptan plural. ' +
    'Si una descripción encaja en varios tipos gana la palabra que aparece primero en la descripción. ' +
    'Revisiones posibles: RAM, ALMACEN, NUCLEOS, MONITOR, KIT, CAPACIDAD, DDR, WATTS, PULGADAS, COLOR, TECNOLOGIA, MULTIFUNCIONAL, PILA, MODELO.')
    .setFontColor('#555555').setFontSize(9);
  return h;
}

function czReglas_(ss) {
  var h = czAsegurarReglas_(ss);
  var d = h.getDataRange().getValues();
  return czReglasDe_(d.slice(1));
}

/** Convierte filas (como las de la hoja o CZ_REGLAS_BASE) en reglas listas para usar. */
function czReglasDe_(filas) {
  var out = [];
  filas.forEach(function (f, i) {
    var tipo = String(f[0] || '').trim();
    if (!tipo || !String(f[1] || '').trim()) return;
    out.push({
      orden: i, tipo: tipo,
      detectar: czTerminos_(f[1]), noDetectar: czTerminos_(f[2]),
      buscar: czTerminos_(f[3]), debe: czTerminos_(f[4]), excluir: czTerminos_(f[5]),
      rev: String(f[6] || '').toUpperCase().split(/[|,\s]+/).filter(String)
    });
  });
  return out;
}

function czTerminos_(s) {
  return String(s || '').split('|').map(czNorm_).filter(String).map(function (t) {
    return { t: t, re: new RegExp('(^|[^a-z0-9])' + czEsc_(t) + '(s|es)?(?=$|[^a-z0-9])') };
  });
}

/** Posicion de la primera palabra de la lista que aparece en el texto (-1 si ninguna). */
function czPrimera_(txt, terms) {
  var mejor = { pos: -1, len: 0 };
  terms.forEach(function (x) {
    var m = x.re.exec(txt);
    if (!m) return;
    var pos = m.index + m[1].length;
    if (mejor.pos < 0 || pos < mejor.pos || (pos === mejor.pos && x.t.length > mejor.len)) mejor = { pos: pos, len: x.t.length };
  });
  return mejor;
}

function czAlguna_(txt, terms) { return terms.some(function (x) { return x.re.test(txt); }); }
function czTodas_(txt, terms) { return terms.every(function (x) { return x.re.test(txt); }); }

/** Que tipo es la descripcion. Gana la palabra que aparece primero; empate: la mas larga. */
function czDetectarTipo_(desc, reglas) {
  var mejor = null;
  reglas.forEach(function (r) {
    var p = czPrimera_(desc, r.detectar);
    if (p.pos < 0) return;
    if (r.noDetectar.length) {
      var q = czPrimera_(desc, r.noDetectar);
      if (q.pos >= 0 && q.pos <= p.pos + 40) return;   // "funda para laptop" no es laptop
    }
    if (!mejor || p.pos < mejor.pos || (p.pos === mejor.pos && p.len > mejor.len)) {
      mejor = { pos: p.pos, len: p.len, regla: r };
    }
  });
  return mejor ? mejor.regla : null;
}

/* ================================================================== */
/*  Lo que pide la descripcion                                        */
/* ================================================================== */

function czPide_(desc) {
  var t = desc, r = {}, m;
  if ((m = t.match(/(\d{1,3})\s*gb\s*(?:de\s*)?(?:memoria\s*)?(?:ram|ddr)/))) r.ram = +m[1];
  else if ((m = t.match(/(?:ram|memoria)\s*(?:ddr\d\s*)?(?:de\s*)?(\d{1,3})\s*gb/))) r.ram = +m[1];

  if ((m = t.match(/(\d{2,4}(?:\.\d)?)\s*(gb|tb)\s*(?:de\s*)?(?:disco|ssd|hdd|almacenamiento|estado solido|unidad)/))) r.alm = +m[1] * (m[2] === 'tb' ? 1000 : 1);
  else if ((m = t.match(/(?:disco duro|disco|ssd|hdd|almacenamiento|estado solido)[^0-9]{0,25}(\d{1,4}(?:\.\d)?)\s*(gb|tb)/))) r.alm = +m[1] * (m[2] === 'tb' ? 1000 : 1);

  if ((m = t.match(/(?<![a-z0-9.])(\d{1,4}(?:\.\d+)?)\s*(gb|tb)(?![a-z0-9])/))) r.cap = +m[1] * (m[2] === 'tb' ? 1000 : 1);
  if ((m = t.match(/ddr\s?(\d)/))) r.ddr = +m[1];
  if ((m = t.match(/(\d{1,2})\s*nucleos/))) r.nucleos = +m[1];
  if ((m = t.match(/(?<![a-z0-9.])(\d{2,4})\s*(?:w|watts?)(?![a-z0-9])/))) r.watts = +m[1];
  if ((m = t.match(/(?<![a-z0-9.])(\d{3,5})\s*va(?![a-z0-9])/))) r.va = +m[1];
  if ((m = t.match(/monitor(?:es)?\s*(?:led\s*|lcd\s*)?(?:de\s*)?(\d{2}(?:\.\d)?)/))) r.pulg = +m[1];
  else if ((m = t.match(/(\d{2}(?:\.\d)?)\s*(?:"|pulgadas|pulg)/))) r.pulg = +m[1];

  if (/blanco y negro|monocrom|b\/n|\bbyn\b/.test(t)) r.color = 'bn';
  else if (/\bcolor\b/.test(t)) r.color = 'color';
  if (/inyeccion|tinta/.test(t)) r.tec = 'tinta';
  else if (/laser/.test(t)) r.tec = 'laser';
  if (/multifuncion/.test(t)) r.multi = true;
  r.monitor = /monitor|pantalla/.test(t);
  r.teclado = /teclado|mouse|raton/.test(t);
  r.usb = /usb/.test(t);
  if ((m = t.match(/(?:cr\s*)?(20[0-9]{2}|16[0-9]{2}|12[0-9]{2}|23[0-9]{2})(?![0-9])/))) r.pila = m[1];

  r.marcas = CZ_MARCAS.filter(function (mk) { return new RegExp('(^|[^a-z0-9])' + czEsc_(mk) + '($|[^a-z0-9])').test(t); });
  r.modelos = [];
  var re = /(?<![a-z0-9])([a-z0-9]+(?:-[a-z0-9]+)*)(?![a-z0-9])/g;
  while ((m = re.exec(t))) {
    var tok = m[1], c = tok.replace(/-/g, '');
    if (c.length < 3 || !/[a-z]/.test(c) || !/[0-9]/.test(c)) continue;
    if (/^\d+(gb|tb|mb|w|v|va|hz|mhz|ghz|mah|ppm|dpi|mm|cm|m|p|k|pulg|x|ms|mp)$/.test(c)) continue;
    if (/^(ddr|lpddr|gddr)\d/.test(c) || /^(win|windows)\d+/.test(c) || /^cr\d{4}$/.test(c) || /^pc\d/.test(c)) continue;
    if (/^(usb|hdmi|wifi|bt|sata|pcie|rj|cat)\d/.test(c)) continue;
    r.modelos.push(c);
  }
  return r;
}

/* ================================================================== */
/*  Lo que trae cada producto                                         */
/* ================================================================== */

function czTrae_(it) {
  if (it.sp) return it.sp;
  var t = it.n, sp = {}, m;

  // RAM de un equipo: primer "N GB" razonable que no sea disco ni tarjeta de video
  var re = /(?<![a-z0-9.])(\d{1,3})\s*gb/g;
  while ((m = re.exec(t))) {
    var v = +m[1];
    if (v < 2 || v > 128) continue;
    var despues = t.substr(m.index + m[0].length, 16);
    var antes = t.substr(Math.max(0, m.index - 16), Math.min(16, m.index));
    if (/^\s*(\(|x)?\s*(ssd|m\.?2|nvme|emmc|hdd|de almacenamiento|almacenamiento|gddr|disco|flash)/.test(despues)) continue;
    if (/(ssd|nvme|m\.2|emmc|rtx|gtx|radeon|ada|almacenamiento|disco)[^0-9]*$/.test(antes)) continue;
    sp.ram = v; break;
  }

  // Disco de un equipo
  var alm = 0;
  var r1 = /(?<![a-z0-9.])(\d{2,4})\s*(gb|tb)?\s*(?:de\s*)?(ssd|m\.?2|nvme|emmc|hdd|disco|almacenamiento)/g;
  while ((m = r1.exec(t))) { var a = +m[1] * (m[2] === 'tb' ? 1000 : 1); if (a >= 64) alm = Math.max(alm, a); }
  var r2 = /(ssd|nvme|emmc|hdd|almacenamiento)[^0-9]{0,15}(\d{1,4})\s*(gb|tb)/g;
  while ((m = r2.exec(t))) { var b = +m[2] * (m[3] === 'tb' ? 1000 : 1); if (b >= 64) alm = Math.max(alm, b); }
  var r3 = /(?<![a-z0-9.])(\d)\s*tb/g;
  while ((m = r3.exec(t))) alm = Math.max(alm, +m[1] * 1000);
  var r4 = /(?<![a-z0-9.])(\d{3,4})\s*gb/g;          // "24GB/512GB/15.3": el grande es el disco
  while ((m = r4.exec(t))) { var c4 = +m[1]; if (c4 >= 200) alm = Math.max(alm, c4); }
  if (alm) sp.alm = alm;

  if ((m = t.match(/(?<![a-z0-9.])(\d{1,4}(?:\.\d+)?)\s*(gb|tb)(?![a-z0-9])/))) sp.cap = +m[1] * (m[2] === 'tb' ? 1000 : 1);
  if ((m = t.match(/ddr\s?(\d)/))) sp.ddr = +m[1];
  if ((m = t.match(/(?<![a-z0-9.])(\d{3,4})\s*(?:w|watts?)(?![a-z0-9])/))) sp.watts = +m[1];
  if ((m = t.match(/(?<![a-z0-9.])(\d{3,5})\s*va(?![a-z0-9])/))) sp.va = +m[1];

  var pulg = null;
  if ((m = t.match(/(\d{2}(?:\.\d)?)\s*(?:"|pulgadas|pulg|in\b)/))) pulg = +m[1];
  else if ((m = t.match(/panel\s*(?:va|ips|tn|led)?\s*(\d{2}(?:\.\d)?)/))) pulg = +m[1];
  else if ((m = t.match(/(?<![0-9.])(\d{2}\.\d)(?![0-9])/))) pulg = +m[1];
  if (pulg && pulg >= 15 && pulg <= 100) sp.pulg = pulg;

  sp.color = /(\/ ?color|a color|laser color|color laser|tinta continua|inyeccion de tinta|ecotank|smart tank|ink tank|negro ?\/ ?\d* ?color|color \d+ ppm|\d+ ppm color)/.test(t) && !/monocrom/.test(t);
  sp.laser = /laser/.test(t);
  sp.tinta = /inyeccion|tinta|ecotank|smart tank|ink tank|inkjet|pixma|deskjet/.test(t);
  sp.multi = /multifuncion/.test(t);
  sp.aio = /(^|[^a-z])(aio|all in one|todo en uno)([^a-z]|$)/.test(t);
  sp.teclado = /teclado/.test(t);
  sp.debil = /celeron|(^|[^a-z])atom([^a-z]|$)|pentium silver|n4020|n4500|n4000|2 nucleos|dual core/.test(t);
  sp.ssd = /ssd|estado solido|nvme|m\.2/.test(t);
  sp.usb = /usb|alambric|receptor|2\.4 ?ghz|dongle/.test(t);
  sp.soloBt = /bluetooth/.test(t) && !sp.usb;

  var pz = t.match(/(?<![0-9])(\d{1,3})\s*(?:piezas|pzas|pz)(?![a-z])/) || t.match(/paquete\s*(?:con|de)\s*(\d{1,3})/) || t.match(/pack\s*(?:de\s*)?(\d{1,3})/);
  if (pz && +pz[1] >= 2 && +pz[1] <= 100) sp.paquete = +pz[1];

  it.sp = sp;
  return sp;
}

/* ================================================================== */
/*  Busqueda                                                           */
/* ================================================================== */

/** Monitores y kits listos para armar equipos. */
function czContexto_(inv, reglas) {
  function regla(t) { for (var i = 0; i < reglas.length; i++) if (reglas[i].tipo === t) return reglas[i]; return null; }
  var rMon = regla('Monitor'), rKit = regla('Kit teclado y mouse');
  var mon = [], kit = [];
  inv.forEach(function (it) {
    if (rMon && czAlguna_(it.n, rMon.buscar) && !czAlguna_(it.n, rMon.excluir) && czTrae_(it).pulg) mon.push(it);
    if (rKit && czAlguna_(it.n, rKit.buscar) && czTodas_(it.n, rKit.debe) && !czAlguna_(it.n, rKit.excluir)) kit.push(it);
  });
  var porPrecio = function (a, b) { return a.precio - b.precio; };
  mon.sort(porPrecio); kit.sort(porPrecio);
  return {
    monitor: function (minPulg, cant) {
      for (var i = 0; i < mon.length; i++) if (mon[i].sp.pulg >= minPulg && mon[i].st >= cant) return mon[i];
      for (var j = 0; j < mon.length; j++) if (mon[j].sp.pulg >= minPulg) return mon[j];
      return null;
    },
    kit: function (cant) {
      for (var i = 0; i < kit.length; i++) if (kit[i].st >= cant) return kit[i];
      return kit[0] || null;
    }
  };
}

/**
 * Todo lo del inventario que sirve para una partida.
 * Devuelve { tipo, notas[], lista[ {skus[], partes[], nombre, precio, stockMin, cubre, notas[]} ] }
 * ordenada por precio.
 */
function czAnalizar_(p, reglas, inv, ctx) {
  var desc = czNorm_(p.desc);
  var pide = czPide_(desc);
  var regla = null;
  if (p.tipoFijo) reglas.forEach(function (r) { if (czNorm_(r.tipo) === czNorm_(p.tipoFijo)) regla = r; });
  if (!regla) regla = czDetectarTipo_(desc, reglas);
  var rev = regla ? regla.rev : [];
  var tiene = function (x) { return rev.indexOf(x) >= 0; };
  var notas = [];

  // 1) base: por busqueda manual o por la regla
  var base;
  if (p.manual) {
    var pal = czTerminos_(p.manual.split(/[\s,]+/).join('|'));
    base = inv.filter(function (it) { return czTodas_(it.n, pal); });
  } else if (regla) {
    base = inv.filter(function (it) {
      return czAlguna_(it.n, regla.buscar) && czTodas_(it.n, regla.debe) && !czAlguna_(it.n, regla.excluir);
    });
  } else {
    return { tipo: '', notas: ['No reconocí qué producto es: escribe la búsqueda a mano.'], lista: [], pide: pide };
  }

  // 2) marca y modelo
  if (!p.manual && tiene('MARCA') && pide.marcas.length) {
    base = base.filter(function (it) {
      return pide.marcas.some(function (mk) { return new RegExp('(^|[^a-z0-9])' + czEsc_(mk) + '($|[^a-z0-9])').test(it.n); });
    });
  }
  if (!p.manual && (tiene('MODELO') || tiene('MODELO_ESTRICTO')) && pide.modelos.length) {
    var conModelo = [];
    pide.modelos.forEach(function (mo) {
      base.forEach(function (it) { if (czTraeModelo_(it, mo) && conModelo.indexOf(it) < 0) conModelo.push(it); });
    });
    if (conModelo.length) base = conModelo;
    else if (tiene('MODELO_ESTRICTO')) base = [];
    else notas.push('MODELO:' + pide.modelos.join(', ').toUpperCase());
  }

  // 3) filtros que no se negocian
  if (!p.manual) {
    base = base.filter(function (it) {
      var s = czTrae_(it);
      if (tiene('DDR') && !s.ddr) return false;
      if (tiene('DDR') && pide.ddr && s.ddr !== pide.ddr) return false;
      if (tiene('USB') && pide.usb && (!s.usb || s.soloBt)) return false;
      if (tiene('PILA') && pide.pila && it.c.indexOf(pide.pila) < 0) return false;
      if (tiene('NUCLEOS') && pide.nucleos >= 4 && s.debil) return false;
      if (tiene('COLOR') && pide.color === 'color' && !s.color) return false;
      if (tiene('COLOR') && pide.color === 'bn' && s.color) return false;
      if (tiene('TECNOLOGIA') && pide.tec === 'laser' && !s.laser) return false;
      if (tiene('TECNOLOGIA') && pide.tec === 'tinta' && !s.tinta) return false;
      if (tiene('MULTIFUNCIONAL') && pide.multi && !s.multi) return false;
      return true;
    });
  }

  // 4) filtros de cantidad: si nadie cumple, lo mas cercano
  function cumple(it, estricto) {
    var s = czTrae_(it);
    if (tiene('RAM') && !s.ram) return false;
    if (tiene('RAM') && pide.ram && estricto && s.ram < pide.ram) return false;
    if (tiene('ALMACEN') && pide.alm) { if (!s.alm) return false; if (estricto && s.alm < pide.alm * 0.95) return false; }
    if (tiene('CAPACIDAD') && pide.cap) { if (!s.cap) return false; if (estricto && s.cap < pide.cap * 0.95) return false; }
    if (tiene('WATTS') && pide.watts) { if (!s.watts) return false; if (estricto && s.watts < pide.watts) return false; }
    if (tiene('PULGADAS') && pide.pulg) { if (!s.pulg) return false; if (estricto && s.pulg < pide.pulg - 0.6) return false; }
    if (tiene('VA') && pide.va) { if (!s.va) return false; if (estricto && s.va < pide.va) return false; }
    return true;
  }
  var ok = p.manual ? base : base.filter(function (it) { return cumple(it, true); });
  if (!p.manual && regla && ok.length > 1 && czEsGenerico_(rev)) ok = czAfinar_(ok, desc, regla);

  // Que no se vaya al extremo: para un disco de 500GB no sirve cotizar uno de 20TB,
  // ni una fuente de 850W para una de 400W. Si con el tope no queda nada, se deja sin tope.
  if (!p.manual && ok.length) {
    var cerca = ok.filter(function (it) {
      var s = czTrae_(it);
      if (tiene('CAPACIDAD') && pide.cap && s.cap > pide.cap * 2.2) return false;
      if (tiene('WATTS') && pide.watts && s.watts > pide.watts * 1.6) return false;
      if (tiene('PULGADAS') && pide.pulg && s.pulg > pide.pulg + 6) return false;
      return true;
    });
    if (cerca.length) ok = cerca;
  }

  var relajado = false;
  if (!ok.length && !p.manual) {
    ok = base.filter(function (it) { return cumple(it, false); });
    relajado = ok.length > 0;
    // lo mas cercano: solo los que tienen el valor mas alto de lo que falto
    [['RAM', 'ram', pide.ram], ['ALMACEN', 'alm', pide.alm], ['CAPACIDAD', 'cap', pide.cap],
     ['WATTS', 'watts', pide.watts], ['PULGADAS', 'pulg', pide.pulg]].forEach(function (x) {
      if (!tiene(x[0]) || !x[2] || !ok.length) return;
      var falta = ok.filter(function (it) { return czTrae_(it)[x[1]] < x[2]; });
      if (!falta.length) return;
      var max = Math.max.apply(null, ok.map(function (it) { return czTrae_(it)[x[1]] || 0; }));
      ok = ok.filter(function (it) { return (czTrae_(it)[x[1]] || 0) === max; });
    });
  }

  // 5) armar candidatos (equipo + monitor + kit)
  var lista = [];
  ok.forEach(function (it) {
    var s = czTrae_(it);
    var partes = [it];
    if (!p.manual && tiene('MONITOR') && pide.monitor && !s.aio) {
      var mon = ctx.monitor(pide.pulg ? pide.pulg - 0.6 : 18.5, p.cant);
      if (!mon) return;
      partes.push(mon);
    }
    if (!p.manual && tiene('KIT') && pide.teclado && !s.teclado) {
      var kit = ctx.kit(p.cant);
      if (kit) partes.push(kit);
    }
    var precio = 0, stockMin = Infinity, cubre = true;
    partes.forEach(function (x) {
      var q = czCantOfertada_(x, p.cant, partes.length);
      precio += x.precio * q / p.cant;          // precio por equipo solicitado
      stockMin = Math.min(stockMin, x.st);
      if (x.st < q) cubre = false;
    });
    lista.push({
      skus: partes.map(function (x) { return x.sku; }),
      partes: partes,
      nombre: partes.map(function (x) { return x.prod; }).join('  +  '),
      precio: Math.round(precio * 100) / 100,
      stockMin: stockMin,
      cubre: cubre,
      notas: relajado ? ['Lo más cercano: no hay nada que cumpla todo lo solicitado.'] : []
    });
  });
  lista.sort(function (a, b) { return a.precio - b.precio; });

  var sel = lista.length ? czElegirGamas_(lista) : null;
  if (sel) CZ_GAMAS.forEach(function (g) {
    var c = sel[g.id];
    c.gama = c.gama ? c.gama + ' / ' + g.nombre : g.nombre;
  });

  return { tipo: regla ? regla.tipo : '', regla: regla, notas: notas, lista: lista, pide: pide, relajado: relajado };
}

var CZ_MARCAS = ['hp', 'epson', 'canon', 'brother', 'xerox', 'lexmark', 'samsung', 'ricoh', 'kyocera', 'pantum',
                 'lenovo', 'dell', 'acer', 'asus', 'apple', 'msi', 'logitech', 'kingston', 'adata', 'western digital', 'wd',
                 'seagate', 'sandisk', 'tp-link', 'tplink', 'cisco', 'ubiquiti', 'apc', 'cyberpower', 'koblenz', 'sony', 'lg', 'benq', 'viewsonic', 'aoc'];

var CZ_REV_NUMEROS = ['RAM', 'ALMACEN', 'NUCLEOS', 'MONITOR', 'KIT', 'CAPACIDAD', 'DDR', 'WATTS', 'VA',
                      'PULGADAS', 'COLOR', 'TECNOLOGIA', 'MULTIFUNCIONAL', 'PILA', 'USB'];
var CZ_VACIAS = ['de','del','la','el','los','las','con','sin','para','por','y','o','u','en','un','una','tipo','como',
                 'minimo','minima','maximo','superior','inferior','pieza','piezas','pza','pzas','pz','unidad','unidades',
                 'marca','modelo','similar','equivalente','calidad','nuevo','nueva','original','incluye','que','al'];

function czEsGenerico_(rev) {
  return !rev.some(function (x) { return CZ_REV_NUMEROS.indexOf(x) >= 0; });
}

/**
 * Se queda con los productos que mas palabras de la descripcion traen
 * (marca, modelo, "hdmi", "8 puertos"...). Si ninguno trae ninguna, no filtra.
 */
function czAfinar_(lista, desc, regla) {
  var tipoPal = {};
  regla.detectar.concat(regla.buscar).forEach(function (x) { x.t.split(' ').forEach(function (w) { tipoPal[w] = 1; }); });
  var pal = [], ws = desc.split(/[^a-z0-9.]+/).filter(String);
  ws.forEach(function (w, i) {
    if (/^\d+(\.\d+)?$/.test(w)) {                       // "8 puertos", "3 metros"
      var sig = ws[i + 1];
      if (sig && !CZ_VACIAS.includes(sig)) pal.push(new RegExp('(^|[^0-9.])' + czEsc_(w) + '\\s*' + czEsc_(sig.substr(0, 4))));
      return;
    }
    if (w.length < 2 || CZ_VACIAS.indexOf(w) >= 0 || tipoPal[w]) return;
    if (w.length < 3 && !/\d/.test(w)) return;
    pal.push(new RegExp('(^|[^a-z0-9])' + czEsc_(w)));
  });
  if (!pal.length) return lista;
  var conPuntos = lista.map(function (it) {
    return { it: it, n: pal.filter(function (re) { return re.test(it.n) || re.test(it.c); }).length };
  });
  var max = Math.max.apply(null, conPuntos.map(function (x) { return x.n; }));
  if (!max) return lista;
  return conPuntos.filter(function (x) { return x.n === max; }).map(function (x) { return x.it; });
}

/** El modelo en el nombre: los cortos (58A) como palabra completa, los largos aunque cambien guiones. */
function czTraeModelo_(it, mo) {
  if (mo.length <= 4) return new RegExp('(^|[^a-z0-9])' + czEsc_(mo) + '($|[^a-z0-9])').test(it.n.replace(/-/g, ''));
  return it.c.indexOf(mo) >= 0;
}

/** Si el producto viene en paquete (2 piezas...), cuantos paquetes. Solo aplica a un producto suelto. */
function czCantOfertada_(it, cant, nPartes) {
  var s = czTrae_(it);
  if (nPartes === 1 && s.paquete) return Math.ceil(cant / s.paquete);
  return cant;
}

/** Baja = mas barato, media = de en medio, alta = de los mas caros; todos entre los que cubren. */
function czElegirGamas_(lista) {
  var pool = lista.filter(function (c) { return c.cubre; });
  if (!pool.length) {
    var mejor = lista.slice().sort(function (a, b) { return b.stockMin - a.stockMin; })[0];
    return { baja: mejor, media: mejor, alta: mejor };
  }
  var n = pool.length;
  var iM = Math.floor((n - 1) / 2);
  var iA = n <= 4 ? n - 1 : Math.floor(0.8 * (n - 1));
  return { baja: pool[0], media: pool[iM], alta: pool[iA] };
}

/* ================================================================== */
/*  Armado de cada gama para la cotizacion                             */
/* ================================================================== */

function czArmarGama_(partidas, g, reglas, porSku, todo, nombres) {
  var filas = [];            // cada renglon de la cotizacion
  var notasGenerales = [];
  var usados = {};           // sku de kit -> partida donde ya se cotizo
  var skusSinNombre = [];

  partidas.forEach(function (p) {
    var desc = czNorm_(p.desc);
    var pide = czPide_(desc);
    var regla = null;
    if (p.tipoFijo) reglas.forEach(function (r) { if (czNorm_(r.tipo) === czNorm_(p.tipoFijo)) regla = r; });
    if (!regla) regla = czDetectarTipo_(desc, reglas);
    var rev = regla ? regla.rev : [];
    var skus = p.sel[g.id];

    var notaModelo = '';
    if (regla && rev.indexOf('MODELO') >= 0 && pide.modelos.length) {
      var hay = pide.modelos.some(function (mo) { return skus.some(function (s) { var it = todo[s]; return it && czTraeModelo_(it, mo); }); });
      if (!hay) notaModelo = 'El modelo solicitado no se encuentra disponible; se ofrece un equipo equivalente.';
    }

    if (!skus.length) {
      filas.push({ partida: p.partida, desc: p.desc, cant: p.cant, unidad: p.unidad, producto: 'Sin disponibilidad',
                   cantOf: null, disp: 'Sin disponibilidad', precio: null,
                   obs: czJuntar_([p.nota || 'Sin disponibilidad por el momento.']) });
      notasGenerales.push('Partida ' + p.partida + ': sin disponibilidad por el momento.');
      return;
    }

    skus.forEach(function (sku, i) {
      var it = todo[sku];
      var lab = skus.length === 1 ? p.partida : p.partida + String.fromCharCode(97 + i);
      var primera = i === 0;
      var base = { partida: lab, desc: primera ? p.desc : '', cant: primera ? p.cant : null, unidad: primera ? p.unidad : '' };

      if (!it) {
        filas.push(czMezcla_(base, { sku: czSkuVisible_(sku), producto: 'SKU no encontrado', cantOf: null, disp: '—', precio: null, obs: 'Revisar: este SKU no está en la lista de precios.' }));
        return;
      }
      if (!nombres[sku]) skusSinNombre.push(sku);

      var s = czTrae_(it);
      var esKit = /teclado/.test(it.n) && /mouse/.test(it.n) && /kit|combo|teclado y mouse/.test(it.n);
      if (esKit && usados[sku] && skus.length === 1) {
        filas.push(czMezcla_(base, { producto: 'Incluido en la partida ' + usados[sku], cantOf: null, disp: '—', precio: null,
                                     obs: 'Incluido en el kit de teclado y mouse de la partida ' + usados[sku] + '.' }));
        return;
      }

      var cantOf = czCantOfertada_(it, p.cant, skus.length);
      var obs = [];
      if (primera && notaModelo) obs.push(notaModelo);
      if (s.paquete && skus.length === 1) obs.push('Se cotizan ' + cantOf + ' paquetes de ' + s.paquete + ' piezas = ' + (cantOf * s.paquete) + ' piezas.');
      if (rev.indexOf('RAM') >= 0 && pide.ram && s.ram && s.ram < pide.ram && primera) obs.push('Configuración más cercana disponible: ' + s.ram + 'GB de RAM.');
      if (rev.indexOf('RAM') >= 0 && pide.ram && s.ram && s.ram > pide.ram && primera) obs.push(s.ram + 'GB de RAM (supera lo solicitado).');
      if (rev.indexOf('ALMACEN') >= 0 && pide.alm && s.alm && s.alm > pide.alm && primera) obs.push('Almacenamiento de ' + czTam_(s.alm) + ' (supera lo solicitado).');
      if (regla && regla.tipo === 'Disco duro' && s.ssd && /disco duro|hdd/.test(desc)) obs.push('Se ofrece unidad de estado sólido (SSD): mismo conector SATA y mayor velocidad.');
      if (s.pulg && pide.pulg && s.pulg < pide.pulg && s.pulg >= pide.pulg - 0.6) obs.push('Monitor de ' + s.pulg + '" (medida comercial de ' + pide.pulg + '").');
      if (rev.indexOf('WATTS') >= 0 && pide.watts && s.watts > pide.watts) obs.push('Se ofrece mayor capacidad (supera los ' + pide.watts + 'W solicitados).');
      if (esKit && skus.length === 1) obs.push('Kit de teclado y mouse.');
      if (primera && p.nota) obs.push(p.nota);
      if (esKit && skus.length === 1) usados[sku] = p.partida;

      var disp = it.st >= cantOf ? 'Inmediata' : (it.st > 0 ? it.st + ' de ' + cantOf + ' piezas' : 'Sin disponibilidad');
      filas.push(czMezcla_(base, { sku: czSkuVisible_(sku), producto: nombres[sku] || czNombreLimpio_(it.prod), cantOf: cantOf, disp: disp, precio: it.precio, obs: czJuntar_(obs) }));
    });
  });

  // el kit que cubrio dos partidas lo dice en la primera
  filas.forEach(function (f) {
    var mInc = String(f.producto).match(/^Incluido en la partida (\S+)/);
    if (mInc) {
      var orig = mInc[1];
      filas.forEach(function (o) {
        if (o.partida === orig && /Kit de teclado y mouse\./.test(o.obs || '') && !/cubre también/.test(o.obs)) {
          o.obs = o.obs.replace('Kit de teclado y mouse.', 'Kit de teclado y mouse: cubre también la partida ' + f.partida.replace(/[a-z]$/, '') + '.');
        }
      });
    }
  });

  return { filas: filas, notas: notasGenerales, skusSinNombre: skusSinNombre };
}

function czMezcla_(a, b) { var o = {}; Object.keys(a).forEach(function (k) { o[k] = a[k]; }); Object.keys(b).forEach(function (k) { o[k] = b[k]; }); return o; }
function czJuntar_(arr) { return arr.filter(String).join(' '); }
function czTam_(gb) { return gb >= 1000 ? (gb / 1000) + 'TB' : gb + 'GB'; }

/** Nombre presentable sin marcas internas. */
function czNombreLimpio_(prod) {
  var s = String(prod || '')
    .replace(/[-\s]*\bCVA\b/gi, '')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/\s+\/\s+|\s*\/\s*(?=[A-ZÁÉÍÓÚÑ]{3})/g, ' · ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s{2,}/g, ' ').trim();
  if (s.length > 170) s = s.substr(0, 170).replace(/\s+\S*$/, '') + '…';
  return s.replace(/[·,\s]+$/, '');
}

/* ================================================================== */
/*  Nombres para la cotizacion (editables)                             */
/* ================================================================== */

function czNombres_(ss) {
  var h = ss.getSheetByName(CZ.NOMBRES), out = {};
  if (!h || h.getLastRow() < 2) return out;
  h.getRange(2, 1, h.getLastRow() - 1, 2).getValues().forEach(function (f) {
    var s = String(f[0] || '').trim(), n = String(f[1] || '').trim();
    if (s && n) out[s] = n;
  });
  return out;
}

/** Cada SKU que se cotiza por primera vez queda aqui con un nombre sugerido que puedes pulir. */
function czRegistrarNombres_(ss, skus, todo) {
  if (!skus.length) return;
  var h = ss.getSheetByName(CZ.NOMBRES);
  if (!h) {
    h = ss.insertSheet(CZ.NOMBRES);
    h.getRange(1, 1, 1, 3).setValues([['SKU', 'Nombre en la cotización (edítalo si quieres)', 'Descripción original']])
     .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1F3A5F');
    h.setColumnWidth(1, 240); h.setColumnWidth(2, 480); h.setColumnWidth(3, 480);
    h.setFrozenRows(1);
  }
  var ya = czNombres_(ss);
  var filas = skus.filter(function (s) { return !ya[s] && todo[s]; })
                  .map(function (s) { return [s, czNombreLimpio_(todo[s].prod), todo[s].prod]; });
  if (filas.length) h.getRange(h.getLastRow() + 1, 1, filas.length, 3).setValues(filas).setWrap(true).setFontSize(9);
}

/* ================================================================== */
/*  Hoja de candidatos                                                 */
/* ================================================================== */

function czEscribirCandidatos_(ss, filas) {
  var h = ss.getSheetByName(CZ.CAND) || ss.insertSheet(CZ.CAND);
  h.clear();
  try { var f = h.getFilter(); if (f) f.remove(); } catch (e) {}
  var enc = ['Partida', 'Tipo', 'Producto', 'SKU (cópialo al Cotizador)', 'Stock', '¿Cubre la cantidad?', 'Precio por equipo', 'Propuesto como', 'Nota'];
  h.getRange(1, 1, 1, enc.length).setValues([enc]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1F3A5F').setWrap(true);
  if (filas.length) {
    h.getRange(2, 1, filas.length, enc.length).setValues(filas).setFontFamily('Arial').setFontSize(9).setVerticalAlignment('top');
    h.getRange(2, 3, filas.length, 1).setWrap(true);
    h.getRange(2, 7, filas.length, 1).setNumberFormat('"$"#,##0.00');
    h.getRange(1, 1, filas.length + 1, enc.length).createFilter();
  }
  [60, 140, 520, 260, 60, 90, 120, 120, 260].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  h.setFrozenRows(1);
}

/* ================================================================== */
/*  Libro de historial                                                 */
/* ================================================================== */

/** El libro donde se guardan; si ya no cabe otra cotizacion, crea el siguiente. */
function czLibroHistorial_(hojasNuevas) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(CZ.PROP_HIST);
  var libro = null;
  if (id) { try { libro = SpreadsheetApp.openById(id); } catch (e) { libro = null; } }
  if (libro) {
    var hojas = libro.getSheets();
    var celdas = hojas.reduce(function (a, s) { return a + s.getMaxRows() * s.getMaxColumns(); }, 0);
    if (hojas.length + hojasNuevas <= CZ.MAX_HOJAS && celdas + 20000 <= CZ.MAX_CELDAS) return libro;
  }
  var n = Number(props.getProperty(CZ.PROP_HIST + '_N') || 0) + 1;
  var nombre = CZ.NOMBRE_HIST + (n > 1 ? ' ' + n : '');
  var nuevo = SpreadsheetApp.create(nombre);
  var ind = nuevo.getSheets()[0];
  ind.setName('Índice');
  czPrepararIndice_(ind, libro);
  props.setProperty(CZ.PROP_HIST, nuevo.getId());
  props.setProperty(CZ.PROP_HIST + '_N', String(n));
  return nuevo;
}

function czPrepararIndice_(ind, anterior) {
  ind.clear();
  ind.getRange('A1').setValue('HISTORIAL DE COTIZACIONES').setFontSize(14).setFontWeight('bold').setFontColor('#1F3A5F');
  if (anterior) ind.getRange('A2').setValue('Las anteriores están en: ' + anterior.getName() + ' — ' + anterior.getUrl()).setFontColor('#555555');
  var enc = ['Folio', 'Fecha', 'Cliente', 'Partidas', 'Total gama baja', 'Total gama media', 'Total gama alta', 'Ir al resumen'];
  ind.getRange(4, 1, 1, enc.length).setValues([enc]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1F3A5F');
  [90, 140, 260, 70, 140, 140, 140, 160].forEach(function (w, i) { ind.setColumnWidth(i + 1, w); });
  ind.setFrozenRows(4);
  if (ind.getMaxColumns() > 10) ind.deleteColumns(11, ind.getMaxColumns() - 10);
}

function czIndice_(libro, folio, cliente, fecha, nPart, hojas, hRes) {
  var ind = libro.getSheetByName('Índice');
  if (!ind) { ind = libro.insertSheet('Índice', 0); czPrepararIndice_(ind, null); }
  var r = Math.max(ind.getLastRow(), 4) + 1;
  var tot = function (g) { return "='" + hojas[g].hoja.getName() + "'!" + hojas[g].celdaTotal; };
  ind.getRange(r, 1, 1, 8).setValues([[folio, fecha, cliente || '—', nPart, tot('baja'), tot('media'), tot('alta'),
    '=HYPERLINK("#gid=' + hRes.getSheetId() + '","Abrir ' + folio + '")']]);
  ind.getRange(r, 2).setNumberFormat('dd/mm/yyyy hh:mm');
  ind.getRange(r, 5, 1, 3).setNumberFormat('"$"#,##0.00');
  ind.getRange(r, 1, 1, 8).setFontFamily('Arial').setFontSize(10);
}

/* ================================================================== */
/*  Escritura de la cotizacion                                         */
/* ================================================================== */

var CZ_SAL_ENC = ['Partida', 'Descripción solicitada', 'Cant. solicitada', 'Unidad', 'SKU', 'Producto ofertado',
                  'Cant. ofertada', 'Disponibilidad', 'Precio unitario', 'Importe', 'Observaciones'];
var CZ_SAL_ANCHO = [60, 310, 80, 60, 175, 310, 75, 110, 105, 115, 280];

/** El SKU que ve el cliente: sin el sufijo -CVA. */
function czSkuVisible_(sku) { return String(sku || '').replace(/-CVA\b/gi, ''); }
var CZ_MON = '"$"#,##0.00;-"$"#,##0.00;"-"';
var CZ_AZUL = '#1F3A5F';

function czFechaTexto_(f) {
  var meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var tz = Session.getScriptTimeZone();
  return Utilities.formatDate(f, tz, 'd') + ' de ' + meses[Number(Utilities.formatDate(f, tz, 'M')) - 1] + ' de ' + Utilities.formatDate(f, tz, 'yyyy');
}

function czEscribirGama_(libro, folio, g, datos, cliente, fecha) {
  var h = libro.insertSheet(folio + ' ' + g.nombre);
  h.setHiddenGridlines(true);
  var nC = CZ_SAL_ENC.length, ENC = 6;

  h.getRange('A1').setValue('COTIZACIÓN').setFontSize(18).setFontWeight('bold').setFontColor(CZ_AZUL);
  h.getRange('A2').setValue('Propuesta gama ' + g.nombre.toLowerCase() + '   ·   Folio ' + folio).setFontSize(12).setFontWeight('bold').setFontColor('#3B6EA5');
  h.getRange('A3').setValue((cliente ? 'Cliente: ' + cliente + '   ·   ' : '') + 'Fecha: ' + czFechaTexto_(fecha)).setFontSize(9).setFontColor('#555555');
  h.getRange('A4').setValue('Precios en pesos mexicanos (MXN), IVA incluido').setFontSize(9).setFontColor('#555555');

  h.getRange(ENC, 1, 1, nC).setValues([CZ_SAL_ENC]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground(CZ_AZUL)
   .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  h.setRowHeight(ENC, 34);

  var filas = datos.filas;
  var r0 = ENC + 1;
  var vals = [], fondos = [], colores = [], negritas = [];
  var banda = false, ultimaBase = null;
  filas.forEach(function (f, i) {
    var r = r0 + i;
    var baseP = String(f.partida).replace(/[a-z]$/, '');
    if (baseP !== ultimaBase) { banda = !banda; ultimaBase = baseP; }
    vals.push([f.partida, f.desc, f.cant, f.unidad, f.sku || '', f.producto, f.cantOf, f.disp, f.precio,
               '=IF(OR(G' + r + '="",I' + r + '=""),0,G' + r + '*I' + r + ')', f.obs || '']);
    var fondo = banda ? '#F4F6F9' : '#FFFFFF';
    fondos.push(new Array(nC).fill(fondo));
    var col = new Array(nC).fill('#222222');
    if (f.disp !== 'Inmediata' && f.disp !== '—') col[7] = '#B3261E';
    col[4] = '#555555';
    colores.push(col);
    var neg = new Array(nC).fill('normal'); neg[0] = 'bold';
    negritas.push(neg);
  });
  if (vals.length) {
    var rg = h.getRange(r0, 1, vals.length, nC);
    rg.setValues(vals).setBackgrounds(fondos).setFontColors(colores).setFontWeights(negritas)
      .setFontFamily('Arial').setFontSize(9).setVerticalAlignment('middle')
      .setBorder(true, true, true, true, true, true, '#C9D1DB', SpreadsheetApp.BorderStyle.SOLID);
    h.getRange(r0, 2, vals.length, 1).setWrap(true);
    h.getRange(r0, 6, vals.length, 1).setWrap(true);
    h.getRange(r0, 11, vals.length, 1).setWrap(true);
    h.getRange(r0, 5, vals.length, 1).setFontSize(8);
    [1, 3, 4, 5, 7, 8].forEach(function (c) { h.getRange(r0, c, vals.length, 1).setHorizontalAlignment('center'); });
    h.getRange(r0, 9, vals.length, 2).setNumberFormat(CZ_MON).setHorizontalAlignment('right');
  }
  var last = r0 + vals.length - 1;
  var rT = last + 2;
  h.getRange(rT, 9, 3, 2).setValues([
    ['Subtotal', '=J' + (rT + 2) + '/(1+' + CZ.IVA + ')'],
    ['IVA (' + Math.round(CZ.IVA * 100) + '%)', '=J' + (rT + 2) + '-J' + rT],
    ['TOTAL', '=SUM(J' + r0 + ':J' + last + ')']
  ]);
  h.getRange(rT, 9, 3, 1).setFontWeight('bold').setFontColor(CZ_AZUL).setHorizontalAlignment('right');
  h.getRange(rT, 10, 3, 1).setNumberFormat(CZ_MON).setHorizontalAlignment('right')
   .setBorder(true, true, true, true, true, true, '#C9D1DB', SpreadsheetApp.BorderStyle.SOLID);
  h.getRange(rT + 2, 9, 1, 2).setBackground('#EAF0F7').setFontWeight('bold').setFontSize(11);

  var rC = rT + 4;
  h.getRange(rC, 1, 4, 1).setValues([['Condiciones:'],
    ['• Precios con IVA incluido, sujetos a cambio sin previo aviso.'],
    ['• Disponibilidad sujeta a existencias al momento de confirmar el pedido.'],
    ['• Especificaciones sujetas a confirmación del fabricante.']]).setFontSize(9).setFontColor('#444444');
  h.getRange(rC, 1).setFontWeight('bold');

  CZ_SAL_ANCHO.forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  h.getRange(1, 1, rC + 3, nC).setFontFamily('Arial');
  h.setFrozenRows(ENC);
  SpreadsheetApp.flush();
  if (vals.length) h.autoResizeRows(r0, vals.length);
  czRecortar_(h, rC + 4, nC);
  return { hoja: h, celdaTotal: 'J' + (rT + 2) };
}

function czEscribirResumen_(libro, folio, cliente, fecha, hojas, datos, nPart) {
  var h = libro.insertSheet(folio + ' Resumen');
  h.setHiddenGridlines(true);
  h.getRange('A1').setValue('COTIZACIÓN').setFontSize(18).setFontWeight('bold').setFontColor(CZ_AZUL);
  h.getRange('A2').setValue('Resumen de propuestas   ·   Folio ' + folio).setFontSize(12).setFontWeight('bold').setFontColor('#3B6EA5');
  h.getRange('A3').setValue((cliente ? 'Cliente: ' + cliente + '   ·   ' : '') + 'Fecha: ' + czFechaTexto_(fecha) + '   ·   ' + nPart + ' partidas')
   .setFontSize(9).setFontColor('#555555');
  h.getRange('A4').setValue('Precios en pesos mexicanos (MXN), IVA incluido').setFontSize(9).setFontColor('#555555');

  var enc = ['Propuesta', 'Subtotal', 'IVA (' + Math.round(CZ.IVA * 100) + '%)', 'Total', 'Detalle'];
  h.getRange(6, 1, 1, 5).setValues([enc]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground(CZ_AZUL).setHorizontalAlignment('center');
  var filas = CZ_GAMAS.map(function (g, i) {
    var r = 7 + i, ref = "'" + hojas[g.id].hoja.getName() + "'!" + hojas[g.id].celdaTotal;
    return ['Gama ' + g.nombre.toLowerCase(), '=' + ref + '/(1+' + CZ.IVA + ')', '=' + ref + '-B' + r, '=' + ref,
            '=HYPERLINK("#gid=' + hojas[g.id].hoja.getSheetId() + '","Ver detalle")'];
  });
  h.getRange(7, 1, 3, 5).setValues(filas).setFontSize(10)
   .setBorder(true, true, true, true, true, true, '#C9D1DB', SpreadsheetApp.BorderStyle.SOLID);
  h.getRange(7, 2, 3, 3).setNumberFormat(CZ_MON);
  h.getRange(7, 1, 3, 1).setFontWeight('bold');
  h.getRange(7, 4, 3, 1).setFontWeight('bold');

  var notas = [];
  CZ_GAMAS.forEach(function (g) { datos[g.id].notas.forEach(function (n) { if (notas.indexOf(n) < 0) notas.push(n); }); });
  notas.push('Precios con IVA incluido, sujetos a cambio sin previo aviso y a disponibilidad al confirmar el pedido.');
  h.getRange(12, 1).setValue('Notas generales').setFontWeight('bold').setFontSize(11).setFontColor(CZ_AZUL);
  h.getRange(13, 1, notas.length, 1).setValues(notas.map(function (n) { return ['• ' + n]; })).setFontSize(10).setWrap(false);

  [170, 150, 150, 160, 120].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  h.getRange(1, 1, 13 + notas.length, 5).setFontFamily('Arial');
  czRecortar_(h, 13 + notas.length + 1, 6);
  try { libro.setActiveSheet(h); libro.moveActiveSheet(2); } catch (e) {}   // justo despues del Indice
  return h;
}

/** Deja la hoja del tamano justo: cada celda cuenta para el limite de 10 millones. */
function czRecortar_(h, filas, cols) {
  if (h.getMaxRows() > filas) h.deleteRows(filas + 1, h.getMaxRows() - filas);
  if (h.getMaxColumns() > cols) h.deleteColumns(cols + 1, h.getMaxColumns() - cols);
}

/* ================================================================== */
/*  Utilerias                                                          */
/* ================================================================== */

function czNorm_(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’‘`´]{2}|[“”]|''/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function czEsc_(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function czUi_() { try { return SpreadsheetApp.getUi(); } catch (e) { return null; } }
function czAviso_(t, m) { var ui = czUi_(); if (ui) ui.alert(t, m, ui.ButtonSet.OK); else console.log(t + ': ' + m); }
function czToast_(m) { try { SpreadsheetApp.getActive().toast(m, 'Cotizador', 8); } catch (e) {} }

function czAvisoLink_(titulo, msg, url) {
  var ui = czUi_();
  if (!ui) { console.log(titulo + ': ' + msg + ' ' + url); return; }
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial;font-size:13px;line-height:1.5">' +
    '<p>' + msg + '</p>' +
    '<p><a href="' + url + '" target="_blank" style="font-weight:bold;color:#1F3A5F">Abrir la cotización</a></p>' +
    '</div>').setWidth(420).setHeight(150);
  ui.showModalDialog(html, titulo);
}
