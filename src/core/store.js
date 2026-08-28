/**
 * Application store — the single owner of mutable state.
 *
 * Views read `store.state`, call actions, and re-render on `subscribe`.
 * All business rules that change data live here; everything in `src/ui` is
 * presentation only.
 */

import { seed } from '../data/seed.js';
import { config, today } from '../config.js';
import { clockTime, kg, baht, n } from './format.js';
import {
  ALL_BRANCHES, allocate, ageLeftOf, branchName, inBranch, issuedOn
} from './inventory.js';
import { recipePlan } from './production.js';
import {
  PERM_ORDER, SECTIONS,
  authenticate, defaultPerms, firstViewFor, roleByKey
} from './access.js';

const TOAST_MS = 4200;

export const PURPOSES = ['เบิกผลิต', 'เบิกโอนสาขา', 'เบิกทดลองสูตร', 'ตัดทิ้ง/ของเสีย'];
export const SHIFTS = ['กะเช้า 05:00–13:00', 'กะบ่าย 13:00–21:00', 'กะดึก 21:00–05:00'];
export const BRANCH_TYPES = ['โรงผลิต', 'สาขาหน้าร้าน', 'คลังกระจายสินค้า'];
export const MOVE_FILTERS = ['ทั้งหมด', 'รับเข้า', 'เบิกออก', 'ของเสีย'];

const TRANSFER_PURPOSE = 'เบิกโอนสาขา';
const WASTE_PURPOSE = 'ตัดทิ้ง/ของเสีย';

/* -------------------------------------------------------------------------- */
/* Blank forms                                                                 */
/* -------------------------------------------------------------------------- */

const blankReceive = () => ({
  recvDate: today(), recvTime: '08:30', code: '', name: '', supplier: '',
  buyer: 'ณัฐพล ส.', mfgDate: '2026-08-25', shelfLife: '',
  qtyIn: '', weightPerUnit: '', pricePerUnit: '', ref: ''
});

const blankIssue = () => ({
  code: '', qty: '', issuer: '', purpose: 'เบิกผลิต', note: '', dest: ''
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

/* -------------------------------------------------------------------------- */
/* Store                                                                       */
/* -------------------------------------------------------------------------- */

class Store {
  constructor() {
    const data = seed();
    this.listeners = new Set();
    this.toastTimer = null;

    this.state = {
      ...data,
      view: 'dash',
      auth: null,
      role: 'admin',
      perms: defaultPerms(),
      branch: ALL_BRANCHES,
      search: '',
      moveFilter: MOVE_FILTERS[0],
      toast: null,
      seq: 40,
      loginForm: { user: '', pass: '', error: '' },
      receiveForm: blankReceive(),
      issueForm: blankIssue(),
      outputForm: blankOutput(),
      recipeForm: blankRecipe(),
      supplierForm: blankSupplier(),
      branchForm: blankBranch()
    };
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

  cyclePerm(role, section) {
    if (!this.isAdmin()) { this.say('เฉพาะผู้ดูแลระบบเท่านั้นที่แก้สิทธิ์ได้', true); return; }
    const next = PERM_ORDER[(PERM_ORDER.indexOf(this.perm(section, role)) + 1) % PERM_ORDER.length];
    this.set(s => ({ perms: { ...s.perms, [role]: { ...s.perms[role], [section]: next } } }));
  }

  resetPerms() {
    this.set({ perms: defaultPerms() });
    this.say('คืนค่าสิทธิ์เริ่มต้นของทุกบทบาทแล้ว');
  }

  /* ---- session ---------------------------------------------------------- */

  login() {
    const { user, pass } = this.state.loginForm;
    if (!user || !pass) {
      this.setField('loginForm', 'error', 'กรอกชื่อผู้ใช้และรหัสผ่านให้ครบ');
      return;
    }
    const account = authenticate(user, pass);
    if (!account) {
      this.setField('loginForm', 'error', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      return;
    }
    const role = roleByKey(account.role);
    this.set({
      auth: account,
      role: account.role,
      view: firstViewFor(this.state.perms, account.role),
      branch: account.branch || ALL_BRANCHES,
      loginForm: { user: '', pass: '', error: '' }
    });
    this.say(`เข้าสู่ระบบเป็น ${role.person} · ${role.label} · ${this.branchLabel(account.branch || ALL_BRANCHES)}`);
  }

  logout() {
    this.set({ auth: null, loginForm: { user: '', pass: '', error: '' } });
  }

  fillDemoAccount(user) {
    this.set({ loginForm: { user, pass: '1234', error: '' } });
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

  addBranch() {
    if (!this.isAdmin()) { this.say('เฉพาะผู้ดูแลระบบเท่านั้นที่เพิ่มสาขาได้', true); return; }
    const form = this.state.branchForm;
    if (!form.name) { this.say('ระบุชื่อสาขาก่อนบันทึก', true); return; }

    const id = 'BR-' + String(this.state.branches.length + 1).padStart(2, '0');
    const branch = {
      id, name: form.name,
      type: form.type || 'สาขาหน้าร้าน',
      manager: form.manager || '-',
      phone: form.phone || '-'
    };
    this.set(s => ({ branches: s.branches.concat([branch]), branchForm: blankBranch() }));
    this.say(`เพิ่ม ${id} · ${form.name} เรียบร้อย — พร้อมรับวัตถุดิบเข้าสาขานี้`);
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
        shelfLife:     item ? String(item.shelfLife) : s.receiveForm.shelfLife,
        supplier:      item && !s.receiveForm.supplier ? item.mainSupplier : s.receiveForm.supplier
      }
    }));
  }

  nextLotId() {
    const date = this.state.receiveForm.recvDate || today();
    return 'LOT-' + date.slice(2).replace(/-/g, '') + '-' + String(this.state.seq + 1).slice(-2);
  }

  submitReceive() {
    if (!this.guard('receive') || !this.requireBranch()) return;

    const f = this.state.receiveForm;
    const item = this.state.items.find(i => i.code === f.code);
    const name = f.name || (item ? item.name : '');
    const qty = Number(f.qtyIn) || 0;
    const weightPerUnit = Number(f.weightPerUnit) || (item ? item.weightPerUnit : 0);
    const pricePerUnit = Number(f.pricePerUnit) || 0;
    const shelfLife = Number(f.shelfLife) || (item ? item.shelfLife : 0);

    if (!f.code || !name || !qty || !pricePerUnit || !weightPerUnit) {
      this.say('กรอกไม่ครบ — ต้องมีรหัสวัตถุดิบ ชื่อ จำนวน น้ำหนัก/หน่วย และราคา', true);
      return;
    }

    const seq = this.state.seq + 1;
    const lotId = 'LOT-' + f.recvDate.slice(2).replace(/-/g, '') + '-' + String(seq).slice(-2);
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

    this.set(s => ({
      lots: s.lots.concat([lot]),
      moves: s.moves.concat([move]),
      seq,
      // Keep supplier and buyer — receiving usually comes in runs from one PO.
      receiveForm: { ...blankReceive(), supplier: f.supplier, buyer: f.buyer }
    }));
    this.say(`รับเข้า ${lotId} · ${name} ${n(qty)} หน่วย (${kg(qty * weightPerUnit)}) มูลค่า ${baht(qty * pricePerUnit)}`);
  }

  /* ---- issuing ---------------------------------------------------------- */

  submitIssue() {
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

    const seq = this.state.seq + 1;
    const doc = 'IS-2608-' + (100 + seq);
    const time = clockTime();
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
      date: today(), time, qty: r.take,
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
          recvDate: today(), recvTime: time, ref: doc
        });
        transferMoves.push({
          branch: f.dest, id: 'RC-' + id.slice(4), type: 'รับเข้า',
          lotId: id, code: r.lot.code, name: r.lot.name,
          date: today(), time, qty: r.take,
          weight: r.take * r.lot.weightPerUnit,
          cost: r.take * r.lot.pricePerUnit,
          user: f.issuer || '-', purpose: 'รับโอนระหว่างสาขา',
          note: `รับโอนจาก ${this.branchLabel(from)} · ${doc}`
        });
      });
    }

    const totalWeight = issueMoves.reduce((a, m) => a + m.weight, 0);
    const totalCost = issueMoves.reduce((a, m) => a + m.cost, 0);

    this.set(s => ({
      lots: lots.concat(transferLots),
      moves: s.moves.concat(issueMoves, transferMoves),
      seq,
      issueForm: { ...f, qty: '', note: '' }
    }));

    const tail = isTransfer
      ? ` · โอนเข้า ${this.branchLabel(f.dest)} แล้ว`
      : ` ตัดจาก ${issueMoves.length} ล็อต`;
    this.say(`${doc} · ${issueMoves[0].name} ${n(qty)} หน่วย (${kg(totalWeight)}) ต้นทุน ${baht(totalCost)}${tail}`);
  }

  /* ---- production output ------------------------------------------------ */

  submitOutput() {
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

  addRecipe() {
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

    this.set(s => ({ recipes: s.recipes.concat([recipe]), recipeForm: blankRecipe() }));
    this.say(`บันทึกสูตร ${id} · ${f.product} · วัตถุดิบ ${n(plan.kg, 3)} กก./หน่วย · ต้นทุนมาตรฐาน ${baht(plan.cost, 2)}`);
  }

  /* ---- suppliers -------------------------------------------------------- */

  addSupplier() {
    if (!this.guard('master')) return;

    const f = this.state.supplierForm;
    if (!f.name) { this.say('ระบุชื่อซัพพลายเออร์ก่อนบันทึก', true); return; }

    const id = 'SUP-' + String(this.state.suppliers.length + 1).padStart(3, '0');
    const supplier = {
      id, name: f.name,
      category: f.category || '-', contact: f.contact || '-',
      phone: f.phone || '-', terms: f.terms || '-', cert: f.cert || '-',
      score: 80
    };
    this.set(s => ({ suppliers: s.suppliers.concat([supplier]), supplierForm: blankSupplier() }));
    this.say(`ลงทะเบียน ${id} · ${f.name} เรียบร้อย`);
  }

  /* ---- view state ------------------------------------------------------- */

  setView(view)   { this.set({ view }); }
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
