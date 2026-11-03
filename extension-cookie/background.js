// Site Sheet - Cookie (v1.2: manda la sesion de Odoo y cancela en el site lo pendiente)
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


// ---- Cancelar en el site: con Chrome y una pestaña del site abiertos ----
const CANCELAR_CADA_MIN = 5;
let cancelando = false;
let ultimoCiclo = 0;

async function estadoCancel(ok, texto) {
  await chrome.storage.local.set({ estadoCancel: { ok, texto, hora: Date.now() } });
}

// Se ejecuta DENTRO de la pestaña del site (usa su sesion). Sin variables de fuera.
async function enSitioRevisar() {
  try {
    const r = await fetch('/ventas-general-data?por_pag=1&page=1&canal=WL', { credentials: 'include' });
    if (!r.ok || r.redirected) return { ok: false, http: r.status };
    await r.json();
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

async function enSitioCancelar(orden, pin) {
  try {
    const qs = 'por_pag=20&page=1&canal=WL&q=' + encodeURIComponent(orden) +
      '&solo_falta=&paqueteria=&envio=&tipo=&desde=&hasta=&envio_est=&cancel=&estado=&cant=';
    const r = await fetch('/ventas-general-data?' + qs, { credentials: 'include' });
    if (!r.ok || r.redirected) return { orden, sesion: true, http: r.status };
    let j; try { j = await r.json(); } catch (e) { return { orden, sesion: true }; }
    let arr = Array.isArray(j) ? j : [];
    if (!arr.length && j && typeof j === 'object') {
      const ver = v => { if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' && v.length > arr.length) arr = v; };
      Object.keys(j).forEach(k => { ver(j[k]); if (j[k] && typeof j[k] === 'object' && !Array.isArray(j[k])) Object.keys(j[k]).forEach(k2 => ver(j[k][k2])); });
    }
    const buscar = a => a.find(o => [o.folio, o.orden_id, o.referencia].map(String).includes(orden)) ||
                        a.find(o => JSON.stringify(o).includes(orden));
    let fila = buscar(arr);
    // Respaldo: si la busqueda q= no la trae (el site puede buscar solo por otros campos), se revisan las ventas recientes sin q
    for (let pg = 1; !fila && pg <= 4; pg++) {
      try {
        const r2 = await fetch('/ventas-general-data?por_pag=100&page=' + pg + '&canal=WL', { credentials: 'include' });
        if (!r2.ok || r2.redirected) break;
        const j2 = await r2.json(); let a2 = Array.isArray(j2) ? j2 : [];
        if (!a2.length && j2 && typeof j2 === 'object') Object.keys(j2).forEach(k => { if (Array.isArray(j2[k]) && j2[k].length > a2.length) a2 = j2[k]; });
        if (!a2.length) break;
        fila = buscar(a2);
      } catch (e) { break; }
    }
    if (!fila) return { orden, noEncontrada: true };
    const odooId = Number(fila.odoo_id);
    if (!odooId) return { orden, ok: false, error: 'El site no trae el numero de Odoo de esta venta' };
    const c = await fetch('/ventas-general/cancelar', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ odoo_id: odooId, canal: 'WL', orden_id: String(fila.orden_id || orden), motivo: 'cliente', nota: '', pin: pin, confirmo: true })
    });
    const t = await c.text(); let d = {}; try { d = JSON.parse(t); } catch (e) {}
    if (c.status === 401 || (c.redirected && !d.razon)) return { orden, sesion: true, http: c.status };
    return { orden, ok: c.ok && d.ok !== false, aviso: d.aviso || '', avisoCanal: d.aviso_canal || '', razon: d.razon || '', error: d.error || (c.ok ? '' : t.replace(/<[^>]*>/g, ' ').slice(0, 150)), http: c.status };
  } catch (e) { return { orden, ok: false, error: String(e && e.message || e) }; }
}

async function enPestana(tabId, func, args) {
  const r = await chrome.scripting.executeScript({ target: { tabId }, func, args: args || [] });
  return r && r[0] ? r[0].result : null;
}

async function llamarSheet(url, cuerpo) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo) });
  const txt = await r.text();
  try { return JSON.parse(txt); } catch (e) { return { ok: false, error: 'no_json' }; }
}

async function cancelarCiclo(forzar) {
  if (cancelando) return { ok: false, error: 'ocupado' };
  if (!forzar && Date.now() - ultimoCiclo < 60000) return { ok: true, espera: true };
  cancelando = true; ultimoCiclo = Date.now();
  try {
    const g = await chrome.storage.local.get(['url', 'clave']);
    const url = g.url || URL_DEFECTO;
    if (!url || !g.clave || !URL_OK.test(url)) { await estadoCancel(false, 'Falta configurar URL y clave (Opciones)'); return { ok: false, error: 'sin_config' }; }
    const tabs = await chrome.tabs.query({ url: SITE_URL + '*' });
    if (!tabs.length) { await estadoCancel(true, 'Esperando: abre electronicsmexico.site para cancelar'); return { ok: true, sinSite: true }; }
    const tabId = tabs[0].id;
    const sesion = await enPestana(tabId, enSitioRevisar);
    if (!sesion || !sesion.ok) { await estadoCancel(false, 'El site no tiene sesion: entra al site (pestaña abierta)'); return { ok: false, error: 'sin_sesion' }; }
    const p = await llamarSheet(url, { accion: 'cancel_pendientes', clave: g.clave });
    if (!p.ok) {
      await estadoCancel(false, { no_autorizado: 'Clave incorrecta', sin_pin: 'Falta guardar el PIN en el Sheet (menu Cancelaciones)', pin_rechazado_guarda_otro: 'El site rechazo el PIN: guarda el correcto en el Sheet', no_json: 'Publica Nueva version del Web App' }[p.error] || ('El Sheet respondio: ' + p.error));
      return p;
    }
    const ordenes = p.ordenes || [];
    if (!ordenes.length) { await estadoCancel(true, 'Sin cancelaciones pendientes'); return { ok: true, n: 0 }; }
    let hechas = 0, fallas = 0, seguidas = 0, motivo = '';
    for (const o of ordenes) {
      const res = await enPestana(tabId, enSitioCancelar, [o, p.pin]);
      if (!res || res.sesion) { motivo = 'El site perdio la sesion: entra de nuevo'; break; }
      await llamarSheet(url, { accion: 'cancel_resultado', clave: g.clave, orden: o, ok: !!res.ok, aviso: res.aviso || '', avisoCanal: res.avisoCanal || '', razon: res.razon || '', error: res.error || '', http: res.http || 0, noEncontrada: !!res.noEncontrada });
      if (res.ok) { hechas++; seguidas = 0; }
      else { fallas++; if (res.razon === 'pin_malo') { motivo = 'El site rechazo el PIN: guardalo bien en el Sheet'; break; } if (!res.noEncontrada && ++seguidas >= 2) { motivo = 'Dos errores seguidos: me detengo'; break; } }
      await new Promise(r => setTimeout(r, 1500));
    }
    p.pin = '';
    await estadoCancel(!motivo && !fallas, hechas + ' cancelada(s) en el site' + (fallas ? ', ' + fallas + ' con problema (ver Log del Sheet)' : '') + (motivo ? '. ' + motivo : ''));
    return { ok: !motivo, hechas, fallas };
  } catch (e) {
    await estadoCancel(false, 'No pude cancelar: ' + (e && e.message ? e.message : e));
    return { ok: false, error: 'red' };
  } finally { cancelando = false; }
}

chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  if (info.status === 'complete' && tab && tab.url && tab.url.startsWith(SITE_URL)) cancelarCiclo(false);
});

function crearAlarma() {
  chrome.alarms.create('revisar', { periodInMinutes: REVISAR_CADA_MIN });
  chrome.alarms.create('cancelar', { periodInMinutes: CANCELAR_CADA_MIN });
}

chrome.runtime.onInstalled.addListener(() => { crearAlarma(); enviar(true); enviarOdoo(true); cancelarCiclo(false); });
chrome.runtime.onStartup.addListener(() => { crearAlarma(); enviar(false); enviarOdoo(false); cancelarCiclo(false); });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'revisar') { enviar(false); enviarOdoo(false); } if (a.name === 'cancelar') cancelarCiclo(false); });

chrome.runtime.onMessage.addListener((m, _s, responder) => {
  if (m && m.tipo === 'cancelar') { cancelarCiclo(true).then(responder); return true; }
  if (m && m.tipo === 'enviar') { Promise.all([enviar(true), enviarOdoo(true)]).then(r => responder(r[0])); return true; }
});
