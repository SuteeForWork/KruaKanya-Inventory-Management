/** จัดการสาขา — compare branches and register new ones. */

import { el, when } from '../dom.js';
import {
  card, confirmAction, fieldGrid, formCard, inputField, selectField,
  table, td, tdCode, tdNum, tdTitled, tr
} from '../components.js';
import { store, BRANCH_TYPES } from '../../core/store.js';
import { baht, n } from '../../core/format.js';
import { branchSummary } from '../../core/inventory.js';
import { yieldStatus } from '../../core/production.js';

const HEAD = [
  'รหัส', 'สาขา', 'ผู้จัดการ', 'เบอร์โทร', 'ล็อตคงเหลือ|R', 'น้ำหนักคงเหลือ (กก.)|R',
  'ต้นทุนคงคลัง|R', 'ใกล้หมดอายุ|R', 'มูลค่าของเสีย|R', 'Yield|R', '', ''
];

function rows(state) {
  return branchSummary(state).map(r => {
    const status = yieldStatus(r.yieldPct);
    return tr(
      tdCode(r.branch.id),
      tdTitled(r.branch.name, r.branch.type, { mono: false }),
      td(r.branch.manager),
      tdCode(r.branch.phone),
      tdNum(n(r.lotCount)),
      tdNum(n(r.weight, 1)),
      tdNum(baht(r.cost)),
      el('td', { class: 'num' },
        el('span', { class: ['strong', r.nearCount ? 'ink-danger' : 'faint'], text: r.nearCount ? n(r.nearCount) : '—' })),
      tdNum(r.wasteCost ? baht(r.wasteCost) : '—'),
      el('td', { class: 'num' },
        el('span', { class: ['strong', 'tone-' + status.tone], text: r.yieldPct ? `${n(r.yieldPct, 1)}%` : '—' })),
      td(el('button', {
        class: 'btn btn--small', text: 'เข้าดู',
        onClick: () => store.setBranch(r.branch.id)
      })),
      td(when(store.canEdit('branch'), () =>
        el('button', { class: 'btn btn--small', text: 'แก้ไข', onClick: () => store.startEditBranch(r.branch.id) })))
    );
  });
}

function form(state) {
  const editing = state.editingBranch;
  return formCard({ title: editing ? `แก้ไขสาขา · ${editing}` : 'เพิ่มสาขาใหม่' },
    fieldGrid('xs',
      inputField('ชื่อสาขา', 'branchForm', 'name', { placeholder: 'เช่น สาขาพระราม 9' }),
      selectField('ประเภท', 'branchForm', 'type', BRANCH_TYPES.map(v => ({ value: v, label: v }))),
      inputField('ผู้จัดการสาขา', 'branchForm', 'manager', { placeholder: 'ชื่อ-นามสกุล' }),
      inputField('เบอร์โทร', 'branchForm', 'phone', { placeholder: '0x-xxx-xxxx', mono: true }),
      el('div', { class: 'field field--action', style: { flexDirection: 'row', gap: '8px' } },
        el('button', {
          class: 'btn btn--primary btn--block', text: editing ? 'บันทึกการแก้ไข' : 'เพิ่มสาขา',
          onClick: () => {
            if (editing && !confirmAction(`ยืนยันบันทึกการแก้ไขสาขา ${editing}?`)) return;
            store.addBranch();
          }
        }),
        when(editing, () => el('button', { class: 'btn', text: 'ยกเลิก', onClick: () => store.cancelEditBranch() }))
      )
    )
  );
}

export function branchView() {
  const state = store.state;
  return el('div', { class: 'page__sections' },
    card({
      title: `เทียบผลการดำเนินงานทุกสาขา (${state.branches.length} สาขา)`,
      note: 'คลิก "เข้าดู" เพื่อสลับมุมมองไปที่สาขานั้น'
    }, table(HEAD, rows(state))),
    when(store.canEdit('branch'), () => form(state))
  );
}
