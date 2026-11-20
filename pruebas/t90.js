// t90: Rastreo.gs (19-nov): hoja PAQUETERIA, que guias tocan, como se clasifica y que se escribe. Nada real.
const fs=require('fs'),vm=require('vm');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,RegExp};vm.createContext(ctx);
const logs=[];['Info','Ok','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m,d)=>logs.push([k,m]));ctx.flushLog_=()=>{};
const alertas=[];ctx.extAlertaFija_=(k,x)=>alertas.push([k,x]);ctx.avisoLogDia_=(a,b,c,d)=>logs.push(['AV',d]);
let auth=null;ctx.csAutorizar_=()=>auth;
ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
ctx.normEnc_=x=>String(x).toUpperCase().trim();ctx.prDigitos_=s=>String(s==null?'':s).replace(/\D/g,'');ctx.VH_HOJA='Ventas Walmart';
// libro simulado: {nombre: [encabezados, ...filas]}
const libro={};
const hoja=n=>({getRange:(r,c)=>({setValue:v=>{const f=libro[n];while(f.length<r)f.push([]);f[r-1][c-1]=v;}})});
ctx.peHojaAsegurar_=(n,enc)=>{if(!libro[n])libro[n]=[enc.slice()];enc.forEach(e=>{if(libro[n][0].map(ctx.normEnc_).indexOf(ctx.normEnc_(e))<0)libro[n][0].push(e)});return hoja(n);};
ctx.peTabla_=n=>{const d=libro[n];if(!d)return null;const pos={};d[0].forEach((x,i)=>{const k=ctx.normEnc_(x);if(pos[k]===undefined)pos[k]=i});return{enc:d[0],pos,filas:d.slice(1).map(f=>d[0].map((_,i)=>f[i]===undefined?'':f[i]))};};
ctx.peCol_=(tb,ns)=>{for(const n of ns){const j=tb.pos[ctx.normEnc_(n)];if(j!==undefined)return j}return -1};
ctx.peAgregar_=(h,enc,filas)=>{const n='PAQUETERIA';const e=libro[n][0];filas.forEach(o=>libro[n].push(e.map(x=>o[x]===undefined?'':o[x])));};
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/Rastreo.gs','utf8'),ctx);
const R=s=>vm.runInContext(s,ctx);
// 1) paqueteria por formato
t(ctx.rqPaqDe_('MXFDDWM22301991')==='BIGSMART'&&ctx.rqPaqDe_('545284634491')==='FEDEX'&&ctx.rqPaqDe_('iMileWM22094361')===''&&ctx.rqPaqDe_('')==='','paqueteria por formato (iMile y otras no se consultan)');
t(JSON.stringify(ctx.rqGuias_('MXFDDWM1, MXFDDWM2'))==='["MXFDDWM1","MXFDDWM2"]'&&JSON.stringify(ctx.rqGuias_(519750918399))==='["519750918399"]'&&JSON.stringify(ctx.rqGuias_('519750918399.0'))==='["519750918399"]','varias guias en una celda / numero de Sheets');
// 2) clasificacion BigSmart: decide el CODIGO del ultimo evento (el primero de la lista)
const BS=(evs,res)=>ctx.rqClasificar_({paq:'BIGSMART',eventos:evs.map(([cod,txt])=>({cod,txt,fecha:'13 nov 2026, 06:18 p.m.'})),resumen:res||''});
let c=BS([['360','Entregado'],['303','Tu Paquete siguiente por entregar'],['101','Creación del TN']]);
t(c.final==='ENTREGADO'&&c.codigo==='360'&&c.estatus==='Entregado'&&c.codigos==='360 303 101','360 = ENTREGADO (caso MXFDDWM22301991)');
c=BS([['212','Robado'],['219','Orden preasignada LHE'],['106','Entre estaciones']],'Detenido sin movimiento');t(c.final==='ROBADO','212 = ROBADO (caso MXFDDWM22347469)');
c=BS([['220','Cancelado de última milla'],['108','Listo para ser recolectado']],'Detenido sin movimiento');t(c.final==='CANCELADO CLIENTE','220 = CANCELADO CLIENTE (caso MXFDDWM21367618)');
c=BS([['107','En camino entre Estaciones']]);t(c.final===''&&c.estatus==='En camino','107 en curso: se sigue buscando');
c=BS([['200','Paquete recibido en estacion (Sort-delivery)']]);t(c.final==='','200 en curso');
c=BS([['303','Tu Paquete siguiente por entregar']]);t(c.final==='','"por entregar" NO es entregado');
c=BS([['207','En espera de ser reenviado'],['206','Paquete de vuelta a la estacion (excepción de entrega)']]);t(c.final===''&&!c.nuevo,'206/207 (excepcion de entrega, reenvio): conocidos y se sigue buscando');
c=BS([['415','Intento de entrega fallido']]);t(c.final===''&&c.nuevo===true,'codigo nuevo sin palabra final: se sigue buscando y se marca nuevo');
c=BS([['450','Paquete extraviado']]);t(c.final==='PERDIDO'&&c.nuevo,'codigo nuevo que dice extraviado: PERDIDO');
c=BS([['470','Devolución al remitente']]);t(c.final==='DEVUELTO','codigo nuevo de devolucion: DEVUELTO');
c=BS([['212','Robado']].concat([]));t(c.final==='ROBADO','robado');
// "Detenido sin movimiento" del resumen NO decide por si solo
c=BS([['219','Orden preasignada LHE']],'Detenido sin movimiento');t(c.final==='','el resumen "Detenido sin movimiento" no decide: decide el codigo');
// 3) FedEx: decide el texto del ULTIMO evento (el ultimo de la lista)
const FX=evs=>ctx.rqClasificar_({paq:'FEDEX',eventos:evs.map(x=>({cod:'',txt:x,fecha:'11/18/26 6:57 PM'})),resumen:'On the way'});
c=FX(['Shipment information sent to FedEx','Picked up','Departed FedEx hub']);t(c.final===''&&c.evento==='Departed FedEx hub','FedEx en camino: ultimo evento = el de abajo');
c=FX(['Picked up','On FedEx vehicle for delivery','Delivered']);t(c.final==='ENTREGADO','FedEx Delivered');
c=FX(['Picked up','Out for delivery']);t(c.final==='','Out for delivery NO es entregado');
c=FX(['Picked up','Returning package to shipper']);t(c.final==='DEVUELTO','FedEx devolucion');
c=FX(['Picked up','Delivery exception','Package not delivered']);t(c.final==='','no entregado: sigue');
t(ctx.rqClasificar_({paq:'FEDEX',eventos:[],resumen:'Delivered'}).final==='ENTREGADO','sin historial: decide el resumen');
// 4) cuando toca consultar
const ah=Date.now();
t(ctx.rqToca_({final:'',paq:'BIGSMART',consulta:0},ah)&&!ctx.rqToca_({final:'ENTREGADO',paq:'BIGSMART',consulta:0},ah)&&!ctx.rqToca_({final:'',paq:'',consulta:0},ah),'sin final y paqueteria conocida');
t(!ctx.rqToca_({final:'',paq:'FEDEX',consulta:ah-3600000},ah)&&ctx.rqToca_({final:'',paq:'FEDEX',consulta:ah-3*3600000-1},ah),'cada 3 horas');
// 5) sincronizar desde Ventas Walmart: solo ultimos 14 dias
const dias=n=>new Date(Date.now()-n*86400000);
libro['Ventas Walmart']=[['FOLIO','REFERENCIA','FECHA','ENVIO GUIA','OTRA'],
 [609001,600001,dias(1),'MXFDDWM00000001','x'],
 [609002,600002,dias(2),'545284634491','x'],
 [609003,600003,dias(3),'MXFDDWM00000003, MXFDDWM00000004','x'],
 [609004,600004,dias(20),'MXFDDWM00000020','x'],   // vieja: no entra
 [609005,600005,dias(1),'iMileWM22094361','x'],     // otra paqueteria: entra sin consultarse
 [609006,600006,dias(1),'','x']];
let r=R('rqLista_')({clave:'k'});
const P=()=>ctx.peTabla_('PAQUETERIA');
t(P().filas.length===5,'agrega 5 guias (14 dias, varias por celda, iMile como desconocida; la de 20 dias no): '+P().filas.length);
t(r.ok&&r.guias.length===4&&r.guias.every(g=>g.paq==='BIGSMART'||g.paq==='FEDEX'),'lista: 4 por consultar (iMile no): '+JSON.stringify(r.guias));
const fila=g=>{const tb=P();const i=tb.filas.findIndex(f=>String(f[tb.pos['GUIA']]).replace(/^'/,'')===g);return {i,f:tb.filas[i],c:k=>tb.filas[i][tb.pos[ctx.normEnc_(k)]]};};
t(fila('iMileWM22094361').c('Paqueteria')==='PAQUETERIA DESCONOCIDA'&&fila('MXFDDWM00000001').c('Orden de compra (609)')==="'609001"&&fila('MXFDDWM00000001').c('Orden Walmart (6000)')==="'600001",'guarda orden 609 y 6000 como texto');
r=R('rqLista_')({clave:'k'});t(P().filas.length===5,'no duplica guias');
// 6) resultados
auth={ok:false,error:'no_autorizado'};t(R('rqResultado_')({resultados:[{guia:'MXFDDWM00000001'}]}).error==='no_autorizado','sin clave no escribe');auth=null;
logs.length=0;alertas.length=0;
r=R('rqResultado_')({clave:'k',resultados:[
 {guia:'MXFDDWM00000001',paq:'BIGSMART',ok:true,eventos:[{cod:'212',txt:'Robado',fecha:'16 nov 2026, 12:35 p.m.'},{cod:'107',txt:'En camino entre Estaciones'}]},
 {guia:'545284634491',paq:'FEDEX',ok:true,resumen:'On the way',eventos:[{txt:'Picked up'},{txt:'Departed FedEx hub',fecha:'11/18/26 6:57 PM'}]},
 {guia:'MXFDDWM00000003',paq:'BIGSMART',ok:true,eventos:[{cod:'360',txt:'Entregado'}]},
 {guia:'MXFDDWM00000004',paq:'BIGSMART',ok:false,cf:true},
 {guia:'NOEXISTE',paq:'BIGSMART',ok:true,eventos:[{cod:'360',txt:'Entregado'}]}]});
t(r.ok&&r.escritas===4&&r.finales===1,'escribe 4 (la que no esta en la hoja se ignora), 1 final para caso: '+JSON.stringify(r));
let a=fila('MXFDDWM00000001');t(a.c('Estado final')==='ROBADO'&&/no tiene movimiento/.test(a.c('Accion sugerida'))&&a.c('Codigo evento')==="'212"&&a.c('Estatus real')==='Robado'&&a.c('Fecha estado final') instanceof Date&&a.c('Consultas')===1,'robado: estado final, accion, codigo, fecha');
t(alertas.some(x=>x[0]==='rq-final-ROBADO'&&/^1 guia\(s\) ROBADO: ve PAQUETERIA/.test(x[1])&&x[1].length<70)&&logs.some(l=>l[0]==='Warn'&&/ROBADO/.test(l[1])&&/609001/.test(l[1])),'robado: alerta roja CORTA (un renglon) y el detalle en el Log');
a=fila('545284634491');t(a.c('Estado final')===''&&a.c('Estatus real')==='En camino'&&a.c('Ultimo evento')==='Departed FedEx hub'&&a.c('Fecha consulta') instanceof Date,'FedEx en camino: se escribe y sigue');
a=fila('MXFDDWM00000003');t(a.c('Estado final')==='ENTREGADO'&&!alertas.some(x=>x[0]==='rq-MXFDDWM00000003'),'entregado: final sin alerta');
a=fila('MXFDDWM00000004');t(/^REVISAR A MANO/.test(a.c('Nota'))&&a.c('Estado final')===''&&alertas.some(x=>x[0]==='rq-revisar')&&logs.some(l=>l[0]==='Err'),'verificacion "eres humano": REVISAR A MANO + alerta roja, no se da por final');
// 7) lo que ya termino no se vuelve a consultar ni a escribir
r=R('rqLista_')({clave:'k'});
t(!r.guias.some(g=>['MXFDDWM00000001','MXFDDWM00000003'].includes(g.guia)),'las finales ya no se piden');
t(!r.guias.some(g=>g.guia==='545284634491'),'la consultada hace un momento espera 3 h');
R('rqResultado_')({clave:'k',resultados:[{guia:'MXFDDWM00000001',paq:'BIGSMART',ok:true,eventos:[{cod:'360',txt:'Entregado'}]}]});
t(fila('MXFDDWM00000001').c('Estado final')==='ROBADO','una final no se sobreescribe');
// 8) codigo nuevo: aviso y sigue
logs.length=0;
const tb=P();tb.filas.forEach((f,i)=>{});libro['PAQUETERIA'][fila('545284634491').i+1][P().pos['FECHA CONSULTA']]='';
R('rqResultado_')({clave:'k',resultados:[{guia:'545284634491',paq:'BIGSMART',ok:true,eventos:[{cod:'415',txt:'Intento de entrega fallido'}]}]});
a=fila('545284634491');t(/^CODIGO NUEVO 415/.test(a.c('Nota'))&&a.c('Estado final')===''&&logs.some(l=>l[0]==='AV'&&/codigo nuevo 415/.test(l[1])),'codigo nuevo: nota, aviso una vez al dia, sigue buscandose');
// 9) mas de 14 dias sin final: deja de buscarse
libro['PAQUETERIA'][fila('545284634491').i+1][P().pos['FECHA VENTA']]=dias(15);
R('rqLista_')({clave:'k'});t(fila('545284634491').c('Estado final')==='SIN FINAL EN 14 DIAS'&&/a mano/.test(fila('545284634491').c('Accion sugerida')),'14 dias sin final: deja de buscarse y se marca para revisar');
// 10) el modulo no cancela ni llama a nadie
const src=fs.readFileSync(__dirname+'/../apps-script/Rastreo.gs','utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
t(!/UrlFetchApp|cancelar|odooExecute|update_orders|bigsmart\.mx|fedex\.com/i.test(src.replace(/cancelar en Odoo \(tú\)/,'')),'el Sheet no llama a ninguna pagina ni cancela nada');
t(/rastreo_lista[\s\S]{0,60}rqLista_/.test(fs.readFileSync(__dirname+'/../apps-script/WebAPI.gs','utf8'))&&/rastreo_resultado[\s\S]{0,60}rqResultado_/.test(fs.readFileSync(__dirname+'/../apps-script/WebAPI.gs','utf8')),'acciones del Web App conectadas');
// 11) fechas de la paqueteria, hora de recoleccion y estatus en Ventas Walmart (tiempo real)
const f1=ctx.rqFecha_('18 nov 2026, 12:16 p.m.');t(f1&&f1.getFullYear()===2026&&f1.getMonth()===10&&f1.getDate()===18&&f1.getHours()===12&&f1.getMinutes()===16,'BigSmart "18 nov 2026, 12:16 p.m."');
const f2=ctx.rqFecha_('13 nov 2026, 06:18 p.m.');t(f2&&f2.getHours()===18,'p.m. suma 12');
const f3=ctx.rqFecha_('11/17/26 5:44 PM');t(f3&&f3.getMonth()===10&&f3.getDate()===17&&f3.getHours()===17&&f3.getMinutes()===44,'FedEx "11/17/26 5:44 PM"');
t(ctx.rqFecha_('')===null&&ctx.rqFecha_('sin fecha')===null,'sin fecha: null');
c=ctx.rqClasificar_({paq:'BIGSMART',eventos:[{cod:'207',txt:'En espera',fecha:'18 nov 2026, 08:49 p.m.'},{cod:'302',txt:'Paquete en ruta',fecha:'18 nov 2026, 12:16 p.m.'},{cod:'301',txt:'Escaneado driver',fecha:'18 nov 2026, 12:16 p.m.'},{cod:'108',txt:'Listo para ser recolectado',fecha:'17 nov 2026, 03:45 p.m.'},{cod:'101',txt:'Creacion',fecha:'17 nov 2026, 03:45 p.m.'}]});
t(c.recoleccion==='18 nov 2026, 12:16 p.m.','recoleccion BigSmart = primer evento despues de 101/108 (MXFDDWM23124071)');
c=ctx.rqClasificar_({paq:'BIGSMART',eventos:[{cod:'108',txt:'Listo para ser recolectado',fecha:'18 nov'},{cod:'101',txt:'Creacion',fecha:'18 nov'}]});t(c.recoleccion==='','sin recolectar todavia');
c=ctx.rqClasificar_({paq:'FEDEX',eventos:[{txt:'Shipment information sent to FedEx',fecha:'11/15/26 1:22 PM'},{txt:'Picked up',fecha:'11/17/26 5:44 PM'},{txt:'Departed FedEx hub',fecha:'11/18/26 6:57 PM'}]});t(c.recoleccion==='11/17/26 5:44 PM','recoleccion FedEx = Picked up');
// Ventas Walmart simulada
libro['Ventas Walmart']=[['FOLIO','REFERENCIA','FECHA','ENVIO GUIA','OTRA'],[609101,600101,dias(1),'MXFDDWM00000101','x'],[609102,600102,dias(1),'MXFDDWM00000102, MXFDDWM00000103','x']];
const vw={getLastRow:()=>libro['Ventas Walmart'].length,getRange:(r,c,n)=>({getValues:()=>libro['Ventas Walmart'].slice(r-1,r-1+(n||1)).map(f=>[f[c-1]]),setValue:v=>{const f=libro['Ventas Walmart'];while(f[r-1].length<c)f[r-1].push('');f[r-1][c-1]=v;}})};
ctx.vdHoja_=n=>vw;
ctx.ubicarColumnas_=(h,enc)=>{const e=libro['Ventas Walmart'][0];const col={};enc.forEach(x=>{let j=e.map(ctx.normEnc_).indexOf(ctx.normEnc_(x));if(j<0){e.push(x);j=e.length-1}col[ctx.normEnc_(x)]=j+1});e.forEach((x,j)=>{if(col[ctx.normEnc_(x)]===undefined)col[ctx.normEnc_(x)]=j+1});return{col}};
ctx.escrCol_=(m,e)=>m.col[ctx.normEnc_(e)]||0;
R('rqLista_')({clave:'k'});
logs.length=0;
R('rqResultado_')({clave:'k',resultados:[{guia:'MXFDDWM00000101',paq:'BIGSMART',ok:true,eventos:[{cod:'302',txt:'Paquete en ruta',fecha:'19 nov 2026, 12:16 p.m.'},{cod:'301',txt:'Escaneado',fecha:'19 nov 2026, 12:16 p.m.'},{cod:'108',txt:'Listo'}]},
  {guia:'MXFDDWM00000103',paq:'BIGSMART',ok:true,eventos:[{cod:'360',txt:'Entregado',fecha:'19 nov 2026, 06:00 p.m.'},{cod:'103',txt:'Recolectado en el FC',fecha:'19 nov 2026, 01:00 p.m.'}]}]});
const V=libro['Ventas Walmart'],ve=V[0],vc=k=>ve.indexOf(k);
t(vc('PAQ ESTATUS')>4&&vc('PAQ CONSULTADO')>4,'columnas PAQ al final de Ventas Walmart (no mueve las del site)');
t(V[1][vc('PAQ ESTATUS')]==='En camino'&&V[1][vc('PAQ ULTIMO EVENTO')]==='Paquete en ruta'&&V[1][vc('PAQ RECOLECCION')] instanceof Date&&V[1][vc('PAQ RECOLECCION')].getHours()===12&&V[1][vc('PAQ ESTADO FINAL')]==='','venta 1: estatus, ultimo evento y hora de recoleccion en tiempo real');
t(V[2][vc('PAQ ESTATUS')]==='MXFDDWM00000103: Entregado'&&V[2][vc('PAQ ESTADO FINAL')]==='MXFDDWM00000103: ENTREGADO','venta con 2 guias: dice de que guia es');
t(V[1][vc('OTRA')]==='x'&&V[1][0]===609101,'no toca las columnas del site');
t(fila('MXFDDWM00000101').c('Fecha recoleccion') instanceof Date,'PAQUETERIA guarda la hora de recoleccion');
t(!logs.some(l=>/No pude poner el estatus/.test(l[1])),'sin errores al escribir en Ventas Walmart');
console.log('t90: '+ok+' ok'+(bad?', '+bad+' FALLA':''));process.exit(bad?1:0);
