// 故意讓第一次載翻譯表卡住（或連線重設），確認會重試、整頁最後是英文、連輸入框提示也翻到
import { chromium } from 'playwright-core';
setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 170000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LEFT = () => {
  const CJK = /[㐀-鿿]/, SKIP = '[translate="no"], .fn, .sc-fileline, .k, .urlbox, code, script, style, textarea';
  const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const el = n.parentElement; if (!el || el.closest(SKIP)) continue;
    if (CJK.test(n.data) && el.offsetParent !== null) out.push(n.data.replace(/\s+/g, ' ').trim().slice(0, 90)); }
  for (const el of document.querySelectorAll('[placeholder],[title],[aria-label]'))
    for (const a of ['placeholder', 'title', 'aria-label']) { const v = el.getAttribute(a); if (v && CJK.test(v)) out.push('@' + v); }
  if (CJK.test(document.title)) out.push('title:' + document.title);
  return [...new Set(out)];
};
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let bad = 0;
for (const mode of ['hang', 'reset']) for (const pg of ['multi.html', 'index.html', 'pricing.html']) {
  const c = await b.newContext({ locale: 'en-US' });
  await c.addInitScript(() => { try { localStorage.setItem('meetingRecorder.lang', 'en'); } catch (e) {} });
  await c.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  let n = 0;
  await c.route(/i18n-en\.js/, async (r) => { n++; if (n === 1) { if (mode === 'reset') return r.abort('connectionreset'); return; /* 不回應 = 卡住 */ } return r.continue(); });
  const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  const t0 = Date.now();
  await p.goto('http://localhost:8801/' + pg, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.title === 'RecordGuard', null, { timeout: 15000 }).catch(() => {});
  const ms = Date.now() - t0; await sleep(1200);
  const left = await p.evaluate(LEFT);
  if (left.length || errs.length) bad++;
  console.log(`${left.length || errs.length ? 'FAIL' : 'PASS'} ${mode} ${pg}：翻譯表請求 ${n} 次、${ms}ms 後變英文、漏翻 ${left.length}${left.length ? ' ' + JSON.stringify(left.slice(0, 4)) : ''}${errs.length ? ' 錯誤 ' + errs : ''}`);
  await c.close();
}
await b.close(); process.exit(bad ? 1 : 0);
