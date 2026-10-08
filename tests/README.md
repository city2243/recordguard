# 自動測試

用 Playwright 驅動電腦上裝好的 Google Chrome，模擬真的使用流程。
大部分測試用「假的分頁擷取」（畫面＋每一場不同頻率的聲音）代替真的分享視窗，所以不用手動點。

## 準備（第一次）

```
cd tests
npm install
```

需要：Node.js 20 以上、Python 3、`C:/Program Files/Google/Chrome/Application/chrome.exe`。

## 跑法

先在 `tests` 資料夾開一個不快取的本機伺服器（另開一個視窗，跑著不要關）：

```
python nocache_server.py 8801 ..
```

再跑想跑的測試：

| 檔案 | 測什麼 | 約多久 |
|---|---|---|
| `multi_audit.mjs` | 多場版主測試：四場錯開開始、亂序停止、每場只錄到自己的聲音、分頁被關自動收檔、沒帶聲音／安靜分頁、連點重選、錄製中加一場、全部停止、同名不覆蓋、當機後救回（33 項） | 6 分鐘 |
| `multi_en_test.mjs` | 多場版英文模式完整流程、錄影中中英切換、報告檔全英文（13 項） | 1 分鐘 |
| `multi_audit_en.mjs` | 多場版新畫面（未通過、分享中斷、救援清單）英文有沒有漏翻 | 1 分鐘 |
| `sweep_en.mjs` | 五個頁面英文模式漏翻掃描 | 1 分鐘 |
| `autoend_test.mjs` | 會議結束自動停止並存檔：分頁關掉、連續 3 分鐘沒聲音（單場＋多場） | 5 分鐘 |
| `reattach_test.mjs` | 單場版分享中斷後「重新接上畫面」：取消時重新倒數、成功時接成第 2 段 | 1 分鐘 |
| `dict_hang.mjs` | 英文翻譯表載入卡住／連線被重設時會不會重試成功 | 1 分鐘 |
| `compat_shot.mjs` | 假裝成 Firefox／Safari／手機／Mac，看最上方的瀏覽器說明 | 30 秒 |
| `dur_diag.mjs` | 每場錄音實際開始／結束時間（音量隨時間線性上升，從檔案頭尾推回時間點） | 2 分鐘 |
| `real_tab.mjs` | **真的**分頁擷取（不是模擬）。加 `headed` 參數會開出真的 Chrome 視窗並發出很小的測試音 | 1 分鐘 |
| `edge_two_tabs.mjs` | **真的** Edge 兩個分頁同時錄，量每個檔裡另一場的聲音有沒有混進來（加 `chrome` 參數改用 Chrome） | 1 分鐘 |
| `picker_shot.mjs` | 打開真的分享視窗並截整個螢幕（看音訊開關預設狀態）；會開出瀏覽器視窗 | 30 秒 |

例：

```
node multi_audit.mjs
node real_tab.mjs headed
node multi_audit.mjs https://city2243.github.io/meeting-recorder
```

`multi_audit.mjs` 第一個參數可以換成線上網址，直接測已上線的版本。

## 已知限制

- 「錄影頁在背景」沒辦法用 Playwright 模擬（它會把頁面一直當成看得到）。
- Playwright 內建的 Firefox／Chromium 在有防毒軟體攔截的電腦上可能開不起來（`spawn UNKNOWN`），所以這裡一律用本機安裝的 Chrome／Edge。
- Windows 版 WebKit 拿掉了影音功能，不能代表真的 Safari。
