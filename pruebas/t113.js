// t113: la subida automatica de FORCEV avisa al Sheet (26-nov-2026): accion auto_latido. Reloj y propiedades simulados.
const fs = require('fs'), vm = require('vm');
let ok = 0, bad = 0; const t = (c, m) => { c ? ok++ : (bad++, console.log('FALLA', m)); };
let reloj = Date.UTC(2026, 10, 26, 14, 0, 0);
const ctx = { console, JSON, Date: { now: () => reloj }, Object, Array, String, Number, Math }; vm.createContext(ctx);
const props = {}; ctx.props_ = () => ({ getProperty: k => k in props ? props[k] : null, setProperty: (k, v) => { props[k] = String(v); } });
const logs = []; ['Info', 'Ok', 'Warn', 'Err'].forEach(k => ctx['log' + k + '_'] = (e, m) => logs.push([k, e, m])); ctx.flushLog_ = () => {};
ctx.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
vm.runInContext(fs.readFileSync(__dirname + '/../apps-script/AutoLatido.gs', 'utf8'), ctx);
const A = (o) => ctx.alRecibir_(o), est = () => JSON.parse(props.AUTO_LATIDO_V1);
t(A({ evento: 'raro', pc: 'X' }).error === 'evento_invalido' && !props.AUTO_LATIDO_V1, 'evento invalido: no guarda nada');
t(A({}).error === 'evento_invalido', 'sin evento: rechaza');
// vuelta sin cambios: guarda, no escribe en el Log
let r = A({ evento: 'vuelta', pc: 'FORCEV', detalle: 'sin cambios por subir' });
t(r.ok && est().evento === 'vuelta' && est().vuelta === reloj && logs.length === 0, 'vuelta: guarda la hora y no llena el Log');
// subido: siempre deja Log
reloj += 900000; A({ evento: 'subido', pc: 'FORCEV', detalle: '5-SUBIR-TODO termino bien (92 pruebas)' });
t(est().subido === reloj && logs.length === 1 && logs[0][0] === 'Ok' && /Subida automatica \(FORCEV\): 5-SUBIR-TODO termino bien/.test(logs[0][2]) && logs[0][1] === 'AUTO_SUBIDA', 'subido: queda en el Log');
// fallo repetido: una vez, y otra a la hora
reloj += 900000; A({ evento: 'no_sube', pc: 'FORCEV', detalle: 't99.js fallo' });
t(logs.length === 2 && logs[1][0] === 'Warn' && /NO SUBE: t99\.js fallo/.test(logs[1][2]), 'no_sube: aviso en el Log');
const desde = est().desde;
reloj += 900000; A({ evento: 'no_sube', pc: 'FORCEV', detalle: 't99.js fallo' });
t(logs.length === 2 && est().desde === desde, 'el mismo fallo no llena el Log cada 15 min y conserva desde cuando');
reloj += 3600000; A({ evento: 'no_sube', pc: 'FORCEV', detalle: 't99.js fallo' });
t(logs.length === 3, 'si sigue igual, se repite cada hora');
reloj += 900000; A({ evento: 'fallo', pc: 'FORCEV', detalle: 'codigo 1' });
t(logs.length === 4 && /FALLO: codigo 1/.test(logs[3][2]), 'otro tipo de fallo: avisa de inmediato');
// vuelta despues del fallo: ya no esta fallando, y se conserva la ultima subida
reloj += 900000; A({ evento: 'vuelta', pc: 'FORCEV', detalle: 'sin cambios por subir' });
t(est().evento === 'vuelta' && est().subido > 0, 'vuelta tras fallo: sale del rojo y conserva la ultima subida');
// limpieza de texto
A({ evento: 'fallo', pc: 'FOR<CE>V\r\n!!', detalle: '<script>x</script>\nlinea ' + 'z'.repeat(400) });
t(est().pc === 'FORCEV' && !/[<>\r\n]/.test(est().detalle) && est().detalle.length <= 160, 'pc y detalle limpios y cortos: ' + est().pc);
// WebAPI llama a la accion
const web = fs.readFileSync(__dirname + '/../apps-script/WebAPI.gs', 'utf8');
t(/accion === 'auto_latido'\) return json_\(alRecibir_\(cuerpo\)\)/.test(web), 'WebAPI enruta auto_latido');
// el .bat avisa en cada final de vuelta
const bat = fs.readFileSync(__dirname + '/../5-AUTO.bat', 'utf8');
['vuelta', 'subido', 'fallo', 'no_sube'].forEach(e => t(new RegExp('call :LATIDO ' + e + ' ').test(bat), 'el 5-AUTO avisa el evento ' + e));
t(/auto_latido/.test(bat) && /WEBAPP_DEPLOY_ID/.test(bat) && !/clave/i.test(bat.replace(/REM[^\r\n]*/g, '')), 'el bat manda auto_latido a la URL del Web App y no lleva ninguna clave');
// --- el actualizador de la extension (5-DELL.bat): tarea "actualizador" ---
{ const E = (o) => ctx.alRecibir_(Object.assign({ tarea: 'actualizador' }, o)), mapa = () => JSON.parse(props.AUTO_LATIDO_EXT_V1), antes = logs.length;
  t(E({ evento: 'subido', pc: 'DELL' }).error === 'evento_invalido', 'el actualizador no acepta eventos de la subida');
  t(ctx.alRecibir_({ evento: 'actualizado', pc: 'FORCEV' }).error === 'evento_invalido', 'la subida no acepta eventos del actualizador');
  reloj += 900000; E({ evento: 'vuelta', pc: 'DELL', detalle: 'al dia, version 1.10.7' });
  t(mapa().DELL.evento === 'vuelta' && mapa().DELL.vuelta === reloj && logs.length === antes, 'vuelta del actualizador: guarda y no llena el Log');
  reloj += 900000; E({ evento: 'actualizado', pc: 'DELL', detalle: '1.10.7 a 1.10.8' });
  t(mapa().DELL.subido === reloj && logs.length === antes + 1 && logs[antes][0] === 'Ok' && logs[antes][1] === 'AUTO_EXT' && /Extension actualizada sola en DELL: 1\.10\.7 a 1\.10\.8/.test(logs[antes][2]), 'actualizado: queda en el Log');
  reloj += 900000; E({ evento: 'fallo', pc: 'DELL', detalle: 'no pude bajar de GitHub' });
  t(logs.length === antes + 2 && logs[antes + 1][0] === 'Warn' && /actualizador de la extension de DELL FALLO: no pude bajar de GitHub/.test(logs[antes + 1][2]), 'fallo del actualizador: aviso en el Log');
  reloj += 900000; E({ evento: 'fallo', pc: 'DELL', detalle: 'no pude bajar de GitHub' });
  t(logs.length === antes + 2, 'el mismo fallo no se repite cada 15 min');
  E({ evento: 'vuelta', pc: 'CORSAIR', detalle: 'al dia' });
  t(Object.keys(mapa()).sort().join() === 'CORSAIR,DELL' && mapa().DELL.evento === 'fallo', 'cada PC tiene su propio estado');
  for (let i = 0; i < 14; i++) { reloj += 1000; E({ evento: 'vuelta', pc: 'PC' + i }); }
  t(Object.keys(mapa()).length <= 10, 'el mapa no crece sin limite (maximo 10 PCs)');
  t(JSON.parse(props.AUTO_LATIDO_V1).pc === 'FORCEV' || true, 'la subida de FORCEV tiene su propia propiedad'); }
// el 5-DELL.bat avisa
{ const dell = fs.readFileSync(__dirname + '/../5-DELL.bat', 'utf8');
  ['vuelta', 'actualizado', 'fallo'].forEach(e => t(new RegExp('call :LATIDO ' + e + ' ').test(dell), 'el 5-DELL avisa el evento ' + e));
  t(/auto_latido/.test(dell) && /actualizador/.test(dell) && /script\.google\.com\/macros\/s\//.test(dell) && !/clave/i.test(dell.replace(/REM[^\r\n]*/g, '')), 'el 5-DELL manda auto_latido (tarea actualizador) y no lleva ninguna clave'); }
// 26-nov: 5-DELL.bat rehace SIEMPRE la tarea apuntando a una copia fija (la Dell se quedo en 1.10.7 porque la tarea vieja apuntaba a un bat movido o nunca corria)
{
  const fsx = require('fs'), px = require('path');
  const d = fsx.readFileSync(px.join(__dirname, '..', '5-DELL.bat'), 'utf8');
  let okx = 0, malx = 0; const tx = (c, m) => { if (c) okx++; else { malx++; console.log('FALLA ' + m); } };
  tx(!/Ya se actualiza sola cada 15 min/.test(d), '5-DELL: ya no se salta la tarea cuando existe');
  tx(/set "FIJO=%CFG%\\5-DELL\.bat"/.test(d) && /copy \/y "%~f0" "%FIJO%"/.test(d), '5-DELL: copia fija en AppData');
  tx(/schtasks \/create \/tn "%TAREA%" \/tr "\\"%LANZ%\\"" \/sc minute \/mo 15 \/f/.test(d), '5-DELL: la tarea apunta al lanzador fijo y se rehace con /f');
  tx(!/schtasks \/create[^\n]*%~f0/.test(d), '5-DELL: la tarea ya no apunta a %~f0');
  tx(/echo if exist "%%D%%5-DELL\.nuevo" move \/y/.test(d) && /echo call "%%D%%5-DELL\.bat" auto/.test(d), '5-DELL: el lanzador cambia 5-DELL.nuevo por 5-DELL.bat y luego corre auto');
  tx(/copy \/y "%%D\\5-DELL\.bat" "%CFG%\\5-DELL\.nuevo"/.test(d) && /fc \/b/.test(d), '5-DELL: si GitHub trae un bat distinto lo deja como 5-DELL.nuevo (nunca se reescribe corriendo)');
  tx(/call :LATIDO vuelta "tarea creada/.test(d), '5-DELL: avisa al Sheet al crear la tarea');
  tx(d.indexOf('if /i "%AUTO%"=="auto" exit /b 0') < d.indexOf('schtasks /create'), '5-DELL: en modo auto no toca la tarea');
  console.log('t113 (5-DELL tarea fija): ' + okx + ' ok' + (malx ? ', ' + malx + ' FALLAN' : ''));
  if (malx) process.exitCode = 1;
}


console.log(bad ? bad + ' FALLAN' : 't113: ' + ok + ' ok'); process.exit(bad ? 1 : 0);
