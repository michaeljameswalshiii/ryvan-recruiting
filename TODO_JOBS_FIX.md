# Jobs Fix TODO

## Status: In Progress

## Completed ✅
- [x] Create turnkey-jobs table via AWS CLI (done, status ACTIVE)
- [x] Verify dynamodb.ts has correct jobsTable reference
- [x] Verify job-repository.ts uses jobsTable correctly
- [x] Verify Jobs page has proper loading/error states
- [x] Create migration script (scripts/migrate-leads-to-jobs.ts)

## In Progress
- [ ] Add jobs table to CDK (cdk/stacks/dynamodb.py)
- [ ] Update TODO.md
- [ ] Update JOBS_IMPLEMENTATION_TODO.md
- [ ] Update REGRESSION_CHECKLIST.md

## Pending
- [ ] Run migration script (optional)
- [ ] Test /dashboard/jobs page loads without error
- [ ] Test "Create Job" button works
- [ ] Cleanup old turnkey-leads table (optional)

## Notes
- Original error: "Requested resource not found" on Jobs Pipeline page
- Root cause: turnkey-jobs table did not exist
- Solution: Created table via AWS CLI as temporary workaround
- Future: Should add to CDK for proper infrastructure-as-code
