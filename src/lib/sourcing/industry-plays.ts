/**
 * One-click Apollo plan seeds for common ATS desks (best-in-class speed).
 * User can still edit after apply.
 */

export type IndustryPlay = {
  id: string;
  label: string;
  description: string;
  titles: string[];
  mustHaveKeywords: string[];
  keywords: string[];
  /** Suggested location mode */
  locationHint?: string;
};

export const INDUSTRY_PLAYS: IndustryPlay[] = [
  {
    id: 'cnc-plant-ops',
    label: 'CNC / Plant Ops',
    description: 'Plant / manufacturing leaders with CNC or machining experience',
    titles: [
      'Plant Manager',
      'Manufacturing Manager',
      'Director of Operations',
      'Production Manager',
      'Manufacturing Director',
    ],
    mustHaveKeywords: ['CNC'],
    keywords: ['machining'],
    locationHint: 'Florida',
  },
  {
    id: 'netsuite-finance',
    label: 'NetSuite Finance',
    description: 'Finance / ERP implementation specialists',
    titles: [
      'Finance Implementation Specialist',
      'NetSuite Consultant',
      'ERP Implementation Manager',
      'Financial Systems Analyst',
    ],
    mustHaveKeywords: ['NetSuite'],
    keywords: ['ERP'],
  },
  {
    id: 'dir-ops-general',
    label: 'Director of Ops',
    description: 'Ops leadership — broaden titles, light keywords',
    titles: [
      'Director of Operations',
      'VP Operations',
      'Head of Operations',
      'Operations Manager',
    ],
    mustHaveKeywords: [],
    keywords: [],
  },
  {
    id: 'software-backend',
    label: 'Backend Engineer',
    description: 'Software engineers with cloud/backend focus',
    titles: [
      'Software Engineer',
      'Backend Engineer',
      'Senior Software Engineer',
      'Full Stack Engineer',
    ],
    mustHaveKeywords: [],
    keywords: ['AWS'],
  },
];
