# Ikony Androida i ekran startowy z tego samego rysunku co ikona PC (pc\instalacja\rysuj-ikone.ps1).
# Użycie (raz, po npx cap add android albo po zmianie ikony):
#   powershell -NoProfile -ExecutionPolicy Bypass -File mobile\skrypty\ikony.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$mobile = Split-Path $PSScriptRoot
$res = Join-Path $mobile 'android\app\src\main\res'

# Funkcje rysujące z pliku ikony PC (bez części, która zapisuje plik .ico).
$zrodlo = Get-Content (Join-Path $mobile '..\pc\instalacja\rysuj-ikone.ps1') -Raw -Encoding UTF8
$zrodlo = $zrodlo.Substring(0, $zrodlo.IndexOf('New-Item -ItemType Directory')) -replace '(?m)^\s*param\(.*\)\s*$', ''
Invoke-Expression $zrodlo

function Zapisz($bmp, [string]$plik) {
  $bmp.Save($plik, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

# Obraz w rozmiarze $plotno z ikoną $ikona px na środku, na tle $tlo (albo przezroczystym).
function NaPlotnie([int]$plotnoW, [int]$plotnoH, [int]$ikona, [string]$tlo) {
  $bmp = New-Object System.Drawing.Bitmap $plotnoW, $plotnoH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  if ($tlo) { $g.Clear((Kolor $tlo)) }
  $obraz = Rysuj $ikona
  $g.DrawImage($obraz, [int](($plotnoW - $ikona) / 2), [int](($plotnoH - $ikona) / 2), $ikona, $ikona)
  $obraz.Dispose()
  $g.Dispose()
  $bmp
}

$gestosci = @{ 'mdpi' = 1; 'hdpi' = 1.5; 'xhdpi' = 2; 'xxhdpi' = 3; 'xxxhdpi' = 4 }
foreach ($g in $gestosci.Keys) {
  $k = $gestosci[$g]
  $folder = Join-Path $res "mipmap-$g"
  # starsze Androidy: cała ikona 48 dp
  Zapisz (Rysuj ([int](48 * $k))) (Join-Path $folder 'ic_launcher.png')
  Zapisz (Rysuj ([int](48 * $k))) (Join-Path $folder 'ic_launcher_round.png')
  # Android 8+: warstwa 108 dp przycinana do kółka - ikona 52 dp mieści się w nim cała
  Zapisz (NaPlotnie ([int](108 * $k)) ([int](108 * $k)) ([int](52 * $k)) $null) (Join-Path $folder 'ic_launcher_foreground.png')
}

# tło ikony adaptacyjnej - kolor kartki zeszytu
$tloXml = Join-Path $res 'values\ic_launcher_background.xml'
(Get-Content $tloXml -Raw) -replace '#[0-9A-Fa-f]{6}', '#F4EFE3' | Set-Content $tloXml -Encoding UTF8 -NoNewline

# ekran startowy: ikona na ciemnym tle aplikacji (motyw „noc”)
foreach ($plik in Get-ChildItem $res -Recurse -Filter 'splash.png') {
  $stary = [System.Drawing.Image]::FromFile($plik.FullName)
  $w = $stary.Width; $h = $stary.Height
  $stary.Dispose()
  Zapisz (NaPlotnie $w $h ([int]([Math]::Min($w, $h) * 0.28)) '#191b20') $plik.FullName
}

Write-Host 'Ikony i ekran startowy Androida gotowe.' -ForegroundColor Green
