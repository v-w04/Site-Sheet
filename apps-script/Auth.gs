/**
 * ============================================================
 *  Auth — password del dashboard, sesiones y freno de fuerza bruta
 * ============================================================
 *
 * El Web App se despliega con acceso "Cualquiera" a proposito:
 * si Google fuera el portero, bloquearia el fetch desde GitHub
 * Pages y el dashboard no cargaria nada. El portero es este
 * archivo.
 *
 * Por eso aqui si importa hacerlo bien:
 *   - sal por instalacion, para que dos passwords iguales no den
 *     el mismo hash y una tabla precalculada no sirva
 *   - estiramiento de clave, para que cada intento cueste tiempo
 *   - bloqueo por intentos fallidos, para que no se pueda probar
 *     en lote
 *
 * Nada de esto se configura en el codigo. Ver Setup.gs.
 */

/* ================ PASSWORD ================ */

function guardarPassword_(pw) {
  var sal = Utilities.base64Encode(
    Utilities.getUuid() + '|' + new Date().getTime()
  );
  props_().setProperties({
    DASH_PW_SALT: sal,
    DASH_PW_HASH: hashPassword_(pw, sal)
  }, false);
}

/**
 * SHA-256 aplicado ITERACIONES_HASH veces sobre sal+password.
 * Apps Script no trae PBKDF2, pero iterar el digest da el mismo
 * efecto practico: encarece cada intento del atacante.
 */
function hashPassword_(pw, sal) {
  var x = sal + '|' + pw;
  for (var i = 0; i < ITERACIONES_HASH; i++) {
    x = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, x, Utilities.Charset.UTF_8)
    );
  }
  return x;
}

/**
 * Comparacion en tiempo constante. Comparar con === se rinde en
 * el primer caracter distinto y ese tiempo, medido, filtra el hash.
 */
function igualesSeguro_(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  var dif = 0;
  for (var i = 0; i < a.length; i++) {
    dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return dif === 0;
}

function verifyPassword_(pw) {
  var p = props_();
  var hash = p.getProperty(PROP.PW_HASH);
  var sal  = p.getProperty(PROP.PW_SALT);
  if (!hash || !sal) {
    throw new Error('No hay password configurado. Menu SITE SHEET > Configuracion.');
  }
  return igualesSeguro_(hashPassword_(pw, sal), hash);
}

/* ================ FRENO DE FUERZA BRUTA ================ */

function claveIntentos_(huella) {
  return 'intentos_' + huella;
}

function estaBloqueado_(huella) {
  var n = CacheService.getScriptCache().get(claveIntentos_(huella));
  return n !== null && Number(n) >= MAX_INTENTOS;
}

function contarFallo_(huella) {
  var c = CacheService.getScriptCache();
  var k = claveIntentos_(huella);
  var n = Number(c.get(k) || 0) + 1;
  c.put(k, String(n), BLOQUEO_MINUTOS * 60);
  return n;
}

function limpiarIntentos_(huella) {
  CacheService.getScriptCache().remove(claveIntentos_(huella));
}

/* ================ SESIONES ================ */

function createSession_() {
  var token = Utilities.getUuid() + '-' + Utilities.getUuid();
  CacheService.getScriptCache().put(
    'sesion_' + token, '1', SESION_HORAS * 3600
  );
  return token;
}

function validateSession_(token) {
  if (!token) return false;
  return CacheService.getScriptCache().get('sesion_' + token) === '1';
}

function destroySession_(token) {
  if (token) CacheService.getScriptCache().remove('sesion_' + token);
}

/* ================ LOGIN ================ */

/**
 * Devuelve { ok, token } o { ok:false, error }.
 * `huella` identifica al que intenta: no tenemos IP en Apps Script,
 * asi que el frontend manda un id de navegador. No es a prueba de
 * todo, pero encarece el ataque casual.
 */
function login_(pw, huella) {
  huella = huella || 'anonimo';

  if (estaBloqueado_(huella)) {
    return { ok: false, error: 'Demasiados intentos. Espera ' + BLOQUEO_MINUTOS + ' minutos.' };
  }

  if (!verifyPassword_(pw)) {
    var n = contarFallo_(huella);
    var quedan = MAX_INTENTOS - n;
    return {
      ok: false,
      error: quedan > 0
        ? 'Password incorrecto. Te quedan ' + quedan + ' intentos.'
        : 'Demasiados intentos. Espera ' + BLOQUEO_MINUTOS + ' minutos.'
    };
  }

  limpiarIntentos_(huella);
  return { ok: true, token: createSession_() };
}
