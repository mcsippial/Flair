/**
 * Flair E2E smoke test — runs against a local dev server.
 * Usage: node tests/e2e/smoke.js [base_url]
 * Writes screenshots to tests/e2e/screenshots/ and exits non-zero on failure.
 */

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.argv[2] || 'http://localhost:5173';
const SS_DIR = path.join(__dirname, 'screenshots');
fs.mkdirSync(SS_DIR, { recursive: true });

const results = [];
let browser, page;

async function shot(name) {
  const file = path.join(SS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function check(label, fn) {
  try {
    await fn();
    results.push({ label, pass: true });
    console.log(`  ✅ ${label}`);
  } catch (err) {
    results.push({ label, pass: false, error: err.message });
    console.log(`  ❌ ${label}: ${err.message}`);
    try { await shot(`FAIL-${label.replace(/\s+/g, '_')}`); } catch {}
  }
}

(async () => {
  console.log(`\nFlair E2E smoke test → ${BASE_URL}\n`);

  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
           '--autoplay-policy=no-user-gesture-required'],
  });

  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // Stub AudioContext to avoid Web Audio permission issues in headless
    permissions: [],
  });

  // Silence console noise from Tone.js
  ctx.on('console', () => {});

  page = await ctx.newPage();

  // ── 1. Load the app ────────────────────────────────────────────────────────
  await check('App loads without crash', async () => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForSelector('.start-screen, .board', { timeout: 10000 });
    await shot('01-start-screen');
  });

  // ── 2. Start screen shows demo button ─────────────────────────────────────
  await check('Start screen renders with demo button', async () => {
    const btn = await page.locator('button', { hasText: /demo/i }).first();
    await btn.waitFor({ timeout: 5000 });
    await shot('02-start-screen-ready');
  });

  // ── 3. Load demo session ───────────────────────────────────────────────────
  await check('Load Demo Session enters the board', async () => {
    await page.locator('button', { hasText: /demo/i }).first().click();
    await page.waitForSelector('.board', { timeout: 8000 });
    await shot('03-board-loaded');
  });

  // ── 4. Tracks rendered ─────────────────────────────────────────────────────
  await check('At least 4 tracks visible in timeline', async () => {
    const tracks = await page.locator('.track-row').count();
    if (tracks < 4) throw new Error(`Only ${tracks} tracks found`);
    await shot('04-tracks-visible');
  });

  // ── 5. Top bar elements ────────────────────────────────────────────────────
  await check('Top bar: play button, BPM input, wordmark visible', async () => {
    await page.locator('.wordmark').waitFor({ timeout: 3000 });
    await page.locator('.bpm-input').waitFor({ timeout: 3000 });
    await page.locator('.transport-btn.play').waitFor({ timeout: 3000 });
  });

  // ── 6. Click play ─────────────────────────────────────────────────────────
  await check('Play button toggles active state', async () => {
    const btn = page.locator('.transport-btn.play');
    await btn.click();
    await page.waitForTimeout(400);
    const isActive = await btn.evaluate(el => el.classList.contains('active'));
    await shot('06-playing');
    // Stop it again
    await btn.click();
    await page.waitForTimeout(200);
    if (!isActive) throw new Error('Play button did not gain .active class');
  });

  // ── 7. Select a track ─────────────────────────────────────────────────────
  await check('Clicking a track selects it', async () => {
    await page.locator('.track-row').first().click();
    await page.waitForTimeout(200);
    const selected = await page.locator('.track-row.selected').count();
    if (selected === 0) throw new Error('No track got .selected class');
    await shot('07-track-selected');
  });

  // ── 8. Open mixer panel ───────────────────────────────────────────────────
  await check('Mixer panel opens and shows channel strips', async () => {
    // Click the Mixer tab (bottom panel tabs)
    const mixerTab = page.locator('.panel-tab', { hasText: /mixer/i }).first();
    await mixerTab.click();
    await page.waitForTimeout(300);
    const strips = await page.locator('.channel-strip').count();
    await shot('08-mixer');
    if (strips === 0) throw new Error('No channel strips found in mixer');
  });

  // ── 9. Double-click a MIDI clip → piano roll ──────────────────────────────
  await check('Double-clicking a MIDI clip opens piano roll', async () => {
    // Find first non-drum clip
    const clips = page.locator('.clip');
    const count = await clips.count();
    let opened = false;
    for (let i = 0; i < count; i++) {
      const clip = clips.nth(i);
      const type = await clip.getAttribute('data-type');
      if (type === 'drum') continue;
      await clip.dblclick();
      await page.waitForTimeout(400);
      const pr = await page.locator('.piano-roll').count();
      if (pr > 0) { opened = true; break; }
    }
    await shot('09-piano-roll');
    if (!opened) throw new Error('Piano roll did not open after double-click');
  });

  // ── 10. Place a note in the piano roll ────────────────────────────────────
  await check('Clicking note grid places a note', async () => {
    const grid = page.locator('.note-grid');
    await grid.waitFor({ timeout: 3000 });
    const before = await page.locator('.piano-note').count();
    await grid.click({ position: { x: 80, y: 40 } });
    await page.waitForTimeout(300);
    const after = await page.locator('.piano-note').count();
    await shot('10-note-placed');
    if (after <= before) throw new Error(`Note count didn't increase (${before} → ${after})`);
  });

  // ── 11. Double-click drum clip → drum sequencer ───────────────────────────
  await check('Double-clicking a drum clip opens drum sequencer', async () => {
    const drumClips = page.locator('.clip[data-type="drum"]');
    const count = await drumClips.count();
    if (count === 0) throw new Error('No drum clips found');
    await drumClips.first().dblclick();
    await page.waitForTimeout(400);
    const seq = await page.locator('.drum-sequencer').count();
    await shot('11-drum-sequencer');
    if (seq === 0) throw new Error('Drum sequencer did not open');
  });

  // ── 12. Toggle a drum step ─────────────────────────────────────────────────
  await check('Clicking a drum step toggles it active', async () => {
    const step = page.locator('.drum-step').nth(2);
    await step.waitFor({ timeout: 3000 });
    await step.click();
    await page.waitForTimeout(200);
    const isActive = await step.evaluate(el => el.classList.contains('active'));
    await shot('12-drum-step-toggled');
    if (!isActive) throw new Error('Drum step did not gain .active class');
  });

  // ── 13. AI panel ──────────────────────────────────────────────────────────
  await check('AI chat panel is accessible', async () => {
    const aiTab = page.locator('.panel-tab', { hasText: /ai|chat/i }).first();
    await aiTab.click();
    await page.waitForTimeout(300);
    await page.locator('.ai-panel, .ai-chat').waitFor({ timeout: 3000 });
    await shot('13-ai-panel');
  });

  // ── 14. BPM change ────────────────────────────────────────────────────────
  await check('BPM input accepts a new value', async () => {
    const bpmInput = page.locator('.bpm-input');
    await bpmInput.fill('128');
    await bpmInput.press('Enter');
    await page.waitForTimeout(200);
    const val = await bpmInput.inputValue();
    if (val !== '128') throw new Error(`BPM is ${val}, expected 128`);
    await shot('14-bpm-changed');
  });

  // ── Final screenshot ───────────────────────────────────────────────────────
  await shot('15-final-state');

  await browser.close();

  // ── Summary ────────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed\n`);

  // Write JSON summary for the workflow to parse
  fs.writeFileSync(
    path.join(__dirname, 'results.json'),
    JSON.stringify({ passed, failed, total: results.length, results }, null, 2)
  );

  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
