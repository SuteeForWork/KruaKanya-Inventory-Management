/** รับวัตถุดิบเข้า — book a new lot and review the receiving history. */

import { el, when } from '../dom.js';
import {
  card, fieldGrid, formCard, inputField, selectField,
  submitRow, table, td, tdCode, tdNum, tdTitled, tr
} from '../components.js';
import { store } from '../../core/store.js';
import { addDays, baht, kg, n, shortDate } from '../../core/format.js';
import { expiryOf, scopedLots } from '../../core/inventory.js';

const HEAD = [
  'ล็อต', 'วันที่-เวลารับเข้า', 'วัตถุดิบ', 'ซัพพลายเออร์', 'ผู้จัดซื้อ', 'วันที่ผลิต',
  'อายุ (วัน)|R', 'วันหมดอายุ', 'จำนวนรับเข้า|R', 'น้ำหนักรับเข้า|R',
  'น้ำหนัก/หน่วย|R', 'ราคา/หน่วย|R', 'มูลค่ารวม|R'
];

/** Live totals so the user sees the lot's weight, value and expiry before saving. */
function preview(state) {
  const f = state.receiveForm;
  const item = state.items.find(i => i.code === f.code);
  const qty = Number(f.qtyIn) || 0;
  const weightPerUnit = Number(f.weightPerUnit) || (item ? item.weightPerUnit : 0);
  const pricePerUnit = Number(f.pricePerUnit) || 0;
  const shelfLife = Number(f.shelfLife) || (item ? item.shelfLife : 0);

  const totalWeight = qty * weightPerUnit;
  const totalCost = qty * pricePerUnit;

  return [
    { label: 'น้ำหนักรับเข้ารวม', value: totalWeight ? kg(totalWeight) : '—', variant: 'green' },
    { label: 'มูลค่ารวม', value: totalCost ? baht(totalCost) : '—', variant: 'cost' },
    { label: 'วันหมดอายุ (คำนวณ)', value: shelfLife && f.mfgDate ? shortDate(addDays(f.mfgDate, shelfLife)) : '—' },
    { label: 'ต้นทุน/กก.', value: totalWeight ? baht(totalCost / totalWeight, 2) : '—' }
  ];
}

function form(state) {
  const itemOptions = state.items.map(i => ({ value: i.code, label: `${i.code} · ${i.name}` }));
  const supplierOptions = state.suppliers.map(s => ({ value: s.name, label: s.name }));

  return formCard({ title: 'บันทึกรับวัตถุดิบเข้า', note: `ล็อตถัดไป · ${store.nextLotId()}` },
    fieldGrid(null,
      inputField('วันที่รับเข้า', 'receiveForm', 'recvDate', { type: 'date' }),
      inputField('เวลาที่รับเข้า', 'receiveForm', 'recvTime', { type: 'time' }),
      selectField('รหัสวัตถุดิบ', 'receiveForm', 'code', itemOptions, {
        placeholder: '— เลือกรหัส —',
        onChange: code => store.pickReceiveItem(code)
      }),
      inputField('ชื่อวัตถุดิบ', 'receiveForm', 'name', { placeholder: 'เช่น อกไก่สด' }),
      selectField('ชื่อซัพพลายเออร์', 'receiveForm', 'supplier', supplierOptions, { placeholder: '— เลือกซัพพลายเออร์ —' }),
      inputField('ชื่อผู้จัดซื้อ', 'receiveForm', 'buyer', { placeholder: 'ชื่อผู้ทำ PO' }),
      inputField('วันที่ผลิต', 'receiveForm', 'mfgDate', { type: 'date' }),
      inputField('อายุวัตถุดิบ (วัน)', 'receiveForm', 'shelfLife', { type: 'number', placeholder: '7', mono: true }),
      inputField('จำนวนที่รับเข้า (หน่วย)', 'receiveForm', 'qtyIn', { type: 'number', placeholder: '20', mono: true }),
      inputField('น้ำหนักต่อ 1 หน่วย (กก.)', 'receiveForm', 'weightPerUnit', { type: 'number', placeholder: '3', mono: true }),
      inputField('ราคา ณ วันรับเข้า (บาท/หน่วย)', 'receiveForm', 'pricePerUnit', { type: 'number', placeholder: '145', mono: true }),
      inputField('เลขที่ใบส่งของ / PO', 'receiveForm', 'ref', { placeholder: 'PO-2608-0xx', mono: true })
    ),
    submitRow(
      el('div', { class: 'summary' }, preview(state).map(e => el('div', null,
        el('div', { class: 'summary__label', text: e.label }),
        el('div', { class: ['summary__value', e.variant && 'summary__value--' + e.variant], text: e.value })
      ))),
      el('button', {
        class: 'btn btn--primary btn--submit', text: 'บันทึกรับเข้า',
        onClick: () => store.submitReceive()
      })
    )
  );
}

function historyRows(state) {
  return scopedLots(state)
    .slice()
    .reverse()
    .filter(l => store.matches(l.name, l.code, l.id, l.supplier, l.buyer, l.ref))
    .map(l => tr(
      tdCode(l.id),
      tdCode(`${shortDate(l.recvDate)} ${l.recvTime}`),
      tdTitled(l.name, l.code),
      td(l.supplier),
      td(l.buyer),
      tdCode(shortDate(l.mfgDate)),
      tdNum(n(l.shelfLife)),
      tdCode(shortDate(expiryOf(l))),
      tdNum(`${n(l.qtyIn)} ${l.unit}`),
      tdNum(n(l.qtyIn * l.weightPerUnit, 1)),
      tdNum(n(l.weightPerUnit, 1)),
      tdNum(baht(l.pricePerUnit)),
      tdNum(baht(l.qtyIn * l.pricePerUnit))
    ));
}

export function receiveView() {
  const state = store.state;
  return el('div', { class: 'page__sections' },
    when(store.canEdit('receive'), () => form(state)),
    card({ title: `ประวัติการรับเข้า (${scopedLots(state).length} ล็อต)` }, table(HEAD, historyRows(state)))
  );
}
