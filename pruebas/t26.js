const fs=require('fs'),vm=require('vm');
const ctx={console};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/Organizar.gs','utf8'),ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const G=vm.runInContext('ORG_GRUPOS',ctx);
const col=(g)=>vm.runInContext(`orgColorPestana_(${JSON.stringify(g)})`,ctx);
Object.keys(G).forEach(k=>{t(col(k)===G[k].color,k+' un solo color para todo el grupo');t(!('alt' in G[k]),k+' sin tono alterno')});
const cs=Object.keys(G).map(k=>G[k].color);
t(new Set(cs).size===cs.length,'no hay dos colores iguales entre grupos');
t(col('NOEXISTE')===null,'grupo desconocido = null');
// orden en que aparecen los grupos en el libro: los vecinos deben distinguirse (distancia de color)
const H=vm.runInContext('ORG_HOJAS',ctx);
H.forEach(f=>t(G[f[1]],'grupo '+f[1]+' de '+f[0]));
const orden=[];H.forEach(f=>{if(orden[orden.length-1]!==f[1])orden.push(f[1])});
const rgb=h=>[1,3,5].map(i=>parseInt(h.substr(i,2),16));
const dist=(a,b)=>{const x=rgb(a),y=rgb(b);return Math.sqrt(x.reduce((s,v,i)=>s+(v-y[i])**2,0))};
for(let i=1;i<orden.length;i++){const a=G[orden[i-1]]&&G[orden[i-1]].color,b=G[orden[i]]&&G[orden[i]].color;if(a&&b)t(dist(a,b)>=120,'vecinos '+orden[i-1]+' y '+orden[i]+' se distinguen (dist '+Math.round(dist(a,b))+')')}
console.log(ok+' OK, '+bad+' fallas');process.exit(bad?1:0);
