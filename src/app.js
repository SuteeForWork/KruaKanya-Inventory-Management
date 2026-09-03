/**
 * Application shell: sidebar, top bar, routing, toast — and the render loop.
 *
 * Rendering is a full rebuild of the tree on every state change. The data set
 * is small enough that this stays instant, and it keeps the views as plain
 * functions of state. `preserveFocus` puts the caret back afterwards so typing
 * into a form field is unaffected.
 */

import { el, render, when } from './ui/dom.js';
import { store } from './core/store.js';
import { config } from './config.js';
import { exportExcel, exportPdf } from './core/export.js';
import { ALL_BRANCHES, costOf, liveLots, stockByItem, weightOf } from './core/inventory.js';
import { PERM_LABELS, ROLES, roleByKey } from './core/access.js';
import { baht, kg } from './core/format.js';

import { loginView } from './ui/views/login.js';
import { dashboardView } from './ui/views/dashboard.js';
import { receiveView } from './ui/views/receive.js';
import { stockView } from './ui/views/stock.js';
import { issueView } from './ui/views/issue.js';
import { outputView } from './ui/views/output.js';
import { recipeView } from './ui/views/recipe.js';
import { masterView } from './ui/views/master.js';
import { movesView } from './ui/views/moves.js';
import { branchView } from './ui/views/branch.js';
import { adminView } from './ui/views/admin.js';

const VIEWS = {
  dash: dashboardView,
  receive: receiveView,
  stock: stockView,
  issue: issueView,
  output: outputView,
  recipe: recipeView,
  master: masterView,
  moves: movesView,
  branch: branchView,
  admin: adminView
};

const PAGES = {
  dash:    { title: 'ภาพรวมคลังวัตถุดิบ',              sub: 'ข้อมูล ณ 26 ส.ค. 2026 · อัปเดตอัตโนมัติจากทุกรายการรับเข้า–เบิกออก' },
  receive: { title: 'รับวัตถุดิบเข้า',                  sub: 'บันทึกล็อตใหม่พร้อมวันผลิต อายุวัตถุดิบ น้ำหนักต่อหน่วย และราคา ณ วันรับเข้า' },
  stock:   { title: 'วัตถุดิบคงเหลือ',                  sub: 'น้ำหนัก จำนวน อายุคงเหลือ และต้นทุนที่จมอยู่ในคลัง แยกตามรายการและล็อต' },
  issue:   { title: 'เบิกวัตถุดิบออก',                  sub: 'ระบบตัดสต๊อกแบบ FEFO — ล็อตที่หมดอายุก่อนถูกเบิกออกก่อน พร้อมคิดต้นทุนจริงต่อล็อต' },
  output:  { title: 'ผลผลิตรายวัน & Yield',             sub: 'บันทึกยอดที่ผลิตได้แต่ละวัน แล้วเทียบกับน้ำหนักและต้นทุนวัตถุดิบที่เบิกออกในวันเดียวกัน' },
  recipe:  { title: 'เมนู & สูตร (BOM)',                sub: 'ลงทะเบียนสูตรต่อ 1 หน่วยผลผลิต แล้วเทียบวัตถุดิบที่ควรใช้กับที่เบิกออกจริง เพื่อหา waste ที่เสียไป' },
  master:  { title: 'ซัพพลายเออร์ & รายละเอียดวัตถุดิบ', sub: 'ทะเบียนคู่ค้า เงื่อนไขการชำระ ใบรับรอง และข้อกำหนดของวัตถุดิบแต่ละตัว' },
  moves:   { title: 'รายงานการเคลื่อนไหว',              sub: 'ประวัติทุกธุรกรรมพร้อมมูลค่า ส่งออกเป็น Excel หรือ PDF ได้ทันที' },
  branch:  { title: 'จัดการสาขา',                       sub: 'เทียบสต๊อก ต้นทุน ของเสีย และ Yield ของแต่ละสาขา · โอนวัตถุดิบระหว่างสาขาผ่านการเบิกออกแบบ "เบิกโอนสาขา"' },
  admin:   { title: 'ตั้งค่าสิทธิ์ผู้ใช้',                sub: 'ผู้ดูแลระบบกำหนดได้ว่าแต่ละบทบาทเห็นและแก้ไขส่วนไหนได้ — คลิกที่ช่องเพื่อสลับสิทธิ์' }
};

const NAV_LABELS = {
  dash: 'ภาพรวมคลังวัตถุดิบ',
  receive: 'รับวัตถุดิบเข้า',
  stock: 'วัตถุดิบคงเหลือ',
  issue: 'เบิกวัตถุดิบออก',
  output: 'ผลผลิตรายวัน (Yield)',
  recipe: 'เมนู & สูตร (BOM)',
  master: 'ซัพพลายเออร์ & วัตถุดิบ',
  moves: 'รายงานการเคลื่อนไหว',
  branch: 'จัดการสาขา'
};

/* -------------------------------------------------------------------------- */
/* Sidebar                                                                     */
/* -------------------------------------------------------------------------- */

function navCounts(state) {
  return {
    stock: stockByItem(state).filter(r => r.qtyLeft > 0).length,
    recipe: state.recipes.length,
    branch: state.branches.length
  };
}

/**
 * The real logged-in person's name — except while an admin is previewing a
 * different role's view, when there's no real person behind that role to
 * name, so the role's placeholder persona is shown instead.
 */
function displayName(state) {
  if (state.auth && state.auth.role === state.role) return state.auth.fullName || roleByKey(state.role).person;
  return roleByKey(state.role).person;
}

function sidebar(state) {
  const counts = navCounts(state);
  const role = roleByKey(state.role);
  const person = displayName(state);
  const live = liveLots(state);

  const items = store.navSections()
    .map(s => ({ key: s.key, label: NAV_LABELS[s.key], count: counts[s.key] }))
    .concat(store.isAdmin() ? [{ key: 'admin', label: 'ตั้งค่าสิทธิ์ผู้ใช้' }] : []);

  return el('aside', { class: 'rail', 'data-print': 'hide' },
    el('div', { class: 'brand' },
      el('div', { class: 'brand__mark', text: 'IN' }),
      el('div', { class: 'stack' },
        el('div', { class: 'brand__name', text: config.companyName }),
        el('div', { class: 'brand__sub', text: 'Ingredient Inventory' })
      )
    ),

    el('nav', { class: 'nav' },
      items.map(item => el('button', {
        class: ['nav__item', state.view === item.key && 'is-active'],
        onClick: () => store.setView(item.key)
      },
        el('span', { class: 'nav__dot' }),
        el('span', { class: 'nav__label', text: item.label }),
        when(item.count, () => el('span', { class: 'nav__count', text: String(item.count) }))
      ))
    ),

    el('div', { class: 'rail__foot' },
      el('div', { class: 'rail__kpi' },
        el('div', { class: 'rail__kpi-label', text: 'ต้นทุนคงคลังรวม' }),
        el('div', { class: 'rail__kpi-value', text: baht(live.reduce((a, l) => a + costOf(l), 0)) }),
        el('div', {
          class: 'rail__kpi-hint',
          text: `${live.length} ล็อต · ${stockByItem(state).filter(r => r.qtyLeft > 0).length} รายการ · ${kg(live.reduce((a, l) => a + weightOf(l), 0))}`
        })
      ),
      el('div', { class: 'rail__user' },
        el('div', { class: 'rail__avatar', text: role.short }),
        el('div', { class: 'stack grow' },
          el('span', { class: 'rail__person', text: person }),
          el('span', { class: 'rail__role', text: role.label })
        ),
        el('button', { class: 'rail__logout', title: 'ออกจากระบบ', text: 'ออก', onClick: () => store.logout() })
      )
    )
  );
}

/* -------------------------------------------------------------------------- */
/* Top bar                                                                     */
/* -------------------------------------------------------------------------- */

function rolePill(state) {
  const role = roleByKey(state.role);
  // Only a signed-in admin may preview the app through another role.
  const canSwitch = state.auth && state.auth.role === 'admin';
  const editable = state.view === 'admin' ? store.isAdmin() : store.canEdit(state.view);

  const control = canSwitch
    ? selectControl(
        state.role,
        ROLES.map(r => ({ value: r.key, label: `${r.label} · ${r.person}` })),
        key => store.setRole(key)
      )
    : el('span', { class: 'pill__value', text: `${role.label} · ${displayName(state)}` });

  return el('div', { class: 'pill pill--role' },
    el('div', { class: 'pill__avatar', text: role.short }),
    control,
    el('span', {
      class: ['badge', 'badge--pill', editable ? 'badge--ok' : 'badge--watch'],
      text: editable ? PERM_LABELS.edit : PERM_LABELS.view
    })
  );
}

function selectControl(value, options, onChange) {
  const select = el('select', { onChange: e => onChange(e.target.value) },
    options.map(o => el('option', { value: o.value, selected: o.value === value, text: o.label }))
  );
  select.value = value;
  return select;
}

function branchPill(state) {
  const locked = state.auth && state.auth.branch !== ALL_BRANCHES;
  const options = [{ value: ALL_BRANCHES, label: 'ทุกสาขา (รวมทั้งเครือ)' }]
    .concat(state.branches.map(b => ({ value: b.id, label: `${b.id} · ${b.name}` })));

  return el('div', { class: 'pill' },
    el('span', { class: 'pill__label', text: 'สาขา' }),
    locked
      ? el('span', { class: 'pill__value', text: store.branchLabel(state.branch) })
      : selectControl(state.branch, options, id => store.setBranch(id))
  );
}

function topbar(state) {
  const page = PAGES[state.view] || PAGES.dash;

  return el('header', { class: 'topbar' },
    el('div', { class: 'topbar__title' },
      el('h1', { text: page.title }),
      el('p', { text: page.sub })
    ),
    el('div', { class: 'topbar__tools', 'data-print': 'hide' },
      rolePill(state),
      branchPill(state),
      el('div', { class: 'pill pill--search' },
        el('span', { class: 'pill__glyph', text: '⌕' }),
        el('input', {
          value: state.search,
          placeholder: 'ค้นหา ชื่อ / รหัส / ล็อต / ซัพพลายเออร์',
          'data-bind': 'search',
          onInput: e => store.setSearch(e.target.value)
        })
      ),
      el('button', { class: 'btn btn--excel', onClick: exportExcel },
        el('span', { class: 'btn__tag', text: 'XLS' }), 'Excel'),
      el('button', { class: 'btn btn--pdf', onClick: exportPdf },
        el('span', { class: 'btn__tag', text: 'PDF' }), 'พิมพ์'),
      when(store.canEdit('receive'), () =>
        el('button', { class: 'btn btn--primary', text: '+ รับเข้า', onClick: () => store.setView('receive') })),
      when(store.canEdit('issue'), () =>
        el('button', { class: 'btn btn--dark', text: '− เบิกออก', onClick: () => store.setView('issue') }))
    )
  );
}

/* -------------------------------------------------------------------------- */
/* Render loop                                                                 */
/* -------------------------------------------------------------------------- */

function appView(state) {
  // Belt-and-suspenders: the nav item is already hidden from non-admins, but
  // render-time state can be reached other ways (e.g. state.view set
  // directly), and this page shows the employee roster's PII.
  const effectiveView = state.view === 'admin' && !store.isAdmin() ? 'dash' : state.view;
  const view = VIEWS[effectiveView] || VIEWS.dash;

  return el('div', { class: 'shell' },
    sidebar(state),
    el('main', { class: 'main', 'data-print': 'grow' },
      topbar(state),
      el('div', { class: 'page' }, view())
    ),
    when(state.toast, () => el('div', { class: 'toast', 'data-print': 'hide' },
      el('span', { class: ['toast__dot', 'toast__dot--' + state.toast.tone] }),
      el('div', { class: 'toast__text', text: state.toast.text })
    ))
  );
}

/** Remember which bound field had focus, and where the caret sat. */
function captureFocus() {
  const active = document.activeElement;
  const bind = active && active.getAttribute && active.getAttribute('data-bind');
  if (!bind) return null;
  const selectable = active.selectionStart !== null && active.selectionStart !== undefined;
  return {
    bind,
    start: selectable ? active.selectionStart : null,
    end: selectable ? active.selectionEnd : null
  };
}

function restoreFocus(snapshot, root) {
  if (!snapshot) return;
  const next = root.querySelector(`[data-bind="${snapshot.bind}"]`);
  if (!next) return;
  next.focus();
  if (snapshot.start !== null && next.setSelectionRange) {
    try { next.setSelectionRange(snapshot.start, snapshot.end); } catch { /* not a text input */ }
  }
}

/** Shown while init() is fetching from Supabase, or if that fetch fails. */
function bootScreen(state) {
  return el('div', { class: 'login' },
    el('div', { class: 'login__form', style: { maxWidth: '420px', margin: '0 auto', textAlign: 'center' } },
      state.bootError
        ? el('div', { class: 'stack', style: { gap: '10px' } },
            el('h2', { text: 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ' }),
            el('p', { text: state.bootError }),
            el('button', { class: 'btn btn--primary', text: 'ลองใหม่', onClick: () => store.init() }))
        : el('p', { text: 'กำลังโหลดข้อมูล…' })
    )
  );
}

function mount() {
  const root = document.getElementById('root');
  document.documentElement.setAttribute('data-density', config.density);

  const draw = () => {
    const snapshot = captureFocus();
    const scroll = window.scrollY;
    const page = store.state.booting || store.state.bootError
      ? bootScreen(store.state)
      : store.state.auth ? appView(store.state) : loginView();
    render(root, page);
    restoreFocus(snapshot, root);
    window.scrollTo({ top: scroll });
  };

  store.subscribe(draw);
  draw();
  store.init();
}

mount();
