// 多場版全面情境測試（假的分頁擷取：每次呼叫產生一個獨立的畫面＋不同頻率的聲音）
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://localhost:8801';
const ONLY = process.argv[3] || '';
setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 480000);

// window.__mode 控制下一次分享：'ok' | 'noaudio' | 'silent'；window.__calls 計呼叫次數
const FAKE = `
window.__n = 0; window.__calls = 0; window.__mode = 'ok'; window.__streams = [];
navigator.mediaDevices.getDisplayMedia = async () => {
  window.__calls++;
  await new Promise(r => setTimeout(r, 300));          // 模擬使用者在分享視窗點選的時間
  const k = ++window.__n, mode = window.__mode;
  const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const cx = cv.getContext('2d');
  let t = 0; setInterval(() => { t++; cx.fillStyle = 'hsl(' + ((t * 3 + k * 90) % 360) + ',70%,45%)'; cx.fillRect(0, 0, 1280, 720); }, 33);
  const v = cv.captureStream(15);
  const tracks = [v.getVideoTracks()[0]];
  if (mode !== 'noaudio') {
    window.__ac = window.__ac || new AudioContext(); const ac = window.__ac; ac.resume();
    const dest = ac.createMediaStreamDestination();
    const osc = ac.createOscillator(), g = ac.createGain(); g.gain.value = mode === 'silent' ? 0 : 0.25;
    osc.frequency.value = 200 * k; osc.connect(g); g.connect(dest); osc.start();
    tracks.push(dest.stream.getAudioTracks()[0]);
  }
  const s = new MediaStream(tracks);
  const vt = s.getVideoTracks()[0], orig = vt.getSettings.bind(vt);
  vt.getSettings = () => Object.assign({}, orig(), { displaySurface: 'browser' });
  window.__streams[k] = s;
  return s;
};
// 模擬「分頁被關掉／按了停止共用」：track.stop() 不會觸發 ended，要自己丟事件
window.__endShare = (k) => { for (const tr of window.__streams[k].getTracks()) { tr.stop(); tr.dispatchEvent(new Event('ended')); } };
`;

// 從 OPFS 讀回某個暫存檔，解碼後用過零率估主頻、算峰值與長度
const PROBE = async (opfsName) => {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('recordings');
  const f = await (await dir.getFileHandle(opfsName)).getFile();
  const ac = new OfflineAudioContext(1, 48000, 48000);
  let buf;
  try { buf = await ac.decodeAudioData(await f.arrayBuffer()); } catch (e) { return { size: f.size, err: String(e) }; }
  const d = buf.getChannelData(0);
  let peak = 0, zc = 0;
  const a = Math.floor(d.length * 0.3), b = Math.floor(d.length * 0.7);
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > peak) peak = Math.abs(d[i]);
  for (let i = a + 1; i < b; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) zc++;
  return { size: f.size, dur: +buf.duration.toFixed(1), peak: +peak.toFixed(3), freq: Math.round(zc / 2 / ((b - a) / buf.sampleRate)) };
};

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '   ← ' + JSON.stringify(detail).slice(0, 500))); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
await ctx.addInitScript(() => { try { localStorage.setItem('meetingRecorder.lang', 'zh'); } catch (e) {} });
await ctx.addInitScript(FAKE);
await ctx.route(/^https?:\/\/(?!localhost|city2243|meeting-recorder)/, (r) => r.abort());

async function openPage() {
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(String(e)));
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + '/multi.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('.slot-card').length >= 1);
  await sleep(500);
  return page;
}
const card = (i) => `.slot-card >> nth=${i}`;
const stateOf = (page) => page.evaluate(() => [...document.querySelectorAll('.slot-card')].map((c) => c.dataset.state));
const waitState = (page, i, s, ms = 30000) => page.waitForFunction(([i, s]) => (document.querySelectorAll('.slot-card')[i] || {}).dataset?.state === s, [i, s], { timeout: ms });
async function pick(page, i, mode = 'ok') {
  await page.evaluate((m) => { window.__mode = m; }, mode);
  await page.click(`${card(i)} >> .sc-pick`);
  await page.waitForFunction((i) => ['ready', 'failed'].includes(document.querySelectorAll('.slot-card')[i].dataset.state), i, { timeout: 30000 });
}

/* ────────── A：四場、錯開開始、亂序停止、各錄各的聲音 ────────── */
if (!ONLY || ONLY.includes('A')) {
  const page = await openPage();
  while ((await page.locator('.slot-card').count()) < 4) await page.click('#btnAddSlot');
  const names = ['台積電法說', '內部週會', '客戶訪談', '產業論壇'];
  for (let i = 0; i < 4; i++) await page.fill(`${card(i)} >> .sc-name`, names[i]);
  for (let i = 0; i < 4; i++) await pick(page, i);
  check('A1 四格都通過檢查', (await stateOf(page)).join() === 'ready,ready,ready,ready', await stateOf(page));

  const t = {};
  await page.click(`${card(0)} >> .sc-start`); t[0] = Date.now();
  await page.click(`${card(2)} >> .sc-start`); t[2] = Date.now();
  await sleep(3000);
  check('A2 只開兩場時，另兩格仍是「準備好了」', (await stateOf(page)).join() === 'recording,ready,recording,ready', await stateOf(page));
  await page.click(`${card(1)} >> .sc-start`); t[1] = Date.now();
  await sleep(3000);
  await page.click(`${card(3)} >> .sc-start`); t[3] = Date.now();
  await sleep(4000);
  check('A3 四場同時錄', (await stateOf(page)).join() === 'recording,recording,recording,recording', await stateOf(page));
  check('A4 頂欄寫「錄製中 · 4 場」、全部停止寫 4 場', await page.evaluate(() => /4 場/.test(document.getElementById('statusText').textContent) && /4 場/.test(document.getElementById('btnStopAll').textContent)));
  check('A5 錄製中「移除」按不下去', await page.evaluate(() => [...document.querySelectorAll('.sc-remove')].every((b) => b.disabled)));

  const stopAt = {};
  for (const i of [2, 0]) { await page.click(`${card(i)} >> .sc-stop`); stopAt[i] = Date.now(); await sleep(2500); }
  await waitState(page, 2, 'done'); await waitState(page, 0, 'done');
  check('A6 停兩場後，另兩場仍在錄', (await stateOf(page)).join() === 'done,recording,done,recording', await stateOf(page));
  await sleep(3000);
  for (const i of [3, 1]) { await page.click(`${card(i)} >> .sc-stop`); stopAt[i] = Date.now(); await sleep(1500); }
  await waitState(page, 3, 'done'); await waitState(page, 1, 'done');
  check('A7 四場都完成', (await stateOf(page)).join() === 'done,done,done,done', await stateOf(page));

  const verdicts = await page.evaluate(() => [...document.querySelectorAll('.slot-card .verdict')].map((v) => v.className + '|' + v.textContent.trim()));
  check('A8 四場驗證全部通過', verdicts.length === 4 && verdicts.every((v) => / ok\|/.test(v)), verdicts);

  const man = await page.evaluate(() => JSON.parse(localStorage.getItem('meetingRecorder.manifest') || '[]'));
  const files = man.flatMap((m) => m.files);
  const targets = files.map((f) => f.target);
  check('A9 檔名帶各場名字且不重複', names.every((n) => targets.some((x) => x.includes(n))) && new Set(targets).size === targets.length, targets);

  // 每一場的音訊檔：主頻要是自己那個分頁的頻率（200×k），長度要對得上各自開始～停止
  const audio = files.filter((f) => f.kind === 'audio');
  const probes = [];
  for (const f of audio) probes.push({ target: f.target, ...(await page.evaluate(PROBE, f.opfs)) });
  const order = [0, 1, 2, 3].map((i) => names[i]);
  let isoOk = true, durOk = true; const detail = [];
  for (let i = 0; i < 4; i++) {
    const p = probes.find((x) => x.target.includes(order[i]));
    const want = 200 * (i + 1), wantDur = (stopAt[i] - t[i]) / 1000;
    detail.push({ n: order[i], freq: p && p.freq, want, dur: p && p.dur, wantDur: +wantDur.toFixed(1), peak: p && p.peak });
    if (!p || Math.abs(p.freq - want) > want * 0.08) isoOk = false;
    if (!p || Math.abs(p.dur - wantDur) > 2.5) durOk = false;
  }
  console.log('     各場音訊：', JSON.stringify(detail));
  check('A10 每場只錄到自己分頁的聲音（主頻吻合、沒有混到別場）', isoOk, detail);
  check('A11 每場長度對得上各自的開始～停止（±2.5 秒）', durOk, detail);
  check('A12 頂端沒有殘留警示', await page.evaluate(() => document.getElementById('alertBar').hidden));
  check('A13 沒有 JavaScript 錯誤', page.__errors.length === 0, page.__errors);
  await page.close();
}

/* ────────── B：錄到一半分頁被關掉 → 自動收檔 ────────── */
if (!ONLY || ONLY.includes('B')) {
  const page = await openPage();
  while ((await page.locator('.slot-card').count()) < 2) await page.click('#btnAddSlot');
  await page.fill(`${card(0)} >> .sc-name`, '會被關掉的');
  await page.fill(`${card(1)} >> .sc-name`, '繼續錄的');
  await pick(page, 0); await pick(page, 1);
  await page.click(`${card(0)} >> .sc-start`); await page.click(`${card(1)} >> .sc-start`);
  await sleep(6000);
  const k0 = await page.evaluate(() => window.__n - 1);   // 第一格用的是倒數第二個分享
  await page.evaluate((k) => window.__endShare(k), k0);
  await sleep(800);
  const alertNow = await page.evaluate(() => ({ hidden: document.getElementById('alertBar').hidden, title: document.getElementById('alertTitle').textContent }));
  check('B1 分享中斷馬上跳紅色警示', !alertNow.hidden && /中斷/.test(alertNow.title), alertNow);
  await waitState(page, 0, 'done', 20000).catch(() => {});
  const s = await stateOf(page);
  check('B2 幾秒內自動收檔完成，另一場不受影響', s.join() === 'done,recording', s);
  check('B3 自動收的那場有產出檔案', await page.evaluate(() => document.querySelectorAll('.slot-card')[0].querySelectorAll('.sc-files .fn, .sc-fileline').length >= 2));
  check('B4 收完後頂端警示消失', await page.evaluate(() => document.getElementById('alertBar').hidden));
  await page.click(`${card(1)} >> .sc-stop`); await waitState(page, 1, 'done');
  check('B5 沒有 JavaScript 錯誤', page.__errors.length === 0, page.__errors);
  await page.close();
}

/* ────────── C：準備好了之後分享才被關掉 / 沒帶聲音 / 安靜 / 連點重選 ────────── */
if (!ONLY || ONLY.includes('C')) {
  const page = await openPage();
  while ((await page.locator('.slot-card').count()) < 3) await page.click('#btnAddSlot');
  await pick(page, 0);
  await page.evaluate(() => window.__endShare(window.__n));
  await sleep(500);
  const c1 = await page.evaluate(() => { const c = document.querySelectorAll('.slot-card')[0]; const b = c.querySelector('.sc-start');
    return { state: c.dataset.state, startDisabled: b.disabled, startHidden: b.hidden, checks: c.querySelector('.sc-checks').textContent.slice(0, 80) }; });
  check('C1 準備好之後分享被關：變成未通過、開始鈕變灰、寫出原因', c1.state === 'failed' && c1.startDisabled && !c1.startHidden && /分享已經結束/.test(c1.checks), c1);
  await pick(page, 0);
  check('C2 重新選擇後恢復「準備好了」', (await stateOf(page))[0] === 'ready');

  await pick(page, 1, 'noaudio');
  check('C3 沒帶聲音：未通過', (await stateOf(page))[1] === 'failed');

  await pick(page, 2, 'silent');
  const c4 = await page.evaluate(() => { const c = document.querySelectorAll('.slot-card')[2]; return { state: c.dataset.state, warn: c.querySelectorAll('.ci-warn').length }; });
  check('C4 分頁現在安靜：可以開始但有提醒', c4.state === 'ready' && c4.warn >= 1, c4);

  const before = await page.evaluate(() => window.__calls);
  await page.evaluate(() => { window.__mode = 'ok'; });
  await page.click(`${card(1)} >> .sc-pick`);
  await sleep(600);
  await page.click(`${card(1)} >> .sc-pick`, { force: true, timeout: 2000 }).catch(() => {});
  await page.click(`${card(1)} >> .sc-pick`, { force: true, timeout: 2000 }).catch(() => {});
  await waitState(page, 1, 'ready', 30000).catch(() => {});
  await sleep(1000);
  const calls = (await page.evaluate(() => window.__calls)) - before;
  check('C5 檢查中連點「重新選擇」不會重複開分享、最後是準備好了', calls === 1 && (await stateOf(page))[1] === 'ready', { calls, s: await stateOf(page) });
  check('C6 沒有 JavaScript 錯誤', page.__errors.length === 0, page.__errors);
  await page.close();
}

/* ────────── D：錄製中加一場、全部停止只停在錄的、撞名 ────────── */
if (!ONLY || ONLY.includes('D')) {
  const page = await openPage();
  while ((await page.locator('.slot-card').count()) < 2) await page.click('#btnAddSlot');
  await page.fill(`${card(0)} >> .sc-name`, '同名會議');
  await page.fill(`${card(1)} >> .sc-name`, '同名會議');
  await pick(page, 0); await pick(page, 1);
  await page.click('#btnStartAll');        // 同一秒開始 → 檔名會撞
  await sleep(3000);
  await page.click('#btnAddSlot');
  await page.fill(`${card(2)} >> .sc-name`, '後來才加的');
  await pick(page, 2);
  await page.click(`${card(2)} >> .sc-start`);
  await sleep(3000);
  await page.click('#btnAddSlot');          // 第四格：只選來源、不開始
  await pick(page, 3);
  check('D1 錄製中可以再加一場並各自開始', (await stateOf(page)).join() === 'recording,recording,recording,ready', await stateOf(page));
  await page.click('#btnStopAll');
  await page.waitForFunction(() => [...document.querySelectorAll('.slot-card')].slice(0, 3).every((c) => c.dataset.state === 'done'), null, { timeout: 40000 });
  check('D2 全部停止：在錄的三場完成，沒開始的那格不受影響', (await stateOf(page)).join() === 'done,done,done,ready', await stateOf(page));
  const targets = (await page.evaluate(() => JSON.parse(localStorage.getItem('meetingRecorder.manifest') || '[]'))).flatMap((m) => m.files.map((f) => f.target));
  const same = targets.filter((x) => x.includes('同名會議'));
  check('D3 同一秒開始的同名兩場，檔名不會互相覆蓋', same.length === 4 && new Set(same).size === 4, same);
  // 完成的格子不佔名額：清掉一格後還能再加
  await page.click(`${card(0)} >> .sc-remove`);
  check('D4 「清除這一格」可以清掉完成的格子', (await page.locator('.slot-card').count()) === 3);
  check('D5 沒有 JavaScript 錯誤', page.__errors.length === 0, page.__errors);
  await page.close();
}

/* ────────── E：錄到一半瀏覽器當掉 → 重開頁面救得回來 ────────── */
if (!ONLY || ONLY.includes('E')) {
  let page = await openPage();
  // 先清空暫存，避免前面情境的檔混進來
  await page.evaluate(async () => { const r = await navigator.storage.getDirectory(); try { await r.removeEntry('recordings', { recursive: true }); } catch (e) {} localStorage.removeItem('meetingRecorder.manifest'); });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => document.querySelectorAll('.slot-card').length >= 1); await sleep(500);
  while ((await page.locator('.slot-card').count()) < 2) await page.click('#btnAddSlot');
  await page.fill(`${card(0)} >> .sc-name`, '當機前在錄A');
  await page.fill(`${card(1)} >> .sc-name`, '當機前在錄B');
  await pick(page, 0); await pick(page, 1);
  await page.click(`${card(0)} >> .sc-start`); await page.click(`${card(1)} >> .sc-start`);
  await sleep(8000);
  await page.close({ runBeforeUnload: false });     // 模擬當機：沒有按停止
  await sleep(1500);
  page = await openPage();
  await sleep(1500);
  const rec = await page.evaluate(() => ({ hidden: document.getElementById('recoveryCard').hidden,
    rows: [...document.querySelectorAll('#recoveryList .fn')].map((x) => x.textContent),
    meta: [...document.querySelectorAll('#recoveryList .meta')].map((x) => x.textContent) }));
  console.log('     救援清單：', JSON.stringify(rec));
  check('E1 重開多場頁就看到「上次留下來的錄影檔」', !rec.hidden && rec.rows.length === 4, rec);
  check('E2 清單顯示原本的會議名稱，標「尚未匯出」', rec.rows.filter((x) => /當機前在錄[AB]/.test(x)).length === 4 && rec.meta.every((m) => /尚未匯出/.test(m)), rec);
  const opfs = (await page.evaluate(() => JSON.parse(localStorage.getItem('meetingRecorder.manifest') || '[]'))).flatMap((m) => m.files).filter((f) => f.kind === 'audio');
  const pr = [];
  for (const f of opfs) pr.push(await page.evaluate(PROBE, f.opfs));
  console.log('     當機留下的音訊：', JSON.stringify(pr));
  check('E3 當機留下的音訊檔有內容（≥ 5 秒、有聲音）', pr.length === 2 && pr.every((p) => p.dur >= 5 && p.peak > 0.05), pr);
  check('E4 沒有 JavaScript 錯誤', page.__errors.length === 0, page.__errors);
  await page.close();
}

await browser.close();
const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass} / ${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
