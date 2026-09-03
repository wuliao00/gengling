<#
  GengLing audio asset batch downloader
  ------------------------------------------------------------------
  HOW TO USE:
    1) In the $manifest below, paste a DIRECT-LINK URL into the empty '' quotes
       on each line you want. Leave '' empty to skip that sound.
    2) Save this file, then run in PowerShell:
         cd E:\项目\gengling
         powershell -ExecutionPolicy Bypass -File .\fetch_audio.ps1
       (or right-click this file -> "Run with PowerShell")
    3) Files are saved into assets\audio\bgm and assets\audio\sfx with the exact
       names the game loader expects. No renaming needed.

  HOW TO GET A DIRECT LINK:
    - Mixkit: on a sound/music page, right-click the "Download" button ->
              "Copy link address" (looks like https://assets.mixkit.co/active_storage/sfx/NNNN/NNNN-preview.mp3)
    - Pixabay: right-click the download button -> "Copy link address"
              (looks like https://cdn.pixabay.com/download/audio/...)
    - A .ogg / .wav link is fine too: it is saved under the target name and the
      browser plays it by content.
    - If a line is reported as "HTML page, not audio", that site needs login or
      hotlink protection. Just download it in your browser and drop it into
      assets\audio\... with the exact file name instead.

  SPECS: BGM loopable 30-120s; SFX short <2s.  [P] = priority (biggest impact).

  NOTE: This file is pure ASCII on purpose. Windows PowerShell 5.1 reads .ps1 as
        the system ANSI codepage when there is no BOM, which corrupts non-ASCII
        characters and breaks parsing. Keep it ASCII-only.
#>

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
if ([string]::IsNullOrWhiteSpace($root)) { $root = (Get-Location).Path }
$audioDir = Join-Path $root 'assets\audio'
$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

# ============================================================
#  Paste direct links below ('' = skip).  [P] = priority
# ============================================================
$manifest = [ordered]@{
  # ---- 1) BGM (loopable) ----
  'bgm/home.mp3'                = ''   # [P] home / menu, light and happy
  'bgm/battle1.mp3'             = ''   # [P] battle loop #1, upbeat
  'bgm/battle2.mp3'             = ''   # [P] battle loop #2, different style (tense/hype)
  'bgm/boss.mp3'                = ''   # [P] boss battle, epic and tense
  'bgm/endless.mp3'             = ''   #     endless mode (optional)

  # ---- 2) System / UI ----
  'sfx/click.mp3'               = ''   # [P] generic click / toggle
  'sfx/button.mp3'              = ''   # [P] confirm button (start battle / buy)
  'sfx/back.mp3'                = ''   #     back
  'sfx/invalid.mp3'             = ''   # [P] invalid move / error
  'sfx/opening.mp3'             = ''   # [P] opening (startup / logo reveal)

  # ---- 3) Board ----
  'sfx/swap.mp3'                = ''   # [P] swap tiles
  'sfx/match.mp3'               = ''   # [P] match/clear (combo auto pitch-up)
  'sfx/bomb.mp3'                = ''   # [P] bomb explosion
  'sfx/rainbow.mp3'             = ''   # [P] rainbow ball
  'sfx/wind.mp3'                = ''   # [P] wind gust
  'sfx/treasure.mp3'            = ''   # [P] treasure chest
  'sfx/ice.mp3'                 = ''   #     ice break
  'sfx/chain.mp3'               = ''   #     chain unlock
  'sfx/shuffle.mp3'             = ''   #     shuffle

  # ---- 4) Battle ----
  'sfx/hit.mp3'                 = ''   # [P] hit enemy
  'sfx/hurt.mp3'                = ''   # [P] player hurt
  'sfx/shield.mp3'              = ''   # [P] shield block
  'sfx/boss_skill.mp3'          = ''   # [P] boss skill
  'sfx/enemy_atk.mp3'           = ''   #     enemy lunge attack
  'sfx/stun.mp3'                = ''   #     stun
  'sfx/faint.mp3'               = ''   #     member fainted

  # ---- 5) Character skills (7 unique) ----
  'sfx/skill_hajimiao.mp3'      = ''   # [P] Hajimiao honey wave (slime splash + meow)
  'sfx/skill_dasangwang.mp3'    = ''   # [P] Dasangwang sonic roar (dog bark + boom)
  'sfx/skill_feitianxia.mp3'    = ''   # [P] Feitianxia sky dash (whoosh + fire)
  'sfx/skill_zhuanzhuanjun.mp3' = ''   # [P] Zhuanzhuanjun wheel of fate (wheel ticks)
  'sfx/skill_zifengzhiwang.mp3' = ''   # [P] Zifengzhiwang king aura (sword + boom)
  'sfx/skill_xiaoniu.mp3'       = ''   # [P] Xiaoniu charge (cow moo + charge)
  'sfx/skill_mianshifu.mp3'     = ''   # [P] Mianshifu noodle (boiling + bowl clink)

  # ---- 6) Reward / result ----
  'sfx/victory.mp3'             = ''   # [P] victory fanfare
  'sfx/defeat.mp3'              = ''   # [P] defeat
  'sfx/coin.mp3'                = ''   # [P] coin
  'sfx/levelup.mp3'             = ''   #     level up
  'sfx/unlock.mp3'              = ''   #     unlock new character
  'sfx/chest.mp3'               = ''   #     chest open
  'sfx/slot_spin.mp3'           = ''   #     slot machine spin
  'sfx/slot_win.mp3'            = ''   #     slot machine win
}

# ============================================================
#  Download loop (no need to edit below)
# ============================================================
Write-Host ''
Write-Host 'GengLing audio downloader' -ForegroundColor Cyan
Write-Host "Target dir: $audioDir" -ForegroundColor DarkGray
Write-Host ''

$ok = 0; $skip = 0; $fail = @()
foreach ($key in $manifest.Keys) {
  $url = [string]$manifest[$key]
  if ([string]::IsNullOrWhiteSpace($url)) { $skip++; continue }

  $rel  = $key -replace '/', '\'
  $dest = Join-Path $audioDir $rel
  $dir  = Split-Path -Parent $dest
  if (!(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $tmp = "$dest.part"

  try {
    Invoke-WebRequest -Uri $url -OutFile $tmp -UserAgent $UA -TimeoutSec 90
    $fi = Get-Item $tmp
    if ($fi.Length -lt 1024) { throw "file too small ($($fi.Length) B), probably not audio" }
    # detect an HTML error page (bad link / login required / hotlink protection)
    $head = ''
    try { $head = [string](Get-Content $tmp -TotalCount 1 -ErrorAction Stop) } catch { $head = '' }
    if ($head -match '<!DOCTYPE|<html') { throw 'got an HTML page, not audio (bad link / login / hotlink guard)' }
    Move-Item -Force $tmp $dest
    Write-Host ('[OK]   {0,-32} {1,8:N1} KB' -f $key, ($fi.Length / 1KB)) -ForegroundColor Green
    $ok++
  } catch {
    Write-Host "[FAIL] $key  -> $($_.Exception.Message)" -ForegroundColor Red
    if (Test-Path $tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
    $fail += $key
  }
}

Write-Host ''
Write-Host ('Done. ok={0}  skipped(empty)={1}  failed={2}' -f $ok, $skip, $fail.Count) -ForegroundColor Cyan
if ($fail.Count -gt 0) {
  Write-Host ('Failed: {0}' -f ($fail -join ', ')) -ForegroundColor Yellow
  Write-Host 'Tip: failures are usually login/hotlink-protected sites. Download those in your browser and drop them into assets\audio\ with the exact file name.' -ForegroundColor DarkGray
}
$present = @(Get-ChildItem -Path $audioDir -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -match '\.(mp3|ogg|wav|m4a)$' })
Write-Host ("Audio files now in assets\audio : {0}" -f $present.Count) -ForegroundColor DarkGray
Write-Host ''
