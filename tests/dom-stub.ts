// שכבת DOM מינימלית לבדיקות רינדור בצד הלקוח, בלי דפדפן ובלי תלויות חיצוניות.
// המטרה אינה לדמות דפדפן אמיתי אלא לאמת שהמסכים נבנים בלי שגיאות
// ושהתוכן שמגיע מה-API אכן מופיע בעץ ה-DOM.

class ClassList {
  node: El;
  constructor(node: El) {
    this.node = node;
  }
  get list(): string[] {
    return (this.node.className || '').split(/\s+/).filter(Boolean);
  }
  add(...names: string[]) {
    this.node.className = [...new Set([...this.list, ...names])].join(' ');
  }
  remove(...names: string[]) {
    this.node.className = this.list.filter((c) => !names.includes(c)).join(' ');
  }
  contains(name: string) {
    return this.list.includes(name);
  }
}

export class El {
  tagName: string;
  className = '';
  children: El[] = [];
  parentElement: El | null = null;
  attributes: Record<string, string> = {};
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  listeners: Record<string, Array<(e: any) => void>> = {};
  classList: ClassList;
  value = '';
  checked = false;
  disabled = false;
  hidden = false;
  #text = '';

  constructor(tagName: string) {
    this.tagName = tagName.toLowerCase();
    this.classList = new ClassList(this);
  }

  set textContent(v: string) {
    this.#text = String(v ?? '');
    this.children = [];
  }
  get textContent(): string {
    if (this.children.length === 0) return this.#text;
    return this.#text + this.children.map((c) => c.textContent).join('');
  }
  set innerHTML(v: string) {
    // בבדיקות אין מנתח HTML. זה בשימוש רק לאייקוני SVG קבועים מהקוד.
    this.attributes['data-html'] = v;
  }
  get firstChild(): El | null {
    return this.children[0] ?? null;
  }
  setAttribute(k: string, v: string) {
    this.attributes[k] = String(v);
  }
  getAttribute(k: string) {
    return this.attributes[k] ?? null;
  }
  removeAttribute(k: string) {
    delete this.attributes[k];
  }
  append(...nodes: Array<El | string>) {
    for (const n of nodes) {
      if (typeof n === 'string') {
        this.children.push(Object.assign(new El('#text'), { textContent: n }));
        continue;
      }
      if (n.tagName === '#fragment') {
        for (const c of n.children) {
          c.parentElement = this;
          this.children.push(c);
        }
        continue;
      }
      n.parentElement = this;
      this.children.push(n);
    }
  }
  appendChild(n: El) {
    this.append(n);
    return n;
  }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
    this.parentElement = null;
  }
  replaceWith(other: El) {
    if (!this.parentElement) return;
    const idx = this.parentElement.children.indexOf(this);
    if (idx >= 0) {
      other.parentElement = this.parentElement;
      this.parentElement.children[idx] = other;
    }
  }
  addEventListener(type: string, fn: (e: any) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener() {}
  dispatch(type: string, event: any = {}) {
    for (const fn of this.listeners[type] ?? []) fn({ target: this, preventDefault() {}, ...event });
  }
  /** עובר על כל הצאצאים - לשימוש בשאילתות ובבדיקות. */
  *walk(): Generator<El> {
    for (const c of this.children) {
      yield c;
      yield* c.walk();
    }
  }
  querySelectorAll(selector: string): El[] {
    const match = (n: El) => {
      if (selector.startsWith('.')) return n.classList.contains(selector.slice(1));
      if (selector.startsWith('#')) return n.attributes.id === selector.slice(1);
      if (selector.includes('[')) {
        const [tag, rest] = selector.split('[');
        const [attr, raw] = rest.replace(']', '').split('=');
        const want = raw?.replace(/['"]/g, '');
        return (!tag || n.tagName === tag) && (want === undefined ? attr! in n.attributes : n.attributes[attr!] === want);
      }
      return n.tagName === selector;
    };
    return [...this.walk()].filter(match);
  }
  querySelector(selector: string): El | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  get allText(): string {
    return this.textContent;
  }
  click() {
    this.dispatch('click');
  }
  focus() {}
  scrollTo() {}
}

const VOID_TAGS = new Set(['input', 'br', 'hr', 'img', 'meta', 'link', 'source']);
const SVG_TAGS = new Set(['svg', 'circle', 'path', 'rect', 'line', 'text', 'g', 'polyline']);

/** סריאליזציה של עץ הצמתים ל-HTML. משמשת להפקת תצוגה מקדימה סטטית של העיצוב. */
export function serialize(node: El): string {
  if (node.tagName === '#text') return escapeHtml(node.textContent);
  if (node.tagName === '#fragment') return node.children.map(serialize).join('');

  const attrs: string[] = [];
  if (node.className) attrs.push(`class="${escapeHtml(node.className)}"`);
  for (const [k, v] of Object.entries(node.attributes)) {
    if (k === 'data-html') continue;
    attrs.push(v === '' ? k : `${k}="${escapeHtml(v)}"`);
  }
  for (const [k, v] of Object.entries(node.dataset)) attrs.push(`data-${k}="${escapeHtml(v)}"`);
  if (node.hidden) attrs.push('hidden');
  if (node.checked) attrs.push('checked');
  if (node.disabled) attrs.push('disabled');
  if (node.value && node.tagName === 'input' && !node.attributes.value) attrs.push(`value="${escapeHtml(node.value)}"`);

  const open = `<${node.tagName}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;
  if (VOID_TAGS.has(node.tagName)) return open;

  const inner =
    (node.attributes['data-html'] ?? '') +
    (node.children.length === 0 ? escapeHtml(node.textContent) : node.children.map(serialize).join(''));
  // SVG מוטבע ב-HTML אינו דורש xmlns - הפרסר מטפל במרחב השמות לפי התג.
  return `${open}${inner}</${node.tagName}>`;
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function installDom(fetchBase: string) {
  const body = new El('body');
  const toastHost = new El('div');
  toastHost.setAttribute('id', 'toast-host');
  body.append(toastHost);

  const documentStub: any = {
    body,
    documentElement: new El('html'),
    createElement: (tag: string) => new El(tag),
    createElementNS: (_ns: string, tag: string) => new El(tag),
    createTextNode: (t: string) => Object.assign(new El('#text'), { textContent: t }),
    createDocumentFragment: () => new El('#fragment'),
    getElementById: (id: string) => (id === 'toast-host' ? toastHost : body.querySelector(`#${id}`)),
    querySelector: (s: string) => body.querySelector(s),
    querySelectorAll: (s: string) => body.querySelectorAll(s),
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const store = new Map<string, string>();
  const g = globalThis as any;
  // חלק מהגלובלים ב-Node מוגדרים כ-getter בלבד, ולכן מגדירים אותם מחדש במפורש.
  const define = (name: string, value: unknown) =>
    Object.defineProperty(g, name, { value, configurable: true, writable: true });

  define('document', documentStub);
  define('window', {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    scrollTo: () => {},
    addEventListener: () => {},
  });
  define('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
  define('navigator', { userAgent: 'node-test', vibrate: () => {} });
  define('history', { pushState() {}, replaceState() {} });
  define('location', { hash: '' });

  // fetch יחסי -> מוחלט מול השרת של הבדיקה, עם העברת עוגיות
  const realFetch = g.fetch.bind(g);
  const cookieJar = { value: '' };
  g.fetch = async (url: string, init: any = {}) => {
    const absolute = String(url).startsWith('http') ? String(url) : `${fetchBase}${url}`;
    const headers = { ...(init.headers ?? {}) };
    if (cookieJar.value) headers.cookie = cookieJar.value;
    const res = await realFetch(absolute, { ...init, headers });
    const sc = res.headers.get('set-cookie');
    if (sc) cookieJar.value = sc.split(';')[0]!;
    return res;
  };

  return { body, toastHost, cookieJar, document: documentStub, restore: () => { g.fetch = realFetch; } };
}
