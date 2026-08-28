/** ตั้งค่าสิทธิ์ผู้ใช้ — the role × section permission matrix. */

import { el } from '../dom.js';
import { table, td, tr } from '../components.js';
import { store } from '../../core/store.js';
import { PERM_LABELS, ROLES, SECTIONS } from '../../core/access.js';

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
    el('section', { class: 'card' }, head, matrix),
    el('div', { class: 'grid-cards grid-cards--lg' },
      NOTES.map(nCard => el('div', { class: 'note-card' },
        el('div', { class: 'note-card__title', text: nCard.title }),
        el('div', { class: 'note-card__body', text: nCard.body })
      ))
    )
  );
}
