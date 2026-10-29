const fs=require('fs'),vm=require('vm');
const ctx={console};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/Organizar.gs','utf8'),ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const G=vm.runInContext('ORG_GRUPOS',ctx);
const col=(g,k)=>vm.runInContext(`orgColorPestana_(${JSON.stringify(g)},${k})`,ctx);
Object.keys(G).forEach(k=>{t(col(k,0)===G[k].color&&col(k,1)===G[k].alt&&col(k,2)===G[k].color,k+' alterna fuerte/claro');t(col(k,0)!==col(k,1),k+' tonos distintos')});
const fuertes=Object.keys(G).map(k=>G[k].color), alts=Object.keys(G).map(k=>G[k].alt);
t(new Set(fuertes.concat(alts)).size===fuertes.length*2,'no hay dos colores iguales entre grupos');
t(col('NOEXISTE',0)===null,'grupo desconocido = null');
// todo grupo usado en ORG_HOJAS existe
const H=vm.runInContext('ORG_HOJAS',ctx);H.forEach(f=>t(G[f[1]],'grupo '+f[1]+' de '+f[0]));
console.log(ok+' OK, '+bad+' fallas');process.exit(bad?1:0);
