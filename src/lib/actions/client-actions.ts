export async function addContactAction(clientId: string, contactData: any) {
  try {
    // Get tenantId from session
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return { error: 'No tenant found. Please log in again.' };
    }

    const result = await addContactToClient(tenantId, clientId, contactData);
    revalidatePath('/dashboard/contact-info');
    revalidatePath('/dashboard/clients');
    return { success: true, result };
  } catch (error: any) {
    console.error('[addContactAction] Error:', error);
    return { error: error.message || 'Failed to add contact' };
  }
}
