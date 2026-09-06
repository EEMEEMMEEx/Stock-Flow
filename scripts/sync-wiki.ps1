# ==============================================================================
# Stock-Flow GitHub Wiki Sync Script
# ==============================================================================
# วัตถุประสงค์: ซิงค์ไฟล์เอกสาร Markdown ทั้งหมดในโฟลเดอร์ wiki/ ไปยัง GitHub Wiki Git Repo
# Repository: https://github.com/EEMEEMMEEx/Stock-Flow.wiki.git
# ==============================================================================

param(
    [string]$RepoUrl = "https://github.com/EEMEEMMEEx/Stock-Flow.wiki.git",
    [string]$WikiSrc = "$PSScriptRoot\..\wiki",
    [string]$CommitMessage = "docs(wiki): update documentation pages"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Stock-Flow GitHub Wiki Synchronization" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if (-not (Test-Path $WikiSrc)) {
    Write-Error "ไม่พบโฟลเดอร์ต้นทาง: $WikiSrc"
    exit 1
}

Write-Host "[1/4] ตรวจสอบสถานะการเชื่อมต่อ GitHub Wiki..." -ForegroundColor Yellow

# ตรวจสอบว่า GitHub Wiki Git Repository พร้อมใช้งานหรือไม่
$null = & git ls-remote $RepoUrl 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[!] ข้อจำกัดของ GitHub Wiki (Initial Setup Required):" -ForegroundColor Yellow
    Write-Host "GitHub จะยังไม่สร้าง Git Backend สำหรับ Wiki จนกว่าจะมีการกดสร้างหน้าแรกผ่าน Web UI อย่างน้อย 1 ครั้ง" -ForegroundColor Gray
    Write-Host ""
    Write-Host "ขั้นตอนการเปิดใช้งาน (ทำเพียงครั้งแรกครั้งเดียว):" -ForegroundColor Cyan
    Write-Host "1. เปิดเบราว์เซอร์ไปที่: https://github.com/EEMEEMMEEx/Stock-Flow/wiki" -ForegroundColor White
    Write-Host "2. คลิกปุ่มสีเขียว 'Create the first page'" -ForegroundColor White
    Write-Host "3. คัดลอกเนื้อหาจากไฟล์ wiki/Home.md ไปวาง แล้วกด 'Save Page'" -ForegroundColor White
    Write-Host "4. รันคำสั่งนี้ซ้ำอีกครั้ง (npm run wiki:sync) เพื่ออัปโหลดเอกสารทุกหน้าแบบอัตโนมัติ" -ForegroundColor White
    Write-Host ""
    exit 0
}

$tempDir = Join-Path $env:TEMP "Stock-Flow-Wiki-Sync-$(Get-Random)"
Write-Host "[2/4] กำลัง Clone Wiki Git Repository..." -ForegroundColor Yellow

try {
    & git clone $RepoUrl $tempDir
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ไม่สามารถ Clone $RepoUrl ได้"
        exit 1
    }

    Write-Host "[3/4] กำลังคัดลอกไฟล์เอกสาร Markdown จาก wiki/ ..." -ForegroundColor Yellow
    $mdFiles = Get-ChildItem -Path $WikiSrc -Filter "*.md"
    foreach ($file in $mdFiles) {
        $dest = Join-Path $tempDir $file.Name
        Copy-Item -Path $file.FullName -Destination $dest -Force
        Write-Host "  -> $($file.Name)" -ForegroundColor Gray
    }

    Write-Host "[4/4] กำลัง Commit และ Push เอกสารขึ้น GitHub Wiki..." -ForegroundColor Yellow
    Push-Location $tempDir
    try {
        & git add .
        $status = & git status --porcelain
        if ([string]::IsNullOrWhiteSpace($status)) {
            Write-Host "[OK] เอกสารบน GitHub Wiki เป็นเวอร์ชันล่าสุดแล้ว ไม่มีการเปลี่ยนแปลง" -ForegroundColor Green
        } else {
            & git commit -m $CommitMessage
            $pushMaster = & git push origin master 2>&1
            if ($LASTEXITCODE -ne 0) {
                & git push origin main
            }
            Write-Host "[SUCCESS] ซิงค์เอกสารขึ้น GitHub Wiki สำเร็จเรียบร้อยแล้ว!" -ForegroundColor Green
            Write-Host "ตรวจสอบได้ที่: https://github.com/EEMEEMMEEx/Stock-Flow/wiki" -ForegroundColor Cyan
        }
    } finally {
        Pop-Location
    }
} finally {
    if (Test-Path $tempDir) {
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
