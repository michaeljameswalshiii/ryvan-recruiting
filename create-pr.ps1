# Create PR script
Set-Location -Path "C:\Users\micha\Desktop\turnkey-optimization"

gh pr create --title "Add editable DynamoDB viewer functionality" --body "This PR adds full editable functionality to the DynamoDB viewer page.

## Changes:
- Table-based display instead of raw JSON
- Click-to-edit on any cell
- Edit state management
- Save/Cancel buttons
- PATCH API call for updates
- Visual feedback for editable cells
- Key field protection

The API route already has PATCH endpoint implemented." --base master
