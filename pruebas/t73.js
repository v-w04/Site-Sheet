// BLINDAJE (actualizado 19-nov por decision de la dueña): lo UNICO que puede cancelar en Walmart es CancelacionesWalmartAuto.gs (Sheet: que ordenes y confirmacion)
// + enWalmartCancelar/wmCancelCiclo de la extension (Seller Center, solo ordenes de PRECIO ERRONEO que el Sheet manda, con verificacion). Nada mas.
// Si este archivo falla, alguien agrego algo que puede cancelar en Walmart fuera de eso: NO se sube hasta quitarlo.
const AUTORIZADOS_WM=['apps-script/CancelacionesWalmartAuto.gs'];   // archivos del Sheet que pueden hablar de la cancelacion en Walmart

const fs=require('fs'),vm=require('vm'),path=require('path');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const raiz=path.join(__dirname,'..');
const lee=(d)=>fs.readdirSync(path.join(raiz,d)).filter(f=>/\.(gs|js|json|html)$/.test(f)).map(f=>[d+'/'+f,fs.readFileSync(path.join(raiz,d,f),'utf8')]);
const codigo=[].concat(lee('apps-script'),lee('extension-cookie'));
const sinComentarios=s=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
// 1) Ninguna llamada ni endpoint hacia Walmart en el codigo que corre (Apps Script y extension del site)
codigo.forEach(([f,s])=>{
  const c=sinComentarios(s);
  t(!/walmartapis\.com/i.test(c),f+': sin API de Walmart (marketplace.walmartapis.com)');
  if(f.startsWith('apps-script/'))t(!/seller\.walmart\.com/i.test(c),f+': el Sheet no llama a Seller Center');
  const sinBloqueWm=f==='extension-cookie/background.js'?sinComentarios(s.replace(/\/\/ ---- Walmart: cancelar[\s\S]*?(?=\/\/ ---- Guias automaticas)/,'')):c;
  t(AUTORIZADOS_WM.includes(f)||!/orderCancellation|SELLER_REJECTION|cancellationReason|cancelationReasonEnum|update_orders_updateOrder/i.test(sinBloqueWm),f+': sin cuerpo de cancelacion de Walmart fuera de lo autorizado');
  t(!/\/v3\/orders\/[^'"`]*\/cancel/i.test(c),f+': sin endpoint /orders/{po}/cancel');
  t(AUTORIZADOS_WM.includes(f)||!/function\s+\w*(walmart|wmc)\w*cancel\w*\s*\(|function\s+\w*cancel\w*(walmart|wmc)\w*\s*\(/i.test(sinBloqueWm),f+': ninguna funcion "cancelar en Walmart" fuera de lo autorizado');
  t(!/WALMART_API_CLIENT/.test(c),f+': sin credenciales de la API de Walmart');
});
// 2) La extension del site solo habla con el site y con el Sheet; ninguna URL de Walmart en manifest ni codigo
const man=JSON.parse(fs.readFileSync(path.join(raiz,'extension-cookie/manifest.json'),'utf8'));
const hosts=[].concat(man.host_permissions||[],man.permissions||[],...(man.content_scripts||[]).map(x=>x.matches||[]));
t(hosts.filter(h=>/walmart/i.test(h)&&!/^https:\/\/electronicsmexico\.site\//.test(h)).every(h=>/^https:\/\/seller\.walmart\.com\/\*$/.test(h)),'manifest: del lado Walmart SOLO seller.walmart.com (lectura de Seller Center): '+hosts.filter(h=>/walmart/i.test(h)&&!/^https:\/\/electronicsmexico\.site\//.test(h)));
// ...y el unico script que se inyecta en una pagina es cajas.js, en la pagina de Guias de NUESTRO site (no en Walmart)
t(JSON.stringify((man.content_scripts||[]).map(x=>[x.matches,x.js]))===JSON.stringify([[["https://electronicsmexico.site/walmart/guias*"],["cajas.js"]]]),'manifest: solo cajas.js en electronicsmexico.site/walmart/guias');
const bg=fs.readFileSync(path.join(raiz,'extension-cookie/background.js'),'utf8');
const urls=(bg.match(/fetch\(\s*['"`][^'"`]+/g)||[]).map(x=>x.replace(/fetch\(\s*['"`]/,''));
t(urls.every(u=>!/walmart/i.test(u)),'toda llamada fetch de la extension va al site/Sheet: '+urls.join(' | '));
// Seller Center: la extension SOLO LEE (texto de la pagina). Dentro de esas funciones no hay clics, formularios, fetch ni escritura.
const sc=bg.slice(bg.indexOf('// ---- Seller Center'),bg.indexOf('// ---- piezas puras'));
t(sc.length>2000,'se aislo el bloque de Seller Center: '+sc.length);
t(!/\.click\(|\.submit\(|dispatchEvent|fetch\(|XMLHttpRequest|\.value\s*=|\.innerHTML\s*=|execCommand|sendMessage/.test(sc),'Seller Center: solo lectura (sin clic, submit, fetch ni escritura)');
t(!/cancel/i.test(sc.replace(/Canceled/g,'').replace(/orderGroups=Canceled/g,'')),'Seller Center: la unica mencion es la LISTA "Canceled" que se lee');
const navs=(bg.match(/SC_URL\s*\+\s*['"`][^'"`]+/g)||[]);
t(navs.every(n=>/orders\?|seller-communication|supporthub/.test(n)&&!/cancel(ar|ation|Order)/i.test(n)),'navegacion a Seller Center solo a pantallas de lectura: '+navs.join(' | '));
t(/\/ventas-general\/cancelar/.test(bg),'la extension cancela solo con /ventas-general/cancelar del site');
// 3) Menu: ninguna opcion de menu que diga cancelar en Walmart
const setup=fs.readFileSync(path.join(raiz,'apps-script/Setup.gs'),'utf8');
const items=[...setup.matchAll(/addItem\('([^']*)',\s*'([^']*)'/g)].map(m=>[m[1],m[2]]);
t(items.length>20,'se leyeron los items del menu: '+items.length);
t(!items.some(([l,f])=>(/cancel/i.test(l)&&/walmart/i.test(l))||/cancel.*walmart|walmart.*cancel/i.test(f)),'ningun item de menu cancela en Walmart: '+items.filter(([l,f])=>/cancel.*walmart|walmart.*cancel/i.test(l+' '+f)).join(' | '));
const org=fs.readFileSync(path.join(raiz,'apps-script/Organizar.gs'),'utf8');
t(!/CANCELAR EN WALMART las marcadas|Cancela en Walmart \(API\)/.test(org),'la guia del menu no ofrece cancelar en Walmart');
// 4) CANCELADA EN WALMART (la marca la dueña a mano): ningun codigo la ESCRIBE. Solo la lee (QUE HACER, Reporte) o le pone casilla bonita conservando su valor.
const conWMC=codigo.filter(([f,s])=>/WMC_YA|CANCELADA EN WALMART/.test(sinComentarios(s))).map(([f])=>f).sort();
const permitidos=['apps-script/CancelacionesWalmartAuto.gs','apps-script/CancelacionesSite.gs','extension-cookie/background.js','apps-script/CancelacionesEstado.gs','apps-script/CancelacionesWalmart.gs','apps-script/Reporte.gs','apps-script/PedidosRiesgo.gs','apps-script/Cancelaciones.gs','apps-script/CancelacionesPrecio.gs','apps-script/SellerCenter.gs'].sort();
t(conWMC.every(f=>permitidos.includes(f)),'CANCELADA EN WALMART solo aparece en archivos revisados: '+conWMC);
const est=sinComentarios(fs.readFileSync(path.join(raiz,'apps-script/CancelacionesEstado.gs'),'utf8'));
t(!/setValue|setValues\([^)]*WMC_YA/.test(est.replace(/rg\.setValues\(nuevo\)/,'')),'QUE HACER no escribe CANCELADA EN WALMART');
const wm=sinComentarios(fs.readFileSync(path.join(raiz,'apps-script/CancelacionesWalmart.gs'),'utf8'));
t(!/UrlFetchApp|setProperty|fetch\(/.test(wm),'CancelacionesWalmart.gs: sin llamadas de red ni propiedades');
// wmcCasillas_ conserva lo que ya marco la dueña (solo cambia texto "TRUE" a casilla)
const ctx={console};vm.createContext(ctx);
ctx.normEnc_=s=>String(s).toUpperCase();ctx.logWarn_=()=>{};
vm.runInContext(fs.readFileSync(path.join(raiz,'apps-script/CancelacionesWalmart.gs'),'utf8'),ctx);
t(typeof ctx.wmcCancelar_==='undefined'&&typeof ctx.cancelacionesWalmartCancelar==='undefined'&&typeof ctx.wmcLlamar_==='undefined','no existen wmcCancelar_ / cancelacionesWalmartCancelar / wmcLlamar_');
// 5) Aviso: si el site dijera que cancelo en Walmart, queda ALERTA en el Log (y el aviso normal "sigue ACTIVA" no alarma)
const cs=fs.readFileSync(path.join(raiz,'apps-script/CancelacionesSite.gs'),'utf8');
const m=/function csSiteAvisaWalmart_[\s\S]*?\n}\n/.exec(cs);const c2={};vm.createContext(c2);vm.runInContext(m[0],c2);
const D=c2.csSiteAvisaWalmart_;
t(D('La venta se cancelo en Walmart')&&D('Orden cancelada en Walmart')&&D('canceló también en Walmart'),'detecta "cancelada en Walmart"');
t(!D('La venta sigue ACTIVA en Walmart')&&!D('No se cancelo en Walmart')&&!D('')&&!D(null)&&!D('Cancelada en el site por la extension'),'no alarma con el aviso normal');
t(/csSiteAvisaWalmart_\(\[p\.aviso, p\.avisoCanal, p\.error\]/.test(cs)&&/ALERTA/.test(cs),'csRecibirResultado_ usa la alerta');
// 6) Los textos dejan claro quien hace que
const E=fs.readFileSync(path.join(raiz,'apps-script/CancelacionesEstado.gs'),'utf8');
t(/solo tú, en Seller Center; el sistema nunca lo hace/.test(E),'QUE HACER: Walmart lo cancelas tu a mano');
t(/QUIEN HACE QUE/.test(E),'cabecera de CancelacionesEstado explica la separacion');
// 7) Lo autorizado esta acotado (19-nov): solo PRECIO ERRONEO, con pausa, con verificacion y sin menu manual
const auto=fs.readFileSync(path.join(raiz,'apps-script/CancelacionesWalmartAuto.gs'),'utf8');
t(/ori !== CAN_ORI_PRECIO\) return false/.test(auto),'solo ORIGEN = PRECIO ERRONEO es elegible');
t(/WALMART_CANCEL_PAUSA/.test(auto)&&/cwaPausado_\(\)\) return/.test(auto),'existe la pausa total y se respeta');
t(/CWA_MAX_CICLO = 5/.test(auto)&&/CWA_MAX_DIAS = 5/.test(auto),'tope por vuelta y de dias');
const blq=bg.slice(bg.indexOf('// ---- Walmart: cancelar'),bg.indexOf('// ---- Guias automaticas'));
t(blq.length>3000&&/no pude verificar que quedo cancelada/.test(blq)&&/break;/.test(blq),'la extension verifica y una falla detiene la vuelta');
t(!/wm_cancel_pendientes|wmCancelCiclo|enWalmartCancelar/.test(bg.replace(blq,'').replace(/[^\n]*(alarms|onAlarm|setTimeout\(\(\) => wmCancelCiclo|const CICLO_REINT)[^\n]*/g,'').replace(/\/\/[^\n]*/g,'')),'la cancelacion en Walmart solo se llama desde su bloque y sus alarmas');
console.log('t73: '+ok+' ok'+(bad?', '+bad+' FALLA':''));process.exit(bad?1:0);
