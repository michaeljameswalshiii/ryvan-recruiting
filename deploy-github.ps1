# Deploy script for turnkey-optimization to GitHub and Vercel
$ErrorActionPreference = "Stop"

Set-Location -Path "C:\Users\micha\Desktop\turnkey-optimization"

# Checkout new branch
git checkout -b blackboxai/add-editable-dynamodb-viewer

# Add files
git add -A

# Commit
git commit -m "Add editable DynamoDB viewer functionality

- Table-based display with click-to-edit cells
- Edit state management 
- Save/Cancel buttons
- PATCH API call for updates
- Visual feedback for editable cells
- Key field protection"

# Push to GitHub
git push origin blackboxai/add-editable-dynamodb-viewer

# Create PR
gh pr create --title "Add editable DynamoDB viewer functionality" --body "This PR adds full editable functionality to the DynamoDB viewer page:

- Table-based display instead of raw JSON
- Click-to-edit on any cell
- Edit state management
- Save/Cancel buttons  
- PATCH API call for updates
- Visual feedback for editable cells
- Key field protection

The API route already has PATCH endpoint implemented."

Write-Host "Done! PR created successfully."
