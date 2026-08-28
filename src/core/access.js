/** Roles, sections, demo accounts and the permission matrix. */

export const ROLES = [
  { key: 'admin',      label: 'ผู้ดูแลระบบ',      person: 'ณัฐพล ส.',    short: 'ณพ' },
  { key: 'purchasing', label: 'พนักงานจัดซื้อ',   person: 'กมลชนก ท.',   short: 'กช' },
  { key: 'store',      label: 'พนักงานคลัง',      person: 'ธีรภัทร อ.',  short: 'ธภ' },
  { key: 'kitchen',    label: 'ครัว / ฝ่ายผลิต',  person: 'เชฟกวิน ร.',  short: 'กว' },
  { key: 'qa',         label: 'QA / คุณภาพ',      person: 'อรุณี พ.',    short: 'อณ' },
  { key: 'exec',       label: 'ผู้บริหาร',        person: 'ปิยะ ม.',     short: 'ปย' }
];

/** Sections that appear as columns in the permission matrix. */
export const SECTIONS = [
  { key: 'dash',    label: 'ภาพรวม' },
  { key: 'receive', label: 'รับเข้า' },
  { key: 'stock',   label: 'คงเหลือ' },
  { key: 'issue',   label: 'เบิกออก' },
  { key: 'output',  label: 'ผลผลิต' },
  { key: 'recipe',  label: 'สูตร BOM' },
  { key: 'master',  label: 'ซัพพลายเออร์' },
  { key: 'moves',   label: 'รายงาน' },
  { key: 'branch',  label: 'สาขา' }
];

/**
 * Demo credentials.
 *
 * NOTE: authentication here is client-side and for demonstration only. Wiring
 * this to a real identity provider means replacing `authenticate` below — the
 * rest of the app only reads the resulting `{ user, role, branch }`.
 */
export const ACCOUNTS = [
  { user: 'admin',    pass: '1234', role: 'admin',      branch: 'ALL' },
  { user: 'purchase', pass: '1234', role: 'purchasing', branch: 'ALL' },
  { user: 'store',    pass: '1234', role: 'store',      branch: 'BR-01' },
  { user: 'chef',     pass: '1234', role: 'kitchen',    branch: 'BR-01' },
  { user: 'siam',     pass: '1234', role: 'store',      branch: 'BR-02' },
  { user: 'qa',       pass: '1234', role: 'qa',         branch: 'ALL' },
  { user: 'exec',     pass: '1234', role: 'exec',       branch: 'ALL' }
];

export const PERM_ORDER = ['none', 'view', 'edit'];

export const PERM_LABELS = {
  edit: 'แก้ไขได้',
  view: 'ดูอย่างเดียว',
  none: 'ไม่เห็นเมนู'
};

/** Factory so each store gets its own mutable copy. */
export function defaultPerms() {
  return {
    admin:      { dash: 'edit', receive: 'edit', stock: 'edit', issue: 'edit', output: 'edit', recipe: 'edit', master: 'edit', moves: 'edit', branch: 'edit' },
    purchasing: { dash: 'view', receive: 'edit', stock: 'view', issue: 'edit', output: 'none', recipe: 'none', master: 'view', moves: 'view', branch: 'view' },
    store:      { dash: 'view', receive: 'edit', stock: 'view', issue: 'edit', output: 'view', recipe: 'view', master: 'view', moves: 'view', branch: 'view' },
    kitchen:    { dash: 'view', receive: 'none', stock: 'view', issue: 'edit', output: 'edit', recipe: 'view', master: 'none', moves: 'view', branch: 'none' },
    qa:         { dash: 'view', receive: 'view', stock: 'view', issue: 'none', output: 'view', recipe: 'edit', master: 'view', moves: 'view', branch: 'view' },
    exec:       { dash: 'view', receive: 'view', stock: 'view', issue: 'none', output: 'view', recipe: 'view', master: 'view', moves: 'view', branch: 'view' }
  };
}

export function roleByKey(key) {
  return ROLES.find(r => r.key === key) || ROLES[0];
}

/** Returns the matching account, or null. */
export function authenticate(username, password) {
  const u = String(username || '').trim().toLowerCase();
  const acc = ACCOUNTS.find(a => a.user === u);
  return acc && acc.pass === password ? acc : null;
}

/** The first section a role is allowed to open. */
export function firstViewFor(perms, role) {
  const p = perms[role] || {};
  return ['dash'].concat(SECTIONS.map(s => s.key)).find(k => p[k] !== 'none') || 'dash';
}
