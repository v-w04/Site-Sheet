const URL_OK = /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[A-Za-z0-9_-]+\/exec$/;
const URL_DEFECTO = 'https://script.google.com/macros/s/AKfycby85T2KwoDZb-kTPFlXbyXcTR9aMiRQZNzHhvgkHSb13JXX0NeYJUH0kAABi-GWWZHB/exec';
const $ = id => document.getElementById(id);

chrome.storage.local.get(['url', 'clave', 'gaActivo', 'gaModo', 'instNombre', 'instId']).then(({ url, clave, gaActivo, gaModo, instNombre, instId }) => {
  $('url').value = url || URL_DEFECTO;
  $('pc').value = instNombre || (instId ? 'PC-' + String(instId).slice(0, 4).toUpperCase() : '');
  $('clave').value = clave || '';
  $('ga').checked = !!gaActivo;
  $('gm').value = gaModo === 'real' ? 'real' : 'prueba';
  avisoReal();
});

// 21-nov: aviso rojo solo cuando el modo es REAL; los mensajes salen en verde (bien) o rojo (mal)
function avisoReal() { $('aviso').style.display = $('gm').value === 'real' ? 'block' : 'none'; }
$('gm').onchange = avisoReal;
function dice(id, texto, ok) { const el = $(id); el.textContent = texto; el.className = 'msg' + (ok === true ? ' ok' : ok === false ? ' mal' : ''); }

$('gg').onclick = async () => {
  const modo = $('gm').value === 'real' ? 'real' : 'prueba';
  await chrome.storage.local.set({ gaActivo: !!$('ga').checked, gaModo: modo });
  dice('gmsg', ($('ga').checked ? 'Activadas' : 'Apagadas') + ' · modo ' + (modo === 'real' ? 'REAL (compra)' : 'solo prueba')+ '.' + (modo === 'real' ? ' Si no hay una prueba sin error, compra solo cuando la haya.' : ''), true);
};

$('g').onclick = async () => {
  const url = $('url').value.trim();
  const clave = $('clave').value.trim();
  if (!URL_OK.test(url)) { dice('m', 'La URL debe ser la del Web App y terminar en /exec', false); return; }
  if (clave.length < 32) { dice('m', 'La clave esta incompleta', false); return; }
  const pc = $('pc').value.replace(/[^\wÁÉÍÓÚÑáéíóúñ .-]/g, '').trim().slice(0, 40);
  await chrome.storage.local.set(Object.assign({ url, clave, ultima: '', ultimoFallo: false }, pc ? { instNombre: pc } : {}));
  dice('m', 'Enviando...');
  await chrome.runtime.sendMessage({ tipo: 'enviar' });
  const { estado } = await chrome.storage.local.get('estado');
  dice('m', estado ? estado.texto : 'Guardado', estado ? !!estado.ok : true);
};

// 25-nov: orden de las computadoras (el Sheet lo guarda; la primera de la lista trabaja primero)
let ordenPcs = [], ordenYo = '';
function hace(ms) { const m = Math.max(0, Math.round((Date.now() - ms) / 60000)); return m < 1 ? 'hace menos de 1 min' : m < 60 ? 'hace ' + m + ' min' : m < 1440 ? 'hace ' + Math.round(m / 60) + ' h' : 'hace ' + Math.round(m / 1440) + ' d'; }
function pintaOrden() {
  const cont = $('ordl'); cont.textContent = '';
  if (!ordenPcs.length) { cont.textContent = 'Aun no hay computadoras registradas. Guarda la conexion arriba y vuelve a abrir esta pagina.'; return; }
  ordenPcs.forEach((p, i) => {
    const f = document.createElement('div'); f.className = 'pc' + (p.turno ? ' activa' : '');
    const n = document.createElement('span'); n.className = 'n'; n.textContent = String(i + 1);
    const t = document.createElement('span'); t.className = 't';
    const b = document.createElement('b'); b.textContent = p.nombre + (p.id === ordenYo ? ' (esta)' : '');
    const sm = document.createElement('small'); sm.textContent = (p.activa ? 'prendida' : 'sin responder · ultima vez ' + hace(p.visto));
    t.appendChild(b); t.appendChild(sm);
    const mover = (d) => { const j = i + d; if (j < 0 || j >= ordenPcs.length) return; const x = ordenPcs.splice(i, 1)[0]; ordenPcs.splice(j, 0, x); pintaOrden(); dice('omsg', 'Orden cambiado: falta Guardar orden.'); };
    const up = document.createElement('button'); up.textContent = '↑'; up.title = 'Subir'; up.disabled = i === 0; up.onclick = () => mover(-1);
    const dn = document.createElement('button'); dn.textContent = '↓'; dn.title = 'Bajar'; dn.disabled = i === ordenPcs.length - 1; dn.onclick = () => mover(1);
    f.appendChild(n); f.appendChild(t); f.appendChild(up); f.appendChild(dn); cont.appendChild(f);
  });
}
async function cargaOrden() {
  const r = await chrome.runtime.sendMessage({ tipo: 'orden_ver' }).catch(() => null);
  if (r && r.ok) { ordenPcs = r.pcs || []; ordenYo = r.yo || ''; pintaOrden(); dice('omsg', r.quien ? 'Trabaja ahora: ' + r.quien : 'Nadie tiene el turno en este momento.'); }
  else { $('ordl').textContent = ''; dice('omsg', r && r.error === 'falta_url_o_clave' ? 'Primero guarda la URL y la clave arriba.' : 'No pude leer el orden: ' + ((r && r.error) || 'sin respuesta del Sheet') + '. Si es la primera vez, el Web App debe estar publicado con la version nueva (5-SUBIR-TODO.bat).', false); }
}
$('og').onclick = async () => {
  if (!ordenPcs.length) return;
  dice('omsg', 'Guardando...');
  const r = await chrome.runtime.sendMessage({ tipo: 'orden_guardar', orden: ordenPcs.map(p => p.id) }).catch(() => null);
  if (r && r.ok) { ordenPcs = r.pcs || ordenPcs; pintaOrden(); dice('omsg', 'Orden guardado. Si la que trabaja ya no es la primera, le entrega el turno a la primera en su siguiente vuelta (~1-2 min).', true); }
  else dice('omsg', 'No se guardo: ' + ((r && r.error) || 'sin respuesta del Sheet'), false);
};
cargaOrden();
