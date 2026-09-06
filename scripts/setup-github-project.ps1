# Setup GitHub Projects v2 for Stock-Flow Repository
# Requires GitHub CLI with 'project' scope:
# Run `gh auth refresh -s project` before executing this script.

param(
    [string]$Owner = "EEMEEMMEEx",
    [string]$ProjectTitle = "Stock-Flow Development Board",
    [string]$Repo = "EEMEEMMEEx/Stock-Flow"
)

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Stock-Flow - GitHub Project Board Setup Tool" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Verify gh auth scopes
Write-Host "`nChecking GitHub CLI authentication and project permissions..." -ForegroundColor Yellow
$authStatus = gh auth status 2>&1 | Out-String
if ($authStatus -notmatch "project") {
    Write-Host "[!] Note: 'project' scope might be missing from your gh token." -ForegroundColor Yellow
    Write-Host "    If project creation fails, please execute: gh auth refresh -s project" -ForegroundColor Gray
}

# 2. Check if project already exists
Write-Host "`nListing existing projects for owner '$Owner'..." -ForegroundColor Yellow
$projects = gh project list --owner $Owner --format json | ConvertFrom-Json 2>$null

$existingProject = $null
if ($projects -and $projects.projects) {
    $existingProject = $projects.projects | Where-Object { $_.title -eq $ProjectTitle }
}

$projectId = ""
$projectNumber = 0

if ($existingProject) {
    $projectId = $existingProject.id
    $projectNumber = $existingProject.number
    Write-Host "[✓] Found existing project: '$ProjectTitle' (Number: $projectNumber, ID: $projectId)" -ForegroundColor Green
} else {
    Write-Host "`nCreating new GitHub Project: '$ProjectTitle'..." -ForegroundColor Yellow
    $createResult = gh project create --owner $Owner --title $ProjectTitle --format json | ConvertFrom-Json
    if ($createResult) {
        $projectId = $createResult.id
        $projectNumber = $createResult.number
        Write-Host "[✓] Project created successfully! (Number: $projectNumber, ID: $projectId)" -ForegroundColor Green
    } else {
        Write-Error "Failed to create project. Please verify permissions."
        exit 1
    }
}

# 3. Link Project to Repository
Write-Host "`nLinking Project #$projectNumber to repository '$Repo'..." -ForegroundColor Yellow
gh project link $projectNumber --owner $Owner --repo $Repo 2>$null
Write-Host "[✓] Linked to $Repo" -ForegroundColor Green

# 4. Create custom fields
Write-Host "`nConfiguring custom project fields..." -ForegroundColor Yellow

# Field: Priority
Write-Host "Configuring 'Priority' field (Single Select)..." -ForegroundColor Gray
gh project field-create $projectNumber --owner $Owner --name "Priority" --data-type "SINGLE_SELECT" --single-select-options "Urgent,High,Medium,Low" 2>$null

# Field: Type
Write-Host "Configuring 'Type' field (Single Select)..." -ForegroundColor Gray
gh project field-create $projectNumber --owner $Owner --name "Type" --data-type "SINGLE_SELECT" --single-select-options "Feature,Bug,UI/UX,Security,Documentation,Refactor" 2>$null

# Field: Sprint
Write-Host "Configuring 'Sprint' field (Iteration)..." -ForegroundColor Gray
gh project field-create $projectNumber --owner $Owner --name "Sprint" --data-type "ITERATION" 2>$null

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "  Project Setup Complete!" -ForegroundColor Green
Write-Host "  URL: https://github.com/users/$Owner/projects/$projectNumber" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan
