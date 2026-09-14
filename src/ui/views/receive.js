/** รับวัตถุดิบเข้า — book a new lot and review the receiving history. */

import { el, when } from '../dom.js';
import {
  badge, card, confirmAction, fieldGrid, formCard, inputField, selectField,
  submitRow, table, td, tdCode, tdNum, tdTitled, tr
} from '../components.js';
import { store } from '../../core/store.js';
import { addDays, baht, kg, n, shortDate } from '../../core/format.js';
import { baseQtyFor, expiryOf, scopedLots, unitLevels } from '../../core/inventory.js';

const HEAD = [
  'ล็อต', 'วันที่-เวลารับเข้า', 'วัตถุดิบ', 'ซัพพลายเออร์', 'ผู้จัดซื้อ', 'วันที่ผลิต',
  'อายุ (วัน)|R', 'วันหมดอายุ', 'จำนวนรับเข้า|R', 'น้ำหนักรับเข้า|R',
  'น้ำหนัก/หน่วย|R', 'ราคา/หน่วย|R', 'มูลค่ารวม|R', ''
];

/** Live totals so the user sees the lot's weight, value and expiry before saving. */
function preview(state) {
  const f = state.receiveForm;
  const item = state.items.find(i => i.code === f.code);
  const isCount = item && item.trackBy === 'count';
  const qty = item ? baseQtyFor(item, f.qtyIn, f.qtyLevel) : (Number(f.qtyIn) || 0);
  const weightPerUnit = isCount ? 0 : (Number(f.weightPerUnit) || (item ? item.weightPerUnit : 0));
  const pricePerUnit = Number(f.pricePerUnit) || 0;
  const shelfLife = Number(f.shelfLife) || (item ? item.shelfLife : 0);

  const totalWeight = qty * weightPerUnit;
  const totalCost = qty * pricePerUnit;

  const rows = [];
  if (isCount) {
    rows.push({ label: `จำนวนรวม (${item.unit})`, value: qty ? n(qty) : '—', variant: 'green' });
  } else {
    rows.push({ label: 'น้ำหนักรับเข้ารวม', value: totalWeight ? kg(totalWeight) : '—', variant: 'green' });
  }
  rows.push({ label: 'มูลค่ารวม', value: totalCost ? baht(totalCost) : '—', variant: 'cost' });
  rows.push({ label: 'วันหมดอายุ (คำนวณ)', value: shelfLife && f.mfgDate ? shortDate(addDays(f.mfgDate, shelfLife)) : '—' });
  if (!isCount) {
    rows.push({ label: 'ต้นทุน/กก.', value: totalWeight ? baht(totalCost / totalWeight, 2) : '—' });
  }
  return rows;
}

function form(state) {
  const editing = state.editingLot;
  const f = state.receiveForm;
  const item = state.items.find(i => i.code === f.code);
  const isCount = item && item.trackBy === 'count';
  const levels = item ? unitLevels(item) : [];
  // Choosing a pack level is receiving-time convenience only — an edit
  // always corrects the lot's already-stored base-unit quantity directly.
  const showLevelPicker = !editing && levels.length > 1;
  const itemOptions = state.items.map(i => ({ value: i.code, label: `${i.code} · ${i.name}` }));
  const supplierOptions = state.suppliers.map(s => ({ value: s.name, label: s.name }));

  return formCard({
    title: editing ? `แก้ไขรายการรับเข้า · ${editing}` : 'บันทึกรับวัตถุดิบเข้า',
    note: editing ? 'แก้ไขได้ทุกช่องยกเว้นรหัสวัตถุดิบ' : `ล็อตถัดไป · ${store.nextLotId()}`
  },
    fieldGrid(null,
      inputField('วันที่รับเข้า', 'receiveForm', 'recvDate', { type: 'date' }),
      inputField('เวลาที่รับเข้า', 'receiveForm', 'recvTime', { type: 'time' }),
      selectField('รหัสวัตถุดิบ', 'receiveForm', 'code', itemOptions, {
        placeholder: '— เลือกรหัส —',
        onChange: code => store.pickReceiveItem(code),
        disabled: Boolean(editing)
      }),
      inputField('ชื่อวัตถุดิบ', 'receiveForm', 'name', { placeholder: 'เช่น อกไก่สด', disabled: Boolean(editing) }),
      selectField('ชื่อซัพพลายเออร์', 'receiveForm', 'supplier', supplierOptions, { placeholder: '— เลือกซัพพลายเออร์ —' }),
      inputField('ชื่อผู้จัดซื้อ', 'receiveForm', 'buyer', { placeholder: 'ชื่อผู้ทำ PO' }),
      inputField('วันที่ผลิต', 'receiveForm', 'mfgDate', { type: 'date' }),
      inputField('อายุวัตถุดิบ (วัน)', 'receiveForm', 'shelfLife', { type: 'number', placeholder: '7', mono: true }),
      when(showLevelPicker, () =>
        selectField('นับจำนวนเป็น', 'receiveForm', 'qtyLevel',
          levels.map(l => ({ value: l.value, label: l.label })))),
      inputField(
        `จำนวนที่รับเข้า (${showLevelPicker ? (levels.find(l => l.value === f.qtyLevel) || levels[0]).label : (item ? item.unit : 'หน่วย')})`,
        'receiveForm', 'qtyIn', { type: 'number', placeholder: '20', mono: true }
      ),
      when(!isCount, () =>
        inputField('น้ำหนักต่อ 1 หน่วย (กก.)', 'receiveForm', 'weightPerUnit', { type: 'number', placeholder: '3', mono: true })),
      inputField(`ราคา ณ วันรับเข้า (บาท/${item ? item.unit : 'หน่วย'})`, 'receiveForm', 'pricePerUnit', { type: 'number', placeholder: '145', mono: true }),
      inputField('เลขที่ใบส่งของ / PO', 'receiveForm', 'ref', { placeholder: 'PO-2608-0xx', mono: true })
    ),
    submitRow(
      el('div', { class: 'summary' }, preview(state).map(e => el('div', null,
        el('div', { class: 'summary__label', text: e.label }),
        el('div', { class: ['summary__value', e.variant && 'summary__value--' + e.variant], text: e.value })
      ))),
      el('div', { class: 'row', style: { gap: '8px' } },
        el('button', {
          class: 'btn btn--primary btn--submit', text: editing ? 'บันทึกการแก้ไข' : 'บันทึกรับเข้า',
          onClick: () => {
            if (editing) {
              if (confirmAction(`ยืนยันบันทึกการแก้ไขรายการรับเข้า ${editing}?`)) store.saveLotEdit();
              return;
            }
            store.submitReceive();
          }
        }),
        when(editing, () => el('button', { class: 'btn', text: 'ยกเลิก', onClick: () => store.cancelEditLot() }))
      )
    )
  );
}

function historyRows(state) {
  return scopedLots(state)
    .slice()
    .reverse()
    .filter(l => store.matches(l.name, l.code, l.id, l.supplier, l.buyer, l.ref))
    .map(l => {
      const item = state.items.find(i => i.code === l.code);
      const isCount = item && item.trackBy === 'count';
      return tr(
        tdCode(l.id),
        tdCode(`${shortDate(l.recvDate)} ${l.recvTime}`),
        tdTitled(l.name, l.code),
        td(l.supplier),
        td(l.buyer),
        tdCode(shortDate(l.mfgDate)),
        tdNum(n(l.shelfLife)),
        tdCode(shortDate(expiryOf(l))),
        tdNum(`${n(l.qtyIn)} ${l.unit}`),
        tdNum(isCount ? '—' : n(l.qtyIn * l.weightPerUnit, 1)),
        tdNum(isCount ? '—' : n(l.weightPerUnit, 1)),
        tdNum(baht(l.pricePerUnit)),
        tdNum(baht(l.qtyIn * l.pricePerUnit)),
        td(rowActions(l))
      );
    });
}

/** The last column: edit/delete for an untouched lot, an approval status
 *  (plus admin's approve/reject) once a non-admin's delete request is pending. */
function rowActions(l) {
  if (!store.canEdit('receive')) return null;

  if (l.pendingDelete) {
    if (!store.isAdmin()) return badge('รออนุมัติลบ', 'watch');
    return el('div', { class: 'row', style: { gap: '6px' } },
      badge('รออนุมัติลบ', 'watch'),
      el('button', {
        class: 'btn btn--small', text: 'อนุมัติลบ',
        onClick: () => {
          if (confirmAction(`ยืนยันลบรายการรับเข้า ${l.id} ถาวร? การลบนี้กู้คืนไม่ได้`)) store.approveDeleteLot(l.id);
        }
      }),
      el('button', {
        class: 'btn btn--small', text: 'ปฏิเสธ',
        onClick: () => {
          if (confirmAction(`ยืนยันปฏิเสธคำขอลบรายการรับเข้า ${l.id}?`)) store.rejectDeleteLot(l.id);
        }
      })
    );
  }

  return el('div', { class: 'row', style: { gap: '6px' } },
    el('button', { class: 'btn btn--small', text: 'แก้ไข', onClick: () => store.startEditLot(l.id) }),
    el('button', {
      class: 'btn btn--small', text: 'ลบ',
      onClick: () => {
        const msg = store.isAdmin()
          ? `ยืนยันลบรายการรับเข้า ${l.id} ถาวร? การลบนี้กู้คืนไม่ได้`
          : `ยืนยันส่งคำขอลบรายการรับเข้า ${l.id}? ต้องรอผู้ดูแลระบบอนุมัติก่อนจึงจะลบจริง`;
        if (confirmAction(msg)) store.requestDeleteLot(l.id);
      }
    })
  );
}

export function receiveView() {
  const state = store.state;
  return el('div', { class: 'page__sections' },
    when(store.canEdit('receive'), () => form(state)),
    card({ title: `ประวัติการรับเข้า (${scopedLots(state).length} ล็อต)` }, table(HEAD, historyRows(state)))
  );
}
