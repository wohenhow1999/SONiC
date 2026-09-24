S.register({
  id: 'build',
  category: 'ops',
  order: 5,
  icon: '🏗️',
  title: '建置與安裝映像',
  en: 'Build & Install',
  summary: '從 sonic-buildimage 原始碼編出安裝檔，透過 ONIE 安裝到交換機，再用 sonic-installer 升級與切換版本。了解 SONiC 映像在硬碟上的樣子。',
  tags: ['sonic-buildimage', 'ONIE', 'sonic-installer', 'squashfs', 'sonic-vs', 'KVM'],
  features: ['建置與安裝流程圖', 'sonic-installer 模擬器'],
  html: `
<h2>從原始碼到交換機</h2>
<div id="d-build"></div>

<h2>自己編一個 SONiC</h2>
<pre><span class="c"># 1. 取得原始碼（包含大量 submodule：sonic-swss、sonic-sairedis、sonic-utilities…）</span>
git clone --recurse-submodules https://github.com/sonic-net/sonic-buildimage.git
cd sonic-buildimage
<span class="c"># 2. 初始化</span>
make init
<span class="c"># 3. 選擇平台（broadcom / mellanox / marvell / vs …）</span>
make configure PLATFORM=vs
<span class="c"># 4. 編譯（會在 sonic-slave 容器中進行，需要大量磁碟與時間）</span>
make SONIC_BUILD_JOBS=4 target/sonic-vs.img.gz
<span class="c">#    硬體平台則是例如：make target/sonic-broadcom.bin</span></pre>
<div class="callout tip"><div class="ct">💡 想在電腦上玩 SONiC？</div><p><b>sonic-vs</b>（Virtual Switch）是用軟體 SAI（saivs）模擬 ASIC 的版本，可以用 KVM 或 Docker（docker-sonic-vs）跑起來，非常適合學習與開發測試，不需要買交換機。</p></div>

<h2>硬碟上的映像</h2>
<p>SONiC 支援同時安裝多個版本，每個版本放在 <code>/host/image-&lt;version&gt;/</code>，GRUB 決定開哪一個：</p>
<pre>/host/
├── grub/grub.cfg                  <span class="c"># 開機選單</span>
├── image-202311.3/
│   ├── fs.squashfs                <span class="c"># 唯讀的根檔案系統</span>
│   ├── docker/                    <span class="c"># 這個版本的 Docker 映像與容器</span>
│   ├── rw/                        <span class="c"># overlayfs 可寫層（對根目錄的修改存在這裡）</span>
│   └── boot/ (vmlinuz, initrd)
├── image-202405.1/  …
└── machine.conf                   <span class="c"># ONIE 提供的平台資訊</span></pre>
<p class="muted"><code>/etc/sonic/</code>（含 config_db.json）在升級時會被遷移到新映像。</p>

<h2>互動：sonic-installer</h2>
<div id="inst"></div>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-build'), {
      title: '建置 → 安裝 → 升級',
      w: 1000, h: 460,
      nodes: [
        { id: 'repo', x: 20, y: 40, w: 180, h: 60, label: 'sonic-buildimage', sub: 'git + submodules', kind: 'file', info: '<p>SONiC 的主建置倉庫，透過 submodule 引入 sonic-swss、sonic-sairedis、sonic-utilities、sonic-platform-daemons 等上百個元件。</p>' },
        { id: 'conf', x: 230, y: 40, w: 170, h: 60, label: 'make configure', sub: 'PLATFORM=broadcom', kind: 'cli', info: '<p>選擇目標平台，決定要打包哪個廠商的 SAI、syncd 映像與平台驅動。</p>' },
        { id: 'slave', x: 430, y: 40, w: 170, h: 60, label: 'sonic-slave 容器', sub: 'Debian 建置環境', kind: 'container', info: '<p>所有編譯都在固定版本的 Debian 建置容器（例如 sonic-slave-bookworm）中進行，確保可重現。</p>' },
        { id: 'pkg', x: 630, y: 40, w: 160, h: 60, label: '.deb / .whl', sub: 'swss、sairedis…', kind: 'file', info: '<p>各元件先編成 Debian 套件與 Python wheel。</p>' },
        { id: 'img', x: 630, y: 150, w: 160, h: 60, label: 'Docker 映像', sub: 'docker-orchagent.gz…', kind: 'container', info: '<p>把套件裝進各功能的 Docker 映像。</p>' },
        { id: 'bin', x: 820, y: 95, w: 160, h: 60, label: 'sonic-*.bin', sub: 'ONIE 安裝檔', kind: 'file', info: '<p>自解壓安裝檔，內含 kernel、squashfs 根檔案系統與所有 Docker 映像。VS 平台則產生 sonic-vs.img.gz。</p>' },
        { id: 'onie', x: 820, y: 270, w: 160, h: 60, label: 'ONIE', sub: 'onie-nos-install', kind: 'ext', info: '<p>Open Network Install Environment：白牌交換機出廠內建的小型安裝環境，可以從 HTTP/TFTP/USB 下載並安裝任何 NOS。<code>onie-nos-install http://…/sonic-broadcom.bin</code></p>' },
        { id: 'inst', x: 600, y: 380, w: 180, h: 60, label: 'sonic-installer', sub: '線上升級', kind: 'cli', info: '<p>在執行中的 SONiC 上安裝新版本：<code>sudo sonic-installer install sonic-broadcom.bin</code>，完成後重開機（或 warm/fast reboot）進入新版。</p>' },
        { id: 'new', x: 400, y: 270, w: 190, h: 60, label: '/host/image-202405.1', sub: '新映像', kind: 'file', info: '<p>新版本安裝到獨立目錄，舊版本保留，可以隨時切回。</p>' },
        { id: 'old', x: 190, y: 270, w: 190, h: 60, label: '/host/image-202311.3', sub: '舊映像', kind: 'file', info: '<p>目前或先前的版本。</p>' },
        { id: 'grub', x: 20, y: 270, w: 150, h: 60, label: 'GRUB', sub: '選擇開機映像', kind: 'kernel', info: '<p>sonic-installer 修改 grub.cfg 的預設項目（set-default / set-next-boot）。</p>' },
      ],
      edges: [
        { from: 'repo', to: 'conf', id: 'b1' }, { from: 'conf', to: 'slave', id: 'b2' }, { from: 'slave', to: 'pkg', id: 'b3' },
        { from: 'pkg', to: 'img', id: 'b4' }, { from: 'img', to: 'bin', id: 'b5' }, { from: 'pkg', to: 'bin', id: 'b5b' },
        { from: 'bin', to: 'onie', label: '首次安裝', id: 'i1' }, { from: 'onie', to: 'new', id: 'i2' },
        { from: 'bin', to: 'inst', label: '升級', id: 'u1', via: [[900, 230], [690, 230]] }, { from: 'inst', to: 'new', id: 'u2' },
        { from: 'grub', to: 'old', dash: true, id: 'g1' }, { from: 'grub', to: 'new', dash: true, id: 'g2', via: [[95, 360], [485, 360]] },
      ],
      steps: [
        { title: '取得原始碼並選平台', text: '<code>make init</code> 拉 submodule，<code>make configure PLATFORM=…</code> 選擇平台。', nodes: ['repo', 'conf'], edges: ['b1'] },
        { title: '在 slave 容器中編譯', text: '產生各元件的 .deb / .whl，再打包成各功能的 Docker 映像。', nodes: ['conf', 'slave', 'pkg', 'img'], edges: ['b2', 'b3', 'b4'] },
        { title: '產生安裝檔', text: '所有東西被包成一個 ONIE 相容的 <code>sonic-&lt;platform&gt;.bin</code>。', nodes: ['pkg', 'img', 'bin'], edges: ['b5', 'b5b'] },
        { title: '首次安裝（ONIE）', text: '新交換機開機進 ONIE，下載 .bin 並安裝到硬碟。', nodes: ['bin', 'onie', 'new'], edges: ['i1', 'i2'] },
        { title: '線上升級（sonic-installer）', text: '在執行中的 SONiC 安裝新版到新目錄，設為下次開機預設，然後 reboot。', nodes: ['bin', 'inst', 'new', 'grub'], edges: ['u1', 'u2', 'g2'] },
      ],
    });

    // sonic-installer 模擬
    const host = root.querySelector('#inst');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    let st = { imgs: ['SONiC-OS-202311.3', 'SONiC-OS-202405.1'], cur: 'SONiC-OS-202405.1', def: 'SONiC-OS-202405.1', next: 'SONiC-OS-202405.1' };
    const log = [];
    function out(cmd, text) { log.unshift(`<div><span class="p">admin@sonic:~$</span> <span class="cmd">${cmd}</span>\n${text}</div>`); draw(); }
    function list() { return `Current: ${st.cur}\nNext: ${st.next}\nAvailable:\n${st.imgs.join('\n')}`; }
    function draw() {
      box.innerHTML = '';
      const row = S.el('div', { class: 'row' });
      row.appendChild(S.el('button', { class: 'btn sm', onclick: () => out('sudo sonic-installer list', list()) }, 'list'));
      row.appendChild(S.el('button', { class: 'btn sm', disabled: st.imgs.includes('SONiC-OS-202411.1'), onclick: () => {
        st.imgs.push('SONiC-OS-202411.1'); st.def = st.next = 'SONiC-OS-202411.1';
        out('sudo sonic-installer install sonic-broadcom-202411.bin', 'Installing image SONiC-OS-202411.1 and setting it as default...\nCommand: bash ./sonic-broadcom-202411.bin\nVerifying image checksum ... OK.\nInstalling SONiC to /host/image-202411.1\nCommand: grub-set-default --boot-directory=/host 0\nDone');
      } }, 'install 202411.1'));
      st.imgs.forEach(im => {
        if (im !== st.next) row.appendChild(S.el('button', { class: 'btn sm', onclick: () => { st.next = im; out('sudo sonic-installer set-next-boot ' + im, `（只影響下一次開機）`); } }, 'set-next-boot ' + im.replace('SONiC-OS-', '')));
      });
      st.imgs.forEach(im => {
        if (im !== st.cur && im !== st.next) row.appendChild(S.el('button', { class: 'btn sm', onclick: () => { st.imgs = st.imgs.filter(x => x !== im); out('sudo sonic-installer remove ' + im + ' -y', `Image removed: /host/image-${im.replace('SONiC-OS-', '')}`); } }, 'remove ' + im.replace('SONiC-OS-', '')));
      });
      row.appendChild(S.el('button', { class: 'btn sm primary', onclick: () => { const prev = st.cur; st.cur = st.next; st.next = st.def; out('sudo reboot', `... 重新開機 ...\n${prev === st.cur ? '仍然是' : '已從 ' + prev + ' 切換到'} ${st.cur}\n$ show version | grep "SONiC Software"\nSONiC Software Version: ${st.cur.replace('-OS', '')}`); } }, '🔄 reboot'));
      box.appendChild(row);
      const g = S.el('div', { class: 'grid c3', style: 'margin-top:12px' });
      st.imgs.forEach(im => g.appendChild(S.el('div', { class: 'card', style: `box-shadow:none;${im === st.cur ? 'border:2px solid var(--good)' : ''}` },
        S.el('div', { class: 'mono' }, S.el('b', null, im)), S.el('div', { class: 'muted mono', style: 'font-size:12px' }, '/host/image-' + im.replace('SONiC-OS-', '')),
        S.el('div', { class: 'row', style: 'margin-top:4px' }, im === st.cur ? S.el('span', { class: 'badge g' }, '目前執行中') : null, im === st.next ? S.el('span', { class: 'badge b' }, '下次開機') : null, im === st.def ? S.el('span', { class: 'badge y' }, '預設') : null))));
      box.appendChild(g);
      const t = S.el('div', { class: 'term-out', style: 'background:var(--code-bg);border-radius:8px;margin-top:10px;max-height:260px' });
      t.innerHTML = log.length ? log.join('') : '<span class="dim">點上方按鈕試試：install → reboot → set-next-boot 回舊版 → reboot（只有這次）→ 再 reboot。</span>';
      box.appendChild(t);
    }
    draw();
  },
  keypoints: [
    'sonic-buildimage 是主建置倉庫，make configure 選平台，在 sonic-slave 容器中編譯。',
    '產物是 ONIE 相容的 sonic-<platform>.bin；虛擬平台產生 sonic-vs.img.gz。',
    '每個版本安裝在 /host/image-<version>/，以唯讀 squashfs + overlayfs 可寫層組成。',
    'sonic-installer install / set-default / set-next-boot / remove 管理多版本，方便升級與回滾。',
  ],
  quiz: [
    { q: '全新的白牌交換機要安裝 SONiC，通常透過？', options: ['sonic-installer', 'ONIE', 'apt-get', 'Docker'], answer: 1, explain: 'ONIE 是白牌交換機內建的 NOS 安裝環境。' },
    { q: 'set-next-boot 與 set-default 的差別？', options: ['沒有差別', 'set-next-boot 只影響下一次開機，之後回到 default', 'set-default 只影響下一次', 'set-next-boot 會立即重開機'], answer: 1, explain: 'set-next-boot 適合試新版本，重開一次後自動回到預設版本。' },
    { q: '不買交換機也能跑 SONiC 學習，應該用？', options: ['sonic-vs（virtual switch）', 'minigraph', 'ONIE', 'pmon'], answer: 0, explain: 'sonic-vs 用軟體 SAI 模擬 ASIC，可在 KVM 或 Docker 中執行。' },
  ],
  related: ['reboot', 'containers', 'overview'],
  refs: [['sonic-buildimage', 'https://github.com/sonic-net/sonic-buildimage'], ['ONIE', 'https://opencomputeproject.github.io/onie/']],
});
