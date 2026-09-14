/**
 * Application store — the single owner of mutable state.
 *
 * Views read `store.state`, call actions, and re-render on `subscribe`.
 * All business rules that change data live here; everything in `src/ui` is
 * presentation only.
 *
 * Persistence: if `config.supabaseUrl` is set, `init()` loads real data from
 * Supabase and every mutating action writes through to it before updating
 * local state (see `src/core/db.js`). With no Supabase configured, the store
 * falls back to the in-memory seed exactly as before — nothing else changes.
 */

import { seed } from '../data/seed.js';
import { config, today } from '../config.js';
import { clockTime, kg, baht, n, toISODate, toKg } from './format.js';
import {
  ALL_BRANCHES, allocate, ageLeftOf, baseQtyFor, branchName, inBranch, issuedOn
} from './inventory.js';
import { recipePlan } from './production.js';
import {
  PERM_ORDER, ROLES, SECTIONS, STAFF_ROLES,
  setRoles, authenticate, defaultPerms, firstViewFor, roleByKey
} from './access.js';
import * as db from './db.js';

const TOAST_MS = 4200;

export const PURPOSES = ['เบิกผลิต', 'เบิกโอนสาขา', 'เบิกทดลองสูตร', 'ตัดทิ้ง/ของเสีย'];
export const SHIFTS = ['กะเช้า 05:00–13:00', 'กะบ่าย 13:00–21:00', 'กะดึก 21:00–05:00'];
export const BRANCH_TYPES = ['โรงผลิต', 'สาขาหน้าร้าน', 'คลังกระจายสินค้า'];
export const MOVE_FILTERS = ['ทั้งหมด', 'รับเข้า', 'เบิกออก', 'ของเสีย'];

const TRANSFER_PURPOSE = 'เบิกโอนสาขา';
const WASTE_PURPOSE = 'ตัดทิ้ง/ของเสีย';

/**
 * Session persistence — without this, `state.auth` lives only in memory and
 * every refresh drops back to the login screen. `localStorage` survives a
 * refresh (and a closed tab), which is what "stay logged in" means for a
 * shared-computer app with no server-side session anyway: this stores
 * exactly the same `{ role, branch, fullName, id? }` shape completeLogin()
 * already keeps in state, nothing more sensitive than that (never a
 * password). Wrapped in try/catch since localStorage can throw in private
 * browsing / storage-disabled contexts — login still works, it just won't
 * survive a refresh there.
 */
const AUTH_STORAGE_KEY = 'kruakanya.auth';

function loadStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredAuth(account) {
  try { localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(account)); } catch { /* ignore */ }
}

function clearStoredAuth() {
  try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch { /* ignore */ }
}

/* -------------------------------------------------------------------------- */
/* Blank forms                                                                 */
/* -------------------------------------------------------------------------- */

const blankReceive = () => ({
  recvDate: today(), recvTime: '08:30', code: '', name: '', supplier: '',
  buyer: 'ณัฐพล ส.', mfgDate: '2026-08-25', shelfLife: '',
  qtyIn: '', qtyLevel: 'base', weightPerUnit: '', weightUnit: 'kg', pricePerUnit: '', ref: ''
});

/**
 * date/time default to the browser's real clock, not today() — today()
 * follows config.businessDate, which is pinned to a fixed date and is
 * exactly the "wrong date" bug this field exists to let someone correct.
 */
const blankIssue = () => ({
  code: '', qty: '', issuer: '', purpose: 'เบิกผลิต', note: '', dest: '',
  date: toISODate(new Date()), time: clockTime()
});

const blankOutput = () => ({
  date: today(), shift: SHIFTS[0], product: '', qty: '',
  unit: 'กล่อง', weight: '', reject: '', staff: 'เชฟกวิน ร.'
});

const blankRecipe = () => ({
  product: '', unit: 'กล่อง', net: '', capPerDay: '',
  lines: [{ code: '', qty: '' }, { code: '', qty: '' }, { code: '', qty: '' }]
});

const blankSupplier = () => ({ name: '', category: '', contact: '', phone: '', terms: '', cert: '' });

const blankBranch = () => ({ name: '', type: 'สาขาหน้าร้าน', manager: '', phone: '' });

const blankItem = () => ({
  code: '', name: '', category: '', unit: '', weightPerUnit: '', weightUnit: 'kg',
  shelfLife: '', minStock: '', storage: '', mainSupplier: '',
  trackBy: 'weight', packUnit: '', packSize: '', caseUnit: '', caseSize: ''
});

const blankRegister = () => ({
  fullName: '', department: '', email: '', phone: '', role: STAFF_ROLES[0].key
});

/** Same shape as blankRegister — admin adding an employee directly, already approved. */
const blankNewAccount = () => ({
  fullName: '', department: '', email: '', phone: '', role: STAFF_ROLES[0].key, branch: 'ALL'
});

const blankRoleForm = () => ({ key: '', label: '', person: '' });

/* -------------------------------------------------------------------------- */
/* Store                                                                       */
/* -------------------------------------------------------------------------- */

class Store {
  constructor() {
    const data = seed();
    this.listeners = new Set();
    this.toastTimer = null;
    this.persisted = db.isConfigured;

    // Restore a session across a refresh — see the note on AUTH_STORAGE_KEY.
    const restoredAuth = loadStoredAuth();
    const perms = defaultPerms();

    this.state = {
      ...data,
      view: restoredAuth ? firstViewFor(perms, restoredAuth.role) : 'dash',
      auth: restoredAuth,
      role: restoredAuth ? restoredAuth.role : 'admin',
      perms,
      branch: restoredAuth ? (restoredAuth.branch || ALL_BRANCHES) : ALL_BRANCHES,
      search: '',
      moveFilter: MOVE_FILTERS[0],
      toast: null,
      // While `persisted`, init() replaces the seed above before first paint —
      // `booting` gates the UI so the login screen never flashes seed data.
      booting: this.persisted,
      bootError: null,
      loginForm: { user: '', pass: '', error: '' },
      // Which panel the logged-out screen shows: 'login' | 'register' | 'registered'.
      loginPanel: 'login',
      registerForm: blankRegister(),
      // Employee roster — loaded lazily, admin-only, cleared on logout so a
      // shared computer doesn't keep PII sitting in memory between sessions.
      accounts: [],
      accountsLoaded: false,
      // Which roster row's name is being edited inline, plus its draft value.
      editingAccountId: null,
      editAccountName: '',
      adminNameForm: '',
      editingAdminName: false,
      // Which role row of the permission matrix is being edited, plus drafts.
      editingRoleKey: null,
      editRoleLabel: '',
      editRolePerson: '',
      roleForm: blankRoleForm(),
      newAccountForm: blankNewAccount(),
      receiveForm: blankReceive(),
      issueForm: blankIssue(),
      outputForm: blankOutput(),
      recipeForm: blankRecipe(),
      supplierForm: blankSupplier(),
      branchForm: blankBranch(),
      itemForm: blankItem(),
      // Which row each "add" form is currently editing — null means "adding new".
      editingLot: null,
      editingSupplier: null,
      editingBranch: null,
      editingItem: null,
      // Which issue doc's date/time is being corrected, plus its drafts —
      // see saveMoveDateTime().
      editingMoveDoc: null,
      editMoveDate: '',
      editMoveTime: ''
    };
  }

  /** Load real data from Supabase. No-op if Supabase isn't configured. */
  async init() {
    if (!this.persisted) return;
    try {
      const data = await db.loadAll();
      const perms = data.perms || await db.seedPermissions(defaultPerms());
      this.set({
        items: data.items, suppliers: data.suppliers, branches: data.branches,
        recipes: data.recipes, lots: data.lots, moves: data.moves, outputs: data.outputs,
        perms,
        booting: false
      });
    } catch (e) {
      this.set({ booting: false, bootError: e.message });
      return;
    }

    // Independent of the load above — a missing migration 005 shouldn't take
    // down the whole app, it just means the built-in roles from access.js
    // stand. setRoles() mutates ROLES in place rather than going through
    // state, so nudge a re-render afterwards to pick it up.
    try {
      setRoles(await db.getRoles());
      this.set({});
    } catch { /* migration 005 not run yet — keep the built-in roles */ }

    // A restored session (see loadStoredAuth) could belong to a role an
    // admin deleted while this browser was away — log it out cleanly rather
    // than leave it showing a role that no longer exists anywhere.
    if (this.state.auth && !ROLES.some(r => r.key === this.state.auth.role)) {
      this.logout();
      this.say('บทบาทของบัญชีนี้ถูกลบไปแล้ว กรุณาเข้าสู่ระบบใหม่', true);
    }
  }

  /* ---- plumbing --------------------------------------------------------- */

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Merge a partial state and notify. */
  set(patch) {
    Object.assign(this.state, typeof patch === 'function' ? patch(this.state) : patch);
    this.listeners.forEach(fn => fn(this.state));
  }

  /** Update one field of one form. */
  setField(form, field, value) {
    this.set(s => ({ [form]: { ...s[form], [field]: value } }));
  }

  say(text, isError = false) {
    clearTimeout(this.toastTimer);
    this.set({ toast: { text, tone: isError ? 'bad' : 'ok' } });
    this.toastTimer = setTimeout(() => this.set({ toast: null }), TOAST_MS);
  }

  /** Run a write through Supabase (when configured) and report failures as a toast. */
  async persist(action, fn) {
    if (!this.persisted) return true;
    try {
      await fn();
      return true;
    } catch (e) {
      this.say(`${action}ไม่สำเร็จ — ${e.message}`, true);
      return false;
    }
  }

  supplierIdByName(name) {
    const s = this.state.suppliers.find(x => x.name === name);
    return s ? s.id : null;
  }

  /* ---- permissions ------------------------------------------------------ */

  perm(section, role = this.state.role) {
    return (this.state.perms[role] || {})[section] || 'none';
  }

  canEdit(section) { return this.perm(section) === 'edit'; }
  canSee(section)  { return this.perm(section) !== 'none'; }
  isAdmin()        { return this.state.role === 'admin'; }

  /** Refuse the action and explain why. */
  guard(section) {
    if (this.canEdit(section)) return true;
    this.say(`บทบาท "${roleByKey(this.state.role).label}" ไม่มีสิทธิ์แก้ไขส่วนนี้ — ติดต่อผู้ดูแลระบบ`, true);
    return false;
  }

  /** Transactions must be booked against one branch, not the roll-up view. */
  requireBranch() {
    if (this.state.branch !== ALL_BRANCHES) return true;
    this.say('เลือกสาขาที่ต้องการทำรายการก่อน (ตอนนี้อยู่ในมุมมองทุกสาขา)', true);
    return false;
  }

  async cyclePerm(role, section) {
    if (!this.isAdmin()) { this.say('เฉพาะผู้ดูแลระบบเท่านั้นที่แก้สิทธิ์ได้', true); return; }
    const next = PERM_ORDER[(PERM_ORDER.indexOf(this.perm(section, role)) + 1) % PERM_ORDER.length];
    const ok = await this.persist('บันทึกสิทธิ์', () => db.upsertPermission(role, section, next));
    if (!ok) return;
    this.set(s => ({ perms: { ...s.perms, [role]: { ...s.perms[role], [section]: next } } }));
  }

  async resetPerms() {
    const defaults = defaultPerms();
    const ok = await this.persist('คืนค่าสิทธิ์', () => db.replacePermissions(defaults));
    if (!ok) return;
    this.set({ perms: defaults });
    this.say('คืนค่าสิทธิ์เริ่มต้นของทุกบทบาทแล้ว');
  }

  /* ---- session ---------------------------------------------------------- */

  /**
   * Two account sources: the one hardcoded admin (checked locally, so it
   * always works even offline), and everyone else — real employees approved
   * by that admin, checked against Supabase by email + the shared password.
   */
  async login() {
    const { user, pass } = this.state.loginForm;
    if (!user || !pass) {
      this.setField('loginForm', 'error', 'กรอกชื่อผู้ใช้และรหัสผ่านให้ครบ');
      return;
    }

    const localAccount = authenticate(user, pass);
    if (localAccount) {
      // The credential check itself stays fully local (works offline) — only
      // the display name is worth fetching fresh, since that's the one thing
      // about this account that can actually change.
      let fullName = localAccount.fullName;
      if (this.persisted) {
        try {
          fullName = (await db.getAdminName()) || fullName;
        } catch { /* offline, or migration 003 not run yet — keep the default */ }
      }
      this.completeLogin({ ...localAccount, fullName });
      return;
    }

    if (!this.persisted) {
      this.setField('loginForm', 'error', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      return;
    }

    try {
      const account = await db.checkLogin(user.trim(), pass);
      if (!account) {
        this.setField('loginForm', 'error', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือบัญชียังไม่ได้รับการอนุมัติ');
        return;
      }
      this.completeLogin(account);
    } catch (e) {
      this.setField('loginForm', 'error', `เข้าสู่ระบบไม่สำเร็จ — ${e.message}`);
    }
  }

  completeLogin(account) {
    const role = roleByKey(account.role);
    // Never let credentials into state.auth — the hardcoded admin ACCOUNTS
    // entry carries `pass` (and `user`), and this object gets persisted to
    // localStorage for session restore. Keep only what the UI actually
    // reads: role, branch, fullName, id.
    const session = {
      role: account.role, branch: account.branch || ALL_BRANCHES,
      fullName: account.fullName, id: account.id
    };
    saveStoredAuth(session);
    this.set({
      auth: session,
      role: session.role,
      view: firstViewFor(this.state.perms, session.role),
      branch: session.branch,
      loginForm: { user: '', pass: '', error: '' }
    });
    this.say(`เข้าสู่ระบบเป็น ${session.fullName || role.person} · ${role.label} · ${this.branchLabel(session.branch)}`);
  }

  logout() {
    clearStoredAuth();
    this.set({
      auth: null, loginForm: { user: '', pass: '', error: '' }, loginPanel: 'login',
      // Drop the roster from memory — it's PII, no reason to keep it around
      // once nobody's looking at it.
      accounts: [], accountsLoaded: false
    });
  }

  /* ---- registration & approval ------------------------------------------- */

  showRegisterForm()  { this.set({ loginPanel: 'register', registerForm: blankRegister() }); }
  showLoginForm()      { this.set({ loginPanel: 'login' }); }

  async register() {
    const f = this.state.registerForm;
    if (!f.fullName || !f.department || !f.email || !STAFF_ROLES.some(r => r.key === f.role)) {
      this.say('กรอกไม่ครบ — ต้องมีชื่อ-นามสกุล ฝ่ายสังกัด อีเมล และเลือกหน้าที่', true);
      return;
    }
    if (!this.persisted) {
      this.say('ระบบยังไม่ได้เชื่อมต่อฐานข้อมูล ลงทะเบียนไม่ได้ในขณะนี้', true);
      return;
    }
    try {
      await db.registerAccount(f);
      this.set({ loginPanel: 'registered', registerForm: blankRegister() });
    } catch (e) {
      this.say(`ลงทะเบียนไม่สำเร็จ — ${e.message}`, true);
    }
  }

  /** Admin-only, loaded on demand — see setView(). */
  async loadAccounts() {
    try {
      const accounts = await db.listAccounts();
      this.set({ accounts, accountsLoaded: true });
    } catch (e) {
      this.say(`โหลดรายชื่อผู้ใช้งานไม่สำเร็จ — ${e.message}`, true);
    }
  }

  async approveAccount(id, branchId) {
    if (!this.isAdmin()) return;
    try {
      await db.approveAccount(id, branchId);
      this.set(s => ({ accounts: s.accounts.map(a => (a.id === id ? { ...a, status: 'approved', branch: branchId } : a)) }));
      this.say('อนุมัติผู้ใช้งานเรียบร้อย — เข้าสู่ระบบได้ด้วยอีเมลและรหัสผ่าน 1234');
    } catch (e) {
      this.say(`อนุมัติไม่สำเร็จ — ${e.message}`, true);
    }
  }

  async rejectAccount(id) {
    if (!this.isAdmin()) return;
    try {
      await db.rejectAccount(id);
      this.set(s => ({ accounts: s.accounts.map(a => (a.id === id ? { ...a, status: 'rejected' } : a)) }));
      this.say('ปฏิเสธการลงทะเบียนแล้ว');
    } catch (e) {
      this.say(`ปฏิเสธไม่สำเร็จ — ${e.message}`, true);
    }
  }

  /** Admin creating an already-approved employee directly — skips the queue. */
  async addAccountDirect() {
    if (!this.isAdmin()) return;
    const f = this.state.newAccountForm;
    if (!f.fullName || !f.department || !f.email || !STAFF_ROLES.some(r => r.key === f.role)) {
      this.say('กรอกไม่ครบ — ต้องมีชื่อ-นามสกุล ฝ่ายสังกัด อีเมล และเลือกหน้าที่', true);
      return;
    }

    const ok = await this.persist('เพิ่มผู้ใช้งาน', () => db.adminAddAccount(f));
    if (!ok) return;
    await this.loadAccounts();
    this.set({ newAccountForm: blankNewAccount() });
    this.say(`เพิ่ม ${f.fullName} เรียบร้อย — เข้าสู่ระบบได้ด้วยอีเมลและรหัสผ่าน 1234`);
  }

  async deleteAccount(id) {
    if (!this.isAdmin()) return;
    const ok = await this.persist('ลบผู้ใช้งาน', () => db.deleteAccount(id));
    if (!ok) return;
    this.set(s => ({ accounts: s.accounts.filter(a => a.id !== id) }));
    this.say('ลบผู้ใช้งานเรียบร้อย');
  }

  /* ---- editing names ------------------------------------------------------ */

  /** Admin renaming a registered employee — name only, see migration 003. */
  startEditAccountName(id, currentName) {
    if (!this.isAdmin()) return;
    this.set({ editingAccountId: id, editAccountName: currentName });
  }

  cancelEditAccountName() {
    this.set({ editingAccountId: null, editAccountName: '' });
  }

  setEditAccountName(value) {
    this.set({ editAccountName: value });
  }

  async saveAccountName() {
    if (!this.isAdmin()) return;
    const id = this.state.editingAccountId;
    const name = this.state.editAccountName.trim();
    if (!name) { this.say('กรอกชื่อก่อนบันทึก', true); return; }

    const ok = await this.persist('แก้ไขชื่อผู้ใช้งาน', () => db.updateAccountName(id, name));
    if (!ok) return;
    this.set(s => ({
      accounts: s.accounts.map(a => (a.id === id ? { ...a, fullName: name } : a)),
      editingAccountId: null, editAccountName: ''
    }));
    this.say('แก้ไขชื่อเรียบร้อย');
  }

  /** Admin renaming themselves — persisted separately from the account list. */
  startEditAdminName() {
    this.set({ editingAdminName: true, adminNameForm: (this.state.auth && this.state.auth.fullName) || '' });
  }

  setAdminNameDraft(value) {
    this.set({ adminNameForm: value });
  }

  cancelEditAdminName() {
    this.set({ editingAdminName: false, adminNameForm: '' });
  }

  async saveAdminName() {
    const name = this.state.adminNameForm.trim();
    if (!name) { this.say('กรอกชื่อก่อนบันทึก', true); return; }

    const ok = await this.persist('แก้ไขชื่อผู้ดูแลระบบ', () => db.updateAdminName(name));
    if (!ok) return;
    this.set(s => ({ auth: { ...s.auth, fullName: name }, editingAdminName: false, adminNameForm: '' }));
    this.say('แก้ไขชื่อเรียบร้อย');
  }

  /** Editing one role's label + example-user name in the permission matrix. */
  startEditRoleLabel(key) {
    if (!this.isAdmin()) return;
    const role = roleByKey(key);
    this.set({ editingRoleKey: key, editRoleLabel: role.label, editRolePerson: role.person });
  }

  cancelEditRoleLabel() {
    this.set({ editingRoleKey: null, editRoleLabel: '', editRolePerson: '' });
  }

  setEditRoleLabel(value)  { this.set({ editRoleLabel: value }); }
  setEditRolePerson(value) { this.set({ editRolePerson: value }); }

  async saveRoleLabel() {
    if (!this.isAdmin()) return;
    const key = this.state.editingRoleKey;
    const label = this.state.editRoleLabel.trim();
    const person = this.state.editRolePerson.trim();
    if (!label || !person) { this.say('กรอกชื่อบทบาทและชื่อตัวอย่างให้ครบ', true); return; }

    const ok = await this.persist('แก้ไขบทบาท', () => db.updateRole(key, label, person));
    if (!ok) return;
    setRoles(await db.getRoles());
    this.set({ editingRoleKey: null, editRoleLabel: '', editRolePerson: '' });
    this.say('แก้ไขบทบาทเรียบร้อย');
  }

  /** A new row of permission checkboxes shows up automatically — every
   *  section starts at 'none', matching what add_role seeds server-side. */
  async addRole() {
    if (!this.isAdmin()) return;
    const f = this.state.roleForm;
    const key = f.key.trim().toLowerCase();
    const label = f.label.trim();
    const person = f.person.trim();

    if (!key || !label || !person) { this.say('กรอกรหัส ชื่อบทบาท และชื่อตัวอย่างให้ครบ', true); return; }
    if (!/^[a-z][a-z0-9_]{1,19}$/.test(key)) {
      this.say('รหัสบทบาทต้องเป็นตัวอักษรอังกฤษพิมพ์เล็กและตัวเลข ขึ้นต้นด้วยตัวอักษร เช่น "fg"', true);
      return;
    }
    if (ROLES.some(r => r.key === key)) { this.say(`รหัสบทบาท "${key}" มีอยู่แล้ว`, true); return; }

    const sectionKeys = SECTIONS.map(s => s.key);
    const ok = await this.persist('เพิ่มบทบาท', () => db.addRole(key, label, person, sectionKeys));
    if (!ok) return;
    setRoles(await db.getRoles());
    const blankPerm = sectionKeys.reduce((acc, s) => ({ ...acc, [s]: 'none' }), {});
    this.set(s => ({ roleForm: blankRoleForm(), perms: { ...s.perms, [key]: blankPerm } }));
    this.say(`เพิ่มบทบาท "${label}" เรียบร้อย`);
  }

  async deleteRole(key) {
    if (!this.isAdmin()) return;
    if (key === 'admin') { this.say('ไม่สามารถลบบทบาทผู้ดูแลระบบได้', true); return; }

    const ok = await this.persist('ลบบทบาท', () => db.deleteRole(key));
    if (!ok) return;
    setRoles(await db.getRoles());
    this.set(s => {
      const perms = { ...s.perms };
      delete perms[key];
      return { perms };
    });
    this.say('ลบบทบาทเรียบร้อย');
  }

  /** Admins can preview the app as another role without logging out. */
  setRole(role) {
    if (!this.state.auth || this.state.auth.role !== 'admin') {
      this.say('เฉพาะผู้ดูแลระบบเท่านั้นที่สลับมุมมองบทบาทได้', true);
      return;
    }
    const perms = this.state.perms[role] || {};
    const keepView = this.state.view !== 'admin' && perms[this.state.view] !== 'none';
    this.set({ role, view: keepView ? this.state.view : firstViewFor(this.state.perms, role) });
    const r = roleByKey(role);
    this.say(`สลับมุมมองเป็น ${r.label} (${r.person}) — เมนูและสิทธิ์แก้ไขปรับตามบทบาทแล้ว`);
  }

  /* ---- branches --------------------------------------------------------- */

  branchLabel(id) { return branchName(this.state.branches, id); }

  setBranch(id) {
    const account = this.state.auth;
    if (account && account.branch !== ALL_BRANCHES && id !== account.branch) {
      this.say(`บัญชีนี้ผูกกับ ${this.branchLabel(account.branch)} เท่านั้น`, true);
      return;
    }
    this.set({ branch: id });
    this.say(`เปลี่ยนมุมมองเป็น ${this.branchLabel(id)} — ข้อมูลสต๊อก ต้นทุน และรายงานถูกกรองตามสาขานี้`);
  }

  startEditBranch(id) {
    if (!this.isAdmin()) { this.say('เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขสาขาได้', true); return; }
    const b = this.state.branches.find(x => x.id === id);
    if (!b) return;
    this.set({
      editingBranch: id,
      branchForm: { name: b.name, type: b.type, manager: b.manager === '-' ? '' : b.manager, phone: b.phone === '-' ? '' : b.phone }
    });
  }

  cancelEditBranch() {
    this.set({ editingBranch: null, branchForm: blankBranch() });
  }

  async addBranch() {
    if (!this.isAdmin()) { this.say('เฉพาะผู้ดูแลระบบเท่านั้นที่เพิ่มสาขาได้', true); return; }
    const form = this.state.branchForm;
    if (!form.name) { this.say('ระบุชื่อสาขาก่อนบันทึก', true); return; }

    const patch = {
      name: form.name,
      type: form.type || 'สาขาหน้าร้าน',
      manager: form.manager || '-',
      phone: form.phone || '-'
    };

    if (this.state.editingBranch) {
      const id = this.state.editingBranch;
      const ok = await this.persist('แก้ไขสาขา', () => db.updateBranch(id, patch));
      if (!ok) return;
      this.set(s => ({
        branches: s.branches.map(b => (b.id === id ? { ...b, ...patch } : b)),
        editingBranch: null, branchForm: blankBranch()
      }));
      this.say(`แก้ไข ${id} · ${form.name} เรียบร้อย`);
      return;
    }

    const id = 'BR-' + String(this.state.branches.length + 1).padStart(2, '0');
    const branch = { id, ...patch };
    const ok = await this.persist('เพิ่มสาขา', () => db.insertBranch(branch));
    if (!ok) return;
    this.set(s => ({ branches: s.branches.concat([branch]), branchForm: blankBranch() }));
    this.say(`เพิ่ม ${id} · ${form.name} เรียบร้อย — พร้อมรับวัตถุดิบเข้าสาขานี้`);
  }

  /* ---- item master -------------------------------------------------------- */

  startEditItem(code) {
    if (!this.guard('master')) return;
    const it = this.state.items.find(i => i.code === code);
    if (!it) return;
    this.set({
      editingItem: code,
      itemForm: {
        code: it.code, name: it.name, category: it.category === '-' ? '' : it.category, unit: it.unit,
        weightPerUnit: String(it.weightPerUnit), weightUnit: 'kg', shelfLife: String(it.shelfLife),
        minStock: String(it.minStock), storage: it.storage === '-' ? '' : it.storage,
        mainSupplier: it.mainSupplier || '',
        trackBy: it.trackBy || 'weight',
        packUnit: it.packUnit || '', packSize: it.packSize ? String(it.packSize) : '',
        caseUnit: it.caseUnit || '', caseSize: it.caseSize ? String(it.caseSize) : ''
      }
    });
  }

  cancelEditItem() {
    this.set({ editingItem: null, itemForm: blankItem() });
  }

  async addItem() {
    if (!this.guard('master')) return;
    const f = this.state.itemForm;
    const trackBy = f.trackBy === 'count' ? 'count' : 'weight';
    // A count-tracked item (e.g. instruction cards) isn't weighed at all —
    // weightPerUnit stays 0 and every weight-derived figure for it is 0 too,
    // which lowStock()/pricePerKg() in inventory.js already treat correctly.
    // Typed in g or kg (see the "หน่วยน้ำหนัก" toggle) — always stored in kg.
    const weightPerUnit = trackBy === 'count' ? 0 : toKg(f.weightPerUnit, f.weightUnit);
    const shelfLife = Number(f.shelfLife) || 0;
    const minStock = Number(f.minStock) || 0;
    const packSize = Number(f.packSize) || 0;
    const caseSize = Number(f.caseSize) || 0;

    if (!f.code || !f.name || !f.unit || !shelfLife || (trackBy === 'weight' && !weightPerUnit)) {
      this.say('กรอกไม่ครบ — ต้องมีรหัส ชื่อ หน่วยนับ และอายุวัตถุดิบ (และน้ำหนัก/หน่วย ถ้านับเป็นน้ำหนัก)', true);
      return;
    }
    if (f.packUnit && !packSize) {
      this.say('ระบุจำนวนต่อแพ็คด้วย ถ้ามีหน่วยแพ็ค', true);
      return;
    }
    if (f.caseUnit && (!f.packUnit || !caseSize)) {
      this.say('หน่วยกล่องต้องมีหน่วยแพ็คก่อน พร้อมจำนวนแพ็คต่อกล่อง', true);
      return;
    }

    const patch = {
      name: f.name, category: f.category || '-', unit: f.unit,
      weightPerUnit, shelfLife, minStock, storage: f.storage || '-',
      mainSupplier: f.mainSupplier || null,
      trackBy,
      packUnit: f.packUnit || '', packSize: f.packUnit ? packSize : null,
      caseUnit: f.caseUnit || '', caseSize: f.caseUnit ? caseSize : null
    };

    if (this.state.editingItem) {
      const oldCode = this.state.editingItem;
      const newCode = f.code;
      if (newCode !== oldCode && this.state.items.some(i => i.code === newCode)) {
        this.say(`รหัส ${newCode} มีอยู่แล้วในระบบ`, true);
        return;
      }
      const ok = await this.persist('แก้ไขวัตถุดิบ', () => db.updateItem(oldCode, newCode, patch, this.supplierIdByName(f.mainSupplier)));
      if (!ok) return;
      this.set(s => ({
        items: s.items.map(i => (i.code === oldCode ? { ...i, code: newCode, ...patch } : i)),
        // The DB cascades the rename to everything that referenced the old
        // code (ON UPDATE CASCADE) — mirror that locally so lots/moves/
        // recipes don't show a stale code until the next reload.
        lots: s.lots.map(l => (l.code === oldCode ? { ...l, code: newCode } : l)),
        moves: s.moves.map(m => (m.code === oldCode ? { ...m, code: newCode } : m)),
        recipes: s.recipes.map(r => ({
          ...r,
          lines: r.lines.map(l => (l.code === oldCode ? { ...l, code: newCode } : l))
        })),
        editingItem: null, itemForm: blankItem()
      }));
      this.say(`แก้ไขวัตถุดิบ ${oldCode}${newCode !== oldCode ? ' → ' + newCode : ''} เรียบร้อย`);
      return;
    }

    if (this.state.items.some(i => i.code === f.code)) {
      this.say(`รหัส ${f.code} มีอยู่แล้วในระบบ`, true);
      return;
    }

    const item = { code: f.code, ...patch };
    const ok = await this.persist('เพิ่มวัตถุดิบ', () => db.insertItem(item, this.supplierIdByName(f.mainSupplier)));
    if (!ok) return;
    this.set(s => ({ items: s.items.concat([item]), itemForm: blankItem() }));
    this.say(`เพิ่มวัตถุดิบ ${f.code} · ${f.name} เรียบร้อย`);
  }

  /* ---- receiving -------------------------------------------------------- */

  /** Picking an item code pre-fills the specs recorded on the item master. */
  pickReceiveItem(code) {
    const item = this.state.items.find(i => i.code === code);
    this.set(s => ({
      receiveForm: {
        ...s.receiveForm,
        code,
        name:          item ? item.name : s.receiveForm.name,
        weightPerUnit: item ? String(item.weightPerUnit) : s.receiveForm.weightPerUnit,
        weightUnit:    'kg',
        shelfLife:     item ? String(item.shelfLife) : s.receiveForm.shelfLife,
        supplier:      item && !s.receiveForm.supplier ? item.mainSupplier : s.receiveForm.supplier,
        qtyLevel: 'base'
      }
    }));
  }

  /**
   * Smallest number not already used as the "-NN" suffix of a lot id on this
   * date prefix. Derived fresh from loaded data every time — not a counter
   * kept in memory — so a page reload never reissues an id that's already on
   * the books. (A session-local counter did exactly that: it always restarted
   * from the same value for a given business date, so the very next receipt
   * after any reload collided with the last one. No `.slice(-2)` truncation
   * either — that wrapped back to reused numbers once the count passed 99.)
   */
  nextLotSeq(datePrefix) {
    const used = this.state.lots
      .map(l => Number(l.id.slice(`LOT-${datePrefix}-`.length)))
      .filter(Number.isInteger);
    return (used.length ? Math.max(...used) : 0) + 1;
  }

  nextLotId() {
    const date = this.state.receiveForm.recvDate || today();
    const prefix = date.slice(2).replace(/-/g, '');
    return `LOT-${prefix}-` + String(this.nextLotSeq(prefix)).padStart(2, '0');
  }

  /** Same idea as nextLotSeq, for issue/waste document numbers. */
  nextIssueSeq(datePrefix) {
    const used = this.state.moves
      .filter(m => m.id.startsWith(`IS-${datePrefix}-`))
      .map(m => Number(m.id.split('-')[2]))
      .filter(Number.isInteger);
    return (used.length ? Math.max(...used) : 0) + 1;
  }

  startEditLot(id) {
    if (!this.guard('receive')) return;
    const lot = this.state.lots.find(l => l.id === id);
    if (!lot) return;
    this.set({
      editingLot: id,
      receiveForm: {
        recvDate: lot.recvDate, recvTime: lot.recvTime, code: lot.code, name: lot.name,
        supplier: lot.supplier === '-' ? '' : lot.supplier, buyer: lot.buyer === '-' ? '' : lot.buyer,
        mfgDate: lot.mfgDate, shelfLife: String(lot.shelfLife),
        qtyIn: String(lot.qtyIn), weightPerUnit: String(lot.weightPerUnit), weightUnit: 'kg',
        pricePerUnit: String(lot.pricePerUnit), ref: lot.ref === '-' ? '' : lot.ref
      }
    });
  }

  cancelEditLot() {
    this.set({ editingLot: null, receiveForm: blankReceive() });
  }

  /**
   * Corrects a receipt already on the books. The item code and branch are
   * fixed — those identify which lot this is, not something to "fix". If
   * qtyIn changes, qtyLeft shifts by the same amount so whatever has already
   * been issued or transferred out of this lot stays untouched; qtyLeft is
   * never allowed to go negative, i.e. you can't shrink a lot below what's
   * already been drawn from it.
   */
  async saveLotEdit() {
    if (!this.guard('receive')) return;
    const id = this.state.editingLot;
    const original = this.state.lots.find(l => l.id === id);
    if (!original) { this.cancelEditLot(); return; }

    const f = this.state.receiveForm;
    const item = this.state.items.find(i => i.code === original.code);
    const isCount = item && item.trackBy === 'count';
    const qtyIn = Number(f.qtyIn) || 0;
    const weightPerUnit = isCount ? 0 : toKg(f.weightPerUnit, f.weightUnit);
    const pricePerUnit = Number(f.pricePerUnit) || 0;
    const shelfLife = Number(f.shelfLife) || 0;

    if (!qtyIn || !pricePerUnit || !shelfLife || (!isCount && !weightPerUnit)) {
      this.say('กรอกไม่ครบ — ต้องมีจำนวน ราคา และอายุวัตถุดิบ (และน้ำหนัก/หน่วย ถ้าวัตถุดิบนี้นับเป็นน้ำหนัก)', true);
      return;
    }

    const alreadyOut = original.qtyIn - original.qtyLeft;
    const qtyLeft = qtyIn - alreadyOut;
    if (qtyLeft < 0) {
      this.say(`ลดจำนวนต่ำกว่า ${n(alreadyOut)} หน่วยไม่ได้ — ถูกเบิก/โอนออกไปแล้วเท่านั้น`, true);
      return;
    }

    const patch = {
      supplier: f.supplier || '-', buyer: f.buyer || '-',
      recvDate: f.recvDate, recvTime: f.recvTime, mfgDate: f.mfgDate,
      shelfLife, weightPerUnit, qtyIn, qtyLeft, pricePerUnit, ref: f.ref || '-'
    };

    const ok = await this.persist('แก้ไขรายการรับเข้า', () => db.updateLot(id, patch, this.supplierIdByName(f.supplier)));
    if (!ok) return;

    this.set(s => ({
      lots: s.lots.map(l => (l.id === id ? { ...l, ...patch } : l)),
      editingLot: null, receiveForm: blankReceive()
    }));
    this.say(`แก้ไข ${id} เรียบร้อย`);
  }

  /** Nothing may have been drawn from the lot yet, admin or not — deleting a
   *  partially-issued lot would orphan the issue/transfer moves that already
   *  drew stock from it (same rule saveLotEdit enforces for shrinking one). */
  lotDeletable(lot) {
    if (lot.qtyIn !== lot.qtyLeft) {
      this.say(`ลบไม่ได้ — ล็อต ${lot.id} ถูกเบิก/โอนออกไปแล้ว ${n(lot.qtyIn - lot.qtyLeft)} หน่วย`, true);
      return false;
    }
    return true;
  }

  /** Admin-only, immediate — also the final step once a request is approved. */
  async deleteLot(id) {
    if (!this.isAdmin()) return;
    const lot = this.state.lots.find(l => l.id === id);
    if (!lot || !this.lotDeletable(lot)) return;

    const ok = await this.persist('ลบรายการรับเข้า', () => db.deleteLot(id));
    if (!ok) return;
    this.set(s => ({ lots: s.lots.filter(l => l.id !== id), moves: s.moves.filter(m => m.lotId !== id) }));
    this.say(`ลบ ${id} เรียบร้อย`);
  }

  /** Admin deletes right away; anyone else who can edit "รับเข้า" only flags
   *  the lot for approval — see approveDeleteLot / rejectDeleteLot below. */
  async requestDeleteLot(id) {
    if (!this.guard('receive')) return;
    if (this.isAdmin()) { await this.deleteLot(id); return; }

    const lot = this.state.lots.find(l => l.id === id);
    if (!lot || !this.lotDeletable(lot)) return;

    const ok = await this.persist('ขอลบรายการรับเข้า', () => db.setLotPendingDelete(id, true));
    if (!ok) return;
    this.set(s => ({ lots: s.lots.map(l => (l.id === id ? { ...l, pendingDelete: true } : l)) }));
    this.say(`ส่งคำขอลบ ${id} แล้ว — รอผู้ดูแลระบบอนุมัติ`);
  }

  async approveDeleteLot(id) {
    if (!this.isAdmin()) return;
    await this.deleteLot(id);
  }

  async rejectDeleteLot(id) {
    if (!this.isAdmin()) return;
    const ok = await this.persist('ปฏิเสธคำขอลบ', () => db.setLotPendingDelete(id, false));
    if (!ok) return;
    this.set(s => ({ lots: s.lots.map(l => (l.id === id ? { ...l, pendingDelete: false } : l)) }));
    this.say('ปฏิเสธคำขอลบแล้ว');
  }

  async submitReceive() {
    if (!this.guard('receive') || !this.requireBranch()) return;

    const f = this.state.receiveForm;
    const item = this.state.items.find(i => i.code === f.code);
    const name = f.name || (item ? item.name : '');
    // qtyIn is entered at whichever pack level the item offers (ชิ้น/แพ็ค/
    // กล่อง — see unitLevels()); qty itself, like everything downstream, is
    // always in the item's base unit.
    const qty = item ? baseQtyFor(item, f.qtyIn, f.qtyLevel) : (Number(f.qtyIn) || 0);
    const isCount = item && item.trackBy === 'count';
    // Typed in g or kg (see the "หน่วยน้ำหนัก" toggle) — always stored in kg.
    const weightPerUnit = isCount ? 0 : (f.weightPerUnit ? toKg(f.weightPerUnit, f.weightUnit) : (item ? item.weightPerUnit : 0));
    const pricePerUnit = Number(f.pricePerUnit) || 0;
    const shelfLife = Number(f.shelfLife) || (item ? item.shelfLife : 0);

    if (!f.code || !name || !qty || !pricePerUnit || (!isCount && !weightPerUnit)) {
      this.say('กรอกไม่ครบ — ต้องมีรหัสวัตถุดิบ ชื่อ จำนวน และราคา (และน้ำหนัก/หน่วย ถ้าวัตถุดิบนี้นับเป็นน้ำหนัก)', true);
      return;
    }

    const lotId = this.nextLotId();
    const lot = {
      id: lotId, branch: this.state.branch, code: f.code, name,
      unit: item ? item.unit : 'หน่วย',
      weightPerUnit, shelfLife,
      supplier: f.supplier || '-', buyer: f.buyer || '-',
      recvDate: f.recvDate, recvTime: f.recvTime, mfgDate: f.mfgDate,
      qtyIn: qty, qtyLeft: qty, pricePerUnit, ref: f.ref || '-'
    };
    const move = {
      branch: this.state.branch, id: 'RC-' + lotId.slice(4), type: 'รับเข้า',
      lotId, code: f.code, name, date: f.recvDate, time: f.recvTime,
      qty, weight: qty * weightPerUnit, cost: qty * pricePerUnit,
      user: f.buyer || '-', purpose: 'รับเข้าคลัง',
      note: `${f.supplier || '-'} · ${f.ref || '-'}`
    };

    const ok = await this.persist('บันทึกรับเข้า', () => db.insertReceipt(lot, move, this.supplierIdByName(f.supplier)));
    if (!ok) return;

    this.set(s => ({
      lots: s.lots.concat([lot]),
      moves: s.moves.concat([move]),
      // Keep supplier and buyer — receiving usually comes in runs from one PO.
      receiveForm: { ...blankReceive(), supplier: f.supplier, buyer: f.buyer }
    }));
    const weightTail = isCount ? '' : ` (${kg(qty * weightPerUnit)})`;
    this.say(`รับเข้า ${lotId} · ${name} ${n(qty)} ${lot.unit}${weightTail} มูลค่า ${baht(qty * pricePerUnit)}`);
  }

  /* ---- issuing ---------------------------------------------------------- */

  async submitIssue() {
    if (!this.guard('issue') || !this.requireBranch()) return;

    const f = this.state.issueForm;
    const qty = Number(f.qty) || 0;
    if (!f.code || !qty) {
      this.say('เลือกวัตถุดิบและระบุจำนวนที่ต้องการเบิกออก', true);
      return;
    }

    const plan = allocate(this.state, f.code, qty);
    if (plan.shortBy > 0) {
      this.say(`สต๊อกไม่พอ — ขาดอีก ${n(plan.shortBy)} หน่วย`, true);
      return;
    }

    const date = f.date || toISODate(new Date());
    const time = f.time || clockTime();
    const datePrefix = date.slice(2).replace(/-/g, '');
    const doc = `IS-${datePrefix}-` + this.nextIssueSeq(datePrefix);
    const isWaste = f.purpose === WASTE_PURPOSE;
    const from = this.state.branch;
    const isTransfer = f.purpose === TRANSFER_PURPOSE && f.dest && f.dest !== from;

    // Draw down the source lots.
    const lots = this.state.lots.map(lot => {
      const hit = plan.rows.find(r => r.lot.id === lot.id);
      return hit ? { ...lot, qtyLeft: lot.qtyLeft - hit.take } : lot;
    });

    const issueMoves = plan.rows.map((r, i) => ({
      branch: from,
      id: doc + (plan.rows.length > 1 ? '-' + (i + 1) : ''),
      type: isWaste ? 'ตัดทิ้ง' : 'เบิกออก',
      lotId: r.lot.id, code: r.lot.code, name: r.lot.name,
      date, time, qty: r.take,
      weight: r.take * r.lot.weightPerUnit,
      cost: r.take * r.lot.pricePerUnit,
      user: f.issuer || '-', purpose: f.purpose,
      age: ageLeftOf(r.lot),
      note: `${f.note || '-'} · อายุคงเหลือ ${ageLeftOf(r.lot)} วัน`
    }));

    // A transfer lands as a matching receipt in the destination branch, so the
    // stock stays on the books and keeps its original expiry date.
    const transferLots = [];
    const transferMoves = [];
    if (isTransfer) {
      plan.rows.forEach((r, i) => {
        const id = r.lot.id + '-T' + (i + 1);
        transferLots.push({
          ...r.lot, id, branch: f.dest,
          qtyIn: r.take, qtyLeft: r.take,
          recvDate: date, recvTime: time, ref: doc
        });
        transferMoves.push({
          branch: f.dest, id: 'RC-' + id.slice(4), type: 'รับเข้า',
          lotId: id, code: r.lot.code, name: r.lot.name,
          date, time, qty: r.take,
          weight: r.take * r.lot.weightPerUnit,
          cost: r.take * r.lot.pricePerUnit,
          user: f.issuer || '-', purpose: 'รับโอนระหว่างสาขา',
          note: `รับโอนจาก ${this.branchLabel(from)} · ${doc}`
        });
      });
    }

    const ok = await this.persist('บันทึกเบิกออก', async () => {
      // Sequential, not a single transaction — see db.js's note on this.
      for (const r of plan.rows) await db.updateLotQtyLeft(r.lot.id, r.lot.qtyLeft - r.take);
      await db.insertMoves(issueMoves);
      for (const lot of transferLots) await db.insertTransferLot(lot, this.supplierIdByName(lot.supplier));
      if (transferMoves.length) await db.insertMoves(transferMoves);
    });
    if (!ok) return;

    const totalWeight = issueMoves.reduce((a, m) => a + m.weight, 0);
    const totalCost = issueMoves.reduce((a, m) => a + m.cost, 0);

    this.set(s => ({
      lots: lots.concat(transferLots),
      moves: s.moves.concat(issueMoves, transferMoves),
      issueForm: { ...f, qty: '', note: '', date: toISODate(new Date()), time: clockTime() }
    }));

    const tail = isTransfer
      ? ` · โอนเข้า ${this.branchLabel(f.dest)} แล้ว`
      : ` ตัดจาก ${issueMoves.length} ล็อต`;
    const weightTail = totalWeight ? ` (${kg(totalWeight)})` : '';
    this.say(`${doc} · ${issueMoves[0].name} ${n(qty)} หน่วย${weightTail} ต้นทุน ${baht(totalCost)}${tail}`);
  }

  /**
   * Corrects the business date/time already recorded for an issue. `docNo`
   * may cover several moves rows at once — a single issue can split across
   * multiple lots under FEFO, and those rows are all one real-world event,
   * so they're corrected together (see db.js#updateMoveDateTime).
   */
  startEditMoveDateTime(docNo) {
    if (!this.guard('issue')) return;
    const move = this.state.moves.find(m => m.id === docNo);
    if (!move) return;
    this.set({ editingMoveDoc: docNo, editMoveDate: move.date, editMoveTime: move.time });
  }

  cancelEditMoveDateTime() {
    this.set({ editingMoveDoc: null, editMoveDate: '', editMoveTime: '' });
  }

  setEditMoveDate(value) { this.set({ editMoveDate: value }); }
  setEditMoveTime(value) { this.set({ editMoveTime: value }); }

  async saveMoveDateTime() {
    if (!this.guard('issue')) return;
    const docNo = this.state.editingMoveDoc;
    const date = this.state.editMoveDate;
    const time = this.state.editMoveTime;
    if (!date || !time) { this.say('กรอกวันที่และเวลาให้ครบ', true); return; }

    const ok = await this.persist('แก้ไขวันที่-เวลาเบิกออก', () => db.updateMoveDateTime(docNo, date, time));
    if (!ok) return;

    const editedAt = new Date().toISOString();
    this.set(s => ({
      moves: s.moves.map(m => (m.id === docNo ? { ...m, date, time, editedAt } : m)),
      editingMoveDoc: null, editMoveDate: '', editMoveTime: ''
    }));
    this.say(`แก้ไขวันที่-เวลาของ ${docNo} เรียบร้อย`);
  }

  /**
   * Whether canceling this issue doc is safe right now. A plain issue/waste
   * is always safe to unwind — restoring stock to the source lot can never
   * push it past what it started with (allocate() never lets active draws
   * exceed a lot's qty_in in the first place). A transfer is the one case
   * that can go wrong: its destination-side lot (see transferLots in
   * submitIssue) must still be untouched, or reversing the transfer would
   * mean clawing back stock someone already drew from — same "untouched"
   * rule lotDeletable() already enforces for deleting a receiving record.
   */
  transferLotsFor(docNo) {
    // ref === docNo alone would also match a hand-typed PO number that
    // happens to collide with an auto-generated doc number by coincidence —
    // the '-T<n>' suffix is only ever produced by submitIssue's transfer path.
    return this.state.lots.filter(l => l.ref === docNo && /-T\d+$/.test(l.id));
  }

  issueCancelable(docNo) {
    return this.transferLotsFor(docNo).every(lot => this.lotDeletable(lot));
  }

  /** Admin-only, immediate — also the final step once a request is approved. */
  async cancelIssue(docNo) {
    if (!this.isAdmin()) return;
    const rows = this.state.moves.filter(m => m.id === docNo);
    if (!rows.length) return;
    if (!this.issueCancelable(docNo)) return;

    const transferLots = this.transferLotsFor(docNo);

    const ok = await this.persist('ยกเลิกการเบิกออก', async () => {
      for (const m of rows) {
        const lot = this.state.lots.find(l => l.id === m.lotId);
        if (lot) await db.updateLotQtyLeft(lot.id, lot.qtyLeft + m.qty);
      }
      for (const lot of transferLots) await db.deleteLot(lot.id);
      await db.deleteMovesByDoc(docNo);
    });
    if (!ok) return;

    this.set(s => ({
      lots: s.lots
        .filter(l => !transferLots.some(t => t.id === l.id))
        .map(l => {
          const hit = rows.find(m => m.lotId === l.id);
          return hit ? { ...l, qtyLeft: l.qtyLeft + hit.qty } : l;
        }),
      moves: s.moves.filter(m => m.id !== docNo)
    }));
    this.say(`ยกเลิก ${docNo} เรียบร้อย — คืนสต๊อกแล้ว`);
  }

  /** Admin cancels right away; anyone else who can edit "เบิกออก" only
   *  flags the issue for approval — see approveCancelIssue / rejectCancelIssue. */
  async requestCancelIssue(docNo) {
    if (!this.guard('issue')) return;
    if (!this.issueCancelable(docNo)) {
      this.say('ยกเลิกไม่ได้ — สินค้าที่โอนไปสาขาปลายทางถูกเบิก/โอนออกต่อไปแล้ว', true);
      return;
    }
    if (this.isAdmin()) { await this.cancelIssue(docNo); return; }

    const ok = await this.persist('ขอยกเลิกการเบิกออก', () => db.setMovePendingCancel(docNo, true));
    if (!ok) return;
    this.set(s => ({ moves: s.moves.map(m => (m.id === docNo ? { ...m, pendingCancel: true } : m)) }));
    this.say(`ส่งคำขอยกเลิก ${docNo} แล้ว — รอผู้ดูแลระบบอนุมัติ`);
  }

  async approveCancelIssue(docNo) {
    if (!this.isAdmin()) return;
    await this.cancelIssue(docNo);
  }

  async rejectCancelIssue(docNo) {
    if (!this.isAdmin()) return;
    const ok = await this.persist('ปฏิเสธคำขอยกเลิก', () => db.setMovePendingCancel(docNo, false));
    if (!ok) return;
    this.set(s => ({ moves: s.moves.map(m => (m.id === docNo ? { ...m, pendingCancel: false } : m)) }));
    this.say('ปฏิเสธคำขอยกเลิกแล้ว');
  }

  /* ---- production output ------------------------------------------------ */

  async submitOutput() {
    if (!this.guard('output') || !this.requireBranch()) return;

    const f = this.state.outputForm;
    const qty = Number(f.qty) || 0;
    const weight = Number(f.weight) || 0;
    if (!f.product || !qty || !weight) {
      this.say('กรอกไม่ครบ — ต้องมีชื่อสินค้า จำนวนที่ผลิตได้ และน้ำหนักผลผลิต', true);
      return;
    }

    const record = {
      branch: this.state.branch,
      id: 'PD-' + f.date.slice(2).replace(/-/g, '') + '-' + (this.state.outputs.length + 1),
      date: f.date, shift: f.shift, product: f.product,
      qty, unit: f.unit || 'หน่วย', weight,
      reject: Number(f.reject) || 0,
      staff: f.staff || '-'
    };

    const ok = await this.persist('บันทึกผลผลิต', () => db.insertOutput(record));
    if (!ok) return;

    // Report the day's yield including this record, not just this record's share.
    const issued = issuedOn(this.state, f.date);
    const dayWeight = this.state.outputs
      .filter(o => o.date === f.date && inBranch(o, this.state.branch))
      .reduce((a, o) => a + o.weight, weight);
    const pct = issued.weight ? (dayWeight / issued.weight) * 100 : 0;

    this.set(s => ({
      outputs: s.outputs.concat([record]),
      // Keep the shift context — one operator usually logs a whole shift.
      outputForm: { ...blankOutput(), date: f.date, shift: f.shift, unit: f.unit, staff: f.staff }
    }));

    const tail = issued.weight
      ? ` · Yield รวมของวัน ${n(pct, 1)}%`
      : ' · ยังไม่มีการเบิกวัตถุดิบในวันนี้';
    this.say(`บันทึกผลผลิต ${f.product} ${n(qty)} ${record.unit} (${kg(weight)})${tail}`);
  }

  /* ---- recipes ---------------------------------------------------------- */

  addRecipeLine() {
    this.set(s => ({ recipeForm: { ...s.recipeForm, lines: s.recipeForm.lines.concat([{ code: '', qty: '' }]) } }));
  }

  setRecipeLine(index, field, value) {
    this.set(s => ({
      recipeForm: {
        ...s.recipeForm,
        lines: s.recipeForm.lines.map((l, i) => (i === index ? { ...l, [field]: value } : l))
      }
    }));
  }

  async addRecipe() {
    if (!this.guard('recipe')) return;

    const f = this.state.recipeForm;
    const plan = recipePlan(this.state, f);
    if (!f.product || !plan.lines.length) {
      this.say('ต้องระบุชื่อเมนู และวัตถุดิบในสูตรอย่างน้อย 1 รายการ', true);
      return;
    }

    const id = 'BOM-' + String(this.state.recipes.length + 1).padStart(3, '0');
    const recipe = {
      id, product: f.product, unit: f.unit || 'หน่วย',
      net: Number(f.net) || plan.kg,
      capPerDay: Number(f.capPerDay) || 0,
      lines: plan.lines.map(l => ({ code: l.code, qty: Number(l.qty) }))
    };

    const ok = await this.persist('บันทึกสูตร', () => db.insertRecipe(recipe));
    if (!ok) return;
    this.set(s => ({ recipes: s.recipes.concat([recipe]), recipeForm: blankRecipe() }));
    this.say(`บันทึกสูตร ${id} · ${f.product} · วัตถุดิบ ${n(plan.kg, 3)} กก./หน่วย · ต้นทุนมาตรฐาน ${baht(plan.cost, 2)}`);
  }

  /* ---- suppliers -------------------------------------------------------- */

  startEditSupplier(id) {
    if (!this.guard('master')) return;
    const s = this.state.suppliers.find(x => x.id === id);
    if (!s) return;
    this.set({
      editingSupplier: id,
      supplierForm: {
        name: s.name, category: s.category === '-' ? '' : s.category,
        contact: s.contact === '-' ? '' : s.contact, phone: s.phone === '-' ? '' : s.phone,
        terms: s.terms === '-' ? '' : s.terms, cert: s.cert === '-' ? '' : s.cert
      }
    });
  }

  cancelEditSupplier() {
    this.set({ editingSupplier: null, supplierForm: blankSupplier() });
  }

  async addSupplier() {
    if (!this.guard('master')) return;

    const f = this.state.supplierForm;
    if (!f.name) { this.say('ระบุชื่อซัพพลายเออร์ก่อนบันทึก', true); return; }

    const patch = {
      name: f.name,
      category: f.category || '-', contact: f.contact || '-',
      phone: f.phone || '-', terms: f.terms || '-', cert: f.cert || '-'
    };

    if (this.state.editingSupplier) {
      const id = this.state.editingSupplier;
      const ok = await this.persist('แก้ไขซัพพลายเออร์', () => db.updateSupplier(id, patch));
      if (!ok) return;
      this.set(s => ({
        suppliers: s.suppliers.map(x => (x.id === id ? { ...x, ...patch } : x)),
        editingSupplier: null, supplierForm: blankSupplier()
      }));
      this.say(`แก้ไข ${id} · ${f.name} เรียบร้อย`);
      return;
    }

    const id = 'SUP-' + String(this.state.suppliers.length + 1).padStart(3, '0');
    const supplier = { id, ...patch, score: 80 };
    const ok = await this.persist('เพิ่มซัพพลายเออร์', () => db.insertSupplier(supplier));
    if (!ok) return;
    this.set(s => ({ suppliers: s.suppliers.concat([supplier]), supplierForm: blankSupplier() }));
    this.say(`ลงทะเบียน ${id} · ${f.name} เรียบร้อย`);
  }

  /* ---- view state ------------------------------------------------------- */

  setView(view) {
    if (view === 'admin' && !this.isAdmin()) {
      this.say('เฉพาะผู้ดูแลระบบเท่านั้นที่เข้าหน้านี้ได้', true);
      return;
    }
    this.set({ view });
    if (view === 'admin' && this.persisted && !this.state.accountsLoaded) {
      this.loadAccounts();
    }
  }
  setSearch(q)    { this.set({ search: q }); }
  setMoveFilter(f) { this.set({ moveFilter: f }); }

  /** Free-text match used by every searchable table. */
  matches(...parts) {
    const q = this.state.search.trim().toLowerCase();
    if (!q) return true;
    return parts.join(' ').toLowerCase().includes(q);
  }

  /** Sections visible to the current role, plus the admin-only settings page. */
  navSections() {
    return SECTIONS.filter(s => this.canSee(s.key));
  }
}

export const store = new Store();
