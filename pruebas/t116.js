// t116: lectura de FedEx (extension 1.11.4): guia ENTREGADA (sin barra, "Signed for by"), guia que NO EXISTE ("We can't find that tracking number")
// y sin falsos entregados en las que van en camino. Paginas SIMULADAS.
const fs=require('fs'),vm=require('vm');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const bg=fs.readFileSync(__dirname+'/../extension-cookie/background.js','utf8');
const blk=bg.slice(bg.indexOf('// ---- Rastreo de guias'),bg.indexOf('// ---- Guias automaticas'));
const fn=n=>blk.slice(blk.indexOf('async function '+n),blk.indexOf('\n}\n',blk.indexOf('async function '+n))+2);
function pag(texto,{activo=''}={}){
  let clic=0;const boton={innerText:'View more details',click:()=>{clic++}};
  const ctx={console,Promise,setTimeout:(f)=>setTimeout(f,0),document:{title:'Detailed Tracking',body:{get innerText(){return texto}},
    querySelector:s=>s==='.phase3-progress-bar__label--active'&&activo?{innerText:activo}:null,querySelectorAll:s=>s==='button'?[boton]:[]}};
  vm.createContext(ctx);vm.runInContext('globalThis.f='+fn('enFedex').replace(/^async function enFedex/,'(async function enFedex')+')',ctx);return ctx.f;
}
(async()=>{
  // entregada, ingles, sin barra de progreso
  let r=await pag('545285481638\nSigned for by\nM.GARCIA\nDelivery date\nTuesday, 11/24/26 at 3:12 PM\nShipment facts')();
  t(r.ok&&r.resumen==='Delivered','FedEx entregada (ingles, "Signed for by"): '+JSON.stringify(r));
  // entregada, espanol
  r=await pag('545285481639\nFirmado por\nM.GARCIA\nFecha de entrega\nmartes, 24/11/26\nDatos del envío')();
  t(r.ok&&r.resumen==='Entregado','FedEx entregada (espanol, "Firmado por"): '+JSON.stringify(r));
  // entregada con historial: toma el ultimo evento
  r=await pag('Signed for by\nJUAN\nTravel History\nMonday, 11/23/26\n11:19 AM\nDelivered\nPLAYAS DE ROSARITO MX\nShipment facts')();
  t(r.ok&&r.eventos.length===1&&r.eventos[0].txt==='Delivered'&&r.resumen==='Delivered','FedEx entregada con historial');
  // NO existe, varias redacciones
  for (const tx of ["We can't find that tracking number. Please check the number and try again.",'We can’t find that tracking number','We cannot find this tracking number','No pudimos encontrar ese número de rastreo','No encontramos ese número de seguimiento']) {
    r=await pag('545285481640\n'+tx)();
    t(r.ok===false&&/FedEx no encontro la guia/.test(r.error)&&!r.cf,'FedEx inexistente: '+tx);
  }
  // en camino con barra: sigue igual y NO se toma por entregada aunque la barra tenga el paso "Delivered"
  r=await pag('545284634491\nLabel created\nPicked up\nOn the way\nOut for delivery\nDelivered\nTravel History\nMonday, 11/23/26\n11:19 AM\nDeparted FedEx hub\nMEXICO MX\nShipment facts',{activo:'On the way'})();
  t(r.ok&&r.resumen==='On the way','en camino: respeta la barra activa');
  // barra aun sin marcar el paso activo y con "Delivered" suelto como paso: NO debe volverse entregada (se queda esperando y falla como antes)
  r=await pag('545284634491\nLabel created\nOn the way\nOut for delivery\nDelivered')();
  t(r.ok===false&&/no mostro el estatus/.test(r.error),'"Delivered" suelto como paso de la barra no cuenta como entregada');
  // salida a reparto: no es entregada
  r=await pag('Out for delivery\nDelivered to your neighborhood soon')();
  t(r.ok===false,'en reparto no se toma por entregada');
  // verificacion humana sigue cortando
  r=await pag('Verify you are human')();t(r.cf===true,'verificacion: cf');
  console.log('t116:',ok,'ok',bad?bad+' FALLAN':'');
  process.exit(bad?1:0);
})();
