// t118: Rastreo.gs (27-nov): FedEx "no encontro la guia" 36 veces seguidas = Estado final NO EXISTE EN FEDEX (deja de ser ERROR). Nada real.
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

const dias=n=>new Date(Date.now()-n*86400000);
libro['Ventas Walmart']=[['FOLIO','REFERENCIA','FECHA','ENVIO GUIA'],[609001,600001,dias(2),'545285217645'],[609002,600002,dias(2),'545285217417']];
R('rqLista_')({clave:'k'});
const T=()=>ctx.peTabla_('PAQUETERIA');
const fila=g=>{const tb=T();return tb.filas.find(f=>String(f[tb.pos['GUIA']]).replace(/^'/,'')===g)};
const cel=(g,e)=>{const tb=T();return fila(g)[tb.pos[ctx.normEnc_(e)]]};
const nota=n=>'REVISAR A MANO ('+n+' seguidas): FedEx no encontro la guia · se reintenta sola cada 10 min';
const tb0=T(),f1=libro['PAQUETERIA'];
// forzar notas: guia 1 lleva 44, guia 2 lleva 10
libro['PAQUETERIA'].forEach((f,k)=>{if(k===0)return;const g=String(f[tb0.pos['GUIA']]).replace(/^'/,'');const c=tb0.pos['NOTA'];f[c]=g==='545285217645'?nota(44):nota(10);});
const err={ok:false,error:'FedEx no encontro la guia'};
R('rqResultado_')({clave:'k',resultados:[Object.assign({guia:'545285217645',paq:'FEDEX'},err),Object.assign({guia:'545285217417',paq:'FEDEX'},err)]});
t(cel('545285217645','Estado final')==='NO EXISTE EN FEDEX','44 seguidas + 1 = 45 >= 36: queda en Estado final NO EXISTE EN FEDEX');
t(/FedEx no tiene esta gu/.test(cel('545285217645','Accion sugerida')),'tiene accion sugerida');
t(cel('545285217417','Estado final')===''&&/\(11 seguidas\)/.test(cel('545285217417','Nota')),'la que lleva 10 sigue leyendose (11 seguidas)');
t(!logs.some(x=>x[0]==='Err'&&/545285217645/.test(x[1])),'la que ya es final NO sale en el ERROR de Rastreo');
t(logs.some(x=>x[0]==='Warn'&&/545285217645.*NO EXISTE EN FEDEX/.test(x[1])),'queda WARN con la guia y que hacer');
t(alertas.some(a=>/NO EXISTE EN FEDEX/.test(a[0])),'un aviso fijo corto para ella');
t(ctx.rqToca_({final:'NO EXISTE EN FEDEX',paq:'FEDEX',consulta:0},Date.now())===false,'ya no se vuelve a consultar');
// un fallo de OTRO tipo (pagina no cargo) con muchas seguidas NO se vuelve final
libro['PAQUETERIA'].forEach((f,k)=>{if(k===0)return;const g=String(f[tb0.pos['GUIA']]).replace(/^'/,'');if(g==='545285217417')f[tb0.pos['NOTA']]='REVISAR A MANO (50 seguidas): la pagina no cargo';});
R('rqResultado_')({clave:'k',resultados:[{guia:'545285217417',paq:'FEDEX',ok:false,error:'la pagina no cargo'}]});
t(cel('545285217417','Estado final')==='','"la pagina no cargo" nunca se vuelve final (puede ser la red)');
console.log(bad?`${bad} FALLAS`:`t118: ${ok} ok`);process.exit(bad?1:0);
