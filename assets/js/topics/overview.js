S.register({
  id: 'overview',
  category: 'intro',
  order: 1,
  icon: '🌐',
  title: 'SONiC 是什麼？',
  en: 'What is SONiC',
  summary: 'SONiC 是以 Debian Linux 為基礎、跑在白牌交換機上的開源網路作業系統。它把網路功能拆成許多 Docker 容器，彼此透過 Redis 資料庫溝通，再經由 SAI 與各家交換晶片對話。',
  tags: ['入門', 'SAI', '開源', '白牌交換機', 'Disaggregation'],
  features: ['分層架構圖', '傳統 vs SONiC 比較', '發展時間軸'],
  html: `
<h2>一句話理解 SONiC</h2>
<p><b>SONiC（Software for Open Networking in the Cloud）</b>是 Microsoft 在 2016 年為 Azure 資料中心開源的<b>網路作業系統（NOS）</b>，現由 Linux Foundation 旗下的 SONiC 基金會維護。它的核心想法是「<b>硬體與軟體解耦（disaggregation）</b>」：同一套 SONiC 可以跑在 Broadcom、NVIDIA (Mellanox)、Marvell、Intel 等不同交換晶片的機器上。</p>
<div class="grid c3">
  <div class="card"><b>🐧 Linux 為底</b><p class="muted" style="margin:6px 0 0">以 Debian 為基礎，你熟悉的 <code>ip</code>、<code>systemctl</code>、<code>docker</code> 都能用。</p></div>
  <div class="card"><b>📦 容器化</b><p class="muted" style="margin:6px 0 0">每個功能（BGP、LLDP、SWSS…）都跑在獨立 Docker 容器中，可個別重啟與升級。</p></div>
  <div class="card"><b>🗄️ Redis 為中心</b><p class="muted" style="margin:6px 0 0">元件之間不直接呼叫，而是透過 Redis 資料庫的「發布/訂閱」交換狀態。</p></div>
  <div class="card"><b>🔌 SAI 抽象層</b><p class="muted" style="margin:6px 0 0">Switch Abstraction Interface 是統一的 C API，讓上層軟體不用管底下是哪家 ASIC。</p></div>
  <div class="card"><b>🌍 開源社群</b><p class="muted" style="margin:6px 0 0">原始碼在 GitHub 的 <code>sonic-net</code> 組織，大型雲端業者、電信商與設備商共同開發。</p></div>
  <div class="card"><b>🗓️ 版本以年月命名</b><p class="muted" style="margin:6px 0 0">例如 <code>202305</code>、<code>202311</code>、<code>202405</code>，大致每半年一個分支。</p></div>
</div>

<h2>分層架構</h2>
<p>從上到下，SONiC 可以看成下面幾層。點選每一層看它負責什麼，或按「下一步」看一個設定是怎麼從上層一路流到硬體的。</p>
<div id="d-layers"></div>

<h2>傳統網通設備 vs SONiC</h2>
<div id="cmp"></div>

<h2>發展時間軸</h2>
<div id="tl"></div>

<div class="callout tip"><div class="ct">🎯 讀完這個網站，你會懂</div>
<p>設定一條 VLAN 時，資料是如何從 <code>config</code> 指令 → CONFIG_DB → vlanmgrd → APPL_DB → orchagent → ASIC_DB → syncd → SAI → 交換晶片，一路走下去的。這條「資料流」是理解 SONiC 最重要的一把鑰匙。</p></div>
`,
  mount(root) {
    const L = 100, W = 640;
    S.diagram(root.querySelector('#d-layers'), {
      title: 'SONiC 分層架構',
      w: 1000, h: 580,
      nodes: [
        { id: 'mgmt', x: L, y: 20, w: W, h: 48, label: '管理介面：CLI / gNMI / SNMP / REST', kind: 'cli',
          info: '<p>使用者或自動化系統跟交換機互動的入口。</p><ul><li><code>config</code> / <code>show</code> 指令（Python click 撰寫）</li><li>gNMI / Telemetry（gnmi 容器）</li><li>SNMP（snmp 容器）</li><li>REST / Klish CLI（mgmt-framework 容器）</li></ul><p>它們最終大多都是在<b>讀寫 Redis 資料庫</b>。</p>' },
        { id: 'apps', x: L, y: 102, w: W, h: 48, label: '控制平面應用：BGP (FRR) / LLDP / LACP (teamd) / DHCP Relay', kind: 'container',
          info: '<p>跑「網路協定」的容器。例如 <b>bgp</b> 容器中的 FRR 負責跟鄰居交換路由、<b>teamd</b> 跑 LACP、<b>lldp</b> 發現鄰居設備。</p><p>它們把協定算出來的結果（路由、LAG 成員狀態…）寫入 Redis 的 <code>APPL_DB</code>。</p>' },
        { id: 'redis', x: L, y: 184, w: W, h: 48, label: 'Redis 資料庫（database 容器）：CONFIG_DB / APPL_DB / STATE_DB / ASIC_DB …', kind: 'db',
          info: '<p>SONiC 的<b>中樞神經</b>。所有元件都只跟 Redis 溝通，而不互相直接呼叫：</p><ul><li><code>CONFIG_DB</code>：使用者設定</li><li><code>APPL_DB</code>：應用程式想要的狀態</li><li><code>STATE_DB</code>：各元件目前的實際狀態</li><li><code>ASIC_DB</code>：要寫進晶片的 SAI 物件</li><li><code>COUNTERS_DB</code>：流量統計</li></ul><p>👉 詳見「Redis 資料庫」主題。</p>' },
        { id: 'swss', x: L, y: 266, w: W, h: 48, label: 'SWSS：orchagent + 各種 *mgrd / *syncd', kind: 'proc',
          info: '<p><b>Switch State Service</b>，SONiC 的大腦。</p><ul><li><b>*mgrd</b>（vlanmgrd、intfmgrd…）：把 CONFIG_DB 設定套到 Linux kernel，再寫進 APPL_DB</li><li><b>*syncd</b>（portsyncd、neighsyncd、fpmsyncd…）：把 kernel / 協定的狀態同步到 APPL_DB</li><li><b>orchagent</b>：讀 APPL_DB，轉成 SAI 物件寫到 ASIC_DB</li></ul>' },
        { id: 'syncd', x: L, y: 348, w: W, h: 48, label: 'syncd + SAI（廠商提供的 libsai.so）', kind: 'proc',
          info: '<p><b>syncd</b> 讀取 ASIC_DB，呼叫標準 <b>SAI API</b>（例如 <code>create_route_entry()</code>）。</p><p>SAI 的實作（libsai）由晶片廠商提供，內部再呼叫各家私有 SDK。這一層讓 SONiC 能夠「一套軟體、多家硬體」。</p>' },
        { id: 'kernel', x: L, y: 430, w: W, h: 48, label: 'Linux Kernel（Debian）：netdev、bridge、路由表、ARP', kind: 'kernel',
          info: '<p>SONiC 也把每個前面板埠建成 Linux 網路介面（如 <code>Ethernet0</code>），並在 kernel 中維護 VLAN bridge、IP 位址、路由與 ARP。</p><p>這讓 FRR、lldpd 等標準 Linux 程式可以直接收發控制封包，而 ASIC 負責高速轉發資料封包。</p>' },
        { id: 'sdk', x: L, y: 512, w: 300, h: 48, label: '廠商 SDK / Driver', kind: 'hw',
          info: '<p>晶片廠商的私有軟體開發套件與 kernel driver（如 Broadcom 的 SDK、knet driver）。</p><p>負責真正把表項寫入晶片暫存器，以及把 CPU 封包在晶片與 Linux netdev 之間搬運。</p>' },
        { id: 'asic', x: L + 340, y: 512, w: 300, h: 48, label: '交換晶片 ASIC', kind: 'hw',
          info: '<p>負責以線速（每秒數十億個封包）轉發資料的專用晶片，例如 Broadcom Tomahawk / Trident、NVIDIA Spectrum、Marvell Teralynx 等。</p>' },
        { id: 'pmon', x: 800, y: 266, w: 170, h: 130, label: 'pmon\n平台監控', sub: '風扇 / 電源 / 光模組', kind: 'container',
          info: '<p><b>Platform Monitor</b> 容器，透過各廠商實作的 Platform API 監控硬體：光模組（xcvrd）、電源（psud）、溫度與風扇（thermalctld）、LED（ledd）等，並把結果寫入 <code>STATE_DB</code>。</p>' },
        { id: 'plat', x: 800, y: 512, w: 170, h: 48, label: '週邊硬體', sub: 'Fan / PSU / QSFP', kind: 'hw',
          info: '<p>交換機上除了 ASIC 之外的硬體：風扇、電源供應器、溫度感測器、光模組、EEPROM 等。</p>' },
      ],
      edges: [
        { from: 'mgmt', to: 'redis', label: '寫 CONFIG_DB', via: [[60, 44], [60, 208]], id: 'm-r' },
        { from: 'apps', to: 'redis', id: 'a-r' },
        { from: 'redis', to: 'swss', bi: true, id: 'r-s' },
        { from: 'swss', to: 'syncd', label: 'ASIC_DB', id: 's-y' },
        { from: 'swss', to: 'kernel', label: 'netlink', via: [[770, 290], [770, 454]], id: 's-k', dash: true },
        { from: 'syncd', to: 'sdk', label: 'SAI API', via: [[60, 372], [60, 536]], id: 'y-sdk' },
        { from: 'sdk', to: 'asic', id: 'sdk-a' },
        { from: 'pmon', to: 'plat', id: 'p-h' },
        { from: 'pmon', to: 'redis', label: 'STATE_DB', via: [[885, 208]], id: 'p-r' },
      ],
      steps: [
        { title: '使用者下指令', text: '管理者執行 <code>sudo config vlan add 100</code>。CLI 並不直接操作硬體，而是把設定寫進 Redis 的 <code>CONFIG_DB</code>。', nodes: ['mgmt', 'redis'], edges: ['m-r'] },
        { title: 'SWSS 接手', text: 'SWSS 中的 <b>vlanmgrd</b> 訂閱到 CONFIG_DB 的變化，在 Linux kernel 建好 VLAN 介面，並寫入 <code>APPL_DB</code>；接著 <b>orchagent</b> 把它轉成 SAI 物件。', nodes: ['redis', 'swss', 'kernel'], edges: ['r-s', 's-k'] },
        { title: 'syncd 呼叫 SAI', text: 'orchagent 把 SAI 物件寫到 <code>ASIC_DB</code>，<b>syncd</b> 讀到後呼叫 <code>sai_vlan_api->create_vlan()</code>。', nodes: ['swss', 'syncd'], edges: ['s-y'] },
        { title: '寫入晶片', text: '廠商的 SAI 實作呼叫私有 SDK，把 VLAN 表項寫入 ASIC。從此這個 VLAN 的封包由硬體線速轉發。', nodes: ['syncd', 'sdk', 'asic'], edges: ['y-sdk', 'sdk-a'] },
      ],
    });

    // 比較
    const cmp = root.querySelector('#cmp');
    const box = S.el('div', { class: 'w-box' });
    const body = S.el('div');
    const data = [
      { h: '🏢 傳統封閉式設備', rows: [['軟硬體', '同一家廠商綁在一起販售'], ['作業系統', '廠商私有 OS，內部不公開'], ['新功能', '等廠商排程，無法自行修改'], ['自動化', '依賴廠商提供的 CLI / API'], ['更換硬體', '換廠牌 = 換整套操作方式'], ['除錯', '通常要開 case 給原廠']] },
      { h: '🌐 SONiC', rows: [['軟硬體', '白牌/品牌硬體 + 開源 NOS，自由搭配'], ['作業系統', 'Debian Linux，原始碼完全公開'], ['新功能', '可自行開發或採用社群成果'], ['自動化', 'Redis DB、gNMI、JSON 設定檔，容易程式化'], ['更換硬體', '只要有 SAI 實作，同一套 SONiC 照跑'], ['除錯', '可直接看 Redis 與 log、讀原始碼']] },
    ];
    S.seg(box, data.map(d => d.h), i => {
      body.innerHTML = `<table><thead><tr><th>面向</th><th>${data[i].h}</th></tr></thead><tbody>${data[i].rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</tbody></table>`;
    });
    box.appendChild(body);
    cmp.appendChild(box);

    // 時間軸
    const ev = [
      ['2015', 'Microsoft 等廠商在 OCP（開放運算計畫）提出 <b>SAI</b> 標準'],
      ['2016', 'Microsoft 在 OCP 峰會發表並開源 <b>SONiC</b>，用於 Azure 資料中心'],
      ['2017-2019', '越來越多晶片廠與白牌廠加入，功能擴充到 warm reboot、VxLAN、streaming telemetry'],
      ['2020-2021', '支援多 ASIC、Chassis（機框式）架構，更多電信與企業使用'],
      ['2022', 'SONiC 移轉到 <b>Linux Foundation</b>，成立 SONiC 基金會；GitHub 組織改名為 <code>sonic-net</code>'],
      ['2023-至今', 'DPU / SmartSwitch、YANG 設定驗證、更完整的 gNMI 與 AI 資料中心網路功能'],
    ];
    const tl = root.querySelector('#tl');
    const wrap = S.el('div', { class: 'w-box' });
    const detail = S.el('div', { class: 'dg-desc', style: 'margin-top:10px' });
    const bar = S.el('div', { class: 'row' });
    ev.forEach((e, i) => bar.appendChild(S.el('button', { class: 'btn sm', onclick: ev2 => {
      [...bar.children].forEach(b => b.classList.remove('on'));
      ev2.currentTarget.classList.add('on');
      detail.innerHTML = `<div class="st">${e[0]}</div>${e[1]}`;
    } }, e[0])));
    wrap.appendChild(S.el('h4', null, '📅 點選年份'));
    wrap.appendChild(bar);
    wrap.appendChild(detail);
    tl.appendChild(wrap);
    bar.children[1].click();
  },
  keypoints: [
    'SONiC = Debian Linux + Docker 容器 + Redis 資料庫 + SAI 硬體抽象層。',
    '元件之間透過 Redis 發布/訂閱互相溝通，而不是直接呼叫，因此彼此鬆耦合、可個別重啟。',
    'SAI 讓同一套 SONiC 能跑在不同廠牌的交換晶片上，是「軟硬體解耦」的關鍵。',
    '設定的典型流向：CLI → CONFIG_DB → SWSS(*mgrd) → APPL_DB → orchagent → ASIC_DB → syncd → SAI → ASIC。',
  ],
  quiz: [
    { q: 'SONiC 的元件之間主要透過什麼方式交換資料？', options: ['直接 RPC 呼叫', 'Redis 資料庫的發布/訂閱', '共享記憶體', '讀寫 /etc 下的設定檔'], answer: 1, explain: 'SONiC 以 Redis 為中心，元件只讀寫 Redis，因此彼此解耦。' },
    { q: 'SAI 的主要目的為何？', options: ['提供網頁管理介面', '讓上層軟體用統一 API 操作不同廠商的交換晶片', '負責 BGP 選路', '管理 Docker 容器'], answer: 1, explain: 'SAI（Switch Abstraction Interface）是一組標準 C API，由晶片廠商提供實作。' },
    { q: 'SONiC 以哪一個 Linux 發行版為基礎？', options: ['Ubuntu', 'CentOS', 'Debian', 'Alpine'], answer: 2, explain: 'SONiC 的 base image 是 Debian（例如 202405 使用 Debian 12 bookworm）。' },
  ],
  related: ['architecture', 'redis-db', 'syncd-sai'],
  refs: [
    ['SONiC 官方 Wiki（sonic-net/SONiC）', 'https://github.com/sonic-net/SONiC/wiki'],
    ['SONiC Architecture 文件', 'https://github.com/sonic-net/SONiC/wiki/Architecture'],
    ['SAI 規格（opencomputeproject/SAI）', 'https://github.com/opencomputeproject/SAI'],
  ],
});
