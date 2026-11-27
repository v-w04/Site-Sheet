// t115: el 5-AUTO de Site Sheet crea (una sola vez) el 5-AUTO.bat de Electrobot y su tarea de Windows; Electrobot sube solo cada 15 min
const fs = require('fs'), path = require('path');
let ok = 0, mal = 0; const t = (c, m) => { if (c) ok++; else { mal++; console.log('FALLA ' + m); } };
const raiz = path.join(__dirname, '..');
const au = fs.readFileSync(path.join(raiz, '5-AUTO.bat'), 'latin1'), pl = fs.readFileSync(path.join(raiz, 'hermanos', 'electrobot-5-AUTO.bat'), 'latin1');
t(!/[^\x00-\x7f]/.test(pl) && /\r\n/.test(pl) && !/[^\r]\n/.test(pl), 'plantilla electrobot: ASCII y CRLF');
t(!/[^\x00-\x7f]/.test(au) && !/[^\r]\n/.test(au), '5-AUTO: ASCII y CRLF');
t(/set "TAREA=Electrobot-Auto-Subir"/.test(pl) && /call :HERMANO electrobot Electrobot-Auto-Subir/.test(au), 'mismo nombre de tarea en la plantilla y en el 5-AUTO de Site Sheet');
t(au.indexOf('call :HERMANOS') > au.indexOf(':AUTO\r\n') && au.indexOf('call :HERMANOS') < au.indexOf('if exist "%LOCK%"'), '5-AUTO: el paso de hermanos corre en cada vuelta, antes del candado');
{ const h0 = au.indexOf(':HERMANO\r\n'); const h = au.slice(h0, au.indexOf('\r\n:HAYCAMBIOS\r\n', h0));
  t(/if not exist "%HD%\.git" exit \/b 0/.test(h), 'hermano: si la carpeta del proyecto no existe (otra PC) no hace nada');
  t(/if not exist "%HD%5-AUTO\.bat" \(/.test(h) && /copy \/y "%RAIZ%hermanos\\%HP%-5-AUTO\.bat" "%HD%5-AUTO\.bat"/.test(h), 'hermano: crea el 5-AUTO.bat solo si falta');
  t(/schtasks \/query \/tn "%HT%" >nul 2>&1\r\nif not errorlevel 1 exit \/b 0/.test(h), 'hermano: si la tarea ya existe no crea otra');
  t(/call "%HD%5-AUTO\.bat" instalar callado/.test(h) && /NO pude crear su tarea/.test(h) && /tarea %HT% creada/.test(h), 'hermano: crea la tarea con el instalador del hermano y deja el resultado en el log'); }
t(/schtasks \/create \/tn "%TAREA%" \/tr "wscript\.exe \/\/B \\"%V%\\"" \/sc minute \/mo 15 \/f/.test(pl), 'plantilla: la tarea corre cada 15 min sin ventana');
t(/call "%RAIZ%5-SUBIR-TODO\.bat" <nul/.test(pl) && /rev-list --count @\{u\}\.\.HEAD/.test(pl) && /AddMinutes\(-4\)/.test(pl) && /Lock|LOCK/.test(pl), 'plantilla: cambios o commits pendientes, espera 4 min sin ediciones, candado, y corre el 5-SUBIR-TODO');
t(!/credencial|token|secret/i.test(pl.replace(/REM[^\r]*/g, '')), 'plantilla: sin credenciales');
for (const [n, s] of [['5-AUTO', au], ['plantilla', pl]]) { const et = [...s.matchAll(/^:([A-Za-z0-9_]+)/gm)].map(m => m[1].toLowerCase()); const us = [...s.matchAll(/\b(?:goto|call)\s+:?([A-Za-z0-9_]+)/gi)].map(m => m[1].toLowerCase()).filter(x => x !== 'eof' && !/^"/.test(x)); const falta = us.filter(x => !et.includes(x) && !/^[a-z]:|^\W/.test(x) && !['git', 'node', 'powershell', 'wscript', 'set'].includes(x) && !/\.bat$/.test(x)); t(falta.length === 0 || falta.every(x => ['instalar', 'callado', 'quitar', 'auto'].includes(x)), n + ': etiquetas sin definir: ' + falta.join(',')); }
// WM_Inv: mismo mecanismo con su propia plantilla y su propia tarea
{ const wm = fs.readFileSync(path.join(raiz, 'hermanos', 'WM_Inv-5-AUTO.bat'), 'latin1');
  t(!/[^\x00-\x7f]/.test(wm) && !/[^\r]\n/.test(wm) && !/lectrobot/.test(wm), 'plantilla WM_Inv: ASCII, CRLF y sin restos de Electrobot');
  t(/set "TAREA=WMInv-Auto-Subir"/.test(wm) && /call :HERMANO WM_Inv WMInv-Auto-Subir/.test(au), 'WM_Inv: mismo nombre de tarea en la plantilla y en el 5-AUTO de Site Sheet');
  t(/set "CFG=%RAIZ%\.git\\wminv-auto"/.test(wm) && /WI_LOCK/.test(wm) && !/EA_/.test(wm), 'WM_Inv: su propia carpeta de estado y su candado, distintos a los de Electrobot');
  t(/call "%RAIZ%5-SUBIR-TODO\.bat" <nul/.test(wm) && /schtasks \/create \/tn "%TAREA%"[^\r]*\/sc minute \/mo 15/.test(wm), 'WM_Inv: corre su 5-SUBIR-TODO y la tarea es cada 15 min'); }
console.log('t115 (autos de proyectos hermanos): ' + ok + ' ok' + (mal ? ', ' + mal + ' FALLAN' : ''));
process.exit(mal ? 1 : 0);
