const fs=require('fs'),vm=require('vm');
const ctx={console,Utilities:{parseDate:(s)=>new Date(s.replace(' ','T')+'-06:00')},TZ:'x'};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/Salud.gs','utf8'),ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const now=Date.UTC(2026,9,28,16,0,0), H=3600000;
const ev=[];
for(let i=0;i<10;i++){ev.push([now-(i*H+5*60000),'OK','KILLERS','ok'])}                      // cada hora, sano
for(let i=3;i<12;i++){ev.push([now-(i*H+5*60000),'OK','PARRILLAS','ok'])}                    // atrasado 3 h+
for(let i=1;i<9;i++){ev.push([now-(i*H),'OK','PRECIOS','ok'])}; ev.push([now-20*60000,'ERROR','PRECIOS','Cookie rechazada']); // error mas nuevo que la ultima buena
for(let i=2;i<9;i++){ev.push([now-(i*H),'FINISH','STOCK','ok'])}; ev.push([now-60*60000,'ERROR','STOCK','fallo viejo']);ev.push([now-30*60000,'FINISH','STOCK','ok']);       // error ya superado
ev.push([now-5*H,'ERROR','NUNCA','siempre falla']);
ev.push([now-1*H,'INFO','POPUP','x']);ev.push([now-1*H,'OK','POPUP','x']);                      // ignorada
const f=ctx.saludCalcular_(ev,now);const g=n=>f.find(r=>r[0]===n);
t(g('KILLERS')[5]==='✅','sano');
t(g('PARRILLAS')[5]==='⚠️'&&/atras/i.test(g('PARRILLAS')[6]),'atrasado');
t(g('PRECIOS')[5]==='❌'&&/Cookie/.test(g('PRECIOS')[6]),'error mas nuevo que lo bueno');
t(g('STOCK')[5]==='⚠️'||g('STOCK')[5]==='✅','error superado no es rojo');
t(g('NUNCA')[5]==='❌','nunca salio bien');
t(!g('POPUP'),'eventos puntuales se ignoran');
t(f[0][5]==='❌'&&f[f.length-1][5]==='✅','ordenado: primero lo malo');
t(g('KILLERS')[1]==='60 min','ritmo medido: 60 min');
console.log(ok+' OK, '+bad+' FALLAS');
