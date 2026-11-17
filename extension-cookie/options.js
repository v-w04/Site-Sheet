const URL_OK = /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[A-Za-z0-9_-]+\/exec$/;
const URL_DEFECTO = 'https://script.google.com/macros/s/AKfycbygod1WXxes7JWJS6_u02OPf3e-nJCxgSDN8VgSdam4cPcAI7CgP51-vk-UhP_zwkAR/exec';
const $ = id => document.getElementById(id);

chrome.storage.local.get(['url', 'clave', 'gaActivo', 'gaModo']).then(({ url, clave, gaActivo, gaModo }) => {
  $('url').value = url || URL_DEFECTO;
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
  await chrome.storage.local.set({ url, clave, ultima: '', ultimoFallo: false });
  $('m').textContent = 'Enviando...';
  await chrome.runtime.sendMessage({ tipo: 'enviar' });
  const { estado } = await chrome.storage.local.get('estado');
  $('m').textContent = estado ? estado.texto : 'Guardado';
};
