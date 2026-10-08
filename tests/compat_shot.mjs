// 模擬 Firefox、Safari、手機的 userAgent 看說明長相（Chrome 引擎跑，只看畫面）
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const UAS = {
  firefox: { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:155.0) Gecko/20100101 Firefox/155.0', vp: [1280, 900] },
  safari: { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15', vp: [1280, 900] },
  phone: { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1', vp: [390, 844] },
  macchrome: { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36', vp: [1280, 900] },
};
for (const [k, v] of Object.entries(UAS)) {
  const c = await b.newContext({ userAgent: v.ua, viewport: { width: v.vp[0], height: v.vp[1] } });
  await c.addInitScript(() => {
    try { localStorage.setItem('meetingRecorder.lang', 'zh'); } catch (e) {}
    try { Object.defineProperty(navigator, 'userAgentData', { get: () => undefined }); } catch (e) {}
    if (/Safari\//.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)) { try { Object.defineProperty(navigator, 'vendor', { get: () => 'Apple Computer, Inc.' }); } catch (e) {} }
  });
  await c.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  for (const pg of ['index', 'multi']) {
    await p.goto(`http://localhost:8801/${pg}.html`); await p.waitForTimeout(1500);
    const info = await p.evaluate(() => ({ notice: (document.querySelector('.compat h2') || {}).textContent || null, btn: document.getElementById('btnPreflight') ? document.getElementById('btnPreflight').disabled + ' ' + document.getElementById('btnPreflight').textContent : null, slots: document.getElementById('slotsCard') ? document.getElementById('slotsCard').hidden : null }));
    console.log(k, pg, JSON.stringify(info));
    await p.screenshot({ path: `compat_${k}_${pg}.png` });
  }
  if (errs.length) console.log('  JS 錯誤', errs);
  await c.close();
}
await b.close();
