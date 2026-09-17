/**
 * Killers.gs — Site Sheet
 *
 * Baja los Killers / Ofertas especiales a la hoja "Killers", con su fecha de
 * inicio y de termino. De ahi los toma wmNuevoCambio() opcion 2 para generar
 * el archivo de Walmart.
 *
 * LA RUTA YA SE CONOCE (capturada del site el 17/09/2026):
 *
 *     GET https://electronicsmexico.site/walmart/killers/api/data
 *
 * Ya no hace falta descubrirla. killersDescubrir() se queda por si el site
 * cambia algun dia, pero no es parte del uso normal.
 *
 * El JSON trae DOS listas y aqui solo interesa una:
 *   activos     los killers vivos          <- esta es la que se escribe
 *   propuestas  el catalogo con min/max    <- candidatos, no son killers
 *
 * Eso importa: `propuestas` es diez veces mas grande, asi que el metodo de
 * "agarrar el arreglo mas grande" elegia el equivocado y la hoja salia con
 * candidatos en vez de killers. Aqui se pide `activos` por nombre.
 *
 * OJO CON LA ANTIGUEDAD: los killers los manda la extension de Chrome desde
 * el seller center, no una API. Si nadie la corre, el endpoint sigue
 * contestando 200 pero con la foto vieja. El site dice de cuando es en
 * `activos_edad_h`, y aqui se avisa cuando pasa de un dia.
 *
 * Es autonomo: lee el token y la cookie de Script Properties. Si Api.gs esta
 * cargado, reusa su renovacion de cookie.
 *
 * Uso normal:  killersBajar()
 */

var K_SITE    = 'https://electronicsmexico.site';
var K_PAGINA  = '/walmart/killers';
var K_HOJA    = 'Killers';

/** La ruta real. Si no hay nada guardado en Properties, se usa esta. */
var K_RUTA_DEFAULT   = '/walmart/killers/api/data';
var K_METODO_DEFAULT = 'get';

/** A partir de cuantas horas se considera vieja la tanda. */
var K_EDAD_AVISO_H = 24;

var K_PROP = {
  TOKEN:  'SITE_API_TOKEN',
  COOKIE: 'SITE_SESSION_COOKIE',
  RUTA:   'KILLERS_RUTA',
  METODO: 'KILLERS_METODO',
  MODO:   'KILLERS_AUTH',
  SELLO:  'KILLERS_ULTIMO_SELLO',
  DIA:    'KILLERS_ULTIMO_DIA'
};

/**
 * Los dias del mes en que se bajan solos. Fuera de estos, el boton del menu.
 *
 * No se bajan mas seguido a proposito: la fuente solo cambia cuando alguien
 * corre la extension de Chrome en el seller center. Un trigger cada hora
 * traeria las mismas 135 filas todo el dia y gastaria del presupuesto de
 * triggers sin traer un solo dato nuevo.
 *
 * El cierre de mes NO va como [30, 31]: febrero no tiene ninguno de los dos
 * y se quedaria sin corrida. Va como "ultimo dia del mes", que acierta
 * siempre — 28, 29, 30 o 31 segun toque.
 */
var K_DIAS_PROGRAMADOS = [1, 10, 15, 16, 20, 25];

/**
 * Como se autentica esta ruta. No todas las rutas del site aceptan lo mismo:
 * /stock-odoo-data va con X-API-Key, pero /walmart/killers es de la app con
 * sesion. Mandar el token donde no lo esperan puede dar 401 aunque la cookie
 * sea buena, porque el servidor valida la llave primero y la rechaza.
 *
 *   ambos   token + cookie   (lo de siempre)
 *   cookie  solo la cookie
 *   token   solo el token
 *   nada    sin credencial   (por si la ruta es publica)
 *
 * killersProbarCredenciales() las prueba todas y guarda la que funcione.
 */
var K_MODO_DEFAULT = 'ambos';

/**
 * Juegos de encabezados que se prueban SOLOS cuando el site rechaza.
 *
 * Existe porque el navegador entra a esta ruta sin problema y Apps Script no,
 * y la diferencia esta en los encabezados, no en la cookie. Muchos backends
 * cortan por User-Agent raro, o exigen el Referer de la pagina que hace el
 * fetch. Adivinar cual es de esos pasa el trabajo al usuario; probarlos todos
 * cuesta unas llamadas UNA vez y despues se queda guardado el que sirvio.
 *
 * Van del mas parecido a un navegador al mas escueto.
 */
var K_UA_NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
                     'AppleWebKit/537.36 (KHTML, like Gecko) ' +
                     'Chrome/140.0.0.0 Safari/537.36';

var K_PERFILES = [
  { nombre: 'navegador+xhr',
    ua: K_UA_NAVEGADOR, referer: true,  xhr: true,
    accept: 'application/json, text/plain, */*' },
  { nombre: 'navegador',
    ua: K_UA_NAVEGADOR, referer: true,  xhr: false,
    accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8' },
  { nombre: 'navegador-sin-referer',
    ua: K_UA_NAVEGADOR, referer: false, xhr: true,
    accept: 'application/json, text/plain, */*' },
  { nombre: 'sitesheet',
    ua: 'Mozilla/5.0 (compatible; SiteSheet/1.0)', referer: false, xhr: true,
    accept: 'application/json, text/html;q=0.8' }
];

/** Donde se recuerda el perfil que si funciono. */
var K_PROP_PERFIL = 'KILLERS_PERFIL';

var K_CANDIDATAS = [
  '/walmart/killers/api/data',
  '/walmart/killers/api/lista',
  '/walmart/killers/api/activos',
  '/walmart/killers/data',
  '/walmart/killers/json',
  '/walmart/killers-data',
  '/walmart/api/killers',
  '/walmart/killers/api'
];

/**
 * Las columnas de la hoja y de que campo del JSON sale cada una.
 *
 * Los nombres SKU, TITULO, TERMINA y NOS PAGAN no se cambian: WalmartPrecios.gs
 * los busca por fragmento ('sku', 'titulo', 'termina', 'pagan') para armar el
 * archivo de Walmart. Si se renombran, esa parte deja de encontrarlos.
 *
 *   [encabezado, campo del JSON, tipo]
 *   tipo: '' texto | '$' numero | 'd' fecha | '%' porcentaje | 'b' si/no
 */
var K_MAPA = [
  ['SKU',             'sku',            ''],
  ['SKU BASE',        'sku_base',       ''],
  ['TITULO',          'titulo',         ''],
  ['PUBLICADO',       'actual',         '$'],
  ['CUPON',           'cupon',          '$'],
  ['NOS PAGAN',       'recibimos',      '$'],
  ['NEGOCIADO',       'negociado',      '$'],
  ['COMISION KILLER', 'com_killer',     '%'],
  ['COMISION MSI',    'com_msi',        '%'],
  ['INICIA',          'ini',            'd'],
  ['TERMINA',         'fin',            'd'],
  ['DIAS',            'dias_restantes', '$'],
  ['POR VENCER',      'por_vencer',     'b'],
  ['SOLO WFS',        'solo_wfs',       '']
];

/* ================================================================== */
/*  Bajada                                                             */
/* ================================================================== */

function killersBajar() {
  var ss = SpreadsheetApp.getActive();
  var r = kTraer_();
  var lista = kListaActivos_(r.json);

  if (!lista.length) {
    throw new Error('El site contesto bien pero sin killers activos.\n\n' +
                    'Revisa que la extension de Chrome haya corrido, o corre ' +
                    'killersVerEstructura() para ver que trae la respuesta.');
  }

  var filas = lista.map(function (reg) {
    return K_MAPA.map(function (c) { return kValor_(reg[c[1]], c[2]); });
  });

  kEscribirHoja_(ss, filas, r.json);

  var ahora = new Date();
  var vig = 0, porVencer = 0;
  var iFin = kIndice_('TERMINA'), iPV = kIndice_('POR VENCER');
  filas.forEach(function (f) {
    if (f[iFin] instanceof Date && f[iFin] > ahora) vig++;
    if (f[iPV] === 'SI') porVencer++;
  });

  var msg = filas.length + ' killers en la hoja "' + K_HOJA + '".\n\n' +
    'Vigentes:            ' + vig + '\n' +
    'Por vencer (<=3 d):  ' + porVencer + '\n\n' +
    kTextoEdad_(r.json);

  // Los campos que el site dejo de mandar se ven aqui, antes de que la hoja
  // salga con columnas en blanco y nadie sepa por que.
  var faltan = kCamposQueFaltan_(lista[0]);
  if (faltan.length) {
    msg += '\n\nEl site ya no manda estos campos: ' + faltan.join(', ') +
           '\nEsas columnas van a salir vacias. Corre killersVerEstructura().';
  }

  kAviso_('Killers', msg);
  return msg;
}

/* ================================================================== */
/*  Corrida automatica                                                 */
/* ================================================================== */

/**
 * Lo que dispara el trigger. Corre TODOS los dias pero solo trabaja en los
 * dias de K_DIAS_PROGRAMADOS y el ultimo del mes; el resto sale en un
 * instante sin gastar nada.
 *
 * Ademas compara el sello de la tanda contra el de la ultima bajada: asi el
 * Log dice si hubo killers nuevos o si es la misma foto, que es lo unico que
 * de verdad hay que saber sin abrir la hoja.
 */
function killersProgramado() {
  var hoy = new Date();
  if (!kTocaHoy_(hoy)) return 'Hoy no toca (dia ' + hoy.getDate() + ').';

  // Dos corridas el mismo dia no aportan nada: la fuente no cambio.
  var props = PropertiesService.getScriptProperties();
  var clave = Utilities.formatDate(hoy, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (props.getProperty(K_PROP.DIA) === clave) return 'Ya se bajo hoy.';

  var antes = props.getProperty(K_PROP.SELLO) || '';

  try { logStart_('KILLERS', 'Bajada programada'); } catch (e) {}

  var res;
  try {
    res = killersBajar();
  } catch (e) {
    try { logErr_('KILLERS', 'Fallo la bajada programada', { error: e.message }); flushLog_(); } catch (e2) {}
    throw e;
  }

  props.setProperty(K_PROP.DIA, clave);

  var ahoraSello = kSelloActual_();
  if (ahoraSello) props.setProperty(K_PROP.SELLO, ahoraSello);

  try {
    if (antes && ahoraSello && antes !== ahoraSello) {
      logOk_('KILLERS', 'TANDA NUEVA: la extension corrio. Sello ' + ahoraSello);
    } else if (antes && ahoraSello === antes) {
      logWarn_('KILLERS', 'Misma tanda de siempre (' + ahoraSello + '). ' +
                          'Nadie ha corrido la extension.');
    }
    logFinish_('KILLERS', 'Bajada programada');
    flushLog_();
  } catch (e) {}

  return res;
}

/** Los dias de la lista, mas el ultimo del mes sea cual sea. */
function kTocaHoy_(d) {
  var dia = d.getDate();
  if (K_DIAS_PROGRAMADOS.indexOf(dia) >= 0) return true;
  var ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return dia === ultimo;
}

/** El sello de la tanda que quedo escrito en la hoja. */
function kSelloActual_() {
  try {
    var h = SpreadsheetApp.getActive().getSheetByName(K_HOJA);
    if (!h) return '';
    var nota = String(h.getRange(1, 1).getNote() || '');
    var m = nota.match(/\((\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2})\)/);
    return m ? m[1] : '';
  } catch (e) { return ''; }
}

/**
 * La lista de killers vivos. Se pide `activos` por nombre: `propuestas` es
 * mucho mas grande y buscar "el arreglo mayor" agarraba esa.
 */
function kListaActivos_(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.activos)) return json.activos;

  // El site cambio de forma. Se busca a mano, pero sin caer en propuestas.
  var lista = kEncontrarLista_(json, ['propuestas', 'kam', 'categorias']);
  return lista || [];
}

function kEscribirHoja_(ss, filas, json) {
  var h = ss.getSheetByName(K_HOJA);
  if (!h) h = ss.insertSheet(K_HOJA);
  try { var f = h.getFilter(); if (f) f.remove(); } catch (e) {}
  h.clear();
  try { h.setConditionalFormatRules([]); } catch (e) {}

  var nC = K_MAPA.length;
  var sc = h.getMaxColumns() - nC;
  if (sc > 0) h.deleteColumns(nC + 1, sc);
  if (sc < 0) h.insertColumnsAfter(h.getMaxColumns(), -sc);
  var quiero = Math.max(filas.length + 1, 50);
  var sf = h.getMaxRows() - quiero;
  if (sf > 0) h.deleteRows(quiero + 1, sf);
  if (sf < 0) h.insertRowsAfter(h.getMaxRows(), -sf);

  h.getRange(1, 1, 1, nC)
   .setValues([K_MAPA.map(function (c) { return c[0]; })])
   .setFontWeight('bold').setBackground('#eef2f7');
  h.getRange(2, 1, filas.length, nC).setValues(filas);

  // Formatos por tipo, no por posicion: mover una columna no rompe nada.
  K_MAPA.forEach(function (c, i) {
    var rg = h.getRange(2, i + 1, filas.length, 1);
    if (c[2] === '$') rg.setNumberFormat(c[0] === 'DIAS' ? '#,##0' : '#,##0.00');
    else if (c[2] === 'd') rg.setNumberFormat('yyyy-mm-dd hh:mm');
    else if (c[2] === '%') rg.setNumberFormat('0.0"%"');
  });

  var rango  = h.getRange(2, 1, filas.length, nC);
  var colPV  = kColLetra_(kIndice_('POR VENCER') + 1);
  var colFin = kColLetra_(kIndice_('TERMINA') + 1);
  h.setConditionalFormatRules([
    // Ya vencido: no sirve para el archivo de Walmart.
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($' + colFin + '2<>"",$' + colFin + '2<=NOW())')
      .setBackground('#f1f3f4').setFontColor('#9aa0a6').setRanges([rango]).build(),
    // Por vencer: hay que renegociar.
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + colPV + '2="SI"')
      .setBackground('#fff4e5').setRanges([rango]).build()
  ]);

  h.setFrozenRows(1);
  h.setFrozenColumns(1);
  h.getRange(1, 1, 1, nC).createFilter();

  var tz = ss.getSpreadsheetTimeZone();
  h.getRange(1, 1).setNote(
    'Bajado del site el ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm') +
    '\n' + filas.length + ' killers\n' + kTextoEdad_(json));

  SpreadsheetApp.flush();
  h.autoResizeColumns(1, nC);
  if (h.getColumnWidth(3) > 420) h.setColumnWidth(3, 420);
  ss.setActiveSheet(h);
}

/**
 * Lo que dice el site sobre que tan vieja es la tanda. Este es el aviso que
 * de verdad importa: el endpoint contesta 200 aunque nadie haya corrido la
 * extension en dias, y los precios de hace una semana ya no son precios.
 */
function kTextoEdad_(json) {
  var edad  = Number(json && json.activos_edad_h || 0);
  var sello = (json && json.activos_sello) || '';
  if (!edad) return 'El site no dijo de cuando es la tanda.';

  var linea = 'Antiguedad de la tanda: ' + edad.toFixed(1) + ' h';
  if (sello) linea += '  (' + String(sello).substring(0, 16).replace('T', ' ') + ')';
  if (edad > K_EDAD_AVISO_H) {
    linea += '\n\nCUIDADO: esta foto ya tiene ' + Math.round(edad / 24) + ' dia(s).\n' +
             'Los killers los manda la extension de Chrome, no una API: hasta que\n' +
             'alguien la corra desde el seller center, esto es el mundo de hace ' +
             edad.toFixed(0) + ' horas.';
  }
  return linea;
}

/** Campos del mapa que el JSON ya no trae. */
function kCamposQueFaltan_(reg) {
  return K_MAPA.filter(function (c) { return !(c[1] in reg); })
               .map(function (c) { return c[0] + ' (' + c[1] + ')'; });
}

function kIndice_(encabezado) {
  for (var i = 0; i < K_MAPA.length; i++) if (K_MAPA[i][0] === encabezado) return i;
  return -1;
}

function kColLetra_(n) {
  var s = '';
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
  return s;
}

/* ================================================================== */
/*  Cliente del site                                                   */
/* ================================================================== */

/**
 * Trae el JSON. Si el site rechaza, se arregla SOLO antes de rendirse:
 *
 *   1. Con el perfil de encabezados que ya funciono antes.
 *   2. Si rechaza, kFetch_ entra solo con usuario y contrasena y reintenta.
 *   3. Si AUN ASI rechaza, no es la sesion: se abre la pagina de killers para
 *      calentar la sesion y se recorren los demas perfiles de encabezados.
 *   4. El primero que conteste JSON de verdad se guarda, y las siguientes
 *      corridas arrancan directo con ese.
 *
 * Todo esto pasa sin que nadie corra un diagnostico. Solo si TODO falla se
 * levanta el error, y para entonces ya se probo lo que habia que probar.
 */
function kTraer_() {
  var props  = PropertiesService.getScriptProperties();
  var ruta   = props.getProperty(K_PROP.RUTA)   || K_RUTA_DEFAULT;
  var metodo = props.getProperty(K_PROP.METODO) || K_METODO_DEFAULT;
  var cuerpo = metodo === 'post' ? '{}' : null;

  // Cache buster: el site sirve esto desde un service worker y sin el se
  // puede quedar pegado a una respuesta vieja.
  function conSello() {
    return ruta + (ruta.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
  }

  // --- 1 y 2: el perfil de siempre, con renovacion de cookie adentro ---
  var usado = kPerfilGuardado_();
  var r = kFetch_(conSello(), metodo, cuerpo, null, usado);
  if (r.code !== 200) r = kFetch_(ruta, metodo, cuerpo, null, usado);

  // --- 3: no es la sesion. Se prueban los demas perfiles ---
  if (r.code === 401 || r.code === 403 || r.code === 302 || r.code === 301) {
    var intentos = [kPerfilEtiqueta_(usado, r.code)];

    // Calentar la sesion: abrir la pagina que normalmente hace este fetch.
    // Hay backends que no dan la API si no vienes de ahi.
    try { kFetch_(K_PAGINA, 'get', null, null, K_PERFILES[0]); } catch (e) {}

    for (var i = 0; i < K_PERFILES.length; i++) {
      var pf = K_PERFILES[i];
      if (pf.nombre === usado.nombre) continue;

      var r2 = kFetch_(conSello(), metodo, cuerpo, null, pf);
      intentos.push(kPerfilEtiqueta_(pf, r2.code));

      if (r2.code === 200 && kJson_(r2.texto)) {
        props.setProperty(K_PROP_PERFIL, pf.nombre);
        try {
          if (typeof logInfo_ === 'function') {
            logInfo_('KILLERS', 'El site pedia otros encabezados. Perfil que funciono: ' +
                                pf.nombre + '. Queda guardado.');
            if (typeof flushLog_ === 'function') flushLog_();
          }
        } catch (e) {}
        r = r2;
        break;
      }
    }

    if (r.code !== 200) throw new Error(kPorQueRechazo_(r, ruta, intentos));
  }

  if (r.code !== 200) {
    throw new Error('El site contesto HTTP ' + r.code + ' en ' + ruta + '.');
  }

  var json = kJson_(r.texto);
  if (!json) throw new Error('La respuesta de ' + ruta + ' no es JSON.');
  if (json.ok === false) {
    throw new Error('El site devolvio ok=false: ' + JSON.stringify(json).substring(0, 300));
  }
  return { json: json, texto: r.texto };
}

function kPerfilEtiqueta_(pf, code) {
  return '   ' + kPad_(pf.nombre, 24) + 'HTTP ' + code;
}

function kFetch_(ruta, metodo, cuerpo, modo, perfil) {
  var opciones = {
    method: metodo,
    headers: kHeaders_(modo, perfil),
    followRedirects: false,
    muteHttpExceptions: true
  };
  if (cuerpo) {
    opciones.contentType = 'application/json';
    opciones.payload = cuerpo;
  }

  var resp = UrlFetchApp.fetch(K_SITE + ruta, opciones);
  var code = resp.getResponseCode();
  var renov = '';

  /* Credencial rechazada: se entra solo con el usuario y la contrasena que ya
     estan guardados, y se reintenta. Esto es lo que evita tener que correr
     nada a mano cuando la cookie vence.

     El resultado NO se descarta: antes iba en un catch vacio, y cuando el
     login fallaba el reintento usaba la MISMA cookie vieja y salia un 401
     pelon que no decia nada. Aqui se guarda el motivo para poder decirlo. */
  if (code === 401 || code === 403 || code === 302 || code === 301) {
    if (typeof renovarCookie_ !== 'function') {
      renov = 'sin-login';
    } else if (typeof puedeRenovarSolo_ === 'function' && !puedeRenovarSolo_()) {
      renov = 'sin-credenciales';
    } else {
      var ok = false;
      try { ok = renovarCookie_(); }
      catch (e) { renov = 'error:' + e.message; }
      finally { try { if (typeof flushLog_ === 'function') flushLog_(); } catch (e2) {} }

      if (renov === '') renov = ok ? 'renovada' : 'login-fallo';

      if (ok) {
        opciones.headers = kHeaders_(modo, perfil);
        resp = UrlFetchApp.fetch(K_SITE + ruta, opciones);
        code = resp.getResponseCode();
        if (code === 401 || code === 403) renov = 'renovada-y-sigue';
      }
    }
  }
  return { code: code, texto: resp.getContentText(), renov: renov };
}

/**
 * Traduce un rechazo a una sola instruccion. Un "HTTP 401" no dice si falta
 * configurar el login, si el login trono, o si la cookie es buena y el site
 * quiere otra cosa; cada caso se arregla distinto.
 */
function kPorQueRechazo_(r, ruta, intentos) {
  var base = 'El site rechazo la credencial (HTTP ' + r.code + ') en ' + ruta + '.\n\n';
  var cola = '';
  if (intentos && intentos.length) {
    cola = '\n\nYa se probaron estos juegos de encabezados:\n' + intentos.join('\n');
  }

  if (r.renov === 'sin-credenciales' || r.renov === 'sin-login') {
    return base +
      'No hay usuario y contrasena guardados, asi que no pude entrar solo.\n\n' +
      'Configuralo UNA vez y ya no se vuelve a caer:\n' +
      '   Configuracion  >  Login automatico del site';
  }
  if (r.renov === 'login-fallo') {
    return base +
      'Intente entrar solo con tu usuario y contrasena, y el login fallo.\n\n' +
      'Revisa que sigan siendo los correctos:\n' +
      '   Configuracion  >  Login automatico del site\n\n' +
      'El detalle del intento quedo en la hoja Log, etapa LOGIN.';
  }
  if (r.renov === 'renovada-y-sigue' || intentos) {
    return base +
      'La cookie se renovo bien y el site SIGUE rechazando, asi que el\n' +
      'problema no es la sesion. Tampoco son los encabezados: ya se\n' +
      'probaron todos los que usa un navegador.\n\n' +
      'Queda una sola explicacion: la cuenta con la que entra el script\n' +
      'no tiene permiso sobre /walmart/killers. Es la misma razon por la\n' +
      'que tu si puedes abrir esa URL en el navegador y el script no.\n\n' +
      'Revisa desde el administrador del site que el usuario del login\n' +
      'automatico tenga acceso a esa seccion.' + cola;
  }
  if (String(r.renov).indexOf('error:') === 0) {
    return base + 'El intento de entrar solo trono: ' + r.renov.substring(6);
  }
  return base +
    'No se pudo entrar de ninguna forma.' + cola;
}

function kHeaders_(modo, perfil) {
  var props = PropertiesService.getScriptProperties();
  modo = modo || props.getProperty(K_PROP.MODO) || K_MODO_DEFAULT;
  perfil = perfil || kPerfilGuardado_();

  var h = {
    'Accept': perfil.accept,
    'User-Agent': perfil.ua
  };
  if (perfil.xhr) h['X-Requested-With'] = 'XMLHttpRequest';
  if (perfil.referer) h['Referer'] = K_SITE + K_PAGINA;

  if (modo === 'ambos' || modo === 'token') {
    var token = props.getProperty(K_PROP.TOKEN);
    if (token) h['X-API-Key'] = token;
  }
  if (modo === 'ambos' || modo === 'cookie') {
    /* La cookie se guarda SIN el prefijo (guardarCookie_ en Api.gs le quita
       el "session=" antes de guardarla), asi que hay que volver a ponerlo.
       Sin esto el site recibe "Cookie: eyJ..." en vez de
       "Cookie: session=eyJ...", no encuentra la sesion y contesta 401 pase
       lo que pase: renovar no ayuda y cambiar encabezados tampoco.
       Se acepta que ya venga con prefijo, por si alguien la pego completa. */
    var cookie = props.getProperty(K_PROP.COOKIE);
    if (cookie) {
      cookie = String(cookie).trim();
      h['Cookie'] = /^session\s*=/i.test(cookie) ? cookie : ('session=' + cookie);
    }
  }
  return h;
}

/** El perfil que ya funciono antes, o el primero de la lista. */
function kPerfilGuardado_() {
  var n = PropertiesService.getScriptProperties().getProperty(K_PROP_PERFIL);
  if (n) {
    for (var i = 0; i < K_PERFILES.length; i++) {
      if (K_PERFILES[i].nombre === n) return K_PERFILES[i];
    }
  }
  return K_PERFILES[0];
}

/* ================================================================== */
/*  Diagnostico                                                        */
/* ================================================================== */

/** Que trae la respuesta ahora mismo, sin escribir nada. */
function killersVerEstructura() {
  var r = kTraer_();
  var j = r.json;

  var lineas = ['Llaves de primer nivel:'];
  Object.keys(j).forEach(function (k) {
    var v = j[k];
    var t = Array.isArray(v) ? ('arreglo de ' + v.length)
          : (v === null ? 'null' : typeof v);
    lineas.push('   ' + kPad_(k, 22) + t);
  });

  var lista = kListaActivos_(j);
  lineas.push('');
  lineas.push('Killers activos: ' + lista.length);

  if (lista.length) {
    lineas.push('');
    lineas.push('Campos de un killer:');
    Object.keys(lista[0]).forEach(function (k) {
      var v = lista[0][k];
      lineas.push('   ' + kPad_(k, 22) + kPad_(typeof v, 9) +
                  String(JSON.stringify(v)).slice(0, 50));
    });
    var faltan = kCamposQueFaltan_(lista[0]);
    if (faltan.length) {
      lineas.push('');
      lineas.push('Del mapa de columnas ya NO llegan: ' + faltan.join(', '));
    }
  }

  lineas.push('');
  lineas.push(kTextoEdad_(j));

  var msg = lineas.join('\n');
  Logger.log(msg);
  kAviso_('Estructura de la respuesta', msg);
  return msg;
}

/**
 * Prueba las 4 combinaciones de credencial contra la ruta de killers y se
 * queda con la primera que conteste 200.
 *
 * Existe porque un 401 no dice QUE credencial sobra o falta. En el site no
 * todas las rutas aceptan lo mismo: /stock-odoo-data va con X-API-Key, pero
 * /walmart/killers es de la app con sesion. Si el servidor valida la llave
 * primero y esa llave no cubre /walmart/*, contesta 401 aunque la cookie sea
 * perfecta. Probar las cuatro cuesta 4 llamadas y acaba con la adivinanza.
 */
function killersProbarCredenciales() {
  var props = PropertiesService.getScriptProperties();
  var ruta   = props.getProperty(K_PROP.RUTA)   || K_RUTA_DEFAULT;
  var metodo = props.getProperty(K_PROP.METODO) || K_METODO_DEFAULT;

  var hayToken  = !!props.getProperty(K_PROP.TOKEN);
  var hayCookie = !!props.getProperty(K_PROP.COOKIE);

  var lineas = [];
  lineas.push('Ruta:   ' + metodo.toUpperCase() + ' ' + ruta);
  lineas.push('Token guardado:  ' + (hayToken ? 'si' : 'NO'));
  lineas.push('Cookie guardada: ' + (hayCookie ? 'si' : 'NO'));

  if (!hayToken && !hayCookie) {
    lineas.push('');
    lineas.push('No hay ninguna credencial guardada. Configura el token o');
    lineas.push('la cookie desde el menu de Configuracion.');
    var m0 = lineas.join('\n');
    kAviso_('Probar credenciales', m0);
    return m0;
  }

  lineas.push('');
  var modos = ['ambos', 'cookie', 'token', 'nada'];
  var gana = null;

  modos.forEach(function (modo) {
    // Sin cache buster aqui: se prueba la ruta tal cual la usa killersBajar.
    var r = kFetch_(ruta, metodo, metodo === 'post' ? '{}' : null, modo);
    var nota = '';
    if (r.code === 200) {
      var j = kJson_(r.texto);
      var lista = j ? kListaActivos_(j) : null;
      nota = j ? ('JSON, ' + (lista ? lista.length : 0) + ' activos') : 'no es JSON';
      if (j && lista && lista.length && !gana) gana = modo;
    } else if (r.code === 401 || r.code === 403) {
      nota = 'credencial rechazada';
    } else if (r.code === 302 || r.code === 301) {
      nota = 'manda al login';
    }
    lineas.push('   ' + kPad_(modo, 8) + 'HTTP ' + kPad_(String(r.code), 5) + nota);
  });

  lineas.push('');
  if (gana) {
    props.setProperty(K_PROP.MODO, gana);
    lineas.push('FUNCIONA CON: ' + gana.toUpperCase() + '  -- ya quedo guardado.');
    lineas.push('Ya puedes correr "Bajar killers del site".');
  } else {
    lineas.push('Ninguna combinacion sirvio.');
    lineas.push('');
    if (!hayCookie) {
      lineas.push('No hay cookie. Corre "Renovar cookie ahora" en Configuracion');
      lineas.push('y vuelve a probar: esta ruta es de la app con sesion.');
    } else {
      lineas.push('La cookie existe pero el site la rechaza: seguro ya vencio.');
      lineas.push('Corre "Renovar cookie ahora" en Configuracion y repite.');
    }
  }

  var msg = lineas.join('\n');
  Logger.log(msg);
  kAviso_('Probar credenciales', msg);
  return msg;
}

/**
 * Busca la ruta a ciegas. Ya no hace falta — la ruta esta en K_RUTA_DEFAULT —
 * pero se queda por si el site la cambia.
 */
function killersDescubrir() {
  var props = PropertiesService.getScriptProperties();
  var log = [];
  var candidatas = K_CANDIDATAS.slice();

  var pag = kFetch_(K_PAGINA, 'get', null);
  log.push('Pagina ' + K_PAGINA + ': HTTP ' + pag.code + ', ' + pag.texto.length + ' bytes');

  if (pag.code === 200) {
    var vistas = {};
    var re = /["'`](\/[A-Za-z0-9_\-\/\.]*(?:killer|oferta|especial)[A-Za-z0-9_\-\/\.]*)["'`]/gi;
    var m;
    while ((m = re.exec(pag.texto)) !== null) {
      var ruta = m[1];
      if (ruta.length > 4 && !/\.(css|js|png|jpg|svg|ico|woff2?)$/i.test(ruta)) vistas[ruta] = 1;
    }
    Object.keys(vistas).forEach(function (r) {
      if (candidatas.indexOf(r) < 0) candidatas.push(r);
    });
    log.push('Rutas que menciona la pagina: ' + (Object.keys(vistas).join(', ') || '(ninguna)'));
  }

  var mejor = null;
  candidatas.forEach(function (ruta) {
    ['get', 'post'].forEach(function (metodo) {
      if (ruta === K_PAGINA && metodo === 'get') return;
      var r = kFetch_(ruta, metodo, metodo === 'post' ? '{}' : null);
      var p = kPuntaje_(r);
      log.push(kPad_(metodo.toUpperCase(), 5) + ' ' + kPad_(ruta, 38) +
               ' HTTP ' + r.code + '  ' + kPad_(String(r.texto.length) + 'b', 10) +
               ' puntos ' + p.puntos + (p.nota ? '  ' + p.nota : ''));
      if (p.puntos > 0 && (!mejor || p.puntos > mejor.puntos)) {
        mejor = { ruta: ruta, metodo: metodo, puntos: p.puntos, filas: p.filas };
      }
    });
  });

  var msg = log.join('\n');
  if (mejor) {
    props.setProperty(K_PROP.RUTA, mejor.ruta);
    props.setProperty(K_PROP.METODO, mejor.metodo);
    msg = 'GUARDADO: ' + mejor.metodo.toUpperCase() + ' ' + mejor.ruta +
          '  (' + mejor.filas + ' registros)\n\n' + msg;
  } else {
    msg = 'No encontre ninguna ruta que sirva.\n\n' + msg;
  }
  kAviso_('Descubrir killers', msg);
  return msg;
}

function killersRutaAMano() {
  var ui = SpreadsheetApp.getUi();
  var r1 = ui.prompt('Ruta de killers',
    'La que se usa hoy es ' + K_RUTA_DEFAULT + '\n\nEscribe otra si el site cambio:',
    ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var r2 = ui.prompt('Metodo', 'Escribe GET o POST', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;

  PropertiesService.getScriptProperties().setProperties({
    KILLERS_RUTA: String(r1.getResponseText()).trim(),
    KILLERS_METODO: String(r2.getResponseText()).trim().toLowerCase() === 'post' ? 'post' : 'get'
  });
  kAviso_('Listo', 'Ruta guardada. Corre killersVerEstructura() o killersBajar().');
}

/** Vuelve a la ruta de fabrica, por si killersDescubrir guardo una mala. */
function killersRutaDeFabrica() {
  PropertiesService.getScriptProperties().setProperties({
    KILLERS_RUTA: K_RUTA_DEFAULT,
    KILLERS_METODO: K_METODO_DEFAULT
  });
  kAviso_('Listo', 'Ruta restablecida a ' + K_METODO_DEFAULT.toUpperCase() + ' ' + K_RUTA_DEFAULT);
}

/* ================================================================== */
/*  Utilerias                                                          */
/* ================================================================== */

/** Convierte un valor del JSON al tipo que va en la hoja. */
function kValor_(v, tipo) {
  if (v === null || v === undefined || v === '') return '';
  if (tipo === 'd') return kFecha_(v);
  if (tipo === 'b') return (v === true || v === 'SI' || v === 'si') ? 'SI' : '';
  if (tipo === '%') {
    // El site manda "10%" como texto; asi no suma ni compara.
    var n = parseFloat(String(v).replace('%', '').trim());
    return isNaN(n) ? '' : n;
  }
  if (tipo === '$') {
    var x = Number(v);
    return isNaN(x) ? '' : x;
  }
  return v;
}

function kJson_(t) {
  if (!t) return null;
  var s = t.replace(/^﻿/, '').trim();
  if (s.charAt(0) !== '{' && s.charAt(0) !== '[') return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}

/**
 * El arreglo de objetos mas grande, saltandose las llaves que se le digan.
 * Solo se usa como respaldo si el site deja de mandar `activos`.
 */
function kEncontrarLista_(json, ignorar) {
  ignorar = ignorar || [];
  if (Array.isArray(json)) return kEsLista_(json) ? json : null;
  if (!json || typeof json !== 'object') return null;

  var mejor = null;
  Object.keys(json).forEach(function (k) {
    if (ignorar.indexOf(k) >= 0) return;
    var v = json[k];
    if (Array.isArray(v) && kEsLista_(v)) {
      if (!mejor || v.length > mejor.length) mejor = v;
    } else if (v && typeof v === 'object') {
      var dentro = kEncontrarLista_(v, ignorar);
      if (dentro && (!mejor || dentro.length > mejor.length)) mejor = dentro;
    }
  });
  return mejor;
}

function kEsLista_(a) {
  return a.length > 0 && a[0] && typeof a[0] === 'object' && !Array.isArray(a[0]);
}

function kPuntaje_(r) {
  if (r.code !== 200) return { puntos: 0, filas: 0, nota: '' };
  var json = kJson_(r.texto);
  if (!json) return { puntos: 0, filas: 0, nota: 'no es JSON' };
  var lista = kListaActivos_(json);
  if (!lista || !lista.length) return { puntos: 1, filas: 0, nota: 'JSON sin activos' };
  var llaves = Object.keys(lista[0]).join(' ').toLowerCase();
  var puntos = 10 + Math.min(lista.length, 500);
  if (llaves.indexOf('sku') >= 0) puntos += 500;
  if (/termina|fin|end|hasta/.test(llaves)) puntos += 200;
  if (Array.isArray(json.activos)) puntos += 300;      // la forma que ya conocemos
  return { puntos: puntos, filas: lista.length, nota: 'activos: ' + lista.length };
}

/** Acepta dd-mm-yyyy HH:mm (lo que manda el site), yyyy-mm-dd, ISO y epoch. */
function kFecha_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return v;

  if (typeof v === 'number') {
    var ms = v > 1e12 ? v : v * 1000;
    var d0 = new Date(ms);
    return isNaN(d0.getTime()) ? '' : d0;
  }

  var s = String(v).trim();
  var m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);

  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);

  var d = new Date(s);
  return isNaN(d.getTime()) ? s : d;
}

function kPad_(s, n) {
  s = String(s);
  while (s.length < n) s += ' ';
  return s;
}

function kAviso_(titulo, msg) {
  Logger.log(titulo + '\n' + msg);
  try {
    SpreadsheetApp.getUi().alert(titulo, String(msg).slice(0, 4000), SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {}
}
