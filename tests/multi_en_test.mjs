// 無頭瀏覽器：多場版英文模式完整流程（兩場、各自開始、各自停止）＋ 漏翻掃描 ＋ 報告檔內容
import { chromium } from 'playwright-core';

const EXE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:8801';

const FAKE = `
window.__n=0;
navigator.mediaDevices.getDisplayMedia = async () => {
  const k=++window.__n;
  const cv=document.createElement('canvas');cv.width=1280;cv.height=720;const cx=cv.getContext('2d');
  let t=0; setInterval(()=>{t++;cx.fillStyle='hsl('+((t*3+k*120)%360)+',70%,45%)';cx.fillRect(0,0,1280,720);},33);
  const v=cv.captureStream(15);
  window.__ac = window.__ac || new AudioContext(); const ac=window.__ac; ac.resume();
  const dest=ac.createMediaStreamDestination();
  const osc=ac.createOscillator(), g=ac.createGain(); g.gain.value=0.22; osc.frequency.value=220*k; osc.connect(g); g.connect(dest); osc.start();
  const s=new MediaStream([v.getVideoTracks()[0],dest.stream.getAudioTracks()[0]]);
  const vt=s.getVideoTracks()[0], orig=vt.getSettings.bind(vt);
  vt.getSettings=()=>Object.assign({},orig(),{displaySurface:'browser'});
  return s;
};`;

const LEFT = () => {
  document.querySelectorAll('details').forEach((d) => { d.open = true; });
  const CJK = /[㐀-鿿]/, SKIP = '[translate="no"], .fn, .sc-fileline, .k, .urlbox, code, script, style, textarea';
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) {
    const el = n.parentElement;
    if (!el || el.closest(SKIP)) continue;
    if (CJK.test(n.data) && el.offsetParent !== null) out.push(n.data.replace(/\s+/g, ' ').trim().slice(0, 90));
  }
  for (const el of document.querySelectorAll('[placeholder]')) if (CJK.test(el.placeholder)) out.push('@' + el.placeholder);
  return [...new Set(out)];
};

const results = [];
setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 150000);
const step = (m) => console.log('» ' + m);
const check = (name, ok, detail) => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '   ← ' + JSON.stringify(detail).slice(0, 400))); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: EXE, headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
await ctx.addInitScript(() => { try { localStorage.setItem('meetingRecorder.lang', 'en'); } catch (e) {} });
await ctx.addInitScript(FAKE);
await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());   // 外部資源（字型）一律擋掉
const page = await ctx.newPage();
page.on('dialog', (d) => { console.log('DIALOG', d.type(), d.message().slice(0,80)); d.dismiss(); });
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

step("await page.goto(BASE + '/multi.html', { waitUntil: 'domcontentloaded' ");
await page.goto(BASE + '/multi.html', { waitUntil: 'domcontentloaded' });
step('await page.waitForFunction(() => !document.documentElement.classList.c');
await page.waitForFunction(() => !document.documentElement.classList.contains('i18n-pending'), null, { timeout: 5000 });
check('M1 載入後頁面已顯示且為英文', await page.evaluate(() => document.documentElement.lang === 'en' && document.title.includes('RecordGuard')), await page.title());
let left = await page.evaluate(LEFT);
check('M2 初始畫面 0 段漏翻', left.length === 0, left);

// 兩格：命名、選來源
step("await page.waitForFunction(() => document.querySelectorAll('.slot-card");
await page.waitForFunction(() => document.querySelectorAll('.slot-card').length >= 2, null, { timeout: 15000 }).catch(async () => {
  console.log('DEBUG cards=', await page.evaluate(() => document.querySelectorAll('.slot-card').length), 'errors=', errors, 'log=', await page.evaluate(() => [...document.querySelectorAll('#logBox div')].map(d=>d.textContent).slice(-5)));
});
step("await page.fill('.slot-card >> nth=0 >> .sc-name', 'TSMC call');");
await page.fill('.slot-card >> nth=0 >> .sc-name', 'TSMC call');
step("await page.fill('.slot-card >> nth=1 >> .sc-name', 'Team sync');");
await page.fill('.slot-card >> nth=1 >> .sc-name', 'Team sync');
step("await page.click('.slot-card >> nth=0 >> .sc-pick');");
await page.click('.slot-card >> nth=0 >> .sc-pick');
step("await page.waitForFunction(() => document.querySelectorAll('.slot-card");
await page.waitForFunction(() => document.querySelectorAll('.slot-card')[0].dataset.state === 'ready', null, { timeout: 30000 });
step("await page.click('.slot-card >> nth=1 >> .sc-pick');");
await page.click('.slot-card >> nth=1 >> .sc-pick');
step("await page.waitForFunction(() => document.querySelectorAll('.slot-card");
await page.waitForFunction(() => document.querySelectorAll('.slot-card')[1].dataset.state === 'ready', null, { timeout: 30000 });
left = await page.evaluate(LEFT);
check('M3 兩格檢查完成（準備好了）0 段漏翻', left.length === 0, left);

// 只開第一場
step("await page.click('.slot-card >> nth=0 >> .sc-start');");
await page.click('.slot-card >> nth=0 >> .sc-start');
await sleep(4000);
step("await page.click('.slot-card >> nth=1 >> .sc-start');");
await page.click('.slot-card >> nth=1 >> .sc-start');
await sleep(4000);
const rec = await page.evaluate(() => ({
  states: [...document.querySelectorAll('.slot-card')].map((c) => c.dataset.state),
  status: document.getElementById('statusText').textContent,
  stopAll: document.getElementById('btnStopAll').textContent,
  stop1: document.querySelectorAll('.slot-card')[0].querySelector('.sc-stop').textContent,
}));
left = await page.evaluate(LEFT);
check('M4 兩場錄製中、按鈕與狀態是英文', rec.states.join() === 'recording,recording' && /Recording/.test(rec.status) && /Stop/.test(rec.stop1), rec);
check('M5 錄製中 0 段漏翻', left.length === 0, left);

// 錄影中切回中文、再切回英文
step('await page.click(\'.langswitch button[data-l="zh"]\');');
await page.click('.langswitch button[data-l="zh"]');
await sleep(800);
const zh = await page.evaluate(() => ({ status: document.getElementById('statusText').textContent, stop1: document.querySelectorAll('.slot-card')[0].querySelector('.sc-stop').textContent }));
check('M6 錄影中切回中文正確還原', /錄製中/.test(zh.status) && /停止/.test(zh.stop1), zh);
step('await page.click(\'.langswitch button[data-l="en"]\');');
await page.click('.langswitch button[data-l="en"]');
await sleep(800);

// 停第一場，第二場要繼續
let captured = null;
await page.exposeFunction('__cap', (t) => { captured = t; });
step('await page.evaluate(() => { const o = URL.createObjectURL; URL.createO');
await page.evaluate(() => { const o = URL.createObjectURL; URL.createObjectURL = (b) => { if (b.type.startsWith('text')) b.text().then(window.__cap); return o(b); }; });
step("await page.click('.slot-card >> nth=0 >> .sc-stop');");
await page.click('.slot-card >> nth=0 >> .sc-stop');
step("await page.waitForFunction(() => document.querySelectorAll('.slot-card");
await page.waitForFunction(() => document.querySelectorAll('.slot-card')[0].dataset.state === 'done', null, { timeout: 30000 });
await sleep(1500);
const after = await page.evaluate(() => ({
  states: [...document.querySelectorAll('.slot-card')].map((c) => c.dataset.state),
  verdict: (document.querySelectorAll('.slot-card')[0].querySelector('.verdict') || {}).textContent,
  files: [...document.querySelectorAll('.slot-card')[0].querySelectorAll('.fn')].map((x) => x.textContent),
}));
check('M7 停第一場：第二場仍在錄', after.states.join() === 'done,recording', after);
check('M8 第一場驗證結果是英文', /passed|checks|Recording|problem|warning/i.test(after.verdict || ''), after.verdict);
check('M9 檔名英文（_audio.webm）', after.files.some((f) => /_audio\.webm$/.test(f)), after.files);
left = await page.evaluate(LEFT);
check('M10 完成＋錄製中混合畫面 0 段漏翻', left.length === 0, left);

// 下載實測報告，看內容
step("await page.click('.slot-card >> nth=0 >> .sc-files button:last-child')");
await page.click('.slot-card >> nth=0 >> .sc-files button:has-text("report")');
await sleep(1000);
const cjk = (captured || '').split(/\r?\n/).filter((l) => /[㐀-鿿]/.test(l));
check('M11 實測報告檔全英文', captured && cjk.length === 0, { head: (captured || '').split(/\r?\n/).slice(0, 6), cjk: cjk.slice(0, 6) });

step("await page.click('.slot-card >> nth=1 >> .sc-stop');");
await page.click('.slot-card >> nth=1 >> .sc-stop');
step("await page.waitForFunction(() => document.querySelectorAll('.slot-card");
await page.waitForFunction(() => document.querySelectorAll('.slot-card')[1].dataset.state === 'done', null, { timeout: 30000 });
check('M12 第二場各自停止完成', true);
check('M13 沒有 JavaScript 錯誤', errors.length === 0, errors);

// 截圖給人看
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: process.argv[2] || 'multi_en.png', fullPage: false });

await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n${pass} / ${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
