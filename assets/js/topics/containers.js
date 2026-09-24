(function () {
  const C = [
    { n: 'database', img: 'docker-database', cat: '核心', d: 'Redis 伺服器，承載 CONFIG_DB、APPL_DB、STATE_DB、ASIC_DB、COUNTERS_DB 等所有資料庫。所有其他容器都依賴它。', p: ['redis-server', 'supervisord'] },
    { n: 'swss', img: 'docker-orchagent', cat: '核心', d: 'Switch State Service。orchagent 與各種 *mgrd、*syncd 都在這裡，是 SONiC 的大腦。', p: ['orchagent', 'portsyncd', 'portmgrd', 'intfmgrd', 'vlanmgrd', 'neighsyncd', 'nbrmgrd', 'vrfmgrd', 'buffermgrd', 'coppmgrd', 'vxlanmgrd', 'tunnelmgrd'] },
    { n: 'syncd', img: 'docker-syncd-<vendor>', cat: '核心', d: '唯一呼叫廠商 SAI 的地方。映像檔依晶片不同（brcm、mlnx、vs…），內含廠商的 libsai 與 SDK。', p: ['syncd', 'dsserve（部分平台）'] },
    { n: 'bgp', img: 'docker-fpm-frr', cat: '協定', d: 'FRRouting 路由套件，加上 SONiC 的 fpmsyncd 與 bgpcfgd。', p: ['bgpd', 'zebra', 'staticd', 'bfdd', 'fpmsyncd', 'bgpcfgd', 'bgpmon'] },
    { n: 'teamd', img: 'docker-teamd', cat: '協定', d: 'Link Aggregation（PortChannel/LAG）。每個 PortChannel 一個 teamd 程序跑 LACP。', p: ['teammgrd', 'teamsyncd', 'teamd（每個 LAG 一個）', 'tlm_teamd'] },
    { n: 'lldp', img: 'docker-lldp', cat: '協定', d: 'LLDP 鄰居發現，結果寫入 APPL_DB 供 show lldp 與 SNMP 使用。', p: ['lldpd', 'lldp_syncd', 'lldpmgrd'] },
    { n: 'radv', img: 'docker-router-advertiser', cat: '協定', d: 'IPv6 Router Advertisement（radvd），常用於伺服器端 IPv6 自動設定。', p: ['radvd'] },
    { n: 'dhcp_relay', img: 'docker-dhcp-relay', cat: '協定', d: 'DHCP / DHCPv6 relay，把伺服器端的 DHCP 請求轉送到 DHCP server。', p: ['dhcrelay', 'dhcp6relay', 'dhcpmon'] },
    { n: 'pmon', img: 'docker-platform-monitor', cat: '平台', d: 'Platform Monitor，監控光模組、電源、風扇、溫度、LED、EEPROM。', p: ['xcvrd', 'psud', 'thermalctld', 'ledd', 'syseepromd', 'pcied', 'chassisd', 'sensord'] },
    { n: 'snmp', img: 'docker-snmp', cat: '管理', d: 'SNMP 代理。snmpd 負責協定，SONiC 的 AgentX 子代理從 Redis 取資料。', p: ['snmpd', 'snmp-subagent'] },
    { n: 'gnmi', img: 'docker-sonic-gnmi', cat: '管理', d: 'gNMI / Streaming Telemetry 伺服器（舊版名為 telemetry 容器），可訂閱 Redis 資料或下設定。', p: ['telemetry / gnmi', 'dialout_client'] },
    { n: 'mgmt-framework', img: 'docker-sonic-mgmt-framework', cat: '管理', d: '以 YANG 為基礎的管理框架，提供 REST API 與 Klish 風格 CLI（sonic-cli）。部分發行版預設不啟用。', p: ['rest_server', 'klish'] },
    { n: 'eventd', img: 'docker-eventd', cat: '管理', d: '結構化事件（structured events）發布，搭配 gNMI 讓外部系統訂閱告警事件。', p: ['eventd', 'rsyslog_plugin'] },
  ];

  S.register({
    id: 'containers',
    category: 'intro',
    order: 3,
    title: 'Docker 容器一覽',
    en: 'Containers & Services',
    summary: "每個功能以獨立容器封裝，由 host 上的 systemd 依相依順序啟動，容器內再由 supervisord 管理程序。本章整理各容器的內容、相依與重啟影響。",
    meta: [["管理者", ["systemd (sonic.target)", "supervisord"]], ["服務腳本", ["/usr/local/bin/<service>.sh", "/lib/systemd/system/<service>.service"]], ["相關指令", ["docker ps", "systemctl status <service>", "docker exec <ctr> supervisorctl status"]], ["原始碼", "<code>sonic-buildimage/dockers/</code>、<code>files/build_templates/</code>"]],
    tags: ['Docker', 'systemd', 'supervisord', '容器'],
    html: `
<h2>systemd 與容器啟動順序</h2>
<p>SONiC 開機後，host 上的 <b>systemd</b> 依相依順序啟動每個容器（<code>database.service</code>、<code>swss.service</code>、<code>syncd.service</code>…）。容器內部再由 <b>supervisord</b> 管理多個程序。點選下圖節點看說明。</p>
<div id="d-ctr"></div>
<div class="callout warn"><div class="ct">重啟 swss 的影響範圍</div>
<p><code>sudo systemctl restart swss</code> 不只會重啟 swss：它的「同伴」<b>syncd</b> 會一起重啟（ASIC 需要重新初始化），相依的 <b>teamd、bgp、radv</b> 等也會被帶著重啟，所以會中斷流量。實際清單寫在 <code>/usr/local/bin/swss.sh</code> 的 PEER / DEPENDENT 變數中，各版本略有不同。</p></div>

<h2>容器目錄</h2>
<p>用分類篩選，點選卡片查看容器內的程序。</p>
<div id="ctr-list"></div>

<h2>操作指令</h2>
<pre><span class="c"># 看所有容器</span>
docker ps
<span class="c"># 進入 swss 容器</span>
docker exec -it swss bash
<span class="c"># 看容器內由 supervisord 管理的程序</span>
docker exec swss supervisorctl status
<span class="c"># 查看服務狀態 / 重啟服務</span>
systemctl status swss
sudo systemctl restart bgp
<span class="c"># 容器記憶體與 CPU 使用率（由 procdockerstatsd 寫進 STATE_DB）</span>
docker stats --no-stream</pre>
`,
    mount(root) {
      S.diagram(root.querySelector('#d-ctr'), {
        title: '服務啟動相依關係（簡化）',
        w: 1000, h: 470,
        groups: [{ x: 20, y: 140, w: 960, h: 310, label: 'Docker 容器', kind: 'container' }],
        nodes: [
          { id: 'systemd', x: 400, y: 20, w: 200, h: 60, label: 'systemd (host)', sub: 'sonic.target', kind: 'kernel', info: '<p>Host 的 init 系統。每個容器都是一個 systemd service（例如 <code>/lib/systemd/system/swss.service</code>），service 內呼叫 <code>/usr/local/bin/swss.sh start</code> 之類的腳本來啟動容器。</p><p>所有服務都掛在 <code>sonic.target</code> 底下。</p>' },
          { id: 'db', x: 400, y: 180, w: 200, h: 56, label: 'database', kind: 'db', info: '<p>第一個啟動。沒有 Redis，其他容器都無法運作。</p>' },
          { id: 'swss', x: 160, y: 290, w: 170, h: 56, label: 'swss', kind: 'container', info: '<p>核心服務。與 syncd 是「同伴（peer）」關係，會一起啟動、一起重啟。</p>' },
          { id: 'syncd', x: 160, y: 380, w: 170, h: 56, label: 'syncd', kind: 'container', info: '<p>ASIC 的唯一操作者。重啟 syncd 代表 ASIC 重新初始化，流量會中斷（warm reboot 例外）。</p>' },
          { id: 'bgp', x: 400, y: 290, w: 150, h: 56, label: 'bgp', kind: 'container', info: '<p>依賴 swss（需要 fpmsyncd 能寫 APPL_DB、orchagent 能處理路由）。swss 重啟時會被一起重啟。</p>' },
          { id: 'teamd', x: 400, y: 380, w: 150, h: 56, label: 'teamd', kind: 'container', info: '<p>LAG 需要 swss 的 PortsOrch 先把埠建立好，所以依賴 swss。</p>' },
          { id: 'radv', x: 580, y: 290, w: 150, h: 56, label: 'radv', kind: 'container', info: '<p>IPv6 RA，依賴 swss。</p>' },
          { id: 'others', x: 760, y: 290, w: 200, h: 146, label: 'lldp / snmp\npmon / gnmi\ndhcp_relay …', kind: 'container', info: '<p>這些容器主要只依賴 database，可以單獨重啟而<b>不影響</b>資料平面轉發。</p>' },
        ],
        edges: [
          { from: 'systemd', to: 'db', label: '先啟動', id: 'sd-db' },
          { from: 'db', to: 'swss', id: 'db-swss' },
          { from: 'swss', to: 'syncd', label: 'peer', bi: true, id: 'swss-syncd' },
          { from: 'swss', to: 'bgp', label: 'dependent', dash: true, id: 'swss-bgp' },
          { from: 'swss', to: 'teamd', dash: true, id: 'swss-teamd' },
          { from: 'db', to: 'radv', dash: true, id: 'db-radv' },
          { from: 'db', to: 'others', id: 'db-o', via: [[860, 208]] },
        ],
      });

      const host = root.querySelector('#ctr-list');
      const list = S.el('div', { class: 'grid c2', style: 'margin-top:12px' });
      const cats = ['全部', '核心', '協定', '平台', '管理'];
      function draw(i) {
        list.innerHTML = '';
        C.filter(c => i === 0 || c.cat === cats[i]).forEach(c => {
          const procs = S.el('div', { class: 'hidden', style: 'margin-top:8px' },
            S.el('div', { class: 'muted', style: 'font-size:13px' }, '容器內主要程序：'),
            S.el('div', { class: 'chips' }, ...c.p.map(p => S.el('span', { class: 'chip', style: 'cursor:default' }, p))));
          const card = S.el('div', { class: 'card', style: 'cursor:pointer' },
            S.el('div', { class: 'row' }, S.el('b', { class: 'mono' }, c.n), S.el('span', { class: 'badge b' }, c.cat), S.el('span', { class: 'muted mono', style: 'font-size:12px;margin-left:auto' }, c.img)),
            S.el('div', { class: 'muted', style: 'font-size:14px;margin-top:6px' }, c.d), procs,
            S.el('div', { class: 'muted', style: 'font-size:12px;margin-top:6px' }, '▸ 點擊展開程序清單'));
          card.addEventListener('click', () => { procs.classList.toggle('hidden'); card.lastChild.textContent = procs.classList.contains('hidden') ? '▸ 點擊展開程序清單' : '▾ 點擊收合'; });
          list.appendChild(card);
        });
      }
      S.seg(host, cats, draw);
      host.appendChild(list);
    },
    keypoints: [
      '每個容器對應一個 systemd service；容器內由 supervisord 管理多個程序。',
      'database 最先啟動；swss 與 syncd 是同伴，會一起重啟。',
      '重啟 swss / syncd 會中斷流量；重啟 lldp、snmp、pmon 通常不影響轉發。',
      'syncd 容器的映像依晶片廠商不同（例如 docker-syncd-brcm、docker-syncd-mlnx、docker-syncd-vs）。',
    ],
    related: ['architecture', 'swss', 'syncd-sai', 'reboot'],
  });
})();
