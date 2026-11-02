/** เบิกวัตถุดิบออก — FEFO issue form with a live allocation preview. */

import { el, when } from '../dom.js';
import {
  badge, card, compoundField, confirmAction, fieldGrid, inputControl, inputField, selectControl, selectField,
  table, td, tdCode, tdNum, tdTitled, tr
} from '../components.js';
import { store, PURPOSES } from '../../core/store.js';
import { baht, fullDateTime, gram, kg, kgNum, n, shortDate, toKg, units } from '../../core/format.js';
import {
  ALL_BRANCHES, ageLeftOf, allocate, allocateByWeight, expiryOf, sortedMoves, stockByItem
} from '../../core/inventory.js';

/** The raw-computer-clock column is an audit check against backdating —
 *  only admin sees it, everyone else only sees the editable business date. */
function head(isAdmin) {
  const cols = [
    'เลขที่เอกสาร', 'วันที่-เวลา', 'วัตถุดิบ / ล็อต', 'จำนวนเบิก|R', 'น้ำหนัก (กก.)|R',
    'อายุคงเหลือ (วัน)|R', 'ผู้เบิกออก', 'ราคาที่เบิกออก|R', 'ประเภท', 'แก้ไขล่าสุด'
  ];
  if (isAdmin) cols.push('เวลาบันทึกจริง (ระบบ)');
  cols.push('');
  return cols;
}

/** Issue by the item's own unit, or by weight in grams / kilograms. */
function qtyModeOptions(state) {
  const item = state.items.find(i => i.code === state.issueForm.code);
  return [
    { value: 'unit', label: item ? item.unit : 'หน่วย' },
    { value: 'g', label: 'กรัม' },
    { value: 'kg', label: 'กิโลกรัม' }
  ];
}

function issueForm(state) {
  const f = state.issueForm;
  const stockOptions = stockByItem(state)
    .filter(r => r.qtyLeft > 0)
    .map(r => ({ value: r.item.code, label: `${r.item.code} · ${r.item.name} (คงเหลือ ${units(r.qtyLeft)} ${r.item.unit}${r.weightLeft > 0 ? ` ≈ ${gram(r.weightLeft)} กรัม` : ''})` }));

  const destOptions = state.branches
    .filter(b => b.id !== state.branch)
    .map(b => ({ value: b.id, label: `${b.id} · ${b.name}` }));

  return el('section', { class: 'card card--pad' },
    el('h2', { style: { margin: '0 0 14px', fontSize: '14.5px', fontWeight: '600' }, text: 'เบิกวัตถุดิบออก' }),
    fieldGrid('sm',
      selectField('รหัส / ชื่อวัตถุดิบ', 'issueForm', 'code', stockOptions, { placeholder: '— เลือกวัตถุดิบ —' }),
      compoundField('จำนวน / น้ำหนักที่เบิกออก',
        inputControl('issueForm', 'qty', { type: 'number', placeholder: f.qtyMode === 'unit' ? '5' : '5000' }),
        selectControl('issueForm', 'qtyMode', qtyModeOptions(state))
      ),
      inputField('วันที่เบิกออก', 'issueForm', 'date', { type: 'date' }),
      inputField('เวลาที่เบิกออก', 'issueForm', 'time', { type: 'time' }),
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
  const byWeight = f.qtyMode === 'g' || f.qtyMode === 'kg';
  const plan = !f.code ? { rows: [], shortBy: 0 }
    : byWeight ? allocateByWeight(state, f.code, toKg(f.qty, f.qtyMode))
    : allocate(state, f.code, f.qty);

  const weight = plan.rows.reduce((a, r) => a + (r.takeKg ?? r.take * r.lot.weightPerUnit), 0);
  const cost = plan.rows.reduce((a, r) => a + (r.cost ?? r.take * r.lot.pricePerUnit), 0);

  const ages = plan.rows.map(r => ageLeftOf(r.lot));
  const ageText = !ages.length ? '—'
    : ages.length > 1 ? `${ages[0]}–${ages[ages.length - 1]} วัน`
    : `${ages[0]} วัน`;

  const note = plan.shortBy > 0
    ? `⚠ สต๊อกไม่พอ ขาดอีก ${byWeight ? gram(plan.shortBy) + ' กรัม' : n(plan.shortBy) + ' หน่วย'}`
    : byWeight && f.qty && f.code && !plan.rows.length
      ? '⚠ วัตถุดิบนี้ไม่มีน้ำหนักต่อหน่วย — เบิกเป็นหน่วยแทน'
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
        el('div', { class: 'alloc__qty', text: byWeight ? `${gram(r.takeKg)} กรัม · ${units(r.take)} ${r.lot.unit}` : `${units(r.take)} ${r.lot.unit}` }),
        el('div', { class: 'alloc__cost', text: baht(r.cost ?? r.take * r.lot.pricePerUnit) })
      )
    )),
    el('div', { class: 'recap' },
      recapRow('น้ำหนักที่เบิกออก', weight ? (byWeight ? `${gram(weight)} กรัม` : kg(weight)) : '—'),
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

/** The "วันที่-เวลา" cell: plain text, or an inline date+time edit when this
 *  doc is the one being corrected — every row sharing its doc_no flips into
 *  edit mode together, since they're one real-world issue split across lots.
 *  That means several rows can render these inputs at once, so the
 *  data-bind key is suffixed with the doc number — app.js's focus restore
 *  after re-render does a plain querySelector on that attribute, and two
 *  identical values would always resolve to the first row's input. */
function dateTimeCell(state, m) {
  if (state.editingMoveDoc !== m.id) {
    return tdCode(`${shortDate(m.date)} ${m.time}`);
  }
  return td(
    el('div', { class: 'row', style: { gap: '6px' } },
      el('input', {
        type: 'date', value: state.editMoveDate, style: { minWidth: '130px' },
        'data-bind': `editMoveDate:${m.id}`,
        onInput: e => store.setEditMoveDate(e.target.value)
      }),
      el('input', {
        type: 'time', value: state.editMoveTime, style: { minWidth: '90px' },
        'data-bind': `editMoveTime:${m.id}`,
        onInput: e => store.setEditMoveTime(e.target.value)
      })
    )
  );
}

function actionsCell(state, m) {
  if (!store.canEdit('issue')) return null;

  if (state.editingMoveDoc === m.id) {
    return td(
      el('div', { class: 'row', style: { gap: '6px' } },
        el('button', {
          class: 'btn btn--small', text: 'บันทึก',
          onClick: () => {
            const msg = `ยืนยันแก้ไขวันที่-เวลาของ ${m.id} เป็น ${shortDate(state.editMoveDate)} ${state.editMoveTime}?`;
            if (confirmAction(msg)) store.saveMoveDateTime();
          }
        }),
        el('button', { class: 'btn btn--small', text: 'ยกเลิก', onClick: () => store.cancelEditMoveDateTime() })
      )
    );
  }

  if (m.pendingCancel) {
    if (!store.isAdmin()) return td(badge('รออนุมัติยกเลิก', 'watch'));
    return td(
      el('div', { class: 'row', style: { gap: '6px' } },
        badge('รออนุมัติยกเลิก', 'watch'),
        el('button', {
          class: 'btn btn--small', text: 'อนุมัติยกเลิก',
          onClick: () => {
            if (confirmAction(`ยืนยันยกเลิกการเบิกออก ${m.id} ถาวร? สต๊อกจะถูกคืนกลับ การลบนี้กู้คืนไม่ได้`)) store.approveCancelIssue(m.id);
          }
        }),
        el('button', {
          class: 'btn btn--small', text: 'ปฏิเสธ',
          onClick: () => {
            if (confirmAction(`ยืนยันปฏิเสธคำขอยกเลิกการเบิกออก ${m.id}?`)) store.rejectCancelIssue(m.id);
          }
        })
      )
    );
  }

  return td(
    el('div', { class: 'row', style: { gap: '6px' } },
      el('button', { class: 'btn btn--small', text: 'แก้ไข', onClick: () => store.startEditMoveDateTime(m.id) }),
      el('button', {
        class: 'btn btn--small', text: 'ยกเลิกการเบิก',
        onClick: () => {
          const msg = store.isAdmin()
            ? `ยืนยันยกเลิกการเบิกออก ${m.id} ถาวร? สต๊อกจะถูกคืนกลับ การลบนี้กู้คืนไม่ได้`
            : `ยืนยันส่งคำขอยกเลิกการเบิกออก ${m.id}? ต้องรอผู้ดูแลระบบอนุมัติก่อนจึงจะยกเลิกจริง`;
          if (confirmAction(msg)) store.requestCancelIssue(m.id);
        }
      })
    )
  );
}

function historyRows(state) {
  const isAdmin = store.isAdmin();
  return sortedMoves(state)
    .filter(m => m.type !== 'รับเข้า')
    .filter(m => store.matches(m.name, m.code, m.id, m.user, m.lotId))
    .map(m => {
      const cells = [
        tdCode(m.id),
        dateTimeCell(state, m),
        tdTitled(m.name, `${m.code} · ${m.lotId}`),
        tdNum(units(m.qty)),
        tdNum(kgNum(m.weight)),
        tdNum(m.age === undefined ? '—' : n(m.age)),
        td(m.user),
        tdNum(baht(m.cost)),
        td(badge(m.purpose || '-', m.type === 'ตัดทิ้ง' ? 'danger' : 'watch', { plain: true })),
        tdCode(m.editedAt ? fullDateTime(m.editedAt) : '—')
      ];
      if (isAdmin) cells.push(tdCode(m.createdAt ? fullDateTime(m.createdAt) : '—'));
      cells.push(actionsCell(state, m));
      return tr(...cells);
    });
}

export function issueView() {
  const state = store.state;
  const issued = state.moves.filter(m => m.type !== 'รับเข้า' &&
    (state.branch === ALL_BRANCHES || (m.branch || 'BR-01') === state.branch)).length;

  return el('div', { class: 'page__sections' },
    when(store.canEdit('issue'), () =>
      el('div', { class: 'grid-split--issue', 'data-print': 'hide', style: { display: 'grid' } },
        issueForm(state), allocationPanel(state))),
    card({ title: `ประวัติการเบิกออก (${issued} รายการ)` }, table(head(store.isAdmin()), historyRows(state)))
  );
}
