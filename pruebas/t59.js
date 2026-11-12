// t59: limpieza unica de las columnas que Pedidos en riesgo dejo por error en Promociones (simulado).
const fs=require('fs'),vm=require('vm'),path=require('path');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,isFinite,RegExp,parseFloat};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','apps-script','PedidosRiesgo.gs'),'utf8'),ctx);
function hoja(enc){ const sh={enc:enc.slice(),borradas:[],getLastColumn:()=>sh.enc.length,
  getRange:()=>({getValues:()=>[sh.enc.slice()]}),deleteColumn:c=>{sh.borradas.push(sh.enc[c-1]);sh.enc.splice(c-1,1);}}; return sh; }
const base=['SKU','PRODUCTO','ACTUALIZADO','DEPARTAMENTO WALMART','MODALIDAD'];
const junk=['ORDEN DE COMPRA','PEDIDO','TOTAL','FECHA PEDIDO','ENVIO ESTIMADO','PRIMER AVISO','ULTIMO AVISO','AVISOS','EN CORREO','ESTATUS WALMART','ESTATUS SELLER CENTER','GUIA','ODOO','CASO','SITUACION','ACCION'];
let h=hoja(base.concat(junk)),props={},logs=[];
ctx.vdLibro_=()=>({getSheetByName:n=>n==='Promociones'?h:null});
ctx.vdProp_=k=>props[k]||'';ctx.vdSetProp_=(k,v)=>{props[k]=String(v)};
ctx.logOk_=(e,m)=>logs.push(m);ctx.logWarn_=(e,m)=>logs.push('WARN '+m);
let n=ctx.prLimpiarPromociones_();
t(n===16&&h.enc.join('|')===base.join('|'),'quita las 16 y deja las de Promociones: '+h.enc.join('|'));
t(props.PR_LIMPIO_PROMOS==='1'&&/quite 16/.test(logs[0]),'deja constancia en el Log y la marca');
n=ctx.prLimpiarPromociones_();t(n===0,'segunda vez no hace nada');
// una columna con esos nombres a la IZQUIERDA de ACTUALIZADO no se toca; hoja sin ACTUALIZADO no se toca
props={};h=hoja(['SKU','TOTAL','ACTUALIZADO','PEDIDO']);n=ctx.prLimpiarPromociones_();
t(n===1&&h.enc.join('|')==='SKU|TOTAL|ACTUALIZADO','solo quita las de la derecha de ACTUALIZADO');
props={};h=hoja(['SKU','PEDIDO','TOTAL']);n=ctx.prLimpiarPromociones_();t(n===0&&h.borradas.length===0,'si no reconoce la hoja, no toca nada');
// sin hoja Promociones
props={};ctx.vdLibro_=()=>({getSheetByName:()=>null});t(ctx.prLimpiarPromociones_()===0,'sin hoja Promociones: no truena');
console.log('t59: '+ok+' ok, '+bad+' fallas');process.exit(bad?1:0);
