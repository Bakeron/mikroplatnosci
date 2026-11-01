# Instalacja i aktualizacja Mikropłatności na tym komputerze.
# Użycie: powershell -NoProfile -ExecutionPolicy Bypass -File pc\instalacja\instaluj.ps1
# Z -Instalator: zamiast instalować tutaj, buduje instalator dla innych osób
# (pc\dist\Mikroplatnosci-instalator-<wersja>.exe, Inno Setup, skrypt instalator.iss).
#
# Buduje aplikację (neu build) i kopiuje pliki programu do %LOCALAPPDATA%\Programs\Mikroplatnosci.
# Pierwsze uruchomienie zakłada skróty na pulpicie i w menu Start, kolejne tylko podmieniają program.
# Dane (%APPDATA%\Mikroplatnosci - plik JSON, kopie, kursy) NIE są tu nigdy ruszane:
# zostają, jak są, a gdy ich nie ma, aplikacja sama utworzy plik przy pierwszym zapisie.

param([switch]$Instalator)

$ErrorActionPreference = 'Stop'
$projekt = Split-Path $PSScriptRoot
$cel = Join-Path $env:LOCALAPPDATA 'Programs\Mikroplatnosci'
$exe = Join-Path $cel 'Mikroplatnosci.exe'

$dzialajaca = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe }
if ($dzialajaca -and -not $Instalator) {
  Write-Host 'Mikropłatności są otwarte - zamknij okno aplikacji i uruchom instalację jeszcze raz.' -ForegroundColor Yellow
  exit 1
}

# Najpierw testy - zmiana, która psuje obliczenia albo odczyt danych, nie trafi do zainstalowanej aplikacji.
Push-Location $projekt
try {
  & npm.cmd test --silent
  if ($LASTEXITCODE -ne 0) { throw 'Testy nie przechodzą - instalacja przerwana, zainstalowana wersja bez zmian.' }
} finally {
  Pop-Location
}

# Numer wersji = data i godzina budowania (widoczny w aplikacji w prawym dolnym rogu).
# Ten sam format co w mobile/skrypty/przygotuj.mjs - numery z PC i telefonu dają się porównać.
$wersja = Get-Date -Format 'yyyy.MM.dd.HHmm'
[IO.File]::WriteAllText((Join-Path $projekt 'resources\js\wersja.js'), "window.WERSJA_APLIKACJI = '$wersja';`n")

# Identyfikator aplikacji Google (projekt autora) wbudowany w aplikację - tak samo jak w APK
# (mobile/skrypty/przygotuj.mjs). To identyfikator aplikacji, nie konta: każdy loguje się swoim kontem
# Google. Bez zmiennych MIKROPLATNOSCI_GOOGLE_* plik jest pusty i identyfikator wpisuje się w aplikacji.
# Plik poza gitem (.gitignore), trafia tylko do resources.neu.
function Zmienna($nazwa) {
  $w = [Environment]::GetEnvironmentVariable($nazwa, 'Process')
  if (-not $w) { $w = [Environment]::GetEnvironmentVariable($nazwa, 'User') }
  if ($w) { $w.Trim() } else { '' }
}
$klucze = [ordered]@{
  MIKROPLATNOSCI_GOOGLE_ID = Zmienna 'MIKROPLATNOSCI_GOOGLE_ID'
  MIKROPLATNOSCI_GOOGLE_SECRET = Zmienna 'MIKROPLATNOSCI_GOOGLE_SECRET'
}
[IO.File]::WriteAllText((Join-Path $projekt 'resources\js\google.js'), "window.GOOGLE_KLUCZE = $($klucze | ConvertTo-Json -Compress);`n")

Push-Location $projekt
try {
  & (Join-Path $projekt 'node_modules\.bin\neu.cmd') build
  if ($LASTEXITCODE -ne 0) { throw 'Budowanie aplikacji nie powiodło się.' }
} finally {
  Pop-Location
}

$dist = Join-Path $projekt 'dist\mikroplatnosci'

if ($Instalator) {
  # Inno Setup 6 (darmowy) - instaluje autor: winget install JRSoftware.InnoSetup
  $iscc = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
    (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $iscc) { throw 'Brak Inno Setup 6 - zainstaluj: winget install JRSoftware.InnoSetup' }
  & $iscc /Q "/DWersja=$wersja" "/DDist=$dist" "/DWyjscie=$(Join-Path $projekt 'dist')" (Join-Path $PSScriptRoot 'instalator.iss')
  if ($LASTEXITCODE -ne 0) { throw 'Budowanie instalatora nie powiodło się.' }
  Write-Host "Instalator gotowy: pc\dist\Mikroplatnosci-instalator-$wersja.exe" -ForegroundColor Green
  exit 0
}
$pierwszaInstalacja = -not (Test-Path $exe)
New-Item -ItemType Directory -Force $cel | Out-Null
Copy-Item (Join-Path $dist 'mikroplatnosci-win_x64.exe') $exe -Force
Copy-Item (Join-Path $dist 'resources.neu') (Join-Path $cel 'resources.neu') -Force
Copy-Item (Join-Path $PSScriptRoot 'ikona.ico') (Join-Path $cel 'ikona.ico') -Force

if ($pierwszaInstalacja) {
  $skroty = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Mikropłatności.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'Mikropłatności.lnk')
  )
  $powloka = New-Object -ComObject WScript.Shell
  foreach ($sciezka in $skroty) {
    $skrot = $powloka.CreateShortcut($sciezka)
    $skrot.TargetPath = $exe
    $skrot.WorkingDirectory = $cel
    $skrot.IconLocation = (Join-Path $cel 'ikona.ico') + ',0'
    $skrot.Description = 'Mikropłatności - pilnowanie subskrypcji i drobnych płatności'
    $skrot.Save()
  }
  Write-Host "Zainstalowano Mikropłatności $wersja w $cel (skróty: pulpit i menu Start)." -ForegroundColor Green
} else {
  Write-Host "Zaktualizowano Mikropłatności do wersji $wersja - dane bez zmian." -ForegroundColor Green
}
