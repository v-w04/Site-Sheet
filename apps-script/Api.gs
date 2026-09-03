/**
 * ============================================================
 *  Api — cliente del sitio
 * ============================================================
 *
 * Autentica con token fijo en X-API-Key. La cookie de sesion queda
 * como respaldo, pero es un parche: vence cada tantos dias y no hay
 * forma de renovarla sola. Apps Script corre en Google, no en tu
 * navegador — no puede ver tu sesion ni saber cuando haces login.
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

function authHeaders_() {
  var p = props_();

  var token = p.getProperty(PROP.TOKEN);
  if (token) return { 'X-API-Key': token, _modo: 'token' };

  var cookie = p.getProperty(PROP.COOKIE);
  if (cookie) return { 'Cookie': 'session=' + cookie, _modo: 'cookie' };

  throw new Error(
    'Sin credenciales. Menu SITE SHEET > Configuracion > "Configurar token API" ' +
    '(o la cookie, como respaldo).'
  );
}

/* ================ CUOTA ================ */

/** El mensaje de cuota llega en el idioma de la cuenta. */
function esErrorDeCuota_(msg) {
  var m = String(msg || '').toLowerCase();
  return (
    /invoked too many times/.test(m) ||   // ingles
    /demasiadas veces/.test(m)       ||   // español
    /trop de fois/.test(m)           ||   // frances
    /muitas vezes/.test(m)           ||   // portugues
    /zu oft/.test(m)                 ||   // aleman
    /too many/.test(m)               ||
    (/urlfetch/.test(m) && /(limit|límite|quota|cuota|día|day)/.test(m))
  );
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

function marcarCuotaAgotada_() {
  try { propsUser_().setProperty(PROP_CUOTA_DIA, hoy_()); } catch (e) {}
}

function cuotaAgotadaHoy_() {
  try { return propsUser_().getProperty(PROP_CUOTA_DIA) === hoy_(); }
  catch (e) { return false; }
}

function limpiarFlagCuota() {
  propsUser_().deleteProperty(PROP_CUOTA_DIA);
  var quien = '';
  try { quien = Session.getEffectiveUser().getEmail() || ''; } catch (e) {}
  SpreadsheetApp.getUi().alert('Flag limpiado',
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

/* ================ FETCH ================ */

/**
 * Trae una ruta del sitio. Devuelve el objeto JSON ya parseado.
 * `opciones.crudo` devuelve { codigo, texto } sin interpretar.
 */
function fetchSitio_(ruta, opciones) {
  opciones = opciones || {};

  if (cuotaAgotadaHoy_() && !opciones.ignorarCuota) {
    throw new Error(MSG_CUOTA +
      '\n\n(Ya detectado hoy en esta cuenta. Menu > "Reintentar tras cuota agotada" para forzar.)');
  }

  var auth = authHeaders_();
  var modo = auth._modo;
  delete auth._modo;

  var headers = Object.assign({
    'Accept': 'application/json',
    'User-Agent': 'GoogleAppsScript-SiteSheet'
  }, auth);

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
        marcarCuotaAgotada_();
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

    // Credencial invalida. Reintentar no sirve de nada.
    if (code === 401 || code === 403 || code === 302 || code === 303) {
      if (opciones.silencioso) return { codigo: code, texto: '' };
      if (modo === 'cookie') {
        throw new Error(
          'Cookie de sesion EXPIRADA (HTTP ' + code + ').\n\n' +
          'Esto va a seguir pasando cada tantos dias mientras uses cookie. ' +
          'La solucion de fondo es que el servidor acepte X-API-Key en esta ruta ' +
          'y configures el token una sola vez.\n\n' +
          'Mientras tanto: menu > Configuracion > Actualizar cookie.'
        );
      }
      throw new Error(
        'Token rechazado (HTTP ' + code + ').\n\n' +
        'Verifica que el token del script sea identico al STOCK_API_KEY del ' +
        'servidor, y que ESTA ruta ya valide el header X-API-Key.'
      );
    }

    if (code === 404) {
      if (opciones.silencioso) return { codigo: 404, texto: '' };
      throw new Error('La ruta ' + ruta + ' no existe en el sitio (HTTP 404).');
    }

    // 405 = la ruta SI existe, pero no acepta este metodo. Es un hallazgo,
    // no un error: casi siempre significa que hay que pedirla con POST.
    if (code === 405) {
      if (opciones.silencioso) return { codigo: 405, texto: '' };
      throw new Error(
        'La ruta ' + ruta + ' existe pero no acepta ' +
        (opciones.method || 'GET').toUpperCase() + ' (HTTP 405). Probablemente sea POST.'
      );
    }

    // Problema temporal del sitio: aqui si vale reintentar.
    if (code >= 500 || code === 429) {
      ultimoError = new Error('HTTP ' + code);
      logWarn_('FETCH', 'HTTP ' + code + ' (' + intento + '/' + FETCH_REINTENTOS + ')');
      if (intento < FETCH_REINTENTOS) { Utilities.sleep(2000 * intento); continue; }
      throw new Error('El sitio respondio HTTP ' + code + ' tras ' + FETCH_REINTENTOS + ' intentos.');
    }

    if (code !== 200) {
      if (opciones.silencioso) return { codigo: code, texto: '' };
      throw new Error('HTTP ' + code + ' en ' + ruta + '. ' +
        'Respuesta: ' + response.getContentText().substring(0, 200));
    }

    var texto = response.getContentText();
    if (opciones.crudo) return { codigo: code, texto: texto };

    var data;
    try {
      data = JSON.parse(texto);
    } catch (e) {
      if (opciones.silencioso) return { codigo: code, texto: texto, noEsJson: true };
      throw new Error(
        'La respuesta de ' + ruta + ' no es JSON. Lo mas probable es que la ' +
        'credencial no fue aceptada y te mandaron al login.'
      );
    }

    return data;
  }

  throw ultimoError || new Error('Fallo desconocido en fetch.');
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
