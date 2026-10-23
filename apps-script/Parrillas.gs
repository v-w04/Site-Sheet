/**
 * ============================================================
 *  Parrillas por KAM — el catalogo de Walmart dividido por grupo KAM
 * ============================================================
 *
 *  Una hoja por grupo KAM ("Parrilla AUDIO", "Parrilla TV", ...), lista para mandarsela al KAM.
 *  Columnas (como el archivo PARRILLA - AUDIO): SKU | ID | SELLER | WUPC | GTIN | NOMBRE | PRECIO FULL |
 *  PRECIO MEJORADO | TOTAL.
 *
 *  Quien entra a cada parrilla:
 *   - SKU que TERMINAN en -MSI, -MSI-2 ... -MSI-99, -CVA-MSI o -MSI-CVA (el MSI siempre al final).
 *   - El KAM lo decide SOLO lo que dice Walmart (hoja Walmart): la CATEGORIA y, si esa no esta en la hoja
 *     "KAMS Departamentos", el DEPARTAMENTO. NUNCA se adivina por el nombre, la marca ni el prefijo del SKU:
 *     si el producto "parece" de un KAM pero Walmart lo categoriza en otro, va a donde lo manda Walmart.
 *     Lo que no cae en ningun KAM no entra a ninguna parrilla: se anota en "Estado Killers" (DECISION).
 *   - Solo PUBLICADOS y con existencia (TOTAL > 0) y con precio.
 *
 *  Hoja "Estado Killers" (una sola hoja para decidir): todos los -MSI publicados, mas los de cualquier estatus cuya
 *  categoria no tiene KAM o que ya tienen una DECISION. La DECISION la escribes tu por SKU (columna DECISION):
 *     - el nombre de un KAM (AUDIO, TV, ...) -> entra a la parrilla de ese KAM
 *     - NO ENVIAR   -> no se manda a ningun KAM
 *     - REPUBLICAR  -> pasa a la hoja Republicar (categoria mal puesta, cobro distinto...)
 *  Tambien puedes poner REPUBLICAR (o NO ENVIAR) en GRUPO KAM CATEGORIA de KAMS Departamentos: todos los SKU de esa
 *  categoria quedan solos con DECISION = REPUBLICAR (nota AUTO). Si escribes otra decision en un SKU, esa gana.
 *  Las decisiones se conservan por SKU (la hoja se rehace sola). COBRO DISTINTO = SI si el SKU sale en la hoja
 *  "Cobro distinto". La hoja vieja "Analisis Killers" se quita sola (sus decisiones pasan a Estado Killers).
 *
 *  De donde sale cada columna de la parrilla:
 *   SKU = hoja Walmart · ID y SELLER = fijos (PAR_ID, PAR_SELLER) · WUPC = UPC de Walmart sin ceros a la izquierda ·
 *   GTIN = GTIN de Walmart sin ceros a la izquierda · NOMBRE = Concentrado (el de Odoo, sin espacios de mas) ·
 *   PRECIO FULL = MAXIMO del Concentrado (precio maximo Premium) · PRECIO MEJORADO = MINIMO del Concentrado (precio
 *   minimo Premium) · TOTAL = DISPONIBLE ODOO (libre) + WFS.
 *
 *  Se actualiza despues de cada bajada de la hoja Walmart y a mano desde el menu. Solo reescribe si algo cambio.
 *  Todo por encabezado. Las columnas que agregues a la derecha de cada parrilla se respetan.
 */

var PAR_ETAPA   = 'PARRILLAS';
var PAR_PREFIJO = 'Parrilla ';
/* Estructura de la plantilla oficial de Walmart (Plantilla_Killers_Nombre_Seller_DDmesAA_vEvento.xlsx), ajustada:
 *   ID Seller | Nombre Seller | SKU Seller | GTIN | WUPC | Descripcion | MSI | Fecha Inicio | Fecha Fin | Inv | WFS | PRECIO FULL |
 *   y por escenario el PRECIO MEJORADO del seller (sin evento, pre y post evento, evento, cyber week, black friday, cyber monday).
 *   Las columnas Precio / Killer / Precio final de cada escenario las llena Walmart: no estan en la hoja, solo en el archivo que se manda. */
var PAR_ENC     = ['ID SELLER', 'NOMBRE SELLER', 'SKU SELLER', 'GTIN', 'WUPC', 'DESCRIPCION', 'MSI', 'FECHA INICIO', 'FECHA FIN',
                   'INV', 'WFS', 'PRECIO FULL', 'PRECIO MEJORADO', 'PRE Y POST EVENTO', 'EVENTO', 'CYBER WEEK', 'BLACK FRIDAY', 'CYBER MONDAY', 'MINIMO SITE'];
/* MINIMO SITE = referencia (no se manda): el MINIMO Premium que dice el Site en la ultima corrida. Si cambias PRECIO MEJORADO a mano, queda distinto de MINIMO SITE y el script respeta tu precio. */
/* Escenarios, en el orden de la plantilla (encabezado de la hoja -> titulo del bloque en el archivo). El 1o es el precio mejorado base (sin evento). */
var PAR_ESCENARIOS = [['PRECIO MEJORADO', 'Propuesta SIN Evento'], ['PRE Y POST EVENTO', 'Propuesta PRE y POST Evento'], ['EVENTO', 'Propuesta EVENTO'],
                      ['CYBER WEEK', 'PROPUESTA CYBER WEEK'], ['BLACK FRIDAY', 'Black Friday'], ['CYBER MONDAY', 'Cyber Monday']];
/* Columnas que llenas tu (se conservan por SKU cuando la hoja se rehace). PRECIO MEJORADO es el MINIMO del Concentrado (lo pone el script). */
var PAR_USUARIO = ['FECHA INICIO', 'FECHA FIN', 'PRE Y POST EVENTO', 'EVENTO', 'CYBER WEEK', 'BLACK FRIDAY', 'CYBER MONDAY'];
var PAR_ID      = 10001341690;
var PAR_SELLER  = 'Electronics.Mexico';
var PAR_RE_SKU  = /-(MSI(-\d{1,2})?|CVA-MSI|MSI-CVA)$/i;
var PAR_PROP_HUELLA = 'PARRILLAS_HUELLA';

var PAR_HOJA_ESTADO   = 'Estado Killers';
var PAR_ENC_ESTADO    = ['SKU', 'DESCRIPCION', 'DEPARTAMENTO', 'CATEGORIA', 'KAM', 'KILLER', 'INV', 'PRECIO MEJORADO', 'PRECIO FULL', 'EN PARRILLA', 'AVISO', 'ESTATUS', 'COBRO DISTINTO', 'DECISION', 'NOTA'];
var PAR_HOJA_ANALISIS = 'Analisis Killers';
var PAR_ENC_ANALISIS  = ['SKU', 'DEPARTAMENTO', 'CATEGORIA', 'NOMBRE', 'ESTATUS', 'TOTAL', 'PRECIO FULL', 'PRECIO MEJORADO', 'COBRO DISTINTO', 'DECISION', 'NOTA'];
var PAR_NO_ENVIAR  = 'NO ENVIAR';
var PAR_REPUBLICAR = 'REPUBLICAR';
var PAR_NOTA_AUTO  = 'AUTO: categoria en REPUBLICAR';   // nota que el script pone cuando la categoria completa esta en REPUBLICAR

function parNum_(v) {
  if (typeof v === 'number') return isNaN(v) ? '' : v;
  var t = String(v === null || v === undefined ? '' : v).replace(/[$,\s]/g, '');
  if (!t || isNaN(Number(t))) return '';
  return Number(t);
}

/** Codigo numerico sin ceros a la izquierda (como en el archivo de parrilla): '00063790234035' -> 63790234035. */
function parSinCeros_(v) {
  var t = String(v === null || v === undefined ? '' : v).replace(/\D/g, '').replace(/^0+/, '');
  return t ? Number(t) : '';
}

/** Huella corta de un texto (para saber si algo cambio sin guardar todo). */
function parHuella_(txt) {
  var h = 5381;
  for (var i = 0; i < txt.length; i++) h = ((h << 5) + h + txt.charCodeAt(i)) | 0;
  return String(h) + ':' + txt.length;
}

/** Nombre de la hoja de un grupo KAM: "Parrilla AUDIO". */
function parHojaDe_(grupo) { return PAR_PREFIJO + grupo; }

/** Los grupos KAM con departamentos o con categorias asignadas: { orden:[grupo], catMapa:{DEP|CAT normalizado: grupo|'NO ENVIAR'|''} }. */
function parGrupos_() {
  var kg = kamsLeer_(), orden = [], usados = {};
  Object.keys(kg.catMapa).forEach(function (k) { if (kg.catMapa[k] && kg.catMapa[k] !== PAR_NO_ENVIAR && kg.catMapa[k] !== PAR_REPUBLICAR) usados[kg.catMapa[k]] = true; });
  kg.orden.forEach(function (g) {
    if (kg.grupos[g].cats.length || usados[g]) orden.push(g);
  });
  return { orden: orden, catMapa: kg.catMapa };
}

var PAR_ENC_CAT   = ['DEPARTAMENTO WALMART', 'CATEGORIA WALMART', 'GRUPO KAM CATEGORIA'];   // bloque 1: lo que vendemos (el que revisas)
var PAR_ENC_CAT_N = 'SKU MSI CON STOCK';
var PAR_ENC_TODAS = ['TODAS DEPARTAMENTO', 'TODAS CATEGORIA', 'TODAS GRUPO KAM', 'TODAS SKU', 'TODAS ULTIMO'];   // bloque 2: todas las de Walmart (verificacion)
var PAR_DEPS_SIN_SUGERENCIA = /CELULARES|FARMACIA|AUTOS|JUGUETE|MUEBLES|COCINA|MODA|PATIO|OFICINA|LIBROS|CUIDADO PERSONAL$/;
/* Sugerencia por el NOMBRE DE LA CATEGORIA de Walmart (nunca por nombre/marca del producto). Solo es un punto de partida: tu eliges en el dropdown. */
var PAR_SUGERENCIAS = [
  ['COMPUTACION', /CAMARAS WEB/],
  ['FOTOGRAFIA', /IMPRESORAS FOTOGRAFICAS|CAMARA|LENTES DE CAMARA|TRIPODE|DRONES|ESTABILIZADOR|MONTURA|PAPEL FOTOGRAFICO/],
  ['AUDIO', /AUDIFONO|AURICULAR|BOCINA|ALTAVOC|BARRAS? DE SONIDO|TORNAMESA|MEZCLADOR|GRABADORA|GRABADORES DE AUDIO|UNIDAD CENTRAL|MICROFONO|SISTEMA PA|KARAOKE|RADIO/],
  ['VIDEOJUEGOS', /CONSOLA|VIDEOJUEGO|SILLA GAMER|REALIDAD VIRTUAL/],
  ['COMPUTACION', /LAPTOP|COMPUTADORA|RATON|RATONES|TECLADO|MONITOR|TABLET|IMPRESORA|DISCOS? DURO|MEMORIA USB|MEMORIA RAM|PROCESADOR|TARJETA|GABINETE|ENRUTADOR|WI-FI|CONCENTRADORES USB|STYLUS|ALFOMBRILLA|PROYECTOR|FUENTES DE ALIMENTACION|PLACA MADRE|RECARGAS DE TINTA/]
];

/** Sugerencia de KAM para una categoria nueva: por el nombre de la categoria; si no, por el departamento (A:B de KAMS Departamentos). '' = sin sugerencia. */
function parSugerir_(dep, cat, grupos, porDepto) {
  var d = normEnc_(dep), c = normEnc_(cat);
  if (!PAR_DEPS_SIN_SUGERENCIA.test(d)) {
    for (var i = 0; i < PAR_SUGERENCIAS.length; i++) {
      if (PAR_SUGERENCIAS[i][1].test(c) && grupos.indexOf(PAR_SUGERENCIAS[i][0]) >= 0) return PAR_SUGERENCIAS[i][0];  // col-fija: arreglo interno, no columna de hoja
    }
  }
  return porDepto[d] || '';
}


/** Escribe un valor (o lista) en las columnas por encabezado de la hoja; agrega a la derecha los encabezados que falten. */
function parAsegurarEnc_(h, nombres) {
  var ult = Math.max(h.getLastColumn(), 1);
  var enc = h.getRange(1, 1, 1, ult).getValues()[0].map(normEnc_);
  var falta = nombres.filter(function (n) { return enc.indexOf(normEnc_(n)) < 0; });
  if (!falta.length) return;
  var sig = ult + (falta.length === nombres.length ? 2 : 1);   // un bloque nuevo deja una columna vacia de separacion
  falta.forEach(function (n) {
    h.getRange(1, sig).setValue(n).setBackground('#1F3A5F').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
    sig++;
  });
}

/**
 * Categorias de Walmart -> KAM, en la hoja "KAMS Departamentos" (A:B no se tocan; todo a la derecha, por encabezado).
 *  Bloque 1 (lo que revisas): DEPARTAMENTO WALMART | CATEGORIA WALMART | GRUPO KAM CATEGORIA | SKU MSI CON STOCK
 *     solo las categorias de lo que VENDEMOS (SKU -MSI publicados con existencia), ordenadas por KAM: las sin decidir arriba.
 *  Bloque 2 (verificacion): TODAS DEPARTAMENTO | TODAS CATEGORIA | TODAS GRUPO KAM | TODAS SKU | TODAS ULTIMO
 *     todas las categorias que hay en la hoja Walmart. TODAS ULTIMO = el valor de la corrida anterior (lo usa el script).
 *  Los dos bloques se sincronizan en los dos sentidos: lo que cambies en uno se copia al otro en la siguiente corrida
 *  (si cambias los dos, gana el bloque 1). Al cambiar un KAM, la fila se acomoda sola en su grupo.
 * @return {{nuevas:number, sinDecidir:number, total:number, enB:number}}
 */
function parCategorias_() {
  var ss = kcCrearHojas_();
  var hW = ss.getSheetByName(CC_WALMART), hC = ss.getSheetByName(CC_HOJA);
  var hD = ss.getSheetByName(KC_HOJA_DEPTOS);
  if (!hW || hW.getLastRow() < 2 || !hD) return { nuevas: 0, sinDecidir: 0, total: 0, enB: 0 };

  // 1) lo que hay en Walmart: categorias, cuantos SKU, y cuantos vendibles (-MSI publicados con existencia)
  var conc = {};
  if (hC && hC.getLastRow() >= 2) {
    var mc = colsHoja_(hC, ['SKU', 'DISPONIBLE ODOO'], ['WFS']);
    hC.getRange(2, 1, hC.getLastRow() - 1, hC.getLastColumn()).getValues().forEach(function (f) {
      var k = String(f[mc.SKU] || '').trim().toUpperCase();
      if (k) conc[k] = (parNum_(f[mc['DISPONIBLE ODOO']]) || 0) + (mc.WFS >= 0 ? (parNum_(f[mc.WFS]) || 0) : 0);
    });
  }
  var mw = colsHoja_(hW, ['SKU', 'DEPARTAMENTO', 'ESTATUS'], ['CATEGORIA']);
  var pares = {};
  hW.getRange(2, 1, hW.getLastRow() - 1, hW.getLastColumn()).getValues().forEach(function (f) {
    var dep = String(f[mw.DEPARTAMENTO] || '').trim(), cat = mw.CATEGORIA >= 0 ? String(f[mw.CATEGORIA] || '').trim() : '';
    if (!dep && !cat) return;
    var k = normEnc_(dep) + '|' + normEnc_(cat);
    var P = pares[k] || (pares[k] = { dep: dep, cat: cat, n: 0, v: 0 });
    P.n++;
    var sku = String(f[mw.SKU] || '').trim();
    if (PAR_RE_SKU.test(sku) && normEnc_(f[mw.ESTATUS]) === 'PUBLISHED' && (conc[sku.toUpperCase()] || 0) > 0) P.v++;
  });

  // 2) los dos bloques tal como estan en la hoja
  parAsegurarEnc_(hD, PAR_ENC_CAT.concat([PAR_ENC_CAT_N]));
  parAsegurarEnc_(hD, PAR_ENC_TODAS);
  var m = colsHoja_(hD, PAR_ENC_CAT.concat([PAR_ENC_CAT_N]).concat(PAR_ENC_TODAS));
  var pos = function (n) { return m[n] + 1; };   // col-fija: posicion 1-based de un encabezado ya localizado
  var vals = hD.getLastRow() >= 2 ? hD.getRange(2, 1, hD.getLastRow() - 1, hD.getLastColumn()).getValues() : [];
  var A = {}, B = {}, filasA = 0, filasB = 0, nombres = {};
  vals.forEach(function (f, i) {
    var dA = String(f[m[PAR_ENC_CAT[0]]] || '').trim(), cA = String(f[m[PAR_ENC_CAT[1]]] || '').trim();  // col-fija: arreglo interno, no columna de hoja
    if (dA || cA) { var kA = normEnc_(dA) + '|' + normEnc_(cA); A[kA] = String(f[m[PAR_ENC_CAT[2]]] || '').trim(); nombres[kA] = [dA, cA]; filasA = i + 1; }  // col-fija: arreglo interno, no columna de hoja
    var dB = String(f[m[PAR_ENC_TODAS[0]]] || '').trim(), cB = String(f[m[PAR_ENC_TODAS[1]]] || '').trim();  // col-fija: arreglo interno, no columna de hoja
    if (dB || cB) {
      var kB = normEnc_(dB) + '|' + normEnc_(cB);
      B[kB] = { v: String(f[m[PAR_ENC_TODAS[2]]] || '').trim(), u: String(f[m[PAR_ENC_TODAS[4]]] || '').trim() };  // col-fija: arreglo interno, no columna de hoja
      nombres[kB] = nombres[kB] || [dB, cB]; filasB = i + 1;
    }
  });

  // 3) valor final de cada categoria: lo que cambiaste (en cualquiera de los dos bloques) o la sugerencia si es nueva
  var g = parGrupos_(), porDepto = {}, kg = kamsLeer_();
  kg.orden.forEach(function (gr) { kg.grupos[gr].cats.forEach(function (c) { if (!(c in porDepto)) porDepto[c] = gr; }); });
  var claves = {};
  Object.keys(pares).forEach(function (k) { claves[k] = true; nombres[k] = [pares[k].dep, pares[k].cat]; });
  Object.keys(B).forEach(function (k) { claves[k] = true; });
  Object.keys(A).forEach(function (k) { claves[k] = true; });
  var final = {}, nuevas = 0;
  Object.keys(claves).forEach(function (k) {
    var b = B[k], a = A[k], v;
    if (!b && a === undefined) { v = parSugerir_(nombres[k][0], nombres[k][1], g.orden, porDepto); nuevas++; }  // col-fija: arreglo interno, no columna de hoja
    else if (a !== undefined && (!b || a !== b.u)) v = a;           // cambiaste el bloque 1 (o es una fila nueva ahi)
    else v = b ? b.v : '';                                          // si no, manda el bloque 2
    final[k] = v;
  });

  // 4) bloque 2: todas, por departamento y categoria
  var ordenB = Object.keys(claves).sort(function (x, y) { return (nombres[x][0] + '|' + nombres[x][1]) < (nombres[y][0] + '|' + nombres[y][1]) ? -1 : 1; });  // col-fija: arreglo interno, no columna de hoja
  // 5) bloque 1: solo lo que vendemos; sin decidir arriba, luego por KAM, NO ENVIAR al final
  var rango = function (v) { return !v ? -1 : ((v === PAR_NO_ENVIAR || v === PAR_REPUBLICAR) ? 9999 : g.orden.indexOf(v) < 0 ? 9000 : g.orden.indexOf(v)); };
  var ordenA = Object.keys(pares).filter(function (k) { return pares[k].v > 0; }).sort(function (x, y) {
    return (rango(final[x]) - rango(final[y])) || ((nombres[x][0] + '|' + nombres[x][1]) < (nombres[y][0] + '|' + nombres[y][1]) ? -1 : 1);  // col-fija: arreglo interno, no columna de hoja
  });

  var poner = function (nombre, filas, anterior) {
    var n = filas.length, c = pos(nombre);
    if (n) hD.getRange(2, c, n, 1).setValues(filas.map(function (x) { return [x]; }));
    if (anterior > n) hD.getRange(2 + n, c, anterior - n, 1).clearContent();
  };
  poner(PAR_ENC_CAT[0], ordenA.map(function (k) { return nombres[k][0]; }), filasA);  // col-fija: arreglo interno, no columna de hoja
  poner(PAR_ENC_CAT[1], ordenA.map(function (k) { return nombres[k][1]; }), filasA);  // col-fija: arreglo interno, no columna de hoja
  poner(PAR_ENC_CAT[2], ordenA.map(function (k) { return final[k]; }), filasA);  // col-fija: arreglo interno, no columna de hoja
  poner(PAR_ENC_CAT_N, ordenA.map(function (k) { return pares[k].v; }), filasA);
  poner(PAR_ENC_TODAS[0], ordenB.map(function (k) { return nombres[k][0]; }), filasB);  // col-fija: arreglo interno, no columna de hoja
  poner(PAR_ENC_TODAS[1], ordenB.map(function (k) { return nombres[k][1]; }), filasB);  // col-fija: arreglo interno, no columna de hoja
  poner(PAR_ENC_TODAS[2], ordenB.map(function (k) { return final[k]; }), filasB);  // col-fija: arreglo interno, no columna de hoja
  poner(PAR_ENC_TODAS[3], ordenB.map(function (k) { return pares[k] ? pares[k].n : 0; }), filasB);  // col-fija: arreglo interno, no columna de hoja
  poner(PAR_ENC_TODAS[4], ordenB.map(function (k) { return final[k]; }), filasB);  // col-fija: arreglo interno, no columna de hoja

  // dropdowns y anchos
  try {
    var lista = g.orden.concat([PAR_NO_ENVIAR, PAR_REPUBLICAR]);
    var dv = function () { return SpreadsheetApp.newDataValidation().requireValueInList(lista, true).setAllowInvalid(true).build(); };
    // 1) quitar cualquier lista suelta en toda la hoja (de versiones anteriores o de otro modulo)
    var filasHoja = Math.max(hD.getMaxRows() - 1, 1), colsHoja = Math.max(hD.getMaxColumns(), 1);
    var c0 = pos(PAR_ENC_CAT[0]);   // solo de los bloques de categorias hacia la derecha: la tabla DEPARTAMENTO | GRUPO KAM (izquierda) conserva su lista
    hD.getRange(2, c0, filasHoja, Math.max(colsHoja - c0 + 1, 1)).clearDataValidations();
    // tabla de la izquierda: GRUPO KAM tambien con lista (solo en sus renglones con departamento)
    var encs = hD.getRange(1, 1, 1, colsHoja).getValues()[0].map(function (x) { return normEnc_(x); });
    var cD = encs.indexOf(normEnc_('DEPARTAMENTO')) + 1, cG = encs.indexOf(normEnc_('GRUPO KAM')) + 1;
    if (cD > 0 && cG > 0 && hD.getLastRow() >= 2) {
      var dd = hD.getRange(2, cD, hD.getLastRow() - 1, 1).getValues(), nD = 0;
      dd.forEach(function (x, i) { if (String(x[0] || '').trim()) nD = i + 1; });
      if (nD) hD.getRange(2, cG, nD, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(g.orden, true).setAllowInvalid(true).build());
    }
    // 2) la lista solo en las filas que tienen categoria (ni una de mas)
    if (ordenA.length) hD.getRange(2, pos(PAR_ENC_CAT[2]), ordenA.length, 1).setDataValidation(dv());  // col-fija: arreglo interno, no columna de hoja
    if (ordenB.length) hD.getRange(2, pos(PAR_ENC_TODAS[2]), ordenB.length, 1).setDataValidation(dv());  // col-fija: arreglo interno, no columna de hoja
    if (nuevas || !filasB) {
      var anchos = [PAR_ENC_CAT[0], 260, PAR_ENC_CAT[1], 320, PAR_ENC_CAT[2], 190, PAR_ENC_CAT_N, 120,  // col-fija: arreglo interno, no columna de hoja
                    PAR_ENC_TODAS[0], 260, PAR_ENC_TODAS[1], 320, PAR_ENC_TODAS[2], 190, PAR_ENC_TODAS[3], 90, PAR_ENC_TODAS[4], 120];  // col-fija: arreglo interno, no columna de hoja
      for (var i = 0; i < anchos.length; i += 2) hD.setColumnWidth(pos(anchos[i]), anchos[i + 1]);
    }
  } catch (e) {}

  var sinDecidir = ordenA.filter(function (k) { return !final[k]; }).length;
  return { nuevas: nuevas, sinDecidir: sinDecidir, total: ordenA.length, enB: ordenB.length };
}

/**
 * Las decisiones que escribiste por SKU en "Estado Killers" (columnas DECISION y NOTA): { dec:{SKU: texto}, nota:{SKU: texto} }.
 * Si todavia existe la hoja vieja "Analisis Killers" tambien se leen sus decisiones (las de Estado Killers mandan),
 * para no perder nada al quitarla.
 */
function parDecisiones_(ss) {
  var out = { dec: {}, nota: {} };
  var leer = function (nombre, pisar) {
    var h = ss.getSheetByName(nombre);
    if (!h || h.getLastRow() < 2) return;
    var m = colsHoja_(h, ['SKU'], ['DECISION', 'NOTA']);
    if (m.DECISION < 0) return;   // hoja con el formato anterior (sin DECISION): todavia no hay decisiones ahi
    h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues().forEach(function (f) {
      var k = String(f[m.SKU] || '').trim().toUpperCase();
      if (!k) return;
      var d = String(f[m.DECISION] || '').trim();
      var n = (m.NOTA >= 0) ? String(f[m.NOTA] || '').trim() : '';
      var auto = (normEnc_(d) === normEnc_(PAR_REPUBLICAR) && n.indexOf(PAR_NOTA_AUTO) === 0);   // la puso el script por la categoria: no es decision tuya
      if (!pisar && (k in out.dec)) return;
      if (d && !auto) out.dec[k] = d;
      if (n && !auto) out.nota[k] = n;
    });
  };
  leer(PAR_HOJA_ESTADO, true);
  leer(PAR_HOJA_ANALISIS, false);   // hoja vieja (se borra sola despues de pasar sus decisiones a Estado Killers)
  return out;
}

/** Lo que escribiste en las columnas tuyas de una parrilla, por SKU: { SKU: { ENCABEZADO: valor } }. */
function parPrevios_(ss, grupo) {
  var out = {}, h = ss.getSheetByName(parHojaDe_(grupo));
  if (!h || h.getLastRow() < 2) return out;
  var enc = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(normEnc_);
  if (enc.indexOf('SKU SELLER') < 0) return out;                       // hoja con el formato anterior: no hay nada que conservar
  var leer = PAR_USUARIO.concat(['PRECIO MEJORADO', 'MINIMO SITE']);
  var m = colsHoja_(h, ['SKU SELLER'], leer);
  h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues().forEach(function (f) {
    var k = String(f[m['SKU SELLER']] || '').trim().toUpperCase();
    if (!k) return;
    var o = {};
    leer.forEach(function (n) { if (m[n] >= 0 && f[m[n]] !== '' && f[m[n]] !== null) o[n] = f[m[n]]; });
    out[k] = o;
  });
  return out;
}

/** Primer y ultimo dia del mes que viene (fechas por omision de la parrilla; las puedes cambiar a mano). */
function parFechasMes_() {
  var mm = parseInt(Utilities.formatDate(new Date(), TZ, 'M'), 10), yy = parseInt(Utilities.formatDate(new Date(), TZ, 'yyyy'), 10);
  mm++;
  if (mm > 12) { mm = 1; yy++; }
  return [new Date(yy, mm - 1, 1), new Date(yy, mm, 0)];
}

/**
 * Arma las filas de cada parrilla y de "Analisis Killers" desde las hojas Walmart y Concentrado (solo lectura).
 * @return {{porGrupo:Object, analisis:Array, sinKam:Object, sinPrecio:number, grupos:string[]}}
 */
function parArmar_() {
  var ss = getSpreadsheet_();
  var hW = ss.getSheetByName(CC_WALMART), hC = ss.getSheetByName(CC_HOJA);
  if (!hW || hW.getLastRow() < 2) throw new Error('La hoja "' + CC_WALMART + '" esta vacia: baja el catalogo de Walmart primero.');
  if (!hC || hC.getLastRow() < 2) throw new Error('La hoja "' + CC_HOJA + '" esta vacia: arma el Concentrado primero.');
  var g = parGrupos_();
  if (!g.orden.length) throw new Error('La hoja "KAMS Departamentos" no tiene grupos ni categorias: no se sabe a que KAM va cada producto.');
  var decs = parDecisiones_(ss);

  var mw = colsHoja_(hW, ['SKU', 'DEPARTAMENTO', 'ESTATUS'], ['UPC', 'GTIN', 'CATEGORIA']);
  var mc = colsHoja_(hC, ['SKU', 'NOMBRE', 'MINIMO', 'MAXIMO', 'DISPONIBLE ODOO'], ['WFS', 'ES WFS', 'KILLER']);
  var W = hW.getRange(2, 1, hW.getLastRow() - 1, hW.getLastColumn()).getValues();
  var C = hC.getRange(2, 1, hC.getLastRow() - 1, hC.getLastColumn()).getValues();
  var conc = {};
  C.forEach(function (f) { var k = String(f[mc.SKU] || '').trim().toUpperCase(); if (k) conc[k] = f; });

  // SKU que salen en "Cobro distinto" (filtro para republicar)
  var cobro = {};
  var hCd = ss.getSheetByName(CD_HOJA);
  if (hCd && hCd.getLastRow() >= 2) {
    var mcd = colsHoja_(hCd, ['SKU']);
    hCd.getRange(2, 1, hCd.getLastRow() - 1, hCd.getLastColumn()).getValues().forEach(function (f) {
      var k = String(f[mcd.SKU] || '').trim().toUpperCase(); if (k) cobro[k] = true;
    });
  }

  var porGrupo = {}, sinKam = {}, sinPrecio = 0, analisis = [], previos = {}, estado = [], manuales = 0;
  g.orden.forEach(function (x) { porGrupo[x] = []; previos[x] = parPrevios_(ss, x); });
  var fechas = parFechasMes_();
  W.forEach(function (f) {
    var sku = String(f[mw.SKU] || '').trim();
    if (!sku || !PAR_RE_SKU.test(sku)) return;
    var k = sku.toUpperCase(), c = conc[k];
    var dep = String(f[mw.DEPARTAMENTO] || ''), cat = mw.CATEGORIA >= 0 ? String(f[mw.CATEGORIA] || '') : '';
    var estatus = String(f[mw.ESTATUS] || '');
    var total = c ? (parNum_(c[mc['DISPONIBLE ODOO']]) || 0) + (mc.WFS >= 0 ? (parNum_(c[mc.WFS]) || 0) : 0) : 0;
    var full = c ? parNum_(c[mc.MAXIMO]) : '', mej = c ? parNum_(c[mc.MINIMO]) : '';
    var nombre = c ? String(c[mc.NOMBRE] || '').replace(/\s+/g, ' ').trim() : '';

    // KAM por la tabla de categorias (KAMS Departamentos): la categoria de Walmart decide. Vacio = por decidir.
    var vCat = g.catMapa[normEnc_(dep) + '|' + normEnc_(cat)] || '';
    var catNoEnviar = (vCat === PAR_NO_ENVIAR);
    var catRepub = (vCat === PAR_REPUBLICAR);
    var delMapa = (vCat && !catNoEnviar && !catRepub && g.orden.indexOf(vCat) >= 0) ? vCat : '';
    var d = decs.dec[k] ? normEnc_(decs.dec[k]) : '';
    var grupo = delMapa;
    if (d) {
      if (g.orden.indexOf(d) >= 0) grupo = d;                       // la decision es un KAM: gana
      else if (d === PAR_NO_ENVIAR || d === PAR_REPUBLICAR) grupo = '';
    }

    var enAnalisis = ((!delMapa && !catNoEnviar) || d);
    var decFila = decs.dec[k] || '', notaFila = decs.nota[k] || '';
    if (enAnalisis) {
      if (!decFila && catRepub) { decFila = PAR_REPUBLICAR; notaFila = PAR_NOTA_AUTO; }   // categoria completa en REPUBLICAR: todos sus SKU quedan en REPUBLICAR
      analisis.push([sku, dep, cat, nombre, estatus, total, full, mej, cobro[k] ? 'SI' : 'NO', decFila, notaFila]);
    }

    // Precio mejorado: el MINIMO del Site, salvo que lo hayas cambiado a mano en la parrilla (entonces se respeta)
    var pvx = grupo ? (previos[grupo][k] || {}) : {};
    var msOld = parNum_(pvx['MINIMO SITE']), pmOld = parNum_(pvx['PRECIO MEJORADO']);
    var manual = (mej !== '' && pmOld !== '' && msOld !== '' && pmOld !== msOld);
    var pm = manual ? pmOld : mej;
    if (manual && grupo) manuales++;
    // Estado Killers: todos los -MSI publicados, con su KAM, si tienen killer (columna KILLER del Concentrado) y avisos
    var publicado = (normEnc_(estatus) === 'PUBLISHED');
    if (publicado || enAnalisis) {
      var kam = grupo || d || (catNoEnviar ? PAR_NO_ENVIAR : catRepub ? PAR_REPUBLICAR : 'POR DECIDIR');
      var kil = (c && mc.KILLER >= 0 && normEnc_(c[mc.KILLER]) === 'SI') ? 'SI' : 'NO';
      var av = [];
      if (!c) av.push('NO ESTA EN EL CONCENTRADO');
      else if (full === '' || mej === '') av.push('SIN PRECIO MINIMO/MAXIMO');
      if (total <= 0) av.push('SIN STOCK');
      if (!publicado) av.push('NO PUBLICADO');
      if (manual) av.push('PRECIO MEJORADO AJUSTADO A MANO');
      if (!grupo) av.push(kam === 'POR DECIDIR' ? 'CATEGORIA SIN KAM' : kam === PAR_REPUBLICAR ? 'SE REPUBLICA' : 'NO SE ENVIA');
      var entra = publicado && !!grupo && total > 0 && full !== '' && mej !== '';
      estado.push([sku, nombre, dep, cat, kam, kil, total, pm, full, entra ? 'SI' : 'NO', av.join(' · '),     // col-fija: en el orden de PAR_ENC_ESTADO
                   estatus, cobro[k] ? 'SI' : 'NO', decFila, notaFila]);
    }
    if (normEnc_(estatus) !== 'PUBLISHED' || total <= 0) return;
    if (!grupo) {
      if (!d && !catNoEnviar && !catRepub) { var etq = (dep || '(sin departamento)') + (cat ? ' / ' + cat : ''); sinKam[etq] = (sinKam[etq] || 0) + 1; }
      return;
    }
    if (full === '' || mej === '') { sinPrecio++; return; }
    var pv = pvx;
    var u = function (n, def) { return (n in pv) ? pv[n] : def; };
    var esWfs = (mc['ES WFS'] >= 0 && normEnc_(c[mc['ES WFS']]) === 'SI') ? 'SI' : 'NO';
    porGrupo[grupo].push([                      // col-fija: en el orden de PAR_ENC
      PAR_ID, PAR_SELLER, sku,
      mw.GTIN >= 0 ? parSinCeros_(f[mw.GTIN]) : '', mw.UPC >= 0 ? parSinCeros_(f[mw.UPC]) : '',
      nombre, 'SI', u('FECHA INICIO', fechas[0]), u('FECHA FIN', fechas[1]),
      total, esWfs, full, pm,
      u('PRE Y POST EVENTO', ''), u('EVENTO', ''), u('CYBER WEEK', ''), u('BLACK FRIDAY', ''), u('CYBER MONDAY', ''), mej
    ]);
  });
  var cmp = function (a, b) { return a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0; };   // col-fija: filas armadas aqui, SKU SELLER es la 3a
  g.orden.forEach(function (x) { porGrupo[x].sort(cmp); });
  analisis.sort(function (a, b) {                                                  // col-fija: DEPARTAMENTO, CATEGORIA, SKU
    return (a[1] + '|' + a[2] + '|' + a[0]) < (b[1] + '|' + b[2] + '|' + b[0]) ? -1 : 1;
  });
  estado.sort(function (a, b) {                                                    // col-fija: KAM, CATEGORIA, SKU
    return (a[4] + '|' + a[3] + '|' + a[0]) < (b[4] + '|' + b[3] + '|' + b[0]) ? -1 : 1;
  });
  return { porGrupo: porGrupo, analisis: analisis, estado: estado, manuales: manuales, sinKam: sinKam, sinPrecio: sinPrecio, grupos: g.orden };
}

/** Colores por escenario (mismos que en el archivo que se manda). */
var PAR_COLORES_ESC = ['#4472C4', '#ED7D31', '#4C216D', '#FFC000', '#7F7F7F', '#44546A'];

/**
 * Formato de trabajo de una hoja Parrilla (solo estilo; nunca toca datos): encabezados por color
 * (azul = datos del producto, verde = lo que llena el seller, color del escenario en cada precio de evento),
 * titulos de encabezado de 2 renglones, congelado hasta SKU SELLER, filtro, anchos, alineacion y franjas.
 */
function parFormato_(h, n) {
  var m = colsHoja_(h, PAR_ENC);
  var pos = function (e) { return m[e] + 1; };   // col-fija: posicion 1-based de un encabezado ya localizado
  var C = PAR_ENC.length, filas = Math.max(n, 1);
  var enc = h.getRange(1, 1, 1, h.getLastColumn());
  enc.setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true).setFontColor('#FFFFFF');
  PAR_ENC.forEach(function (e) { h.getRange(1, pos(e)).setBackground('#4472C4'); });
  ['FECHA INICIO', 'FECHA FIN', 'INV', 'WFS', 'PRECIO FULL'].forEach(function (e) { h.getRange(1, pos(e)).setBackground('#00B050').setFontColor('#000000'); });
  h.getRange(1, pos('MINIMO SITE')).setBackground('#7F7F7F').setFontColor('#FFFFFF')
    .setNote('Referencia (no se manda): el MINIMO Premium que dice el Site. Si cambias PRECIO MEJORADO a mano, el script respeta tu precio.');
  PAR_ESCENARIOS.forEach(function (es, k) {
    var c = h.getRange(1, pos(es[0]));
    if (k === 0) c.setBackground('#00B050').setFontColor('#000000');
    else c.setBackground(PAR_COLORES_ESC[k]).setFontColor('#FFFFFF');
    c.setNote(es[1] + (k === 0 ? ' (el script pone el MINIMO Premium)' : ' (lo escribes tu; se conserva por SKU)'));
  });
  h.setRowHeight(1, 34);
  h.setFrozenRows(1);
  h.setFrozenColumns(pos('SKU SELLER'));
  try { escrFiltro_(h, 1); } catch (e) {}
  var ANCHOS = { 'ID SELLER': 100, 'NOMBRE SELLER': 130, 'SKU SELLER': 230, 'GTIN': 130, 'WUPC': 130, 'DESCRIPCION': 360, 'MSI': 55,
                 'FECHA INICIO': 95, 'FECHA FIN': 95, 'INV': 65, 'WFS': 55, 'PRECIO FULL': 105, 'PRECIO MEJORADO': 115,
                 'PRE Y POST EVENTO': 115, 'EVENTO': 105, 'CYBER WEEK': 105, 'BLACK FRIDAY': 105, 'CYBER MONDAY': 105, 'MINIMO SITE': 110 };
  PAR_ENC.forEach(function (e) { h.setColumnWidth(pos(e), ANCHOS[e] || 100); });
  if (n) {
    ['ID SELLER', 'MSI', 'FECHA INICIO', 'FECHA FIN', 'INV', 'WFS'].forEach(function (e) { h.getRange(2, pos(e), n, 1).setHorizontalAlignment('center'); });
    ['GTIN', 'WUPC'].forEach(function (e) { h.getRange(2, pos(e), n, 1).setHorizontalAlignment('left'); });
    h.getRange(2, pos('DESCRIPCION'), n, 1).setWrap(false);
    // franjas suaves (solo en las columnas del script, para no pisar otros colores tuyos)
    var fondos = [];
    for (var i = 0; i < n; i++) fondos.push(['#FFFFFF']);
    for (var j = 1; j < n; j += 2) fondos[j] = ['#F3F6FA'];
    PAR_ENC.forEach(function (e) { h.getRange(2, pos(e), n, 1).setBackgrounds(fondos); });
    // validacion SI/NO en MSI y WFS
    var dv = SpreadsheetApp.newDataValidation().requireValueInList(['SI', 'NO'], true).setAllowInvalid(true).build();
    h.getRange(2, pos('MSI'), n, 1).setDataValidation(dv);
    h.getRange(2, pos('WFS'), n, 1).setDataValidation(dv);
  }
}

/** Letra de columna (1 = A). */
function parLetra_(n) {
  var s = '';
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Formato de la hoja "Estado Killers" (solo estilo): encabezado, filtro, congelado, anchos y colores por regla. */
function parFormatoEstado_(h, n) {
  var m = colsHoja_(h, PAR_ENC_ESTADO);
  var pos = function (e) { return m[e] + 1; };   // col-fija: posicion 1-based de un encabezado ya localizado
  h.getRange(1, 1, 1, h.getLastColumn()).setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setWrap(true).setFontColor('#FFFFFF').setBackground('#1F3A5F');
  h.setRowHeight(1, 32);
  h.setFrozenRows(1);
  h.setFrozenColumns(1);
  try { escrFiltro_(h, 1); } catch (e) {}
  var ANCHOS = { 'SKU': 230, 'DESCRIPCION': 360, 'DEPARTAMENTO': 170, 'CATEGORIA': 220, 'KAM': 140, 'KILLER': 70, 'INV': 65,
                 'PRECIO MEJORADO': 115, 'PRECIO FULL': 105, 'EN PARRILLA': 95, 'AVISO': 300,
                 'ESTATUS': 110, 'COBRO DISTINTO': 110, 'DECISION': 150, 'NOTA': 260 };
  PAR_ENC_ESTADO.forEach(function (e) { h.setColumnWidth(pos(e), ANCHOS[e] || 100); });
  var lK = parLetra_(pos('KILLER')), lP = parLetra_(pos('EN PARRILLA'));
  var filas = Math.max(n, 1);
  var rango = function (e) { return h.getRange(2, pos(e), filas, 1); };
  ['KILLER', 'INV', 'EN PARRILLA', 'ESTATUS', 'COBRO DISTINTO', 'DECISION'].forEach(function (e) { rango(e).setHorizontalAlignment('center'); });
  var R = SpreadsheetApp.newConditionalFormatRule;
  h.setConditionalFormatRules([
    R().whenFormulaSatisfied('=$' + lK + '2="SI"').setBackground('#D9EAD3').setRanges([rango('KILLER')]).build(),                              // tiene killer
    R().whenFormulaSatisfied('=AND($' + lK + '2="NO",$' + lP + '2="SI")').setBackground('#FCE5CD').setRanges([rango('KILLER')]).build(),      // sin killer y va en la parrilla
    R().whenFormulaSatisfied('=LEN($' + parLetra_(pos('AVISO')) + '2)>0').setBackground('#FFF2CC').setRanges([rango('AVISO')]).build()         // hay aviso
  ]);
}

/** Hace todo (con candado). Devuelve { omitido, cambio, cuantos:{grupo:n}, analisis, sinKam, sinPrecio }. */
function parActualizar_(forzar, esperaMs) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(esperaMs || LOCK_ESPERA_MS)) return { omitido: true, motivo: 'ocupado' };
  try { return parActualizarCon_(forzar); } finally { lock.releaseLock(); }
}

function parActualizarCon_(forzar) {
  var ss = getSpreadsheet_();
  var cat = parCategorias_();
  var r = parArmar_();
  var decs0 = parDecisiones_(ss);   // las que habia antes de rehacer (para avisar si alguna ya no tiene SKU)
  var cuantos = {}, total = 0;
  r.grupos.forEach(function (g) { cuantos[g] = r.porGrupo[g].length; total += cuantos[g]; });
  var porDecidir = r.analisis.filter(function (f) { return !String(f[9] || '').trim(); }).length;   // col-fija: fila armada arriba (DECISION)

  var huella = parHuella_(JSON.stringify([r.porGrupo, r.analisis, r.estado, cat.sinDecidir]));
  var previa = '';
  try { previa = PropertiesService.getScriptProperties().getProperty(PAR_PROP_HUELLA) || ''; } catch (e) {}
  var faltanHojas = r.grupos.some(function (g) { return r.porGrupo[g].length && !ss.getSheetByName(parHojaDe_(g)); }) || !ss.getSheetByName(PAR_HOJA_ESTADO) || !!ss.getSheetByName(PAR_HOJA_ANALISIS);
  var cambio = forzar === true || faltanHojas || huella !== previa;

  var pub = function (x) { return normEnc_(x[11]) === 'PUBLISHED'; };   // col-fija: ESTATUS
  var conKiller = r.estado.filter(function (x) { return pub(x) && x[5] === 'SI'; }).length;                                   // col-fija: KILLER
  var sinKiller = r.estado.filter(function (x) { return x[5] === 'NO' && x[9] === 'SI'; }).length;                 // col-fija: KILLER, EN PARRILLA
  var sinPrecioE = r.estado.filter(function (x) { return pub(x) && String(x[10]).indexOf('SIN PRECIO') >= 0; }).length;       // col-fija: AVISO
  var sinKamTxt = Object.keys(r.sinKam).map(function (d) { return d + ' (' + r.sinKam[d] + ')'; }).join(', ');
  var resumen = r.grupos.map(function (g) { return g + ' ' + cuantos[g]; }).join(' · ');

  if (cambio) {
    r.grupos.forEach(function (g) {
      // Un grupo sin ningun SKU todavia (p. ej. JUGUETERIA recien agregado) no crea su hoja: una hoja menos.
      // Si la hoja ya existe se sigue reescribiendo (vacia si ya no tiene nada).
      if (!r.porGrupo[g].length && !ss.getSheetByName(parHojaDe_(g))) return;
      var h = getHoja_(parHojaDe_(g));
      reescribirHoja_(h, PAR_ENC, r.porGrupo[g], {
        vacioOk: true, texto: ['NOMBRE SELLER'],
        formatos: { 'ID SELLER': '0', 'GTIN': '00000000000000', 'WUPC': '00000000000000', 'FECHA INICIO': 'dd/mm/yyyy', 'FECHA FIN': 'dd/mm/yyyy',
                    'INV': '#,##0', 'PRECIO FULL': '"$"#,##0', 'PRECIO MEJORADO': '"$"#,##0', 'PRE Y POST EVENTO': '"$"#,##0',
                    'EVENTO': '"$"#,##0', 'CYBER WEEK': '"$"#,##0', 'BLACK FRIDAY': '"$"#,##0', 'CYBER MONDAY': '"$"#,##0', 'MINIMO SITE': '"$"#,##0' }
      });
      try { parFormato_(h, r.porGrupo[g].length); } catch (e) { try { logWarn_(PAR_ETAPA, 'Formato de ' + parHojaDe_(g) + ' no se aplico: ' + String(e.message || e).split('\n')[0]); } catch (x) {} }
    });
    var hE = getHoja_(PAR_HOJA_ESTADO);
    reescribirHoja_(hE, PAR_ENC_ESTADO, r.estado, {
      vacioOk: true, validaciones: true, fondos: true,
      formatos: { 'INV': '#,##0', 'PRECIO MEJORADO': '"$"#,##0', 'PRECIO FULL': '"$"#,##0' }
    });
    try { parFormatoEstado_(hE, r.estado.length); } catch (e) { try { logWarn_(PAR_ETAPA, 'Formato de ' + PAR_HOJA_ESTADO + ' no se aplico: ' + String(e.message || e).split('\n')[0]); } catch (x) {} }
    try {   // lista de opciones en DECISION (se puede escribir otra cosa)
      var mE = colsHoja_(hE, ['DECISION']);
      var lista = r.grupos.concat([PAR_NO_ENVIAR, PAR_REPUBLICAR]);
      hE.getRange(2, mE.DECISION + 1, Math.max(r.estado.length, 1), 1)
        .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(lista, true).setAllowInvalid(true).build());
    } catch (e) {}
    // la hoja vieja "Analisis Killers" ya no se usa: sus decisiones ya pasaron a Estado Killers (columna DECISION)
    try {
      var hVieja = ss.getSheetByName(PAR_HOJA_ANALISIS);
      if (hVieja) {
        var pend = Object.keys(decs0.dec).filter(function (k) { return !r.estado.some(function (x) { return String(x[0]).toUpperCase() === k; }); });
        ss.deleteSheet(hVieja);
        logOk_(PAR_ETAPA, 'Hoja "' + PAR_HOJA_ANALISIS + '" quitada: ahora se decide en "' + PAR_HOJA_ESTADO + '" (columna DECISION).' +
          (pend.length ? ' Decisiones de SKU que ya no estan en el catalogo (no se pasaron): ' + pend.join(', ') : ''));
      }
    } catch (e) { try { logWarn_(PAR_ETAPA, 'No pude quitar la hoja ' + PAR_HOJA_ANALISIS + ': ' + String(e.message || e).split('\n')[0]); } catch (x) {} }
    try { PropertiesService.getScriptProperties().setProperty(PAR_PROP_HUELLA, huella); } catch (e) {}
    logOk_(PAR_ETAPA, 'Parrillas actualizadas: ' + total + ' SKU · ' + resumen +
      ' · Categorias (KAMS Departamentos): ' + cat.total + ' (' + cat.nuevas + ' nuevas, ' + cat.sinDecidir + ' sin KAM decidido)' +
      (r.manuales ? ' · precios mejorados ajustados a mano: ' + r.manuales : '') + ' · Estado Killers: ' + r.estado.length + ' SKU (' + r.estado.filter(pub).length + ' publicados: ' + conKiller + ' con killer, ' + sinKiller + ' sin killer y en parrilla, ' + sinPrecioE + ' sin precio)' +
      ' · por decidir (columna DECISION de Estado Killers): ' + porDecidir +
      (sinKamTxt ? ' · publicados con stock SIN KAM (no entran a ninguna parrilla): ' + sinKamTxt : '') +
      (r.sinPrecio ? ' · sin precio MINIMO/MAXIMO (no entran): ' + r.sinPrecio : ''),
      { porGrupo: cuantos, analisis: r.analisis.length, porDecidir: porDecidir, sinKam: r.sinKam, sinPrecio: r.sinPrecio });
  } else {
    if (cat.nuevas) logWarn_(PAR_ETAPA, 'Categorias nuevas en KAMS Departamentos: ' + cat.nuevas + ' (revisa su GRUPO KAM CATEGORIA)');
    logLatido_(PAR_ETAPA, 'Parrillas al dia (sin cambios)', { porGrupo: cuantos, analisis: r.analisis.length, porDecidir: porDecidir });
  }
  flushLog_();
  return { omitido: false, categorias: cat, estado: r.estado.length, conKiller: conKiller, sinKiller: sinKiller, sinPrecioE: sinPrecioE, cambio: cambio, cuantos: cuantos, total: total, analisis: r.analisis.length, porDecidir: porDecidir, sinKam: r.sinKam, sinPrecio: r.sinPrecio, manuales: r.manuales };
}

/**
 * Actualizacion inmediata: trigger de edicion (instalable). Cuando cambias el KAM de una categoria (KAMS Departamentos)
 * o una DECISION (Estado Killers), las parrillas y las hojas de estado se rehacen en segundos.
 * Los cambios que hace el propio script no disparan este trigger.
 */
function parOnEdit_(e) {
  try {
    if (!e || !e.range) return;
    var h = e.range.getSheet(), nombre = h.getName(), objetivo = [];
    if (nombre === KC_HOJA_DEPTOS) objetivo = [normEnc_(PAR_ENC_CAT[2]), normEnc_(PAR_ENC_TODAS[2])];  // col-fija: arreglo interno, no columna de hoja
    else if (nombre === PAR_HOJA_ESTADO) objetivo = [normEnc_('DECISION')];
    else return;
    var c0 = e.range.getColumn(), nc = e.range.getNumColumns(), toca = false;
    var enc = h.getRange(1, c0, 1, nc).getValues()[0];
    for (var i = 0; i < enc.length; i++) if (objetivo.indexOf(normEnc_(enc[i])) >= 0) toca = true;
    if (!toca) return;
    var r = parActualizar_(true, 25000);
    if (r && r.omitido) { try { logWarn_(PAR_ETAPA, 'Edicion en ' + nombre + ': el libro estaba ocupado; se aplica en la siguiente corrida (cada hora o desde el menu)'); flushLog_(); } catch (x) {} }
  } catch (err) {
    try { logWarn_(PAR_ETAPA, 'Actualizacion inmediata fallo: ' + String(err.message || err).split('\n')[0]); flushLog_(); } catch (x) {}
  }
}

/** Instala (una sola vez, para la cuenta que lo corre) el trigger de edicion. @return {boolean} true si lo instalo ahora */
function parAsegurarTriggerEdicion_() {
  var ya = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'parOnEdit_'; });
  if (ya) return false;
  ScriptApp.newTrigger('parOnEdit_').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  try { logOk_(PAR_ETAPA, 'Actualizacion inmediata de parrillas ACTIVADA (trigger de edicion instalado)'); flushLog_(); } catch (e) {}
  return true;
}

/** Menu: actualizar las parrillas ahora (reescribe aunque no haya cambios). */
function parrillasActualizar() {
  var ui = SpreadsheetApp.getUi();
  toast_('Armando parrillas por KAM...', 'PARRILLAS', 60);
  try {
    var r = parActualizar_(true, 90000);
    var trigNuevo = false;
    try { trigNuevo = parAsegurarTriggerEdicion_(); } catch (e) {
      try { logWarn_(PAR_ETAPA, 'No pude instalar la actualizacion inmediata: ' + String(e.message || e).split('\n')[0]); flushLog_(); } catch (x) {}
    }
    if (r.omitido) { ui.alert('Parrillas', 'Otra corrida (bajada automatica de Walmart, inventario, precios...) tuvo el libro ocupado mas de 90 segundos. Vuelve a intentar en un minuto; no se corrio nada doble.', ui.ButtonSet.OK); return; }
    var lineas = Object.keys(r.cuantos).map(function (g) { return '  ' + parHojaDe_(g) + ': ' + r.cuantos[g]; }).join('\n');
    var sin = Object.keys(r.sinKam).map(function (d) { return '  ' + d + ' (' + r.sinKam[d] + ')'; }).join('\n');
    ui.alert('Parrillas por KAM',
      r.total + ' SKU en total:\n' + lineas +
      '\n\nHoja ' + PAR_HOJA_ESTADO + ': ' + r.estado + ' SKU, ' + r.porDecidir + ' por decidir (columna DECISION)' +
      (sin ? '\n\nPublicados con stock SIN KAM (no entran a ninguna parrilla; decide en la columna DECISION de ' + PAR_HOJA_ESTADO + '):\n' + sin : '') +
      (r.sinPrecio ? '\n\nSin precio MINIMO/MAXIMO (no entran): ' + r.sinPrecio : '') +
      (trigNuevo ? '\n\n⚡ Actualizacion inmediata ACTIVADA: al cambiar el KAM de una categoria o una DECISION, las parrillas se rehacen en segundos.' : ''), ui.ButtonSet.OK);
  } catch (e) {
    try { logErr_(PAR_ETAPA, 'Parrillas fallo: ' + String(e.message || e).split('\n')[0]); flushLog_(); } catch (x) {}
    ui.alert('Fallo', String(e.message || e).split('\n')[0], ui.ButtonSet.OK);
  }
}
