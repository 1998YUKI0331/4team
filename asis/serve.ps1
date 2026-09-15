$ErrorActionPreference = 'Stop'

try {
  $root = $PSScriptRoot
  $indexFile = '내집매칭 (1).html'

  Write-Host "스크립트 폴더: $root"
  Write-Host "대상 파일: $indexFile"
  Write-Host ""

  $mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.htm'  = 'text/html; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.pdf'  = 'application/pdf'
  }

  # 공고문 PDF 는 이 폴더가 아니라 프로젝트 루트의 `공고문\` 에 있다.
  # 45MB를 복사해 두지 않으려고, 이 경로에 한해서만 상위 폴더를 함께 찾는다.
  # (상위 폴더 전체를 열어 주면 .env 같은 파일까지 노출되므로 접두사를 반드시 확인한다)
  $parentServePrefix = '공고문/'

  $listener = $null
  $port = 8791
  $bound = $false
  $lastError = $null
  for ($i = 0; $i -lt 30; $i++) {
    try {
      $listener = New-Object System.Net.HttpListener
      $listener.Prefixes.Add("http://localhost:$port/")
      $listener.Start()
      $bound = $true
      break
    } catch {
      $lastError = $_.Exception.Message
      $port++
    }
  }

  if (-not $bound) {
    Write-Host "사용 가능한 포트를 찾지 못했습니다."
    Write-Host "마지막 오류: $lastError"
    throw "서버 시작 실패"
  }

  $url = "http://localhost:$port/"
  Write-Host "내집매칭 서버 시작: $url"
  Write-Host "이 창을 닫으면 서버가 종료됩니다."
  Write-Host ""

  $opened = $false
  try {
    Start-Process $url -ErrorAction Stop
    $opened = $true
    Write-Host "브라우저를 여는 중..."
  } catch {
    Write-Host "Start-Process로 브라우저 열기 실패: $($_.Exception.Message)"
  }

  if (-not $opened) {
    try {
      Start-Process -FilePath "cmd.exe" -ArgumentList "/c start `"`" `"$url`"" -ErrorAction Stop
      $opened = $true
      Write-Host "cmd start로 브라우저를 여는 중..."
    } catch {
      Write-Host "cmd start로도 브라우저 열기 실패: $($_.Exception.Message)"
    }
  }

  if (-not $opened) {
    Write-Host "브라우저를 자동으로 열지 못했습니다."
  }
  Write-Host "브라우저가 자동으로 열리지 않으면 아래 주소를 직접 브라우저 주소창에 입력하세요:"
  Write-Host "  $url"
  Write-Host ""
  Write-Host "서버 대기 중... (요청이 올 때까지 여기서 멈춰 있는 것이 정상입니다)"

  try {
    while ($listener.IsListening) {
      $context = $listener.GetContext()
      $request = $context.Request
      $response = $context.Response
      try {
        $localPath = $request.Url.LocalPath
        if ($localPath -eq '/') { $localPath = "/$indexFile" }
        $relative = $localPath.TrimStart('/')
        $filePath = Join-Path $root $relative

        if ((-not (Test-Path -LiteralPath $filePath -PathType Leaf)) -and $relative.StartsWith($parentServePrefix)) {
          $candidate = Join-Path (Split-Path -Parent $root) $relative
          if (Test-Path -LiteralPath $candidate -PathType Leaf) { $filePath = $candidate }
        }

        if (Test-Path -LiteralPath $filePath -PathType Leaf) {
          $ext = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
          $contentType = $mime[$ext]
          if (-not $contentType) { $contentType = 'application/octet-stream' }
          $bytes = [System.IO.File]::ReadAllBytes($filePath)
          $response.ContentType = $contentType
          $response.ContentLength64 = $bytes.Length
          $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
          $response.StatusCode = 404
          $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $relative")
          $response.OutputStream.Write($notFound, 0, $notFound.Length)
        }
      } catch {
        $response.StatusCode = 500
      } finally {
        $response.OutputStream.Close()
      }
    }
  } finally {
    $listener.Stop()
  }
} catch {
  Write-Host ""
  Write-Host "===== 오류가 발생했습니다 ====="
  Write-Host $_.Exception.Message
  Write-Host $_.InvocationInfo.PositionMessage
} finally {
  Write-Host ""
  Read-Host "창을 닫으려면 엔터를 누르세요"
}
