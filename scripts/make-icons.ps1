Add-Type -AssemblyName System.Drawing

# Source: white-background logo (favicon.png, 1024x1024, opaque)
$src = [System.Drawing.Image]::FromFile("$PSScriptRoot\..\public\favicon.png")

# Artwork edge colour (measured): ~#EAEEEF — used to fill padding seamlessly
$edge = [System.Drawing.Color]::FromArgb(255, 234, 238, 239)

function Save-Square($size, $path, $padRatio) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  if ($padRatio -gt 0) {
    # Fill padding with the artwork edge colour so there is no visible seam
    $bg = New-Object System.Drawing.SolidBrush($edge)
    $g.FillRectangle($bg, 0, 0, $size, $size)
    $bg.Dispose()
  }

  $pad = [int]($size * $padRatio)
  $drawSize = $size - (2 * $pad)
  $g.DrawImage($src, $pad, $pad, $drawSize, $drawSize)
  $g.Dispose()

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "wrote $path ($size x $size)"
}

# Standard icons: full-bleed white square with the glyph
Save-Square 192 "$PSScriptRoot\..\public\icon-192.png" 0.0
Save-Square 512 "$PSScriptRoot\..\public\icon-512.png" 0.0

# Maskable icons: content inside the 80% safe zone, opaque background
Save-Square 192 "$PSScriptRoot\..\public\icon-maskable-192.png" 0.12
Save-Square 512 "$PSScriptRoot\..\public\icon-maskable-512.png" 0.12

$src.Dispose()
Write-Host "done"
