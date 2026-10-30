param([string]$Wyjscie)
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

function Kolor([string]$hex, [int]$a = 255) {
  $c = [System.Drawing.ColorTranslator]::FromHtml($hex)
  [System.Drawing.Color]::FromArgb($a, $c)
}

function Zaokraglony([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  $p
}

function Rysuj([int]$rozmiar) {
  $bmp = New-Object System.Drawing.Bitmap $rozmiar, $rozmiar, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode = 'HighQuality'
  $g.ScaleTransform($rozmiar / 256, $rozmiar / 256)
  $maly = $rozmiar -le 32

  # kartka zeszytu
  $kartka = Zaokraglony 10 10 236 236 40
  $g.FillPath((New-Object System.Drawing.SolidBrush (Kolor '#f4efe3')), $kartka)
  $g.SetClip($kartka)
  if (-not $maly) {
    $linia = New-Object System.Drawing.Pen (Kolor '#b8c3d9'), 5
    foreach ($y in 70, 112, 154, 196) { $g.DrawLine($linia, 10, $y, 246, $y) }
  }
  $margines = New-Object System.Drawing.Pen (Kolor '#d0574a'), ($(if ($maly) { 14 } else { 6 }))
  if ($maly) { $g.DrawLine($margines, 58, 0, 58, 256) }
  else { $g.DrawLine($margines, 52, 0, 52, 256); $g.DrawLine($margines, 64, 0, 64, 256) }
  $g.ResetClip()
  $g.DrawPath((New-Object System.Drawing.Pen (Kolor '#1f2b4d'), ($(if ($maly) { 12 } else { 7 }))), $kartka)

  # złota moneta z wykrzyknikiem
  $cx = 158; $cy = 150; $r = $(if ($maly) { 84 } else { 74 })
  $g.FillEllipse((New-Object System.Drawing.SolidBrush (Kolor '#1f2b4d' 70)), $cx - $r + 4, $cy - $r + 8, 2 * $r, 2 * $r)
  $g.FillEllipse((New-Object System.Drawing.SolidBrush (Kolor '#f2c14e')), $cx - $r, $cy - $r, 2 * $r, 2 * $r)
  $g.DrawEllipse((New-Object System.Drawing.Pen (Kolor '#a8700f'), ($(if ($maly) { 12 } else { 8 }))), $cx - $r, $cy - $r, 2 * $r, 2 * $r)
  if (-not $maly) {
    $ri = $r - 13
    $g.DrawEllipse((New-Object System.Drawing.Pen (Kolor '#c99325'), 3), $cx - $ri, $cy - $ri, 2 * $ri, 2 * $ri)
  }

  # wykrzyknik jak w zeszycie - przechylony
  $stan = $g.Save()
  $g.TranslateTransform($cx, $cy)
  $g.RotateTransform(-8)
  $czerwony = New-Object System.Drawing.SolidBrush (Kolor '#c42e1d')
  $sz = $(if ($maly) { 26 } else { 20 })
  $kreska = New-Object System.Drawing.Drawing2D.GraphicsPath
  $kreska.AddPolygon([System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF (-$sz / 2 - 3), -54),
    (New-Object System.Drawing.PointF ($sz / 2 + 3), -54),
    (New-Object System.Drawing.PointF ($sz / 2 - 3), 18),
    (New-Object System.Drawing.PointF (-$sz / 2 + 3), 18)))
  $g.FillPath($czerwony, $kreska)
  $k = $sz + 4
  $g.FillEllipse($czerwony, -$k / 2, 30, $k, $k)
  $g.Restore($stan)

  $g.Dispose()
  $bmp
}

New-Item -ItemType Directory -Force (Split-Path $Wyjscie) | Out-Null
$rozmiary = 16, 24, 32, 48, 64, 128, 256
$png = @{}
foreach ($s in $rozmiary) {
  $b = Rysuj $s
  $ms = New-Object System.IO.MemoryStream
  if ($s -ge 256) {
    $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  } else {
    # klasyczny wpis DIB: nagłówek BITMAPINFOHEADER, piksele BGRA od dołu, maska AND
    $bw = New-Object System.IO.BinaryWriter $ms
    $bw.Write([uint32]40); $bw.Write([int32]$s); $bw.Write([int32](2 * $s))
    $bw.Write([uint16]1); $bw.Write([uint16]32); $bw.Write([uint32]0)
    $maskaWiersz = [int]([math]::Ceiling($s / 32) * 4)
    $bw.Write([uint32](4 * $s * $s + $maskaWiersz * $s))
    $bw.Write([int32]0); $bw.Write([int32]0); $bw.Write([uint32]0); $bw.Write([uint32]0)
    for ($y = $s - 1; $y -ge 0; $y--) {
      for ($x = 0; $x -lt $s; $x++) {
        $c = $b.GetPixel($x, $y)
        $bw.Write([byte]$c.B); $bw.Write([byte]$c.G); $bw.Write([byte]$c.R); $bw.Write([byte]$c.A)
      }
    }
    $bw.Write((New-Object byte[] ($maskaWiersz * $s)))
    $bw.Flush()
  }
  $png[$s] = $ms.ToArray()
  if ($s -eq 256) { $b.Save([System.IO.Path]::ChangeExtension($Wyjscie, '.png'), [System.Drawing.Imaging.ImageFormat]::Png) }
  $b.Dispose()
}

# plik .ico z obrazkami PNG w środku (Windows Vista i nowsze)
$ico = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $ico
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$rozmiary.Count)
$przesuniecie = 6 + 16 * $rozmiary.Count
foreach ($s in $rozmiary) {
  $bajt = $(if ($s -ge 256) { 0 } else { $s })
  $w.Write([byte]$bajt); $w.Write([byte]$bajt); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([uint16]1); $w.Write([uint16]32)
  $w.Write([uint32]$png[$s].Length); $w.Write([uint32]$przesuniecie)
  $przesuniecie += $png[$s].Length
}
foreach ($s in $rozmiary) { $w.Write($png[$s]) }
$w.Flush()
[System.IO.File]::WriteAllBytes($Wyjscie, $ico.ToArray())
"ok: $Wyjscie"
