// t98: mensaje de recoleccion para WhatsApp (RecoleccionMensaje.gs) y modulos nuevos de la extension 1.10.0. Nada real.
process.env.TZ='America/Mexico_City';
const fs=require('fs'),vm=require('vm');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,RegExp};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/RecoleccionMensaje.gs','utf8'),ctx);
const rep=ctx.recMensajeDeReporte_([{pregunta:'¿Paquetes pendientes de recoger?',respuesta:'21 pendientes · 1 atrasados (2+ días hábiles) · 1 del 19/11 · 10 del 23/11 · 10 del 24/11',accion:'Pedir a la paquetería que pase por los 1 atrasados. Órdenes: 609132598209127'},{pregunta:'¿Qué hizo la compra automática de guías?',respuesta:'enviadas hoy 26'}]);
t(rep.pend&&rep.pend.dias.length===3&&rep.pend.atrasados===1&&rep.pend.ordenes.join()==='609132598209127','lee pendientes, atrasados y orden 609 del Reporte');
const base={ts:new Date(2026,10,24,9,53),para:new Date(2026,10,25),hoy:new Date(2026,10,24,15,0),parcel:30,bigitem:3,vinos:0,estafeta:0,pend:rep.pend,tel:'5590139579',seller:'10001341690',cuenta:'Electronics.Mexico',dir:'Mayorazgo de Solis 46',cp:'03330',ref:'UStorage'};
const x=ctx.recMensajeArmar_(base);
const esperado=['Hola, buen día @~recolecciones mkp locales','','✅ Recolección solicitada','Hoy martes 24 nov, 09:53am','Recolección para: miércoles 25 nov','','📦 Paquetes: Flota Dedicada PARCEL 30 · Flota Dedicada BIG ITEM 3 · Vinos 0 · Estafeta 0','','⚠️ Pendientes de recoger: 1 atrasado del 19/nov · orden 609132598209127 · 10 del 23/nov · 10 del 24/nov','','🏢 Cuenta Electronics.Mexico · Seller ID 10001341690','Contacto: Electronics.Mexico · 5590139579','','📍 Mayorazgo de Solis 46, CP 03330, Referencia: UStorage, Horario: 12pm a 3pm','','Saludos'].join('\n');
t(x===esperado,'formato fijo igual al acordado (con pendientes, sin "Real de hoy")');
t(!/Real de hoy/.test(x),'sin bloque Real de hoy');
const y=ctx.recMensajeArmar_(Object.assign({},base,{pend:null,hoy:new Date(2026,10,25,8,0)}));
t(!/Pendientes/.test(y)&&/^Hola[\s\S]*\nmartes 24 nov, 09:53am\n/m.test(y),'sin pendientes no pone la linea; si no es hoy no dice "Hoy"');
const z=ctx.recMensajeArmar_(Object.assign({},base,{ts:new Date(2026,10,24,15,5)}));t(/15:05|03:05pm/.test(z)&&/03:05pm/.test(z),'hora en am/pm');
// extension 1.10.0
const bg=fs.readFileSync(__dirname+'/../extension-cookie/background.js','utf8'),pp=fs.readFileSync(__dirname+'/../extension-cookie/popup.js','utf8'),ph=fs.readFileSync(__dirname+'/../extension-cookie/popup.html','utf8'),mf=fs.readFileSync(__dirname+'/../extension-cookie/manifest.json','utf8');
t(/"version": "1\.1[01]\.[0-9]+"/.test(mf),'version 1.10.x');
t(/async function sbCiclo/.test(bg)&&/accion: 'sub_preparar'/.test(bg)&&/accion: 'sub_resultado'/.test(bg)&&/sub_\(precios\|killers\|todo\|prueba\)/.test(bg),'modulo de subida y mensajes del popup');
t(/sbPend/.test(bg)&&/alarms\.create\('subida'/.test(bg),'el segundo paso de Todo sobrevive a que el servicio se duerma');
t(/accion: 'rec_mensaje'/.test(bg)&&/'recmsg'/.test(bg),'mensaje de recoleccion se pide y se refresca solo');
['sp','sk','st','sx'].forEach(i=>t(new RegExp('id="'+i+'"').test(ph)&&new RegExp("botonSeguro\\('"+i+"'").test(pp),'boton '+i+' con confirmacion'));
t(/id="rect"/.test(ph)&&/id="rcp"/.test(ph)&&/Copiar mensaje de hoy/.test(ph)&&/accion: 'rec_mensaje'/.test(bg)&&/tipo: 'rec_mensaje'/.test(pp),'boton Copiar mensaje de hoy (trae del Sheet y copia)');
t(!/sub_(precios|killers|todo|prueba)[^\n]*setInterval|alarms\.create\('subida',\s*\{\s*periodInMinutes/.test(bg),'la subida nunca corre sola en periodo (solo por boton)');
console.log(bad?('FALLAN '+bad):('t98 ok '+ok));process.exit(bad?1:0);
