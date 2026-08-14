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
    'education and training',
    'education & training',
    'academic background',
    'academic history',
    'academics',
    'degrees',
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
    'areas of expertise',
    'key skills',
  ],
  certifications: [
    'certifications',
    'certificates',
    'licenses',
    'credentials',
    'professional certifications',
  ],
  references: ['references', 'professional references'],
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
  /(?:engineer|developer|manager|director|consultant|analyst|designer|specialist|architect|lead|principal|staff|intern|coordinator|administrator|officer|executive|scientist|researcher|product owner|scrum master|recruiter|accountant|bookkeeper|controller|treasurer|teacher|nurse|physician|attorney|counsel|partner|founder|ceo|cto|cfo|coo|vp|vice president|head of|supervisor|owner|president|superintendent|foreman|technician|mechanic|operator|clerk|assistant|associate|representative|rep\b|salesperson|account executive|business development|bdm|sourcing|talent acquisition|hrbp|chef|server|bartender|host(?:ess)?|cashier|stylist|therapist|counselor|paralegal|underwriter|estimator|scheduler|dispatcher)/i;

/** Expanded headline / current-role patterns (not only engineer/manager). */
const HEADLINE_TITLE_RE =
  /(?:(?:Senior|Jr\.?|Junior|Staff|Principal|Lead|Associate|Assistant|Entry[- ]Level|Mid[- ]Level|Executive)\s+)?(?:(?:Software|Full[- ]?Stack|Front[- ]?End|Back[- ]?End|DevOps|Data|Product|Project|Program|Engineering|Sales|Marketing|Operations|Restaurant|Retail|HR|Human Resources|Finance|Accounting|IT|Cloud|Security|Machine Learning|AI|Business|Talent|Customer|Administrative|Office|General|Construction|Project|Site|Plant)\s+)?(?:Engineer|Developer|Manager|Director|Consultant|Analyst|Designer|Specialist|Architect|Scientist|Coordinator|Administrator|Recruiter|Accountant|Bookkeeper|Controller|Executive|Officer|Owner|President|Supervisor|Superintendent|Technician|Assistant|Associate|Representative|Estimator)/i;

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

const COMPANY_MARKERS =
  /\b(?:llc|l\.l\.c\.?|inc\.?|incorporated|corp\.?|corporation|ltd\.?|company|co\.?|group|holdings|partners|services|solutions|technologies|consulting)\b/i;

const GENERIC_PRODUCTIVITY_SKILLS = new Set([
  'microsoft office',
  'microsoft word',
  'microsoft powerpoint',
  'powerpoint',
  'windows',
]);

const CURATED_SKILL_PATTERNS: Array<[string, RegExp]> = [
  ['Project Management', /\bproject management\b/i],
  ['Program Management', /\bprogram management\b/i],
  ['Preconstruction', /\bpre[- ]?construction\b/i],
  ['Construction Management', /\bconstruction management\b/i],
  ['Construction', /\bconstruction (?:industry|projects?|sites?|operations?)\b/i],
  ['Civil Engineering', /\bcivil engineering\b/i],
  ['Bluebeam', /\bbluebeam\b/i],
  ['AutoCAD', /\bautocad\b/i],
  ['FabTrol', /\bfabtrol\b/i],
  ['Sage 300', /\bsage\s*300\b/i],
  ['Estimating', /\bestimat(?:e|ing|ion)\b/i],
  ['Scheduling', /\bschedul(?:e|ing)\b/i],
  ['Budgeting', /\bbudget(?:ing|s)?\b/i],
  ['Steel Fabrication', /\bsteel fabrication\b/i],
  ['Fabrication', /\bfabrication shops?\b/i],
  ['Job Site Operations', /\b(?:active\s+)?job sites?\b/i],
  ['Spanish', /\b(?:conversational(?:ly)?\s+)?spanish\b/i],
  ['Microsoft Excel', /\bmicrosoft excel\b/i],
];

/**
 * Many designer resumes (Canva, etc.) place each glyph with large tracking so
 * pdf.js emits "J e f f e r s o n" / "7 8 6 - 6 9 6 - 0 2 4 8". Collapse those
 * runs so email/phone/name regexes can match.
 */
export function collapseSpacedGlyphs(text: string): string {
  if (!text) return text;

  const collapseLine = (line: string): string => {
    const trimmed = line.trim();
    if (!trimmed) return '';

    const tokens = trimmed.split(/\s+/);
    if (tokens.length < 3) return trimmed;

    const isGlueable = (t: string) =>
      t.length === 1 ||
      (t.length <= 2 && /^[-–—./|+,():]$/.test(t));

    const glueableCount = tokens.filter(isGlueable).length;
    const glueRatio = glueableCount / tokens.length;

    // Mostly single glyphs (letter-spaced name/title/phone lines)
    if (glueRatio >= 0.6 && tokens.length >= 4) {
      let out = '';
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.length === 1 && /[A-Za-z0-9]/.test(t)) {
          // Word break: lowercase/digit → Uppercase start of next word
          // (e.g. JeffersonCapada already one word; "managerWith" → "manager With")
          if (
            out.length > 0 &&
            /[a-z0-9]/.test(out[out.length - 1]) &&
            /[A-Z]/.test(t)
          ) {
            out += ' ' + t;
          } else if (
            // ALL-CAPS runs: insert space before known title/name particles when
            // previous glued chunk is long enough (Restaurant|General|Manager)
            out.length > 0 &&
            /^[A-Z]+$/.test(out.replace(/\s/g, '')) &&
            /[A-Z]/.test(t)
          ) {
            out += t;
          } else {
            out += t;
          }
        } else if (/^[-–—./|+,():@]$/.test(t)) {
          out += t;
        } else {
          if (out && !/\s$/.test(out)) out += ' ';
          out += t;
          out += ' ';
        }
      }
      return out.replace(/\s+/g, ' ').trim();
    }

    // Mixed lines: still collapse digit runs like "7 8 6 - 6 9 6 - 0 2 4 8"
    return collapseSpacedDigitRuns(trimmed);
  };

  return text
    .split('\n')
    .map(collapseLine)
    .join('\n');
}

/** Collapse "7 8 6 - 6 9 6 - 0 2 4 8" / "7 8 6 6 9 6 0 2 4 8" into phone-like form. */
function collapseSpacedDigitRuns(s: string): string {
  // Spaced digits with optional separators between groups
  return s.replace(
    /(?:\+?\s*)?(?:\(?\s*)?(?:\d\s+){2,}\d(?:\s*\)?\s*[-–.]?\s*(?:\d\s+){2,}\d){1,3}/g,
    (m) => m.replace(/\s+/g, '')
  );
}

/**
 * Split glued ALL-CAPS title blobs: RESTAURANTGENERALMANAGER → known phrases.
 */
function unglueAllCapsTitles(text: string): string {
  const phrases = [
    'GENERAL MANAGER',
    'ASSISTANT MANAGER',
    'STORE MANAGER',
    'OPERATIONS MANAGER',
    'PROJECT MANAGER',
    'PRODUCT MANAGER',
    'ACCOUNT MANAGER',
    'OFFICE MANAGER',
    'SOFTWARE ENGINEER',
    'SENIOR ENGINEER',
    'FULL STACK',
    'FRONT END',
    'BACK END',
    'CUSTOMER SERVICE',
    'FOOD SAFETY',
    'INVENTORY MANAGEMENT',
    'TEAM LEAD',
    'HUMAN RESOURCES',
    'HIGH SCHOOL DIPLOMA',
    'KEY SKILLS',
    'RESTAURANT',
    'MEDITERRANEAN',
  ];
  // Longest first so GENERAL MANAGER wins over MANAGER alone
  const sorted = [...phrases].sort(
    (a, b) => b.replace(/\s+/g, '').length - a.replace(/\s+/g, '').length
  );
  return text
    .split('\n')
    .map((line) => {
      let l = line;
      if (!/[A-Za-z]{10,}/.test(l.replace(/\s/g, ''))) return l;
      for (const phrase of sorted) {
        const compact = phrase.replace(/\s+/g, '');
        if (compact.length < 4) continue;
        const re = new RegExp(compact, 'gi');
        l = l.replace(re, (match, offset: number, full: string) => {
          const end = offset + match.length;
          const before = offset > 0 ? full[offset - 1] : '';
          const after = end < full.length ? full[end] : '';
          const spaceBefore =
            before && /[A-Za-z]/.test(before) ? ' ' : '';
          const spaceAfter = after && /[A-Za-z]/.test(after) ? ' ' : '';
          return spaceBefore + phrase + spaceAfter;
        });
      }
      return l.replace(/\s+/g, ' ').trim();
    })
    .join('\n');
}

function normalizeText(text: string): string {
  let t = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ');

  // Collapse letter-spaced PDF glyphs before other whitespace normalization
  t = collapseSpacedGlyphs(t);
  t = unglueAllCapsTitles(t);

  return t
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
    .toLowerCase()
    // "01 EXPERIENCE" / "SECTION — Skills"
    .replace(/^\d{1,2}[\.\)]\s+/, '')
    .replace(/^section\s+[-–—:]\s*/, '');
  // Headers are usually short
  if (cleaned.length > 48) return null;
  // Prefer longer aliases first so "education and training" wins over "education"
  const entries = Object.entries(SECTION_HEADERS).flatMap(([key, aliases]) =>
    aliases.map((a) => ({ key, a }))
  );
  entries.sort((x, y) => y.a.length - x.a.length);

  for (const { key, a } of entries) {
    if (cleaned === a || cleaned === a + 's') return key;
    // "Education and Training", "Professional Experience Summary" etc.
    if (cleaned.startsWith(a + ' ') || cleaned.startsWith(a + '/') || cleaned.startsWith(a + '&')) {
      return key;
    }
    if (cleaned.endsWith(' ' + a) && cleaned.length <= a.length + 18) return key;
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

/** City token: Winston-Salem ok, "BuildCore - Atlanta" not. */
const CITY_NAME =
  "[A-Z][A-Za-z'.]+(?:[-'][A-Za-z'.]+)*(?:\\s+[A-Z][A-Za-z'.]+(?:[-'][A-Za-z'.]+)*){0,3}";

const FULL_STATES =
  "United States|USA|US|Canada|UK|United Kingdom|California|Texas|Florida|New York|Washington|Massachusetts|Illinois|Georgia|Colorado|Arizona|Oregon|Nevada|New Jersey|North Carolina|South Carolina|Pennsylvania|Virginia|Maryland|Michigan|Ohio|Indiana|Tennessee|Missouri|Wisconsin|Minnesota|Louisiana|Alabama|Kentucky|Oklahoma|Connecticut|Iowa|Arkansas|Kansas|Utah|New Mexico|Nebraska|Idaho|Hawaii|Maine|New Hampshire|Rhode Island|Montana|Delaware|South Dakota|North Dakota|Alaska|Vermont|Wyoming|West Virginia";

function isStateOrCountry(value: string): boolean {
  const v = value.replace(/\./g, "").trim();
  if (new RegExp(`^(?:${US_STATES})$`, "i").test(v)) return true;
  if (new RegExp(`^(?:${FULL_STATES})$`, "i").test(v)) return true;
  return false;
}

function isPureLocation(s: string): boolean {
  if (!s || s.length > 60) return false;
  const value = s.replace(/\s+/g, " ").trim();
  if (!value) return false;
  if (looksLikeEmail(value) || looksLikePhone(value) || looksLikeUrl(value)) {
    return false;
  }
  if (COMPANY_MARKERS.test(value) || TITLE_WORDS.test(value)) return false;
  if (/\s[-–—|•·]\s/.test(value)) return false;
  if (/^(?:Greater\s+)?[A-Z][A-Za-z .'-]+\s+(?:Metropolitan|Metro)\s+Area$/.test(value)) {
    return true;
  }
  if (new RegExp(`^${CITY_NAME},\\s*(?:${US_STATES})(?:\\s+\\d{5}(?:-\\d{4})?)?$`, "i").test(value)) {
    return true;
  }
  if (new RegExp(`^${CITY_NAME}\\s+(?:${US_STATES})$`, "i").test(value)) {
    return true;
  }
  if (new RegExp(`^${CITY_NAME},\\s*(?:${FULL_STATES})$`, "i").test(value)) {
    return true;
  }
  return false;
}

/** Pull "Atlanta, GA" out of "BuildCore - Atlanta, Ga" / "Title | City, ST". */
function isolateLocationFragment(raw: string): string {
  const value = String(raw || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  if (isPureLocation(value)) return value;

  const seps = value.split(/\s*[-–—|•·]\s+/).map((p) => p.trim()).filter(Boolean);
  if (seps.length >= 2) {
    for (let i = seps.length - 1; i >= 0; i -= 1) {
      if (isPureLocation(seps[i])) return seps[i];
    }
  }

  const commas = value.split(",").map((p) => p.trim()).filter(Boolean);
  if (commas.length >= 2) {
    const last = commas[commas.length - 1].replace(/\./g, "");
    const prev = commas[commas.length - 2];
    const zip = last.match(/^([A-Za-z]{2}|[A-Za-z .']+)\s+\d{5}(?:-\d{4})?$/);
    const region = zip ? zip[1] : last;
    if (isStateOrCountry(region) && prev && !TITLE_WORDS.test(prev) && !COMPANY_MARKERS.test(prev)) {
      const city = prev.split(/\s*[-–—|•·]\s+/).pop() || prev;
      const candidate = zip ? `${city}, ${last}` : `${city}, ${last}`;
      if (isPureLocation(candidate) || isPureLocation(`${city}, ${region}`)) {
        return normalizeLocationString(`${city}, ${region}`);
      }
    }
  }

  const cityState = value.match(
    new RegExp(`\\b(${CITY_NAME},\\s*(?:${US_STATES})(?:\\s+\\d{5}(?:-\\d{4})?)?)\\b`, "i")
  );
  if (cityState && isPureLocation(cityState[1])) return cityState[1];

  const cityRegion = value.match(
    new RegExp(`\\b(${CITY_NAME},\\s*(?:${FULL_STATES}))\\b`, "i")
  );
  if (cityRegion && isPureLocation(cityRegion[1])) return cityRegion[1];

  return "";
}

function looksLikeLocation(s: string): boolean {
  if (!s || s.length > 80) return false;
  return Boolean(isolateLocationFragment(s));
}

/** Public: keep only City, ST (or metro). Drop employer/title prefixes. */
export function sanitizeCandidateLocation(raw?: string | null): string {
  const isolated = isolateLocationFragment(String(raw || ""));
  if (!isolated) return "";
  return normalizeLocationString(isolated).slice(0, 60);
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
  // Company / org markers
  if (
    /\b(llc|l\.l\.c|inc|incorporated|corp|corporation|ltd|company|co\.|group|holdings|partners|university|college|school|hospital|clinic|restaurant|alterations|solutions|services|technologies|consulting)\b/i.test(
      s
    )
  ) {
    return false;
  }
  // 2–4 name parts
  const parts = s.trim().split(/\s+/);
  if (parts.length < 2 || parts.length > 4) return false;
  // Reject lines that are mostly numbers or symbols
  if (/[\d@#$%^&*{}[\]<>|/]/.test(s)) return false;
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

  // Drop trailing words like "final", "updated", "professional"
  name = name
    .replace(/\b(final|updated|new|copy|professional|draft|scan|v\d+)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return name;
}

function extractEmail(text: string): string {
  // Normal: jane.doe@email.com
  const direct = text.match(
    /\b[A-Za-z0-9][A-Za-z0-9._%+-]{0,64}@[A-Za-z0-9][A-Za-z0-9.-]{0,64}\.[A-Za-z]{2,24}\b/
  );
  if (direct) return direct[0];

  // Letter-spaced: j a n e @ e m a i l . c o m  (after partial collapse)
  const spaced = text.match(
    /(?:[A-Za-z0-9]\s+){1,40}[A-Za-z0-9]\s*@\s*(?:[A-Za-z0-9]\s+){0,40}[A-Za-z0-9](?:\s*\.\s*(?:[A-Za-z0-9]\s*){1,24})+/
  );
  if (spaced) {
    const compact = spaced[0].replace(/\s+/g, '');
    if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(compact)) {
      return compact;
    }
  }

  // mailto: links
  const mailto = text.match(
    /mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i
  );
  if (mailto) return mailto[1];

  return '';
}

function formatUsPhone(digits: string): string {
  const d =
    digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (d.length !== 10) return digits;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function extractPhone(text: string): string {
  // Prefer header/top of resume (avoid matching years/zip noise later)
  const areas = [text.slice(0, 900), text];

  const patterns = [
    // (786) 696-0248 / 786-696-0248 / 786.696.0248
    /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,
    // International-ish
    /\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/,
    // Still-spaced: 7 8 6 - 6 9 6 - 0 2 4 8
    /(?:\+?1\s*)?(?:\(?\s*)?(?:\d\s+){2}\d\s*\)?\s*[-–.]?\s*(?:\d\s+){2}\d\s*[-–.]?\s*(?:\d\s+){3}\d\b/,
    // 786 696 0248
    /\b\d{3}\s+\d{3}\s+\d{4}\b/,
  ];

  for (const area of areas) {
    for (const re of patterns) {
      const m = area.match(re);
      if (!m) continue;
      const raw = m[0].trim();
      const digits = raw.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 11) continue;
      // Reject obvious junk (0000000000, font metrics)
      if (/^(\d)\1+$/.test(digits)) continue;
      if (/^0+$/.test(digits) || /^1{10,}$/.test(digits)) continue;
      // Prefer US-looking numbers near top
      if (digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))) {
        return formatUsPhone(digits);
      }
      return raw;
    }
  }

  // Last resort: 10 consecutive digits after stripping spaces from a short header line
  for (const line of linesOf(text).slice(0, 15)) {
    const compact = line.replace(/[^\d+]/g, '');
    const digits = compact.replace(/\D/g, '');
    if (digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))) {
      if (!/^(\d)\1+$/.test(digits)) return formatUsPhone(digits);
    }
  }

  return '';
}

function extractLinkedIn(text: string): string {
  // LinkedIn PDF exports frequently wrap a profile slug across two lines.
  const normalized = text.replace(
    /(linkedin\.com\/in\/[A-Za-z0-9_-]*-)\s*\n\s*([A-Za-z0-9_-]+)(?:\s*\(LinkedIn\))?/gi,
    '$1$2'
  );
  const m = normalized.match(
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

type LinkedInProfileIdentity = {
  name: string;
  title: string;
  location: string;
};

function extractLinkedInProfileIdentity(text: string): LinkedInProfileIdentity {
  const empty = { name: '', title: '', location: '' };
  if (!/\bTop Skills\b/i.test(text) || !/linkedin\.com\/in\//i.test(text)) {
    return empty;
  }

  const lines = linesOf(text);
  const summaryIndex = lines.findIndex((line) => /^summary\s*:?$/i.test(line));
  if (summaryIndex < 3) return empty;

  // LinkedIn exports place Name, Headline, and Area directly before Summary.
  const start = Math.max(0, summaryIndex - 8);
  for (let i = summaryIndex - 3; i >= start; i -= 1) {
    const candidateName = lines[i];
    const headline = lines[i + 1] || '';
    const candidateLocation = lines[i + 2] || '';
    if (
      isPlausibleName(candidateName) &&
      TITLE_WORDS.test(headline) &&
      looksLikeLocation(candidateLocation)
    ) {
      return {
        name: titleCaseName(candidateName),
        title: cleanTitle(headline.replace(/\s+at\s+.+$/i, '')),
        location: sanitizeCandidateLocation(candidateLocation),
      };
    }
  }

  return empty;
}

function normalizeLocationString(loc: string): string {
  let s = loc.replace(/\s+/g, ' ').replace(/^[,|•·\-\s]+|[,|•·\-\s]+$/g, '').trim();
  // "Miami FL" → "Miami, FL"
  const noComma = s.match(
    new RegExp(`^([A-Z][a-zA-Z .'-]{1,30})\\s+(${US_STATES})$`, 'i')
  );
  if (noComma) {
    s = `${noComma[1].trim()}, ${noComma[2].toUpperCase()}`;
  }
  const citySt = s.match(new RegExp(`^(${CITY_NAME}),\\s*(${US_STATES})$`, 'i'));
  if (citySt) {
    s = `${citySt[1].trim()}, ${citySt[2].toUpperCase()}`;
  }
  return s.slice(0, 60);
}

function extractLocation(text: string, headerText: string): string {
  // Prefer header / top lines — full-text scans pick up skill pairs like "Python, AWS"
  const topLines = linesOf(text).slice(0, 15);
  const areas = [
    headerText,
    topLines.join('\n'),
    // Also scan pipe-separated header blobs: "Name | City, ST | email"
    topLines.join(' | '),
  ];

  const tryMatch = (area: string): string => {
    if (!area) return '';
    const isolated = isolateLocationFragment(area);
    if (isolated) return normalizeLocationString(isolated);
    for (const line of linesOf(area)) {
      const hit = isolateLocationFragment(line);
      if (hit) return normalizeLocationString(hit);
    }
    const metroArea = area.match(
      /\b((?:Greater\s+)?[A-Z][A-Za-z .'-]+\s+(?:Metropolitan|Metro)\s+Area)\b/
    );
    if (metroArea) return normalizeLocationString(metroArea[1]);
    // City, ST (+ optional ZIP)
    const cityState = area.match(
      new RegExp(
        `\\b(${CITY_NAME},\\s*(?:${US_STATES})(?:\\s+\\d{5}(?:-\\d{4})?)?)\\b`
      )
    );
    if (cityState) {
      const loc = sanitizeCandidateLocation(cityState[1]);
      if (loc) return loc;
    }
    // City ST (no comma) — common on one-line PDF headers
    const cityStNoComma = area.match(
      new RegExp(
        `\\b(${CITY_NAME}\\s+(?:${US_STATES}))(?:\\b|\\s|[,|•])`
      )
    );
    if (cityStNoComma) {
      const loc = sanitizeCandidateLocation(cityStNoComma[1]);
      if (loc) return loc;
    }
    // City, full state / country name
    const cityRegion = area.match(
      new RegExp(`\\b(${CITY_NAME},\\s*(?:${FULL_STATES}))\\b`)
    );
    if (cityRegion) {
      const loc = sanitizeCandidateLocation(cityRegion[1]);
      if (loc) return loc;
    }
    // "based in Miami, FL" / "located in Tampa FL"
    const based = area.match(
      new RegExp(
        `\\b(?:based|located|residing|living)\\s+in\\s+([A-Z][a-zA-Z .'-]{1,30}(?:,\\s*)?(?:${US_STATES}|[A-Z][a-zA-Z .'-]{2,20}))\\b`,
        'i'
      )
    );
    if (based) {
      const loc = sanitizeCandidateLocation(based[1]);
      if (loc) return loc;
    }
    return '';
  };

  for (const area of areas) {
    const hit = tryMatch(area);
    if (hit) return hit;
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
    /(?:(?:current\s+)?(?:title|position|role|seeking|target\s+role|professional\s+title|job\s+title))\s*[:\-]\s*([^\n|•]{3,80})/i
  );
  if (labeled) {
    const t = labeled[1].trim();
    if (t.length > 2 && t.length < 80 && !looksLikeEmail(t)) return cleanTitle(t);
  }

  // Line right after name in header (scan several candidates — PDF order is noisy)
  const headerLines = linesOf(sections.header || text.slice(0, 900)).slice(0, 14);
  let sawName = !name;
  let skipped = 0;
  for (const line of headerLines) {
    if (!sawName) {
      if (name && line.toLowerCase().includes(name.split(/\s+/)[0].toLowerCase())) {
        sawName = true;
        // Same line: "Jane Doe Software Engineer" after the name
        if (name) {
          const afterName = line
            .replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
            .trim();
          if (afterName && TITLE_WORDS.test(afterName) && afterName.length < 80) {
            return cleanTitle(afterName.split(/\s*[|•·]\s*/)[0]);
          }
        }
        continue;
      }
      if (isPlausibleName(line)) {
        sawName = true;
        continue;
      }
      continue;
    }
    if (
      looksLikeEmail(line) ||
      looksLikePhone(line) ||
      looksLikeUrl(line) ||
      looksLikeLocation(line)
    ) {
      continue;
    }
    if (isSectionHeaderLine(line)) break;
    // Pipe-separated: Title | Location | email
    const parts = line.split(/\s*[|•·]\s*/).map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      if (looksLikeEmail(part) || looksLikePhone(part) || looksLikeLocation(part)) continue;
      if (TITLE_WORDS.test(part) && part.length >= 3 && part.length < 80) {
        return cleanTitle(part);
      }
    }
    if (TITLE_WORDS.test(line) && line.length < 80) {
      return cleanTitle(line);
    }
    // "Experienced Software Engineer with…" in a short header line
    const expLead = line.match(
      /^(?:an?\s+)?(?:experienced|seasoned|results[- ]driven|dedicated|proven)\s+([A-Za-z][A-Za-z0-9/& .'-]{2,60}?)(?:\s+with\b|\s+who\b|,|\.|$)/i
    );
    if (expLead && TITLE_WORDS.test(expLead[1])) {
      return cleanTitle(expLead[1]);
    }
    skipped += 1;
    // Allow a few non-title lines (address, empty noise) before giving up on header
    if (skipped >= 4) break;
  }

  // Common compound title pattern anywhere near top
  const top = text.slice(0, 1500);
  const jobTitleMatch = top.match(HEADLINE_TITLE_RE);
  if (jobTitleMatch) {
    return cleanTitle(jobTitleMatch[0]);
  }

  // Summary openers: "Software Engineer with 8 years…"
  const summaryBlob = (sections.summary || '').slice(0, 400) || top.slice(0, 500);
  const summaryTitle = summaryBlob.match(
    /^(?:I am (?:an?\s+)?)?([A-Z][A-Za-z0-9/& .'-]{2,55}?(?:Engineer|Developer|Manager|Director|Analyst|Consultant|Specialist|Coordinator|Accountant|Recruiter|Designer|Architect))\b/i
  );
  if (summaryTitle && TITLE_WORDS.test(summaryTitle[1])) {
    return cleanTitle(summaryTitle[1]);
  }

  return '';
}

function cleanTitle(t: string): string {
  let s = t
    .replace(/\s+/g, ' ')
    .replace(/^[,|•·\-\s]+|[,|•·\-\s]+$/g, '')
    .trim();
  // Multi-column merge: "Operations Manager to ensure efficient workflow..."
  const glue = s.match(
    /^((?:(?:Senior|Junior|Staff|Principal|Lead|Associate|Assistant)\s+)?[A-Za-z][A-Za-z/& -]{2,50}?(?:Manager|Director|Engineer|Developer|Analyst|Coach|Coordinator|Specialist|Consultant|Officer|Executive|Architect|Designer|Scientist|Administrator|Recruiter|Owner|President))\b/i
  );
  if (glue && s.length > glue[1].length + 12) {
    s = glue[1].trim();
  }
  return s.slice(0, 100);
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

function extractCuratedSkills(text: string): string[] {
  return CURATED_SKILL_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(
    ([skill]) => skill
  );
}

function rankAndCleanSkills(
  sectionSkills: string[],
  summaryText: string,
  fullText: string,
  identity: { name: string; title: string; location: string }
): string[] {
  const summarySkills = extractCuratedSkills(summaryText);
  const fallbackSkills = extractSkillsKeywordFallback(fullText);
  const candidates = [...summarySkills, ...sectionSkills, ...fallbackSkills];
  const identityValues = new Set(
    [identity.name, identity.title, identity.location]
      .filter(Boolean)
      .map((value) => value.toLowerCase())
  );
  const hasDomainSkills = summarySkills.filter(
    (skill) => !GENERIC_PRODUCTIVITY_SKILLS.has(skill.toLowerCase())
  ).length >= 3;
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const rawSkill of candidates) {
    const skill = rawSkill.trim();
    const key = skill.toLowerCase() === 'excel' ? 'microsoft excel' : skill.toLowerCase();
    if (!skill || seen.has(key) || identityValues.has(key)) continue;
    if (looksLikeLocation(skill) || COMPANY_MARKERS.test(skill)) continue;
    if (/\b(?:manager|director|engineer|developer|analyst)\s+at\s+/i.test(skill)) continue;
    if (hasDomainSkills && GENERIC_PRODUCTIVITY_SKILLS.has(key)) continue;
    seen.add(key);
    cleaned.push(skill);
  }

  return cleaned.slice(0, 30);
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

function looksLikeJobLocation(s: string): boolean {
  return isPureLocation(String(s || "").trim());
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
    // Multi-column PDFs often glue body text; a bare "Company | City, ST" still starts a role
    const companyLocHeader =
      !bullet &&
      /^\s*[^|•·\n]{2,60}\s*[|•·]\s*[^|•·\n]{2,40}\s*$/.test(line) &&
      looksLikeJobLocation(line.split(/\s*[|•·]\s*/)[1] || '');

    // Start a new job when we already finished a prior role (had dates or bullets)
    // and hit a non-bullet header line (company/title/date row)
    if (
      current.length > 0 &&
      (bulletsSeen || datesSeen || companyLocHeader) &&
      !bullet &&
      ((isLikelyJobHeader(line) && !looksLikeJobLocation(line)) || companyLocHeader)
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
    let location = '';
    let dates = '';
    const descLines: string[] = [];
    let inBullets = false;

    for (const line of block) {
      // "Company | City • bullet text" — split trailing bullet blob
      let working = line;
      if (!isBulletLine(working) && /[|•·]/.test(working) && /•/.test(working)) {
        const bulletIdx = working.search(/\s•\s/);
        if (bulletIdx > 0) {
          const head = working.slice(0, bulletIdx).trim();
          const tail = working.slice(bulletIdx).replace(/^\s*•\s*/, '').trim();
          // Process head as header line, push bullet as description
          working = head;
          if (tail) {
            // Defer bullet body until after header handling below via synthetic push
            descLines.push(tail);
          }
        }
      }

      if (isBulletLine(working)) {
        inBullets = true;
        descLines.push(working.replace(/^[•●▪◦\-\*]\s*/, ''));
        continue;
      }
      // New employer mid-block (common when multi-column glue drops blank lines)
      if (
        inBullets &&
        /^\s*[^|•·\n]{2,60}\s*[|•·]\s*[^|•·\n]{2,40}\s*$/.test(working) &&
        looksLikeJobLocation(working.split(/\s*[|•·]\s*/)[1] || '')
      ) {
        // Close current job early — remaining lines will form the next block upstream
        // if splitter missed it; still capture cleanly here by treating as header.
        inBullets = false;
        if (company || title || dates) {
          results.push({
            company: company.slice(0, 120),
            title: title.slice(0, 100),
            dates: dates.slice(0, 60),
            description: descLines.join('\n').trim().slice(0, 1500),
            ...(sanitizeCandidateLocation(location)
              ? { location: sanitizeCandidateLocation(location) }
              : {}),
          });
          company = '';
          title = '';
          dates = '';
          location = '';
          descLines.length = 0;
        }
        // fall through to header parsers below
      } else if (inBullets) {
        // Continuation of description without bullet
        descLines.push(working);
        continue;
      }

      const d = extractDateFromLine(working);
      if (d && !dates) {
        dates = d;
        const rest = working
          .replace(DATE_RANGE_RE, '')
          .replace(/[|•·]+/g, '|')
          .split('|')
          .map((p) => p.trim())
          .filter(Boolean);
        for (const part of rest) {
          if (part.length < 2 || part.length > 80) continue;
          if (/^\(?\d+\s+years?(?:\s+\d+\s+months?)?\)?$/i.test(part)) continue;
          const partLoc = isolateLocationFragment(part);
          if (partLoc && !location) {
            location = partLoc;
            continue;
          }
          if (TITLE_WORDS.test(part) && !title) title = cleanTitle(part);
          else if (!company) company = part;
          else if (!title) title = cleanTitle(part);
        }
        continue;
      }

      // "Title at Company"
      const atMatch = working.match(/^(.+?)\s+at\s+(.+)$/i);
      if (atMatch && !title) {
        title = cleanTitle(atMatch[1]);
        company = atMatch[2].replace(DATE_RANGE_RE, '').trim();
        continue;
      }

      // Pipe / bullet-separated header: Company | Title | Dates
      // Also: Company | City, State
      const pipe = working
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
            const loc = isolateLocationFragment(nonDates[1]);
            if (loc) location = loc;
            else company = nonDates[1];
          } else if (TITLE_WORDS.test(nonDates[1])) {
            company = nonDates[0];
            title = cleanTitle(nonDates[1]);
          } else if (looksLikeJobLocation(nonDates[1]) || isolateLocationFragment(nonDates[1])) {
            // "FitonU Alterations | Boca Raton, Florida"
            company = nonDates[0];
            location = isolateLocationFragment(nonDates[1]) || nonDates[1];
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

      // "Operations/Assistant Coach Managed daily..." — title then glued prose
      const coachOrTitleLead = working.match(
        /^((?:Operations\/)?(?:Assistant\s+)?Coach|(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4}))\s+([A-Z][a-z].{20,})$/
      );
      if (!title && coachOrTitleLead && TITLE_WORDS.test(coachOrTitleLead[1])) {
        title = cleanTitle(coachOrTitleLead[1]);
        descLines.push(coachOrTitleLead[2]);
        inBullets = true;
        continue;
      }

      if (TITLE_WORDS.test(working) && !title && working.length < 80) {
        title = cleanTitle(working);
        continue;
      }
      if (
        !company &&
        working.length > 1 &&
        working.length < 80 &&
        !looksLikeEmail(working) &&
        !looksLikeJobLocation(working)
      ) {
        company = working;
        continue;
      }
      const lineLoc = isolateLocationFragment(working);
      if (lineLoc && !location) {
        location = lineLoc;
        if (!company && lineLoc !== working) {
          const prefix = working
            .replace(lineLoc, "")
            .replace(/[\s\-–—|•·,]+$/g, "")
            .trim();
          if (prefix && !TITLE_WORDS.test(prefix) && prefix.length < 80) {
            company = prefix;
          }
        }
        continue;
      }
      if (!title && working.length > 1 && working.length < 80) {
        title = cleanTitle(working);
        continue;
      }
      descLines.push(working);
    }

    if (!title && !company && !dates) continue;

    // Drop education/references that leaked into experience
    const blob = `${company} ${title} ${descLines.join(' ')}`.toLowerCase();
    if (
      /\b(references available|bba|b\.s\.|b\.a\.|m\.b\.a\.|bachelor|master of)\b/i.test(blob) &&
      /\b(university|college)\b/i.test(blob) &&
      !TITLE_WORDS.test(title)
    ) {
      continue;
    }

    results.push({
      company: company.slice(0, 120),
      title: title.slice(0, 100),
      dates: dates.slice(0, 60),
      description: descLines.join('\n').trim().slice(0, 1500),
      ...(sanitizeCandidateLocation(location)
        ? { location: sanitizeCandidateLocation(location) }
        : {}),
    });
  }

  return results.filter((e) => {
    const company = (e.company || '').trim();
    const title = (e.title || '').trim();
    // Drop multi-column scrap fragments
    if (/^(and |to |the |of )/i.test(company)) return false;
    if (!company && !title) return false;
    // Titles that are clearly body fragments (only when no employer)
    if (
      !company &&
      /^(logistic|executive staff|monitoring|high-performance|professional football)/i.test(
        title
      )
    ) {
      return false;
    }
    if (company.length > 2) {
      // Prefer real titles when multi-column glued prose into title field
      if (
        title &&
        /^(professional football|high-performance)/i.test(title) &&
        e.description
      ) {
        const coach = e.description.match(
          /\b((?:Operations\/)?(?:Assistant\s+)?Coach|[A-Za-z/ ]{0,20}Manager)\b/i
        );
        if (coach) e.title = cleanTitle(coach[1]);
      }
      return !!(e.title || e.dates || (e.description && e.description.length > 20));
    }
    // No company: only keep clear role titles with dates
    if (
      title &&
      TITLE_WORDS.test(title) &&
      e.dates &&
      title.split(/\s+/).length <= 6
    ) {
      return true;
    }
    return false;
  });
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
  const linkedInIdentity = extractLinkedInProfileIdentity(text);

  const name = linkedInIdentity.name || extractName(text, options?.filename);
  const email = extractEmail(text);
  const phone = extractPhone(text);
  const linkedin = extractLinkedIn(text);
  const location = sanitizeCandidateLocation(
    linkedInIdentity.location || extractLocation(text, header)
  );
  const salaryRequirements = extractSalary(text);

  const experience = parseExperienceSection(sections.experience || '');
  const education = parseEducationSection(sections.education || '');
  const certifications = extractCertifications(sections.certifications || '');
  const summary = extractSummary(sections.summary || '', text);
  const skills = rankAndCleanSkills(
    extractSkillsFromSection(sections.skills || ''),
    sections.summary || summary,
    text,
    { name, title: linkedInIdentity.title, location }
  );

  let title = linkedInIdentity.title || extractTitle(text, sections, name);
  // Fall back to most recent / current experience title
  if (!title && experience.length) {
    const current = experience.find((e) =>
      /present|current|now/i.test(e.dates || '')
    );
    title = (current?.title || experience[0]?.title || '').trim();
  }
  // Last resort: any TITLE_WORDS line in first experience block of raw text
  if (!title && sections.experience) {
    for (const line of linesOf(sections.experience).slice(0, 12)) {
      if (TITLE_WORDS.test(line) && line.length >= 3 && line.length < 80) {
        title = cleanTitle(line.split(/\s*[|•·]\s*/)[0]);
        break;
      }
    }
  }

  // Location: experience location is a strong secondary signal
  let finalLocation = location;
  if (!finalLocation) {
    const expLoc = experience.find((e) => e.location)?.location;
    const cleaned = sanitizeCandidateLocation(expLoc);
    if (cleaned) finalLocation = cleaned;
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
    location: finalLocation,
    fullAddress: finalLocation,
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

function scoreExtractedResumeText(text: string): number {
  if (!text) return -100;
  let score = Math.min(text.length / 200, 8);
  const head = text.slice(0, 400);
  // Strong signal: person name near top
  if (/^[A-Z][A-Z.'-]+(?:\s+[A-Z][A-Z.'-]+){1,3}\s*$/m.test(head)) score += 8;
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\s*$/m.test(head)) score += 4;
  if (/@/.test(head)) score += 3;
  if (/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(head)) score += 2;
  if (/\b(experience|work history|employment)\b/i.test(text)) score += 3;
  if (/\b(education|academic)\b/i.test(text)) score += 3;
  if (/\b(skills|competencies|technologies)\b/i.test(text)) score += 2;
  if (/\b(summary|profile|objective)\b/i.test(text)) score += 2;
  // Penalize obvious column-scramble: company-like first line
  const firstLine = linesOf(text)[0] || '';
  if (/\b(llc|inc|corp|ltd|university|alterations)\b/i.test(firstLine)) score -= 6;
  // Penalize contact buried late
  const emailIdx = text.search(/@/);
  if (emailIdx > 800) score -= 3;
  // Penalize many empty bullet-only lines
  const emptyBullets = (text.match(/^•\s*$/gm) || []).length;
  score -= Math.min(emptyBullets, 8);
  return score;
}

/**
 * Reconstruct text from pdf.js text items with better line breaks (uses y when available).
 * Tries single-column and two-column layouts; picks the higher-scoring reading order
 * so multi-column PDFs don't interleave Skills with Experience (or scramble the header).
 */
export function textFromPdfItems(
  items: Array<{ str?: string; transform?: number[]; width?: number }>
): string {
  if (!items?.length) return '';

  type Part = { x: number; y: number; s: string; w: number };
  const parts: Part[] = [];
  for (const item of items) {
    const s = item.str ?? '';
    if (!s) continue;
    const tr = item.transform;
    const x = tr?.[4] ?? 0;
    const y = tr?.[5] ?? 0;
    const w = item.width ?? s.length * 4;
    parts.push({ x, y, s, w });
  }
  if (!parts.length) return '';

  const minX = Math.min(...parts.map((p) => p.x));
  const maxX = Math.max(...parts.map((p) => p.x + p.w));
  const pageWidth = Math.max(maxX - minX, 1);
  const maxY = Math.max(...parts.map((p) => p.y));
  const minY = Math.min(...parts.map((p) => p.y));
  const pageHeight = Math.max(maxY - minY, 1);

  const renderColumn = (colParts: Part[]): string => {
    type Line = { y: number; parts: Array<{ x: number; s: string; w: number }> };
    const lines: Line[] = [];
    const Y_TOL = 2.5;
    for (const p of colParts) {
      let line = lines.find((l) => Math.abs(l.y - p.y) < Y_TOL);
      if (!line) {
        line = { y: p.y, parts: [] };
        lines.push(line);
      }
      line.parts.push({ x: p.x, s: p.s, w: p.w });
    }
    lines.sort((a, b) => b.y - a.y);
    return lines
      .map((l) => {
        l.parts.sort((a, b) => a.x - b.x);
        // Adaptive gap: letter-tracking resumes use large gaps between every glyph.
        // Use median char width so only true word gaps become spaces.
        const widths = l.parts
          .map((p) => p.w || p.s.length * 4)
          .filter((w) => w > 0);
        const sortedW = [...widths].sort((a, b) => a - b);
        const medianW =
          sortedW.length > 0
            ? sortedW[Math.floor(sortedW.length / 2)]
            : 6;
        // Gaps smaller than ~0.45 of a char are tracking; larger = word space.
        // Floor 1.0 keeps tiny overlaps glued; cap 14 avoids huge gaps on sparse lines.
        const spaceThreshold = Math.min(14, Math.max(1.0, medianW * 0.45));

        let out = '';
        let prevEnd = -Infinity;
        for (const p of l.parts) {
          if (prevEnd !== -Infinity) {
            const gap = p.x - prevEnd;
            if (gap > spaceThreshold) {
              if (out && !out.endsWith(' ')) out += ' ';
            }
          }
          out += p.s;
          prevEnd = p.x + (p.w || p.s.length * 4);
        }
        return out.replace(/[ \t]+/g, ' ').trim();
      })
      .filter(Boolean)
      .join('\n');
  };

  const single = renderColumn(parts);

  // Two-column: keep top ~18% as full-width header, then left then right body.
  const mid = minX + pageWidth * 0.48;
  const headerYCut = maxY - pageHeight * 0.18;
  let leftN = 0;
  let rightN = 0;
  for (const p of parts) {
    if (p.y >= headerYCut) continue;
    if (p.x + p.w * 0.5 < mid) leftN++;
    else rightN++;
  }
  const twoColumnCandidate =
    pageWidth > 300 &&
    leftN >= 10 &&
    rightN >= 10 &&
    leftN / (leftN + rightN) > 0.22 &&
    rightN / (leftN + rightN) > 0.22;

  if (!twoColumnCandidate) return single;

  const headerParts = parts.filter((p) => p.y >= headerYCut);
  const body = parts.filter((p) => p.y < headerYCut);
  const left = body.filter((p) => p.x + p.w * 0.5 < mid);
  const right = body.filter((p) => p.x + p.w * 0.5 >= mid);
  const twoCol = [renderColumn(headerParts), renderColumn(left), renderColumn(right)]
    .filter(Boolean)
    .join('\n\n');

  const sSingle = scoreExtractedResumeText(single);
  const sTwo = scoreExtractedResumeText(twoCol);
  const chosen = sTwo > sSingle + 1 ? twoCol : single;
  // Final safety net for residual letter-spacing (Canva-style PDFs)
  return collapseSpacedGlyphs(chosen);
}
