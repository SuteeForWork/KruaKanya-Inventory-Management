/**
 * Export — the toolbar's Excel and PDF buttons.
 *
 * "Excel" writes a UTF-8 CSV with a BOM so Thai text opens correctly in Excel
 * without an import step. "PDF" hands off to the browser's print dialog; the
 * print stylesheet drops the chrome via the `data-print` attributes.
 */

import { store } from './store.js';
import { today } from '../config.js';
import {
  ageLeftOf, branchName, branchSummary, costOf, expiryOf,
  liveLots, scopedLots, scopedMoves, scopedOutputs, sortedMoves, weightOf
} from './inventory.js';
import { capacityOf, dailyProduction, recipePlan, standardYield } from './production.js';

/** Rows for the currently open view, header row first. */
export function csvRows(state) {
  const builder = BUILDERS[state.view] || BUILDERS.moves;
  return builder(state);
}

const num = (v, d) => Number(v).toFixed(d);
const branch = (state, id) => branchName(state.branches, id);

const BUILDERS = {
  receive(state) {
    const header = ['ล็อต', 'วันที่รับเข้า', 'เวลา', 'ชื่อวัตถุดิบ', 'รหัส', 'ซัพพลายเออร์', 'ผู้จัดซื้อ', 'วันที่ผลิต', 'อายุ(วัน)', 'วันหมดอายุ', 'จำนวนรับเข้า', 'น้ำหนักรับเข้า(กก.)', 'น้ำหนักต่อหน่วย(กก.)', 'ราคาต่อหน่วย', 'มูลค่ารวม'];
    return [header].concat(scopedLots(state).map(l => [
      l.id, l.recvDate, l.recvTime, l.name, l.code, l.supplier, l.buyer,
      l.mfgDate, l.shelfLife, expiryOf(l),
      l.qtyIn, l.qtyIn * l.weightPerUnit, l.weightPerUnit, l.pricePerUnit, l.qtyIn * l.pricePerUnit
    ]));
  },

  stock(state) {
    const header = ['ล็อต', 'รหัส', 'ชื่อวัตถุดิบ', 'ซัพพลายเออร์', 'หน่วยนับ', 'วันที่รับเข้า', 'วันหมดอายุ', 'อายุคงเหลือ(วัน)', 'จำนวนคงเหลือ', 'น้ำหนักคงเหลือ(กก.)', 'ราคา ณ รับเข้า/หน่วย', 'ราคา ณ รับเข้า/กก.', 'ต้นทุนคงเหลือ'];
    return [header].concat(liveLots(state).map(l => [
      l.id, l.code, l.name, l.supplier, l.unit, l.recvDate, expiryOf(l), ageLeftOf(l),
      l.qtyLeft, weightOf(l), l.pricePerUnit, num(l.pricePerUnit / l.weightPerUnit, 2), costOf(l)
    ]));
  },

  issue(state) {
    const header = ['เลขที่เอกสาร', 'วันที่', 'เวลา', 'ชื่อวัตถุดิบ', 'รหัส', 'ล็อต', 'จำนวนเบิกออก', 'น้ำหนักเบิกออก(กก.)', 'อายุคงเหลือ ณ วันเบิก', 'ผู้เบิกออก', 'ราคาที่เบิกออก', 'ประเภท', 'หมายเหตุ'];
    return [header].concat(scopedMoves(state).filter(m => m.type !== 'รับเข้า').map(m => [
      m.id, m.date, m.time, m.name, m.code, m.lotId, m.qty, m.weight,
      m.age === undefined ? '-' : m.age, m.user, m.cost, m.purpose || '-', m.note || '-'
    ]));
  },

  output(state) {
    const daily = dailyProduction(state);
    const header = ['วันที่', 'สินค้าที่ผลิต', 'จำนวนผลิตได้', 'น้ำหนักผลผลิต(กก.)', 'ของเสียจากการผลิต(กก.)', 'วัตถุดิบเบิกออก(กก.)', 'ต้นทุนวัตถุดิบที่เบิก', 'Yield(%)', 'ส่วนต่าง(กก.)', 'ต้นทุนวัตถุดิบต่อหน่วยผลผลิต'];
    const summary = [header].concat(daily.map(r => [
      r.date, r.outputs.map(o => o.product).join(' / '), r.qty,
      num(r.outputWeight, 1), num(r.reject, 1), num(r.issued.weight, 1), r.issued.cost,
      r.issued.weight ? num(r.pct, 1) : '-',
      num(r.issued.weight - r.outputWeight, 1),
      r.qty ? num(r.issued.cost / r.qty, 2) : '-'
    ]));

    const detailHeader = ['สาขา', 'วันที่', 'กะ', 'สินค้า', 'จำนวน', 'หน่วย', 'น้ำหนัก(กก.)', 'ของเสีย(กก.)', 'ผู้บันทึก'];
    const detail = scopedOutputs(state).slice().reverse().map(o => [
      branch(state, o.branch), o.date, o.shift, o.product, o.qty, o.unit, o.weight, o.reject, o.staff
    ]);

    return summary.concat([[''], ['บันทึกรายรายการ'], detailHeader], detail);
  },

  recipe(state) {
    const header = ['รหัสสูตร', 'เมนู', 'หน่วยผลผลิต', 'วัตถุดิบในสูตร', 'วัตถุดิบต่อหน่วย(กก.)', 'ผลผลิตสุทธิต่อหน่วย(กก.)', 'Yield มาตรฐาน(%)', 'ต้นทุนมาตรฐานต่อหน่วย', 'ผลิตได้จากสต๊อก(หน่วย)', 'กำลังผลิตต่อวัน(หน่วย)', 'ผลิตได้สูงสุด(หน่วย)', 'ข้อจำกัด'];
    return [header].concat(state.recipes.map(r => {
      const plan = recipePlan(state, r);
      const cap = capacityOf(state, r);
      return [
        r.id, r.product, r.unit,
        plan.lines.map(l => `${l.code} ${l.qty} กก.`).join(' + '),
        num(plan.kg, 3), num(r.net, 3),
        plan.kg ? num(standardYield(r, plan), 1) : '-',
        num(plan.cost, 2), cap.stockUnits, r.capPerDay || '-', cap.units,
        cap.bound === 'กำลังผลิต' ? 'กำลังผลิตต่อวัน' : limitText(cap)
      ];
    }));
  },

  master(state) {
    const header = ['ชนิดข้อมูล', 'รหัส', 'ชื่อ', 'รายละเอียด 1', 'รายละเอียด 2', 'รายละเอียด 3', 'รายละเอียด 4'];
    const suppliers = state.suppliers.map(s => [
      'Supplier', s.id, s.name, `${s.contact} / ${s.phone}`, s.category, s.terms, `${s.cert} (คะแนน ${s.score})`
    ]);
    const items = state.items.map(i => [
      'Item', i.code, i.name, `${i.category} / ${i.unit}`,
      `น้ำหนักต่อหน่วย ${i.weightPerUnit} กก.`, `อายุ ${i.shelfLife} วัน`,
      `${i.storage} / ขั้นต่ำ ${i.minStock} กก.`
    ]);
    return [header].concat(suppliers, items);
  },

  branch(state) {
    const header = ['รหัสสาขา', 'ชื่อสาขา', 'ประเภท', 'ผู้จัดการ', 'เบอร์โทร', 'ล็อตคงเหลือ', 'น้ำหนักคงเหลือ(กก.)', 'ต้นทุนคงคลัง', 'ล็อตใกล้หมดอายุ', 'มูลค่าของเสีย', 'Yield(%)'];
    return [header].concat(branchSummary(state).map(r => [
      r.branch.id, r.branch.name, r.branch.type, r.branch.manager, r.branch.phone,
      r.lotCount, num(r.weight, 1), r.cost, r.nearCount, r.wasteCost,
      r.yieldPct ? num(r.yieldPct, 1) : '-'
    ]));
  },

  moves(state) {
    const header = ['สาขา', 'วันที่', 'เวลา', 'ประเภท', 'เลขที่เอกสาร', 'ล็อต', 'รหัส', 'ชื่อวัตถุดิบ', 'จำนวน', 'น้ำหนัก(กก.)', 'มูลค่า', 'ผู้ทำรายการ', 'หมายเหตุ'];
    return [header].concat(sortedMoves(state).map(m => [
      branch(state, m.branch), m.date, m.time, m.type, m.id, m.lotId, m.code, m.name,
      m.qty, m.weight, m.cost, m.user, m.note || '-'
    ]));
  }
};

BUILDERS.dash = BUILDERS.moves;
BUILDERS.admin = BUILDERS.moves;

function limitText(cap) {
  return typeof cap.limit === 'string'
    ? cap.limit
    : `${cap.limit.name} (${cap.limit.availableKg.toFixed(1)} กก.)`;
}

function toCsv(rows) {
  return rows
    .map(row => row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(','))
    .join('\r\n');
}

/** Download the current view as CSV. */
export function exportExcel() {
  const csv = toCsv(csvRows(store.state));
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `inventory-${store.state.view}-${today()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  store.say('ส่งออก Excel (CSV, UTF-8) แล้ว — เปิดได้ทันทีใน Excel หรือ Google Sheets');
}

/** Open the print dialog so the user can save the page as a PDF. */
export function exportPdf() {
  store.say('เปิดหน้าต่างพิมพ์ — เลือก "Save as PDF" เพื่อบันทึกรายงานหน้านี้');
  setTimeout(() => window.print(), 350);
}
