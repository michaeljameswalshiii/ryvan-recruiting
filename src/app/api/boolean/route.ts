import { NextRequest, NextResponse } from "next/server";

/**
 * API Route: Generate Recruiting Boolean Query
 * ============================================
 * Generates Boolean search queries for candidate sourcing.
 * 
 * Input (POST body):
 * {
 *   "job_description": "Senior Python developer with AWS",
 *   "platform": "linkedin",  // optional: linkedin, indeed, dice, google
 *   "location": "Miami, FL",   // optional
 *   "skills": ["Python", "AWS"], // optional (can extract from job_description)
 *   "exclusions": ["junior", "intern"] // optional
 * }
 * 
 * Output:
 * {
 *   "boolean_query": "site:linkedin.com AND (\"Python\" OR \"AWS\")...",
 *   "google_url": "https://www.google.com/search?q=...",
 *   "platform_url": "https://www.linkedin.com/jobs/search/?...",
 *   "explanation": "..."
 * }
 */

// ============ Boolean Query Generation Logic (duplicated from Lambda) ============

const COMMON_SKILLS = [
  "Python", "JavaScript", "TypeScript", "Java", "C++", "C#", "Go", "Rust",
  "React", "Angular", "Vue", "Node.js", "Django", "Flask", "Spring",
  "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "Ansible",
  "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch",
  "Git", "CI/CD", "Jenkins", "Linux", "Agile", "Scrum"
];

function extractSkills(jobDescription: string): string[] {
  const found: string[] = [];
  const lower = jobDescription.toLowerCase();
  for (const skill of COMMON_SKILLS) {
    if (lower.includes(skill.toLowerCase())) {
      found.push(skill);
    }
  }
  return found;
}

function generateBooleanQuery(
  skills: string[], 
  platform: string, 
  location: string, 
  exclusions: string[]
): string {
  if (!skills.length) return "";
  
  const parts: string[] = [];
  
  if (platform === "linkedin") {
    parts.push(`site:${platform}.com`);
    const skillsQuery = skills.map(s => `"${s}"`).join(" OR ");
    parts.push(`(${skillsQuery})`);
  } else if (platform === "indeed" || platform === "dice") {
    const skillsQuery = skills.map(s => `"${s}"`).join(" OR ");
    parts.push(`(${skillsQuery})`);
  } else {
    const sites: Record<string, string> = {
      linkedin: "linkedin.com",
      indeed: "indeed.com",
      dice: "dice.com",
      monster: "monster.com",
      glassdoor: "glassdoor.com"
    };
    const site = sites[platform] || "linkedin.com";
    const skillsQuery = skills.map(s => `"${s}"`).join(" OR ");
    parts.push(`(site:${site} AND (${skillsQuery}))`);
  }
  
  if (location) {
    const locParts = location.split(",");
    if (locParts.length >= 2) {
      parts.push(`"${locParts[0].trim()}" AND "${locParts[1].trim()}"`);
    } else {
      parts.push(`"${location}"`);
    }
  }
  
  for (const exc of exclusions) {
    parts.push(`NOT "${exc}"`);
  }
  
  return parts.join(" AND ");
}

function generateGoogleUrl(query: string): string {
  const encoded = encodeURIComponent(query);
  return `https://www.google.com/search?q=${encoded}`;
}

function generatePlatformUrl(platform: string, skills: string[], location: string): string {
  const query = skills.join(" ") + (location ? " " + location : "");
  const encoded = encodeURIComponent(query);
  
  const urls: Record<string, string> = {
    linkedin: `https://www.linkedin.com/jobs/search/?keywords=${encoded}`,
    indeed: `https://www.indeed.com/jobs?q=${encoded}`,
    dice: `https://www.dice.com/jobs?q=${encoded}`,
    monster: `https://www.monster.com/jobs/search?q=${encoded}`,
    glassdoor: `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encoded}`
  };
  
  return urls[platform] || generateGoogleUrl(query);
}

function buildExplanation(skills: string[], location: string, exclusions: string[], platform: string): string {
  const parts: string[] = [];
  
  if (skills.length === 1) {
    parts.push(`looking for profiles with ${skills[0]}`);
  } else if (skills.length === 2) {
    parts.push(`looking for profiles with ${skills[0]} or ${skills[1]}`);
  } else {
    parts.push(`looking for profiles with ${skills.slice(0, -1).join(", ")}, or ${skills[-1]}`);
  }
  
  if (location) parts.push(`in ${location}`);
  if (exclusions.length) {
    parts.push(`excluding ${exclusions.map(e => `"${e}"`).join(", ")}`);
  }
  
parts.push(`searching on ${platform.charAt(0).toUpperCase() + platform.slice(1)}`);
  return parts.join(" ") + ".";
}
// ==========================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      job_description, 
      platform = "linkedin", 
      location = "", 
      skills = [], 
      exclusions = [] 
    } = body;

    const finalSkills = skills.length ? skills : (job_description ? extractSkills(job_description) : []);
    
    if (!finalSkills.length && !job_description) {
      return NextResponse.json(
        { error: "Please provide job_description or skills list" },
        { status: 400 }
      );
    }

    const booleanQuery = generateBooleanQuery(finalSkills, platform, location, exclusions);
    const googleUrl = generateGoogleUrl(booleanQuery);
    const platformUrl = generatePlatformUrl(platform, finalSkills, location);
    const explanation = buildExplanation(finalSkills, location, exclusions, platform);
    
    return NextResponse.json({
      success: true,
      boolean_query: booleanQuery,
      google_url: googleUrl,
      platform_url: platformUrl,
      platform,
      explanation
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate Boolean query";
    console.error("Boolean query generation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
