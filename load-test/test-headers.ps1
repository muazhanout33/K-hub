$routes = @(
  @{ Path = '/'; Name = 'Home' },
  @{ Path = '/courts'; Name = 'Courts' },
  @{ Path = '/contact'; Name = 'Contact' },
  @{ Path = '/api/health'; Name = 'API Health' }
)

$requiredHeaders = @(
  'Content-Security-Policy',
  'X-Content-Type-Options',
  'X-Frame-Options',
  'X-XSS-Protection',
  'Referrer-Policy',
  'Permissions-Policy'
)

$allPassed = $true

foreach ($route in $routes) {
  Write-Output "`n=== $($route.Name) ($($route.Path)) ==="
  try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3000$($route.Path)" -UseBasicParsing -TimeoutSec 10
    Write-Output "  Status: $($resp.StatusCode)"
    foreach ($header in $requiredHeaders) {
      $value = $resp.Headers[$header]
      if ($value) {
        Write-Output "  OK  $header = $($value.Substring(0, [Math]::Min(80, $value.Length)))"
      } else {
        Write-Output "  FAIL $header: MISSING"
        $allPassed = $false
      }
    }
  } catch {
    Write-Output "  ERROR: $($_.Exception.Message)"
    $allPassed = $false
  }
}

Write-Output "`n=== SUMMARY ==="
if ($allPassed) {
  Write-Output "ALL HEADERS PRESENT on all routes"
} else {
  Write-Output "SOME HEADERS MISSING - see above"
}
