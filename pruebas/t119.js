// t119: 5-DELL.bat (27-nov): la vuelta automatica no toca la tarea y ningun schtasks puede quedarse esperando una clave. Revision estatica (NO probado en Windows).
const fs=require('fs');let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const b=fs.readFileSync(__dirname+'/../5-DELL.bat','utf8');
t(!/^if \/i "%AUTO%"=="auto" call :OCULTAR/m.test(b),'la vuelta automatica ya no llama :OCULTAR (ahi se colgaba)');
const sch=b.split(/\r?\n/).filter(l=>/^\s*(if errorlevel 1 )?schtasks /i.test(l));
t(sch.length>=3&&sch.every(l=>/<nul\s*$/.test(l)),'todos los schtasks llevan <nul: si Windows pide clave, falla en vez de esperar');
t(/Register-ScheduledTask/.test(b)&&/-LogonType Interactive/.test(b)&&/-AllowStartIfOnBatteries/.test(b)&&/-DontStopIfGoingOnBatteries/.test(b),'tarea por PowerShell, interactiva (sin clave) y con bateria permitida');
t(/-ExecutionTimeLimit \(New-TimeSpan -Minutes 10\)/.test(b)&&/-MultipleInstances IgnoreNew/.test(b),'una vuelta colgada se mata a los 10 min y no se empalman');
t(/set "SS_TAREA=%TAREA%"/.test(b)&&/set "SS_OCULTO=%OCULTO%"/.test(b),'el PowerShell recibe nombre de tarea y vbs por variables de entorno');
t(/-UserId \(\$env:USERDOMAIN \+ '\\' \+ \$env:USERNAME\)/.test(b),'usuario con una sola diagonal');
t(/-RepetitionInterval \(New-TimeSpan -Minutes 5\)/.test(b)&&/\/sc minute \/mo 5 \/f/.test(b)&&!/Minutes 15\)|\/mo 15 /.test(b),'la tarea de la Dell es cada 5 min');
t(/if \/i "%AUTO%"=="auto" if not exist "%CFG%\\cada5\.ok" call :CADA5/.test(b)&&/NO pude pasar la tarea a 5 min/.test(b),'la vuelta automatica pasa la tarea vieja a 5 min UNA vez, sin schtasks /change');
console.log(bad?`${bad} FALLAS`:`t119: ${ok} ok`);process.exit(bad?1:0);
