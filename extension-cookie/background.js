// Site Sheet - Cookie (v1.1: tambien manda la sesion de Odoo)
// Detecta la cookie "session" de electronicsmexico.site y la manda al Web App
// del Site Sheet (Apps Script). Apps Script la prueba antes de guardarla.

const SITE_URL = 'https://electronicsmexico.site/';
const COOKIE_NAME = 'session';
const MIN_ENTRE_ENVIOS_MIN = 15;   // el site puede rotar la cookie en cada visita
const REVISAR_CADA_MIN = 30;
const URL_OK = /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[A-Za-z0-9_-]+\/exec$/;

const URL_DEFECTO = 'https://script.google.com/macros/s/AKfycbygod1WXxes7JWJS6_u02OPf3e-nJCxgSDN8VgSdam4cPcAI7CgP51-vk-UhP_zwkAR/exec';

let espera = null;
let esperaOdoo = null;

// ---- Odoo: la sesion de Chrome (ya entraste con tu correo y contraseña) ----
const ODOO_URL = 'https://electronicsmexico.odoo.com/';
const ODOO_COOKIE = 'session_id';

async function estadoOdoo(ok, texto) {
  await chrome.storage.local.set({ estadoOdoo: { ok, texto, hora: Date.now() } });
}

async function enviarOdoo(forzar) {
  const g = await chrome.storage.local.get(['url', 'clave', 'odooUltima', 'odooFallo', 'odooIntento', 'odooHora']);
  const url = g.url || URL_DEFECTO;
  if (!url || !g.clave || !URL_OK.test(url)) { await estadoOdoo(false, 'Falta configurar URL y clave (Opciones)'); return { ok: false, error: 'sin_config' }; }
  const c = await chrome.cookies.get({ url: ODOO_URL, name: ODOO_COOKIE });
  if (!c || !c.value) { await estadoOdoo(false, 'No hay sesion de Odoo: abre electronicsmexico.odoo.com'); return { ok: false, error: 'sin_sesion' }; }
  const huella = await sha256(c.value);
  if (!forzar) {
    // reenvia cada 3 h aunque sea la misma cookie: si el Sheet la perdio, se autocura
    if (g.odooUltima === huella && !g.odooFallo && g.odooHora && Date.now() - g.odooHora < 3 * 3600000) return { ok: true, igual: true };
    if (g.odooFallo && g.odooIntento && Date.now() - g.odooIntento < 120000) return { ok: false, error: 'espera_reintento' };
  }
  await chrome.storage.local.set({ odooIntento: Date.now() });
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion: 'cookie_odoo', clave: g.clave, cookie: c.value }) });
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch (e2) { await chrome.storage.local.set({ odooFallo: true }); await estadoOdoo(false, 'El Sheet no devolvio JSON (HTTP ' + r.status + '): publica Nueva version del Web App'); return { ok: false, error: 'no_json' }; }
    if (j.ok) { await chrome.storage.local.set({ odooUltima: huella, odooFallo: false, odooHora: Date.now() }); await estadoOdoo(true, j.igual ? 'Odoo al dia' : 'Sesion de Odoo enviada' + (j.usuario ? ' (' + j.usuario + ')' : '')); return j; }
    await chrome.storage.local.set({ odooFallo: true });
    await estadoOdoo(false, { no_autorizado: 'Clave incorrecta', sesion_no_valida: 'La sesion de Odoo no sirve: vuelve a entrar a Odoo' }[j.error] || ('El Sheet respondio: ' + j.error));
    return j;
  } catch (e) {
    await chrome.storage.local.set({ odooFallo: true });
    await estadoOdoo(false, 'No pude llegar al Sheet: ' + (e && e.message ? e.message : e));
    return { ok: false, error: 'red' };
  }
}

function badge(texto, color, titulo) {
  chrome.action.setBadgeText({ text: texto });
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setTitle({ title: 'Site Sheet - Cookie: ' + titulo });
}

async function sha256(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function estado(ok, texto) {
  await chrome.storage.local.set({ estado: { ok, texto, hora: Date.now() } });
  if (ok) badge('OK', '#3fb950', texto);
  else badge('!', '#f85149', texto);
}

// forzar = ignora "ya la mande" y el tiempo minimo entre envios.
async function enviar(forzar) {
  const g = await chrome.storage.local.get(
    ['url', 'clave', 'ultima', 'ultimaHora', 'ultimoFallo', 'ultimoIntento']);
  const { clave, ultima, ultimaHora, ultimoFallo, ultimoIntento } = g;
  const url = g.url || URL_DEFECTO;

  if (!url || !clave || !URL_OK.test(url)) {
    await estado(false, 'Falta configurar URL y clave (Opciones)');
    return { ok: false, error: 'sin_config' };
  }

  const c = await chrome.cookies.get({ url: SITE_URL, name: COOKIE_NAME });
  if (!c || !c.value) {
    await estado(false, 'No hay sesion en el site: entra a electronicsmexico.site');
    return { ok: false, error: 'sin_sesion' };
  }

  const huella = await sha256(c.value);
  if (!forzar) {
    if (ultima === huella && !ultimoFallo) return { ok: true, igual: true };
    if (!ultimoFallo && ultimaHora && Date.now() - ultimaHora < MIN_ENTRE_ENVIOS_MIN * 60000) {
      return { ok: true, espera: true };
    }
    // Tras un fallo: reintentar como maximo cada 2 min (el site rota la cookie
    // casi en cada pagina y esto antes disparaba un envio cada 4 s).
    if (ultimoFallo && ultimoIntento && Date.now() - ultimoIntento < 120000) {
      return { ok: false, error: 'espera_reintento' };
    }
  }
  await chrome.storage.local.set({ ultimoIntento: Date.now() });

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion: 'cookie', clave, cookie: c.value })
    });
    const txt = await r.text();
    let j;
    try { j = JSON.parse(txt); } catch (e2) {
      await chrome.storage.local.set({ ultimoFallo: true });
      const t = txt.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
      await estado(false, 'El Sheet no devolvio JSON (HTTP ' + r.status + '). Publica Nueva version en Apps Script. Dijo: ' + t);
      return { ok: false, error: 'no_json' };
    }
    if (j.ok) {
      await chrome.storage.local.set({ ultima: huella, ultimaHora: Date.now(), ultimoFallo: false });
      await estado(true, j.igual ? 'Al dia (el Sheet ya tenia esta sesion)' : 'Cookie enviada al Sheet');
      return j;
    }
    await chrome.storage.local.set({ ultimoFallo: true });
    const msg = {
      no_autorizado: 'Clave incorrecta: copiala otra vez del menu del Sheet',
      sesion_no_valida: 'La sesion del site no sirve: vuelve a entrar al site',
      bloqueado_espera_10_min: 'Demasiados intentos: espera 10 minutos',
      sin_clave_genera_en_el_menu: 'El Sheet no tiene clave: generala en el menu'
    }[j.error] || ('El Sheet respondio: ' + j.error);
    await estado(false, msg);
    return j;
  } catch (e) {
    await chrome.storage.local.set({ ultimoFallo: true });
    await estado(false, 'No pude llegar al Sheet: ' + (e && e.message ? e.message : e) + ' (revisa que la URL termine en /exec)');
    return { ok: false, error: 'red' };
  }
}

function programar() {
  clearTimeout(espera);
  espera = setTimeout(() => enviar(false), 2500);
}

chrome.cookies.onChanged.addListener(({ cookie, removed }) => {
  if (!removed && cookie.name === ODOO_COOKIE && cookie.domain.replace(/^\./, '') === 'electronicsmexico.odoo.com') {
    clearTimeout(esperaOdoo); esperaOdoo = setTimeout(() => enviarOdoo(false), 2500); return;
  }
  if (removed || cookie.name !== COOKIE_NAME) return;
  if (cookie.domain.replace(/^\./, '') !== 'electronicsmexico.site') return;
  programar();
});

function crearAlarma() {
  chrome.alarms.create('revisar', { periodInMinutes: REVISAR_CADA_MIN });
}

chrome.runtime.onInstalled.addListener(() => { crearAlarma(); enviar(true); enviarOdoo(true); });
chrome.runtime.onStartup.addListener(() => { crearAlarma(); enviar(false); enviarOdoo(false); });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'revisar') { enviar(false); enviarOdoo(false); } });

chrome.runtime.onMessage.addListener((m, _s, responder) => {
  if (m && m.tipo === 'enviar') { Promise.all([enviar(true), enviarOdoo(true)]).then(r => responder(r[0])); return true; }
});
