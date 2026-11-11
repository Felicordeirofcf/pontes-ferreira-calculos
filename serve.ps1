# Servidor local simples para visualizar o site e o painel (http://localhost:8765)
param([int]$Porta = 8765)
$raiz = (Resolve-Path (Join-Path $PSScriptRoot 'site')).Path
$tipos = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
            '.json'='application/json'; '.png'='image/png'; '.jpg'='image/jpeg'; '.svg'='image/svg+xml'; '.ico'='image/x-icon';
            '.sql'='text/plain; charset=utf-8'; '.md'='text/plain; charset=utf-8' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Porta/")
$l.Start()
Write-Host "Servindo $raiz em http://localhost:$Porta/"
while ($l.IsListening) {
  $ctx = $l.GetContext()
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '' -or $rel.EndsWith('/')) { $rel += 'index.html' }
    $arq = [IO.Path]::GetFullPath((Join-Path $raiz $rel))
    if ((Test-Path $arq -PathType Container)) { $arq = Join-Path $arq 'index.html' }
    if (-not $arq.StartsWith($raiz) -or -not (Test-Path $arq -PathType Leaf)) {
      $ctx.Response.StatusCode = 404; $b = [Text.Encoding]::UTF8.GetBytes('404')
    } else {
      $ext = [IO.Path]::GetExtension($arq).ToLower()
      $ctx.Response.ContentType = $(if ($tipos[$ext]) { $tipos[$ext] } else { 'application/octet-stream' })
      $b = [IO.File]::ReadAllBytes($arq)
    }
    $ctx.Response.Headers.Add('Cache-Control', 'no-store')
    $ctx.Response.OutputStream.Write($b, 0, $b.Length)
  } catch { } finally { $ctx.Response.Close() }
}
