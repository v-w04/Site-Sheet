// t55: casillas de filas nuevas: formato '0' + casilla + valor booleano (en celdas de texto la casilla marcada quedaba apagada); reparacion unica de 2 filas.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,RegExp};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
ctx.normEnc_=x=>String(x).trim().toUpperCase();ctx.CAN_CHECK='CANCELAR EN ODOO';ctx.CAN_ESTADO='ESTADO ODOO';ctx.CAN_HOJA='Cancelaciones';ctx.CAN_ETAPA='CANCELACIONES';
ctx.logWarn_=(e,m)=>{ctx._w=(ctx._w||'')+m+'|'};
const llamadas=[];const props={};ctx.props_=()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v}});
const enc=['ORIGEN','Orden de compra#','CANCELAR EN ODOO','ESTADO ODOO'];
const filas=[['PRECIO ERRONEO','609131694301179',false,'PENDIENTE: orden activa en Odoo'],['PRECIO ERRONEO','609131694294215',false,'PENDIENTE: orden activa en Odoo'],['PRECIO ERRONEO','111',false,'PENDIENTE'],['PRECIO ERRONEO','609131694294216',false,'CANCELADO EN ODOO']];
const mapa=()=>{const o={};enc.forEach((e,i)=>o[e.toUpperCase()]=i+1);return o};
ctx.canMapaHoja_=()=>({mapa:mapa()});
const h={getLastRow:()=>filas.length+1,getRange:(r,c,n,w)=>({setNumberFormat:function(f){llamadas.push('fmt:'+f);return this},insertCheckboxes:function(){llamadas.push('chk');return this},
 getValues:()=>filas.slice(r-2,r-2+n).map(f=>[f[c-1]]),setValues:function(v){llamadas.push('vals');v.forEach((x,i)=>{filas[r-2+i][c-1]=x[0]});return this}})};
ctx.getHoja_=()=>h;
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/CancelacionesPrecio.gs','utf8'),ctx);
// 1) canFijarCasillas_
const datos=[['x','1',true,''],['x','2',false,'']];
const escrito=[[ 'a','b','TRUE','' ],['a','b','','']];
vm.runInContext('canFijarCasillas_',ctx)({getRange:(r,c,n)=>({setNumberFormat:function(f){llamadas.push('fmt:'+f);return this},insertCheckboxes:function(){llamadas.push('chk');return this},setValues:function(v){llamadas.push('v:'+JSON.stringify(v));return this}}),},7,datos);
t(llamadas.join(' ')==='fmt:0 chk v:[[true],[false]]','casilla: formato 0, casilla de verdad y valores booleanos: '+llamadas.join(' '));
llamadas.length=0;
// 2) reparacion unica
const n=vm.runInContext('canpReparaCasillas_()',ctx);
t(n===2&&filas[0][2]===true&&filas[1][2]===true,'marca las 2 ventas de 13:40: '+n);
t(filas[2][2]===false&&filas[3][2]===false,'no toca otras filas ni canceladas');
t(vm.runInContext('canpReparaCasillas_()',ctx)===0,'solo una vez');
console.log('t55: '+ok+' ok, '+bad+' fallas');process.exit(bad?1:0);
