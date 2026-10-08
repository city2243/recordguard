// 真的分頁擷取（不是模擬）：開一個會發出 440Hz 聲音、標題為 MeetingTabX 的分頁，讓 Chrome 自動選它
import { chromium } from 'playwright-core';
import { writeFileSync } from 'fs';
import { fileURLToPath as __f2p } from 'url';
const __ROOT = __f2p(new URL('../', import.meta.url)).replace(/\\/g, '/');
setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 150000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
writeFileSync(__ROOT + '_realtab_test.html', `<!doctype html><title>MeetingTabX</title><body style="background:#246">
<h1 id=t style="color:#fff">fake meeting</h1><script>
const ac=new AudioContext(); const o=ac.createOscillator(); const g=ac.createGain(); g.gain.value=0.03; o.frequency.value=440; o.connect(g); g.connect(ac.destination); o.start();
let n=0; setInterval(()=>{document.getElementById('t').textContent='fake meeting '+(n++)},100);
</script>`);
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: process.argv[2] !== 'headed',
  args: ['--autoplay-policy=no-user-gesture-required', '--auto-select-tab-capture-source-by-title=MeetingTabX', '--enable-usermedia-screen-capturing'] });
const c = await b.newContext({ viewport: { width: 1400, height: 1000 } });
await c.addInitScript(() => { try { localStorage.setItem('meetingRecorder.lang', 'zh'); } catch (e) {} });
const meet = await c.newPage();
await meet.goto('http://localhost:8801/_realtab_test.html');
await sleep(800); console.log('會議分頁 AudioContext：', await meet.evaluate(() => ac.state + ' t=' + ac.currentTime.toFixed(2) + ' sink=' + (ac.sinkId ?? 'n/a') + ' baseLatency=' + ac.baseLatency));
const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('dialog', (d) => d.accept());
p.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
await p.goto('http://localhost:8801/multi.html', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelectorAll('.slot-card').length >= 1); await sleep(500);
await p.fill('.slot-card >> nth=0 >> .sc-name', '真實分頁');
await p.click('.slot-card >> nth=0 >> .sc-pick');
await p.waitForFunction(() => ['ready', 'failed', 'empty'].includes(document.querySelectorAll('.slot-card')[0].dataset.state), null, { timeout: 40000 });
const chk = await p.evaluate(() => { const c = document.querySelectorAll('.slot-card')[0];
  return { state: c.dataset.state, checks: [...c.querySelectorAll('.ci')].map((r) => r.className.replace('ci ci-', '') + ':' + r.querySelector('.ci-name').textContent + ' ' + r.querySelector('.ci-detail').textContent) }; });
console.log('檢查結果：', JSON.stringify(chk, null, 1));
console.log('事件紀錄：', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('#logBox div')].map((d) => d.textContent).slice(-4))));
if (chk.state === 'ready') {
  await p.click('.slot-card >> nth=0 >> .sc-start');
  await sleep(10000);
  await p.click('.slot-card >> nth=0 >> .sc-stop');
  await p.waitForFunction(() => document.querySelectorAll('.slot-card')[0].dataset.state === 'done', null, { timeout: 40000 });
  const v = await p.evaluate(() => { const c = document.querySelectorAll('.slot-card')[0];
    return { verdict: c.querySelector('.verdict').textContent.trim(), items: [...c.querySelectorAll('.sc-verify .ci')].map((r) => r.className.replace('ci ci-', '') + ':' + r.querySelector('.ci-name').textContent + ' ' + r.querySelector('.ci-detail').textContent) }; });
  console.log('錄完驗證：', JSON.stringify(v, null, 1));
}
console.log(errs.length ? 'JS 錯誤：' + errs.join(' / ') : '無 JS 錯誤');
await b.close(); process.exit(0);
