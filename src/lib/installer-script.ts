// =============================================================================
// CoreAC tek-tık kurulum dosyası (CoreAC-Installer.bat) üreticisi.
//
// Üretilen dosya bir "batch + PowerShell polyglot"tur: kullanıcı .bat'e ÇİFT
// TIKLAR → batch bölümü kendini okuyup içindeki PowerShell gövdesini çalıştırır
// (ExecutionPolicy Bypass, ayrı .ps1 gerekmez). PowerShell gövdesi:
//   1) Panelden alınan sunucu API token'ını sorar (veya coreac-token.txt / env).
//   2) Lisansı doğrular (POST /api/v1/heartbeat, Bearer token).
//   3) Korumalı kaynağı indirir (GET /api/v1/install/resource) ve
//      resources/<klasör> altına kurar. Klasör adı:
//        * server.cfg'deki yönetilen blokta kayıtlıysa AYNI ad (güncelleme),
//        * değilse "gizli ad" (ör. qx_7k2m9d4a) — hile menüleri AC'yi adıyla
//          bulup durduramasın; gizli ad kapalıysa "coreac".
//      Gizli adda fxmanifest'in name/author/description bilgisi de nötrleşir.
//   4) server.cfg'yi yönetilen blokla yapılandırır — diğer resource'lardan
//      ÖNCE (AC ilk başlamalı): set coreac_api / set coreac_token /
//      add_ace resource.<klasör> command allow / ensure <klasör>.
//   5) Eski "aeigs-anticheat" kurulumunu (varsa) kaldırır ve eski satırları temizler.
//
// Dosya okuma/yazma .NET ile UTF-8 (BOM'suz) yapılır: PowerShell 5.1'in
// varsayılanı ANSI okuyup BOM'lu yazmaktı → sunucu adındaki Türkçe karakterler
// bozuluyor, cfg'nin ilk satırının başına görünmez BOM ekleniyordu.
//
// API tabanı panelde gömülüdür; token GÖMÜLMEZ (çalışma anında istenir) —
// böylece indirilen dosya bir sır taşımaz.
//
// NOT (yazarken): gövde String.raw içinde → PowerShell'de backtick (`)
// KULLANILMAZ ve "${" dizisi yazılmaz (JS şablonu onu yorumlar).
// =============================================================================

/** PowerShell tek-tırnak string'i için güvenli kaçış (' -> ''). */
function psq(s: string): string {
  return s.replace(/'/g, "''");
}

export function buildInstallerBat(opts: { apiBase: string; serverName: string; stealth?: boolean }): string {
  const apiBase = opts.apiBase.replace(/\/+$/, "");
  const serverName = opts.serverName || "My Server";
  const stealth = opts.stealth !== false;

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
$Stealth    = ${stealth ? "$true" : "$false"}
$Home2      = $env:COREAC_HOME
if (-not $Home2) { $Home2 = (Get-Location).Path }
$nl = [char]13 + [char]10
$Begin = '# >>> CoreAC (managed - do not edit this block) >>>'
$End   = '# <<< CoreAC (managed) <<<'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Say([string]$t, [string]$c='Gray') { Write-Host $t -ForegroundColor $c }
function Read-Text([string]$p) { return [System.IO.File]::ReadAllText($p) }
function Write-Text([string]$p, [string]$t) { [System.IO.File]::WriteAllText($p, $t, $Utf8NoBom) }

function Find-ServerCfg([string]$start) {
  $direct = Join-Path $start 'server.cfg'
  if (Test-Path -LiteralPath $direct) { return (Resolve-Path -LiteralPath $direct).Path }
  # Alt klasorlerde ara (derinlik sinirli)
  try {
    $hit = Get-ChildItem -LiteralPath $start -Recurse -Depth 4 -Filter 'server.cfg' -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hit) { return $hit.FullName }
  } catch {}
  # Ust klasorlere dogru yuru
  $dir = (Get-Item -LiteralPath $start).FullName
  for ($i=0; $i -lt 5; $i++) {
    $parent = Split-Path -Parent $dir
    if (-not $parent -or $parent -eq $dir) { break }
    $cand = Join-Path $parent 'server.cfg'
    if (Test-Path -LiteralPath $cand) { return (Resolve-Path -LiteralPath $cand).Path }
    $dir = $parent
  }
  return $null
}

# Onceki CoreAC kurulumunun klasor adi (yonetilen bloktaki ensure satiri).
function Get-ManagedName([string]$raw) {
  $pattern = [regex]::Escape($Begin) + '(.*?)' + [regex]::Escape($End)
  $m = [regex]::Match($raw, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if (-not $m.Success) { return $null }
  $e = [regex]::Match($m.Groups[1].Value, '(?m)^\s*ensure\s+([A-Za-z0-9_\-\.]+)\s*$')
  if ($e.Success) { return $e.Groups[1].Value }
  return $null
}

function New-StealthName {
  $letters = 'abcdefghijklmnopqrstuvwxyz'
  $chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  $a = -join (1..2 | ForEach-Object { $letters[(Get-Random -Maximum $letters.Length)] })
  $b = -join (1..8 | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
  return ($a + '_' + $b)
}

function Patch-Cfg([string]$cfg, [string]$api, [string]$token, [string]$res) {
  $raw = Read-Text $cfg
  # Yedek al (bir kez)
  $bak = $cfg + '.coreac.bak'
  if (-not (Test-Path -LiteralPath $bak)) { Copy-Item -LiteralPath $cfg -Destination $bak -Force }
  # Eski yonetilen blogu kaldir
  $pattern = [regex]::Escape($Begin) + '.*?' + [regex]::Escape($End)
  $raw = [regex]::Replace($raw, $pattern, '', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  # Blok disinda kalmis eski/el ile eklenmis satirlari temizle (cift kayit onle)
  $names = '(aeigs-anticheat|coreac|' + [regex]::Escape($res) + ')'
  $lines = @($raw -split '\r?\n' | Where-Object {
    ($_ -notmatch ('^\s*(ensure|start)\s+' + $names + '\s*$')) -and
    ($_ -notmatch '^\s*set\s+(aeigs|coreac)_(api|token)\s') -and
    ($_ -notmatch ('^\s*add_ace\s+resource\.' + $names + '\s'))
  })
  $block = @(
    $Begin,
    ('# CoreAC resource folder: resources/{0}' -f $res),
    ('set coreac_api "{0}/api/v1"' -f $api),
    ('set coreac_token "{0}"' -f $token),
    ('add_ace resource.{0} command allow' -f $res),
    ('ensure {0}' -f $res),
    $End
  )
  # Anti-cheat diger resource'lardan ONCE baslamali: ilk ensure/start satirinin ustune.
  $idx = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\s*(ensure|start)\s+\S') { $idx = $i; break }
  }
  if ($idx -ge 0) {
    $before = @()
    if ($idx -gt 0) { $before = $lines[0..($idx - 1)] }
    $after = $lines[$idx..($lines.Count - 1)]
    $out = @($before) + $block + @('') + @($after)
  } else {
    $out = @($lines) + @('') + $block
  }
  Write-Text $cfg ((($out -join $nl).TrimEnd()) + $nl)
}

# Eski (Aeigs adli) kurulum klasorlerini kaldirir — yalnizca fxmanifest'i
# bizim eski kaynagimiz oldugunu dogrulayanlari. Aksi halde [kategori]
# ensure'u eski kopyayi da baslatip AC iki kez calisirdi.
function Remove-LegacyInstalls([string]$resourcesDir, [string]$keep) {
  $found = @()
  try {
    $found = @(Get-ChildItem -LiteralPath $resourcesDir -Directory -Recurse -Depth 2 -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'aeigs-anticheat' })
  } catch {}
  foreach ($d in $found) {
    if ($d.FullName -eq $keep) { continue }
    $mf = Join-Path $d.FullName 'fxmanifest.lua'
    if ((Test-Path -LiteralPath $mf) -and ((Read-Text $mf) -match 'aeigs-anticheat')) {
      Remove-Item -LiteralPath $d.FullName -Recurse -Force
      Say ('  Removed the old install: {0}' -f $d.FullName) 'DarkGray'
    }
  }
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
  if (-not $token -and (Test-Path -LiteralPath $tokenFile)) { $token = (Read-Text $tokenFile).Trim() }
  if (-not $token) {
    Say '  Paste your server API token (Panel -> Download -> Reveal token):' 'Yellow'
    $token = (Read-Host '  Token').Trim()
  }
  if (-not ($token.StartsWith('coreac_srv_') -or $token.StartsWith('aeigs_srv_'))) {
    throw "That does not look like a server token (it should start with coreac_srv_)."
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
  if (-not (Test-Path -LiteralPath $cfg)) { throw ("server.cfg not found at: {0}" -f $cfg) }
  $serverRoot = Split-Path -Parent $cfg
  Say ("  Found: {0}" -f $cfg) 'Green'

  # --- 4) Klasor adi ---
  $existing = Get-ManagedName (Read-Text $cfg)
  if ($existing -and $existing -ne 'aeigs-anticheat') {
    $resName = $existing
    Say ("  Updating the existing install: resources/{0}" -f $resName) 'DarkGray'
  } elseif ($Stealth) {
    $resName = New-StealthName
  } else {
    $resName = 'coreac'
  }

  # --- 5) Kaynagi indir + kur ---
  Say ''
  Say '  Downloading protected resource...' 'Cyan'
  $zip = Join-Path $env:TEMP ("coreac_" + [Guid]::NewGuid().ToString('N') + ".zip")
  $tmp = Join-Path $env:TEMP ("coreac_" + [Guid]::NewGuid().ToString('N'))
  Invoke-WebRequest -Uri ("{0}/api/v1/install/resource" -f $ApiBase) -Headers $headers -OutFile $zip -UseBasicParsing
  [System.IO.Directory]::CreateDirectory($tmp) | Out-Null
  Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
  $src = Join-Path $tmp 'coreac'
  if (-not (Test-Path -LiteralPath $src)) { throw 'The downloaded package is damaged (no coreac folder inside). Run the installer again.' }

  # NOT: FiveM [kategori] klasorleri kose parantez icerir; PowerShell bunlari
  # wildcard sayar. Bu yuzden her yerde -LiteralPath ve .NET IO kullanilir.
  $resourcesDir = Join-Path $serverRoot 'resources'
  if (-not (Test-Path -LiteralPath $resourcesDir)) { [System.IO.Directory]::CreateDirectory($resourcesDir) | Out-Null }
  $dest = Join-Path $resourcesDir $resName
  if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
  Copy-Item -LiteralPath $src -Destination $dest -Recurse -Force
  Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue

  # Gizli ad: manifestteki tanimlayici bilgileri notrlestir (hile menuleri
  # resource metadata'sini da tarar).
  if ($resName -ne 'coreac') {
    $mf = Join-Path $dest 'fxmanifest.lua'
    $t = Read-Text $mf
    $t = [regex]::Replace($t, "(?m)^name\s+'[^']*'", ("name '{0}'" -f $resName))
    $t = [regex]::Replace($t, "(?m)^author\s+'[^']*'", "author 'unknown'")
    $t = [regex]::Replace($t, "(?m)^description\s+'[^']*'", "description 'library'")
    Write-Text $mf $t
  }
  Say ("  Installed to: {0}" -f $dest) 'Green'

  Remove-LegacyInstalls $resourcesDir $dest

  # --- 6) server.cfg yapilandir ---
  Say ''
  Say '  Configuring server.cfg...' 'Cyan'
  Patch-Cfg $cfg $ApiBase $token $resName
  Say '  server.cfg updated (a backup was saved as server.cfg.coreac.bak).' 'Green'

  Say ''
  Say '  ============================================' 'Green'
  Say '   CoreAC is installed. Restart your server.' 'Green'
  Say '   It will appear ONLINE in your panel.' 'Green'
  Say '  ============================================' 'Green'
  Say ''
  Say ("  Resource folder : resources/{0}" -f $resName) 'White'
  if ($resName -ne 'coreac') {
    Say '  (A random folder name keeps cheat menus from finding the anti-cheat by name.)' 'DarkGray'
  }
  Say "  Scripts that teleport players should first call:  TriggerEvent('coreac:markTeleport', source)" 'DarkGray'
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
