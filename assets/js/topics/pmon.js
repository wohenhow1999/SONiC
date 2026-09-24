S.register({
  id: 'pmon',
  category: 'ops',
  order: 2,
  icon: '🌡️',
  title: '平台監控 pmon',
  en: 'Platform Monitor',
  summary: 'pmon 容器裡的一群 daemon 透過各廠商實作的 Platform API，監控光模組、電源、風扇、溫度與 LED，並把結果寫入 STATE_DB。',
  tags: ['pmon', 'xcvrd', 'psud', 'thermalctld', 'ledd', 'Platform API', 'sonic_platform'],
  features: ['pmon 架構圖', '溫度與風扇策略模擬'],
  html: `
<h2>架構</h2>
<p>SONiC 把「平台相關」的硬體差異封裝在 <b>Platform API</b>（Python 套件 <code>sonic_platform</code>）中。每家硬體廠商實作 <code>Chassis</code>、<code>Sfp</code>、<code>Psu</code>、<code>Fan</code>、<code>Thermal</code> 等類別；pmon 裡的 daemon 只呼叫標準介面。</p>
<div id="d-pmon"></div>

<h2>各 daemon 的工作</h2>
<table>
<thead><tr><th>daemon</th><th>負責</th><th>寫入 STATE_DB</th><th>相關指令</th></tr></thead>
<tbody>
<tr><td>xcvrd</td><td>光模組插拔偵測、讀取 EEPROM 與 DOM（溫度、光功率）、CMIS 模組初始化</td><td>TRANSCEIVER_INFO / _DOM_SENSOR / _STATUS</td><td><code>show interfaces transceiver eeprom|presence</code></td></tr>
<tr><td>psud</td><td>電源狀態、電壓、功率</td><td>PSU_INFO</td><td><code>show platform psustatus</code></td></tr>
<tr><td>thermalctld</td><td>溫度與風扇監控，執行散熱策略</td><td>TEMPERATURE_INFO / FAN_INFO</td><td><code>show platform temperature</code>、<code>show platform fan</code></td></tr>
<tr><td>ledd</td><td>依 port oper 狀態控制面板 LED</td><td>—（讀 APPL_DB）</td><td>—</td></tr>
<tr><td>syseepromd</td><td>讀系統 EEPROM（序號、MAC、型號）</td><td>EEPROM_INFO</td><td><code>show platform syseeprom</code></td></tr>
<tr><td>pcied</td><td>檢查 PCIe 裝置是否都在</td><td>PCIE_DEVICES</td><td><code>show platform pcieinfo</code></td></tr>
<tr><td>chassisd</td><td>機框式設備的線卡、模組管理</td><td>CHASSIS_*</td><td><code>show chassis modules status</code></td></tr>
</tbody></table>

<h2>互動：散熱策略模擬</h2>
<p>thermalctld 依照平台定義的散熱策略（常見於 <code>thermal_policy.json</code>）調整風扇轉速，並在溫度超過門檻時發出告警。拖動溫度、或讓一顆風扇故障看看。</p>
<div id="thermal"></div>
`,
  mount(root) {
    const D = [['xcvrd', '光模組'], ['psud', '電源'], ['thermalctld', '溫度/風扇'], ['ledd', 'LED'], ['syseepromd', '系統 EEPROM'], ['pcied', 'PCIe']];
    const HW = [['sfp', '光模組 QSFP/OSFP', 'EEPROM / DOM'], ['psu', '電源 PSU', 'PMBus'], ['fan', '風扇', 'CPLD / sysfs'], ['th', '溫度感測器', 'lm-sensors / I2C']];
    const infos = {
      xcvrd: '<p>偵測光模組插拔事件（<code>get_change_event()</code>），讀取 EEPROM 基本資訊與 DOM 即時數據，寫入 STATE_DB 的 TRANSCEIVER_* 表。對 400G CMIS 模組還負責狀態機初始化。</p>',
      psud: '<p>定期呼叫 <code>Psu.get_presence()</code>、<code>get_status()</code>、<code>get_power()</code>，寫入 PSU_INFO，並在異常時記錄 syslog。</p>',
      thermalctld: '<p>讀取所有 Thermal 與 Fan 物件，依散熱策略調整風扇，寫 TEMPERATURE_INFO / FAN_INFO。</p>',
      ledd: '<p>訂閱 APPL_DB PORT_TABLE 的 oper_status，呼叫平台的 LED 控制外掛點亮或熄滅 port LED。</p>',
      syseepromd: '<p>讀取主機板 EEPROM（TLV 格式）中的產品名稱、序號、基礎 MAC 位址等。</p>',
      pcied: '<p>比對 <code>pcie.yaml</code> 中預期的 PCIe 裝置是否都存在，偵測 ASIC 掉卡等嚴重問題。</p>',
    };
    const nodes = [
      { id: 'cli', x: 20, y: 20, w: 170, h: 56, label: 'show platform …', kind: 'cli', info: '<p>show 指令大多直接讀 STATE_DB。</p>' },
      { id: 'state', x: 20, y: 150, w: 170, h: 56, label: 'STATE_DB', kind: 'db', info: '<p>PSU_INFO、FAN_INFO、TEMPERATURE_INFO、TRANSCEIVER_INFO、EEPROM_INFO…</p>' },
      { id: 'appl', x: 20, y: 320, w: 170, h: 56, label: 'APPL_DB', sub: 'PORT_TABLE oper_status', kind: 'db', info: '<p>ledd 依此決定 LED 狀態。</p>' },
      { id: 'api', x: 490, y: 50, w: 190, h: 350, label: 'Platform API', sub: 'sonic_platform 套件\nChassis / Sfp / Psu\nFan / Thermal', kind: 'file', info: '<p>標準介面定義在 <code>sonic-platform-common</code>（<code>sonic_platform_base</code>），各廠商在 <code>platform/&lt;vendor&gt;/…/sonic_platform/</code> 實作。pmon 啟動時載入對應平台的實作。</p>' },
    ];
    D.forEach(([id, sub], i) => nodes.push({ id, x: 260, y: 50 + i * 60, w: 160, h: 46, label: id, sub, kind: 'proc', info: infos[id] }));
    HW.forEach(([id, l, sub], i) => nodes.push({ id, x: 760, y: 50 + i * 90, w: 220, h: 56, label: l, sub, kind: 'hw', info: `<p>${l}：透過 ${sub} 存取。</p>` }));
    const edges = [{ from: 'state', to: 'cli', id: 'rd' }, { from: 'appl', to: 'ledd', id: 'led', dash: true }];
    ['xcvrd', 'psud', 'thermalctld'].forEach(d => edges.push({ from: d, to: 'state', id: d + '>state' }));
    D.forEach(([d]) => edges.push({ from: d, to: 'api', id: d + '>api' }));
    HW.forEach(([h]) => edges.push({ from: 'api', to: h, id: 'api>' + h }));
    S.diagram(root.querySelector('#d-pmon'), {
      title: 'pmon：daemon → Platform API → 硬體',
      w: 1000, h: 430,
      groups: [{ x: 240, y: 20, w: 200, h: 400, label: 'pmon 容器' }],
      nodes, edges,
      steps: [
        { title: '光模組插入', text: '使用者插入一顆 QSFP。xcvrd 透過 <code>Sfp.get_presence()</code> / 插拔事件偵測到。', nodes: ['xcvrd', 'api', 'sfp'], edges: ['xcvrd>api', 'api>sfp'] },
        { title: '讀取 EEPROM', text: 'xcvrd 讀取光模組 EEPROM（廠商、型號、序號）與 DOM，寫入 STATE_DB <code>TRANSCEIVER_INFO|Ethernet0</code>。', nodes: ['xcvrd', 'state'], edges: ['xcvrd>state'] },
        { title: '使用者查詢', text: '<code>show interfaces transceiver eeprom Ethernet0</code> 直接從 STATE_DB 讀出資訊。', nodes: ['state', 'cli'], edges: ['rd'] },
        { title: '溫度升高', text: 'thermalctld 讀取溫度感測器，依策略提高風扇轉速，寫 TEMPERATURE_INFO / FAN_INFO。', nodes: ['thermalctld', 'api', 'th', 'fan', 'state'], edges: ['thermalctld>api', 'api>th', 'api>fan', 'thermalctld>state'] },
      ],
    });

    // 散熱模擬
    const host = root.querySelector('#thermal');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    let temp = 45, fanFail = false;
    const HIGH = 75, CRIT = 85;
    const slider = S.el('input', { type: 'range', min: 20, max: 100, value: temp, style: 'width:100%' });
    const failBtn = S.el('button', { class: 'btn sm' });
    const out = S.el('div');
    box.appendChild(S.el('div', { class: 'row' }, S.el('b', null, 'ASIC 溫度：'), S.el('span', { id: 'tv', class: 'mono' }), failBtn));
    box.appendChild(slider);
    box.appendChild(out);
    function draw() {
      const tv = box.querySelector('#tv');
      tv.textContent = temp + ' °C';
      failBtn.textContent = fanFail ? '🔴 FAN-2 故障（點擊修復）' : '🟢 風扇正常（點擊模擬 FAN-2 故障）';
      failBtn.classList.toggle('on', fanFail);
      let speed = temp <= 40 ? 30 : temp >= 70 ? 100 : Math.round(30 + (temp - 40) * (70 / 30));
      const reasons = [];
      if (fanFail) { speed = 100; reasons.push('有風扇故障 → 策略要求其餘風扇全速運轉'); }
      const lvl = temp >= CRIT ? 'crit' : temp >= HIGH ? 'high' : 'ok';
      const fans = ['FAN-1', 'FAN-2', 'FAN-3', 'FAN-4'].map(f => ({ n: f, ok: !(fanFail && f === 'FAN-2'), sp: fanFail && f === 'FAN-2' ? 0 : speed }));
      out.innerHTML = `
        <div class="grid c3" style="margin-top:10px">${fans.map(f => `<div class="card" style="box-shadow:none;text-align:center"><div style="font-size:26px;display:inline-block;${f.ok && f.sp ? `animation:spin ${Math.max(0.15, 1.6 - f.sp / 70)}s linear infinite` : ''}">🌀</div><div class="mono"><b>${f.n}</b></div><div>${f.ok ? `${f.sp}%` : '<span class="badge r">NOT OK</span>'}</div></div>`).join('')}</div>
        <div class="dg-desc" style="margin-top:10px">${lvl === 'crit' ? '🔥 <b>超過 critical 門檻（' + CRIT + '°C）</b>：記錄 critical 告警，許多平台的策略會在此時關機保護硬體。' : lvl === 'high' ? '⚠️ <b>超過 high 門檻（' + HIGH + '°C）</b>：記錄 warning，<code>show platform temperature</code> 的 Warning 欄位為 True。' : '✅ 溫度正常。'}${reasons.length ? '<br>' + reasons.join('<br>') : ''}</div>
        <pre>$ show platform temperature
Sensor    Temperature    High TH    Low TH    Crit High TH    Crit Low TH    Warning    Timestamp
--------  -------------  ---------  --------  --------------  -------------  ---------  -----------------
ASIC      ${String(temp.toFixed(1)).padEnd(13)}  ${HIGH}.0       N/A       ${CRIT}.0            N/A            ${lvl === 'ok' ? 'False' : 'True '}      20240701 08:00:00

$ sonic-db-cli STATE_DB hgetall "FAN_INFO|FAN-2"
{'presence': 'True', 'status': '${fanFail ? 'False' : 'True'}', 'speed': '${fanFail ? 0 : speed}', 'speed_target': '${speed}', 'direction': 'intake', 'led_status': '${fanFail ? 'red' : 'green'}'}</pre>`;
    }
    slider.addEventListener('input', () => { temp = +slider.value; draw(); });
    failBtn.addEventListener('click', () => { fanFail = !fanFail; draw(); });
    if (!document.getElementById('spin-kf')) document.head.appendChild(S.el('style', { id: 'spin-kf' }, '@keyframes spin{to{transform:rotate(360deg)}}'));
    draw();
  },
  keypoints: [
    'pmon 的 daemon 只呼叫標準的 Platform API；硬體差異由各廠商的 sonic_platform 實作處理。',
    '平台資訊（光模組、PSU、風扇、溫度、EEPROM）都寫在 STATE_DB，show platform 系列指令讀取這裡。',
    'xcvrd 負責光模組；thermalctld 依散熱策略控制風扇並發出溫度告警。',
    'ledd 讀取 APPL_DB 的 oper_status 控制面板 LED。',
  ],
  quiz: [
    { q: '光模組的型號與序號由哪個 daemon 讀取？', options: ['psud', 'xcvrd', 'ledd', 'syncd'], answer: 1, explain: 'xcvrd 讀取光模組 EEPROM，寫入 STATE_DB TRANSCEIVER_INFO。' },
    { q: 'Platform API 的主要目的是？', options: ['控制 ASIC 轉發表', '讓 pmon 以統一介面存取各廠商不同的週邊硬體', '管理 Docker', '執行 BGP'], answer: 1, explain: '各廠商實作 sonic_platform 套件，上層 daemon 不需關心硬體細節。' },
  ],
  related: ['port', 'counters', 'containers'],
  refs: [['sonic-platform-common', 'https://github.com/sonic-net/sonic-platform-common'], ['sonic-platform-daemons', 'https://github.com/sonic-net/sonic-platform-daemons']],
});
