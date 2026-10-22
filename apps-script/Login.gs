/**
 * ============================================================
 *  Login — el script entra al site solo y renueva la cookie
 * ============================================================
 *
 *  El problema que resuelve: la cookie de sesion vence cada tantos
 *  dias y hay que ir a DevTools a copiarla otra vez. Apps Script no
 *  puede ver tu navegador, pero SI puede hacer login por su cuenta,
 *  igual que lo harias tu, y quedarse con la cookie que le den.
 *
 *  Como funciona:
 *    1. Se guardan correo y contrasena en PropertiesService (una vez)
 *    2. Cuando una peticion falla por credencial, el script hace login
 *       solo (una vez por ejecucion), valida la cookie nueva con un GET
 *       real y REINTENTA la peticion
 *    3. Nadie se entera de nada
 *
 *  SOBRE GUARDAR LA CONTRASENA — hay que decirlo claro:
 *
 *  PropertiesService guarda cifrado y no aparece en el repo ni en
 *  ningun archivo. Pero es la contrasena de TU cuenta del site, y
 *  cualquiera con acceso de edicion a este proyecto de Apps Script
 *  puede leerla. Es un trueque real: comodidad a cambio de que esa
 *  credencial viva en un lugar mas.
 *
 *  Lo mas seguro sigue siendo un token de API en el servidor: no
 *  expira, no es tu contrasena, y solo sirve para leer. Esto es el
 *  segundo mejor lugar, no el primero. Si algun dia puedes crear un
 *  usuario aparte solo-lectura para el script, mejor todavia.
 */

var PROP_LOGIN = {
  USER:       'SITE_USER',
  PASS:       'SITE_PASS',
  RUTA:       'LOGIN_RUTA',
  CAMPO_USER: 'LOGIN_CAMPO_USER',
  CAMPO_PASS: 'LOGIN_CAMPO_PASS',
  EXTRA:      'LOGIN_CAMPOS_EXTRA'
};

var CANDIDATAS_LOGIN = [
  '/login', '/entrar', '/acceso', '/signin', '/sign-in',
  '/auth/login', '/accounts/login', '/usuarios/login', '/'
];

/** Evita que un login fallido se llame a si mismo para siempre. */
var RENOVANDO = false;

/* ================ FETCH SIN CREDENCIALES ================ */

/**
 * Peticion cruda: sin token, sin cookie guardada. Para el login hay que
 * empezar limpio — mandar una cookie vieja y vencida solo confunde al
 * servidor, y a veces hace que rechace el login.
 */
function fetchCrudo_(ruta, opciones) {
  opciones = opciones || {};
  contarFetch_();

  var url = /^https?:\/\//i.test(ruta) ? ruta : SITE + (ruta.charAt(0) === '/' ? ruta : '/' + ruta);

  var headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; SiteSheet/1.0)',
    'Accept': 'text/html,application/json'
  };
  if (opciones.cookie)   headers['Cookie']  = opciones.cookie;
  if (opciones.referer)  headers['Referer'] = opciones.referer;

  var peticion = {
    method: opciones.method || 'get',
    headers: headers,
    followRedirects: false,
    muteHttpExceptions: true,
    validateHttpsCertificates: true
  };
  if (opciones.payload) peticion.payload = opciones.payload;

  var r = UrlFetchApp.fetch(url, peticion);
  return { codigo: r.getResponseCode(), texto: r.getContentText(), headers: r.getAllHeaders(), url: url };
}

/* ================ COOKIES ================ */

/**
 * Junta los Set-Cookie de una respuesta en un solo header Cookie.
 * Apps Script devuelve string cuando hay uno y arreglo cuando hay varios,
 * asi que hay que aceptar las dos formas o se rompe justo cuando el
 * servidor manda dos cookies.
 */
function cookiesDe_(headers) {
  var crudo = headers['Set-Cookie'] || headers['set-cookie'];
  if (!crudo) return '';

  var lista = Array.isArray(crudo) ? crudo : [crudo];
  var pares = [];

  lista.forEach(function (c) {
    var par = String(c).split(';')[0].trim();
    if (par && par.indexOf('=') > 0) pares.push(par);
  });

  return pares.join('; ');
}

/** Saca el valor de una cookie por nombre de un header Cookie armado. */
function valorCookie_(cookieHeader, nombre) {
  var m = String(cookieHeader || '').match(new RegExp('(?:^|;\\s*)' + nombre + '=([^;]+)'));
  return m ? m[1] : '';
}

/* ================ DESCUBRIR EL FORMULARIO ================ */

/**
 * Busca la pagina de login y aprende como se llaman sus campos.
 * Se hace una vez y se guarda: adivinar "username" cuando el campo se
 * llama "correo" es la forma mas comun de que esto falle en silencio.
 */
function descubrirLogin_() {
  for (var i = 0; i < CANDIDATAS_LOGIN.length; i++) {
    var ruta = CANDIDATAS_LOGIN[i];
    var r;
    try { r = fetchCrudo_(ruta); } catch (e) { continue; }

    if (r.codigo !== 200 || !/type=["']password["']/i.test(r.texto)) {
      Utilities.sleep(200);
      continue;
    }

    var form = formaConPassword_(r.texto);
    if (!form) continue;

    var campos = camposDe_(form);
    if (!campos.pass) continue;

    var accion = (form.match(/<form[^>]+action=["']([^"']*)["']/i) || [])[1];
    if (!accion || accion === '#') accion = ruta;

    return {
      ruta: ruta,
      accion: accion,
      campoUser: campos.user,
      campoPass: campos.pass,
      extra: campos.ocultos
    };
  }
  return null;
}

/** De todos los <form> de la pagina, el que trae el campo de password. */
function formaConPassword_(html) {
  var re = /<form[\s\S]*?<\/form>/gi, m;
  while ((m = re.exec(html)) !== null) {
    if (/type=["']password["']/i.test(m[0])) return m[0];
  }
  return null;
}

/** Nombres de los campos: usuario, password y los ocultos (CSRF y compania). */
function camposDe_(form) {
  var salida = { user: '', pass: '', ocultos: {} };
  var re = /<input[^>]*>/gi, m;

  while ((m = re.exec(form)) !== null) {
    var tag    = m[0];
    var nombre = (tag.match(/name=["']([^"']+)["']/i) || [])[1];
    if (!nombre) continue;

    var tipo  = ((tag.match(/type=["']([^"']+)["']/i) || [])[1] || 'text').toLowerCase();
    var valor = (tag.match(/value=["']([^"']*)["']/i) || [])[1] || '';

    if (tipo === 'password') { salida.pass = nombre; continue; }
    if (tipo === 'hidden')   { salida.ocultos[nombre] = valor; continue; }

    if (!salida.user && /user|mail|correo|usuario|login|cuenta/i.test(nombre)) salida.user = nombre;
    else if (!salida.user && (tipo === 'text' || tipo === 'email'))            salida.user = nombre;
  }

  return salida;
}

/* ================ RENOVAR LA COOKIE ================ */

/**
 * Re-login automatico: UNA vez por ejecucion como maximo. Todas las llamadas
 * de la corrida (killers, promos, stock...) comparten esta bandera, asi un
 * login roto no se repite 6 veces por corrida.
 */
var RELOGIN = { hecho: false, estado: '' };

/**
 * Lo llama fetchSitio_ cuando el site rechaza la cookie. Devuelve
 * { hecho: true si AHORA se consiguio cookie nueva, estado }.
 *   estado: renovada | login-fallo | no-validada | sin-credenciales | error:...
 *           con prefijo "ya:" si ya se intento antes en esta ejecucion.
 * El error queda en el Log una vez al dia, no en cada corrida.
 */
function reloginUnaVez_() {
  if (RELOGIN.hecho) return { hecho: false, estado: 'ya:' + RELOGIN.estado };
  RELOGIN.hecho = true;

  if (!puedeRenovarSolo_()) { RELOGIN.estado = 'sin-credenciales'; return { hecho: false, estado: RELOGIN.estado }; }
  if (RENOVANDO) { RELOGIN.estado = 'login-fallo'; return { hecho: false, estado: RELOGIN.estado }; }

  RENOVANDO = true;
  var r;
  try { r = loginSite_(); }
  catch (e) { r = { ok: false, estado: 'error:' + e.message, motivo: 'Fallo la renovacion: ' + e.message }; }
  finally { RENOVANDO = false; }

  RELOGIN.estado = r.ok ? 'renovada' : r.estado;
  if (r.ok) logOk_('LOGIN', 'Cookie renovada sola (re-login automatico, ' + r.motivo + ')');
  else avisoLogDia_('LOGIN', 'ERROR', 'LOGIN', 'Re-login automatico: ' + r.motivo + ' (aviso 1 vez al dia)');
  return { hecho: !!r.ok, estado: RELOGIN.estado };
}

/**
 * Hace login y guarda la cookie nueva. Devuelve true si funciono.
 * Es la que usa el menu (Setup): siempre intenta y siempre deja el Log.
 */
function renovarCookie_() {
  if (RENOVANDO) return false;
  RENOVANDO = true;

  try {
    var r = loginSite_();
    RELOGIN.hecho = true;   // cuenta como el re-login de esta ejecucion
    RELOGIN.estado = r.ok ? 'renovada' : r.estado;
    if (!r.ok) {
      if (r.estado === 'sin-credenciales') logWarn_('LOGIN', r.motivo);
      else logErr_('LOGIN', r.motivo);
      return false;
    }
    logOk_('LOGIN', 'Cookie renovada sola (' + r.motivo + ')');
    return true;

  } catch (e) {
    logErr_('LOGIN', 'Fallo la renovacion: ' + e.message);
    return false;
  } finally {
    RENOVANDO = false;
  }
}

/**
 * El login en si, sin Log. Devuelve { ok, estado, motivo }.
 *
 * El detalle que hace que esto funcione: los campos ocultos (CSRF) se
 * vuelven a leer JUSTO ANTES de mandar el formulario, y se manda tambien
 * la cookie que el servidor dio al pintar esa pagina. Un token CSRF esta
 * amarrado a la sesion que lo emitio: si mandas uno guardado de ayer,
 * el servidor lo rechaza y parece que la contrasena esta mal.
 */
function loginSite_() {
  var p = props_();
  var usuario = p.getProperty(PROP_LOGIN.USER);
  var clave   = p.getProperty(PROP_LOGIN.PASS);
  if (!usuario || !clave) {
    return { ok: false, estado: 'sin-credenciales',
             motivo: 'No hay credenciales de login guardadas, no puedo renovar solo' };
  }

  var ruta       = p.getProperty(PROP_LOGIN.RUTA);
  var campoUser  = p.getProperty(PROP_LOGIN.CAMPO_USER);
  var campoPass  = p.getProperty(PROP_LOGIN.CAMPO_PASS);

  if (!ruta || !campoUser || !campoPass) {
    var d = descubrirLogin_();
    if (!d) return { ok: false, estado: 'login-fallo', motivo: 'No encontre el formulario de login en el site' };
    ruta = d.ruta; campoUser = d.campoUser; campoPass = d.campoPass;
    p.setProperties({
      LOGIN_RUTA: ruta, LOGIN_CAMPO_USER: campoUser, LOGIN_CAMPO_PASS: campoPass
    }, false);
  }

  // 1. Abrir la pagina de login: de ahi salen el CSRF fresco y la cookie inicial
  var pagina = fetchCrudo_(ruta);
  var cookieInicial = cookiesDe_(pagina.headers);

  var ocultos = {};
  var form = formaConPassword_(pagina.texto);
  if (form) ocultos = camposDe_(form).ocultos;

  var accion = form ? ((form.match(/<form[^>]+action=["']([^"']*)["']/i) || [])[1] || ruta) : ruta;
  if (!accion || accion === '#') accion = ruta;

  // 2. Mandar el formulario
  var payload = {};
  for (var k in ocultos) payload[k] = ocultos[k];
  payload[campoUser] = usuario;
  payload[campoPass] = clave;

  var resp = fetchCrudo_(accion, {
    method: 'post',
    payload: payload,
    cookie: cookieInicial,
    referer: SITE + ruta
  });

  // 3. Quedarnos con la cookie de sesion
  var nuevas = cookiesDe_(resp.headers);
  var sesion = valorCookie_(nuevas, 'session');

  if (!sesion) {
    // Hay sitios que renuevan la cookie sin cambiarle el nombre; si el
    // servidor no mando nada nuevo, la de la pagina inicial ya sirve.
    sesion = valorCookie_(cookieInicial, 'session');
  }

  // Filtro rapido: 200 con el formulario otra vez = no entro. Un 3xx NO
  // prueba nada (un login malo tambien redirige): se valida abajo con GET.
  var entro = (resp.codigo >= 300 && resp.codigo < 400) ||
              (resp.codigo === 200 && !/type=["']password["']/i.test(resp.texto));

  if (!entro || !sesion) {
    return { ok: false, estado: 'login-fallo',
             motivo: 'El login no paso (HTTP ' + resp.codigo + '). Revisa correo y contrasena en Configuracion.' };
  }

  // 4. Validar con un GET real (200 con JSON) antes de darla por buena
  var dec = decidirCookie_(sesion);
  if (!dec.guardar) {
    return { ok: false, estado: dec.estado === 'mala' ? 'login-fallo' : 'no-validada',
             motivo: 'Login hecho (HTTP ' + resp.codigo + ') pero la cookie no se guardo: ' + dec.motivo };
  }

  guardarCookie_(sesion, 'login');
  return { ok: true, estado: 'renovada', motivo: dec.motivo };
}

/** True si hay con que renovar sin molestar a nadie. */
function puedeRenovarSolo_() {
  var p = props_();
  return !!(p.getProperty(PROP_LOGIN.USER) && p.getProperty(PROP_LOGIN.PASS));
}
