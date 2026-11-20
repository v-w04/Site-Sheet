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
console.log('t96',ok,'ok',bad,'fallas');if(bad)process.exit(1);
