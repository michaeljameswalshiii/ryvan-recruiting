# Deploy to Vercel - Skill Script
# This script deploys the Next.js application to Vercel production
# Usage: Run this script from the project directory or call via npm script

param(
    [string]$ProjectPath = "C:\Users\micha\Desktop\turnkey-optimization",
    [string]$CommitMessage = "Deploy to Vercel production",
    [switch]$SkipBuild,
    [switch]$AutoYes
)

$ErrorActionPreference = "Stop"

Write-Host "=== Deploy to Vercel Skill ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectPath" -ForegroundColor Gray
Write-Host ""

# Step 1: Check for uncommitted changes
Write-Host "[1/4] Checking git status..." -ForegroundColor Yellow
Push-Location $ProjectPath
try {
    $gitStatus = git status --porcelain
    if ($gitStatus) {
        Write-Host "Uncommitted changes detected:" -ForegroundColor Yellow
        $gitStatus | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
        
        # Step 2: Commit changes
        Write-Host "[2/4] Committing changes..." -ForegroundColor Yellow
        git add .
        git commit -m $CommitMessage
        Write-Host "Changes committed successfully" -ForegroundColor Green
    } else {
        Write-Host "No uncommitted changes - proceeding with deploy" -ForegroundColor Gray
    }
} finally {
    Pop-Location
}

# Step 3: Build (optional)
if (-not $SkipBuild) {
    Write-Host "[3/4] Building application..." -ForegroundColor Yellow
    Push-Location $ProjectPath
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "Build failed with exit code $LASTEXITCODE"
        }
        Write-Host "Build successful" -ForegroundColor Green
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[3/4] Skipping build (--SkipBuild)" -ForegroundColor Gray
}

# Step 4: Deploy to Vercel
Write-Host "[4/4] Deploying to Vercel production..." -ForegroundColor Yellow
Push-Location $ProjectPath
try {
    if ($AutoYes) {
        npx vercel --prod --yes
    } else {
        npx vercel --prod
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Deploy failed with exit code $LASTEXITCODE"
    }
    Write-Host "Deployment successful!" -ForegroundColor Green
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "=== Deploy Complete ===" -ForegroundColor Cyan
Write-Host "Live URL: https://turnkey-optimization.vercel.app" -ForegroundColor Green
