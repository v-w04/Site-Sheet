// Simula el incidente de Killers activos: A1 vacio con SKU viejos desfasados; el SKU bueno quedo al final.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Math,Date,Number,String,Object,Array};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('../apps-script/Columnas.gs','utf8'),ctx);
function hoja(v){return {getLastColumn:()=>v[0].length,getLastRow:()=>v.length,getRange:(r,c,nr,nc)=>({getValues:()=>v.slice(r-1,r-1+nr).map(f=>f.slice(c-1,c-1+nc))})}}
const skus=['A1','B2','C3','D4','E5','F6'], titulos=['ta','tb','tc','td','te','tf'];
let v=[['','TITULO','SKU']]; for(let i=0;i<6;i++) v.push([skus[i===5?5:i+ (i>=2?1:0)]||'',titulos[i],skus[i]]);
v[5][0]='F6'; v[6][0]='';           // A desfasada y con un hueco
let p=ctx.encRevisarHoja_(hoja(v),['TITULO','SKU'],1);
console.log(JSON.stringify(p.map(x=>x.tipo+':'+x.texto.slice(0,70))));
if(!p.some(x=>x.tipo==='COPIA')) {console.log('FALLO: no detecto copia vieja');process.exit(1)}
// hoja sana
let ok=ctx.encRevisarHoja_(hoja([['SKU','TITULO'],['A','x'],['B','y']]),['SKU','TITULO'],1);
if(ok.length){console.log('FALLO: hoja sana con problemas',ok);process.exit(1)}
// repetido y falta
let d=ctx.encRevisarHoja_(hoja([['SKU','SKU','X'],['A','A','1']]),['SKU','TITULO'],1);
console.log(d.map(x=>x.tipo).join(','));
if(d.map(x=>x.tipo).join(',')!=='REPETIDO,FALTA'){console.log('FALLO repetido/falta');process.exit(1)}
console.log('t_enc OK');
