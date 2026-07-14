# Multiple Contacts per Company - Implementation Plan

## Overview
Implement multiple contacts support for companies (clients) in Turnkey Optimization, with event tracking and a clean UI.

---

## Step 1: Update Client Schema

**File:** `src/lib/schemas/client.ts`

Add contact types and update schema:

```typescript
// Contact types
export const contactSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Name is required'),
  title: z.string().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  isPrimary: z.boolean().default(false),
  notes: z.string().optional().or(z.literal('')),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Contact = z.infer<typeof contactSchema>;

// Update client schema
contacts: z.array(contactSchema).optional(),
```

---

## Step 2: Update Client Repository

**File:** `src/lib/db/repositories/client-repository.ts`

Add contact CRUD functions:

```typescript
// Add contact to client
export async function addContactToClient(
  tenantId: string,
  clientId: string,
  contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Client | null>

// Update contact
export async function updateClientContact(
  tenantId: string,
  clientId: string,
  contactId: string,
  data: Partial<Contact>
): Promise<Client | null>

// Remove contact
export async function removeClientContact(
  tenantId: string,
  clientId: string,
  contactId: string
): Promise<Client | null>

// Set primary contact
export async function setPrimaryContact(
  tenantId: string,
  clientId: string,
  contactId: string
): Promise<Client | null>
```

---

## Step 3: Update Company Events

**File:** `src/lib/events/company-events.ts`

Add contact change event functions:

```typescript
// Contact events
recordContactAdded()
recordContactUpdated()
recordContactRemoved()
recordPrimaryContactSet()
```

---

## Step 4: Create ContactModal Component

**File:** `src/components/company/ContactModal.tsx`

- Dialog modal for Add/Edit contact
- Form fields: name, title, email, phone, isPrimary checkbox, notes
- Validation with zod
- Loading state
- Success/error handling

---

## Step 5: Create/Update Company Detail Page

**File:** `src/app/companies/[id]/page.tsx` (create if doesn't exist)

Add:
- Contacts tab/section
- Display contact list with avatars
- Primary contact badge
- Add/Edit/Delete buttons
- ContactModal integration

---

## Dependencies

- Uses existing shadcn/ui components (Dialog, Button, Input, etc.)
- Uses lucide-react icons (User, Mail, Phone, Star, etc.)
- Follows existing event system pattern
- Maintains tenant isolation

---

## Testing Flows

1. Add 2-3 contacts to a company
2. Mark one as Primary
3. Edit a contact
4. Delete a contact
5. Verify events appear in Timeline
