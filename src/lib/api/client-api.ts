/**
 * Client API Wrapper
 * 
 * This provides a client-safe API for dashboard pages.
 * It makes requests to the server-side API routes.
 * 
 * @clientSafe
 */

const API_BASE = '/api/data';

/**
 * Fetch clients from API
 */
export async function fetchClients(): Promise<any[]> {
  const response = await fetch(`${API_BASE}/clients`, {
    credentials: 'include', // Include cookies
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch' }));
    throw new Error(error.error || 'Failed to fetch clients');
  }
  
  const data = await response.json();
  return data.clients || [];
}

/**
 * Create a client via API
 */
export async function createClient(client: {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  domain?: string;
  industry?: string;
  city?: string;
  state?: string;
  country?: string;
  employee_count?: number;
  revenue?: string;
  description?: string;
}): Promise<any> {
  const response = await fetch(`${API_BASE}/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(client),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to create' }));
    throw new Error(error.error || 'Failed to create client');
  }
  
  const data = await response.json();
  return data.client;
}

/**
 * Update a client via API
 */
export async function updateClient(clientId: string, updates: Record<string, any>): Promise<any> {
  const response = await fetch(`${API_BASE}/clients/${clientId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(updates),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to update' }));
    throw new Error(error.error || 'Failed to update client');
  }
  
  const data = await response.json();
  return data.client;
}

/**
 * Delete a client via API
 */
export async function deleteClient(clientId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/clients/${clientId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete' }));
    throw new Error(error.error || 'Failed to delete client');
  }
}

// ============================================================================
// Fetch functions for other entities - similar pattern
// ============================================================================

/**
 * Fetch leads from API
 */
export async function fetchLeads(): Promise<any[]> {
  const response = await fetch(`${API_BASE}/leads`, {
    credentials: 'include',
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch' }));
    throw new Error(error.error || 'Failed to fetch leads');
  }
  
  const data = await response.json();
  return data.leads || [];
}

/**
 * Create a lead via API
 */
export async function createLead(lead: any): Promise<any> {
  const response = await fetch(`${API_BASE}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(lead),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to create' }));
    throw new Error(error.error || 'Failed to create lead');
  }
  
  const data = await response.json();
  return data.lead;
}

/**
 * Update a lead via API
 */
export async function updateLead(leadId: string, updates: Record<string, any>): Promise<any> {
  const response = await fetch(`${API_BASE}/leads/${leadId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(updates),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to update' }));
    throw new Error(error.error || 'Failed to update lead');
  }
  
  const data = await response.json();
  return data.lead;
}

/**
 * Delete a lead via API
 */
export async function deleteLead(leadId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/leads/${leadId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete' }));
    throw new Error(error.error || 'Failed to delete lead');
  }
}

/**
 * Fetch pipeline from API
 */
export async function fetchPipeline(): Promise<any[]> {
  const response = await fetch(`${API_BASE}/pipeline`, {
    credentials: 'include',
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch' }));
    throw new Error(error.error || 'Failed to fetch pipeline');
  }
  
  const data = await response.json();
  return data.pipeline || [];
}

/**
 * Create pipeline item via API
 */
export async function createPipelineItem(item: any): Promise<any> {
  const response = await fetch(`${API_BASE}/pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(item),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to create' }));
    throw new Error(error.error || 'Failed to create pipeline item');
  }
  
  const data = await response.json();
  return data.pipelineItem;
}

/**
 * Update pipeline item via API
 */
export async function updatePipelineItem(itemId: string, updates: Record<string, any>): Promise<any> {
  const response = await fetch(`${API_BASE}/pipeline/${itemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(updates),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to update' }));
    throw new Error(error.error || 'Failed to update pipeline item');
  }
  
  const data = await response.json();
  return data.pipelineItem;
}

/**
 * Delete pipeline item via API
 */
export async function deletePipelineItem(itemId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/pipeline/${itemId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete' }));
    throw new Error(error.error || 'Failed to delete pipeline item');
  }
}
