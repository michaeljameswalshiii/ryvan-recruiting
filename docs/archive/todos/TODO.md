# TODO: Add CRUD to Contact Info Page

## Task
Add add/edit/delete functionality to `/dashboard/contact-info` page

## Implementation Plan

### 1. Convert contact-info page to client component
- Add 'use client' directive
- Import hooks: useClients, useAddContact, useUpdateContact, useRemoveContact

### 2. Copy CRUD from ContactsClient.tsx
- Copy the inline form for adding contacts
- Copy edit/delete actions per row

### 3. Deploy to Vercel

## Progress
- [x] Analyzed existing code
- [x] Update contact-info/page.tsx with CRUD
- [x] Deploy to Vercel
