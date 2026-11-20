const URL_OK = /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[A-Za-z0-9_-]+\/exec$/;
const URL_DEFECTO = 'https://script.google.com/macros/s/AKfycby85T2KwoDZb-kTPFlXbyXcTR9aMiRQZNzHhvgkHSb13JXX0NeYJUH0kAABi-GWWZHB/exec';
const $ = id => document.getElementById(id);

chrome.storage.local.get(['url', 'clave', 'gaActivo', 'gaModo', 'instNombre', 'instId']).then(({ url, clave, gaActivo, gaModo, instNombre, instId }) => {
  $('url').value = url || URL_DEFECTO;
  $('pc').value = instNombre || (instId ? 'PC-' + String(instId).slice(0, 4).toUpperCase() : '');
  $('clave').value = clave || '';
  $('ga').checked = !!gaActivo;
  $('gm').value = gaModo === 'real' ? 'real' : 'prueba';
});

$('gg').onclick = async () => {
  const modo = $('gm').value === 'real' ? 'real' : 'prueba';
  await chrome.storage.local.set({ gaActivo: !!$('ga').checked, gaModo: modo });
  $('gmsg').textContent = ($('ga').checked ? 'Activadas' : 'Apagadas') + ' · modo ' + (modo === 'real' ? 'REAL (compra)' : 'solo prueba')+ '.' + (modo === 'real' ? ' Si no hay una prueba sin error, compra solo cuando la haya.' : '');
};

$('g').onclick = async () => {
  const url = $('url').value.trim();
  const clave = $('clave').value.trim();
  if (!URL_OK.test(url)) { $('m').textContent = 'La URL debe ser la del Web App y terminar en /exec'; return; }
  if (clave.length < 32) { $('m').textContent = 'La clave esta incompleta'; return; }
  const pc = $('pc').value.replace(/[^\wÁÉÍÓÚÑáéíóúñ .-]/g, '').trim().slice(0, 40);
  await chrome.storage.local.set(Object.assign({ url, clave, ultima: '', ultimoFallo: false }, pc ? { instNombre: pc } : {}));
  $('m').textContent = 'Enviando...';
  await chrome.runtime.sendMessage({ tipo: 'enviar' });
  const { estado } = await chrome.storage.local.get('estado');
  $('m').textContent = estado ? estado.texto : 'Guardado';
};
