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
const r=vm.runInContext("skXlsx_('AUDIO',["+JSON.stringify(fila)+"],'NOVIEMBRE 2026',1)",ctx);
console.log(r);
const k=setv.filter(x=>x[0]==='Killers');
const enc=k.find(x=>x[1]===4)[3][0];console.log(enc.length,enc.slice(0,16).join('|'));
const d=k.find(x=>x[1]===5)[3][0];console.log(d.length,d.slice(0,16));
console.log('escenarios 14..:',d.slice(11,16),d.slice(16,20),d.slice(24,28));
console.log(calls.length+' merges',calls.slice(0,4).map(x=>x.slice(2).join(',')).join(' ; '));
