# Contacts UI Implementation - TODO

## Step 1: Create ContactModal Component
- File: `src/components/company/ContactModal.tsx`
- Fields: Name, Title, Email, Phone, Notes, "Set as Primary" switch
- Use SimpleDialog component
- Add validation using existing contactSchema
- Add server actions for contact CRUD (or use existing)
- Status: PENDING

## Step 2: Update Company Detail Page - Contacts Tab
- File: `src/app/dashboard/companies/[id]/page.tsx`
- Update ContactsTab to display contacts from company.contacts array
- Show primary contact with Star badge
- Add Edit + Delete action buttons per contact
- Add "+ Add Contact" button at top
- Empty state: "No contacts yet. Add one to get started."
- Status: PENDING

## Step 3: Update Company Detail Page - Overview Tab
- File: `src/app/dashboard/companies/[id]/page.tsx`
- Show Primary contact prominently in Overview tab
- Display name, title, email, phone
- Status: PENDING

## Step 4: Integration & Testing
- After add/edit/delete contact → refresh list automatically
- Record events in Timeline (already implemented)
- Test the complete flow
- Status: PENDING
