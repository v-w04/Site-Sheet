// t58: ningun nombre global (function/var/const) repetido entre archivos .gs.
// Apps Script carga los .gs en orden alfabetico y el ULTIMO gana: un nombre repetido pisa al otro sin avisar
// (asi PR_HOJA de Promos.gs pisaba al de PedidosRiesgo.gs).
var fs = require('fs'), path = require('path');
var dir = path.join(__dirname, '..', 'apps-script'), d = {}, ok = 0, mal = 0;
fs.readdirSync(dir).filter(function (f) { return /\.gs$/.test(f); }).forEach(function (f) {
  fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).forEach(function (l) {
    var m = l.match(/^(?:var|const|let)\s+(.*)/);
    if (m) (m[1].replace(/'[^']*'|"[^"]*"/g, "''").match(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*=/g) || []).forEach(function (x) {
      var n = x.replace(/[,=\s]/g, ''); (d[n] = d[n] || {})[f] = 1; });
    m = l.match(/^function\s+([A-Za-z_$][\w$]*)/);
    if (m) (d[m[1]] = d[m[1]] || {})[f] = 1;
  });
});
Object.keys(d).forEach(function (n) {
  var fs2 = Object.keys(d[n]);
  if (fs2.length > 1) { mal++; console.log('  FALLA ' + n + ' repetido en ' + fs2.join(', ')); } else ok++;
});
console.log(mal ? '\n' + mal + ' nombres repetidos' : 'ok: ' + ok + ' nombres globales, ninguno repetido');
process.exit(mal ? 1 : 0);
