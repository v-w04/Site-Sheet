(() => {
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
  dice('gmsg', ($('ga').checked ? 'Activadas' : 'Apagadas') + ' · modo ' + (modo === 'real' ? 'REAL (compra)' : 'solo prueba')+ '.' + '', true);
};

$('gcon').onclick = async () => {
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
  if (!ordenPcs.length) { cont.textContent = 'Aun no hay computadoras: guarda la conexion y vuelve a abrir.'; return; }
  const VISIBLES = 4;
  ordenPcs.forEach((p, i) => {
    if (i >= VISIBLES) return;
    const f = document.createElement('div'); f.className = 'pcf' + (p.turno ? ' activa' : '');
    const n = document.createElement('span'); n.className = 'n'; n.textContent = String(i + 1);
    const t = document.createElement('span'); t.className = 'pt';
    const b = document.createElement('b'); b.textContent = p.nombre + (p.id === ordenYo ? ' (esta)' : '');
    const sm = document.createElement('small'); sm.textContent = (p.activa ? 'prendida' : 'DESACTIVADA · ultima vez ' + hace(p.visto)); if (!p.activa) f.className += ' off';
    t.appendChild(b); t.appendChild(sm);
    const mover = (d) => { const j = i + d; if (j < 0 || j >= ordenPcs.length) return; const x = ordenPcs.splice(i, 1)[0]; ordenPcs.splice(j, 0, x); pintaOrden(); dice('omsg', 'Falta Guardar orden.'); };
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
  if (ordenPcs.length > VISIBLES) {
    const mas = document.createElement('div'); mas.className = 'mas';
    const ocultas = ordenPcs.slice(VISIBLES), borr = ordenPcs.filter(p => !p.activa && p.id !== ordenYo), borrOc = ocultas.filter(p => !p.activa && p.id !== ordenYo);
    const tx = document.createElement('span'); tx.textContent = 'y ' + ocultas.length + ' mas al final de la lista' + (borrOc.length ? ' (' + borrOc.length + ' desactivada' + (borrOc.length === 1 ? '' : 's') + ')' : ' (las ultimas tienen menos prioridad)') + ' ';
    mas.appendChild(tx);
    if (borr.length) {
      const bd = document.createElement('button'); bd.id = 'odel'; bd.textContent = 'Borrar desactivadas (' + borr.length + ')'; bd.title = 'Quita de la lista todas las computadoras desactivadas (si alguna vuelve a prenderse, se registra sola otra vez)';
      bd.onclick = async () => {
        bd.disabled = true; dice('omsg', 'Borrando...'); let ok = 0, fallo = '';
        for (const p of borr) { const r = await chrome.runtime.sendMessage({ tipo: 'pc_borrar', id: p.id }).catch(() => null); if (r && r.ok) { ok++; ordenPcs = r.pcs || ordenPcs; } else { fallo = (r && r.error === 'prendida') ? p.nombre + ' esta prendida' : ((r && r.error) || 'sin respuesta del Sheet'); } }
        pintaOrden(); dice('omsg', ok + ' computadora' + (ok === 1 ? '' : 's') + ' borrada' + (ok === 1 ? '' : 's') + (fallo ? '. No se pudo: ' + fallo : '.'), !fallo);
      };
      mas.appendChild(bd);
    }
    cont.appendChild(mas);
  }
}
async function cargaOrden() {
  const r = await chrome.runtime.sendMessage({ tipo: 'orden_ver' }).catch(() => null);
  if (r && r.ok) { ordenPcs = r.pcs || []; ordenYo = r.yo || ''; pintaOrden(); dice('omsg', r.quien ? 'Trabaja ahora: ' + r.quien : 'Nadie tiene el turno en este momento.'); }
  else { $('ordl').textContent = ''; dice('omsg', r && r.error === 'falta_url_o_clave' ? 'Primero guarda la URL y la clave.' : 'No pude leer el orden: ' + ((r && r.error) || 'sin respuesta del Sheet') + '.', false); }
}
$('og').onclick = async () => {
  if (!ordenPcs.length) return;
  dice('omsg', 'Guardando...');
  const r = await chrome.runtime.sendMessage({ tipo: 'orden_guardar', orden: ordenPcs.map(p => p.id) }).catch(() => null);
  if (r && r.ok) { ordenPcs = r.pcs || ordenPcs; pintaOrden(); dice('omsg', 'Orden guardado. El turno cambia en su siguiente vuelta.', true); }
  else dice('omsg', 'No se guardo: ' + ((r && r.error) || 'sin respuesta del Sheet'), false);
};

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
    if (esMayor(versionRemota, mia)) { el.className = 'msg aviso2'; el.textContent = 'Esta computadora v' + mia + ' · GitHub v' + versionRemota + ': hay versión nueva.'; }
    else if (esMayor(mia, versionRemota)) { el.className = 'msg'; el.textContent = 'Esta computadora v' + mia + ' · GitHub v' + versionRemota + ' (falta subir esta).'; }
    else { el.className = 'msg ok'; el.textContent = 'Al día: v' + mia + ' (igual que GitHub).'; }
  } catch (e) { el.className = 'msg mal'; el.textContent = 'No pude revisar GitHub (' + (e && e.message ? e.message : 'sin internet') + ').'; }
}
$('dz').onclick = async () => {
  dice('dmsg', 'Bajando…');
  try {
    if (!versionRemota) await revisaVersion();
    if (!versionRemota) throw new Error('no se supo la version');
    const r = await traer('extension-cookie-' + versionRemota + '.zip');
    guardarArchivo(new Blob([await r.arrayBuffer()], { type: 'application/zip' }), 'extension-cookie-' + versionRemota + '.zip');
    dice('dmsg', 'Listo: extension-cookie-' + versionRemota + '.zip en Descargas.', true);
  } catch (e) { dice('dmsg', 'No se bajó: ' + (e && e.message ? e.message : 'sin internet'), false); }
};
async function bajarBat(nombre, despues) {
  dice('dmsg', 'Bajando…');
  try {
    const t = (await (await traer(nombre)).text()).replace(/\r?\n/g, '\r\n');
    guardarArchivo(new Blob([t], { type: 'application/octet-stream' }), nombre);
    dice('dmsg', 'Listo: ' + nombre + ' en Descargas. ' + despues, true);
  } catch (e) { dice('dmsg', 'No se bajó: ' + (e && e.message ? e.message : 'sin internet'), false); }
}
$('db').onclick = () => bajarBat('5-DELL.bat', 'Córrelo una vez.');
$('da').onclick = () => bajarBat('7-AUTOENCENDIDO.bat', 'Córrelo una vez (como administrador).');

$('dr').onclick = () => { $('dver').className = 'msg'; $('dver').textContent = 'Revisando la versión…'; versionRemota = ''; revisaVersion(); };

// Lo que consulta el Sheet o GitHub se pide la primera vez que se abre la pestaña Configuración.
let configYaAbierta = false;
window.configAlAbrir = () => { if (configYaAbierta) return; configYaAbierta = true; cargaOrden(); revisaVersion(); };
})();
