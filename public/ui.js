// רכיבי ממשק ועזרי DOM.
// הכל נבנה דרך createElement עם textContent, בלי innerHTML - גם לאבטחה וגם כדי לעמוד ב-CSP.

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = v; // בשימוש רק לאייקוני SVG קבועים מהקוד
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  return node;
}

/**
 * הוספת צמתים להורה תוך דילוג על ערכים ריקים.
 * append של הדפדפן ממיר null למילה "null" על המסך, ולכן לא מוסיפים ישירות.
 */
export function mount(parent, ...nodes) {
  for (const n of nodes.flat()) if (n) parent.append(n);
  return parent;
}

export const frag = (children) => {
  const f = document.createDocumentFragment();
  for (const c of [].concat(children)) if (c) f.append(c);
  return f;
};

// ---------- רכיבים ----------

export function card(titleOrOpts, children) {
  const opts = typeof titleOrOpts === 'string' ? { title: titleOrOpts } : titleOrOpts || {};
  const head = opts.title
    ? el('div', { class: 'card__head' }, [
        el('div', { class: 'card__title', text: opts.title }),
        opts.aside || null,
      ])
    : null;
  return el('section', { class: `card ${opts.class || ''}`.trim() }, [head, ...[].concat(children || [])]);
}

export function note(text, kind = 'info', title) {
  const icons = { info: 'ℹ', warn: '⚠', danger: '⚠', teal: '✓' };
  return el('div', { class: `note note--${kind}` }, [
    el('span', { class: 'note__icon', text: icons[kind] ?? 'ℹ', 'aria-hidden': 'true' }),
    el('div', {}, [title ? el('strong', { text: title + ' ' }) : null, ...[].concat(text).map((t) => (typeof t === 'string' ? document.createTextNode(t) : t))]),
  ]);
}

export function noteList(items, kind = 'info', title) {
  return el('div', { class: `note note--${kind}` }, [
    el('span', { class: 'note__icon', text: kind === 'info' ? 'ℹ' : '⚠', 'aria-hidden': 'true' }),
    el('div', {}, [
      title ? el('strong', { text: title }) : null,
      el('ul', {}, items.map((t) => el('li', { text: t }))),
    ]),
  ]);
}

export function field(label, input, hint) {
  return el('label', { class: 'field' }, [
    el('span', { class: 'field__label', text: label }),
    input,
    hint ? el('span', { class: 'field__hint', text: hint }) : null,
  ]);
}

export function input(props = {}) {
  return el('input', { type: 'text', ...props });
}

export function numberInput(props = {}) {
  return el('input', { type: 'number', inputmode: 'decimal', ...props });
}

export function select(options, props = {}) {
  return el(
    'select',
    props,
    options.map((o) => el('option', { value: o.value, selected: o.selected || false, text: o.label })),
  );
}

export function chipGroup(options, { multi = true, selected = [], onToggle } = {}) {
  const chosen = new Set(selected);
  const container = el('div', { class: 'chips', role: multi ? 'group' : 'radiogroup' });
  for (const opt of options) {
    const chip = el('button', {
      type: 'button',
      class: 'chip',
      'aria-pressed': chosen.has(opt.value) ? 'true' : 'false',
      text: opt.label,
      onclick: () => {
        if (multi) {
          if (chosen.has(opt.value)) chosen.delete(opt.value);
          else chosen.add(opt.value);
        } else {
          chosen.clear();
          chosen.add(opt.value);
          for (const c of container.children) c.setAttribute('aria-pressed', 'false');
        }
        chip.setAttribute('aria-pressed', chosen.has(opt.value) ? 'true' : 'false');
        onToggle?.([...chosen]);
      },
    });
    container.append(chip);
  }
  return { node: container, getValue: () => [...chosen] };
}

export function segmented(options, { value, onSelect } = {}) {
  const wrap = el('div', { class: 'segmented' });
  options.forEach((o) => {
    const b = el('button', {
      type: 'button',
      text: o.label,
      'aria-pressed': o.value === value ? 'true' : 'false',
      onclick: () => {
        for (const c of wrap.children) c.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-pressed', 'true');
        onSelect?.(o.value);
      },
    });
    wrap.append(b);
  });
  return wrap;
}

export function button(text, { variant = '', size = '', onClick, block = false, disabled = false, type = 'button' } = {}) {
  const classes = ['btn'];
  if (variant) classes.push(`btn--${variant}`);
  if (size) classes.push(`btn--${size}`);
  if (block) classes.push('btn--block');
  return el('button', { type, class: classes.join(' '), text, disabled, onclick: onClick });
}

export function stat(value, label) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat__value', text: value }),
    el('div', { class: 'stat__label', text: label }),
  ]);
}

export function badge(text, kind = '') {
  return el('span', { class: `badge ${kind ? 'badge--' + kind : ''}`.trim(), text });
}

export function ring(percent, label, sublabel) {
  const pct = Math.max(0, Math.min(100, percent || 0));
  const r = 44;
  const c = 2 * Math.PI * r;
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', '0 0 104 104');
  const track = document.createElementNS(svgNs, 'circle');
  track.setAttribute('class', 'ring__track');
  const fill = document.createElementNS(svgNs, 'circle');
  fill.setAttribute('class', 'ring__fill');
  for (const circle of [track, fill]) {
    circle.setAttribute('cx', '52');
    circle.setAttribute('cy', '52');
    circle.setAttribute('r', String(r));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke-width', '9');
    circle.setAttribute('stroke-linecap', 'round');
  }
  fill.setAttribute('stroke-dasharray', String(c));
  fill.setAttribute('stroke-dashoffset', String(c * (1 - pct / 100)));
  svg.append(track, fill);
  return el('div', { class: 'ring' }, [
    svg,
    el('div', { class: 'ring__label' }, [el('b', { text: label }), sublabel ? el('span', { text: sublabel }) : null]),
  ]);
}

export function progressBar(percent, teal = false) {
  return el('div', { class: 'bar' }, [
    el('div', { class: `bar__fill ${teal ? 'bar__fill--teal' : ''}`.trim(), style: `width:${Math.max(0, Math.min(100, percent))}%` }),
  ]);
}

export function accordion(title, bodyNodes, aside) {
  return el('details', { class: 'acc' }, [
    el('summary', {}, [el('span', { text: title }), aside || null]),
    el('div', {}, [].concat(bodyNodes)),
  ]);
}

export function listItem({ num, title, sub, onClick, aside }) {
  return el('button', { type: 'button', class: 'list-item', onclick: onClick }, [
    num !== undefined ? el('span', { class: 'list-item__num', text: num }) : null,
    el('span', { class: 'list-item__main' }, [
      el('span', { class: 'list-item__title', text: title }),
      sub ? el('span', { class: 'list-item__sub', text: sub }) : null,
    ]),
    aside || el('span', { class: 'list-item__chev', text: '‹' }),
  ]);
}

// ---------- הודעות ----------

export function toast(message, kind = '') {
  const host = document.getElementById('toast-host');
  const node = el('div', { class: `toast ${kind ? 'toast--' + kind : ''}`.trim(), text: message });
  host.append(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .3s';
    setTimeout(() => node.remove(), 320);
  }, kind === 'error' ? 6000 : 3600);
}

// ---------- מגירה תחתונה ----------

export function sheet(title, contentNodes, { onClose } = {}) {
  const backdrop = el('div', { class: 'sheet-backdrop', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const close = () => {
    backdrop.remove();
    document.body.style.overflow = '';
    onClose?.();
  };
  const panel = el('div', { class: 'sheet' }, [
    el('div', { class: 'sheet__handle' }),
    el('div', { class: 'row row--between', style: 'margin-bottom:10px' }, [
      el('h2', { text: title }),
      button('סגור', { variant: 'ghost', size: 'sm', onClick: close }),
    ]),
    ...[].concat(contentNodes),
  ]);
  backdrop.append(panel);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', esc);
    }
  });
  document.body.append(backdrop);
  document.body.style.overflow = 'hidden';
  return { close, panel };
}

// ---------- גרפים (SVG מצויר ביד, בלי ספריות) ----------

export function lineChart(points, { height = 190, teal = false, yLabel = '' } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const w = 320;
  const h = height;
  const pad = { t: 14, r: 10, b: 24, l: 34 };
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'chart');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', yLabel || 'גרף מגמה');

  if (!points || points.length === 0) {
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', String(w / 2));
    t.setAttribute('y', String(h / 2));
    t.setAttribute('text-anchor', 'middle');
    t.textContent = 'אין עוד נתונים להצגה';
    svg.append(t);
    return svg;
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const lo = min - span * 0.12;
  const hi = max + span * 0.12;
  const x = (i) => pad.l + (i * (w - pad.l - pad.r)) / Math.max(1, points.length - 1);
  const y = (v) => pad.t + ((hi - v) * (h - pad.t - pad.b)) / (hi - lo);

  for (let i = 0; i <= 3; i++) {
    const v = lo + ((hi - lo) * i) / 3;
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('class', 'grid-line');
    line.setAttribute('x1', String(pad.l));
    line.setAttribute('x2', String(w - pad.r));
    line.setAttribute('y1', String(y(v)));
    line.setAttribute('y2', String(y(v)));
    svg.append(line);
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', String(w - pad.r));
    t.setAttribute('y', String(y(v) - 3));
    t.setAttribute('text-anchor', 'start');
    t.textContent = v.toFixed(span < 5 ? 1 : 0);
    svg.append(t);
  }

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = document.createElementNS(ns, 'path');
  area.setAttribute('class', 'area');
  area.setAttribute('d', `${d} L${x(points.length - 1)},${h - pad.b} L${x(0)},${h - pad.b} Z`);
  svg.append(area);

  const path = document.createElementNS(ns, 'path');
  path.setAttribute('class', `series ${teal ? 'series--teal' : ''}`.trim());
  path.setAttribute('d', d);
  svg.append(path);

  points.forEach((p, i) => {
    if (points.length > 14 && i % 2 === 1) return;
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('class', 'dot');
    dot.setAttribute('cx', String(x(i)));
    dot.setAttribute('cy', String(y(p.value)));
    dot.setAttribute('r', '2.6');
    svg.append(dot);
  });

  for (const i of [0, points.length - 1]) {
    if (!points[i]?.label) continue;
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', String(x(i)));
    t.setAttribute('y', String(h - 6));
    t.setAttribute('text-anchor', i === 0 ? 'start' : 'end');
    t.textContent = points[i].label;
    svg.append(t);
  }
  return svg;
}

export function barChart(points, { height = 170 } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const w = 320;
  const h = height;
  const pad = { t: 10, r: 8, b: 26, l: 8 };
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'chart');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'גרף עמודות');
  if (!points || points.length === 0) return svg;
  const max = Math.max(...points.map((p) => p.value)) || 1;
  const bw = (w - pad.l - pad.r) / points.length;
  points.forEach((p, i) => {
    const bh = ((h - pad.t - pad.b) * p.value) / max;
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('class', 'bar-rect');
    rect.setAttribute('x', String(pad.l + i * bw + bw * 0.18));
    rect.setAttribute('y', String(h - pad.b - bh));
    rect.setAttribute('width', String(bw * 0.64));
    rect.setAttribute('height', String(Math.max(2, bh)));
    rect.setAttribute('rx', '4');
    svg.append(rect);
    if (p.label) {
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', String(pad.l + i * bw + bw / 2));
      t.setAttribute('y', String(h - 8));
      t.setAttribute('text-anchor', 'middle');
      t.textContent = p.label;
      svg.append(t);
    }
  });
  return svg;
}

// ---------- עזרים ----------

export const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

export function fmtTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function clear(node) {
  while (node.firstChild) node.firstChild.remove();
  return node;
}

export function skeletonScreen(count = 3) {
  return el('div', { class: 'stack' }, Array.from({ length: count }, () => el('div', { class: 'skeleton' })));
}
