# Archangel v1.1 — Surgical Apply Script
#
# What this does (and only this):
#   1. Snapshots current state in git
#   2. Renames image_*.png to eurelyas_*.png semantic names
#   3. Renames product to "Archangel" in package.json + index.html
#      (character stays Eurelyas in lore + system prompt)
#   4. Adds 3 new pose options to the system prompt in main.js so
#      Claude can call <action pose="aware|speaking|thinking"/>
#   5. Runs npm run dev for smoke test
#   6. Asks for your confirmation, then commits + pushes
#
# What this does NOT do:
#   - Does not replace your main.js, ChatWindow.jsx, or SpriteCharacter.jsx
#     (the v1.1 patch zip's versions of those files are scaffold code that
#     would erase your real implementation)
#   - Does not add zustand or a new state machine
#   - Does not touch poseForState() in SpriteCharacterWindow.jsx
#     (you opted to keep guide/blast as state defaults; new poses are
#     LLM-driven via <action pose="..."/> tags only)
#
# Run from C:\Users\Ajit\eurelyas:
#   .\apply-archangel-v1_1.ps1
#
# If PowerShell blocks execution:
#   powershell -ExecutionPolicy Bypass -File .\apply-archangel-v1_1.ps1

$ErrorActionPreference = "Stop"
$projectRoot = Get-Location

Write-Host ""
Write-Host "Archangel v1.1 — Surgical Apply" -ForegroundColor Cyan
Write-Host "Project: $projectRoot" -ForegroundColor Gray
Write-Host ""

# --- Sanity checks ---------------------------------------------------------
if (-not (Test-Path "package.json")) {
    Write-Host "ERROR: No package.json. Run from C:\Users\Ajit\eurelyas." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path "electron\main.js")) {
    Write-Host "ERROR: electron\main.js not found." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path "src\character\assets")) {
    Write-Host "ERROR: src\character\assets directory not found." -ForegroundColor Red
    exit 1
}

# --- 1. Git snapshot -------------------------------------------------------
Write-Host "[1/6] Snapshotting current state..." -ForegroundColor Yellow
$dirty = git status --porcelain
if ([string]::IsNullOrWhiteSpace($dirty)) {
    Write-Host "  Working tree clean. Nothing to snapshot." -ForegroundColor Green
} else {
    git add .
    git commit -m "Snapshot before Archangel v1.1 rename + pose integration" | Out-Null
    Write-Host "  Snapshot committed." -ForegroundColor Green
}

# --- 2. Rename pose images -------------------------------------------------
Write-Host "[2/6] Renaming pose images to semantic names..." -ForegroundColor Yellow
$renames = @{
    "image_0.png"        = "eurelyas_idle.png"
    "image_1_guide.png"  = "eurelyas_guide.png"
    "image_2_blast.png"  = "eurelyas_blast.png"
    "image_3.png"        = "eurelyas_aware.png"
    "image_4.png"        = "eurelyas_speaking.png"
    "image_5_down.png"   = "eurelyas_staff_down.png"
    "image_6.png"        = "eurelyas_thinking.png"
}
$assetsDir = "src\character\assets"
$renamed = 0
$skipped = 0
foreach ($pair in $renames.GetEnumerator()) {
    $src = Join-Path $assetsDir $pair.Key
    $dst = Join-Path $assetsDir $pair.Value
    if (Test-Path $src) {
        if (Test-Path $dst) {
            Write-Host "  SKIP: $($pair.Value) already exists, removing source $($pair.Key)" -ForegroundColor DarkYellow
            Remove-Item $src -Force
        } else {
            # Use git mv so history is preserved
            git mv $src $dst
            Write-Host "  $($pair.Key) -> $($pair.Value)" -ForegroundColor Gray
            $renamed++
        }
    } else {
        if (Test-Path $dst) {
            Write-Host "  SKIP: $($pair.Value) already in place" -ForegroundColor DarkYellow
            $skipped++
        } else {
            Write-Host "  MISSING: neither $($pair.Key) nor $($pair.Value) found" -ForegroundColor Red
        }
    }
}
Write-Host "  Renamed: $renamed | Already in place: $skipped" -ForegroundColor Green

# --- 3. Rename product to Archangel in package.json -----------------------
Write-Host "[3/6] Updating package.json branding..." -ForegroundColor Yellow
$pkgPath = "package.json"
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$changes = @()
if ($pkg.name -ne "archangel") {
    $pkg.name = "archangel"
    $changes += "name -> archangel"
}
# productName at top level (electron-builder reads this)
if ($pkg.PSObject.Properties.Name -contains "productName") {
    if ($pkg.productName -ne "Archangel") {
        $pkg.productName = "Archangel"
        $changes += "productName -> Archangel"
    }
} else {
    $pkg | Add-Member -NotePropertyName "productName" -NotePropertyValue "Archangel"
    $changes += "added productName: Archangel"
}
# build.appId and build.productName
if ($pkg.build) {
    if ($pkg.build.appId -ne "com.dixitlabs.archangel") {
        $pkg.build.appId = "com.dixitlabs.archangel"
        $changes += "build.appId -> com.dixitlabs.archangel"
    }
    if ($pkg.build.productName -ne "Archangel") {
        $pkg.build.productName = "Archangel"
        $changes += "build.productName -> Archangel"
    }
    if ($pkg.build.nsis -and $pkg.build.nsis.shortcutName -ne "Archangel") {
        $pkg.build.nsis.shortcutName = "Archangel"
        $changes += "build.nsis.shortcutName -> Archangel"
    }
}
# Write back. NOTE: PowerShell's ConvertTo-Json will reformat the file
# (different indentation, possibly reordered keys). The diff will look big
# even though only a few values changed. This is cosmetic; the file is
# functionally identical aside from the branding values.
$pkg | ConvertTo-Json -Depth 20 | Set-Content $pkgPath -Encoding UTF8
if ($changes.Count -gt 0) {
    $changes | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
} else {
    Write-Host "  Already up to date." -ForegroundColor Green
}

# --- 4. Update index.html title -------------------------------------------
Write-Host "[4/6] Updating index.html title..." -ForegroundColor Yellow
$indexPath = "index.html"
$html = Get-Content $indexPath -Raw
$newHtml = $html -replace '<title>[^<]*</title>', '<title>Archangel</title>'
if ($html -ne $newHtml) {
    Set-Content $indexPath -Value $newHtml -Encoding UTF8 -NoNewline
    Write-Host "  Title -> Archangel" -ForegroundColor Gray
} else {
    Write-Host "  Title already Archangel." -ForegroundColor Green
}

# --- 5. Add new poses to system prompt in main.js -------------------------
Write-Host "[5/6] Adding aware/speaking/thinking poses to system prompt..." -ForegroundColor Yellow
$mainPath = "electron\main.js"
$main = Get-Content $mainPath -Raw

# Add app.setAppUserModelId override if not already present
if ($main -notmatch "setAppUserModelId\(['""]com\.dixitlabs\.archangel['""]\)") {
    if ($main -match "setAppUserModelId") {
        # Already sets a different ID; replace it
        $main = $main -replace "setAppUserModelId\(['""][^'""]+['""]\)", "setAppUserModelId('com.dixitlabs.archangel')"
        Write-Host "  setAppUserModelId updated to com.dixitlabs.archangel" -ForegroundColor Gray
    } else {
        # Inject after the top-level destructured electron import.
        # Anchor specifically on the line that includes 'app' and 'BrowserWindow'
        # (the top-of-file import) so we don't accidentally inject after the
        # powerMonitor require deeper in the file.
        $anchor = "const \{ app, BrowserWindow[^}]*\} = require\('electron'\);"
        if ($main -match $anchor) {
            $main = $main -replace "($anchor)", "`$1`r`napp.setAppUserModelId('com.dixitlabs.archangel');"
            Write-Host "  setAppUserModelId('com.dixitlabs.archangel') injected" -ForegroundColor Gray
        } else {
            Write-Host "  WARNING: could not find top-level electron import to anchor on." -ForegroundColor Red
            Write-Host "  Add 'app.setAppUserModelId(\"com.dixitlabs.archangel\");' to main.js manually." -ForegroundColor Red
        }
    }
}

# Add three new pose lines to the POSE section.
# Anchor on the staff_down line via regex (em-dash tolerated as any dash variant).
# The actual file may use — (em-dash, U+2014), - (hyphen), or – (en-dash, U+2013).
# We capture the existing line in full and inject the three new lines above it,
# preserving the original line byte-for-byte.
$staffDownPattern = '(?m)^- <action pose="staff_down"/>.*$'
$awareLine     = '- <action pose="aware"/> — lunging forward, staff outstretched. Alert to a turn in the conversation, leaning into a moment that just sharpened.'
$speakingLine  = '- <action pose="speaking"/> — heroic stance, four wings full, staff held high. Delivering counsel that carries weight.'
$thinkingLine  = '- <action pose="thinking"/> — overhead lunge, beam channeling from the staff. Working through something hard, casting against a problem.'

if ($main -match '<action pose="aware"/>') {
    Write-Host "  Poses already present in system prompt." -ForegroundColor Green
} elseif ($main -match $staffDownPattern) {
    $matched = $Matches[0]
    $replacement = "$awareLine`r`n$speakingLine`r`n$thinkingLine`r`n$matched"
    $main = $main -replace [regex]::Escape($matched), $replacement
    Write-Host "  Added 3 poses (aware, speaking, thinking) to system prompt" -ForegroundColor Gray
} else {
    Write-Host "  WARNING: could not find staff_down anchor in main.js." -ForegroundColor Red
    Write-Host "  System prompt unchanged. Add aware/speaking/thinking poses manually." -ForegroundColor Red
}

Set-Content $mainPath -Value $main -Encoding UTF8 -NoNewline

# --- 6. Smoke test ---------------------------------------------------------
Write-Host ""
Write-Host "[6/6] Ready for smoke test." -ForegroundColor Yellow
Write-Host ""
Write-Host "  When you press Enter, this script will run 'npm run dev'." -ForegroundColor White
Write-Host "  Verify in the running app:" -ForegroundColor White
Write-Host "    - Eurelyas hovers in idle pose (was image_0, now eurelyas_idle.png)" -ForegroundColor Gray
Write-Host "    - Ctrl+Shift+Space summons the chat window titled per Archangel branding" -ForegroundColor Gray
Write-Host "    - Send a message: pose changes to blast (thinking) then guide (speaking)" -ForegroundColor Gray
Write-Host "    - Optionally ask Claude to use <action pose=`"aware`"/> in a reply to test new poses" -ForegroundColor Gray
Write-Host ""
Write-Host "  Stop the app with Ctrl+C in the dev terminal when done." -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to launch dev server"

npm run dev

Write-Host ""
Write-Host "Dev server stopped." -ForegroundColor Cyan
$confirm = Read-Host "Did the smoke test pass? (y/N)"
if ($confirm -ne "y") {
    Write-Host ""
    Write-Host "Holding off on commit and push. Your changes are in the working tree." -ForegroundColor Yellow
    Write-Host "Inspect with: git diff" -ForegroundColor Gray
    Write-Host "Roll back with: git checkout -- ." -ForegroundColor Gray
    exit 0
}

# --- Commit and push -------------------------------------------------------
Write-Host ""
Write-Host "Committing and pushing..." -ForegroundColor Yellow
git add .
git commit -m "Archangel v1.1: rename product, integrate 7 semantic poses, add aware/speaking/thinking to pose vocabulary"
git push origin main

Write-Host ""
Write-Host "Done. Repo: https://github.com/DixitLabsAdmin/Archangel" -ForegroundColor Green
Write-Host ""
