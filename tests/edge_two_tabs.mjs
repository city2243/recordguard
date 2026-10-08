// 真的 Edge、真的兩個分頁同時錄：A 分頁 440Hz、B 分頁 660Hz，量每個錄音檔裡兩個頻率各有多少
import { chromium } from 'playwright-core';
import { writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath as __f2p } from 'url';
const __ROOT = __f2p(new URL('../', import.meta.url)).replace(/\\/g, '/');
setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 200000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = __ROOT;
const EXE = process.argv[2] === 'chrome' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const mk = (name, hz) => writeFileSync(ROOT + `_t_${name}.html`, `<!doctype html><title>Meet${name}</title><body style="background:#333;color:#fff"><h1>meeting ${name} ${hz}Hz</h1><script>
const ac=new AudioContext(); const o=ac.createOscillator(); const g=ac.createGain(); g.gain.value=0.03; o.frequency.value=${hz}; o.connect(g); g.connect(ac.destination); o.start();
let n=0; setInterval(()=>{document.querySelector('h1').textContent='meeting ${name} ${hz}Hz '+(n++)},200);</script>`);
mk('A', 440); mk('B', 660);

const b = await chromium.launch({ executablePath: EXE, headless: false,
  args: ['--autoplay-policy=no-user-gesture-required', '--auto-select-tab-capture-source-by-title=PICKME'] });
const c = await b.newContext({ viewport: { width: 1200, height: 900 } });
await c.addInitScript(() => { try { localStorage.setItem('meetingRecorder.lang', 'zh'); } catch (e) {} });
const A = await c.newPage(); await A.goto('http://localhost:8801/_t_A.html');
const B = await c.newPage(); await B.goto('http://localhost:8801/_t_B.html');
const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('dialog', (d) => d.accept());
await p.goto('http://localhost:8801/multi.html', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelectorAll('.slot-card').length >= 1); await sleep(800);
await p.evaluate(async () => { const r = await navigator.storage.getDirectory(); try { await r.removeEntry('recordings', { recursive: true }); } catch (e) {} localStorage.removeItem('meetingRecorder.manifest'); });
while ((await p.locator('.slot-card').count()) < 2) await p.click('#btnAddSlot');
await p.fill('.slot-card >> nth=0 >> .sc-name', 'MeetA'); await p.fill('.slot-card >> nth=1 >> .sc-name', 'MeetB');

const pickTo = async (i, tab, other, otherTitle) => {
  await other.evaluate((t) => { document.title = t; }, otherTitle);
  await tab.evaluate(() => { document.title = 'PICKME'; });
  await p.click(`.slot-card >> nth=${i} >> .sc-pick`);
  await p.waitForFunction((i) => ['ready', 'failed'].includes(document.querySelectorAll('.slot-card')[i].dataset.state), i, { timeout: 40000 });
};
await pickTo(0, A, B, 'MeetB');
await A.evaluate(() => { document.title = 'MeetA'; });
await pickTo(1, B, A, 'MeetA');
await B.evaluate(() => { document.title = 'MeetB'; });
console.log('檢查：', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.slot-card')].map((c) => c.dataset.state + ' / ' + [...c.querySelectorAll('.ci')].map((r) => r.querySelector('.ci-name').textContent + ':' + r.className.replace('ci ci-', '')).join(', ')))));
await p.click('.slot-card >> nth=0 >> .sc-start'); await p.click('.slot-card >> nth=1 >> .sc-start');
await sleep(12000);
await p.click('.slot-card >> nth=0 >> .sc-stop'); await p.click('.slot-card >> nth=1 >> .sc-stop');
await p.waitForFunction(() => [...document.querySelectorAll('.slot-card')].every((c) => c.dataset.state === 'done'), null, { timeout: 60000 });

const files = (await p.evaluate(() => JSON.parse(localStorage.getItem('meetingRecorder.manifest') || '[]'))).flatMap((m) => m.files).filter((f) => f.kind === 'audio');
for (const f of files) {
  const r = await p.evaluate(async (opfs) => {
    const root = await navigator.storage.getDirectory(); const dir = await root.getDirectoryHandle('recordings');
    const file = await (await dir.getFileHandle(opfs)).getFile();
    const buf = await new OfflineAudioContext(1, 48000, 48000).decodeAudioData(await file.arrayBuffer());
    const d = buf.getChannelData(0), sr = buf.sampleRate;
    const a = Math.floor(d.length * 0.2), n = Math.floor(d.length * 0.6);
    const goertzel = (hz) => { const k = 2 * Math.cos(2 * Math.PI * hz / sr); let s1 = 0, s2 = 0;
      for (let i = a; i < a + n; i++) { const s0 = d[i] + k * s1 - s2; s2 = s1; s1 = s0; }
      return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2)) / n; };
    return { dur: +buf.duration.toFixed(1), p440: goertzel(440), p660: goertzel(660) };
  }, f.opfs);
  const db = (x) => (20 * Math.log10(x + 1e-12)).toFixed(1);
  console.log(`${f.target}：長 ${r.dur}s｜440Hz(A) ${db(r.p440)} dB｜660Hz(B) ${db(r.p660)} dB｜差 ${(20 * Math.log10((Math.max(r.p440, r.p660) + 1e-12) / (Math.min(r.p440, r.p660) + 1e-12))).toFixed(1)} dB`);
}
console.log(errs.length ? 'JS 錯誤：' + errs.join(' / ') : '無 JS 錯誤');
await b.close();
for (const n of ['A', 'B']) try { unlinkSync(ROOT + `_t_${n}.html`); } catch (e) {}
process.exit(0);
