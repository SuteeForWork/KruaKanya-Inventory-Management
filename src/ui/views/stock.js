/** วัตถุดิบคงเหลือ — per-item roll-up plus the FEFO-ordered lot detail. */

import { el } from '../dom.js';
import {
  badge, card, meter, statCard, table, td, tdCode, tdNum, tdTitled, tr
} from '../components.js';
import { store } from '../../core/store.js';
import { baht, n, shortDate } from '../../core/format.js';
import {
  ageLeftOf, costOf, expiryOf, liveLots,
  statusOf, stockByItem, warnDays, weightOf
} from '../../core/inventory.js';

const ITEM_HEAD = [
  'วัตถุดิบ', 'จำนวนคงเหลือ|R', 'น้ำหนักคงเหลือ (กก.)|R', 'เทียบจุดสั่งซื้อ',
  'อายุในคลัง (วัน)|R', 'อายุคงเหลือ (วัน)|R', 'ต้นทุนคงเหลือ|R', 'สถานะ'
];

const LOT_HEAD = [
  'ล็อต', 'สาขา', 'วัตถุดิบ', 'ซัพพลายเออร์', 'วันรับเข้า', 'วันหมดอายุ',
  'อายุคงเหลือ|R', 'จำนวน|R', 'น้ำหนัก (กก.)|R', 'ราคา ณ รับเข้า / หน่วย|R',
  'ราคา ณ รับเข้า / กก.|R', 'ต้นทุนคงเหลือ|R', 'สถานะ'
];

function stats(state) {
  const live = liveLots(state);
  const w = warnDays();
  const atRisk = live.filter(l => ageLeftOf(l) <= w).length;

  return [
    statCard({ plain: true, label: 'ต้นทุนทั้งหมดใน inventory', value: baht(live.reduce((a, l) => a + costOf(l), 0)), tone: 'accent', toneValue: 'cost' }),
    statCard({ plain: true, label: 'น้ำหนักคงเหลือรวม (กก.)', value: n(live.reduce((a, l) => a + weightOf(l), 0), 1), tone: 'ok' }),
    statCard({ plain: true, label: 'จำนวนหน่วยคงเหลือรวม', value: n(live.reduce((a, l) => a + l.qtyLeft, 0)), tone: 'watch' }),
    statCard({ plain: true, label: `ล็อตที่ต้องใช้ก่อน (≤ ${w} วัน)`, value: n(atRisk), tone: 'warn', toneValue: atRisk ? 'warn' : null })
  ];
}

function itemRows(state) {
  return stockByItem(state)
    .filter(r => r.qtyLeft > 0)
    .filter(r => store.matches(r.item.name, r.item.code, r.item.category))
    .map(r => {
      const isCount = r.item.trackBy === 'count';
      const status = statusOf(r.soonestExpiry === null ? 99 : r.soonestExpiry);
      const compareTo = isCount ? r.qtyLeft : r.weightLeft;
      const pct = Math.min(100, Math.round((compareTo / r.item.minStock) * 100));
      const belowReorder = pct < 100;

      return tr(
        tdTitled(r.item.name, `${r.item.code} · ${r.item.category}`),
        tdNum(`${n(r.qtyLeft)} ${r.item.unit}`),
        tdNum(isCount ? '—' : n(r.weightLeft, 1)),
        td(meter(pct, belowReorder ? 'warn' : 'ok', {
          stacked: true,
          footnote: `ขั้นต่ำ ${n(r.item.minStock)}${isCount ? ' ' + r.item.unit : ' กก.'}`
        })),
        tdNum(r.oldestInStore === null ? '—' : n(r.oldestInStore)),
        tdNum(r.soonestExpiry === null ? '—' : n(r.soonestExpiry)),
        tdNum(baht(r.cost)),
        td(belowReorder ? badge('ต้องสั่งซื้อ', 'watch') : badge(status.label, status.tone))
      );
    });
}

function lotRows(state) {
  return liveLots(state)
    .filter(l => store.matches(l.name, l.code, l.id, l.supplier))
    .map(l => {
      const days = ageLeftOf(l);
      const status = statusOf(days);
      return tr(
        tdCode(l.id),
        td(el('span', { class: 'cell__sub', style: { fontSize: '11px', color: 'var(--ink-soft)' }, text: store.branchLabel(l.branch) })),
        tdTitled(l.name, l.code),
        td(l.supplier),
        tdCode(shortDate(l.recvDate)),
        tdCode(shortDate(expiryOf(l))),
        tdNum(n(days)),
        tdNum(`${n(l.qtyLeft)} ${l.unit}`),
        tdNum(l.weightPerUnit ? n(weightOf(l), 1) : '—'),
        tdNum(`${baht(l.pricePerUnit, 2)} / ${l.unit}`),
        tdNum(l.weightPerUnit ? `${baht(l.pricePerUnit / l.weightPerUnit, 2)} / กก.` : '—'),
        tdNum(baht(costOf(l))),
        td(badge(status.label, status.tone))
      );
    });
}

export function stockView() {
  const state = store.state;
  return el('div', { class: 'page__sections' },
    el('div', { class: 'grid-cards grid-cards--sm' }, stats(state)),
    card({ title: 'วัตถุดิบคงเหลือ · สรุปตามรายการ' }, table(ITEM_HEAD, itemRows(state))),
    card({
      title: 'รายละเอียดระดับล็อต (เรียงตาม FEFO)',
      note: 'ล็อตที่หมดอายุก่อนจะถูกตัดออกก่อนอัตโนมัติ'
    }, table(LOT_HEAD, lotRows(state)))
  );
}
