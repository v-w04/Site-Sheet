// t96: Reporte (20-nov): pedidos en "Nuevo" en Walmart con mas de 1 dia, con guia (confirmar envio) o sin guia. Nada real.
const fs=require('fs'),vm=require('vm');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const src=fs.readFileSync(__dirname+'/../apps-script/Reporte.gs','utf8');
const ini=src.indexOf('function rpSinEnviar_'),fin=src.indexOf('/* ---------- lectura y escritura');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,RegExp};vm.createContext(ctx);
vm.runInContext('function rpTxt_(v){return String(v===null||v===undefined?"":v).trim();}function rpMs_(v){if(v instanceof Date)return v.getTime();var m=/^(\\d{4})-(\\d{2})-(\\d{2})/.exec(String(v||""));return m?new Date(+m[1],m[2]-1,+m[3]).getTime():null;}'+src.slice(ini,fin),ctx);
const iso=ms=>{const d=new Date(ms);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const c={hoy:'2026-11-20',iso};
const sc=[{'PEDIDO':'600000134500137','FECHA PEDIDO':'2026-11-16','ESTADO SELLER CENTER':'Nuevo'},
 {'PEDIDO':'600000136739754','FECHA PEDIDO':'2026-11-17','ESTADO SELLER CENTER':'Nuevo'},
 {'PEDIDO':'600000140574414','FECHA PEDIDO':'2026-11-20','ESTADO SELLER CENTER':'Nuevo'},
 {'PEDIDO':'600000111111111','FECHA PEDIDO':'2026-11-15','ESTADO SELLER CENTER':'Enviado'},
 {'PEDIDO':'600000134500137','FECHA PEDIDO':'2026-11-16','ESTADO SELLER CENTER':'Nuevo'}];
const paq=[{'ORDEN WALMART (6000)':"'600000134500137",'GUIA':"'MXFDDWM23014156"}];
const r=ctx.rpSinEnviar_(sc,paq,c);
t(r.todos.length===2,'solo Nuevo con mas de 1 dia, sin repetir (los de hoy y los Enviado no)');
t(r.conGuia.length===1&&r.conGuia[0].guia==='MXFDDWM23014156'&&r.conGuia[0].fecha==='2026-11-16','con guia: confirmar envio');
t(r.sinGuia.length===1&&r.sinGuia[0].pedido==='600000136739754','sin guia');
t(/se\.todos\.length \? '❌' : '✅'/.test(src)&&/seller: rpObjetos_\('Seller Center'\)/.test(src),'en el Reporte como ❌ y lee la hoja Seller Center');
const ini2=src.indexOf('function rpViejas_'),fin2=src.indexOf('/** Borra del Reporte');
vm.runInContext('function normEnc_(s){return String(s||"").trim().toUpperCase();}'+src.slice(ini2,fin2),ctx);
const v=ctx.rpViejas_(['¿Precios erróneos por decidir (3% a 7%)?','¿Precios erróneos por decidir (3% a 5%)?','¿Otra que falta?','¿Mia (1% a 2%)?'],['AUTO','AUTO','AUTO','CLAUDE'],[{pregunta:'¿Precios erróneos por decidir (3% a 7%)?'}]);
t(JSON.stringify(v)==='[1]','solo se borra la fila AUTO vieja de rango de %; no las que llena Claude ni las que faltan un rato');
const pr=fs.readFileSync(__dirname+'/../apps-script/Precios.gs','utf8');
t(/tgUnaVez_\('descargarPrecios', 4 \* 60 \* 1000\)/.test(pr)&&!/console\.log\('Otra corrida de precios en curso, se omite esta\.'\)/.test(pr),'precios: si hay candado se reintenta en 4 min (ya no se salta en silencio)');
const el=fs.readFileSync(__dirname+'/../apps-script/ExtensionLog.gs','utf8'),rq=fs.readFileSync(__dirname+'/../apps-script/Rastreo.gs','utf8');
t(/function extAlertaFijaQuitar_/.test(el)&&/extAlertaFijaQuitar_\('rq-revisar'\)/.test(rq),'el aviso rojo del rastreo se quita cuando ya se leyeron todas');
console.log('t96',ok,'ok',bad,'fallas');if(bad)process.exit(1);
