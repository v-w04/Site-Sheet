// ============================================================
//  _publicar.js - crea una version nueva de Apps Script y la pone
//  en el Web App (misma URL, mismo deployment). Lo llaman
//  5-SUBIR-TODO.bat y 2-SUBIR-A-APPSCRIPT.bat DESPUES del push.
//
//  Ella ya no publica ni implementa versiones a mano (24-nov-2026):
//  el .bat lo hace. Lo unico manual que le queda es BORRAR versiones
//  viejas en el editor cuando se acerque al limite (Apps Script
//  permite 200 por proyecto); aqui se cuenta y se avisa desde 150.
//
//  Uso:  node _publicar.js [--forzar]
//  Entorno: WEBAPP_DEPLOY_ID (viene de _config.bat), CLASP_CMD (opcional, para pruebas).
//  Salida: 0 = publicada o ya al dia · 1 = fallo (el Web App sigue con el codigo anterior) · 2 = falta configurar.
//
//  Decide SOLO si hay codigo nuevo: guarda un hash de apps-script/ en
//  publicado-appsscript.json (no se sube a GitHub). Si el hash no cambio
//  no crea otra version (cada una gasta de las 200).
//  Solo ASCII: la consola de CMD no lee bien los acentos de node.
// ============================================================
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');

const AVISO_VERSIONES = 150;     // desde aqui avisa en rojo
const LIMITE_VERSIONES = 200;    // tope de Apps Script
const CRITICO_VERSIONES = 185;   // a partir de aqui el aviso es urgente
const CARPETA = 'apps-script';
const ESTADO = 'publicado-appsscript.json';

const forzar = process.argv.indexOf('--forzar') >= 0;
const idDeploy = String(process.env.WEBAPP_DEPLOY_ID || '').trim();
const CLASP = process.env.CLASP_CMD || 'clasp';
const raiz = process.cwd();

const ESC = String.fromCharCode(27);
const color = process.env.NO_COLOR ? { azul: '', verde: '', rojo: '', fin: '' }
  : { azul: ESC + '[38;2;31;148;249m', verde: ESC + '[38;2;63;185;80m', rojo: ESC + '[38;2;248;81;73m', fin: ESC + '[0m' };
const dice = (txt) => console.log('          ' + txt);
const malo = (txt) => console.log('          ' + color.rojo + txt + color.fin);
const bueno = (txt) => console.log('          ' + color.verde + txt + color.fin);

function leerEstado() {
  try { return JSON.parse(fs.readFileSync(path.join(raiz, ESTADO), 'utf8')) || {}; } catch (e) { return {}; }
}
function guardarEstado(e) {
  try { fs.writeFileSync(path.join(raiz, ESTADO), JSON.stringify(e, null, 1)); } catch (err) { dice('(no pude guardar ' + ESTADO + ': ' + err.message + ')'); }
}

/** Hash de TODO lo que clasp sube (apps-script/**). Los saltos de linea no cuentan: CRLF y LF dan lo mismo. */
function hashCodigo() {
  const h = crypto.createHash('sha1');
  const recorre = (dir, rel) => {
    fs.readdirSync(dir).sort().forEach((n) => {
      const p = path.join(dir, n), r = rel ? rel + '/' + n : n;
      const st = fs.statSync(p);
      if (st.isDirectory()) return recorre(p, r);
      h.update(r + '\n');
      h.update(fs.readFileSync(p, 'utf8').replace(/\r/g, ''));
      h.update('\n--\n');
    });
  };
  recorre(path.join(raiz, CARPETA), '');
  return h.digest('hex');
}

function ahoraTxt() {
  const d = new Date(), z = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
}

/** Corre clasp. Devuelve {ok, texto}. El texto junta stdout y stderr. */
function clasp(args) {
  const r = cp.spawnSync('"' + CLASP + '" ' + args, { shell: true, encoding: 'utf8', cwd: raiz, timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
  const texto = String(r.stdout || '') + '\n' + String(r.stderr || '');
  return { ok: r.status === 0 && !r.error, texto: texto.replace(/\u001b\[[0-9;]*m/g, '').trim() };
}
const ultimasLineas = (t, n) => t.split(/\r?\n/).filter((x) => x.trim()).slice(-n).map((x) => x.trim().slice(0, 160));

/** Lee la lista de versiones: {n: cuantas hay, max: el numero mas alto}. null si no se pudo leer. */
function listarVersiones() {
  const r = clasp('versions');
  if (!r.ok) return null;
  const nums = [];
  r.texto.split(/\r?\n/).forEach((l) => { const m = l.match(/^\s*(?:[-*]\s*)?(\d+)\s*[-:]/); if (m) nums.push(parseInt(m[1], 10)); });   // "12 - descripcion"
  const enc = r.texto.match(/(\d+)\s+versions?\b/i);                                                                                     // "12 Versions"
  const n = enc ? parseInt(enc[1], 10) : nums.length;
  if (!n) return null;
  return { n: n, max: nums.length ? Math.max.apply(null, nums) : 0 };
}

function avisarVersiones(n) {
  if (n === null || n === undefined) return;
  if (n >= CRITICO_VERSIONES) {
    malo('!!  ' + n + ' DE ' + LIMITE_VERSIONES + ' VERSIONES: BORRA LAS VIEJAS YA en Apps Script');
    malo('    al llegar a ' + LIMITE_VERSIONES + ' ya no se puede publicar y el Web App se queda con el codigo anterior');
  } else if (n >= AVISO_VERSIONES) {
    malo('!  ' + n + ' de ' + LIMITE_VERSIONES + ' versiones: ya toca borrar las viejas en Apps Script (tu lo haces a mano)');
  } else {
    dice('versiones en Apps Script: ' + n + ' de ' + LIMITE_VERSIONES);
  }
}

function main() {
  if (!idDeploy) {
    malo('x  falta WEBAPP_DEPLOY_ID en _config.bat: no se publico la version');
    return 2;
  }
  if (!fs.existsSync(path.join(raiz, CARPETA))) { malo('x  no existe la carpeta ' + CARPETA); return 2; }

  const hash = hashCodigo();
  const est = leerEstado();
  const desc = 'Auto ' + ahoraTxt();

  // 1) Mismo codigo que la ultima vez que se publico: no se gasta otra version.
  if (!forzar && est.hash === hash && est.desplegada) {
    bueno('Web App al dia (version ' + est.version + '): no hay codigo nuevo');
    avisarVersiones(est.versiones);
    return 0;
  }

  // 2) Version: si una corrida anterior la creo y no alcanzo a publicarla, se reutiliza.
  let ver = (!forzar && est.hash === hash && est.version && !est.desplegada) ? est.version : 0;
  if (ver) {
    dice('reintentando publicar la version ' + ver + ' (ya estaba creada)');
  } else {
    const v = clasp('version "' + desc + '"');
    if (!v.ok) {
      const limite = /limit|maximum|exceed|too many|quota|exhaust/i.test(v.texto);
      if (limite) {
        malo('x  LIMITE DE VERSIONES: Apps Script no deja crear otra (maximo ' + LIMITE_VERSIONES + ')');
        malo('   borra versiones viejas en el editor de Apps Script y vuelve a correr este .bat');
      } else {
        malo('x  no pude crear la version nueva');
        ultimasLineas(v.texto, 4).forEach((l) => malo('   ' + l));
        if (/auth|login|credential|permission|scope|invalid_grant/i.test(v.texto)) malo('   sesion o permisos de clasp: corre 1-INSTALAR-CLASP.bat');
      }
      malo('   el Web App sigue con el codigo anterior');
      return 1;
    }
    const m = v.texto.match(/version\s+#?(\d+)/i);
    ver = m ? parseInt(m[1], 10) : 0;
    if (!ver) { const l0 = listarVersiones(); ver = l0 ? l0.max : 0; }   // la salida de clasp cambia: el numero mas alto de la lista es el que acaba de crear
    if (!ver) { malo('x  se creo la version pero no pude leer su numero: ' + ultimasLineas(v.texto, 2).join(' | ')); return 1; }
    guardarEstado({ hash: hash, version: ver, desplegada: false, fecha: desc, versiones: est.versiones });
  }

  // 3) Publicar esa version en el MISMO deployment (la URL /exec no cambia).
  const d = clasp('deploy -V ' + ver + ' -i "' + idDeploy + '" -d "' + desc + '"');
  if (!d.ok) {
    malo('x  la version ' + ver + ' se creo pero NO se publico en el Web App');
    ultimasLineas(d.texto, 4).forEach((l) => malo('   ' + l));
    if (/not found|no existe|404|deployment/i.test(d.texto)) malo('   revisa WEBAPP_DEPLOY_ID en _config.bat');
    if (/auth|login|credential|permission|scope|invalid_grant/i.test(d.texto)) malo('   sesion o permisos de clasp: corre 1-INSTALAR-CLASP.bat');
    malo('   el Web App sigue con el codigo anterior; vuelve a correr este .bat');
    return 1;
  }

  // 4) Confirmar contra la lista de implementaciones (la salida de clasp cambia entre versiones).
  const lista = clasp('deployments');
  const arroba = new RegExp('@' + ver + '(?!\\d)');
  const confirmada = (lista.ok && lista.texto.indexOf(idDeploy) >= 0 && arroba.test(lista.texto)) || arroba.test(d.texto);

  const lv = listarVersiones();
  const versiones = lv ? lv.n : null;
  guardarEstado({ hash: hash, version: ver, desplegada: true, fecha: desc, versiones: versiones === null ? est.versiones : versiones });

  if (confirmada) bueno('version ' + ver + ' publicada en el Web App (misma URL)');
  else dice('version ' + ver + ' enviada al Web App (clasp dijo ok; no pude leer la lista para confirmarlo)');
  avisarVersiones(versiones);
  return 0;
}

let codigo;
try { codigo = main(); } catch (e) { malo('x  _publicar.js fallo: ' + (e && e.message ? e.message : e)); codigo = 1; }
process.exit(codigo);
