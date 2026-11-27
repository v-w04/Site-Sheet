// t117: comandos del Sheet dentro de la extension (1.11.5). Usa la puerta del bot (bot_menu / bot_ejecutar / bot_estado) con SHEET SIMULADO.
const fs=require('fs'),vm=require('vm');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const bg=fs.readFileSync(__dirname+'/../extension-cookie/background.js','utf8');
const ini=bg.indexOf('// ---- Comandos del Sheet'),fin=bg.indexOf('// 25-nov (ella: la Dell duerme');
t(ini>0&&fin>ini,'bloque de comandos presente');
const blk=bg.slice(ini,fin);
function montar(sheet,cfg){
  const store=Object.assign({},cfg===undefined?{url:'https://script.google.com/macros/s/X/exec',clave:'K'}:cfg);const llamadas=[];
  const ctx={console,Date,Promise,Array,Object,String,Math,RegExp,
    URL_DEFECTO:'',URL_OK:/^https:\/\/script\.google\.com\//,esperar:()=>Promise.resolve(),
    chrome:{storage:{local:{get:async k=>{const o={};(Array.isArray(k)?k:[k]).forEach(x=>{if(x in store)o[x]=store[x]});return o},set:async o=>{Object.assign(store,o)}}}},
    llamarSheet:async(u,c)=>{llamadas.push(c);return sheet(c)}};
  vm.createContext(ctx);vm.runInContext(blk+';globalThis.cmdEjecutar=cmdEjecutar;globalThis.cmdMenuPedir=cmdMenuPedir;',ctx);
  return {ctx,store,llamadas};
}
(async()=>{
  // menu: guarda solo funciones con nombre valido y manda la clave de la extension
  let m=montar(c=>c.accion==='bot_menu'?{ok:true,menu:[{fn:'a1',etiqueta:'A',sec:'',modo:'ok'},{fn:'x;rm',etiqueta:'malo',sec:'',modo:'ok'},{fn:'b2',etiqueta:'B',sec:'S',modo:'sheet'}]}:{ok:false});
  let r=await m.ctx.cmdMenuPedir();
  t(r.ok&&r.total===2&&m.store.cmdMenu.items.length===2&&m.llamadas[0].clave==='K','menu guardado, nombre invalido descartado');
  // ok: manda bot_ejecutar con confirmado:false, pregunta el estado hasta ok y deja el resultado
  let n=0;m=montar(c=>{ if(c.accion==='bot_ejecutar')return {ok:true,job:'j1'}; if(c.accion==='bot_estado'){n++;return {ok:true,job:n<3?{estado:n===1?'en_cola':'corriendo'}:{estado:'ok',seg:41,salida:'Precios 6/6'}}} });
  r=await m.ctx.cmdEjecutar('actualizarPreciosTodo',false,'Precios y killers');
  t(r.ok&&m.llamadas[0].accion==='bot_ejecutar'&&m.llamadas[0].confirmado===false&&m.llamadas[0].fn==='actualizarPreciosTodo','manda bot_ejecutar sin confirmar');
  t(m.store.estadoCmd.ok&&!m.store.estadoCmd.enCurso&&/listo en 41 s/.test(m.store.estadoCmd.texto)&&m.store.estadoCmd.salida==='Precios 6/6','resultado ok guardado');
  t(!JSON.stringify(m.llamadas).includes('password'),'no viaja ninguna credencial');
  // confirmar
  m=montar(c=>c.accion==='bot_ejecutar'?{ok:true,job:'j'}:{ok:true,job:{estado:'ok',seg:1}});
  await m.ctx.cmdEjecutar('wmAplicarFactor',true,'Factor');t(m.llamadas[0].confirmado===true,'confirmado:true solo cuando el popup lo pide');
  // el Sheet pide confirmar / es solo del Sheet / ocupado
  m=montar(c=>({ok:false,error:'falta_confirmar'}));r=await m.ctx.cmdEjecutar('wmAplicarFactor',false,'Factor');
  t(!r.ok&&/pide confirmacion/.test(m.store.estadoCmd.texto)&&!m.store.estadoCmd.ok,'falta_confirmar se explica');
  m=montar(c=>({ok:false,error:'solo_desde_el_sheet',ruta:'SITE SHEET › X'}));await m.ctx.cmdEjecutar('wfsNuevoEnvio',false,'Nuevo envio');
  t(/menu del Sheet/.test(m.store.estadoCmd.texto)&&/SITE SHEET › X/.test(m.store.estadoCmd.texto),'solo_desde_el_sheet dice donde esta');
  m=montar(c=>({ok:false,error:'ocupado'}));await m.ctx.cmdEjecutar('a1',false,'A');t(/otro comando/.test(m.store.estadoCmd.texto),'ocupado se explica');
  // necesita ventana / fallo
  m=montar(c=>c.accion==='bot_ejecutar'?{ok:true,job:'j'}:{ok:true,job:{estado:'necesita',necesita:['pide una ventana con botones']}});
  r=await m.ctx.cmdEjecutar('a1',false,'A');t(!r.ok&&!m.store.estadoCmd.ok&&/necesita el Sheet/.test(m.store.estadoCmd.texto),'necesita ventana: no se da por hecho');
  m=montar(c=>c.accion==='bot_ejecutar'?{ok:true,job:'j'}:{ok:true,job:{estado:'error',error:'boom'}});
  await m.ctx.cmdEjecutar('a1',false,'A');t(/fallo · boom/.test(m.store.estadoCmd.texto),'error del Sheet se muestra');
  // sin configuracion y nombre de funcion invalido
  m=montar(()=>({ok:true}),{});r=await m.ctx.cmdEjecutar('a1',false,'A');t(!r.ok&&m.llamadas.length===0&&/Falta la URL/.test(m.store.estadoCmd.texto),'sin config no llama al Sheet');
  m=montar(()=>({ok:true}));r=await m.ctx.cmdEjecutar('a1; drop',false,'A');t(!r.ok&&m.llamadas.length===0,'nombre invalido ni se manda');
  // solo uno a la vez
  let lib;const espera=new Promise(res=>{lib=res});
  m=montar(async c=>{if(c.accion==='bot_ejecutar')return {ok:true,job:'j'};await espera;return {ok:true,job:{estado:'ok',seg:1}}});
  const p1=m.ctx.cmdEjecutar('a1',false,'A');await new Promise(r=>setTimeout(r,20));const r2=await m.ctx.cmdEjecutar('b1',false,'B');
  t(!r2.ok&&r2.error==='ocupado','un comando a la vez en la extension');lib();await p1;
  // el mensaje esta enlazado
  t(/m\.tipo === 'cmd_ejecutar'/.test(bg)&&/m\.tipo === 'cmd_menu'/.test(bg),'mensajes cmd_menu y cmd_ejecutar enlazados');
  // popup: solo los 4 comandos que ella usa (sin lista de "todos los comandos"), y el Sheet (Bot.gs) los deja correr
  const html=fs.readFileSync(__dirname+'/../extension-cookie/popup.html','utf8'),bot=fs.readFileSync(__dirname+'/../apps-script/Bot.gs','utf8'),pj=fs.readFileSync(__dirname+'/../extension-cookie/popup.js','utf8');
  const favs=[...html.matchAll(/data-fn="(\w+)"/g)].map(x=>x[1]);t(favs.length===4,'4 comandos: '+favs.length);
  t(['actualizarPreciosTodo','orgOrdenar','wfsActualizarMenu','republicarActualizar'].every(f=>favs.includes(f)),'los 4 que ella pidio: precios y killers, ordenar hojas, WFS, Republicar');
  favs.forEach(f=>t(new RegExp('"fn": "'+f+'", "modo": "(ok|confirmar)"').test(bot),'favorito '+f+' existe en BOT_MENU y corre desde fuera (ok o confirmar)'));
  t(!/cmdsel|cmdgo|cmdcp/.test(html+pj),'sin la lista de todos los comandos (ella la quito)');
  t(/if \(cmdConfirmar\(b, normal\)\) cmdLanzar\(fn, normal, true\)/.test(pj)&&!/modo !== 'confirmar'\) return true/.test(pj),'los 4 comandos piden confirmar (ella: "ponlo a todos")');
  t(!/¿Seguro\? Otra vez/.test(pj)&&(pj.match(/Pulsa otra vez/g)||[]).length>=2,'texto claro "Pulsa otra vez" en comandos y en Subir');
  t(/ce = \(!selec && cmdUlt/.test(pj),'el resultado del comando sale en el detalle de Estado general');
  console.log('t117:',ok,'ok',bad?bad+' FALLAN':'');
  process.exit(bad?1:0);
})();
