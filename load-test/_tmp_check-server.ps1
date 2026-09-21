try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 10
    Write-Output "Server ready: $($r.StatusCode)"
} catch {
    Write-Output "Server error: $($_.Exception.Message)"
}
