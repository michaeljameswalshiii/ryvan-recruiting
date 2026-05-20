@echo off
cd "C:\Users\micha\Desktop\turnkey-optimization"
gh pr create --title "Add Company Sourcing button to navigation sidebar" --body "Added a Company Sourcing navigation button to the dashboard sidebar, linking to /dashboard/companies/sourcing. This follows the same pattern as the existing Candidate Sourcing button." --base master
