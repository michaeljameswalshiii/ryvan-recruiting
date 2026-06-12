import { z } from "zod";

// Apollo search parameters we want to support
const ExpandedQuerySchema = z.object({
  q: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  organization_industries: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  titles: z.array(z.string()).optional(),
  seniorities: z.array(z.string()).optional(),
  organization_num_employees_ranges: z.array(z.string()).optional(),
  max_employee_count: z.number().optional(),
  has_phone_numbers: z.boolean().optional(),
  has_emails: z.boolean().optional(),
});

// Prompt for Claude to expand a natural language query
const EXPAND_QUERY_PROMPT = `You are an expert recruitment search analyst.
Convert the user's natural language search query into structured filters optimized for Apollo.io's mixed_companies/search endpoint.

Return ONLY valid JSON matching this exact schema (no extra text, no markdown):

{
  "q": "short general query",
  "keywords": ["keyword1", "keyword2"],
  "organization_industries": ["industry1", "industry2"],
  "locations": ["City, State", "City2"],
  "titles": ["Job Title 1", "Job Title 2"],
  "seniorities": ["senior", "manager", "director", "vp", "c-level"],
  "organization_num_employees_ranges": ["1-100", "101-250"],
  "max_employee_count": 300,
  "has_phone_numbers": true,
  "has_emails": true
}

Rules:
- Be specific and aggressive with filters when the user implies them.
- Use common Apollo industry names (e.g. "software", "information technology", "construction", "healthcare", "financial services", "manufacturing", "real estate").
- Seniorities should use Apollo-friendly terms: senior, manager, director, vp, c-level, head of, etc.
- Default to smaller companies unless specified otherwise.
- Keep arrays small and focused.

User query: `;

export async function expandQuery(userQuery: string): Promise<z.infer<typeof ExpandedQuerySchema>> {
  const response = await fetch('/api/bedrock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content: EXPAND_QUERY_PROMPT
        },
        {
          role: "user",
          content: userQuery
        }
      ],
      model: process.env.AI_MODEL || 'global.anthropic.claude-sonnet-4-6',
      temperature: 0.1,
    }),
  });

  const result = await response.json();
  const text = result.content || result.text || JSON.stringify(result);

  // Extract JSON from response (Claude sometimes adds extra text)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse structured query from AI");

  let parsed = JSON.parse(jsonMatch[0]);

  // Validate and clean
  return ExpandedQuerySchema.parse(parsed);
}
