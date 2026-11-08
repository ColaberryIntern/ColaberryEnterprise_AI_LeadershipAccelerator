<#
.SYNOPSIS
    Rebuild a Claude Code working machine from a handoff bundle.

.DESCRIPTION
    Run this ON THE NEW COMPUTER, after installing git and the Claude Code
    VS Code extension. It takes the bundle produced by captureTab.js and
    captureMachine.js and recreates the parts of the old machine that actually
    matter: the repo, the worktrees the live tabs were working in, their
    branches and uncommitted diffs, the memory directory, and a checklist of
    the credentials it deliberately refuses to carry.

    WHY A SCRIPT RATHER THAN A CHECKLIST
    The old machine has over 400 worktrees and 2,800 branches. The interesting
    subset is small but it is not memorable, and a half-restored machine that
    looks finished is worse than one that plainly is not. Every step here
    checks before it acts and reports what it found, so running it twice is
    safe and running it once tells you what is still missing.

    WHAT IT CANNOT DO
    It cannot give you credentials. Env var VALUES are not in the bundle, by
    design, because a bundle travels by email and USB stick. It writes
    ENV_CHECKLIST.md instead, naming every variable and where to fetch it.
    It also cannot restore background processes or re-authorize MCP servers.

.PARAMETER Bundle
    Path to the unzipped bundle folder (the one containing manifest.json).

.PARAMETER RepoRoot
    Where to clone the repo. Defaults to the path recorded in the bundle.
    Matching the old path is what lets transcripts resume, because Claude Code
    names a session's transcript folder after the directory it started in.

.PARAMETER SkipPrereqs
    Continue even when a required tool is missing or a different version.

.PARAMETER SkipPatches
    Do not apply the uncommitted-work patches.

.PARAMETER WithTranscripts
    Restore conversation transcripts, if the bundle was built with them.

.PARAMETER Verify
    After restoring, prove the checkout works by running the handoff self-test.

.PARAMETER Force
    Proceed despite an incomplete bundle, and overwrite existing settings.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\handoff\bootstrapMachine.ps1 -Bundle C:\Users\me\Downloads\claude-handoff-20261108-1230
#>
param(
    [Parameter(Mandatory = $true)][string]$Bundle,
    [string]$RepoRoot = '',
    [switch]$SkipPrereqs,
    [switch]$SkipPatches,
    [switch]$WithTranscripts,
    [switch]$Verify,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$script:Warnings = @()
$script:Todo = @()

function Say([string]$m) { Write-Host $m }
function Step([string]$m) { Write-Host ''; Write-Host "== $m" -ForegroundColor Cyan }
function Ok([string]$m) { Write-Host "   ok    $m" -ForegroundColor Green }
function Skip([string]$m) { Write-Host "   skip  $m" -ForegroundColor DarkGray }
function Warn([string]$m) {
    Write-Host "   WARN  $m" -ForegroundColor Yellow
    $script:Warnings += $m
}
function Todo([string]$m) { $script:Todo += $m }
function Die([string]$m) {
    Write-Host ''
    Write-Host "FATAL: $m" -ForegroundColor Red
    exit 1
}

# Claude Code names a transcript folder after the absolute directory a session
# started in, with every non-alphanumeric character replaced by a hyphen. The
# capture side derives this identically; see handoffBundle.js projectSlug().
function Get-ProjectSlug([string]$p) {
    $full = [System.IO.Path]::GetFullPath($p).TrimEnd('\', '/')
    return ($full -replace '[^a-zA-Z0-9]', '-')
}

function Test-Tool([string]$name) {
    $c = Get-Command $name -ErrorAction SilentlyContinue
    if ($null -eq $c) { return $null }
    return $c.Source
}

# ---------------------------------------------------------------- 0. the bundle
Step '0. Validate the bundle'

if (-not (Test-Path $Bundle)) { Die "bundle folder not found: $Bundle" }
$manifestPath = Join-Path $Bundle 'manifest.json'
if (-not (Test-Path $manifestPath)) {
    Die "no manifest.json in $Bundle. The bundle was never finalized: run captureMachine.js --finalize on the old machine."
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schema -ne 'colaberry.handoff/1') {
    Warn "unexpected manifest schema '$($manifest.schema)'. Continuing, but this script may not understand it."
}

# An incomplete bundle is the failure mode that produces a machine which looks
# restored and is not, so it stops here by default.
$tabFiles = @(Get-ChildItem (Join-Path $Bundle 'tabs') -Filter '*.json' -ErrorAction SilentlyContinue)
if ($tabFiles.Count -ne $manifest.tabCount) {
    $msg = "manifest claims $($manifest.tabCount) tabs but $($tabFiles.Count) tab files are present"
    if ($Force) { Warn $msg } else { Die "$msg. Re-finalize on the old machine, or pass -Force." }
}
if (-not $manifest.machineCaptured) {
    $msg = 'the bundle has no machine tier (prereqs, env names, memory)'
    if ($Force) { Warn $msg } else { Die "$msg. Run captureMachine.js --finalize on the old machine, or pass -Force." }
}
Ok "$($manifest.tabCount) tabs, machine tier present, generated $($manifest.generatedAt)"

# Several tabs legitimately share one worktree -- on the machine this was built
# from, 14 of 18 tabs sat in the same checkout -- so uncommitted work is stored
# once per WORKTREE and the tab files point at it by key. Group them here, once,
# and both the restore steps and the tab listing read this map rather than
# assuming one patch per tab.
$tabsByWorktreeId = @{}
foreach ($t in $tabFiles) {
    $tab = Get-Content $t.FullName -Raw | ConvertFrom-Json
    $key = $tab.worktreeId
    if (-not $key) { $key = $tab.sessionId }   # bundles built before the key existed
    if (-not $tabsByWorktreeId.ContainsKey($key)) {
        $tabsByWorktreeId[$key] = [pscustomobject]@{ Tab = $tab; Sessions = @() }
    }
    $tabsByWorktreeId[$key].Sessions += $tab.sessionId
}

$machine = $manifest.machine
if ($RepoRoot -eq '') {
    if ($machine -and $machine.repo -and $machine.repo.root) { $RepoRoot = $machine.repo.root }
    else { Die 'the bundle records no repo path. Pass -RepoRoot explicitly.' }
}
$oldRepoRoot = ''
if ($machine -and $machine.repo) { $oldRepoRoot = $machine.repo.root }

Say ''
Say "   repo will live at : $RepoRoot"
if ($oldRepoRoot -ne '' -and $oldRepoRoot -ne $RepoRoot) {
    Warn "that is NOT the old path ($oldRepoRoot). Everything still works, but transcript resume needs the folder name to match, so the memory and transcript steps below remap the slug."
}

# ------------------------------------------------------------- 1. prerequisites
Step '1. Prerequisites'

$needed = @('git', 'node', 'npm')
$optional = @('gh', 'docker', 'python', 'pwsh')
$missing = @()
foreach ($t in $needed) {
    $src = Test-Tool $t
    if ($null -eq $src) { $missing += $t; Warn "$t is NOT installed (required)" }
    else { Ok "$t at $src" }
}
foreach ($t in $optional) {
    $src = Test-Tool $t
    if ($null -eq $src) {
        Warn "$t is not installed (optional)"
        Todo "Install $t if you need it: gh for PRs, docker for the local stack, python for the commission scripts."
    }
    else { Ok "$t at $src" }
}
if ($machine -and $machine.prereqs) {
    Say ''
    Say '   versions on the old machine, for reference:'
    foreach ($p in $machine.prereqs.PSObject.Properties) {
        if ($null -ne $p.Value) { Say ("     {0,-10} {1}" -f $p.Name, $p.Value) }
    }
}
if ($missing.Count -gt 0 -and -not $SkipPrereqs) {
    Die "install $($missing -join ', ') and run this again, or pass -SkipPrereqs."
}

# -------------------------------------------------------------------- 2. clone
Step '2. Repository'

if (Test-Path (Join-Path $RepoRoot '.git')) {
    Skip "already a git repo at $RepoRoot"
}
else {
    $remote = ''
    if ($machine -and $machine.repo) { $remote = $machine.repo.remote }
    if ($remote -eq '' -or $null -eq $remote) { Die 'the bundle records no git remote, so the repo cannot be cloned. Clone it by hand, then re-run with -RepoRoot.' }
    $parent = Split-Path $RepoRoot -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force $parent | Out-Null }
    Say "   cloning $remote"
    git clone $remote $RepoRoot
    if ($LASTEXITCODE -ne 0) { Die 'git clone failed' }
    Ok "cloned to $RepoRoot"
}

Push-Location $RepoRoot
try {
    git fetch origin --prune
    if ($LASTEXITCODE -ne 0) { Warn 'git fetch failed; worktree creation may not find its branches' }
    else { Ok 'fetched origin' }
}
finally { Pop-Location }

# ---------------------------------------------------------------- 3. worktrees
Step '3. Worktrees for the live tabs'

$activeWorktrees = @()
if ($machine -and $machine.worktrees -and $machine.worktrees.active) { $activeWorktrees = @($machine.worktrees.active) }

if ($activeWorktrees.Count -eq 0) {
    Skip 'no tab was working in a separate worktree'
}
foreach ($w in $activeWorktrees) {
    # Remap the worktree path if the repo moved, keeping the folder name.
    $leaf = Split-Path $w.path -Leaf
    $target = Join-Path (Split-Path $RepoRoot -Parent) $leaf
    if ($w.path -eq $target -or ($oldRepoRoot -eq $RepoRoot)) { $target = $w.path }

    if (Test-Path $target) { Skip "$leaf already exists at $target"; continue }
    if ($null -eq $w.branch) { Skip "$leaf was on a detached HEAD; recreate it by hand if you need it"; continue }

    Push-Location $RepoRoot
    try {
        # The branch may already exist locally (a previous run) or only on the
        # remote, so both spellings are tried before giving up on it.
        git worktree add $target $w.branch
        if ($LASTEXITCODE -ne 0) {
            git worktree add -b $w.branch $target "origin/$($w.branch)"
        }
        if ($LASTEXITCODE -ne 0) { Warn "could not create worktree $leaf on branch $($w.branch)" }
        else { Ok "$leaf on $($w.branch)" }
    }
    finally { Pop-Location }
}

$inventoryCount = 0
if ($machine -and $machine.worktrees) { $inventoryCount = @($machine.worktrees.inventoryOnly).Count }
if ($inventoryCount -gt 0) {
    Say ''
    Say "   $inventoryCount further worktrees existed on the old machine and were NOT recreated,"
    Say '   deliberately. They are listed in machine\machine.json under worktrees.inventoryOnly.'
}

# --------------------------------------------------------------------- 4. env
Step '4. Environment variables (names only, never values)'

$examplePath = Join-Path $RepoRoot 'backend\.env.example'
$envPath = Join-Path $RepoRoot 'backend\.env'
if ((Test-Path $examplePath) -and (-not (Test-Path $envPath))) {
    Copy-Item $examplePath $envPath
    Ok 'created backend\.env from .env.example (all values blank)'
}
elseif (Test-Path $envPath) { Skip 'backend\.env already exists; left untouched' }
else { Warn 'backend\.env.example not found in the clone' }

if ($machine -and $machine.env -and $machine.env.names) {
    $wasSet = @($machine.env.names | Where-Object { $_.setOnOldMachine })
    $fromProd = @($wasSet | Where-Object { $_.source -eq 'prod-container' })
    $localVal = @($wasSet | Where-Object { $_.source -eq 'local-value' })

    $lines = @()
    $lines += '# Environment checklist'
    $lines += ''
    $lines += "Generated by bootstrapMachine.ps1 from the handoff bundle on $(Get-Date -Format 'yyyy-MM-dd HH:mm')."
    $lines += ''
    $lines += 'The bundle carries variable NAMES and whether the old machine had them set. It never'
    $lines += 'carries a value. Fill these in before expecting the backend to start.'
    $lines += ''
    $lines += "## Credentials ($($fromProd.Count)) - fetch from the production container"
    $lines += ''
    $lines += 'For each one:'
    $lines += ''
    $lines += '    ssh root@95.216.199.47 "docker exec accelerator-backend printenv <NAME>"'
    $lines += ''
    foreach ($e in $fromProd) { $lines += "- [ ] $($e.name)" }
    $lines += ''
    $lines += "## Local or dev values ($($localVal.Count)) - set to whatever suits this machine"
    $lines += ''
    foreach ($e in $localVal) { $lines += "- [ ] $($e.name)" }
    $lines += ''
    $lines += '## Not set on the old machine either'
    $lines += ''
    $lines += 'Everything else in backend/.env.example was blank there too, so it is probably optional.'
    $lines += ''

    $checklist = Join-Path $RepoRoot 'ENV_CHECKLIST.md'
    Set-Content -Path $checklist -Value ($lines -join "`n") -Encoding utf8
    Ok "wrote ENV_CHECKLIST.md ($($fromProd.Count) credentials, $($localVal.Count) local values)"
    Todo "Fill in backend\.env using ENV_CHECKLIST.md. Nothing that talks to Mandrill, Basecamp, OpenAI or the database works until you do."
}

# ------------------------------------------------------------------ 5. memory
Step '5. Claude memory'

$bundleMemory = Join-Path $Bundle 'memory'
if (-not (Test-Path $bundleMemory)) {
    Warn 'the bundle carries no memory directory, so this machine starts with no recall'
}
else {
    $oldMainSlug = ''
    if ($oldRepoRoot -ne '') { $oldMainSlug = Get-ProjectSlug $oldRepoRoot }
    $newMainSlug = Get-ProjectSlug $RepoRoot
    $projectsDir = Join-Path $env:USERPROFILE '.claude\projects'

    foreach ($dir in Get-ChildItem $bundleMemory -Directory) {
        # A tab started in a subdirectory has its own slug (for example the one
        # ending "-docs"). Remap only the main-root prefix so the suffix is kept.
        $destSlug = $dir.Name
        if ($oldMainSlug -ne '' -and $dir.Name.StartsWith($oldMainSlug)) {
            $destSlug = $newMainSlug + $dir.Name.Substring($oldMainSlug.Length)
        }
        $dest = Join-Path $projectsDir "$destSlug\memory"
        if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Force $dest | Out-Null }
        $files = @(Get-ChildItem $dir.FullName -File)
        foreach ($f in $files) { Copy-Item $f.FullName (Join-Path $dest $f.Name) -Force }
        Ok "$($files.Count) memory files into $destSlug"
    }
}

# ---------------------------------------------------------------- 6. settings
Step '6. Claude settings'

$userSettingsSrc = Join-Path $Bundle 'machine\user-settings.json'
$userSettingsDst = Join-Path $env:USERPROFILE '.claude\settings.json'
if (Test-Path $userSettingsSrc) {
    if ((Test-Path $userSettingsDst) -and (-not $Force)) { Skip 'user settings already exist; pass -Force to overwrite' }
    else {
        $parent = Split-Path $userSettingsDst -Parent
        if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force $parent | Out-Null }
        Copy-Item $userSettingsSrc $userSettingsDst -Force
        Ok 'restored ~\.claude\settings.json'
    }
}
else { Skip 'no user settings in the bundle' }

$projSettingsSrc = Join-Path $Bundle 'machine\project-settings.local.json'
$projSettingsDst = Join-Path $RepoRoot '.claude\settings.local.json'
if (Test-Path $projSettingsSrc) {
    if ((Test-Path $projSettingsDst) -and (-not $Force)) { Skip 'project local settings already exist; pass -Force to overwrite' }
    else {
        Copy-Item $projSettingsSrc $projSettingsDst -Force
        Ok 'restored .claude\settings.local.json (the permission allowlist)'
    }
}
else { Skip 'no project local settings in the bundle' }

if ($machine -and $machine.mcpServers -and @($machine.mcpServers).Count -gt 0) {
    Say ''
    Say "   $(@($machine.mcpServers).Count) MCP servers were configured on the old machine:"
    Say ("     " + ($machine.mcpServers -join ', '))
    Todo 'Re-add and re-authorize the MCP servers listed above. Their configs can hold OAuth tokens, so the bundle carries only their names.'
}
elseif ($machine -and $machine.mcpAccountManaged) {
    # An empty list here means "nothing to move", not "we failed to look". The
    # old machine had no local MCP config at all: its Gmail, Calendar and Docs
    # connectors are claude.ai account-managed, so signing in brings them along.
    Ok 'no local MCP config to move: the connectors are claude.ai account-managed and follow your login'
}

# ----------------------------------------------------------------- 7. patches
Step '7. Uncommitted work'

if ($SkipPatches) { Skip '-SkipPatches was passed' }
else {
    $patchDir = Join-Path $Bundle 'patches'
    $patches = @(Get-ChildItem $patchDir -Filter '*.patch' -ErrorAction SilentlyContinue)
    if ($patches.Count -eq 0) { Skip 'no patches in the bundle' }
    foreach ($p in $patches) {
        $key = [System.IO.Path]::GetFileNameWithoutExtension($p.Name)
        if (-not $tabsByWorktreeId.ContainsKey($key)) { Warn "patch $($p.Name) matches no captured tab; skipped"; continue }
        $group = $tabsByWorktreeId[$key]
        $tab = $group.Tab
        $sessionId = $group.Sessions -join ', '

        $leaf = Split-Path $tab.worktree -Leaf
        $target = $tab.worktree
        if (-not (Test-Path $target)) { $target = Join-Path (Split-Path $RepoRoot -Parent) $leaf }
        if (-not (Test-Path $target)) { $target = $RepoRoot }

        Push-Location $target
        try {
            # --3way uses blob history to merge rather than demanding exact
            # context, which matters because origin/main has moved since capture.
            git apply --3way --whitespace=nowarn $p.FullName
            if ($LASTEXITCODE -ne 0) {
                Warn "the patch for $leaf did not apply cleanly. It is kept at $($p.FullName); apply it by hand. Tabs affected: $sessionId"
                Todo "Resolve the patch conflict in $leaf (tabs: $sessionId)."
            }
            else { Ok "applied $($tab.git.trackedChangedCount) changed files into $leaf (shared by $(@($group.Sessions).Count) tab(s))" }
        }
        finally { Pop-Location }
    }
}

# --------------------------------------------------- 7b. uncommitted new files
Step '7b. New files that were never committed'

# These could not ride in the patch, because git cannot diff a file it does not
# track. Existing files are never overwritten: a conflict here means the new
# machine already has its own version, and silently replacing it would destroy
# work rather than restore it.
$extrasRoot = Join-Path $Bundle 'extras'
if (-not (Test-Path $extrasRoot)) { Skip 'no untracked files were carried' }
else {
    foreach ($dir in Get-ChildItem $extrasRoot -Directory) {
        if (-not $tabsByWorktreeId.ContainsKey($dir.Name)) { Warn "extras folder $($dir.Name) matches no captured tab; skipped"; continue }
        $tab = $tabsByWorktreeId[$dir.Name].Tab

        $leaf = Split-Path $tab.worktree -Leaf
        $target = $tab.worktree
        if (-not (Test-Path $target)) { $target = Join-Path (Split-Path $RepoRoot -Parent) $leaf }
        if (-not (Test-Path $target)) { $target = $RepoRoot }

        $restored = 0
        $conflicts = 0
        $prefix = $dir.FullName.Length + 1
        foreach ($f in Get-ChildItem $dir.FullName -Recurse -File) {
            $rel = $f.FullName.Substring($prefix)
            $dest = Join-Path $target $rel
            if (Test-Path $dest) { $conflicts += 1; continue }
            $parent = Split-Path $dest -Parent
            if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force $parent | Out-Null }
            Copy-Item $f.FullName $dest
            $restored += 1
        }
        Ok "$restored new files into $leaf"
        if ($conflicts -gt 0) {
            Warn "$conflicts file(s) already existed in $leaf and were left alone; compare against $($dir.FullName)"
            Todo "Compare the $conflicts pre-existing file(s) in $leaf against $($dir.FullName)."
        }
    }
}

# ------------------------------------------------------------- 8. transcripts
Step '8. Transcripts'

$tDir = Join-Path $Bundle 'transcripts'
if (-not $WithTranscripts) {
    if (Test-Path $tDir) { Skip 'the bundle has transcripts; pass -WithTranscripts to restore them' }
    else { Skip 'the bundle carries no transcripts, by design' }
}
elseif (-not (Test-Path $tDir)) { Warn '-WithTranscripts was passed but the bundle has none' }
else {
    $oldMainSlug = ''
    if ($oldRepoRoot -ne '') { $oldMainSlug = Get-ProjectSlug $oldRepoRoot }
    $newMainSlug = Get-ProjectSlug $RepoRoot
    foreach ($dir in Get-ChildItem $tDir -Directory) {
        $destSlug = $dir.Name
        if ($oldMainSlug -ne '' -and $dir.Name.StartsWith($oldMainSlug)) {
            $destSlug = $newMainSlug + $dir.Name.Substring($oldMainSlug.Length)
        }
        $dest = Join-Path $env:USERPROFILE ".claude\projects\$destSlug"
        if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Force $dest | Out-Null }
        $files = @(Get-ChildItem $dir.FullName -File)
        foreach ($f in $files) { Copy-Item $f.FullName (Join-Path $dest $f.Name) -Force }
        Ok "$($files.Count) transcripts into $destSlug"
    }
}

# ---------------------------------------------------------------- 9. the tabs
Step '9. Reopen these tabs'

# Grouped by worktree, because that is how the windows get opened: one VS Code
# window per checkout, however many tabs were living in it.
foreach ($key in $tabsByWorktreeId.Keys) {
    $group = $tabsByWorktreeId[$key]
    $tab = $group.Tab
    Say ''
    Say "   --- $(Split-Path $tab.worktree -Leaf)   [$($tab.git.branch)]   $(@($group.Sessions).Count) tab(s)"
    Say "       path     $($tab.worktree)"
    foreach ($s in $group.Sessions) {
        $file = Join-Path $Bundle "tabs\$s.json"
        if (-not (Test-Path $file)) { continue }
        $one = Get-Content $file -Raw | ConvertFrom-Json
        Say "       tab      $s"
        if ($one.sessionLogId) { Say "                log  session-logs\$($one.sessionLogId).md" }
        foreach ($pr in @($one.prs)) { Say "                PR   $($pr.url)" }
        if ($one.note) { Say "                note $($one.note)" }
    }
}
Say ''
Say '   Open one VS Code window per worktree above and start a Claude Code tab in it.'
Say "   Each tab's tabs\<session>.md says where that work stood."
Say '   Or paste RESUME_PROMPT.md into a fresh Claude Code tab and let it drive.'

# ----------------------------------------------------------------- 10. verify
if ($Verify) {
    Step '10. Verify the checkout'
    Push-Location $RepoRoot
    try {
        node scripts/handoff/handoffSelfTest.js
        if ($LASTEXITCODE -ne 0) { Warn 'the handoff self-test failed on this machine' }
        else { Ok 'handoff self-test passed, so node and the checkout are sound' }
    }
    finally { Pop-Location }
    Todo 'Install dependencies before building: npm ci at the root, then npm ci in backend. See SETUP.md.'
}

# ---------------------------------------------------------------- the summary
Write-Host ''
Write-Host '================ RESULT ================' -ForegroundColor Cyan
if ($script:Warnings.Count -eq 0) { Write-Host 'No warnings.' -ForegroundColor Green }
else {
    Write-Host "$($script:Warnings.Count) warning(s):" -ForegroundColor Yellow
    foreach ($w in $script:Warnings) { Write-Host "  - $w" -ForegroundColor Yellow }
}
Write-Host ''
if ($script:Todo.Count -eq 0) { Write-Host 'Nothing left for you to do.' -ForegroundColor Green }
else {
    Write-Host 'Still yours to do, in order:' -ForegroundColor White
    $i = 1
    foreach ($d in $script:Todo) { Write-Host "  $i. $d"; $i += 1 }
}
Write-Host ''
Write-Host 'This script is safe to run again: every step checks before it acts.'
