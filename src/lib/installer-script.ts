// =============================================================================
// CoreAC tek-tık kurulum dosyası (CoreAC-Installer.bat) üreticisi.
//
// Üretilen dosya bir "batch + PowerShell polyglot"tur: kullanıcı .bat'e ÇİFT
// TIKLAR → batch bölümü kendini okuyup içindeki PowerShell gövdesini çalıştırır
// (ExecutionPolicy Bypass, ayrı .ps1 gerekmez). PowerShell gövdesi:
//   1) Panelden alınan sunucu API token'ını sorar (veya coreac-token.txt / env).
//   2) Lisansı doğrular (POST /api/v1/heartbeat, Bearer token).
//   3) Korumalı kaynağı indirir (GET /api/v1/install/resource) ve
//      resources/[coreac]/aeigs-anticheat altına çıkarır.
//   4) server.cfg'yi bulur ve yönetilen blokla yapılandırır
//      (set aeigs_api / set aeigs_token / ensure aeigs-anticheat).
//
// API tabanı panelde gömülüdür; token GÖMÜLMEZ (çalışma anında istenir) —
// böylece indirilen dosya bir sır taşımaz.
// =============================================================================

/** PowerShell tek-tırnak string'i için güvenli kaçış (' -> ''). */
function psq(s: string): string {
  return s.replace(/'/g, "''");
}

export function buildInstallerBat(opts: { apiBase: string; serverName: string }): string {
  const apiBase = opts.apiBase.replace(/\/+$/, "");
  const serverName = opts.serverName || "My Server";

  // --- Batch başlığı (cmd `exit /b`'ye kadar çalışır; altındaki PS'i asla
  //     ayrıştırmaz). PowerShell dosyayı ham okuyup #PS+BODY# işaretinden
  //     sonrasını iex eder — satır sayımı gerekmez, uzun satırlara dayanıklı. ---
  const batchHeader = [
    "@echo off",
    'set "COREAC_HOME=%~dp0"',
    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$m='#PS'+'BODY#'; $c=Get-Content -LiteralPath '%~f0' -Raw; iex $c.Substring($c.IndexOf($m)+$m.Length)\"",
    "echo.",
    "pause",
    "exit /b",
    "#PSBODY#",
  ].join("\r\n");

  // --- PowerShell gövdesi ---
  const ps = String.raw`
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11 -bor [Net.SecurityProtocolType]::Tls

$ApiBase    = '${psq(apiBase)}'.TrimEnd('/')
$ServerName = '${psq(serverName)}'
$Home2      = $env:COREAC_HOME
if (-not $Home2) { $Home2 = (Get-Location).Path }
$nl = [char]13 + [char]10

function Say([string]$t, [string]$c='Gray') { Write-Host $t -ForegroundColor $c }

function Find-ServerCfg([string]$start) {
  $direct = Join-Path $start 'server.cfg'
  if (Test-Path $direct) { return (Resolve-Path $direct).Path }
  # Alt klasörlerde ara (derinlik sinirli)
  try {
    $hit = Get-ChildItem -Path $start -Recurse -Depth 4 -Filter 'server.cfg' -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hit) { return $hit.FullName }
  } catch {}
  # Ust klasorlere dogru yuru
  $dir = (Get-Item $start).FullName
  for ($i=0; $i -lt 5; $i++) {
    $parent = Split-Path -Parent $dir
    if (-not $parent -or $parent -eq $dir) { break }
    $cand = Join-Path $parent 'server.cfg'
    if (Test-Path $cand) { return (Resolve-Path $cand).Path }
    $dir = $parent
  }
  return $null
}

function Patch-Cfg([string]$cfg, [string]$api, [string]$token) {
  $begin = '# >>> CoreAC (managed - do not edit this block) >>>'
  $end   = '# <<< CoreAC (managed) <<<'
  $raw = Get-Content -LiteralPath $cfg -Raw
  # Yedek al (bir kez)
  $bak = "$cfg.coreac.bak"
  if (-not (Test-Path $bak)) { Copy-Item -LiteralPath $cfg -Destination $bak -Force }
  # Eski yonetilen blogu kaldir
  $pattern = [regex]::Escape($begin) + '.*?' + [regex]::Escape($end)
  $raw = [regex]::Replace($raw, $pattern, '', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  # Yonetim disi kalmis eski ensure/set satirlarini temizle (cift kayit onle)
  $lines = $raw -split "\r?\n" | Where-Object {
    ($_ -notmatch '^\s*ensure\s+aeigs-anticheat\s*$') -and
    ($_ -notmatch '^\s*set\s+aeigs_(api|token)\s')
  }
  $raw = ($lines -join $nl).TrimEnd() + $nl
  # Yeni blogu ekle
  $block = @()
  $block += ''
  $block += $begin
  $block += ('set aeigs_api "{0}/api/v1"' -f $api)
  $block += ('set aeigs_token "{0}"' -f $token)
  $block += 'ensure aeigs-anticheat'
  $block += $end
  $raw += ($block -join $nl) + $nl
  Set-Content -LiteralPath $cfg -Value $raw -Encoding UTF8 -NoNewline
}

Clear-Host
Say ''
Say '   ####  ####  ####  ####    ##    ####' 'Cyan'
Say '  ##    ##    ##  ## ##      ####  ##   ' 'Cyan'
Say '  ##    ##    ##  ## ####   ##  ## ##   ' 'Cyan'
Say '  ##    ##    ##  ## ##     ###### ##   ' 'Cyan'
Say '   ####  ####  ####  ####  ##  ##   ####' 'Cyan'
Say ''
Say '  CoreAC - Server Installer' 'White'
Say '  ------------------------------------------'
Say ("  Server : {0}" -f $ServerName)
Say ("  Panel  : {0}" -f $ApiBase)
Say ("  Folder : {0}" -f $Home2)
Say ''

try {
  # --- 1) API token ---
  $token = $env:COREAC_TOKEN
  $tokenFile = Join-Path $Home2 'coreac-token.txt'
  if (-not $token -and (Test-Path $tokenFile)) { $token = (Get-Content -LiteralPath $tokenFile -Raw).Trim() }
  if (-not $token) {
    Say '  Paste your server API token (Panel -> Download -> Reveal token):' 'Yellow'
    $token = (Read-Host '  Token').Trim()
  }
  if (-not $token.StartsWith('aeigs_srv_')) {
    throw "That does not look like a server token (it should start with aeigs_srv_)."
  }
  $headers = @{ Authorization = ("Bearer {0}" -f $token) }

  # --- 2) Lisans / token dogrula ---
  Say ''
  Say '  Checking licence...' 'Cyan'
  try {
    $hb = Invoke-RestMethod -Uri ("{0}/api/v1/heartbeat" -f $ApiBase) -Method Post -Headers $headers -ContentType 'application/json' -Body '{}'
  } catch {
    throw ("Licence check failed - the token may be wrong or the panel is unreachable." + $nl + "  " + $_.Exception.Message)
  }
  $sid = if ($hb.data) { $hb.data.serverId } else { $hb.serverId }
  Say ("  Licence OK. Server id: {0}" -f $sid) 'Green'

  # --- 3) server.cfg bul ---
  Say ''
  Say '  Looking for server.cfg...' 'Cyan'
  $cfg = Find-ServerCfg $Home2
  if (-not $cfg) {
    Say '  Could not find server.cfg automatically.' 'Yellow'
    $cfg = (Read-Host '  Full path to your server.cfg').Trim('"').Trim()
  }
  if (-not (Test-Path $cfg)) { throw ("server.cfg not found at: {0}" -f $cfg) }
  $serverRoot = Split-Path -Parent $cfg
  Say ("  Found: {0}" -f $cfg) 'Green'

  # --- 4) Kaynagi indir + cikar ---
  Say ''
  Say '  Downloading protected resource...' 'Cyan'
  $zip = Join-Path $env:TEMP ("coreac_" + [Guid]::NewGuid().ToString('N') + ".zip")
  Invoke-WebRequest -Uri ("{0}/api/v1/install/resource" -f $ApiBase) -Headers $headers -OutFile $zip -UseBasicParsing
  $resourcesDir = Join-Path $serverRoot 'resources'
  # NOT: FiveM [kategori] klasorleri kose parantez icerir; PowerShell bunlari
  # wildcard sayar. Bu yuzden -LiteralPath ve .NET IO ile calisir, dogrudan
  # resources/ altina cikaririz (zip zaten 'aeigs-anticheat/...' iceriyor).
  if (-not (Test-Path -LiteralPath $resourcesDir)) { [System.IO.Directory]::CreateDirectory($resourcesDir) | Out-Null }
  $dest = Join-Path $resourcesDir 'aeigs-anticheat'
  if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
  Expand-Archive -LiteralPath $zip -DestinationPath $resourcesDir -Force
  Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
  Say ("  Installed to: {0}" -f $dest) 'Green'

  # --- 5) server.cfg yapilandir ---
  Say ''
  Say '  Configuring server.cfg...' 'Cyan'
  Patch-Cfg $cfg $ApiBase $token
  Say '  server.cfg updated (a backup was saved as server.cfg.coreac.bak).' 'Green'

  Say ''
  Say '  ============================================' 'Green'
  Say '   CoreAC is installed. Restart your server.' 'Green'
  Say '   It will appear ONLINE in your panel.' 'Green'
  Say '  ============================================' 'Green'
  Say ''
}
catch {
  Say ''
  Say '  ------------------------------------------' 'Red'
  Say ('  Installation failed:') 'Red'
  Say ("  {0}" -f $_.Exception.Message) 'Red'
  Say '  ------------------------------------------' 'Red'
  Say '  Nothing was started. Fix the issue above and run the installer again.' 'Yellow'
  Say ''
}
`;

  return batchHeader + "\r\n" + ps.replace(/\r?\n/g, "\r\n").trimStart() + "\r\n";
}
