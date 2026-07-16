/**
 * Shared resume text parser — extracts structured candidate fields from plain text.
 * Used by /api/parse-resume, careers apply, and replace-resume flows.
 */

export type ParsedExperience = {
  company: string;
  title: string;
  dates: string;
  description: string;
  location?: string;
};

export type ParsedEducation = {
  school: string;
  degree: string;
  dates: string;
  field?: string;
};

export type StructuredParsedResume = {
  name: string;
  title: string;
  email: string;
  phone: string;
  linkedin: string;
  location: string;
  fullAddress: string;
  summary: string;
  salaryRequirements: string;
  skills: string[];
  experience: ParsedExperience[];
  education: ParsedEducation[];
  certifications: string[];
};

const EMPTY: StructuredParsedResume = {
  name: '',
  title: '',
  email: '',
  phone: '',
  linkedin: '',
  location: '',
  fullAddress: '',
  summary: '',
  salaryRequirements: '',
  skills: [],
  experience: [],
  education: [],
  certifications: [],
};

const SECTION_HEADERS: Record<string, string[]> = {
  summary: [
    'professional summary',
    'summary',
    'profile',
    'objective',
    'about me',
    'about',
    'career summary',
    'executive summary',
  ],
  experience: [
    'professional experience',
    'work experience',
    'employment history',
    'work history',
    'experience',
    'employment',
    'career history',
    'relevant experience',
  ],
  education: [
    'education',
    'academic background',
    'academic history',
    'academics',
  ],
  skills: [
    'technical skills',
    'core competencies',
    'core skills',
    'skills',
    'technologies',
    'tech stack',
    'competencies',
    'expertise',
    'tools',
  ],
  certifications: [
    'certifications',
    'certificates',
    'licenses',
    'credentials',
    'professional certifications',
  ],
};

const COMMON_SKILLS = [
  'javascript', 'typescript', 'python', 'java', 'c#', 'c++', 'go', 'golang', 'rust', 'ruby', 'php', 'swift', 'kotlin',
  'react', 'react.js', 'reactjs', 'next.js', 'nextjs', 'vue', 'vue.js', 'angular', 'node', 'node.js', 'nodejs',
  'express', 'django', 'flask', 'spring', 'rails', '.net', 'dotnet',
  'aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'k8s', 'terraform', 'ansible',
  'sql', 'nosql', 'mongodb', 'postgresql', 'postgres', 'mysql', 'redis', 'dynamodb', 'elasticsearch',
  'graphql', 'rest', 'api', 'microservices', 'ci/cd', 'jenkins', 'github actions', 'gitlab',
  'html', 'css', 'sass', 'less', 'tailwind', 'bootstrap',
  'git', 'linux', 'unix', 'windows', 'macos',
  'agile', 'scrum', 'jira', 'confluence', 'figma', 'excel', 'powerpoint', 'salesforce',
  'machine learning', 'tensorflow', 'pytorch', 'pandas', 'numpy',
  'spark', 'hadoop', 'kafka', 'rabbitmq', 'nginx',
  'typescript', 'webpack', 'vite', 'jest', 'cypress', 'playwright',
  'tableau', 'power bi', 'looker', 'snowflake', 'databricks',
  'sap', 'oracle', 'servicenow', 'workday',
];

const TITLE_WORDS =
  /(?:engineer|developer|manager|director|consultant|analyst|designer|specialist|architect|lead|principal|staff|intern|coordinator|administrator|officer|executive|scientist|researcher|product owner|scrum master|recruiter|accountant|teacher|nurse|physician|attorney|counsel|partner|founder|ceo|cto|cfo|coo|vp|vice president|head of|supervisor)/i;

const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const DATE_RANGE_RE = new RegExp(
  `(?:${MONTH}\\s*\\.?\\s*)?\\d{4}\\s*[-–—to]+\\s*(?:(?:${MONTH}\\s*\\.?\\s*)?\\d{4}|present|current|now)|` +
    `\\d{1,2}[/.-]\\d{2,4}\\s*[-–—to]+\\s*(?:\\d{1,2}[/.-]\\d{2,4}|present|current)|` +
    `\\d{4}\\s*[-–—]\\s*(?:\\d{4}|present|current)`,
  'i'
);

const US_STATES =
  'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC';

function normalizeText(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function linesOf(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function isSectionHeaderLine(line: string): string | null {
  const cleaned = line
    .replace(/[:：|•●▪◦\-–—]+$/g, '')
    .trim()
    .toLowerCase();
  // Headers are usually short
  if (cleaned.length > 40) return null;
  for (const [key, aliases] of Object.entries(SECTION_HEADERS)) {
    for (const a of aliases) {
      if (cleaned === a || cleaned === a + 's') return key;
    }
  }
  return null;
}

function splitIntoSections(text: string): Record<string, string> {
  const lines = linesOf(text);
  const sections: Record<string, string[]> = { header: [] };
  let current = 'header';

  for (const line of lines) {
    const key = isSectionHeaderLine(line);
    if (key) {
      current = key;
      if (!sections[current]) sections[current] = [];
      continue;
    }
    if (!sections[current]) sections[current] = [];
    sections[current].push(line);
  }

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sections)) {
    out[k] = v.join('\n').trim();
  }
  return out;
}

function looksLikeEmail(s: string): boolean {
  return /@/.test(s);
}

function looksLikePhone(s: string): boolean {
  const digits = s.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 && /[\d(]/.test(s);
}

function looksLikeUrl(s: string): boolean {
  return /https?:\/\/|www\.|linkedin\.com|github\.com/i.test(s);
}

function looksLikeLocation(s: string): boolean {
  if (new RegExp(`\\b(?:${US_STATES})\\b`, 'i').test(s) && /,/.test(s)) return true;
  if (/,\s*[A-Z]{2}\b/.test(s)) return true;
  return false;
}

function titleCaseName(raw: string): string {
  return raw
    .split(/\s+/)
    .map((part) => {
      if (!part) return part;
      // Keep particles like McDonald somewhat readable
      if (part.includes('-')) {
        return part
          .split('-')
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
          .join('-');
      }
      if (part.length <= 2 && part === part.toUpperCase()) {
        // Middle initial O, JR, etc.
        return part.toUpperCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

function isPlausibleName(s: string): boolean {
  if (!s || s.length < 3 || s.length > 60) return false;
  if (looksLikeEmail(s) || looksLikePhone(s) || looksLikeUrl(s)) return false;
  if (isSectionHeaderLine(s)) return false;
  // Job titles are not names (incl. ALL CAPS "SOFTWARE ENGINEER")
  if (TITLE_WORDS.test(s)) return false;
  // 2–4 name parts
  const parts = s.trim().split(/\s+/);
  if (parts.length < 2 || parts.length > 4) return false;
  // Reject lines that are mostly numbers or symbols
  if (/[\d@#$%^&*{}[\]<>]/.test(s)) return false;
  // Each part should look name-like
  return parts.every((p) => /^[A-Za-z][A-Za-z.'-]*$/.test(p) && p.length >= 1);
}

function extractName(text: string, filenameHint?: string): string {
  const lines = linesOf(text).slice(0, 12);

  // Explicit "Name: Jane Doe"
  for (const line of lines) {
    const m = line.match(/^(?:name|full\s*name)\s*[:\-]\s*(.+)$/i);
    if (m && isPlausibleName(m[1].trim())) {
      return titleCaseName(m[1].trim());
    }
  }

  for (const line of lines) {
    // Skip contact-only lines
    if (looksLikeEmail(line) || looksLikePhone(line) || looksLikeUrl(line)) continue;
    if (looksLikeLocation(line) && line.length < 40) continue;

    // ALL CAPS name (common on resumes)
    const allCaps = line.match(/^([A-Z][A-Z.'-]+(?:\s+[A-Z][A-Z.'-]+){1,3})$/);
    if (allCaps && isPlausibleName(allCaps[1])) {
      return titleCaseName(allCaps[1]);
    }

    // Title Case name
    const titleCase = line.match(/^([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){1,3})$/);
    if (titleCase && isPlausibleName(titleCase[1])) {
      return titleCaseName(titleCase[1]);
    }

    // "First Last | Title | City" style header
    const pipeParts = line.split(/\s*[|•·]\s*/).map((p) => p.trim());
    if (pipeParts.length >= 2 && isPlausibleName(pipeParts[0])) {
      return titleCaseName(pipeParts[0]);
    }
  }

  // Filename fallback: "John_Doe_Resume.pdf"
  if (filenameHint) {
    const fromFile = extractNameFromFilename(filenameHint);
    if (fromFile && isPlausibleName(fromFile)) return titleCaseName(fromFile);
    if (fromFile && fromFile.split(/\s+/).length >= 2) return titleCaseName(fromFile);
  }

  return '';
}

export function extractNameFromFilename(filename: string): string {
  let name = filename
    .replace(/\.(pdf|docx?|doc)$/i, '')
    .replace(/[-_]?(resume|cv|curriculum[_\s-]?vitae)[-_]?/gi, ' ')
    .replace(/\d{4,}/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Drop trailing words like "final", "updated"
  name = name.replace(/\b(final|updated|new|copy|v\d+)\b/gi, '').replace(/\s+/g, ' ').trim();
  return name;
}

function extractEmail(text: string): string {
  const m = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  return m ? m[0] : '';
}

function extractPhone(text: string): string {
  const patterns = [
    /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,
    /\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const digits = m[0].replace(/\D/g, '');
      if (digits.length >= 10) return m[0].trim();
    }
  }
  return '';
}

function extractLinkedIn(text: string): string {
  const m = text.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/i
  );
  if (!m) return '';
  let url = m[0].replace(/\/$/, '');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url.replace(/^www\./i, 'www.');
  if (!url.includes('://www.') && url.includes('linkedin.com')) {
    url = url.replace('://linkedin.com', '://www.linkedin.com');
  }
  return url;
}

function extractLocation(text: string, headerText: string): string {
  // Prefer header only — full-text scans pick up skill pairs like "Python, AWS"
  const areas = [headerText, linesOf(text).slice(0, 12).join('\n')];
  for (const area of areas) {
    // City, ST (required 2-letter state)
    const cityState = area.match(
      new RegExp(
        `\\b([A-Z][a-zA-Z .'-]{1,30},\\s*(?:${US_STATES})(?:\\s+\\d{5}(?:-\\d{4})?)?)\\b`
      )
    );
    if (cityState) {
      const loc = cityState[1].trim();
      if (loc.length < 60 && !looksLikeEmail(loc) && !TITLE_WORDS.test(loc)) {
        return loc;
      }
    }
    // City, Country / City, StateName (longer state names only)
    const cityRegion = area.match(
      /\b([A-Z][a-zA-Z .'-]{1,30},\s*(?:United States|USA|US|Canada|UK|United Kingdom|California|Texas|Florida|New York|Washington|Massachusetts|Illinois|Georgia|Colorado|Arizona|Oregon|Nevada))\b/
    );
    if (cityRegion) {
      const loc = cityRegion[1].trim();
      if (loc.length < 60) return loc;
    }
  }
  return '';
}

function extractSalary(text: string): string {
  const m = text.match(
    /(?:salary|compensation|expected|seeking)[:\s]*\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?(?:\s*(?:k|K|\/yr|per year|annually))?|\$[\d,]+\s*(?:k|K)?\s*[-–]\s*\$[\d,]+\s*(?:k|K)?/i
  );
  return m ? m[0].trim().slice(0, 80) : '';
}

function extractTitle(text: string, sections: Record<string, string>, name: string): string {
  // Explicit labels
  const labeled = text.match(
    /(?:(?:current\s+)?(?:title|position|role|seeking|target\s+role))\s*[:\-]\s*([^\n|•]{3,80})/i
  );
  if (labeled) {
    const t = labeled[1].trim();
    if (t.length > 2 && t.length < 80 && !looksLikeEmail(t)) return cleanTitle(t);
  }

  // Line right after name in header
  const headerLines = linesOf(sections.header || text.slice(0, 600)).slice(0, 10);
  let sawName = !name;
  for (const line of headerLines) {
    if (!sawName) {
      if (name && line.toLowerCase().includes(name.split(' ')[0].toLowerCase())) {
        sawName = true;
      }
      // Also treat all-caps first line as name already handled
      if (isPlausibleName(line)) {
        sawName = true;
        continue;
      }
      continue;
    }
    if (looksLikeEmail(line) || looksLikePhone(line) || looksLikeUrl(line) || looksLikeLocation(line)) {
      continue;
    }
    if (isSectionHeaderLine(line)) break;
    // Pipe-separated: Title | Location
    const first = line.split(/\s*[|•·]\s*/)[0].trim();
    if (TITLE_WORDS.test(first) && first.length < 80) {
      return cleanTitle(first);
    }
    if (TITLE_WORDS.test(line) && line.length < 80) {
      return cleanTitle(line);
    }
    // Stop after a couple non-title lines
    break;
  }

  // Common compound title pattern anywhere near top
  const top = text.slice(0, 1200);
  const jobTitleMatch = top.match(
    /(?:Senior|Junior|Staff|Principal|Lead|Associate|Entry[- ]Level|Mid[- ]Level)?\s*(?:Software|Full[- ]Stack|Front[- ]End|Back[- ]End|DevOps|Data|Product|Project|Program|Engineering|Sales|Marketing|Operations|HR|Human Resources|Finance|IT|Cloud|Security|Machine Learning|AI)?\s*(?:Engineer|Developer|Manager|Director|Consultant|Analyst|Designer|Specialist|Architect|Scientist|Coordinator|Administrator|Recruiter)/i
  );
  if (jobTitleMatch) {
    return cleanTitle(jobTitleMatch[0]);
  }

  return '';
}

function cleanTitle(t: string): string {
  return t
    .replace(/\s+/g, ' ')
    .replace(/^[,|•·\-\s]+|[,|•·\-\s]+$/g, '')
    .trim()
    .slice(0, 100);
}

function extractSkillsFromSection(skillsText: string): string[] {
  if (!skillsText) return [];
  const parts = skillsText
    .split(/[,|•●▪◦·\n;/]+|(?:\s{2,})/)
    .map((s) => s.trim())
    .map((s) => s.replace(/^[-–—*]\s*/, ''))
    .filter((s) => s.length >= 2 && s.length <= 40)
    .filter((s) => !isSectionHeaderLine(s))
    .filter((s) => !/^(and|or|with|using)$/i.test(s));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= 40) break;
  }
  return out;
}

function extractSkillsKeywordFallback(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  const seen = new Set<string>();
  // Longer skills first to prefer "node.js" over "node"
  const sorted = [...COMMON_SKILLS].sort((a, b) => b.length - a.length);
  for (const skill of sorted) {
    const re = new RegExp(
      `(?:^|[^a-z0-9.])${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9.]|$)`,
      'i'
    );
    if (re.test(lower) && !seen.has(skill.toLowerCase())) {
      seen.add(skill.toLowerCase());
      // Prefer display casing for known multi-word / branded skills
      found.push(skill.includes('.') || skill.includes(' ') ? skill : skill);
    }
  }
  return found.slice(0, 25);
}

function extractCertifications(certText: string): string[] {
  if (!certText) return [];
  return certText
    .split(/[\n•●▪◦·|;]+/)
    .map((s) => s.trim().replace(/^[-–—*]\s*/, ''))
    .filter((s) => s.length >= 3 && s.length <= 120)
    .filter((s) => !isSectionHeaderLine(s))
    .slice(0, 15);
}

function extractDateFromLine(line: string): string {
  const m = line.match(DATE_RANGE_RE);
  return m ? m[0].replace(/\s+/g, ' ').trim() : '';
}

function isBulletLine(line: string): boolean {
  return /^[•●▪◦\-\*]\s+/.test(line) || /^[•●▪◦]/.test(line);
}

function isLikelyJobHeader(line: string): boolean {
  if (!line || isBulletLine(line)) return false;
  if (looksLikeEmail(line) || looksLikeUrl(line)) return false;
  if (line.length > 100) return false;
  // "Company | Title | Dates" or title/company lines
  if (line.includes('|') || line.includes('•') || line.includes('·')) return true;
  if (DATE_RANGE_RE.test(line)) return true;
  if (TITLE_WORDS.test(line) && line.length < 80) return true;
  // Company-like short Title Case / ALL CAPS line
  if (/^[A-Z][A-Za-z0-9 .,&'/-]{1,60}$/.test(line) && line.split(/\s+/).length <= 8) {
    return true;
  }
  return false;
}

function parseExperienceSection(expText: string): ParsedExperience[] {
  if (!expText || expText.length < 10) return [];

  const lines = linesOf(expText);
  const blocks: string[][] = [];
  let current: string[] = [];
  let bulletsSeen = false;
  let datesSeen = false;

  for (const line of lines) {
    const bullet = isBulletLine(line);
    const hasDate = DATE_RANGE_RE.test(line);

    // Start a new job when we already finished a prior role (had dates or bullets)
    // and hit a non-bullet header line (company/title/date row)
    if (
      current.length > 0 &&
      (bulletsSeen || datesSeen) &&
      !bullet &&
      isLikelyJobHeader(line)
    ) {
      blocks.push(current);
      current = [line];
      bulletsSeen = false;
      datesSeen = hasDate;
      continue;
    }

    current.push(line);
    if (bullet) bulletsSeen = true;
    if (hasDate) datesSeen = true;
  }
  if (current.length) blocks.push(current);

  const results: ParsedExperience[] = [];

  for (const block of blocks.slice(0, 12)) {
    if (!block.length) continue;
    let title = '';
    let company = '';
    let dates = '';
    const descLines: string[] = [];
    let inBullets = false;

    for (const line of block) {
      if (isBulletLine(line)) {
        inBullets = true;
        descLines.push(line.replace(/^[•●▪◦\-\*]\s*/, ''));
        continue;
      }
      if (inBullets) {
        // Continuation of description without bullet
        descLines.push(line);
        continue;
      }

      const d = extractDateFromLine(line);
      if (d && !dates) {
        dates = d;
        const rest = line
          .replace(DATE_RANGE_RE, '')
          .replace(/[|•·]+/g, '|')
          .split('|')
          .map((p) => p.trim())
          .filter(Boolean);
        for (const part of rest) {
          if (part.length < 2 || part.length > 80) continue;
          if (TITLE_WORDS.test(part) && !title) title = cleanTitle(part);
          else if (!company) company = part;
          else if (!title) title = cleanTitle(part);
        }
        continue;
      }

      // "Title at Company"
      const atMatch = line.match(/^(.+?)\s+at\s+(.+)$/i);
      if (atMatch && !title) {
        title = cleanTitle(atMatch[1]);
        company = atMatch[2].replace(DATE_RANGE_RE, '').trim();
        continue;
      }

      // Pipe / bullet-separated header: Company | Title | Dates
      const pipe = line
        .split(/\s*[|•·]\s*/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (pipe.length >= 2) {
        const datePart = pipe.find((p) => DATE_RANGE_RE.test(p));
        if (datePart && !dates) dates = extractDateFromLine(datePart);
        const nonDates = pipe.filter((p) => !DATE_RANGE_RE.test(p));
        if (nonDates.length >= 2) {
          if (TITLE_WORDS.test(nonDates[0]) && !TITLE_WORDS.test(nonDates[1])) {
            title = cleanTitle(nonDates[0]);
            company = nonDates[1];
          } else if (TITLE_WORDS.test(nonDates[1])) {
            company = nonDates[0];
            title = cleanTitle(nonDates[1]);
          } else {
            company = nonDates[0];
            title = cleanTitle(nonDates[1]);
          }
        } else if (nonDates.length === 1) {
          if (TITLE_WORDS.test(nonDates[0]) && !title) title = cleanTitle(nonDates[0]);
          else if (!company) company = nonDates[0];
        }
        continue;
      }

      if (TITLE_WORDS.test(line) && !title && line.length < 80) {
        title = cleanTitle(line);
        continue;
      }
      if (!company && line.length > 1 && line.length < 80 && !looksLikeEmail(line)) {
        company = line;
        continue;
      }
      if (!title && line.length > 1 && line.length < 80) {
        title = cleanTitle(line);
        continue;
      }
      descLines.push(line);
    }

    if (!title && !company && !dates) continue;

    results.push({
      company: company.slice(0, 120),
      title: title.slice(0, 100),
      dates: dates.slice(0, 60),
      description: descLines.join('\n').trim().slice(0, 1500),
    });
  }

  return results.filter((e) => e.company || e.title);
}

function parseEducationSection(eduText: string): ParsedEducation[] {
  if (!eduText || eduText.length < 5) return [];

  const lines = linesOf(eduText);
  const results: ParsedEducation[] = [];
  let current: ParsedEducation = { school: '', degree: '', dates: '', field: '' };

  const flush = () => {
    if (current.school || current.degree) {
      results.push({ ...current });
    }
    current = { school: '', degree: '', dates: '', field: '' };
  };

  const degreeRe =
    /\b((?:B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|M\.?B\.?A\.?|Ph\.?D\.?|Bachelor(?:'s)?|Master(?:'s)?|Associate(?:'s)?|Doctorate|Diploma)(?:\s+of\s+[A-Za-z\s]+)?)/i;

  for (const line of lines) {
    if (results.length >= 8) break;
    const dates = extractDateFromLine(line);
    if (dates) current.dates = dates;

    const deg = line.match(degreeRe);
    if (deg) {
      if (current.degree && (current.school || current.dates)) flush();
      current.degree = deg[1].trim();
      const fieldMatch = line.match(
        /(?:in|of)\s+([A-Za-z][A-Za-z\s&/-]{2,40})(?:\s*[,|•]|$)/i
      );
      if (fieldMatch) current.field = fieldMatch[1].trim();
    }

    if (
      /\b(university|college|institute|school|academy|polytechnic)\b/i.test(line) ||
      /\b(univ\.|inst\.)\b/i.test(line)
    ) {
      if (current.school && (current.degree || current.dates)) flush();
      current.school = line
        .replace(DATE_RANGE_RE, '')
        .replace(degreeRe, '')
        .replace(/[|•·]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
    } else if (!current.school && !deg && line.length > 3 && line.length < 80 && !dates) {
      // First non-degree line often is school
      if (!current.degree) current.school = line.slice(0, 120);
    }
  }
  flush();

  // Fallback: whole section as one blob if nothing structured
  if (!results.length && eduText.length > 10) {
    results.push({
      school: lines[0]?.slice(0, 120) || '',
      degree: lines.slice(1).join(' ').slice(0, 120),
      dates: extractDateFromLine(eduText),
    });
  }

  return results.filter((e) => e.school || e.degree);
}

function extractSummary(summaryText: string, fullText: string): string {
  if (summaryText && summaryText.length > 20) {
    return summaryText.replace(/\s+/g, ' ').trim().slice(0, 1500);
  }
  // First paragraph after header contact info, before experience
  const sections = splitIntoSections(fullText);
  if (sections.summary) {
    return sections.summary.replace(/\s+/g, ' ').trim().slice(0, 1500);
  }
  return '';
}

/**
 * Main entry: parse plain resume text into structured fields.
 */
export function parseResumeText(
  rawText: string,
  options?: { filename?: string }
): StructuredParsedResume {
  const text = normalizeText(rawText || '');
  if (text.length < 10) {
    const nameOnly = options?.filename
      ? extractNameFromFilename(options.filename)
      : '';
    return { ...EMPTY, name: nameOnly };
  }

  const sections = splitIntoSections(text);
  const header = sections.header || text.slice(0, 800);

  const name = extractName(text, options?.filename);
  const email = extractEmail(text);
  const phone = extractPhone(text);
  const linkedin = extractLinkedIn(text);
  const location = extractLocation(text, header);
  const salaryRequirements = extractSalary(text);

  let skills = extractSkillsFromSection(sections.skills || '');
  if (skills.length < 3) {
    const fallback = extractSkillsKeywordFallback(text);
    const seen = new Set(skills.map((s) => s.toLowerCase()));
    for (const s of fallback) {
      if (!seen.has(s.toLowerCase())) {
        skills.push(s);
        seen.add(s.toLowerCase());
      }
    }
  }
  skills = skills.slice(0, 30);

  const experience = parseExperienceSection(sections.experience || '');
  const education = parseEducationSection(sections.education || '');
  const certifications = extractCertifications(sections.certifications || '');
  const summary = extractSummary(sections.summary || '', text);

  let title = extractTitle(text, sections, name);
  // Fall back to most recent experience title
  if (!title && experience[0]?.title) {
    title = experience[0].title;
  }

  // Prefer filename name only if text name empty
  let finalName = name;
  if (!finalName && options?.filename) {
    finalName = extractNameFromFilename(options.filename);
  }

  return {
    name: finalName,
    title,
    email,
    phone,
    linkedin,
    location,
    fullAddress: location,
    summary,
    salaryRequirements,
    skills,
    experience,
    education,
    certifications,
  };
}

/**
 * Merge parsed fields into an existing candidate, filling only empty fields.
 * Never overwrites non-empty profile values.
 */
export function mergeParsedIntoEmptyFields(
  existing: Record<string, unknown>,
  parsed: StructuredParsedResume
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const isEmpty = (v: unknown) =>
    v === undefined ||
    v === null ||
    v === '' ||
    (Array.isArray(v) && v.length === 0);

  const scalarMap: Array<[string, string]> = [
    ['name', parsed.name],
    ['email', parsed.email],
    ['phone', parsed.phone],
    ['title', parsed.title],
    ['location', parsed.location],
    ['linkedin_url', parsed.linkedin],
    ['summary', parsed.summary],
    ['salary_requirements', parsed.salaryRequirements],
    ['full_address', parsed.fullAddress],
  ];

  for (const [key, value] of scalarMap) {
    if (value && isEmpty(existing[key])) {
      out[key] = value;
    }
  }

  if (parsed.skills?.length && isEmpty(existing.skills)) {
    out.skills = parsed.skills;
  }
  if (parsed.experience?.length && isEmpty(existing.experience)) {
    out.experience = parsed.experience;
  }
  if (parsed.education?.length && isEmpty(existing.education)) {
    out.education = parsed.education;
  }
  if (parsed.certifications?.length && isEmpty(existing.certifications)) {
    out.certifications = parsed.certifications;
  }

  return out;
}

/**
 * Reconstruct text from pdf.js text items with better line breaks (uses y when available).
 */
export function textFromPdfItems(
  items: Array<{ str?: string; transform?: number[] }>
): string {
  if (!items?.length) return '';

  type Line = { y: number; parts: Array<{ x: number; s: string }> };
  const lines: Line[] = [];
  const Y_TOL = 2;

  for (const item of items) {
    const s = item.str ?? '';
    if (!s) continue;
    const tr = item.transform;
    const x = tr?.[4] ?? 0;
    const y = tr?.[5] ?? 0;

    let line = lines.find((l) => Math.abs(l.y - y) < Y_TOL);
    if (!line) {
      line = { y, parts: [] };
      lines.push(line);
    }
    line.parts.push({ x, s });
  }

  // PDF y increases upward — sort top-to-bottom
  lines.sort((a, b) => b.y - a.y);

  return lines
    .map((l) => {
      l.parts.sort((a, b) => a.x - b.x);
      let out = '';
      let prevX = -Infinity;
      for (const p of l.parts) {
        if (prevX !== -Infinity && p.x - prevX > 2) {
          // gap → space if not already spaced
          if (out && !out.endsWith(' ')) out += ' ';
        }
        out += p.s;
        prevX = p.x + p.s.length * 4; // rough advance
      }
      return out.replace(/[ \t]+/g, ' ').trim();
    })
    .filter(Boolean)
    .join('\n');
}
