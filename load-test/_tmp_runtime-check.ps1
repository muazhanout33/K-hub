$h = (Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 10).StatusCode
$a = (Invoke-WebRequest -Uri 'http://localhost:3000/api/courts' -UseBasicParsing -TimeoutSec 10).StatusCode
Write-Output "Home: $h  API: $a"
