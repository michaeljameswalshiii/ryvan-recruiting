# TODO - Force Fresh Contact Detail Data

- [x] Verify `src/app/dashboard/contacts/[contactId]/page.tsx` uses fresh-load logic
- [x] Patch `addNoteToContact` to invalidate tenant cache after update
- [x] Run `npm run build`
- [x] Create branch `blackboxai/force-fresh-contact-load`
- [x] Commit and push code changes
- [x] Update `VERCEL_FORCE_REDEPLOY.txt` and push
- [ ] Replace `src/app/api/data/contacts/[id]/notes/route.ts` with required implementation
- [ ] Confirm `addNoteToContact` remains correct in `contact-repository.ts`
- [ ] Run `npm run build` after API route change
- [ ] Commit and push API route update
- [ ] Update `VERCEL_FORCE_REDEPLOY.txt` and push again
- [ ] Hard refresh contact page and verify note persistence behavior
