# Contact Detail Page - Implementation TODO

## Task: Create professional Contact Detail page emulating Ryvan Recruiting design

### Information Gathered:
- Contacts are stored within Client (company) objects in DynamoDB as nested array
- Each contact has: id, name, title, email, phone, isPrimary, notes, createdAt, updatedAt
- Existing edit page uses useClients() hook to find contact from nested data
- Candidate detail page provides the pattern to follow (server + client component)
- Available components: SendEmailModal, Badge, Card, Button, Textarea

### Implementation Plan:

#### Step 1: Create ContactDetailClient.tsx component
- Location: src/components/contact/ContactDetailClient.tsx
- Features:
  - Header: Avatar (initials), Name + Title + Primary badge, Buttons (Send Email, Call, Edit)
  - Top info bar: Email (clickable), Phone, Location, LinkedIn, Source, Added date
  - Tabs: Overview (default), Timeline, Open Jobs, Company
  - Two-column layout:
    - LEFT (60%): Contact Details card, Activity & Notes card, Recent Activity log
    - RIGHT (40%): Open Jobs, All Roles, Quick Stats

#### Step 2: Create server page.tsx
- Location: src/app/dashboard/contacts/[contactId]/page.tsx
- Features:
  - Server component that fetches contact data
  - Search all clients to find contact by contactId
  - Map data format for client component

#### Step 3: Test and verify
- Navigate to contact detail page
- Verify all components render correctly

### Dependent Files to be created:
- src/components/contact/ContactDetailClient.tsx
- src/app/dashboard/contacts/[contactId]/page.tsx

### Followup steps:
- Test the page with existing contacts
- Verify email modal works
- Add API endpoints for contact notes if needed
