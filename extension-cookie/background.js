// Site Sheet - Cookie (v1.3: manda la sesion de Odoo, cancela en el site lo pendiente y lee el estado de tus pedidos en Seller Center)
// Detecta la cookie "session" de electronicsmexico.site y la manda al Web App
// del Site Sheet (Apps Script). Apps Script la prueba antes de guardarla.

try { importScripts('autoguias.js'); } catch (e) { /* sin el modulo de guias, el resto de la extension sigue igual */ }

const SITE_URL = 'https://electronicsmexico.site/';
const COOKIE_NAME = 'session';
const MIN_ENTRE_ENVIOS_MIN = 15;   // el site puede rotar la cookie en cada visita
const REVISAR_CADA_MIN = 30;
const URL_OK = /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[A-Za-z0-9_-]+\/exec$/;

const URL_DEFECTO = 'https://script.google.com/macros/s/AKfycby85T2KwoDZb-kTPFlXbyXcTR9aMiRQZNzHhvgkHSb13JXX0NeYJUH0kAABi-GWWZHB/exec';
// 19-nov: la implementacion vieja (…hP_zwkAR) se quedo en la Version 50; la que se actualiza es …i-GWWZHB. Si la extension tenia guardada la vieja, se cambia sola.
const URL_VIEJA = 'https://script.google.com/macros/s/AKfycbygod1WXxes7JWJS6_u02OPf3e-nJCxgSDN8VgSdam4cPcAI7CgP51-vk-UhP_zwkAR/exec';
async function migrarUrl() { try { const g = await chrome.storage.local.get(['url']); if (!g.url || g.url === URL_VIEJA) await chrome.storage.local.set({ url: URL_DEFECTO }); } catch (e) {} }

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
// ---- Turno entre computadoras (v1.8, 20-nov-2026) ----
// La extension puede estar en varias computadoras a la vez (para que nunca se caiga). Todas mandan cookie y sesion de Odoo,
// pero las corridas que HACEN cosas (cancelar en el site y en Walmart, guias, Seller Center, rastreo) solo las corre la que
// tiene el TURNO. El Sheet lo da (accion ext_turno) y, si esa computadora deja de responder 15 min, otra lo toma sola.
// Los botones del popup (corridas a mano) funcionan en cualquier computadora.
const TURNO_CACHE_MS = 60000, TURNO_VALIDO_MS = 20 * 60000;
let turnoMem = null;   // { lider, quien, t }
// 20-nov: la primera vez que se crea el id, varias vueltas lo pedian al mismo tiempo y cada una inventaba uno distinto
// (asi aparecio "PC-B73C", un turno fantasma de 15 min). Ahora todas esperan la MISMA promesa: un solo id por computadora.
let instanciaProm = null;
function instancia() {
  if (!instanciaProm) instanciaProm = instanciaLeer().catch(e => { instanciaProm = null; throw e; });
  return instanciaProm.then(async x => { const n = await chrome.storage.local.get(['instNombre']); return { id: x.id, nombre: String(n.instNombre || ('PC-' + x.id.slice(0, 4).toUpperCase())).slice(0, 40) }; });
}
async function instanciaLeer() {
  const g = await chrome.storage.local.get(['instId', 'instNombre']);
  let id = g.instId;
  if (!id || !/^[a-z0-9]{8,40}$/i.test(id)) { id = ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/[^a-z0-9]/gi, '').slice(0, 16); await chrome.storage.local.set({ instId: id }); }
  return { id, nombre: String(g.instNombre || ('PC-' + id.slice(0, 4).toUpperCase())).slice(0, 40) };
}
// 20-nov: la computadora en espera pinta "En espera" en vez de dejar un estado viejo (se veia rojo un error de antes de configurarla).
function enEsperaTxt() { return 'En espera: trabaja ' + ((turnoMem && turnoMem.quien) || 'otra computadora') + '. Si se apaga, esta toma el turno sola'; }
async function tengoTurno() {
  if (turnoMem && Date.now() - turnoMem.t < TURNO_CACHE_MS) return turnoMem.lider;
  const g = await chrome.storage.local.get(['url', 'clave', 'turnoUlt']);
  const url = g.url || URL_DEFECTO, yo = await instancia();
  let r = null;
  if (g.clave && URL_OK.test(url)) { try { r = await llamarSheet(url, { accion: 'ext_turno', clave: g.clave, id: yo.id, nombre: yo.nombre }); } catch (e) { r = null; } }
  if (r && r.ok) {
    turnoMem = { lider: !!r.lider, quien: String(r.quien || ''), t: Date.now() };
    await chrome.storage.local.set({ turnoUlt: turnoMem, estadoTurno: { ok: true, hora: Date.now(), texto: turnoMem.lider ? 'Esta computadora (' + yo.nombre + ') tiene el turno: trabaja' + (r.pcs > 1 ? ' · ' + r.pcs + ' computadoras con la extension' : '') : 'En espera: trabaja ' + (turnoMem.quien || 'otra computadora') + '. Si se apaga, esta toma el turno sola' } });
    return turnoMem.lider;
  }
  if (r && r.error === 'sesion_invalida') {   // Web App sin publicar: trabaja como antes (una sola computadora)
    turnoMem = { lider: true, quien: '', t: Date.now() };
    await chrome.storage.local.set({ estadoTurno: { ok: false, hora: Date.now(), texto: 'Falta publicar Nueva version del Web App: trabaja sin turno (no la prendas en otra computadora todavia)' } });
    return true;
  }
  const u = turnoMem || g.turnoUlt;
  if (u && Date.now() - u.t < TURNO_VALIDO_MS) return u.lider;   // el Sheet no contesto: se respeta lo ultimo que dijo
  return true;   // sin Sheet desde hace rato: trabaja (nada llega al Sheet sin el, y las paginas no dejan hacer doble)
}

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
    let arr = Array.isArray(j) ? j : (j && Array.isArray(j.ventas) ? j.ventas : []);   // el site trae las ventas en j.ventas (antes se tomaba el arreglo mas largo: a veces era 'envios' y no la encontraba)
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
        const j2 = await r2.json(); let a2 = Array.isArray(j2) ? j2 : (j2 && Array.isArray(j2.ventas) ? j2.ventas : []);
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

async function llamarSheet(url, cuerpo, topeMs) {
  // Tope de 90 s: un Web App ocupado no debe dejar la extension colgada para siempre (nada se compra si no hay lista)
  const ac = (typeof AbortController === 'function') ? new AbortController() : null, tm = ac ? setTimeout(() => ac.abort(), topeMs || 90000) : null;
  try {
    const r = await fetch(url, Object.assign({ method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo) }, ac ? { signal: ac.signal } : {}));
    const txt = await r.text();
    try { return JSON.parse(txt); } catch (e) { return { ok: false, error: 'no_json' }; }
  } catch (e) {
    return { ok: false, error: (e && e.name === 'AbortError') ? 'sin_respuesta_90s' : 'red: ' + String((e && e.message) || e).slice(0, 60) };
  } finally { if (tm) clearTimeout(tm); }
}

async function cancelarCiclo(forzar) {
  if (!forzar && !(await tengoTurno())) { await estadoCancel(true, enEsperaTxt()); return { ok: true, espera: true, turno: false }; }
  if (cancelando) return { ok: false, error: 'ocupado' };
  if (!forzar && Date.now() - ultimoCiclo < 60000) return { ok: true, espera: true };
  cancelando = true; ultimoCiclo = Date.now();
  try {
    const g = await chrome.storage.local.get(['url', 'clave']);
    const url = g.url || URL_DEFECTO;
    if (!url || !g.clave || !URL_OK.test(url)) { await estadoCancel(false, 'Falta configurar URL y clave (Opciones)'); return { ok: false, error: 'sin_config' }; }
    let tabs = await chrome.tabs.query({ url: SITE_URL + '*' });
    if (!tabs.length) {
      // Sin pestana del site (p. ej. al despertar la PC): abre una en segundo plano y espera a que cargue
      try {
        const t = await chrome.tabs.create({ url: SITE_URL, active: false });
        for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 1000)); const x = await chrome.tabs.get(t.id); if (x.status === 'complete') break; }
        tabs = [await chrome.tabs.get(t.id)];
      } catch (e) { await estadoCancel(true, 'No pude abrir el site: abre electronicsmexico.site'); return { ok: true, sinSite: true }; }
    }
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
      else if (/ya\s+(est[aá]\s+)?cancelad/i.test(String(res.error || ''))) { hechas++; seguidas = 0; }   // el site avisa que ya estaba cancelada en Odoo: es exito, no error
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

// ---- Seller Center (v1.3): lee con TU sesion (la que ya iniciaste, con tu codigo 2FA) la lista de pedidos y la manda al Sheet ----
// Solo LEE. No toca nada de Walmart. No manda nombres de clientes (esa columna se descarta).
const SC_URL = 'https://seller.walmart.com/';
const SC_LISTAS = [['Unshipped', 'orderGroups=Unshipped'], ['Canceled', 'orderGroups=Canceled'], ['All', 'orderGroups=All']];
const SC_CADA_MIN = 30;
const SC_MAX_BUSCAR = 15;
let scOcupado = false;
let scUltimoCiclo = 0;

async function estadoSC(ok, texto, enCurso) {
  await chrome.storage.local.set({ estadoSC: { ok, texto, hora: Date.now(), enCurso: !!enCurso } });
}

// Se ejecuta DENTRO de la pestaña de Seller Center (usa su sesion). Sin variables de fuera.
async function enSellerLeer(esperaMs, marca) {
  const t0 = Date.now();
  const esp = ms => new Promise(r => setTimeout(r, ms));
  let ultimo = null;
  while (Date.now() - t0 < esperaMs) {
    if (!location.hostname) return { pendiente: true };   // la pestaña aun no abre la pagina
    if (location.hostname !== 'seller.walmart.com' || !/^\/orders/.test(location.pathname)) return { sesion: false, destino: location.hostname + location.pathname };
    if (marca && location.href.indexOf(marca) < 0) return { pendiente: true };   // sigue en la pagina anterior
    const enc = [...document.querySelectorAll('table th')].map(x => (x.innerText || '').trim());
    const trs = [...document.querySelectorAll('table tbody tr')];
    const filas = trs.map(tr => [...tr.querySelectorAll('td')].map(td => (td.innerText || '').replace(/\s+/g, ' ').trim())).filter(c => c.some(x => /\d{9,}/.test(x)));
    const vacio = /No se encontraron pedidos/i.test(document.body.innerText || '');
    if (enc.length && filas.length) { ultimo = { sesion: true, enc, filas }; if (filas.length === trs.length) return ultimo; }
    if (enc.length && vacio && Date.now() - t0 > 3000) return { sesion: true, enc, filas: [] };
    await esp(500);
  }
  return ultimo || { sesion: true, timeout: true };
}

// Buzon: lee SOLO el total del paginador ("1-25 de N"). No abre ni lee mensajes. Corre DENTRO de la pagina.
async function enSellerBuzon(esperaMs, marca) {
  const t0 = Date.now();
  const esp = ms => new Promise(r => setTimeout(r, ms));
  let prev = null, iguales = 0;
  while (Date.now() - t0 < esperaMs) {
    if (!location.hostname) return { pendiente: true };
    if (location.hostname !== 'seller.walmart.com') return { sesion: false, destino: location.hostname + location.pathname };
    if (!/^\/seller-communication/.test(location.pathname) || (marca && location.href.indexOf(marca) < 0)) { await esp(500); continue; }   // sigue en la pagina anterior
    const txt = (document.body && document.body.innerText) || '';
    let n = null;
    const m = /(\d[\d,]*)\s*-\s*(\d[\d,]*)\s+(?:of|de)\s+(\d[\d,]*)/i.exec(txt);
    if (m) n = Number(m[3].replace(/,/g, ''));
    else if (/\b0\s+(?:of|de)\s+0\b/i.test(txt) || /no (messages|results)|sin mensajes|no hay mensajes/i.test(txt)) n = 0;
    // Solo la ultima semana: la fecha de cada mensaje sale en su propia linea ("Hoy", "Ayer" o MM/DD/AAAA). No se lee nada mas del mensaje.
    let rec = 0, fechas = 0, ultimaDentro = true;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    txt.split('\n').forEach(l => {
      l = l.trim();
      let dias = null;
      if (/^(hoy|today)$/i.test(l)) dias = 0;
      else if (/^(ayer|yesterday)$/i.test(l)) dias = 1;
      else { const f = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(l); if (f) dias = Math.round((hoy - new Date(Number(f[3]), Number(f[1]) - 1, Number(f[2]))) / 86400000); }
      if (dias === null) return;
      fechas++;
      if (dias <= 7) rec++; else ultimaDentro = false;
    });
    const clave = n === null ? null : n + '/' + rec + '/' + fechas;
    if (n !== null) { if (clave === prev) iguales++; else { prev = clave; iguales = 1; } if (iguales >= 2 && Date.now() - t0 > 2500) return { sesion: true, total: n, recientes: rec, fechas: fechas, todasRecientes: ultimaDentro }; }
    else { prev = null; iguales = 0; }
    await esp(700);
  }
  return { sesion: true, timeout: true };
}

// Casos: devuelve el texto de la lista "Sus casos" (la tabla). Corre DENTRO de la pagina.
async function enSellerCasos(esperaMs, marca) {
  const t0 = Date.now();
  const esp = ms => new Promise(r => setTimeout(r, ms));
  let largo = -1, iguales = 0;
  while (Date.now() - t0 < esperaMs) {
    if (!location.hostname) return { pendiente: true };
    if (location.hostname !== 'seller.walmart.com') return { sesion: false, destino: location.hostname + location.pathname };
    if (!/^\/supporthub/.test(location.pathname) || (marca && location.href.indexOf(marca) < 0)) { await esp(500); continue; }
    const txt = (document.body && document.body.innerText) || '';
    const tabla = /Propietario|Owner/i.test(txt);
    const hay = tabla && /\n\s*\d{6,10}[\t ]*\n/.test(txt);
    const vacio = tabla && /no se encontraron|no hay casos|no cases|no results/i.test(txt);
    if (hay || vacio) { if (txt.length === largo) iguales++; else { largo = txt.length; iguales = 1; } if (iguales >= 2 && Date.now() - t0 > 2500) return { sesion: true, texto: txt.slice(0, 30000) }; }
    else { largo = -1; iguales = 0; }
    await esp(700);
  }
  return { sesion: true, timeout: true };
}

// ---- piezas puras (se prueban sin Chrome) ----
function scNormTxt(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}
// 'MM/DD/AAAA' (asi lo muestra Seller Center) -> 'AAAA-MM-DD'; '' si no es fecha
function scFechaIso(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || '').trim());
  if (!m) return '';
  const mes = Number(m[1]), dia = Number(m[2]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return '';
  return m[3] + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
}
function scTotal(s) {
  const n = parseFloat(String(s || '').replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? '' : n;
}
// Encabezados + celdas -> filas {pedido, orden, fecha, envio, total, estado}. null si la pagina cambio de forma (faltan columnas clave).
function scFilas(enc, celdas) {
  const n = (enc || []).map(scNormTxt);
  const buscar = re => n.findIndex(x => re.test(x));
  const c = { orden: buscar(/numerodeordendecompra/), pedido: buscar(/^numerodepedido/), fecha: buscar(/^fechadelpedido/), envio: buscar(/^fechaestimadadeenvio/), total: buscar(/^totaldelpedido/), estado: buscar(/^estado$/) };
  if (c.orden < 0 || c.pedido < 0 || c.estado < 0) return null;
  const dato = (fila, i) => (i >= 0 && i < fila.length ? fila[i] : '');
  return (celdas || []).map(f => ({
    pedido: dato(f, c.pedido).replace(/\s+/g, ''), orden: dato(f, c.orden).replace(/\s+/g, ''), fecha: scFechaIso(dato(f, c.fecha)), envio: scFechaIso(dato(f, c.envio)),
    total: scTotal(dato(f, c.total)), estado: dato(f, c.estado).replace(/^(.+?)\s+\1$/, '$1')   // Seller Center repite la palabra: 'Enviado Enviado' -> 'Enviado'
  })).filter(x => /^\d{9,20}$/.test(x.pedido));
}

// "12 nov 2026" -> '2026-11-12'; '' si no es fecha
const SC_MESES = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 };
function scFechaCaso(dia, mes, anio) {
  const m = SC_MESES[scNormTxt(mes).slice(0, 3)], d = Number(dia);
  if (!m || !(d >= 1 && d <= 31) || !/^\d{4}$/.test(String(anio))) return '';
  return anio + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
// Texto de "Sus casos" -> [{folio, fecha, asunto, estado}]. Cada fila: "12 nov 2026\t\n17061348\n\tAsunto\tEstado\tPropietario". El propietario se descarta.
function scCasosDeTexto(texto) {
  const re = /(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóú]{3,5})\.?\s+(\d{4})[\t ]*\n\s*(\d{6,10})[\t ]*\n[\t ]*([^\t\n]+)\t([^\t\n]+)/g;
  const out = [], vistos = {};
  let m;
  while ((m = re.exec(String(texto || ''))) !== null) {
    if (vistos[m[4]]) continue;
    vistos[m[4]] = true;
    out.push({ folio: m[4], fecha: scFechaCaso(m[1], m[2], m[3]), asunto: m[5].replace(/\s+/g, ' ').trim().slice(0, 80), estado: m[6].replace(/\s+/g, ' ').trim().slice(0, 40) });
    if (out.length >= 200) break;
  }
  return out;
}

function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }
function conTope(promesa, ms) { return Promise.race([promesa, new Promise((_, rej) => setTimeout(() => rej(new Error('tiempo agotado')), ms))]); }

function esperarCarga(tabId, ms) {
  return new Promise(res => {
    const fin = () => { clearTimeout(t); chrome.tabs.onUpdated.removeListener(l); res(); };
    const l = (id, info) => { if (id === tabId && info.status === 'complete') fin(); };
    const t = setTimeout(fin, ms);
    chrome.tabs.onUpdated.addListener(l);
  });
}

// Abre la URL en la pestaña de trabajo y devuelve lo que se ve en la tabla. Reintenta si la pestaña aun no carga; nunca se queda colgada.
async function scLeerUrl(tabId, url, marca) {
  await chrome.tabs.update(tabId, { url });
  await esperarCarga(tabId, 20000);
  let r = null, err = null;
  for (let i = 0; i < 8; i++) {
    try { r = await conTope(enPestana(tabId, enSellerLeer, [20000, marca]), 40000); err = null; } catch (e) { r = null; err = e; }
    if (r && !r.pendiente) break;
    await esperar(1500);
  }
  if (!r || r.pendiente) throw new Error(err ? (err.message || String(err)) : 'la pagina de pedidos no cargo');
  if (r.filas) { const f = scFilas(r.enc, r.filas); if (f === null) return { sesion: true, cambio: true }; return { sesion: true, filas: f }; }
  return r;
}

// Abre una URL de Seller Center en la pestaña de trabajo y corre func dentro. Reintenta si la pestaña aun no carga; nunca se queda colgada.
async function scLeerOtra(tabId, url, func, args) {
  await chrome.tabs.update(tabId, { url });
  await esperarCarga(tabId, 20000);
  let r = null, err = null;
  for (let i = 0; i < 8; i++) {
    try { r = await conTope(enPestana(tabId, func, args), 45000); err = null; } catch (e) { r = null; err = e; }
    if (r && !r.pendiente) break;
    await esperar(1500);
  }
  if (!r || r.pendiente) throw new Error(err ? (err.message || String(err)) : 'la pagina no cargo');
  return r;
}

// Los dos numeros del buzon (sin leer / por responder), SOLO de los ultimos 7 dias. null = no se pudo leer ese numero.
// La lista viene de la mas nueva a la mas vieja: se pasa de pagina (25 por pagina) solo mientras toda la pagina sea de la ultima semana.
async function scBuzon(tabId) {
  const leer = async (q, marca) => {
    let suma = 0;
    for (let ini = 1, pag = 0; pag < 8; pag++, ini += 25) {
      const r = await scLeerOtra(tabId, SC_URL + 'seller-communication/Customer?' + q + '&start=' + ini, enSellerBuzon, [20000, marca]);
      if (!(r && r.sesion && typeof r.total === 'number')) return null;
      if (r.total > 0 && r.fechas === 0) return null;   // no se encontraron fechas: mejor no dar un numero falso
      suma += r.recientes || 0;
      if (!(r.todasRecientes && r.total > ini + 24)) break;
      await esperar(800);
    }
    return suma;
  };
  const sinLeer = await leer('status=UNREAD', 'status=UNREAD');
  await esperar(1000);
  const porResponder = await leer('tags=Response+Needed', 'tags=Response');
  return { sinLeer, porResponder };
}

// Casos de los ultimos 30 dias que muestra Seller Center ([] si no se pudo leer).
async function scCasos(tabId) {
  const r = await scLeerOtra(tabId, SC_URL + 'supporthub/your-cases?dateRange=last30days', enSellerCasos, [25000, 'your-cases']);
  return (r && r.sesion && r.texto) ? scCasosDeTexto(r.texto) : [];
}

// El Sheet contesta "ocupado" cuando otra corrida tiene el candado: se reintenta unas veces antes de rendirse.
async function llamarSheetReint(url, cuerpo) {
  let j = null;
  for (let i = 0; i < 3; i++) {
    j = await llamarSheet(url, cuerpo);
    if (!(j && j.ok === false && j.error === 'ocupado')) return j;
    await esperar(15000);
  }
  return j;
}

async function scMandar(url, clave, grupo, filas) {
  if (!filas.length) return { ok: true, recibidas: 0 };
  return llamarSheetReint(url, { accion: 'seller_pedidos', clave, grupo, filas });
}

// ───────────────────────── Lectura de Seller Center por su API interna (SOLO LECTURA) ─────────────────────────
// Igual que la extension "Guias Walmart": corre DENTRO de una pagina de Seller Center (mundo MAIN) y usa el fetch de la
// pagina, el que PerimeterX reconoce, con tu sesion y tu 2FA. Solo consultas get_* (nunca mutaciones: no cancela, no responde, no abre casos).
// Se serializa sola: NO puede usar nada de fuera de esta funcion.
// Devuelve {sesion, pedidos:{Unshipped,Canceled,All: [filas]|null}, buscados:[filas], buzon:{sinLeer,porResponder}, casos:[...]|null, errores:[...]}.
async function enSellerApi(pend) {
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  const cookie = n => { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; };
  const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2, '0')).join('');
  let tm = {};
  for (let i = 0; i < 12; i++) {   // TMX_DATA aparece unos segundos despues de cargar la pagina
    try { const d = JSON.parse(localStorage.getItem('TMX_DATA') || '{}'); const ev = Object.keys(d)[0]; tm = { id: ev && d[ev] && d[ev].tmxId, ev }; } catch (e) { tm = {}; }
    if (cookie('XSRF-TOKEN') && tm.id) break;
    await esperar(1000);
  }
  if (!cookie('XSRF-TOKEN') || !tm.id) return { sesion: false, errores: ['sin sesion (XSRF/TMX)'] };
  const errores = [];
  let antibot = false;
  async function pedir(ruta, op, query, variables) {
    if (!/^get[_A-Za-z]/.test(op) || /\bmutation\b/i.test(query)) throw new Error('operacion rechazada: solo lectura');
    const h = { accept: 'application/json', 'content-type': 'application/json', 'wm_aurora.locale': 'es-MX', 'wm_aurora.market': 'MX', 'wm_svc.name': 'API',
                'wm_qos.correlation_id': crypto.randomUUID(), 'x-xsrf-token': cookie('XSRF-TOKEN'), 'wm_aurora.tmxid': tm.id, 'wm_aurora.tmxevent': tm.ev,
                traceparent: '00-' + hex(16) + '-' + hex(8) + '-00', pxqueryname: op, 'wm_aurora.timezone': '-06:00' };
    for (const k of Object.keys(h)) if (h[k] == null) delete h[k];
    const r = await fetch(ruta, { method: 'POST', credentials: 'include', headers: h, body: JSON.stringify({ query, variables }) });
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) { j = null; }
    if (r.status === 403 || /perimeterx|px-captcha|access denied/i.test(j ? '' : txt)) antibot = true;
    return { st: r.status, j };
  }
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' });
  const iso = s => { const d = new Date(s); return (s && !isNaN(d.getTime())) ? fmt.format(d) : ''; };
  const ST = { New: 'Nuevo', Created: 'Nuevo', Acknowledged: 'Aceptado', Shipped: 'Enviado', Delivered: 'Entregado', Canceled: 'Cancelado', Cancelled: 'Cancelado' };
  const QP = 'query get_orders_getAllOrders($params: SearchParams) { get_orders_getAllOrders(searchParams: $params) { orderInfo { pageInfo { totalCount } purchaseOrders { customerOrderId purchaseOrderId orderDate shippingInfo { estimatedShipDate } orderSummary { totalAmount { amount } } poLines { poLineStatus } } } } }';
  async function pedidos(extra, etiqueta) {
    try {
      const r = await pedir('/aurora/v2/auroraOrderService/gql', 'get_orders_getAllOrders', QP,
        { params: Object.assign({ fulfilmentType: ['Seller'], pageInfo: { limit: '200', offset: '0', cursor: '*' } }, extra) });
      const info = r.j && r.j.data && r.j.data.get_orders_getAllOrders && r.j.data.get_orders_getAllOrders.orderInfo;
      if (!info) { errores.push('pedidos ' + etiqueta + ': ' + (r.st || '?') + ' ' + JSON.stringify((r.j && r.j.errors) || '').slice(0, 120)); return null; }
      return (info.purchaseOrders || []).map(p => {
        const est = []; (p.poLines || []).forEach(l => { const e = ST[l.poLineStatus] || String(l.poLineStatus || ''); if (e && est.indexOf(e) < 0) est.push(e); });
        const tot = p.orderSummary && p.orderSummary.totalAmount ? Number(p.orderSummary.totalAmount.amount) : NaN;
        return { pedido: String(p.customerOrderId || '').replace(/\s+/g, ''), orden: String(p.purchaseOrderId || '').replace(/\s+/g, ''), fecha: iso(p.orderDate),
                 envio: iso(p.shippingInfo && p.shippingInfo.estimatedShipDate), total: isFinite(tot) ? tot : '', estado: est.join(' ') };
      }).filter(x => /^\d{9,20}$/.test(x.pedido));
    } catch (e) { errores.push('pedidos ' + etiqueta + ': ' + (e && e.message ? e.message : e)); return null; }
  }
  const out = { sesion: true, pedidos: {}, buscados: [], buzon: { sinLeer: null, porResponder: null }, casos: null, errores, antibot: false };
  for (const g of ['Unshipped', 'Canceled', 'All']) { out.pedidos[g] = await pedidos({ orderGroups: g }, g); await esperar(300); }
  // pedidos por buscar uno por uno
  for (const ped of (Array.isArray(pend) ? pend : []).filter(x => /^\d{9,20}$/.test(String(x))).slice(0, 15)) {
    const f = await pedidos({ orderGroups: 'All', orderNumber: String(ped) }, 'buscar');
    if (f) f.filter(x => x.pedido === String(ped)).forEach(x => out.buscados.push(x));
    await esperar(300);
  }
  // buzon: dos numeros
  try {
    const a = await pedir('/aurora/v1/auroraMessageService/gql', 'get_messages_mailCount', 'query MailCount { get_messages_mailCount { unreadCount } }', {});
    const u = a.j && a.j.data && a.j.data.get_messages_mailCount;
    if (u && typeof u.unreadCount === 'number') out.buzon.sinLeer = u.unreadCount; else errores.push('buzon sin leer: ' + (a.st || '?'));
    const b = await pedir('/aurora/v1/auroraMessageService/gql', 'get_messages_responseNeededCount', 'query get_messages_responseNeededCount { get_messages_responseNeededCount { responseNeededCount } }', {});
    const v = b.j && b.j.data && b.j.data.get_messages_responseNeededCount;
    if (v && typeof v.responseNeededCount === 'number') out.buzon.porResponder = v.responseNeededCount; else errores.push('buzon por responder: ' + (b.st || '?'));
  } catch (e) { errores.push('buzon: ' + (e && e.message ? e.message : e)); }
  // casos de los ultimos 30 dias
  try {
    const c = await pedir('/aurora/v1/auroraSupporthubService/gql', 'getAllCases',
      'query getAllCases($caseRequest: CaseRequest!) { get_supporthub_allCases(caseRequest: $caseRequest) { caseNumber createdDate subject status } }', { caseRequest: {} });
    const lista = c.j && c.j.data && c.j.data.get_supporthub_allCases;
    if (Array.isArray(lista)) {
      const desde = Date.now() - 30 * 86400000;
      out.casos = lista.filter(x => x && /^\d{6,10}$/.test(String(x.caseNumber)) && new Date(x.createdDate).getTime() >= desde)
        .map(x => ({ folio: String(x.caseNumber), fecha: iso(x.createdDate), asunto: String(x.subject || '').replace(/\s+/g, ' ').trim(), estado: /needs info/i.test(String(x.status || '')) ? 'Trabajo en progreso' : String(x.status || '') }));   // la pagina muestra "Needs Info - Internal" como "Trabajo en progreso"
    } else errores.push('casos: ' + (c.st || '?'));
  } catch (e) { errores.push('casos: ' + (e && e.message ? e.message : e)); }
  out.antibot = antibot;
  return out;
}

// Pestaña para leer: una de Seller Center ya abierta (no se mueve ni se cierra) o una propia (en una ventana existente, o minimizada si Chrome no tiene ventana).
async function scPestanaApi(soloPropia) {
  if (!soloPropia) {
    let abiertas = [];
    try { abiertas = (await chrome.tabs.query({ url: 'https://seller.walmart.com/*' })).filter(t => t && t.id != null && t.status === 'complete' && !/login|signin|sso|auth/i.test(t.url || '')); } catch (e) { abiertas = []; }
    if (abiertas.length) return { tabId: abiertas[0].id, propia: false, winId: null };
  }
  const u = SC_URL + 'orders/manage-orders?orderGroups=Unshipped&fulfilmentType=Seller';
  let wins = []; try { wins = await chrome.windows.getAll({ windowTypes: ['normal'] }); } catch (e) { wins = []; }
  if (wins.length) {
    const t = await chrome.tabs.create({ url: u, active: false, windowId: wins[0].id });
    await esperarCarga(t.id, 30000);
    return { tabId: t.id, propia: true, winId: null };
  }
  const w = await chrome.windows.create({ url: u, focused: false, state: 'minimized', type: 'normal' });
  const t = w && w.tabs && w.tabs[0];
  if (!t) throw new Error('no pude abrir una ventana para Seller Center');
  await esperarCarga(t.id, 30000);
  return { tabId: t.id, propia: true, winId: w.id };
}

// Lee pedidos, buzon y casos por la API y lo manda al Sheet. {terminado:true,res} si ya quedo (bien o con error definitivo); {terminado:false} = que siga la lectura por pantalla.
async function scApi(url, clave, pend) {
  let r = null;
  for (let intento = 0; intento < 2; intento++) {
    let pest = null;
    try {
      pest = await scPestanaApi(intento === 1);
      const res = await conTope(chrome.scripting.executeScript({ target: { tabId: pest.tabId }, world: 'MAIN', func: enSellerApi, args: [pend || []] }), 150000);
      r = res && res[0] ? res[0].result : null;
    } catch (e) { r = { fallo: String(e && e.message ? e.message : e) }; }
    finally {
      if (pest && pest.propia) {
        try { await chrome.tabs.remove(pest.tabId); } catch (e2) {}
        if (pest.winId) { try { await chrome.windows.remove(pest.winId); } catch (e3) {} }
      }
    }
    if ((!r || r.sesion === false || r.fallo) && !(pest && pest.propia)) continue;   // la pestaña abierta no sirvio: se prueba con una propia
    break;
  }
  if (!r || r.fallo) return { terminado: false };
  if (r.sesion === false) { await estadoSC(false, 'Seller Center sin sesion: entra a seller.walmart.com con tu codigo 2FA'); return { terminado: true, res: { ok: false, error: 'sin_sesion' } }; }
  const grupos = ['Unshipped', 'Canceled', 'All'].filter(g => r.pedidos && Array.isArray(r.pedidos[g]));
  if (!grupos.length) {
    if (r.antibot) { await estadoSC(false, 'Walmart bloqueo la lectura (anti-bot): entra a Seller Center a mano y reintenta'); return { terminado: true, res: { ok: false, error: 'antibot' } }; }
    return { terminado: false };
  }
  let leidos = 0, nuevas = 0, cambios = 0, falla = '', fallaPedidos = '';
  const mandar = async (grupo, filas) => {
    const j = await scMandar(url, clave, grupo, filas);
    if (!j || !j.ok) { falla = { no_autorizado: 'Clave incorrecta', no_json: 'Publica Nueva version del Web App', bloqueado_espera_10_min: 'Demasiados intentos: espera 10 minutos' }[j && j.error] || ('El Sheet respondio: ' + (j && j.error)); return false; }
    leidos += filas.length; nuevas += j.nuevas || 0; cambios += j.cambios || 0; return true;
  };
  for (const g of grupos) {
    await estadoSC(true, 'Enviando ' + r.pedidos[g].length + ' pedidos (' + g + ') al Sheet...', true);
    if (!(await mandar(g, r.pedidos[g]))) { fallaPedidos = falla; break; }
    await esperar(300);
  }
  if (!fallaPedidos && r.buscados && r.buscados.length && !(await mandar('Busqueda', r.buscados))) fallaPedidos = falla;
  let extra = '';
  if (r.buzon && (r.buzon.sinLeer !== null || r.buzon.porResponder !== null)) {
    try {
      const j = await llamarSheet(url, { accion: 'seller_buzon', clave, sinLeer: r.buzon.sinLeer, porResponder: r.buzon.porResponder });
      if (j && j.ok) extra += ', buzon: ' + (r.buzon.sinLeer === null ? '?' : r.buzon.sinLeer) + ' sin leer'; else if (j && j.error === 'sesion_invalida') extra += ' (buzon no enviado: Publica Nueva version del Web App)';
    } catch (e4) { extra += ' (buzon no enviado)'; }
  } else extra += ' (buzon no leido)';
  if (r.casos && r.casos.length) {
    try {
      const j = await llamarSheetReint(url, { accion: 'seller_casos', clave, filas: r.casos });
      if (j && j.ok) extra += ', ' + r.casos.length + ' casos'; else if (j && j.error === 'sesion_invalida') extra += ' (casos no enviados: Publica Nueva version del Web App)';
    } catch (e5) { extra += ' (casos no enviados)'; }
  } else if (!r.casos) extra += ' (casos no leidos)';
  if (fallaPedidos) { await estadoSC(false, fallaPedidos + ' (pedidos no guardados; el buzon y los casos si se leyeron' + extra + ')'); return { terminado: true, res: { ok: false, error: 'sheet' } }; }
  await estadoSC(true, leidos + ' pedidos leidos por API' + (r.buscados && r.buscados.length ? ' (+' + r.buscados.length + ' buscados)' : '') + (cambios ? ', ' + cambios + ' cambio(s) de estado' : '') + extra);
  return { terminado: true, res: { ok: true, leidos, nuevas, cambios } };
}

let scDesde = 0;
async function scCiclo(forzar) {
  if (!forzar && !(await tengoTurno())) { await estadoSC(true, enEsperaTxt()); return { ok: true, espera: true, turno: false }; }
  if (scOcupado && Date.now() - scDesde > 4 * 60000) scOcupado = false;   // una lectura que se colgo no bloquea para siempre
  if (scOcupado) {
    if (forzar) await estadoSC(true, 'Ya esta leyendo desde las ' + new Date(scDesde).toLocaleTimeString('es-MX') + ': espera a que termine', true);
    return { ok: false, error: 'ocupado' };
  }
  if (!forzar && Date.now() - scUltimoCiclo < 5 * 60000) return { ok: true, espera: true };
  scOcupado = true; scUltimoCiclo = Date.now(); scDesde = Date.now();
  const vivo = setInterval(() => { try { chrome.runtime.getPlatformInfo().catch(() => {}); } catch (e) {} }, 20000);   // mantiene despierto el servicio mientras lee
  let tabId = null;
  try {
    const g = await chrome.storage.local.get(['url', 'clave']);
    const url = g.url || URL_DEFECTO;
    if (!url || !g.clave || !URL_OK.test(url)) { await estadoSC(false, 'Falta configurar URL y clave (Opciones)'); return { ok: false, error: 'sin_config' }; }
    await estadoSC(true, 'Leyendo Seller Center...', true);
    // 1) por la API de Seller Center (como la extension Guias Walmart); 2) si no se pudo, por pantalla como antes
    let pp = null;
    try {
      pp = await llamarSheet(url, { accion: 'seller_pendientes', clave: g.clave });
      const pend = (pp && pp.ok && Array.isArray(pp.pedidos)) ? pp.pedidos.filter(x => /^\d{9,20}$/.test(String(x))).slice(0, SC_MAX_BUSCAR) : [];
      const ra = await scApi(url, g.clave, pend);
      if (ra && ra.terminado) return ra.res;
    } catch (eApi) { /* sigue con la lectura por pantalla */ }
    const t = await chrome.tabs.create({ url: 'about:blank', active: false });
    tabId = t.id;
    let leidos = 0, nuevas = 0, cambios = 0, falla = '', fallaPedidos = '';
    const mandar = async (grupo, filas) => {
      const j = await scMandar(url, g.clave, grupo, filas);
      if (!j || !j.ok) { falla = { no_autorizado: 'Clave incorrecta', no_json: 'Publica Nueva version del Web App', bloqueado_espera_10_min: 'Demasiados intentos: espera 10 minutos' }[j && j.error] || ('El Sheet respondio: ' + (j && j.error)); return false; }
      leidos += filas.length; nuevas += j.nuevas || 0; cambios += j.cambios || 0; return true;
    };
    for (const [grupo, qs] of SC_LISTAS) {
      await estadoSC(true, 'Leyendo pedidos (' + grupo + ')...', true);
      const r = await scLeerUrl(tabId, SC_URL + 'orders/manage-orders?' + qs + '&fulfilmentType=Seller&limit=200', 'orderGroups=' + grupo);
      if (r.sesion === false) { await estadoSC(false, 'Seller Center sin sesion (' + (r.destino || 'otra pagina') + '): entra a seller.walmart.com con tu codigo 2FA'); return { ok: false, error: 'sin_sesion' }; }
      if (r.cambio) { await estadoSC(false, 'Seller Center cambio su pagina de pedidos: avisa para ajustar la extension'); return { ok: false, error: 'pagina_distinta' }; }
      if (r.timeout) { await estadoSC(false, 'Seller Center no mostro la tabla (¿pide el codigo 2FA?): entra y vuelve a intentar'); return { ok: false, error: 'sin_tabla' }; }
      await estadoSC(true, 'Enviando ' + r.filas.length + ' pedidos (' + grupo + ') al Sheet...', true);
      if (!(await mandar(grupo, r.filas))) { fallaPedidos = falla; break; }   // el buzon y los casos se leen igual
      await esperar(1500);
    }
    // pedidos que el Sheet quiere ver uno por uno (los de "Pedidos en riesgo" sin resolver)
    const p = fallaPedidos ? null : (pp || await llamarSheet(url, { accion: 'seller_pendientes', clave: g.clave }));   // ya se pidio al principio
    let buscados = 0;
    if (p && p.ok && Array.isArray(p.pedidos)) {
      const lote = [], lista = p.pedidos.filter(x => /^\d{9,20}$/.test(String(x))).slice(0, SC_MAX_BUSCAR);
      for (const ped of lista) {
        await estadoSC(true, 'Buscando pedido ' + (buscados + 1) + ' de ' + lista.length + '...', true);
        const r = await scLeerUrl(tabId, SC_URL + 'orders/manage-orders?orderNumber=' + encodeURIComponent(ped) + '&orderGroups=All&fulfilmentType=Seller', 'orderNumber=' + ped);
        if (r.filas) { lote.push(...r.filas.filter(x => x.pedido === String(ped))); buscados++; }
        await esperar(1500);
      }
      if (lote.length && !(await mandar('Busqueda', lote))) fallaPedidos = falla;
    }
    // Buzon (solo dos numeros) y casos: extras. Si fallan NO tumban la lectura de pedidos.
    let extra = '';
    try {
      await estadoSC(true, 'Leyendo el buzon...', true);
      const b = await scBuzon(tabId);
      if (b.sinLeer !== null || b.porResponder !== null) {
        const j = await llamarSheet(url, { accion: 'seller_buzon', clave: g.clave, sinLeer: b.sinLeer, porResponder: b.porResponder });
        if (j && j.ok) extra += ', buzon: ' + (b.sinLeer === null ? '?' : b.sinLeer) + ' sin leer'; else if (j && j.error === 'sesion_invalida') extra += ' (buzon no enviado: Publica Nueva version del Web App)';
      }
    } catch (e3) { extra += ' (buzon no leido)'; }
    try {
      await estadoSC(true, 'Leyendo tus casos...', true);
      const cs = await scCasos(tabId);
      if (cs.length) {
        const j = await llamarSheetReint(url, { accion: 'seller_casos', clave: g.clave, filas: cs });
        if (j && j.ok) extra += ', ' + cs.length + ' casos'; else if (j && j.error === 'sesion_invalida') extra += ' (casos no enviados: Publica Nueva version del Web App)';
      }
    } catch (e4) { extra += ' (casos no leidos)'; }
    if (fallaPedidos) { await estadoSC(false, fallaPedidos + ' (pedidos no guardados; el buzon y los casos si se leyeron' + extra + ')'); return { ok: false, error: 'sheet' }; }
    await estadoSC(true, leidos + ' pedidos leidos' + (buscados ? ' (+' + buscados + ' buscados)' : '') + (cambios ? ', ' + cambios + ' cambio(s) de estado' : '') + extra);
    return { ok: true, leidos, nuevas, cambios };
  } catch (e) {
    await estadoSC(false, 'No pude leer Seller Center: ' + (e && e.message ? e.message : e));
    return { ok: false, error: 'red' };
  } finally {
    clearInterval(vivo);
    if (tabId !== null) { try { await chrome.tabs.remove(tabId); } catch (e2) {} }
    scOcupado = false;
  }
}

// Al entrar a Seller Center (ya con tu sesion y tu 2FA) lee de inmediato, sin esperar la alarma
chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  if (info.status === 'complete' && tab && tab.url && tab.url.startsWith(SC_URL) && !scOcupado) scCiclo(false);
});


// Auto-actualizacion: al subir una version nueva a la carpeta de la extension (manifest.json con otro "version"),
// la extension se recarga SOLA en cuanto no este ocupada. Sin entrar a chrome://extensions ni dar Recargar.
async function revisarActualizacion() {
  try {
    if (scOcupado || cancelando || (typeof rqOcupado !== 'undefined' && rqOcupado) || (typeof wmOcupado !== 'undefined' && wmOcupado) || (typeof gaOcupado !== 'undefined' && gaOcupado)) return false;   // 20-nov: no recargar a media vuelta (a las 9:23 se perdieron 15 guias por eso)
    const r = await fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' });
    const disco = (await r.json()).version;
    const actual = chrome.runtime.getManifest().version;
    if (!disco || disco === actual) return false;
    const { recargadoPara } = await chrome.storage.local.get('recargadoPara');
    if (recargadoPara === disco) return false;            // ya lo intente para esa version: no hacer ciclo
    await chrome.storage.local.set({ recargadoPara: disco });
    chrome.runtime.reload();
    return true;
  } catch (e) { return false; }
}


// ---- Walmart: cancelar ventas de PRECIO ERRONEO en Seller Center (v1.6, 19-nov-2026: decision de la dueña) ----
// SOLO cancela las ordenes que el Sheet manda en 'wm_cancel_pendientes' (precio erroneo con la casilla CANCELAR EN ODOO marcada, ver CancelacionesWalmartAuto.gs).
// Antes de tocar nada lee el estado REAL en Seller Center (solo cancela lo que sigue sin enviar), despues de cancelar VERIFICA que quedo "Canceled",
// y una falla detiene la vuelta. Pausa total: propiedad WALMART_CANCEL_PAUSA = 1 en el Sheet. Nunca cancela por clics: es la misma operacion que usa la pagina.
const WM_CADA_MIN = 5;
const WM_MAX_ORDENES = 5;
let wmOcupado = false, wmDesde = 0;

async function estadoWM(ok, texto, enCurso) {
  await chrome.storage.local.set({ estadoWM: { ok, texto, hora: Date.now(), enCurso: !!enCurso } });
}

// Se ejecuta DENTRO de la pestaña de Seller Center (mundo MAIN, con tu sesion). Sin variables de fuera.
// Devuelve { sesion, resultados:[{orden, resultado, motivo, detalle}], antibot }.  resultado: cancelada | ya_cancelada | no_cancelable | error
async function enWalmartCancelar(ordenes) {
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  const cookie = n => { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; };
  const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2, '0')).join('');
  const permitidas = (Array.isArray(ordenes) ? ordenes : []).map(String).filter(x => /^\d{9,20}$/.test(x)).slice(0, 5);
  let tm = {};
  for (let i = 0; i < 12; i++) {
    try { const d = JSON.parse(localStorage.getItem('TMX_DATA') || '{}'); const ev = Object.keys(d)[0]; tm = { id: ev && d[ev] && d[ev].tmxId, ev }; } catch (e) { tm = {}; }
    if (cookie('XSRF-TOKEN') && tm.id) break;
    await esperar(1000);
  }
  if (!cookie('XSRF-TOKEN') || !tm.id) return { sesion: false, resultados: [] };
  let antibot = false;
  const RUTA = '/aurora/v2/auroraOrderService/gql';
  const OP_LEER = 'get_orders_getAllOrders', OP_CANCELAR = 'update_orders_updateOrder';
  const MOTIVOS = ['SELLER_REJECTION', 'MIRAKL_REFUND_45'];
  const QL = 'query get_orders_getAllOrders($params: SearchParams) { get_orders_getAllOrders(searchParams: $params) { orderInfo { purchaseOrders { customerOrderId purchaseOrderId isWCPOrder poLines { lineId primeLineNo poLineStatus quantity } } } } }';
  const QM = 'mutation update_orders_updateOrder($input: [PoUpdateRequest]) { update_orders_updateOrder(poUpdateRequest: $input) { poUpdateResponseStatus { poNumber updateResponsePoLineList { status statusDescription lineIds error errorCode source } errorList } } }';
  // UNICA operacion de escritura que existe aqui: cancelar una orden de la lista aprobada, con motivo conocido. Todo lo demas se rechaza.
  function validar(op, query, variables) {
    if (op === OP_LEER) { if (query !== QL) throw new Error('consulta no permitida'); return; }
    if (op !== OP_CANCELAR || query !== QM) throw new Error('operacion rechazada');
    const inp = variables && variables.input;
    if (!Array.isArray(inp) || inp.length !== 1) throw new Error('cancelacion mal formada');
    const po = inp[0];
    if (!po || !permitidas.includes(String(po.poNumber)) || !Array.isArray(po.poLineRequestDTOList) || !po.poLineRequestDTOList.length) throw new Error('orden no autorizada');
    po.poLineRequestDTOList.forEach(l => { if (l.updatedStatus !== 'Canceled' || !MOTIVOS.includes(l.cancelationReasonEnum)) throw new Error('linea no permitida'); });
  }
  async function pedir(op, query, variables) {
    validar(op, query, variables);
    const h = { accept: 'application/json', 'content-type': 'application/json', 'wm_aurora.locale': 'es-MX', 'wm_aurora.market': 'MX', 'wm_svc.name': 'API',
                'wm_qos.correlation_id': crypto.randomUUID(), 'x-xsrf-token': cookie('XSRF-TOKEN'), 'wm_aurora.tmxid': tm.id, 'wm_aurora.tmxevent': tm.ev,
                traceparent: '00-' + hex(16) + '-' + hex(8) + '-00', pxqueryname: op, 'wm_aurora.timezone': '-06:00' };
    for (const k of Object.keys(h)) if (h[k] == null) delete h[k];
    const r = await fetch(RUTA, { method: 'POST', credentials: 'include', headers: h, body: JSON.stringify({ query, variables }) });
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) { j = null; }
    if (r.status === 403 || /perimeterx|px-captcha|access denied/i.test(j ? '' : txt)) antibot = true;
    return { st: r.status, j, txt };
  }
  const limpio = s => String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').replace(/[?&=]/g, ' ').slice(0, 150);
  async function leer(grupo) {
    try {
      const r = await pedir(OP_LEER, QL, { params: { fulfilmentType: ['Seller'], orderGroups: grupo, pageInfo: { limit: '200', offset: '0', cursor: '*' } } });
      const info = r.j && r.j.data && r.j.data.get_orders_getAllOrders && r.j.data.get_orders_getAllOrders.orderInfo;
      return info ? (info.purchaseOrders || []) : null;
    } catch (e) { return null; }
  }
  const estados = p => (p.poLines || []).map(l => String(l.poLineStatus || ''));
  const cancelada = s => /^cancel+ed$/i.test(s);
  const buscar = (lista, orden) => (lista || []).find(p => String(p.purchaseOrderId).replace(/\s+/g, '') === orden) || null;
  const resultados = [];
  for (let k = 0; k < permitidas.length; k++) {
    const orden = permitidas[k];
    let r = null;
    try {
      const sin = await leer('Unshipped');
      if (sin === null) { r = { orden, resultado: 'error', detalle: antibot ? 'Walmart bloqueo la lectura (anti-bot)' : 'no pude leer Seller Center' }; resultados.push(r); break; }
      let po = buscar(sin, orden);
      if (!po) {   // no esta en "Sin enviar": ya cancelada, ya enviada o no existe
        const can = await leer('Canceled');
        const pc = buscar(can, orden);
        if (pc && estados(pc).length && estados(pc).every(cancelada)) { resultados.push({ orden, resultado: 'ya_cancelada' }); continue; }
        const todas = await leer('All');
        const pa = buscar(todas, orden);
        if (pa && estados(pa).length && estados(pa).every(cancelada)) { resultados.push({ orden, resultado: 'ya_cancelada' }); continue; }
        resultados.push({ orden, resultado: 'no_cancelable', detalle: pa ? 'estado en Seller Center: ' + limpio(estados(pa).join('/')) : 'no aparece en Seller Center (Sin enviar / Canceladas / Todas)' });
        continue;
      }
      const lineas = (po.poLines || []).filter(l => /^(new|created|acknowledged)$/i.test(String(l.poLineStatus || '')));
      const raras = (po.poLines || []).filter(l => !/^(new|created|acknowledged|cancel+ed)$/i.test(String(l.poLineStatus || '')));
      if (!lineas.length || raras.length) { resultados.push({ orden, resultado: 'no_cancelable', detalle: 'estado en Seller Center: ' + limpio(estados(po).join('/')) }); continue; }
      // "Rechazar" (como la cancelas tu) solo existe mientras la orden sigue sin aceptar; ya aceptada la pagina ofrece "Error de precio"
      const motivo = lineas.every(l => /^(new|created)$/i.test(String(l.poLineStatus || ''))) ? 'SELLER_REJECTION' : 'MIRAKL_REFUND_45';
      const input = [{ poNumber: orden, isWCPOrder: po.isWCPOrder === true,
        poLineRequestDTOList: lineas.map(l => ({ lineIds: l.lineId, updatedQuantity: l.quantity, primeLineNo: l.primeLineNo, updatedStatus: 'Canceled', cancelationReasonEnum: motivo })) }];
      const m = await pedir(OP_CANCELAR, QM, { input });
      const resp = m.j && m.j.data && m.j.data.update_orders_updateOrder;
      let problema = '';
      if (m.j && Array.isArray(m.j.errors) && m.j.errors.length) problema = 'Walmart respondio: ' + limpio(m.j.errors[0] && m.j.errors[0].message);
      else if (!resp) problema = 'respuesta inesperada (HTTP ' + m.st + ')' + (antibot ? ' anti-bot' : '');
      else {
        const pr = (resp.poUpdateResponseStatus || [])[0] || {};
        const el = Array.isArray(pr.errorList) ? pr.errorList.filter(Boolean) : [];
        const le = (pr.updateResponsePoLineList || []).filter(x => x && (x.error || x.errorCode));
        if (el.length) problema = 'Walmart respondio: ' + limpio(el[0]);
        else if (le.length) problema = 'Walmart respondio: ' + limpio(le[0].error || le[0].errorCode);
      }
      // verificacion: ya no esta en "Sin enviar" y esta en Canceladas con todas sus lineas "Canceled"
      let ok = false;
      for (let v = 0; v < 6 && !ok; v++) {
        await esperar(2500);
        const s2 = await leer('Unshipped');
        if (s2 && buscar(s2, orden)) continue;
        const c2 = await leer('Canceled');
        const p2 = buscar(c2, orden);
        if (p2 && estados(p2).length && estados(p2).every(cancelada)) ok = true;
      }
      if (ok) resultados.push({ orden, resultado: 'cancelada', motivo });
      else { resultados.push({ orden, resultado: 'error', motivo, detalle: problema || 'no pude verificar que quedo cancelada: revisa Seller Center' }); break; }   // una falla detiene la vuelta
    } catch (e) {
      resultados.push({ orden, resultado: 'error', detalle: limpio(e && e.message ? e.message : e) });
      break;
    }
    await esperar(2500);
  }
  return { sesion: true, resultados, antibot };
}

async function wmCancelCiclo(forzar) {
  if (!forzar && !(await tengoTurno())) { await estadoWM(true, enEsperaTxt()); return { ok: true, espera: true, turno: false }; }
  if (wmOcupado && Date.now() - wmDesde > 6 * 60000) wmOcupado = false;
  if (wmOcupado) return { ok: false, error: 'ocupado' };
  if (scOcupado) return { ok: true, espera: true };   // no se cruza con la lectura de Seller Center
  wmOcupado = true; wmDesde = Date.now();
  const vivo = setInterval(() => { try { chrome.runtime.getPlatformInfo().catch(() => {}); } catch (e) {} }, 20000);
  let pest = null;
  try {
    const g = await chrome.storage.local.get(['url', 'clave']);
    const url = g.url || URL_DEFECTO;
    if (!url || !g.clave || !URL_OK.test(url)) { await estadoWM(false, 'Falta configurar URL y clave (Opciones)'); return { ok: false, error: 'sin_config' }; }
    const p = await llamarSheetReint(url, { accion: 'wm_cancel_pendientes', clave: g.clave });
    if (!p || !p.ok) {
      await estadoWM(false, { no_autorizado: 'Clave incorrecta', no_json: 'Publica Nueva version del Web App', sesion_invalida: 'Falta publicar Nueva version del Web App (Implementar > Administrar implementaciones > Nueva version)', bloqueado_espera_10_min: 'Demasiados intentos: espera 10 minutos', ocupado: 'El Sheet esta ocupado: se reintenta' }[p && p.error] || ('El Sheet respondio: ' + (p && p.error)));
      return p || { ok: false };
    }
    const ordenes = (Array.isArray(p.ordenes) ? p.ordenes : []).map(String).filter(x => /^\d{9,20}$/.test(x)).slice(0, WM_MAX_ORDENES);
    if (!ordenes.length) { await estadoWM(true, p.nota === 'pausado' ? 'En pausa (WALMART_CANCEL_PAUSA en el Sheet): no cancela nada' : (p.nota === 'sin_casilla' ? 'Falta la columna CANCELADA EN WALMART en Cancelaciones' : 'Sin cancelaciones pendientes en Walmart')); return { ok: true, n: 0 }; }
    await estadoWM(true, 'Cancelando ' + ordenes.length + ' orden(es) en Walmart...', true);
    let r = null;
    try {
      pest = await scPestanaApi(false);
      const res = await conTope(chrome.scripting.executeScript({ target: { tabId: pest.tabId }, world: 'MAIN', func: enWalmartCancelar, args: [ordenes] }), 200000);
      r = res && res[0] ? res[0].result : null;
    } catch (e) { r = { fallo: String(e && e.message ? e.message : e) }; }
    if (!r || r.fallo || r.sesion === false) {
      const motivo = !r ? 'no obtuve respuesta de Seller Center' : (r.fallo ? r.fallo.slice(0, 80) : 'Seller Center sin sesion');
      try { await llamarSheetReint(url, { accion: 'wm_cancel_resultado', clave: g.clave, orden: ordenes[0], resultado: 'sin_sesion', detalle: motivo }); } catch (e2) {}
      await estadoWM(false, 'No pude cancelar en Walmart: ' + motivo + '. Entra a seller.walmart.com con tu codigo 2FA');
      return { ok: false, error: 'sin_sesion' };
    }
    let hechas = 0, fallas = 0;
    for (const x of (r.resultados || [])) {
      try { await llamarSheetReint(url, { accion: 'wm_cancel_resultado', clave: g.clave, orden: String(x.orden), resultado: x.resultado, motivo: x.motivo || '', detalle: x.detalle || '' }); } catch (e3) { fallas++; }
      if (x.resultado === 'cancelada' || x.resultado === 'ya_cancelada') hechas++; else fallas++;
    }
    await estadoWM(!fallas, hechas + ' marcada(s) como canceladas en Walmart' + (fallas ? ', ' + fallas + ' con problema (cancelalas a mano; ver Log del Sheet)' : ''));
    return { ok: !fallas, hechas, fallas };
  } catch (e) {
    await estadoWM(false, 'No pude cancelar en Walmart: ' + (e && e.message ? e.message : e));
    return { ok: false, error: 'red' };
  } finally {
    clearInterval(vivo);
    if (pest && pest.propia) {
      try { await chrome.tabs.remove(pest.tabId); } catch (e4) {}
      if (pest.winId) { try { await chrome.windows.remove(pest.winId); } catch (e5) {} }
    }
    wmOcupado = false;
  }
}


// ---- Rastreo de guias (v1.7, 19-nov-2026): BigSmart y FedEx, leyendo sus paginas PUBLICAS en una pestaña propia ----
// El Sheet dice que guias tocan (ultimos 14 dias, sin estado final, cada 3 h). Una por una, con pausa. Solo LEE: no da clics salvo
// "View more details" de FedEx (abre el historial), no llena formularios, no usa la API de nadie. Si aparece la verificacion "eres humano":
// se detiene la vuelta y la guia queda REVISAR A MANO (nunca se intenta saltar). Corre todo el dia, cada 10 min.
const RQ_CADA_MIN = 10;
const RQ_LOTE = 40;   // 20-nov: 20 -> 40 (ya entran tambien las guias de TRACKING de Seller Center)
const RQ_PAUSA_MS = 4000;
const RQ_INTENTOS = 3;          // 20-nov (ella: "entra en loop hasta que consigas los datos"): cada guia se intenta hasta 3 veces en la misma vuelta
const RQ_VUELTA_MAX_MS = 7 * 60000;   // una vuelta no pasa de 7 min; lo que falte sigue en la siguiente (en 2 min)
let rqOcupado = false, rqDesde = 0;

// Abre la guia en la pestaña de trabajo y espera a que de verdad cargue ESA pagina (no la anterior ni about:blank).
async function rqAbrir(tabId, destino) {
  await chrome.tabs.update(tabId, { url: destino });
  const host = new URL(destino).host;
  for (let i = 0; i < 45; i++) {
    await esperar(1000);
    let t = null; try { t = await chrome.tabs.get(tabId); } catch (e) { return false; }
    if (t && t.status === 'complete' && String(t.url || '').indexOf(host) >= 0) return true;
  }
  return false;
}

async function estadoRQ(ok, texto, enCurso) {
  await chrome.storage.local.set({ estadoRQ: { ok, texto, hora: Date.now(), enCurso: !!enCurso } });
}

// Dentro de la pagina de BigSmart. Sin variables de fuera. Devuelve { ok, cf, error, resumen, eventos:[{cod, txt, fecha, lugar}] } (lo mas reciente primero).
async function enBigSmart() {
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  const cf = () => /verifique que es un ser humano|verify you are human|checking your browser|just a moment/i.test((document.title || '') + ' ' + (document.body ? document.body.innerText.slice(0, 2000) : ''));
  const q = (e, s) => { const x = e.querySelector(s); return x ? x.innerText.replace(/\s+/g, ' ').trim() : ''; };
  for (let i = 0; i < 40; i++) {
    if (cf()) return { ok: false, cf: true };
    const el = document.querySelector('bigsmart-tracking'), sr = el && el.shadowRoot;
    if (sr) {
      const logs = [...sr.querySelectorAll('li.log')];
      const errTxt = q(sr, '.feedback__text--error');
      if (logs.length) {
        const eventos = logs.map(l => ({ cod: q(l, '.log__code'), txt: q(l, '.log__activity'), fecha: q(l, '.log__date'), lugar: q(l, '.log__location').slice(0, 60) }));
        const cur = sr.querySelector('.stage--current .stage__name');
        return { ok: true, resumen: cur ? cur.innerText.trim() : '', eventos };
      }
      if (errTxt) return { ok: false, error: 'Paqueteria Dedicada Walmart: ' + errTxt.slice(0, 80) };
    }
    await esperar(1000);
  }
  return { ok: false, error: 'la pagina de la Paqueteria Dedicada Walmart no mostro el historial' };
}

// Dentro de la pagina de FedEx. Abre "View more details" (solo muestra el historial) y lee los eventos. Lo mas reciente va AL FINAL.
async function enFedex() {
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  const cf = () => /verify you are human|verifique que es un ser humano|access denied|checking your browser/i.test((document.title || '') + ' ' + (document.body ? document.body.innerText.slice(0, 2000) : ''));
  let activo = '';
  for (let i = 0; i < 25 && !activo; i++) {
    if (cf()) return { ok: false, cf: true };
    const a = document.querySelector('.phase3-progress-bar__label--active');
    if (a) activo = a.innerText.trim();
    else if (/not found|no se encontr|unable to retrieve|no record/i.test(document.body ? document.body.innerText.slice(0, 3000) : '')) return { ok: false, error: 'FedEx no encontro la guia' };
    if (!activo) await esperar(1000);
  }
  if (!activo) return { ok: false, error: 'la pagina de FedEx no mostro el estatus' };
  const b = [...document.querySelectorAll('button')].find(x => /view more details|ver m[aá]s detalles/i.test(x.innerText || ''));
  if (b) { b.click(); await esperar(3000); }
  const t = (document.body ? document.body.innerText : '').replace(/\r/g, '');
  const es = t.search(/Historial de transporte|Historial de viaje/i) >= 0 && t.search(/Travel History/i) < 0;   // 20-nov: en el Chrome de ella FedEx sale en espanol (fechas dd/mm/aa, 24 h)
  const i0 = t.search(/Travel History|Historial de viaje|Historial de transporte/i), i1 = t.search(/Shipment facts|Datos del env[ií]o/i);
  const bloque = i0 >= 0 ? t.slice(i0, i1 > i0 ? i1 : i0 + 6000) : '';
  const lineas = bloque.split('\n').map(x => x.trim()).filter(Boolean);
  const eventos = []; let dia = '';
  for (let k = 0; k < lineas.length; k++) {
    const l = lineas[k];
    const d = l.match(/^(?:[A-Za-zÁÉÍÓÚáéíóú]+,?\s+)?(\d{1,2}\/\d{1,2}\/\d{2,4})/);
    if (d && !/\d{1,2}:\d{2}/.test(l)) { dia = es ? d[1].replace(/^(\d{1,2})\/(\d{1,2})\//, '$2/$1/') : d[1]; continue; }   // en espanol dd/mm -> mm/dd (como la pagina en ingles)
    if (/^\d{1,2}:\d{2}\s*(AM|PM|a\.?\s?m\.?|p\.?\s?m\.?)?$/i.test(l)) {
      const txt = lineas[k + 1] || '', sig = lineas[k + 2] || '';
      const lugar = (sig && !/^\d{1,2}:\d{2}/.test(sig) && !/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(sig) && /^[A-ZÁÉÍÓÚÑ0-9 ,.-]+$/.test(sig)) ? sig : '';
      eventos.push({ cod: '', txt: txt.slice(0, 120), fecha: (dia + ' ' + l).trim(), lugar: lugar.slice(0, 60) });
      k += lugar ? 2 : 1;
    }
  }
  return { ok: true, resumen: activo, eventos };
}

async function rqCiclo(forzar) {
  if (!forzar && !(await tengoTurno())) { await estadoRQ(true, enEsperaTxt()); return { ok: true, espera: true, turno: false }; }
  if (rqOcupado && Date.now() - rqDesde > 9 * 60000) rqOcupado = false;
  if (rqOcupado) return { ok: false, error: 'ocupado' };
  rqOcupado = true; rqDesde = Date.now();
  const vivo = setInterval(() => { try { chrome.runtime.getPlatformInfo().catch(() => {}); } catch (e) {} }, 20000);
  let tabId = null, winId = null;
  try {
    const g = await chrome.storage.local.get(['url', 'clave']);
    const url = g.url || URL_DEFECTO;
    if (!url || !g.clave || !URL_OK.test(url)) { await estadoRQ(false, 'Falta configurar URL y clave (Opciones)'); return { ok: false, error: 'sin_config' }; }
    const p = await llamarSheetReint(url, { accion: 'rastreo_lista', clave: g.clave });
    if (!p || !p.ok) {
      await estadoRQ(false, { no_autorizado: 'Clave incorrecta', sesion_invalida: 'Falta publicar Nueva version del Web App', ocupado: 'El Sheet esta ocupado: se reintenta' }[p && p.error] || ('El Sheet respondio: ' + (p && p.error)));
      return p || { ok: false };
    }
    const guias = (Array.isArray(p.guias) ? p.guias : []).filter(x => x && /^[A-Za-z0-9]{8,30}$/.test(String(x.guia)) && (x.paq === 'BIGSMART' || x.paq === 'FEDEX')).slice(0, RQ_LOTE);
    if (!guias.length) { await estadoRQ(true, 'Sin guias por consultar' + (p.nota === 'ocupado' ? ' (Sheet ocupado: reintento en 2 min)' : '')); return p.nota === 'ocupado' ? { ok: false, error: 'ocupado' } : { ok: true, n: 0 }; }
    await estadoRQ(true, 'Consultando ' + guias.length + ' guia(s) en la paqueteria...', true);
    let wins = []; try { wins = await chrome.windows.getAll({ windowTypes: ['normal'] }); } catch (e) { wins = []; }
    if (wins.length) { const t = await chrome.tabs.create({ url: 'about:blank', active: false, windowId: wins[0].id }); tabId = t.id; }
    else { const w = await chrome.windows.create({ url: 'about:blank', focused: false, state: 'minimized', type: 'normal' }); winId = w.id; tabId = w.tabs[0].id; }
    try { await chrome.tabs.update(tabId, { autoDiscardable: false }); } catch (eD) {}
    const resultados = []; let cf = false;
    for (const x of guias) {
      if (Date.now() - rqDesde > RQ_VUELTA_MAX_MS) break;   // lo que falte va en la siguiente vuelta
      const destino = x.paq === 'BIGSMART' ? 'https://bigsmart.mx/tracking/?trackingNumber=' + encodeURIComponent(x.guia) : 'https://www.fedex.com/fedextrack/?trknbr=' + encodeURIComponent(x.guia);
      let r = null, intento = 0;
      while (intento < RQ_INTENTOS && !(r && (r.ok || r.cf))) {
        intento++;
        try {
          const cargo = await rqAbrir(tabId, destino);
          const res = await conTope(chrome.scripting.executeScript({ target: { tabId }, func: x.paq === 'BIGSMART' ? enBigSmart : enFedex }), 60000);
          r = res && res[0] ? res[0].result : null;
          if (!r) r = { ok: false, error: cargo ? 'sin respuesta de la pagina' : 'la pagina no termino de cargar' };
        } catch (e) { r = { ok: false, error: String(e && e.message ? e.message : e).slice(0, 80) }; }
        if (!(r.ok || r.cf) && intento < RQ_INTENTOS) await esperar(5000 * intento);
      }
      resultados.push(Object.assign({ guia: x.guia, paq: x.paq, intentos: intento }, r));
      if (r.cf) { cf = true; break; }   // la paqueteria pide verificacion: se para la vuelta (no se intenta saltar)
      await new Promise(rr => setTimeout(rr, RQ_PAUSA_MS));
    }
    const env = await llamarSheetReint(url, { accion: 'rastreo_resultado', clave: g.clave, resultados });
    const malas = resultados.filter(r => !r.ok).length;
    const txt = resultados.length + ' guia(s) consultadas' + (malas ? ', ' + malas + ' para revisar a mano' : '') + (cf ? '. La paqueteria pidio verificacion: me detuve' : '') + (env && env.ok ? (env.finales ? ', ' + env.finales + ' con estado final' : '') : ' (el Sheet no recibio el resultado)');
    await estadoRQ(!cf && !!(env && env.ok), txt + (malas && !cf ? ' (se reintentan solas en 2 min; si una sigue sin leerse ~1 h, el Sheet avisa en rojo)' : ''));
    if (cf) return { ok: false, error: 'cf', n: resultados.length };   // verificacion "eres humano": NO se reintenta rapido
    if (!(env && env.ok)) return { ok: false, error: 'sheet', n: resultados.length };
    return malas || resultados.length < guias.length ? { ok: false, error: 'rq_fallas', n: resultados.length } : { ok: true, n: resultados.length };
  } catch (e) {
    await estadoRQ(false, 'No pude consultar las guias: ' + (e && e.message ? e.message : e));
    return { ok: false, error: 'red' };
  } finally {
    clearInterval(vivo);
    if (tabId != null && winId == null) { try { await chrome.tabs.remove(tabId); } catch (e2) {} }
    if (winId != null) { try { await chrome.windows.remove(winId); } catch (e3) {} }
    rqOcupado = false;
  }
}


// ---- Guias automaticas (v1.5): compra guias y marca enviado en la pagina /walmart/guias, con SUS candados ----
// APAGADO por defecto. Primero "Probar guias ahora" (no compra nada). Solo en modo REAL despues de una prueba sin error.
// NUNCA cancela nada en Walmart. Ver autoguias.js y apps-script/GuiasAuto.gs.
const GA_URL = SITE_URL + 'walmart/guias';
const GA_CADA_MIN = 15;   // horarios FIJOS: :00, :15, :30 y :45. Un pedido sale en la primera vuelta despues de cumplir sus 30 min; una compra rechazada se reintenta en la siguiente vuelta.
function gaSiguienteHora() { const d = new Date(); d.setSeconds(0, 0); d.setMinutes((Math.floor(d.getMinutes() / 15) + 1) * 15); return d.getTime(); }
const GA_HORA_INI = 0, GA_HORA_FIN = 24;   // 19-nov: TODO el dia (ella deja la PC prendida toda la noche); antes 7 a 22
// Cajas que el usuario dicto (L x W x H x KG) para SKU sin medidas en Odoo. Solo se usan si Odoo no tiene la medida, el pedido es de 1 pieza y la caja no se tecleo ya en la pagina (lo tecleado manda).
// Caja por MARCA (prefijo del SKU): los productos de esa marca nunca traen medidas en Odoo. Vale para cualquier pedido de esa marca.
const GA_CAJAS_PREFIJO = { 'OWA-': { L: 20, W: 20, H: 20, KG: 1 } };
const GA_CAJAS_BASE = {
  'WES-WDBBYV0020BNC-NEG-4914': { L: 20, W: 20, H: 20, KG: 1 },   // 24-nov: la dicto ella (sin medidas en Odoo)
  'OWA-FREESIPDESERT32OZ-CAF-4735': { L: 20, W: 20, H: 20, KG: 1 },
  'OWA-FREESIPSWAYRAVENCLAW30OZ-AZU-6036': { L: 20, W: 20, H: 20, KG: 1 },
  'OWA-FREESIPSWAYRAVENCLAW30OZ-AZU-6036-MSI': { L: 20, W: 20, H: 20, KG: 1 },
  'OWA-FREESIPHAZARD30OZ-BLA-6174': { L: 20, W: 20, H: 20, KG: 1 },
  'SHO-SHOKZS821-NEG-9639-MSI': { L: 20, W: 20, H: 20, KG: 1 },
  'HP-16BY0299NR-PLA-9645-MSI': { L: 40, W: 20, H: 10, KG: 1 },
  'JBL-SB580BLKAM-NEG-9203-MSI': { L: 40, W: 30, H: 20, KG: 2 },
  'JBL-SB580BLKAM-NEG-9203': { L: 40, W: 30, H: 20, KG: 2 }
};
let gaOcupado = false, gaDesde = 0;

async function estadoGA(ok, texto, enCurso) {
  await chrome.storage.local.set({ estadoGA: { ok, texto, hora: Date.now(), enCurso: !!enCurso } });
}

// Si una corrida automatica no puede ni abrir Guias, el Log del Sheet debe enterarse (maximo 1 aviso cada 30 min por motivo).
async function gaAvisarSalida(url, clave, motivo, texto) {
  try {
    const k = 'gaAviso_' + motivo, x = await chrome.storage.local.get([k]);
    if (x[k] && Date.now() - x[k] < 30 * 60000) return;
    await chrome.storage.local.set({ [k]: Date.now() });
    await llamarSheet(url, { accion: 'guias_reporte', clave, corrida: { modo: 'real', comprados: [], saltados: {}, sinMedidas: [], canceladasSinFila: [], fallos: [], resultados: { ok: 0, pend: 0, mal: 0 }, error: String(texto || motivo).slice(0, 180) } });
  } catch (e) {}
}

async function gaCiclo(forzar, soloPrueba, manualReal) {
  if (gaOcupado && Date.now() - gaDesde > 20 * 60000) gaOcupado = false;   // una corrida colgada no bloquea para siempre
  if (gaOcupado) return { ok: false, error: 'ocupado' };
  const g = await chrome.storage.local.get(['url', 'clave', 'gaActivo', 'gaModo', 'gaPruebaOk', 'gaIntentadas', 'gaFallos', 'gaGrandesFallos', 'gaVistas', 'gaCajas']);
  if (!forzar) {
    if (!g.gaActivo) return { ok: true, apagado: true };
    if (!forzar && !(await tengoTurno())) { await estadoGA(true, enEsperaTxt()); return { ok: true, espera: true, turno: false }; }   // otra computadora tiene el turno
    const h = new Date().getHours();
    if (h < GA_HORA_INI || h >= GA_HORA_FIN) return { ok: true, fueraDeHora: true };
  }
  // "Comprar ahora": solo si ya activaste las guias automaticas en modo REAL y hubo una PRUEBA sin error (mismas condiciones que la corrida de cada hora).
  if (manualReal && !(g.gaActivo && g.gaModo === 'real' && g.gaPruebaOk)) {
    await estadoGA(false, 'Para comprar ahora: en Opciones activa las guias automaticas en modo REAL y haz antes una prueba sin error.');
    return { ok: false, error: 'no_activado_en_real' };
  }
  gaOcupado = true; gaDesde = Date.now();
  const vivo = setInterval(() => { try { chrome.runtime.getPlatformInfo().catch(() => {}); } catch (e) {} }, 20000);
  let tabId = null;
  try {
    const url = g.url || URL_DEFECTO;
    if (!url || !g.clave || !URL_OK.test(url)) { await estadoGA(false, 'Falta configurar URL y clave (Opciones)'); return { ok: false, error: 'sin_config' }; }
    let modo = (!soloPrueba && g.gaModo === 'real') ? 'real' : 'prueba', aviso = '';
    if (modo === 'real' && !g.gaPruebaOk) { modo = 'prueba'; aviso = ' (falta una PRUEBA sin error antes de comprar de verdad)'; }
    await estadoGA(true, 'Pidiendo al Sheet la lista de pedidos que NO se envian...', true);
    const lista = await llamarSheet(url, { accion: 'guias_lista', clave: g.clave });
    if (lista && lista.ok) await aplicarAlertas(lista.alertas);
    if (!lista || !lista.ok) {
      await aplicarAlertas(['El Sheet no responde o no dio la lista de guias (' + ((lista && lista.error) || 'sin respuesta') + '): no se envia nada']);
      const txtL = 'El Sheet no dio la lista de retenidos (' + ((lista && lista.error) || 'sin respuesta') + '): no se envia nada. Publica Nueva version del Web App si es la primera vez.';
      await estadoGA(false, txtL);
      try { await gaAvisarSalida(url, g.clave, 'sin_lista', txtL); } catch (eAv) {}   // que quede en el Log del Sheet
      return { ok: false, error: 'sin_lista' };
    }
    await estadoGA(true, 'Abriendo la pagina de Guias en segundo plano...', true);
    const t = await chrome.tabs.create({ url: GA_URL, active: false });
    tabId = t.id;
    for (let i = 0; i < 40; i++) { await esperar(1000); const x = await chrome.tabs.get(tabId); if (x.status === 'complete') break; }
    const tab = await chrome.tabs.get(tabId);
    let ruta = ''; try { ruta = new URL(tab.url).pathname; } catch (e) {}
    if (!/^\/walmart\/guias/.test(ruta)) {
      const txtS = 'El site no abrio Guias (¿sin sesion? entra a electronicsmexico.site): ' + (ruta || 'sin pagina');
      await estadoGA(false, txtS);
      await gaAvisarSalida(url, g.clave, 'sin_sesion_site', txtS);   // que quede en el Log del Sheet, no solo en el popup
      return { ok: false, error: 'sin_sesion_site' };
    }
    const hoy = new Date().toDateString();
    const intentadas = (g.gaIntentadas && g.gaIntentadas.dia === hoy) ? g.gaIntentadas.pos : [];
    const tVisto = Date.now();   // hora en que la extension VIO la lista (no cuando termino de comprar)
    await estadoGA(true, (modo === 'real' ? 'Comprando guias' : 'Probando (no compra nada)') + '...', true);
    const r = await conTope(chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: gaEnPagina,
      args: [lista, { modo, vistas: g.gaVistas || {}, cajas: Object.assign({}, GA_CAJAS_BASE, g.gaCajas || {}), cajasPrefijo: GA_CAJAS_PREFIJO, yaIntentadas: intentadas, esperaMs: 150000, compraMs: 600000 }] }), 15 * 60000);
    const res = (r && r[0] && r[0].result) || { ok: false, error: 'la_pagina_no_respondio', modo, comprados: [], saltados: {}, sinMedidas: [], resultados: {} };
    // El reporte al Sheet se verifica (ok) y se reintenta: el de las 15:15 se perdio en silencio.
    const cuerpoRep = { accion: 'guias_reporte', clave: g.clave, corrida: { modo: res.modo, comprados: res.comprados, saltados: res.saltados, sinMedidas: res.sinMedidas, canceladasSinFila: res.canceladasSinFila || [], grandes: res.grandes || [], fallos: res.fallos || [], killerOk: res.killerOk || [], diag: res.diag || [], resultados: res.resultados, error: res.error || '' } };
    let repOk = false, repErr = '';
    for (let i = 0; i < 3 && !repOk; i++) {
      try { const rr = await llamarSheet(url, cuerpoRep); repOk = !!(rr && rr.ok !== false && !rr.error); if (!repOk) repErr = String((rr && rr.error) || 'sin_ok').slice(0, 60); }
      catch (e) { repErr = String((e && e.message) || e).slice(0, 60); }
      if (!repOk && i < 2) await new Promise(r => setTimeout(r, 20000));
    }
    if (!repOk) { try { await chrome.storage.local.set({ gaRepFallo: { ts: Date.now(), err: repErr } }); } catch (e) {} }
    // Las que Walmart rechazo SIN pagar guia (fallo transitorio) se reintentan en la siguiente corrida, hasta 3 veces al dia;
    // las que salieron bien o quedaron con guia pagada (solo falta marcar) no se vuelven a comprar nunca.
    const cuentaF = (g.gaFallos && g.gaFallos.dia === hoy) ? Object.assign({}, g.gaFallos.n) : {};
    const malas = new Set((res.fallos || []).filter(f => !f.pagada).map(f => String(f.po)));
    malas.forEach(po => { cuentaF[po] = (cuentaF[po] || 0) + 1; });
    const fijas = (res.intentados || []).filter(po => !malas.has(String(po)) || cuentaF[String(po)] >= 3);
    const nuevas = Array.from(new Set(intentadas.concat(fijas)));
    const guardar = { gaIntentadas: { dia: hoy, pos: nuevas }, gaFallos: { dia: hoy, n: cuentaF } };
    if (res.modo === 'prueba' && res.ok && !res.error) guardar.gaPruebaOk = true;
    // hora en que se vio por primera vez cada pedido (para la espera de 30 min); los que ya no estan en la lista de Walmart se olvidan
    if (Array.isArray(res.vistos) && res.vistos.length) {
      const nv = {}, ahoraV = tVisto, previas = g.gaVistas || {};
      res.vistos.forEach(po => { nv[po] = previas[po] || ahoraV; });
      guardar.gaVistas = nv;
    }
    await chrome.storage.local.set(guardar);
    // 24-nov: pedidos con MUCHAS PIEZAS que ella ya marco GUIAS LISTAS en el Sheet: se marcan enviados con el boton de la pagina (sin comprar nada).
    // Hasta 3 intentos al dia por pedido; si la pagina todavia no ve sus guias, solo se avisa.
    try {
      const cuentaG = (g.gaGrandesFallos && g.gaGrandesFallos.dia === hoy) ? Object.assign({}, g.gaGrandesFallos.n) : {};
      const listosG = (Array.isArray(lista.grandesListos) ? lista.grandesListos.map(String) : []).filter(po => (cuentaG[po] || 0) < 3);
      if (listosG.length && !res.error) {
        await estadoGA(true, 'Marcando enviados los pedidos con muchas piezas que ya tienen guias...', true);
        const rm = await conTope(chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: gaMarcarListos, args: [listosG, { modo, esperaMs: 120000, marcarMs: 300000 }] }), 8 * 60000);
        const gm = (rm && rm[0] && rm[0].result) || { ok: false, error: 'la_pagina_no_respondio', marcados: [], fallos: [], sinGuia: [] };
        (gm.fallos || []).forEach(f => { cuentaG[String(f.po)] = (cuentaG[String(f.po)] || 0) + 1; });
        await chrome.storage.local.set({ gaGrandesFallos: { dia: hoy, n: cuentaG } });
        await llamarSheet(url, { accion: 'guias_grandes_resultado', clave: g.clave, modo: gm.modo || modo, marcados: gm.marcados || [], marcarian: gm.marcarian || [], sinGuia: gm.sinGuia || [], fallos: gm.fallos || [], error: gm.error || '' });
        if ((gm.marcados || []).length) res.grandesMarcados = gm.marcados.length;
      }
    } catch (eGm) { try { await llamarSheet(url, { accion: 'guias_grandes_resultado', clave: g.clave, modo, marcados: [], sinGuia: [], fallos: [], error: String((eGm && eGm.message) || eGm).slice(0, 150) }); } catch (eGm2) {} }
    const nSal = Object.keys(res.saltados || {}).reduce((a, k) => a + (res.saltados[k] || []).length, 0);
    const txt = res.error ? 'No se compro: ' + res.error
      : (res.modo === 'real' ? (res.resultados.ok || 0) + ' con guia y enviados' + (res.resultados.pend ? ', ' + res.resultados.pend + ' con guia pagada sin marcar (abre Guias: Reintentar marcar)' : '') + (res.resultados.mal ? ', ' + res.resultados.mal + ' sin guia' : '')
                          : 'PRUEBA: se enviarian ' + (res.comprados || []).length + ' (no se compro nada)' + aviso)
        + ', ' + nSal + ' no se envian' + ((res.sinMedidas || []).length ? ', ' + res.sinMedidas.length + ' SIN MEDIDAS' : '')
        + ((res.grandes || []).length ? ', ' + res.grandes.length + ' con MUCHAS PIEZAS (hoja Guias grandes)' : '')
        + ((res.rellenadas || []).length ? ', ' + res.rellenadas.length + ' con la caja recordada' : '');
    await estadoGA(!res.error && !(res.resultados && (res.resultados.mal || res.resultados.pend)), txt);
    return { ok: !res.error, res };
  } catch (e) {
    await estadoGA(false, 'No pude correr las guias: ' + (e && e.message ? e.message : e));
    return { ok: false, error: 'falla' };
  } finally {
    clearInterval(vivo);
    if (tabId !== null) { try { await chrome.tabs.remove(tabId); } catch (e2) {} }
    gaOcupado = false;
  }
}

// Estado completo de la extension al Log del Sheet (etapa EXTENSION): sin cookies, claves ni datos de clientes.
// ---- Subida de precios y killers a Walmart (v1.10.0, 24-nov-2026) ----
// Solo por BOTON (Precios / Killers / Todo / Prueba) y siempre con confirmacion en el popup: nunca sube sola.
// El Sheet arma el archivo AL MOMENTO (inicio = ahora + 7 min) con sub_preparar; aqui se sube en Seller Center
// (Catalogo > Actualizar articulos > Actualizar con archivo > "Actualizacion de precios y promociones") y se avisa con sub_resultado.
// "Todo" = precios, espera SB_ESPERA_ENTRE_MIN minutos y killers (se genera entonces, con su propio inicio).
const SB_URL = SC_URL + 'catalog/list-items';
const SB_ESPERA_ENTRE_MIN = 5;
const SB_PLANTILLA = 'PRICING';
let sbOcupado = false, sbDesde = 0;

async function estadoSB(ok, texto, enCurso) {
  await chrome.storage.local.set({ estadoSB: { ok, texto, hora: Date.now(), enCurso: !!enCurso } });
}

// Se ejecuta DENTRO de la pestaña de Seller Center (mundo MAIN, con tu sesion). Sin variables de fuera.
// Devuelve { sesion, estado:'subido'|'incierto'|'error', pasos:[...], nuevo:'texto nuevo del cuadro', fallo }
async function enSellerSubir(plantilla, b64, nombre) {
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  const pasos = [];
  const espera = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (e) {} await esperar(300); } return null; };
  const clic = el => { ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(tp => { try { el.dispatchEvent(new (tp.indexOf('pointer') === 0 ? PointerEvent : MouseEvent)(tp, { bubbles: true, cancelable: true, view: window })); } catch (e) {} }); };
  const txt = e => String(e.innerText || e.textContent || '').trim().replace(/\s+/g, ' ');
  if (location.hostname !== 'seller.walmart.com' || /login|signin|sso|auth/i.test(location.href)) return { sesion: false, destino: location.hostname + location.pathname };
  // 1) Actualizar articulos > Actualizar con archivo
  const btn = await espera(() => [...document.querySelectorAll('button')].find(b => /^Actualizar art[ií]culos$/i.test(txt(b))), 30000);
  if (!btn) return { sesion: true, estado: 'error', fallo: 'no encontre el boton "Actualizar articulos" (cambio la pagina?)', pasos };
  pasos.push('boton Actualizar articulos');
  clic(btn);
  let item = await espera(() => [...document.querySelectorAll('div,li,a,button,span')].filter(e => e.children.length === 0 || e.children.length === 1).find(e => /^Actualizar con archivo$/i.test(txt(e))), 6000);
  if (!item) { try { btn.click(); } catch (e) {} item = await espera(() => [...document.querySelectorAll('div,li,a,button,span')].find(e => /^Actualizar con archivo$/i.test(txt(e))), 6000); }
  if (!item) return { sesion: true, estado: 'error', fallo: 'no salio el menu "Actualizar con archivo"', pasos };
  clic(item); pasos.push('menu Actualizar con archivo');
  // 2) plantilla
  const sel = await espera(() => [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === plantilla)), 15000);
  if (!sel) return { sesion: true, estado: 'error', fallo: 'no salio la lista de plantillas', pasos };
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, plantilla);
  sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true }));
  if (sel.value !== plantilla) return { sesion: true, estado: 'error', fallo: 'no pude elegir la plantilla ' + plantilla, pasos };
  pasos.push('plantilla ' + plantilla);
  // 3) archivo
  const inp = await espera(() => document.querySelector('input[type=file][name=file]') || document.querySelector('input[type=file]'), 10000);
  if (!inp) return { sesion: true, estado: 'error', fallo: 'no encontre donde soltar el archivo', pasos };
  await espera(() => !inp.closest('.pointer-events-none'), 8000);   // el cuadro se habilita al elegir la plantilla
  const raiz = (() => { let p = sel; for (let i = 0; i < 10 && p.parentElement; i++) { p = p.parentElement; if (p.contains(inp) && txt(p).length > 200) return p; } return document.body; })();
  const antes = new Set(txt(raiz).split(/(?<=[.!?:])\s+|\s{2,}/).concat(String(raiz.innerText || '').split('\n').map(s => s.trim())).filter(Boolean));
  const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const dt = new DataTransfer(); dt.items.add(new File([bytes], nombre, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  inp.files = dt.files;
  inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
  pasos.push('archivo ' + nombre + ' (' + bytes.length + ' bytes)');
  // 4) mirar que pasa (hasta 150 s): texto NUEVO del cuadro, y los botones de confirmar que aparezcan
  const lineas = () => String(raiz.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
  const nuevo = () => lineas().filter(l => !antes.has(l)).join(' | ');
  const MAL = /(error|no se pudo|fall[oó]|inv[aá]lid|no es v[aá]lid|formato|rechaz|excede|demasiad)/i;
  const BIEN = /(cargad|se (est[aá]|ha|han) (carg|sub|recib|proces)|recibimos|recibido|correctamente|exitos|en proceso|procesando|enviad)/i;
  const BOTON = /^(Subir|Enviar|Cargar|Cargar archivo|Enviar archivo|Subir archivo|Confirmar|Continuar)$/i;
  const clicados = {};
  const t0 = Date.now(); let n = '', veredicto = '';
  while (Date.now() - t0 < 150000) {
    await esperar(1000);
    n = nuevo();
    if (MAL.test(n)) { veredicto = 'error'; break; }
    const b = [...raiz.querySelectorAll('button')].find(x => BOTON.test(txt(x)) && !x.disabled && !clicados[txt(x)]);
    if (b) { clicados[txt(b)] = 1; pasos.push('clic ' + txt(b)); clic(b); await esperar(1500); continue; }
    if (BIEN.test(n)) { veredicto = 'subido'; break; }
  }
  return { sesion: true, estado: veredicto || 'incierto', pasos, nuevo: n.slice(0, 700) };
}

// Una subida: pide el archivo al Sheet, lo sube y cuenta el resultado. { ok, resultado, texto }
async function sbPaso(tipo, url, clave) {
  const que = tipo === 'precios' ? 'precios' : (tipo === 'killers' ? 'killers' : 'PRUEBA');
  await estadoSB(true, 'Armando el archivo de ' + que + ' en el Sheet...', true);
  const p = await llamarSheet(url, { accion: 'sub_preparar', clave, tipo }, 170000);
  if (!p || !p.ok) {
    const txt = { no_autorizado: 'Clave incorrecta', sin_filas: 'No hay filas para subir (revisa el Log del Sheet)', ocupado: 'El Sheet esta ocupado: intenta en un minuto', no_json: 'Falta publicar Nueva version del Web App' }[p && p.error] || ('El Sheet no pudo armar el archivo' + (p && p.error ? ': ' + p.error : ''));
    await estadoSB(false, txt);
    return { ok: false, resultado: 'error', texto: txt };
  }
  await estadoSB(true, 'Subiendo ' + que + ' (' + p.n + ' SKUs, inicio ' + p.inicio_utc + ' UTC) en Seller Center...', true);
  let pest = null, r = null;
  try {
    pest = await scPestanaApi(true);
    await chrome.tabs.update(pest.tabId, { url: SB_URL });
    await esperarCarga(pest.tabId, 40000);
    const res = await conTope(chrome.scripting.executeScript({ target: { tabId: pest.tabId }, world: 'MAIN', func: enSellerSubir, args: [SB_PLANTILLA, p.base64, p.nombre] }), 220000);
    r = res && res[0] ? res[0].result : null;
  } catch (e) { r = { fallo: String(e && e.message ? e.message : e) }; }
  finally {
    if (pest && pest.propia) {
      try { await chrome.tabs.remove(pest.tabId); } catch (e4) {}
      if (pest.winId) { try { await chrome.windows.remove(pest.winId); } catch (e5) {} }
    }
  }
  let resultado, detalle;
  if (!r || r.fallo && r.sesion === undefined) { resultado = 'error'; detalle = !r ? 'no obtuve respuesta de Seller Center' : r.fallo.slice(0, 120); }
  else if (r.sesion === false) { resultado = 'sin_sesion'; detalle = 'abrio ' + (r.destino || 'otra pagina'); }
  else if (r.estado === 'subido') { resultado = 'subido'; detalle = (r.nuevo || '').slice(0, 300); }
  else if (r.estado === 'error') { resultado = 'error'; detalle = (r.fallo || r.nuevo || '').slice(0, 300) + ' | pasos: ' + (r.pasos || []).join(' > '); }
  else { resultado = 'incierto'; detalle = 'Seller Center no confirmo. Pasos: ' + (r.pasos || []).join(' > ') + ' | cuadro: ' + (r.nuevo || '(sin texto nuevo)'); }
  try { await llamarSheetReint(url, { accion: 'sub_resultado', clave, job: p.job, tipo, resultado, detalle }); } catch (e6) {}
  const base = que + ': ' + p.n + ' SKUs, inicio ' + p.inicio_utc + ' UTC' + (p.nSaltadas ? ', ' + p.nSaltadas + ' saltados' : '');
  if (resultado === 'subido') { await estadoSB(true, 'Subido a Walmart: ' + base); return { ok: true, resultado, texto: base }; }
  const t = resultado === 'sin_sesion' ? 'Seller Center sin sesion: entra con tu codigo 2FA y vuelve a pulsar' : (resultado === 'incierto' ? 'Subida sin confirmar (' + base + '): revisa Actividad de carga en Seller Center' : 'No se subio ' + que + ': ' + detalle.slice(0, 140));
  await estadoSB(false, t);
  return { ok: false, resultado, texto: t };
}

async function sbCiclo(tipo) {
  if (!/^(precios|killers|todo|prueba)$/.test(String(tipo))) return { ok: false, error: 'tipo' };
  if (sbOcupado && Date.now() - sbDesde > 14 * 60000) sbOcupado = false;
  if (sbOcupado) { await estadoSB(false, 'Ya hay una subida en curso: espera a que termine'); return { ok: false, error: 'ocupado' }; }
  sbOcupado = true; sbDesde = Date.now();
  const vivo = setInterval(() => { try { chrome.runtime.getPlatformInfo().catch(() => {}); } catch (e) {} }, 20000);
  try {
    const g = await chrome.storage.local.get(['url', 'clave']);
    const url = g.url || URL_DEFECTO;
    if (!url || !g.clave || !URL_OK.test(url)) { await estadoSB(false, 'Falta configurar URL y clave (Opciones)'); return { ok: false, error: 'sin_config' }; }
    for (let i = 0; i < 40 && (scOcupado || wmOcupado); i++) await esperar(3000);   // no se cruza con la lectura de Seller Center
    const primero = tipo === 'todo' ? 'precios' : tipo;
    const r = await sbPaso(primero, url, g.clave);
    if (tipo === 'todo' && r.ok) {
      const cuando = Date.now() + SB_ESPERA_ENTRE_MIN * 60000;
      await chrome.storage.local.set({ sbPend: { tipo: 'killers', cuando } });
      try { chrome.alarms.create('subida', { when: cuando }); } catch (e) {}
      await estadoSB(true, 'Precios enviados. Killers salen a las ' + new Date(cuando).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) + ' (deja esta PC prendida)');
    }
    return r;
  } catch (e) {
    await estadoSB(false, 'No pude subir: ' + (e && e.message ? e.message : e));
    return { ok: false, error: 'red' };
  } finally { clearInterval(vivo); sbOcupado = false; }
}

// El segundo paso de "Todo" (killers) queda guardado: si el servicio se duerme o Chrome se reinicia, se retoma aqui.
async function sbPendiente() {
  try {
    const g = await chrome.storage.local.get(['sbPend']);
    const p = g.sbPend; if (!p) return;
    if (Date.now() < p.cuando - 20000) { try { chrome.alarms.create('subida', { when: p.cuando }); } catch (e) {} return; }
    await chrome.storage.local.remove(['sbPend']);
    if (Date.now() - p.cuando > 30 * 60000) { await estadoSB(false, 'Los killers NO se subieron (la PC estuvo apagada): pulsa Killers'); return; }
    await sbCiclo(p.tipo);
  } catch (e) {}
}
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'subida') sbPendiente(); });
chrome.runtime.onStartup.addListener(() => setTimeout(sbPendiente, 120000));

// ---- Mensaje de recoleccion (WhatsApp), 24-nov-2026 ----
// El Sheet arma el texto (Historial de recoleccion + pendientes del Reporte); aqui se guarda para que ella lo copie y lo retoque en el popup.
// recMsg = { auto: texto del Sheet, hora, editado: su version retocada ('' = sin retoques) }. El refresco automatico solo cambia "auto".
async function recMensajePedir() {
  try {
    const g = await chrome.storage.local.get(['url', 'clave', 'recMsg']);
    const url = g.url || URL_DEFECTO;
    if (!url || !g.clave || !URL_OK.test(url)) return { ok: false, error: 'sin_config' };
    const r = await llamarSheetReint(url, { accion: 'rec_mensaje', clave: g.clave });
    if (!r || !r.ok || !r.texto) return { ok: false, error: (r && r.error) || 'sin_respuesta' };
    await chrome.storage.local.set({ recMsg: { auto: String(r.texto), hora: Date.now(), editado: (g.recMsg && g.recMsg.editado) || '' } });
    return { ok: true };
  } catch (e) { return { ok: false, error: 'red' }; }
}
try { chrome.alarms.create('recmsg', { delayInMinutes: 2, periodInMinutes: 30 }); } catch (e) {}
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'recmsg') recMensajePedir(); });

let repExtDesde = 0;
async function reportarExtension(motivo) {
  try {
    if (Date.now() - repExtDesde < 60000) return;   // no mas de uno por minuto
    repExtDesde = Date.now();
    const g = await chrome.storage.local.get(['url', 'clave', 'estado', 'estadoOdoo', 'estadoCancel', 'estadoSC', 'estadoWM', 'estadoRQ', 'estadoGA', 'estadoSB', 'gaActivo', 'gaModo', 'gaPruebaOk', 'gaVistas', 'gaCajas', 'gaIntentadas', 'gaFallos', 'gaRepFallo']);
    const url = g.url || URL_DEFECTO;
    if (!url || !g.clave || !URL_OK.test(url)) return;
    const hoy = new Date().toDateString();
    const al = await chrome.alarms.getAll(); const ag = al.find(x => x.name === 'guias');
    const m = (e) => e ? { ok: e.ok !== false, texto: String(e.texto || '').slice(0, 200), hora: e.hora || 0 } : null;
    const yo = await instancia();
    const estado = { pc: yo.nombre, turno: turnoMem ? (turnoMem.lider ? 'trabaja' : 'espera') : '', version: chrome.runtime.getManifest().version, motivo: motivo || '', hora: Date.now(), gaActivo: !!g.gaActivo, gaModo: g.gaModo || 'prueba', gaPruebaOk: !!g.gaPruebaOk,
      proxGuias: ag ? ag.scheduledTime : 0, nVistas: Object.keys(g.gaVistas || {}).length, nCajas: Object.keys(g.gaCajas || {}).length,
      nIntentadas: (g.gaIntentadas && g.gaIntentadas.dia === hoy) ? (g.gaIntentadas.pos || []).length : 0,
      fallosHoy: (g.gaFallos && g.gaFallos.dia === hoy) ? g.gaFallos.n : {},
      repFallo: g.gaRepFallo ? { hace_min: Math.round((Date.now() - g.gaRepFallo.ts) / 60000), err: g.gaRepFallo.err } : null,
      modulos: { cookie: m(g.estado), odoo: m(g.estadoOdoo), cancelar: m(g.estadoCancel), seller: m(g.estadoSC), walmart: m(g.estadoWM), rastreo: m(g.estadoRQ), guias: m(g.estadoGA), subida: m(g.estadoSB) } };
    const rEst = await llamarSheet(url, { accion: 'ext_estado', clave: g.clave, estado });
    if (rEst && rEst.ok) await aplicarAlertas(rEst.alertas);
  } catch (e) {}
}

// Avisos del Sheet (19-nov): cualquier ERROR del Log que siga activo sale en rojo en el icono ("!") y en la ventana de la extension, sin abrir el Log.
async function aplicarAlertas(al) {
  try {
    if (!Array.isArray(al)) return;
    const lista = al.slice(0, 5).map(x => String(x).slice(0, 180));
    await chrome.storage.local.set({ alertasSheet: { lista, hora: Date.now() } });
    await chrome.action.setBadgeText({ text: lista.length ? '!' : '' });
    if (lista.length) await chrome.action.setBadgeBackgroundColor({ color: '#cf222e' });
    await chrome.action.setTitle({ title: lista.length ? 'Site Sheet - AVISO: ' + lista.join(' | ') : 'Site Sheet - Cookie' });
  } catch (e) {}
}

function crearAlarma() {
  chrome.alarms.create('actualizar', { periodInMinutes: 1 });
  chrome.alarms.create('revisar', { periodInMinutes: REVISAR_CADA_MIN });
  chrome.alarms.create('cancelar', { periodInMinutes: CANCELAR_CADA_MIN });
  chrome.alarms.create('seller', { periodInMinutes: SC_CADA_MIN });
  chrome.alarms.create('wmcancelar', { periodInMinutes: WM_CADA_MIN });
  chrome.alarms.create('rastreo', { periodInMinutes: RQ_CADA_MIN });
  chrome.alarms.create('guias', { when: gaSiguienteHora(), periodInMinutes: GA_CADA_MIN });
}

chrome.runtime.onInstalled.addListener(() => { migrarUrl(); crearAlarma(); setTimeout(() => reportarExtension('instalada'), 45000); enviar(true); enviarOdoo(true); cancelarCiclo(false); scCiclo(false); setTimeout(() => wmCancelCiclo(false), 90000); setTimeout(() => rqCiclo(false), 150000); });
chrome.runtime.onStartup.addListener(() => { migrarUrl(); crearAlarma(); setTimeout(() => reportarExtension('chrome_abierto'), 60000); enviar(false); enviarOdoo(false); cancelarCiclo(false); setTimeout(() => scCiclo(false), 20000); setTimeout(() => wmCancelCiclo(false), 120000); setTimeout(() => rqCiclo(false), 180000); });
// 20-nov (ella: "entra en loop hasta que consigas los datos"): si una LECTURA falla por algo pasajero (Sheet ocupado, red,
// pagina que no cargo), se vuelve a intentar en REINT_MIN minutos, sin esperar la vuelta normal. Una vuelta que sale bien no
// agenda nada; la siguiente falla agenda otra: es un loop hasta tener los datos. NO se reintenta rapido lo que necesita a una
// persona (sin sesion, clave, verificacion "eres humano") ni las compras de guias (tienen su horario y candados).
const REINT_MIN = 2;
const REINT_SI = /^(ocupado|red|sheet|pagina_distinta|sin_tabla|rq_fallas)$/;
function reintentarPronto(nombre) { try { chrome.alarms.create(nombre + '_reint', { delayInMinutes: REINT_MIN }); } catch (e) {} }
function conReintento(nombre, fn) {
  return Promise.resolve().then(fn).then(r => { if (r && r.ok === false && REINT_SI.test(String(r.error || ''))) reintentarPronto(nombre); return r; })
    .catch(() => { reintentarPronto(nombre); });
}
const CICLO_REINT = { cancelar: () => cancelarCiclo(false), seller: () => scCiclo(false), wmcancelar: () => wmCancelCiclo(false), rastreo: () => rqCiclo(false) };
chrome.alarms.onAlarm.addListener(a => { const base = String(a.name).replace(/_reint$/, ''); if (CICLO_REINT[base]) { conReintento(base, CICLO_REINT[base]); return; } if (a.name === 'actualizar') { migrarUrl(); revisarActualizacion(); chrome.alarms.get('wmcancelar').then(x => { if (!x) chrome.alarms.create('wmcancelar', { periodInMinutes: WM_CADA_MIN }); }).catch(() => {}); chrome.alarms.get('rastreo').then(x => { if (!x) chrome.alarms.create('rastreo', { periodInMinutes: RQ_CADA_MIN }); }).catch(() => {}); } if (a.name === 'revisar') { enviar(false); enviarOdoo(false); } if (a.name === 'guias') gaCiclo(false, false).finally(() => reportarExtension('vuelta_guias')); });

// Al despertar / desbloquear la PC: manda la cookie y cancela de inmediato (no espera la siguiente alarma)
chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener(est => {
  if (est !== 'active') return;
  crearAlarma();
  setTimeout(() => { enviar(false); enviarOdoo(false); tengoTurno().then(t => { if (t) cancelarCiclo(true); }).catch(() => {}); }, 5000);
  setTimeout(() => scCiclo(false), 30000);   // 5 s: da tiempo a que vuelva la red
});

chrome.runtime.onMessage.addListener((m, _s, responder) => {
  if (m && m.tipo === 'cancelar') { cancelarCiclo(true).then(responder); return true; }
  if (m && m.tipo === 'seller') { scCiclo(true).then(responder); return true; }
  if (m && m.tipo === 'guias_real') { gaCiclo(true, false, true).then(r => { reportarExtension('boton_comprar_ahora'); return r; }).then(responder); return true; }   // compra de verdad, con los mismos candados
  if (m && m.tipo === 'guias') { gaCiclo(true, true).then(responder); return true; }   // el boton del popup SIEMPRE es prueba: no compra
  if (m && /^sub_(precios|killers|todo|prueba)$/.test(String(m.tipo))) { sbCiclo(String(m.tipo).slice(4)).then(responder); return true; }   // 24-nov: subida de precios/killers (solo por boton, con confirmacion en el popup)
  if (m && m.tipo === 'rec_mensaje') { recMensajePedir().then(responder); return true; }
  if (m && m.tipo === 'enviar') { Promise.all([enviar(true), enviarOdoo(true)]).then(r => responder(r[0])); return true; }
});
