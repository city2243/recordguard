// 打開真的分享視窗（不自動選），用 Windows 截整個螢幕，看音訊開關預設是開還是關
import { chromium } from 'playwright-core';
import { execFileSync } from 'child_process';
import { fileURLToPath as __f2p } from 'url';
const __ROOT = __f2p(new URL('../', import.meta.url)).replace(/\\/g, '/');
setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, 90000);
const which = process.argv[2] || 'edge';
const EXE = which === 'chrome' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = `picker_${which}.png`;
const b = await chromium.launch({ executablePath: EXE, headless: false, args: ['--window-position=0,0', '--window-size=1280,900'] });
const c = await b.newContext({ viewport: null });
await c.addInitScript(() => { try { localStorage.setItem('meetingRecorder.lang', 'zh'); } catch (e) {} });
const meet = await c.newPage(); await meet.goto('http://localhost:8801/terms.html');
const p = await c.newPage();
await p.goto('http://localhost:8801/multi.html', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelectorAll('.slot-card').length >= 1); await p.waitForTimeout(1000);
p.click('.slot-card >> nth=0 >> .sc-pick').catch(() => {});
await p.waitForTimeout(3500);
execFileSync('powershell', ['-NoProfile', '-Command',
  `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $bmp.Save('${OUT}'); "$($b.Width)x$($b.Height)"`], { stdio: 'inherit' });
await b.close(); process.exit(0);
