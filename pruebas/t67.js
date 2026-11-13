// t67: correo agrupado "Cancelacion por Solicitud del Cte": cruza pedidos contra la hoja y avisa los que faltan; origen FRAUDE.
const fs=require('fs'),vm=require('vm'),path=require('path');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const C=fs.readFileSync(path.join(__dirname,'..','apps-script','Cancelaciones.gs'),'utf8').replace(/\r\n/g,'\n');
const avisos=[];
const ctx={console,JSON,String,Object,Array,CAN_ETAPA:'CANCELACIONES',normEnc_:s=>String(s).toUpperCase().replace(/[^A-Z0-9]/g,''),
 avisoDia_:(k,n,e,m)=>avisos.push({k,n,m}),
 canMapaHoja_:()=>({mapa:{PEDIDO:1}})};
vm.createContext(ctx);
vm.runInContext(C.slice(C.indexOf('function canAvisarAgrupados_'),C.indexOf('function canMensajeError_')),ctx);
const hoja=(vals)=>({getLastRow:()=>vals.length+1,getRange:()=>({getValues:()=>vals.map(v=>[v])})});
const msg=(cuerpo)=>({msg:{getPlainBody:()=>cuerpo}});
// ambos pedidos ya estan (uno con sufijo): no avisa
let n=ctx.canAvisarAgrupados_(hoja(['600000137199022-1','600000136570538']),[msg('Pedidos: 600000137199022 y 600000136570538')]);
t(n===0&&!avisos.length,'pedidos ya en la hoja: no avisa');
// uno falta: avisa una vez aunque salga en dos correos
n=ctx.canAvisarAgrupados_(hoja(['600000137199022']),[msg('600000137199022 / 600000136570538'),msg('otra vez 600000136570538')]);
t(n===1&&avisos.length===1&&/600000136570538/.test(avisos[0].m)&&avisos[0].n==='WARN','pedido que falta: un aviso: '+JSON.stringify(avisos));
t(ctx.canAvisarAgrupados_(hoja([]),[msg('x')])===0,'sin agrupados/hoja vacia: 0');
t(/CAN_ORI_FRAUDE = 'FRAUDE'/.test(C)&&/\[CAN_ORI_FRAUDE, '#d5a6bd'/.test(C),'origen FRAUDE y su color existen');
t(/\^\\s\*cancelaci\[oó\]n por solicitud del cte/.test(C)&&/canAvisarAgrupados_\(h, r\.agrup\)/.test(C),'se junta el agrupado y se cruza en canLeer_');
console.log('t67: '+ok+' ok, '+bad+' fallas');process.exit(bad?1:0);
