/** เมนู & สูตร (BOM) — register recipes and compare them against real usage. */

import { el, when } from '../dom.js';
import {
  badge, card, fieldGrid, formCard, inputField, meter,
  statCard, submitRow, table, td, tdCode, tdNum, tdTitled, tr
} from '../components.js';
import { store } from '../../core/store.js';
import { amountText, baht, cleanDecimal, gram, n } from '../../core/format.js';
import {
  bomLineCost, bomLineUnit, capacityOf, dailyProduction, productVariance, recipeFromForm, recipePlan,
  standardYield, varianceStatus
} from '../../core/production.js';

const VARIANCE_HEAD = [
  'เมนู', 'ผลิตได้|R', 'วัตถุดิบตามสูตร (กรัม)|R', 'ควรได้ผลผลิต (กรัม)|R',
  'วัตถุดิบใช้จริง · ปันส่วน (กรัม)|R', 'ส่วนต่างจากสูตร (กรัม)|R', 'มูลค่าที่เสียไป|R',
  'Yield จริง (ประมาณ)', 'สถานะ'
];

const REGISTRY_HEAD = [
  'รหัสสูตร', 'เมนู', 'วัตถุดิบในสูตร', 'วัตถุดิบ/หน่วย (กรัม)|R', 'ของเสียจากการเตรียม|R', 'ผลผลิตสุทธิ/หน่วย (กรัม)|R',
  'Yield มาตรฐาน|R', 'ต้นทุนมาตรฐาน/หน่วย|R', 'ผลิตได้จากสต๊อก|R', 'กำลังผลิต/วัน|R',
  'ผลิตได้สูงสุด|R', 'ข้อจำกัด'
];

const limitText = cap => (typeof cap.limit === 'string'
  ? cap.limit
  : `${cap.limit.name} (${cap.limit.unit === 'กก.' ? gram(cap.limit.available) + ' กรัม' : n(cap.limit.available) + ' ' + cap.limit.unit})`);

const boundText = cap => (cap.bound === 'กำลังผลิต' ? 'กำลังผลิตต่อวัน' : limitText(cap));

function stats(state, variance) {
  const missing = variance.filter(v => !v.plan);
  const overKg = variance.reduce((a, v) => a + Math.max(0, v.gapKg), 0);
  const overCost = variance.reduce((a, v) => a + Math.max(0, v.gapCost), 0);

  const best = state.recipes
    .map(r => ({ recipe: r, cap: capacityOf(state, r) }))
    .sort((a, b) => b.cap.units - a.cap.units)[0];

  return [
    statCard({
      plain: true, tone: 'ok',
      label: 'เมนูที่มีสูตร', value: n(state.recipes.length),
      hint: 'ใช้คำนวณวัตถุดิบมาตรฐานอัตโนมัติ'
    }),
    statCard({
      plain: true, tone: 'warn',
      label: 'ผลิตแล้วยังไม่มีสูตร', value: n(missing.length),
      hint: missing.length ? missing.map(v => v.product).slice(0, 2).join(', ') : 'ครบทุกเมนูที่ผลิต'
    }),
    statCard({
      plain: true, tone: 'danger', toneValue: 'danger',
      label: 'ส่วนเกินสูตรรวม (กรัม)', value: gram(overKg),
      hint: 'วัตถุดิบที่ใช้เกินกว่าสูตรกำหนด'
    }),
    statCard({
      plain: true, tone: 'danger', toneValue: 'cost',
      label: 'มูลค่าที่เสียไป', value: baht(overCost),
      hint: 'คิดจากราคาวัตถุดิบล่าสุดต่อ กก.'
    }),
    statCard({
      plain: true, tone: 'watch',
      label: 'ผลิตได้สูงสุดจากสต๊อกวันนี้',
      value: best ? `${n(best.cap.units)} ${best.recipe.unit}` : '—',
      hint: best ? `${best.recipe.product} · ติดที่ ${boundText(best.cap)}` : '—'
    })
  ];
}

/** Prep loss of one drafted line, e.g. "ทิ้ง 150 กรัม (15%)" — or why it can't be computed. */
function prepNote(unit, stored) {
  if (unit.counted) return `${unit.label} / หน่วย`;
  if (stored.prepQty == null) return 'กรัม / หน่วย';
  if (stored.prepQty > stored.qty) return 'หลังเตรียมมากกว่าก่อนเตรียม';
  const waste = stored.qty - stored.prepQty;
  return `ทิ้ง ${gram(waste)} กรัม (${n((waste / stored.qty) * 100, 1)}%)`;
}

/** One ingredient line of the recipe being drafted. */
function recipeLine(state, line, index) {
  const itemOptions = state.items.map(i => ({ value: i.code, label: `${i.code} · ${i.name}` }));
  const unit = bomLineUnit(state, line.code);
  const stored = recipeFromForm(state, { lines: [line] }).lines[0];
  const cost = line.code && stored.qty > 0 ? baht(bomLineCost(state, stored), 2) : '—';

  const select = el('select', {
    'data-bind': `recipeForm.lines.${index}.code`,
    onChange: e => store.setRecipeLine(index, 'code', e.target.value)
  },
    el('option', { value: '', text: '— เลือกวัตถุดิบ —' }),
    itemOptions.map(o => el('option', { value: o.value, selected: o.value === line.code, text: o.label }))
  );
  select.value = line.code;

  return el('div', { class: 'recipe-line' },
    select,
    el('input', {
      type: 'text', inputmode: 'decimal', autocomplete: 'off', value: line.qty,
      placeholder: unit.counted ? `${unit.label} ต่อหน่วย` : 'ก่อนเตรียม (กรัม)',
      'data-bind': `recipeForm.lines.${index}.qty`,
      onInput: e => store.setRecipeLine(index, 'qty', cleanDecimal(e.target.value))
    }),
    // A counted ingredient (a bag, a seal) has no prep loss to record.
    el('input', {
      type: 'text', inputmode: 'decimal', autocomplete: 'off', value: unit.counted ? '' : (line.prep ?? ''),
      placeholder: unit.counted ? '—' : 'หลังเตรียม (กรัม)', disabled: unit.counted,
      'data-bind': `recipeForm.lines.${index}.prep`,
      onInput: e => store.setRecipeLine(index, 'prep', cleanDecimal(e.target.value))
    }),
    el('span', { class: 'recipe-line__cost' },
      el('div', { text: prepNote(unit, stored) }),
      el('div', { text: cost })
    )
  );
}

function form(state) {
  const f = state.recipeForm;
  // Typed in grams; the preview runs on the same kg the saved recipe will use.
  const draft = recipeFromForm(state, f);
  const plan = recipePlan(state, draft);
  const net = draft.net;

  return formCard({
    title: 'ลงทะเบียนเมนูและสูตร (ต่อ 1 หน่วยผลผลิต)',
    note: 'ระบบใช้สูตรนี้คำนวณวัตถุดิบที่ควรใช้ แล้วเทียบกับที่เบิกออกจริง'
  },
    fieldGrid('sm',
      inputField('ชื่อเมนู / สินค้า', 'recipeForm', 'product', { placeholder: 'เช่น ข้าวกล่องไก่ย่าง' }),
      inputField('หน่วยผลผลิต', 'recipeForm', 'unit', { placeholder: 'กล่อง / ก้อน / ปอนด์' }),
      inputField('น้ำหนักสุทธิที่ควรได้ / หน่วย (กรัม)', 'recipeForm', 'net', { type: 'number', placeholder: '85', mono: true }),
      inputField('ความสามารถผลิตสูงสุด / วัน (หน่วย)', 'recipeForm', 'capPerDay', { type: 'number', placeholder: '600', mono: true })
    ),
    el('div', { class: 'recipe-lines' },
      el('span', { class: 'field__label', text: 'วัตถุดิบในสูตร · ปริมาณต่อ 1 หน่วยผลผลิต (ก่อนเตรียม = ที่เบิกจากสต๊อก · หลังเตรียม = ที่ใช้ได้จริงหลังตัดแต่ง)' }),
      f.lines.map((line, i) => recipeLine(state, line, i)),
      el('button', { class: 'btn--dashed', text: '+ เพิ่มวัตถุดิบในสูตร', onClick: () => store.addRecipeLine() })
    ),
    submitRow(
      el('div', { class: 'summary' },
        el('div', null,
          el('div', { class: 'summary__label', text: 'วัตถุดิบตามสูตร / หน่วย' }),
          el('div', { class: 'summary__value', text: plan.kg ? `${gram(plan.kg)} กรัม` : '—' })
        ),
        el('div', null,
          el('div', { class: 'summary__label', text: 'ของเสียจากการเตรียม / หน่วย' }),
          el('div', { class: 'summary__value tone-' + (plan.wasteKg < 0 ? 'danger' : 'ink'),
            text: plan.hasPrep ? `${gram(plan.wasteKg)} กรัม (${n(plan.wastePct, 1)}%)` : '—' })
        ),
        el('div', null,
          el('div', { class: 'summary__label', text: 'ต้นทุนมาตรฐาน / หน่วย' }),
          el('div', { class: 'summary__value summary__value--cost', text: plan.cost ? baht(plan.cost, 2) : '—' })
        ),
        el('div', null,
          el('div', { class: 'summary__label', text: 'Yield มาตรฐานตามสูตร' }),
          el('div', { class: 'summary__value summary__value--green', text: plan.kg && net ? `${n((net / plan.kg) * 100, 1)}%` : '—' })
        )
      ),
      el('button', { class: 'btn btn--primary btn--submit', text: 'บันทึกสูตร', onClick: () => store.addRecipe() })
    )
  );
}

function varianceRows(variance) {
  return variance
    .filter(v => store.matches(v.product))
    .map(v => {
      const status = varianceStatus(v);
      const over = v.gapKg > 0.05;
      const under = v.gapKg < -0.05;

      const gapKg = !v.plan ? '—' : (over ? '+' : under ? '−' : '') + gram(Math.abs(v.gapKg));
      const gapCost = !v.plan ? '—'
        : over ? '+' + baht(v.gapCost)
        : under ? `ประหยัด ${baht(Math.abs(v.gapCost))}`
        : '—';

      return tr(
        tdTitled(v.product,
          `${v.rows.length} รอบผลิต · เป้าตามสูตร ${v.stdYield ? n(v.stdYield, 1) + '%' : '—'}`,
          { mono: false }),
        tdNum(`${n(v.qty)} ${v.unit}`),
        tdNum(v.planKg ? gram(v.planKg) : '—'),
        tdNum(v.expectKg ? gram(v.expectKg) : '—'),
        tdNum(v.actualKg ? gram(v.actualKg) : '—'),
        tdNum(gapKg),
        tdNum(gapCost),
        td(meter(v.achieved, status.tone, { value: v.achieved ? `${n(v.achieved, 1)}%` : '—' })),
        td(badge(status.label, status.tone))
      );
    });
}

function registryRows(state) {
  return state.recipes
    .filter(r => store.matches(r.product, r.id))
    .map(r => {
      const plan = recipePlan(state, r);
      const cap = capacityOf(state, r);
      const lines = plan.lines.map(l => {
        const item = state.items.find(i => i.code === l.code);
        const counted = item && item.trackBy === 'count';
        const prep = !counted && l.prepQty != null ? ` → ${gram(l.prepQty)} หลังเตรียม` : '';
        return `${item ? item.name : l.code} ${amountText(Number(l.qty), counted ? item.unit : 'กก.')}${prep}`;
      }).join(' + ');

      return tr(
        tdCode(r.id),
        tdTitled(r.product, `ต่อ 1 ${r.unit}`, { mono: false }),
        td(lines),
        tdNum(gram(plan.kg)),
        tdNum(plan.hasPrep ? `${gram(plan.wasteKg)} (${n(plan.wastePct, 1)}%)` : '—'),
        tdNum(gram(r.net)),
        tdNum(plan.kg ? `${n(standardYield(r, plan), 1)}%` : '—'),
        tdNum(baht(plan.cost, 2)),
        tdNum(`${n(cap.stockUnits)} ${r.unit}`),
        tdNum(r.capPerDay ? `${n(r.capPerDay)} ${r.unit}` : '—'),
        el('td', { class: 'num' },
          el('span', { class: ['strong', cap.units ? 'tone-ink' : 'ink-danger'], text: `${n(cap.units)} ${r.unit}` })),
        td(el('span', { class: 'card__note', text: boundText(cap) }))
      );
    });
}

export function recipeView() {
  const state = store.state;
  const variance = productVariance(state, dailyProduction(state));

  return el('div', { class: 'page__sections' },
    el('div', { class: 'grid-cards grid-cards--sm' }, stats(state, variance)),
    when(store.canEdit('recipe'), () => form(state)),
    card({
      title: 'เทียบสูตรกับการใช้จริง · แยกตามเมนู',
      note: 'ยอดเบิกบันทึกเป็นรายวัน ระบบจึงปันส่วนให้แต่ละเมนูตามสัดส่วนสูตร — ตัวเลข "ใช้จริง" และ "Yield จริง" เป็นค่าประมาณ'
    }, table(VARIANCE_HEAD, varianceRows(variance))),
    card({ title: `ทะเบียนเมนูและสูตร (${state.recipes.length} เมนู)` },
      table(REGISTRY_HEAD, registryRows(state)))
  );
}
