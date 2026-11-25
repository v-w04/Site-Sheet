// t105: 5-SUBIR-TODO.bat centrado "arbolito", ventana grande sin maximizar y cierre solo a los 15 s (25-nov-2026). Revision estatica: no hay Windows aqui.
const fs = require('fs'), path = require('path');
let ok = 0, bad = 0; const t = (c, m) => { c ? ok++ : (bad++, console.log('FALLA', m)); };
const R = path.join(__dirname, '..');
const bat = fs.readFileSync(path.join(R, '5-SUBIR-TODO.bat'), 'latin1'), ps = fs.readFileSync(path.join(R, '_ventana.ps1'), 'latin1');
const lines = bat.split('\r\n');
t(!/[^\x00-\x7f]/.test(bat) && !/[^\x00-\x7f]/.test(ps), 'ASCII puro (bat y ps1)');
t(!/(^|[^\r])\n/.test(bat), 'todas las lineas del bat terminan en CRLF');
const etiquetas = lines.filter(l => /^:[A-Za-z0-9_]+/.test(l)).map(l => l.slice(1).split(/\s/)[0].toLowerCase());
t(new Set(etiquetas).size === etiquetas.length, 'sin etiquetas duplicadas: ' + etiquetas.filter((e, i) => etiquetas.indexOf(e) !== i));
const gotos = [...bat.matchAll(/goto\s+:?([A-Za-z0-9_]+)/gi)].map(m => m[1].toLowerCase()).filter(g => g !== 'eof');
t(gotos.every(g => etiquetas.includes(g)), 'todo goto tiene su etiqueta: ' + gotos.filter(g => !etiquetas.includes(g)));
// ya no quedan echo de texto con margen a mano (todo pasa por :CEN / :CENP)
const echos = lines.filter(l => /^echo\s+\S/i.test(l) && !/^echo\(/i.test(l));
t(echos.length === 0, 'ningun echo de texto fuera de :CEN: ' + echos.join(' | '));
t(/:CENP[\s\S]*setlocal disabledelayedexpansion[\s\S]*echo\(%PAD%%CC%%T1%%FIN%%T2%/.test(bat), ':CENP centra sin expansion retardada (los signos de admiracion no se pierden)');
t(/set "COLS=80"[\s\S]*_ventana\.ps1[\s\S]*if %COLS% lss 40 set "COLS=80"/.test(bat), 'ancho por omision 80 y se valida el que devuelve la ventana');
t(/2\^>nul/.test(bat) && !/2\^\\>/.test(bat), 'redireccion del for /f bien escapada');
// cada texto pasado a :CEN va entre comillas, sin comillas internas ni %
const llam = lines.filter(l => /^call :CENP? /i.test(l));
t(llam.length > 30 && llam.every(l => (l.match(/"/g) || []).length % 2 === 0 && !/%[A-Za-z]/.test(l.replace(/%1|%2/g, ''))), 'llamadas a :CEN con comillas pares y sin variables % sueltas');
t(!llam.some(l => /!(?!CAMBIOS!)/.test(l.replace(/!CAMBIOS!/g, 'N'))), 'ningun ! suelto en las llamadas (el marcador va como {EXC})');
// 15 segundos
t(/giro marca 15 12/.test(bat) && /timeout \/t 15 \/nobreak/.test(bat) && !/giro marca 0 12/.test(bat), 'el logo dura 15 s y sin node espera 15 s (cierra solo)');
t(/esta ventana se cierra sola en 15 s/.test(bat), 'avisa que se cierra sola');
// si el Web App no se actualizo, la ventana NO se cierra sola (hay que verlo en rojo)
t(/:VER_FALLO[\s\S]*?pause\r\nexit \/b 1/.test(bat), 'si el Web App no se actualizo se queda abierta con pause');
// ps1: restaura (no maximiza) y siempre escribe un ancho
t(/ShowWindow\(\$h, 9\)/.test(ps) && !/ShowWindow\(\$h, 3\)/.test(ps), 'ventana restaurada, nunca maximizada');
t(/MaxPhysicalWindowSize/.test(ps) && /WorkingArea/.test(ps) && /Write-Output \$ancho\s*$/.test(ps.trim()) && /\$ancho = 80/.test(ps), 'usa el maximo de la pantalla y siempre devuelve un ancho');
// _publicar.js centra solo en consola real
const pub = fs.readFileSync(path.join(R, '_publicar.js'), 'utf8');
t(/isTTY && process\.stdout\.columns/.test(pub) && /margen\(txt\)/.test(pub), '_publicar.js centra su texto en consola real');
console.log(bad ? ('FALLAN ' + bad + ' (ok ' + ok + ')') : ('t105 ok ' + ok)); process.exit(bad ? 1 : 0);
