# Script to create AI Apollo page and update nav

$turnkeyPath = "c:\Users\micha\Downloads\TurnkeyOptimization"

# 1. Read the current nav.tsx and update it
$navPath = Join-Path $turnkeyPath "src\components\dashboard\nav.tsx"
$navContent = [System.IO.File]::ReadAllText($navPath, [System.Text.Encoding]::UTF8)

# Update nav items - add AI Apollo and rename AI Assistant to AI Assistant (Web)
$oldNavItems = '{
  href: "/dashboard/ai-assistant",
  label: "AI Assistant",
  icon: Sparkles,
},'
$newNavItems = '{
  href: "/dashboard/ai-assistant",
  label: "AI Assistant (Web)",
  icon: Sparkles,
},
  { href: "/dashboard/ai-apollo", label: "AI Apollo", icon: Sparkles },'

$navContent = $navContent -replace [regex]::Escape($oldNavItems), $newNavItems
[System.IO.File]::WriteAllText($navPath, $navContent, [System.Text.Encoding]::UTF8)
Write-Host "Updated nav.tsx"

# 2. Read the current ai-assistant page
$aiAssistantPath = Join-Path $turnkeyPath "src\app\dashboard\ai-assistant\page.tsx"
$aiAssistantContent = [System.IO.File]::ReadAllText($aiAssistantPath, [System.Text.Encoding]::UTF8)

# Save existing page as AI Assistant (Web) - update title
$aiAssistantContent = $aiAssistantContent -replace "Sourcing Assistant", "AI Assistant (Web)"
$aiAssistantContent = $aiAssistantContent -replace "Powered by MiniMax \(via AWS Bedrock\) - Find and source candidates", "Powered by MiniMax + Apollo + Tavily - Full web search"

# Update the API call to use the new flag
$aiAssistantContent = $aiAssistantContent -replace 'body: JSON.stringify\(\{ messages: chatMessages\}\)', 'body: JSON.stringify({ messages: chatMessages, useSearch: true })'

[System.IO.File]::WriteAllText($aiAssistantPath, $aiAssistantContent, [System.Text.Encoding]::UTF8)
Write-Host "Updated ai-assistant/page.tsx"

# 3. Create the AI Apollo directory and page (copy from ai-assistant)
$aiApolloDir = Join-Path $turnkeyPath "src\app\dashboard\ai-apollo"
if (-not (Test-Path $aiApolloDir)) {
    New-Item -ItemType Directory -Path $aiApolloDir -Force
}

# Copy and modify the page for Apollo-only
$apolloPageContent = $aiAssistantContent -replace "AI Assistant \(Web\)", "AI Apollo"
$apolloPageContent = $apolloPageContent -replace "Powered by MiniMax \+ Apollo \+ Tavily - Full web search", "Powered by MiniMax + Apollo (Apollo-only mode - no web search)"
$apolloPageContent = $apolloPageContent -replace 'useSearch: true', 'useSearch: false'
$apolloPageContent = $apolloPageContent -replace 'title: "Sourcing Assistant"', 'title: "AI Apollo"'

# Write the Apollo page
$apolloPagePath = Join-Path $aiApolloDir "page.tsx"
[System.IO.File]::WriteAllText($apolloPagePath, $apolloPageContent, [System.Text.Encoding]::UTF8)
Write-Host "Created ai-apollo/page.tsx"

Write-Host "Done! All files created."
