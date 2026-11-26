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
    const sm = document.createElement('small'); sm.textContent = (p.activa ? 'prendida' : 'DESACTIVADA · ultima vez ' + hace(p.visto)); if (!p.activa) f.className += ' off';
    t.appendChild(b); t.appendChild(sm);
    const mover = (d) => { const j = i + d; if (j < 0 || j >= ordenPcs.length) return; const x = ordenPcs.splice(i, 1)[0]; ordenPcs.splice(j, 0, x); pintaOrden(); dice('omsg', 'Orden cambiado: falta Guardar orden.'); };
    const up = document.createElement('button'); up.textContent = '↑'; up.title = 'Subir'; up.disabled = i === 0; up.onclick = () => mover(-1);
    const dn = document.createElement('button'); dn.textContent = '↓'; dn.title = 'Bajar'; dn.disabled = i === ordenPcs.length - 1; dn.onclick = () => mover(1);
    f.appendChild(n); f.appendChild(t); f.appendChild(up); f.appendChild(dn);
    if (!p.activa && p.id !== ordenYo) {
      const del = document.createElement('button'); del.textContent = 'Borrar'; del.title = 'Quitar de la lista (si vuelve a prenderse, se registra sola otra vez)';
      del.onclick = async () => {
        del.disabled = true; dice('omsg', 'Borrando...');
        const r = await chrome.runtime.sendMessage({ tipo: 'pc_borrar', id: p.id }).catch(() => null);
        if (r && r.ok) { ordenPcs = r.pcs || []; pintaOrden(); dice('omsg', p.nombre + ' borrada de la lista.', true); }
        else { del.disabled = false; dice('omsg', 'No se borro: ' + (r && r.error === 'prendida' ? 'esa computadora esta prendida' : ((r && r.error) || 'sin respuesta del Sheet')), false); }
      };
      f.appendChild(del);
    }
    cont.appendChild(f);
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

// 26-nov: descargar la ultima extension y el actualizador desde GitHub (cualquier PC, sin carpeta de Cowork)
const REPO_RAW = 'https://raw.githubusercontent.com/v-w04/Site-Sheet/main/';
let versionRemota = '';
function numsDe(v) { const p = String(v).split('.').map(n => parseInt(n, 10) || 0); while (p.length < 3) p.push(0); return p; }
function esMayor(a, b) { const x = numsDe(a), y = numsDe(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; }
async function traer(ruta) {
  const r = await fetch(REPO_RAW + ruta + '?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error(r.status === 404 ? 'ese archivo aun no esta en GitHub (falta correr 5-SUBIR-TODO.bat en la FORCEV)' : 'GitHub respondio ' + r.status);
  return r;
}
function guardarArchivo(blob, nombre) {
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 30000);
}
async function revisaVersion() {
  const el = $('dver'), mia = chrome.runtime.getManifest().version;
  try {
    const m = await (await traer('extension-cookie/manifest.json')).json();
    versionRemota = String(m.version || '');
    if (!/^\d+\.\d+\.\d+$/.test(versionRemota)) throw new Error('version rara en GitHub');
    if (esMayor(versionRemota, mia)) { el.className = 'msg aviso2'; el.textContent = 'Esta computadora: v' + mia + ' · GitHub: v' + versionRemota + ' → hay una versión nueva. Bájala abajo.'; }
    else if (esMayor(mia, versionRemota)) { el.className = 'msg'; el.textContent = 'Esta computadora: v' + mia + ' · GitHub: v' + versionRemota + ' (esta es más nueva: falta subir con 5-SUBIR-TODO.bat).'; }
    else { el.className = 'msg ok'; el.textContent = 'Esta computadora está al día: v' + mia + '.'; }
  } catch (e) { el.className = 'msg mal'; el.textContent = 'No pude revisar GitHub (' + (e && e.message ? e.message : 'sin internet') + '). Esta computadora: v' + mia + '.'; }
}
$('dz').onclick = async () => {
  dice('dmsg', 'Bajando…');
  try {
    if (!versionRemota) await revisaVersion();
    if (!versionRemota) throw new Error('no se supo la version');
    const r = await traer('extension-cookie-' + versionRemota + '.zip');
    guardarArchivo(new Blob([await r.arrayBuffer()], { type: 'application/zip' }), 'extension-cookie-' + versionRemota + '.zip');
    dice('dmsg', 'Listo: extension-cookie-' + versionRemota + '.zip en Descargas. Descomprímelo en la carpeta de la extensión y pulsa Recargar en chrome://extensions.', true);
  } catch (e) { dice('dmsg', 'No se bajó: ' + (e && e.message ? e.message : 'sin internet'), false); }
};
$('db').onclick = async () => {
  dice('dmsg', 'Bajando…');
  try {
    const t = (await (await traer('5-DELL.bat')).text()).replace(/\r?\n/g, '\r\n');
    guardarArchivo(new Blob([t], { type: 'application/octet-stream' }), '5-DELL.bat');
    dice('dmsg', 'Listo: 5-DELL.bat en Descargas. Ponlo en una carpeta fija, córrelo una vez y deja que se actualice solo.', true);
  } catch (e) { dice('dmsg', 'No se bajó: ' + (e && e.message ? e.message : 'sin internet'), false); }
};
revisaVersion();
