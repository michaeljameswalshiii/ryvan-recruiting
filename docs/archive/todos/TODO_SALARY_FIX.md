# TODO: Fix Resume Parsing - Add Salary + Full Address

## Plan
1. **Fix 1**: Update parse-resume prompt (src/app/api/parse-resume/route.ts)
   - Add: full_address, salary_requirements, experience, education, certifications

2. **Fix 2**: Update finalResume merging logic
   - Map parsed fields to candidate record fields

3. **Fix 3**: Update upload handler to parse and save
   - After resume upload, call parse-resume API
   - Save all parsed fields to candidate record

## Status
- [x] Fix 1: Update parse-resume prompt - DONE
- [x] Fix 2: Update finalResume object - DONE
- [x] Fix 3: Update upload handler in CandidateDetailClient - DONE

## Testing
- Deploy and upload test resume with salary info and address
- Verify fields appear in Overview tab → Edit mode
