/************************************************************
 * INVENTARIO SCROLL
 *
 * Copia  ORIGEN: Inv_Normal!A2:B
 * hacia  DESTINO: INVENTARIO SCROLL!A2:B
 *
 * Este script NO sale a internet: no usa UrlFetchApp, así que
 * no consume nada de la cuota diaria de UrlFetch. Lo único que
 * gasta son ejecuciones.
 *
 * CAMBIOS DE ESTA VERSIÓN
 *
 *  1. Trigger cada 15 min en vez de 5.
 *     De 288 ejecuciones al día a 96, sin perder nada útil:
 *     es una hoja para consultar de reojo, no un tablero vivo.
 *
 *  2. El log ya no crece para siempre.
 *     Antes escribía una fila cada 5 minutos aunque no hubiera
 *     cambiado nada — 288 al día, 105,000 al año. Esa hoja
 *     terminaba haciendo lento todo el archivo.
 *     Ahora solo registra cuando algo cambió o algo falló, y
 *     se queda con las últimas MAX_FILAS_LOG líneas.
 *
 *  3. El libro destino se abre una sola vez por ejecución.
 *     Antes cada llamada al log volvía a abrirlo por ID.
 ************************************************************/


/* ============================================================
   CONFIGURACIÓN
   ============================================================ */

const CONFIG = {

  // ---- ORIGEN ----
  ORIGEN_ID:   '122_hEHeBaa6vYTABhdHdqnJqi_CXtpPB_g9N1d6Fr0Q',
  ORIGEN_HOJA: 'Inv_Normal',

  // ---- DESTINO ----
  DESTINO_HOJA: 'INVENTARIO SCROLL',

  // ---- ESTRUCTURA ----
  COLUMNAS:     2,   // A = SKU, B = cantidad
  PRIMERA_FILA: 2,   // los datos empiezan en la fila 2

  // ---- LOG ----
  LOG_SHEET_NAME: 'LOG_ACTUALIZACIONES',
  MAX_FILAS_LOG:  500,    // se recorta solo al pasarse
  LOG_SIN_CAMBIOS: false, // true solo si estás depurando

  // ---- SHEETS API ----
  // Intenta primero la API; si no está activada o falla,
  // cae a SpreadsheetApp sin que se note.
  USAR_SHEETS_API: true,

  // ---- PROTECCIÓN ----
  ALERTA_FILAS:         50000,
  OMITIR_FILAS_SIN_SKU: true,
  OMITIR_SI_NO_CAMBIA:  true,
  COLCHON_COMPACTACION: 200,
  ESPERA_LOCK_MS:       60000,

  // ---- TRIGGER ----
  // Apps Script solo admite 1, 5, 10, 15 o 30
  TRIGGER_CADA_MINUTOS: 15,

  // ---- INTERNO ----
  PROP_DESTINO_ID: 'INVENTARIO_SCROLL_DESTINO_ID'
};


/** Por qué vía se leyó el origen en la corrida actual. */
let ULTIMA_VIA_LECTURA = 'No determinada';

/** Cache del libro destino: abrirlo por ID cuesta, y antes se
 *  abría una vez por cada línea de log. */
let DESTINO_CACHE = null;


/* ============================================================
   MENÚ
   ============================================================ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('MIS HERRAMIENTAS')
    .addItem('🔄 Actualizar INVENTARIO ahora', 'actualizarInventario')
    .addSeparator()
    .addItem('⚡ Instalar / reinstalar automático', 'instalarTriggerInventario')
    .addItem('⏱ Ver trigger de inventario',        'verTriggersInventario')
    .addItem('❌ Eliminar trigger automático',      'eliminarTriggerInventario')
    .addSeparator()
    .addItem('🩺 Diagnóstico completo',        'diagnosticar')
    .addItem('⚡ Probar velocidad de lectura',  'probarVelocidad')
    .addSeparator()
    .addItem('🧹 Compactar hoja destino',              'compactarDestino')
    .addItem('🗑 Vaciar destino (fila 2 en adelante)', 'vaciarDestino')
    .addItem('🧽 Limpiar log',                         'limpiarLog')
    .addToUi();
}


/* ============================================================
   PROCESO PRINCIPAL
   ============================================================ */

function actualizarInventario() {

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(CONFIG.ESPERA_LOCK_MS)) {
    // Que dos corridas se encimen no es un error digno del log:
    // el trigger vuelve a intentar en 15 minutos.
    console.log('Otra corrida en curso, se omite esta.');
    return;
  }

  const t0 = new Date();

  try {
    // ---- 1. Leer origen ----
    const data = leerOrigen();
    const t1 = new Date();

    // Guarda: si el origen viene vacío NO se borra lo que ya hay.
    // Un inventario no se vacía solo; eso es un problema del origen.
    if (data.length === 0) {
      registrarLog('INVENTARIO', 'ORIGEN VACÍO',
        'El origen no devolvió filas. No se tocó el destino. | vía: ' + ULTIMA_VIA_LECTURA);
      avisar('⚠️ El origen no devolvió ninguna fila.\n\n' +
             'No se borró el inventario existente, por seguridad.');
      return;
    }

    // ---- 2. Destino ----
    const ss = obtenerLibroDestino();
    const destino = ss.getSheetByName(CONFIG.DESTINO_HOJA);
    if (!destino) throw new Error('No existe la hoja destino: ' + CONFIG.DESTINO_HOJA);

    // ---- 3. Espacio ----
    asegurarFilas(destino, CONFIG.PRIMERA_FILA + data.length - 1);
    asegurarColumnas(destino, CONFIG.COLUMNAS);
    const t2 = new Date();

    // ---- 4. Escribir solo si cambió ----
    let escribio = true;

    if (CONFIG.OMITIR_SI_NO_CAMBIA && sonIguales(destino, data)) {
      escribio = false;
    } else {
      escribirDestino(ss, destino, data);
      limpiarSobrantes(ss, destino, data.length);
    }

    const t3 = new Date();

    // ---- 5. Log ----
    // Solo cuando hubo cambio. Antes escribía una fila cada
    // corrida y la hoja de log crecía sin freno.
    if (escribio || CONFIG.LOG_SIN_CAMBIOS) {
      registrarLog('INVENTARIO', escribio ? 'OK' : 'SIN CAMBIOS',
        'Filas: ' + data.length +
        ' | leer: '    + ms(t0, t1) +
        ' | ajustar: ' + ms(t1, t2) +
        ' | escribir: '+ ms(t2, t3) +
        ' | TOTAL: '   + ms(t0, t3) +
        ' | vía: '     + ULTIMA_VIA_LECTURA);
    }

  } catch (error) {
    registrarLog('INVENTARIO', 'ERROR', obtenerMensajeError(error));
    avisar('❌ ERROR AL ACTUALIZAR INVENTARIO\n\n' + obtenerMensajeError(error));
    console.error(error);

  } finally {
    try { lock.releaseLock(); } catch (e) { console.warn('No se pudo liberar lock: ' + e); }
  }
}


/* ============================================================
   LIBRO DESTINO
   ============================================================
   Un trigger de tiempo no puede depender de que el usuario
   tenga el archivo abierto: getActiveSpreadsheet() devuelve
   null. Por eso el ID se guarda la primera vez y de ahí en
   adelante se abre por openById.
   ============================================================ */

function obtenerLibroDestino() {

  if (DESTINO_CACHE) return DESTINO_CACHE;

  const props = PropertiesService.getScriptProperties();
  const idGuardado = props.getProperty(CONFIG.PROP_DESTINO_ID);

  if (idGuardado) {
    try {
      DESTINO_CACHE = SpreadsheetApp.openById(idGuardado);
      return DESTINO_CACHE;
    } catch (error) {
      console.warn('No se pudo abrir el destino guardado: ' + error);
    }
  }

  const activo = SpreadsheetApp.getActiveSpreadsheet();
  if (activo) {
    props.setProperty(CONFIG.PROP_DESTINO_ID, activo.getId());
    DESTINO_CACHE = activo;
    return DESTINO_CACHE;
  }

  throw new Error(
    'No se conoce el Spreadsheet destino. Abre el archivo y ejecuta una vez ' +
    '"Instalar / reinstalar automático".');
}


function guardarLibroDestinoActual() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No se pudo detectar el spreadsheet activo.');

  PropertiesService.getScriptProperties()
    .setProperty(CONFIG.PROP_DESTINO_ID, ss.getId());

  DESTINO_CACHE = ss;
  return ss.getId();
}


/* ============================================================
   LECTURA
   ============================================================ */

function leerOrigen() {

  if (hayAPI()) {
    try {
      const data = leerConAPI();
      ULTIMA_VIA_LECTURA = 'Sheets API';
      return data;
    } catch (errorAPI) {
      console.warn('Falló Sheets API, se intenta SpreadsheetApp.\n' +
                   obtenerMensajeError(errorAPI));
    }
  }

  try {
    const data = leerConSpreadsheetApp();
    ULTIMA_VIA_LECTURA = 'SpreadsheetApp';
    return data;
  } catch (error) {
    ULTIMA_VIA_LECTURA = 'ERROR';
    throw error;
  }
}


function leerConAPI() {
  const rango = nombreHoja(CONFIG.ORIGEN_HOJA) + '!A' + CONFIG.PRIMERA_FILA + ':B';

  const resp = Sheets.Spreadsheets.Values.get(CONFIG.ORIGEN_ID, rango, {
    valueRenderOption:    'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
    majorDimension:       'ROWS'
  });

  return normalizar(resp.values || []);
}


function leerConSpreadsheetApp() {
  const origen = SpreadsheetApp.openById(CONFIG.ORIGEN_ID);
  const sheet  = origen.getSheetByName(CONFIG.ORIGEN_HOJA);
  if (!sheet) throw new Error('No existe la hoja origen: ' + CONFIG.ORIGEN_HOJA);

  const ultima = sheet.getLastRow();
  if (ultima < CONFIG.PRIMERA_FILA) return [];

  const filas = ultima - CONFIG.PRIMERA_FILA + 1;
  const ancho = Math.min(CONFIG.COLUMNAS, sheet.getMaxColumns());

  return normalizar(sheet.getRange(CONFIG.PRIMERA_FILA, 1, filas, ancho).getValues());
}


/* ============================================================
   NORMALIZACIÓN
   ============================================================ */

function normalizar(filas) {

  if (filas.length > CONFIG.ALERTA_FILAS) {
    throw new Error('El origen devolvió ' + filas.length +
                    ' filas y supera ALERTA_FILAS (' + CONFIG.ALERTA_FILAS + ').');
  }

  // Recortar las filas vacías del final
  let fin = filas.length;
  while (fin > 0) {
    const fila = filas[fin - 1] || [];
    const tieneAlgo = fila.some(c => c !== '' && c !== null && c !== undefined);
    if (tieneAlgo) break;
    fin--;
  }

  // Forzar exactamente COLUMNAS columnas
  let out = filas.slice(0, fin).map(f => {
    const fila = (f || []).slice(0, CONFIG.COLUMNAS);
    while (fila.length < CONFIG.COLUMNAS) fila.push('');
    return fila;
  });

  if (CONFIG.OMITIR_FILAS_SIN_SKU) {
    out = out.filter(f => f[0] !== '' && f[0] !== null && f[0] !== undefined);
  }

  return out;
}


/* ============================================================
   ESCRITURA
   ============================================================ */

function escribirDestino(ss, sheet, data) {
  if (!data || data.length === 0) return;

  const ultima = CONFIG.PRIMERA_FILA + data.length - 1;
  const rango  = nombreHoja(CONFIG.DESTINO_HOJA) +
                 '!A' + CONFIG.PRIMERA_FILA + ':B' + ultima;

  if (hayAPI()) {
    try {
      Sheets.Spreadsheets.Values.update(
        { values: data }, ss.getId(), rango, { valueInputOption: 'RAW' });
      return;
    } catch (error) {
      console.warn('Falló la escritura por API, se usa SpreadsheetApp.\n' +
                   obtenerMensajeError(error));
    }
  }

  sheet.getRange(CONFIG.PRIMERA_FILA, 1, data.length, CONFIG.COLUMNAS).setValues(data);
}


/**
 * Borra lo que sobró de una corrida anterior más larga.
 * Se limpia DESPUÉS de escribir, nunca antes: si el borrado va
 * primero y la escritura truena a medias, la hoja queda vacía y
 * quien la lea ve cero inventario.
 */
function limpiarSobrantes(ss, sheet, filasNuevas) {

  const ultimaConContenido = sheet.getLastRow();
  const ultimaEscrita      = CONFIG.PRIMERA_FILA + filasNuevas - 1;

  if (ultimaConContenido <= ultimaEscrita) return;

  const rango = nombreHoja(CONFIG.DESTINO_HOJA) +
                '!A' + (ultimaEscrita + 1) + ':B' + ultimaConContenido;

  if (hayAPI()) {
    try {
      Sheets.Spreadsheets.Values.clear({}, ss.getId(), rango);
      return;
    } catch (error) {
      console.warn('Falló la limpieza por API, se usa SpreadsheetApp.');
    }
  }

  sheet.getRange(ultimaEscrita + 1, 1,
                 ultimaConContenido - ultimaEscrita, CONFIG.COLUMNAS).clearContent();
}


/**
 * ¿El destino ya tiene exactamente esto?
 * Comparar cuesta una lectura, pero escribir cuesta más y además
 * mueve la fecha de modificación del archivo cada 15 minutos.
 */
function sonIguales(sheet, data) {
  if (!data || data.length === 0) return false;

  const filaFinalNueva = CONFIG.PRIMERA_FILA + data.length - 1;

  const actual = sheet.getRange(CONFIG.PRIMERA_FILA, 1,
                                data.length, CONFIG.COLUMNAS).getValues();

  if (JSON.stringify(actual) !== JSON.stringify(data)) return false;

  // Y que no haya quedado basura después del bloque
  const ultimaFilaHoja = sheet.getLastRow();
  if (ultimaFilaHoja > filaFinalNueva) {
    const sobrantes = sheet.getRange(filaFinalNueva + 1, 1,
                                     ultimaFilaHoja - filaFinalNueva,
                                     CONFIG.COLUMNAS).getValues();

    const hayBasura = sobrantes.some(f =>
      f.some(v => v !== '' && v !== null && v !== undefined));

    if (hayBasura) return false;
  }

  return true;
}


/* ============================================================
   ESPACIO EN LA HOJA
   ============================================================ */

function asegurarFilas(sheet, filasNecesarias) {
  const actuales = sheet.getMaxRows();
  if (filasNecesarias > actuales) {
    sheet.insertRowsAfter(actuales, filasNecesarias - actuales);
  }
}

function asegurarColumnas(sheet, columnasNecesarias) {
  const actuales = sheet.getMaxColumns();
  if (columnasNecesarias > actuales) {
    sheet.insertColumnsAfter(actuales, columnasNecesarias - actuales);
  }
}

/** Nombre de hoja entrecomillado para los rangos de la API. */
function nombreHoja(nombre) {
  return "'" + String(nombre).replace(/'/g, "''") + "'";
}

function hayAPI() {
  return CONFIG.USAR_SHEETS_API === true && typeof Sheets !== 'undefined';
}


/* ============================================================
   TRIGGERS
   ============================================================
   Un trigger le pertenece a la cuenta que lo instaló.
   getProjectTriggers() solo devuelve los de TU cuenta: si otra
   persona instaló uno aquí, no lo ves ni lo puedes borrar desde
   el código. Tiene que entrar esa cuenta a quitarlo.
   ============================================================ */

function instalarTriggerInventario() {
  try {
    const destinoId = guardarLibroDestinoActual();
    const eliminados = borrarTriggersDe_('actualizarInventario');

    ScriptApp.newTrigger('actualizarInventario')
      .timeBased()
      .everyMinutes(CONFIG.TRIGGER_CADA_MINUTOS)
      .create();

    registrarLog('TRIGGER', 'INSTALADO',
      'Cada ' + CONFIG.TRIGGER_CADA_MINUTOS + ' minutos' +
      ' | Destino ID: ' + destinoId +
      ' | anteriores eliminados: ' + eliminados);

    avisar('✅ AUTOMATIZACIÓN INSTALADA\n\n' +
           'El inventario se actualizará cada ' + CONFIG.TRIGGER_CADA_MINUTOS + ' minutos.\n\n' +
           'Quedó guardado el ID del spreadsheet destino.\n\n' +
           'Ahora corro una actualización inicial.');

    actualizarInventario();

  } catch (error) {
    avisar('❌ NO SE PUDO INSTALAR EL TRIGGER\n\n' + obtenerMensajeError(error));
    throw error;
  }
}


function eliminarTriggerInventario() {
  const eliminados = borrarTriggersDe_('actualizarInventario');
  registrarLog('TRIGGER', 'ELIMINADO', 'Triggers eliminados: ' + eliminados);
  avisar('🗑 TRIGGER ELIMINADO\n\nSe eliminaron ' + eliminados + ' trigger(s).');
}


function borrarTriggersDe_(funcion) {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === funcion) {
      ScriptApp.deleteTrigger(t);
      n++;
    }
  });
  return n;
}


function verTriggersInventario() {
  const encontrados = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'actualizarInventario');

  if (!encontrados.length) {
    avisar('❌ NO HAY TRIGGER AUTOMÁTICO\n\n' +
           'actualizarInventario() no se está ejecutando solo.\n\n' +
           'Usa: MIS HERRAMIENTAS → ⚡ Instalar / reinstalar automático');
    return;
  }

  let msg = '✅ TRIGGER ACTIVO\n\nCantidad: ' + encontrados.length + '\n\n';

  encontrados.forEach((t, i) => {
    msg += 'Trigger ' + (i + 1) + '\n' +
           'Función: ' + t.getHandlerFunction() + '\n' +
           'Tipo: '    + t.getEventType() + '\n' +
           'Origen: '  + t.getTriggerSource() + '\n\n';
  });

  msg += 'Configurado para correr cada ' + CONFIG.TRIGGER_CADA_MINUTOS + ' minutos.\n\n' +
         'Ojo: aquí solo se ven los triggers de TU cuenta.';

  avisar(msg);
}


/* ============================================================
   MANTENIMIENTO
   ============================================================ */

function vaciarDestino() {
  try {
    const ss    = obtenerLibroDestino();
    const sheet = ss.getSheetByName(CONFIG.DESTINO_HOJA);

    if (!sheet) { avisar('No existe la hoja destino: ' + CONFIG.DESTINO_HOJA); return; }

    const ultima = sheet.getLastRow();
    if (ultima < CONFIG.PRIMERA_FILA) { avisar('El destino ya está vacío.'); return; }

    const cuantas = ultima - CONFIG.PRIMERA_FILA + 1;
    sheet.getRange(CONFIG.PRIMERA_FILA, 1, cuantas, CONFIG.COLUMNAS).clearContent();

    registrarLog('INVENTARIO', 'VACIADO', 'Filas limpiadas: ' + cuantas);
    avisar('🗑 Destino vaciado desde la fila ' + CONFIG.PRIMERA_FILA + '.');

  } catch (error) {
    avisar('❌ ' + obtenerMensajeError(error));
  }
}


/**
 * Quita las filas de más de la hoja destino.
 * Una hoja con 50,000 filas vacías pesa igual que una llena:
 * Google las guarda de todos modos y el archivo se vuelve lento.
 */
function compactarDestino() {
  try {
    const ss = obtenerLibroDestino();
    const sh = ss.getSheetByName(CONFIG.DESTINO_HOJA);

    if (!sh) { avisar('No existe la hoja destino: ' + CONFIG.DESTINO_HOJA); return; }

    const conDatos = Math.max(sh.getLastRow(), 1);
    const objetivo = conDatos + CONFIG.COLCHON_COMPACTACION;
    const actuales = sh.getMaxRows();

    if (actuales > objetivo) {
      sh.deleteRows(objetivo + 1, actuales - objetivo);
      avisar('🧹 ' + CONFIG.DESTINO_HOJA + '\n\n' + actuales + ' → ' + objetivo + ' filas');
    } else {
      avisar('✅ ' + CONFIG.DESTINO_HOJA + ' ya está compacta.\n\nFilas: ' + actuales);
    }

  } catch (error) {
    avisar('❌ ' + obtenerMensajeError(error));
  }
}


function limpiarLog() {
  try {
    const ss = obtenerLibroDestino();
    const sh = ss.getSheetByName(CONFIG.LOG_SHEET_NAME);

    if (!sh) { avisar('No hay hoja de log.'); return; }

    const total = sh.getLastRow() - 1;
    if (total > 0) sh.deleteRows(2, total);

    avisar('🧽 Log limpiado. Se borraron ' + total + ' líneas.');

  } catch (error) {
    avisar('❌ ' + obtenerMensajeError(error));
  }
}


/* ============================================================
   DIAGNÓSTICO
   ============================================================ */

function probarVelocidad() {
  let msg = 'PRUEBA DE VELOCIDAD\nOrigen: ' + CONFIG.ORIGEN_HOJA + '\n\n';

  if (typeof Sheets === 'undefined') {
    msg += '❌ Google Sheets API NO está activada.\n\n' +
           'No pasa nada: el sistema usa SpreadsheetApp de respaldo.\n\n';
  } else {
    try {
      const a = new Date();
      const f = leerConAPI();
      msg += '✅ Sheets API\nTiempo: ' + ms(a, new Date()) + '\nFilas: ' + f.length + '\n\n';
    } catch (error) {
      msg += '❌ Sheets API FALLÓ\n' + obtenerMensajeError(error) + '\n\n';
    }
  }

  try {
    const b = new Date();
    const f = leerConSpreadsheetApp();
    msg += '✅ SpreadsheetApp\nTiempo: ' + ms(b, new Date()) + '\nFilas: ' + f.length;
  } catch (error) {
    msg += '❌ SpreadsheetApp FALLÓ\n' + obtenerMensajeError(error);
  }

  avisar(msg);
}


function diagnosticar() {
  let msg = '🩺 DIAGNÓSTICO INVENTARIO SCROLL\n\n';

  msg += 'Sheets API: ' + (typeof Sheets !== 'undefined' ? '✅ ACTIVA' : '⚠️ NO ACTIVA') + '\n';

  const destinoGuardado = PropertiesService.getScriptProperties()
    .getProperty(CONFIG.PROP_DESTINO_ID);
  msg += 'Destino guardado: ' + (destinoGuardado ? '✅ SÍ' : '❌ NO') + '\n';

  const triggers = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'actualizarInventario');

  msg += 'Trigger automático: ' + (triggers.length ? '✅ ACTIVO' : '❌ NO EXISTE') + '\n';
  msg += 'Intervalo configurado: ' + CONFIG.TRIGGER_CADA_MINUTOS + ' min\n\n';

  // ---- Origen ----
  msg += 'ORIGEN\n' + CONFIG.ORIGEN_HOJA + '\n';
  let filasOrigen = -1;
  const inicio = new Date();

  try {
    const data = leerOrigen();
    filasOrigen = data.length;
    msg += '✅ Lectura correcta\nFilas: ' + filasOrigen +
           '\nVía: ' + ULTIMA_VIA_LECTURA +
           '\nTiempo: ' + ms(inicio, new Date()) + '\n\n';
  } catch (error) {
    avisar(msg + '❌ ERROR DE ORIGEN\n' + obtenerMensajeError(error));
    return;
  }

  // ---- Destino ----
  msg += 'DESTINO\n' + CONFIG.DESTINO_HOJA + '\n';

  try {
    const ss = obtenerLibroDestino();
    const destino = ss.getSheetByName(CONFIG.DESTINO_HOJA);

    if (!destino) {
      msg += '❌ La hoja destino NO EXISTE\n';
    } else {
      const ultima = destino.getLastRow();
      let filasDestino = 0;

      if (ultima >= CONFIG.PRIMERA_FILA) {
        const valores = destino.getRange(CONFIG.PRIMERA_FILA, 1,
                                         ultima - CONFIG.PRIMERA_FILA + 1,
                                         CONFIG.COLUMNAS).getValues();
        filasDestino = valores.filter(f => f.some(v => v !== '' && v !== null)).length;
      }

      msg += '✅ Hoja encontrada\n' +
             'Filas con datos A:B: ' + filasDestino + '\n' +
             'Filas origen: ' + filasOrigen + '\n' +
             'MaxRows: ' + destino.getMaxRows() + '\n';

      if (filasDestino < filasOrigen) {
        msg += '\n⚠️ FALTAN ~' + (filasOrigen - filasDestino) + ' FILAS EN DESTINO.\n';
      } else if (filasDestino === filasOrigen) {
        msg += '\n✅ Origen y destino tienen la misma cantidad de filas.\n';
      }

      // ---- Tamaño del log ----
      const log = ss.getSheetByName(CONFIG.LOG_SHEET_NAME);
      if (log) {
        msg += '\nLog: ' + Math.max(0, log.getLastRow() - 1) +
               ' líneas (tope ' + CONFIG.MAX_FILAS_LOG + ')\n';
      }
    }

  } catch (error) {
    msg += '❌ ERROR DESTINO\n' + obtenerMensajeError(error) + '\n';
  }

  if (!triggers.length) {
    msg += '\n⚠️ No existe trigger automático.\nEjecuta "Instalar / reinstalar automático".';
  }

  avisar(msg);
}


/* ============================================================
   LOG
   ============================================================ */

/**
 * Escribe una línea de log y recorta la hoja si se pasó del tope.
 *
 * El tope no es cosmético: antes se escribía una fila cada 5
 * minutos aunque no hubiera cambiado nada — 288 al día, más de
 * 100,000 al año — y esa hoja terminaba haciendo lento todo el
 * archivo, incluida la hoja que sí importa.
 */
function registrarLog(proceso, estado, detalle) {
  try {
    const ss = obtenerLibroDestino();
    let sh = ss.getSheetByName(CONFIG.LOG_SHEET_NAME);

    if (!sh) {
      sh = ss.insertSheet(CONFIG.LOG_SHEET_NAME);
      sh.appendRow(['Timestamp', 'Proceso', 'Estado', 'Detalle']);
    }

    sh.appendRow([new Date(), proceso, estado, detalle]);

    const total = sh.getLastRow() - 1;
    if (total > CONFIG.MAX_FILAS_LOG) {
      sh.deleteRows(2, total - CONFIG.MAX_FILAS_LOG);
    }

  } catch (errorLog) {
    // Un fallo del log nunca debe tapar el error de verdad.
    console.error('No se pudo registrar LOG: ' + obtenerMensajeError(errorLog));
    console.log(proceso + ' | ' + estado + ' | ' + detalle);
  }
}


/* ============================================================
   UTILIDADES
   ============================================================ */

function ms(a, b) {
  return ((b - a) / 1000).toFixed(1) + 's';
}

function obtenerMensajeError(error) {
  if (!error) return 'Error desconocido';
  return error.message || String(error);
}

/** Alerta cuando hay pantalla; en un trigger no la hay, y eso es normal. */
function avisar(texto) {
  try {
    SpreadsheetApp.getUi().alert(texto);
  } catch (e) {
    console.log(texto);
  }
}
