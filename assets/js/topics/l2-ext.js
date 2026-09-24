S.register({
  id: 'l2-ext',
  category: 'l2',
  order: 8,
  title: 'Q-in-Q、L2PT、Port Security 與 Storm Control',
  en: 'Provider Bridging, L2PT, Port Security & Storm Control',
  summary: '服務供應商與校園網路常用的 L2 功能：以 Q-in-Q 或 VLAN translation 承載客戶 VLAN、以 L2 protocol tunneling 透傳客戶的控制協定、以 port security 限制 MAC 數量，以及以 storm control 限制 BUM 流量。',
  meta: [
    ['CONFIG_DB', ['PORT_STORM_CONTROL', 'VLAN_MEMBER / VLAN_STACKING（Enterprise）', 'PORT_SECURITY（Enterprise）', 'L2PT（Enterprise）']],
    ['程序', ['orchagent (PolicerOrch, PortsOrch, FdbOrch)']],
    ['SAI 屬性', ['PORT_ATTR_BROADCAST / FLOOD / MULTICAST_STORM_CONTROL_POLICER_ID', 'BRIDGE_PORT_ATTR_MAX_LEARNED_ADDRESSES', 'BRIDGE_PORT_ATTR_FDB_LEARNING_LIMIT_VIOLATION_PACKET_ACTION']],
    ['支援度', '社群版支援 storm control；Q-in-Q、VLAN translation、L2PT、port security 主要為 Enterprise SONiC 功能'],
  ],
  tags: ['Q-in-Q', '802.1ad', 'dot1q-tunnel', 'VLAN translation', 'L2PT', 'port security', 'storm control', 'BUM', 'S-tag', 'C-tag'],
  keypoints: [
    'Q-in-Q（802.1ad）在客戶的 C-tag 外再加一層供應商 S-tag，供應商網路只依 S-tag 轉發；VLAN translation 則把 C-VLAN 直接換成 S-VLAN。',
    'Q-in-Q 與 VLAN translation 以 ASIC 的 ingress / egress VLAN 轉換規則實作，每條對應都會佔用硬體規則容量。',
    'L2PT 把客戶的 STP、LACP、LLDP、CDP 等協定封包改寫成特殊 multicast MAC，在供應商 VLAN 中泛洪，於另一端還原。',
    'Port security 透過 bridge port 的 MAC 學習上限實作；超過上限時依設定丟棄或關閉 port。',
    'Storm control 為每個 port 的 broadcast、unknown unicast、unknown multicast 各建立一個 policer（kbps），超過的流量在入口丟棄。',
  ],
  html: `
<h2>Q-in-Q 與 VLAN translation</h2>
<p>選擇模式，比較客戶端送出的封包在進入與離開供應商邊緣（PE）時的 VLAN 標籤。</p>
<div id="tags"></div>
<table>
<thead><tr><th></th><th>Q-in-Q (dot1q-tunnel)</th><th>VLAN translation</th></tr></thead>
<tbody>
<tr><td>封裝</td><td>保留 C-tag，外加 S-tag（TPID 0x8100 或 0x88A8）</td><td>C-tag 直接替換為 S-tag</td></tr>
<tr><td>多個 C-VLAN</td><td>可以多個 C-VLAN 共用一個 S-VLAN，仍保持區隔</td><td>通常 1:1；多對一會失去原本的區隔</td></tr>
<tr><td>MTU</td><td>每個封包多 4 bytes</td><td>不變</td></tr>
<tr><td>與 VXLAN</td><td>S-VLAN 可對應到 VNI，在 overlay 中承載</td><td>S-VLAN 可對應到 VNI</td></tr>
<tr><td>限制（Enterprise）</td><td>同一介面上 S-VLAN 不能同時用於兩種模式；部分晶片需先啟用 <code>switch-resource vlan-stacking</code> 並重開機</td><td>不支援 MCLAG port-channel</td></tr>
</tbody></table>
<pre><span class="c"># Enterprise SONiC：Q-in-Q，C-VLAN 20、30 進入 S-VLAN 100，S-tag 優先權 3</span>
sonic(config)# interface Eth1/1
sonic(config-if-Eth1/1)# switchport vlan-mapping 20,30 dot1q-tunnel 100 priority 3
sonic(config-if-Eth1/1)# switchport vlan-mapping add 31-40 dot1q-tunnel 100
<span class="c"># Enterprise SONiC：VLAN translation，C-VLAN 100 ↔ S-VLAN 1000</span>
sonic(config-if-Eth1/5)# switchport vlan-mapping 100 1000
<span class="c"># 部分平台需先開啟 VLAN stacking 資源</span>
sonic(config)# switch-resource
sonic(config-switch-resource)# vlan-stacking</pre>

<h2>L2 Protocol Tunneling</h2>
<p>一般情況下，交換機會攔截並處理 STP BPDU、LACPDU、LLDPDU 等 link-local 協定封包，不會轉發。供應商網路若要讓客戶兩個站點之間「看起來像直接相連」，就必須把這些封包透明地帶過去。</p>
<table>
<thead><tr><th>協定</th><th>原始目的 MAC</th><th>處理</th></tr></thead>
<tbody>
<tr><td>STP / RSTP / MSTP</td><td><code>01:80:C2:00:00:00</code></td><td rowspan="4">入口 PE 把目的 MAC 改寫成隧道 MAC（常見為 <code>01:00:0C:CD:CD:D0</code>），在 S-VLAN 中泛洪；出口 PE 還原為原始 MAC 送給客戶。可設定速率上限避免 CPU 過載。</td></tr>
<tr><td>LACP</td><td><code>01:80:C2:00:00:02</code></td></tr>
<tr><td>LLDP</td><td><code>01:80:C2:00:00:0E</code></td></tr>
<tr><td>CDP / VTP</td><td><code>01:00:0C:CC:CC:CC</code></td></tr>
</tbody></table>
<pre><span class="c"># Enterprise SONiC</span>
sonic(config)# interface Eth1/1
sonic(config-if-Eth1/1)# switchport trunk allowed Vlan 100
sonic(config-if-Eth1/1)# switchport l2proto-tunnel lldp Vlan 100
sonic(config-if-Eth1/1)# switchport l2proto-tunnel stp Vlan 100
sonic# show l2protocol-tunnel</pre>

<h2>Port security</h2>
<p>限制一個 port 可學習的 MAC 數量，防止 MAC flooding 攻擊或未授權設備接入。</p>
<ul>
<li>硬體實作：<code>SAI_BRIDGE_PORT_ATTR_MAX_LEARNED_ADDRESSES</code> 設定上限，<code>SAI_BRIDGE_PORT_ATTR_FDB_LEARNING_LIMIT_VIOLATION_PACKET_ACTION</code> 決定超過上限時的封包處理。</li>
<li><b>protect</b>：丟棄來自未知 MAC 的封包，port 保持 up。</li>
<li><b>shutdown</b>：違規時將 port 設為 err-disabled，可搭配 errdisable recovery。</li>
</ul>
<pre><span class="c"># Enterprise SONiC</span>
sonic(config)# interface Eth1/10
sonic(config-if-Eth1/10)# port-security enable
sonic(config-if-Eth1/10)# port-security maximum 10
sonic(config-if-Eth1/10)# port-security violation protect</pre>

<h2>Storm control</h2>
<p>限制每個 port 允許進入的 BUM（broadcast、unknown unicast、unknown multicast）流量速率。unknown multicast 指沒有對應到任何靜態或動態學習之 multicast 群組的流量。</p>
<div id="d-storm"></div>
<pre><span class="c"># 社群版</span>
sudo config interface storm-control broadcast add Ethernet0 10000        <span class="c"># kbps</span>
sudo config interface storm-control unknown-unicast add Ethernet0 10000
sudo config interface storm-control unknown-multicast add Ethernet0 10000
show storm-control all
<span class="c"># CONFIG_DB</span>
"PORT_STORM_CONTROL": {
  "Ethernet0|broadcast": { "enabled": "true", "kbps": "10000" }
}</pre>
<p class="muted">Enterprise SONiC 的介面模式語法見 UG460 §16.11；VXLAN 環境下的 BUM storm control 見 §13.1.4。</p>
`,
  mount(root) {
    const host = root.querySelector('#tags');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const out = S.el('div', { style: 'margin-top:12px' });
    const tag = (t, v, c) => `<div style="--hc:${c};--hw:.8"><b>${t}</b><span>${v}</span></div>`;
    const MODES = [
      { n: '一般 trunk', desc: 'C-tag 原樣通過，供應商網路必須知道客戶的每一個 VLAN。', inF: [['DA/SA', '', 'var(--k-kernel)'], ['802.1Q', 'VID 20', 'var(--k-proc)'], ['Payload', '', 'var(--k-file)']], outF: [['DA/SA', '', 'var(--k-kernel)'], ['802.1Q', 'VID 20', 'var(--k-proc)'], ['Payload', '', 'var(--k-file)']] },
      { n: 'Q-in-Q', desc: 'PE 加上 S-tag 100（TPID 0x88A8 或 0x8100），C-tag 20 被保留在內層。供應商網路只需要 VLAN 100；另一端 PE 移除 S-tag 後還原 C-tag 20。', inF: [['DA/SA', '', 'var(--k-kernel)'], ['802.1Q', 'VID 20', 'var(--k-proc)'], ['Payload', '', 'var(--k-file)']], outF: [['DA/SA', '', 'var(--k-kernel)'], ['S-tag', '0x88A8 · VID 100', 'var(--k-db)'], ['C-tag', 'VID 20', 'var(--k-proc)'], ['Payload', '', 'var(--k-file)']] },
      { n: 'VLAN translation', desc: 'PE 把 VID 20 直接改寫為 1000，封包長度不變；另一端 PE 反向改回 20。', inF: [['DA/SA', '', 'var(--k-kernel)'], ['802.1Q', 'VID 20', 'var(--k-proc)'], ['Payload', '', 'var(--k-file)']], outF: [['DA/SA', '', 'var(--k-kernel)'], ['802.1Q', 'VID 1000', 'var(--k-db)'], ['Payload', '', 'var(--k-file)']] },
    ];
    S.seg(box, MODES.map(m => m.n), i => {
      const m = MODES[i];
      out.innerHTML = `<div class="w-label">客戶端 → PE（ingress）</div><div class="hdr">${m.inF.map(f => tag(...f)).join('')}</div>
        <div class="w-label">PE → 供應商網路</div><div class="hdr">${m.outF.map(f => tag(...f)).join('')}</div><div class="log">${m.desc}</div>`;
    });
    box.appendChild(out);

    S.diagram(root.querySelector('#d-storm'), {
      title: 'Storm control 的設定與硬體套用',
      w: 1000, h: 220,
      nodes: [
        { id: 'cfg', x: 20, y: 80, w: 190, h: 60, label: 'CONFIG_DB', sub: 'PORT_STORM_CONTROL', kind: 'db', info: '<p>key 為 <code>&lt;port&gt;|&lt;type&gt;</code>，type 為 broadcast、unknown-unicast、unknown-multicast。</p>' },
        { id: 'po', x: 280, y: 80, w: 190, h: 60, label: 'PolicerOrch', sub: '(orchagent)', kind: 'proc', info: '<p>為每個 port × 類型建立一個 SAI POLICER（mode storm control、meter type bytes、CIR = kbps × 1000 / 8），並設定到 port 屬性。</p>' },
        { id: 'adb', x: 540, y: 80, w: 190, h: 60, label: 'ASIC_DB', sub: 'POLICER + PORT 屬性', kind: 'db', info: '<p><code>SAI_PORT_ATTR_BROADCAST_STORM_CONTROL_POLICER_ID</code>、<code>FLOOD_…</code>（unknown unicast）、<code>MULTICAST_…</code>。</p>' },
        { id: 'asic', x: 800, y: 80, w: 180, h: 60, label: 'ASIC 入口 policer', kind: 'hw', info: '<p>超過速率的 BUM 封包在入口丟棄；已知單播不受影響。</p>' },
      ],
      edges: [{ from: 'cfg', to: 'po', id: 'e1' }, { from: 'po', to: 'adb', id: 'e2' }, { from: 'adb', to: 'asic', label: 'syncd', id: 'e3' }],
    });
  },
  related: ['vlan', 'stp', 'vxlan', 'qos'],
  refs: [['IEEE 802.1ad（Provider Bridges）', 'https://standards.ieee.org/ieee/802.1ad/3238/'], ['SONiC Storm Control HLD', 'https://github.com/sonic-net/SONiC/blob/master/doc/storm-control/storm_control_hld.md'], ['Enterprise SONiC User Guide UG460：§7.13–7.14、§8.6–8.7、§16.11', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
