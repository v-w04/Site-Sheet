const fs=require('fs'),vm=require('vm');
const calls=[];let setv=[];
const noop=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?undefined:noop(),apply:()=>noop()});
function rng(sh,r,c,nr,nc){return new Proxy({setValues:v=>{setv.push([sh,r,c,v]);return rng(sh,r,c,nr,nc)},setValue:v=>{setv.push([sh,r,c,[[v]]]);return rng(sh,r,c,nr,nc)},merge:()=>{calls.push(['merge',sh,r,c,nr,nc]);return rng(sh,r,c,nr,nc)}},{get:(t,k)=>k in t?t[k]:(()=>rng(sh,r,c,nr,nc))})}
const mkSheet=n=>({getRange:(r,c,nr,nc)=>rng(n,r,c,nr||1,nc||1),setName(){},setColumnWidth(){},setRowHeight(){},setFrozenRows(){},setFrozenColumns(){},setBorder(){return noop()}});
const ctx={console,Date,JSON,Math,Object,Array,String,Number,parseInt,isNaN,
 Utilities:{formatDate:(d,z,f)=>f==='M'?'10':f==='yyyy'?'2026':f==='dd'?'22':'26'},TZ:'x',
 SpreadsheetApp:{BorderStyle:{SOLID:1},create:()=>({getId:()=>'id',getSheets:()=>[mkSheet('Killers')],insertSheet:n=>mkSheet(n)}),flush(){},newDataValidation:()=>({requireValueInList(){return this},build(){return {}}})},
 DriveApp:{getFileById:()=>({setTrashed(){}})},exportarXlsx_:(id,n)=>({name:n}),normEnc_:s=>String(s).toUpperCase()};
vm.createContext(ctx);
const S=__dirname+'/../apps-script/';
vm.runInContext(fs.readFileSync(S+'Parrillas.gs','utf8').split('var PAR_ID')[0].split('var PAR_ETAPA')[0]+'',ctx);
vm.runInContext(fs.readFileSync(S+'Parrillas.gs','utf8').match(/var PAR_ENC[\s\S]*?var PAR_USUARIO[^;]*;/)[0].replace('var PAR_USUARIO','var PAR_USUARIO'),ctx);
vm.runInContext("var PAR_SELLER='Electronics.Mexico';var PAR_ID=10001341690;",ctx);
const src=fs.readFileSync(S+'SolicitudKillers.gs','utf8');
vm.runInContext(src.slice(src.indexOf('/** DDmesAA'),src.indexOf('/** Grupos que ya se enviaron')),ctx);
const fila=[10001341690,'Electronics.Mexico','SKU-1-MSI',637902340356,63790234035,'Desc','SI',new Date(),new Date(),48,'SI',1649,1519,'',9999,'','',''];

vm.runInContext(src.slice(src.indexOf('/** Fechas por omision'),src.indexOf('function skAsunto_')),ctx);
let bad=0;const ok=(c,m)=>{console.log((c?'OK ':'FALLA ')+m);if(!c)bad++};
const ini=new Date(2026,10,12),fin=new Date(2026,10,30);
ctx.__f={ini,fin};
vm.runInContext("skXlsx_('AUDIO',["+JSON.stringify(fila)+"],'NOVIEMBRE 2026',1,null,false,__f)",ctx);
const d=setv.filter(x=>x[0]==='Killers'&&x[1]===5).pop()[3][0];
ok(new Date(d[7]).getTime()===ini.getTime()&&new Date(d[8]).getTime()===fin.getTime(),'fechas elegidas mandan sobre la parrilla (aunque traiga otras)');
ok(vm.runInContext("skParseFecha_('2026-11-12').getDate()",ctx)===12,'parse fecha ok');
ok(vm.runInContext("skParseFecha_('2026-02-31')",ctx)===null&&vm.runInContext("skParseFecha_('')",ctx)===null,'fecha invalida -> null');
const D=fs.readFileSync(S+'Dialogos.gs','utf8');
ok(/type="date" data-campo/.test(D),'el formulario sabe pintar calendario');
const K=fs.readFileSync(S+'SolicitudKillers.gs','utf8');
ok(/fFin\.getTime\(\) < fIni\.getTime\(\)/.test(K)&&/id: 'fechaIni'/.test(K)&&/id: 'fechaFin'/.test(K),'campos de fecha y validacion fin>=inicio');
console.log(bad?bad+' FALLAN':'todo ok');process.exit(bad?1:0);
