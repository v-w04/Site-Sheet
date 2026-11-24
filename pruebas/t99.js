// t99: _publicar.js (24-nov): el .bat crea la version y actualiza el Web App; avisa desde 150 versiones. clasp simulado, nada real.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
let ok = 0, bad = 0; const t = (c, m) => { c ? ok++ : (bad++, console.log('FALLA', m)); };
const RAIZ = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't99-'));
const proy = path.join(tmp, 'proy'); fs.mkdirSync(path.join(proy, 'apps-script'), { recursive: true });
fs.writeFileSync(path.join(proy, 'apps-script', 'A.gs'), 'function a(){}\r\n');
fs.writeFileSync(path.join(proy, 'apps-script', 'appsscript.json'), '{}');
const estadoStub = path.join(tmp, 'stub.json'), logStub = path.join(tmp, 'stub.log');
// clasp falso: version -> "Created version N."; deploy -> "Deployed ID @N"; versions -> lista; deployments -> lista
const stub = path.join(tmp, 'clasp-falso.js');
fs.writeFileSync(stub, `#!/usr/bin/env node
const fs=require('fs');const E=${JSON.stringify(estadoStub)},L=${JSON.stringify(logStub)};
let s={ver:10,vers:[1,2,3,4,5,6,7,8,9,10],dep:null,falla:{}};try{s=JSON.parse(fs.readFileSync(E,'utf8'))}catch(e){}
const a=process.argv.slice(2);fs.appendFileSync(L,a.join(' ')+'\\n');const cmd=a[0];
const fin=(o)=>{fs.writeFileSync(E,JSON.stringify(s));process.exit(o||0)};
if(cmd==='version'){ if(s.falla.version){console.error(s.falla.version);fin(1)} s.ver++;s.vers.push(s.ver);console.log('Created version '+s.ver+'.');fin(0)}
if(cmd==='deploy'){ if(s.falla.deploy){console.error(s.falla.deploy);fin(1)} const v=a[a.indexOf('-V')+1],id=a[a.indexOf('-i')+1];s.dep={id:id,v:v};console.log('Deployed '+id+' @'+v+'.');fin(0)}
if(cmd==='versions'){ console.log(s.vers.length+' Versions');s.vers.forEach(n=>console.log(n+' - Auto'));fin(0)}
if(cmd==='deployments'){ console.log('2 Deployments');console.log('- AKfyHEAD @HEAD');if(s.dep&&!s.sinLista)console.log('- '+s.dep.id+' @'+s.dep.v+' - Auto');fin(0)}
process.exit(1);
`);
fs.chmodSync(stub, 0o755);
const ID = 'AKfycbPRUEBA-123';
const estado = (o) => { const s = JSON.parse(fs.readFileSync(estadoStub, 'utf8')); return o ? Object.assign(s, o) : s; };
const poner = (o) => fs.writeFileSync(estadoStub, JSON.stringify(Object.assign(estado(), o)));
const llamadas = () => { try { return fs.readFileSync(logStub, 'utf8').split('\n').filter(Boolean); } catch (e) { return []; } };
const correr = (args, env) => {
  const r = cp.spawnSync(process.execPath, [path.join(RAIZ, '_publicar.js')].concat(args || []), { cwd: proy, encoding: 'utf8',
    env: Object.assign({}, process.env, { NO_COLOR: '1', CLASP_CMD: stub, WEBAPP_DEPLOY_ID: ID }, env || {}) });
  return { code: r.status, out: String(r.stdout) + String(r.stderr) };
};
const cuenta = (c) => llamadas().filter((l) => l.split(' ')[0] === c).length;   // primer palabra exacta: 'version' no cuenta 'versions'
fs.writeFileSync(estadoStub, JSON.stringify({ ver: 10, vers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], dep: null, falla: {} }));

// 1) sin WEBAPP_DEPLOY_ID
let r = correr([], { WEBAPP_DEPLOY_ID: '' });
t(r.code === 2 && /falta WEBAPP_DEPLOY_ID/.test(r.out) && llamadas().length === 0, 'sin id: sale 2, avisa y no toca clasp');

// 2) primera corrida: version nueva + deploy al MISMO id + estado guardado
r = correr();
t(r.code === 0 && /version 11 publicada/.test(r.out), 'primera corrida publica la 11: ' + r.out.trim());
t(llamadas().some((l) => /^deploy -V 11 -i AKfycbPRUEBA-123 -d Auto /.test(l)), 'deploy a la implementacion existente (-i id, -V 11)');
t(estado().dep.id === ID, 'el deploy llego al id configurado (misma URL)');
const g = JSON.parse(fs.readFileSync(path.join(proy, 'publicado-appsscript.json'), 'utf8'));
t(g.version === 11 && g.desplegada === true && g.versiones === 11, 'estado guardado: v11, desplegada, 11 versiones');
t(/versiones en Apps Script: 11 de 200/.test(r.out), 'muestra el conteo normal');

// 3) mismo codigo: no gasta otra version
const antes = cuenta('version');
r = correr();
t(r.code === 0 && /al dia \(version 11\)/.test(r.out) && cuenta('version') === antes, 'mismo codigo: no crea otra version');
// y los saltos de linea no cuentan
fs.writeFileSync(path.join(proy, 'apps-script', 'A.gs'), 'function a(){}\n');
r = correr();
t(/al dia/.test(r.out) && cuenta('version') === antes, 'CRLF vs LF no cuenta como cambio');

// 4) codigo nuevo: version 12
fs.writeFileSync(path.join(proy, 'apps-script', 'B.gs'), 'function b(){}\n');
r = correr();
t(r.code === 0 && /version 12 publicada/.test(r.out) && estado().dep.v === '12', 'codigo nuevo: sube la 12');

// 5) falla el deploy: la version queda creada, NO se dice publicada, y el reintento no crea otra
fs.writeFileSync(path.join(proy, 'apps-script', 'C.gs'), 'function c(){}\n');
poner({ falla: { deploy: 'Error: deployment not found' } });
r = correr();
t(r.code === 1 && /NO se publico/.test(r.out) && /revisa WEBAPP_DEPLOY_ID/.test(r.out) && !/publicada en el Web App/.test(r.out), 'deploy falla: sale 1, lo dice y no finge exito: ' + r.out.trim());
t(JSON.parse(fs.readFileSync(path.join(proy, 'publicado-appsscript.json'), 'utf8')).desplegada === false, 'estado: version creada, no desplegada');
const v13 = cuenta('version');
poner({ falla: {} });
r = correr();
t(r.code === 0 && /reintentando publicar la version 13/.test(r.out) && cuenta('version') === v13 && estado().dep.v === '13', 'reintento: publica la 13 sin crear la 14');

// 6) limite de versiones
fs.writeFileSync(path.join(proy, 'apps-script', 'D.gs'), 'function d(){}\n');
poner({ falla: { version: 'Error: Exceeded maximum number of versions' } });
r = correr();
t(r.code === 1 && /LIMITE DE VERSIONES/.test(r.out) && /borra versiones viejas/.test(r.out) && /sigue con el codigo anterior/.test(r.out), 'limite: avisa que borre versiones y que sigue el codigo anterior');
poner({ falla: {} });

// 7) aviso desde 150 (rojo) y urgente desde 185
const vers = []; for (let i = 1; i <= 151; i++) vers.push(i);
fs.writeFileSync(path.join(proy, 'apps-script', 'E.gs'), 'function e(){}\n');
poner({ vers: vers, ver: 151 });
r = correr();
t(r.code === 0 && /! +\d+ de 200 versiones: ya toca borrar/.test(r.out), 'desde 150: avisa que toca borrar a mano: ' + r.out.trim());
const vers2 = []; for (let i = 1; i <= 190; i++) vers2.push(i);
fs.writeFileSync(path.join(proy, 'apps-script', 'F.gs'), 'function f(){}\n');
poner({ vers: vers2, ver: 190 });
r = correr();
t(/DE 200 VERSIONES: BORRA LAS VIEJAS YA/.test(r.out), 'desde 185: aviso urgente');
// con codigo sin cambios sigue avisando desde lo guardado
r = correr();
t(/al dia/.test(r.out) && /BORRA LAS VIEJAS YA/.test(r.out), 'sin cambios tambien repite el aviso mientras siga alto');

// 8) --forzar crea version aunque no haya cambios
const n0 = cuenta('version');
r = correr(['--forzar']);
t(r.code === 0 && cuenta('version') === n0 + 1, '--forzar publica aunque no haya cambios');

// 9) clasp no deja leer la lista: no inventa confirmacion pero tampoco falla
fs.writeFileSync(path.join(proy, 'apps-script', 'G.gs'), 'function g(){}\n');
const salida = path.join(tmp, 'clasp-mudo.js');
fs.writeFileSync(salida, `#!/usr/bin/env node
const a=process.argv.slice(2);if(a[0]==='version'){console.log('Created version 300.');process.exit(0)}
if(a[0]==='deploy'){console.log('ok');process.exit(0)}process.exit(1);`);
fs.chmodSync(salida, 0o755);
r = correr([], { CLASP_CMD: salida });
t(r.code === 0 && /no pude leer la lista para confirmarlo/.test(r.out) && !/publicada en el Web App/.test(r.out), 'si no puede confirmar, lo dice (sin verde falso)');

// 10) los .bat llaman al helper y ya no mandan a publicar a mano
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
['5-SUBIR-TODO.bat', '2-SUBIR-A-APPSCRIPT.bat'].forEach((f) => {
  const b = leer(f);
  t(/_publicar\.js/.test(b), f + ': llama a _publicar.js');
  t(!/FALTA PUBLICAR VERSION|NO SE SI FALTA PUBLICAR/.test(b), f + ': ya no pide publicar a mano');
  t(!/:REVISARVERSION/.test(b), f + ': sin la heuristica vieja de versiones');
  t(/\r\n/.test(b) && !/[^\x00-\x7f]/.test(b), f + ': ASCII y CRLF');
});
t(/WEBAPP_DEPLOY_ID/.test(leer('_config.bat')) && /AKfycby85T2KwoDZb-kTPFlXbyXcTR9aMiRQZNzHhvgkHSb13JXX0NeYJUH0kAABi-GWWZHB/.test(leer('_config.bat')), '_config.bat trae el id del Web App vigente');
t(/publicado-appsscript\.json/.test(leer('.gitignore')), '.gitignore: el estado local no se sube a GitHub');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? ('FALLAN ' + bad) : ('t99 ok ' + ok)); process.exit(bad ? 1 : 0);
