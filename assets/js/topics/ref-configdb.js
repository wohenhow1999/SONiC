(function () {
  // [表名, 分類, key 格式, 主要欄位, 主要使用者, 章節]
  const T = [
    ['DEVICE_METADATA', '系統', 'localhost', 'hostname, hwsku, platform, mac, bgp_asn, type, buffer_model, docker_routing_config_mode', 'hostcfgd、bgpcfgd、多數服務', 'config'],
    ['DEVICE_NEIGHBOR', '系統', '<port>', 'name, port（LLDP 期望鄰居）', 'lldpmgrd、snmp', 'containers'],
    ['MGMT_INTERFACE', '系統', 'eth0|<ip/len>', 'gwaddr', 'interfaces-config', 'config'],
    ['MGMT_VRF_CONFIG', '系統', 'vrf_global', 'mgmtVrfEnabled', 'hostcfgd', 'config'],
    ['NTP_SERVER', '系統', '<ip>', 'association_type, iburst, version', 'hostcfgd', 'config'],
    ['SYSLOG_SERVER', '系統', '<ip>', 'source, port, vrf', 'hostcfgd / rsyslog', 'config'],
    ['AAA / TACPLUS / RADIUS', '系統', 'authentication / global / <ip>', 'login, passkey, timeout', 'hostcfgd', 'config'],
    ['FEATURE', '系統', '<feature>', 'state, auto_restart, has_per_asic_scope', 'featured（啟停容器）', 'containers'],
    ['CRM', '系統', 'Config', 'polling_interval, *_threshold_type/high/low', 'CrmOrch', 'troubleshooting'],
    ['PORT', '介面', '<port>', 'alias, lanes, speed, mtu, admin_status, fec, autoneg, description', 'portmgrd、PortsOrch', 'port'],
    ['BREAKOUT_CFG', '介面', '<port>', 'brkout_mode', 'DPB（config interface breakout）', 'port'],
    ['CABLE_LENGTH', '介面', 'AZURE', '<port>: 5m / 40m / 300m', 'buffermgrd', 'qos'],
    ['INTERFACE', 'L3', '<port> 或 <port>|<ip/len>', 'vrf_name, NULL', 'intfmgrd、IntfsOrch', 'routing'],
    ['LOOPBACK_INTERFACE', 'L3', 'Loopback0|<ip/len>', 'NULL', 'intfmgrd', 'routing'],
    ['VLAN', 'L2', 'Vlan<id>', 'vlanid, mtu, admin_status, dhcp_servers', 'vlanmgrd、PortsOrch', 'vlan'],
    ['VLAN_MEMBER', 'L2', 'Vlan<id>|<port>', 'tagging_mode', 'vlanmgrd、PortsOrch', 'vlan'],
    ['VLAN_INTERFACE', 'L3', 'Vlan<id> 或 Vlan<id>|<ip/len>', 'vrf_name, proxy_arp', 'intfmgrd', 'vlan'],
    ['PORTCHANNEL', 'L2', 'PortChannel<n>', 'admin_status, mtu, min_links, fallback, fast_rate, lacp_key', 'teammgrd', 'lag'],
    ['PORTCHANNEL_MEMBER', 'L2', 'PortChannel<n>|<port>', 'NULL', 'teammgrd', 'lag'],
    ['PORTCHANNEL_INTERFACE', 'L3', 'PortChannel<n>|<ip/len>', 'NULL', 'intfmgrd', 'lag'],
    ['VRF', 'L3', 'Vrf<name>', 'vni, fallback', 'vrfmgrd、VRFOrch', 'vxlan'],
    ['STATIC_ROUTE', 'L3', '<prefix> 或 <vrf>|<prefix>', 'nexthop, ifname, distance, blackhole, nexthop-vrf', 'bgpcfgd → staticd', 'routing'],
    ['NEIGH', 'L3', '<intf>|<ip>', 'neigh, family', 'nbrmgrd', 'neighbor'],
    ['BGP_NEIGHBOR', '路由', '<ip> 或 <vrf>|<ip>', 'asn, name, local_addr, holdtime, keepalive, admin_status', 'bgpcfgd', 'routing'],
    ['BGP_PEER_RANGE', '路由', '<name>', 'ip_range, peer_asn, src_address', 'bgpcfgd（dynamic peer）', 'routing'],
    ['BGP_DEVICE_GLOBAL', '路由', 'STATE', 'tsa_enabled', 'bgpcfgd（traffic shift）', 'routing'],
    ['ACL_TABLE', 'ACL', '<name>', 'type (L3/L3V6/MIRROR/CTRLPLANE), stage, ports, services', 'AclOrch、caclmgrd', 'acl'],
    ['ACL_RULE', 'ACL', '<table>|<rule>', 'PRIORITY, PACKET_ACTION, SRC_IP, DST_IP, IP_PROTOCOL, L4_DST_PORT…', 'AclOrch、caclmgrd', 'acl'],
    ['MIRROR_SESSION', 'ACL', '<name>', 'type (ERSPAN/SPAN), src_ip, dst_ip, dst_port, direction', 'MirrorOrch', 'acl'],
    ['COPP_GROUP', 'CoPP', '<group>', 'queue, trap_action, trap_priority, meter_type, mode, cir, cbs, red_action', 'coppmgrd', 'copp'],
    ['COPP_TRAP', 'CoPP', '<name>', 'trap_ids, trap_group, always_enabled', 'coppmgrd', 'copp'],
    ['DSCP_TO_TC_MAP', 'QoS', '<map>', '<dscp>: <tc>', 'QosOrch', 'qos'],
    ['TC_TO_QUEUE_MAP', 'QoS', '<map>', '<tc>: <queue>', 'QosOrch', 'qos'],
    ['TC_TO_PRIORITY_GROUP_MAP', 'QoS', '<map>', '<tc>: <pg>', 'QosOrch', 'qos'],
    ['PORT_QOS_MAP', 'QoS', '<port>', 'dscp_to_tc_map, tc_to_queue_map, tc_to_pg_map, pfc_enable, pfc_to_queue_map', 'QosOrch', 'qos'],
    ['SCHEDULER', 'QoS', '<name>', 'type (DWRR/STRICT), weight, meter_type, pir, pbs', 'QosOrch', 'qos'],
    ['QUEUE', 'QoS', '<port>|<queue>', 'scheduler, wred_profile', 'QosOrch', 'qos'],
    ['WRED_PROFILE', 'QoS', '<name>', 'ecn, wred_green_enable, green_min/max_threshold, green_drop_probability', 'QosOrch', 'qos'],
    ['BUFFER_POOL', 'Buffer', '<pool>', 'type, mode, size, xoff', 'BufferOrch / buffermgrd', 'qos'],
    ['BUFFER_PROFILE', 'Buffer', '<profile>', 'pool, size, xon, xoff, dynamic_th, static_th', 'BufferOrch / buffermgrd', 'qos'],
    ['BUFFER_PG', 'Buffer', '<port>|<pg range>', 'profile', 'BufferOrch / buffermgrd', 'qos'],
    ['BUFFER_QUEUE', 'Buffer', '<port>|<queue range>', 'profile', 'BufferOrch', 'qos'],
    ['PFC_WD', 'QoS', '<port> 或 GLOBAL', 'action, detection_time, restoration_time, POLL_INTERVAL', 'PfcWdOrch', 'qos'],
    ['VXLAN_TUNNEL', 'Overlay', '<vtep>', 'src_ip, dst_ip', 'vxlanmgrd、VxlanOrch', 'vxlan'],
    ['VXLAN_TUNNEL_MAP', 'Overlay', '<vtep>|<map>', 'vlan, vni', 'vxlanmgrd', 'vxlan'],
    ['VXLAN_EVPN_NVO', 'Overlay', '<nvo>', 'source_vtep', 'vxlanmgrd、EvpnNvoOrch', 'vxlan'],
    ['FLEX_COUNTER_TABLE', '監控', 'PORT / QUEUE / PG_WATERMARK / …', 'FLEX_COUNTER_STATUS, POLL_INTERVAL', 'FlexCounterOrch', 'counters'],
    ['SFLOW / SFLOW_SESSION', '監控', 'global / <port>', 'admin_state, sample_rate, agent_id', 'sflowmgrd', 'counters'],
    ['TELEMETRY / GNMI', '監控', 'gnmi', 'port, client_auth, log_level', 'gnmi 容器', 'counters'],
    ['WARM_RESTART', '維運', '<service>', 'bgp_timer, neighsyncd_timer, teamsyncd_timer', 'warm restart 相關程序', 'reboot'],
    ['DHCP_RELAY / VLAN dhcp_servers', '服務', 'Vlan<id>', 'dhcpv6_servers / dhcp_servers', 'dhcp_relay', 'containers'],
  ];

  S.register({
    id: 'ref-configdb',
    category: 'ref',
    order: 1,
    title: 'CONFIG_DB 表格參考',
    en: 'CONFIG_DB Table Reference',
    summary: '常用 CONFIG_DB 表的 key 格式、主要欄位與訂閱者，可依分類篩選或以關鍵字搜尋。完整定義以 sonic-yang-models 與 Configuration 文件為準。',
    meta: [
      ['key 格式', '<code>TABLE|key</code>，多段 key 以 <code>|</code> 串接，例如 <code>VLAN_MEMBER|Vlan100|Ethernet8</code>'],
      ['空值', '沒有欄位的項目以 <code>"NULL": "NULL"</code> 表示'],
      ['查詢', ['sonic-db-cli CONFIG_DB keys "VLAN*"', 'sonic-db-cli CONFIG_DB hgetall "PORT|Ethernet0"', 'show runningconfiguration all']],
      ['Schema', ['sonic-yang-models/yang-models/*.yang']],
    ],
    tags: ['CONFIG_DB', 'schema', 'table', 'reference', 'YANG'],
    html: `<div id="tbl"></div>`,
    searchText: T.map(r => r.join(' ')).join(' '),
    mount(root) {
      const host = root.querySelector('#tbl');
      const cats = ['全部', ...new Set(T.map(r => r[1]))];
      let cat = 0, q = '';
      const input = S.el('input', { id: 'cfgdb-filter', class: 'filter', placeholder: '篩選表名、欄位或程序，例如 vlan、pfc、bgpcfgd', style: 'margin:12px 0 8px' });
      const count = S.el('div', { class: 'muted', style: 'font-size:12.5px;margin-bottom:6px' });
      const wrap = S.el('div', { class: 'tbl' });
      input.addEventListener('input', () => { q = input.value.trim().toLowerCase(); draw(); });
      S.seg(host, cats, i => { cat = i; draw(); });
      host.appendChild(input); host.appendChild(count); host.appendChild(wrap);
      function draw() {
        const rows = T.filter(r => (cat === 0 || r[1] === cats[cat]) && (!q || r.join(' ').toLowerCase().includes(q)));
        count.textContent = `${rows.length} / ${T.length} 張表`;
        wrap.innerHTML = `<table class="wrap"><thead><tr><th>表</th><th>分類</th><th>key</th><th>主要欄位</th><th>主要使用者</th></tr></thead><tbody>${rows.map(r => {
          const t = S.byId(r[5]);
          return `<tr><td><code>${S.esc(r[0])}</code>${t ? `<div style="font-size:11.5px"><a href="#/${t.id}">${S.num(t)} ${S.esc(t.title)}</a></div>` : ''}</td><td><span class="badge n">${S.esc(r[1])}</span></td><td><code>${S.esc(r[2])}</code></td><td style="font-size:12.5px">${S.esc(r[3])}</td><td style="font-size:12.5px">${S.esc(r[4])}</td></tr>`;
        }).join('')}</tbody></table>`;
      }
      draw();
    },
    related: ['redis-db', 'config', 'ref-cli'],
    refs: [['SONiC Configuration（Wiki）', 'https://github.com/sonic-net/SONiC/wiki/Configuration'], ['sonic-yang-models', 'https://github.com/sonic-net/sonic-buildimage/tree/master/src/sonic-yang-models/yang-models']],
  });
})();
