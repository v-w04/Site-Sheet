// t54: blindaje de minimos: si la tabla de minimos cae de golpe, no se agrega nada a Cancelaciones.
const fs=require('fs');let src=fs.readFileSync(__dirname+'/../apps-script/PreciosErroneos.gs','utf8');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
t(/prevN >= 100 && tabla\.n < prevN \* 0\.8/.test(src),'guarda la caida de minimos (80% del ultimo conteo)');
t(/if \(cand\.length && minOk\) res\.aCancelaciones = canpAgregar_\(cand\)/.test(src),'sin minimos confiables no se agrega a Cancelaciones');
t(/props_\(\)\.setProperty\('PE_MIN_N'/.test(src),'guarda el conteo bueno');
console.log('t54: '+ok+' ok, '+bad+' fallas');process.exit(bad?1:0);
