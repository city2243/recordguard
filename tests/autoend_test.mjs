// 會議結束自動停止並存檔：單場（分頁關掉 / 重接取消 / 靜音）、多場（靜音那場自停、有聲那場繼續）
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { fileURLToPath as __f2p } from 'url';
const __ROOT = __f2p(new URL('../', import.meta.url)).replace(/\\/g, '/');
setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 420000);
const src = readFileSync(new URL('./multi_audit.mjs', import.meta.url), 'utf8');
const FAKE = src.slice(src.indexOf('const FAKE = `') + 14, src.indexOf('`;\n\n// 從 OPFS'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  ← ' + JSON.stringify(d).slice(0, 400))); };
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });

async function single(mode, prefs) {
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addInitScript((pr) => { try { localStorage.setItem('meetingRecorder.lang', 'zh'); localStorage.setItem('meetingRecorder.prefs', JSON.stringify(pr)); } catch (e) {} }, prefs);
  await c.addInitScript(FAKE);
  await c.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const p = await c.newPage(); p.__err = []; p.on('pageerror', (e) => p.__err.push(String(e))); p.on('dialog', (d) => d.accept());
  await p.goto('http://localhost:8801/index.html', { waitUntil: 'domcontentloaded' }); await sleep(1500);
  await p.evaluate((m) => { window.__mode = m; }, mode);
  await p.selectOption('#sourceMode', 'browser');
  await p.click('#btnPreflight');
  await p.waitForFunction(() => !document.getElementById('btnStart').disabled, null, { timeout: 60000 });
  await p.click('#btnStart');
  await p.waitForFunction(() => !document.getElementById('liveCard').hidden, null, { timeout: 20000 });
  return p;
}
const isDone = (p) => p.evaluate(() => !document.getElementById('doneCard').hidden);

// 先確認單場版偏好鍵名
const prefKey = (readFileSync(__ROOT + 'js/app.js', 'utf8').match(/PREF_KEY = '([^']+)'/) || [])[1];
console.log('單場偏好鍵：', prefKey);

/* S1：單場，錄 6 秒後分頁關掉 → 10 秒後自動收檔 */
{
  const p = await single('ok', {});
  await sleep(6000);
  await p.evaluate(() => window.__endShare(window.__n));
  await sleep(2000);
  const mid = await p.evaluate(() => ({ title: document.getElementById('alertTitle')?.textContent, detail: document.getElementById('alertDetail')?.textContent }));
  check('S1a 分享結束馬上提示「10 秒後自動停止並存檔」', /10 秒後自動停止/.test(mid.detail || ''), mid);
  check('S1b 還沒到 10 秒不會停', !(await isDone(p)));
  await p.waitForFunction(() => !document.getElementById('doneCard').hidden, null, { timeout: 25000 }).catch(() => {});
  check('S1c 約 10 秒後自動停止並存檔（出現完成頁）', await isDone(p));
  const log = await p.evaluate(() => [...document.querySelectorAll('#logBox div')].map((d) => d.textContent).filter((t) => /自動停止/.test(t)));
  check('S1d 紀錄寫明是自動停止', log.length > 0, log);
  check('S1e 沒有 JavaScript 錯誤', p.__err.length === 0, p.__err);
  await p.context().close();
}

/* S2 單場靜音 3 分鐘、M 多場一場靜音一場有聲 —— 兩個一起跑 */
const tS = Date.now();
const pS = await single('silent', { [`autoEndQuiet`]: true, endQuietMin: 3 });
const cM = await b.newContext({ viewport: { width: 1280, height: 900 } });
await cM.addInitScript(() => { try { localStorage.setItem('meetingRecorder.lang', 'zh'); localStorage.setItem('meetingRecorder.multiPrefs', JSON.stringify({ autoQuiet: true, quietMin: 3 })); } catch (e) {} });
await cM.addInitScript(FAKE);
await cM.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
const pM = await cM.newPage(); pM.__err = []; pM.on('pageerror', (e) => pM.__err.push(String(e))); pM.on('dialog', (d) => d.accept());
await pM.goto('http://localhost:8801/multi.html', { waitUntil: 'domcontentloaded' });
await pM.waitForFunction(() => document.querySelectorAll('.slot-card').length >= 2); await sleep(800);
check('M0 設定裡看得到「會議結束時自動停止」且預設勾選', await pM.evaluate(() => document.getElementById('optAutoQuiet').checked && document.getElementById('quietMin').value === '3'));
await pM.evaluate(() => { window.__mode = 'silent'; });
await pM.click('.slot-card >> nth=0 >> .sc-pick');
await pM.waitForFunction(() => document.querySelectorAll('.slot-card')[0].dataset.state === 'ready', null, { timeout: 30000 });
await pM.evaluate(() => { window.__mode = 'ok'; });
await pM.click('.slot-card >> nth=1 >> .sc-pick');
await pM.waitForFunction(() => document.querySelectorAll('.slot-card')[1].dataset.state === 'ready', null, { timeout: 30000 });
await pM.click('.slot-card >> nth=0 >> .sc-start'); await pM.click('.slot-card >> nth=1 >> .sc-start');
const tM = Date.now();
await sleep(150000);
check('S2a 單場靜音 2.5 分鐘時還在錄（門檻 3 分鐘）', !(await isDone(pS)));
check('M1 多場靜音那場 2.5 分鐘時還在錄', (await pM.evaluate(() => document.querySelectorAll('.slot-card')[0].dataset.state)) === 'recording');
await pS.waitForFunction(() => !document.getElementById('doneCard').hidden, null, { timeout: 90000 }).catch(() => {});
check(`S2b 單場連續 3 分鐘沒聲音自動停止並存檔（${((Date.now() - tS) / 1000).toFixed(0)} 秒）`, await isDone(pS));
await pM.waitForFunction(() => document.querySelectorAll('.slot-card')[0].dataset.state === 'done', null, { timeout: 90000 }).catch(() => {});
const st = await pM.evaluate(() => [...document.querySelectorAll('.slot-card')].map((c) => c.dataset.state));
check(`M2 多場：靜音那場自動停止（${((Date.now() - tM) / 1000).toFixed(0)} 秒），有聲音那場繼續錄`, st.join() === 'done,recording', st);
check('M3 自動停止的那場有存檔', await pM.evaluate(() => document.querySelectorAll('.slot-card')[0].querySelectorAll('.sc-files .fn, .sc-fileline').length >= 2));
check('M4/S2c 沒有 JavaScript 錯誤', pM.__err.length === 0 && pS.__err.length === 0, [pM.__err, pS.__err]);
await b.close();
console.log(`\n${results.filter(Boolean).length} / ${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
