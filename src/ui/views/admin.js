/** ตั้งค่าสิทธิ์ผู้ใช้ — employee approval queue, staff roster, and the role × section permission matrix. */

import { el, when } from '../dom.js';
import { badge, card, confirmAction, table, td, tdCode, tdTitled, tr } from '../components.js';
import { store } from '../../core/store.js';
import { PERM_LABELS, ROLES, SECTIONS } from '../../core/access.js';
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
  'ชื่อ-นามสกุล', 'ฝ่ายสังกัด', 'อีเมล', 'เบอร์โทร', 'หน้าที่ที่ขอ', 'วันที่ลงทะเบียน', 'สาขาที่จะสังกัด', ''
];

const ROSTER_HEAD = ['ชื่อ-นามสกุล', 'ฝ่ายสังกัด', 'อีเมล', 'เบอร์โทร', 'หน้าที่', 'สาขา', 'สถานะ'];

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
    )
  );
}

function rosterRow(state, a) {
  const badgeByStatus = {
    approved: badge('อนุมัติแล้ว', 'ok'),
    rejected: badge('ปฏิเสธแล้ว', 'danger')
  };
  return tr(
    tdTitled(a.fullName, a.department, { mono: false }),
    td(a.department),
    tdCode(a.email),
    tdCode(a.phone || '-'),
    td(roleLabel(a.role)),
    td(store.branchLabel(a.branch)),
    td(badgeByStatus[a.status] || badge(a.status, 'watch'))
  );
}

function accountsSection(state) {
  if (!store.persisted) return null;

  const pending = state.accounts.filter(a => a.status === 'pending');
  const roster = state.accounts.filter(a => a.status !== 'pending');

  return el('div', { class: 'page__sections', style: { marginBottom: '14px' } },
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
      ))
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
          el('td', { class: 'role-cell' },
            el('div', { class: 'cell__title', text: role.label }),
            el('div', { class: 'cell__sub', text: role.person })
          ),
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
    el('div', { class: 'grid-cards grid-cards--lg' },
      NOTES.map(nCard => el('div', { class: 'note-card' },
        el('div', { class: 'note-card__title', text: nCard.title }),
        el('div', { class: 'note-card__body', text: nCard.body })
      ))
    )
  );
}
