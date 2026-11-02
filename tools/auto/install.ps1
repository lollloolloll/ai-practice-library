# 자동 실제 결과 예약 작업 등록
# PC를 켜고 로그인하면 10분 뒤, 그리고 매일 13시에 돌아요. 꺼져 있어서 놓친 실행은 켜졌을 때 따라잡아요.
# 하루 몫(10개)을 이미 채웠으면 바로 끝나요.
# 사용: powershell -ExecutionPolicy Bypass -File tools\auto\install.ps1
# 끄기: Unregister-ScheduledTask -TaskName LexiconAuto -Confirm:$false

$ErrorActionPreference = 'Stop'
$home2 = Join-Path $env:LOCALAPPDATA 'lexicon-auto'
$repo = Join-Path $home2 'repo'
$src = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

$py = (Get-Command python).Source
$pyw = Join-Path (& $py -c "import sys,os;print(os.path.dirname(sys.executable))") 'pythonw.exe'
if (-not (Test-Path $pyw)) { throw "pythonw.exe를 찾지 못했어요: $pyw" }
& $py -c "import PIL" ; if ($LASTEXITCODE) { throw 'Pillow가 필요해요: python -m pip install pillow' }
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { throw 'codex가 필요해요: npm i -g @openai/codex; codex login' }

New-Item -ItemType Directory -Force $home2 | Out-Null
if (-not (Test-Path (Join-Path $repo '.git'))) {
  $url = git -C $src config --get remote.origin.url
  git clone -q $url $repo
}

$action = New-ScheduledTaskAction -Execute $pyw -Argument "`"$repo\tools\auto\run.py`"" -WorkingDirectory $repo
$logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$logon.Delay = 'PT10M'
$daily = New-ScheduledTaskTrigger -Daily -At '13:00'
$set = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 3) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'LexiconAuto' -Action $action -Trigger $logon, $daily -Settings $set -Description 'Prompt Lexicon: GPT로 실제 결과를 하루 10개씩 만들어 올려요 (tools/auto/run.py)' -Force | Out-Null
Write-Host "등록했어요. 기록: $home2\logs"
