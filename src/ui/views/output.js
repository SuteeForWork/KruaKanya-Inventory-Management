/** ผลผลิตรายวัน & Yield — record output and compare it against what was issued. */

import { el, when } from '../dom.js';
import {
  badge, card, fieldGrid, formCard, inputField, meter, selectField,
  statCard, submitRow, table, td, tdCode, tdNum, tr
} from '../components.js';
import { store, SHIFTS } from '../../core/store.js';
import { baht, kg, n, shortDate } from '../../core/format.js';
import { today } from '../../config.js';
import { issuedOn, scopedOutputs } from '../../core/inventory.js';
import { dailyProduction, yieldStatus, yieldTarget } from '../../core/production.js';

const DAILY_HEAD = [
  'วันที่', 'สินค้าที่ผลิต', 'จำนวนผลิตได้ (คละหน่วย)|R', 'น้ำหนักผลผลิต (กก.)|R',
  'วัตถุดิบเบิกออก (กก.)|R', 'ตามสูตร (กก.)|R', 'ต้นทุนวัตถุดิบ|R', 'Yield',
  'ส่วนต่าง (กก.)|R', 'ต้นทุน/หน่วยผลผลิต|R', 'สถานะ'
];

const RECORD_HEAD = [
  'วันที่', 'กะการผลิต', 'สินค้า / เมนู', 'จำนวนที่ผลิตได้|R',
  'น้ำหนักผลผลิต (กก.)|R', 'ของเสีย (กก.)|R', 'น้ำหนักต่อหน่วย|R', 'ผู้บันทึก'
];

/** Outputs can be counted in boxes, loaves or pounds — show each unit separately. */
function unitBreakdown(outputs) {
  const totals = {};
  outputs.forEach(o => { totals[o.unit] = (totals[o.unit] || 0) + o.qty; });
  return Object.keys(totals).map(u => `${n(totals[u])} ${u}`).join(' · ');
}

function stats(state, daily) {
  const target = yieldTarget();
  const todayRow = daily.find(r => r.date === today())
    || { qty: 0, outputWeight: 0, issued: { weight: 0, cost: 0 }, pct: 0, outputs: [] };

  const totalQty = daily.reduce((a, r) => a + r.qty, 0);
  const totalOut = daily.reduce((a, r) => a + r.outputWeight, 0);
  const totalIssuedWeight = daily.reduce((a, r) => a + r.issued.weight, 0);
  const totalIssuedCost = daily.reduce((a, r) => a + r.issued.cost, 0);
  const avgYield = totalIssuedWeight ? (totalOut / totalIssuedWeight) * 100 : 0;

  const todayStatus = yieldStatus(todayRow.pct);
  const avgStatus = yieldStatus(avgYield);

  return [
    statCard({
      plain: true, tone: 'ok',
      label: 'ผลิตได้วันนี้ (คละหน่วย)',
      value: unitBreakdown(todayRow.outputs) || '—',
      hint: `น้ำหนักผลผลิตรวม ${kg(todayRow.outputWeight)}`
    }),
    statCard({
      plain: true, tone: 'warn',
      label: 'วัตถุดิบเบิกออกวันนี้',
      value: n(todayRow.issued.weight, 1),
      hint: `กิโลกรัม · ${baht(todayRow.issued.cost)}`
    }),
    statCard({
      plain: true, tone: todayStatus.tone, toneValue: todayStatus.tone,
      label: 'Yield วันนี้',
      value: todayRow.pct ? `${n(todayRow.pct, 1)}%` : '—',
      hint: `เป้าหมาย ${target}%`
    }),
    statCard({
      plain: true, tone: avgStatus.tone,
      label: 'Yield เฉลี่ยช่วงที่บันทึก',
      value: avgYield ? `${n(avgYield, 1)}%` : '—',
      hint: `ผลผลิต ${kg(totalOut)} จากวัตถุดิบ ${kg(totalIssuedWeight)}`
    }),
    statCard({
      plain: true, tone: 'danger', toneValue: 'cost',
      label: 'ต้นทุนวัตถุดิบ/หน่วยผลผลิต',
      value: totalQty ? baht(totalIssuedCost / totalQty, 2) : '—',
      hint: `เฉลี่ยจาก ${n(totalQty)} หน่วยที่ผลิตได้`
    })
  ];
}

function form(state) {
  const f = state.outputForm;
  const issued = issuedOn(state, f.date);
  const qty = Number(f.qty) || 0;
  const weight = Number(f.weight) || 0;
  const pct = issued.weight ? (weight / issued.weight) * 100 : 0;
  const status = yieldStatus(pct);

  return formCard({
    title: 'บันทึกยอดที่ผลิตได้',
    note: 'ระบบจะเทียบกับน้ำหนักวัตถุดิบที่เบิกออกในวันเดียวกันอัตโนมัติ'
  },
    fieldGrid('sm',
      inputField('วันที่ผลิต', 'outputForm', 'date', { type: 'date' }),
      selectField('กะการผลิต', 'outputForm', 'shift', SHIFTS.map(v => ({ value: v, label: v }))),
      inputField('สินค้า / เมนูที่ผลิต', 'outputForm', 'product', { placeholder: 'เช่น ข้าวกล่องไก่ย่าง' }),
      inputField('จำนวนที่ผลิตได้', 'outputForm', 'qty', { type: 'number', placeholder: '240', mono: true }),
      inputField('หน่วยผลผลิต', 'outputForm', 'unit', { placeholder: 'กล่อง / ถาด / ชิ้น' }),
      inputField('น้ำหนักผลผลิตรวม (กก.)', 'outputForm', 'weight', { type: 'number', placeholder: '62', mono: true }),
      inputField('ของเสียจากการผลิต (กก.)', 'outputForm', 'reject', { type: 'number', placeholder: '0', mono: true }),
      inputField('ผู้บันทึก', 'outputForm', 'staff', { placeholder: 'เช่น เชฟกวิน ร.' })
    ),
    submitRow(
      el('div', { class: 'summary' },
        el('div', null,
          el('div', { class: 'summary__label', text: 'วัตถุดิบเบิกออกวันนั้น' }),
          el('div', { class: 'summary__value', text: issued.weight ? `${kg(issued.weight)} · ${baht(issued.cost)}` : '— ยังไม่มีการเบิก' })
        ),
        el('div', null,
          el('div', { class: 'summary__label', text: 'Yield ที่จะได้' }),
          el('div', { class: ['summary__value', 'tone-' + status.tone], text: pct ? `${n(pct, 1)}%` : '—' })
        ),
        el('div', null,
          el('div', { class: 'summary__label', text: 'ต้นทุนวัตถุดิบ/หน่วยผลผลิต' }),
          el('div', { class: 'summary__value summary__value--cost', text: qty && issued.cost ? baht(issued.cost / qty, 2) : '—' })
        )
      ),
      el('button', { class: 'btn btn--primary btn--submit', text: 'บันทึกผลผลิต', onClick: () => store.submitOutput() })
    )
  );
}

function dailyRows(daily) {
  return daily.map(r => {
    const status = yieldStatus(r.pct);
    const loss = r.issued.weight - r.outputWeight;
    return tr(
      tdCode(shortDate(r.date)),
      td(r.outputs.length ? r.outputs.map(o => o.product).join(' · ') : '— ไม่มีบันทึกผลผลิต'),
      tdNum(r.qty ? unitBreakdown(r.outputs) : '—'),
      tdNum(r.outputWeight ? n(r.outputWeight, 1) : '—'),
      tdNum(n(r.issued.weight, 1)),
      tdNum(r.planKg ? n(r.planKg, 1) : '—'),
      tdNum(baht(r.issued.cost)),
      td(meter(r.pct, status.tone, { value: r.pct ? `${n(r.pct, 1)}%` : '—' })),
      tdNum(r.outputWeight ? (loss >= 0 ? '' : '−') + n(Math.abs(loss), 1) : '—'),
      tdNum(r.qty ? baht(r.issued.cost / r.qty, 2) : '—'),
      td(badge(status.label, status.tone))
    );
  });
}

function recordRows(state) {
  return scopedOutputs(state)
    .slice()
    .reverse()
    .filter(o => store.matches(o.product, o.staff, o.shift, o.date))
    .map(o => tr(
      tdCode(shortDate(o.date)),
      td(o.shift),
      td(o.product),
      tdNum(`${n(o.qty)} ${o.unit}`),
      tdNum(n(o.weight, 1)),
      tdNum(o.reject ? n(o.reject, 1) : '—'),
      tdNum(`${n((o.weight / o.qty) * 1000, 0)} ก.`),
      td(o.staff)
    ));
}

export function outputView() {
  const state = store.state;
  const daily = dailyProduction(state);

  return el('div', { class: 'page__sections' },
    el('div', { class: 'grid-cards grid-cards--sm' }, stats(state, daily)),
    when(store.canEdit('output'), () => form(state)),
    card({
      title: 'เทียบผลผลิตกับวัตถุดิบที่เบิกออก · รายวัน',
      note: 'Yield = น้ำหนักผลผลิต ÷ น้ำหนักวัตถุดิบที่เบิกออก'
    }, table(DAILY_HEAD, dailyRows(daily))),
    card({ title: `บันทึกผลผลิตรายรายการ (${scopedOutputs(state).length} รายการ)` },
      table(RECORD_HEAD, recordRows(state)))
  );
}
