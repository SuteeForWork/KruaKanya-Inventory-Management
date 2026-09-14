/** ซัพพลายเออร์ & รายละเอียดวัตถุดิบ — the two master registries. */

import { el, when } from '../dom.js';
import {
  badge, card, confirmAction, fieldGrid, formCard, inputField, meter, selectField,
  table, td, tdCode, tdNum, tdTitled, tr
} from '../components.js';
import { store } from '../../core/store.js';
import { baht, kgNum, n } from '../../core/format.js';
import { scopedMoves } from '../../core/inventory.js';

const SUPPLIER_HEAD = [
  'รหัส', 'ซัพพลายเออร์', 'ผู้ติดต่อ', 'เบอร์โทร', 'เงื่อนไขชำระ',
  'ใบรับรอง', 'ยอดซื้อสะสม|R', 'คะแนนคู่ค้า', ''
];

const ITEM_HEAD = [
  'รหัส', 'ชื่อวัตถุดิบ', 'หมวด', 'หน่วยนับ', 'นับแบบ', 'น้ำหนัก/หน่วย (กก.)|R',
  'อายุ (วัน)|R', 'ขั้นต่ำ|R', 'การจัดเก็บ', 'ซัพพลายเออร์หลัก', ''
];

const TRACK_BY_OPTIONS = [
  { value: 'weight', label: 'น้ำหนัก (กก.)' },
  { value: 'count', label: 'จำนวนชิ้น' }
];

const WEIGHT_UNIT_OPTIONS = [{ value: 'kg', label: 'กก.' }, { value: 'g', label: 'ก.' }];

function supplierForm(state) {
  const editing = state.editingSupplier;
  return formCard({ title: editing ? `แก้ไขซัพพลายเออร์ · ${editing}` : 'ลงทะเบียนซัพพลายเออร์ใหม่' },
    fieldGrid('xs',
      inputField('ชื่อซัพพลายเออร์', 'supplierForm', 'name', { placeholder: 'เช่น สยามดรายกู๊ดส์' }),
      inputField('ประเภทวัตถุดิบที่ส่ง', 'supplierForm', 'category', { placeholder: 'ผัก / เนื้อสัตว์ / ของแห้ง' }),
      inputField('ผู้ติดต่อ', 'supplierForm', 'contact', { placeholder: 'ชื่อ-นามสกุล' }),
      inputField('เบอร์โทร', 'supplierForm', 'phone', { placeholder: '0xx-xxx-xxxx', mono: true }),
      inputField('เงื่อนไขชำระเงิน', 'supplierForm', 'terms', { placeholder: 'เครดิต 30 วัน' }),
      inputField('ใบรับรอง', 'supplierForm', 'cert', { placeholder: 'GMP / HACCP / GAP' }),
      el('div', { class: 'field field--action', style: { flexDirection: 'row', gap: '8px' } },
        el('button', {
          class: 'btn btn--primary btn--block', text: editing ? 'บันทึกการแก้ไข' : 'เพิ่มซัพพลายเออร์',
          onClick: () => {
            if (editing && !confirmAction(`ยืนยันบันทึกการแก้ไขซัพพลายเออร์ ${editing}?`)) return;
            store.addSupplier();
          }
        }),
        when(editing, () => el('button', { class: 'btn', text: 'ยกเลิก', onClick: () => store.cancelEditSupplier() }))
      )
    )
  );
}

function itemForm(state) {
  const editing = state.editingItem;
  const f = state.itemForm;
  const isCount = f.trackBy === 'count';
  const supplierOptions = state.suppliers.map(s => ({ value: s.name, label: s.name }));
  return formCard({
    title: editing ? `แก้ไขวัตถุดิบ · ${editing}` : 'เพิ่มวัตถุดิบใหม่ (Item Master)',
    note: editing ? 'เปลี่ยนรหัสได้ — ล็อต ธุรกรรม และสูตรที่อ้างอิงรหัสนี้จะอัปเดตตามให้อัตโนมัติ' : null
  },
    fieldGrid('xs',
      inputField('รหัสวัตถุดิบ', 'itemForm', 'code', { placeholder: 'ING-VEG-020', mono: true }),
      inputField('ชื่อวัตถุดิบ', 'itemForm', 'name', { placeholder: 'เช่น แครอทหั่นเต๋า' }),
      inputField('หมวด', 'itemForm', 'category', { placeholder: 'ผักสด / เนื้อสัตว์ / ของแห้ง' }),
      inputField('หน่วยนับ (หน่วยย่อยที่สุด)', 'itemForm', 'unit', { placeholder: 'ลัง / แพ็ค / ถุง / ใบ' }),
      selectField('นับสต๊อกแบบ', 'itemForm', 'trackBy', TRACK_BY_OPTIONS),
      when(!isCount, () =>
        inputField('น้ำหนักต่อ 1 หน่วย', 'itemForm', 'weightPerUnit', { type: 'number', placeholder: '3', mono: true })),
      when(!isCount, () => selectField('หน่วยน้ำหนัก', 'itemForm', 'weightUnit', WEIGHT_UNIT_OPTIONS)),
      inputField('อายุวัตถุดิบ (วัน)', 'itemForm', 'shelfLife', { type: 'number', placeholder: '7', mono: true }),
      inputField(
        isCount ? `ขั้นต่ำในคลัง (${f.unit || 'หน่วย'})` : 'ขั้นต่ำในคลัง (กก.)',
        'itemForm', 'minStock', { type: 'number', placeholder: '20', mono: true }
      ),
      inputField('การจัดเก็บ', 'itemForm', 'storage', { placeholder: 'แช่เย็น 2–4°C' }),
      selectField('ซัพพลายเออร์หลัก', 'itemForm', 'mainSupplier', supplierOptions, { placeholder: '— เลือกซัพพลายเออร์ —' }),
      inputField('หน่วยแพ็ค (ถ้ามี)', 'itemForm', 'packUnit', { placeholder: 'เช่น แพ็ค' }),
      when(f.packUnit, () =>
        inputField(`จำนวน ${f.unit || 'หน่วยย่อย'} ต่อ 1 ${f.packUnit}`, 'itemForm', 'packSize', { type: 'number', placeholder: '50', mono: true })),
      when(f.packUnit, () => inputField('หน่วยกล่อง (ถ้ามี)', 'itemForm', 'caseUnit', { placeholder: 'เช่น กล่อง' })),
      when(f.packUnit && f.caseUnit, () =>
        inputField(`จำนวน ${f.packUnit} ต่อ 1 ${f.caseUnit}`, 'itemForm', 'caseSize', { type: 'number', placeholder: '10', mono: true })),
      el('div', { class: 'field field--action', style: { flexDirection: 'row', gap: '8px' } },
        el('button', {
          class: 'btn btn--primary btn--block', text: editing ? 'บันทึกการแก้ไข' : 'เพิ่มวัตถุดิบ',
          onClick: () => {
            if (editing && !confirmAction(`ยืนยันบันทึกการแก้ไขวัตถุดิบ ${editing}?`)) return;
            store.addItem();
          }
        }),
        when(editing, () => el('button', { class: 'btn', text: 'ยกเลิก', onClick: () => store.cancelEditItem() }))
      )
    )
  );
}

/** Cumulative purchases are read back off the receipt ledger, not stored. */
function purchasesFrom(state, supplierName) {
  return scopedMoves(state)
    .filter(m => m.type === 'รับเข้า' && (m.note || '').startsWith(supplierName))
    .reduce((a, m) => a + m.cost, 0);
}

function supplierRows(state) {
  return state.suppliers
    .filter(s => store.matches(s.name, s.id, s.category, s.contact))
    .map(s => {
      const purchases = purchasesFrom(state, s.name);
      const tone = s.score >= 90 ? 'ok' : s.score >= 85 ? 'warn' : 'danger';
      return tr(
        tdCode(s.id),
        tdTitled(s.name, s.category, { mono: false }),
        td(s.contact),
        tdCode(s.phone),
        td(s.terms),
        tdCode(s.cert),
        tdNum(purchases ? baht(purchases) : '—'),
        td(meter(s.score, tone, { value: String(s.score), score: true })),
        td(when(store.canEdit('master'), () =>
          el('button', { class: 'btn btn--small', text: 'แก้ไข', onClick: () => store.startEditSupplier(s.id) })))
      );
    });
}

function itemRows(state) {
  return state.items
    .filter(i => store.matches(i.name, i.code, i.category))
    .map(i => tr(
      tdCode(i.code),
      td(i.name),
      td(i.category),
      td(i.packUnit ? `${i.unit} (${[i.packUnit, i.caseUnit].filter(Boolean).join(' / ')})` : i.unit),
      td(badge(i.trackBy === 'count' ? 'จำนวนชิ้น' : 'น้ำหนัก', i.trackBy === 'count' ? 'watch' : 'ok', { plain: true })),
      tdNum(i.trackBy === 'count' ? '—' : kgNum(i.weightPerUnit)),
      tdNum(n(i.shelfLife)),
      tdNum(`${n(i.minStock)}${i.trackBy === 'count' ? '' : ' กก.'}`),
      td(i.storage),
      td(i.mainSupplier),
      td(when(store.canEdit('master'), () =>
        el('button', { class: 'btn btn--small', text: 'แก้ไข', onClick: () => store.startEditItem(i.code) })))
    ));
}

export function masterView() {
  const state = store.state;
  return el('div', { class: 'page__sections' },
    when(store.canEdit('master'), () => supplierForm(state)),
    card({ title: 'ทะเบียนซัพพลายเออร์', note: `${state.suppliers.length} ราย` },
      table(SUPPLIER_HEAD, supplierRows(state))),
    when(store.canEdit('master'), () => itemForm(state)),
    card({ title: 'รายละเอียดวัตถุดิบ (Item Master)' },
      table(ITEM_HEAD, itemRows(state)))
  );
}
