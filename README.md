# SONiC 架構參考

SONiC（Software for Open Networking in the Cloud）系統架構、資料流與維運的參考網站，對象為網路工程師與 SONiC 開發者。每一章包含技術摘要（容器、程序、資料表、原始碼、記錄檔）、可操作的架構圖與逐步資料流，並附可執行 SONiC 指令的模擬環境。

## 內容

| 部分 | 章節 |
|---|---|
| 1 基礎概念 | SONiC 概述、系統架構總覽、Docker 容器一覽 |
| 2 核心架構 | Redis 資料庫、SWSS 與 orchagent、syncd 與 SAI、Management Framework |
| 3 介面與 L2 | Port、VLAN、LAG、鄰居與 MAC、STP / PVST / MSTP、LLDP、Port Mirroring、QinQ 與 L2 擴充 |
| 4 L3 與路由 | 路由架構與 FRR、VRF、IPv6 與 ND、BGP、OSPF、Route-map 與 PBR、ECMP / UCMP / ARS、VRRP、DHCP Relay 與 IP 服務、NAT |
| 5 Overlay 與資料中心 | VXLAN 與 BGP EVPN、MCLAG、Multicast、RoCE、資料中心網路設計 |
| 6 ACL、QoS 與保護 | ACL、CoPP、QoS 與 Buffer、BFD 與 Link State Tracking |
| 7 安全與身分驗證 | AAA / TACACS+ / RADIUS / LDAP 與 RBAC、憑證與 PKI、802.1X / MAB / PoE |
| 8 維運與管理 | 設定管理、ZTP、平台監控、計數器、sFlow、Reboot、建置映像、REST / gNMI、SNMP / Syslog / NTP、PTP / SyncE、系統管理、故障排除 |
| 9 實作 | 模擬操作環境 |
| 附錄 | CONFIG_DB 表格參考、CLI 指令參考、檔案與日誌路徑、原始碼倉庫地圖、名詞表 |

## 功能

- 架構圖：點選元件查看職責與相關資料，或逐步播放資料流
- 3D 模型（three.js）：只用在空間本身有意義的地方。「系統架構總覽」有 SONiC 系統立體模型（主機板與 ASIC、Linux kernel、中央的 Redis 資料庫塔與環繞的容器），「資料中心設計」「VXLAN」「MCLAG」有機櫃、ToR、spine 與纜線的實體模型；「STP」以高度表示到 root 的路徑成本（生成樹吊掛在 root 下方、阻斷埠與重新收斂），「Multicast」有從來源往下的分送樹（IGMP、PIM 共享樹、分岔複製、IGMP snooping、SPT 切換）；「CoPP」「QoS」有交換晶片內部轉發管線的模型（Parser、FDB、LPM / ECMP、ACL TCAM、MMU 佇列、Egress 改寫，以及 CPU 佇列與 policer）；逐步播放時封包在元件間移動、相機跟著移到相關位置。瀏覽器不支援 WebGL 時顯示提示，其餘 2D 圖不受影響
- 模擬環境：輸入 `sudo config vlan add 100`、`show ip route`、`sonic-db-cli ASIC_DB keys "*"` 等指令，即時顯示 CONFIG_DB / APPL_DB / STATE_DB / ASIC_DB 的變化與各元件的處理順序
- 章節內的模擬：orchagent 相依性、ECMP 雜湊、LACP、MAC 學習、ACL 比對、CoPP 路徑、DSCP 分類、VXLAN 封裝與 MTU、散熱策略、計數器、reboot 中斷時間、sonic-installer
- 可篩選的參考表：CONFIG_DB 表格、CLI 指令、檔案路徑、原始碼倉庫
- 全文搜尋（按 `/`）、本頁目錄、淺色 / 深色主題、行動版排版

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
assets/js/topics/*.js       # 每章一個檔案
assets/js/app.js            # 路由、側邊欄、搜尋、首頁
```

### 新增一個主題

1. 在 `assets/js/topics/` 建立檔案，呼叫 `S.register({...})`：

```js
S.register({
  id: 'my-topic',           // 網址會是 #/my-topic
  category: 'net',          // intro | core | net | adv | ops | lab | ref
  meta: [['程序', ['orchagent']], ['原始碼', '<code>sonic-swss/</code>']],
  order: 10,
  title: '我的主題',
  en: 'My Topic',
  summary: '一句話摘要',
  tags: ['關鍵字'],
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
  related: ['overview'],
});
```

2. 在 `index.html` 加一行 `<script src="assets/js/topics/my-topic.js"></script>`。

節點 `kind` 可用：`container`、`db`、`proc`、`kernel`、`hw`、`ext`、`file`、`cli`。

## 說明

本站為非官方整理，內容以 SONiC 社群公開文件與原始碼為基礎（約 202305 ~ 202411 版本的行為）。虛擬交換機是**教學用的簡化模型**，實際行為請以 [sonic-net 官方 Wiki](https://github.com/sonic-net/SONiC/wiki) 與原始碼為準。

## 第三方元件

`assets/vendor/three/`：[three.js](https://threejs.org/) r147（MIT License，見同目錄 LICENSE），含 OrbitControls、RoundedBoxGeometry。
