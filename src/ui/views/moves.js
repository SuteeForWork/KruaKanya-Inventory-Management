/** รายงานการเคลื่อนไหว — the full ledger with type filters. */

import { el } from '../dom.js';
import {
  badge, card, moveTone, table, td, tdCode, tdNum, tdTitled, tr
} from '../components.js';
import { store, MOVE_FILTERS } from '../../core/store.js';
import { baht, kg, n, shortDate } from '../../core/format.js';
import { sortedMoves } from '../../core/inventory.js';

const HEAD = [
  'วันที่-เวลา', 'สาขา', 'ประเภท', 'เลขที่', 'ล็อต', 'วัตถุดิบ',
  'จำนวน|R', 'น้ำหนัก (กก.)|R', 'มูลค่า|R', 'ผู้ทำรายการ', 'หมายเหตุ'
];

/** Filter label → the ledger type it keeps. */
const FILTER_TYPE = { 'รับเข้า': 'รับเข้า', 'เบิกออก': 'เบิกออก', 'ของเสีย': 'ตัดทิ้ง' };

function visibleMoves(state) {
  const wanted = FILTER_TYPE[state.moveFilter];
  return sortedMoves(state)
    .filter(m => !wanted || m.type === wanted)
    .filter(m => store.matches(m.name, m.code, m.lotId, m.id, m.user, m.note || ''));
}

function filterBar(state) {
  return el('div', { class: 'filters', 'data-print': 'hide' },
    MOVE_FILTERS.map(f => el('button', {
      class: ['filter', state.moveFilter === f && 'is-active'],
      text: f,
      onClick: () => store.setMoveFilter(f)
    }))
  );
}

function summary(moves) {
  const weightOf = type => kg(moves.filter(m => m.type === type).reduce((a, m) => a + m.weight, 0));
  const net = moves.reduce((a, m) => a + (m.type === 'รับเข้า' ? m.cost : -m.cost), 0);

  return el('div', { class: 'mov-summary' },
    el('span', null, 'รับเข้า ', el('strong', { class: 'in', text: weightOf('รับเข้า') })),
    el('span', null, 'เบิกออก ', el('strong', { class: 'out', text: weightOf('เบิกออก') })),
    el('span', null, 'ของเสีย ', el('strong', { class: 'waste', text: weightOf('ตัดทิ้ง') })),
    el('span', null, 'มูลค่าสุทธิ ', el('strong', { text: baht(net) }))
  );
}

export function movesView() {
  const state = store.state;
  const moves = visibleMoves(state);

  const rows = moves.map(m => tr(
    tdCode(`${shortDate(m.date)} ${m.time}`),
    td(el('span', { style: { fontSize: '11px', color: 'var(--ink-soft)' }, text: store.branchLabel(m.branch) })),
    td(badge(m.type, moveTone(m.type))),
    tdCode(m.id),
    tdCode(m.lotId),
    tdTitled(m.name, m.code),
    tdNum(n(m.qty)),
    tdNum(n(m.weight, 1)),
    tdNum(baht(m.cost)),
    td(m.user),
    td(m.note || '-')
  ));

  const head = el('div', { class: 'card__head' },
    el('h2', { text: `รายงานการเคลื่อนไหววัตถุดิบ (${moves.length} รายการ)` }),
    summary(moves)
  );

  return el('div', { class: 'page__sections', style: { gap: '13px' } },
    filterBar(state),
    el('section', { class: 'card' }, head, table(HEAD, rows))
  );
}
