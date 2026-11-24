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
