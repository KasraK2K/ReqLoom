Add-Type -AssemblyName System.Drawing

function New-HighQualityGraphics([System.Drawing.Bitmap]$bitmap) {
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  return $graphics
}

function Save-ReqLoomIcon(
  [System.Drawing.Bitmap]$source,
  [System.Drawing.RectangleF]$sourceRect,
  [int]$size,
  [string]$outputPath
) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = New-HighQualityGraphics $bitmap

  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $padding = [Math]::Max(2, [Math]::Round($size * 0.055))
    $available = $size - ($padding * 2)
    $scale = [Math]::Min($available / $sourceRect.Width, $available / $sourceRect.Height)
    $drawWidth = $sourceRect.Width * $scale
    $drawHeight = $sourceRect.Height * $scale
    $destRect = [System.Drawing.RectangleF]::new(
      ($size - $drawWidth) / 2,
      ($size - $drawHeight) / 2,
      $drawWidth,
      $drawHeight
    )

    $graphics.DrawImage($source, $destRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

$root = Split-Path -Parent $PSScriptRoot
$iconPath = Join-Path $root 'frontend\src\assets\icon.png'
$iconDir = Join-Path $root 'desktop\build\icons'

if (-not (Test-Path $iconPath)) {
  throw "ReqLoom icon source was not found: $iconPath"
}

New-Item -ItemType Directory -Force -Path $iconDir | Out-Null

$source = [System.Drawing.Bitmap]::FromFile($iconPath)

try {
  $sourceRect = [System.Drawing.RectangleF]::new(0, 0, $source.Width, $source.Height)
  $sizes = 16, 32, 48, 64, 128, 256, 512, 1024

  foreach ($size in $sizes) {
    $output = Join-Path $iconDir ("{0}x{0}.png" -f $size)
    Save-ReqLoomIcon $source $sourceRect $size $output
  }
} finally {
  $source.Dispose()
}
