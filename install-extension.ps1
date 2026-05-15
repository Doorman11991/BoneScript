# BoneScript VS Code Extension Installer
# Run this script to build and install the BoneScript extension in VS Code.
# Usage: .\install-extension.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "BoneScript Extension Installer" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Step 1: Build compiler
Write-Host "`n[1/4] Building compiler..." -ForegroundColor Yellow
Set-Location "$root\compiler"
npm install --silent
Write-Host "  Compiler dependencies installed."

# Step 2: Build LSP
Write-Host "`n[2/4] Building language server..." -ForegroundColor Yellow
Set-Location "$root\lsp"
npm install --silent
npm run build
Write-Host "  Language server built: lsp/dist/server.js"

# Step 3: Build extension
Write-Host "`n[3/4] Building VS Code extension..." -ForegroundColor Yellow
Set-Location "$root\vscode-ext"
npm install --silent
npm run build
Write-Host "  Extension built: vscode-ext/out/extension.js"

# Step 4: Install in VS Code
Write-Host "`n[4/4] Installing extension in VS Code..." -ForegroundColor Yellow

# Check if vsce is available for packaging
$vsceAvailable = $null
try { $vsceAvailable = Get-Command npx -ErrorAction SilentlyContinue } catch {}

if ($vsceAvailable) {
    try {
        npx vsce package --no-dependencies --out bonescript-vscode.vsix 2>$null
        if (Test-Path "bonescript-vscode.vsix") {
            code --install-extension bonescript-vscode.vsix
            Remove-Item "bonescript-vscode.vsix" -Force
            Write-Host "  Extension installed via .vsix package."
        }
    } catch {
        Write-Host "  Could not package .vsix. Trying direct install..." -ForegroundColor Yellow
        # Fallback: copy to VS Code extensions directory
        $extDir = "$env:USERPROFILE\.vscode\extensions\bonescript.bonescript-vscode-0.4.0"
        if (-not (Test-Path $extDir)) { New-Item -ItemType Directory -Path $extDir -Force | Out-Null }
        Copy-Item -Recurse -Force "$root\vscode-ext\*" $extDir
        Write-Host "  Extension copied to: $extDir"
        Write-Host "  Restart VS Code to activate."
    }
} else {
    # Direct copy fallback
    $extDir = "$env:USERPROFILE\.vscode\extensions\bonescript.bonescript-vscode-0.4.0"
    if (-not (Test-Path $extDir)) { New-Item -ItemType Directory -Path $extDir -Force | Out-Null }
    Copy-Item -Recurse -Force "$root\vscode-ext\*" $extDir
    Write-Host "  Extension copied to: $extDir"
    Write-Host "  Restart VS Code to activate."
}

Set-Location $root

Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Features enabled in VS Code:" -ForegroundColor White
Write-Host "  - Syntax highlighting for .bone files"
Write-Host "  - Real-time diagnostics (lex + parse + type check)"
Write-Host "  - Context-aware completions"
Write-Host "  - Hover docs for keywords and user-defined names"
Write-Host "  - Go-to-definition for entities, capabilities, events"
Write-Host "  - Document outline (Ctrl+Shift+O)"
Write-Host "  - Signature help for capability calls"
Write-Host "  - Quick fixes for all error codes (T001-T015)"
Write-Host "  - Format Document (Shift+Alt+F) via LSP"
Write-Host "  - Cross-file rename"
Write-Host "  - Commands: Compile, Check, Format, Watch, Diff, IR, Init"
Write-Host ""
Write-Host "Open any .bone file to get started." -ForegroundColor Cyan
