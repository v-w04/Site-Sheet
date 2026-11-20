// t95: API propia de rastreo (RastreoAPI.gs, 20-nov): rutas, filtros, salud, eventos y que solo LEE. Nada real.
const fs=require('fs'),vm=require('vm');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const src=fs.readFileSync(__dirname+'/../apps-script/RastreoAPI.gs','utf8');
const enc=['Guia','Paqueteria','Orden de compra (609)','Estatus real','Estado final','Fecha consulta','Nota','Consultas','Historial'];
const ahora=Date.now(), hace=m=>new Date(ahora-m*60000);
const filas=[
 ["'MXFDDWM1",'PAQUETERIA DEDICADA WALMART',"'609000000000001",'En camino','',hace(20),'','3',JSON.stringify([{cod:'210',txt:'En estacion',fecha:'19 nov 2026, 06:56 p.m.',lugar:'Tepotzotlan'},{cod:'101',txt:'Creacion',fecha:'15 nov',lugar:''}])],
 ["'MXFDDWM2",'PAQUETERIA DEDICADA WALMART','','Entregado','ENTREGADO',hace(60),'','5',''],
 ["'545284634491",'FEDEX','','En camino','',hace(500),'REVISAR A MANO (2 seguidas): x','2',''],
 ["'MXFDDWM3",'PAQUETERIA DEDICADA WALMART','','Robado','ROBADO',hace(90),'','4','']];
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,RegExp,RQ_HOJA:'PAQUETERIA',RQ_DIAS:14,RQ_CADA_H:3,
  peTabla_:()=>({filas,pos:{}}),peCol_:(tb,n)=>enc.indexOf(n[0])};
vm.createContext(ctx);vm.runInContext(src,ctx);
// rutas
t(JSON.stringify(ctx.rqaRuta_('/v1/health'))==='{"accion":"v1_health"}'&&ctx.rqaRuta_('v1/trackings').accion==='v1_trackings','rutas health y trackings');
t(ctx.rqaRuta_('v1/trackings/MXFDDWM1').guia==='MXFDDWM1'&&ctx.rqaRuta_('v1/trackings/MXFDDWM1/events').accion==='v1_events','rutas de una guia');
t(ctx.rqaRuta_('')===null&&ctx.rqaRuta_('v1/x').accion==='v1_desconocida'&&ctx.rqaRuta_('v1/trackings/a;b').accion==='v1_desconocida','sin ruta = flujo normal; ruta rara = desconocida');
// lista y filtros
let r=ctx.rqaAtender_('v1_trackings',{});t(r.ok&&r.total===4&&r.trackings[0].guia==='MXFDDWM1'&&r.trackings[0].orden_compra==='609000000000001'&&r.trackings[0].consultas===3,'lista completa');
t(ctx.rqaAtender_('v1_trackings',{estado:'en_curso'}).total===2&&ctx.rqaAtender_('v1_trackings',{estado:'final'}).total===2&&ctx.rqaAtender_('v1_trackings',{estado:'robado'}).total===1,'filtro por estado');
t(ctx.rqaAtender_('v1_trackings',{paq:'fedex'}).total===1&&ctx.rqaAtender_('v1_trackings',{limite:1}).total===1,'filtro por paqueteria y limite');
// detalle y eventos
r=ctx.rqaAtender_('v1_tracking',{guia:'mxfddwm1'});t(r.ok&&r.tracking.eventos.length===2&&r.tracking.eventos[0].codigo==='210'&&r.tracking.en_curso===true,'detalle con eventos');
r=ctx.rqaAtender_('v1_events',{guia:'MXFDDWM2'});t(r.ok&&r.total===0&&/sin historial/.test(r.nota),'sin historial guardado: lo dice');
t(ctx.rqaAtender_('v1_tracking',{guia:'NOEXISTE1'}).ok===false&&ctx.rqaAtender_('v1_tracking',{}).error==='falta guia','guia no encontrada / falta guia');
// salud
r=ctx.rqaAtender_('v1_health',{});t(r.ok&&r.en_curso===2&&r.finales.ENTREGADO===1&&r.finales.ROBADO===1&&r.revisar_a_mano===1&&r.atrasadas===1&&r.al_dia===false&&r.minutos_desde_ultima_lectura===20,'salud: '+JSON.stringify(r));
// solo lectura y conectado al Web App con sesion
const sin=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
t(!/setValue|setValues|UrlFetchApp|appendRow|deleteRow|clear\(/.test(sin),'la API solo lee');
const w=fs.readFileSync(__dirname+'/../apps-script/WebAPI.gs','utf8');
t(w.indexOf("validateSession_(p.token)")<w.indexOf("rqaAtender_(accion, p)")&&/rqaRuta_\(e && e\.pathInfo\)/.test(w),'la API va despues del portero (token de sesion)');
const rq=fs.readFileSync(__dirname+'/../apps-script/Rastreo.gs','utf8');
t(/'Nota', 'Historial'\]/.test(rq)&&/poner\(i, 'Historial', JSON\.stringify\(hist\)\)/.test(rq),'el rastreo guarda el historial completo');
console.log('t95',ok,'ok',bad,'fallas');if(bad)process.exit(1);
