/** Shared building blocks used across the pages. */

import { el, when } from './dom.js';
import { store } from '../core/store.js';

/* -------------------------------------------------------------------------- */
/* Cards                                                                       */
/* -------------------------------------------------------------------------- */

/** A titled card with a table or list inside. `note` sits on the right. */
export function card({ title, note, noteMono = false, action = null, printHide = false }, ...body) {
  return el('section', { class: 'card', 'data-print': printHide ? 'hide' : null },
    when(title || note || action, () => el('div', { class: 'card__head' },
      el('h2', { text: title }),
      action,
      when(note, () => el('span', { class: ['card__note', noteMono && 'card__note--mono'], text: note }))
    )),
    ...body
  );
}

/** A card that holds a form rather than a table. */
export function formCard({ title, note, printHide = true }, ...body) {
  return el('section', { class: 'card card--pad', 'data-print': printHide ? 'hide' : null },
    when(title, () => el('div', { class: 'card__title-row' },
      el('h2', { text: title }),
      when(note, () => el('span', { class: 'card__note', text: note }))
    )),
    ...body
  );
}

/**
 * KPI tile. `tone` colours the dot and, when `toneValue` is set, the number.
 */
export function statCard({ label, value, hint, tone = 'watch', toneValue = null, plain = false }) {
  return el('div', { class: ['stat', plain && 'stat--plain'] },
    el('div', { class: 'stat__top' },
      el('span', { class: 'stat__label', text: label }),
      el('span', { class: ['stat__dot', 'fill-' + tone] })
    ),
    el('div', { class: ['stat__value', toneValue && 'tone-' + toneValue], text: value }),
    when(hint, () => el('div', { class: 'stat__hint', text: hint }))
  );
}

/** Read-only figures shown beside a form's submit button. */
export function summaryPanel(entries) {
  return el('div', { class: 'summary' },
    entries.map(e => el('div', null,
      el('div', { class: 'summary__label', text: e.label }),
      el('div', { class: ['summary__value', e.variant && 'summary__value--' + e.variant, e.tone && 'tone-' + e.tone], text: e.value })
    ))
  );
}

/* -------------------------------------------------------------------------- */
/* Tables                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Build a table. Header labels may carry a `|R` suffix to right-align the
 * column (matching the numeric cells built by `tdNum`).
 */
export function table(headings, rows) {
  return el('div', { class: 'table-scroll' },
    el('table', { class: 'table' },
      el('thead', null,
        el('tr', null, headings.map(h => {
          const right = h.endsWith('|R');
          return el('th', { class: right ? 'is-right' : null, text: right ? h.slice(0, -2) : h });
        }))
      ),
      el('tbody', null, rows)
    )
  );
}

export const tr = (...cells) => el('tr', null, ...cells);
export const td = (...content) => el('td', null, ...content);
export const tdNum = text => el('td', { class: 'num', text });
export const tdCode = text => el('td', { class: 'code', text });

/** Primary label with a quieter second line underneath. */
export function tdTitled(title, sub, { mono = true } = {}) {
  return el('td', null,
    el('div', { class: 'cell__title', text: title }),
    when(sub, () => el('div', { class: ['cell__sub', mono && 'cell__sub--mono'], text: sub }))
  );
}

export function badge(label, tone, { plain = false } = {}) {
  return el('span', { class: ['badge', 'badge--' + tone, plain && 'badge--plain'], text: label });
}

/** Horizontal progress bar; `pct` is clamped to 0–100. */
export function meter(pct, tone, { value = null, stacked = false, footnote = null, score = false } = {}) {
  const width = Math.max(0, Math.min(100, Math.round(pct))) + '%';
  return el('div', { class: ['meter', stacked && 'meter--stacked', score && 'meter--score'] },
    el('div', { class: 'meter__track' },
      el('div', { class: ['meter__fill', 'fill-' + tone], style: { width } })
    ),
    when(value !== null, () => el('span', { class: ['meter__value', 'tone-' + tone], text: value })),
    when(footnote, () => el('span', { class: 'meter__min', text: footnote }))
  );
}

/* -------------------------------------------------------------------------- */
/* Form fields                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A labelled input bound to `store.state[form][field]`.
 *
 * `data-bind` gives the renderer a stable handle so focus and caret survive the
 * re-render that every keystroke triggers.
 */
export function inputField(label, form, field, opts = {}) {
  const { type = 'text', placeholder = '', mono = false, variant = null, onInput = null, disabled = false } = opts;
  const control = el('input', {
    type,
    value: store.state[form][field] ?? '',
    placeholder,
    disabled,
    'data-bind': `${form}.${field}`,
    onInput: e => (onInput ? onInput(e.target.value) : store.setField(form, field, e.target.value))
  });
  return el('label', { class: ['field', mono && 'field--mono', variant && 'field--' + variant] },
    el('span', { class: 'field__label', text: label }),
    control
  );
}

/** A labelled select. `options` is `[{ value, label }]`. */
export function selectField(label, form, field, options, opts = {}) {
  const { placeholder = null, variant = null, onChange = null, disabled = false } = opts;
  const value = store.state[form][field] ?? '';
  const control = el('select', {
    disabled,
    'data-bind': `${form}.${field}`,
    onChange: e => (onChange ? onChange(e.target.value) : store.setField(form, field, e.target.value))
  },
    when(placeholder, () => el('option', { value: '', text: placeholder })),
    options.map(o => el('option', { value: o.value, selected: o.value === value, text: o.label }))
  );
  control.value = value;
  return el('label', { class: ['field', variant && 'field--' + variant] },
    el('span', { class: 'field__label', text: label }),
    control
  );
}

/** Wraps fields in the responsive auto-fit grid the forms use. */
export function fieldGrid(size, ...fields) {
  return el('div', { class: ['field-grid', size && 'field-grid--' + size] }, ...fields);
}

export function submitRow(summary, button) {
  return el('div', { class: 'form-actions' }, summary, button);
}

export const button = (label, onClick, opts = {}) => el('button', {
  class: ['btn', opts.variant && 'btn--' + opts.variant, opts.extra],
  disabled: opts.disabled,
  title: opts.title,
  onClick
}, opts.tag ? el('span', { class: 'btn__tag', text: opts.tag }) : null, label);

/** Ledger row type → status tone. */
export const moveTone = type =>
  type === 'รับเข้า' ? 'ok' : type === 'ตัดทิ้ง' ? 'danger' : 'warn';
