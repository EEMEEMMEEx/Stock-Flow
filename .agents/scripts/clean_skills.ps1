# Clean Unused Skills Script
$workspaceSkills = @(
    'bash-linux',
    'game-development',
    'geo-fundamentals',
    'i18n-localization',
    'mcp-builder',
    'mobile-design',
    'nextjs-react-expert',
    'python-patterns',
    'red-team-tactics',
    'rust-pro',
    'seo-fundamentals'
)

$globalSkills = @(
    'ai-migration-team',
    'dbos-typescript',
    'debug-mantra',
    'gridgeist',
    'javascript-typescript-typescript-scaffold',
    'management-talk',
    'post-mortem',
    'qwen-agent',
    'qwenchance',
    'reverse-skill',
    'systematic-debugging',
    'web-design-guidelines',
    'typescript-advanced-types',
    'typescript-pro'
)

Write-Host "=== Starting Skills Cleanup ===" -ForegroundColor Cyan

# 1. Clean Workspace Skills
$wsPath = "d:\APP\Stock-Flow-app\.agents\skills"
foreach ($skill in $workspaceSkills) {
    $target = Join-Path $wsPath $skill
    if (Test-Path $target) {
        Remove-Item -Recurse -Force $target
        Write-Host "[Deleted Workspace Skill] $skill" -ForegroundColor Green
    }
}

# 2. Clean Global Skills
$glPath = "$env:USERPROFILE\.gemini\config\skills"
foreach ($skill in $globalSkills) {
    $target = Join-Path $glPath $skill
    if (Test-Path $target) {
        Remove-Item -Recurse -Force $target
        Write-Host "[Deleted Global Skill] $skill" -ForegroundColor Green
    }
}

Write-Host "=== Cleanup Completed Successfully ===" -ForegroundColor Cyan
