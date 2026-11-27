// t120: 5-AUTO.bat (27-nov): la subida corre cada 5 min, la tarea existente pasa sola y UNA vez de 15 a 5, sin poder pedir clave. Revision estatica (NO probado en Windows).
const fs=require('fs');let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const b=fs.readFileSync(__dirname+'/../5-AUTO.bat','utf8');
t(/-RepetitionInterval \(New-TimeSpan -Minutes 5\)/.test(b)&&/\/sc minute \/mo 5 \/f/.test(b)&&!/\/mo 15 \/f/.test(b),'la tarea de subida es cada 5 min (PowerShell y schtasks de respaldo)');
t(/:AUTO[\s\S]{0,400}if not exist "%CFG%\\cada5\.ok" call :CADA5/.test(b),'la vuelta automatica pasa la tarea vieja a 5 min una sola vez (marca cada5.ok)');
t(/-LogonType Interactive/.test(b)&&/-AllowStartIfOnBatteries/.test(b)&&/-MultipleInstances IgnoreNew/.test(b)&&/-ExecutionTimeLimit \(New-TimeSpan -Minutes 30\)/.test(b),'sin clave, con bateria, sin empalmar y con tope de 30 min');
const sch=b.split(/\r?\n/).filter(l=>/schtasks \/create/i.test(l));
t(sch.length===1&&/<nul\s*$/.test(sch[0]),'el schtasks de respaldo lleva <nul (nunca espera clave)');
t(/NO pude pasar la tarea a 5 min/.test(b)&&/>"%CFG%\\cada5\.ok" echo %date% %time% fallo/.test(b),'si falla lo anota en auto.log y no insiste en cada vuelta');
t(/ESTABLE/.test(b)&&/menos de 4 min/.test(b),'sigue esperando 4 min a que los archivos dejen de cambiar (cabe en 5 min)');
console.log(bad?`${bad} FALLAS`:`t120: ${ok} ok`);process.exit(bad?1:0);
