S.register({
  id: 'protection',
  category: 'svc',
  order: 4,
  title: 'BFD、Link State Tracking 與鏈路保護',
  en: 'BFD, Link State Tracking, UDLD & Link Protection',
  summary: '協定的 hold timer 通常以秒計，BFD 可在數百毫秒內偵測轉送路徑失效並通知 BGP、OSPF、PIM、靜態路由。Link state tracking 在上聯失效時關閉下行介面，讓雙歸屬的下游改走另一台；UDLD 偵測單向鏈路；link-error disable 隔離頻繁翻動的介面。',
  meta: [
    ['程序', ['bfdd（FRR）', 'BfdOrch（硬體 BFD offload）', 'link state tracking / UDLD / errdisable（Enterprise）']],
    ['CONFIG_DB', ['BFD_PEER / BFD 相關表', 'INTF_TRACKING（LST）', 'UDLD', 'ERRDISABLE']],
    ['SAI', ['BFD_SESSION（硬體 offload）']],
    ['協定', ['BFD single-hop UDP 3784', 'multi-hop UDP 4784', 'echo UDP 3785', 'RFC 5880 / 5881 / 5883']],
  ],
  tags: ['BFD', 'fast failover', 'link state tracking', 'LST', 'UDLD', 'IP SLA', 'errdisable', 'link flap', 'detection time'],
  keypoints: [
    'BFD 偵測時間 = 對端的 detect multiplier × 協商後的接收間隔（max(本端 required min RX, 對端 desired min TX)）。',
    'BFD 本身不影響路由，它只把 session down 事件通知註冊的協定，由協定立即撤除鄰居與路由。',
    'SONiC 預設由 FRR bfdd 以軟體處理 BFD；支援的平台可把 session 交給 ASIC（SAI BFD_SESSION）處理，達到更短的間隔且不受 CPU 負載影響。',
    'Link state tracking 以群組定義 upstream 與 downstream 介面：所有 upstream down 時 downstream 被關閉，upstream 恢復後等 timeout 再開啟。',
    'UDLD 以週期性 echo 確認雙向可達，偵測光纖單向故障；aggressive 模式在失去對端時直接 err-disable。',
  ],
  html: `
<h2>BFD</h2>
<table>
<thead><tr><th>參數</th><th>說明</th></tr></thead>
<tbody>
<tr><td>Desired min TX interval</td><td>本端希望的送出間隔</td></tr>
<tr><td>Required min RX interval</td><td>本端能接受的最短接收間隔</td></tr>
<tr><td>Detect multiplier</td><td>連續遺失幾個封包視為失效</td></tr>
<tr><td>Echo mode</td><td>送出以自己為目的的封包由對端直接迴送（只經轉發平面），可進一步縮短偵測時間</td></tr>
<tr><td>Passive mode</td><td>不主動發起，等待對端</td></tr>
<tr><td>Single-hop / multi-hop</td><td>直連鄰居使用 UDP 3784 並要求 TTL 255；loopback 之間使用 multi-hop（UDP 4784）</td></tr>
</tbody></table>
<h3>偵測時間計算</h3>
<div id="bfd"></div>

<h2>Link state tracking</h2>
<p>典型用途：leaf 的上聯（到 spine）全部失效時，關閉接伺服器的下行 port（或 MCLAG），讓伺服器的 bonding 改用另一台 leaf，而不是把流量送進一台已經與網路隔離的交換機。</p>
<div id="lst"></div>

<h2>其他保護機制</h2>
<table>
<thead><tr><th>功能</th><th>作用</th><th>Enterprise SONiC</th></tr></thead>
<tbody>
<tr><td>UDLD</td><td>以週期性訊息確認對端也看得到自己；normal 模式只記錄，aggressive 模式把 port err-disable</td><td><code>udld enable</code>、<code>udld aggressive</code>、<code>udld message-time</code>、<code>udld multiplier</code></td></tr>
<tr><td>IP SLA</td><td>定期以 ICMP / TCP 探測目標，結果可用來追蹤靜態路由等</td><td><code>ip sla 1</code> → <code>icmp-echo 10.0.0.1</code></td></tr>
<tr><td>Link-error disable</td><td>取樣期間內 link flap 次數超過門檻即 err-disable，避免不穩定鏈路反覆觸發路由收斂</td><td><code>link-error-disable flap-threshold 10 sampling-interval 3</code></td></tr>
<tr><td>Errdisable recovery</td><td>err-disabled 的 port 在指定時間後自動嘗試恢復（原因可為 bpduguard、udld、link flap…）</td><td><code>errdisable recovery cause bpduguard</code>、<code>errdisable recovery interval 300</code></td></tr>
</tbody></table>

<h2>設定</h2>
<pre><span class="c"># Enterprise SONiC：BFD profile 與協定整合</span>
sonic(config)# bfd
sonic(config-bfd)# profile FAST
sonic(config-bfd-profile)# detect-multiplier 3
sonic(config-bfd-profile)# receive-interval 100
sonic(config-bfd-profile)# transmit-interval 100
sonic(config-bfd)# peer 10.1.1.1 interface Eth1/3
sonic(config-bfd-peer)# profile FAST
sonic(config)# router bgp 65101
sonic(config-router-bgp)# neighbor 10.1.1.1
sonic(config-router-bgp-neighbor)# bfd
sonic(config)# interface Eth1/1
sonic(config-if-Eth1/1)# ip ospf bfd
sonic(config-if-Eth1/1)# ip pim bfd
sonic# show bfd peers

<span class="c"># Enterprise SONiC：link state tracking</span>
sonic(config)# link state track UPLINKS
sonic(config-link-track)# timeout 300
sonic(config-link-track)# downstream all-mclag
sonic(config)# interface Eth1/49
sonic(config-if-Eth1/49)# link state track UPLINKS upstream
sonic(config)# interface Eth1/50
sonic(config-if-Eth1/50)# link state track UPLINKS upstream
sonic# show link state tracking UPLINKS

<span class="c"># 社群版：BFD 透過 FRR</span>
vtysh -c "conf t" -c "router bgp 65101" -c "neighbor 10.1.1.1 bfd"
vtysh -c "show bfd peers"</pre>
`,
  mount(root) {
    const host = root.querySelector('#bfd');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const P = { ltx: 300, lrx: 300, lm: 3, rtx: 300, rrx: 300, rm: 3, hold: 9 };
    const F = [['ltx', '本端 desired min TX (ms)'], ['lrx', '本端 required min RX (ms)'], ['lm', '本端 multiplier'], ['rtx', '對端 desired min TX (ms)'], ['rrx', '對端 required min RX (ms)'], ['rm', '對端 multiplier'], ['hold', 'BGP hold time (秒)']];
    const g = S.el('div', { class: 'grid c3' });
    F.forEach(([k, l]) => {
      const inp = S.el('input', { id: 'bfd-' + k, type: 'number', value: P[k], min: 1 });
      inp.addEventListener('input', () => { P[k] = Math.max(1, +inp.value || 1); draw(); });
      g.appendChild(S.el('label', { class: 'field', for: 'bfd-' + k }, l, inp));
    });
    box.appendChild(g);
    const out = S.el('div');
    box.appendChild(out);
    function draw() {
      const localRxInt = Math.max(P.lrx, P.rtx); // 本端實際收到封包的間隔
      const remoteRxInt = Math.max(P.rrx, P.ltx);
      const localDetect = P.rm * localRxInt; // 本端偵測對端失效
      const remoteDetect = P.lm * remoteRxInt;
      out.innerHTML = `<div class="pipe" style="margin-top:12px">
        <div><div class="pl">對端 → 本端 間隔</div><div class="pv">${localRxInt} ms</div><div class="ps">max(本端 RX, 對端 TX)</div></div>
        <div><div class="pl">本端偵測時間</div><div class="pv">${localDetect} ms</div><div class="ps">對端 multiplier × 間隔</div></div>
        <div><div class="pl">對端偵測時間</div><div class="pv">${remoteDetect} ms</div><div class="ps">本端 multiplier × 間隔</div></div>
        <div><div class="pl">BGP hold timer</div><div class="pv">${P.hold * 1000} ms</div><div class="ps">沒有 BFD 時的偵測時間</div></div></div>
        <div class="log">本端最快在 <b>${localDetect} ms</b> 內偵測到對端失效，比 BGP hold timer 快約 ${Math.max(1, Math.round(P.hold * 1000 / localDetect))} 倍。${localRxInt < 100 ? '<br>間隔低於 100 ms 時，軟體 BFD 容易受 CPU 負載影響而誤判，建議使用硬體 offload 或 echo mode。' : ''}</div>`;
    }
    draw();

    const lh = root.querySelector('#lst');
    const lbox = S.el('div', { class: 'w-box' });
    lh.appendChild(lbox);
    const up = { 'Eth1/49': true, 'Eth1/50': true };
    let recovering = false;
    function ldraw() {
      lbox.innerHTML = '';
      const allDown = Object.values(up).every(v => !v);
      const row = S.el('div', { class: 'row' }, S.el('span', { class: 'w-label' }, 'upstream'));
      Object.keys(up).forEach(k => row.appendChild(S.el('button', { class: 'btn sm' + (up[k] ? ' on' : ''), onclick: () => { const was = Object.values(up).every(v => !v); up[k] = !up[k]; recovering = was && up[k]; ldraw(); } }, S.el('span', { class: 'dot ' + (up[k] ? 'up' : 'down') }), `${k}（到 spine）`)));
      lbox.appendChild(row);
      const down = allDown || recovering;
      lbox.appendChild(S.el('div', { class: 'grid c3', style: 'margin-top:10px' },
        ...['PortChannel10（server1）', 'PortChannel11（server2）', 'Eth1/5（server3）'].map(n => S.el('div', { class: 'card' }, S.el('b', { class: 'mono', style: 'font-size:13px;display:block' }, n), S.el('div', { class: 'row', style: 'margin-top:8px' }, S.el('span', { class: 'badge ' + (down ? 'r' : 'g') }, down ? 'down (LST)' : 'up'), S.el('span', { class: 'muted', style: 'font-size:12px' }, 'downstream'))))));
      lbox.appendChild(S.el('div', { class: 'log', style: 'margin-top:10px', html: allDown ? '所有 upstream 介面都 down：群組觸發，downstream 介面被關閉。伺服器偵測到鏈路中斷，bonding 改用連到另一台 leaf 的鏈路。' : recovering ? `upstream 已恢復，但 downstream 會等待 timeout（300 秒）再啟用，讓路由協定先收斂。<button class="btn sm" id="lst-skip">略過等待</button>` : '至少一個 upstream 為 up，downstream 維持正常。' }));
      const sk = lbox.querySelector('#lst-skip');
      if (sk) sk.addEventListener('click', () => { recovering = false; ldraw(); });
    }
    ldraw();
  },
  related: ['bgp', 'ospf', 'mclag', 'stp'],
  refs: [['RFC 5880 BFD', 'https://www.rfc-editor.org/rfc/rfc5880'], ['FRR BFD 文件', 'https://docs.frrouting.org/en/latest/bfd.html'], ['SONiC hardware BFD HLD', 'https://github.com/sonic-net/SONiC/blob/master/doc/bfd/BFD_Enhancement_HLD.md'], ['Enterprise SONiC User Guide UG460：Ch.19', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
