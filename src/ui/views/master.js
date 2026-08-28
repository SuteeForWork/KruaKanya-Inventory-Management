/** ซัพพลายเออร์ & รายละเอียดวัตถุดิบ — the two master registries. */

import { el, when } from '../dom.js';
import {
  card, fieldGrid, formCard, inputField, meter,
  table, td, tdCode, tdNum, tdTitled, tr
} from '../components.js';
import { store } from '../../core/store.js';
import { baht, n } from '../../core/format.js';
import { scopedMoves } from '../../core/inventory.js';

const SUPPLIER_HEAD = [
  'รหัส', 'ซัพพลายเออร์', 'ผู้ติดต่อ', 'เบอร์โทร', 'เงื่อนไขชำระ',
  'ใบรับรอง', 'ยอดซื้อสะสม|R', 'คะแนนคู่ค้า'
];

const ITEM_HEAD = [
  'รหัส', 'ชื่อวัตถุดิบ', 'หมวด', 'หน่วยนับ', 'น้ำหนัก/หน่วย (กก.)|R',
  'อายุ (วัน)|R', 'ขั้นต่ำ (กก.)|R', 'การจัดเก็บ', 'ซัพพลายเออร์หลัก'
];

function form() {
  return formCard({ title: 'ลงทะเบียนซัพพลายเออร์ใหม่' },
    fieldGrid('xs',
      inputField('ชื่อซัพพลายเออร์', 'supplierForm', 'name', { placeholder: 'เช่น สยามดรายกู๊ดส์' }),
      inputField('ประเภทวัตถุดิบที่ส่ง', 'supplierForm', 'category', { placeholder: 'ผัก / เนื้อสัตว์ / ของแห้ง' }),
      inputField('ผู้ติดต่อ', 'supplierForm', 'contact', { placeholder: 'ชื่อ-นามสกุล' }),
      inputField('เบอร์โทร', 'supplierForm', 'phone', { placeholder: '0xx-xxx-xxxx', mono: true }),
      inputField('เงื่อนไขชำระเงิน', 'supplierForm', 'terms', { placeholder: 'เครดิต 30 วัน' }),
      inputField('ใบรับรอง', 'supplierForm', 'cert', { placeholder: 'GMP / HACCP / GAP' }),
      el('div', { class: 'field field--action' },
        el('button', { class: 'btn btn--primary btn--block', text: 'เพิ่มซัพพลายเออร์', onClick: () => store.addSupplier() }))
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
        td(meter(s.score, tone, { value: String(s.score), score: true }))
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
      td(i.unit),
      tdNum(n(i.weightPerUnit, 1)),
      tdNum(n(i.shelfLife)),
      tdNum(n(i.minStock)),
      td(i.storage),
      td(i.mainSupplier)
    ));
}

export function masterView() {
  const state = store.state;
  return el('div', { class: 'page__sections' },
    when(store.canEdit('master'), form),
    card({ title: 'ทะเบียนซัพพลายเออร์', note: `${state.suppliers.length} ราย` },
      table(SUPPLIER_HEAD, supplierRows(state))),
    card({ title: 'รายละเอียดวัตถุดิบ (Item Master)' },
      table(ITEM_HEAD, itemRows(state)))
  );
}
