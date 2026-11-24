// t92: recoleccion con PARCEL reales (20-nov): paquetes sin recolectar segun el rastreo; BIG ITEM 3; si no hay dato, 30 + 3.
const fs=require('fs'),vm=require('vm');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,RegExp};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/Recoleccion.gs','utf8'),ctx);
const ahora=Date.now(),hace=h=>ahora-h*3600000;
const F=(paq,final,codigo,evento,cons)=>({paq,final,codigo,evento,consulta:cons});
let r=ctx.recContarPendientes_([F('BIGSMART','','108','Listo para ser recolectado',hace(1)),F('BIGSMART','',"'101",'Creación del TN',hace(1)),F('BIGSMART','','','',0),
  F('BIGSMART','','107','En camino entre Estaciones',hace(1)),F('BIGSMART','ENTREGADO','360','Entregado',hace(1)),F('BIGSMART','CANCELADO CLIENTE','220','Cancelado',hace(1)),
  F('FEDEX','','','Shipment information sent to FedEx',hace(1)),F('PAQUETERIA DESCONOCIDA','','','',0)],ahora);
t(r.n===3&&r.fresco,'cuenta solo BigSmart sin recolectar (108, 101 y guia nueva sin consultar): '+r.n);
r=ctx.recContarPendientes_([F('BIGSMART','','108','Listo',hace(7))],ahora);t(!r.fresco,'rastreo de hace 7 h: no se confia');
// recCantidadReal_ con la hoja simulada
const enc=['Guia','Paqueteria','Estado final','Codigo evento','Ultimo evento','Fecha consulta'];
let filas=[];
ctx.peTabla_=()=>({pos:Object.fromEntries(enc.map((e,i)=>[e.toUpperCase(),i])),filas});
ctx.peCol_=(tb,ns)=>{const j=tb.pos[String(ns[0]).toUpperCase()];return j===undefined?-1:j};
filas=[];r=ctx.recCantidadReal_();t(r.cant===null&&/de siempre \(30 \+ 3\)/.test(r.nota),'sin rastreo: 30 + 3');
filas=Array.from({length:28},(_,i)=>['MXFDDWM'+i,'BIGSMART','',"'108",'Listo para ser recolectado',new Date(hace(0.5))]).concat([['MXFDDWMX','BIGSMART','ENTREGADO',"'360",'Entregado',new Date(hace(0.5))]]);
r=ctx.recCantidadReal_();t(r.cant&&r.cant.PARCEL_FLOTA===30&&r.cant.BIGITEM_FLOTA===3&&/minimo 30; hay 28/.test(r.nota),'28 pendientes: PARCEL nunca baja de 30 (queda 30) y BIG ITEM 3');
const p=ctx.recArmarPayload_('2026-11-23','',  '', r.cant);t(p.answers[ctx.REC_Q.PARCEL_FLOTA]===30&&p.answers[ctx.REC_Q.BIGITEM_FLOTA]===3,'el formulario lleva 30 y 3');
filas=filas.map(f=>{const g=f.slice();g[5]=new Date(hace(8));return g});r=ctx.recCantidadReal_();t(r.cant===null&&/no ha consultado en 6 h/.test(r.nota),'extension caida (8 h sin consultar): 30 + 3');
filas=[['MXFDDWMX','BIGSMART','ENTREGADO',"'360",'Entregado',new Date(hace(0.5))]];r=ctx.recCantidadReal_();t(r.cant===null&&/no ve paquetes pendientes/.test(r.nota),'cero pendientes: van las de siempre (no se pide 0)');
ctx.peTabla_=()=>{throw new Error('boom')};r=ctx.recCantidadReal_();t(r.cant===null&&/no pude leer/.test(r.nota),'si truena la lectura: 30 + 3, nunca se cae la recoleccion');
const src=fs.readFileSync(__dirname+'/../apps-script/Recoleccion.gs','utf8');
t(/paso === 'AUTO' \|\| paso === 'RECUPERAR' \|\| paso === 'PRUEBA'/.test(src)&&/if \(!cant &&/.test(src),'solo el envio automatico (y la prueba) usa lo real; lo que pidas a mano en el menu se respeta');
t(/'Recoleccion solicitada' \+ \(notaCant/.test(src),'el Log dice de donde salio la cantidad');
console.log('t92: '+ok+' ok'+(bad?', '+bad+' FALLA':''));process.exit(bad?1:0);
