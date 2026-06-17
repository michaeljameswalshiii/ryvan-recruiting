# TODO - Force Fresh Contact Detail Data

- [x] Verify `src/app/dashboard/contacts/[contactId]/page.tsx` uses fresh-load logic
- [x] Patch `addNoteToContact` to invalidate tenant cache after update
- [ ] Run `npm run build`
- [ ] Create branch `blackboxai/force-fresh-contact-load`
- [ ] Commit and push code changes
- [ ] Update `VERCEL_FORCE_REDEPLOY.txt` and push
- [ ] Hard refresh contact page and verify note persistence behavior
