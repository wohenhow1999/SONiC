# SONiC 百科 📖

一個互動式的 **SONiC（Software for Open Networking in the Cloud）系統架構學習網站**。每個主題都有可點擊的架構圖、逐步資料流動畫、互動元件與小測驗，也提供一台可以輸入真實 SONiC 指令的「虛擬交換機」。

## 特色

- 🗺️ **互動架構圖**：點選任一元件看說明，或按「下一步」逐步觀看資料如何在元件間流動
- 💻 **虛擬交換機終端機**：輸入 `sudo config vlan add 100`、`show ip route`、`sonic-db-cli ASIC_DB keys "*"` 等指令，即時看到 CONFIG_DB → APPL_DB → STATE_DB → ASIC_DB 的變化，以及背後每個 daemon 做了什麼
- 🧪 **主題專屬模擬器**：orchagent 相依性、ECMP 雜湊、LACP 成員狀態、MAC 學習、ACL 規則比對、CoPP 封包路徑、散熱策略、即時計數器、reboot 時間軸、sonic-installer…
- ❓ 每個主題都有重點整理與小測驗，並可追蹤閱讀進度
- 🔍 全文搜尋（按 `/` 快速搜尋）、深色模式、手機版排版

## 主題

| 分類 | 主題 |
|---|---|
| 入門 | SONiC 是什麼？、系統架構總覽、Docker 容器一覽 |
| 核心元件 | Redis 資料庫、SWSS 與 orchagent、syncd 與 SAI |
| 網路功能 | Port 與介面初始化、路由與 BGP（FRR）、VLAN 與 L2 橋接、PortChannel / LAG、ARP 鄰居與 MAC 學習、ACL、CoPP 與 CPU 封包路徑 |
| 平台與維運 | 設定管理、平台監控 pmon、計數器與遙測、Warm / Fast / Cold Reboot、建置與安裝映像 |
| 實驗室 | 虛擬交換機實驗室（8 個闖關任務） |
| 參考 | 名詞表 |

## 使用方式

純靜態網站，不需要建置工具或安裝任何套件：

```bash
# 方法 1：直接用瀏覽器開啟
open index.html

# 方法 2：本機起一個簡單的 HTTP server
python3 -m http.server 8000
# 瀏覽 http://localhost:8000
```

### 部署到 GitHub Pages

到 repo 的 **Settings → Pages**，Source 選 **Deploy from a branch**，選擇分支與 `/ (root)` 即可。repo 根目錄已放了 `.nojekyll`。

## 專案結構

```
index.html                  # 入口，載入所有腳本
assets/css/style.css        # 全站樣式（含深色模式）
assets/js/core.js           # 主題註冊、共用小工具
assets/js/components/
  diagram.js                # 互動架構圖引擎（SVG、節點說明、逐步動畫）
  widgets.js                # 小測驗、分頁、分段按鈕
  sim.js                    # 虛擬 SONiC 交換機模擬器與終端機 UI
assets/js/topics/*.js       # 每個主題一個檔案
assets/js/app.js            # 路由、側邊欄、搜尋、首頁
```

### 新增一個主題

1. 在 `assets/js/topics/` 建立檔案，呼叫 `S.register({...})`：

```js
S.register({
  id: 'my-topic',           // 網址會是 #/my-topic
  category: 'net',          // intro | core | net | ops | lab | ref
  order: 10,
  icon: '✨',
  title: '我的主題',
  en: 'My Topic',
  summary: '一句話摘要',
  tags: ['關鍵字'],
  features: ['首頁卡片上顯示的互動功能'],
  html: `<h2>標題</h2><div id="d1"></div>`,
  mount(root) {
    S.diagram(root.querySelector('#d1'), {
      title: '架構圖', w: 1000, h: 300,
      nodes: [
        { id: 'a', x: 20, y: 100, w: 160, h: 56, label: 'CONFIG_DB', kind: 'db', info: '<p>說明</p>' },
        { id: 'b', x: 300, y: 100, w: 160, h: 56, label: 'orchagent', kind: 'proc' },
      ],
      edges: [{ from: 'a', to: 'b', label: '訂閱' }],
      steps: [{ title: '第一步', text: '…', nodes: ['a', 'b'], edges: ['a>b'] }],
    });
  },
  keypoints: ['重點 1'],
  quiz: [{ q: '問題？', options: ['A', 'B'], answer: 0, explain: '解釋' }],
  related: ['overview'],
});
```

2. 在 `index.html` 加一行 `<script src="assets/js/topics/my-topic.js"></script>`。

節點 `kind` 可用：`container`、`db`、`proc`、`kernel`、`hw`、`ext`、`file`、`cli`。

## 說明

本站是個人學習用的非官方整理，內容以 SONiC 社群公開文件與原始碼為基礎（約 202305 ~ 202411 版本的行為）。虛擬交換機是**教學用的簡化模型**，實際行為請以 [sonic-net 官方 Wiki](https://github.com/sonic-net/SONiC/wiki) 與原始碼為準。
