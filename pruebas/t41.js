// Sobreventa WFS: QUE PASO / ACCION (SobreventaWfs.gs). Datos simulados, no es una corrida real.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const logs=[];['Info','Ok','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m)=>logs.push([k,e,m]));
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/PreciosErroneos.gs','utf8'),ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/SobreventaWfs.gs','utf8'),ctx);
const C=vm.runInContext('swClasificar_',ctx), AH=new Date(2026,10,2,12).getTime();
t(C(undefined,1,0,null,AH)[0]==='Sin respuesta del site','site no contesto');
t(C(null,1,0,null,AH)[1]==='Buscar en Seller Center','no esta en el site');
t(C({estatus:'Cancelled',canal:'fulfillment'},1,5,null,AH)[1]==='Cancelar en Odoo','cancelada en Walmart');
t(C({estatus:'Shipped',canal:'seller'},1,5,null,AH)[0]==='Venta seller con salida WFS','venta seller');
t(C({estatus:'Delivered',canal:'fulfillment'},1,2,null,AH)[1]==='Comprobar disponibilidad y validar','surtida con stock');
t(C({estatus:'Shipped',canal:'fulfillment'},2,1,{qty:5,refs:['W-ELE/INT/00103']},AH)[1].indexOf('W-ELE/INT/00103')>0,'surtida, stock en traslado');
t(C({estatus:'Shipped',canal:'fulfillment'},1,0,null,AH)[0]==='WFS la surtio · Odoo sin stock WFS','surtida sin stock');
t(C({estatus:'Shipped',canal:'fulfillment'},1,null,null,AH)[0]==='WFS la surtio · Odoo sin stock WFS','sin Odoo: no se inventa stock');
t(C({estatus:'Created',canal:'fulfillment',fecha:'2026-11-01 10:00:00'},1,0,null,AH)[1]==='Esperar','reciente: esperar');
t(/\(\d+ d\)/.test(C({estatus:'SentForFulfillment',canal:'fulfillment',fecha:'2026-07-01 10:00:00'},1,0,null,AH)[0]),'vieja sin surtir: dias');
// swAnalizar_: reparto del stock de la mas vieja a la mas nueva y orden de escritura
const enc=['Referencia','Desde','Hacia','Contacto','Fecha programada','Documento origen','Estado','Tipo','SKU','Nombre producto','Qty demandada','Qty realizada'];
const datos=[enc,
 ['W/OUT/2','W-ELE/Existencias','','WALMART',new Date(2026,6,2),600000000000002,'Confirmado','','AAA-1','',1,0],
 ['W/OUT/1','W-ELE/Existencias','','WALMART',new Date(2026,6,1),600000000000001,'Confirmado','','AAA-1','',1,0],
 ['W/OUT/3','W-ELE/Existencias','','WALMART',new Date(2026,6,3),600000000000003,'Confirmado','','BBB-2','',1,0]];
const hoja={getLastRow:()=>datos.length,getLastColumn:()=>enc.length,getRange:(r,c,n,w)=>({getValues:()=>datos.slice(r-1,r-1+n).map(f=>f.slice(c-1,c-1+w))})};
ctx.SpreadsheetApp={getActive:()=>({getSheetByName:n=>n==='Sobreventa WFS'?hoja:null})};
ctx.colsHoja_=(h,req)=>{const o={};req.forEach(k=>o[k]=enc.indexOf(k));return o};
ctx.sobNum_=v=>Number(v)||0;
let escrito=null;ctx.vdEscribir_=(h,e,f)=>{escrito={e,f}};
ctx.swSitio_=()=>({'600000000000001':{estatus:'Delivered',canal:'fulfillment'},'600000000000002':{estatus:'Delivered',canal:'fulfillment'},'600000000000003':{estatus:'Cancelled',canal:'fulfillment'}});
ctx.swStockOdoo_=()=>({'AAA-1':1});ctx.swTraslados_=()=>({});
const r=vm.runInContext('swAnalizar_()',ctx);
const qp=escrito.e.indexOf('QUE PASO');
t(escrito.f.length===3,'una fila por linea, mismo orden que la hoja');
t(escrito.f[1][qp]==='WFS la surtio · hay stock WFS'&&escrito.f[0][qp]==='WFS la surtio · Odoo sin stock WFS','el stock le toca a la salida mas vieja');
t(escrito.f[2][qp]==='Cancelada en Walmart','cancelada');
t(r.porQue['Cancelada en Walmart']===1&&/3 pedidos/.test(vm.runInContext('swResumen_',ctx)(r)),'resumen para el Log');
console.log('t41: '+ok+' ok, '+bad+' fallas');process.exit(bad?1:0);
