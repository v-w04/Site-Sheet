/**
 * ============================================================
 *  Republicar — TODO lo que hay que publicar de nuevo, en una sola hoja
 * ============================================================
 *
 *  Hoja "Republicar": una fila por PUBLICACION NUEVA que quieres en Walmart. Sirve para:
 *    CATEGORIA MAL · COBRO DISTINTO · FECHA VENCIDA · UPC O GTIN AJENO · MAS PRESENCIA (otra publicacion del mismo
 *    SKU base) · PUBLICAR PREMIUM (el -MSI no existe: SKU VIEJO = la clasica, SKU NUEVO = base-MSI; no se bloquea nada) · OTRO.  Es historial: NADA se borra ni se bloquea solo.
 *
 *  Entran de tres formas:
 *   - Solos (una sola vez por SKU, se recuerda en REPUBLICAR_VISTOS: si borras la fila no vuelve):
 *       . todo SKU de la hoja "Cobro distinto"                      (MOTIVO = COBRO DISTINTO)
 *       . todo SKU con DECISION = REPUBLICAR en "Estado Killers"     (MOTIVO = CATEGORIA MAL; tambien los que quedan
 *         asi por tener su categoria en REPUBLICAR en KAMS Departamentos)
 *   - A mano: escribes SKU VIEJO (el SKU base o uno que ya existe) y MOTIVO en una fila nueva.
 *   - MAS PRESENCIA: escribe COPIAS = 3 y se arman 3 filas (cada una con su propio SKU nuevo).
 *
 *  SKU NUEVO: si lo dejas vacio el script lo propone: SIEMPRE el SKU base con el siguiente consecutivo libre.
 *     Premium (termina en -MSI):  X-MSI -> X-MSI-2 -> X-MSI-3 ...        Clasica:  X -> X-2 -> X-3 ... (hasta -99)
 *  Mira Walmart, Bloqueados y la propia hoja para no repetir. Lo puedes cambiar a mano. Los -OB / -OPENBOX no se
 *  proponen. CATEGORIA NUEVA y UPC O GTIN AJENO son notas tuyas (el Publicador usa la categoria).
 *
 *  Tres estados, todos automaticos:
 *    PENDIENTE    el SKU NUEVO todavia no aparece en la hoja "Walmart".
 *    REPUBLICADO  el SKU NUEVO ya aparece (FECHA REPUBLICADO y el ESTATUS que trae Walmart): falta bloquear el viejo.
 *    CERRADO      el SKU VIEJO ya aparece en la hoja "Bloqueados" (lo que bloqueas en el dashboard): nada mas que hacer.
 *  Las de MAS PRESENCIA no bloquean el viejo, asi que se quedan en REPUBLICADO. La hoja se ordena sola:
 *  REPUBLICADO arriba (te falta bloquear), luego PENDIENTE, y CERRADO al fondo. DIAS AHI cuenta desde FECHA ENTRADA
 *  (se congela al republicarse). El script nunca bloquea ni borra: los viejos los bloqueas TU en el dashboard.
 *
 *  COLUMNAS (de lo que decides a lo que consultas): ESTADO · ACCION (lo que toca hacer) · SKU VIEJO · PRODUCTO · SKU NUEVO ·
 *  CATEGORIA ACTUAL / SUGERIDA / NUEVA (la eliges de lista) · LISTO (SI = el Publicador lo puede tomar) · PRIORIDAD · MOTIVO ·
 *  DETALLE · datos del site (KAM, STOCK, PRECIO, UPC, GTIN, KILLER) · fechas · tus notas. El Publicador lee por encabezado:
 *  SKU VIEJO, SKU NUEVO, CATEGORIA NUEVA, ESTADO, LISTO. El orden de columnas se cambio una sola vez (copia en "Republicar respaldo").
 *
 *  Corre despues de cada bajada de la hoja Walmart (wmWalmartBajar) y a mano desde el menu.
 *  Todas las columnas se buscan por encabezado.
 */

var REP_HOJA   = 'Republicar';
var REP_ETAPA  = 'REPUBLICAR';
var REP_ENC    = ['ESTADO', 'ACCION', 'SKU VIEJO', 'PRODUCTO', 'SKU NUEVO', 'CATEGORIA ACTUAL', 'CATEGORIA SUGERIDA', 'CATEGORIA NUEVA', 'LISTO', 'PRIORIDAD', 'MOTIVO', 'DETALLE', 'KAM', 'STOCK', 'PRECIO', 'UPC', 'GTIN', 'KILLER', 'DIAS AHI', 'FECHA ENTRADA', 'FECHA REPUBLICADO', 'ESTATUS NUEVO', 'FECHA CERRADO', 'ORIGEN', 'COPIAS', 'UPC O GTIN AJENO', 'NOTA'];
var REP_MOTIVOS = ['CATEGORIA MAL', 'COBRO DISTINTO', 'FECHA VENCIDA', 'UPC O GTIN AJENO', 'MAS PRESENCIA', 'PUBLICAR PREMIUM', 'OTRO'];
var REP_SIN_BLOQUEO = ['MAS PRESENCIA', 'PUBLICAR PREMIUM'];   // el SKU viejo se queda vivo: no hay nada que bloquear
var REP_NECESITA_CAT = ['CATEGORIA MAL', 'COBRO DISTINTO'];   // con estos motivos hay que elegir la categoria correcta antes de publicar
var REP_HOJA_CATS = 'Categorias republicar';
var REP_HOJA_RESPALDO = 'Republicar respaldo';
var REP_PROP_LAYOUT = 'REPUBLICAR_LAYOUT_V2';
var REP_JUNK_DEP = ['UNNAV', 'CAMPANAS', 'BODEGA AURRERA'];   // departamentos de Walmart que no sirven como categoria
var REP_ACC_BLOQUEAR = 'Bloquear el viejo en el dashboard';
var REP_ACC_LISTO = 'Listo para el Publicador';
var REP_ACC_CAT = 'Elegir CATEGORIA NUEVA';
var REP_ACC_SKU = 'Escribir SKU NUEVO';
var REP_ACC_NADA = 'Nada: ya publicado';
var REP_NOTAS = {
  'ESTADO': 'PENDIENTE: el SKU NUEVO aun no esta en Walmart.\nREPUBLICADO: ya esta; falta bloquear el viejo.\nCERRADO: el viejo ya esta bloqueado.\nLo pone solo el script.',
  'ACCION': 'Lo que toca hacer en esta fila. Lo calcula el script.',
  'SKU VIEJO': 'La publicacion que se quiere rehacer. Para filas a mano: escribe aqui el SKU y el MOTIVO.',
  'PRODUCTO': 'Nombre del producto (Walmart o catalogo). Solo para reconocerlo.',
  'SKU NUEVO': 'El script propone el siguiente consecutivo libre. Lo puedes cambiar a mano.',
  'CATEGORIA ACTUAL': 'Categoria con la que esta hoy en Walmart (departamento / categoria).',
  'CATEGORIA SUGERIDA': 'La categoria mas usada por otras publicaciones del mismo SKU base. Solo sugerencia.',
  'CATEGORIA NUEVA': 'ELIGELA TU de la lista. Es la categoria con la que el Publicador va a publicar.',
  'LISTO': 'SI = ya tiene SKU NUEVO y (si hace falta) CATEGORIA NUEVA: el Publicador lo puede tomar.',
  'PRIORIDAD': 'ALTA: killer vigente o cobro distinto. MEDIA: hay stock libre. BAJA: sin stock.',
  'MOTIVO': 'Por que se republica. Elige de la lista. PUBLICAR PREMIUM = el -MSI no existe: pon en SKU VIEJO la clasica y el script propone base-MSI.',
  'DETALLE': 'La causa en corto (por ejemplo, lo que dice Cobro distinto).',
  'KAM': 'KAM del SKU (Estado Killers).',
  'STOCK': 'Stock libre en Odoo (Inventario Actual).',
  'PRECIO': 'Precio actual en Walmart.',
  'UPC': 'UPC en Walmart.',
  'GTIN': 'GTIN en Walmart.',
  'KILLER': 'SI si hoy es killer (Estado Killers).',
  'DIAS AHI': 'Dias desde FECHA ENTRADA; se congela al republicarse.',
  'COPIAS': 'Para MAS PRESENCIA: escribe 3 y se arman 3 filas.',
  'UPC O GTIN AJENO': 'Nota tuya: el UPC o GTIN ajeno que hay que usar.',
  'NOTA': 'Tus notas.'
};
var REP_PEND   = 'PENDIENTE';
var REP_LISTO  = 'REPUBLICADO';
var REP_CERRADO = 'CERRADO';
var REP_ORI_CD = 'COBRO DISTINTO';
var REP_ORI_MAN = 'MANUAL';
var REP_ORI_ESTADO = 'ESTADO KILLERS';
var REP_ORI_CATEGORIA = 'CATEGORIA REPUBLICAR';
var REP_PROP_VISTOS = 'REPUBLICAR_VISTOS';

function repNorm_(s) { return String(s === null || s === undefined ? '' : s).trim().toUpperCase(); }

/** Fecha (Date o 'yyyy-MM-dd...') -> 'yyyy-MM-dd' o ''. */
function repDia_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  var t = String(v === null || v === undefined ? '' : v).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.substring(0, 10) : '';
}

/** Dias entre dos 'yyyy-MM-dd' (0 si falta alguno). */
function repDiasEntre_(desde, hasta) {
  if (!desde || !hasta) return '';
  var a = desde.split('-'), b = hasta.split('-');
  var d = Math.round((Date.UTC(+b[0], +b[1] - 1, +b[2]) - Date.UTC(+a[0], +a[1] - 1, +a[2])) / 86400000);
  return d < 0 ? 0 : d;
}

function repFechaCelda_(dia) { return dia ? Utilities.parseDate(dia, TZ, 'yyyy-MM-dd') : ''; }

/**
 * Cambio de orden de columnas (una sola vez, marca REPUBLICAR_LAYOUT_V2). Antes guarda una copia de los valores en la
 * hoja "Republicar respaldo". Conserva todos tus datos y tus columnas extra (van a la derecha). El MOTIVO que traia el texto
 * de la causa pasa a DETALLE; la NOTA con "departamento / categoria" pasa a CATEGORIA ACTUAL.
 */
function repMigrar_(h) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(REP_PROP_LAYOUT) === '1') return false;
  var nF = h.getLastRow(), nC = h.getLastColumn();
  var enc0 = nF >= 1 && nC >= 1 ? h.getRange(1, 1, 1, nC).getValues()[0] : [];
  var hay = enc0.some(function (e) { return String(e || '').trim(); });
  if (!hay) return false;                                  // hoja vacia: repHoja_ pone los encabezados nuevos
  var pos = {};
  enc0.forEach(function (e, i) { var k = normEnc_(e); if (k && pos[k] === undefined) pos[k] = i; });
  if (pos['ACCION'] !== undefined) { props.setProperty(REP_PROP_LAYOUT, '1'); return false; }
  var todo = h.getRange(1, 1, nF, nC).getValues();
  var rb = getHoja_(REP_HOJA_RESPALDO);
  rb.getRange(1, 1, todo.length, nC).setValues(todo);      // respaldo antes de mover nada
  var nuevoEnc = REP_ENC.slice(), extras = [];
  var conocidos = {}; REP_ENC.forEach(function (e) { conocidos[normEnc_(e)] = true; });
  enc0.forEach(function (e, i) { var k = normEnc_(e); if (k && !conocidos[k]) { extras.push(i); nuevoEnc.push(String(e)); } });
  var motivos = {}; REP_MOTIVOS.forEach(function (x) { motivos[x] = true; });
  var filas = [];
  todo.slice(1).forEach(function (f) {
    var n = new Array(nuevoEnc.length).fill('');
    var vacia = !f.some(function (c) { return c !== '' && c !== null && c !== undefined; });
    if (vacia) return;
    REP_ENC.forEach(function (e, j) { var i = pos[normEnc_(e)]; if (i !== undefined) n[j] = f[i] === undefined ? '' : f[i]; });
    extras.forEach(function (i, j) { n[REP_ENC.length + j] = f[i] === undefined ? '' : f[i]; });
    var iMot = REP_ENC.indexOf('MOTIVO'), iDet = REP_ENC.indexOf('DETALLE'), iNota = REP_ENC.indexOf('NOTA'), iAct = REP_ENC.indexOf('CATEGORIA ACTUAL'), iOri = REP_ENC.indexOf('ORIGEN');
    var mot = repNorm_(n[iMot]);
    if (mot && !motivos[mot]) {                              // texto largo en MOTIVO: era la causa
      n[iDet] = String(n[iMot]).trim();
      n[iMot] = repNorm_(n[iOri]) === REP_ORI_CD ? 'COBRO DISTINTO' : 'OTRO';
    }
    var nota = String(n[iNota] || '').trim();
    if (nota && (repNorm_(n[iOri]) === REP_ORI_CATEGORIA || repNorm_(n[iOri]) === REP_ORI_ESTADO) && !String(n[iAct] || '').trim()) {
      n[iAct] = nota; n[iNota] = '';                         // era "departamento / categoria"
    } else if (nota && repNorm_(n[iOri]) === REP_ORI_CD && !String(n[iDet] || '').trim()) {
      n[iDet] = nota; n[iNota] = '';                         // era la causa de Cobro distinto
    }
    filas.push(n);
  });
  var tope = Math.max(h.getMaxRows(), filas.length + 1), topeC = Math.max(h.getMaxColumns(), nuevoEnc.length);
  if (topeC > h.getMaxColumns()) h.insertColumnsAfter(h.getMaxColumns(), topeC - h.getMaxColumns());
  var todoRango = h.getRange(1, 1, tope, topeC);
  todoRango.clearContent();
  try { todoRango.clearDataValidations(); } catch (e) {}
  try { h.setConditionalFormatRules([]); } catch (e) {}
  h.getRange(1, 1, 1, nuevoEnc.length).setValues([nuevoEnc]).setFontWeight('bold');
  if (filas.length) {
    var texto = [REP_ENC.indexOf('SKU VIEJO'), REP_ENC.indexOf('SKU NUEVO')];
    texto.forEach(function (c) { h.getRange(2, c + 1, filas.length, 1).setNumberFormat('@'); });
    h.getRange(2, 1, filas.length, nuevoEnc.length).setValues(filas);
  }
  props.setProperty(REP_PROP_LAYOUT, '1');
  try { logOk_(REP_ETAPA, 'Republicar: columnas reordenadas (' + filas.length + ' filas; copia en "' + REP_HOJA_RESPALDO + '").'); } catch (e) {}
  return true;
}

/** Crea la hoja si no existe, reordena una sola vez y agrega los encabezados que falten (a la derecha). Devuelve la hoja. */
function repHoja_() {
  var h = getHoja_(REP_HOJA);
  try { repMigrar_(h); } catch (e) {
    try { logErr_(REP_ETAPA, 'Republicar: no pude reordenar las columnas: ' + String(e.message || e).split('\n')[0]); } catch (x) {}
  }
  var nC = Math.max(1, h.getLastColumn());
  var enc = h.getLastRow() >= 1 ? h.getRange(1, 1, 1, nC).getValues()[0] : [];
  var tiene = {};
  enc.forEach(function (e) { var k = normEnc_(e); if (k) tiene[k] = true; });
  var faltan = REP_ENC.filter(function (e) { return !tiene[normEnc_(e)]; });
  if (faltan.length) {
    var vacia = !enc.some(function (e) { return String(e || '').trim(); });
    var col = vacia ? 1 : h.getLastColumn() + 1;
    h.getRange(1, col, 1, faltan.length).setValues([faltan]).setFontWeight('bold');
    if (vacia) { try { PropertiesService.getScriptProperties().setProperty(REP_PROP_LAYOUT, '1'); } catch (e) {} }
  }
  repReglas_(h);
  return h;
}

/** Listas desplegables, colores, notas en los encabezados y congelado. Todo en SUS columnas, sin tocar lo demas. */
function repReglas_(h) {
  try {
    var m = colsHoja_(h, ['ESTADO', 'MOTIVO']);
    var filas = Math.max(h.getMaxRows() - 1, 1);
    var lista = function (col, valores) {
      h.getRange(2, col + 1, filas, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(valores, true).setAllowInvalid(true).build());
    };
    lista(m.ESTADO, [REP_PEND, REP_LISTO, REP_CERRADO]);
    lista(m.MOTIVO, REP_MOTIVOS);
    var m2 = colsHoja_(h, [], ['COPIAS']);
    if (m2.COPIAS >= 0) lista(m2.COPIAS, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  } catch (e) {
    try { logWarn_(REP_ETAPA, 'No se pudieron poner las listas de Republicar: ' + String(e.message || e).split('\n')[0]); } catch (x) {}
  }
  try { repFormato_(h); } catch (e) {
    try { logWarn_(REP_ETAPA, 'No se pudo poner el formato de Republicar: ' + String(e.message || e).split('\n')[0]); } catch (x) {}
  }
}

/** Colores por columna, notas de encabezado y congelado. Solo las reglas de Republicar (se vuelven a poner si faltan). */
function repFormato_(h) {
  var enc = h.getRange(1, 1, 1, Math.max(1, h.getLastColumn())).getValues()[0];
  var pos = {};
  enc.forEach(function (e, i) { var k = normEnc_(e); if (k && pos[k] === undefined) pos[k] = i; });
  var col = function (n) { var i = pos[normEnc_(n)]; return i === undefined ? -1 : i + 1; };
  var filas = Math.max(h.getMaxRows() - 1, 1);
  var reglas = [];
  var regla = function (nombre, formulaFn, fondo, letra, negrita) {
    var c = col(nombre); if (c < 0) return;
    var L = colLetra_(c), r = h.getRange(2, c, filas, 1);
    var b = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formulaFn('$' + L + '2')).setBackground(fondo).setFontColor(letra);
    if (negrita) b = b.setBold(true);
    reglas.push(b.setRanges([r]).build());
  };
  regla('ESTADO', function (x) { return '=' + x + '="' + REP_LISTO + '"'; }, '#b6d7a8', '#274e13');
  regla('ESTADO', function (x) { return '=' + x + '="' + REP_PEND + '"'; }, '#ffe599', '#7f6000');
  regla('ESTADO', function (x) { return '=' + x + '="' + REP_CERRADO + '"'; }, '#d9d9d9', '#666666');
  regla('PRIORIDAD', function (x) { return '=' + x + '="ALTA"'; }, '#f4cccc', '#990000', true);
  regla('PRIORIDAD', function (x) { return '=' + x + '="MEDIA"'; }, '#fff2cc', '#7f6000');
  regla('PRIORIDAD', function (x) { return '=' + x + '="BAJA"'; }, '#efefef', '#666666');
  regla('LISTO', function (x) { return '=' + x + '="SI"'; }, '#b6d7a8', '#274e13', true);
  regla('ACCION', function (x) { return '=' + x + '="' + REP_ACC_BLOQUEAR + '"'; }, '#fce5cd', '#b45f06', true);
  regla('ACCION', function (x) { return '=' + x + '="' + REP_ACC_LISTO + '"'; }, '#d9ead3', '#274e13', true);
  regla('ACCION', function (x) { return '=OR(' + x + '="' + REP_ACC_CAT + '",' + x + '="' + REP_ACC_SKU + '")'; }, '#fff2cc', '#7f6000', true);
  var cn = col('CATEGORIA NUEVA');
  if (cn > 0) {   // la celda que tienes que llenar, resaltada mientras este vacia en una fila pendiente
    var LE = colLetra_(col('ESTADO')), LM = colLetra_(col('MOTIVO')), LN = colLetra_(cn);
    reglas.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($' + LE + '2="' + REP_PEND + '",$' + LN + '2="",OR($' + LM + '2="CATEGORIA MAL",$' + LM + '2="COBRO DISTINTO"))')
      .setBackground('#fff2cc').setRanges([h.getRange(2, cn, filas, 1)]).build());
  }
  if (h.getConditionalFormatRules().length < reglas.length) h.setConditionalFormatRules(reglas);
  h.setFrozenRows(1);
  var cf = col('SKU VIEJO');
  if (cf > 0 && h.getFrozenColumns() < cf) h.setFrozenColumns(cf);
  enc.forEach(function (e, i) {
    var n = REP_NOTAS[String(e).trim()];
    if (n) { try { h.getRange(1, i + 1).setNote(n); } catch (x) {} }
  });
}

/** Lista de categorias validas (Walmart sin las basura) en la hoja auxiliar y desplegable en CATEGORIA NUEVA. */
function repCategorias_(h, cats) {
  var hc = getHoja_(REP_HOJA_CATS);
  var filas = cats.map(function (c) { return [c]; });
  if (filas.length) reescribirHoja_(hc, ['CATEGORIA'], filas, {});
  if (!cats.length) return;
  var m = colsHoja_(hc, ['CATEGORIA']);
  var rango = hc.getRange(2, m.CATEGORIA + 1, cats.length, 1);
  var mh = colsHoja_(h, [], ['CATEGORIA NUEVA']);
  if (mh['CATEGORIA NUEVA'] < 0) return;
  h.getRange(2, mh['CATEGORIA NUEVA'] + 1, Math.max(h.getMaxRows() - 1, 1), 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(rango, true).setAllowInvalid(true).build());
}

/** Categoria valida de Walmart: tiene nombre, no es "Por Defecto" y no cuelga de un departamento basura. */
function repCatValida_(dep, cat) {
  var c = normEnc_(cat);
  if (!c || c === 'POR DEFECTO') return false;
  return REP_JUNK_DEP.indexOf(normEnc_(dep)) === -1;
}

/** SKU base: sin el consecutivo ni el -MSI. */
function repBase_(sku) {
  var u = repNorm_(sku);
  return /-MSI(-([2-9]|[1-9]\d))?$/.test(u) ? u.replace(/-MSI(-([2-9]|[1-9]\d))?$/, '') : u.replace(/-([2-9]|[1-9]\d)$/, '');
}

/**
 * Hace todo: llena filas a mano, agrega los de Cobro distinto, marca REPUBLICADO los que ya aparecen en Walmart
 * y recalcula DIAS AHI. Devuelve { omitido, nuevos, republicados, pendientes, listos }.
 */
function repActualizar_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_ESPERA_MS)) return { omitido: true, motivo: 'ocupado' };
  try { return repActualizarCon_(); } finally { lock.releaseLock(); }
}

/**
 * Siguiente SKU libre para republicar: el SKU base con el siguiente consecutivo.
 * Premium (termina en -MSI o -MSI-n): base-MSI-2, -MSI-3 ...   Clasica: base-2, -3 ... (hasta 99).
 * `tomados` = { SKU EN MAYUSCULAS: true } con todo lo que ya existe o ya esta pendiente (se le agrega el propuesto).
 * Devuelve '' si no se puede proponer (vacio, -OB / -OPENBOX o ya llego a 99).
 */
function repSiguienteSku_(sku, tomados) {
  var s = String(sku === null || sku === undefined ? '' : sku).trim();
  if (!s) return '';
  var u = s.toUpperCase();
  if (/-(OB|OPENBOX)(-|$)/.test(u)) return '';
  var prem = /-MSI(-([2-9]|[1-9]\d))?$/.test(u);
  var base = prem ? s.replace(/-MSI(-([2-9]|[1-9]\d))?$/i, '') : s.replace(/-([2-9]|[1-9]\d)$/, '');
  var pref = (base + (prem ? '-MSI-' : '-')).toUpperCase();
  var max = 1;
  Object.keys(tomados).forEach(function (k) {
    if (k.indexOf(pref) !== 0) return;
    var resto = k.substring(pref.length);
    if (/^\d{1,2}$/.test(resto) && +resto > max) max = +resto;
  });
  if (max >= 99) return '';
  var nuevo = base + (prem ? '-MSI-' : '-') + (max + 1);
  tomados[nuevo.toUpperCase()] = true;
  return nuevo;
}

function repActualizarCon_() {
  var ss = getSpreadsheet_();
  var hoy = hoy_();
  var h = repHoja_();
  var m = colsHoja_(h, REP_ENC);
  var nC = h.getLastColumn();
  var n = Math.max(h.getLastRow() - 1, 0);
  var vals = n ? h.getRange(2, 1, n, nC).getValues() : [];
  var nExist = vals.length;
  var cVi = m['SKU VIEJO'], cNu = m['SKU NUEVO'];

  // --- lo que ya esta en la hoja ---
  var existentes = {};
  vals.forEach(function (f) {
    var vi = repNorm_(f[cVi]), nu = repNorm_(f[cNu]);
    if (vi) existentes[vi] = true;
    if (nu) existentes[nu] = true;
  });

  // --- lo que hay en Walmart y en Bloqueados (para no repetir SKU y para saber cuando ya aparecio) ---
  var walmart = null, tomados = {}, info = {}, catsBase = {}, catsValidas = {};
  var leerInfo = function (hoja, enBloq) {
    var mw = colsHoja_(hoja, ['SKU'], ['ESTATUS', 'NOMBRE', 'DEPARTAMENTO', 'CATEGORIA', 'PRECIO', 'UPC', 'GTIN']);
    var dato = function (f, c) { return c >= 0 && f[c] !== undefined && f[c] !== null ? f[c] : ''; };
    hoja.getRange(2, 1, hoja.getLastRow() - 1, hoja.getLastColumn()).getValues().forEach(function (f) {
      var k = repNorm_(f[mw.SKU]); if (!k) return;
      tomados[k] = true;
      if (enBloq) bloq[k] = true; else walmart[k] = String(dato(f, mw.ESTATUS));
      if (!enBloq || !info[k]) {
        info[k] = { nombre: String(dato(f, mw.NOMBRE)), dep: String(dato(f, mw.DEPARTAMENTO)), cat: String(dato(f, mw.CATEGORIA)), precio: dato(f, mw.PRECIO), upc: String(dato(f, mw.UPC)), gtin: String(dato(f, mw.GTIN)) };
      }
      if (!enBloq && repCatValida_(info[k].dep, info[k].cat)) {   // categorias buenas de los SKU hermanos (mismo SKU base)
        var b = repBase_(k), c = info[k].cat.trim();
        catsValidas[c] = true;
        if (!catsBase[b]) catsBase[b] = {};
        catsBase[b][c] = (catsBase[b][c] || 0) + 1;
      }
    });
  };
  var bloq = {};
  var hW = ss.getSheetByName(WD_HOJA);
  if (hW && hW.getLastRow() >= 2) { walmart = {}; leerInfo(hW, false); }
  var hB = ss.getSheetByName(WD_HOJA_BLOQ);
  if (hB && hB.getLastRow() >= 2) leerInfo(hB, true);
  // KAM / killer (Estado Killers), stock libre (Inventario Actual) y nombre de respaldo (Catalogo): si una hoja falla, esa columna queda vacia
  var kamKiller = {}, stock = {}, nombreCat = {};
  try {
    var hK = ss.getSheetByName(PAR_HOJA_ESTADO);
    if (hK && hK.getLastRow() >= 2) {
      var mk = colsHoja_(hK, ['SKU'], ['KAM', 'KILLER SI/NO', 'KILLER']);
      var ck = mk['KILLER SI/NO'] >= 0 ? mk['KILLER SI/NO'] : mk.KILLER;
      hK.getRange(2, 1, hK.getLastRow() - 1, hK.getLastColumn()).getValues().forEach(function (f) {
        var k = repNorm_(f[mk.SKU]); if (k) kamKiller[k] = { kam: mk.KAM >= 0 ? String(f[mk.KAM] || '') : '', killer: ck >= 0 ? repNorm_(f[ck]) : '' };
      });
    }
  } catch (e) {}
  try {
    var hI = ss.getSheetByName('Inventario Actual');
    if (hI && hI.getLastRow() >= 2) {
      var mi = colsHoja_(hI, ['SKU', 'Libre']);
      hI.getRange(2, 1, hI.getLastRow() - 1, hI.getLastColumn()).getValues().forEach(function (f) {
        var k = repNorm_(f[mi.SKU]); if (k) stock[k] = (stock[k] || 0) + (Number(f[mi.Libre]) || 0);
      });
    }
  } catch (e) {}
  try {
    var hCa = ss.getSheetByName('Catalogo');
    if (hCa && hCa.getLastRow() >= 2) {
      var mca = colsHoja_(hCa, ['SKU', 'NOMBRE']);
      hCa.getRange(2, 1, hCa.getLastRow() - 1, hCa.getLastColumn()).getValues().forEach(function (f) {
        var k = repNorm_(f[mca.SKU]); if (k && !nombreCat[k]) nombreCat[k] = String(f[mca.NOMBRE] || '');
      });
    }
  } catch (e) {}
  Object.keys(existentes).forEach(function (k) { tomados[k] = true; });

  // --- 1) entran solos (una sola vez por SKU): Cobro distinto y los marcados REPUBLICAR en Estado Killers ---
  var nuevosFilas = [];
  var vistos = {};
  try { JSON.parse(PropertiesService.getScriptProperties().getProperty(REP_PROP_VISTOS) || '[]').forEach(function (s) { vistos[s] = true; }); } catch (e) { vistos = {}; }
  var cambioVistos = false;
  var hC = ss.getSheetByName(CD_HOJA);
  if (hC && hC.getLastRow() >= 2) {
    var mc = colsHoja_(hC, ['SKU'], ['CAUSA']);
    hC.getRange(2, 1, hC.getLastRow() - 1, hC.getLastColumn()).getValues().forEach(function (f) {
      var sku = String(f[mc.SKU] || '').trim(), k = repNorm_(sku);
      if (!k || existentes[k] || vistos[k]) return;
      vistos[k] = true; cambioVistos = true; existentes[k] = true;
      nuevosFilas.push({ sku: sku, motivo: 'COBRO DISTINTO', origen: REP_ORI_CD, detalle: mc.CAUSA >= 0 ? String(f[mc.CAUSA] || '') : '', actual: '' });
    });
  }
  var hE = ss.getSheetByName(PAR_HOJA_ESTADO);
  if (hE && hE.getLastRow() >= 2) {
    var me = colsHoja_(hE, ['SKU'], ['DECISION', 'DEPARTAMENTO', 'CATEGORIA', 'NOTA']);
    if (me.DECISION >= 0) hE.getRange(2, 1, hE.getLastRow() - 1, hE.getLastColumn()).getValues().forEach(function (f) {   // sin DECISION = formato anterior: nada que meter
      if (normEnc_(f[me.DECISION]) !== PAR_REPUBLICAR) return;
      var sku = String(f[me.SKU] || '').trim(), k = repNorm_(sku);
      if (!k || existentes[k] || vistos[k]) return;
      vistos[k] = true; cambioVistos = true; existentes[k] = true;
      var dc = (me.DEPARTAMENTO >= 0 ? String(f[me.DEPARTAMENTO] || '') : '') + (me.CATEGORIA >= 0 && f[me.CATEGORIA] ? ' / ' + f[me.CATEGORIA] : '');
      var porCat = (me.NOTA >= 0 && String(f[me.NOTA] || '').indexOf(PAR_NOTA_AUTO) === 0);
      nuevosFilas.push({ sku: sku, motivo: 'CATEGORIA MAL', origen: porCat ? REP_ORI_CATEGORIA : REP_ORI_ESTADO, detalle: '', actual: dc });
    });
  }
  if (cambioVistos) PropertiesService.getScriptProperties().setProperty(REP_PROP_VISTOS, JSON.stringify(Object.keys(vistos)));
  nuevosFilas.forEach(function (x) {
    var fila = new Array(nC).fill('');
    fila[cVi] = x.sku; fila[m['MOTIVO']] = x.motivo; fila[m['ORIGEN']] = x.origen;
    fila[m.DETALLE] = x.detalle; fila[m['CATEGORIA ACTUAL']] = x.actual;
    vals.push(fila);
  });

  // --- 2) COPIAS > 1: una fila por cada publicacion que quieres (cada una con su SKU nuevo) ---
  var copiasCreadas = 0;
  if (m.COPIAS >= 0) {
    var hasta = vals.length;
    for (var i = 0; i < hasta; i++) {
      var f0 = vals[i], cp = parseInt(f0[m.COPIAS], 10);
      if (!(cp > 1) || !repNorm_(f0[cVi]) || repNorm_(f0[m.ESTADO]) === REP_LISTO || repNorm_(f0[m.ESTADO]) === REP_CERRADO) continue;
      cp = Math.min(cp, 20);
      for (var j = 1; j < cp; j++) {
        var cl = f0.slice();
        cl[cNu] = ''; cl[m.ESTADO] = ''; cl[m['DIAS AHI']] = ''; cl[m['FECHA ENTRADA']] = ''; cl[m['FECHA REPUBLICADO']] = '';
        if (m['ESTATUS NUEVO'] >= 0) cl[m['ESTATUS NUEVO']] = '';
        cl[m.COPIAS] = 1;
        vals.push(cl); copiasCreadas++;
      }
      f0[m.COPIAS] = 1;
    }
  }
  var nTotal = vals.length;

  // --- 3) SKU NUEVO propuesto: el SKU base con el siguiente consecutivo libre ---
  var propuestos = 0, sinPropuesta = [];
  vals.forEach(function (f) {
    var vi = String(f[cVi] || '').trim();
    if (!vi || repNorm_(f[cNu]) || repNorm_(f[m.ESTADO]) === REP_LISTO || repNorm_(f[m.ESTADO]) === REP_CERRADO) return;
    var s;
    if (repNorm_(f[m.MOTIVO]) === 'PUBLICAR PREMIUM') {
      // Premium que NO existe: el SKU nuevo es el base + -MSI (sin consecutivo) si esta libre; si ya existe, el siguiente -MSI-n.
      var baseP = String(vi).replace(/-MSI(-([2-9]|[1-9]\d))?$/i, '').replace(/-([2-9]|[1-9]\d)$/, '');
      var cand = baseP + '-MSI';
      if (/-(OB|OPENBOX)(-|$)/i.test(cand)) s = '';
      else if (!tomados[cand.toUpperCase()]) { tomados[cand.toUpperCase()] = true; s = cand; }
      else s = repSiguienteSku_(cand, tomados);
    } else s = repSiguienteSku_(vi, tomados);
    if (s) { f[cNu] = s; propuestos++; } else sinPropuesta.push(vi);
  });

  // --- 4) estados: PENDIENTE -> REPUBLICADO (el nuevo ya esta en Walmart) -> CERRADO (el viejo ya esta en Bloqueados) ---
  var republicados = [], cerrados = [], pendientes = 0, listos = 0, nCerrados = 0, masViejo = null;
  var cEst = m.ESTADO, cOri = m.ORIGEN, cFe = m['FECHA ENTRADA'], cFr = m['FECHA REPUBLICADO'], cDias = m['DIAS AHI'], cEn = m['ESTATUS NUEVO'], cFc = m['FECHA CERRADO'];
  vals.forEach(function (f) {
    var vi = repNorm_(f[cVi]), nu = repNorm_(f[cNu]);
    if (!vi && !nu) return;
    var est = repNorm_(f[cEst]);
    if (!est) { est = REP_PEND; f[cEst] = REP_PEND; }
    if (!String(f[cOri] || '').trim()) f[cOri] = REP_ORI_MAN;
    if (!repDia_(f[cFe])) f[cFe] = hoy;
    var diaEntrada = repDia_(f[cFe]);

    if (est === REP_PEND && nu && nu !== vi && walmart && (nu in walmart)) {
      est = REP_LISTO; f[cEst] = REP_LISTO; f[cFr] = hoy;
      if (cEn >= 0) f[cEn] = walmart[nu];
      republicados.push((vi || '(sin SKU viejo)') + ' → ' + String(f[cNu]).trim());
    }
    if ((est === REP_LISTO || est === REP_CERRADO) && !repDia_(f[cFr])) f[cFr] = hoy;
    if (est === REP_LISTO && vi && bloq[vi] && cFc >= 0) {
      est = REP_CERRADO; f[cEst] = REP_CERRADO; f[cFc] = hoy;
      cerrados.push(String(f[cVi]).trim());
    }

    var fin = (est === REP_LISTO || est === REP_CERRADO) ? repDia_(f[cFr]) : hoy;
    f[cDias] = repDiasEntre_(diaEntrada, fin);
    if (est === REP_CERRADO) nCerrados++;
    else if (est === REP_LISTO) listos++;
    else {
      pendientes++;
      if (!masViejo || f[cDias] > masViejo.dias) masViejo = { sku: String(f[cVi] || f[cNu]).trim(), dias: f[cDias] };
    }
  });

  // --- 4b) datos del site para republicar (PRODUCTO, categorias, KAM, stock, precio, UPC, GTIN) y lo que toca hacer ---
  var acciones = {};
  vals.forEach(function (f) {
    var vi = repNorm_(f[cVi]), nu = repNorm_(f[cNu]);
    if (!vi && !nu) return;
    var w = info[vi] || {}, kk = kamKiller[vi] || {};
    var poner = function (n, v) { if (v !== '' && v !== undefined && v !== null) f[m[n]] = v; };
    poner('PRODUCTO', w.nombre || nombreCat[vi] || '');
    if (w.dep || w.cat) f[m['CATEGORIA ACTUAL']] = (w.dep ? w.dep + ' / ' : '') + (w.cat || '');
    var cb = catsBase[repBase_(vi)], mejor = '', n0 = 0;
    if (cb) Object.keys(cb).forEach(function (c) { if (cb[c] > n0) { n0 = cb[c]; mejor = c; } });
    f[m['CATEGORIA SUGERIDA']] = mejor;
    f[m.KAM] = kk.kam || '';
    f[m.STOCK] = (vi in stock) ? stock[vi] : '';
    f[m.PRECIO] = w.precio === undefined ? '' : w.precio;
    f[m.UPC] = w.upc || ''; f[m.GTIN] = w.gtin || '';
    f[m.KILLER] = kk.killer || '';
    var est = repNorm_(f[cEst]), mot = repNorm_(f[m.MOTIVO]);
    var necesitaCat = REP_NECESITA_CAT.indexOf(mot) !== -1;
    var tieneCat = !!String(f[m['CATEGORIA NUEVA']] || '').trim();
    var tieneSku = !!String(f[cNu] || '').trim();
    var acc, listo = '';
    if (est === REP_CERRADO) acc = 'Cerrado';
    else if (est === REP_LISTO) acc = REP_SIN_BLOQUEO.indexOf(mot) !== -1 ? REP_ACC_NADA : REP_ACC_BLOQUEAR;
    else if (!tieneSku) acc = REP_ACC_SKU;
    else if (necesitaCat && !tieneCat) acc = REP_ACC_CAT;
    else { acc = REP_ACC_LISTO; listo = 'SI'; }
    f[m.ACCION] = acc; f[m.LISTO] = listo;
    var pr = '';
    if (est !== REP_CERRADO && est !== REP_LISTO) {
      pr = (kk.killer === 'SI' || mot === 'COBRO DISTINTO') ? 'ALTA' : ((Number(f[m.STOCK]) || 0) > 0 ? 'MEDIA' : 'BAJA');
    }
    f[m.PRIORIDAD] = pr;
    acciones[acc] = (acciones[acc] || 0) + 1;
  });

  // --- 5) ordenar (por lo que toca hacer; CERRADO al fondo) y escribir todo el bloque ---
  var rango = function (f) {
    var a = String(f[m.ACCION] || '');
    return a === REP_ACC_BLOQUEAR ? 0 : a === REP_ACC_LISTO ? 1 : a === REP_ACC_CAT ? 2 : a === REP_ACC_SKU ? 3 : a === 'Cerrado' ? 5 : 4;
  };
  var prio = function (f) { var p = String(f[m.PRIORIDAD] || ''); return p === 'ALTA' ? 0 : p === 'MEDIA' ? 1 : 2; };
  var indexado = vals.map(function (f, i) { return { f: f, i: i }; });
  indexado.sort(function (a, b) {
    var ra = rango(a.f), rb = rango(b.f);
    if (ra !== rb) return ra - rb;
    if (ra !== 5 && prio(a.f) !== prio(b.f)) return prio(a.f) - prio(b.f);
    var da = Number(a.f[cDias]) || 0, db = Number(b.f[cDias]) || 0;
    if (ra !== 5 && da !== db) return db - da;      // los que llevan mas dias, primero
    return a.i - b.i;
  });
  vals = indexado.map(function (x) { return x.f; });
  if (nTotal) {
    if (h.getMaxRows() < nTotal + 1) h.insertRowsAfter(h.getMaxRows(), nTotal + 1 - h.getMaxRows());
    var esFecha = {}; [cFe, cFr, cFc].forEach(function (c) { if (c !== undefined && c >= 0) esFecha[c] = true; });
    for (var c = 0; c < nC; c++) {
      var col = vals.map(function (f) {
        var v = f[c];
        return [esFecha[c] ? repFechaCelda_(repDia_(v)) : (v === undefined || v === null ? '' : v)];
      });
      var rg = h.getRange(2, c + 1, nTotal, 1);
      if (c === cVi || c === cNu) rg.setNumberFormat('@');
      rg.setValues(col);
      if (esFecha[c]) rg.setNumberFormat('yyyy-mm-dd');
    }
  }

  try { repCategorias_(h, Object.keys(catsValidas).sort()); } catch (e) {
    try { logWarn_(REP_ETAPA, 'Republicar: no pude armar la lista de categorias: ' + String(e.message || e).split('\n')[0]); } catch (x) {}
  }

  // --- 6) Log ---
  var res = { acciones: acciones, nuevos: nuevosFilas.length, copias: copiasCreadas, propuestos: propuestos, republicados: republicados.length, cerrados: cerrados.length, pendientes: pendientes, listos: listos, nCerrados: nCerrados, sinPropuesta: sinPropuesta };
  if (nuevosFilas.length) logOk_(REP_ETAPA, 'Republicar: entraron ' + nuevosFilas.length + ' SKU (Cobro distinto / REPUBLICAR en Estado Killers): ' + nuevosFilas.map(function (x) { return x.sku; }).join(', '), { skus: nuevosFilas });
  if (copiasCreadas) logOk_(REP_ETAPA, 'Republicar: ' + copiasCreadas + ' filas nuevas por COPIAS');
  if (propuestos) logOk_(REP_ETAPA, 'Republicar: ' + propuestos + ' SKU NUEVO propuestos (siguiente consecutivo del SKU base)');
  if (sinPropuesta.length) avisoDia_('rep-sinprop:' + sinPropuesta.join(','), 'WARN', REP_ETAPA, 'Republicar: no pude proponer SKU NUEVO para ' + sinPropuesta.join(', ') + ' (-OB / -OPENBOX o ya llego al -99); escribelo a mano.');   // 1 vez al dia por lista (antes salia cada 15 min)
  if (republicados.length) logOk_(REP_ETAPA, 'Republicar: ' + republicados.length + ' ya aparecen en Walmart (REPUBLICADO): ' + republicados.join(' | '), { skus: republicados });
  if (cerrados.length) logOk_(REP_ETAPA, 'Republicar: ' + cerrados.length + ' CERRADOS (el SKU viejo ya esta bloqueado): ' + cerrados.join(' | '), { skus: cerrados });
  if (!walmart) logWarn_(REP_ETAPA, 'Republicar: la hoja Walmart esta vacia o no existe; hoy no se pudo revisar si ya aparecieron los SKU nuevos.');
  logLatido_(REP_ETAPA, 'Republicar al dia', { acciones: acciones, pendientes: pendientes, republicados: listos, cerrados: nCerrados, masViejo: masViejo });
  flushLog_();
  return res;
}

/** Menu: actualizar ahora y mostrar el resultado. */
function republicarActualizar() {
  var ui = SpreadsheetApp.getUi();
  toast_('Actualizando Republicar...', 'REPUBLICAR', 30);
  try {
    var r = repActualizar_();
    if (r.omitido) { alertLog_(ui, 'Republicar', 'Libro ocupado por otra corrida. Intenta en un minuto.', ui.ButtonSet.OK); return; }
    alertLog_(ui, 'Republicar',
      'Nuevos: ' + r.nuevos + ' · copias: ' + r.copias + ' · SKU propuestos: ' + r.propuestos + '\n' +
      'A REPUBLICADO: ' + r.republicados + ' · a CERRADO: ' + r.cerrados + '\n\n' +
      'Bloquear el viejo en el dashboard: ' + (r.acciones[REP_ACC_BLOQUEAR] || 0) + '\n' +
      'Listos para el Publicador: ' + (r.acciones[REP_ACC_LISTO] || 0) + '\n' +
      'Falta elegir categoria: ' + (r.acciones[REP_ACC_CAT] || 0) + '\n' +
      'Falta SKU NUEVO: ' + (r.acciones[REP_ACC_SKU] || 0) + '\n' +
      'CERRADOS: ' + r.nCerrados +
      (r.sinPropuesta.length ? '\n\nSin propuesta (escribe el SKU NUEVO): ' + r.sinPropuesta.join(', ') : ''), ui.ButtonSet.OK);
  } catch (e) {
    try { logErr_(REP_ETAPA, 'Republicar fallo: ' + String(e.message || e).split('\n')[0]); flushLog_(); } catch (x) {}
    alertLog_(ui, 'Fallo', String(e.message || e).split('\n')[0], ui.ButtonSet.OK);
  }
}
