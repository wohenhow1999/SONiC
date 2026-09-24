/* 共用互動元件：小測驗、分頁、分段按鈕 */
(function () {
  /* 小測驗
     S.quiz(el, [{ q, options:[...], answer: index, explain }]) */
  S.quiz = function (container, items) {
    const box = S.el('div', { class: 'quiz' });
    const score = S.el('div', { class: 'quiz-score' });
    let answered = 0, right = 0;
    function upd() {
      score.textContent = answered === items.length
        ? `🎉 完成！答對 ${right} / ${items.length} 題` + (right === items.length ? '，全對，太強了！' : '，可以回頭看看說明再試一次。')
        : `已作答 ${answered} / ${items.length} 題`;
    }
    items.forEach((it, qi) => {
      const q = S.el('div', { class: 'q' });
      q.appendChild(S.el('div', { class: 'q-t' }, `Q${qi + 1}. `, S.el('span', { html: it.q })));
      const opts = S.el('div', { class: 'opts' });
      const btns = it.options.map((o, oi) => {
        const b = S.el('button', { class: 'opt', html: String.fromCharCode(65 + oi) + '. ' + o });
        b.addEventListener('click', () => {
          btns.forEach(x => (x.disabled = true));
          btns[it.answer].classList.add('right');
          if (oi !== it.answer) b.classList.add('wrong'); else right++;
          answered++;
          q.classList.add('answered');
          upd();
        });
        opts.appendChild(b);
        return b;
      });
      q.appendChild(opts);
      q.appendChild(S.el('div', { class: 'exp', html: '💡 ' + (it.explain || '') }));
      box.appendChild(q);
    });
    const reset = S.el('button', { class: 'btn sm', onclick: () => { container.innerHTML = ''; S.quiz(container, items); } }, '↺ 重新作答');
    box.appendChild(S.el('div', { class: 'row' }, score, reset));
    upd();
    container.appendChild(box);
  };

  /* 分頁：S.tabs(el, [{ label, html }]) */
  S.tabs = function (container, tabs) {
    const root = S.el('div', { class: 'tabs' });
    const bar = S.el('div', { class: 'tabs-bar', role: 'tablist' });
    const body = S.el('div', { class: 'tabs-body' });
    const btns = tabs.map((t, i) => {
      const b = S.el('button', { role: 'tab', onclick: () => show(i) }, t.label);
      bar.appendChild(b);
      return b;
    });
    function show(i) {
      btns.forEach((b, j) => b.classList.toggle('on', i === j));
      body.innerHTML = tabs[i].html;
      if (tabs[i].mount) tabs[i].mount(body);
    }
    root.appendChild(bar); root.appendChild(body);
    container.appendChild(root);
    show(0);
  };

  /* 分段按鈕：S.seg(el, ['A','B'], onChange, initial) */
  S.seg = function (container, labels, onChange, initial) {
    const seg = S.el('div', { class: 'seg' });
    const btns = labels.map((l, i) => {
      const b = S.el('button', { onclick: () => set(i) }, l);
      seg.appendChild(b);
      return b;
    });
    function set(i) {
      btns.forEach((b, j) => b.classList.toggle('on', i === j));
      onChange(i);
    }
    container.appendChild(seg);
    set(initial || 0);
    return { set };
  };
})();
