/* 共用互動元件：分頁、分段按鈕 */
(function () {
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
