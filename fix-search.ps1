# Fix the search logic in bedrock route
$filePath = "c:\Users\micha\Downloads\TurnkeyOptimization\src\app\api\bedrock\route.ts"
$content = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)

# The old code to replace
$oldCode = @'
    // SECONDARY: Check general web search (if Apollo didn't return results)
    let searchResults = "";
    if (useSearch && lastUserQuery && !apolloResults && needsSearch(lastUserQuery)) {
      console.log("Searching Tavily for:", lastUserQuery);
      const results = await searchTavily(lastUserQuery, requestUrl);
      if (results.length > 0) {
        searchResults = "Search results:\n" + results
          .map((r: any, i: number) => `${i + 1}. ${r.title}\n${r.snippet}\n${r.url}`)
          .join("\n\n");
      }
    }
'@

# The new code
$newCode = @'
    // SECONDARY: Check general web search - ALWAYS try when Apollo failed or returned no results
    let searchResults = "";
    // Try search if: Apollo unavailable OR Apollo had no results OR query matches search keywords
    const trySearch = useSearch && lastUserQuery && (
      !apolloAvailable || !apolloResults || needsSearch(lastUserQuery)
    );
    if (trySearch) {
      console.log("Searching Tavily for:", lastUserQuery);
      const results = await searchTavily(lastUserQuery, requestUrl);
      if (results.length > 0) {
        searchResults = "Search results:\n" + results
          .map((r: any, i: number) => `${i + 1}. ${r.title}\n${r.snippet}\n${r.url}`)
          .join("\n\n");
      }
    }
'@

$newContent = $content -replace [regex]::Escape($oldCode), $newCode
[System.IO.File]::WriteAllText($filePath, $newContent, [System.Text.Encoding]::UTF8)
Write-Host "Done!"
