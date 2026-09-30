
// Protobuf 編碼實驗：tag 與 varint
function pbEncoder(host) {
  const box = S.el('div', { class: 'w-box' });
  host.appendChild(box);
  const P = { field: 3, value: '300', name: 'uint_val' };
  const g = S.el('div', { class: 'grid c3' });
  const inp = (k, label, type) => { const i = S.el('input', { type: type || 'text', value: P[k], spellcheck: 'false' }); i.addEventListener('input', () => { P[k] = i.value.trim(); draw(); }); g.appendChild(S.el('label', { class: 'field' }, label, i)); };
  inp('field', '欄位編號（gNMI TypedValue 的 uint_val = 3）', 'number');
  inp('value', '整數值（例如計數器）');
  inp('name', '欄位名稱（JSON 會帶，Protobuf 不帶）');
  box.appendChild(g);
  const out = S.el('div', { style: 'margin-top:12px' });
  box.appendChild(out);
  const hex = n => n.toString(16).padStart(2, '0');
  const varint = v => { const b = []; do { let x = Number(v & 0x7fn); v >>= 7n; if (v > 0n) x |= 0x80; b.push(x); } while (v > 0n); return b; };
  function draw() {
    let v, f = parseInt(P.field, 10);
    try { v = BigInt(P.value); } catch (e) { v = -1n; }
    if (!(f >= 1 && f <= 536870911) || v < 0n || v > 18446744073709551615n) { out.innerHTML = '<div class="log">請輸入 1 以上的欄位編號，以及 0 到 2^64−1 之間的整數。</div>'; return; }
    const tag = varint(BigInt(f) << 3n);   // wire type 0 = varint
    const val = varint(v);
    const json = JSON.stringify({ [P.name || 'value']: Number(v) <= Number.MAX_SAFE_INTEGER ? Number(v) : String(v) });
    const bits = val.map(b => { const s = b.toString(2).padStart(8, '0'); return `<code><b>${s[0]}</b>${s.slice(1)}</code>`; }).join(' ');
    out.innerHTML = `<div class="pipe">
        <div><div class="pl">tag</div><div class="pv mono">${tag.map(hex).join(' ')}</div><div class="ps">(${f} &lt;&lt; 3) | 0（varint）</div></div>
        <div><div class="pl">值（varint）</div><div class="pv mono">${val.map(hex).join(' ')}</div><div class="ps">${val.length} byte</div></div>
        <div><div class="pl">Protobuf 合計</div><div class="pv">${tag.length + val.length} bytes</div></div>
        <div><div class="pl">同內容的 JSON</div><div class="pv">${json.length} bytes</div><div class="ps mono">${S.esc(json)}</div></div></div>
      <div class="log"><div>varint 的每個 byte（粗體是「後面還有」位元，其餘 7 bit 由低位到高位存放數值）：${bits}</div>
      <div>值 ${v} 需要 ${val.length} 個 byte；Protobuf 共 ${tag.length + val.length} bytes，約為 JSON 的 ${Math.round((tag.length + val.length) / json.length * 100)}%。欄位名稱只存在兩端的 .proto 定義裡，不在網路上傳送。</div></div>`;
  }
  draw();
}

S.register({
  id: 'mgmt-api',
  category: 'ops',
  order: 8,
  title: 'REST、RESTCONF 與 gNMI',
  en: 'Northbound APIs: REST / RESTCONF, gNMI, gNOI & Streaming Telemetry',
  summary: '除了 CLI，SONiC 以兩種程式化介面對外：mgmt-framework 容器的 REST / RESTCONF 伺服器，以及 gnmi（telemetry）容器的 gNMI / gNOI 伺服器。兩者都經由 translib 以 YANG 模型（OpenConfig 與 SONiC YANG）讀寫資料庫，gNMI 另外可以直接以資料庫路徑讀取 Redis，並以 Subscribe 串流遙測資料。本章說明認證方式、路徑結構、訂閱模式與實際呼叫範例。',
  meta: [
    ['容器', ['mgmt-framework（rest_server）', 'gnmi / telemetry（telemetry、dialout_client）']],
    ['埠', ['REST：TCP 443', 'gNMI：Enterprise 預設 TCP 8080，社群版常見 50051 / 8080']],
    ['認證', ['password（HTTP Basic / gRPC metadata）', 'JWT（預設有效 3600 秒）', '用戶端憑證（mTLS）']],
    ['規格', ['RFC 8040 RESTCONF', 'RFC 8072 YANG Patch', 'gNMI 0.7 / 0.8', 'gNOI']],
  ],
  tags: ['REST', 'RESTCONF', 'gNMI', 'gNOI', 'telemetry', 'streaming telemetry', 'Subscribe', 'SAMPLE', 'ON_CHANGE', 'POLL', 'ONCE', 'TARGET_DEFINED', 'JWT', 'OpenConfig', 'YANG', 'dial-out', 'gnmi_cli', 'curl'],
  keypoints: [
    'REST 與 gNMI 共用 translib：同一個 OpenConfig 路徑在 CLI、REST、gNMI 得到相同的結果，也經過同一套 CVL 驗證與 RBAC。',
    'gNMI 除了 YANG 路徑，還可以用 target 指定資料庫（例如 COUNTERS_DB），直接以「表/key/欄位」讀取 Redis，這是社群版遙測最常用的方式。',
    'Subscribe 有三種模式：ONCE（取一次）、POLL（由用戶端觸發）、STREAM；STREAM 又分 SAMPLE（固定週期）、ON_CHANGE（值改變才送）、TARGET_DEFINED（由伺服器依路徑決定）。',
    '計數器這類持續變化的值適合 SAMPLE；狀態類（oper-status、BGP 狀態）適合 ON_CHANGE。對不支援 ON_CHANGE 的路徑訂閱會被拒絕。',
    'Enterprise SONiC 對 SAMPLE 間隔有下限（min-sample-interval，預設 15 秒，許多路徑為 20 秒），太短的要求會被拒絕。',
  ],
  html: `
<h2>gNMI 與 TLS 立體模型</h2>
<p>把一次 gNMI 連線從頭到尾放進空間裡看：CA 如何簽發憑證、TLS 握手時雙方如何互相驗證、加密通道如何建立，以及 Subscribe、Set 在通道內如何運作。最後一步說明攻擊者為什麼無法竊聽或冒充。</p>
<div id="s3-gnmi"></div>

<h2>協定脈絡：YANG、gNMI、gRPC、Protobuf、HTTP/2</h2>
<p>gNMI 不是單獨一個協定，而是疊在幾個通用技術上的一層。每一層只負責一件事，從上到下依序是：</p>
<table>
<thead><tr><th>層</th><th>負責什麼</th><th>在 gNMI 裡的例子</th><th>白話比喻</th></tr></thead>
<tbody>
<tr><td>YANG / OpenConfig</td><td>資料模型：有哪些路徑、欄位、型別</td><td><code>/interfaces/interface[name=Eth1/1]/state/counters</code></td><td>菜單：規定可以點哪些菜、每道菜叫什麼</td></tr>
<tr><td>gNMI</td><td>操作語意：Capabilities、Get、Set、Subscribe</td><td>SubscribeRequest，mode = SAMPLE，10 秒</td><td>點餐單：我要點什麼、要多久上一次</td></tr>
<tr><td>Protobuf</td><td>編碼：把訊息變成位元組</td><td>欄位編號 + 型別 + 值，例如 <code>18 ac 02</code> 代表 uint_val = 300</td><td>把點餐單寫成廚房看得懂的代碼簡寫</td></tr>
<tr><td>gRPC</td><td>遠端呼叫：呼叫哪個方法、結果如何</td><td><code>/gnmi.gNMI/Subscribe</code>、<code>grpc-status: 7</code></td><td>電話總機：轉到正確分機，最後告訴你辦成了沒</td></tr>
<tr><td>HTTP/2</td><td>傳輸：stream、frame、多工、流量控制</td><td>Subscribe 在 stream 1，Get 在 stream 3，同時進行</td><td>同一條高速公路上有很多車道，車子可以並行</td></tr>
<tr><td>TLS 1.3</td><td>加密與身分驗證</td><td>憑證、mTLS、ALPN 協商 <code>h2</code></td><td>運鈔車</td></tr>
<tr><td>TCP</td><td>可靠、依序的傳輸</td><td>TCP 8080（Enterprise）/ 50051（社群常見）</td><td>掛號郵件：保證送達、依序、不遺失</td></tr>
</tbody></table>
<p><b>歷史脈絡：</b>Google 內部長年使用一套叫 Stubby 的 RPC 系統與 Protocol Buffers（2008 年開源），2015 年以 HTTP/2 為基礎重新設計並開源成 gRPC，同年 HTTP/2 成為標準（RFC 7540，現為 RFC 9113）。營運商在管理大量網路設備時，受夠了 SNMP 輪詢與「抓 CLI 畫面再解析」的做法，於是 OpenConfig 工作小組定義了廠商中立的 YANG 模型，並在 gRPC 之上定義了 gNMI，用來取代這些舊方法。SONiC 也採用了這一整套組合。</p>

<h3>3D 模型：一則訊息穿過每一層</h3>
<div id="s3-grpc"></div>

<h3>gNMI 的服務定義</h3>
<p>gNMI 本身就是一份 Protobuf 檔（gnmi.proto）。其中的 service 區塊定義了四個方法；gRPC 依這份定義自動產生各種程式語言的用戶端與伺服器程式碼：</p>
<pre>service gNMI {
  rpc Capabilities(CapabilityRequest) returns (CapabilityResponse);
  rpc Get(GetRequest) returns (GetResponse);
  rpc Set(SetRequest) returns (SetResponse);
  rpc Subscribe(stream SubscribeRequest) returns (stream SubscribeResponse);
}</pre>
<table>
<thead><tr><th>gRPC 呼叫類型</th><th>說明</th><th>gNMI 的方法</th></tr></thead>
<tbody>
<tr><td>Unary</td><td>送一則請求、收一則回應</td><td>Capabilities、Get、Set</td></tr>
<tr><td>Server streaming</td><td>送一則請求、持續收到多則回應</td><td>—</td></tr>
<tr><td>Client streaming</td><td>持續送出多則請求、最後收一則回應</td><td>—</td></tr>
<tr><td>Bidirectional streaming</td><td>兩端都可以隨時送出訊息</td><td>Subscribe：用戶端可再送 Poll 請求，伺服器持續推送更新</td></tr>
</tbody></table>

<h3>Protobuf 編碼實驗</h3>
<p>Protobuf 不傳欄位名稱，只傳「欄位編號 + 型別」組成的 tag，再接上值。整數用 varint 編碼：每個 byte 用 7 bit 存數值、最高位元表示「後面還有」。所以小的數值只要 1 byte，計數器這類大數值也只多幾個 byte。調整下面的數值，看它實際被編成哪些位元組。</p>
<div id="pbenc"></div>

<h3>HTTP/1.1 與 HTTP/2</h3>
<table>
<thead><tr><th>項目</th><th>HTTP/1.1（REST 常見）</th><th>HTTP/2（gRPC）</th></tr></thead>
<tbody>
<tr><td>格式</td><td>文字</td><td>二進位 frame（HEADERS、DATA、SETTINGS、PING、WINDOW_UPDATE…）</td></tr>
<tr><td>同時多個請求</td><td>一條連線同一時間只處理一個請求，要並行就得開多條連線</td><td>一條連線上多個 stream 交錯傳送（多工）</td></tr>
<tr><td>標頭</td><td>每次完整重送</td><td>HPACK 壓縮，重複的欄位只送索引</td></tr>
<tr><td>長時間串流</td><td>不自然，需要輪詢或另外的機制</td><td>stream 可以一直開著，伺服器持續推送</td></tr>
<tr><td>連線存活</td><td>—</td><td>PING frame；gRPC 用它做 keepalive，偵測斷線</td></tr>
</tbody></table>

<h3>gRPC 狀態碼</h3>
<table>
<thead><tr><th>grpc-status</th><th>名稱</th><th>在 gNMI 常見的原因</th></tr></thead>
<tbody>
<tr><td>0</td><td>OK</td><td>成功</td></tr>
<tr><td>3</td><td>INVALID_ARGUMENT</td><td>路徑不存在、值的型別錯誤、取樣間隔小於 min-sample-interval</td></tr>
<tr><td>4</td><td>DEADLINE_EXCEEDED</td><td>用戶端設的逾時時間內沒有完成（例如 Get 大量資料）</td></tr>
<tr><td>7</td><td>PERMISSION_DENIED</td><td>RBAC：這個使用者的角色不允許此操作</td></tr>
<tr><td>12</td><td>UNIMPLEMENTED</td><td>伺服器不支援這個方法、編碼或訂閱模式</td></tr>
<tr><td>14</td><td>UNAVAILABLE</td><td>連不上、伺服器重啟、TLS 握手失敗後重試</td></tr>
<tr><td>16</td><td>UNAUTHENTICATED</td><td>沒有或無效的帳密、JWT、client 憑證</td></tr>
</tbody></table>
<p class="muted">報告 demo 小技巧：Wireshark 可以依序解析 TLS → HTTP/2 → gRPC → Protobuf。gNMI 走 TLS，需要讓用戶端把會談金鑰寫到 <code>SSLKEYLOGFILE</code>，再在 Wireshark 載入，並在 Protobuf 設定中加入 gnmi.proto，就能看到每則訊息的欄位。</p>

<h2>用白話說 gNMI</h2>
<p><b>一句話：</b>gNMI 是讓程式「訂閱」交換機的狀態、並且能安全地修改設定的標準介面。它跑在 gRPC（HTTP/2）上，資料格式用 Protobuf，欄位名稱依照 YANG / OpenConfig 模型，所以不同廠牌的設備可以用同一套路徑。</p>
<table>
<thead><tr><th>技術名詞</th><th>白話比喻</th></tr></thead>
<tbody>
<tr><td>SNMP 輪詢</td><td>每 5 分鐘打一次電話問「現在幾度？」。兩通電話之間發生的事，你都不知道。</td></tr>
<tr><td>Subscribe · SAMPLE</td><td>訂閱天氣推播：設定好「每 10 秒通知我一次」，之後自動送來，不用一直問。</td></tr>
<tr><td>Subscribe · ON_CHANGE</td><td>保全系統：門一被打開就立刻通知，沒事就不吵你。</td></tr>
<tr><td>Set</td><td>用正式公文改設定：先查你有沒有權限，整份公文全部生效或全部不生效，不會改一半。</td></tr>
<tr><td>YANG / OpenConfig</td><td>大家約定好的表格格式：各家設備的「介面流量」都叫同一個欄位名稱，程式不用為每個廠牌各寫一套。</td></tr>
<tr><td>TLS 加密通道</td><td>運鈔車：路上的人看得到車子開過去，但看不到車裡裝了什麼，也沒辦法偷換。</td></tr>
<tr><td>憑證</td><td>身分證：寫著名字（sw1.example.com）、照片（公鑰）、有效期限，還有發證機關的鋼印。可以公開給任何人看。</td></tr>
<tr><td>CA</td><td>戶政事務所：負責發身分證；大家都信任它的鋼印，所以認得它發的證件。</td></tr>
<tr><td>trust store</td><td>「我只認這幾個機關發的證件」的清單。清單外的機關發的證件一律不收。</td></tr>
<tr><td>私鑰</td><td>本人的印章：只有本人持有，從不交出去。能用它蓋章，就證明你是證件上的那個人。</td></tr>
<tr><td>mTLS（雙向驗證）</td><td>銀行櫃台：行員核對你的身分證，你也確認這是真的銀行，不是假冒的。</td></tr>
<tr><td>JWT</td><td>遊樂園手環：入口驗過一次票，之後一小時內憑手環進出，不用每次都掏票。</td></tr>
<tr><td>min-sample-interval</td><td>店家規定「最多每 15 秒回答一次」，避免有人把交換機的 CPU 問到滿載。</td></tr>
</tbody></table>

<h2>實際情境</h2>
<div class="grid c2">
<div class="card"><b>1. 監控大螢幕：500 台交換機的即時流量</b><p class="muted" style="font-size:13.5px;margin:6px 0 0">以前用 SNMP 每 5 分鐘輪詢一次，短暫的流量尖峰完全看不到，而且輪詢本身就消耗大量 CPU。改用 gNMI：Telegraf 對每台交換機訂閱 <code>/interfaces/interface/state/counters</code>、SAMPLE 每 10 秒，資料寫進 InfluxDB，再由 Grafana 畫圖。交換機主動推送，收集端只要等資料進來。</p></div>
<div class="card"><b>2. 鏈路斷線，一秒內告警</b><p class="muted" style="font-size:13.5px;margin:6px 0 0">對 <code>oper-status</code> 訂閱 ON_CHANGE：port 一斷，STATE_DB 改變，gNMI 立刻推送。SNMP trap 走 UDP，封包遺失就漏掉告警；gNMI 走 TCP，而且連線剛建立時會先送一次完整的目前狀態（sync_response），重連後也不會漏掉。</p></div>
<div class="card"><b>3. 夜間批次修改設定</b><p class="muted" style="font-size:13.5px;margin:6px 0 0">自動化平台要把 200 台交換機的上聯 MTU 改成 9100。對每台送一個 SetRequest，同一個請求內的多筆變更全有或全無；失敗會回傳明確的錯誤碼（例如 PermissionDenied、InvalidArgument），平台可以記錄後重試或回滾。建議先挑一台驗證，再分批推出。</p></div>
<div class="card"><b>4. 憑證過期，監控全部中斷</b><p class="muted" style="font-size:13.5px;margin:6px 0 0">最常見的真實事故：一年前裝的伺服器憑證到期，所有收集器在重連時 TLS 握手失敗，監控畫面一夕全黑。預防方式：SONiC 會在到期前 30 天、14 天送 syslog 告警，要把這些告警接進監控系統；以 <code>crypto cert verify NAME expiry</code> 定期檢查；最好用自動化流程在到期前換發。</p></div>
<div class="card"><b>5. 權限分離：監控帳號只能讀</b><p class="muted" style="font-size:13.5px;margin:6px 0 0">監控用的收集器發一張 CN = <code>telemetry-ro</code> 的 client 憑證，交換機上這個使用者只給 operator 角色。就算收集器被入侵，攻擊者拿這張憑證送 SetRequest 也會被拒絕（PermissionDenied）；要改設定的自動化平台才用有寫入權限的帳號。</p></div>
<div class="card"><b>6. 資安稽核：「管理流量有沒有加密？」</b><p class="muted" style="font-size:13.5px;margin:6px 0 0">可以這樣回答：gNMI 使用 TLS 1.3 加密、以企業 CA 簽發的憑證做雙向驗證（mTLS），使用者依憑證對應到 RBAC 角色；服務只在管理 VRF 開放，並以 ACL 限制來源；不允許 insecure / skip-verify 模式連線。</p></div>
</div>

<h2>報告架構建議</h2>
<ol>
<li><b>為什麼需要 gNMI</b>：SNMP 輪詢的限制（看不到尖峰、耗 CPU、UDP、各廠 MIB 不一）對比串流遙測（情境 1、2）。</li>
<li><b>gNMI 是什麼</b>：四個 RPC——Capabilities、Get、Set、Subscribe；Subscribe 的 ONCE / POLL / STREAM（SAMPLE、ON_CHANGE），可用本章的 Subscribe 時間軸示範。</li>
<li><b>底下的技術</b>：YANG → gNMI → Protobuf → gRPC → HTTP/2 → TLS → TCP 的脈絡（協定堆疊 3D 模型、Protobuf 編碼實驗、HTTP/1.1 與 HTTP/2 對照）。</li>
<li><b>SONiC 內部怎麼做</b>：gnmi 容器 → translib → Redis（CONFIG_DB / STATE_DB / COUNTERS_DB），與 REST、CLI 共用同一套 YANG（本章架構圖、3D 模型第 7–9 步）。</li>
<li><b>安全</b>：憑證與 CA、TLS 握手、mTLS、RBAC、JWT（3D 模型第 2–6 步與第 10 步，搭配上面的白話比喻）。</li>
<li><b>Demo</b>：gnmic capabilities → get → subscribe（見下方實驗指令）。</li>
<li><b>維運重點</b>：憑證生命週期與到期告警、min-sample-interval、管理 VRF 與 ACL、常見錯誤訊息。</li>
</ol>

<h2>報告時的常見問題</h2>
<table>
<thead><tr><th>問題</th><th>回答要點</th></tr></thead>
<tbody>
<tr><td>gNMI 和 REST / RESTCONF 差在哪？</td><td>在 SONiC 裡兩者共用同一套 YANG 模型與 translib，讀寫結果一致。REST 是一問一答；gNMI 可以長時間串流，且 HTTP/2 加 Protobuf 效率較好，適合遙測。</td></tr>
<tr><td>為什麼不繼續用 SNMP？</td><td>SNMP 以輪詢為主、走 UDP、v2c 是明文、各廠 MIB 不一致；gNMI 是推送、走 TCP 加 TLS、以 OpenConfig 統一資料模型。SNMP 仍可並存，逐步移轉。</td></tr>
<tr><td>為什麼選 gRPC 與 HTTP/2，而不是 REST？</td><td>遙測需要長時間、雙向、高頻的串流：HTTP/2 的多工與長連線讓一條連線同時跑多個訂閱；Protobuf 比 JSON 小、解析快；gRPC 由 .proto 自動產生各語言的程式碼，介面有嚴格型別。REST 仍適合一次性的設定與查詢。</td></tr>
<tr><td>Protobuf 看不懂，除錯怎麼辦？</td><td>gnmic 等工具會把回應轉成 JSON 顯示；Wireshark 搭配 SSLKEYLOGFILE 與 gnmi.proto 可以逐欄位解析；gNMI 的值本身也可以選 JSON_IETF 編碼。</td></tr>
<tr><td>要開哪個 port？</td><td>Enterprise SONiC 預設 TCP 8080（<code>ip telemetry port</code> 可改），社群版常見 50051。建議只在管理 VRF 開放，並以 ACL 限制來源 IP。</td></tr>
<tr><td>憑證上的名稱要填什麼？</td><td>伺服器憑證的 SAN 要包含收集器連線時用的名稱或 IP，否則會出現名稱不符；client 憑證的 CN 填交換機上的使用者名稱。</td></tr>
<tr><td>會不會拖垮交換機？</td><td>取樣間隔有下限（min-sample-interval，預設 15 秒，許多路徑為 20 秒）；狀態類資料用 ON_CHANGE，只在變化時送出；大量高頻計數器建議直接以 COUNTERS_DB 路徑訂閱。</td></tr>
<tr><td>憑證過期會怎樣？</td><td>新連線與重連一律 TLS 握手失敗，收集器看到 certificate has expired。已建立的連線不會立刻中斷，但任何斷線重連都會失敗，所以常在維護或重開機後才爆發。</td></tr>
<tr><td>密碼、JWT、憑證要選哪一種？</td><td>手動測試用密碼；自動化程式用 JWT 或 client 憑證。長期運作的收集器建議用 client 憑證（mTLS），不用在程式裡保存密碼，也能以 CN 精準對應權限。</td></tr>
</tbody></table>

<h2>架構</h2>
<div id="d-api"></div>

<h2>認證</h2>
<table>
<thead><tr><th>方式</th><th>REST</th><th>gNMI</th><th>說明</th></tr></thead>
<tbody>
<tr><td>password</td><td>HTTP <code>Authorization: Basic</code></td><td>gRPC metadata 的 username / password</td><td>經由 PAM，因此也適用 TACACS+、RADIUS、LDAP 使用者</td></tr>
<tr><td>JWT</td><td><code>POST /authenticate</code> 取得 token，之後以 <code>Authorization: Bearer</code> 帶入；<code>POST /refresh</code> 更新</td><td>以 gNOI 的認證 RPC 取得 token</td><td>避免每次請求都經過 AAA；token 預設 3600 秒有效，只能在到期前的更新窗口內換發</td></tr>
<tr><td>cert</td><td>用戶端 TLS 憑證</td><td>用戶端 TLS 憑證，CN 為使用者名稱</td><td>需在 security profile 中設定 trust store，見 <a href="#/pki">憑證與 PKI</a></td></tr>
</tbody></table>
<p>預設啟用 password 與 jwt，以 <code>ip rest authentication</code> / <code>ip telemetry authentication</code> 變更。</p>

<h2>路徑與操作</h2>
<table>
<thead><tr><th>操作</th><th>RESTCONF</th><th>gNMI</th></tr></thead>
<tbody>
<tr><td>讀取</td><td><code>GET /restconf/data/&lt;path&gt;</code>，可加 <code>?content=config|nonconfig</code>、<code>depth=</code></td><td><code>Get</code>，type = CONFIG / STATE / OPERATIONAL / ALL</td></tr>
<tr><td>合併更新</td><td><code>PATCH</code></td><td><code>Set</code> update</td></tr>
<tr><td>整體取代</td><td><code>PUT</code></td><td><code>Set</code> replace</td></tr>
<tr><td>建立</td><td><code>POST</code>（父節點下新增子節點）</td><td><code>Set</code> update</td></tr>
<tr><td>刪除</td><td><code>DELETE</code></td><td><code>Set</code> delete</td></tr>
<tr><td>多筆原子變更</td><td>YANG Patch（<code>Content-Type: application/yang-patch+json</code>）</td><td>同一個 <code>SetRequest</code> 內的多個操作</td></tr>
<tr><td>RPC / 動作</td><td><code>POST /restconf/operations/&lt;rpc&gt;</code></td><td>gNOI 服務（System.Reboot、Cert、File…）</td></tr>
<tr><td>串流</td><td>—</td><td><code>Subscribe</code></td></tr>
</tbody></table>
<p>路徑中的 list key 在 RESTCONF 以 <code>=</code> 表示並需 URL 編碼（<code>interface=Eth1%2F1</code>），在 gNMI 以方括號表示（<code>interface[name=Eth1/1]</code>）。</p>

<h2>gNMI Subscribe 模式</h2>
<p>60 秒內，介面 Eth1/1 在第 8 秒 down、第 9 秒 up（一次 flap），第 37 秒再次 down；in-octets 每秒都在增加。選擇訂閱模式，看伺服器在何時送出通知。</p>
<div id="sub"></div>

<h2>Dial-in 與 dial-out</h2>
<table>
<thead><tr><th>模式</th><th>連線方向</th><th>用途</th></tr></thead>
<tbody>
<tr><td>Dial-in</td><td>收集器連到交換機的 gNMI 伺服器並 Subscribe</td><td>最常見；收集器（gnmic、Telegraf、OpenConfig collector）管理訂閱</td></tr>
<tr><td>Dial-out</td><td>交換機的 dialout_client 主動連到收集器並推送</td><td>收集器在防火牆內、交換機無法被連入時；社群版以 CONFIG_DB 的 <code>TELEMETRY_CLIENT</code> 表設定目的地與路徑</td></tr>
</tbody></table>

<h2>範例</h2>
<div id="ex"></div>

<h2>實驗：從零建立 CA 並以 mTLS 連線</h2>
<p>以下用 OpenSSL 在實驗環境建立一個 CA，簽發交換機與收集器的憑證，再以 gnmic 連線。正式環境建議改由交換機自行產生金鑰與 CSR（<code>crypto cert generate request</code>），私鑰不離開交換機。</p>
<pre><span class="c"># 1. 建立實驗用 CA</span>
openssl req -x509 -newkey rsa:3072 -nodes -keyout ca.key -out ca.crt -days 3650 -subj "/CN=Corp Root CA"

<span class="c"># 2. 交換機的金鑰與憑證：SAN 必須包含收集器連線用的名稱與 IP</span>
openssl req -newkey rsa:2048 -nodes -keyout sw1.key -out sw1.csr \\
  -subj "/CN=sw1.example.com" -addext "subjectAltName=DNS:sw1.example.com,IP:10.0.0.1"
openssl x509 -req -in sw1.csr -CA ca.crt -CAkey ca.key -CAcreateserial \\
  -out sw1.crt -days 365 -copy_extensions copy        <span class="c"># OpenSSL 3.0 以上</span>

<span class="c"># 3. 收集器的 client 憑證：CN = 交換機上的使用者名稱</span>
openssl req -newkey rsa:2048 -nodes -keyout admin.key -out admin.csr -subj "/CN=admin"
openssl x509 -req -in admin.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out admin.crt -days 365

<span class="c"># 4. 在 Enterprise SONiC 上安裝（先把 sw1.crt、sw1.key、ca.crt 複製到 home 目錄）</span>
sonic# crypto cert install cert-file home://sw1.crt key-file home://sw1.key
sonic# crypto ca-cert install home://ca.crt
sonic# configure terminal
sonic(config)# crypto trust-store corp ca-cert ca
sonic(config)# crypto security-profile gnmi
sonic(config)# crypto security-profile certificate gnmi sw1
sonic(config)# crypto security-profile trust-store gnmi corp
sonic(config)# ip telemetry security-profile gnmi
sonic(config)# ip telemetry authentication password,jwt,cert
sonic# show ip telemetry
sonic# show crypto security-profile

<span class="c"># 5. 先確認 TLS 握手（看到 Verify return code: 0 (ok) 即代表憑證鏈正確）</span>
openssl s_client -connect sw1.example.com:8080 -CAfile ca.crt -cert admin.crt -key admin.key &lt;/dev/null

<span class="c"># 6. 以 gnmic 連線</span>
G="gnmic -a sw1.example.com:8080 --tls-ca ca.crt --tls-cert admin.crt --tls-key admin.key"
$G capabilities
$G get --path /openconfig-system:system/state
$G subscribe --path "/openconfig-interfaces:interfaces/interface[name=Eth1/1]/state/counters" \\
   --stream-mode sample --sample-interval 20s
$G subscribe --path "/openconfig-interfaces:interfaces/interface[name=Eth1/1]/state/oper-status" \\
   --stream-mode on_change</pre>

<h2>常見錯誤訊息</h2>
<table>
<thead><tr><th>錯誤訊息（收集器端）</th><th>原因</th><th>處理</th></tr></thead>
<tbody>
<tr><td><code>x509: certificate signed by unknown authority</code></td><td>收集器不信任簽發交換機憑證的 CA</td><td>確認 <code>--tls-ca</code> 指向正確的 CA；中繼 CA 要一併提供</td></tr>
<tr><td><code>x509: certificate is valid for X, not Y</code></td><td>連線用的名稱不在憑證的 SAN 內</td><td>改用憑證上的名稱連線，或重新簽發包含該名稱 / IP 的憑證</td></tr>
<tr><td><code>certificate has expired or is not yet valid</code></td><td>憑證過期，或交換機 / 收集器時間錯誤</td><td>換發憑證；檢查兩端的 NTP</td></tr>
<tr><td><code>tls: bad certificate</code>、握手被對方中止</td><td>交換機不接受 client 憑證：不是 trust store 的 CA 簽的，或未啟用 cert 認證</td><td>檢查 <code>crypto security-profile trust-store</code> 與 <code>ip telemetry authentication</code></td></tr>
<tr><td><code>rpc error: code = Unauthenticated</code></td><td>沒有提供或無效的帳密、JWT 過期、CN 對應不到使用者</td><td>確認使用者存在，JWT 在有效期內</td></tr>
<tr><td><code>rpc error: code = PermissionDenied</code></td><td>使用者的角色沒有該操作權限（例如 operator 送 Set）</td><td>調整角色，或改用有權限的帳號</td></tr>
<tr><td><code>InvalidArgument</code>（sample interval）</td><td>取樣間隔小於 min-sample-interval</td><td>加大 sample-interval，或調整 <code>ip telemetry min-sample-interval</code></td></tr>
<tr><td>連線逾時</td><td>port、VRF 或 ACL 不對</td><td>確認 <code>ip telemetry port</code>、<code>ip telemetry vrf</code> 與管理 ACL</td></tr>
</tbody></table>

<h2>設定</h2>
<pre><span class="c"># Enterprise SONiC</span>
sonic(config)# ip rest port 443
sonic(config)# ip rest vrf mgmt
sonic(config)# ip rest authentication password,jwt,cert
sonic(config)# ip rest security-profile mgmt
sonic(config)# ip rest request-limit 10
sonic(config)# ip telemetry port 8080
sonic(config)# ip telemetry vrf mgmt
sonic(config)# ip telemetry authentication password,jwt,cert
sonic(config)# ip telemetry min-sample-interval 15
sonic# show ip rest
sonic# show ip telemetry

<span class="c"># 社群版（CONFIG_DB）</span>
sonic-db-cli CONFIG_DB hset "GNMI|gnmi" port 50051 client_auth true log_level 2
sonic-db-cli CONFIG_DB hset "RESTAPI|config" client_auth password,jwt
sudo systemctl restart gnmi</pre>
`,
  mount(root) {
    S.scenes.gnmi(root.querySelector('#s3-gnmi'));
    S.scenes.grpc(root.querySelector('#s3-grpc'));
    pbEncoder(root.querySelector('#pbenc'));
    S.diagram(root.querySelector('#d-api'), {
      title: '北向介面到資料庫的路徑',
      w: 1000, h: 400,
      groups: [{ x: 250, y: 20, w: 250, h: 150, label: 'mgmt-framework 容器' }, { x: 250, y: 200, w: 250, h: 180, label: 'gnmi 容器' }],
      nodes: [
        { id: 'rc', x: 20, y: 70, w: 170, h: 56, label: 'REST 用戶端', sub: 'curl · Ansible · 程式', kind: 'ext' },
        { id: 'gc', x: 20, y: 250, w: 170, h: 56, label: 'gNMI 收集器', sub: 'gnmic · Telegraf', kind: 'ext' },
        { id: 'rest', x: 280, y: 70, w: 190, h: 56, label: 'rest_server', sub: 'HTTPS 443', kind: 'proc', info: '<p>RESTCONF（RFC 8040）與 SONiC 自訂 REST；處理認證、JWT，將請求交給 translib。</p>' },
        { id: 'gs', x: 280, y: 230, w: 190, h: 56, label: 'gNMI server', sub: 'gRPC · TLS', kind: 'proc', info: '<p>處理 Capabilities / Get / Set / Subscribe 與 gNOI。依路徑的 origin / target 決定走 translib 還是直接讀資料庫。</p>' },
        { id: 'dc', x: 280, y: 310, w: 190, h: 50, label: 'dialout_client', kind: 'proc', info: '<p>主動連到收集器推送資料（dial-out）。</p>' },
        { id: 'tl', x: 560, y: 150, w: 180, h: 60, label: 'translib', sub: 'YANG ↔ Redis · CVL', kind: 'proc', info: '<p>把 OpenConfig / SONiC YANG 路徑轉成資料庫的表與欄位，寫入前由 CVL 驗證，並套用 RBAC。</p>' },
        { id: 'db', x: 800, y: 150, w: 170, h: 60, label: 'Redis', sub: 'CONFIG · STATE · COUNTERS', kind: 'db', info: '<p>設定寫入 CONFIG_DB；狀態、計數器由 STATE_DB、COUNTERS_DB 讀出。</p>' },
      ],
      edges: [
        { from: 'rc', to: 'rest', label: 'HTTPS', id: 'e1' },
        { from: 'gc', to: 'gs', label: 'gRPC', id: 'e2', bi: true },
        { from: 'rest', to: 'tl', id: 'e3' },
        { from: 'gs', to: 'tl', label: 'YANG 路徑', id: 'e4' },
        { from: 'gs', to: 'db', dash: true, label: 'DB 路徑（target=COUNTERS_DB…）', id: 'e5', via: [[640, 258], [885, 258]], lx: 700, ly: 274 },
        { from: 'tl', to: 'db', id: 'e6', bi: true },
        { from: 'dc', to: 'gc', dash: true, label: '推送', id: 'e7', via: [[105, 335]] },
      ],
      steps: [
        { title: 'REST 請求', text: 'rest_server 完成 TLS 與認證後，把 RESTCONF 路徑交給 translib。', nodes: ['rc', 'rest', 'tl', 'db'], edges: ['e1', 'e3', 'e6'] },
        { title: 'gNMI 以 YANG 路徑', text: 'OpenConfig 路徑與 REST 相同，經 translib 轉換並驗證。', nodes: ['gc', 'gs', 'tl', 'db'], edges: ['e2', 'e4', 'e6'] },
        { title: 'gNMI 以資料庫路徑', text: '以 target 指定 COUNTERS_DB 等資料庫時，直接以「表/key」讀 Redis，常用於高頻遙測。', nodes: ['gc', 'gs', 'db'], edges: ['e2', 'e5'] },
        { title: 'Dial-out', text: 'dialout_client 依設定主動連線到收集器並推送訂閱的路徑。', nodes: ['dc', 'gc'], edges: ['e7'] },
      ],
    });

    // ---------- Subscribe 模擬 ----------
    const host = root.querySelector('#sub');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const MODES = ['ONCE', 'POLL', 'STREAM · SAMPLE', 'STREAM · ON_CHANGE', 'STREAM · TARGET_DEFINED'];
    const P = { mode: 2, interval: 20, suppress: false, heartbeat: 0, min: 15 };
    const sh = S.el('span');
    box.appendChild(S.el('div', { class: 'row' }, S.el('span', { class: 'w-label' }, '模式'), sh));
    const fr = S.el('div', { class: 'row', style: 'margin-top:10px;align-items:flex-end' });
    const num = (k, label) => { const i = S.el('input', { type: 'number', value: P[k], min: 0, style: 'width:90px' }); i.addEventListener('input', () => { P[k] = Math.max(0, +i.value || 0); draw(); }); fr.appendChild(S.el('label', { class: 'field' }, label, i)); };
    num('interval', 'sample_interval (秒)');
    num('heartbeat', 'heartbeat_interval (秒，0 = 無)');
    const sb = S.el('button', { class: 'btn sm', onclick: () => { P.suppress = !P.suppress; sb.classList.toggle('on', P.suppress); draw(); } }, 'suppress_redundant');
    fr.appendChild(sb);
    box.appendChild(fr);
    const out = S.el('div', { style: 'margin-top:12px' });
    box.appendChild(out);

    const T = 60;
    const OPER = [[8, 'DOWN'], [9, 'UP'], [37, 'DOWN']];
    S.seg(sh, MODES, i => { P.mode = i; draw(); }, P.mode);
    function sim() {
      const res = { oper: [], oct: [], notes: [], err: null };
      const mode = MODES[P.mode];
      const sampleAt = (lane, changes) => {
        const step = P.interval || P.min;
        const val = t => { let v = 'UP'; changes.forEach(([c, l]) => { if (c <= t) v = l; }); return v; };
        let last = 0;
        for (let t = 0; t <= T; t += step) {
          const changed = lane === 'oct' ? true : val(t) !== val(last);
          const hb = P.heartbeat && t > 0 && (t % P.heartbeat === 0);
          if (t === 0 || !P.suppress || changed || hb) res[lane].push([t, t === 0 ? 'sync' : (!P.suppress || changed) ? 'upd' : 'hb']);
          last = t;
        }
      };
      if (mode === 'ONCE') {
        res.oper.push([0, 'sync']); res.oct.push([0, 'sync']);
        res.notes.push('送出所有路徑目前的值與 sync_response 後，伺服器關閉串流。');
        return res;
      }
      if (mode === 'POLL') {
        [0, 15, 30, 45].forEach(t => { res.oper.push([t, t ? 'upd' : 'sync']); res.oct.push([t, t ? 'upd' : 'sync']); });
        res.notes.push('第 0 秒回傳初始值與 sync_response；之後每當用戶端送出 Poll 訊息（這裡假設第 15、30、45 秒），伺服器回傳一次完整的目前值。第 8–9 秒的 flap 完全看不到。');
        return res;
      }
      if (P.mode === 2 || P.mode === 4) {
        if (P.interval && P.interval < P.min) { res.err = `sample_interval ${P.interval} 秒小於 min-sample-interval ${P.min} 秒，SubscribeRequest 被拒絕（InvalidArgument）。`; return res; }
      }
      if (mode === 'STREAM · SAMPLE') {
        sampleAt('oper', OPER); sampleAt('oct', []);
        res.notes.push(`${P.interval ? '' : 'sample_interval 為 0，由伺服器使用最小間隔。'}每 ${P.interval || P.min} 秒取樣一次。第 8 秒 down、第 9 秒 up 發生在兩次取樣之間，取樣只看到 UP，這次 flap 完全遺失。`);
        if (P.suppress) res.notes.push('suppress_redundant：值沒變的 leaf 不送；oper-status 只在實際改變後的下一次取樣送出' + (P.heartbeat ? `，另外每 ${P.heartbeat} 秒以 heartbeat 強制送一次。` : '。'));
        return res;
      }
      if (mode === 'STREAM · ON_CHANGE') {
        res.oper.push([0, 'sync']);
        OPER.forEach(([t]) => res.oper.push([t, 'upd']));
        if (P.heartbeat) for (let t = P.heartbeat; t <= T; t += P.heartbeat) res.oper.push([t, 'hb']);
        res.octErr = 'in-octets 不支援 ON_CHANGE，對此路徑的訂閱會被拒絕';
        res.notes.push('每次 oper-status 改變都立即送出（第 8、9、37 秒），flap 完整可見。計數器持續變化，不適合也不支援 ON_CHANGE。');
        return res;
      }
      res.oper.push([0, 'sync']); OPER.forEach(([t]) => res.oper.push([t, 'upd']));
      const iv = Math.max(P.interval || P.min, P.min);
      for (let t = 0; t <= T; t += iv) res.oct.push([t, t ? 'upd' : 'sync']);
      res.notes.push(`TARGET_DEFINED 由伺服器依路徑決定：oper-status 以 ON_CHANGE 送出，in-octets 以 SAMPLE（每 ${iv} 秒）送出。訂閱整個介面容器時常用這個模式。`);
      return res;
    }
    function draw() {
      const r = sim();
      const x = t => 110 + t * 10;
      const lane = (y, label, marks, events, err) => {
        let s = `<text x="10" y="${y + 4}" font-size="12" fill="var(--text)" font-weight="600">${label}</text><line x1="${x(0)}" y1="${y}" x2="${x(T)}" y2="${y}" stroke="var(--border-strong)" stroke-width="1"/>`;
        events.forEach(([t, l], i) => { const lo = i > 0 && t - events[i - 1][0] < 4; s += `<line x1="${x(t)}" y1="${y - 14}" x2="${x(t)}" y2="${y + 14}" stroke="var(--faint)" stroke-dasharray="2 2"/><text x="${x(t) + 3}" y="${lo ? y + 24 : y - 16}" font-size="10" font-family="var(--mono)" fill="var(--muted)">${l}</text>`; });
        if (err) return s + `<text x="${x(2)}" y="${y + 20}" font-size="11" fill="var(--bad)">${err}</text>`;
        marks.forEach(([t, k]) => {
          const c = k === 'hb' ? 'var(--warn)' : 'var(--accent)';
          s += k === 'sync' ? `<rect x="${x(t) - 5}" y="${y - 5}" width="10" height="10" fill="${c}"/>` : `<circle cx="${x(t)}" cy="${y}" r="5" fill="${c}"/>`;
        });
        return s;
      };
      let svg = `<svg viewBox="0 0 730 150" style="width:100%;min-width:560px;display:block">`;
      for (let t = 0; t <= T; t += 10) svg += `<text x="${x(t)}" y="140" text-anchor="middle" font-size="10" font-family="var(--mono)" fill="var(--faint)">${t}s</text>`;
      if (r.err) svg += `<text x="${x(0)}" y="70" font-size="12" fill="var(--bad)">${r.err}</text>`;
      else {
        svg += lane(45, 'oper-status', r.oper, OPER, null);
        svg += lane(105, 'in-octets', r.oct, [], r.octErr);
      }
      svg += '</svg>';
      const n = r.oper.length + r.oct.length;
      out.innerHTML = `<div class="dg-canvas" style="border:1px solid var(--border);border-radius:6px;padding:8px 0">${svg}</div>
        <div class="row" style="margin:8px 0;font-size:12.5px;color:var(--muted)"><span><svg width="10" height="10"><rect width="10" height="10" fill="var(--accent)"/></svg> 初始值 + sync_response</span><span><svg width="10" height="10"><circle cx="5" cy="5" r="5" fill="var(--accent)"/></svg> update</span><span><svg width="10" height="10"><circle cx="5" cy="5" r="5" fill="var(--warn)"/></svg> heartbeat</span><span>虛線：實際狀態變化</span>${r.err ? '' : `<span class="badge n">共 ${n} 則通知</span>`}</div>
        <div class="log">${r.err ? `<div>${r.err}</div>` : r.notes.map(t => `<div>${t}</div>`).join('')}</div>`;
    }
    draw();

    S.tabs(root.querySelector('#ex'), [
      { label: 'REST：密碼', html: `<pre>curl -k -u admin:****** \\
  -H "accept: application/yang-data+json" \\
  "https://10.0.0.1/restconf/data/openconfig-interfaces:interfaces/interface=Eth1%2F1/state"</pre>` },
      { label: 'REST：JWT', html: `<pre><span class="c"># 取得 token</span>
curl -k -X POST https://10.0.0.1/authenticate -d '{"username":"admin","password":"******"}'
<span class="c"># {"access_token":"eyJhbGciOi...","token_type":"Bearer","expires_in":3600}</span>

<span class="c"># 以 token 修改 MTU</span>
curl -k -X PATCH -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/yang-data+json" \\
  "https://10.0.0.1/restconf/data/openconfig-interfaces:interfaces/interface=Eth1%2F1/config/mtu" \\
  -d '{"openconfig-interfaces:mtu": 9100}'</pre>` },
      { label: 'REST：YANG Patch', html: `<pre>curl -k -u admin:****** -X PATCH \\
  -H "Content-Type: application/yang-patch+json" \\
  "https://10.0.0.1/restconf/data/sonic-vlan:sonic-vlan" -d '{
  "ietf-yang-patch:yang-patch": {
    "patch-id": "add-vlan-300",
    "edit": [
      { "edit-id": "1", "operation": "create", "target": "/VLAN/VLAN_LIST=Vlan300",
        "value": { "sonic-vlan:VLAN_LIST": [ { "name": "Vlan300", "vlanid": 300 } ] } }
    ]
  }
}'</pre><p class="muted" style="font-size:13px">YANG Patch 的所有 edit 在同一個交易內套用，任何一筆失敗整批都不生效。</p>` },
      { label: 'gNMI：Get / Set', html: `<pre><span class="c"># gnmic（開源用戶端）</span>
gnmic -a 10.0.0.1:8080 -u admin -p ****** --skip-verify \\
  get --path "/openconfig-interfaces:interfaces/interface[name=Eth1/1]/state/oper-status"

gnmic -a 10.0.0.1:8080 -u admin -p ****** --skip-verify \\
  set --update-path "/openconfig-interfaces:interfaces/interface[name=Eth1/1]/config/mtu" --update-value 9100

<span class="c"># 交換機上的測試工具</span>
gnmi_get -xpath /openconfig-system:system/state -target_addr 127.0.0.1:8080 -insecure -username admin -password ******</pre>` },
      { label: 'gNMI：Subscribe', html: `<pre><span class="c"># OpenConfig 路徑，ON_CHANGE</span>
gnmic -a 10.0.0.1:8080 -u admin -p ****** --skip-verify subscribe \\
  --path "/openconfig-interfaces:interfaces/interface[name=Eth1/1]/state/oper-status" \\
  --stream-mode on_change

<span class="c"># 直接讀 COUNTERS_DB（社群版常用），每 20 秒</span>
gnmic -a 10.0.0.1:50051 -u admin -p ****** --skip-verify --target COUNTERS_DB subscribe \\
  --path "COUNTERS/Ethernet0" --stream-mode sample --sample-interval 20s</pre>` },
    ]);
  },
  searchText: 'restconf yang-data+json yang-patch authenticate refresh Bearer token gnmic gnmi_get gnmi_set gnmi_cli gnoi_client Capabilities Get Set Subscribe sync_response heartbeat suppress_redundant sample_interval min-sample-interval dialout TELEMETRY_CLIENT ip rest ip telemetry',
  related: ['pki', 'mgmt-framework', 'aaa', 'counters', 'redis-db'],
  refs: [['RFC 8040 RESTCONF', 'https://www.rfc-editor.org/rfc/rfc8040'], ['RFC 8072 YANG Patch', 'https://www.rfc-editor.org/rfc/rfc8072'], ['gNMI 規格', 'https://github.com/openconfig/reference/blob/master/rpc/gnmi/gnmi-specification.md'], ['sonic-gnmi', 'https://github.com/sonic-net/sonic-gnmi'], ['Enterprise SONiC User Guide UG460：Ch.21–23', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
