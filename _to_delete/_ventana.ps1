# _ventana.ps1 - lo llama 5-SUBIR-TODO.bat al arrancar (25-nov-2026).
# Deja la ventana del .bat lo mas grande posible SIN maximizarla (ventana normal, con su barra) y escribe el ANCHO en columnas
# para que el .bat centre su texto. Nunca falla: si algo no se puede, igual escribe el ancho actual (o 80).
$ErrorActionPreference = 'SilentlyContinue'
$ancho = 80
try {
  Add-Type -Name W -Namespace N -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int hh, uint f);
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
'@
  [void][N.W]::SetProcessDPIAware()
  Add-Type -AssemblyName System.Windows.Forms
  $h = [N.W]::GetConsoleWindow()
  $enWT = $false
  if ($env:WT_SESSION) {
    # Windows Terminal: la ventana es la de WindowsTerminal.exe (un ancestro de este proceso)
    $p = $PID
    for ($i = 0; $i -lt 8; $i++) {
      $pp = (Get-CimInstance Win32_Process -Filter "ProcessId=$p").ParentProcessId
      if (-not $pp) { break }
      $pr = Get-Process -Id $pp
      if ($pr -and $pr.ProcessName -eq 'WindowsTerminal' -and $pr.MainWindowHandle -ne [IntPtr]::Zero) { $h = $pr.MainWindowHandle; $enWT = $true; break }
      $p = $pp
    }
  }
  if ($h -ne [IntPtr]::Zero) {
    $wa = [System.Windows.Forms.Screen]::FromHandle($h).WorkingArea
    [void][N.W]::ShowWindow($h, 9)                      # 9 = restaurar (si estaba maximizada, la deja normal)
    if ($enWT) {
      [void][N.W]::SetWindowPos($h, [IntPtr]::Zero, $wa.X, $wa.Y, $wa.Width, $wa.Height, 0x44)   # sin cambiar el orden + mostrar
    } else {
      # consola clasica: el tamano manda en celdas; se pide el maximo que cabe en la pantalla y se pega a la esquina
      $raw = $Host.UI.RawUI
      $max = $raw.MaxPhysicalWindowSize
      if ($max.Width -gt 0) {
        $raw.BufferSize = New-Object System.Management.Automation.Host.Size($max.Width, 3000)
        $raw.WindowSize = New-Object System.Management.Automation.Host.Size($max.Width, [Math]::Max(10, $max.Height - 1))
      }
      [void][N.W]::SetWindowPos($h, [IntPtr]::Zero, $wa.X, $wa.Y, 0, 0, 0x45)                     # solo mover (sin cambiar tamano ni orden)
    }
    Start-Sleep -Milliseconds 800
  }
} catch { }
try { $w = $Host.UI.RawUI.WindowSize.Width; if ($w -ge 40) { $ancho = $w } } catch { }
Write-Output $ancho
