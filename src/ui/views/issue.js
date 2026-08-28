/** เบิกวัตถุดิบออก — FEFO issue form with a live allocation preview. */

import { el, when } from '../dom.js';
import {
  badge, card, fieldGrid, inputField, selectField,
  table, td, tdCode, tdNum, tdTitled, tr
} from '../components.js';
import { store, PURPOSES } from '../../core/store.js';
import { baht, kg, n, shortDate } from '../../core/format.js';
import {
  ALL_BRANCHES, ageLeftOf, allocate, expiryOf, sortedMoves, stockByItem
} from '../../core/inventory.js';

const HEAD = [
  'เลขที่เอกสาร', 'วันที่-เวลา', 'วัตถุดิบ / ล็อต', 'จำนวนเบิก|R', 'น้ำหนัก (กก.)|R',
  'อายุคงเหลือ (วัน)|R', 'ผู้เบิกออก', 'ราคาที่เบิกออก|R', 'ประเภท'
];

function issueForm(state) {
  const f = state.issueForm;
  const stockOptions = stockByItem(state)
    .filter(r => r.qtyLeft > 0)
    .map(r => ({ value: r.item.code, label: `${r.item.code} · ${r.item.name} (คงเหลือ ${r.qtyLeft} ${r.item.unit})` }));

  const destOptions = state.branches
    .filter(b => b.id !== state.branch)
    .map(b => ({ value: b.id, label: `${b.id} · ${b.name}` }));

  return el('section', { class: 'card card--pad' },
    el('h2', { style: { margin: '0 0 14px', fontSize: '14.5px', fontWeight: '600' }, text: 'เบิกวัตถุดิบออก' }),
    fieldGrid('sm',
      selectField('รหัส / ชื่อวัตถุดิบ', 'issueForm', 'code', stockOptions, { placeholder: '— เลือกวัตถุดิบ —' }),
      inputField('จำนวนที่เบิกออก (หน่วย)', 'issueForm', 'qty', { type: 'number', placeholder: '5', mono: true }),
      inputField('ชื่อผู้เบิกออก', 'issueForm', 'issuer', { placeholder: 'เช่น เชฟกวิน ร.' }),
      selectField('ประเภทการเบิก', 'issueForm', 'purpose', PURPOSES.map(v => ({ value: v, label: v }))),
      when(f.purpose === 'เบิกโอนสาขา', () =>
        selectField('สาขาปลายทางที่รับโอน', 'issueForm', 'dest', destOptions, {
          placeholder: '— เลือกสาขาปลายทาง —', variant: 'accent'
        })),
      inputField('ปลายทาง / หมายเหตุ', 'issueForm', 'note', { placeholder: 'ครัวร้อน / สาขาสยาม' })
    ),
    el('button', {
      class: 'btn btn--dark btn--submit',
      style: { marginTop: '14px' },
      text: 'ยืนยันการเบิกออก',
      onClick: () => store.submitIssue()
    })
  );
}

/** Shows exactly which lots FEFO will draw down, and at what cost. */
function allocationPanel(state) {
  const f = state.issueForm;
  const plan = f.code ? allocate(state, f.code, f.qty) : { rows: [], shortBy: 0 };

  const weight = plan.rows.reduce((a, r) => a + r.take * r.lot.weightPerUnit, 0);
  const cost = plan.rows.reduce((a, r) => a + r.take * r.lot.pricePerUnit, 0);

  const ages = plan.rows.map(r => ageLeftOf(r.lot));
  const ageText = !ages.length ? '—'
    : ages.length > 1 ? `${ages[0]}–${ages[ages.length - 1]} วัน`
    : `${ages[0]} วัน`;

  const note = plan.shortBy > 0
    ? `⚠ สต๊อกไม่พอ ขาดอีก ${n(plan.shortBy)} หน่วย`
    : plan.rows.length
      ? 'ต้นทุนคิดตามราคาจริงของแต่ละล็อต (FEFO)'
      : 'เลือกวัตถุดิบและจำนวนเพื่อดูล็อตที่จะถูกตัด';

  return el('section', { class: 'card card--pad', style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    el('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'baseline' } },
      el('h2', { style: { margin: '0', fontSize: '14px', fontWeight: '600' }, text: 'ล็อตที่ระบบจะตัดออก' }),
      el('span', { class: 'card__note card__note--mono', text: 'FEFO' })
    ),
    plan.rows.map(r => el('div', { class: 'alloc' },
      el('div', { class: 'grow' },
        el('div', { class: 'alloc__lot', text: r.lot.id }),
        el('div', { class: 'alloc__exp', text: `หมดอายุ ${shortDate(expiryOf(r.lot))} · เหลืออายุ ${ageLeftOf(r.lot)} วัน` })
      ),
      el('div', { style: { textAlign: 'right' } },
        el('div', { class: 'alloc__qty', text: `${n(r.take)} ${r.lot.unit}` }),
        el('div', { class: 'alloc__cost', text: baht(r.take * r.lot.pricePerUnit) })
      )
    )),
    el('div', { class: 'recap' },
      recapRow('น้ำหนักที่เบิกออก', weight ? kg(weight) : '—'),
      recapRow('อายุวัตถุดิบ ณ วันเบิก', ageText),
      recapRow('ราคาวัตถุดิบที่เบิกออก', cost ? baht(cost) : '—', 'tone-cost'),
      el('div', { class: 'recap__note', text: note })
    )
  );
}

function recapRow(label, value, valueClass) {
  return el('div', { class: 'recap__row' },
    el('span', { text: label }),
    el('span', { class: valueClass, text: value })
  );
}

function historyRows(state) {
  return sortedMoves(state)
    .filter(m => m.type !== 'รับเข้า')
    .filter(m => store.matches(m.name, m.code, m.id, m.user, m.lotId))
    .map(m => tr(
      tdCode(m.id),
      tdCode(`${shortDate(m.date)} ${m.time}`),
      tdTitled(m.name, `${m.code} · ${m.lotId}`),
      tdNum(n(m.qty)),
      tdNum(n(m.weight, 1)),
      tdNum(m.age === undefined ? '—' : n(m.age)),
      td(m.user),
      tdNum(baht(m.cost)),
      td(badge(m.purpose || '-', m.type === 'ตัดทิ้ง' ? 'danger' : 'watch', { plain: true }))
    ));
}

export function issueView() {
  const state = store.state;
  const issued = state.moves.filter(m => m.type !== 'รับเข้า' &&
    (state.branch === ALL_BRANCHES || (m.branch || 'BR-01') === state.branch)).length;

  return el('div', { class: 'page__sections' },
    when(store.canEdit('issue'), () =>
      el('div', { class: 'grid-split--issue', 'data-print': 'hide', style: { display: 'grid' } },
        issueForm(state), allocationPanel(state))),
    card({ title: `ประวัติการเบิกออก (${issued} รายการ)` }, table(HEAD, historyRows(state)))
  );
}
