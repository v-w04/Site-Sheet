# ============================================================
#  Revision de credenciales antes de subir
# ============================================================
#  Lo llama _seguro.bat. Sale con codigo 1 si encuentra algo.
#
#  Se hace en PowerShell y no en el .bat porque las expresiones
#  regulares con comillas dentro de un .bat son un campo minado.
# ============================================================

$archivos = @()
foreach ($p in @('apps-script\*.gs', 'docs\*.js', 'docs\*.html')) {
    $archivos += Get-ChildItem -Path $p -ErrorAction SilentlyContinue
}
if ($archivos.Count -eq 0) { exit 0 }

# Cada patron: nombre legible + regex
$patrones = @(
    @{ n = 'cookie de sesion';        r = '(PHPSESSID|JSESSIONID|ASP\.NET_SessionId|csrftoken|session_id\s*=\s*\w{8,}|sessionid\s*=\s*\w{8,})' },
    @{ n = 'token Bearer';            r = 'Bearer\s+[A-Za-z0-9\-\._~\+\/]{20,}' },
    @{ n = 'password asignado';       r = '(?i)pass(word|wd)?\s*[:=]\s*["''][^"'']{4,}["'']' },
    @{ n = 'cookie asignada';         r = '(?i)(SITE_COOKIE|cookie)\s*[:=]\s*["''][^"'']{20,}["'']' },
    @{ n = 'llave de API';            r = '(?i)(api[_-]?key|apikey|secret|client[_-]?secret)\s*[:=]\s*["''][^"'']{8,}["'']' }
)

$fuga = 0

foreach ($a in $archivos) {
    $lineas = Get-Content -Path $a.FullName -ErrorAction SilentlyContinue
    for ($i = 0; $i -lt $lineas.Count; $i++) {
        $linea = $lineas[$i]

        # Los comentarios y la documentacion hablan DE las credenciales
        # sin contenerlas. No cuentan.
        if ($linea -match '^\s*(\*|//|#|<!--)') { continue }

        foreach ($p in $patrones) {
            if ($linea -match $p.r) {
                Write-Host ("        ALERTA: " + $p.n + " en " + $a.Name + " linea " + ($i + 1))
                $fuga = 1
                break
            }
        }
    }
}

exit $fuga
