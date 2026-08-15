/**
 * Candidate Import Service
 * Handles importing candidates from AI search results with enrichment and duplicate detection
 * 
 * @serverOnly
 */

'use server';

import { getSessionTenantId, getSessionUserId, getSessionUserEmail } from '../server-auth';
import { createLead, getAllLeads, getLeadByEmail, getLeadByLinkedIn } from '../db/repositories/lead-repository';
import { recordCandidateImported } from '../events/candidate-events';
import { createLeadSchema } from '../schemas/lead';
import { z } from 'zod';

/**
 * Raw result from AI search (Apollo, etc.)
 */
export interface AIRawResult {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  city?: string;
  state?: string;
  country?: string;
  industry?: string;
  skills?: string[];
  [key: string]: any;
}

/**
 * Enriched candidate data ready for DB insertion
 */
export interface EnrichedCandidate {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
  linkedin_url?: string;
  location?: string;
  notes?: string;
  source: string;
  status: string;
  // AI enrichment fields
  skills?: string[];
  experience_years?: number;
  ai_confidence?: number;
  raw_data?: any;
}

/**
 * Import result from AI enrichment
 */
export interface ImportResult {
  success: boolean;
  candidateId?: string;
  isNew?: boolean;
  isDuplicate?: boolean;
  duplicateOf?: string;
  error?: string;
  message?: string;
}

/**
 * AI enrichment prompt for structured extraction
 */
const ENRICHMENT_PROMPT = `You are a candidate data enrichment assistant. Parse and enrich the raw candidate data below.

Extract the following fields:
- name: Full name (combine first + last if needed)
- email: Email address (validate format)
- phone: Phone number (clean format)
- title: Job title/role
- company: Company name
- linkedin_url: LinkedIn profile URL (validate it looks real)
- location: City, State format
- skills: Array of skills mentioned
- experience_years: Estimated years of experience (number)

Return ONLY a JSON object with these fields. If a field is unknown, omit it or use null.

Raw candidate data:
`;

/**
 * Get the AI model for enrichment
 */
function getEnrichmentModel(): string {
  // Use the same model as other AI operations
  return process.env.AI_MODEL || 'global.anthropic.claude-sonnet-4-6';
}

/**
 * Call Bedrock AI to enrich candidate data
 */
async function enrichWithAI(rawData: AIRawResult, searchQuery?: string): Promise<{
  enriched: EnrichedCandidate | null;
  confidence: number;
}> {
  try {
    const response = await fetch('/api/bedrock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          role: 'user',
          content: `${ENRICHMENT_PROMPT}\n${JSON.stringify(rawData)}`
        }],
        model: getEnrichmentModel(),
        max_tokens: 1024,
        temperature: 0.1, // Low temp for consistent extraction
      }),
    });

    if (!response.ok) {
      console.error('[IMPORT] AI enrichment failed:', response.status);
      return { enriched: null, confidence: 0 };
    }

    const data = await response.json();
    const responseText = data.response || '';

// Try to parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Calculate confidence based on how many fields were extracted
        let extractedCount = 0;
        const fields = ['name', 'email', 'phone', 'title', 'company', 'linkedin_url', 'location'];
        fields.forEach(f => {
          if (parsed[f]) extractedCount++;
        });

        const confidence = Math.min(extractedCount / fields.length, 1);

        return {
          enriched: {
            name: parsed.name || `${rawData.first_name || ''} ${rawData.last_name || ''}`.trim() || rawData.name || 'Unknown',
            email: parsed.email || rawData.email || '',
            phone: parsed.phone || rawData.phone || '',
            company: parsed.company || rawData.company || '',
            title: parsed.title || rawData.title || '',
            linkedin_url: parsed.linkedin_url || rawData.linkedin_url || '',
            location: parsed.location || rawData.city ? `${rawData.city}, ${rawData.state || ''}` : '',
            skills: parsed.skills || rawData.skills || [],
            experience_years: parsed.experience_years || null,
            source: 'ai_enrichment',
            status: 'identification',
            notes: searchQuery ? `Imported from AI search: ${searchQuery}` : 'Imported from AI',
            raw_data: rawData,
          },
          confidence,
        };
      } catch (parseError) {
        console.error('[IMPORT] JSON parse error:', parseError);
      }
    }

    // Fallback: use raw data with basic parsing
    return {
      enriched: {
        name: `${rawData.first_name || ''} ${rawData.last_name || ''}`.trim() || rawData.name || 'Unknown',
        email: rawData.email || '',
        phone: rawData.phone || '',
        company: rawData.company || '',
        title: rawData.title || '',
        linkedin_url: rawData.linkedin_url || '',
        location: rawData.city ? `${rawData.city}, ${rawData.state || ''}` : '',
        source: 'ai_enrichment',
        status: 'identification',
        notes: searchQuery ? `Imported from AI search: ${searchQuery}` : 'Imported from AI',
        raw_data: rawData,
      },
      confidence: 0.3, // Low confidence when enrichment fails
    };
  } catch (error) {
    console.error('[IMPORT] AI enrichment error:', error);
    return { enriched: null, confidence: 0 };
  }
}

function normalizeMatchText(value: unknown): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizePhone(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function candidateName(candidate: AIRawResult): string {
  return (
    String(candidate.name || '').trim() ||
    `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim()
  );
}

function candidateLocation(candidate: AIRawResult): string {
  return (
    String(candidate.location || '').trim() ||
    [candidate.city, candidate.state].filter(Boolean).join(', ')
  );
}

function isCorroboratedNameMatch(
  existing: AIRawResult,
  candidate: AIRawResult
): boolean {
  const name = normalizeMatchText(candidateName(candidate));
  if (!name || name.split(' ').length < 2) return false;
  if (name !== normalizeMatchText(candidateName(existing))) return false;

  const sameCompany =
    normalizeMatchText(candidate.company) !== '' &&
    normalizeMatchText(candidate.company) === normalizeMatchText(existing.company);
  const sameTitle =
    normalizeMatchText(candidate.title) !== '' &&
    normalizeMatchText(candidate.title) === normalizeMatchText(existing.title);
  const sameLocation =
    normalizeMatchText(candidateLocation(candidate)) !== '' &&
    normalizeMatchText(candidateLocation(candidate)) ===
      normalizeMatchText(candidateLocation(existing));

  return sameCompany || sameTitle || sameLocation;
}

/**
 * Check for duplicates by strong identifiers, then by a full-name match that
 * is corroborated by company, title, or location.
 */
async function checkDuplicate(rawResult: AIRawResult): Promise<string | null> {
  const tenantId = await getSessionTenantId();
  if (!tenantId) return null;

  // Check by email.
  if (rawResult.email) {
    const existingByEmail = await getLeadByEmail(tenantId, rawResult.email);
    if (existingByEmail?.id) {
      return existingByEmail.id;
    }
  }

  // Check by LinkedIn.
  if (rawResult.linkedin_url) {
    const existingByLinkedIn = await getLeadByLinkedIn(
      tenantId,
      rawResult.linkedin_url
    );
    if (existingByLinkedIn?.id) {
      return existingByLinkedIn.id;
    }
  }

  // Apollo can return a different or missing identifier for a person already
  // in Trio. Check phone and a conservative, corroborated full-name match.
  const allLeads = await getAllLeads(tenantId);
  const phone = normalizePhone(rawResult.phone);
  const existing = allLeads.find((lead) => {
    const samePhone =
      phone.length >= 7 && phone === normalizePhone(lead.phone);
    return samePhone || isCorroboratedNameMatch(lead, rawResult);
  });

  if (existing?.id) return existing.id;

  return null;
}

/**
 * Import a candidate from AI search result
 * 
 * @param rawResult - Raw result from AI/Apollo search
 * @param source - Source name (apollo, ai_search, web, etc.)
 * @param searchQuery - Optional search query used
 * @returns Import result with success status
 */
export async function importResultAsCandidate(
  rawResult: AIRawResult,
  source: string = 'ai_search',
  searchQuery?: string
): Promise<ImportResult> {
  try {
    // Get user context
    const tenantId = await getSessionTenantId();
    const userId = await getSessionUserId();
    const userEmail = await getSessionUserEmail();

    if (!tenantId || !userId) {
      return { 
        success: false, 
        error: 'Unauthorized',
        message: 'Please log in to import candidates'
      };
    }

    // Step 1: Check for duplicates (before AI enrichment to save API calls)
    const duplicateId = await checkDuplicate(rawResult);

    if (duplicateId) {
      return {
        success: false,
        isDuplicate: true,
        duplicateOf: duplicateId,
        message: 'This candidate already exists in your pipeline',
      };
    }

    // Step 2: AI enrichment (optional - skip if no API key configured)
    const { enriched, confidence } = await enrichWithAI(rawResult, searchQuery);
    
const candidateData = enriched || {
      name: `${rawResult.first_name || ''} ${rawResult.last_name || ''}`.trim() || rawResult.name || 'Unknown',
      email: rawResult.email || '',
      phone: rawResult.phone || '',
      company: rawResult.company || '',
      title: rawResult.title || '',
      linkedin_url: rawResult.linkedin_url || '',
      location: rawResult.city ? `${rawResult.city}, ${rawResult.state || ''}` : '',
      source: source,
      status: 'identification',
      notes: searchQuery ? `Imported from AI search: ${searchQuery}` : `Imported from ${source}`,
      raw_data: rawResult,
    };

    // Validate with schema
    const validated = createLeadSchema.safeParse({
      name: candidateData.name,
      email: candidateData.email || undefined,
      phone: candidateData.phone || undefined,
      company: candidateData.company || undefined,
      title: candidateData.title || undefined,
      linkedin_url: candidateData.linkedin_url || undefined,
      status: 'identification',
      source: `ai_${source}`,
      notes: candidateData.notes,
    });

    if (!validated.success) {
      return {
        success: false,
        error: 'Validation failed',
message: JSON.stringify(validated.error.flatten().fieldErrors),
      };
    }

    // Step 3: Create the lead
    const lead = await createLead(
      tenantId,
      {
        ...validated.data,
        name: validated.data.name,
        source: `${source}_import`,
      },
      { userId, email: userEmail },
    );

    // Step 4: Record the import event
    if (lead?.id) {
      await recordCandidateImported(
        lead.id,
        source,
        userEmail || userId,
        confidence || 0.5,
        rawResult,
        searchQuery
      );
    }

    return {
      success: true,
      candidateId: lead?.id,
      isNew: true,
      message: `${candidateData.name} added to candidates with ${Math.round((confidence || 0.5) * 100)}% confidence`,
    };
  } catch (error) {
    console.error('[IMPORT] Import failed:', error);
    return {
      success: false,
      error: 'Import failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Bulk import candidates
 */
export async function bulkImportCandidates(
  results: AIRawResult[],
  source: string = 'ai_search',
  searchQuery?: string
): Promise<{
  imported: number;
  duplicates: number;
  errors: number;
  candidateIds: string[];
}> {
  const imported: string[] = [];
  let duplicates = 0;
  let errors = 0;

  for (const result of results) {
    const importResult = await importResultAsCandidate(result, source, searchQuery);
    
    if (importResult.success && importResult.candidateId) {
      imported.push(importResult.candidateId);
    } else if (importResult.isDuplicate) {
      duplicates++;
    } else {
      errors++;
    }
  }

  return {
    imported: imported.length,
    duplicates,
    errors,
    candidateIds: imported,
  };
}
