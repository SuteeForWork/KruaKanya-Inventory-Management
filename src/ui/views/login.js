/** Sign-in screen. */

import { el, when } from '../dom.js';
import { store } from '../../core/store.js';
import { config } from '../../config.js';
import { ACCOUNTS, roleByKey } from '../../core/access.js';

function credential(label, field, type) {
  return el('label', { class: 'field field--login' },
    el('span', { class: 'field__label field__label--lg', text: label }),
    el('input', {
      type,
      value: store.state.loginForm[field],
      placeholder: field === 'user' ? 'เช่น admin' : '••••',
      'data-bind': `loginForm.${field}`,
      onInput: e => store.setField('loginForm', field, e.target.value),
      onKeydown: e => { if (e.key === 'Enter') store.login(); }
    })
  );
}

export function loginView() {
  const { error } = store.state.loginForm;

  return el('div', { class: 'login' },
    el('div', { class: 'login__card' },

      el('div', { class: 'login__pitch' },
        el('div', { class: 'brand' },
          el('div', { class: 'brand__mark', text: 'IN' }),
          el('div', { class: 'stack' },
            el('div', { class: 'brand__name', text: config.companyName }),
            el('div', { class: 'brand__sub', text: 'Ingredient Inventory' })
          )
        ),
        el('div', { class: 'stack', style: { gap: '10px' } },
          el('h1', null, 'ระบบจัดการวัตถุดิบอาหาร', el('br'), 'รับเข้า · คงเหลือ · เบิกออก · Yield'),
          el('p', { text: 'เข้าสู่ระบบเพื่อใช้งานตามสิทธิ์ของบทบาทคุณ ตัดสต๊อกแบบ FEFO คิดต้นทุนตามราคาจริงของแต่ละล็อต' })
        ),
        el('div', { class: 'login__demo' },
          el('span', { class: 'eyebrow', text: 'บัญชีตัวอย่าง · รหัสผ่าน 1234' }),
          el('div', { class: 'chip-row' },
            ACCOUNTS.map(a => el('button', {
              class: 'chip',
              text: `${a.user} · ${roleByKey(a.role).label}`,
              onClick: () => store.fillDemoAccount(a.user)
            }))
          )
        )
      ),

      el('div', { class: 'login__form' },
        el('div', null,
          el('h2', { text: 'เข้าสู่ระบบ' }),
          el('p', { text: 'ใช้บัญชีที่ผู้ดูแลระบบกำหนดสิทธิ์ไว้' })
        ),
        credential('ชื่อผู้ใช้', 'user', 'text'),
        credential('รหัสผ่าน', 'pass', 'password'),
        when(error, () => el('div', { class: 'login__error', text: error })),
        el('button', { class: 'btn btn--primary btn--submit', text: 'เข้าสู่ระบบ', onClick: () => store.login() }),
        el('div', { class: 'login__hint', text: 'สิทธิ์การเข้าถึงแต่ละเมนูกำหนดโดยผู้ดูแลระบบในหน้า "ตั้งค่าสิทธิ์ผู้ใช้"' })
      )
    )
  );
}
