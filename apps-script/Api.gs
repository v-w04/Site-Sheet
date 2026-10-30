/**
 * ============================================================
 *  Api — cliente del sitio
 * ============================================================
 *
 * Autentica con la LLAVE (token) si existe. Si el site la rechaza, en la
 * misma llamada se usa la COOKIE de sesion, que la extension de Chrome
 * renueva sola; si la cookie tambien cae, re-login automatico (si hay
 * usuario y contrasena). Todo esto vive en fetchSitio_.
 *
 * Lo que ya costo caro y esta resuelto aqui:
 *
 * 1. El error de cuota llega EN ESPAÑOL ("demasiadas veces"), no en
 *    ingles. Buscar solo "invoked too many times" hacia que no se
 *    reconociera y se reintentara tres veces en vano.
 *
 * 2. Reintentar tras un error de cuota es imposible por definicion.
 *    Se aborta al primer golpe y se marca el dia.
 *
 * 3. followRedirects en false: si la credencial no sirve, el sitio
 *    manda al login con codigo 200 y creeriamos que todo salio bien.
 *
 * 4. La cuota es POR CUENTA DE GOOGLE y la comparten TODOS los
 *    proyectos de esa cuenta. Por eso el flag va en user properties.
 */

/* ================ CREDENCIALES ================ */

/**
 * Header de la llave de API. Las llaves nuevas del site (emk_...) van en
 * "Authorization: Bearer", nunca en la URL. Si el token no empieza con
 * emk_ se manda como X-API-Key, que era el esquema anterior.
 */
function tokenHeaders_(token) {
  token = String(token || '').trim();
  if (/^emk_/i.test(token)) return { 'Authorization': 'Bearer ' + token };
  return { 'X-API-Key': token };
}

function authHeaders_(soloCookie) {
  var p = props_();

  var token = p.getProperty(PROP.TOKEN);
  if (token && !soloCookie) { var th = tokenHeaders_(token); th._modo = 'token'; return th; }

  var cookie = p.getProperty(PROP.COOKIE);
  if (cookie) return { 'Cookie': 'session=' + cookie, _modo: 'cookie' };

  throw new Error(
    'Sin credenciales. Menu SITE SHEET > Configuracion > "Configurar token API" ' +
    '(o la cookie, como respaldo).'
  );
}


/* ================ COOKIE ================ */

/**
 * Guarda la cookie y la fecha en que se capturo. La fecha importa: cuando
 * algo falla, saber que la cookie tiene diez dias contesta la pregunta
 * antes de que la hagas.
 */
function guardarCookie_(cookie, origen) {
  props_().setProperties({
    SITE_SESSION_COOKIE: String(cookie).replace(/^session\s*=\s*/i, '').trim(),
    SITE_COOKIE_FECHA:   new Date().toISOString(),
    SITE_COOKIE_ORIGEN:  String(origen || 'manual')
  }, false);
  diaTipoQuita_('AVISO_CRED_DIA', 'COOKIE');   // solo la marca de la cookie; la de la llave sigue
}

/** Texto corto para el Log: de donde viene la cookie y hace cuanto se guardo. */
function cookieOrigenTxt_() {
  var p = props_();
  var f = p.getProperty('SITE_COOKIE_FECHA');
  var o = p.getProperty('SITE_COOKIE_ORIGEN') || 'manual';
  if (!f) return o + ', sin fecha';
  var min = Math.round((Date.now() - new Date(f).getTime()) / 60000);
  return o + ', hace ' + (min < 120 ? min + ' min' : Math.round(min / 60) + ' h');
}

/** Dias desde que se capturo la cookie. -1 si no hay fecha. */
function cookieEdadDias_() {
  var f = props_().getProperty('SITE_COOKIE_FECHA');
  if (!f) return -1;
  return Math.floor((new Date().getTime() - new Date(f).getTime()) / 86400000);
}

/* ================ VALIDAR UNA COOKIE ================ */

/**
 * Rutas GET que contestan JSON con sesion. Se prueban en orden; la primera que
 * decide (200 con JSON) gana. Primero la mas ligera.
 */
var RUTAS_PRUEBA_COOKIE = [
  '/compras-walmart-vendidos?dias=1',
  '/precios-em/api/lista',
  '/walmart/killers/api/data'
];

/**
 * Prueba una cookie con un GET real.
 *   'ok'   alguna ruta contesto 200 con JSON
 *   'mala' ninguna dio JSON y alguna la rechazo (401/403/3xx o pagina de login)
 *   'duda' no se pudo saber (red, 404, 405, 5xx...)
 * Un 3xx o un 405 NO prueban sesion: un login malo tambien redirige.
 */
function probarCookie_(cookie) {
  cookie = String(cookie || '').replace(/^session\s*=\s*/i, '').trim();
  if (!cookie) return 'mala';
  var rechazos = 0;

  for (var i = 0; i < RUTAS_PRUEBA_COOKIE.length; i++) {
    var resp;
    try {
      contarFetch_();
      resp = UrlFetchApp.fetch(SITE + RUTAS_PRUEBA_COOKIE[i], {
        method: 'get',
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'GoogleAppsScript-SiteSheet',
          'Cookie': 'session=' + cookie
        },
        followRedirects: false,
        muteHttpExceptions: true,
        validateHttpsCertificates: true
      });
    } catch (e) {
      if (esErrorDeCuota_(e.message)) { marcarCuotaAgotada_(e.message); return 'duda'; }
      continue;
    }

    var c = resp.getResponseCode();
    if (c === 200) {
      var t = resp.getContentText();
      try { JSON.parse(t); return 'ok'; } catch (e) {}
      if (/type=["']password["']/i.test(t)) rechazos++;   // pagina de login con 200
    } else if (esRechazo_(c)) {
      rechazos++;
    }
    // 404/405/5xx: esta ruta no decide, se prueba la siguiente
  }
  return rechazos ? 'mala' : 'duda';
}

/**
 * Decide si una cookie nueva reemplaza a la guardada. Nunca cambia una cookie
 * buena por una dudosa:
 *   nueva ok    -> se guarda
 *   nueva mala  -> no
 *   nueva duda  -> solo si no hay otra, o la actual esta mala (o en duda y su
 *                  ultimo uso real fallo, CRED_COOKIE = caida)
 * Devuelve { guardar, estado, motivo }.
 */
function decidirCookie_(nueva) {
  var e = probarCookie_(nueva);
  if (e === 'ok')   return { guardar: true,  estado: 'ok',   motivo: 'validada con GET (200 JSON)' };
  if (e === 'mala') return { guardar: false, estado: 'mala', motivo: 'el site no la acepta' };

  var actual = props_().getProperty(PROP.COOKIE);
  if (!actual) return { guardar: true, estado: 'duda', motivo: 'no se pudo validar; no habia otra' };

  var ea = probarCookie_(actual);
  var ultimo = '';
  try { ultimo = String(propsUser_().getProperty('CRED_COOKIE') || '').split('|')[0]; } catch (x) {}
  if (ea === 'mala' || (ea === 'duda' && ultimo === 'caida')) {
    return { guardar: true, estado: 'duda', motivo: 'no se pudo validar, pero la actual ya no sirve' };
  }
  return { guardar: false, estado: 'duda',
           motivo: 'no se pudo validar; se conserva la actual (' + (ea === 'ok' ? 'sigue sirviendo' : 'sin fallas') + ')' };
}

/* ================ CUOTA ================ */

/**
 * El mensaje de cuota llega en el idioma de la cuenta, no en ingles.
 * Buscar solo "invoked too many times" hacia que no se reconociera y se
 * reintentara tres veces en vano.
 *
 * Pero tampoco puede ser demasiado laxo: marcar el dia entero por un error
 * que NO era de cuota deja el script apagado hasta medianoche sin razon.
 * Por eso las frases genericas ("too many") solo cuentan si ademas aparece
 * urlfetch o servicio en el mismo mensaje.
 */
function esErrorDeCuota_(msg) {
  var m = String(msg || '').toLowerCase();

  // Frases inconfundibles de la cuota de Apps Script
  if (/invoked too many times/.test(m)) return true;   // ingles
  if (/invocado demasiadas veces/.test(m)) return true;   // español
  if (/servicio.*demasiadas veces/.test(m)) return true;
  if (/appele trop de fois/.test(m)) return true;   // frances
  if (/invocado muitas vezes/.test(m)) return true;   // portugues
  if (/zu oft aufgerufen/.test(m)) return true;   // aleman

  // Genericas: solo con contexto de servicio o urlfetch
  var contexto = /urlfetch|servicio|service|quota|cuota/.test(m);
  if (!contexto) return false;

  return /too many|demasiadas veces|trop de fois|muitas vezes|zu oft/.test(m) ||
         /(limit|l[íi]mite|quota|cuota).*(d[íi]a|day|daily|diari)/.test(m);
}

var MSG_CUOTA =
  'CUOTA DE URLFETCH AGOTADA (limite diario de Apps Script).\n\n' +
  'No es un error de este script ni de la credencial. La cuota es por CUENTA ' +
  'DE GOOGLE (20,000/dia personal, 100,000 Workspace) y la comparten TODOS los ' +
  'proyectos de esa cuenta.\n\n' +
  'Este script consume unas cuantas cientos al dia, asi que el culpable suele ' +
  'ser otro. Buscalo en script.google.com/home/executions, filtra por hoy y ' +
  'ordena por ejecuciones. Casi siempre es un script con UrlFetchApp.fetch ' +
  'dentro de un loop de SKUs.\n\n' +
  'Se resetea a medianoche en la zona horaria del PROYECTO, que no siempre es CDMX.';

/**
 * Marca el dia Y guarda el mensaje original de Google.
 *
 * Sin la evidencia, un "omitida por cuota" con 31 llamadas en el contador es
 * imposible de juzgar: puede ser otro script de la misma cuenta comiendose la
 * cuota, o este detector marcando un error que no era. Guardar las palabras
 * exactas de Google resuelve la duda en un vistazo.
 */
function marcarCuotaAgotada_(mensajeOriginal) {
  try {
    propsUser_().setProperties({
      CUOTA_AGOTADA_DIA: hoy_(),
      CUOTA_MENSAJE: String(mensajeOriginal || '(sin mensaje)').substring(0, 400),
      CUOTA_HORA: ahora_()
    });
  } catch (e) {}
}

/** El mensaje que disparo el freno, para poder juzgarlo. */
function evidenciaCuota_() {
  var p = propsUser_();
  if (p.getProperty(PROP_CUOTA_DIA) !== hoy_()) return null;
  return {
    hora: p.getProperty('CUOTA_HORA') || '?',
    mensaje: p.getProperty('CUOTA_MENSAJE') || '(no se guardo)'
  };
}

function cuotaAgotadaHoy_() {
  try { return propsUser_().getProperty(PROP_CUOTA_DIA) === hoy_(); }
  catch (e) { return false; }
}

function limpiarFlagCuota() {
  var p = propsUser_();
  p.deleteProperty(PROP_CUOTA_DIA);
  p.deleteProperty('CUOTA_MENSAJE');
  p.deleteProperty('CUOTA_HORA');
  var quien = '';
  try { quien = Session.getEffectiveUser().getEmail() || ''; } catch (e) {}
  alertLog_(SpreadsheetApp.getUi(), 'Flag limpiado',
    'Este flag es de TU cuenta (' + (quien || '?') + ').\n\n' +
    'El script volvera a intentar. Si la cuota sigue agotada va a volver a fallar: ' +
    'se resetea a medianoche en la zona horaria del proyecto.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function contarFetch_() {
  try {
    var p = propsUser_();
    var h = hoy_();
    var n = (p.getProperty(PROP_FETCH_DIA) === h)
      ? Number(p.getProperty(PROP_FETCH_COUNT) || 0) : 0;
    n++;
    var upd = {};
    upd[PROP_FETCH_DIA]   = h;
    upd[PROP_FETCH_COUNT] = String(n);
    p.setProperties(upd);
  } catch (e) { /* el contador nunca bloquea la corrida */ }
}

function fetchHoy_() {
  var p = propsUser_();
  return (p.getProperty(PROP_FETCH_DIA) === hoy_())
    ? Number(p.getProperty(PROP_FETCH_COUNT) || 0) : 0;
}

/* ================ ESTADO DE LAS CREDENCIALES EN EL LOG ================ */

var CRED_MEMO = {};

/**
 * Deja en el Log, etapa CREDENCIAL, cuando la LLAVE o la COOKIE se cae y
 * cuando vuelve. Solo escribe al cambiar de estado (y un recordatorio cada
 * 3 horas si sigue caida), para no llenar el Log.
 *   tipo: 'LLAVE' o 'COOKIE'
 */
function credLog_(tipo, ok, ruta, code) {
  try {
    var p = propsUser_();
    var clave = 'CRED_' + tipo;
    var prev = CRED_MEMO[clave];
    if (prev === undefined) prev = CRED_MEMO[clave] = (p.getProperty(clave) || '');
    var partes = prev.split('|');
    var estado = partes[0], ts = Number(partes[1] || 0), ahora = Date.now();

    if (ok) {
      if (estado === 'caida') {
        logOk_('CREDENCIAL', tipo + ' recuperada: vuelve a funcionar (' + ruta + ')');
      }
      if (estado !== 'ok') { CRED_MEMO[clave] = 'ok|' + ahora; p.setProperty(clave, 'ok|' + ahora); }
      return;
    }

    if (estado === 'caida' && (ahora - ts) < 3 * 3600 * 1000) return;
    var que = (tipo === 'LLAVE')
      ? 'LLAVE CAIDA (HTTP ' + code + ') en ' + ruta + ' y sin cookie de respaldo. Revisa en /api-docs ' +
        '(vence el 12-nov-2026) o entra al site en Chrome con la extension para que mande la cookie.'
      : 'COOKIE CAIDA (HTTP ' + code + ') en ' + ruta + '. La extension de Chrome manda una nueva ' +
        'al entrar al site; a mano: Configuracion > Actualizar cookie.';
    logErr_('CREDENCIAL', que);
    CRED_MEMO[clave] = 'caida|' + ahora;
    p.setProperty(clave, 'caida|' + ahora);
  } catch (e) { /* el registro nunca bloquea la corrida */ }
}

/* ================ FETCH ================ */

/** 401/403 = credencial rechazada; 302/303 = el site manda al login. */
function esRechazo_(code) {
  return code === 401 || code === 403 || code === 302 || code === 303;
}

/**
 * Rutas (sin query) donde el site ya rechazo la llave en ESTA ejecucion:
 * no se vuelve a probar la llave ahi, va directo la cookie (ahorra una llamada).
 */
var LLAVE_RECHAZADA = {};

/**
 * Trae una ruta del sitio. Devuelve el objeto JSON ya parseado.
 *   crudo       devuelve { codigo, texto, modo } sin interpretar
 *   noLanzar    (con crudo) si el site no da 200 devuelve { codigo, texto, modo,
 *               relogin, desdeLlave } en vez de lanzar. Si deja Log y aviso.
 *   silencioso  devuelve el codigo sin lanzar, sin Log, sin aviso y sin re-login
 *   soloCookie  no usa la llave (rutas que la llave no abre)
 *   headers     encabezados extra; la llave/cookie se ponen encima
 *
 * Credencial, todo en la misma llamada y sin que nadie haga nada:
 *   1. Llave si existe. Si el site la rechaza (401/403/302/303) y hay cookie,
 *      se repite con la cookie (WARN en el Log 1 vez al dia).
 *   2. Si la cookie tambien es rechazada: re-login automatico (si hay usuario y
 *      contrasena), maximo UNA vez por ejecucion, y se repite.
 */
function fetchSitio_(ruta, opciones) {
  opciones = opciones || {};

  if (cuotaAgotadaHoy_() && !opciones.ignorarCuota) {
    throw new Error(MSG_CUOTA +
      '\n\n(Ya detectado hoy en esta cuenta. Menu > "Reintentar tras cuota agotada" para forzar.)');
  }

  var p = props_();
  var callado = !!opciones.silencioso;
  var base = String(ruta).split('?')[0];
  var usarCookie = !!opciones.soloCookie || !!LLAVE_RECHAZADA[base];
  var relogin = '', desdeLlave = false;

  // Sin cookie y sin llave utilizable: si hay login guardado, se consigue una antes
  if (!p.getProperty(PROP.COOKIE) && (usarCookie || !p.getProperty(PROP.TOKEN)) &&
      !callado && puedeRenovarSolo_()) {
    relogin = reloginUnaVez_().estado;
  }

  var r = fetchSitioIntento_(ruta, opciones, usarCookie);

  // 1. Llave rechazada: la misma llamada con la cookie
  if (esRechazo_(r.codigo) && r.modo === 'token') {
    var hayCookie = !!p.getProperty(PROP.COOKIE);
    if (hayCookie || (!callado && puedeRenovarSolo_())) {
      LLAVE_RECHAZADA[base] = true;
      desdeLlave = true;
      if (!callado) {
        avisoLogDia_('LLAVE', 'WARN', 'CREDENCIAL',
          'LLAVE rechazada: se usa la cookie (HTTP ' + r.codigo + ' en ' + base + '). Aviso 1 vez al dia.');
      }
      if (!hayCookie && !relogin) {
        var rl0 = reloginUnaVez_();
        relogin = rl0.estado;
        hayCookie = rl0.hecho;
      }
      if (hayCookie) r = fetchSitioIntento_(ruta, opciones, true);
    }
  }

  // 2. Cookie rechazada: re-login (una vez por ejecucion) y se repite
  if (esRechazo_(r.codigo) && r.modo === 'cookie' && !callado && !relogin) {
    var rl = reloginUnaVez_();
    relogin = rl.estado;
    if (rl.hecho) r = fetchSitioIntento_(ruta, opciones, true);
  }

  var code = r.codigo;
  var tipo = (r.modo === 'token') ? 'LLAVE' : 'COOKIE';

  if (code === 200) {
    credLog_(tipo, true, ruta, code);
    if (opciones.crudo) return { codigo: code, texto: r.texto, modo: r.modo };

    var data;
    try {
      data = JSON.parse(r.texto);
    } catch (e) {
      if (callado) return { codigo: code, texto: r.texto, noEsJson: true };
      throw new Error(
        'La respuesta de ' + ruta + ' no es JSON. Lo mas probable es que la ' +
        'credencial no fue aceptada y te mandaron al login.'
      );
    }
    return data;
  }

  // Credencial invalida. Reintentar no sirve de nada.
  if (esRechazo_(code)) {
    if (callado) return { codigo: code, texto: '' };
    credLog_(tipo, false, ruta, code);
    avisarCredencialMuerta_('HTTP ' + code + ' en ' + ruta +
      (desdeLlave ? ' (antes el site rechazo la llave)' : ''), tipo);
    if (opciones.noLanzar) {
      return { codigo: code, texto: r.texto, modo: r.modo, relogin: relogin, desdeLlave: desdeLlave };
    }
    throw new Error(msgRechazo_(tipo, code, ruta, desdeLlave, relogin));
  }

  if (callado) return { codigo: code, texto: '' };
  if (opciones.noLanzar) return { codigo: code, texto: r.texto, modo: r.modo };

  if (code === 404) throw new Error('La ruta ' + ruta + ' no existe en el sitio (HTTP 404).');

  // 405 = la ruta SI existe, pero no acepta este metodo. Es un hallazgo,
  // no un error: casi siempre significa que hay que pedirla con POST.
  if (code === 405) {
    throw new Error(
      'La ruta ' + ruta + ' existe pero no acepta ' +
      (opciones.method || 'GET').toUpperCase() + ' (HTTP 405). Probablemente sea POST.'
    );
  }

  throw new Error('HTTP ' + code + ' en ' + ruta + '. ' +
    'Respuesta: ' + String(r.texto || '').substring(0, 200));
}

/**
 * Una peticion con una credencial (llave o cookie), con los reintentos de red
 * y de 5xx/429. Devuelve { codigo, texto, modo }. Lanza en cuota y red caida.
 */
function fetchSitioIntento_(ruta, opciones, usarCookie) {
  var auth = authHeaders_(usarCookie);
  var modo = auth._modo;
  delete auth._modo;

  var headers = Object.assign({
    'Accept': 'application/json',
    'User-Agent': 'GoogleAppsScript-SiteSheet'
  }, opciones.headers || {}, auth);

  var url = /^https?:\/\//i.test(ruta) ? ruta : SITE + (ruta.charAt(0) === '/' ? ruta : '/' + ruta);
  var ultimoError = null;

  for (var intento = 1; intento <= FETCH_REINTENTOS; intento++) {
    var response;

    try {
      contarFetch_();
      var peticion = {
        method: opciones.method || 'get',
        headers: headers,
        followRedirects: false,
        muteHttpExceptions: true,
        validateHttpsCertificates: true
      };
      if (opciones.payload) {
        peticion.payload = opciones.payload;
        peticion.contentType = opciones.contentType || 'application/json';
      }
      response = UrlFetchApp.fetch(url, peticion);
    } catch (e) {
      if (esErrorDeCuota_(e.message)) {
        marcarCuotaAgotada_(e.message);
        logErr_('CUOTA', 'Cuota de UrlFetch agotada en esta cuenta', { original: e.message });
        throw new Error(MSG_CUOTA + '\n\nMensaje de Google: ' + e.message);
      }
      if (/authorization|permission|autorizaci|permiso/i.test(e.message)) throw e;

      ultimoError = e;
      logWarn_('FETCH', 'Error de red (' + intento + '/' + FETCH_REINTENTOS + '): ' + e.message);
      if (intento < FETCH_REINTENTOS) { Utilities.sleep(1500 * intento); continue; }
      throw new Error('Fallo de red tras ' + FETCH_REINTENTOS + ' intentos: ' + e.message);
    }

    var code = response.getResponseCode();

    // Problema temporal del sitio: aqui si vale reintentar.
    if (code >= 500 || code === 429) {
      ultimoError = new Error('HTTP ' + code);
      logWarn_('FETCH', 'HTTP ' + code + ' (' + intento + '/' + FETCH_REINTENTOS + ')');
      if (intento < FETCH_REINTENTOS) { Utilities.sleep(2000 * intento); continue; }
      throw new Error('El sitio respondio HTTP ' + code + ' tras ' + FETCH_REINTENTOS + ' intentos.');
    }

    return { codigo: code, texto: response.getContentText(), modo: modo };
  }

  throw ultimoError || new Error('Fallo desconocido en fetch.');
}

/** Error claro: que credencial murio y que hacer. */
function msgRechazo_(tipo, code, ruta, desdeLlave, relogin) {
  if (tipo === 'LLAVE') {
    return 'LLAVE rechazada (HTTP ' + code + ') en ' + ruta + ' y no hay cookie de respaldo.\n\n' +
      'Entra al site en Chrome con la extension "Site Sheet - Cookie": manda la cookie sola.\n' +
      'O revisa la llave en /api-docs.';
  }
  var login = String(relogin || '').replace(/^ya:/, '');
  return 'Cookie de sesion rechazada (HTTP ' + code + ') en ' + ruta +
    (desdeLlave ? ' (la llave tambien).' : '.') + '\n\n' +
    (login === 'login-fallo' || login.indexOf('error:') === 0
      ? 'El login automatico tambien fallo (Log, etapa LOGIN).\n\n' : '') +
    'Entra al site en Chrome con la extension "Site Sheet - Cookie": manda una cookie nueva sola.\n' +
    'A mano: menu > Configuracion > Actualizar cookie.';
}

/* ================ DESCUBRIR EL ENDPOINT DE PRECIOS ================ */

/**
 * La pagina /precios-em existe; lo que no sabemos es si hay una ruta
 * hermana que devuelva JSON, como /stock-odoo-data lo es de /stock-odoo.
 *
 * En vez de adivinar, se prueban las candidatas con el token puesto y
 * se reporta cual contesta JSON. Cuesta unas pocas llamadas, una sola vez.
 */
function descubrirEndpointPrecios_() {
  var hallazgos = [];

  for (var i = 0; i < CANDIDATAS_PRECIOS.length; i++) {
    var ruta = CANDIDATAS_PRECIOS[i];
    var r;
    try {
      r = fetchSitio_(ruta, { silencioso: true, crudo: true });
    } catch (e) {
      hallazgos.push({ ruta: ruta, resultado: 'error: ' + e.message.split('\n')[0] });
      continue;
    }

    if (r.codigo !== 200) {
      // Distinguir "no existe" de "no me dejaron pasar" es la diferencia entre
      // agregar una ruta en el servidor y arreglar el token. No confundirlas.
      var etiqueta =
        (r.codigo === 404) ? 'no existe (404)' :
        (r.codigo === 401 || r.codigo === 403) ? 'credencial rechazada (' + r.codigo + ')' :
        (r.codigo === 302 || r.codigo === 303) ? 'credencial rechazada, redirige al login' :
        'HTTP ' + r.codigo;
      hallazgos.push({ ruta: ruta, resultado: etiqueta });
      continue;
    }

    var t = String(r.texto || '').trim();
    if (t.charAt(0) === '{' || t.charAt(0) === '[') {
      hallazgos.push({ ruta: ruta, resultado: 'JSON', muestra: t.substring(0, 300), sirve: true });
    } else {
      hallazgos.push({ ruta: ruta, resultado: 'HTML u otra cosa' });
    }

    Utilities.sleep(300);
  }

  return hallazgos;
}

/* ================ ANALIZAR LA PAGINA DE PRECIOS ================ */

/**
 * Cuando adivinar el nombre de la ruta falla, se lee la pagina y se
 * busca por donde pide ella misma los datos.
 *
 * Tres formas en que una pagina asi puede tener los datos:
 *
 *  a) los pide con fetch/XHR a una ruta  -> la sacamos del JS
 *  b) los trae incrustados en un <script> -> los leemos de ahi
 *  c) los pinta el servidor en el HTML    -> hay que parsear la tabla
 *
 * Esto distingue entre las tres y, si encuentra una ruta, la prueba.
 */
function analizarPaginaPrecios_() {
  var reporte = { rutas: [], incrustado: null, scripts: [], nota: '' };

  var pagina = fetchSitio_(RUTA_PRECIOS_PAGINA, { crudo: true });
  var html = pagina.texto || '';
  reporte.bytes = html.length;

  // --- a) rutas que la pagina pide sola ---
  agregarRutas_(reporte, html);

  // --- b) datos incrustados en el HTML ---
  var incrustado =
    html.match(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]{50,}?)<\/script>/i) ||
    html.match(/(?:const|let|var)\s+\w*(?:DATA|ITEMS|PRODUCTOS|ROWS|PRECIOS)\w*\s*=\s*(\[[\s\S]{200,}?\]|\{[\s\S]{200,}?\})\s*[;\n]/i);

  if (incrustado) {
    reporte.incrustado = incrustado[1].substring(0, 400);
  }

  // --- scripts externos: ahi suele estar el fetch ---
  var re = /<script[^>]+src=["']([^"']+)["']/gi, m;
  var externos = [];
  while ((m = re.exec(html)) !== null) {
    var src = m[1];
    if (/^https?:\/\//i.test(src) && src.indexOf(SITE) !== 0) continue; // solo los del sitio
    externos.push(src);
  }
  reporte.scripts = externos;

  // Se revisan hasta 4, que es donde suele estar la logica de la pagina
  for (var i = 0; i < Math.min(externos.length, 4); i++) {
    try {
      var js = fetchSitio_(externos[i], { crudo: true, silencioso: true });
      if (js.codigo === 200) agregarRutas_(reporte, js.texto || '', externos[i]);
      Utilities.sleep(250);
    } catch (e) { /* un script que no se deja leer no detiene el analisis */ }
  }

  // --- probar las rutas encontradas ---
  // Primero se descarta lo que claramente no es de precios: la pagina carga
  // cosas de otros modulos (tareas, notificaciones) y no queremos guardar esas.
  reporte.rutas = reporte.rutas.filter(function (r) {
    return /precio/i.test(r.ruta) && r.ruta !== RUTA_PRECIOS_PAGINA;
  });

  for (var j = 0; j < reporte.rutas.length; j++) {
    probarCandidata_(reporte.rutas[j]);
    Utilities.sleep(250);
  }

  // Ranking: la que trae la lista de productos gana. "lista" y "datos" son
  // los nombres tipicos; config y catalogo son de apoyo, no la tabla.
  reporte.rutas.sort(function (a, b) { return puntaje_(b) - puntaje_(a); });

  if (!reporte.rutas.length && !reporte.incrustado) {
    reporte.nota = 'La pagina no pide datos por su cuenta ni los trae incrustados: ' +
                   'lo mas probable es que el servidor le pinte la tabla ya hecha.';
  }

  return reporte;
}

/** Saca de un texto las URLs que parezcan peticiones de datos. */
function agregarRutas_(reporte, texto, origen) {
  var patrones = [
    /fetch\(\s*[`'"]([^`'"]+)[`'"]/g,
    /\.open\(\s*['"][A-Z]+['"]\s*,\s*[`'"]([^`'"]+)[`'"]/g,
    /(?:url|endpoint|api)\s*[:=]\s*[`'"](\/[^`'"]+)[`'"]/gi,
    /[`'"](\/[a-z0-9_\-\/]*(?:precio|price|data|json|api)[a-z0-9_\-\/\.]*)[`'"]/gi
  ];

  for (var p = 0; p < patrones.length; p++) {
    var m;
    while ((m = patrones[p].exec(texto)) !== null) {
      var u = m[1];
      if (!u || u.length > 200) continue;
      if (/\.(css|png|jpe?g|svg|woff2?|ico|gif)(\?|$)/i.test(u)) continue;
      if (u.indexOf('//') === 0 || (/^https?:/i.test(u) && u.indexOf(SITE) !== 0)) continue;

      var limpia = u.split('#')[0];
      var ya = reporte.rutas.some(function (r) { return r.ruta === limpia; });
      if (!ya) reporte.rutas.push({ ruta: limpia, origen: origen || 'la pagina' });
    }
  }
}


/**
 * Prueba una ruta con GET y, si contesta 405, la reintenta con POST.
 *
 * Un 405 no es un fracaso: es el servidor diciendo "esta ruta existe, pero
 * no se pide asi". En una pagina con botones que filtran sin recargar, lo
 * normal es que la lista se pida por POST con el filtro en el cuerpo.
 */
function probarCandidata_(cand) {
  // El cuerpo lleva los nombres mas comunes a la vez. Un servidor ignora los
  // campos que no conoce, asi que probar varios alias sale gratis.
  var cuerpo = JSON.stringify({
    master: 'elemex', banda: 'maximo',
    m: 'elemex', b: 'maximo',
    modo: 'maximo', tipo: 'maximo'
  });

  try {
    var r = fetchSitio_(cand.ruta, { crudo: true, silencioso: true });
    cand.codigo = r.codigo;
    cand.metodo = 'GET';

    if (r.codigo === 405) {
      Utilities.sleep(200);
      var rp = fetchSitio_(cand.ruta, {
        crudo: true, silencioso: true,
        method: 'post', payload: cuerpo, contentType: 'application/json'
      });
      cand.codigo = rp.codigo;
      cand.metodo = 'POST';
      r = rp;
    }

    var t = String(r.texto || '').trim();
    cand.esJson = (r.codigo === 200 && (t.charAt(0) === '{' || t.charAt(0) === '['));
    if (cand.esJson) cand.muestra = t.substring(0, 400);
    cand.bytes = t.length;

  } catch (e) {
    cand.codigo = 'error';
    cand.error = String(e.message).split('\n')[0];
  }
}

/** Que tan probable es que esta ruta sea la tabla de precios. */
function puntaje_(c) {
  var p = 0;
  if (c.esJson) p += 100;
  if (c.bytes > 5000) p += 40;          // una tabla de productos pesa
  if (/lista|listado/i.test(c.ruta)) p += 30;
  if (/dat(a|os)|export|tabla/i.test(c.ruta)) p += 25;
  if (/config|categoria|hist|badge/i.test(c.ruta)) p -= 20;
  if (/capturar|soltar|mover|publicado|subscribe/i.test(c.ruta)) p -= 40;  // escriben, no leen
  return p;
}

/* ================ AVISO DE CREDENCIAL MUERTA ================ */

/**
 * Una cookie vencida no avisa: el trigger sigue corriendo, falla en silencio,
 * y las hojas se quedan congeladas con datos de hace dias. Para cuando alguien
 * lo nota, ya tomo decisiones con numeros viejos.
 *
 * Por eso, la primera vez en el dia que una credencial falla, sale un correo.
 * Una vez al dia POR TIPO (LLAVE / COOKIE), no en cada corrida: un buzon lleno
 * de alertas se ignora igual que ninguna alerta.
 *   tipo: 'LLAVE' o 'COOKIE' (la que murio). Sin tipo se deduce como antes.
 */
function avisarCredencialMuerta_(detalle, tipo) {
  try {
    tipo = tipo || (props_().getProperty(PROP.TOKEN) ? 'LLAVE' : 'COOKIE');
    if (diaTipoEs_('AVISO_CRED_DIA', tipo)) return;   // ya avisamos hoy de esta

    // El correo sale de Script Properties (AVISO_CORREO, se pone una vez en el menu).
    // Session.getEffectiveUser() ya no sirve aqui: el manifiesto no pide userinfo.email
    // y agregarlo obliga a reautorizar todo el proyecto.
    var correo = String(props_().getProperty('AVISO_CORREO') || '').trim();
    if (!correo) { try { correo = Session.getEffectiveUser().getEmail() || ''; } catch (x) {} }
    if (!correo) {
      logWarn_('AVISO', 'No hay correo para los avisos. Menu Configuracion > Poner correo de avisos.');
      return;
    }

    MailApp.sendEmail({
      to: correo,
      subject: 'Site Sheet: la ' + tipo + ' del site dejo de servir',
      body:
        'Las descargas automaticas de Site Sheet estan fallando.\n\n' +
        'Credencial que fallo: ' + tipo + '\n' +
        'Detalle: ' + detalle + '\n\n' +
        (tipo === 'COOKIE'
          ? 'La cookie de sesion ya no sirve. Entra al site en Chrome con la extension\n' +
            '"Site Sheet - Cookie" activa: manda una cookie nueva sola.\n' +
            'A mano: menu SITE SHEET > Configuracion > Actualizar cookie.\n\n'
          : 'El site rechazo la LLAVE y no hay cookie de respaldo.\n' +
            'Entra al site en Chrome con la extension "Site Sheet - Cookie" activa para\n' +
            'que mande la cookie, o revisa la llave en /api-docs.\n\n') +
        'Mientras tanto las hojas conservan los ultimos datos buenos:\n' +
        'nada se borro, nada mas dejo de actualizarse.\n'
    });

    diaTipoPon_('AVISO_CRED_DIA', tipo);
    logInfo_('AVISO', 'Se envio correo de ' + tipo + ' muerta a ' + correo);

  } catch (e) {
    logWarn_('AVISO', 'No se pudo enviar el correo: ' + e.message);
  }
}

/* ================ UNA VEZ AL DIA, POR TIPO ================ */

/**
 * Marcas "ya se aviso hoy" de varios tipos en UNA propiedad de usuario, con
 * formato "LLAVE=2026-10-21;COOKIE=2026-10-20". Asi la llave y la cookie no
 * se pisan, y borrar la propiedad (Setup) reinicia todas.
 */
function diaTipoLeer_(prop) {
  var m = {};
  try {
    String(propsUser_().getProperty(prop) || '').split(';').forEach(function (par) {
      var i = par.indexOf('=');
      if (i > 0) m[par.substring(0, i)] = par.substring(i + 1);
    });
  } catch (e) {}
  return m;
}

function diaTipoGuardar_(prop, m) {
  try {
    var txt = Object.keys(m).map(function (k) { return k + '=' + m[k]; }).join(';');
    if (txt) propsUser_().setProperty(prop, txt); else propsUser_().deleteProperty(prop);
  } catch (e) {}
}

function diaTipoEs_(prop, tipo)  { return diaTipoLeer_(prop)[tipo] === hoy_(); }
function diaTipoPon_(prop, tipo) { var m = diaTipoLeer_(prop); m[tipo] = hoy_(); diaTipoGuardar_(prop, m); }
function diaTipoQuita_(prop, tipo) {
  var m = diaTipoLeer_(prop);
  if (!(tipo in m)) return;
  delete m[tipo];
  diaTipoGuardar_(prop, m);
}

/** Una fila en el Log por dia y por tipo (LLAVE rechazada, LOGIN fallido...). */
function avisoLogDia_(tipo, nivel, etapa, mensaje) {
  if (diaTipoEs_('AVISO_LOG_DIA', tipo)) return;
  diaTipoPon_('AVISO_LOG_DIA', tipo);
  logRow_(nivel, etapa, mensaje);
}

/* ================ EXPORTAR A XLSX ================ */

/**
 * Exporta un libro de Google a .xlsx y devuelve el Blob con ese nombre.
 * Reintenta 3 veces ante 429/5xx (Google a veces contesta "ocupado").
 */
function exportarXlsx_(idLibro, nombreArchivo) {
  var url = 'https://docs.google.com/spreadsheets/d/' + idLibro + '/export?format=xlsx';
  var cod = 0;
  for (var i = 0; i <= 3; i++) {
    if (i) Utilities.sleep(2000 * Math.pow(2, i - 1));   // 2 s, 4 s, 8 s
    var resp = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    cod = resp.getResponseCode();
    if (cod === 200) return resp.getBlob().setName(nombreArchivo);
    if (cod !== 429 && cod < 500) break;               // 4xx de verdad: no sirve reintentar
  }
  throw new Error('No se pudo exportar el archivo (HTTP ' + cod + ').');
}
