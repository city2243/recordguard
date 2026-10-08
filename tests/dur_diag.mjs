// 診斷：多場錄音少掉的秒數是頭還是尾？
// 假分頁的音量從分享那一刻起線性上升（每秒 +0.01），檔案頭尾的音量就等於「實際開始／結束錄的時間點」
import { chromium } from 'playwright-core';
setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 240000);
const FAKE = `
window.__n = 0; window.__t0 = {};
navigator.mediaDevices.getDisplayMedia = async () => {
  const k = ++window.__n;
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360; const cx = cv.getContext('2d');
  let t = 0; setInterval(() => { t++; cx.fillStyle = 'hsl(' + (t * 5 % 360) + ',70%,45%)'; cx.fillRect(0, 0, 640, 360); }, 33);
  const v = cv.captureStream(15);
  window.__ac = window.__ac || new AudioContext(); const ac = window.__ac; await ac.resume();
  const dest = ac.createMediaStreamDestination();
  const osc = ac.createOscillator(), g = ac.createGain();
  const now = ac.currentTime; g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.9, now + 90);   // 0.01/秒
  osc.frequency.value = 300 * k; osc.connect(g); g.connect(dest); osc.start();
  window.__t0[k] = performance.now();
  const s = new MediaStream([v.getVideoTracks()[0], dest.stream.getAudioTracks()[0]]);
  const vt = s.getVideoTracks()[0], o = vt.getSettings.bind(vt); vt.getSettings = () => Object.assign({}, o(), { displaySurface: 'browser' });
  return s;
};`;
const PROBE = async (opfsName) => {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('recordings');
  const f = await (await dir.getFileHandle(opfsName)).getFile();
  const buf = await new OfflineAudioContext(1, 48000, 48000).decodeAudioData(await f.arrayBuffer());
  const d = buf.getChannelData(0), sr = buf.sampleRate;
  const win = (a) => { let p = 0; for (let i = a; i < Math.min(d.length, a + sr * 0.2); i++) p = Math.max(p, Math.abs(d[i])); return p; };
  return { dur: +buf.duration.toFixed(2), headAmp: +win(0).toFixed(4), tailAmp: +win(Math.max(0, d.length - sr * 0.2)).toFixed(4) };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const c = await b.newContext({ viewport: { width: 1400, height: 1000 } });
await c.addInitScript(() => { try { localStorage.setItem('meetingRecorder.lang', 'zh'); } catch (e) {} });
await c.addInitScript(FAKE);
const p = await c.newPage(); p.on('dialog', (d) => d.accept()); p.on('console', (m) => { if (m.text().startsWith('DIAG')) console.log(m.text()); });
await p.goto('http://localhost:8801/multi.html', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelectorAll('.slot-card').length >= 1); await sleep(500);
await p.evaluate(async () => { const r = await navigator.storage.getDirectory(); try { await r.removeEntry('recordings', { recursive: true }); } catch (e) {} localStorage.removeItem('meetingRecorder.manifest'); });
const N = Number(process.argv[2] || 4);
while ((await p.locator('.slot-card').count()) < N) await p.click('#btnAddSlot');
for (let i = 0; i < N; i++) { await p.fill(`.slot-card >> nth=${i} >> .sc-name`, 'S' + i); await p.click(`.slot-card >> nth=${i} >> .sc-pick`);
  await p.waitForFunction((i) => document.querySelectorAll('.slot-card')[i].dataset.state === 'ready', i, { timeout: 30000 }); }
const nowP = () => p.evaluate(() => performance.now());
const ev = {};
for (let i = 0; i < N; i++) { ev[i] = { start: await nowP() }; await p.click(`.slot-card >> nth=${i} >> .sc-start`); }
await sleep(12000);
for (let i = 0; i < N; i++) { ev[i].stop = await nowP(); await p.click(`.slot-card >> nth=${i} >> .sc-stop`); await sleep(3000); }
await p.waitForFunction((n) => [...document.querySelectorAll('.slot-card')].slice(0, n).every((c) => c.dataset.state === 'done'), N, { timeout: 60000 });
const t0 = await p.evaluate(() => window.__t0);
const man = (await p.evaluate(() => JSON.parse(localStorage.getItem('meetingRecorder.manifest') || '[]'))).flatMap((m) => m.files);
const verdicts = await p.evaluate(() => [...document.querySelectorAll('.slot-card .verdict')].map((v) => v.textContent.trim().slice(0, 6)));
for (let i = 0; i < N; i++) {
  const k = i + 1, base = t0[k];
  const fa = man.find((f) => f.kind === 'audio' && f.target.includes('_S' + i + '_'));
  const fv = man.find((f) => f.kind === 'video' && f.target.includes('_S' + i + '.'));
  const a = await p.evaluate(PROBE, fa.opfs), v = await p.evaluate(PROBE, fv.opfs);
  const clickStart = (ev[i].start - base) / 1000, clickStop = (ev[i].stop - base) / 1000;
  console.log(`S${i}: 按開始@${clickStart.toFixed(1)}s 按停止@${clickStop.toFixed(1)}s 應長 ${(clickStop - clickStart).toFixed(1)}s ｜畫面顯示 ${verdicts[i]}`
    + `｜音訊檔 ${a.dur}s 開頭@${(a.headAmp / 0.01).toFixed(1)}s 結尾@${(a.tailAmp / 0.01).toFixed(1)}s`
    + `｜影片檔 ${v.dur}s 開頭@${(v.headAmp / 0.01).toFixed(1)}s 結尾@${(v.tailAmp / 0.01).toFixed(1)}s`);
}
await b.close(); process.exit(0);
