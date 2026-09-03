/** ตั้งค่าสิทธิ์ผู้ใช้ — employee approval queue, staff roster, and the role × section permission matrix. */

import { el, when } from '../dom.js';
import {
  badge, card, confirmAction, fieldGrid, formCard, inputField, selectField,
  table, td, tdCode, tdTitled, tr
} from '../components.js';
import { store } from '../../core/store.js';
import { PERM_LABELS, ROLES, SECTIONS, STAFF_ROLES } from '../../core/access.js';
import { shortDate } from '../../core/format.js';

const NOTES = [
  {
    title: 'ผู้ดูแลระบบ',
    body: 'ปรับแต่งได้ทุกส่วน — สูตร ค่าเตือนหมดอายุ เป้า Yield ทะเบียนวัตถุดิบ ซัพพลายเออร์ และสิทธิ์ของทุกบทบาท'
  },
  {
    title: 'พนักงานจัดซื้อ (ค่าเริ่มต้น)',
    body: 'แก้ไขได้เฉพาะ "รับวัตถุดิบเข้า" และ "เบิกวัตถุดิบออก" · ส่วนอื่นดูได้อย่างเดียว · ไม่เห็นหน้าผลผลิตและสูตร'
  },
  {
    title: 'การบังคับใช้',
    body: 'เมนูที่ไม่มีสิทธิ์จะถูกซ่อน ฟอร์มบันทึกจะไม่แสดงเมื่อมีสิทธิ์เพียงดูอย่างเดียว และการกดบันทึกจะถูกปฏิเสธพร้อมแจ้งเตือน'
  }
];

const PENDING_HEAD = [
  'ชื่อ-นามสกุล', 'ฝ่ายสังกัด', 'อีเมล', 'เบอร์โทร', 'หน้าที่ที่ขอ', 'วันที่ลงทะเบียน', 'สาขาที่จะสังกัด', '', ''
];

const ROSTER_HEAD = ['ชื่อ-นามสกุล', 'ฝ่ายสังกัด', 'อีเมล', 'เบอร์โทร', 'หน้าที่', 'สาขา', 'สถานะ', '', ''];

function deleteAccountButton(a) {
  return el('button', {
    class: 'btn btn--small', text: 'ลบ',
    onClick: () => {
      if (confirmAction(`ยืนยันลบผู้ใช้งาน ${a.fullName} (${a.email}) ถาวร? การลบนี้กู้คืนไม่ได้`)) {
        store.deleteAccount(a.id);
      }
    }
  });
}

function roleLabel(key) {
  return (ROLES.find(r => r.key === key) || {}).label || key;
}

/** A plain (non-bound) select so its live value can be read at click time — no store state needed for it. */
function branchSelect(state) {
  const select = el('select', null,
    el('option', { value: 'ALL', text: 'ทุกสาขา' }),
    state.branches.map(b => el('option', { value: b.id, text: `${b.id} · ${b.name}` }))
  );
  return select;
}

function pendingRow(state, a) {
  const select = branchSelect(state);
  return tr(
    tdTitled(a.fullName, a.department, { mono: false }),
    td(a.department),
    tdCode(a.email),
    tdCode(a.phone || '-'),
    td(roleLabel(a.role)),
    tdCode(shortDate(a.createdAt.slice(0, 10))),
    td(select),
    td(
      el('div', { class: 'row', style: { gap: '6px' } },
        el('button', {
          class: 'btn btn--small', text: 'อนุมัติ',
          onClick: () => {
            if (!confirmAction(`ยืนยันอนุมัติ ${a.fullName} (${a.email}) เป็น "${roleLabel(a.role)}"?`)) return;
            store.approveAccount(a.id, select.value);
          }
        }),
        el('button', {
          class: 'btn btn--small', text: 'ปฏิเสธ',
          onClick: () => {
            if (!confirmAction(`ยืนยันปฏิเสธการลงทะเบียนของ ${a.fullName} (${a.email})?`)) return;
            store.rejectAccount(a.id);
          }
        })
      )
    ),
    td(deleteAccountButton(a))
  );
}

/** The name cell: plain text, or an inline input + save/cancel while editing. */
function nameCell(state, a) {
  if (state.editingAccountId !== a.id) {
    return tdTitled(a.fullName, a.department, { mono: false });
  }
  return td(
    el('div', { class: 'row', style: { gap: '6px' } },
      el('input', {
        value: state.editAccountName,
        style: { minWidth: '160px' },
        'data-bind': 'editAccountName',
        onInput: e => store.setEditAccountName(e.target.value),
        onKeydown: e => { if (e.key === 'Enter') store.saveAccountName(); }
      }),
      el('button', {
        class: 'btn btn--small', text: 'บันทึก',
        onClick: () => {
          if (confirmAction(`ยืนยันเปลี่ยนชื่อเป็น "${state.editAccountName.trim()}"?`)) store.saveAccountName();
        }
      }),
      el('button', { class: 'btn btn--small', text: 'ยกเลิก', onClick: () => store.cancelEditAccountName() })
    )
  );
}

function rosterRow(state, a) {
  const badgeByStatus = {
    approved: badge('อนุมัติแล้ว', 'ok'),
    rejected: badge('ปฏิเสธแล้ว', 'danger')
  };
  return tr(
    nameCell(state, a),
    td(a.department),
    tdCode(a.email),
    tdCode(a.phone || '-'),
    td(roleLabel(a.role)),
    td(store.branchLabel(a.branch)),
    td(badgeByStatus[a.status] || badge(a.status, 'watch')),
    td(state.editingAccountId === a.id ? null : el('button', {
      class: 'btn btn--small', text: 'แก้ไขชื่อ',
      onClick: () => store.startEditAccountName(a.id, a.fullName)
    })),
    td(deleteAccountButton(a))
  );
}

/** Admin's own display name — separate from the accounts table entirely. */
function adminProfileCard(state) {
  const editing = state.editingAdminName;
  const currentName = (state.auth && state.auth.fullName) || 'ผู้ดูแลระบบ';

  return el('section', { class: 'card card--pad' },
    el('div', { class: 'card__title-row' }, el('h2', { text: 'ชื่อที่แสดงของคุณ' })),
    editing
      ? el('div', { class: 'row', style: { gap: '8px' } },
          el('input', {
            value: state.adminNameForm,
            style: { minWidth: '220px' },
            'data-bind': 'adminNameForm',
            onInput: e => store.setAdminNameDraft(e.target.value),
            onKeydown: e => { if (e.key === 'Enter') store.saveAdminName(); }
          }),
          el('button', {
            class: 'btn btn--primary btn--small', text: 'บันทึก',
            onClick: () => {
              if (confirmAction(`ยืนยันเปลี่ยนชื่อของคุณเป็น "${state.adminNameForm.trim()}"?`)) store.saveAdminName();
            }
          }),
          el('button', { class: 'btn btn--small', text: 'ยกเลิก', onClick: () => store.cancelEditAdminName() })
        )
      : el('div', { class: 'row', style: { gap: '10px' } },
          el('span', { text: currentName }),
          el('button', { class: 'btn btn--small', text: 'แก้ไข', onClick: () => store.startEditAdminName() })
        )
  );
}

/** Admin creating an already-approved employee directly, bypassing the queue. */
function newAccountForm(state) {
  const roleOptions = STAFF_ROLES.map(r => ({ value: r.key, label: r.label }));
  const branchOptions = [{ value: 'ALL', label: 'ทุกสาขา' }].concat(
    state.branches.map(b => ({ value: b.id, label: `${b.id} · ${b.name}` }))
  );

  return formCard({ title: 'เพิ่มผู้ใช้งานใหม่', note: 'สร้างแบบอนุมัติทันที ไม่ต้องรอผ่านคิว' },
    fieldGrid('xs',
      inputField('ชื่อ-นามสกุล', 'newAccountForm', 'fullName', { placeholder: 'เช่น สมชาย ใจดี' }),
      inputField('ฝ่ายสังกัด', 'newAccountForm', 'department', { placeholder: 'เช่น ฝ่ายจัดซื้อ' }),
      inputField('อีเมล', 'newAccountForm', 'email', { type: 'email', placeholder: 'name@company.com' }),
      inputField('เบอร์โทร', 'newAccountForm', 'phone', { placeholder: '0xx-xxx-xxxx' }),
      selectField('หน้าที่', 'newAccountForm', 'role', roleOptions),
      selectField('สาขา', 'newAccountForm', 'branch', branchOptions),
      el('div', { class: 'field field--action' },
        el('button', {
          class: 'btn btn--primary btn--block', text: 'เพิ่มผู้ใช้งาน',
          onClick: () => {
            const f = state.newAccountForm;
            if (confirmAction(`ยืนยันเพิ่ม ${f.fullName || '(ยังไม่กรอกชื่อ)'} เป็นผู้ใช้งานที่อนุมัติแล้ว?`)) {
              store.addAccountDirect();
            }
          }
        })
      )
    )
  );
}

function accountsSection(state) {
  if (!store.persisted) return null;

  const pending = state.accounts.filter(a => a.status === 'pending');
  const roster = state.accounts.filter(a => a.status !== 'pending');

  return el('div', { class: 'page__sections', style: { marginBottom: '14px' } },
    adminProfileCard(state),
    card({ title: 'รออนุมัติ', note: `${pending.length} รายการ` },
      state.accountsLoaded
        ? (pending.length
            ? table(PENDING_HEAD, pending.map(a => pendingRow(state, a)))
            : el('div', { style: { padding: '18px' }, class: 'card__note', text: 'ไม่มีคำขอลงทะเบียนที่รออนุมัติ' }))
        : el('div', { style: { padding: '18px' }, class: 'card__note', text: 'กำลังโหลด…' })
    ),
    when(roster.length, () =>
      card({ title: 'ทะเบียนผู้ใช้งาน', note: `${roster.length} ราย` },
        table(ROSTER_HEAD, roster.map(a => rosterRow(state, a)))
      )),
    newAccountForm(state)
  );
}

/** Header: one label column, then one centred column per section. */
function headings() {
  return el('thead', null,
    el('tr', null,
      el('th', { text: 'บทบาท / ผู้ใช้ตัวอย่าง' }),
      SECTIONS.map(s => el('th', { class: 'is-center', text: s.label }))
    )
  );
}

/** The role/example-user cell: plain text + edit trigger, or an inline form. */
function roleCell(state, role) {
  if (state.editingRoleKey !== role.key) {
    return el('td', { class: 'role-cell' },
      el('div', { class: 'cell__title', text: role.label }),
      el('div', { class: 'cell__sub', text: role.person }),
      when(store.isAdmin(), () => el('div', { class: 'row', style: { gap: '6px', marginTop: '6px' } },
        el('button', {
          class: 'btn btn--small', text: 'แก้ไข',
          onClick: () => store.startEditRoleLabel(role.key)
        }),
        when(role.key !== 'admin', () => el('button', {
          class: 'btn btn--small', text: 'ลบ',
          onClick: () => {
            if (confirmAction(`ยืนยันลบบทบาท "${role.label}"? ทำได้เฉพาะบทบาทที่ไม่มีผู้ใช้งานสังกัดอยู่`)) {
              store.deleteRole(role.key);
            }
          }
        }))
      ))
    );
  }

  return el('td', { class: 'role-cell' },
    el('div', { class: 'stack', style: { gap: '6px' } },
      el('input', {
        value: state.editRoleLabel, placeholder: 'ชื่อบทบาท',
        'data-bind': 'editRoleLabel',
        onInput: e => store.setEditRoleLabel(e.target.value)
      }),
      el('input', {
        value: state.editRolePerson, placeholder: 'ชื่อผู้ใช้ตัวอย่าง',
        'data-bind': 'editRolePerson',
        onInput: e => store.setEditRolePerson(e.target.value)
      }),
      el('div', { class: 'row', style: { gap: '6px' } },
        el('button', {
          class: 'btn btn--small', text: 'บันทึก',
          onClick: () => {
            if (confirmAction(`ยืนยันแก้ไขบทบาทเป็น "${state.editRoleLabel.trim()}" · "${state.editRolePerson.trim()}"?`)) {
              store.saveRoleLabel();
            }
          }
        }),
        el('button', { class: 'btn btn--small', text: 'ยกเลิก', onClick: () => store.cancelEditRoleLabel() })
      )
    )
  );
}

/** A new role starts with every section at 'none' — admin adjusts from the matrix after. */
function addRoleForm(state) {
  return formCard({ title: 'เพิ่มบทบาทใหม่', note: 'สิทธิ์เริ่มต้นคือ "ไม่เห็นเมนู" ทุกส่วน ปรับได้จากตารางด้านบนหลังเพิ่ม' },
    fieldGrid('xs',
      inputField('รหัสบทบาท', 'roleForm', 'key', { placeholder: 'เช่น fg (อังกฤษพิมพ์เล็ก ไม่เว้นวรรค)', mono: true }),
      inputField('ชื่อบทบาท', 'roleForm', 'label', { placeholder: 'เช่น ฝ่าย FG' }),
      inputField('ชื่อผู้ใช้ตัวอย่าง', 'roleForm', 'person', { placeholder: 'เช่น วิภา ส.' }),
      el('div', { class: 'field field--action' },
        el('button', {
          class: 'btn btn--primary btn--block', text: 'เพิ่มบทบาท',
          onClick: () => {
            const f = state.roleForm;
            if (confirmAction(`ยืนยันเพิ่มบทบาท "${f.label || '(ยังไม่กรอกชื่อ)'}"?`)) store.addRole();
          }
        })
      )
    )
  );
}

/** Admin rights are locked so an admin cannot lock themselves out. */
function permButton(role, section) {
  const value = store.perm(section.key, role.key);
  const locked = role.key === 'admin';
  return el('td', { class: 'tight' },
    el('button', {
      class: ['perm-cell', 'perm-cell--' + value],
      disabled: locked,
      text: locked ? `${PERM_LABELS[value]} · ล็อก` : PERM_LABELS[value],
      onClick: locked
        ? () => store.say('สิทธิ์ของผู้ดูแลระบบถูกล็อกไว้ ไม่สามารถลดสิทธิ์ตัวเองได้', true)
        : () => store.cyclePerm(role.key, section.key)
    })
  );
}

export function adminView() {
  const state = store.state;

  const matrix = el('div', { class: 'table-scroll' },
    el('table', { class: 'table' },
      headings(),
      el('tbody', null,
        ROLES.map(role => el('tr', null,
          roleCell(state, role),
          SECTIONS.map(section => permButton(role, section))
        ))
      )
    )
  );

  const head = el('div', { class: 'card__head' },
    el('h2', { text: 'ตารางสิทธิ์การใช้งานแต่ละบทบาท' }),
    el('div', { class: 'row', style: { gap: '14px' } },
      el('span', { class: 'card__note', text: 'คลิกช่องเพื่อสลับ: ไม่เห็นเมนู → ดูอย่างเดียว → แก้ไขได้' }),
      el('button', { class: 'btn', text: 'คืนค่าเริ่มต้น', onClick: () => store.resetPerms() })
    )
  );

  return el('div', { class: 'page__sections' },
    accountsSection(state),
    el('section', { class: 'card' }, head, matrix),
    addRoleForm(state),
    el('div', { class: 'grid-cards grid-cards--lg' },
      NOTES.map(nCard => el('div', { class: 'note-card' },
        el('div', { class: 'note-card__title', text: nCard.title }),
        el('div', { class: 'note-card__body', text: nCard.body })
      ))
    )
  );
}
