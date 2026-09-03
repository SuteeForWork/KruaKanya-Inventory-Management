/** Roles, sections, demo accounts and the permission matrix. */

export const ROLES = [
  { key: 'admin',      label: 'ผู้ดูแลระบบ',      person: 'ณัฐพล ส.',    short: 'ณพ' },
  { key: 'purchasing', label: 'พนักงานจัดซื้อ',   person: 'กมลชนก ท.',   short: 'กช' },
  { key: 'store',      label: 'พนักงานคลัง',      person: 'ธีรภัทร อ.',  short: 'ธภ' },
  { key: 'kitchen',    label: 'ครัว / ฝ่ายผลิต',  person: 'เชฟกวิน ร.',  short: 'กว' },
  { key: 'qa',         label: 'QA / คุณภาพ',      person: 'อรุณี พ.',    short: 'อณ' },
  { key: 'exec',       label: 'ผู้บริหาร',        person: 'ปิยะ ม.',     short: 'ปย' }
];

/**
 * Replaces ROLES' contents in place from rows loaded via db.getRoles() —
 * every existing `roleByKey(key)` / `ROLES.map(...)` call site picks up the
 * change automatically, since they all read this same array reference (no
 * threading state through views needed). Reassigns STAFF_ROLES too: as a
 * `let` export, every module that imported it sees the new value on next
 * access — that's how ES module live bindings work, unlike a plain object
 * property.
 *
 * `short` (the 2-character avatar initial) isn't stored in the database;
 * it's derived here so admin never has to fill in one more field just to
 * add a role.
 */
export function setRoles(rows) {
  if (!rows || !rows.length) return; // offline, or migration 005 not run yet — keep the built-in defaults
  ROLES.length = 0;
  rows.forEach(r => ROLES.push({
    key: r.roleKey, label: r.label, person: r.person,
    short: (r.label.trim()[0] || '') + (r.person.trim()[0] || '')
  }));
  STAFF_ROLES = ROLES.filter(r => r.key !== 'admin');
}

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
 * The one fixed bootstrap account. Checked locally (not against Supabase) so
 * it always works even if the database is unreachable, and to keep the real
 * admin password out of any table. Every other account is a real employee
 * registration, stored in Supabase and checked via db.checkLogin() —
 * see store.js#login.
 *
 * NOTE: authentication here is client-side and not backed by real sessions.
 * The rest of the app only reads the resulting `{ role, branch, fullName }`.
 */
export const ACCOUNTS = [
  { user: 'adminkruakanya', pass: 'kruakanya150926', role: 'admin', branch: 'ALL', fullName: 'ผู้ดูแลระบบ' }
];

/**
 * Roles an employee may request at registration — never 'admin'. `let`, not
 * `const`: setRoles() reassigns this after roles are added/removed, and ES
 * module live bindings mean every importer sees that update automatically.
 */
export let STAFF_ROLES = ROLES.filter(r => r.key !== 'admin');

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
