# Contacts Refactor TODO

## Phase 1: Schema & Types
- [x] Skip - use existing contact schema from client.ts
- [ ] Create contact-repository.ts with child entity functions

## Phase 2: Repository
- [ ] create_contact.ts - addContact function
- [ ] read_contacts.ts - getContactsForCompany, getContactById
- [ ] update_contact.ts - updateContact function
- [ ] delete_contact.ts - removeContact function

## Phase 3: Migration Script
- [ ] Create migration script with dry-run mode
- [ ] Test migration
- [ ] Run migration

## Phase 4: UI Updates
- [ ] Update Company detail page to use new queries
- [ ] Test add/edit/delete contact
- [ ] Verify primary contact works

## Phase 5: Events
- [ ] Update event recording for contacts
- [ ] Test timeline shows contact events

## Testing
- [ ] Add multiple contacts to a company
- [ ] Set primary contact
- [ ] Edit a contact
- [ ] Delete a contact
- [ ] Verify in Timeline
