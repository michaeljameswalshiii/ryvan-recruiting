/**
 * Login as the demo account, screenshot each recruiter-facing page,
 * then stitch the shots into a landscape PDF.
 *
 *   DEMO_EMAIL=... DEMO_PASSWORD=... node tmp/capture-demo-pages.mjs
 */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.DEMO_BASE_URL || 'https://turnkey-optimization.vercel.app';
const EMAIL = process.env.DEMO_EMAIL;
const PASSWORD = process.env.DEMO_PASSWORD;
const OUT_DIR = join(process.cwd(), 'tmp', 'demo-screenshots');
const PDF_PATH = join(process.cwd(), 'tmp', 'demo-account-pages.pdf');

if (!EMAIL || !PASSWORD) {
  console.error('Set DEMO_EMAIL and DEMO_PASSWORD');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

function firstId(payload) {
  const rows =
    payload?.leads ||
    payload?.clients ||
    payload?.jobs ||
    payload?.companies ||
    payload?.contacts ||
    payload?.items ||
    payload?.data ||
    (Array.isArray(payload) ? payload : []);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.id || row?._id || null;
}

async function jsonOrNull(page, path) {
  try {
    return await page.evaluate(async (url) => {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) return null;
      return r.json();
    }, path);
  } catch {
    return null;
  }
}

async function shot(page, slug, path) {
  const url = `${BASE}${path}`;
  console.log(`  ${slug}  ${path}`);
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const status = response?.status() ?? 0;
  const dest = join(OUT_DIR, `${String(slug).padStart(2, '0')}-${slug.replace(/[^a-z0-9-]+/gi, '-')}.png`);
  await page.screenshot({ path: dest, fullPage: false });
  return { slug, path, status, dest };
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });

  console.log('Logging in…');
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('form button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
  await page.waitForTimeout(2000);

  const [leads, clients, jobs] = await Promise.all([
    jsonOrNull(page, '/api/data/leads'),
    jsonOrNull(page, '/api/data/clients'),
    jsonOrNull(page, '/api/data/jobs'),
  ]);
  const leadId = firstId(leads);
  const companyId = firstId(clients);
  const jobId = firstId(jobs);
  let contactId = null;
  const companies = clients?.clients || clients?.companies || [];
  if (Array.isArray(companies)) {
    for (const co of companies) {
      const c = (co.contacts || [])[0];
      if (c?.id) {
        contactId = c.id;
        break;
      }
    }
  }
  let listBuilderId = null;
  const lb = await jsonOrNull(page, '/api/list-builder');
  listBuilderId = firstId(lb) || lb?.jobs?.[0]?.id || lb?.searches?.[0]?.id || null;
  const clb = await jsonOrNull(page, '/api/candidate-list-builder');
  const candidateListId = firstId(clb) || clb?.jobs?.[0]?.id || null;

  console.log('IDs', { leadId, companyId, jobId, contactId, listBuilderId, candidateListId });

  const pages = [
    ['01-dashboard', '/dashboard'],
    ['02-candidates', '/dashboard/candidates'],
    leadId && ['03-candidate-detail', `/dashboard/candidates/${leadId}`],
    ['04-candidate-new', '/dashboard/candidates/new'],
    ['05-companies', '/dashboard/companies'],
    companyId && ['06-company-detail', `/dashboard/companies/${companyId}`],
    ['07-company-new', '/dashboard/companies/new'],
    ['08-contacts', '/dashboard/contact-info'],
    contactId && ['09-contact-detail', `/dashboard/contacts/${contactId}`],
    ['10-jobs', '/dashboard/jobs'],
    jobId && ['11-job-detail', `/dashboard/jobs/${jobId}`],
    jobId && ['12-job-pipeline', `/dashboard/jobs/${jobId}/pipeline`],
    ['13-job-new', '/dashboard/jobs/new'],
    ['14-talent-graph', '/dashboard/talent-graph'],
    ['15-sequences', '/dashboard/sequences'],
    ['16-ai', '/dashboard/general-ai-usage'],
    ['17-settings', '/dashboard/settings'],
    ['18-company-settings', '/dashboard/settings/company'],
    ['19-reporting', '/dashboard/reporting'],
    ['20-pipeline', '/dashboard/pipeline'],
    ['21-scheduling', '/dashboard/scheduling'],
    ['22-list-builder', '/dashboard/list-builder'],
    listBuilderId && ['23-list-builder-detail', `/dashboard/list-builder/${listBuilderId}`],
    ['24-candidate-list-builder', '/dashboard/candidate-list-builder'],
    candidateListId && ['25-candidate-list-detail', `/dashboard/candidate-list-builder/${candidateListId}`],
    ['26-candidates-archive', '/dashboard/candidates-archive'],
    ['27-ai-assistant', '/dashboard/ai-assistant'],
    ['28-ai-agents', '/dashboard/ai-agents'],
  ].filter(Boolean);

  const results = [];
  for (const [slug, path] of pages) {
    try {
      results.push(await shot(page, slug, path));
    } catch (err) {
      console.error(`  FAIL ${slug}:`, err.message);
      results.push({ slug, path, status: 0, dest: null, error: err.message });
    }
  }

  await browser.close();
  writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(results, null, 2));

  const py = `
from pathlib import Path
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

out = Path(r"${PDF_PATH.replace(/\\/g, '\\\\')}")
shots = sorted(Path(r"${OUT_DIR.replace(/\\/g, '\\\\')}").glob("*.png"))
page_w, page_h = landscape(letter)
c = canvas.Canvas(str(out), pagesize=landscape(letter))
margin = 0.45 * inch
for shot in shots:
    img = ImageReader(str(shot))
    iw, ih = img.getSize()
    title = shot.stem
    header = 0.32 * inch
    max_w = page_w - 2 * margin
    max_h = page_h - 2 * margin - header
    scale = min(max_w / iw, max_h / ih)
    w, h = iw * scale, ih * scale
    x = (page_w - w) / 2
    y = margin
    c.setFillColorRGB(0.12, 0.16, 0.22)
    c.rect(0, 0, page_w, page_h, fill=1, stroke=0)
    c.setFillColorRGB(0.95, 0.96, 0.97)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin, page_h - margin - 12, title)
    c.setFont("Helvetica", 8)
    c.setFillColorRGB(0.75, 0.78, 0.82)
    c.drawRightString(page_w - margin, page_h - margin - 12, "Turnkey demo account")
    c.drawImage(img, x, y, width=w, height=h, preserveAspectRatio=True, mask="auto")
    c.showPage()
c.save()
print("PDF", out, "pages", len(shots))
`;
  writeFileSync(join(OUT_DIR, 'build_pdf.py'), py);
  const built = spawnSync('python', [join(OUT_DIR, 'build_pdf.py')], { encoding: 'utf8' });
  process.stdout.write(built.stdout || '');
  process.stderr.write(built.stderr || '');
  if (built.status !== 0) process.exit(built.status || 1);
  console.log('Wrote', PDF_PATH);
  console.log('Shots', readdirSync(OUT_DIR).filter((f) => f.endsWith('.png')).length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
