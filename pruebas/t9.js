const fs=require('fs'),vm=require('vm');
const S=__dirname+'/../apps-script/', U=S;
const D=JSON.parse(fs.readFileSync(''+__dirname+'/datos/parr_data.json','utf8'));
let p=0,f=0;const ok=(c,m)=>{c?p++:f++;console.log(c?'OK':'FALLA',m)};
const noop=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?undefined:noop(),apply:()=>noop()});
class Sh{constructor(n,d){this.n=n;this.d=d}getName(){return this.n}setColumnWidth(){}
 getLastRow(){let l=0;this.d.forEach((r,i)=>{if(r.some(c=>c!==''&&c!=null))l=i+1});return l}
 getLastColumn(){let l=0;this.d.forEach(r=>r.forEach((c,j)=>{if(c!==''&&c!=null&&j+1>l)l=j+1}));return l}
 getRange(r,c,nr,nc){const s=this;nr=nr||1;nc=nc||1;
  return new Proxy({getValues:()=>{const o=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push((s.d[r-1+i]||[])[c-1+j]??'');o.push(row)}return o},
   setValues:v=>{v.forEach((row,i)=>{while(s.d.length<r+i)s.d.push([]);row.forEach((x,j)=>{s.d[r-1+i][c-1+j]=x})})},
   setValue:x=>{while(s.d.length<r)s.d.push([]);s.d[r-1][c-1]=x;return noop()},clearContent:()=>{for(let i=0;i<nr;i++)for(let j=0;j<nc;j++)if(s.d[r-1+i])s.d[r-1+i][c-1+j]=''}},{get:(t,k)=>k in t?t[k]:noop()})}
 getDataRange(){return{getValues:()=>this.d.map(r=>r.slice())}}}
const hojas={};for(const n in D)hojas[n]=new Sh(n,D[n].map(r=>r.slice()));
const logs=[],escritas={};
const ctx={Utilities:{formatDate:(d,z,f)=>f==='M'?'10':f==='yyyy'?'2026':f==='dd'?'22':'26'},TZ:'x',console,Date,JSON,Math,Object,Array,String,Number,isNaN,parseInt,
 CC_WALMART:'Walmart',CC_HOJA:'Concentrado',CD_HOJA:'Cobro distinto',LOCK_ESPERA_MS:1,
 getSpreadsheet_:()=>({getSheetByName:n=>hojas[n]||null,deleteSheet:h=>{delete hojas[h.getName()]}}),
 getHoja_:n=>hojas[n]||(hojas[n]=new Sh(n,[['SKU','DECISION']])),
 logOk_:(e,m)=>logs.push(['OK',m]),logWarn_:(e,m)=>logs.push(['WARN',m]),logErr_:(e,m)=>logs.push(['ERR',m]),logLatido_:(e,m)=>logs.push(['LAT',m]),flushLog_(){},toast_(){},
 reescribirHoja_:(h,enc,filas)=>{escritas[h.getName()]={enc,filas};},
 SpreadsheetApp:{newDataValidation:()=>({requireValueInList(){return this},setAllowInvalid(){return this},build(){return {}}})},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
 _p:{},PropertiesService:{getScriptProperties:()=>({getProperty:k=>ctx._p[k]||null,setProperty:(k,v)=>{ctx._p[k]=v}})}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(U+'Columnas.gs','utf8'),ctx);
vm.runInContext(fs.readFileSync(S+'KillersCorreo.gs','utf8'),ctx);
ctx.kcCrearHojas_=()=>({getSheetByName:n=>hojas[n]||null});
vm.runInContext(fs.readFileSync(S+'Parrillas.gs','utf8'),ctx);

const D2=hojas['KAMS Departamentos'];
// la hoja Concentrado en la prueba: agregar columnas ES WFS si no
let r=vm.runInContext('parActualizar_(true)',ctx);
const hdr=D2.d[0];console.log(hdr.filter(x=>x));
const ix=n=>hdr.indexOf(n);
const A=D2.d.slice(1).filter(x=>x[ix('CATEGORIA WALMART')]), B=D2.d.slice(1).filter(x=>x[ix('TODAS CATEGORIA')]);
console.log('bloque1',A.length,'bloque2',B.length,r.categorias);
ok(A.length>40&&A.length<119&&B.length>=200,'bloque 1 = solo lo que vendemos (menor), bloque 2 = todas (200+)');
ok(A.every(x=>+x[ix('SKU MSI CON STOCK')]>0),'cada categoria del bloque 1 tiene SKU vendibles');
ok(D2.d.slice(1,14).every((x,i)=>x[0]===D['KAMS Departamentos'][i+1][0]&&x[1]===D['KAMS Departamentos'][i+1][1]),'A:B intactas');
// orden: sin decidir arriba
const vac=A.map(x=>x[ix('GRUPO KAM CATEGORIA')]);let primerLleno=vac.findIndex(x=>x);ok(vac.slice(0,primerLleno).every(x=>!x)&&vac.slice(primerLleno).every(x=>x),'bloque 1: sin decidir arriba y luego por KAM');
console.log('grupos orden',[...new Set(vac)]);
// bloque 2 coincide
const rowB=(d,c)=>D2.d.findIndex((x,i)=>i>0&&x[ix('TODAS DEPARTAMENTO')]===d&&x[ix('TODAS CATEGORIA')]===c);
const rowA=(d,c)=>D2.d.findIndex((x,i)=>i>0&&x[ix('DEPARTAMENTO WALMART')]===d&&x[ix('CATEGORIA WALMART')]===c);
const cat1=A[0],d1=cat1[ix('DEPARTAMENTO WALMART')],c1=cat1[ix('CATEGORIA WALMART')];
ok(D2.d[rowB(d1,c1)][ix('TODAS GRUPO KAM')]===cat1[ix('GRUPO KAM CATEGORIA')],'bloque 2 igual al 1 al inicio');
// edito en bloque 1 -> pasa a bloque 2
D2.d[rowA(d1,c1)][ix('GRUPO KAM CATEGORIA')]='TV';
r=vm.runInContext('parActualizar_(true)',ctx);
ok(D2.d[rowB(d1,c1)][ix('TODAS GRUPO KAM')]==='TV','editar en bloque 1 se copia a bloque 2');
ok(D2.d[rowA(d1,c1)][ix('GRUPO KAM CATEGORIA')]==='TV','y se acomoda en su grupo');
// edito en bloque 2 -> pasa a bloque 1
const A2=D2.d.slice(1).filter(x=>x[ix('CATEGORIA WALMART')]);const cat2=A2[A2.length-1],d2=cat2[ix('DEPARTAMENTO WALMART')],c2=cat2[ix('CATEGORIA WALMART')];
D2.d[rowB(d2,c2)][ix('TODAS GRUPO KAM')]='NO ENVIAR';
r=vm.runInContext('parActualizar_(true)',ctx);
ok(D2.d[rowA(d2,c2)][ix('GRUPO KAM CATEGORIA')]==='NO ENVIAR','editar en bloque 2 se copia a bloque 1');
// edito una categoria que no esta en el 1 (solo en el 2)
const soloB=D2.d.slice(1).find(x=>x[ix('TODAS CATEGORIA')]&&rowA(x[ix('TODAS DEPARTAMENTO')],x[ix('TODAS CATEGORIA')])<0);
ok(!!soloB,'hay categorias solo en bloque 2 (no vendemos)');
// parrilla nueva
const P=escritas['Parrilla AUDIO'];console.log(P.enc.join('|'));
ok(P.enc.length===19&&P.enc[3]==='GTIN'&&P.enc[11]==='PRECIO FULL'&&P.enc[12]==='PRECIO MEJORADO','estructura de parrilla nueva (19 columnas, MINIMO SITE al final)');
const fila=P.filas[0];console.log(fila);
ok(fila[0]===10001341690&&fila[1]==='Electronics.Mexico'&&fila[6]==='SI'&&(fila[10]==='SI'||fila[10]==='NO')&&fila[7] instanceof Date&&fila[7].getMonth()===10&&fila[8].getDate()===30,'ID, seller, MSI, WFS y fechas (1 y 30 nov)');
ok(typeof fila[11]==='number'&&typeof fila[12]==='number'&&fila[12]<=fila[11],'precio publico normal (MAXIMO) y sin evento (MINIMO)');
// carry-over de lo que el usuario escribe
const sku=fila[2];
hojas['Parrilla AUDIO']=new Sh('Parrilla AUDIO',[P.enc.slice()].concat(P.filas.map(f=>f.slice())));
const hh=hojas['Parrilla AUDIO'];const ic=n=>P.enc.indexOf(n);
hh.d[1][ic('EVENTO')]=9999;hh.d[1][ic('FECHA INICIO')]=new Date(2026,10,13);
r=vm.runInContext('parActualizar_(true)',ctx);
const f2=escritas['Parrilla AUDIO'].filas.find(x=>x[2]===sku);
ok(f2[ic('EVENTO')]===9999&&f2[ic('FECHA INICIO')].getDate()===13,'lo que escribes (evento, offer id, fecha) se conserva por SKU');
// precio mejorado manual
const iMin=ic('MINIMO SITE'),iPM=ic('PRECIO MEJORADO');
const minReal=f2[iMin];
ok(typeof minReal==='number'&&f2[iPM]===minReal,'sin tocar: PRECIO MEJORADO = MINIMO SITE');
hojas['Parrilla AUDIO']=new Sh('Parrilla AUDIO',[P.enc.slice()].concat(escritas['Parrilla AUDIO'].filas.map(f=>f.slice())));
const hr=hojas['Parrilla AUDIO'];const ri=hr.d.findIndex((x,i)=>i>0&&x[2]===sku);
hr.d[ri][iPM]=minReal-77;
r=vm.runInContext('parActualizar_(true)',ctx);
let f3=escritas['Parrilla AUDIO'].filas.find(x=>x[2]===sku);
ok(f3[iPM]===minReal-77&&f3[iMin]===minReal&&r.manuales>=1,'precio mejorado cambiado a mano se respeta (y MINIMO SITE sigue siendo el del Site)');
// el Site baja el minimo: la fila sin tocar sigue al Site, la manual no
hojas['Parrilla AUDIO']=new Sh('Parrilla AUDIO',[P.enc.slice()].concat(escritas['Parrilla AUDIO'].filas.map(f=>f.slice())));
const hs=hojas['Parrilla AUDIO'];const rj=hs.d.findIndex((x,i)=>i>0&&x[2]!==sku);const skuB=hs.d[rj][2];
hs.d[rj][iMin]=hs.d[rj][iMin]+500;hs.d[rj][iPM]=hs.d[rj][iPM]+500;  // simula corrida anterior con minimo distinto
r=vm.runInContext('parActualizar_(true)',ctx);
const f4=escritas['Parrilla AUDIO'].filas.find(x=>x[2]===skuB), f5=escritas['Parrilla AUDIO'].filas.find(x=>x[2]===sku);
ok(f4[iPM]===f4[iMin]&&f5[iPM]===minReal-77,'si cambia el minimo del Site, la fila sin tocar lo sigue y la manual se queda');
// onEdit
let n0=logs.filter(l=>/Parrillas actualizadas/.test(l[1])).length;
const mkEv=(hoja,col,enc)=>({range:{getSheet:()=>({getName:()=>hoja,getRange:()=>({getValues:()=>[[enc]]})}),getColumn:()=>col,getNumColumns:()=>1}});
vm.runInContext('parOnEdit_',ctx)(mkEv('KAMS Departamentos',2,'GRUPO KAM CATEGORIA'));
const n1=logs.filter(l=>/Parrillas actualizadas/.test(l[1])).length;
vm.runInContext('parOnEdit_',ctx)(mkEv('KAMS Departamentos',1,'DEPARTAMENTO'));
vm.runInContext('parOnEdit_',ctx)(mkEv('Otra hoja',2,'GRUPO KAM CATEGORIA'));
const n2=logs.filter(l=>/Parrillas actualizadas/.test(l[1])).length;
ok(n1===n0+1&&n2===n1,'onEdit: solo recalcula si editas la columna de KAM (o DECISION) en las hojas correctas');
const E=escritas['Estado Killers'];
ok(E&&E.enc.join('|')==='SKU|DESCRIPCION|DEPARTAMENTO|CATEGORIA|KAM|KILLER|INV|PRECIO MEJORADO|PRECIO FULL|EN PARRILLA|AVISO|ESTATUS|COBRO DISTINTO|DECISION|NOTA','Estado Killers: encabezados');
console.log('estado filas',E.filas.length,'con killer',E.filas.filter(x=>x[5]==='SI').length,'sin killer en parrilla',E.filas.filter(x=>x[5]==='NO'&&x[9]==='SI').length);
ok(E.filas.length>400&&E.filas.every(x=>/-(MSI(-\d{1,2})?|CVA-MSI|MSI-CVA)$/i.test(x[0])),'solo -MSI publicados');
ok(E.filas.filter(x=>x[9]==='SI').length===escritas['Parrilla AUDIO'].filas.length+['BELLEZA','COMPUTACION','ELECTRODOMESTICOS','FERRETERIA','FOTOGRAFIA','TV','VIDEOJUEGOS'].reduce((a,g)=>a+escritas['Parrilla '+g].filas.length,0),'EN PARRILLA=SI cuadra con el total de parrillas');
const sp=E.filas.filter(x=>/SIN PRECIO/.test(x[10]));console.log('sin precio publicados:',sp.length,sp.slice(0,2).map(x=>x[0]+' '+x[10]));
ok(E.filas.every(x=>x[5]==='SI'||x[5]==='NO'),'KILLER siempre SI/NO');
// ---- categoria completa en REPUBLICAR (ahora todo en Estado Killers) ----
{
  const E0=()=>escritas['Estado Killers'];
  const col=n=>E0().enc.indexOf(n);
  const persistir=()=>{hojas['Estado Killers']=new Sh('Estado Killers',[E0().enc.slice()].concat(E0().filas.map(x=>x.slice())))};
  const rA=rowA(d1,c1); D2.d[rA][ix('GRUPO KAM CATEGORIA')]='REPUBLICAR';
  r=vm.runInContext('parActualizar_(true)',ctx);
  const iD=col('DECISION'),iN=col('NOTA'),iC=col('CATEGORIA'),iDp=col('DEPARTAMENTO'),iS=col('SKU'),iK=col('KAM'),iP=col('EN PARRILLA'),iA=col('AVISO');
  const de=E0().filas.filter(x=>x[iDp]===d1&&x[iC]===c1);
  ok(de.length>0&&de.every(x=>x[iD]==='REPUBLICAR'&&/^AUTO/.test(x[iN])),'categoria en REPUBLICAR: todos sus SKU quedan en REPUBLICAR (nota AUTO) - '+de.length+' SKU');
  ok(de.every(x=>x[iK]==='REPUBLICAR'&&x[iP]==='NO'&&/SE REPUBLICA/.test(x[iA])),'KAM REPUBLICAR, no entra a parrilla, aviso SE REPUBLICA');
  ok(!(r.sinKam&&Object.keys(r.sinKam).some(k=>k.indexOf(d1)===0&&k.indexOf(c1)>0)),'ya no sale como sin KAM');
  ok(!hojas['Analisis Killers'],'Analisis Killers ya no se escribe');
  persistir();
  const hE2=hojas['Estado Killers'];const rr=hE2.d.findIndex((x,i)=>i>0&&x[iDp]===d1&&x[iC]===c1);
  const sk=hE2.d[rr][iS];
  hE2.d[rr][iD]='TV';hE2.d[rr][iN]='mio';          // el usuario decide un SKU a mano
  r=vm.runInContext('parActualizar_(true)',ctx);
  const f2=E0().filas.find(x=>x[iS]===sk);
  ok(f2[iD]==='TV'&&f2[iN]==='mio','decision a mano en un SKU de categoria REPUBLICAR se respeta (y su nota)');
  persistir();
  D2.d[rowA(d1,c1)][ix('GRUPO KAM CATEGORIA')]='TV';
  r=vm.runInContext('parActualizar_(true)',ctx);
  ok(!E0().filas.some(x=>x[iDp]===d1&&x[iC]===c1&&/^AUTO/.test(x[iN])),'al quitar REPUBLICAR de la categoria, las marcas AUTO desaparecen');
  ok(E0().filas.find(x=>x[iS]===sk)[iD]==='TV','y la decision tuya sigue');
  // migracion: hoja vieja Analisis Killers con una decision -> pasa a Estado Killers y la hoja se quita
  const skX=E0().filas.find(x=>x[iD]===''&&x[iK]==='POR DECIDIR')[iS];
  hojas['Analisis Killers']=new Sh('Analisis Killers',[['SKU','DEPARTAMENTO','CATEGORIA','NOMBRE','ESTATUS','TOTAL','PRECIO FULL','PRECIO MEJORADO','COBRO DISTINTO','DECISION','NOTA'],[skX,'','','','',0,'','','NO','NO ENVIAR','vieja']]);
  persistir();
  r=vm.runInContext('parActualizar_(true)',ctx);
  ok(!hojas['Analisis Killers'],'hoja vieja Analisis Killers se quita');
  const fx=E0().filas.find(x=>x[iS]===skX);ok(fx&&fx[iD]==='NO ENVIAR'&&fx[iN]==='vieja','su decision paso a Estado Killers');
  ok(E0().filas.some(x=>x[col('ESTATUS')]!=='PUBLISHED'),'Estado Killers incluye tambien los no publicados que hay que decidir');
}
// Estado Killers con el formato anterior (sin DECISION): no debe tronar (caso real 23-oct)
hojas['Estado Killers']=new Sh('Estado Killers',[['SKU','DESCRIPCION','DEPARTAMENTO','CATEGORIA','KAM','KILLER','INV','PRECIO MEJORADO','PRECIO FULL','EN PARRILLA','AVISO'],['X-MSI','x','Audio','Bocinas','AUDIO','NO',1,1,1,'SI','']]);
delete hojas['Analisis Killers'];
{let err='';try{vm.runInContext('parActualizar_(true)',ctx)}catch(e){err=e.message}ok(!err,'Estado Killers sin columna DECISION (formato anterior): corre sin error '+err);}
// Grupo nuevo sin correos (JUGUETERIA): se agrega con una fila en la tabla DEPARTAMENTO | GRUPO KAM
{
  const nuevaFila=new Array(D2.d[0].length).fill('');nuevaFila[0]='Juguetes';nuevaFila[1]='JUGUETERIA';
  let ult=D2.d.length;for(let i=1;i<D2.d.length;i++){if(!D2.d[i][0]&&!D2.d[i][1]){ult=i;break}}
  if(ult===D2.d.length)D2.d.push(nuevaFila);else{D2.d[ult][0]='Juguetes';D2.d[ult][1]='JUGUETERIA'}
  delete escritas['Parrilla JUGUETERIA'];
  r=vm.runInContext('parActualizar_(true)',ctx);
  const orden=vm.runInContext('parGrupos_().orden',ctx);
  ok(orden.indexOf('JUGUETERIA')>=0,'JUGUETERIA aparece como grupo (lista de GRUPO KAM CATEGORIA y DECISION) aunque no tenga correo');
  ok(!escritas['Parrilla JUGUETERIA']&&!hojas['Parrilla JUGUETERIA'],'sin SKU todavia: no crea la hoja Parrilla JUGUETERIA');
  const iD=ix('DEPARTAMENTO WALMART'),iC=ix('CATEGORIA WALMART'),iG=ix('GRUPO KAM CATEGORIA');
  const fj=D2.d.findIndex((x,i)=>i>0&&x[iD]==='Juguetes');
  ok(fj>0,'hay una categoria de Juguetes en lo que vendemos');
  D2.d[fj][iG]='JUGUETERIA';
  r=vm.runInContext('parActualizar_(true)',ctx);
  const E=escritas['Estado Killers'];const cK=E.enc.indexOf('KAM'),cDep=E.enc.indexOf('DEPARTAMENTO'),cCat=E.enc.indexOf('CATEGORIA');
  ok(E.filas.filter(x=>x[cDep]==='Juguetes'&&x[cCat]===D2.d[fj][iC]).every(x=>x[cK]==='JUGUETERIA'),'los SKU de esa categoria quedan con KAM JUGUETERIA en Estado Killers');
  ok('JUGUETERIA' in r.cuantos,'JUGUETERIA sale en el resumen de parrillas ('+r.cuantos.JUGUETERIA+' SKU)');
}
console.log(logs.filter(l=>/Parrillas actualizadas/.test(l[1])).slice(-1)[0][1].slice(0,400));
console.log(p+' OK '+f+' FALLA');
