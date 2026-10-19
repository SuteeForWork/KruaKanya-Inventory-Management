/** ผลผลิตรายวัน & Yield — record output and compare it against what was issued. */

import { el, when } from '../dom.js';
import {
  badge, card, compoundField, confirmAction, fieldGrid, formCard, inputControl, inputField, meter, selectControl, selectField,
  statCard, submitRow, table, td, tdCode, tdNum, tr
} from '../components.js';
import { store } from '../../core/store.js';
import { baht, kg, kgNum, n, shortDate } from '../../core/format.js';
import { today } from '../../config.js';
import { issuedOn, scopedOutputs } from '../../core/inventory.js';
import { dailyProduction, outputFigures, outputIngredients, yieldStatus, yieldTarget } from '../../core/production.js';

const DAILY_HEAD = [
  'วันที่', 'สินค้าที่ผลิต', 'จำนวนผลิตได้ (คละหน่วย)|R', 'น้ำหนักผลผลิต (กก.)|R',
  'วัตถุดิบเบิกออก (กก.)|R', 'ตามสูตร (กก.)|R', 'ต้นทุนวัตถุดิบ|R', 'Yield',
  'ส่วนต่าง (กก.)|R', 'ต้นทุน/หน่วยผลผลิต|R', 'สถานะ'
];

const RECORD_HEAD = [
  'วันที่', 'ช่วงเวลาทำงาน', 'สินค้า / เมนู', 'จำนวนที่ผลิตได้|R',
  'น้ำหนักผลผลิต (กก.)|R', 'ของเสีย (กก.)|R', 'หมูที่ใช้ (กก.)|R', 'มันหมูตัดแต่ง (กก.)|R',
  'วัตถุดิบอื่นๆ', 'น้ำหนักต่อหน่วย|R', 'ผู้บันทึก', ''
];

const WEIGHT_UNITS = [{ value: 'g', label: 'กรัม' }, { value: 'kg', label: 'กิโลกรัม' }];

/** A weight typed in g or kg — stored in kg, see outputFigures(). */
function weightField(label, form, field, placeholder) {
  return compoundField(label,
    inputControl(form, field, { type: 'number', placeholder }),
    selectControl(form, field + 'Unit', WEIGHT_UNITS)
  );
}

/** The BOM's other ingredients for this run, scaled to the pork actually used. */
function ingredientsPanel(state) {
  const f = state.outputForm;
  const plan = f.product ? outputIngredients(state, f) : null;

  let body;
  if (!plan) {
    body = el('div', { class: 'card__note', text: 'เลือกสินค้าจากสูตร BOM เพื่อดูยอดวัตถุดิบอื่นๆ' });
  } else if (!plan.rows.length) {
    body = el('div', { class: 'card__note', text: 'สูตรนี้ไม่มีวัตถุดิบอื่นนอกจากเนื้อสัตว์' });
  } else {
    const scaled = plan.standardPork > 0 && Number(f.pork) > 0;
    body = table(
      ['วัตถุดิบอื่นๆ', 'ตามสูตร|R', scaled ? `ปรับตามน้ำหนักหมู (×${n(plan.scale, 3)})|R` : 'ที่ใช้|R'],
      plan.rows.map(r => tr(
        td(r.name),
        tdNum(`${n(r.standard, 3)} ${r.unit}`),
        tdNum(`${n(r.used, 3)} ${r.unit}`)
      ))
    );
  }
  return el('div', { class: 'stack', style: { gap: '6px', marginTop: '14px' } },
    el('div', { class: 'field__label', text: 'ยอดวัตถุดิบอื่นๆ (ดึงจากสูตร BOM อัตโนมัติ · ปรับตามน้ำหนักหมูที่ใช้จริง)' }),
    body
  );
}

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

function productField(state) {
  const f = state.outputForm;
  const options = state.recipes.map(r => ({ value: r.product, label: r.product }));
  // No BOM yet: let the name be typed so recording isn't blocked on setting recipes up first.
  if (!options.length) {
    return inputField('สินค้า / เมนูที่ผลิต', 'outputForm', 'product', { placeholder: 'ยังไม่มีสูตร BOM — พิมพ์ชื่อสินค้าไปก่อน' });
  }
  // A record saved before its recipe existed (or since renamed) must stay selectable when edited.
  if (f.product && !options.some(o => o.value === f.product)) {
    options.push({ value: f.product, label: `${f.product} (ไม่อยู่ในสูตร BOM)` });
  }
  return selectField('สินค้า / เมนูที่ผลิต (จากสูตร BOM)', 'outputForm', 'product', options, {
    placeholder: '— เลือกจากสูตร BOM —'
  });
}

function form(state) {
  const f = state.outputForm;
  const editing = state.editingOutput;
  const issued = issuedOn(state, f.date);
  const { qty, weightKg } = outputFigures(f);
  const pct = issued.weight ? (weightKg / issued.weight) * 100 : 0;
  const status = yieldStatus(pct);

  const node = formCard({
    title: editing ? `แก้ไขผลผลิต · ${editing}` : 'บันทึกยอดที่ผลิตได้',
    note: editing
      ? 'น้ำหนักที่โหลดมาเป็นกิโลกรัม — เปลี่ยนหน่วยของช่องเป็นกรัมได้ ถ้าเดิมกรอกเป็นกรัม'
      : 'ระบบจะเทียบกับน้ำหนักวัตถุดิบที่เบิกออกในวันเดียวกันอัตโนมัติ'
  },
    fieldGrid('sm',
      inputField('วันที่ผลิต', 'outputForm', 'date', { type: 'date' }),
      compoundField('ช่วงเวลาทำงาน (เริ่ม – เลิก)',
        inputControl('outputForm', 'shiftStart', { type: 'time' }),
        el('span', { class: 'field__sep', text: 'ถึง' }),
        inputControl('outputForm', 'shiftEnd', { type: 'time' })
      ),
      productField(state),
      inputField('FG ที่ผลิตได้ (pcs.)', 'outputForm', 'qty', { type: 'number', placeholder: '240', mono: true }),
      weightField('น้ำหนักการผลิตทั้งหมด', 'outputForm', 'weight', '62000'),
      weightField('น้ำหนักสูญเสียทั้งหมด', 'outputForm', 'reject', '0'),
      weightField('น้ำหนักหมูที่ใช้ทั้งหมด', 'outputForm', 'pork', '0'),
      weightField('น้ำหนักมันหมูที่ตัดแต่งออกทั้งหมด', 'outputForm', 'trimFat', '0'),
      inputField('ผู้บันทึก', 'outputForm', 'staff', { placeholder: 'เช่น เชฟกวิน ร.' })
    ),
    ingredientsPanel(state),
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
      el('div', { class: 'row', style: { gap: '8px' } },
        el('button', {
          class: 'btn btn--primary btn--submit', text: editing ? 'บันทึกการแก้ไข' : 'บันทึกผลผลิต',
          onClick: () => {
            if (editing && !confirmAction(`ยืนยันบันทึกการแก้ไขผลผลิต ${editing}?`)) return;
            store.submitOutput();
          }
        }),
        when(editing, () => el('button', { class: 'btn', text: 'ยกเลิก', onClick: () => store.cancelEditOutput() }))
      )
    )
  );
  node.id = 'output-form';
  return node;
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
      tdNum(kgNum(o.weight)),
      tdNum(o.reject ? kgNum(o.reject) : '—'),
      tdNum(o.porkKg ? kgNum(o.porkKg) : '—'),
      tdNum(o.trimFatKg ? kgNum(o.trimFatKg) : '—'),
      td((o.ingredients || []).length
        ? (o.ingredients || []).map(i => `${i.name} ${n(i.used, 3)} ${i.unit}`).join(' · ')
        : '—'),
      tdNum(`${n((o.weight / o.qty) * 1000, 0)} ก.`),
      td(o.staff),
      td(when(store.canEdit('output'), () => el('button', {
        class: 'btn btn--small', text: 'แก้ไข',
        onClick: () => {
          store.startEditOutput(o.id);
          const form = document.getElementById('output-form');
          if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      })))
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
