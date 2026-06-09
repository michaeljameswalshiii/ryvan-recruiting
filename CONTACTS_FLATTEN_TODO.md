# Contacts Flatten Preferred Phone - Implementation TODO

## Status: COMPLETED

### Implementation Summary

#### 1. Backend - Schema Changes (lib/schemas/client.ts)
- [x] Added `preferredPhone` (String, optional) field to contactSchema
- [x] Added `preferredPhoneType` (String, optional) field to contactSchema  

#### 2. Backend - Repository Changes (lib/db/repositories/client-repository.ts)
- [x] Added `extractPreferredPhone()` helper function - extracts preferred phone from phones array
- [x] `addContactToClient()` - Auto-calculates preferredPhone/preferredPhoneType when contact is created
- [x] `updateClientContact()` - Auto-calculates on phone updates

#### 3. Backend - Actions (lib/actions/client-actions.ts)
- [x] `addContactAction()` - Added phones array support, converts legacy phone field to phones array
- [x] `updateContactAction()` - Added phones array support

#### 4. Frontend - Contacts List (app/dashboard/contacts/page.tsx)
- [x] Added preferredPhone/preferredPhoneType to Contact interface
- [x] Added `getPreferredPhoneNumber()` helper - uses flattened field first, falls back to phones array
- [x] Added `getPreferredPhoneType()` helper - uses flattened field first, falls back to phones array
- [x] Table renders clickable phone (tel: link) and phone type badge

#### 5. Frontend - Contact Modal (components/company/ContactModal.tsx)
- Works with existing single phone field - client-actions.ts converts to phones array

#### 6. Migration Script (scripts/backfill-preferred-phone.ts)
- [x] Created backfill script using AWS SDK
- [x] Scans all clients for tenant
- [x] Populates preferredPhone/preferredPhoneType from phones array

### How It Works

1. **When saving a contact with phones array:**
   - Backend finds phone marked as `isPreferred: true`, or uses first phone
   - Auto-populates `preferredPhone` and `preferredPhoneType` fields

2. **Frontend display priority:**
   - First checks `contact.preferredPhone` / `contact.preferredPhoneType`
   - Falls back to phones array if not present (backward compatibility)

3. **Data is preserved:**
   - Both flattened fields AND phones array are maintained
   - No data loss - zero regression

### Running the Backfill Script

```bash
cd turnkey-optimization
npx tsx scripts/backfill-preferred-phone.ts
```

Required environment variables:
- `AWS_REGION` (default: us-east-1)
- `DYNAMODB_CLIENTS_TABLE` (default: turnkey-clients)
- `TENANT_ID` (default: default)

### Remaining Tasks (Optional)

1. [ ] Run backfill script in production to populate existing contacts
2. [ ] Update ContactDetailClient.tsx to use flattened fields (already done via fallback)
3. [ ] Consider enhancing ContactModal to show full phones editor (future enhancement)

## Completion Date: $(date)
