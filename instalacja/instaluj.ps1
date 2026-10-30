# Instalacja i aktualizacja Mikropłatności na tym komputerze.
# Użycie: powershell -NoProfile -ExecutionPolicy Bypass -File instalacja\instaluj.ps1
#
# Buduje aplikację (neu build) i kopiuje pliki programu do %LOCALAPPDATA%\Programs\Mikroplatnosci.
# Pierwsze uruchomienie zakłada skróty na pulpicie i w menu Start, kolejne tylko podmieniają program.
# Dane (%APPDATA%\Mikroplatnosci - plik JSON, kopie, kursy) NIE są tu nigdy ruszane:
# zostają, jak są, a gdy ich nie ma, aplikacja sama utworzy plik przy pierwszym zapisie.

$ErrorActionPreference = 'Stop'
$projekt = Split-Path $PSScriptRoot
$cel = Join-Path $env:LOCALAPPDATA 'Programs\Mikroplatnosci'
$exe = Join-Path $cel 'Mikroplatnosci.exe'

$dzialajaca = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe }
if ($dzialajaca) {
  Write-Host 'Mikropłatności są otwarte - zamknij okno aplikacji i uruchom instalację jeszcze raz.' -ForegroundColor Yellow
  exit 1
}

Push-Location $projekt
try {
  & (Join-Path $projekt 'node_modules\.bin\neu.cmd') build
  if ($LASTEXITCODE -ne 0) { throw 'Budowanie aplikacji nie powiodło się.' }
} finally {
  Pop-Location
}

$dist = Join-Path $projekt 'dist\mikroplatnosci'
$pierwszaInstalacja = -not (Test-Path $exe)
New-Item -ItemType Directory -Force $cel | Out-Null
Copy-Item (Join-Path $dist 'mikroplatnosci-win_x64.exe') $exe -Force
Copy-Item (Join-Path $dist 'resources.neu') (Join-Path $cel 'resources.neu') -Force
Copy-Item (Join-Path $PSScriptRoot 'ikona.ico') (Join-Path $cel 'ikona.ico') -Force

$skroty = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Mikropłatności.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'Mikropłatności.lnk')
)
if ($pierwszaInstalacja) {
  $powloka = New-Object -ComObject WScript.Shell
  foreach ($sciezka in $skroty) {
    $skrot = $powloka.CreateShortcut($sciezka)
    $skrot.TargetPath = $exe
    $skrot.WorkingDirectory = $cel
    $skrot.IconLocation = (Join-Path $cel 'ikona.ico') + ',0'
    $skrot.Description = 'Mikropłatności - pilnowanie subskrypcji i drobnych płatności'
    $skrot.Save()
  }
}

$wersja = (Get-Content (Join-Path $projekt 'neutralino.config.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
if ($pierwszaInstalacja) {
  Write-Host "Zainstalowano Mikropłatności $wersja w $cel (skróty: pulpit i menu Start)." -ForegroundColor Green
} else {
  Write-Host "Zaktualizowano Mikropłatności do wersji $wersja - dane bez zmian." -ForegroundColor Green
}
