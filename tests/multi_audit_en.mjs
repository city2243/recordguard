// 多場版新畫面的英文漏翻掃描：未通過、分享中斷自動收檔、救援清單
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 200000);
const src = readFileSync(new URL('./multi_audit.mjs', import.meta.url), 'utf8');
const FAKE = src.slice(src.indexOf('const FAKE = `') + 14, src.indexOf('`;\n\n// 從 OPFS'));
const LEFT = () => {
  document.querySelectorAll('details').forEach((d) => { d.open = true; });
  const CJK = /[㐀-鿿]/, SKIP = '[translate="no"], .fn, .sc-fileline, .k, .urlbox, code, script, style, textarea, .sc-name';
  const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const el = n.parentElement; if (!el || el.closest(SKIP)) continue;
    if (CJK.test(n.data) && el.offsetParent !== null) out.push(n.data.replace(/\s+/g, ' ').trim().slice(0, 100)); }
  for (const el of document.querySelectorAll('[placeholder],[title],[aria-label]'))
    for (const a of ['placeholder', 'title', 'aria-label']) { const v = el.getAttribute(a); if (v && CJK.test(v)) out.push('@' + v); }
  return [...new Set(out)];
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const rep = (name, left) => { if (left.length) fails++; console.log((left.length ? 'FAIL ' : 'PASS ') + name + (left.length ? '  ← ' + JSON.stringify(left.slice(0, 8)) : '')); };
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const c = await b.newContext({ viewport: { width: 1400, height: 1000 }, locale: 'en-US' });
await c.addInitScript(() => { try { localStorage.setItem('meetingRecorder.lang', 'en'); } catch (e) {} });
await c.addInitScript(FAKE);
const errs = [];
const open = async () => { const p = await c.newPage(); p.on('pageerror', (e) => errs.push(String(e))); p.on('dialog', (d) => d.accept());
  await p.goto('http://localhost:8801/multi.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('.slot-card').length >= 1 && !document.documentElement.classList.contains('i18n-pending')); await sleep(800); return p; };
const pick = async (p, i, mode) => { await p.evaluate((m) => { window.__mode = m; }, mode); await p.click(`.slot-card >> nth=${i} >> .sc-pick`);
  await p.waitForFunction((i) => ['ready', 'failed'].includes(document.querySelectorAll('.slot-card')[i].dataset.state), i, { timeout: 30000 }); };

let p = await open();
await p.evaluate(async () => { const r = await navigator.storage.getDirectory(); try { await r.removeEntry('recordings', { recursive: true }); } catch (e) {} localStorage.removeItem('meetingRecorder.manifest'); });
while ((await p.locator('.slot-card').count()) < 3) await p.click('#btnAddSlot');
await pick(p, 0, 'noaudio');
rep('沒帶聲音（未通過）', await p.evaluate(LEFT));
await pick(p, 1, 'ok');
await p.evaluate(() => window.__endShare(window.__n)); await sleep(600);
rep('準備好後分享被關', await p.evaluate(LEFT));
await pick(p, 1, 'ok'); await pick(p, 2, 'ok');
await p.fill('.slot-card >> nth=1 >> .sc-name', 'Alpha'); await p.fill('.slot-card >> nth=2 >> .sc-name', 'Beta');
await p.click('.slot-card >> nth=1 >> .sc-start'); await p.click('.slot-card >> nth=2 >> .sc-start');
await sleep(5000);
await p.evaluate(() => window.__endShare(window.__n - 1)); await sleep(700);
rep('分享中斷警示', await p.evaluate(LEFT));
await p.waitForFunction(() => document.querySelectorAll('.slot-card')[1].dataset.state === 'done', null, { timeout: 30000 });
await sleep(800);
rep('自動收檔完成＋另一場錄製中', await p.evaluate(LEFT));
const logLeft = await p.evaluate(() => [...document.querySelectorAll('#logBox div')].map((d) => d.textContent).filter((t) => /[㐀-鿿]/.test(t.replace(/Alpha|Beta/g, ''))));
rep('事件紀錄', logLeft);
await sleep(4000);
await p.close({ runBeforeUnload: false });
p = await open(); await sleep(1500);
rep('重開後救援清單', await p.evaluate(LEFT));
console.log('     救援清單：', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('#recoveryList .fn')].map((x) => x.textContent))));
await b.close();
console.log(errs.length ? 'JS 錯誤：' + errs.join(' / ') : '無 JS 錯誤', `\n${fails} 個畫面有漏翻`);
process.exit(fails || errs.length ? 1 : 0);
