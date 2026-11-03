// Prueba de Republicar: SKU NUEVO consecutivo (-MSI-2, -2...), COPIAS, entradas solas y paso a REPUBLICADO.   node t16.js
const fs=require('fs'),vm=require('vm');
const S=__dirname+'/../apps-script/';
let p=0,f=0;const ok=(c,m)=>{c?p++:f++;console.log(c?'OK':'FALLA',m)};
const noop=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?undefined:noop(),apply:()=>noop()});
class Sh{constructor(n,d){this.n=n;this.d=d}getName(){return this.n}setColumnWidth(){}getMaxRows(){return 1000}insertRowsAfter(){}getConditionalFormatRules(){return[]}setConditionalFormatRules(){}setFrozenRows(){}getFrozenColumns(){return 0}setFrozenColumns(){}getMaxColumns(){return 60}insertColumnsAfter(){}
 getLastRow(){let l=0;this.d.forEach((r,i)=>{if(r.some(c=>c!==''&&c!=null))l=i+1});return l}
 getLastColumn(){let l=0;this.d.forEach(r=>r.forEach((c,j)=>{if(c!==''&&c!=null&&j+1>l)l=j+1}));return l}
 getRange(r,c,nr,nc){const s=this;nr=nr||1;nc=nc||1;
  return new Proxy({getValues:()=>{const o=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push((s.d[r-1+i]||[])[c-1+j]??'');o.push(row)}return o},
   setValues:v=>{v.forEach((row,i)=>{while(s.d.length<r+i)s.d.push([]);row.forEach((x,j)=>{s.d[r-1+i][c-1+j]=x})});return noop()},
   clearContent:()=>{for(let i=0;i<nr;i++)for(let j=0;j<nc;j++){if(s.d[r-1+i])s.d[r-1+i][c-1+j]=''}return noop()},
   setValue:x=>{while(s.d.length<r)s.d.push([]);s.d[r-1][c-1]=x;return noop()}},{get:(t,k)=>k in t?t[k]:noop()})}}
const H={
 'Walmart':[['SKU','ESTATUS','NOMBRE','DEPARTAMENTO','CATEGORIA','PRECIO','UPC','GTIN'],
  ['AAA-111-NEG-0001-MSI','PUBLISHED','Bocina A','Audio','Bocinas Portatiles',999,'111','222'],['AAA-111-NEG-0001-MSI-2','PUBLISHED','Bocina A','Audio','Bocinas Portatiles',999,'',''],
  ['BBB-222-NEG-0002','PUBLISHED','Mouse B','UNNAV','Por Defecto',200,'',''],['BBB-222-NEG-0002-MSI','PUBLISHED','Mouse B','Computo','Ratones',200,'',''],
  ['CCC-333-NEG-0003-MSI-2','PUBLISHED','Cable C','Electronica','Cables',50,'',''],['EEE-555-NEG-0005-MSI','PUBLISHED','','','',1,'',''],['NUEVO-MSI-2','PUBLISHED','','','',1,'',''],['YNEW-MSI-2','PUBLISHED','','','',1,'','']],
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
  ['YYY-1-MSI','YNEW-MSI-2','PENDIENTE','','CATEGORIA MAL','MANUAL','2026-10-19','','','','','','',''],
  ['LLL-1-MSI','','PENDIENTE','','Walmart lo cobra como Juguetes','COBRO DISTINTO','2026-10-20','','','','','','',''],
  ['KKK-1-MSI','','PENDIENTE','','CATEGORIA MAL','CATEGORIA REPUBLICAR','2026-10-20','','','UNNAV / Por Defecto','','','','']]
};
const hojas={};for(const n in H)hojas[n]=new Sh(n,H[n].map(r=>r.slice()));
const logs=[];const props={};
const ctx={Utilities:{formatDate:(d,z,f)=>d.toISOString().slice(0,10),parseDate:(s)=>new Date(s+'T00:00:00Z')},TZ:'x',console,Date,JSON,Math,Object,Array,String,Number,isNaN,parseInt,
 CD_HOJA:'Cobro distinto',WD_HOJA:'Walmart',WD_HOJA_BLOQ:'Bloqueados',PAR_HOJA_ESTADO:'Estado Killers',PAR_REPUBLICAR:'REPUBLICAR',PAR_NOTA_AUTO:'AUTO: categoria en REPUBLICAR',LOCK_ESPERA_MS:1,
 getSpreadsheet_:()=>({getSheetByName:n=>hojas[n]||null}),getHoja_:n=>hojas[n]||(hojas[n]=new Sh(n,[])),hoy_:()=>'2026-10-23',
 logOk_:(e,m)=>logs.push(['OK',m]),logWarn_:(e,m)=>logs.push(['WARN',m]),logErr_:(e,m)=>logs.push(['ERR',m]),logLatido_:()=>{},avisoDia_:(k,n,e,m)=>logs.push([n,m]),flushLog_(){},toast_(){},
 SpreadsheetApp:{newDataValidation:()=>({requireValueInList(){return this},requireValueInRange(){return this},setAllowInvalid(){return this},build(){return {}}}),newConditionalFormatRule:()=>noop()},
 reescribirHoja_:(h,enc,filas)=>{h.d.length=0;h.d.push(enc.slice());filas.forEach(f=>h.d.push(f))},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v}})}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(S+'Columnas.gs','utf8'),ctx);
vm.runInContext(fs.readFileSync(S+'Republicar.gs','utf8'),ctx);
const R=hojas['Republicar'];const enc=R.d[0];const c=n=>enc.indexOf(n);
const r=vm.runInContext('repActualizarCon_()',ctx);
const filas=()=>R.d.slice(1).filter(x=>x[c('SKU VIEJO')]);
const por=(vi)=>filas().filter(x=>x[c('SKU VIEJO')]===vi);
const nuevos=(vi)=>por(vi).map(x=>x[c('SKU NUEVO')]);
console.log(filas().map(x=>[x[c('SKU VIEJO')],x[c('SKU NUEVO')],x[c('ESTADO')],x[c('MOTIVO')],x[c('ORIGEN')],x[c('COPIAS')]].join(' | ')).join('\n'));
ok(JSON.stringify(nuevos('AAA-111-NEG-0001-MSI'))===JSON.stringify(['AAA-111-NEG-0001-MSI-3','AAA-111-NEG-0001-MSI-4','AAA-111-NEG-0001-MSI-5']),'COPIAS=3 arma 3 filas: -MSI-3, -MSI-4, -MSI-5 (ya existia -MSI-2)');
ok(por('AAA-111-NEG-0001-MSI').every(x=>x[c('COPIAS')]===1),'COPIAS queda en 1 en cada fila');
ok(nuevos('BBB-222-NEG-0002')[0]==='BBB-222-NEG-0002-3','clasica: -3 (el -2 esta en Bloqueados)');
ok(nuevos('CCC-333-NEG-0003-MSI-2')[0]==='CCC-333-NEG-0003-MSI-3','desde un -MSI-2 sigue el -MSI-3 del mismo SKU base');
ok(nuevos('FFF-666-NEG-0006-OB')[0]==='','-OB no se propone');
ok(nuevos('DDD-444-NEG-6888')[0]==='DDD-444-NEG-6888-2','el codigo de 4 digitos (-6888) no se confunde con un consecutivo');
ok(r.sinPropuesta.join()==='FFF-666-NEG-0006-OB','se avisa de los que no se pudo proponer');
const cd=por('COB-999-NEG-0009-MSI')[0];ok(cd&&cd[c('MOTIVO')]==='COBRO DISTINTO'&&cd[c('ORIGEN')]==='COBRO DISTINTO'&&cd[c('DETALLE')]==='La promo no se aplico'&&cd[c('SKU NUEVO')]==='COB-999-NEG-0009-MSI-2','Cobro distinto entra solo (motivo, causa en NOTA, SKU nuevo propuesto)');
const un=por('UNN-1-NEG-0001-MSI')[0];ok(un&&un[c('MOTIVO')]==='CATEGORIA MAL'&&un[c('ORIGEN')]==='CATEGORIA REPUBLICAR'&&/UNNAV/.test(un[c('CATEGORIA ACTUAL')]),'categoria en REPUBLICAR entra sola (origen CATEGORIA REPUBLICAR)');
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
const todos=filas().map(x=>x[c('SKU NUEVO')]).filter(Boolean);ok(new Set(todos).size===todos.length,'ningun SKU NUEVO repetido');
hojas['Estado Killers']=new Sh('Estado Killers',[['SKU','KAM','KILLER'],['Y-MSI','AUDIO','NO']]);
{let err='';try{vm.runInContext('repActualizarCon_()',ctx)}catch(e){err=e.message}ok(!err,'Estado Killers sin DECISION (formato anterior): Republicar corre sin error '+err);}
// --- rediseño: orden de columnas, acciones, datos del site ---
const hd=R.d[0];
ok(hd.slice(0,5).join()==='ESTADO,ACCION,SKU VIEJO,PRODUCTO,SKU NUEVO','columnas en orden: ESTADO, ACCION, SKU VIEJO, PRODUCTO, SKU NUEVO...');
ok(props['REPUBLICAR_LAYOUT_V2']==='1','la migracion de orden queda marcada (una sola vez)');
ok(hojas['Republicar respaldo']&&hojas['Republicar respaldo'].d[0][0]==='SKU VIEJO','copia de respaldo con el orden viejo');
const ll=por('LLL-1-MSI')[0];ok(ll&&ll[c('MOTIVO')]==='COBRO DISTINTO'&&/Juguetes/.test(ll[c('DETALLE')]),'texto largo en MOTIVO pasa a DETALLE y MOTIVO queda en la lista');
const kk=por('KKK-1-MSI')[0];ok(kk&&kk[c('CATEGORIA ACTUAL')]==='UNNAV / Por Defecto'&&kk[c('NOTA')]==='','NOTA con departamento/categoria pasa a CATEGORIA ACTUAL');
const aa=por('AAA-111-NEG-0001-MSI')[0];ok(aa[c('PRODUCTO')]==='Bocina A'&&aa[c('CATEGORIA ACTUAL')]==='Audio / Bocinas Portatiles'&&aa[c('PRECIO')]===999&&aa[c('UPC')]==='111'&&aa[c('GTIN')]==='222','PRODUCTO, categoria, precio, UPC y GTIN vienen de Walmart');
ok(aa[c('ACCION')]==='Listo para el Publicador'&&aa[c('LISTO')]==='SI','MAS PRESENCIA con SKU nuevo: no necesita categoria -> Listo para el Publicador');
const bb=por('BBB-222-NEG-0002')[0];ok(bb[c('CATEGORIA SUGERIDA')]==='Ratones','sugerida = categoria buena de un SKU hermano (Por Defecto no cuenta)');
ok(bb[c('ACCION')]==='Elegir CATEGORIA NUEVA'&&bb[c('LISTO')]==='','CATEGORIA MAL sin CATEGORIA NUEVA -> Elegir categoria');
ok(zz[c('ACCION')]==='Bloquear el viejo en el dashboard','REPUBLICADO -> Bloquear el viejo');
ok(por('FFF-666-NEG-0006-OB')[0][c('ACCION')]==='Escribir SKU NUEVO','sin SKU NUEVO -> Escribir SKU NUEVO');
ok(por('YYY-1-MSI')[0][c('ACCION')]==='Cerrado'&&por('YYY-1-MSI')[0][c('PRIORIDAD')]==='','CERRADO sin prioridad');
ok(por('COB-999-NEG-0009-MSI')[0][c('PRIORIDAD')]==='ALTA','COBRO DISTINTO -> prioridad ALTA');
ok(filas()[0][c('ACCION')]==='Bloquear el viejo en el dashboard','arriba: lo que falta bloquear');
const cats=hojas['Categorias republicar'];ok(cats&&cats.d.slice(1).map(x=>x[0]).sort().join()==='Bocinas Portatiles,Cables,Ratones','hoja auxiliar de categorias: solo las buenas de Walmart');
ok(cats&&cats.d.slice(1).map(x=>x[0]).indexOf('Por Defecto')===-1,'la lista de categorias no trae Por Defecto');
console.log(p+' OK '+f+' FALLA');
