(function () {
  const G = [
    ['ACL', '網路', 'Access Control List，依封包欄位決定放行或丟棄。資料平面 ACL 在 ASIC TCAM；控制平面 ACL 由 caclmgrd 轉成 iptables。', 'acl'],
    ['APPL_DB', '資料庫', 'Redis DB 0。應用程式產生的期望狀態，orchagent 的主要輸入。', 'redis-db'],
    ['ASIC', '硬體', '交換晶片，以硬體線速轉發封包。', 'overview'],
    ['ASIC_DB', '資料庫', 'Redis DB 1。orchagent 經 sairedis 寫入的 SAI 物件，syncd 據此呼叫 SAI。', 'syncd-sai'],
    ['bgpcfgd', '元件', 'bgp 容器中的 SONiC 程式，把 CONFIG_DB 的 BGP 設定轉成 FRR 設定。', 'routing'],
    ['BGP', '網路', 'Border Gateway Protocol，資料中心網路中 SONiC 最主要的路由協定，由 FRR 的 bgpd 實作。', 'routing'],
    ['Bridge Port', 'SAI', 'SAI 物件，把 port 或 LAG 包成 .1Q bridge 上的橋接埠，才能加入 VLAN。', 'vlan'],
    ['caclmgrd', '元件', 'Control-plane ACL manager，在 host 上把 CTRLPLANE ACL 轉成 iptables 規則。', 'acl'],
    ['CMIS', '平台', 'Common Management Interface Specification，400G 等新一代光模組的管理規範，由 xcvrd 處理。', 'pmon'],
    ['CONFIG_DB', '資料庫', 'Redis DB 4。使用者設定，開機時由 config_db.json 載入。key 以「|」分隔。', 'redis-db'],
    ['config_db.json', '檔案', '/etc/sonic/config_db.json，持久化的設定檔。config save 寫入、開機與 config reload 讀取。', 'config'],
    ['CoPP', '網路', 'Control Plane Policing，決定哪些封包送到 CPU 以及速率上限。', 'copp'],
    ['COUNTERS_DB', '資料庫', 'Redis DB 2。syncd 定期讀回的 ASIC 計數器。', 'counters'],
    ['CRM', '網路', 'Critical Resource Monitoring，監控 ASIC 表格（路由、ACL、鄰居…）使用量，crm show resources all。', 'acl'],
    ['ECMP', '網路', 'Equal-Cost Multi-Path，多個等價 next hop 間依雜湊分擔流量，SAI 中以 NEXT_HOP_GROUP 表示。', 'routing'],
    ['FDB', '網路', 'Forwarding Database，L2 MAC 位址表，由 ASIC 硬體學習。', 'neighbor'],
    ['Flex Counter', '元件', '讓 syncd 週期性輪詢計數器的機制，設定在 FLEX_COUNTER_DB。', 'counters'],
    ['FPM', '網路', 'Forwarding Plane Manager，FRR zebra 對外輸出路由的介面，fpmsyncd 透過它取得路由。', 'routing'],
    ['fpmsyncd', '元件', 'bgp 容器中的 SONiC 程式，接收 zebra 的 FPM 訊息並寫入 APPL_DB ROUTE_TABLE。', 'routing'],
    ['FRR', '元件', 'FRRouting，開源路由套件（bgpd、zebra、staticd、bfdd…），在 SONiC 的 bgp 容器中執行。', 'routing'],
    ['GCU', '工具', 'Generic Config Updater，config apply-patch，用 JSON Patch 加 YANG 驗證做增量設定。', 'config'],
    ['gNMI', '管理', 'gRPC Network Management Interface，SONiC gnmi 容器提供串流遙測與設定。', 'counters'],
    ['hostif', 'SAI', 'Host Interface，讓 ASIC port 在 Linux 出現對應的 netdev（如 Ethernet0），並用於收發 CPU 封包。', 'port'],
    ['hwsku', '平台', 'Hardware SKU，同一硬體平台的不同 port 配置；目錄中有 port_config.ini 等檔案。', 'port'],
    ['kexec', '系統', '從執行中的 kernel 直接載入新 kernel、跳過 BIOS 的機制，用於 fast/warm reboot。', 'reboot'],
    ['LACP', '網路', 'Link Aggregation Control Protocol，由 teamd 執行，協商 PortChannel 成員。', 'lag'],
    ['minigraph', '檔案', '舊式 XML 拓樸設定檔（minigraph.xml），config load_minigraph 會轉成 CONFIG_DB。', 'config'],
    ['neighsyncd', '元件', 'swss 中的程式，監聽 kernel 鄰居（ARP/NDP）事件並寫入 APPL_DB NEIGH_TABLE。', 'neighbor'],
    ['Next Hop', 'SAI', '下一跳物件（IP + 路由器介面），路由指向它；需鄰居 MAC 已解析才能建立。', 'routing'],
    ['ONIE', '系統', 'Open Network Install Environment，白牌交換機內建的 NOS 安裝環境。', 'build'],
    ['orchagent', '元件', 'swss 的核心，由許多 Orch 組成，把 APPL_DB 轉成 SAI 物件寫入 ASIC_DB。', 'swss'],
    ['OID', 'SAI', 'SAI Object ID。SONiC 中分為虛擬 OID（VID，由 sairedis 分配）與真實 OID（RID，由廠商 SAI 分配）。', 'syncd-sai'],
    ['pmon', '元件', 'Platform Monitor 容器：xcvrd、psud、thermalctld、ledd 等，監控週邊硬體。', 'pmon'],
    ['PortChannel', '網路', 'SONiC 中的 LAG 名稱，例如 PortChannel0001。', 'lag'],
    ['portsyncd', '元件', 'swss 中的程式，監聽 netdev 的建立與狀態，寫入 STATE_DB PORT_TABLE。', 'port'],
    ['ProducerStateTable', '元件', 'sonic-swss-common 的類別，以暫存 hash + KEY_SET + PUBLISH 寫入 APPL_DB，搭配 ConsumerStateTable 使用。', 'swss'],
    ['RIF', 'SAI', 'Router Interface，讓 port、LAG 或 VLAN 能參與 L3 路由的 SAI 物件。', 'vlan'],
    ['SAI', 'SAI', 'Switch Abstraction Interface，OCP 制定的交換晶片標準 C API，由廠商提供實作。', 'syncd-sai'],
    ['sairedis', '元件', 'orchagent 連結的「Redis 版 SAI」函式庫，把 SAI 呼叫序列化寫入 ASIC_DB。', 'syncd-sai'],
    ['sairedis.rec', '檔案', '/var/log/swss/sairedis.rec，記錄所有 SAI 操作（c/r/s/g/n…），除錯利器。', 'syncd-sai'],
    ['sonic-cfggen', '工具', '設定工具：載入 JSON/minigraph、印出 CONFIG_DB、用 Jinja2 範本產生服務設定。', 'config'],
    ['sonic-installer', '工具', '管理多個 SONiC 映像：install、list、set-default、set-next-boot、remove。', 'build'],
    ['sonic-vs', '平台', '使用軟體 SAI（saivs）的虛擬交換機版本，可在 KVM / Docker 中執行。', 'build'],
    ['STATE_DB', '資料庫', 'Redis DB 6。各元件回報的實際狀態，例如 netdev 是否就緒、光模組資訊、FDB。key 以「|」分隔。', 'redis-db'],
    ['SubscriberStateTable', '元件', '以 Redis keyspace notification 訂閱 CONFIG_DB / STATE_DB 變更的類別。', 'redis-db'],
    ['SVI', '網路', 'Switch Virtual Interface，VLAN 介面（如 Vlan100）加上 IP，作為該 VLAN 的 L3 閘道。', 'vlan'],
    ['swss', '元件', 'Switch State Service 容器，包含 orchagent 與各種 *mgrd、*syncd。', 'swss'],
    ['syncd', '元件', '唯一呼叫廠商 SAI 的程序，負責 VID↔RID 轉換、計數器輪詢與晶片事件回報。', 'syncd-sai'],
    ['TCAM', '硬體', 'Ternary CAM，ASIC 中用於 ACL 等萬用比對的記憶體，容量有限。', 'acl'],
    ['teamd', '元件', 'libteam 的 daemon，每個 PortChannel 一個，負責 LACP。', 'lag'],
    ['trap', '網路', 'ASIC 把特定封包（BGP、LACP、ARP…）送往 CPU 的機制，由 HOSTIF_TRAP 定義。', 'copp'],
    ['vlanmgrd', '元件', 'swss 中的 *mgrd，把 CONFIG_DB 的 VLAN 設定套用到 Linux Bridge 並寫入 APPL_DB。', 'vlan'],
    ['Warm reboot', '系統', '不重設 ASIC 的重開機方式，資料平面幾乎不中斷。', 'reboot'],
    ['xcvrd', '元件', 'pmon 中負責光模組（transceiver）的 daemon。', 'pmon'],
    ['YANG', '管理', '資料模型語言；sonic-yang-models 描述 CONFIG_DB 結構，用於驗證。', 'config'],
    ['zebra', '元件', 'FRR 的 RIB 管理程式，把路由寫入 kernel 並透過 FPM 輸出。', 'routing'],
  ];

  S.register({
    id: 'glossary',
    category: 'ref',
    order: 1,
    icon: '📖',
    title: '名詞表',
    en: 'Glossary',
    summary: 'SONiC 常見術語、元件與縮寫的快速查詢，可依分類篩選或直接搜尋，點選即可跳到相關主題。',
    tags: ['名詞', '縮寫', '術語'],
    features: ['可搜尋名詞表'],
    html: `<div id="gl"></div>`,
    mount(root) {
      const host = root.querySelector('#gl');
      const cats = ['全部', ...new Set(G.map(g => g[1]))];
      let cat = 0, q = '';
      const input = S.el('input', { class: 'filter', placeholder: '🔍 輸入關鍵字，例如 SAI、DB、LACP…', style: 'width:100%;font-size:15px;padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--panel);color:var(--text);margin:10px 0' });
      const list = S.el('div', { class: 'grid c2' });
      const count = S.el('div', { class: 'muted', style: 'font-size:13px;margin-bottom:8px' });
      input.addEventListener('input', () => { q = input.value.trim().toLowerCase(); draw(); });
      S.seg(host, cats, i => { cat = i; draw(); });
      host.appendChild(input);
      host.appendChild(count);
      host.appendChild(list);
      function draw() {
        const rows = G.filter(g => (cat === 0 || g[1] === cats[cat]) && (!q || (g[0] + g[2]).toLowerCase().includes(q)));
        count.textContent = `共 ${rows.length} 個名詞`;
        list.innerHTML = '';
        rows.forEach(([n, c, d, link]) => {
          const t = S.byId(link);
          list.appendChild(S.el('div', { class: 'card', style: 'box-shadow:none' },
            S.el('div', { class: 'row' }, S.el('b', { class: 'mono', style: 'font-size:15px' }, n), S.el('span', { class: 'badge b' }, c)),
            S.el('div', { style: 'font-size:14px;margin-top:4px' }, d),
            t ? S.el('a', { href: '#/' + link, style: 'font-size:13px' }, `→ ${t.icon} ${t.title}`) : null));
        });
      }
      draw();
    },
    related: ['overview', 'architecture'],
  });
})();
