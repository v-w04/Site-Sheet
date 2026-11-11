// t53: PERDIDA se llena desde Ventas Walmart cuando la nota ya no trae el precio (filas canceladas, WFS, killer).
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,RegExp};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
ctx.normEnc_=x=>String(x).trim().toUpperCase();
ctx.CAN_HOJA='Cancelaciones';ctx.CAN_ORIGEN='ORIGEN';ctx.CAN_NOTA='NOTA ODOO';ctx.CAN_ORI_PRECIO='PRECIO ERRONEO';
ctx.logWarn_=(e,m)=>{ctx._w=(ctx._w||'')+m+'|'};
ctx.CAN_CHECK='CANCELAR EN ODOO';ctx.CAN_ESTADO='ESTADO ODOO';
let enc=['ORIGEN','ORDEN DE COMPRA#','PEDIDO#','QTY.','NOTA ODOO','PERDIDA','CANCELAR EN ODOO','ESTADO ODOO'];
let filas=[
 ['PRECIO ERRONEO',609130991605149,'',1,'Cancelada en el site por la extension','','',''],
 ['PRECIO ERRONEO',600000145779997,'',1,'Precio erroneo: vendida a $1919 con minimo $2069 (7.2% abajo)','$150 · 7.2%',true,''],
 ['PRECIO ERRONEO',609131593644819,'',1,'Cancelada...','','','CANCELADO EN ODOO'],
 ['PRECIO ERRONEO',999,'',1,'nada','','',''],
 ['CORREO',1,'',1,'','','','']];
const vh=['FOLIO','ORDEN ID','REFERENCIA','PIEZAS','PRECIO UNITARIO','MINIMO APLICADO','DIFERENCIA %','SEMAFORO','NOTAS PRECIO'];
const vv=[[609130991605149,609130991605149,'',1,16789,22509,-0.25412,'BAJO MINIMO','El minimo cambio despues de la venta (se evaluo con $16389)'],
 [600000145779997,600000145779997,'',1,1919,2069,-0.07249879,'BAJO MINIMO','El minimo cambio despues de la venta (se evaluo con $1869)'],
 [609131593644819,609131593644819,'',1,21999,27299,-0.194,'KILLER','Killer $21999']];
const hoja=(hd,rows)=>({getLastRow:()=>rows.length+1,getLastColumn:()=>hd.length,getRange:(r,c,n,k)=>({getValues:()=>r===1?[hd]:rows.slice(r-2,r-2+n).map(f=>[f[c-1]]),setNumberFormat:function(){return this},setValues:function(v){v.forEach((x,i)=>{rows[r-2+i][c-1]=x[0]})}})});
const mapa=()=>{const o={};enc.forEach((e,i)=>o[e]=i+1);return o};
ctx.canMapaHoja_=()=>({mapa:mapa()});ctx.canAsegurarColumnas_=()=>mapa();ctx.canOrdenar_=()=>{};
ctx.getHoja_=()=>hoja(enc,filas);
ctx.SpreadsheetApp={getActive:()=>({getSheetByName:n=>n==='Ventas Walmart'?hoja(vh,vv):null})};
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/CancelacionesPrecio.gs','utf8'),ctx);
const n=vm.runInContext('canpCompletarPerdida_()',ctx),c=enc.indexOf('PERDIDA');
t(n===3,'llena las vacias y pasa el formato viejo a solo %: '+n);
t(filas[0][c]==='25.4% · mín. subió','fila cancelada: '+filas[0][c]);
t(filas[1][c]==='7.2%'&&filas[1][6]===true,'valor ya escrito (solo cambia a %) y casilla anterior NO se mueven: '+filas[1][c]+' casilla '+filas[1][6]);
t(/^Killer vigente/.test(filas[2][c]),'killer: '+filas[2][c]);
t(filas[3][c]===''&&/999/.test(ctx._w||''),'sin dato: queda vacia y avisa en el Log');
t(filas[4][c]==='','correo no se toca');
console.log('t53: '+ok+' ok, '+bad+' fallas');process.exit(bad?1:0);
