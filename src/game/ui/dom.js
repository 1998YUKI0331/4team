export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * 게임 UI 의 뿌리 엘리먼트.
 * 단독 페이지일 때는 document 지만, 지도 앱 안에 컴포넌트로 얹힐 때는
 * 게임 컨테이너로 좁혀야 #overlay·#toasts 가 엉뚱한 곳을 잡지 않는다.
 */
let uiRoot = null;

export function setUiRoot(el) {
  uiRoot = el;
  overlayHost = null;   // 뿌리가 바뀌면 캐시한 호스트를 버린다
  toastHost = null;
}

const scope = () => uiRoot ?? document;

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'data' && typeof v === 'object') for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat(3)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

/**
 * node.append(null) 은 "null" 이라는 텍스트를 붙여버린다.
 * 조건부 자식을 그대로 넘길 수 있도록 걸러주는 래퍼.
 */
export function add(parent, ...children) {
  for (const c of children.flat(3)) {
    if (c == null || c === false || c === '') continue;
    parent.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return parent;
}

export function show(node, on = true) {
  if (on) node.removeAttribute('hidden'); else node.setAttribute('hidden', '');
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────────── 토스트 ───────────────────────── */

let toastHost = null;
export function toast(text, kind = '', ms = 2600) {
  toastHost ??= $('#toasts', scope());
  if (!toastHost) return null;
  const n = el('div', { class: `toast ${kind}` }, text);
  toastHost.append(n);
  setTimeout(() => {
    n.classList.add('out');
    setTimeout(() => n.remove(), 320);
  }, ms);
  // 화면을 덮지 않도록 최대 4개 유지
  while (toastHost.children.length > 4) toastHost.firstElementChild.remove();
  return n;
}

/* ───────────────────────── 모달 ───────────────────────── */

let overlayHost = null;

/**
 * 모달을 띄우고, 사용자가 고른 값으로 resolve 되는 Promise 를 돌려준다.
 * build(resolve) 가 모달 DOM 을 만든다.
 */
export function modal(build, { dismissible = false } = {}) {
  overlayHost ??= $('#overlay', scope());
  return new Promise((resolve) => {
    const done = (v) => {
      overlayHost.setAttribute('hidden', '');
      clear(overlayHost);
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = (e) => {
      if (dismissible && e.key === 'Escape') { e.preventDefault(); done(null); }
    };
    const node = build(done);
    clear(overlayHost);
    overlayHost.append(node);
    overlayHost.removeAttribute('hidden');
    document.addEventListener('keydown', onKey);
    if (dismissible) {
      overlayHost.addEventListener('click', (e) => { if (e.target === overlayHost) done(null); }, { once: true });
    }
    requestAnimationFrame(() => node.querySelector('[autofocus], .btn.primary, button')?.focus());
  });
}

/** 도넛형 점수 링 SVG */
export function ring(value, max, { size = 66, stroke = 7, color = '#ffc76b' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const k = Math.max(0, Math.min(1, value / max));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

  const mk = (attrs) => {
    const p = document.createElementNS(ns, 'circle');
    for (const [k2, v] of Object.entries(attrs)) p.setAttribute(k2, v);
    return p;
  };
  svg.append(mk({
    cx: size / 2, cy: size / 2, r, fill: 'none',
    stroke: 'rgba(255,255,255,0.09)', 'stroke-width': stroke,
  }));
  const fg = mk({
    cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color,
    'stroke-width': stroke, 'stroke-linecap': 'round',
    'stroke-dasharray': c, 'stroke-dashoffset': c * (1 - k),
    transform: `rotate(-90 ${size / 2} ${size / 2})`,
  });
  fg.style.transition = 'stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1)';
  svg.append(fg);
  return svg;
}
