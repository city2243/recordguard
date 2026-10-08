import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 150000);
const src = readFileSync(new URL('./multi_audit.mjs', import.meta.url), 'utf8');
let FAKE = src.slice(src.indexOf('const FAKE = `') + 14, src.indexOf('`;\n\n// 從 OPFS'));
FAKE += `\nconst __orig = navigator.mediaDevices.getDisplayMedia; navigator.mediaDevices.getDisplayMedia = async (...a) => { if (window.__cancel) { await new Promise(r => setTimeout(r, 4000)); throw new DOMException('cancel', 'NotAllowedError'); } return __orig(...a); };`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = []; const check = (n, v, d) => { ok.push(v); console.log((v ? 'PASS ' : 'FAIL ') + n + (v ? '' : ' ← ' + JSON.stringify(d))); };
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
async function start() {
  const c = await b.newContext(); await c.addInitScript(() => { localStorage.setItem('meetingRecorder.lang', 'zh'); }); await c.addInitScript(FAKE);
  await c.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const p = await c.newPage(); p.__e = []; p.on('pageerror', (e) => p.__e.push(String(e))); p.on('dialog', (d) => d.accept());
  await p.goto('http://localhost:8801/index.html'); await sleep(1500);
  await p.selectOption('#sourceMode', 'browser'); await p.click('#btnPreflight');
  await p.waitForFunction(() => !document.getElementById('btnStart').disabled, null, { timeout: 60000 });
  await p.click('#btnStart'); await sleep(5000);
  await p.evaluate(() => window.__endShare(window.__n)); await sleep(1500);
  return p;
}
const done = (p) => p.evaluate(() => !document.getElementById('doneCard').hidden);
// R1：按重新接上 → 分享視窗開著 4 秒後取消（這段期間不能被自動收檔）→ 之後重新倒數 10 秒收檔
{
  const p = await start();
  await p.evaluate(() => { window.__cancel = true; });
  await p.click('#btnReattach');
  await sleep(9000 + 3000);     // 原本 10 秒的倒數早就過了
  check('R1a 重新選畫面期間（含取消後幾秒）不會被自動收檔', !(await done(p)));
  await p.waitForFunction(() => !document.getElementById('doneCard').hidden, null, { timeout: 20000 }).catch(() => {});
  check('R1b 取消重接後重新倒數，自動停止並存檔', await done(p));
  check('R1c 沒有 JS 錯誤', p.__e.length === 0, p.__e);
  await p.context().close();
}
// R2：按重新接上 → 選到新畫面 → 繼續錄成第 2 段，不會被收檔
{
  const p = await start();
  await p.click('#btnReattach');
  await sleep(16000);
  const s = await p.evaluate(() => ({ done: !document.getElementById('doneCard').hidden, live: !document.getElementById('liveCard').hidden, alert: !document.getElementById('alertBar').hidden && document.getElementById('alertTitle').textContent }));
  check('R2 重新接上後繼續錄、不會被自動收檔、警示消失', !s.done && s.live && !s.alert, s);
  await p.click('#btnStop'); await p.waitForFunction(() => !document.getElementById('doneCard').hidden, null, { timeout: 30000 });
  await sleep(4000); const files = await p.evaluate(() => document.getElementById('doneCard').innerText.split(String.fromCharCode(10)).filter((l) => /webm|txt/.test(l)));
  check('R2b 收檔後有第 2 段的檔案', files.some((f) => /第2段/.test(f)), files);
  check('R2c 沒有 JS 錯誤', p.__e.length === 0, p.__e);
}
await b.close(); console.log(`${ok.filter(Boolean).length} / ${ok.length} passed`); process.exit(0);
