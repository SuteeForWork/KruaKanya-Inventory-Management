/**
 * Supabase repository — the only file that knows about `db/schema.sql`'s
 * column names. Every function here takes or returns objects shaped exactly
 * like the ones `src/data/seed.js` produces, so `store.js` never has to think
 * about snake_case, foreign keys, or PostgREST's string-encoded numerics.
 *
 * Loaded straight from a CDN as an ES module — no bundler, matching the rest
 * of this project.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { config } from '../config.js';

export const isConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);

export const supabase = isConfigured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;

/** PostgREST sends `numeric`/`bigint` columns as strings to avoid precision loss. */
const num = v => (v === null || v === undefined ? 0 : Number(v));

/** Postgres `time` comes back as 'HH:MM:SS' — the app displays 'HH:MM'. */
const hm = t => (t ? t.slice(0, 5) : t);

function must(result, action) {
  if (result.error) throw new Error(`${action}: ${result.error.message}`);
  return result.data;
}

/* -------------------------------------------------------------------------- */
/* Mappers: DB row (snake_case, normalized) -> app shape (camelCase)          */
/* -------------------------------------------------------------------------- */

const toBranch = row => ({
  id: row.id, name: row.name, type: row.type,
  manager: row.manager, phone: row.phone
});

const toSupplier = row => ({
  id: row.id, name: row.name, category: row.category, contact: row.contact,
  phone: row.phone, terms: row.terms, cert: row.cert, score: row.score
});

const toItem = row => ({
  code: row.code, name: row.name, category: row.category, unit: row.unit,
  weightPerUnit: num(row.weight_per_unit), shelfLife: row.shelf_life,
  minStock: num(row.min_stock), storage: row.storage,
  mainSupplier: row.suppliers ? row.suppliers.name : null
});

const toRecipe = row => ({
  id: row.id, product: row.product, unit: row.unit,
  net: num(row.net), capPerDay: row.cap_per_day,
  lines: (row.recipe_lines || []).map(l => ({ code: l.item_code, qty: num(l.qty) }))
});

const toLot = row => ({
  id: row.id, branch: row.branch_id, code: row.item_code,
  name: row.items ? row.items.name : row.item_code,
  unit: row.items ? row.items.unit : 'หน่วย',
  weightPerUnit: num(row.weight_per_unit), shelfLife: row.shelf_life,
  supplier: row.suppliers ? row.suppliers.name : '-',
  buyer: row.buyer, recvDate: row.recv_date, recvTime: hm(row.recv_time),
  mfgDate: row.mfg_date, qtyIn: num(row.qty_in), qtyLeft: num(row.qty_left),
  pricePerUnit: num(row.price_per_unit), ref: row.ref
});

const toMove = row => ({
  branch: row.branch_id, id: row.doc_no, type: row.type, lotId: row.lot_id,
  code: row.item_code, name: row.items ? row.items.name : row.item_code,
  date: row.move_date, time: hm(row.move_time),
  qty: num(row.qty), weight: num(row.weight), cost: num(row.cost),
  user: row.staff_name, purpose: row.purpose, note: row.note,
  age: row.age_left_days === null ? undefined : row.age_left_days
});

const toOutput = row => ({
  branch: row.branch_id, id: row.id, date: row.output_date, shift: row.shift,
  product: row.product, qty: num(row.qty), unit: row.unit,
  weight: num(row.weight), reject: num(row.reject), staff: row.staff_name
});

/* -------------------------------------------------------------------------- */
/* Read — everything the app needs to boot                                    */
/* -------------------------------------------------------------------------- */

/** Fetch every table and reshape it into the same object seed() produces. */
export async function loadAll() {
  const [branches, suppliers, items, recipes, lots, moves, outputs, perms] = await Promise.all([
    supabase.from('branches').select('*').order('id')
      .then(r => must(r, 'โหลดสาขา')),
    supabase.from('suppliers').select('*').order('id')
      .then(r => must(r, 'โหลดซัพพลายเออร์')),
    supabase.from('items').select('*, suppliers(name)').order('code')
      .then(r => must(r, 'โหลดวัตถุดิบ')),
    supabase.from('recipes').select('*, recipe_lines(item_code, qty)').order('id')
      .then(r => must(r, 'โหลดสูตร')),
    supabase.from('lots').select('*, items(name, unit), suppliers(name)').order('id')
      .then(r => must(r, 'โหลดล็อต')),
    supabase.from('moves').select('*, items(name)').order('move_date').order('move_time')
      .then(r => must(r, 'โหลดรายการเคลื่อนไหว')),
    supabase.from('outputs').select('*').order('output_date')
      .then(r => must(r, 'โหลดผลผลิต')),
    supabase.from('role_permissions').select('role, section, level')
      .then(r => must(r, 'โหลดสิทธิ์การใช้งาน'))
  ]);

  return {
    branches: branches.map(toBranch),
    suppliers: suppliers.map(toSupplier),
    items: items.map(toItem),
    recipes: recipes.map(toRecipe),
    lots: lots.map(toLot),
    moves: moves.map(toMove),
    outputs: outputs.map(toOutput),
    perms: perms.length ? permsToMatrix(perms) : null
  };
}

function permsToMatrix(rows) {
  const matrix = {};
  rows.forEach(r => {
    (matrix[r.role] || (matrix[r.role] = {}))[r.section] = r.level;
  });
  return matrix;
}

/** Turn `{ [role]: { [section]: level } }` into upsertable rows. */
function matrixToPerms(matrix) {
  const rows = [];
  Object.entries(matrix).forEach(([role, sections]) => {
    Object.entries(sections).forEach(([section, level]) => {
      rows.push({ role, section, level });
    });
  });
  return rows;
}

/** First boot with an empty table — write the app's built-in defaults once. */
export async function seedPermissions(defaultMatrix) {
  const rows = matrixToPerms(defaultMatrix);
  must(await supabase.from('role_permissions').upsert(rows, { onConflict: 'role,section' }), 'ตั้งค่าสิทธิ์เริ่มต้น');
  return defaultMatrix;
}

/* -------------------------------------------------------------------------- */
/* Write — one function per store.js action that mutates data                 */
/* -------------------------------------------------------------------------- */

export async function upsertPermission(role, section, level) {
  must(await supabase.from('role_permissions').upsert({ role, section, level }, { onConflict: 'role,section' }), 'บันทึกสิทธิ์');
}

export async function replacePermissions(defaultMatrix) {
  return seedPermissions(defaultMatrix);
}

export async function insertBranch(branch) {
  must(await supabase.from('branches').insert({
    id: branch.id, name: branch.name, type: branch.type,
    manager: branch.manager, phone: branch.phone
  }), 'เพิ่มสาขา');
}

export async function updateBranch(id, branch) {
  must(await supabase.from('branches').update({
    name: branch.name, type: branch.type, manager: branch.manager, phone: branch.phone
  }).eq('id', id), 'แก้ไขสาขา');
}

export async function insertSupplier(supplier) {
  must(await supabase.from('suppliers').insert({
    id: supplier.id, name: supplier.name, category: supplier.category,
    contact: supplier.contact, phone: supplier.phone,
    terms: supplier.terms, cert: supplier.cert, score: supplier.score
  }), 'เพิ่มซัพพลายเออร์');
}

export async function updateSupplier(id, supplier) {
  must(await supabase.from('suppliers').update({
    name: supplier.name, category: supplier.category, contact: supplier.contact,
    phone: supplier.phone, terms: supplier.terms, cert: supplier.cert
  }).eq('id', id), 'แก้ไขซัพพลายเออร์');
}

export async function insertItem(item, mainSupplierId) {
  must(await supabase.from('items').insert({
    code: item.code, name: item.name, category: item.category, unit: item.unit,
    weight_per_unit: item.weightPerUnit, shelf_life: item.shelfLife,
    min_stock: item.minStock, storage: item.storage,
    main_supplier_id: mainSupplierId || null
  }), 'เพิ่มวัตถุดิบ');
}

/**
 * `newCode` may differ from `oldCode` — items.code is the primary key, and
 * lots/moves/recipe_lines reference it with ON UPDATE CASCADE (see
 * db/migrations/001_item_code_on_update_cascade.sql), so renaming it here
 * renames it everywhere it's used too.
 */
export async function updateItem(oldCode, newCode, item, mainSupplierId) {
  must(await supabase.from('items').update({
    code: newCode,
    name: item.name, category: item.category, unit: item.unit,
    weight_per_unit: item.weightPerUnit, shelf_life: item.shelfLife,
    min_stock: item.minStock, storage: item.storage,
    main_supplier_id: mainSupplierId || null
  }).eq('code', oldCode), 'แก้ไขวัตถุดิบ');
}

export async function insertRecipe(recipe) {
  must(await supabase.from('recipes').insert({
    id: recipe.id, product: recipe.product, unit: recipe.unit,
    net: recipe.net, cap_per_day: recipe.capPerDay
  }), 'เพิ่มสูตร');
  if (recipe.lines.length) {
    must(await supabase.from('recipe_lines').insert(
      recipe.lines.map(l => ({ recipe_id: recipe.id, item_code: l.code, qty: l.qty }))
    ), 'เพิ่มรายการวัตถุดิบในสูตร');
  }
}

/** One receipt: a new lot plus its matching 'รับเข้า' ledger row. */
export async function insertReceipt(lot, move, supplierId) {
  must(await supabase.from('lots').insert({
    id: lot.id, branch_id: lot.branch, item_code: lot.code,
    supplier_id: supplierId || null, buyer: lot.buyer,
    recv_date: lot.recvDate, recv_time: lot.recvTime, mfg_date: lot.mfgDate,
    shelf_life: lot.shelfLife, weight_per_unit: lot.weightPerUnit,
    qty_in: lot.qtyIn, qty_left: lot.qtyLeft, price_per_unit: lot.pricePerUnit,
    ref: lot.ref
  }), 'บันทึกล็อตรับเข้า');
  await insertMoves([move]);
}

export async function insertMoves(moves) {
  must(await supabase.from('moves').insert(moves.map(m => ({
    doc_no: m.id, branch_id: m.branch, lot_id: m.lotId, item_code: m.code,
    type: m.type, move_date: m.date, move_time: m.time,
    qty: m.qty, weight: m.weight, cost: m.cost, staff_name: m.user,
    purpose: m.purpose, note: m.note,
    age_left_days: m.age === undefined ? null : m.age
  }))), 'บันทึกรายการเคลื่อนไหว');
}

export async function updateLotQtyLeft(lotId, qtyLeft) {
  must(await supabase.from('lots').update({ qty_left: qtyLeft }).eq('id', lotId), 'ปรับยอดคงเหลือของล็อต');
}

/** Corrects a receiving record — the item code and branch are not editable. */
export async function updateLot(lotId, patch, supplierId) {
  must(await supabase.from('lots').update({
    supplier_id: supplierId || null, buyer: patch.buyer,
    recv_date: patch.recvDate, recv_time: patch.recvTime, mfg_date: patch.mfgDate,
    shelf_life: patch.shelfLife, weight_per_unit: patch.weightPerUnit,
    qty_in: patch.qtyIn, qty_left: patch.qtyLeft, price_per_unit: patch.pricePerUnit,
    ref: patch.ref
  }).eq('id', lotId), 'แก้ไขรายการรับเข้า');
}

/** A branch transfer also lands as a brand-new lot at the destination. */
export async function insertTransferLot(lot, supplierId) {
  must(await supabase.from('lots').insert({
    id: lot.id, branch_id: lot.branch, item_code: lot.code,
    supplier_id: supplierId || null, buyer: lot.buyer,
    recv_date: lot.recvDate, recv_time: lot.recvTime, mfg_date: lot.mfgDate,
    shelf_life: lot.shelfLife, weight_per_unit: lot.weightPerUnit,
    qty_in: lot.qtyIn, qty_left: lot.qtyLeft, price_per_unit: lot.pricePerUnit,
    ref: lot.ref
  }), 'บันทึกล็อตรับโอน');
}

export async function insertOutput(output) {
  must(await supabase.from('outputs').insert({
    id: output.id, branch_id: output.branch, output_date: output.date,
    shift: output.shift, product: output.product, qty: output.qty,
    unit: output.unit, weight: output.weight, reject: output.reject,
    staff_name: output.staff
  }), 'บันทึกผลผลิต');
}

/* -------------------------------------------------------------------------- */
/* Employee accounts — registration + admin approval                          */
/*                                                                            */
/* All four calls go through RPC functions, never the `accounts` table       */
/* directly — it has no RLS policies of its own (see db/schema.sql). The     */
/* functions run as the table owner and hand back only what each caller      */
/* needs; check_login never returns the password hash, list_accounts never   */
/* returns it either.                                                       */
/* -------------------------------------------------------------------------- */

export async function registerAccount(account) {
  must(await supabase.rpc('register_account', {
    p_full_name: account.fullName, p_department: account.department,
    p_email: account.email, p_phone: account.phone, p_role: account.role
  }), 'ลงทะเบียนผู้ใช้งาน');
}

/** Returns `{ id, fullName, role, branch }` for an approved match, or null. */
export async function checkLogin(email, password) {
  const rows = must(await supabase.rpc('check_login', { p_email: email, p_password: password }), 'ตรวจสอบการเข้าสู่ระบบ');
  if (!rows || !rows.length) return null;
  const row = rows[0];
  return { id: row.account_id, fullName: row.full_name, role: row.role, branch: row.branch_id || 'ALL' };
}

export async function listAccounts() {
  const rows = must(await supabase.rpc('list_accounts'), 'โหลดรายชื่อผู้ใช้งาน');
  return rows.map(r => ({
    id: r.id, fullName: r.full_name, department: r.department, email: r.email, phone: r.phone,
    role: r.role, branch: r.branch_id || 'ALL', status: r.status,
    createdAt: r.created_at, approvedAt: r.approved_at
  }));
}

export async function approveAccount(id, branchId) {
  must(await supabase.rpc('approve_account', {
    p_id: id, p_branch_id: branchId === 'ALL' ? null : branchId
  }), 'อนุมัติผู้ใช้งาน');
}

export async function rejectAccount(id) {
  must(await supabase.rpc('reject_account', { p_id: id }), 'ปฏิเสธผู้ใช้งาน');
}

/** Just the one name field — see db/migrations/003_editable_names.sql. */
export async function updateAccountName(id, fullName) {
  must(await supabase.rpc('update_account_name', { p_id: id, p_full_name: fullName }), 'แก้ไขชื่อผู้ใช้งาน');
}

/* -------------------------------------------------------------------------- */
/* Admin's own display name — separate one-row table, not the accounts table. */
/* -------------------------------------------------------------------------- */

export async function getAdminName() {
  const { data, error } = await supabase.from('admin_profile').select('full_name').eq('id', 1).maybeSingle();
  if (error) throw new Error(`โหลดชื่อผู้ดูแลระบบ: ${error.message}`);
  return data ? data.full_name : null;
}

export async function updateAdminName(fullName) {
  must(await supabase.from('admin_profile').update({ full_name: fullName }).eq('id', 1), 'แก้ไขชื่อผู้ดูแลระบบ');
}

/* -------------------------------------------------------------------------- */
/* Roles — the set of roles itself is admin-editable, not just their labels.  */
/* `roles` is open-access (cosmetic data), so label/person edits are a plain  */
/* table update; add/delete go through RPCs since adding one also needs a    */
/* matching row per section in role_permissions, and deleting one needs the  */
/* "not in use" check done server-side.                                      */
/* -------------------------------------------------------------------------- */

export async function getRoles() {
  const { data, error } = await supabase.from('roles').select('role_key, label, person').order('role_key');
  if (error) throw new Error(`โหลดบทบาท: ${error.message}`);
  return data.map(r => ({ roleKey: r.role_key, label: r.label, person: r.person }));
}

export async function updateRole(roleKey, label, person) {
  must(await supabase.from('roles').update({ label, person }).eq('role_key', roleKey), 'แก้ไขบทบาท');
}

export async function addRole(roleKey, label, person, sectionKeys) {
  must(await supabase.rpc('add_role', {
    p_role_key: roleKey, p_label: label, p_person: person, p_sections: sectionKeys
  }), 'เพิ่มบทบาท');
}

export async function deleteRole(roleKey) {
  must(await supabase.rpc('delete_role', { p_role_key: roleKey }), 'ลบบทบาท');
}

/* -------------------------------------------------------------------------- */
/* Admin managing accounts directly, bypassing self-registration.            */
/* -------------------------------------------------------------------------- */

export async function adminAddAccount(account) {
  must(await supabase.rpc('admin_add_account', {
    p_full_name: account.fullName, p_department: account.department,
    p_email: account.email, p_phone: account.phone, p_role: account.role,
    p_branch_id: account.branch === 'ALL' ? null : account.branch
  }), 'เพิ่มผู้ใช้งาน');
}

export async function deleteAccount(id) {
  must(await supabase.rpc('delete_account', { p_id: id }), 'ลบผู้ใช้งาน');
}
