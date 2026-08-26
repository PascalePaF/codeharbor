$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$size = 64
$bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.Color]::Transparent)

$color = [System.Drawing.ColorTranslator]::FromHtml('#21866b')
$pen = [System.Drawing.Pen]::new($color, 4.5)
$graphics.DrawEllipse($pen, 5.5, 5.5, 53, 53)

$font = [System.Drawing.Font]::new('Segoe UI', 34, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$brush = [System.Drawing.SolidBrush]::new($color)
$format = [System.Drawing.StringFormat]::new()
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$graphics.DrawString('?', $font, $brush, [System.Drawing.RectangleF]::new(5, 2, 54, 56), $format)

$targetDirectory = Join-Path $PSScriptRoot '..\src\assets'
[System.IO.Directory]::CreateDirectory($targetDirectory) | Out-Null
$targetPath = Join-Path $targetDirectory 'help-circle.png'
$bitmap.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)

$format.Dispose()
$brush.Dispose()
$font.Dispose()
$pen.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
