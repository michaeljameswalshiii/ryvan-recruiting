/**
 * Visual check of Agent Ops shell (CSS + tab markup).
 * Uses dummy recruiting data — live Dynamo data requires a logged-in session.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(
  join(process.cwd(), 'src/components/agent-ops/agent-ops.css'),
  'utf8'
);
const outDir = join(process.cwd(), 'tmp', 'agent-ops-preview');
mkdirSync(outDir, { recursive: true });

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Agent Ops preview</title>
<style>${css}
body { margin: 0; padding: 16px; background: #e8eef1; }
.preview-note { font: 12px/1.4 sans-serif; color: #60737c; margin: 0 0 12px; }
</style>
</head>
<body>
<p class="preview-note">Trio Agent Ops visual preview — dummy data for layout check</p>
<div class="agent-ops">
  <section class="ops-window">
    <div class="ops-topbar">
      <div class="ops-brand"><span class="ops-brand-mark">T</span>Trio Agent Operations</div>
      <div class="ops-top-actions">
        <span class="ops-live"><span class="ops-live-dot"></span>2 agents live</span>
        <span>Michael</span>
      </div>
    </div>
    <div class="ops-shell">
      <nav class="ops-sidebar" aria-label="Agent Ops">
        <div class="ops-nav-label">Operate</div>
        <button class="ops-nav-item is-active" data-tab="command">Command center</button>
        <button class="ops-nav-item" data-tab="fleet">Agent fleet</button>
        <button class="ops-nav-item" data-tab="queue">Interventions</button>
        <div class="ops-nav-label">Today</div>
        <button class="ops-nav-item" data-tab="brief">Daily brief</button>
        <div class="ops-nav-label">Review</div>
        <button class="ops-nav-item" data-tab="history">Run history</button>
      </nav>
      <main class="ops-main">
        <div data-panel="command">
          <div class="ops-heading"><div><h2>Mission control</h2><p>Every active run, exception and approval in one operational view.</p></div><a class="ops-choice" href="#">Open workspace</a></div>
          <div class="ops-stats">
            <div class="ops-stat"><div class="ops-stat-label">Work completed</div><div class="ops-stat-value">6 tasks</div><div class="ops-stat-context">Fill req, company lists, and outreach in the last 24 hours</div></div>
            <div class="ops-stat"><div class="ops-stat-label">Human time saved</div><div class="ops-stat-value">1.8 hrs</div><div class="ops-stat-context">Estimated from completed agent work — not billed hours</div></div>
            <div class="ops-stat"><div class="ops-stat-label">Needs attention</div><div class="ops-stat-value">3 decisions</div><div class="ops-stat-context">Approvals, imports, failures, and due sequence steps</div></div>
          </div>
          <div class="ops-two-col">
            <section class="ops-panel">
              <div class="ops-panel-head"><span class="ops-panel-title">Live agent fleet</span><span class="ops-meta">Updated now</span></div>
              <div class="ops-agent-row"><div class="ops-agent-name"><span class="ops-avatar">FR</span>Fill Req</div><div><span>Qualifying 12 of 25 · Controller, Austin</span><div class="ops-progress"><span style="width:48%"></span></div></div><div class="ops-status is-live">running</div></div>
              <div class="ops-agent-row"><div class="ops-agent-name"><span class="ops-avatar">LB</span>List Builder</div><div><span>Ready to import 18 companies</span><div class="ops-progress"><span class="is-wait" style="width:100%"></span></div></div><div class="ops-status is-wait">paused</div></div>
              <div class="ops-agent-row"><div class="ops-agent-name"><span class="ops-avatar">OR</span>Outreach</div><div><span>2 sequence steps due</span><div class="ops-progress"><span style="width:70%"></span></div></div><div class="ops-status is-live">running</div></div>
            </section>
            <aside class="ops-panel">
              <div class="ops-panel-head"><span class="ops-panel-title">Intervention queue</span><span class="ops-priority">3 open</span></div>
              <div class="ops-queue-item"><div class="ops-queue-top"><strong>Import companies found</strong><span>8m</span></div><div class="ops-meta">List Builder · 18 companies ready · Tampa hospitality</div></div>
              <div class="ops-queue-item"><div class="ops-queue-top"><strong>Approve CRM writes</strong><span>21m</span></div><div class="ops-meta">Fill Req · Goal agent is waiting for confirmation</div></div>
              <div class="ops-queue-item"><div class="ops-queue-top"><strong>Sequence step is due</strong><span>2h</span></div><div class="ops-meta">Outreach · Jordan Hale · Default 3-step outreach</div></div>
            </aside>
          </div>
        </div>
        <div data-panel="fleet" hidden>
          <div class="ops-heading"><div><h2>Agent fleet</h2><p>Fill Req, List Builder, and Outreach — the three workers this board runs.</p></div></div>
          <div class="ops-fleet-grid">
            <div class="ops-panel ops-fleet-card"><div class="ops-fleet-top"><div class="ops-agent-name"><span class="ops-avatar">FR</span>Fill Req</div><span class="ops-status is-live">running</span></div><p class="ops-meta" style="margin-top:10px">Qualifying 12 of 25 · Controller, Austin</p><div class="ops-progress" style="margin-top:12px"><span style="width:48%"></span></div><div class="ops-outcome-foot"><span>Open AI desk</span><span class="ops-outcome-value">1 live</span></div></div>
            <div class="ops-panel ops-fleet-card"><div class="ops-fleet-top"><div class="ops-agent-name"><span class="ops-avatar">LB</span>List Builder</div><span class="ops-status is-wait">paused</span></div><p class="ops-meta" style="margin-top:10px">Ready to import 18 companies</p><div class="ops-progress" style="margin-top:12px"><span class="is-wait" style="width:100%"></span></div><div class="ops-outcome-foot"><span>Open list</span><span class="ops-outcome-value">Idle</span></div></div>
            <div class="ops-panel ops-fleet-card"><div class="ops-fleet-top"><div class="ops-agent-name"><span class="ops-avatar">OR</span>Outreach</div><span class="ops-status is-live">running</span></div><p class="ops-meta" style="margin-top:10px">2 sequence steps due</p><div class="ops-progress" style="margin-top:12px"><span style="width:70%"></span></div><div class="ops-outcome-foot"><span>Open sequences</span><span class="ops-outcome-value">2 live</span></div></div>
          </div>
        </div>
        <div data-panel="queue" hidden>
          <div class="ops-heading"><div><h2>Interventions</h2><p>Work that cannot continue until a recruiter decides.</p></div></div>
          <section class="ops-panel">
            <div class="ops-panel-head"><span class="ops-panel-title">Open interventions</span><span class="ops-priority">3 open</span></div>
            <div class="ops-queue-item"><div class="ops-queue-top"><strong class="ops-risk">Import companies found</strong><span>8m</span></div><div class="ops-meta">List Builder · 18 companies ready</div></div>
            <div class="ops-queue-item"><div class="ops-queue-top"><strong class="ops-risk">Approve CRM writes</strong><span>21m</span></div><div class="ops-meta">Fill Req · Goal agent waiting</div></div>
            <div class="ops-queue-item"><div class="ops-queue-top"><strong>Sequence step is due</strong><span>2h</span></div><div class="ops-meta">Outreach · Jordan Hale</div></div>
          </section>
        </div>
        <div data-panel="brief" hidden>
          <div class="ops-heading"><div><h2>Good morning, Michael</h2><p>6 tasks completed · 3 decisions need you</p></div><a class="ops-choice" href="#">Open first decision</a></div>
          <div class="ops-stats">
            <div class="ops-stat"><div class="ops-stat-label">Work completed</div><div class="ops-stat-value">6 tasks</div><div class="ops-stat-context">Last 24 hours</div></div>
            <div class="ops-stat"><div class="ops-stat-label">Human time saved</div><div class="ops-stat-value">1.8 hrs</div><div class="ops-stat-context">Estimated</div></div>
            <div class="ops-stat"><div class="ops-stat-label">Needs attention</div><div class="ops-stat-value">3 decisions</div><div class="ops-stat-context">Approvals and due steps</div></div>
          </div>
          <div class="ops-brief-grid">
            <div>
              <section class="ops-panel ops-brief-hero"><h3>Today’s recruiting brief</h3><p>Agents finished 6 tasks in the last 24 hours. 12 people came back from fill req. 18 companies landed on lists. 3 items need your call before work can continue.</p></section>
              <section class="ops-panel" style="margin-top:12px">
                <div class="ops-panel-head"><span class="ops-panel-title">Impact this week</span><span>Last 7 days</span></div>
                <div class="ops-impact-row"><span>Sourcing</span><span>38 people returned by fill req this week</span><span class="ops-impact-value">38</span></div>
                <div class="ops-impact-row"><span>BD lists</span><span>54 companies kept on lists this week</span><span class="ops-impact-value">54</span></div>
                <div class="ops-impact-row"><span>Capacity</span><span>Estimated research and outreach time agents covered</span><span class="ops-impact-value">7.2 hrs</span></div>
              </section>
            </div>
            <aside class="ops-panel">
              <div class="ops-panel-head"><span class="ops-panel-title">Decision agenda</span><span>3 items</span></div>
              <div class="ops-timeline-item"><span class="ops-time">Now</span><div><strong>Import companies found</strong><div class="ops-meta">18 companies ready</div></div></div>
              <div class="ops-timeline-item"><span class="ops-time">21m</span><div><strong class="ops-risk">Approve CRM writes</strong><div class="ops-meta">Fill Req waiting</div></div></div>
              <div class="ops-timeline-item"><span class="ops-time">Today</span><div><strong>Sequence step is due</strong><div class="ops-meta">Jordan Hale</div></div></div>
            </aside>
          </div>
        </div>
        <div data-panel="history" hidden>
          <div class="ops-heading"><div><h2>Run history</h2><p>Recent agent activity across sourcing, company lists, and sequences.</p></div></div>
          <section class="ops-panel">
            <div class="ops-panel-head"><span class="ops-panel-title">Recent agent work</span><span class="ops-meta">Newest first</span></div>
            <div class="ops-timeline-item"><span class="ops-time">Mar 19, 9:14 AM</span><div><strong>Running fill req</strong><div class="ops-meta">Fill Req · 12 qualified · Controller, Austin</div></div></div>
            <div class="ops-timeline-item"><span class="ops-time">Mar 19, 8:02 AM</span><div><strong>Ready to import company list</strong><div class="ops-meta">List Builder · 18 found · Tampa hospitality</div></div></div>
            <div class="ops-timeline-item"><span class="ops-time">Mar 18, 4:40 PM</span><div><strong>Sequence step sent</strong><div class="ops-meta">Outreach · Jordan Hale · Default 3-step</div></div></div>
          </section>
        </div>
      </main>
    </div>
  </section>
</div>
<script>
  const tabs = [...document.querySelectorAll('[data-tab]')];
  const panels = [...document.querySelectorAll('[data-panel]')];
  tabs.forEach((tab) => tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
    panels.forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
  }));
</script>
</body>
</html>`;

const browser = await chromium.launch({ headless: true, channel: 'chrome' });

async function shoot(width, height, suffix) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  const tabs = ['command', 'fleet', 'queue', 'brief', 'history'];
  for (const tab of tabs) {
    await page.click(`[data-tab="${tab}"]`);
    await page.waitForTimeout(120);
    await page.screenshot({
      path: join(outDir, `${suffix}-${tab}.png`),
      fullPage: true,
    });
  }
  await page.close();
}

await shoot(1440, 1000, 'desktop');
await shoot(390, 844, 'mobile');
await browser.close();
console.log('wrote', outDir);
