/**
 * ============================================================
 *  CookieExtension — recibe la cookie que manda la extension de Chrome
 * ============================================================
 *
 * Apps Script corre en Google y no puede ver tu navegador. La extension
 * "Site Sheet - Cookie" (carpeta extension-cookie/) si: cuando entras al
 * site detecta la cookie "session" y la manda aqui por POST. Asi la cookie
 * del Sheet se renueva sola, sin pegarla a mano.
 *
 * Seguridad:
 *   - Solo POST (doPost en WebAPI.gs). Por GET la cookie quedaria en la URL.
 *   - Exige la clave de la extension (Script Properties, EXT_CLAVE), que se
 *     genera desde el menu. Comparacion en tiempo constante.
 *   - 10 claves malas seguidas bloquean 10 minutos.
 *   - Antes de guardar, la cookie se prueba contra el site: si no inicia
 *     sesion (visitante, vencida) NO se guarda y la buena se queda.
 *   - Aqui no hay credenciales: la clave vive solo en Script Properties.
 */

var EXT_PROP_CLAVE = 'EXT_CLAVE';
var EXT_MAX_FALLOS = 10;
var EXT_BLOQUEO_SEG = 600;
var EXT_RUTA_PRUEBA = '/precios-em/api/lista';

/** Llamado por doPost cuando accion === 'cookie'. Devuelve un objeto JSON-able. */
function recibirCookieExtension_(p) {
  var cache = CacheService.getScriptCache();
  if (Number(cache.get('EXT_FALLOS') || 0) >= EXT_MAX_FALLOS) {
    return { ok: false, error: 'bloqueado_espera_10_min' };
  }

  var clave = props_().getProperty(EXT_PROP_CLAVE);
  if (!clave) return { ok: false, error: 'sin_clave_genera_en_el_menu' };

  if (!igualesSeguro_(String(p.clave || ''), clave)) {
    var n = Number(cache.get('EXT_FALLOS') || 0) + 1;
    cache.put('EXT_FALLOS', String(n), EXT_BLOQUEO_SEG);
    logWarn_('EXTENSION', 'Clave incorrecta (intento ' + n + ' de ' + EXT_MAX_FALLOS + ')');
    flushLog_();
    return { ok: false, error: 'no_autorizado' };
  }
  cache.remove('EXT_FALLOS');

  var cookie = String(p.cookie || '').replace(/^session\s*=\s*/i, '').trim();
  if (!/^[A-Za-z0-9._~+\/=%-]{20,4000}$/.test(cookie)) {
    return { ok: false, error: 'cookie_invalida' };
  }

  if (cookie === props_().getProperty(PROP.COOKIE)) return { ok: true, igual: true };

  // Probar contra el site antes de guardar.
  var r;
  try {
    r = fetchCrudo_(EXT_RUTA_PRUEBA, { cookie: 'session=' + cookie });
  } catch (e) {
    logWarn_('EXTENSION', 'No pude probar la cookie recibida: ' + e.message);
    flushLog_();
    return { ok: false, error: 'no_pude_verificar' };
  }
  // Esta ruta contesta 401 cuando la sesion no sirve (es lo que ya ve Precios.gs);
  // con sesion buena contesta 200, o 405 si no le gusta el GET. Login y
  // redirecciones (3xx) tampoco cuentan como sesion.
  var entro = r.codigo !== 401 && r.codigo !== 403 && r.codigo < 300 || r.codigo === 405;
  if (!entro) {
    logWarn_('EXTENSION', 'Cookie recibida sin sesion valida (HTTP ' + r.codigo + '); no se guardo');
    flushLog_();
    return { ok: false, error: 'sesion_no_valida', http: r.codigo };
  }

  guardarCookie_(cookie, 'extension');
  logOk_('EXTENSION', 'Cookie recibida de la extension y guardada');
  flushLog_();
  return { ok: true, guardada: true };
}

/**
 * Menu: genera o muestra la clave y la URL que se pegan en la extension.
 * Si ya hay clave: Si = verla, No = generar una nueva (la extension instalada
 * deja de funcionar hasta pegarle la nueva).
 */
function uiClaveExtension() {
  var ui = SpreadsheetApp.getUi();
  var p = props_();
  var clave = p.getProperty(EXT_PROP_CLAVE);

  if (clave) {
    var b = ui.alert('Clave de la extension',
      'Ya hay una clave.\n\nSi = ver la actual\nNo = generar una nueva',
      ui.ButtonSet.YES_NO_CANCEL);
    if (b === ui.Button.CANCEL || b === ui.Button.CLOSE) return;
    if (b === ui.Button.NO) clave = '';
  }
  if (!clave) {
    clave = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    p.setProperty(EXT_PROP_CLAVE, clave);
  }

  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  if (!url) {
    ui.alert('Falta implementar el Web App',
      'Implementar > Administrar implementaciones > lapiz > Version: Nueva version.\n' +
      'Despues vuelve a abrir esta opcion.', ui.ButtonSet.OK);
    return;
  }

  var html = HtmlService.createHtmlOutput(
    '<div style="font:14px Arial;line-height:1.5">' +
    '<p><b>URL</b></p><input id="u" readonly style="width:100%" value="' + url + '">' +
    '<p><b>Clave</b></p><input id="k" readonly style="width:100%" value="' + clave + '">' +
    '<p style="color:#555">Pegalas en Opciones de la extension. No las compartas.</p>' +
    '<button onclick="c(\'u\')">Copiar URL</button> <button onclick="c(\'k\')">Copiar clave</button>' +
    '<script>function c(i){var e=document.getElementById(i);e.select();document.execCommand("copy");}</script>' +
    '</div>').setWidth(520).setHeight(260);
  ui.showModalDialog(html, 'Extension de cookie');
}
