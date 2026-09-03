/** Sign-in screen — plus the self-registration panel for new employees. */

import { el, when } from '../dom.js';
import { store } from '../../core/store.js';
import { config } from '../../config.js';
import { STAFF_ROLES } from '../../core/access.js';

function credential(label, field, type) {
  const isPassword = type === 'password';

  const input = el('input', {
    type,
    value: store.state.loginForm[field],
    placeholder: field === 'user' ? 'อีเมล หรือชื่อผู้ใช้' : '••••',
    'data-bind': `loginForm.${field}`,
    onInput: e => store.setField('loginForm', field, e.target.value),
    onKeydown: e => { if (e.key === 'Enter') store.login(); }
  });

  if (!isPassword) {
    return el('label', { class: 'field field--login' },
      el('span', { class: 'field__label field__label--lg', text: label }),
      input
    );
  }

  // Toggles input.type directly — purely cosmetic, no reason to round-trip
  // through store state and re-render the whole app for this.
  const toggle = el('button', {
    type: 'button', class: 'password-toggle', text: 'แสดง',
    title: 'แสดง/ซ่อนรหัสผ่าน',
    onClick: () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      toggle.textContent = showing ? 'แสดง' : 'ซ่อน';
    }
  });

  return el('label', { class: 'field field--login' },
    el('span', { class: 'field__label field__label--lg', text: label }),
    el('div', { class: 'field__control-wrap' }, input, toggle)
  );
}

function registerField(label, field, opts = {}) {
  const { type = 'text', placeholder = '' } = opts;
  return el('label', { class: 'field field--login' },
    el('span', { class: 'field__label field__label--lg', text: label }),
    el('input', {
      type, placeholder,
      value: store.state.registerForm[field],
      'data-bind': `registerForm.${field}`,
      onInput: e => store.setField('registerForm', field, e.target.value)
    })
  );
}

function loginPanel() {
  const { error } = store.state.loginForm;
  return el('div', { class: 'login__form' },
    el('div', null,
      el('h2', { text: 'เข้าสู่ระบบ' }),
      el('p', { text: 'ผู้ดูแลระบบใช้ชื่อผู้ใช้ที่กำหนดไว้ · พนักงานใช้อีเมลที่ลงทะเบียนไว้' })
    ),
    credential('ชื่อผู้ใช้ / อีเมล', 'user', 'text'),
    credential('รหัสผ่าน', 'pass', 'password'),
    when(error, () => el('div', { class: 'login__error', text: error })),
    el('button', { class: 'btn btn--primary btn--submit', text: 'เข้าสู่ระบบ', onClick: () => store.login() }),
    el('div', { class: 'login__switch' },
      'ยังไม่มีบัญชี? ',
      el('button', { text: 'ลงทะเบียนพนักงานใหม่', onClick: () => store.showRegisterForm() })
    ),
    el('div', { class: 'login__hint', text: 'สิทธิ์การเข้าถึงแต่ละเมนูกำหนดโดยผู้ดูแลระบบในหน้า "ตั้งค่าสิทธิ์ผู้ใช้"' })
  );
}

function registerPanel() {
  return el('div', { class: 'login__form' },
    el('div', null,
      el('h2', { text: 'ลงทะเบียนพนักงานใหม่' }),
      el('p', { text: 'กรอกข้อมูลแล้วรอผู้ดูแลระบบอนุมัติ — เข้าสู่ระบบได้หลังได้รับอนุมัติแล้ว' })
    ),
    registerField('ชื่อ-นามสกุล', 'fullName', { placeholder: 'เช่น สมชาย ใจดี' }),
    registerField('ฝ่ายสังกัด', 'department', { placeholder: 'เช่น ฝ่ายจัดซื้อ / ฝ่ายผลิต / ฝ่าย FG' }),
    registerField('อีเมล', 'email', { type: 'email', placeholder: 'name@company.com' }),
    registerField('เบอร์โทร', 'phone', { placeholder: '0xx-xxx-xxxx' }),
    el('label', { class: 'field field--login' },
      el('span', { class: 'field__label field__label--lg', text: 'หน้าที่' }),
      (() => {
        const value = store.state.registerForm.role;
        const select = el('select', {
          onChange: e => store.setField('registerForm', 'role', e.target.value)
        }, STAFF_ROLES.map(r => el('option', { value: r.key, selected: r.key === value, text: r.label })));
        select.value = value;
        return select;
      })()
    ),
    el('button', { class: 'btn btn--primary btn--submit', text: 'ส่งคำขอลงทะเบียน', onClick: () => store.register() }),
    el('div', { class: 'login__switch' },
      el('button', { text: '← กลับไปเข้าสู่ระบบ', onClick: () => store.showLoginForm() })
    )
  );
}

function registeredPanel() {
  return el('div', { class: 'login__form' },
    el('div', null,
      el('h2', { text: 'ลงทะเบียนสำเร็จ' }),
      el('p', { text: 'รอผู้ดูแลระบบอนุมัติคำขอของคุณ' })
    ),
    el('div', {
      class: 'login__success',
      text: 'ส่งคำขอลงทะเบียนเรียบร้อยแล้ว เมื่อผู้ดูแลระบบอนุมัติ คุณจะเข้าสู่ระบบได้ด้วยอีเมลที่ลงทะเบียนไว้ และรหัสผ่าน 1234'
    }),
    el('button', { class: 'btn btn--primary btn--submit', text: 'กลับไปเข้าสู่ระบบ', onClick: () => store.showLoginForm() })
  );
}

const PANELS = { login: loginPanel, register: registerPanel, registered: registeredPanel };

export function loginView() {
  const panel = PANELS[store.state.loginPanel] || loginPanel;

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
        )
      ),

      panel()
    )
  );
}
