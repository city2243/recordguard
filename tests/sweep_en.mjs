// 五個頁面英文模式漏翻掃描；首頁另外實錄 6 秒看錄製中與完成畫面
import { chromium } from 'playwright-core';
setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 170000);
const FAKE = `
navigator.mediaDevices.getDisplayMedia = async () => {
  const cv=document.createElement('canvas');cv.width=1280;cv.height=720;const cx=cv.getContext('2d');
  let t=0; setInterval(()=>{t++;cx.fillStyle='hsl('+(t*3%360)+',70%,45%)';cx.fillRect(0,0,1280,720);},33);
  const v=cv.captureStream(15); const ac=new AudioContext(); ac.resume();
  const dest=ac.createMediaStreamDestination(); const o=ac.createOscillator(),g=ac.createGain(); g.gain.value=.2; o.connect(g); g.connect(dest); o.start();
  const s=new MediaStream([v.getVideoTracks()[0],dest.stream.getAudioTracks()[0]]);
  const vt=s.getVideoTracks()[0], orig=vt.getSettings.bind(vt); vt.getSettings=()=>Object.assign({},orig(),{displaySurface:'monitor'});
  return s;
};`;
const LEFT = () => {
  document.querySelectorAll('details').forEach((d) => { d.open = true; });
  const CJK = /[㐀-鿿]/, SKIP = '[translate="no"], .fn, .sc-fileline, .k, .urlbox, code, script, style, textarea';
  const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const el = n.parentElement; if (!el || el.closest(SKIP)) continue;
    if (CJK.test(n.data) && el.offsetParent !== null) out.push(n.data.replace(/\s+/g, ' ').trim().slice(0, 90)); }
  for (const el of document.querySelectorAll('[placeholder],[title],[aria-label]'))
    for (const a of ['placeholder', 'title', 'aria-label']) { const v = el.getAttribute(a); if (v && CJK.test(v)) out.push('@' + v); }
  if (CJK.test(document.title)) out.push('title:' + document.title);
  return [...new Set(out)];
};
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
await ctx.addInitScript(() => { try { localStorage.setItem('meetingRecorder.lang', 'en'); } catch (e) {} });
await ctx.addInitScript(FAKE);
await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
let fails = 0; const errs = [];
const rep = (name, left) => { if (left.length) fails++; console.log((left.length ? 'FAIL ' : 'PASS ') + name + (left.length ? '  ← ' + JSON.stringify(left.slice(0, 8)) : '')); };
for (const p of ['index.html', 'multi.html', 'pricing.html', 'account.html', 'terms.html']) {
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(p + ': ' + e));
  page.on('dialog', (d) => d.dismiss());
  await page.goto('http://localhost:8801/' + p, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('i18n-pending'), null, { timeout: 5000 });
  const t0 = Date.now();
  await page.waitForFunction(() => !/[㐀-鿿]/.test(document.title), null, { timeout: 10000 }).catch(() => {});
  console.log('  ' + p + ' 標題翻好耗時 ' + (Date.now() - t0) + 'ms');
  await page.waitForTimeout(1000);
  rep(p + ' 初始', await page.evaluate(LEFT));
  if (p === 'index.html') {
    const btn = page.locator('#btnPreflight');
    await btn.click({ timeout: 5000 }).catch((e) => console.log('pick click fail', String(e).slice(0, 100)));
    await page.waitForTimeout(6000);
    rep('index 檢查後', await page.evaluate(LEFT));
    const st = page.locator('#btnStart:not([disabled])');
    if (await st.count()) { await st.click(); await page.waitForTimeout(6000); rep('index 錄製中', await page.evaluate(LEFT));
      const sp = page.locator('#btnStop'); await sp.click(); await page.waitForTimeout(8000);
      rep('index 完成', await page.evaluate(LEFT)); }
    else console.log('NOTE 首頁沒找到開始錄製鈕，跳過錄製段');
  }
  await page.close();
}
await browser.close();
console.log(errs.length ? 'JS 錯誤：' + errs.join(' / ') : '無 JS 錯誤', `\n${fails} 個畫面有漏翻`);
process.exit(fails || errs.length ? 1 : 0);
