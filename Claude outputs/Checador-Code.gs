// ============================================================================
// CHECADOR ELECTRONICS MÉXICO — VERSIÓN SIMPLE (Registro en Vivo)
// ============================================================================
// Backend reducido: SOLO lo que necesita el flujo de empleados.
//   - Login (usuarios, PINs, contraseñas)
//   - Checadas con tipo (ENTRADA / DESAYUNO / COMIDA / SALIDA...)
//   - Perfil del empleado (checadas del día, turno, resumen)
//   - Alertas push (Firebase)
//
// ============================================================================
// CAMBIOS DE ESTA VERSIÓN (v624)
// ============================================================================
//
// 1. LA LLAVE DE FIREBASE YA NO VIVE EN EL CÓDIGO.
//    Antes el private_key completo del service account estaba escrito aquí.
//    Cualquiera con acceso al proyecto —o a una copia del archivo— podía
//    mandar notificaciones haciéndose pasar por la empresa y entrar al
//    proyecto de Firebase. Ahora vive en PropertiesService, cifrada.
//    Se configura UNA vez: ejecuta configurarFirebase() desde el editor.
//
//    ⚠️ La llave anterior quedó expuesta: hay que REVOCARLA en la consola
//    de Firebase (⚙️ → Cuentas de servicio → borrar la vieja, generar otra).
//    Borrarla del código no la invalida.
//
// 2. EL MOTOR YA NO CORRE DE MADRUGADA.
//    revisarAlertas() se disparaba 1,440 veces al día, incluidas las horas
//    en que nadie checa. Ahora sale de inmediato fuera de 6:00–22:00: un
//    tercio menos de ejecuciones sin perder una sola alerta.
//
// 3. FUERA EL eval() DEL DISPATCHER.
//    doPost resolvía la función con eval(nombre). Estaba acotado por lista
//    blanca, pero eval abre la puerta a que un cambio futuro en esa lista se
//    vuelva ejecución de código. Ahora hay un mapa explícito nombre → función.
//
// 4. FUNCIONES DUPLICADAS ELIMINADAS.
//    _quincenaPorOffset y getHistorialQuincena estaban definidas DOS veces.
//    En Apps Script gana la última, así que la primera versión de cada una
//    era código muerto que igual confundía al leer. Se conservó la que de
//    verdad estaba corriendo (la que reporta faltas y fines de semana).
//
// 5. La lista de funciones permitidas tenía 'getHistorialQuincena' repetida.
// ============================================================================

const TIMEZONE = 'America/Mexico_City';
const BACKEND_VERSION = 'v624';  // ← debe coincidir con el frontend desplegado

// Ventana en que el motor de alertas tiene algo que hacer. Fuera de aquí
// no hay turnos activos, así que revisar cuesta y no sirve.
const ALERTAS_HORA_INICIO = 6;
const ALERTAS_HORA_FIN    = 22;

// ⭐ NORMALIZADOR DE PIN/ID — Google Sheets convierte "0055" a número 55 al
// guardar, pero el frontend manda "0055". Sin normalizar, "0055" ≠ "55" y
// nada coincide (tokens, prefs, checadas). SIEMPRE comparar con _normId.
function _normId(v) {
  v = (v === null || v === undefined) ? '' : v.toString().trim();
  const n = parseInt(v, 10);
  return (isNaN(n) || !/^\d+$/.test(v)) ? v : String(n);
}

function doGet(e) {
  // La PWA vive en GitHub Pages; este deployment es solo API (doPost).
  // ⭐ DIAGNÓSTICO: abrir esta URL en el navegador muestra a qué spreadsheet
  // está ligado este backend y cuántas checadas tiene HOY.
  var info = { ok: true, servicio: 'Checador Electronics México — API', hora: new Date().toISOString() };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    info.spreadsheetNombre = ss.getName();
    info.spreadsheetUrl = ss.getUrl();
    var sheet = ss.getSheetByName('CHECADOR_CHOFERES');
    if (sheet) {
      var filas = Math.max(0, sheet.getLastRow() - 2);
      info.checadorChoferes = { filasDeDatos: filas };
      if (filas > 0) {
        var hoy = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
        var data = sheet.getRange(3, 1, filas, 10).getValues();
        var deHoy = data.filter(function(r) { return (r[2] || '').toString() === hoy; });
        info.checadorChoferes.checadasHoy = deHoy.length;
        info.checadorChoferes.ultimasHoy = deHoy.slice(-5).map(function(r) {
          return { id: r[0], nombre: r[1], hora: r[3], tipo: r[9] };
        });
      }
    } else {
      info.checadorChoferes = 'La hoja CHECADOR_CHOFERES no existe aún en este spreadsheet';
    }
  } catch (err) {
    info.diagError = err.message;
  }
  return ContentService
    .createTextOutput(JSON.stringify(info, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// API — doPost: dispatcher de llamadas del frontend
// ============================================================================
// Mapa explícito en vez de eval(). La lista blanca sigue siendo la misma
// idea, pero ahora el nombre solo puede resolver a una función de este mapa:
// aunque alguien agregue un nombre por error, no hay forma de que se
// convierta en ejecución de código arbitrario.
function _funcionesExpuestas() {
  return {
    // Login / usuarios
    getTodosLosUsuarios:      getTodosLosUsuarios,
    getVersionUsuarios:       getVersionUsuarios,
    validarPin:               validarPin,
    validarContrasena:        validarContrasena,
    guardarContrasena:        guardarContrasena,
    verificarTieneContrasena: verificarTieneContrasena,

    // Checadas
    guardarChecadaChofer:     guardarChecadaChofer,
    checadaSalidaRemota:      checadaSalidaRemota,

    // Perfil del empleado
    getPerfilEmpleado:        getPerfilEmpleado,
    getHistorialQuincena:     getHistorialQuincena,

    // Configuración
    getConfigAlertas:         getConfigAlertas,
    getZonasValidas:          getZonasValidas,
    getAvatarOverrides:       getAvatarOverrides,

    // Notificaciones push
    registrarPushToken:       registrarPushToken,
    eliminarPushToken:        eliminarPushToken,
    testPushEmpleado:         testPushEmpleado,
    getMisDispositivos:       getMisDispositivos,
    desvincularDispositivo:   desvincularDispositivo,

    // Preferencias de alertas
    getPrefsAlertas:          getPrefsAlertas,
    guardarPrefsAlertas:      guardarPrefsAlertas,

    // Excepciones y ausencias
    guardarExcepcionDia:      guardarExcepcionDia,
    quitarExcepcionDia:       quitarExcepcionDia,
    getExcepcionHoy:          getExcepcionHoy,
    registrarAusencia:        registrarAusencia,

    // Diagnóstico y mantenimiento
    diagnosticoCompleto:      diagnosticoCompleto,
    diagnosticoAlertas:       diagnosticoAlertas,
    limpiarTodoChecador:      limpiarTodoChecador
  };
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const fnName = body.fn;
    const args = body.args || [];

    const fn = _funcionesExpuestas()[fnName];
    if (typeof fn !== 'function') {
      return _jsonResponse({ error: true, message: 'No permitida: ' + fnName });
    }

    return _jsonResponse(fn.apply(null, args));

  } catch (err) {
    return _jsonResponse({ error: true, message: err.message });
  }
}

function _jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// USUARIOS
// ============================================================================

function getTodosLosUsuarios() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    crearHojaUsuarios();
    crearHojaContrasenas();

    const sheetUsuarios     = ss.getSheetByName('USUARIOS');
    const sheetContrasenas  = ss.getSheetByName('CONTRASENAS_CHOFERES');
    const sheetTurnos       = ss.getSheetByName('TURNOS_DEFAULT');

    // ── 1. Mapa PIN → contraseña ──────────────────────────────────────────
    const mapaContrasenas = {};
    if (sheetContrasenas && sheetContrasenas.getLastRow() >= 3) {
      const dataC = sheetContrasenas.getRange(3, 1, sheetContrasenas.getLastRow() - 2, 3).getValues();
      dataC.forEach(row => {
        const pin = (row[0] || '').toString().trim();
        const cont = (row[2] || '').toString().trim();
        if (pin && cont) mapaContrasenas[pin] = cont;
      });
    }

    // ── 2. Mapa ID → nombre + turno desde TURNOS_DEFAULT ─────────────────
    const mapaTurnos = {};
    if (sheetTurnos) {
      const dt = sheetTurnos.getDataRange().getValues();
      const hT = dt[0];
      const iId      = hT.indexOf('Admin');
      const iNombre  = hT.indexOf('Empleado');
      const iHorario = hT.indexOf('TURNO'); // formato "10:00 - 19:00"
      const iTurnoN  = hT.indexOf('Turno'); // nombre del turno, ej. "T2"
      const cfgTurnos = _leerConfigTurnos();
      for (let i = 1; i < dt.length; i++) {
        const id      = (dt[i][iId]     || '').toString().trim();
        const nombre  = (dt[i][iNombre] || '').toString().trim();
        const horario = iHorario !== -1 ? (dt[i][iHorario] || '').toString().trim() : '';
        const turnoN  = iTurnoN  !== -1 ? (dt[i][iTurnoN]  || '').toString().trim() : '';
        if (id && nombre) mapaTurnos[id] = {
          nombre: nombre, horario: horario,
          cfgTurno: cfgTurnos[turnoN] || null
        };
      }
    }

    // ── 3. Leer USUARIOS y armar el listado final ────────────────────────
    const usuarios = [];
    if (sheetUsuarios && sheetUsuarios.getLastRow() >= 2) {
      const dataU = sheetUsuarios.getRange(2, 1, sheetUsuarios.getLastRow() - 1, 2).getValues();
      dataU.forEach(row => {
        const pin = (row[0] || '').toString().trim();
        const idUsuario = (row[1] || '').toString().trim();
        if (!pin || !idUsuario) return;

        if (idUsuario === 'ADMIN') {
          usuarios.push({
            pin: pin, idUsuario: 'ADMIN', nombre: 'ADMIN', tipo: 'ADMIN',
            contrasena: mapaContrasenas[pin] || ''
          });
          return;
        }

        const info = mapaTurnos[idUsuario];
        const nombre = info ? info.nombre : '';
        if (!nombre) return; // PIN sin empleado en TURNOS_DEFAULT: se ignora

        usuarios.push({
          pin: pin,
          idUsuario: idUsuario,
          nombre: nombre,
          tipo: 'CHOFER',
          turnoHorario: info.horario || '',
          cfgTurno: info.cfgTurno || null,
          contrasena: mapaContrasenas[pin] || ''
        });
      });
    }

    Logger.log('✅ getTodosLosUsuarios: ' + usuarios.length + ' usuarios');
    return { ok: true, timestamp: new Date().toISOString(),
             total: usuarios.length, usuarios: usuarios };

  } catch(e) {
    Logger.log('❌ Error getTodosLosUsuarios: ' + e.message);
    return { ok: false, message: e.message, usuarios: [] };
  }
}

function getVersionUsuarios() {
  try {
    const props = PropertiesService.getDocumentProperties();
    let version = props.getProperty('USUARIOS_CACHE_VERSION');
    if (!version) {
      version = new Date().getTime().toString();
      props.setProperty('USUARIOS_CACHE_VERSION', version);
    }
    // ⭐ Huella de TURNOS_DEFAULT + CONFIG_TURNOS: si alguien edita horarios,
    // la versión cambia y TODOS los dispositivos resincronizan solos.
    let huella = '';
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const st = ss.getSheetByName('TURNOS_DEFAULT');
      const sc = ss.getSheetByName('CONFIG_TURNOS');
      let acc = 0;
      if (st && st.getLastRow() > 1) {
        st.getDataRange().getDisplayValues().forEach(function(r) {
          acc = (acc * 31 + r.join('|').length + r.join('|').split(':').length * 7) % 1000000007;
          r.forEach(function(c) { for (var i = 0; i < c.length; i++) acc = (acc * 33 + c.charCodeAt(i)) % 1000000007; });
        });
      }
      if (sc && sc.getLastRow() > 1) {
        sc.getDataRange().getDisplayValues().forEach(function(r) {
          r.forEach(function(c) { for (var i = 0; i < c.length; i++) acc = (acc * 33 + c.charCodeAt(i)) % 1000000007; });
        });
      }
      huella = '-' + acc;
    } catch(e) {}
    return { ok: true, version: version + huella };
  } catch(e) {
    Logger.log('❌ Error getVersionUsuarios: ' + e.message);
    return { ok: false, message: e.message, version: '0' };
  }
}

function forzarResyncUsuarios() {
  try {
    const props = PropertiesService.getDocumentProperties();
    const nuevaVersion = new Date().getTime().toString();
    props.setProperty('USUARIOS_CACHE_VERSION', nuevaVersion);

    SpreadsheetApp.getUi().alert(
      '🔄 Usuarios sincronizados',
      'Los PINs y contraseñas se actualizarán automáticamente en todos los ' +
      'dispositivos la próxima vez que los empleados abran la app.\n\n' +
      'Versión nueva: ' + nuevaVersion,
      SpreadsheetApp.getUi().ButtonSet.OK
    );

    Logger.log('🔄 USUARIOS_CACHE_VERSION actualizada a ' + nuevaVersion);
    return { ok: true, version: nuevaVersion };
  } catch(e) {
    Logger.log('❌ Error forzarResyncUsuarios: ' + e.message);
    return { ok: false, message: e.message };
  }
}

function crearHojaUsuarios() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName('USUARIOS')) return;

  const sheet = ss.insertSheet('USUARIOS');
  sheet.clear();

  sheet.getRange('A1:B1').merge();
  sheet.getRange('A1')
    .setValue('🔐 USUARIOS — PINs de acceso')
    .setBackground('#1a237e').setFontColor('#ffffff')
    .setFontSize(14).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(1, 40);

  sheet.getRange('A2:B2')
    .setValues([['PIN', 'ID Usuario']])
    .setBackground('#3f51b5').setFontColor('#ffffff')
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheet.setRowHeight(2, 35);

  sheet.getRange('A3:B3').setValues([['5555', 'ADMIN']]).setBackground('#e8f5e9');

  sheet.setColumnWidth(1, 120);
  sheet.setColumnWidth(2, 120);
  sheet.setFrozenRows(2);

  Logger.log('✅ Hoja USUARIOS creada');
}

function crearHojaContrasenas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName('CONTRASENAS_CHOFERES')) return;

  const sheet = ss.insertSheet('CONTRASENAS_CHOFERES');
  sheet.clear();

  sheet.getRange('A1:C1').merge();
  sheet.getRange('A1')
    .setValue('🔑 CONTRASENAS CHOFERES')
    .setBackground('#1a237e').setFontColor('#ffffff')
    .setFontSize(14).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(1, 40);

  sheet.getRange('A2:C2')
    .setValues([['PIN', 'Nombre', 'Contraseña']])
    .setBackground('#3f51b5').setFontColor('#ffffff')
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheet.setRowHeight(2, 35);

  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 180);
  sheet.setFrozenRows(2);
  sheet.getRange('A:A').setNumberFormat('@');
  sheet.getRange('C:C').setNumberFormat('@');

  Logger.log('Hoja CONTRASENAS_CHOFERES creada');
}

function validarPin(pin) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    crearHojaUsuarios();
    const sheet   = ss.getSheetByName('USUARIOS');
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, message: 'Sin usuarios configurados' };

    const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();

    for (const row of data) {
      if (_normId(row[0]) === _normId(pin)) {
        const idUsuario = row[1].toString().trim();
        if (idUsuario === 'ADMIN') return { ok: true, tipo: 'ADMIN' };

        const turnos = ss.getSheetByName('TURNOS_DEFAULT');
        if (!turnos) return { ok: false, message: 'TURNOS_DEFAULT no encontrada' };

        const dt = turnos.getDataRange().getValues();
        const hT = dt[0];
        const iId     = hT.indexOf('Admin');
        const iNombre = hT.indexOf('Empleado');

        for (let i = 1; i < dt.length; i++) {
          if (dt[i][iId].toString().trim() === idUsuario) {
            const nombre = dt[i][iNombre].toString().trim();
            const tieneContrasena = verificarTieneContrasena(pin);
            return { ok: true, tipo: 'CHOFER', idUsuario, nombre, tieneContrasena };
          }
        }
        return { ok: false, message: 'ID no encontrado' };
      }
    }
    return { ok: false, message: 'PIN incorrecto' };
  } catch(e) {
    return { ok: false, message: e.message };
  }
}

function validarContrasena(pin, contrasena) {
  try {
    crearHojaContrasenas();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('CONTRASENAS_CHOFERES');
    const lastRow = sheet.getLastRow();
    if (lastRow < 3) return { ok: false, message: 'Sin contrasenas registradas' };

    const data = sheet.getRange(3, 1, lastRow - 2, 3).getValues();
    for (const row of data) {
      if (_normId(row[0]) === _normId(pin)) {
        if (row[2].toString().trim() === contrasena.toString().trim()) return { ok: true };
        return { ok: false, message: 'Contraseña incorrecta' };
      }
    }
    return { ok: false, message: 'PIN no encontrado en contraseñas' };
  } catch(e) {
    return { ok: false, message: e.message };
  }
}

function guardarContrasena(pin, nombre, contrasena) {
  try {
    crearHojaContrasenas();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('CONTRASENAS_CHOFERES');

    if (verificarTieneContrasena(pin)) {
      return { ok: false, message: 'Este PIN ya tiene contraseña registrada' };
    }

    const fila = sheet.getLastRow() + 1;
    // Forzar A y C como texto ANTES de escribir: sin esto Sheets se come
    // los ceros de la izquierda del PIN y de la contraseña.
    sheet.getRange(fila, 1).setNumberFormat('@');
    sheet.getRange(fila, 3).setNumberFormat('@');
    sheet.getRange(fila, 1, 1, 3).setValues([[
      pin.toString().trim(), nombre.toString().trim(), contrasena.toString().trim()
    ]]);
    Logger.log('Contrasena guardada para: ' + nombre + ' PIN: ' + pin);
    return { ok: true };
  } catch(e) {
    return { ok: false, message: e.message };
  }
}

function verificarTieneContrasena(pin) {
  try {
    crearHojaContrasenas();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('CONTRASENAS_CHOFERES');
    const lastRow = sheet.getLastRow();
    if (lastRow < 3) return false;

    const data = sheet.getRange(3, 1, lastRow - 2, 1).getValues();
    return data.some(row => _normId(row[0]) === _normId(pin));
  } catch(e) {
    return false;
  }
}

// ============================================================================
// CHECADAS
// ============================================================================

function crearHojaChecadorChoferes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('CHECADOR_CHOFERES');

  const headers = [
    'ID Usuario', 'Nombre', 'Fecha', 'Hora', 'Timestamp Completo',
    'Latitud', 'Longitud', 'Estado Zona', 'UUID Cliente', 'Tipo Checada'
  ];

  if (sheet) {
    const ultimaCol = sheet.getLastColumn();
    if (ultimaCol > 10) {
      sheet.deleteColumns(11, ultimaCol - 10);
      Logger.log('🧹 CHECADOR_CHOFERES recortada a 10 columnas');
    } else if (ultimaCol < 10) {
      Logger.log('⬆️ CHECADOR_CHOFERES migrando de ' + ultimaCol + ' a 10 columnas');
    }
    sheet.getRange(2, 1, 1, 10).setValues([headers]);
    sheet.getRange('C:E').setNumberFormat('@');
    sheet.getRange('I:J').setNumberFormat('@');
    return sheet;
  }

  sheet = ss.insertSheet('CHECADOR_CHOFERES');
  sheet.clear();

  sheet.getRange('A1:J1').merge();
  sheet.getRange('A1')
    .setValue('🚛 CHECADOR CHOFERES — Registro en Vivo')
    .setBackground('#1a237e').setFontColor('#ffffff')
    .setFontSize(14).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(1, 40);

  sheet.getRange(2, 1, 1, headers.length)
    .setValues([headers])
    .setBackground('#3f51b5').setFontColor('#ffffff')
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheet.setRowHeight(2, 35);
  sheet.setFrozenRows(2);

  [80, 220, 100, 90, 190, 110, 110, 130, 280, 160]
    .forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  sheet.getRange('C:E').setNumberFormat('@');
  sheet.getRange('I:J').setNumberFormat('@');

  Logger.log('✅ Hoja CHECADOR_CHOFERES creada (10 columnas)');
  return sheet;
}

function guardarChecadaChofer(datos) {
  try {
    if (!datos) return { ok: false, message: 'No se recibieron datos' };

    crearHojaChecadorChoferes();

    // ── HORA: del servidor si online, del cliente si offline ──────────────
    const esOffline = !!datos.esOffline;
    let fechaServidor, horaServidor, timestampServidor;

    if (esOffline && datos.clienteTimestamp) {
      const fechaCli = new Date(datos.clienteTimestamp);
      if (!isNaN(fechaCli.getTime())) {
        fechaServidor     = Utilities.formatDate(fechaCli, TIMEZONE, 'yyyy-MM-dd');
        horaServidor      = Utilities.formatDate(fechaCli, TIMEZONE, 'HH:mm:ss');
        timestampServidor = Utilities.formatDate(fechaCli, TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
      }
    }
    if (!fechaServidor) {
      const ahora = new Date();
      fechaServidor     = Utilities.formatDate(ahora, TIMEZONE, 'yyyy-MM-dd');
      horaServidor      = Utilities.formatDate(ahora, TIMEZONE, 'HH:mm:ss');
      timestampServidor = Utilities.formatDate(ahora, TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
    }

    // ── SIN VALIDACIÓN DE ZONA (decisión de Electronics) ──────────────────
    const latNum = parseFloat(datos.lat);
    const lngNum = parseFloat(datos.lng);
    const tieneCoords = !isNaN(latNum) && !isNaN(lngNum) && (latNum !== 0 || lngNum !== 0);
    const estadoZonaFinal = 'VÁLIDA';

    // ── DEDUPLICACIÓN POR UUID ────────────────────────────────────────────
    const ss      = SpreadsheetApp.getActiveSpreadsheet();
    const sheet   = ss.getSheetByName('CHECADOR_CHOFERES');
    const lastRow = sheet.getLastRow();
    const uuid = (datos.uuid || '').toString().trim();

    if (uuid && lastRow >= 3) {
      try {
        const uuidsExistentes = sheet.getRange(3, 9, lastRow - 2, 1).getValues();
        for (let i = 0; i < uuidsExistentes.length; i++) {
          if ((uuidsExistentes[i][0] || '').toString().trim() === uuid) {
            Logger.log('🔁 UUID ' + uuid + ' ya existe en fila ' + (i + 3) + ' — no se duplica');
            return { ok: true, message: 'Checada ya registrada previamente',
                     horaServidor: horaServidor, estadoZona: estadoZonaFinal, duplicado: true };
          }
        }
      } catch (e) { /* columna I aún no existe: seguir */ }
    }

    // ⭐ EL SHEET ES LA LEY: el tipo se deduce con lo que está registrado
    // hoy en CHECADOR_CHOFERES, nunca con el cache del dispositivo.
    const idBuscado = _normId(datos.idUsuario);
    const checadasPrevias = [];
    if (lastRow >= 3) {
      const prev = sheet.getRange(3, 1, lastRow - 2, 10).getValues();
      prev.forEach(function(r) {
        if (_normId(r[0]) !== idBuscado) return;
        if ((r[2] || '').toString() !== fechaServidor) return;
        const t = (r[9] || '').toString().trim().toUpperCase();
        if (!t) return; // ignorar checadas legacy sin tipo
        const hm = (r[3] || '').toString().match(/(\d{1,2}):(\d{2})/);
        checadasPrevias.push({ tipo: t, min: hm ? parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10) : 0 });
      });
    }

    const cfgEmp = _cfgEmpleadoServ(idBuscado);
    const hmDet = horaServidor.match(/(\d{1,2}):(\d{2})/);
    const minDet = hmDet ? parseInt(hmDet[1], 10) * 60 + parseInt(hmDet[2], 10) : 0;

    let tipoChecada = (datos.tipo || '').toString().trim().toUpperCase();
    if (!tipoChecada || datos.autoDetect) {
      tipoChecada = _detectarTipoPorHora(checadasPrevias, cfgEmp, minDet);
    }

    const veredicto = _calcularVeredictoServ(tipoChecada, idBuscado, horaServidor, checadasPrevias, cfgEmp);

    // ⛔ SALIDA ANTES DE HORA → no se registra, solo aviso
    if (tipoChecada === 'SALIDA_TEMPRANA') {
      const t = _obtenerTurnoServ(idBuscado) || cfgEmp;
      const finM = (t && t.finMin != null) ? t.finMin : (cfgEmp && cfgEmp.finMin);
      return {
        ok: true, noRegistrada: true, tipo: tipoChecada,
        message: 'Aún no es tu hora de salida',
        horaServidor: horaServidor,
        veredicto: { texto: '⛔ Todavía no es tu salida', color: '#ef4444',
          detalle: 'Tu salida es a las ' + (finM != null ? _minAHora(finM) : '—') +
                   '. No puedes checar antes. Espera a tu hora.' },
        checadasHoyServidor: checadasPrevias.map(function(c) { return { fecha: fechaServidor, hora: '', tipo: c.tipo }; })
      };
    }

    // ⛔ FUERA DE HORARIO → no se registra nada
    if (tipoChecada === 'FUERA_HORARIO') {
      return {
        ok: true, noRegistrada: true,
        message: 'Fuera de horario — no se registró',
        horaServidor: horaServidor, tipo: tipoChecada, veredicto: veredicto,
        checadasHoyServidor: checadasPrevias.map(function(c) { return { fecha: fechaServidor, hora: '', tipo: c.tipo }; })
      };
    }

    // ⚠️ Si no es entrada y hoy no hay entrada registrada, decirlo claro
    if (tipoChecada !== 'ENTRADA' && !checadasPrevias.some(function(c) { return c.tipo === 'ENTRADA'; })) {
      veredicto.detalle = '⚠️ Sin entrada registrada hoy. ' + (veredicto.detalle || '');
    }

    // ── Escribir (10 columnas A-J) ──
    const fila = lastRow + 1;
    sheet.getRange(fila, 1, 1, 10).setValues([[
      datos.idUsuario || '', datos.nombre || '',
      fechaServidor, horaServidor, timestampServidor,
      tieneCoords ? latNum : '', tieneCoords ? lngNum : '',
      estadoZonaFinal, uuid, tipoChecada
    ]]);

    // Texto en Fecha, Hora, Timestamp, UUID y Tipo: evita que Sheets
    // reinterprete las cadenas como fechas.
    [3, 4, 5, 9, 10].forEach(function(c) { sheet.getRange(fila, c).setNumberFormat('@'); });

    Logger.log('✅ Checada' + (esOffline ? ' (OFFLINE)' : '') + ': ' + datos.nombre +
               ' · ' + horaServidor + ' · ' + tipoChecada +
               (uuid ? ' · uuid=' + uuid.substring(0, 8) : ''));

    // ⭐ Devolver las checadas de HOY según el SHEET, para que el frontend
    // se resincronice y cualquier desfase se auto-corrija.
    let checadasHoyServidor = [];
    try {
      const totalFilas = sheet.getLastRow();
      if (totalFilas >= 3) {
        const todas = sheet.getRange(3, 1, totalFilas - 2, 10).getValues();
        todas.forEach(function(row) {
          if (_normId(row[0]) !== idBuscado) return;
          if ((row[2] || '').toString() !== fechaServidor) return;
          checadasHoyServidor.push({
            fecha: (row[2] || '').toString(),
            hora:  (row[3] || '').toString(),
            tipo:  (row[9] || '').toString()
          });
        });
      }
    } catch (e) {}

    return { ok: true, message: 'Checada registrada', horaServidor: horaServidor,
             estadoZona: estadoZonaFinal, tipo: tipoChecada, veredicto: veredicto,
             checadasHoyServidor: checadasHoyServidor };

  } catch (e) {
    Logger.log('❌ Error guardarChecadaChofer: ' + e.message);
    return { ok: false, message: e.message };
  }
}

function getZonasValidas() {
  // El GPS ya no valida nada. Se devuelve lista vacía para que las versiones
  // viejas del frontend que aún llaman esta función no fallen.
  return { ok: true, zonas: [] };
}

// ============================================================================
// CONFIG_ALERTAS
// ============================================================================

function crearHojaConfigAlertas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('CONFIG_ALERTAS');
  if (sheet) return sheet;

  sheet = ss.insertSheet('CONFIG_ALERTAS');

  const filas = [
    ['Parámetro', 'Valor', 'Descripción'],
    ['duracion_desayuno_min',        20, 'Minutos permitidos de desayuno'],
    ['duracion_comida_min',          60, 'Minutos permitidos de comida'],
    ['aviso_desayuno_min_antes',      5, 'Avisar X min antes del exceso de desayuno'],
    ['aviso_comida_min_antes',       10, 'Avisar X min antes del exceso de comida'],
    ['aviso_salida_min_antes',        5, 'Avisar X min antes de la hora de salida'],
    ['alertas_no_checo_cantidad',     2, 'Cuántos recordatorios si no registra su checada'],
    ['alertas_no_checo_intervalo_min',5, 'Minutos entre esos recordatorios'],
    ['alertas_activas',            'SI', 'Interruptor general de alertas (SI/NO)']
  ];

  sheet.getRange(1, 1, filas.length, 3).setValues(filas);
  sheet.getRange(1, 1, 1, 3)
    .setBackground('#3f51b5').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setColumnWidth(1, 240);
  sheet.setColumnWidth(2, 90);
  sheet.setColumnWidth(3, 380);
  sheet.setFrozenRows(1);

  Logger.log('✅ Hoja CONFIG_ALERTAS creada con valores por defecto');
  return sheet;
}

function getConfigAlertas() {
  try {
    const sheet = crearHojaConfigAlertas();
    const data = sheet.getDataRange().getValues();
    const config = {};
    for (let i = 1; i < data.length; i++) {
      const clave = (data[i][0] || '').toString().trim();
      if (!clave) continue;
      let valor = data[i][1];
      if (typeof valor === 'string') {
        const num = parseFloat(valor);
        valor = isNaN(num) ? valor.trim().toUpperCase() : num;
      }
      config[clave] = valor;
    }
    return { ok: true, config: config };
  } catch (e) {
    Logger.log('❌ getConfigAlertas: ' + e.message);
    return { ok: false, message: e.message };
  }
}

// ============================================================================
// PERFIL DEL EMPLEADO
// ============================================================================

function getPerfilEmpleado(pin) {
  try {
    if (!pin) return { ok: false, message: 'PIN requerido' };
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const usuarios = getTodosLosUsuarios();
    if (!usuarios.ok) return { ok: false, message: 'No se pudieron leer usuarios' };
    let empleado = null;
    for (let i = 0; i < usuarios.usuarios.length; i++) {
      if (_normId(usuarios.usuarios[i].pin) === _normId(pin)) { empleado = usuarios.usuarios[i]; break; }
    }
    if (!empleado) return { ok: false, message: 'PIN no encontrado' };

    const hoy = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
    const hace7 = new Date(); hace7.setDate(hace7.getDate() - 7);

    const sheet = ss.getSheetByName('CHECADOR_CHOFERES');
    const checadasHoy = [];
    const historial = {};

    if (sheet && sheet.getLastRow() >= 3) {
      const data = sheet.getRange(3, 1, sheet.getLastRow() - 2, 10).getValues();
      const idEmpleado = (empleado.idUsuario || '').toString();

      data.forEach(function(row) {
        if (_normId(row[0]) !== _normId(idEmpleado)) return;
        const fecha = (row[2] || '').toString();
        const fechaObj = new Date(fecha + 'T00:00:00');
        if (isNaN(fechaObj.getTime()) || fechaObj < hace7) return;

        const checada = { fecha: fecha, hora: (row[3] || '').toString(), tipo: (row[9] || '').toString() };
        if (fecha === hoy) checadasHoy.push(checada);
        if (!historial[fecha]) historial[fecha] = [];
        historial[fecha].push(checada);
      });
    }

    return {
      ok: true,
      empleado: { pin: empleado.pin, idUsuario: empleado.idUsuario,
                  nombre: empleado.nombre, turnoHorario: empleado.turnoHorario || '' },
      hoy: hoy, checadasHoy: checadasHoy, historial: historial
    };
  } catch (e) {
    Logger.log('❌ getPerfilEmpleado: ' + e.message);
    return { ok: false, message: e.message };
  }
}

// ============================================================================
// AVATARES
// ============================================================================
// Los overrides viven en las propiedades del PROYECTO de Apps Script, no en
// el sheet. Al cambiar de proyecto no se mueven solos.

function getAvatarOverrides() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var result = {};
  for (var key in all) {
    if (key.indexOf('avatar_') === 0) {
      var nombre = key.replace('avatar_', '');
      try { result[nombre] = JSON.parse(all[key]); } catch(e) {}
    }
  }
  return result;
}

// Migración desde un proyecto viejo:
//   1) en el proyecto VIEJO ejecuta exportarAvatarOverridesParaMigracion
//   2) pega el JSON aquí abajo
//   3) ejecuta importarAvatarOverrides una vez
var AVATAR_MIGRACION_JSON = '';

function exportarAvatarOverridesParaMigracion() {
  Logger.log(JSON.stringify(getAvatarOverrides()));
  return { ok: true };
}

function importarAvatarOverrides() {
  if (!AVATAR_MIGRACION_JSON || !AVATAR_MIGRACION_JSON.trim()) {
    Logger.log('❌ Pega primero el JSON en AVATAR_MIGRACION_JSON');
    return { ok: false, message: 'AVATAR_MIGRACION_JSON vacío' };
  }
  var data = JSON.parse(AVATAR_MIGRACION_JSON);
  var props = PropertiesService.getScriptProperties();
  var n = 0;
  for (var nombre in data) {
    props.setProperty('avatar_' + nombre, JSON.stringify(data[nombre]));
    n++;
  }
  Logger.log('✅ ' + n + ' avatares importados');
  return { ok: true, importados: n };
}

// ============================================================================
// FIREBASE — credenciales FUERA del código
// ============================================================================
// ⚠️ CAMBIO IMPORTANTE
//
// Antes el service account completo (incluida la private_key) estaba escrito
// aquí como constante. Eso significa que cualquiera que viera el código
// —una copia, una captura, un repo, un compañero con acceso al proyecto—
// podía mandar notificaciones haciéndose pasar por la empresa y entrar al
// proyecto de Firebase.
//
// Ahora vive en PropertiesService, cifrado y fuera del código.
//
// CÓMO CONFIGURARLO (una sola vez):
//   1. Consola de Firebase → ⚙️ → Cuentas de servicio → Generar nueva clave
//   2. Abre el .json que se descarga y copia TODO su contenido
//   3. Aquí en el editor, ejecuta configurarFirebase() y pégalo
//
// Y revoca la llave vieja en esa misma pantalla: borrarla del código no la
// invalida, sigue funcionando hasta que la revoques.

var PROP_FIREBASE_SA = 'FIREBASE_SERVICE_ACCOUNT';

function _firebaseSA_() {
  return PropertiesService.getScriptProperties().getProperty(PROP_FIREBASE_SA) || '';
}

function configurarFirebase() {
  const ui = SpreadsheetApp.getUi();
  const actual = _firebaseSA_();

  const r = ui.prompt('🔥 Service account de Firebase',
    'Estado: ' + (actual ? 'configurado (' + actual.length + ' caracteres)' : 'SIN CONFIGURAR') + '\n\n' +
    'Pega el contenido COMPLETO del .json que descargaste de\n' +
    'Firebase → ⚙️ → Cuentas de servicio → Generar nueva clave privada.\n\n' +
    'Se guarda cifrado en PropertiesService. No queda en el código.',
    ui.ButtonSet.OK_CANCEL);

  if (r.getSelectedButton() !== ui.Button.OK) return;

  const v = (r.getResponseText() || '').trim();
  if (!v) { ui.alert('No se guardó nada (campo vacío).'); return; }

  let sa;
  try {
    sa = JSON.parse(v);
  } catch (e) {
    ui.alert('❌ Eso no es un JSON válido', e.message, ui.ButtonSet.OK);
    return;
  }
  if (!sa.private_key || !sa.client_email || !sa.project_id) {
    ui.alert('❌ Falta información',
      'El JSON no trae private_key, client_email o project_id. ' +
      'Asegúrate de copiar el archivo completo.', ui.ButtonSet.OK);
    return;
  }

  PropertiesService.getScriptProperties().setProperty(PROP_FIREBASE_SA, v);
  CacheService.getScriptCache().remove('fcm_access_token');

  ui.alert('✅ Guardado',
    'Proyecto: ' + sa.project_id + '\nCuenta: ' + sa.client_email + '\n\n' +
    'Ahora prueba con el botón de notificación del perfil.\n\n' +
    'No olvides REVOCAR la llave anterior en la consola de Firebase.',
    ui.ButtonSet.OK);
}

function borrarConfigFirebase() {
  PropertiesService.getScriptProperties().deleteProperty(PROP_FIREBASE_SA);
  CacheService.getScriptCache().remove('fcm_access_token');
  Logger.log('🔥 Configuración de Firebase borrada');
  return { ok: true };
}

// ============================================================================
// PUSH_TOKENS — un DISPOSITIVO por FILA
// ============================================================================

var _PUSH_HEADERS = ['PIN', 'ID Usuario', 'Nombre', 'Token', 'Dispositivo', 'Registrado', 'Último uso'];

function crearHojaPushTokens() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('PUSH_TOKENS');
  if (!sheet) {
    sheet = ss.insertSheet('PUSH_TOKENS');
    sheet.getRange(1, 1, 1, _PUSH_HEADERS.length).setValues([_PUSH_HEADERS])
      .setBackground('#3f51b5').setFontColor('#fff').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(4, 380);
    sheet.setColumnWidth(5, 200);
    return sheet;
  }
  // Migración del formato viejo (PIN, ID, Nombre, Token, Registrado)
  const enc = sheet.getRange(1, 1, 1, Math.max(5, sheet.getLastColumn())).getValues()[0];
  if ((enc[4] || '').toString().trim() === 'Registrado') {
    sheet.insertColumnBefore(5);
    sheet.getRange(1, 5).setValue('Dispositivo');
    sheet.getRange(1, 7).setValue('Último uso');
    sheet.getRange(1, 1, 1, _PUSH_HEADERS.length)
      .setBackground('#3f51b5').setFontColor('#fff').setFontWeight('bold');
    sheet.setColumnWidth(5, 200);
    Logger.log('🔧 PUSH_TOKENS migrada a 7 columnas');
  }
  return sheet;
}

function registrarPushToken(pin, token, tokenAnterior, dispositivo) {
  try {
    if (!pin || !token) return { ok: false, message: 'pin y token requeridos' };
    // Si este dispositivo re-vincula, borrar su token viejo para no
    // mandarle la misma notificación dos veces.
    if (tokenAnterior && tokenAnterior !== token) {
      try { eliminarPushToken(tokenAnterior); } catch (e) {}
    }
    const usuarios = getTodosLosUsuarios();
    let emp = null;
    (usuarios.usuarios || []).forEach(function(u) { if (_normId(u.pin) === _normId(pin)) emp = u; });
    if (!emp) return { ok: false, message: 'PIN no encontrado' };

    const sheet = crearHojaPushTokens();
    const data = sheet.getDataRange().getValues();
    const ahora = Utilities.formatDate(new Date(), TIMEZONE, 'dd/MM/yyyy HH:mm');
    const disp = (dispositivo || 'Dispositivo').toString().substring(0, 60);

    for (let i = 1; i < data.length; i++) {
      if ((data[i][3] || '').toString() === token) {
        sheet.getRange(i + 1, 5).setValue(disp);
        sheet.getRange(i + 1, 7).setValue(ahora);
        return { ok: true, message: 'Dispositivo ya vinculado' };
      }
    }
    sheet.appendRow([emp.pin, emp.idUsuario, emp.nombre, token, disp, ahora, ahora]);
    const total = _contarDispositivos(emp.pin);
    Logger.log('🔔 Dispositivo vinculado: ' + emp.nombre + ' · ' + disp + ' (total: ' + total + ')');
    return { ok: true, message: 'Dispositivo vinculado (' + total + ' en total)' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function eliminarPushToken(token) {
  try {
    const sheet = crearHojaPushTokens();
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if ((data[i][3] || '').toString() === token) sheet.deleteRow(i + 1);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// ── Envío FCM (HTTP v1) con OAuth del service account ───────────────────────

function _obtenerAccessTokenFCM() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('fcm_access_token');
  if (cached) return cached;

  const sa = JSON.parse(_firebaseSA_());
  const ahora = Math.floor(Date.now() / 1000);
  const header = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = Utilities.base64EncodeWebSafe(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: ahora,
    exp: ahora + 3600
  }));
  const firma = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(header + '.' + claims, sa.private_key)
  );
  const jwt = header + '.' + claims + '.' + firma;

  const resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }
  });
  const tokenData = JSON.parse(resp.getContentText());
  cache.put('fcm_access_token', tokenData.access_token, 3300); // ~55 min
  return tokenData.access_token;
}

/**
 * Cuerpo del mensaje FCM.
 *
 * SOLO data, sin "notification": si se manda notification, el navegador la
 * muestra por su cuenta Y el service worker la muestra otra vez, así que las
 * alertas llegaban DOBLE.
 */
function _payloadFCM_(sa, token, titulo, cuerpo, urlAccion) {
  return JSON.stringify({
    message: {
      token: token,
      data: { title: titulo, body: cuerpo, url: urlAccion || '' },
      webpush: { fcm_options: { link: 'https://v-w04.github.io/ElectronicsChecador/' } }
    }
  });
}

function _enviarPushFCM(token, titulo, cuerpo, urlAccion) {
  const saRaw = _firebaseSA_();
  if (!saRaw) {
    Logger.log('⚠️ Firebase sin configurar — push omitido. Ejecuta configurarFirebase()');
    return false;
  }
  try {
    const sa = JSON.parse(saRaw);
    const url = 'https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send';
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + _obtenerAccessTokenFCM() },
      muteHttpExceptions: true,
      payload: _payloadFCM_(sa, token, titulo, cuerpo, urlAccion)
    });
    const code = resp.getResponseCode();
    // Token muerto (app desinstalada) → limpiarlo para no reintentarlo a diario
    if (code === 404 || code === 410) eliminarPushToken(token);
    return code >= 200 && code < 300;
  } catch (e) {
    Logger.log('❌ _enviarPushFCM: ' + e.message);
    return false;
  }
}

function _enviarPushFCMDetallado(token, titulo, cuerpo, urlAccion) {
  const saRaw = _firebaseSA_();
  if (!saRaw) return { ok: false, code: 0, body: 'Firebase sin configurar' };
  try {
    const sa = JSON.parse(saRaw);
    const url = 'https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send';
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + _obtenerAccessTokenFCM() },
      muteHttpExceptions: true,
      payload: _payloadFCM_(sa, token, titulo, cuerpo, urlAccion)
    });
    const code = resp.getResponseCode();
    if (code === 404 || code === 410) eliminarPushToken(token);
    return { ok: code >= 200 && code < 300, code: code, body: resp.getContentText().substring(0, 300) };
  } catch (e) {
    return { ok: false, code: 0, body: e.message };
  }
}

// ── Registro de alertas enviadas (anti-duplicados) ──────────────────────────

function _yaSeEnvio(clave) {
  return PropertiesService.getScriptProperties().getProperty('alerta_' + clave) !== null;
}
function _marcarEnviada(clave) {
  PropertiesService.getScriptProperties().setProperty('alerta_' + clave, '1');
}
function _limpiarMarcasViejas() {
  const hoy = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  for (var k in all) {
    if (k.indexOf('alerta_') === 0 && k.indexOf(hoy) === -1) props.deleteProperty(k);
  }
}

// ============================================================================
// MOTOR DE ALERTAS — corre cada minuto vía trigger
// ============================================================================

function revisarAlertas() {
  try {
    // ⛔ Fuera del horario laboral no hay nada que revisar.
    // Antes esto corría 1,440 veces al día, madrugadas incluidas, leyendo
    // seis hojas cada vez. Este corte quita un tercio de las ejecuciones
    // sin perder una sola alerta.
    const hAhora = parseInt(Utilities.formatDate(new Date(), TIMEZONE, 'H'), 10);
    if (hAhora < ALERTAS_HORA_INICIO || hAhora >= ALERTAS_HORA_FIN) return;

    // ⛔ Sábado y domingo: sin alertas
    const _dow = parseInt(Utilities.formatDate(new Date(), TIMEZONE, 'u'), 10); // 1=lun … 7=dom
    if (_dow === 6 || _dow === 7) return;

    const cfgResp = getConfigAlertas();
    if (!cfgResp.ok) return;
    const cfg = cfgResp.config;
    if ((cfg.alertas_activas || 'SI') !== 'SI') return;

    // ⛔ Sin Firebase configurado no hay nada que mandar: salir antes de
    // gastar seis lecturas de hoja en calcular alertas que no se envían.
    if (!_firebaseSA_()) {
      Logger.log('⚠️ revisarAlertas: Firebase sin configurar. Ejecuta configurarFirebase()');
      return;
    }

    _limpiarMarcasViejas();

    // ⛔ Día festivo global (EXCEPCIONES_DIA con PIN 'TODOS')
    const _hoyExc = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
    const _excepciones = _leerExcepciones();
    if (_excepciones[_hoyExc + '|TODOS']) return;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('CHECADOR_CHOFERES');
    if (!sheet || sheet.getLastRow() < 3) return;

    const ahora = new Date();
    const hoy = Utilities.formatDate(ahora, TIMEZONE, 'yyyy-MM-dd');
    const minAhora = parseInt(Utilities.formatDate(ahora, TIMEZONE, 'H'), 10) * 60 +
                     parseInt(Utilities.formatDate(ahora, TIMEZONE, 'm'), 10);

    // Checadas de HOY agrupadas por idUsuario
    const data = sheet.getRange(3, 1, sheet.getLastRow() - 2, 10).getValues();
    const porUsuario = {};
    data.forEach(function(r) {
      if ((r[2] || '').toString() !== hoy) return;
      const id = _normId(r[0]);
      if (!id) return;
      if (!porUsuario[id]) porUsuario[id] = [];
      const hParts = (r[3] || '').toString().match(/(\d{1,2}):(\d{2})/);
      porUsuario[id].push({
        tipo: (r[9] || '').toString(),
        min: hParts ? parseInt(hParts[1], 10) * 60 + parseInt(hParts[2], 10) : 0
      });
    });

    // Tokens por idUsuario
    const sheetTokens = crearHojaPushTokens();
    const tokensData = sheetTokens.getDataRange().getValues();
    const tokensPorId = {};
    for (let i = 1; i < tokensData.length; i++) {
      const id = _normId(tokensData[i][1]);
      const tk = (tokensData[i][3] || '').toString();
      if (!id || !tk) continue;
      if (!tokensPorId[id]) tokensPorId[id] = [];
      if (tokensPorId[id].indexOf(tk) === -1) tokensPorId[id].push(tk);
    }

    // Turnos por idUsuario
    const usuarios = getTodosLosUsuarios();
    const turnoPorId = {};
    (usuarios.usuarios || []).forEach(function(u) {
      const m = (u.turnoHorario || '').match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
      if (m) turnoPorId[_normId(u.idUsuario)] = {
        inicioMin: parseInt(m[1], 10) * 60 + parseInt(m[2], 10),
        finMin:    parseInt(m[3], 10) * 60 + parseInt(m[4], 10)
      };
    });

    // Preferencias por empleado
    const sheetPrefs = crearHojaPrefsAlertas();
    const prefsData = sheetPrefs.getDataRange().getValues();
    const prefsPorId = {};
    for (let i = 1; i < prefsData.length; i++) {
      prefsPorId[_normId(prefsData[i][1])] = {
        entrada:        (prefsData[i][3] || 'SI').toString(),
        desayuno:       (prefsData[i][4] || 'SI').toString(),
        comida:         (prefsData[i][5] || 'SI').toString(),
        comida_nohecha: (prefsData[i][6] || 'SI').toString(),
        salida:         (prefsData[i][7] || 'SI').toString()
      };
    }
    function prefActiva(id, categoria) {
      const p = prefsPorId[id];
      return !p || (p[categoria] || 'SI') !== 'NO';
    }

    // Ausencias de HOY
    const ausentesHoy = {};
    try {
      const sa = ss.getSheetByName('AUSENCIAS');
      if (sa && sa.getLastRow() > 1) {
        sa.getRange(2, 1, sa.getLastRow() - 1, 5).getValues().forEach(function(r) {
          if ((r[3] || '').toString() === hoy) ausentesHoy[_normId(r[1])] = true;
        });
      }
    } catch (e) {}

    const _pinPorId = {};
    (usuarios.usuarios || []).forEach(function(u) { _pinPorId[_normId(u.idUsuario)] = u.pin; });

    function push(id, categoria, clave, titulo, cuerpo, urlAccion) {
      if (ausentesHoy[id]) return;
      const _p = _pinPorId[_normId(id)];
      if (_p && _excepcionDe(_excepciones, hoy, _p)) return;
      if (!prefActiva(id, categoria)) return;
      if (_yaSeEnvio(clave)) return;
      const tokens = tokensPorId[id] || [];
      // Sin dispositivo: marcar igual, para no recalcular esto cada minuto
      if (tokens.length === 0) { _marcarEnviada(clave); return; }
      let enviado = false;
      tokens.forEach(function(t) { if (_enviarPushFCM(t, titulo, cuerpo, urlAccion)) enviado = true; });
      if (enviado) _marcarEnviada(clave);
    }

    const durDes  = cfg.duracion_desayuno_min || 20;
    const durCom  = cfg.duracion_comida_min || 60;
    const avDes   = cfg.aviso_desayuno_min_antes || 5;
    const avCom   = cfg.aviso_comida_min_antes || 10;
    const avSal   = cfg.aviso_salida_min_antes || 5;
    const nRec    = cfg.alertas_no_checo_cantidad || 2;
    const intRec  = cfg.alertas_no_checo_intervalo_min || 5;

    for (var id in porUsuario) {
      const checadas = porUsuario[id];
      const ultima = checadas[checadas.length - 1];
      const turno = turnoPorId[id];

      // ── DESAYUNO / COMIDA en curso ──
      if (ultima && (ultima.tipo === 'SALIDA_DESAYUNO' || ultima.tipo === 'SALIDA_COMIDA')) {
        const esDes = ultima.tipo === 'SALIDA_DESAYUNO';
        const cfgEmpAl = _cfgEmpleadoServ(id) || {};
        const dur   = esDes ? (cfgEmpAl.desDur || durDes) : (cfgEmpAl.comDur || durCom);
        const aviso = esDes ? avDes : avCom;
        const nom   = esDes ? 'desayuno' : 'comida';
        const trans = minAhora - ultima.min;
        const limiteMin = ultima.min + dur;

        // La clave incluye la HORA de esa salida: un segundo descanso el
        // mismo día tiene sus propias alertas.
        const marca = hoy + '|' + id + '|' + nom + '@' + ultima.min;

        if (trans >= dur - aviso && trans < dur) {
          const avisosDes = [
            'Regresa antes de las ' + _minAHora(limiteMin) + '. Aquí no se perdona ni un minuto: un minuto de más se castiga con una hora.',
            'Te quedan ' + (dur - trans) + ' min. Si te pasas, serás castigado con una hora de descuento.',
            'Regresa a tiempo: pasarte del límite se castiga con una hora completa.',
            'Cierra tu ' + nom + ' antes de las ' + _minAHora(limiteMin) + ' o te castigan con una hora.',
            'Quedan ' + (dur - trans) + ' min. El exceso se castiga con una hora completa.'
          ];
          const semAv = (parseInt(hoy.replace(/-/g, ''), 10) + parseInt(id, 10) + ultima.min) % avisosDes.length;
          push(id, nom, marca + '|aviso',
               '⏰ Te quedan ' + (dur - trans) + ' min de ' + nom, avisosDes[semAv]);
        }

        if (trans === dur || trans === dur + 1) {
          push(id, nom, marca + '|limite', '⏰ Se acabó tu ' + nom,
               'Eran ' + dur + ' min. Desde ahora cada minuto se castiga con una hora. Registra tu regreso.');
        }

        // Solo el recordatorio que toca AHORA: los atrasados se marcan en
        // silencio para que no lleguen todos juntos en ráfaga.
        if (trans > dur) {
          const nActual = Math.min(nRec, Math.floor((trans - dur) / intRec));
          if (nActual >= 1) {
            for (let n = 1; n < nActual; n++) _marcarEnviada(marca + '|exceso_' + n);
            const exc = trans - dur;
            const variantes = [
              'Te pasaste ' + exc + ' min. Aquí no se perdona ni un minuto: te descuentan una hora.',
              'Cada minuto de exceso se castiga con una hora completa. Llevas ' + exc + '.',
              'Tu ' + nom + ' era de ' + dur + ' min. Ya te pasaste ' + exc + ' y eso se castiga.',
              'Registra tu regreso: por ' + exc + ' min de más te descuentan una hora entera.',
              'Aquí no se perdona ni un minuto. Llevas ' + exc + ' min de exceso.',
              'Te pasaste ' + exc + ' min del ' + nom + '. El castigo es una hora de descuento.',
              'Un solo minuto de más ya se castiga con una hora. Van ' + exc + '.',
              'Tu descanso terminó hace ' + exc + ' min. Esto se descuenta por hora completa.',
              'No regales tu día: ' + exc + ' min de exceso te cuestan una hora de castigo.',
              'Llevas ' + exc + ' min pasado del límite. El descuento es de una hora.',
              'El ' + nom + ' se te pasó ' + exc + ' min. Aquí eso se castiga con una hora.',
              'Regresa y checa: ' + exc + ' min de más equivalen a una hora descontada.',
              'Te excediste ' + exc + ' min. Ese exceso se castiga por hora completa.',
              'Ya vas ' + exc + ' min de más. Cada uno cuenta: te descuentan una hora.',
              'Registra tu regreso antes de sumar más castigo. Llevas ' + exc + ' min.',
              'Tu límite era ' + dur + ' min y llevas ' + exc + ' de más. Eso se castiga.',
              exc + ' min de exceso. El descuento es una hora, sin perdón.',
              'No dejes que crezca el castigo: ' + exc + ' min de más y contando.',
              'Cada minuto extra del ' + nom + ' se paga con una hora. Van ' + exc + '.',
              'Te pasaste ' + exc + ' min. Registra tu regreso y evita más castigo.'
            ];
            const baseE = (parseInt(hoy.replace(/-/g, ''), 10) + parseInt(id, 10) * 13 + ultima.min) % variantes.length;
            const semExc = (baseE + (nActual - 1) * 7) % variantes.length;
            push(id, nom, marca + '|exceso_' + nActual,
                 '❌ Te pasaste ' + exc + ' min del ' + nom, variantes[semExc]);
          }
        }
      }

      // ── COMIDA NO TOMADA ──
      const tieneEnt0 = checadas.some(function(c) { return c.tipo === 'ENTRADA'; });
      const salioComer = checadas.some(function(c) { return c.tipo === 'SALIDA_COMIDA'; });
      if (turno && tieneEnt0 && !salioComer) {
        const faltanParaSalir = turno.finMin - minAhora;
        if (faltanParaSalir === 100 || faltanParaSalir === 99) {
          push(id, 'comida_nohecha', hoy + '|' + id + '|comida_nohecha_1@' + turno.finMin,
               '🍽️ No has salido a comer',
               'Tu hora de comida no se paga: si no la tomas, la estás regalando. Sales a las ' + _minAHora(turno.finMin) + '.');
        }
        if (faltanParaSalir === 90 || faltanParaSalir === 89) {
          push(id, 'comida_nohecha', hoy + '|' + id + '|comida_nohecha_2@' + turno.finMin,
               '🍽️ Aún no sales a comer',
               'Última oportunidad para tu comida. Si no la tomas, regalas ese tiempo. Salida: ' + _minAHora(turno.finMin) + '.');
        }
      }

      // ── SALIDA ──
      const tieneEntrada = checadas.some(function(c) { return c.tipo === 'ENTRADA'; });
      const tieneSalida  = checadas.some(function(c) { return c.tipo === 'SALIDA'; });
      if (turno && tieneEntrada && !tieneSalida) {
        if (minAhora >= turno.finMin - avSal && minAhora < turno.finMin) {
          push(id, 'salida', hoy + '|' + id + '|salida_aviso@' + turno.finMin,
               '🏠 Tu salida es a las ' + _minAHora(turno.finMin),
               'Faltan ' + (turno.finMin - minAhora) + ' min.');
        }
        // Ventana de 2 min por si el motor se salta un minuto
        if (minAhora >= turno.finMin && minAhora <= turno.finMin + 1) {
          push(id, 'salida', hoy + '|' + id + '|salida_hora@' + turno.finMin,
               '🏠 Es tu hora de salida',
               'Son las ' + _minAHora(turno.finMin) + '. Registra tu salida ya; a partir de ahora el tiempo se regala. Si estás fuera de la oficina, toca para registrarla.',
               'https://v-w04.github.io/ElectronicsChecador/?salidaRemota=' + encodeURIComponent(id));
        }
        if (minAhora > turno.finMin) {
          const extra = minAhora - turno.finMin;
          const nAct = Math.min(nRec, Math.floor(extra / intRec));
          if (nAct >= 1) {
            for (let n = 1; n < nAct; n++) {
              _marcarEnviada(hoy + '|' + id + '|salida_no_checo@' + turno.finMin + '_' + n);
            }
            const hFin = _minAHora(turno.finMin);
            const vars = [
              'Llevas ' + extra + ' min regalados. Si no checas tu salida, serás castigado con una hora de descuento.',
              'Tu salida era a las ' + hFin + '. Cada minuto sin checar es tiempo que regalas y castigo que se acumula.',
              'Estás regalando ' + extra + ' min. Checa tu salida o te castigarán con una hora de sanción.',
              'No has checado tu salida. Aquí no se perdona ni un minuto: serás castigado si no la registras.',
              'Tu turno terminó a las ' + hFin + '. Regalas tu tiempo y te castigan con descuento si no checas.',
              'Van ' + extra + ' min regalados. Registra tu salida antes de que el castigo sea mayor.',
              'Si no checas tu salida, te castigarán con una hora completa de descuento.',
              'Tu jornada cerró a las ' + hFin + '. El tiempo que regalas ahora no se paga y suma castigo.',
              'Sin tu checada de salida serás castigado. Llevas ' + extra + ' min regalados.',
              'Cada minuto cuenta: aquí no se perdona ni uno. Checa tu salida o te castigan.',
              'Regalas tu tiempo desde las ' + hFin + '. Checa tu salida para evitar el castigo.',
              extra + ' min regalados y contando. El castigo es una hora de descuento si no checas.',
              'Tu horario terminó. No checar tu salida se castiga con descuento.',
              'Llevas ' + extra + ' min de más sin pago. Registra tu salida o serás sancionado.',
              'No regales tu tiempo: checa tu salida. El castigo por no hacerlo es una hora menos.',
              'Salida sin registrar. Aquí no se perdona ni un minuto y el castigo ya corre.',
              'Tu turno era hasta las ' + hFin + '. Regalar tu tiempo también se castiga.',
              'Van ' + extra + ' min regalados. Te castigarán con una hora si no checas tu salida.',
              'Checa tu salida ya. Cada minuto sin registrar es castigo y tiempo regalado.',
              'Tu jornada terminó a las ' + hFin + '. Serás castigado con descuento si no registras tu salida.'
            ];
            const base = (parseInt(hoy.replace(/-/g, ''), 10) + parseInt(id, 10) * 13) % vars.length;
            const semilla = (base + (nAct - 1) * 7) % vars.length;
            const sufijoRemoto = (nAct % 2 === 0)
              ? ' Si estás fuera de la oficina, toca esta notificación para registrarla.' : '';
            push(id, 'salida', hoy + '|' + id + '|salida_no_checo@' + turno.finMin + '_' + nAct,
                 '⏱️ ' + extra + ' min regalados', vars[semilla] + sufijoRemoto,
                 'https://v-w04.github.io/ElectronicsChecador/?salidaRemota=' + encodeURIComponent(id));
          }
        }
      }
    }

    // ── ENTRADA — aplica a TODOS con turno, hayan checado o no ──
    const avEnt   = cfg.aviso_entrada_min_antes || 15;
    const ventana = cfg.ventana_bono_entrada_min || 15;
    (usuarios.usuarios || []).forEach(function(u) {
      const idU = _normId(u.idUsuario);
      const turnoU = turnoPorId[idU];
      if (!turnoU) return;
      const checadasU = porUsuario[idU] || [];
      if (checadasU.some(function(c) { return c.tipo === 'ENTRADA'; })) return;

      const semEnt = (parseInt(hoy.replace(/-/g, ''), 10) + parseInt(idU, 10) * 13) % 5;

      if (minAhora >= turnoU.inicioMin - avEnt && minAhora < turnoU.inicioMin) {
        const prev = [
          'Aún estás a tiempo para el bono de puntualidad.',
          'Llega puntual y conserva tu bono. Aquí no se perdona ni un minuto.',
          'Tu entrada es a las ' + _minAHora(turnoU.inicioMin) + '. Un minuto tarde y pierdes el bono.',
          'Todavía puedes checar a tiempo. Después de la tolerancia, se castiga.',
          'Checa puntual: el retardo se castiga con descuento.'
        ];
        push(idU, 'entrada', hoy + '|' + idU + '|entrada_previa',
             '🏃 Tu entrada es a las ' + _minAHora(turnoU.inicioMin), prev[semEnt]);
      }

      if (minAhora >= turnoU.inicioMin && minAhora < turnoU.inicioMin + ventana) {
        const hHora = [
          'Pierdes el bono si no checas antes de las ' + _minAHora(turnoU.inicioMin + ventana) + '.',
          'Ya es tu hora. Después de las ' + _minAHora(turnoU.inicioMin + ventana) + ' se te castiga con la pérdida del bono.',
          'Checa ahora: cada minuto tarde se castiga. El bono se pierde a las ' + _minAHora(turnoU.inicioMin + ventana) + '.',
          'Es tu hora de entrada. Aquí no se perdona ni un minuto de retraso.',
          'Registra tu entrada ya o pierdes el bono a las ' + _minAHora(turnoU.inicioMin + ventana) + '.'
        ];
        push(idU, 'entrada', hoy + '|' + idU + '|entrada_hora',
             '⚠️ YA es tu hora de entrada', hHora[semEnt]);
      }

      const cierreBono = turnoU.inicioMin + ventana;
      if (minAhora >= cierreBono && minAhora <= cierreBono + 2) {
        const hCierre = [
          'Pasó tu tolerancia. A partir de las ' + _minAHora(turnoU.inicioMin + 31) + ' cuenta como retardo.',
          'Ya perdiste el bono. Si no checas, a las ' + _minAHora(turnoU.inicioMin + 31) + ' es retardo y se castiga.',
          'Sin registrar tu entrada. Cada 3 retardos se castigan con medio día de descuento.',
          'Se acabó la tolerancia. El retardo empieza a las ' + _minAHora(turnoU.inicioMin + 31) + ' y se castiga.',
          'Checa ya: a partir de las ' + _minAHora(turnoU.inicioMin + 31) + ' es retardo con descuento.'
        ];
        push(idU, 'entrada', hoy + '|' + idU + '|entrada_cierre_bono',
             '⏰ Entrada sin registrar', hCierre[semEnt]);
      }
    });
  } catch (e) {
    Logger.log('❌ revisarAlertas: ' + e.message);
  }
}

function _minAHora(totalMin) {
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

function instalarTriggerAlertas() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'revisarAlertas') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('revisarAlertas').timeBased().everyMinutes(1).create();
  Logger.log('✅ Trigger instalado: revisarAlertas cada 1 minuto (activo de ' +
             ALERTAS_HORA_INICIO + ':00 a ' + ALERTAS_HORA_FIN + ':00)');
  return { ok: true };
}

// ============================================================================
// PREFERENCIAS DE ALERTAS
// ============================================================================

function crearHojaPrefsAlertas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('PREFS_ALERTAS');
  if (sheet) {
    const h = sheet.getRange(1, 1, 1, Math.max(8, sheet.getLastColumn())).getValues()[0];
    if (h.indexOf('Comida no tomada') === -1) {
      sheet.insertColumnAfter(6);
      sheet.getRange(1, 7).setValue('Comida no tomada')
        .setBackground('#3f51b5').setFontColor('#fff').setFontWeight('bold');
    }
    return sheet;
  }
  sheet = ss.insertSheet('PREFS_ALERTAS');
  sheet.getRange(1, 1, 1, 9).setValues([[
    'PIN', 'ID Usuario', 'Nombre', 'Entrada', 'Desayuno', 'Comida', 'Comida no tomada', 'Salida', 'Actualizado'
  ]]).setBackground('#3f51b5').setFontColor('#fff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  return sheet;
}

function getPrefsAlertas(pin) {
  try {
    const sheet = crearHojaPrefsAlertas();
    const data = sheet.getDataRange().getValues();
    // De abajo hacia arriba: si quedaron duplicados viejos, vale el reciente
    for (let i = data.length - 1; i >= 1; i--) {
      if (_normId(data[i][0]) === _normId(pin)) {
        return { ok: true, prefs: {
          entrada:        (data[i][3] || 'SI').toString(),
          desayuno:       (data[i][4] || 'SI').toString(),
          comida:         (data[i][5] || 'SI').toString(),
          comida_nohecha: (data[i][6] || 'SI').toString(),
          salida:         (data[i][7] || 'SI').toString()
        }};
      }
    }
    return { ok: true, prefs: { entrada: 'SI', desayuno: 'SI', comida: 'SI', comida_nohecha: 'SI', salida: 'SI' } };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function guardarPrefsAlertas(pin, prefs) {
  try {
    if (!pin || !prefs) return { ok: false, message: 'pin y prefs requeridos' };
    const usuarios = getTodosLosUsuarios();
    let emp = null;
    (usuarios.usuarios || []).forEach(function(u) { if (_normId(u.pin) === _normId(pin)) emp = u; });
    if (!emp) return { ok: false, message: 'PIN no encontrado' };

    // ⭐ CANDADO: dos guardados simultáneos (toggle rápido) creaban filas
    // duplicadas del mismo PIN, una con SI y otra con NO.
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = crearHojaPrefsAlertas();
      const data = sheet.getDataRange().getValues();
      const fila = [
        emp.pin, emp.idUsuario, emp.nombre,
        prefs.entrada === 'NO' ? 'NO' : 'SI',
        prefs.desayuno === 'NO' ? 'NO' : 'SI',
        prefs.comida === 'NO' ? 'NO' : 'SI',
        prefs.comida_nohecha === 'NO' ? 'NO' : 'SI',
        prefs.salida === 'NO' ? 'NO' : 'SI',
        Utilities.formatDate(new Date(), TIMEZONE, 'dd/MM/yyyy HH:mm')
      ];
      for (let i = data.length - 1; i >= 1; i--) {
        if (_normId(data[i][0]) === _normId(pin)) sheet.deleteRow(i + 1);
      }
      sheet.appendRow(fila);
      return { ok: true, message: 'Preferencias guardadas' };
    } finally {
      lock.releaseLock();
    }
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// ============================================================================
// VEREDICTO SERVER-SIDE
// ============================================================================

function _obtenerTurnoServ(idUsuario) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('TURNOS_DEFAULT');
    if (!sheet) return null;
    const data = sheet.getDataRange().getValues();
    const h = data[0];
    const iId = h.indexOf('Admin');
    const iHor = h.indexOf('TURNO');
    if (iId === -1 || iHor === -1) return null;
    for (let i = 1; i < data.length; i++) {
      if (_normId(data[i][iId]) === _normId(idUsuario)) {
        const m = (data[i][iHor] || '').toString().match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
        if (m) return {
          inicioMin: parseInt(m[1], 10) * 60 + parseInt(m[2], 10),
          finMin:    parseInt(m[3], 10) * 60 + parseInt(m[4], 10)
        };
      }
    }
  } catch (e) {}
  return null;
}

function _calcularVeredictoServ(tipo, idUsuario, horaServidor, checadasPrevias, cfg) {
  cfg = cfg || _cfgEmpleadoServ(idUsuario) || {};
  const DUR_DES = cfg.desDur || 20;
  const DUR_COM = cfg.comDur || 60;
  const hm = horaServidor.match(/(\d{1,2}):(\d{2})/);
  const minAhora = hm ? parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10) : 0;
  const turno = (cfg.inicioMin != null && cfg.finMin != null)
    ? { inicioMin: cfg.inicioMin, finMin: cfg.finMin }
    : _obtenerTurnoServ(idUsuario);

  function fmtHora(total) {
    const h = Math.floor(total / 60) % 24, m = total % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function ultimaDe(t) {
    for (let i = checadasPrevias.length - 1; i >= 0; i--) {
      if (checadasPrevias[i].tipo === t) return checadasPrevias[i];
    }
    return null;
  }

  switch (tipo) {
    case 'ENTRADA': {
      if (!turno) return { texto: 'Entrada registrada', color: '#3ddc84', detalle: '' };
      const tol = cfg.tolerancia || 15;
      const limTol = turno.inicioMin + tol;
      const limRet = turno.inicioMin + 30;
      const ret = minAhora - turno.inicioMin;
      const hoyStr = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
      const q = _analisisEntradaQuincena(idUsuario, cfg, hoyStr);
      const nota = q.retardos > 0 ? ' Llevas ' + q.retardos + ' retardo(s) esta quincena.' : '';

      if (ret <= tol) {
        if (q.bonoPerdido) {
          return { texto: '✅ Entrada a tiempo', color: '#3ddc84',
                   detalle: 'El bono se perdió el ' + q.diaBonoPerdido + '.' + nota };
        }
        return { texto: '✅ Entrada a tiempo', color: '#3ddc84',
                 detalle: 'Apto para el bono de puntualidad.' + nota };
      }

      if (ret <= 30) {
        const extra = minAhora - limTol;
        const det = extra + ' min pasado el límite (' + fmtHora(limTol) + '). Aún no es retardo.' +
                    (q.bonoPerdido ? ' Bono perdido desde el ' + q.diaBonoPerdido + '.' : '');
        return { texto: '❌ Perdiste el bono', color: '#ef4444', detalle: det + nota };
      }

      const extraR = minAhora - limRet;
      const nRet = q.retardos + 1;
      const desc = _descuentoPorRetardos(nRet);
      let det = extraR + ' min pasado el límite (' + fmtHora(limRet) + ').';
      det += desc ? ' ⚡ Descuento: ' + desc + '.' : ' A ' + (3 - (nRet % 3)) + ' más: MEDIO DÍA.';
      return { texto: '❌ Retardo #' + nRet, color: '#ef4444', detalle: det };
    }
    case 'SALIDA_DESAYUNO':
      return { texto: '¡Provecho!', color: '#3ddc84',
               detalle: 'Tienes ' + DUR_DES + ' min · Regresa antes de las ' + fmtHora(minAhora + DUR_DES) };
    case 'REGRESO_DESAYUNO': {
      const sd = ultimaDe('SALIDA_DESAYUNO');
      if (!sd) return { texto: '🥐 Regreso de desayuno', color: '#3ddc84', detalle: '' };
      const dur = minAhora - sd.min;
      if (dur <= DUR_DES) return { texto: '✅ Regreso a tiempo', color: '#3ddc84',
                                   detalle: dur + ' de ' + DUR_DES + ' min.' };
      return { texto: '❌ Exceso de ' + (dur - DUR_DES) + ' min en desayuno', color: '#ef4444',
               detalle: dur + ' min de ' + DUR_DES + ' permitidos. El exceso se descuenta por hora completa.' };
    }
    case 'SALIDA_COMIDA':
      return { texto: '¡Provecho!', color: '#3ddc84',
               detalle: 'Tienes ' + DUR_COM + ' min · Regresa antes de las ' + fmtHora(minAhora + DUR_COM) };
    case 'REGRESO_COMIDA': {
      const sc = ultimaDe('SALIDA_COMIDA');
      if (!sc) return { texto: '🍽️ Regreso de comida', color: '#3ddc84', detalle: '' };
      const durC = minAhora - sc.min;
      if (durC <= DUR_COM) return { texto: '✅ Regreso a tiempo', color: '#3ddc84',
                                    detalle: durC + ' de ' + DUR_COM + ' min.' };
      return { texto: '❌ Exceso de ' + (durC - DUR_COM) + ' min en comida', color: '#ef4444',
               detalle: durC + ' min de ' + DUR_COM + ' permitidos. El exceso se descuenta por hora completa.' };
    }
    case 'SALIDA': {
      if (!turno) return { texto: '🏠 Salida registrada', color: '#3ddc84', detalle: '' };
      if (minAhora > turno.finMin) {
        const extra = minAhora - turno.finMin;
        return { texto: '⏱️ ' + extra + ' min de tiempo extra', color: '#fbbf24',
                 detalle: 'Tu salida era a las ' + fmtHora(turno.finMin) + '. Este tiempo no se paga.' };
      }
      if (minAhora < turno.finMin) {
        return { texto: '🏃 Saliste ' + (turno.finMin - minAhora) + ' min antes', color: '#fbbf24',
                 detalle: 'Tu salida es a las ' + fmtHora(turno.finMin) + '.' };
      }
      return { texto: '✅ Salida a tiempo', color: '#3ddc84', detalle: '' };
    }
    case 'FUERA_HORARIO': {
      if (turno && minAhora > turno.finMin) {
        return { texto: '⛔ Ya pasó tu hora de salida', color: '#ef4444',
                 detalle: 'Tu horario terminó a las ' + fmtHora(turno.finMin) + '. No hay nada que registrar a esta hora.' };
      }
      const desde = turno ? fmtHora(Math.max(0, turno.inicioMin - 120)) : '';
      return { texto: '🌙 Aún no es hora de checar', color: '#fbbf24',
               detalle: (turno ? 'Tu turno empieza a las ' + fmtHora(turno.inicioMin) + '. Puedes checar desde las ' + desde + '.' : 'Vuelve más cerca de tu horario.') };
    }
    default:
      return { texto: '➕ Registro extra', color: '#3ddc84', detalle: 'Checada adicional del día' };
  }
}

// ============================================================================
// TEST DE NOTIFICACIONES
// ============================================================================

function testPushEmpleado(pin) {
  try {
    const saRaw = _firebaseSA_();
    if (!saRaw) {
      return { ok: false, paso: 'CONFIG',
               message: '❌ Firebase no está configurado en este proyecto. Ejecuta configurarFirebase() desde el editor y pega el JSON del service account.' };
    }
    try { JSON.parse(saRaw); } catch (e) {
      return { ok: false, paso: 'CONFIG', message: '❌ El JSON del service account guardado está corrupto: ' + e.message };
    }

    const sheet = crearHojaPushTokens();
    const data = sheet.getDataRange().getValues();
    const tokens = [];
    for (let i = 1; i < data.length; i++) {
      if (_normId(data[i][0]) === _normId(pin)) {
        const tk = (data[i][3] || '').toString();
        if (tk && tokens.indexOf(tk) === -1) tokens.push(tk);
      }
    }
    if (tokens.length === 0) {
      return { ok: false, paso: 'TOKENS',
               message: '❌ Este PIN no tiene ningún dispositivo registrado. Activa las notificaciones desde el perfil primero.' };
    }

    const hora = Utilities.formatDate(new Date(), TIMEZONE, 'HH:mm:ss');
    const resultados = tokens.map(function(t) {
      return _enviarPushFCMDetallado(t, '🔔 Prueba de alertas · ' + hora,
        '¡Funciona! Si ves esto, tus notificaciones del Checador están activas.', '');
    });

    const okCount = resultados.filter(function(r) { return r.ok; }).length;
    if (okCount > 0) {
      return { ok: true, paso: 'ENVIADO',
               message: '✅ Notificación enviada a ' + okCount + ' de ' + tokens.length + ' dispositivo(s). Revisa tu celular AHORA.',
               dispositivos: tokens.length, enviados: okCount };
    }
    return { ok: false, paso: 'FCM',
             message: '❌ FCM rechazó el envío. HTTP ' + resultados[0].code + ' · ' + resultados[0].body,
             dispositivos: tokens.length };
  } catch (e) {
    return { ok: false, paso: 'EXCEPCION', message: '❌ ' + e.message };
  }
}

// ============================================================================
// CONFIG_TURNOS — ventanas y duraciones POR TURNO
// ============================================================================

var _cacheCfgTurnos = null;

function _hhmmAMin(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
  const m = v.toString().match(/(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}

function _leerConfigTurnos() {
  if (_cacheCfgTurnos) return _cacheCfgTurnos;
  const mapa = {};
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CONFIG_TURNOS');
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      const h = data[0].map(function(x) { return (x || '').toString().trim(); });
      const col = {};
      ['Turno','Entrada Min','Entrada Max','Tolerancia','Desayuno Min','Desayuno Max','Desayuno Regreso Min',
       'Comida Min','Comida Max','Comida Regreso Min','Salida Min'].forEach(function(c) { col[c] = h.indexOf(c); });
      for (let i = 1; i < data.length; i++) {
        const nombre = (data[i][col['Turno']] || '').toString().trim();
        if (!nombre) continue;
        mapa[nombre] = {
          entradaMin: _hhmmAMin(data[i][col['Entrada Min']]),
          entradaMax: _hhmmAMin(data[i][col['Entrada Max']]),
          tolerancia: parseFloat(data[i][col['Tolerancia']]) || 15,
          desMin:     _hhmmAMin(data[i][col['Desayuno Min']]),
          desMax:     _hhmmAMin(data[i][col['Desayuno Max']]),
          desDur:     parseFloat(data[i][col['Desayuno Regreso Min']]) || 20,
          comMin:     _hhmmAMin(data[i][col['Comida Min']]),
          comMax:     _hhmmAMin(data[i][col['Comida Max']]),
          comDur:     parseFloat(data[i][col['Comida Regreso Min']]) || 60,
          salidaMin:  _hhmmAMin(data[i][col['Salida Min']])
        };
      }
    }
  } catch (e) { Logger.log('⚠️ _leerConfigTurnos: ' + e.message); }
  _cacheCfgTurnos = mapa;
  return mapa;
}

function _cfgEmpleadoServ(idUsuario) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('TURNOS_DEFAULT');
    if (!sheet) return null;
    const data = sheet.getDataRange().getValues();
    const h = data[0];
    const iId = h.indexOf('Admin');
    const iTurnoNombre = h.indexOf('Turno');
    const iHorario = h.indexOf('TURNO');
    for (let i = 1; i < data.length; i++) {
      if (_normId(data[i][iId]) !== _normId(idUsuario)) continue;
      const nombreTurno = iTurnoNombre !== -1 ? (data[i][iTurnoNombre] || '').toString().trim() : '';
      const horario = iHorario !== -1 ? (data[i][iHorario] || '').toString() : '';
      const m = horario.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
      const cfgT = _leerConfigTurnos()[nombreTurno] || {};
      return {
        turnoNombre: nombreTurno,
        inicioMin: (m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : cfgT.entradaMin),
        finMin:    (m ? parseInt(m[3], 10) * 60 + parseInt(m[4], 10) : cfgT.salidaMin),
        tolerancia: cfgT.tolerancia || 15,
        desMin: cfgT.desMin, desMax: cfgT.desMax, desDur: cfgT.desDur || 20,
        comMin: cfgT.comMin, comMax: cfgT.comMax, comDur: cfgT.comDur || 60
      };
    }
  } catch (e) {}
  return null;
}

// ── DETECCIÓN POR HORA + ESTADO ────────────────────────────────────────────
// La hora del día manda: checar a las 14:59 (ventana de comida) sin registros
// es SALIDA_COMIDA, no "entrada".
function _detectarTipoPorHora(checadasPrevias, cfg, minAhora) {
  function tiene(t) { return checadasPrevias.some(function(c) { return c.tipo === t; }); }
  const ult = checadasPrevias.length ? checadasPrevias[checadasPrevias.length - 1] : null;

  // 1. Regresos pendientes: prioridad absoluta
  if (ult && ult.tipo === 'SALIDA_DESAYUNO') return 'REGRESO_DESAYUNO';
  if (ult && ult.tipo === 'SALIDA_COMIDA')   return 'REGRESO_COMIDA';

  const c = cfg || {};
  function enVentana(a, b) { return a != null && b != null && minAhora >= a && minAhora <= b; }

  // ⛔ El ciclo NO se da la vuelta: la entrada solo desde 2 h antes del turno,
  // y después de la salida sin jornada en curso no se registra nada.
  const entradaDesde = (c.inicioMin != null) ? c.inicioMin - 120 : null;
  if (!tiene('ENTRADA')) {
    if (c.finMin != null && minAhora > c.finMin) return 'FUERA_HORARIO';
    if (entradaDesde != null && minAhora < entradaDesde) return 'FUERA_HORARIO';
  }

  if (!tiene('SALIDA_COMIDA') && enVentana(c.comMin, c.comMax)) return 'SALIDA_COMIDA';
  if (!tiene('ENTRADA') && (c.comMin == null || minAhora < c.comMin)) return 'ENTRADA';
  if (!tiene('SALIDA_DESAYUNO') && enVentana(c.desMin, c.desMax)) return 'SALIDA_DESAYUNO';
  if (!tiene('SALIDA') && c.finMin != null && minAhora >= c.finMin) return 'SALIDA';

  if (!tiene('SALIDA') && c.finMin != null && minAhora < c.finMin &&
      tiene('ENTRADA') && (c.comMax == null || tiene('REGRESO_COMIDA') || minAhora > c.comMax)) {
    return 'SALIDA_TEMPRANA';
  }

  // Fallback por estado (fuera de toda ventana)
  if (!tiene('ENTRADA'))          return 'ENTRADA';
  if (!tiene('SALIDA_DESAYUNO') && (c.desMax == null || minAhora <= c.desMax)) return 'SALIDA_DESAYUNO';
  if (!tiene('SALIDA_COMIDA')   && (c.comMax == null || minAhora <= c.comMax)) return 'SALIDA_COMIDA';
  if (!tiene('SALIDA'))           return 'SALIDA';
  return 'EXTRA';
}

// ============================================================================
// DIAGNÓSTICO COMPLETO — panel del PIN 9999
// ============================================================================

function diagnosticoCompleto() {
  const d = { backendVersion: BACKEND_VERSION };
  try { d.deploymentUrl = ScriptApp.getService().getUrl(); } catch (e) { d.deploymentUrl = '?'; }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    d.spreadsheetNombre = ss.getName();
    d.spreadsheetId = ss.getId();
  } catch (e) { d.spreadsheetNombre = '❌ ' + e.message; }

  try {
    const saRaw = _firebaseSA_();
    if (!saRaw) {
      d.firebase = '❌ SIN CONFIGURAR — ejecuta configurarFirebase()';
    } else {
      const sa = JSON.parse(saRaw);
      d.firebase = '✅ ' + sa.client_email;
    }
  } catch (e) { d.firebase = '❌ JSON corrupto: ' + e.message; }

  try {
    const n = ScriptApp.getProjectTriggers().filter(function(t) {
      return t.getHandlerFunction() === 'revisarAlertas';
    }).length;
    d.trigger = n > 0 ? ('✅ activo (' + n + ')') : '❌ NO INSTALADO — ejecuta instalarTriggerAlertas';
    d.ventanaMotor = ALERTAS_HORA_INICIO + ':00 a ' + ALERTAS_HORA_FIN + ':00, días hábiles';
  } catch (e) { d.trigger = '❌ ' + e.message; }

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CHECADOR_CHOFERES');
    const hoy = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
    let filasHoy = 0;
    const ultimas = [];
    if (sheet && sheet.getLastRow() >= 3) {
      sheet.getRange(3, 1, sheet.getLastRow() - 2, 10).getValues().forEach(function(r) {
        if ((r[2] || '').toString() === hoy) {
          filasHoy++;
          ultimas.push((r[1] || '').toString().split(' ')[0] + ' ' + (r[3] || '') + ' ' + (r[9] || ''));
        }
      });
    }
    d.checadasHoy = filasHoy;
    d.ultimasHoy = ultimas.slice(-4);
  } catch (e) { d.checadasHoy = '❌ ' + e.message; }

  try {
    const st = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PUSH_TOKENS');
    d.dispositivosPush = st ? Math.max(0, st.getLastRow() - 1) : 0;
  } catch (e) { d.dispositivosPush = '?'; }
  try {
    const t2 = _leerConfigTurnos()['T2'] || {};
    d.duracionesT2 = 'desayuno ' + (t2.desDur || '?') + ' min · comida ' + (t2.comDur || '?') + ' min';
  } catch (e) { d.duracionesT2 = '?'; }

  d.horaServidor = Utilities.formatDate(new Date(), TIMEZONE, 'dd/MM HH:mm:ss');
  return d;
}

// ============================================================================
// LIMPIEZA TOTAL — botón 🧹 del panel de diagnóstico
// ============================================================================
// Borra checadas y marcas de alertas. CONSERVA los dispositivos vinculados
// y las preferencias de alertas.

function limpiarTodoChecador() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const resumen = {};

    const sheet = ss.getSheetByName('CHECADOR_CHOFERES');
    if (sheet && sheet.getLastRow() >= 3) {
      resumen.checadasBorradas = sheet.getLastRow() - 2;
      sheet.deleteRows(3, sheet.getLastRow() - 2);
    } else {
      resumen.checadasBorradas = 0;
    }

    const props = PropertiesService.getScriptProperties();
    const all = props.getProperties();
    let marcas = 0;
    for (var k in all) {
      if (k.indexOf('alerta_') === 0) { props.deleteProperty(k); marcas++; }
    }
    resumen.marcasAlertasBorradas = marcas;

    const sp = ss.getSheetByName('PREFS_ALERTAS');
    let dups = 0;
    if (sp && sp.getLastRow() > 1) {
      const data = sp.getDataRange().getValues();
      const vistos = {};
      for (let i = data.length - 1; i >= 1; i--) {
        const p = (data[i][0] || '').toString();
        if (!p) { sp.deleteRow(i + 1); continue; }
        if (vistos[p]) { sp.deleteRow(i + 1); dups++; }
        else vistos[p] = true;
      }
    }
    resumen.prefsDuplicadasBorradas = dups;
    resumen.pushTokensConservados = true;

    Logger.log('🧹 Limpieza total: ' + JSON.stringify(resumen));
    return { ok: true, resumen: resumen,
             message: '✅ Limpio: ' + resumen.checadasBorradas + ' checadas, ' +
                      marcas + ' marcas de alertas, ' + dups + ' prefs duplicadas. Dispositivos conservados.' };
  } catch (e) {
    return { ok: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// BONO Y RETARDOS DE LA QUINCENA
// ============================================================================
// Escala oficial (minutos de retraso vs hora de entrada del turno):
//   0                  → puntual
//   1..tolerancia (15) → dentro de tolerancia, bono a salvo
//   16..30             → PERDIÓ EL BONO (sin retardo)
//   31 o más           → RETARDO (el bono ya estaba perdido)
// Descuentos acumulados en la MISMA quincena:
//   3 retardos = medio día · 6 = un día · 9 = día y medio

function _rangoQuincena(fecha) {
  const d = fecha.getDate();
  const y = fecha.getFullYear(), m = fecha.getMonth();
  if (d <= 15) return { ini: new Date(y, m, 1), fin: new Date(y, m, 15) };
  return { ini: new Date(y, m, 16), fin: new Date(y, m + 1, 0) };
}

function _descuentoPorRetardos(n) {
  if (n < 3) return '';
  const dias = Math.floor(n / 3) * 0.5;
  if (dias === 0.5) return 'MEDIO DÍA';
  if (dias === 1)   return 'UN DÍA';
  if (dias === 1.5) return 'DÍA Y MEDIO';
  return dias + ' DÍAS';
}

function _analisisEntradaQuincena(idUsuario, cfg, fechaHoyStr) {
  const res = { retardos: 0, bonoPerdido: false, diaBonoPerdido: '' };
  try {
    if (!cfg || cfg.inicioMin == null) return res;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CHECADOR_CHOFERES');
    if (!sheet || sheet.getLastRow() < 3) return res;
    const r = _rangoQuincena(new Date());
    const iniStr = Utilities.formatDate(r.ini, TIMEZONE, 'yyyy-MM-dd');
    const finStr = Utilities.formatDate(r.fin, TIMEZONE, 'yyyy-MM-dd');
    const tol = cfg.tolerancia || 15;
    const idN = _normId(idUsuario);

    sheet.getRange(3, 1, sheet.getLastRow() - 2, 10).getValues().forEach(function(row) {
      if (_normId(row[0]) !== idN) return;
      if ((row[9] || '').toString().trim().toUpperCase() !== 'ENTRADA') return;
      const f = (row[2] || '').toString();
      if (f < iniStr || f > finStr) return;
      if (f === fechaHoyStr) return; // hoy se evalúa aparte
      const hm = (row[3] || '').toString().match(/(\d{1,2}):(\d{2})/);
      if (!hm) return;
      const min = parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10);
      const ret = min - cfg.inicioMin;
      if (ret > tol) {
        if (!res.bonoPerdido) { res.bonoPerdido = true; res.diaBonoPerdido = f.substring(8, 10) + '/' + f.substring(5, 7); }
        if (ret > 30) res.retardos++;
      }
    });
  } catch (e) { Logger.log('⚠️ _analisisEntradaQuincena: ' + e.message); }
  return res;
}

// ============================================================================
// DISPOSITIVOS VINCULADOS
// ============================================================================

function _contarDispositivos(pin) {
  try {
    const sheet = crearHojaPushTokens();
    const data = sheet.getDataRange().getValues();
    let n = 0;
    for (let i = 1; i < data.length; i++) {
      if (_normId(data[i][0]) === _normId(pin) && (data[i][3] || '')) n++;
    }
    return n;
  } catch (e) { return 0; }
}

function getMisDispositivos(pin, tokenActual) {
  try {
    const sheet = crearHojaPushTokens();
    const data = sheet.getDataRange().getValues();
    const lista = [];
    for (let i = 1; i < data.length; i++) {
      if (_normId(data[i][0]) !== _normId(pin)) continue;
      const tk = (data[i][3] || '').toString();
      if (!tk) continue;
      lista.push({
        token: tk,
        dispositivo: (data[i][4] || 'Dispositivo').toString(),
        registrado: (data[i][5] || '').toString(),
        esActual: !!(tokenActual && tk === tokenActual)
      });
    }
    return { ok: true, dispositivos: lista };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function desvincularDispositivo(pin, token) {
  try {
    const sheet = crearHojaPushTokens();
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (_normId(data[i][0]) === _normId(pin) && (data[i][3] || '').toString() === token) {
        sheet.deleteRow(i + 1);
        return { ok: true, message: 'Dispositivo desvinculado' };
      }
    }
    return { ok: false, message: 'No se encontró ese dispositivo' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// ============================================================================
// AUSENCIAS — vacaciones / enfermedad / evento
// ============================================================================

function crearHojaAusencias() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('AUSENCIAS');
  if (sheet) return sheet;
  sheet = ss.insertSheet('AUSENCIAS');
  sheet.getRange(1, 1, 1, 6).setValues([['PIN', 'ID Usuario', 'Nombre', 'Fecha', 'Tipo', 'Registrado']])
    .setBackground('#3f51b5').setFontColor('#fff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  return sheet;
}

var _AUSENCIA_TIPOS = {
  VACACIONES: { emoji: '🌴', label: 'Vacaciones' },
  ENFERMEDAD: { emoji: '🤒', label: 'Incapacidad' },
  EVENTO:     { emoji: '📅', label: 'Evento' }
};

function registrarAusencia(pin, tipo) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const usuarios = getTodosLosUsuarios();
    let emp = null;
    (usuarios.usuarios || []).forEach(function(u) { if (_normId(u.pin) === _normId(pin)) emp = u; });
    if (!emp) return { ok: false, message: 'PIN no encontrado' };

    const t = (tipo || '').toString().toUpperCase();
    if (t && !_AUSENCIA_TIPOS[t]) return { ok: false, message: 'Tipo inválido' };

    const sheet = crearHojaAusencias();
    const hoy = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
    const data = sheet.getDataRange().getValues();

    for (let i = data.length - 1; i >= 1; i--) {
      if (_normId(data[i][0]) === _normId(pin) && (data[i][3] || '').toString() === hoy) {
        sheet.deleteRow(i + 1);
      }
    }
    if (!t) return { ok: true, tipo: '', message: 'Día normal restablecido' };

    sheet.appendRow([emp.pin, emp.idUsuario, emp.nombre, hoy, t,
                     Utilities.formatDate(new Date(), TIMEZONE, 'dd/MM/yyyy HH:mm')]);

    // Silenciar también las alertas ya marcadas de hoy
    const props = PropertiesService.getScriptProperties();
    const all = props.getProperties();
    for (var k in all) {
      if (k.indexOf('alerta_' + hoy + '|' + _normId(emp.idUsuario) + '|') === 0) props.deleteProperty(k);
    }
    return { ok: true, tipo: t, message: _AUSENCIA_TIPOS[t].label + ' registrado. No recibirás alertas hoy.' };
  } catch (e) {
    return { ok: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

function _ausenciasDe(idUsuario, iniStr, finStr) {
  const mapa = {};
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('AUSENCIAS');
    if (!sheet || sheet.getLastRow() < 2) return mapa;
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
    const idN = _normId(idUsuario);
    data.forEach(function(r) {
      if (_normId(r[1]) !== idN) return;
      const f = (r[3] || '').toString();
      if (iniStr && (f < iniStr || f > finStr)) return;
      mapa[f] = (r[4] || '').toString().toUpperCase();
    });
  } catch (e) {}
  return mapa;
}

// ============================================================================
// EXCEPCIONES DEL DÍA
// ============================================================================
// Un día marcado como excepción no genera alertas ni cuenta como falta.
// FESTIVO se guarda como global (PIN 'TODOS') y aplica a toda la empresa.

var _EXC_TIPOS = {
  VACACIONES:  { emoji: '🏖️', label: 'Vacaciones' },
  ENFERMEDAD:  { emoji: '🤒', label: 'Incapacidad' },
  EVENTO:      { emoji: '🎉', label: 'Evento' },
  FESTIVO:     { emoji: '📅', label: 'Día festivo' }
};

function crearHojaExcepciones() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('EXCEPCIONES_DIA');
  if (sheet) return sheet;
  sheet = ss.insertSheet('EXCEPCIONES_DIA');
  sheet.getRange(1, 1, 1, 6).setValues([['Fecha', 'PIN', 'ID Usuario', 'Nombre', 'Tipo', 'Registrado']])
    .setBackground('#3f51b5').setFontColor('#fff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  return sheet;
}

function _leerExcepciones() {
  const mapa = {};
  try {
    const sheet = crearHojaExcepciones();
    if (sheet.getLastRow() < 2) return mapa;
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues().forEach(function(r) {
      const f = (r[0] instanceof Date)
        ? Utilities.formatDate(r[0], TIMEZONE, 'yyyy-MM-dd')
        : (r[0] || '').toString().trim();
      const p = (r[1] || '').toString().trim().toUpperCase();
      const t = (r[4] || '').toString().trim().toUpperCase();
      if (f && p && t) mapa[f + '|' + (p === 'TODOS' ? 'TODOS' : _normId(p))] = t;
    });
  } catch (e) {}
  return mapa;
}

function _excepcionDe(mapa, fecha, pin) {
  return mapa[fecha + '|TODOS'] || mapa[fecha + '|' + _normId(pin)] || '';
}

function guardarExcepcionDia(pin, tipo) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    tipo = (tipo || '').toString().trim().toUpperCase();
    if (!_EXC_TIPOS[tipo]) return { ok: false, message: 'Tipo inválido' };

    const usuarios = getTodosLosUsuarios();
    let emp = null;
    (usuarios.usuarios || []).forEach(function(u) { if (_normId(u.pin) === _normId(pin)) emp = u; });
    if (!emp) return { ok: false, message: 'PIN no encontrado' };

    const hoy = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
    const clavePin = (tipo === 'FESTIVO') ? 'TODOS' : emp.pin.toString();
    const sheet = crearHojaExcepciones();
    const data = sheet.getDataRange().getValues();

    for (let i = data.length - 1; i >= 1; i--) {
      const f = (data[i][0] instanceof Date)
        ? Utilities.formatDate(data[i][0], TIMEZONE, 'yyyy-MM-dd')
        : (data[i][0] || '').toString().trim();
      const p = (data[i][1] || '').toString().trim().toUpperCase();
      const mismaPersona = (clavePin === 'TODOS') ? (p === 'TODOS') : (_normId(p) === _normId(clavePin));
      if (f === hoy && mismaPersona) sheet.deleteRow(i + 1);
    }
    sheet.appendRow([hoy, clavePin, emp.idUsuario, (tipo === 'FESTIVO' ? 'TODOS' : emp.nombre), tipo,
                     Utilities.formatDate(new Date(), TIMEZONE, 'dd/MM/yyyy HH:mm')]);
    return { ok: true, tipo: tipo,
             message: _EXC_TIPOS[tipo].emoji + ' ' + _EXC_TIPOS[tipo].label + ' registrado. Hoy no habrá alertas.' };
  } catch (e) {
    return { ok: false, message: e.message };
  } finally { lock.releaseLock(); }
}

function quitarExcepcionDia(pin) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoy = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
    const sheet = crearHojaExcepciones();
    const data = sheet.getDataRange().getValues();
    let n = 0;
    for (let i = data.length - 1; i >= 1; i--) {
      const f = (data[i][0] instanceof Date)
        ? Utilities.formatDate(data[i][0], TIMEZONE, 'yyyy-MM-dd')
        : (data[i][0] || '').toString().trim();
      const p = (data[i][1] || '').toString().trim().toUpperCase();
      if (f === hoy && (_normId(p) === _normId(pin) || p === 'TODOS')) { sheet.deleteRow(i + 1); n++; }
    }
    return { ok: true, message: n ? 'Excepción quitada. Las alertas vuelven a estar activas.' : 'No había excepción hoy.' };
  } catch (e) {
    return { ok: false, message: e.message };
  } finally { lock.releaseLock(); }
}

function getExcepcionHoy(pin) {
  const hoy = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  const mapa = _leerExcepciones();
  return { ok: true, tipo: _excepcionDe(mapa, hoy, pin), global: !!mapa[hoy + '|TODOS'] };
}

// ============================================================================
// HISTORIAL POR QUINCENA
// ============================================================================
// offset 0 = quincena en curso, -1 = la anterior, etc.
// Los días 16-fin se ajustan solos al mes (28, 29, 30 o 31).
// Sábados y domingos NO cuentan como falta.
//
// NOTA: esta función y _quincenaPorOffset estaban DUPLICADAS en el archivo
// anterior. En Apps Script gana la última definición, así que la primera era
// código muerto. Se conservó esta, que es la que de verdad corría.

function _quincenaPorOffset(offset) {
  const hoy = new Date();
  let y = hoy.getFullYear(), m = hoy.getMonth();
  let seg = hoy.getDate() > 15; // true = segunda quincena
  let n = -(offset || 0);
  while (n > 0) { if (seg) seg = false; else { seg = true; m--; if (m < 0) { m = 11; y--; } } n--; }
  const ini = seg ? new Date(y, m, 16) : new Date(y, m, 1);
  const fin = seg ? new Date(y, m + 1, 0) : new Date(y, m, 15); // día 0 del mes siguiente = último día
  return { ini: ini, fin: fin };
}

function getHistorialQuincena(pin, offset) {
  try {
    const usuarios = getTodosLosUsuarios();
    let emp = null;
    (usuarios.usuarios || []).forEach(function(u) { if (_normId(u.pin) === _normId(pin)) emp = u; });
    if (!emp) return { ok: false, message: 'PIN no encontrado' };

    const q = _quincenaPorOffset(offset || 0);
    const iniStr = Utilities.formatDate(q.ini, TIMEZONE, 'yyyy-MM-dd');
    const finStr = Utilities.formatDate(q.fin, TIMEZONE, 'yyyy-MM-dd');
    const hoyStr = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
    const cfg = _cfgEmpleadoServ(emp.idUsuario) || {};
    const tol = cfg.tolerancia || 15;
    const excs = _leerExcepciones();

    const porDia = {};
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CHECADOR_CHOFERES');
    if (sheet && sheet.getLastRow() >= 3) {
      const idN = _normId(emp.idUsuario);
      sheet.getRange(3, 1, sheet.getLastRow() - 2, 10).getValues().forEach(function(r) {
        if (_normId(r[0]) !== idN) return;
        const f = (r[2] || '').toString();
        if (f < iniStr || f > finStr) return;
        if (!porDia[f]) porDia[f] = [];
        porDia[f].push({ tipo: (r[9] || '').toString().toUpperCase(), hora: (r[3] || '').toString() });
      });
    }

    const dias = [];
    const resumen = { retardos: 0, faltas: 0, bonoPerdido: false, diaBonoPerdido: '' };
    for (let d = new Date(q.fin); d >= q.ini; d.setDate(d.getDate() - 1)) {
      const f = Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd');
      if (f > hoyStr) continue;
      const finde = (d.getDay() === 0 || d.getDay() === 6);
      const exc = _excepcionDe(excs, f, emp.pin);
      const items = (porDia[f] || []).sort(function(a, b) { return a.hora < b.hora ? -1 : 1; });

      let minTarde = null, retardo = false, perdioBono = false;
      const ent = items.filter(function(c) { return c.tipo === 'ENTRADA'; })[0];
      if (ent && cfg.inicioMin != null) {
        const hm = ent.hora.match(/(\d{1,2}):(\d{2})/);
        if (hm) {
          const min = parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10);
          minTarde = min - cfg.inicioMin;
          if (minTarde > tol) {
            perdioBono = true;
            if (!resumen.bonoPerdido) { resumen.bonoPerdido = true; resumen.diaBonoPerdido = f; }
          }
          if (minTarde > 30) { retardo = true; resumen.retardos++; }
        }
      }
      const falta = !finde && !exc && items.length === 0;
      if (falta) resumen.faltas++;

      dias.push({ fecha: f, finde: finde, excepcion: exc, checadas: items,
                  retardo: retardo, perdioBono: perdioBono, falta: falta, minTarde: minTarde });
    }

    resumen.descuento = _descuentoPorRetardos(resumen.retardos);
    return { ok: true, inicio: iniStr, fin: finStr, offset: offset || 0,
             esActual: (offset || 0) === 0, dias: dias, resumen: resumen };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// ============================================================================
// DIAGNÓSTICO DE ALERTAS — "¿por qué no me llega nada?"
// ============================================================================

function diagnosticoAlertas(pin) {
  try {
    const usuarios = getTodosLosUsuarios();
    let emp = null;
    (usuarios.usuarios || []).forEach(function(u) { if (_normId(u.pin) === _normId(pin)) emp = u; });
    if (!emp) return { ok: false, message: 'PIN no encontrado' };

    const d = [];
    const ahora = new Date();
    const hoy = Utilities.formatDate(ahora, TIMEZONE, 'yyyy-MM-dd');
    const hAct = parseInt(Utilities.formatDate(ahora, TIMEZONE, 'H'), 10);
    const minAhora = hAct * 60 + parseInt(Utilities.formatDate(ahora, TIMEZONE, 'm'), 10);

    const cfg = (getConfigAlertas().config) || {};
    d.push(((cfg.alertas_activas || 'SI') === 'SI' ? '✅' : '❌') +
           ' Interruptor general (CONFIG_ALERTAS): ' + (cfg.alertas_activas || 'SI'));

    const dentroVentana = (hAct >= ALERTAS_HORA_INICIO && hAct < ALERTAS_HORA_FIN);
    d.push((dentroVentana ? '✅' : '❌') + ' Ventana del motor (' + ALERTAS_HORA_INICIO + ':00–' +
           ALERTAS_HORA_FIN + ':00): ' + (dentroVentana ? 'dentro' : 'FUERA, el motor no revisa a esta hora'));

    const nT = ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'revisarAlertas'; }).length;
    d.push((nT ? '✅' : '❌') + ' Motor corriendo cada minuto: ' + (nT ? 'sí' : 'NO — ejecuta instalarTriggerAlertas'));

    d.push((_firebaseSA_() ? '✅' : '❌') + ' Firebase configurado: ' +
           (_firebaseSA_() ? 'sí' : 'NO — ejecuta configurarFirebase()'));

    const dow = parseInt(Utilities.formatDate(ahora, TIMEZONE, 'u'), 10);
    d.push((dow >= 6 ? '❌' : '✅') + ' Día hábil: ' + (dow >= 6 ? 'NO (fin de semana, sin alertas)' : 'sí'));

    const excs = _leerExcepciones();
    const exc = _excepcionDe(excs, hoy, emp.pin);
    d.push((exc ? '❌' : '✅') + ' Excepción hoy: ' + (exc ? exc + ' (por eso no hay alertas)' : 'ninguna'));

    const prefs = (getPrefsAlertas(emp.pin).prefs) || {};
    const off = Object.keys(prefs).filter(function(k) { return prefs[k] === 'NO'; });
    d.push((off.length ? '⚠️' : '✅') + ' Tus alertas: ' + (off.length ? 'APAGADAS → ' + off.join(', ') : 'todas encendidas'));

    const st = crearHojaPushTokens();
    let disp = 0;
    if (st.getLastRow() > 1) {
      st.getRange(2, 1, st.getLastRow() - 1, 5).getValues().forEach(function(r) {
        if (_normId(r[0]) === _normId(emp.pin)) disp++;
      });
    }
    d.push((disp ? '✅' : '❌') + ' Dispositivos vinculados: ' + disp);

    const cfgT = _cfgEmpleadoServ(emp.idUsuario) || {};
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CHECADOR_CHOFERES');
    const previas = [];
    if (sheet && sheet.getLastRow() >= 3) {
      sheet.getRange(3, 1, sheet.getLastRow() - 2, 10).getValues().forEach(function(r) {
        if (_normId(r[0]) !== _normId(emp.idUsuario)) return;
        if ((r[2] || '').toString() !== hoy) return;
        const hm = (r[3] || '').toString().match(/(\d{1,2}):(\d{2})/);
        previas.push({ tipo: (r[9] || '').toString().toUpperCase(),
                       min: hm ? parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10) : 0 });
      });
    }
    previas.sort(function(a, b) { return a.min - b.min; });
    const ult = previas.length ? previas[previas.length - 1] : null;
    d.push('📋 Checadas hoy: ' + (previas.length ? previas.map(function(c) { return c.tipo; }).join(' → ') : 'ninguna'));

    if (ult && (ult.tipo === 'SALIDA_DESAYUNO' || ult.tipo === 'SALIDA_COMIDA')) {
      const esDes = ult.tipo === 'SALIDA_DESAYUNO';
      const dur = esDes ? (cfgT.desDur || cfg.duracion_desayuno_min || 20) : (cfgT.comDur || cfg.duracion_comida_min || 60);
      const aviso = esDes ? (cfg.aviso_desayuno_min_antes || 5) : (cfg.aviso_comida_min_antes || 10);
      const trans = minAhora - ult.min;
      const avisoEn = ult.min + dur - aviso;
      d.push('⏱️ ' + (esDes ? 'Desayuno' : 'Comida') + ' iniciado a las ' + _minAHora(ult.min) +
             ' · límite ' + dur + ' min (' + _minAHora(ult.min + dur) + ')');
      d.push('🔔 El aviso se manda a las ' + _minAHora(avisoEn) +
             (trans >= dur - aviso ? ' — ya debió llegar' : ' — faltan ' + (avisoEn - minAhora) + ' min'));
    } else if (ult) {
      d.push('ℹ️ Tu última checada es ' + ult.tipo + ': no hay descanso en curso.');
    }

    const turnoD = (cfgT.inicioMin != null && cfgT.finMin != null)
      ? { inicioMin: cfgT.inicioMin, finMin: cfgT.finMin } : _obtenerTurnoServ(emp.idUsuario);
    if (turnoD) {
      const tieneEnt = previas.some(function(c) { return c.tipo === 'ENTRADA'; });
      const tieneSal = previas.some(function(c) { return c.tipo === 'SALIDA'; });
      d.push('🏠 Tu salida hoy: ' + _minAHora(turnoD.finMin) +
             ' · entrada registrada: ' + (tieneEnt ? 'sí' : '❌ NO (sin entrada NO hay alertas de salida)') +
             ' · salida checada: ' + (tieneSal ? 'sí (ya no hay alertas)' : 'no'));
      if (tieneEnt && !tieneSal) {
        const avisoSal = (cfg.aviso_salida_min_antes || 5);
        const marcaAviso = PropertiesService.getScriptProperties()
          .getProperty('alerta_' + hoy + '|' + emp.idUsuario + '|salida_aviso@' + turnoD.finMin);
        d.push('🔔 Aviso previo (' + _minAHora(turnoD.finMin - avisoSal) + '): ' +
               (marcaAviso ? 'ya enviado ✅'
                           : (minAhora < turnoD.finMin - avisoSal ? 'pendiente — llegará a esa hora'
                                                                  : '⚠️ no enviado y la ventana ya pasó (revisa Ejecuciones)')));
      }
    } else {
      d.push('❌ Sin turno detectado en TURNOS_DEFAULT — sin turno no hay alertas de salida.');
    }
    d.push('🕐 Hora del servidor: ' + Utilities.formatDate(ahora, TIMEZONE, 'HH:mm:ss'));

    return { ok: true, lineas: d };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// ============================================================================
// SALIDA REMOTA — desde la notificación ("ando fuera de la oficina")
// ============================================================================

function checadaSalidaRemota(idUsuario) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!idUsuario) return { ok: false, message: 'ID requerido' };
    const usuarios = getTodosLosUsuarios();
    let emp = null;
    (usuarios.usuarios || []).forEach(function(u) {
      if (_normId(u.idUsuario) === _normId(idUsuario)) emp = u;
    });
    if (!emp) return { ok: false, message: 'Empleado no encontrado' };

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CHECADOR_CHOFERES');
    if (!sheet) return { ok: false, message: 'Hoja no encontrada' };

    const hoy = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
    const hora = Utilities.formatDate(new Date(), TIMEZONE, 'HH:mm:ss');

    if (sheet.getLastRow() >= 3) {
      const data = sheet.getRange(3, 1, sheet.getLastRow() - 2, 10).getValues();
      for (let i = 0; i < data.length; i++) {
        if (_normId(data[i][0]) === _normId(idUsuario) &&
            (data[i][2] || '').toString() === hoy &&
            (data[i][9] || '').toString().toUpperCase() === 'SALIDA') {
          return { ok: true, yaExistia: true,
                   message: 'Tu salida de hoy ya estaba registrada (' +
                            (data[i][3] || '').toString().substring(0, 5) + ').' };
        }
      }
    }

    const fila = sheet.getLastRow() + 1;
    sheet.getRange(fila, 1, 1, 10).setValues([[
      emp.idUsuario, emp.nombre, hoy, hora, new Date().toISOString(),
      '', '', 'REMOTA', 'REM-' + Date.now(), 'SALIDA'
    ]]);
    Logger.log('🏠 Salida remota: ' + emp.nombre + ' ' + hora);
    return { ok: true, hora: hora.substring(0, 5), nombre: emp.nombre,
             message: 'Salida registrada a las ' + hora.substring(0, 5) +
                      ' (remota). Ya no recibirás más avisos hoy.' };
  } catch (e) {
    return { ok: false, message: e.message };
  } finally { lock.releaseLock(); }
}
