/* =========================================================
   互動架構圖引擎
   S.diagram(container, spec)

   spec = {
     title, hint, w, h,
     groups: [{ x, y, w, h, label, kind }],
     nodes:  [{ id, x, y, w, h, label, sub, kind, info }],   // x,y 為左上角
     edges:  [{ from, to, label, dash, bi, via:[[x,y],...], id, lx, ly }],
     steps:  [{ title, text, nodes:[id], edges:['from>to' | id] }],
     legend: true | [kind,...],
     intro:  '預設說明 HTML'
   }
   kind: container | db | proc | kernel | hw | ext | file | cli
   ========================================================= */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const KIND_NAME = {
    container: 'Docker 容器', db: '資料庫 / 表', proc: '程序 / Daemon', kernel: 'Linux Kernel',
    hw: '硬體 / ASIC', ext: '外部 / 使用者', file: '檔案 / 設定', cli: 'CLI / 工具',
  };
  let uid = 0;

  function svg(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* 從中心點射向目標，求與矩形邊界交點 */
  function clip(node, tx, ty, pad) {
    const cx = node.x + node.w / 2, cy = node.y + node.h / 2;
    const dx = tx - cx, dy = ty - cy;
    if (dx === 0 && dy === 0) return [cx, cy];
    const hw = node.w / 2 + pad, hh = node.h / 2 + pad;
    const s = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
    return [cx + dx * s, cy + dy * s];
  }

  function center(n) { return [n.x + n.w / 2, n.y + n.h / 2]; }

  function multiline(parent, text, x, y, cls, lineH) {
    const lines = String(text).split('\n');
    const start = y - ((lines.length - 1) * lineH) / 2;
    lines.forEach((ln, i) => {
      const t = svg('text', { x, y: start + i * lineH, class: cls || null });
      t.textContent = ln;
      parent.appendChild(t);
    });
  }

  function edgeKey(e) { return e.id || (e.from + '>' + e.to); }

  S.diagram = function (container, spec) {
    const id = 'dg' + (++uid);
    const W = spec.w || 1000, H = spec.h || 560;
    const nodes = {};
    (spec.nodes || []).forEach(n => { nodes[n.id] = n; });

    const root = S.el('div', { class: 'dg' });
    const head = S.el('div', { class: 'dg-head' },
      S.el('span', { class: 'dg-title' }, spec.title || '架構圖'),
      S.el('span', { class: 'dg-hint' }, spec.hint || (spec.steps && !spec.noControls ? '點選元件查看說明，或逐步播放資料流' : '點選元件查看說明')));
    const canvas = S.el('div', { class: 'dg-canvas' });
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': spec.title || '架構圖' });
    canvas.appendChild(s);

    // arrow markers
    const defs = svg('defs', {});
    [['n', 'var(--muted)'], ['h', 'var(--accent)']].forEach(([k, c]) => {
      const m = svg('marker', { id: `${id}-a${k}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
      const p = svg('path', { d: 'M0,0 L10,5 L0,10 z' });
      p.style.fill = c;
      m.appendChild(p); defs.appendChild(m);
    });
    s.appendChild(defs);

    // groups
    (spec.groups || []).forEach(g => {
      const gg = svg('g', { class: 'grp' });
      gg.style.setProperty('--g', `var(--k-${g.kind || 'container'})`);
      gg.appendChild(svg('rect', { x: g.x, y: g.y, width: g.w, height: g.h, rx: 12 }));
      const t = svg('text', { x: g.x + 12, y: g.y + 20 });
      t.textContent = g.label;
      gg.appendChild(t);
      s.appendChild(gg);
    });

    // edges
    const edgeEls = {};
    const edgeLayer = svg('g', {});
    s.appendChild(edgeLayer);
    (spec.edges || []).forEach(e => {
      const a = nodes[e.from], b = nodes[e.to];
      if (!a || !b) { console.warn('diagram edge missing node', e); return; }
      const via = e.via || [];
      const firstT = via.length ? via[0] : center(b);
      const lastF = via.length ? via[via.length - 1] : center(a);
      const p1 = clip(a, firstT[0], firstT[1], 2);
      const p2 = clip(b, lastF[0], lastF[1], 4);
      const pts = [p1, ...via, p2];
      const d = 'M' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L');
      const g = svg('g', { class: 'edge' + (e.dash ? ' dash' : '') });
      const path = svg('path', { d, 'marker-end': `url(#${id}-an)`, 'marker-start': e.bi ? `url(#${id}-an)` : null });
      g.appendChild(path);
      if (e.label) {
        // 標籤放在最長線段中點
        let best = 0, bl = -1;
        for (let i = 0; i < pts.length - 1; i++) {
          const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
          if (l > bl) { bl = l; best = i; }
        }
        const lx = e.lx != null ? e.lx : (pts[best][0] + pts[best + 1][0]) / 2;
        const ly = e.ly != null ? e.ly : (pts[best][1] + pts[best + 1][1]) / 2;
        const lines = String(e.label).split('\n');
        const wmax = Math.max(...lines.map(l => l.length)) * 6.6 + 10;
        g.appendChild(svg('rect', { class: 'lbg', x: lx - wmax / 2, y: ly - lines.length * 7.5 - 1, width: wmax, height: lines.length * 15 + 2, rx: 4 }));
        multiline(g, e.label, lx, ly, null, 14);
      }
      edgeLayer.appendChild(g);
      edgeEls[edgeKey(e)] = { g, path, e };
    });

    // nodes
    const nodeEls = {};
    (spec.nodes || []).forEach(n => {
      const g = svg('g', { class: 'node ' + (n.kind || 'proc'), tabindex: 0, role: 'button', 'aria-label': n.label.replace(/\n/g, ' ') });
      g.style.setProperty('--k', `var(--k-${n.kind || 'proc'})`);
      g.appendChild(svg('rect', { x: n.x, y: n.y, width: n.w, height: n.h, rx: n.kind === 'db' ? 4 : 9 }));
      if (n.kind === 'db') {
        // 資料庫：頂部加一條細線，像磁碟圓柱
        const l = svg('line', { x1: n.x + 4, x2: n.x + n.w - 4, y1: n.y + 6, y2: n.y + 6 });
        l.style.stroke = 'var(--k)'; l.style.strokeWidth = 1; l.style.opacity = .6;
        g.appendChild(l);
      }
      const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
      if (n.sub) {
        // 主標題與副標題視為一個區塊置中
        const nl = n.label.split('\n').length, ns = n.sub.split('\n').length;
        const y0 = cy - (nl * 16 + ns * 13 + 2) / 2;
        multiline(g, n.label, cx, y0 + nl * 8 + 1, null, 16);
        multiline(g, n.sub, cx, y0 + nl * 16 + 3 + ns * 6.5, 'sub', 13);
      } else {
        multiline(g, n.label, cx, cy + 1, null, 16);
      }
      g.addEventListener('click', () => selectNode(n.id));
      g.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectNode(n.id); } });
      s.appendChild(g);
      nodeEls[n.id] = g;
    });

    root.appendChild(head);
    root.appendChild(canvas);

    // legend
    if (spec.legend !== false) {
      const kinds = Array.isArray(spec.legend) ? spec.legend : [...new Set((spec.nodes || []).map(n => n.kind || 'proc'))];
      const lg = S.el('div', { class: 'dg-legend' });
      kinds.forEach(k => {
        const i = S.el('i'); i.style.setProperty('--k', `var(--k-${k})`);
        lg.appendChild(S.el('span', null, i, KIND_NAME[k] || k));
      });
      if (spec.edges && spec.edges.some(e => e.dash)) lg.appendChild(S.el('span', null, S.el('span', { html: '<svg width="22" height="6"><path d="M0 3h22" stroke="currentColor" stroke-dasharray="4 3"/></svg>' }), '通知 / 間接互動'));
      root.appendChild(lg);
    }

    // panel
    const panel = S.el('div', { class: 'dg-panel' });
    const stepsBox = S.el('div', { class: 'dg-steps' });
    const desc = S.el('div', { class: 'dg-desc', 'aria-live': 'polite' });
    const steps = spec.steps || [];
    let cur = -1, timer = null;

    let prevBtn, nextBtn, playBtn, dots;
    if (steps.length && !spec.noControls) {
      prevBtn = S.el('button', { class: 'btn sm', onclick: () => go(cur - 1) }, '上一步');
      nextBtn = S.el('button', { class: 'btn sm primary', onclick: () => go(cur + 1) }, '下一步');
      playBtn = S.el('button', { class: 'btn sm', onclick: togglePlay }, '自動播放');
      const reset = S.el('button', { class: 'btn sm', onclick: () => { stop(); go(-1); } }, '重設');
      dots = S.el('div', { class: 'dg-dots' });
      steps.forEach((st, i) => dots.appendChild(S.el('button', { title: st.title, onclick: () => { stop(); go(i); } }, String(i + 1))));
      stepsBox.appendChild(S.el('div', { class: 'dg-ctrl' }, prevBtn, nextBtn, playBtn, reset, dots));
    }
    stepsBox.appendChild(desc);
    panel.appendChild(stepsBox);
    root.appendChild(panel);

    function clearHL() {
      s.classList.remove('dimmed');
      Object.values(nodeEls).forEach(g => g.classList.remove('hl', 'sel'));
      Object.values(edgeEls).forEach(x => { x.g.classList.remove('hl'); x.path.setAttribute('marker-end', `url(#${id}-an)`); if (x.e.bi) x.path.setAttribute('marker-start', `url(#${id}-an)`); });
    }
    function hlEdge(k) {
      const x = edgeEls[k];
      if (!x) { console.warn('diagram step edge missing', k); return; }
      x.g.classList.add('hl');
      x.path.setAttribute('marker-end', `url(#${id}-ah)`);
      if (x.e.bi) x.path.setAttribute('marker-start', `url(#${id}-ah)`);
    }

    function showIntro() {
      desc.innerHTML = spec.intro || (steps.length && !spec.noControls
        ? `<span class="muted">共 ${steps.length} 個步驟。按「下一步」開始逐步播放，或點選任一元件查看其職責。</span>`
        : '<span class="muted">點選圖中任一元件，此處顯示其職責與相關資料。</span>');
    }

    function go(i) {
      clearHL();
      cur = Math.max(-1, Math.min(steps.length - 1, i));
      if (dots) [...dots.children].forEach((d, j) => { d.classList.toggle('on', j === cur); d.classList.toggle('past', j < cur); });
      if (prevBtn) { prevBtn.disabled = cur <= -1; nextBtn.disabled = cur >= steps.length - 1; }
      if (cur < 0) { showIntro(); return; }
      const st = steps[cur];
      s.classList.add('dimmed');
      (st.nodes || []).forEach(n => nodeEls[n] && nodeEls[n].classList.add('hl'));
      (st.edges || []).forEach(hlEdge);
      desc.innerHTML = `<div class="st">${spec.noControls ? '' : `<span class="sn">${cur + 1}/${steps.length}</span>`}${st.title}</div><div>${st.text || ''}</div>`;
      if (cur >= steps.length - 1) stop();
    }

    function togglePlay() {
      if (timer) { stop(); return; }
      if (cur >= steps.length - 1) go(-1);
      playBtn.textContent = '暫停';
      go(cur + 1);
      timer = setInterval(() => { if (cur >= steps.length - 1) stop(); else go(cur + 1); }, spec.interval || 3200);
    }
    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
      if (playBtn) playBtn.textContent = '自動播放';
    }

    function selectNode(nid) {
      stop();
      const n = nodes[nid];
      clearHL();
      if (dots) [...dots.children].forEach(d => d.classList.remove('on', 'past'));
      cur = -1;
      if (prevBtn) { prevBtn.disabled = true; nextBtn.disabled = false; }
      s.classList.add('dimmed');
      nodeEls[nid].classList.add('sel');
      // 同時亮起相鄰節點與連線
      Object.values(edgeEls).forEach(({ e }) => {
        if (e.from === nid || e.to === nid) {
          hlEdge(edgeKey(e));
          const other = e.from === nid ? e.to : e.from;
          nodeEls[other] && nodeEls[other].classList.add('hl');
        }
      });
      desc.innerHTML = `<div class="nt" style="--k:var(--k-${n.kind || 'proc'})"><i></i>${S.esc(n.label.replace(/\n/g, ' '))}<span class="kind">${KIND_NAME[n.kind || 'proc'] || ''}</span></div><div>${n.info || '<span class="muted">（此節點無額外說明）</span>'}</div>`;
    }

    go(-1);
    container.appendChild(root);
    return { go, selectNode, root };
  };
})();
