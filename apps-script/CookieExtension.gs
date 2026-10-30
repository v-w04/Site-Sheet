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
 *   - Antes de guardar, la cookie se prueba con un GET real (200 con JSON):
 *     si no inicia sesion (visitante, vencida) NO se guarda y la buena se
 *     queda. Si no se puede validar, solo reemplaza a una que ya no sirve.
 *   - Aqui no hay credenciales: la clave vive solo en Script Properties.
 */

var EXT_PROP_CLAVE = 'EXT_CLAVE';
var EXT_MAX_FALLOS = 10;
var EXT_BLOQUEO_SEG = 600;

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

  // Probar contra el site antes de guardar: GET real que devuelva 200 con JSON.
  // Un 405 o un 3xx no prueban sesion. Si no se puede saber, no se cambia una
  // cookie buena por una dudosa (decidirCookie_ en Api.gs).
  var dec;
  try {
    dec = decidirCookie_(cookie);
  } catch (e) {
    logWarn_('EXTENSION', 'No pude probar la cookie recibida: ' + e.message);
    flushLog_();
    return { ok: false, error: 'no_pude_verificar' };
  }
  if (!dec.guardar) {
    // La extension reintenta cada ~15 min: en el Log solo 1 fila al dia por motivo.
    avisoLogDia_('EXT_' + dec.estado.toUpperCase(), 'WARN', 'EXTENSION',
      'Cookie recibida y NO guardada: ' + dec.motivo + ' (aviso 1 vez al dia)');
    flushLog_();
    return dec.estado === 'mala' ? { ok: false, error: 'sesion_no_valida' }
                                 : { ok: false, error: 'no_pude_verificar' };
  }

  // El site rota la cookie y la extension la manda cada ~15 min: se guarda siempre,
  // pero en el Log solo queda 1 fila por hora para no llenarlo.
  var ultLog = Number(props_().getProperty('EXT_ULTIMO_LOG') || 0);
  var origenAntes = props_().getProperty('SITE_COOKIE_ORIGEN');
  guardarCookie_(cookie, 'extension');
  if (origenAntes !== 'extension' || Date.now() - ultLog > 55 * 60000) {
    logOk_('EXTENSION', 'Cookie recibida de la extension y guardada');
    props_().setProperty('EXT_ULTIMO_LOG', String(Date.now()));
  }
  flushLog_();
  return { ok: true, guardada: true };
}

/**
 * Menu: genera o muestra la clave y la URL que se pegan en la extension.
 * Si ya hay clave: Si = verla, No = generar una nueva (la extension instalada
 * deja de funcionar hasta pegarle la nueva).
 */
/* URL /exec de la implementacion que SI recibe a la extension (la que prueba el usuario). ScriptApp.getService().getUrl()
   devuelve otra (la de la ultima version) y con esa la extension no llega. Es publica: sin la clave no devuelve nada. */
var EXT_URL_WEBAPP = 'https://script.google.com/macros/s/AKfycbygod1WXxes7JWJS6_u02OPf3e-nJCxgSDN8VgSdam4cPcAI7CgP51-vk-UhP_zwkAR/exec';

function uiClaveExtension() {
  var clave = props_().getProperty(EXT_PROP_CLAVE);
  if (clave) {
    // Botones con nombre: antes era SI/NO/CANCELAR y cada uno significaba otra cosa.
    dlgOpciones_({
      titulo: 'Clave de la extensión',
      texto: 'Ya hay una clave guardada.\n\nSi generas una nueva, la extensión instalada deja de funcionar hasta que le pegues la nueva.',
      manejador: 'cookieClaveOpcion',
      botones: [
        { id: 'VER', texto: 'Ver la clave actual', tipo: 'p' },
        { id: 'NUEVA', texto: 'Generar una clave nueva', tipo: 'r2' }
      ]
    });
    return;
  }
  cookieMostrarClave_(false);
}

/** Lo llama el popup de uiClaveExtension (DLG_PERMITIDOS). */
function cookieClaveOpcion(p) {
  var b = p && p.boton;
  if (b !== 'VER' && b !== 'NUEVA') throw new Error('Opcion no valida.');
  dlgLog_('ok', 'Clave de la extensión', b === 'NUEVA' ? 'Generó clave nueva' : 'Vio la clave actual');
  cookieMostrarClave_(b === 'NUEVA');
  return { ok: true, reemplaza: true };
}

function cookieMostrarClave_(nueva) {
  var ui = SpreadsheetApp.getUi();
  var p = props_();
  var clave = nueva ? '' : p.getProperty(EXT_PROP_CLAVE);
  if (!clave) {
    clave = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    p.setProperty(EXT_PROP_CLAVE, clave);
  }

  var url = '';
  url = EXT_URL_WEBAPP;
  if (!url) {
    alertLog_(ui, 'Falta implementar el Web App',
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
