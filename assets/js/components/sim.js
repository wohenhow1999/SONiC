/* =========================================================
   虛擬 SONiC 交換機（教學用簡化模型）
   - 使用者指令只會修改 CONFIG_DB
   - APPL_DB / STATE_DB / ASIC_DB 由「模擬的 daemon」依 CONFIG_DB 推導
   - 每個指令結束後比對各 DB 差異，自動產生「背後發生了什麼」追蹤
   ========================================================= */
(function () {
  const LINKED = new Set(['Ethernet0', 'Ethernet4', 'Ethernet8', 'Ethernet12']); // 有接線的埠
  const SW = 'oid:0x21000000000000';
  const VR = 'oid:0x3000000000022';
  const CPU = 'oid:0x1000000000001';
  const SYS_MAC = '52:54:00:ab:cd:01';
  const DB_NUM = { 0: 'APPL_DB', 1: 'ASIC_DB', 2: 'COUNTERS_DB', 4: 'CONFIG_DB', 6: 'STATE_DB' };
  const OBJ_TYPE = { PORT: 0x1, LAG: 0x2, NEXT_HOP: 0x4, ROUTER_INTERFACE: 0x6, HOSTIF: 0xd, LAG_MEMBER: 0x1b, VLAN: 0x26, VLAN_MEMBER: 0x27, BRIDGE_PORT: 0x3a };

  const clone = o => JSON.parse(JSON.stringify(o));
  const NUL = () => ({ NULL: 'NULL' });

  /* ---------- IPv4 小工具 ---------- */
  function ip2n(s) {
    const p = s.split('.').map(Number);
    if (p.length !== 4 || p.some(x => !Number.isInteger(x) || x < 0 || x > 255)) return null;
    return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
  }
  const n2ip = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  function parsePrefix(s) {
    const m = /^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/.exec(s || '');
    if (!m) return null;
    const ip = ip2n(m[1]), len = +m[2];
    if (ip == null || len < 0 || len > 32) return null;
    const mask = len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0;
    return { ip, len, mask, net: (ip & mask) >>> 0, str: s, netStr: n2ip((ip & mask) >>> 0) + '/' + len, ipStr: m[1] };
  }
  const inPrefix = (ipn, p) => ((ipn & p.mask) >>> 0) === p.net;
  function fakeMac(seed) {
    let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const b = [(h >>> 16) & 255, (h >>> 8) & 255, h & 255].map(x => x.toString(16).padStart(2, '0'));
    return '0c:42:a1:' + b.join(':');
  }

  function defaultCfg() {
    const cfg = {
      DEVICE_METADATA: { localhost: { hostname: 'sonic', hwsku: 'Force10-S6000', platform: 'x86_64-kvm_x86_64-r0', mac: SYS_MAC, bgp_asn: '65100', type: 'LeafRouter' } },
      PORT: {}, INTERFACE: {}, LOOPBACK_INTERFACE: {}, VLAN: {}, VLAN_MEMBER: {}, VLAN_INTERFACE: {},
      PORTCHANNEL: {}, PORTCHANNEL_MEMBER: {}, PORTCHANNEL_INTERFACE: {}, STATIC_ROUTE: {},
    };
    for (let i = 0; i < 8; i++) {
      const n = 'Ethernet' + i * 4;
      const l = 25 + i * 4;
      cfg.PORT[n] = { alias: 'fortyGigE0/' + i * 4, lanes: [l, l + 1, l + 2, l + 3].join(','), speed: '40000', mtu: '9100', admin_status: i < 2 ? 'up' : 'down' };
    }
    cfg.INTERFACE['Ethernet0'] = NUL();
    cfg.INTERFACE['Ethernet0|10.0.0.0/31'] = NUL();
    cfg.LOOPBACK_INTERFACE['Loopback0'] = NUL();
    cfg.LOOPBACK_INTERFACE['Loopback0|10.1.0.1/32'] = NUL();
    return cfg;
  }

  class SwitchSim {
    constructor() {
      this.oids = new Map();
      this.oidCnt = { };
      this.cfg = defaultCfg();
      this.saved = clone(this.cfg);
      // 預先為實體埠配置 OID，讓編號穩定
      Object.keys(this.cfg.PORT).forEach(p => this.oid('PORT', p));
      Object.keys(this.cfg.PORT).forEach(p => this.oid('HOSTIF', p));
    }

    oid(type, key) {
      const k = type + '/' + key;
      if (!this.oids.has(k)) {
        const t = OBJ_TYPE[type];
        this.oidCnt[type] = (this.oidCnt[type] || (type === 'PORT' ? 1 : 0x600 + t * 3)) + 1;
        this.oids.set(k, 'oid:0x' + t.toString(16) + this.oidCnt[type].toString(16).padStart(12, '0'));
      }
      return this.oids.get(k);
    }

    /* ---------- 狀態查詢 ---------- */
    portOper(p) { const c = this.cfg.PORT[p]; return c && c.admin_status === 'up' && LINKED.has(p) ? 'up' : 'down'; }
    lagOf(p) { const k = Object.keys(this.cfg.PORTCHANNEL_MEMBER).find(k => k.split('|')[1] === p); return k ? k.split('|')[0] : null; }
    vlansOf(p) { return Object.keys(this.cfg.VLAN_MEMBER).filter(k => k.split('|')[1] === p).map(k => k.split('|')[0]); }
    lagMembers(pc) { return Object.keys(this.cfg.PORTCHANNEL_MEMBER).filter(k => k.startsWith(pc + '|')).map(k => k.split('|')[1]); }
    vlanMembers(v) { return Object.keys(this.cfg.VLAN_MEMBER).filter(k => k.startsWith(v + '|')).map(k => k.split('|')[1]); }
    lagOper(pc) {
      const c = this.cfg.PORTCHANNEL[pc];
      return c && c.admin_status === 'up' && this.lagMembers(pc).some(m => this.portOper(m) === 'up') ? 'up' : 'down';
    }
    ifOper(name) {
      if (name.startsWith('Ethernet')) return this.portOper(name);
      if (name.startsWith('PortChannel')) return this.lagOper(name);
      if (name.startsWith('Vlan')) return this.vlanMembers(name).some(m => this.ifOper(m) === 'up') ? 'up' : 'down';
      return 'up';
    }
    intfTable(name) {
      if (name.startsWith('Ethernet')) return 'INTERFACE';
      if (name.startsWith('Vlan')) return 'VLAN_INTERFACE';
      if (name.startsWith('PortChannel')) return 'PORTCHANNEL_INTERFACE';
      if (name.startsWith('Loopback')) return 'LOOPBACK_INTERFACE';
      return null;
    }
    /* 所有 L3 位址：[{ifname, prefix}] */
    l3Addrs() {
      const out = [];
      ['INTERFACE', 'VLAN_INTERFACE', 'PORTCHANNEL_INTERFACE', 'LOOPBACK_INTERFACE'].forEach(t => {
        Object.keys(this.cfg[t]).forEach(k => {
          const [ifn, pfx] = k.split('|');
          if (pfx) out.push({ ifname: ifn, prefix: parsePrefix(pfx) });
        });
      });
      return out.filter(a => a.prefix);
    }
    l3Intfs() {
      const out = [];
      ['INTERFACE', 'VLAN_INTERFACE', 'PORTCHANNEL_INTERFACE'].forEach(t => Object.keys(this.cfg[t]).forEach(k => { if (!k.includes('|')) out.push(k); }));
      return out;
    }
    neighbors() {
      // 簡化：/31 點對點介面上若 oper up，就假設對端已回應 ARP
      const out = [];
      this.l3Addrs().forEach(a => {
        if (a.prefix.len === 31 && !a.ifname.startsWith('Loopback') && this.ifOper(a.ifname) === 'up') {
          const peer = a.prefix.ip ^ 1;
          out.push({ ip: n2ip(peer), ifname: a.ifname, mac: fakeMac(a.ifname + n2ip(peer)) });
        }
      });
      return out;
    }
    /* zebra 選路：next hop 需落在 oper up 的直連網段 */
    routes() {
      const conn = this.l3Addrs().filter(a => !a.ifname.startsWith('Loopback') && this.ifOper(a.ifname) === 'up');
      const neigh = this.neighbors();
      return Object.entries(this.cfg.STATIC_ROUTE).map(([pfx, f]) => {
        const nh = ip2n(f.nexthop);
        const c = conn.find(a => inPrefix(nh, a.prefix));
        const n = neigh.find(x => x.ip === f.nexthop);
        return { prefix: pfx, nexthop: f.nexthop, ifname: c ? c.ifname : null, installed: !!c, resolved: !!(c && n) };
      });
    }

    /* ---------- 推導各 DB ---------- */
    dump() {
      const cfg = this.cfg;
      const C = {}, A = {}, T = {}, X = {};
      for (const [t, rows] of Object.entries(cfg)) for (const [k, v] of Object.entries(rows)) C[t + '|' + k] = Object.assign({}, v);

      // APPL_DB
      const ports = Object.keys(cfg.PORT);
      ports.forEach(p => {
        const c = cfg.PORT[p];
        A['PORT_TABLE:' + p] = { alias: c.alias, lanes: c.lanes, speed: c.speed, mtu: c.mtu, admin_status: c.admin_status, oper_status: this.portOper(p) };
        T['PORT_TABLE|' + p] = { state: 'ok', netdev_oper_status: this.portOper(p) };
      });
      A['PORT_TABLE:PortConfigDone'] = { count: String(ports.length) };
      A['PORT_TABLE:PortInitDone'] = { lanes: '0' };
      Object.keys(cfg.VLAN).forEach(v => {
        A['VLAN_TABLE:' + v] = { admin_status: 'up', mtu: '9100', mac: SYS_MAC };
        T['VLAN_TABLE|' + v] = { state: 'ok' };
      });
      Object.entries(cfg.VLAN_MEMBER).forEach(([k, f]) => {
        A['VLAN_MEMBER_TABLE:' + k.replace('|', ':')] = { tagging_mode: f.tagging_mode };
        T['VLAN_MEMBER_TABLE|' + k] = { state: 'ok' };
      });
      Object.entries(cfg.PORTCHANNEL).forEach(([pc, f]) => {
        A['LAG_TABLE:' + pc] = { admin_status: f.admin_status, mtu: f.mtu, oper_status: this.lagOper(pc) };
        T['LAG_TABLE|' + pc] = { state: 'ok' };
      });
      Object.keys(cfg.PORTCHANNEL_MEMBER).forEach(k => {
        const [pc, m] = k.split('|');
        A['LAG_MEMBER_TABLE:' + pc + ':' + m] = { status: this.portOper(m) === 'up' && cfg.PORTCHANNEL[pc].admin_status === 'up' ? 'enabled' : 'disabled' };
      });
      ['INTERFACE', 'VLAN_INTERFACE', 'PORTCHANNEL_INTERFACE', 'LOOPBACK_INTERFACE'].forEach(t => {
        Object.keys(cfg[t]).forEach(k => {
          const [ifn, pfx] = k.split('|');
          if (pfx) {
            A['INTF_TABLE:' + ifn + ':' + pfx] = { scope: 'global', family: 'IPv4' };
            T['INTERFACE_TABLE|' + ifn + '|' + pfx] = { state: 'ok' };
          } else {
            A['INTF_TABLE:' + ifn] = NUL();
          }
        });
      });
      this.neighbors().forEach(n => { A['NEIGH_TABLE:' + n.ifname + ':' + n.ip] = { neigh: n.mac, family: 'IPv4' }; });
      this.routes().forEach(r => { if (r.installed) A['ROUTE_TABLE:' + r.prefix] = { nexthop: r.nexthop, ifname: r.ifname, protocol: 'static' }; });

      // ASIC_DB
      const AS = 'ASIC_STATE:SAI_OBJECT_TYPE_';
      X[AS + 'SWITCH:' + SW] = { SAI_SWITCH_ATTR_INIT_SWITCH: 'true', SAI_SWITCH_ATTR_SRC_MAC_ADDRESS: SYS_MAC.toUpperCase() };
      ports.forEach(p => {
        const c = cfg.PORT[p];
        X[AS + 'PORT:' + this.oid('PORT', p)] = { SAI_PORT_ATTR_ADMIN_STATE: String(c.admin_status === 'up'), SAI_PORT_ATTR_MTU: String(+c.mtu + 22), SAI_PORT_ATTR_SPEED: c.speed };
        X[AS + 'HOSTIF:' + this.oid('HOSTIF', p)] = { SAI_HOSTIF_ATTR_TYPE: 'SAI_HOSTIF_TYPE_NETDEV', SAI_HOSTIF_ATTR_OBJ_ID: this.oid('PORT', p), SAI_HOSTIF_ATTR_NAME: p, SAI_HOSTIF_ATTR_OPER_STATUS: String(this.portOper(p) === 'up') };
      });
      Object.keys(cfg.PORTCHANNEL).forEach(pc => {
        X[AS + 'LAG:' + this.oid('LAG', pc)] = NUL();
        this.lagMembers(pc).forEach(m => {
          if (A['LAG_MEMBER_TABLE:' + pc + ':' + m].status === 'enabled')
            X[AS + 'LAG_MEMBER:' + this.oid('LAG_MEMBER', pc + '|' + m)] = { SAI_LAG_MEMBER_ATTR_LAG_ID: this.oid('LAG', pc), SAI_LAG_MEMBER_ATTR_PORT_ID: this.oid('PORT', m) };
        });
      });
      Object.entries(cfg.VLAN).forEach(([v, f]) => { X[AS + 'VLAN:' + this.oid('VLAN', v)] = { SAI_VLAN_ATTR_VLAN_ID: f.vlanid }; });
      const bridged = new Set(Object.keys(cfg.VLAN_MEMBER).map(k => k.split('|')[1]));
      bridged.forEach(p => {
        X[AS + 'BRIDGE_PORT:' + this.oid('BRIDGE_PORT', p)] = {
          SAI_BRIDGE_PORT_ATTR_TYPE: 'SAI_BRIDGE_PORT_TYPE_PORT',
          SAI_BRIDGE_PORT_ATTR_PORT_ID: p.startsWith('PortChannel') ? this.oid('LAG', p) : this.oid('PORT', p),
          SAI_BRIDGE_PORT_ATTR_ADMIN_STATE: 'true',
        };
      });
      Object.entries(cfg.VLAN_MEMBER).forEach(([k, f]) => {
        const [v, p] = k.split('|');
        X[AS + 'VLAN_MEMBER:' + this.oid('VLAN_MEMBER', k)] = {
          SAI_VLAN_MEMBER_ATTR_VLAN_ID: this.oid('VLAN', v),
          SAI_VLAN_MEMBER_ATTR_BRIDGE_PORT_ID: this.oid('BRIDGE_PORT', p),
          SAI_VLAN_MEMBER_ATTR_VLAN_TAGGING_MODE: f.tagging_mode === 'untagged' ? 'SAI_VLAN_TAGGING_MODE_UNTAGGED' : 'SAI_VLAN_TAGGING_MODE_TAGGED',
        };
      });
      const rif = {};
      this.l3Intfs().forEach(ifn => {
        const o = this.oid('ROUTER_INTERFACE', ifn);
        rif[ifn] = o;
        const f = { SAI_ROUTER_INTERFACE_ATTR_VIRTUAL_ROUTER_ID: VR, SAI_ROUTER_INTERFACE_ATTR_SRC_MAC_ADDRESS: SYS_MAC.toUpperCase() };
        if (ifn.startsWith('Vlan')) { f.SAI_ROUTER_INTERFACE_ATTR_TYPE = 'SAI_ROUTER_INTERFACE_TYPE_VLAN'; f.SAI_ROUTER_INTERFACE_ATTR_VLAN_ID = this.oid('VLAN', ifn); }
        else { f.SAI_ROUTER_INTERFACE_ATTR_TYPE = 'SAI_ROUTER_INTERFACE_TYPE_PORT'; f.SAI_ROUTER_INTERFACE_ATTR_PORT_ID = ifn.startsWith('PortChannel') ? this.oid('LAG', ifn) : this.oid('PORT', ifn); }
        f.SAI_ROUTER_INTERFACE_ATTR_MTU = '9100';
        X[AS + 'ROUTER_INTERFACE:' + o] = f;
      });
      const rkey = d => AS + 'ROUTE_ENTRY:' + JSON.stringify({ dest: d, switch_id: SW, vr: VR });
      this.l3Addrs().forEach(a => {
        X[rkey(a.prefix.ipStr + '/32')] = { SAI_ROUTE_ENTRY_ATTR_PACKET_ACTION: 'SAI_PACKET_ACTION_FORWARD', SAI_ROUTE_ENTRY_ATTR_NEXT_HOP_ID: CPU };
        if (rif[a.ifname] && a.prefix.len < 32) X[rkey(a.prefix.netStr)] = { SAI_ROUTE_ENTRY_ATTR_NEXT_HOP_ID: rif[a.ifname] };
      });
      const nhs = {};
      this.neighbors().forEach(n => {
        if (!rif[n.ifname]) return;
        X[AS + 'NEIGHBOR_ENTRY:' + JSON.stringify({ ip: n.ip, rif: rif[n.ifname], switch_id: SW })] = { SAI_NEIGHBOR_ENTRY_ATTR_DST_MAC_ADDRESS: n.mac.toUpperCase() };
        const o = this.oid('NEXT_HOP', n.ip);
        nhs[n.ip] = o;
        X[AS + 'NEXT_HOP:' + o] = { SAI_NEXT_HOP_ATTR_TYPE: 'SAI_NEXT_HOP_TYPE_IP', SAI_NEXT_HOP_ATTR_IP: n.ip, SAI_NEXT_HOP_ATTR_ROUTER_INTERFACE_ID: rif[n.ifname] };
      });
      this.routes().forEach(r => { if (r.resolved && nhs[r.nexthop]) X[rkey(r.prefix)] = { SAI_ROUTE_ENTRY_ATTR_NEXT_HOP_ID: nhs[r.nexthop] }; });

      return { CONFIG_DB: C, APPL_DB: A, STATE_DB: T, ASIC_DB: X };
    }

    /* ---------- 指令 ---------- */
    exec(line) {
      const before = this.dump();
      const res = { out: '', err: false, notes: [], read: null, clear: false };
      try {
        this.run(line.trim(), res);
      } catch (e) {
        res.out = e.message; res.err = true;
      }
      const after = this.dump();
      res.diff = diffDumps(before, after);
      res.trace = buildTrace(res.diff, res, this);
      return res;
    }

    run(line, res) {
      let toks = (line.match(/"[^"]*"|'[^']*'|\S+/g) || []).map(t => t.replace(/^["']|["']$/g, ''));
      if (!toks.length) return;
      let sudo = false;
      if (toks[0] === 'sudo') { sudo = true; toks = toks.slice(1); }
      const [c0] = toks;
      const fail = m => { throw new Error(m); };
      const needRoot = () => { if (!sudo) fail('Root privileges are required for this operation\n（提示：設定類指令需要加上 sudo）'); };
      const cfg = this.cfg;
      const port = p => { if (!cfg.PORT[p]) fail(`Error: Interface name ${p} is invalid. Please enter a valid interface name!!`); };

      if (c0 === 'help' || c0 === '?') { res.out = HELP; return; }
      if (c0 === 'clear') { res.clear = true; return; }
      if (c0 === 'docker' && toks[1] === 'ps') { res.out = DOCKER_PS; res.read = 'dockerd：列出正在執行的 SONiC 容器'; return; }

      if (c0 === 'show') {
        const sub = toks.slice(1).join(' ');
        if (sub === 'version') { res.out = SHOW_VERSION; res.read = '讀取 /etc/sonic/sonic_version.yml 與 DEVICE_METADATA'; return; }
        if (sub === 'interfaces status' || sub === 'interface status') { res.out = this.showIntStatus(); res.read = '讀取 APPL_DB PORT_TABLE（admin/oper 狀態）與 CONFIG_DB（VLAN/LAG 歸屬）'; return; }
        if (sub === 'vlan brief') { res.out = this.showVlanBrief(); res.read = '讀取 CONFIG_DB 的 VLAN、VLAN_MEMBER、VLAN_INTERFACE 表'; return; }
        if (sub === 'ip interfaces' || sub === 'ip interface') { res.out = this.showIpIntf(); res.read = '讀取 Linux kernel 的介面位址（netlink）與 APPL_DB 狀態'; return; }
        if (sub === 'ip route') { res.out = this.showIpRoute(); res.read = 'vtysh -c "show ip route"：直接詢問 FRR zebra 的 RIB'; return; }
        if (sub === 'arp') { res.out = this.showArp(); res.read = '讀取 Linux kernel ARP 表，並對照 ASIC_DB / STATE_DB 的 FDB'; return; }
        if (sub === 'interfaces portchannel') { res.out = this.showPc(); res.read = '在 teamd 容器內執行 teamdctl 查詢 LACP 狀態'; return; }
        if (sub === 'runningconfiguration all') { res.out = JSON.stringify(this.cfg, null, 4); res.read = '把整個 CONFIG_DB 以 JSON 輸出（等同 sonic-cfggen -d --print-data）'; return; }
        fail(`Error: No such command "${toks.slice(1).join(' ')}".\n支援：show version | interfaces status | vlan brief | ip interfaces | ip route | arp | interfaces portchannel | runningconfiguration all`);
      }

      if (c0 === 'redis-cli' || c0 === 'sonic-db-cli') {
        let db, rest;
        if (c0 === 'redis-cli') {
          if (toks[1] !== '-n') fail('用法：redis-cli -n <DB 編號> keys <pattern> | hgetall <key>\n  DB 編號：0=APPL_DB 1=ASIC_DB 4=CONFIG_DB 6=STATE_DB');
          db = DB_NUM[toks[2]]; rest = toks.slice(3);
          if (!db) fail(`(此模擬器只提供 DB 0/1/4/6)`);
        } else {
          db = toks[1]; rest = toks.slice(2);
          if (!['CONFIG_DB', 'APPL_DB', 'ASIC_DB', 'STATE_DB', 'COUNTERS_DB'].includes(db)) fail('用法：sonic-db-cli <CONFIG_DB|APPL_DB|STATE_DB|ASIC_DB> keys <pattern> | hgetall <key>');
        }
        const data = this.dump()[db] || {};
        const op = (rest[0] || '').toLowerCase();
        res.read = `直接查詢 redis：${db}`;
        if (op === 'keys') {
          const re = globRe(rest[1] || '*');
          const ks = Object.keys(data).filter(k => re.test(k)).sort();
          res.out = ks.length ? ks.map((k, i) => (c0 === 'redis-cli' ? `${i + 1}) "${k}"` : k)).join('\n') : '(empty array)';
          return;
        }
        if (op === 'hgetall') {
          const v = data[rest[1]];
          if (!v) { res.out = c0 === 'redis-cli' ? '(empty array)' : '{}'; return; }
          res.out = c0 === 'redis-cli'
            ? Object.entries(v).flatMap(([a, b]) => [a, b]).map((x, i) => `${i + 1}) "${x}"`).join('\n')
            : '{' + Object.entries(v).map(([a, b]) => `'${a}': '${b}'`).join(', ') + '}';
          return;
        }
        if (op === 'hget') { const v = data[rest[1]]; res.out = v && v[rest[2]] != null ? `"${v[rest[2]]}"` : '(nil)'; return; }
        fail('支援的操作：keys <pattern>、hgetall <key>、hget <key> <field>');
      }

      if (c0 === 'config') {
        needRoot();
        const a = toks.slice(1);
        const k = a.join(' ');
        // config interface ...
        if (a[0] === 'interface') {
          if (a[1] === 'startup' || a[1] === 'shutdown') {
            const p = a[2];
            const st = a[1] === 'startup' ? 'up' : 'down';
            if (p && p.startsWith('PortChannel')) { if (!cfg.PORTCHANNEL[p]) fail(`Error: ${p} does not exist`); cfg.PORTCHANNEL[p].admin_status = st; return; }
            port(p);
            if (cfg.PORT[p].admin_status !== st && LINKED.has(p)) res.operFlip = { port: p, st };
            cfg.PORT[p].admin_status = st;
            return;
          }
          if (a[1] === 'mtu') {
            port(a[2]);
            const m = +a[3];
            if (!(m >= 68 && m <= 9216)) fail('Error: Invalid value for "<interface_mtu>": 必須介於 68 ~ 9216');
            cfg.PORT[a[2]].mtu = String(m);
            return;
          }
          if (a[1] === 'ip' && (a[2] === 'add' || a[2] === 'remove')) {
            const ifn = a[3], pfx = parsePrefix(a[4]);
            const t = ifn && this.intfTable(ifn);
            if (!t) fail(`Error: Interface name ${ifn} is invalid.`);
            if (!pfx) fail(`Error: IP address ${a[4]} is not valid. 格式範例：10.0.0.0/31`);
            if (t === 'INTERFACE') {
              port(ifn);
              const lag = this.lagOf(ifn);
              if (lag) fail(`Error: Interface ${ifn} is a member of portchannel ${lag}`);
              if (this.vlansOf(ifn).length) fail(`Error: Interface ${ifn} is a member of vlan ${this.vlansOf(ifn).join(',')}`);
            }
            if (t === 'VLAN_INTERFACE' && !cfg.VLAN[ifn]) fail(`Error: ${ifn} does not exist`);
            if (t === 'PORTCHANNEL_INTERFACE' && !cfg.PORTCHANNEL[ifn]) fail(`Error: ${ifn} does not exist`);
            if (a[2] === 'add') {
              const clash = this.l3Addrs().find(x => x.prefix.len && ((pfx.ip & x.prefix.mask) >>> 0) === x.prefix.net && x.ifname !== ifn && !x.ifname.startsWith('Loopback'));
              if (clash) fail(`Error: IP ${a[4]} overlaps with existing subnet ${clash.prefix.netStr} on ${clash.ifname}`);
              cfg[t][ifn] = cfg[t][ifn] || NUL();
              cfg[t][ifn + '|' + a[4]] = NUL();
            } else {
              if (!cfg[t][ifn + '|' + a[4]]) fail(`Error: IP address ${a[4]} does not exist on ${ifn}`);
              delete cfg[t][ifn + '|' + a[4]];
              if (!Object.keys(cfg[t]).some(x => x.startsWith(ifn + '|'))) delete cfg[t][ifn];
            }
            return;
          }
        }
        if (a[0] === 'vlan') {
          if ((a[1] === 'add' || a[1] === 'del') && a.length === 3) {
            const id = +a[2];
            if (!(id >= 2 && id <= 4094)) fail('Error: Invalid VLAN ID ' + a[2] + ' (1-4094，VLAN 1 保留)');
            const v = 'Vlan' + id;
            if (a[1] === 'add') { if (cfg.VLAN[v]) fail(`Error: ${v} already exists`); cfg.VLAN[v] = { vlanid: String(id) }; return; }
            if (!cfg.VLAN[v]) fail(`Error: ${v} does not exist`);
            if (this.vlanMembers(v).length) fail(`Error: ${v} can not be removed. First remove all members assigned to this VLAN.`);
            if (Object.keys(cfg.VLAN_INTERFACE).some(x => x.split('|')[0] === v)) fail(`Error: ${v} can not be removed. First remove IP addresses assigned to this VLAN`);
            delete cfg.VLAN[v];
            return;
          }
          if (a[1] === 'member' && (a[2] === 'add' || a[2] === 'del')) {
            let rest = a.slice(3);
            const untagged = rest.includes('-u') || rest.includes('--untagged');
            rest = rest.filter(x => x !== '-u' && x !== '--untagged');
            const v = 'Vlan' + rest[0], p = rest[1];
            if (!cfg.VLAN[v]) fail(`Error: ${v} does not exist`);
            if (!p || (!cfg.PORT[p] && !cfg.PORTCHANNEL[p])) fail(`Error: Interface name ${p} is invalid.`);
            const key = v + '|' + p;
            if (a[2] === 'add') {
              if (cfg.VLAN_MEMBER[key]) fail(`Error: ${p} is already a member of ${v}`);
              if (Object.keys(cfg.INTERFACE).some(x => x.split('|')[0] === p) || Object.keys(cfg.PORTCHANNEL_INTERFACE).some(x => x.split('|')[0] === p)) fail(`Error: ${p} is a router interface!`);
              if (cfg.PORT[p] && this.lagOf(p)) fail(`Error: ${p} is part of portchannel!`);
              if (untagged && this.vlansOf(p).some(x => cfg.VLAN_MEMBER[x + '|' + p].tagging_mode === 'untagged')) fail(`Error: ${p} is already untagged member!`);
              cfg.VLAN_MEMBER[key] = { tagging_mode: untagged ? 'untagged' : 'tagged' };
            } else {
              if (!cfg.VLAN_MEMBER[key]) fail(`Error: ${p} is not a member of ${v}`);
              delete cfg.VLAN_MEMBER[key];
            }
            return;
          }
        }
        if (a[0] === 'portchannel') {
          if ((a[1] === 'add' || a[1] === 'del') && a.length === 3) {
            const pc = a[2];
            if (!/^PortChannel\d{1,4}$/.test(pc)) fail('Error: PortChannel name must start with "PortChannel" followed by up to 4 digits (e.g. PortChannel0001)');
            if (a[1] === 'add') { if (cfg.PORTCHANNEL[pc]) fail(`Error: ${pc} already exists!`); cfg.PORTCHANNEL[pc] = { admin_status: 'up', mtu: '9100', lacp_key: 'auto', min_links: '1' }; return; }
            if (!cfg.PORTCHANNEL[pc]) fail(`Error: ${pc} does not exist!`);
            if (this.lagMembers(pc).length) fail(`Error: Portchannel ${pc} contains members. Remove members before deleting Portchannel!`);
            if (this.vlansOf(pc).length || Object.keys(cfg.PORTCHANNEL_INTERFACE).some(x => x.split('|')[0] === pc)) fail(`Error: ${pc} has VLAN or IP configuration.`);
            delete cfg.PORTCHANNEL[pc];
            return;
          }
          if (a[1] === 'member' && (a[2] === 'add' || a[2] === 'del')) {
            const pc = a[3], p = a[4];
            if (!cfg.PORTCHANNEL[pc]) fail(`Error: ${pc} does not exist!`);
            port(p);
            const key = pc + '|' + p;
            if (a[2] === 'add') {
              if (this.lagOf(p)) fail(`Error: ${p} is already member of ${this.lagOf(p)}`);
              if (Object.keys(cfg.INTERFACE).some(x => x.split('|')[0] === p)) fail(`Error: ${p} has ip address configured`);
              if (this.vlansOf(p).length) fail(`Error: ${p} Interface configured as VLAN member`);
              cfg.PORTCHANNEL_MEMBER[key] = NUL();
            } else {
              if (!cfg.PORTCHANNEL_MEMBER[key]) fail(`Error: ${p} is not a member of portchannel ${pc}`);
              delete cfg.PORTCHANNEL_MEMBER[key];
            }
            return;
          }
        }
        if (a[0] === 'route' && (a[1] === 'add' || a[1] === 'del') && a[2] === 'prefix') {
          const pfx = parsePrefix(a[3]);
          if (!pfx) fail('Error: prefix 格式錯誤，範例：192.168.10.0/24');
          const key = pfx.netStr;
          if (a[1] === 'add') {
            if (a[4] !== 'nexthop' || ip2n(a[5] || '') == null) fail('用法：config route add prefix <prefix> nexthop <ip>');
            cfg.STATIC_ROUTE[key] = { nexthop: a[5], blackhole: 'false', distance: '0', ifname: '', 'nexthop-vrf': '' };
            const r = this.routes().find(x => x.prefix === key);
            if (!r.installed) res.notes.push({ who: 'zebra', k: 'proc', t: `next hop ${a[5]} 不在任何「已啟動」的直連網段內，路由 inactive，不會送往 fpmsyncd。` });
            else if (!r.resolved) res.notes.push({ who: 'orchagent', k: 'proc', t: `RouteOrch：next hop ${a[5]} 尚未解析出 MAC（沒有 ARP），路由先留在 orchagent 等待，不寫入 ASIC_DB。` });
            return;
          }
          if (!cfg.STATIC_ROUTE[key]) fail(`Error: Route ${key} does not exist`);
          delete cfg.STATIC_ROUTE[key];
          return;
        }
        if (a[0] === 'save') { this.saved = clone(cfg); res.out = 'Running command: /usr/local/bin/sonic-cfggen -d --print-data > /etc/sonic/config_db.json'; res.read = '把目前的 CONFIG_DB 寫回 /etc/sonic/config_db.json（重開機後才會保留）'; return; }
        if (a[0] === 'reload') {
          this.cfg = clone(this.saved);
          res.cfgWriter = 'sonic-cfggen';
          res.out = 'Disabling container monitoring ...\nStopping SONiC target ...\nRunning command: /usr/local/bin/sonic-cfggen -j /etc/sonic/config_db.json --write-to-db\nRestarting SONiC target ...\nEnabling container monitoring ...\nReloading Monit configuration ...';
          res.notes.push({ who: 'systemd', k: 'proc', t: '清空 CONFIG_DB 後重新載入 /etc/sonic/config_db.json，並重啟 swss、syncd、bgp 等服務（所有未 save 的變更都會消失）。' });
          return;
        }
        fail(`Error: 無法辨識的 config 指令：config ${k}\n輸入 help 查看支援的指令`);
      }
      fail(`-bash: ${c0}: command not found（輸入 help 查看支援的指令）`);
    }

    /* ---------- show 輸出 ---------- */
    showIntStatus() {
      const rows = Object.keys(this.cfg.PORT).map(p => {
        const c = this.cfg.PORT[p];
        const lag = this.lagOf(p);
        const vl = this.vlansOf(p);
        const routed = Object.keys(this.cfg.INTERFACE).some(x => x.split('|')[0] === p);
        const vcol = lag || (routed ? 'routed' : vl.length ? 'trunk' : 'N/A');
        return [p, c.lanes, (+c.speed / 1000) + 'G', c.mtu, 'N/A', c.alias, vcol, this.portOper(p), c.admin_status, LINKED.has(p) ? 'QSFP+' : 'N/A'];
      });
      Object.keys(this.cfg.PORTCHANNEL).forEach(pc => {
        const f = this.cfg.PORTCHANNEL[pc];
        const vcol = Object.keys(this.cfg.PORTCHANNEL_INTERFACE).some(x => x.split('|')[0] === pc) ? 'routed' : this.vlansOf(pc).length ? 'trunk' : 'N/A';
        rows.push([pc, 'N/A', '40G', f.mtu, 'N/A', 'N/A', vcol, this.lagOper(pc), f.admin_status, 'N/A']);
      });
      return table(['Interface', 'Lanes', 'Speed', 'MTU', 'FEC', 'Alias', 'Vlan', 'Oper', 'Admin', 'Type'], rows);
    }
    showVlanBrief() {
      const rows = [];
      Object.entries(this.cfg.VLAN).forEach(([v, f]) => {
        const ips = Object.keys(this.cfg.VLAN_INTERFACE).filter(x => x.startsWith(v + '|')).map(x => x.split('|')[1]);
        const mem = this.vlanMembers(v);
        const n = Math.max(1, ips.length, mem.length);
        for (let i = 0; i < n; i++) rows.push([i ? '' : f.vlanid, ips[i] || '', mem[i] || '', mem[i] ? this.cfg.VLAN_MEMBER[v + '|' + mem[i]].tagging_mode : '']);
      });
      return grid(['VLAN ID', 'IP Address', 'Ports', 'Port Tagging'], rows);
    }
    showIpIntf() {
      const neigh = this.neighbors();
      const rows = this.l3Addrs().map(a => {
        const n = neigh.find(x => x.ifname === a.ifname);
        const adm = a.ifname.startsWith('Ethernet') ? this.cfg.PORT[a.ifname].admin_status : a.ifname.startsWith('PortChannel') ? this.cfg.PORTCHANNEL[a.ifname].admin_status : 'up';
        return [a.ifname, '', a.prefix.str, adm + '/' + this.ifOper(a.ifname), 'N/A', n ? n.ip : 'N/A'];
      });
      rows.push(['docker0', '', '240.127.1.1/24', 'up/down', 'N/A', 'N/A'], ['eth0', '', '10.250.0.101/24', 'up/up', 'N/A', 'N/A'], ['lo', '', '127.0.0.1/16', 'up/up', 'N/A', 'N/A']);
      rows.sort((x, y) => x[0].localeCompare(y[0], 'en', { numeric: true }));
      return table(['Interface', 'Master', 'IPv4 address/mask', 'Admin/Oper', 'BGP Neighbor', 'Neighbor IP'], rows);
    }
    showIpRoute() {
      let out = 'Codes: K - kernel route, C - connected, S - static, R - RIP,\n       O - OSPF, I - IS-IS, B - BGP, E - EIGRP, N - NHRP,\n       > - selected route, * - FIB route, q - queued, r - rejected, b - backup\n\n';
      const lines = [];
      lines.push(['0.0.0.0/0', 'K>* 0.0.0.0/0 [0/0] via 10.250.0.1, eth0, 01:02:03']);
      lines.push(['10.250.0.0/24', 'C>* 10.250.0.0/24 is directly connected, eth0, 01:02:03']);
      this.l3Addrs().forEach(a => {
        if (a.ifname.startsWith('Loopback')) { lines.push([a.prefix.netStr, `C>* ${a.prefix.netStr} is directly connected, ${a.ifname}, 00:12:34`]); return; }
        if (this.ifOper(a.ifname) === 'up') lines.push([a.prefix.netStr, `C>* ${a.prefix.netStr} is directly connected, ${a.ifname}, 00:12:34`]);
      });
      this.routes().forEach(r => {
        lines.push([r.prefix, r.installed ? `S>* ${r.prefix} [1/0] via ${r.nexthop}, ${r.ifname}, weight 1, 00:00:07` : `S   ${r.prefix} [1/0] via ${r.nexthop} inactive, weight 1, 00:00:07`]);
      });
      lines.sort((x, y) => ip2n(x[0].split('/')[0]) - ip2n(y[0].split('/')[0]));
      return out + lines.map(l => l[1]).join('\n');
    }
    showArp() {
      const n = this.neighbors();
      return table(['Address', 'MacAddress', 'Iface', 'Vlan'], n.map(x => [x.ip, x.mac, x.ifname, '-'])) + `\nTotal number of entries ${n.length}`;
    }
    showPc() {
      let out = 'Flags: A - active, I - inactive, Up - up, Dw - Down, N/A - not available,\n       S - selected, D - deselected, * - not synced\n';
      const rows = Object.keys(this.cfg.PORTCHANNEL).map(pc => {
        const mem = this.lagMembers(pc).map(m => m + (this.portOper(m) === 'up' && this.cfg.PORTCHANNEL[pc].admin_status === 'up' ? '(S)' : '(D)')).join(' ');
        return [pc.replace('PortChannel', ''), pc, `LACP(A)(${this.lagOper(pc) === 'up' ? 'Up' : 'Dw'})`, mem || ''];
      });
      return out + table(['No.', 'Team Dev', 'Protocol', 'Ports'], rows);
    }
  }

  /* ---------- 輸出格式 ---------- */
  function table(h, rows) {
    const w = h.map((x, i) => Math.max(x.length, ...rows.map(r => String(r[i]).length)));
    const fmt = r => r.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd();
    return [fmt(h), w.map(x => '-'.repeat(x)).join('  '), ...rows.map(fmt)].join('\n');
  }
  function grid(h, rows) {
    const w = h.map((x, i) => Math.max(x.length, ...rows.map(r => String(r[i]).length)));
    const sep = '+' + w.map(x => '-'.repeat(x + 2)).join('+') + '+';
    const fmt = r => '| ' + r.map((c, i) => String(c).padEnd(w[i])).join(' | ') + ' |';
    return [sep, fmt(h), sep.replace(/-/g, '='), ...rows.map(fmt), sep].join('\n');
  }
  function globRe(p) { return new RegExp('^' + p.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'); }

  function diffDumps(a, b) {
    const d = {};
    for (const db of Object.keys(b)) {
      d[db] = {};
      const A = a[db], B = b[db];
      for (const k of Object.keys(B)) {
        if (!(k in A)) d[db][k] = 'add';
        else if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) d[db][k] = 'mod';
      }
      for (const k of Object.keys(A)) if (!(k in B)) d[db][k] = 'del';
    }
    return d;
  }

  /* ---------- 追蹤：依 DB 差異推回「誰做了什麼」 ---------- */
  const OP = { add: '新增', mod: '更新', del: '刪除' };
  const APPL_WRITER = {
    PORT_TABLE: 'portmgrd', VLAN_TABLE: 'vlanmgrd', VLAN_MEMBER_TABLE: 'vlanmgrd', LAG_TABLE: 'teammgrd', LAG_MEMBER_TABLE: 'teamsyncd',
    INTF_TABLE: 'intfmgrd', ROUTE_TABLE: 'fpmsyncd', NEIGH_TABLE: 'neighsyncd',
  };
  const STATE_WRITER = { PORT_TABLE: 'portsyncd', VLAN_TABLE: 'vlanmgrd', VLAN_MEMBER_TABLE: 'vlanmgrd', LAG_TABLE: 'teammgrd', INTERFACE_TABLE: 'intfmgrd' };
  const ORCH = {
    PORT: 'PortsOrch', HOSTIF: 'PortsOrch', VLAN: 'PortsOrch', VLAN_MEMBER: 'PortsOrch', BRIDGE_PORT: 'PortsOrch', LAG: 'PortsOrch', LAG_MEMBER: 'PortsOrch',
    ROUTER_INTERFACE: 'IntfsOrch', ROUTE_ENTRY: 'RouteOrch', NEIGHBOR_ENTRY: 'NeighOrch', NEXT_HOP: 'NeighOrch', SWITCH: 'SwitchOrch',
  };
  const SAI_API = {
    PORT: ['port', 'port'], HOSTIF: ['hostif', 'hostif'], VLAN: ['vlan', 'vlan'], VLAN_MEMBER: ['vlan', 'vlan_member'], BRIDGE_PORT: ['bridge', 'bridge_port'],
    LAG: ['lag', 'lag'], LAG_MEMBER: ['lag', 'lag_member'], ROUTER_INTERFACE: ['router_intfs', 'router_interface'], ROUTE_ENTRY: ['route', 'route_entry'],
    NEIGHBOR_ENTRY: ['neighbor', 'neighbor_entry'], NEXT_HOP: ['next_hop', 'next_hop'],
  };

  function short(keys, n) {
    n = n || 2;
    const s = keys.slice(0, n).map(k => `<code>${S.esc(k.length > 70 ? k.slice(0, 67) + '…' : k)}</code>`).join('、');
    return keys.length > n ? s + ` 等 ${keys.length} 筆` : s;
  }
  function groupBy(obj, keyFn) {
    const g = {};
    Object.entries(obj).forEach(([k, op]) => { const t = keyFn(k); ((g[t] = g[t] || {})[op] = g[t][op] || []).push(k); });
    return g;
  }

  function kernelAction(table, op, keys, sim) {
    const k = keys[0];
    const name = k.split(':').slice(1).join(':');
    if (table === 'VLAN_TABLE') return op === 'del' ? `ip link del ${name}` : `ip link add link Bridge name ${name} type vlan id ${name.replace('Vlan', '')}；bridge vlan add vid ${name.replace('Vlan', '')} dev Bridge self`;
    if (table === 'VLAN_MEMBER_TABLE') { const [v, p] = name.split(':'); return op === 'del' ? `bridge vlan del vid ${v.replace('Vlan', '')} dev ${p}` : `ip link set ${p} master Bridge；bridge vlan add vid ${v.replace('Vlan', '')} dev ${p}`; }
    if (table === 'INTF_TABLE' && name.includes('/')) { const i = name.indexOf(':'); return `ip address ${op === 'del' ? 'del' : 'add'} ${name.slice(i + 1)} dev ${name.slice(0, i)}`; }
    if (table === 'LAG_TABLE' && op === 'add') return `teamd -r -t ${name} -c '{"runner":{"name":"lacp"}}' -d`;
    if (table === 'LAG_TABLE' && op === 'del') return `teamd -k -t ${name}`;
    return null;
  }

  function buildTrace(diff, res, sim) {
    const tr = [];
    const add = (who, k, t) => tr.push({ who, k, t });
    const cd = diff.CONFIG_DB, ad = diff.APPL_DB, sd = diff.STATE_DB, xd = diff.ASIC_DB;
    const any = o => Object.keys(o).length > 0;
    if (!any(cd) && !any(ad) && !any(xd) && !any(sd)) {
      if (res.read) add('讀取', 'file', res.read);
      res.notes.forEach(n => add(n.who, n.k, n.t));
      return tr;
    }
    if (any(cd)) {
      const g = groupBy(cd, k => k.split('|')[0]);
      Object.entries(g).forEach(([t, ops]) => Object.entries(ops).forEach(([op, ks]) => add(res.cfgWriter || 'CLI', 'cli', `${res.cfgWriter ? '從 config_db.json 重新載入' : 'click CLI 驗證參數後'}，在 <b>CONFIG_DB</b> ${OP[op]} ${short(ks)}`)));
    }
    // 在 fpmsyncd 前補上 bgpcfgd / zebra
    if (Object.keys(cd).some(k => k.startsWith('STATIC_ROUTE|'))) {
      add('bgpcfgd', 'proc', '訂閱到 CONFIG_DB STATIC_ROUTE 變更，透過 vtysh 在 FRR 設定 <code>ip route …</code>（由 staticd 交給 zebra）');
      if (Object.keys(ad).some(k => k.startsWith('ROUTE_TABLE:'))) add('zebra', 'proc', '選出最佳路由 → 經 netlink 寫進 Linux kernel 路由表，並透過 FPM socket 送給 fpmsyncd');
    }
    if (any(ad)) {
      const g = groupBy(ad, k => k.split(':')[0]);
      Object.entries(g).forEach(([t, ops]) => {
        Object.entries(ops).forEach(([op, ks]) => {
          let who = APPL_WRITER[t] || 'swss';
          if (t === 'PORT_TABLE' && op === 'mod') {
            // 區分 admin/mtu（portmgrd）與 oper_status（orchagent 收到 SAI 通知）
            const cfgChanged = Object.keys(cd).some(k => k.startsWith('PORT|'));
            if (cfgChanged) {
              const p = ks.find(k => Object.keys(cd).includes('PORT|' + k.split(':')[1]));
              if (p) add('portmgrd', 'proc', `偵測到 CONFIG_DB PORT 變更 → <code>ip link set dev ${p.split(':')[1]} ${sim.cfg.PORT[p.split(':')[1]].admin_status} mtu ${sim.cfg.PORT[p.split(':')[1]].mtu}</code>，並寫入 <b>APPL_DB</b> ${short([p])}`);
              if (res.operFlip) add('orchagent', 'proc', `PortsOrch 設定 SAI admin state 後，ASIC 回報鏈路 ${res.operFlip.st}（<code>port_state_change</code> 通知），orchagent 把 oper_status=${res.operFlip.st} 寫回 <b>APPL_DB</b>，並同步 kernel netdev 的 carrier`);
              else if (!Object.keys(cd).some(k => k.startsWith('PORT|') && LINKED.has(k.split('|')[1])) && Object.keys(cd).some(k => k.startsWith('PORT|'))) {
                // 沒接線的埠：admin up 但 oper 仍 down
                const np = Object.keys(cd).find(k => k.startsWith('PORT|')).split('|')[1];
                if (sim.cfg.PORT[np].admin_status === 'up') add('ASIC', 'hw', `${np} 沒有接線（沒有對端），所以雖然 admin up，oper_status 仍是 down`);
              }
            }
            const operKs = ks.filter(k => !Object.keys(cd).includes('PORT|' + k.split(':')[1]));
            if (operKs.length) add('orchagent', 'proc', `從 ASIC 收到 <code>port_state_change</code> 通知，更新 <b>APPL_DB</b> ${short(operKs)} 的 oper_status`);
            return;
          }
          if (t === 'NEIGH_TABLE' && op === 'add') add('kernel', 'kernel', '介面 up 後與對端交換 ARP，kernel 鄰居表新增項目');
          const kact = kernelAction(t, op, ks, null);
          if (kact) add(who, 'proc', `在 Linux 執行 <code>${S.esc(kact)}</code>`);
          add(who, 'proc', `${OP[op]} <b>APPL_DB</b> ${short(ks)}`);
        });
      });
    }
    if (any(sd)) {
      const g = groupBy(sd, k => k.split('|')[0]);
      Object.entries(g).forEach(([t, ops]) => Object.entries(ops).forEach(([op, ks]) => add(STATE_WRITER[t] || 'swss', 'proc', `${OP[op]} <b>STATE_DB</b> ${short(ks)}（表示 kernel 端已就緒）`)));
    }
    res.notes.filter(n => n.who !== 'systemd').forEach(n => add(n.who, n.k, n.t));
    if (any(xd)) {
      const g = groupBy(xd, k => k.split(':')[1].replace('SAI_OBJECT_TYPE_', ''));
      Object.entries(g).forEach(([t, ops]) => Object.entries(ops).forEach(([op, ks]) => add('orchagent', 'proc', `${ORCH[t] || 'Orch'} 透過 sairedis ${OP[op]} <b>ASIC_DB</b> <code>SAI_OBJECT_TYPE_${t}</code> × ${ks.length}`)));
      Object.entries(g).forEach(([t, ops]) => Object.entries(ops).forEach(([op, ks]) => {
        const api = SAI_API[t];
        if (!api) return;
        const fn = op === 'add' ? `create_${api[1]}` : op === 'del' ? `remove_${api[1]}` : `set_${api[1]}_attribute`;
        add('syncd', 'proc', `呼叫 <code>sai_${api[0]}_api-&gt;${fn}()</code>${ks.length > 1 ? ' × ' + ks.length : ''}，由廠商 SAI 轉成 SDK 呼叫`);
      }));
      add('ASIC', 'hw', '硬體表項寫入完成，資料平面依新設定轉發');
    }
    res.notes.filter(n => n.who === 'systemd').forEach(n => add(n.who, n.k, n.t));
    return tr;
  }

  const HELP = `支援的指令（設定類需加 sudo）：
  show version | interfaces status | vlan brief | ip interfaces
  show ip route | arp | interfaces portchannel | runningconfiguration all
  docker ps

  sudo config interface startup|shutdown <Ethernet0|PortChannel0001>
  sudo config interface mtu <port> <68-9216>
  sudo config interface ip add|remove <ifname> <ip/len>
  sudo config vlan add|del <vid>
  sudo config vlan member add|del [-u] <vid> <port>
  sudo config portchannel add|del <PortChannel0001>
  sudo config portchannel member add|del <PortChannel0001> <port>
  sudo config route add prefix <prefix> nexthop <ip>
  sudo config route del prefix <prefix>
  sudo config save -y | sudo config reload -y

  redis-cli -n <0|1|4|6> keys <pattern> | hgetall <key>
  sonic-db-cli <CONFIG_DB|APPL_DB|STATE_DB|ASIC_DB> keys <pattern>
  clear

提示：有接線的埠是 Ethernet0 / 4 / 8 / 12，其他埠 startup 後仍會是 oper down。`;

  const SHOW_VERSION = `SONiC Software Version: SONiC.202405-wiki-sim
SONiC OS Version: 12
Distribution: Debian 12.6
Kernel: 6.1.0-22-2-amd64
Build commit: 1a2b3c4d
Build date: Mon Jul  1 08:00:00 UTC 2024
Built by: sonicwiki@buildhost

Platform: x86_64-kvm_x86_64-r0
HwSKU: Force10-S6000
ASIC: vs
ASIC Count: 1
Serial Number: N/A
Model Number: N/A
Hardware Revision: N/A
Uptime: 01:02:03 up 1 day,  2:03,  1 user,  load average: 0.52, 0.48, 0.45

Docker images:
REPOSITORY                 TAG       IMAGE ID       SIZE
docker-orchagent           latest    3f2a1b0c9d8e   340MB
docker-syncd-vs            latest    9e8d7c6b5a4f   320MB
docker-fpm-frr             latest    7a6b5c4d3e2f   355MB
docker-teamd               latest    6f5e4d3c2b1a   317MB
docker-platform-monitor    latest    5e4d3c2b1a0f   420MB
docker-lldp                latest    4d3c2b1a0f9e   345MB
docker-snmp                latest    3c2b1a0f9e8d   355MB
docker-sonic-gnmi          latest    2b1a0f9e8d7c   420MB
docker-database            latest    1a0f9e8d7c6b   300MB`;

  const DOCKER_PS = `CONTAINER ID   IMAGE                             COMMAND                  STATUS       NAMES
a1b2c3d4e5f6   docker-sonic-gnmi:latest          "/usr/local/bin/supe…"   Up 1 day     gnmi
b2c3d4e5f6a1   docker-snmp:latest                "/usr/local/bin/supe…"   Up 1 day     snmp
c3d4e5f6a1b2   docker-platform-monitor:latest    "/usr/bin/docker_ini…"   Up 1 day     pmon
d4e5f6a1b2c3   docker-lldp:latest                "/usr/bin/docker-lld…"   Up 1 day     lldp
e5f6a1b2c3d4   docker-fpm-frr:latest             "/usr/bin/docker_ini…"   Up 1 day     bgp
f6a1b2c3d4e5   docker-teamd:latest               "/usr/local/bin/supe…"   Up 1 day     teamd
a6b5c4d3e2f1   docker-syncd-vs:latest            "/usr/local/bin/supe…"   Up 1 day     syncd
b5c4d3e2f1a6   docker-orchagent:latest           "/usr/bin/docker-ini…"   Up 1 day     swss
c4d3e2f1a6b5   docker-database:latest            "/usr/local/bin/dock…"   Up 1 day     database`;

  /* =========================================================
     終端機 + DB 檢視 UI
     S.terminal(container, { chips:[...], filter:'VLAN', db:'CONFIG_DB', welcome })
     ========================================================= */
  const WHO_KIND = { CLI: 'cli', 'sonic-cfggen': 'cli', kernel: 'kernel', ASIC: 'hw', '讀取': 'file', systemd: 'kernel' };

  S.terminal = function (container, opts) {
    opts = opts || {};
    const sim = new SwitchSim();
    const root = S.el('div');
    const chips = S.el('div', { class: 'chips' });
    (opts.chips || []).forEach(c => chips.appendChild(S.el('button', { class: 'chip', title: '點一下執行', onclick: () => run(c) }, c)));
    if (opts.chips && opts.chips.length) root.appendChild(S.el('div', { class: 'sim-hint' }, '點選指令即可執行，也可以直接在終端機輸入；↑ ↓ 叫出歷史指令。'));
    root.appendChild(chips);

    const wrap = S.el('div', { class: 'sim' });
    const term = S.el('div', { class: 'term' });
    const out = S.el('div', { class: 'term-out' });
    const input = S.el('input', { type: 'text', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'SONiC 指令輸入', placeholder: '輸入 help 查看指令' });
    term.appendChild(S.el('div', { class: 'term-bar' }, S.el('span', { class: 't' }, 'admin@sonic — Force10-S6000 · SONiC.202405 (模擬)'), S.el('span', null, 'bash')));
    term.appendChild(out);
    term.appendChild(S.el('div', { class: 'term-in' }, S.el('span', { class: 'p' }, 'admin@sonic:~$'), input));
    wrap.appendChild(term);

    const side = S.el('div', { class: 'sim-side' });
    const trace = S.el('div', { class: 'panel trace' }, S.el('h5', null, '執行追蹤', S.el('span', null, '各元件依序的動作')), S.el('ol', null), S.el('div', { class: 'empty' }, '執行指令後，這裡會列出每個元件依序做的事。'));
    const dbv = S.el('div', { class: 'panel dbview' });
    side.appendChild(trace); side.appendChild(dbv);
    wrap.appendChild(side);
    root.appendChild(wrap);
    container.appendChild(root);

    let curDb = opts.db || 'CONFIG_DB';
    let lastDiff = null;
    let filter = opts.filter || '';
    const hist = []; let hi = 0;

    function print(text, cls) { const s = S.el('span', { class: cls || null }, text + '\n'); out.appendChild(s); out.scrollTop = out.scrollHeight; }
    print(opts.welcome || 'SONiC 模擬環境。輸入 help 查看支援的指令。', 'dim');

    function renderDb() {
      const d = sim.dump();
      dbv.innerHTML = '';
      dbv.appendChild(S.el('h5', null, 'Redis 內容', S.el('span', null, '綠：新增　黃：修改　紅：刪除')));
      const tabs = S.el('div', { class: 'dbtabs' });
      ['CONFIG_DB', 'APPL_DB', 'STATE_DB', 'ASIC_DB'].forEach(db => {
        const changed = lastDiff && Object.keys(lastDiff[db]).length;
        tabs.appendChild(S.el('button', { class: (db === curDb ? 'on ' : '') + (changed ? 'chg' : ''), onclick: () => { curDb = db; renderDb(); } }, db, S.el('span', { class: 'cnt' }, `(${Object.keys(d[db]).length})`)));
      });
      dbv.appendChild(tabs);
      const f = S.el('input', { class: 'filter', placeholder: '過濾 key，例如 VLAN 或 Ethernet8', value: filter });
      f.addEventListener('input', () => { filter = f.value; renderKeys(); });
      dbv.appendChild(f);
      const box = S.el('div', { class: 'keys' });
      dbv.appendChild(box);
      function renderKeys() {
        box.innerHTML = '';
        const data = d[curDb];
        const df = lastDiff ? lastDiff[curDb] : {};
        const ks = [...new Set([...Object.keys(data), ...Object.keys(df).filter(k => df[k] === 'del')])]
          .filter(k => !filter || k.toLowerCase().includes(filter.toLowerCase()))
          .sort((a, b) => ((df[b] ? 1 : 0) - (df[a] ? 1 : 0)) || a.localeCompare(b, 'en', { numeric: true }));
        if (!ks.length) { box.appendChild(S.el('div', { class: 'muted', style: 'padding:6px' }, '(沒有符合的 key)')); return; }
        ks.forEach(k => {
          const v = data[k];
          const row = S.el('div', { class: 'kv ' + (df[k] || '') }, S.el('div', { class: 'k' }, k));
          if (v) Object.entries(v).forEach(([a, b]) => row.appendChild(S.el('div', { class: 'f' }, `${a}: ${b}`)));
          box.appendChild(row);
        });
      }
      renderKeys();
    }

    function renderTrace(tr) {
      const ol = trace.querySelector('ol');
      const empty = trace.querySelector('.empty');
      ol.innerHTML = '';
      empty.style.display = tr.length ? 'none' : '';
      if (!tr.length) empty.textContent = '這個指令沒有改動任何資料庫。';
      tr.forEach((x, i) => {
        const who = S.el('span', { class: 'who', title: x.who }, x.who);
        who.style.setProperty('--k', `var(--k-${x.k || WHO_KIND[x.who] || 'proc'})`);
        const li = S.el('li', null, who, S.el('span', { html: x.t }));
        li.style.animationDelay = (i * 0.12) + 's';
        ol.appendChild(li);
      });
    }

    function run(cmd) {
      cmd = cmd.trim();
      if (!cmd) return;
      hist.push(cmd); hi = hist.length;
      print('admin@sonic:~$ ' + cmd, 'cmd');
      const r = sim.exec(cmd);
      if (r.clear) { out.innerHTML = ''; }
      else if (r.out) print(r.out, r.err ? 'err' : null);
      lastDiff = r.diff;
      // 自動切到有變動、且最「下游」的 DB 以外 —— 保持使用者目前選的，若目前沒變化則跳到第一個有變化的
      if (!Object.keys(r.diff[curDb]).length) {
        const first = ['CONFIG_DB', 'APPL_DB', 'STATE_DB', 'ASIC_DB'].find(db => Object.keys(r.diff[db]).length);
        if (first) curDb = first;
      }
      renderTrace(r.trace);
      renderDb();
      if (opts.onRun) opts.onRun(cmd, r, sim);
    }

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { const v = input.value; input.value = ''; run(v); }
      else if (e.key === 'ArrowUp') { if (hi > 0) { hi--; input.value = hist[hi]; } e.preventDefault(); }
      else if (e.key === 'ArrowDown') { if (hi < hist.length - 1) { hi++; input.value = hist[hi]; } else { hi = hist.length; input.value = ''; } e.preventDefault(); }
    });
    out.addEventListener('click', () => input.focus());
    renderDb();
    return { run, sim };
  };

  S.SwitchSim = SwitchSim;
})();
