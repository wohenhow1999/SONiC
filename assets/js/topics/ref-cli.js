(function () {
  const C = [
    ['系統', 'show version', '版本、平台、HwSKU、ASIC、Docker 映像'],
    ['系統', 'show platform summary', '平台、HwSKU、ASIC 型號與數量'],
    ['系統', 'show system-health summary | detail', '服務、程序與硬體的整體健康狀態'],
    ['系統', 'show services', '各容器內執行中的程序'],
    ['系統', 'show feature status', 'FEATURE 表中各功能容器的啟用狀態'],
    ['系統', 'show reboot-cause [history]', '上次（與歷史）重開機原因'],
    ['系統', 'show logging [-f] [<process>]', '檢視 syslog'],
    ['系統', 'show techsupport [--since "<time>"]', '收集完整除錯資料到 /var/dump/'],
    ['介面', 'show interfaces status', '所有 port 的 lanes、速率、MTU、FEC、admin/oper 狀態'],
    ['介面', 'show interfaces description', 'port 描述與狀態'],
    ['介面', 'show interfaces counters [-a] [-i <port>]', '收發封包與錯誤計數（讀 COUNTERS_DB）'],
    ['介面', 'show interfaces counters rates', '即時速率'],
    ['介面', 'show interfaces transceiver presence | eeprom [--dom] | status', '光模組資訊'],
    ['介面', 'sudo config interface startup | shutdown <port>', '開啟 / 關閉介面'],
    ['介面', 'sudo config interface speed <port> <speed>', '設定速率'],
    ['介面', 'sudo config interface mtu <port> <mtu>', '設定 MTU'],
    ['介面', 'sudo config interface fec <port> rs|fc|none', '設定 FEC'],
    ['介面', 'sudo config interface breakout <port> <mode>', 'Dynamic port breakout'],
    ['L2', 'show vlan brief | config', 'VLAN 成員與 IP'],
    ['L2', 'sudo config vlan add | del <vid>', '建立 / 刪除 VLAN'],
    ['L2', 'sudo config vlan member add [-u] <vid> <port>', '加入 VLAN 成員（-u 為 untagged）'],
    ['L2', 'show mac [-v <vid>] [-p <port>]', 'FDB 表'],
    ['L2', 'sudo sonic-clear fdb all', '清除動態 MAC'],
    ['L2', 'show interfaces portchannel', 'PortChannel 與成員狀態'],
    ['L2', 'sudo config portchannel add | del <PortChannelN>', '建立 / 刪除 PortChannel'],
    ['L2', 'sudo config portchannel member add | del <pc> <port>', '加入 / 移除成員'],
    ['L2', 'show lldp table | neighbors', 'LLDP 鄰居'],
    ['L3', 'show ip interfaces', 'L3 介面、IP、BGP 鄰居'],
    ['L3', 'sudo config interface ip add | remove <intf> <ip/len>', '設定介面 IP'],
    ['L3', 'show ip route [<prefix>]', 'FRR RIB（vtysh）'],
    ['L3', 'show arp | show ndp', 'IPv4 / IPv6 鄰居'],
    ['L3', 'sudo config route add prefix <p> nexthop <nh>', '新增靜態路由'],
    ['L3', 'show ip bgp summary | neighbors [<ip>]', 'BGP 鄰居狀態'],
    ['L3', 'vtysh -c "<frr command>"', '直接執行 FRR 指令'],
    ['L3', 'sudo route_check.py', '檢查 APPL_DB / ASIC_DB 路由一致性'],
    ['L3', 'show vrf', 'VRF 與成員介面'],
    ['ACL / CoPP', 'show acl table | rule', 'ACL 設定'],
    ['ACL / CoPP', 'aclshow -a', 'ACL 規則命中計數'],
    ['ACL / CoPP', 'sudo acl-loader update full | incremental <file>', '載入 OpenConfig ACL'],
    ['ACL / CoPP', 'show copp configuration', 'CoPP trap 與 policer 設定'],
    ['QoS', 'show queue counters [<port>]', '佇列計數'],
    ['QoS', 'show queue watermark unicast | multicast', '佇列水位'],
    ['QoS', 'show priority-group watermark shared | headroom', 'PG 水位'],
    ['QoS', 'show pfc counters', 'PFC 收送計數'],
    ['QoS', 'pfcwd show config | stats', 'PFC watchdog'],
    ['QoS', 'sudo config qos reload', '依範本重新產生 QoS / Buffer 設定'],
    ['QoS', 'mmuconfig -l', '列出 buffer pool 與 profile'],
    ['Overlay', 'show vxlan tunnel | vlanvnimap | remotevtep', 'VXLAN 設定與遠端 VTEP'],
    ['Overlay', 'show vxlan remotemac all', 'EVPN 學到的遠端 MAC'],
    ['設定', 'sudo config save -y', 'CONFIG_DB 寫回 config_db.json'],
    ['設定', 'sudo config reload -y', '從 config_db.json 重新載入並重啟服務'],
    ['設定', 'sudo config load <file> -y', '合併載入 JSON 設定'],
    ['設定', 'sudo config load_minigraph -y', '由 minigraph.xml 產生設定'],
    ['設定', 'sudo config apply-patch <patch.json>', 'GCU 增量設定'],
    ['設定', 'sudo config checkpoint | rollback <name>', 'GCU checkpoint 與回滾'],
    ['設定', 'show runningconfiguration all | bgp | interfaces', '目前設定'],
    ['資料庫', 'sonic-db-cli <DB> keys "<pattern>"', '列出 key'],
    ['資料庫', 'sonic-db-cli <DB> hgetall "<key>"', '讀取 hash'],
    ['資料庫', 'redis-cli -n <id> …', '直接使用 redis-cli（0 APPL、1 ASIC、2 COUNTERS、4 CONFIG、6 STATE）'],
    ['資料庫', 'sonic-db-dump -n <DB> -y', '以 JSON 匯出整個 DB'],
    ['資料庫', 'dump state <module> <id>', '跨 DB 列出物件相關 key'],
    ['監控', 'counterpoll show | <group> enable | interval <ms>', 'Flex counter 設定'],
    ['監控', 'sonic-clear counters', '清除 show 顯示基準（不影響 DB）'],
    ['監控', 'crm show resources all', 'ASIC 表格資源使用量'],
    ['平台', 'show platform psustatus | fan | temperature | syseeprom', '平台硬體狀態'],
    ['平台', 'show platform pcieinfo -c', 'PCIe 裝置檢查'],
    ['維運', 'sudo sonic-installer list | install <img> | set-default <img> | set-next-boot <img> | remove <img>', '映像管理'],
    ['維運', 'sudo warm-reboot | fast-reboot | reboot', '重開機'],
    ['維運', 'show warm_restart state | config', 'Warm restart 狀態'],
    ['維運', 'swssloglevel -l <level> -c <component>', '動態調整 swss / SAI log 等級'],
    ['維運', 'docker exec -it <container> bash', '進入容器'],
    ['維運', 'sudo systemctl restart <service>', '重啟服務（swss 會連帶 syncd 等）'],
  ];

  S.register({
    id: 'ref-cli',
    category: 'ref',
    order: 2,
    title: 'CLI 指令參考',
    en: 'CLI Reference',
    summary: 'SONiC 常用 show、config、sonic-db-cli 與維運指令，依功能分類並可篩選。指令語法以 sonic-utilities 為準，部分選項依版本而異。',
    meta: [
      ['實作', '<code>sonic-utilities</code>（Python click）：<code>show/</code>、<code>config/</code>、<code>scripts/</code>'],
      ['權限', 'config 類指令需要 root（sudo）'],
      ['說明', ['show <cmd> --help', 'config <cmd> --help']],
    ],
    tags: ['CLI', 'show', 'config', 'sonic-db-cli', 'reference', 'commands'],
    html: `<div id="cli"></div>`,
    searchText: C.map(r => r.join(' ')).join(' '),
    mount(root) {
      const host = root.querySelector('#cli');
      const cats = ['全部', ...new Set(C.map(r => r[0]))];
      let cat = 0, q = '';
      const input = S.el('input', { id: 'cli-filter', class: 'filter', placeholder: '篩選指令或說明，例如 counters、vlan、watermark', style: 'margin:12px 0 8px' });
      const count = S.el('div', { class: 'muted', style: 'font-size:12.5px;margin-bottom:6px' });
      const wrap = S.el('div', { class: 'tbl' });
      input.addEventListener('input', () => { q = input.value.trim().toLowerCase(); draw(); });
      S.seg(host, cats, i => { cat = i; draw(); });
      host.appendChild(input); host.appendChild(count); host.appendChild(wrap);
      function draw() {
        const rows = C.filter(r => (cat === 0 || r[0] === cats[cat]) && (!q || r.join(' ').toLowerCase().includes(q)));
        count.textContent = `${rows.length} / ${C.length} 個指令`;
        wrap.innerHTML = `<table class="wrap"><thead><tr><th style="width:90px">分類</th><th>指令</th><th>說明</th></tr></thead><tbody>${rows.map(r => `<tr><td><span class="badge n">${S.esc(r[0])}</span></td><td><code>${S.esc(r[1])}</code></td><td>${S.esc(r[2])}</td></tr>`).join('')}</tbody></table>`;
      }
      draw();
    },
    related: ['cli-lab', 'troubleshooting', 'ref-configdb'],
    refs: [['SONiC Command Line Reference', 'https://github.com/sonic-net/sonic-utilities/blob/master/doc/Command-Reference.md']],
  });
})();
