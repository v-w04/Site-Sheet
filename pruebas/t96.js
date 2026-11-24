// t96: Reporte (20-nov): pedidos en "Nuevo" en Walmart con mas de 1 dia, con guia (confirmar envio) o sin guia. Nada real.
const fs=require('fs'),vm=require('vm');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const src=fs.readFileSync(__dirname+'/../apps-script/Reporte.gs','utf8');
const ini=src.indexOf('function rpSinEnviar_'),fin=src.indexOf('/* ---------- lectura y escritura');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,RegExp};vm.createContext(ctx);
vm.runInContext('function rpTxt_(v){return String(v===null||v===undefined?"":v).trim();}function rpMs_(v){if(v instanceof Date)return v.getTime();var m=/^(\\d{4})-(\\d{2})-(\\d{2})/.exec(String(v||""));return m?new Date(+m[1],m[2]-1,+m[3]).getTime():null;}'+src.slice(ini,fin),ctx);
const iso=ms=>{const d=new Date(ms);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const c={hoy:'2026-11-20',iso};
const AH=new Date();const sc=[{'PEDIDO':'600000999999999','FECHA PEDIDO':'2026-11-10','ESTADO SELLER CENTER':'Nuevo','ACTUALIZADO':new Date(Date.now()-30*3600000)},{'PEDIDO':'600000134500137','FECHA PEDIDO':'2026-11-16','ESTADO SELLER CENTER':'Nuevo','ACTUALIZADO':AH},
 {'PEDIDO':'600000136739754','FECHA PEDIDO':'2026-11-17','ESTADO SELLER CENTER':'Nuevo','ACTUALIZADO':AH},
 {'PEDIDO':'600000140574414','FECHA PEDIDO':'2026-11-20','ESTADO SELLER CENTER':'Nuevo'},
 {'PEDIDO':'600000111111111','FECHA PEDIDO':'2026-11-15','ESTADO SELLER CENTER':'Enviado'},
 {'PEDIDO':'600000134500137','FECHA PEDIDO':'2026-11-16','ESTADO SELLER CENTER':'Nuevo'}];
const paq=[{'ORDEN WALMART (6000)':"'600000134500137",'GUIA':"'MXFDDWM23014156"}];
const r=ctx.rpSinEnviar_(sc,paq,c);
t(r.todos.length===2,'solo Nuevo con mas de 1 dia, leido en las ultimas 6 h, sin repetir (los de hoy, los Enviado y las filas viejas no)');
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
const ini3=src.indexOf('var RP_SM_DIAS'),fin3=src.indexOf('/**\n * Pura. Pedidos de Seller Center');
vm.runInContext(src.slice(ini3,fin3),ctx);
const D=n=>new Date(Date.now()-n*86400000-60000);
const AHORA=Date.UTC(2026,10,24,18,0);   // martes 24-nov-2026 12:00 CDMX
const E=(d,h)=>new Date(Date.UTC(2026,10,d,h+6,0));   // evento el dia d de nov a la hora h CDMX
const sm=ctx.rpSinMovimiento_([{'GUIA':"'G1",'CODIGO EVENTO':'108','FECHA EVENTO':E(19,10)},{'GUIA':'G2','CODIGO EVENTO':'108','FECHA EVENTO':E(23,16)},{'GUIA':'G3','CODIGO EVENTO':'210','FECHA EVENTO':E(18,10),'ULTIMO EVENTO':'En estacion'},{'GUIA':'G4','CODIGO EVENTO':'210','FECHA EVENTO':E(23,10)},{'GUIA':'G5','CODIGO EVENTO':'210','FECHA EVENTO':E(10,10),'ESTADO FINAL':'ENTREGADO'},{'GUIA':'G6','CODIGO EVENTO':'108','FECHA EVENTO':E(20,18)}],AHORA);
t(sm.nunca.length===1&&sm.nunca[0].guia==='G1'&&sm.nunca[0].dias===2&&sm.paradas.length===1&&sm.paradas[0].guia==='G3'&&sm.paradas[0].dias===3,'sin movimiento: dias HABILES (jue 19 -> 2, mie 18 -> 3); lo de viernes en la tarde (G6) y lo de ayer no; las finales no');
t(ctx.rpDiasHab_(E(20,18).getTime(),Date.UTC(2026,10,23,14,0))===0&&ctx.rpDiasHab_(E(20,18).getTime(),Date.UTC(2026,10,24,14,0))===1&&ctx.rpDiasHab_(E(21,10).getTime(),Date.UTC(2026,10,23,14,0))===0,'fin de semana no cuenta: viernes tarde -> lunes 0 dias, martes 1');
t(/add\('RASTREO', '¿Guías sin movimiento\?'/.test(src)&&/'RECOLECCION', 'RASTREO', 'VENTAS'/.test(src),'fila en el Reporte (area RASTREO)');
// 24-nov: paquetes pendientes de recoger (108 sin Fecha recoleccion), por dia; 2+ dias = atrasados
const prr=ctx.rpPendRecoger_([{'GUIA':"'P1",'PAQUETERIA':'PAQUETERIA DEDICADA WALMART','CODIGO EVENTO':'108','FECHA EVENTO':E(19,10)},{'GUIA':'P2','PAQUETERIA':'PAQUETERIA DEDICADA WALMART','CODIGO EVENTO':'108','FECHA EVENTO':E(19,12)},{'GUIA':'P3','PAQUETERIA':'BIGSMART','CODIGO EVENTO':'108','FECHA EVENTO':E(23,16)},{'GUIA':'P4','PAQUETERIA':'PAQUETERIA DEDICADA WALMART','CODIGO EVENTO':'108','FECHA EVENTO':E(19,10),'FECHA RECOLECCION':E(20,15)},{'GUIA':'P5','PAQUETERIA':'FEDEX','CODIGO EVENTO':'108','FECHA EVENTO':E(19,10)},{'GUIA':'P6','PAQUETERIA':'PAQUETERIA DEDICADA WALMART','CODIGO EVENTO':'210','FECHA EVENTO':E(19,10)},{'GUIA':'P7','PAQUETERIA':'PAQUETERIA DEDICADA WALMART','CODIGO EVENTO':'108','FECHA EVENTO':E(19,10),'ESTADO FINAL':'ENTREGADO'},{'GUIA':'P8','PAQUETERIA':'PAQUETERIA DEDICADA WALMART','CODIGO EVENTO':'108','FECHA EVENTO':E(20,18)}],AHORA,{iso:ms=>new Date(ms-6*3600000).toISOString().slice(0,10)});
t(prr.total===4&&prr.atrasados===2&&prr.dias.length===3&&prr.lista.join()==='P1,P2','pendientes de recoger: solo 108 de la Paqueteria Dedicada sin recoleccion ni final; atrasados = 2+ dias habiles (P8 del viernes en la tarde no); por dia');
t(/add\('RECOLECCION', '¿Paquetes pendientes de recoger\?'/.test(src),'fila en el Reporte (area RECOLECCION)');
const prc=ctx.rpPendRecoger_([{'GUIA':'C1','PAQUETERIA':'PAQUETERIA DEDICADA WALMART','CODIGO EVENTO':'108','FECHA EVENTO':E(19,10),'ORDEN DE COMPRA':'609132397737970'},{'GUIA':'C2','PAQUETERIA':'PAQUETERIA DEDICADA WALMART','CODIGO EVENTO':'108','FECHA EVENTO':E(19,10),'ORDEN DE COMPRA':'609132598209127'},{'GUIA':'C3','PAQUETERIA':'PAQUETERIA DEDICADA WALMART','CODIGO EVENTO':'108','FECHA EVENTO':E(23,10),'ORDEN DE COMPRA':'609111111111111'}],AHORA,{iso:ms=>new Date(ms-6*3600000).toISOString().slice(0,10)},{'609132397737970':1});
t(prc.total===2&&prc.atrasados===1&&prc.lista.join()==='609132598209127'&&prc.canceladas.join()==='609132397737970','canceladas fuera de pendientes; la lista trae el numero 609');
console.log('t96',ok,'ok',bad,'fallas');if(bad)process.exit(1);
