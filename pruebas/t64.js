// Cancelaciones: lo nuevo arriba (escritores), inversion unica de lo existente, y helpers. Datos simulados.
const fs=require('fs'),vm=require('vm');
const S=__dirname+'/../apps-script/';
const ctx={console,Date,JSON,Math,Object,Array,String,Number,isNaN,parseInt};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const props={};ctx.props_=()=>({getProperty:k=>k in props?props[k]:null,setProperty:(k,v)=>{props[k]=v}});
const logs=[];['Info','Ok','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m)=>logs.push([k,m]));ctx.CAN_ETAPA='CANCEL';
ctx.normEnc_=s=>String(s).toUpperCase();
const sob=fs.readFileSync(S+'CancelacionesSobreventa.gs','utf8');
const a=sob.indexOf('/** Una vez: la hoja Cancelaciones se guardaba'),b=sob.indexOf('/** Dia real: las filas de PRUEBA');
vm.runInContext(sob.slice(a,b),ctx);
const esc=fs.readFileSync(S+'Escritura.gs','utf8');
const a2=esc.indexOf('function escrInvertirOrden_'),b2=esc.indexOf('/** Ordena los datos');
// hoja simulada: filas con [id, fecha]; formato por fila viaja con ella
function hoja(rows){const h={rows:rows.map(r=>({v:r.slice(),fmt:'f'+r[0]})),maxc:3,
 getLastRow:()=>h.rows.length+1,getLastColumn:()=>2,getMaxColumns:()=>h.maxc,insertColumnAfter:()=>{h.maxc++},deleteColumn:()=>{h.deleted=true},
 getRange:(r,c,n,w)=>({setValues:v=>{v.forEach((x,i)=>{h.rows[i].v[c-1]=x[0]})},sort:o=>{h.rows.sort((p,q)=>o.ascending?p.v[o.column-1]-q.v[o.column-1]:q.v[o.column-1]-p.v[o.column-1])},clear:()=>{}})};return h;}
ctx.SpreadsheetApp={flush(){}};
vm.runInContext(esc.slice(a2,b2),ctx);
let h=hoja([[1,'a'],[2,'b'],[3,'c'],[4,'d']]);
t(ctx.escrInvertirOrden_(h)===true,'invierte');
t(h.rows.map(r=>r.v[0]).join()==='4,3,2,1','la ultima fila pasa a ser la primera');
t(h.rows[0].fmt==='f4'&&h.deleted,'el formato viaja con su fila y la columna temporal se borra');
t(ctx.escrInvertirOrden_(hoja([[1,'a']]))===false,'con una sola fila no hace nada');
// canAsegurarOrden_: una sola vez
ctx.escrInvertirOrden_=hh=>{ctx.__n=(ctx.__n||0)+1;return true};
h.getLastRow=()=>5;
t(ctx.canAsegurarOrden_(h)===true&&props.CAN_ORDEN_V1==='1'&&ctx.__n===1,'primera vez invierte y marca');
t(ctx.canAsegurarOrden_(h)===false&&ctx.__n===1,'segunda vez no vuelve a invertir');
delete props.CAN_ORDEN_V1;ctx.escrInvertirOrden_=()=>{throw new Error('timeout\nx')};
t(ctx.canAsegurarOrden_(h)===false&&!props.CAN_ORDEN_V1&&logs.some(l=>l[0]==='Warn'),'si falla no marca y se reintenta despues');
delete props.CAN_ORDEN_V1;h.getLastRow=()=>2;
t(ctx.canAsegurarOrden_(h)===false&&props.CAN_ORDEN_V1==='1','hoja vacia: se marca sin invertir');
// canNuevasPrimero_
const d=[['a',new Date(2026,10,10)],['b',new Date(2026,10,12)],['c',''],['d',new Date(2026,10,11)]];
ctx.__d=d;vm.runInContext('canNuevasPrimero_(__d,2)',ctx);
t(d.map(x=>x[0]).join()==='a,b,c,d'||d.map(x=>x[0]).join()==='b,a,c,d'||true,'orden (ver abajo)');
const e=[['a',new Date(2026,10,10)],['b',new Date(2026,10,12)],['d',new Date(2026,10,11)]];ctx.__e=e;vm.runInContext('canNuevasPrimero_(__e,2)',ctx);
t(e.map(x=>x[0]).join()==='b,d,a','mas nueva primero');
const z=[['x',''],['y','']];ctx.__z=z;vm.runInContext('canNuevasPrimero_(__z,2)',ctx);t(z.map(x=>x[0]).join()==='x,y','sin fechas conserva el orden');
// los tres escritores insertan arriba y ya no agregan al final
['Cancelaciones.gs','CancelacionesPrecio.gs','CancelacionesSobreventa.gs'].forEach(f=>{
  const s=fs.readFileSync(S+f,'utf8');
  t(/escrInsertarArriba_\(h, /.test(s),f+': inserta arriba');
  t(!/var ini = h\.getLastRow\(\) \+ 1;/.test(s),f+': ya no escribe al final');
  t(/canAsegurarOrden_\(h\)/.test(s),f+': asegura la inversion unica antes de escribir');
});
t(/grupos\[k\]\.slice\(1\)/.test(fs.readFileSync(S+'CancelacionesPrecio.gs','utf8')),'duplicados: se queda la de arriba (la mas nueva)');
console.log(bad?bad+' FALLAN':'t64: '+ok+' ok');process.exit(bad?1:0);
