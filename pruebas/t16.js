// Prueba de Republicar: SKU NUEVO consecutivo (-MSI-2, -2...), COPIAS, entradas solas y paso a REPUBLICADO.   node t16.js
const fs=require('fs'),vm=require('vm');
const S=__dirname+'/../apps-script/';
let p=0,f=0;const ok=(c,m)=>{c?p++:f++;console.log(c?'OK':'FALLA',m)};
const noop=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?undefined:noop(),apply:()=>noop()});
class Sh{constructor(n,d){this.n=n;this.d=d}getName(){return this.n}setColumnWidth(){}getMaxRows(){return 1000}insertRowsAfter(){}getConditionalFormatRules(){return[]}setConditionalFormatRules(){}setFrozenRows(){}
 getLastRow(){let l=0;this.d.forEach((r,i)=>{if(r.some(c=>c!==''&&c!=null))l=i+1});return l}
 getLastColumn(){let l=0;this.d.forEach(r=>r.forEach((c,j)=>{if(c!==''&&c!=null&&j+1>l)l=j+1}));return l}
 getRange(r,c,nr,nc){const s=this;nr=nr||1;nc=nc||1;
  return new Proxy({getValues:()=>{const o=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push((s.d[r-1+i]||[])[c-1+j]??'');o.push(row)}return o},
   setValues:v=>{v.forEach((row,i)=>{while(s.d.length<r+i)s.d.push([]);row.forEach((x,j)=>{s.d[r-1+i][c-1+j]=x})});return noop()},
   setValue:x=>{while(s.d.length<r)s.d.push([]);s.d[r-1][c-1]=x;return noop()}},{get:(t,k)=>k in t?t[k]:noop()})}}
const H={
 'Walmart':[['SKU','ESTATUS'],['AAA-111-NEG-0001-MSI','PUBLISHED'],['AAA-111-NEG-0001-MSI-2','PUBLISHED'],['BBB-222-NEG-0002','PUBLISHED'],['CCC-333-NEG-0003-MSI-2','PUBLISHED'],['EEE-555-NEG-0005-MSI','PUBLISHED'],['NUEVO-MSI-2','PUBLISHED'],['YNEW-MSI-2','PUBLISHED']],
 'Bloqueados':[['SKU'],['BBB-222-NEG-0002-2'],['YYY-1-MSI']],
 'Cobro distinto':[['SKU','CAUSA'],['COB-999-NEG-0009-MSI','La promo no se aplico']],
 'Estado Killers':[['SKU','DEPARTAMENTO','CATEGORIA','KAM','DECISION','NOTA'],['UNN-1-NEG-0001-MSI','UNNAV','Por Defecto','REPUBLICAR','REPUBLICAR','AUTO: categoria en REPUBLICAR'],['MAN-1-NEG-0002-MSI','Audio','Bocinas','AUDIO','REPUBLICAR',''],['OTRO-1-MSI','Audio','Bocinas','AUDIO','TV','']],
 'Republicar':[['SKU VIEJO','SKU NUEVO','ESTADO','DIAS AHI','MOTIVO','ORIGEN','FECHA ENTRADA','FECHA REPUBLICADO','ESTATUS NUEVO','NOTA','CATEGORIA NUEVA','UPC O GTIN AJENO','COPIAS','FECHA CERRADO'],
  ['AAA-111-NEG-0001-MSI','','','','MAS PRESENCIA','','','','','','','',3],
  ['BBB-222-NEG-0002','','','','CATEGORIA MAL','','','','','','','',''],
  ['CCC-333-NEG-0003-MSI-2','','','','OTRO','','','','','','','',''],
  ['FFF-666-NEG-0006-OB','','','','OTRO','','','','','','','',''],
  ['DDD-444-NEG-6888','','','','OTRO','','','','','','','',''],
  ['ZZZ-1-MSI','NUEVO-MSI-2','PENDIENTE','','CATEGORIA MAL','MANUAL','2026-10-20','','','','','','',''],
  ['YYY-1-MSI','YNEW-MSI-2','PENDIENTE','','CATEGORIA MAL','MANUAL','2026-10-19','','','','','','','']]
};
const hojas={};for(const n in H)hojas[n]=new Sh(n,H[n].map(r=>r.slice()));
const logs=[];const props={};
const ctx={Utilities:{formatDate:(d,z,f)=>d.toISOString().slice(0,10),parseDate:(s)=>new Date(s+'T00:00:00Z')},TZ:'x',console,Date,JSON,Math,Object,Array,String,Number,isNaN,parseInt,
 CD_HOJA:'Cobro distinto',WD_HOJA:'Walmart',WD_HOJA_BLOQ:'Bloqueados',PAR_HOJA_ESTADO:'Estado Killers',PAR_REPUBLICAR:'REPUBLICAR',PAR_NOTA_AUTO:'AUTO: categoria en REPUBLICAR',LOCK_ESPERA_MS:1,
 getSpreadsheet_:()=>({getSheetByName:n=>hojas[n]||null}),getHoja_:n=>hojas[n],hoy_:()=>'2026-10-23',
 logOk_:(e,m)=>logs.push(['OK',m]),logWarn_:(e,m)=>logs.push(['WARN',m]),logErr_:(e,m)=>logs.push(['ERR',m]),logLatido_:()=>{},flushLog_(){},toast_(){},
 SpreadsheetApp:{newDataValidation:()=>({requireValueInList(){return this},setAllowInvalid(){return this},build(){return {}}})},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v}})}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(S+'Columnas.gs','utf8'),ctx);
vm.runInContext(fs.readFileSync(S+'Republicar.gs','utf8'),ctx);
const R=hojas['Republicar'];const enc=R.d[0];const c=n=>enc.indexOf(n);
const r=vm.runInContext('repActualizarCon_()',ctx);
const filas=()=>R.d.slice(1).filter(x=>x[0]);
const por=(vi)=>filas().filter(x=>x[0]===vi);
const nuevos=(vi)=>por(vi).map(x=>x[c('SKU NUEVO')]);
console.log(filas().map(x=>[x[0],x[1],x[2],x[4],x[5],x[12]].join(' | ')).join('\n'));
ok(JSON.stringify(nuevos('AAA-111-NEG-0001-MSI'))===JSON.stringify(['AAA-111-NEG-0001-MSI-3','AAA-111-NEG-0001-MSI-4','AAA-111-NEG-0001-MSI-5']),'COPIAS=3 arma 3 filas: -MSI-3, -MSI-4, -MSI-5 (ya existia -MSI-2)');
ok(por('AAA-111-NEG-0001-MSI').every(x=>x[c('COPIAS')]===1),'COPIAS queda en 1 en cada fila');
ok(nuevos('BBB-222-NEG-0002')[0]==='BBB-222-NEG-0002-3','clasica: -3 (el -2 esta en Bloqueados)');
ok(nuevos('CCC-333-NEG-0003-MSI-2')[0]==='CCC-333-NEG-0003-MSI-3','desde un -MSI-2 sigue el -MSI-3 del mismo SKU base');
ok(nuevos('FFF-666-NEG-0006-OB')[0]==='','-OB no se propone');
ok(nuevos('DDD-444-NEG-6888')[0]==='DDD-444-NEG-6888-2','el codigo de 4 digitos (-6888) no se confunde con un consecutivo');
ok(r.sinPropuesta.join()==='FFF-666-NEG-0006-OB','se avisa de los que no se pudo proponer');
const cd=por('COB-999-NEG-0009-MSI')[0];ok(cd&&cd[c('MOTIVO')]==='COBRO DISTINTO'&&cd[c('ORIGEN')]==='COBRO DISTINTO'&&cd[c('NOTA')]==='La promo no se aplico'&&cd[c('SKU NUEVO')]==='COB-999-NEG-0009-MSI-2','Cobro distinto entra solo (motivo, causa en NOTA, SKU nuevo propuesto)');
const un=por('UNN-1-NEG-0001-MSI')[0];ok(un&&un[c('MOTIVO')]==='CATEGORIA MAL'&&un[c('ORIGEN')]==='CATEGORIA REPUBLICAR'&&/UNNAV/.test(un[c('NOTA')]),'categoria en REPUBLICAR entra sola (origen CATEGORIA REPUBLICAR)');
const ma=por('MAN-1-NEG-0002-MSI')[0];ok(ma&&ma[c('ORIGEN')]==='ESTADO KILLERS','REPUBLICAR puesto a mano en Estado Killers entra solo');
ok(por('OTRO-1-MSI').length===0,'una DECISION distinta de REPUBLICAR no entra');
const zz=por('ZZZ-1-MSI')[0];ok(zz[c('ESTADO')]==='REPUBLICADO'&&zz[c('ESTATUS NUEVO')]==='PUBLISHED'&&zz[c('FECHA REPUBLICADO')]!=='','SKU NUEVO ya en Walmart -> REPUBLICADO');
ok(por('BBB-222-NEG-0002')[0][c('ESTADO')]==='PENDIENTE','los demas quedan PENDIENTE');
const yy=por('YYY-1-MSI')[0];ok(yy[c('ESTADO')]==='CERRADO'&&yy[c('FECHA CERRADO')]!==''&&yy[c('FECHA REPUBLICADO')]!=='','nuevo en Walmart y viejo en Bloqueados -> CERRADO (con fechas)');
ok(zz[c('ESTADO')]==='REPUBLICADO','nuevo en Walmart y viejo sin bloquear -> se queda REPUBLICADO');
const rk=filas().map(x=>x[c('ESTADO')]);const rank=e=>e==='REPUBLICADO'?0:e==='CERRADO'?2:1;ok(rk.every((e,i)=>i===0||rank(rk[i-1])<=rank(e)),'orden: REPUBLICADO arriba, PENDIENTE al medio, CERRADO al fondo');
const n1=filas().length;
vm.runInContext('repActualizarCon_()',ctx);
ok(filas().length===n1,'segunda corrida: no duplica nada');
const todos=filas().map(x=>x[1]).filter(Boolean);ok(new Set(todos).size===todos.length,'ningun SKU NUEVO repetido');
console.log(p+' OK '+f+' FALLA');
