/** ภาพรวมคลังวัตถุดิบ — KPIs, seven-day flow, what needs attention today. */

import { el, when } from '../dom.js';
import {
  badge, card, moveTone, statCard, table, td, tdCode, tdNum, tr
} from '../components.js';
import { store } from '../../core/store.js';
import { baht, kg, n, shortDate } from '../../core/format.js';
import { today } from '../../config.js';
import {
  ageLeftOf, costOf, expiryOf, liveLots, lowStock, scopedMoves,
  sortedMoves, statusOf, stockByItem, warnDays, weeklyFlow, weightOf
} from '../../core/inventory.js';

const MOVE_HEAD = ['วันที่-เวลา', 'ประเภท', 'เลขที่', 'วัตถุดิบ', 'จำนวน|R', 'น้ำหนัก (กก.)|R', 'มูลค่า|R', 'ผู้ทำรายการ'];

function kpiCards(state) {
  const live = liveLots(state);
  const items = stockByItem(state).filter(r => r.qtyLeft > 0);
  const low = lowStock(state);
  const w = warnDays();

  const nearExpiry = live.filter(l => ageLeftOf(l) <= w && ageLeftOf(l) > 0);
  const totalCost = live.reduce((a, l) => a + costOf(l), 0);
  const totalWeight = live.reduce((a, l) => a + weightOf(l), 0);

  const moves = scopedMoves(state).filter(m => m.date === today());
  const received = moves.filter(m => m.type === 'รับเข้า').length;
  const issued = moves.length - received;
  const wasteCost = scopedMoves(state).filter(m => m.type === 'ตัดทิ้ง').reduce((a, m) => a + m.cost, 0);

  return [
    statCard({
      label: 'ต้นทุนคงคลังรวม', value: baht(totalCost),
      hint: `${live.length} ล็อตที่ยังมีของ`, tone: 'accent'
    }),
    statCard({
      label: 'น้ำหนักคงเหลือรวม', value: n(totalWeight, 1),
      hint: `กิโลกรัม · ${items.length} รายการวัตถุดิบ`, tone: 'ok'
    }),
    statCard({
      label: `ใกล้หมดอายุ ≤ ${w} วัน`, value: n(nearExpiry.length),
      hint: `มูลค่า ${baht(nearExpiry.reduce((a, l) => a + costOf(l), 0))} ที่ต้องใช้ก่อน`,
      tone: 'warn', toneValue: nearExpiry.length ? 'warn' : null
    }),
    statCard({
      label: 'ต่ำกว่าจุดสั่งซื้อ', value: n(low.length),
      hint: low.length ? low.map(r => r.item.name).slice(0, 2).join(', ') : 'สต๊อกทุกตัวอยู่ในเกณฑ์',
      tone: 'watch'
    }),
    statCard({
      label: 'เคลื่อนไหววันนี้', value: n(moves.length),
      hint: `รับเข้า ${received} · เบิกออก ${issued} · ของเสียสะสม ${baht(wasteCost)}`,
      tone: 'danger'
    })
  ];
}

function flowChart(state) {
  const days = weeklyFlow(state);
  const height = value => Math.max(3, Math.round((value / days[0].peak) * 100)) + '%';

  return el('section', { class: 'card card--pad' },
    el('div', { class: 'chart__head' },
      el('h2', { text: 'การเคลื่อนไหว 7 วันล่าสุด (กก.)' }),
      el('div', { class: 'chart__legend' },
        el('span', null, el('span', { class: 'chart__swatch chart__swatch--in' }), 'รับเข้า'),
        el('span', null, el('span', { class: 'chart__swatch chart__swatch--out' }), 'เบิกออก')
      )
    ),
    el('div', { class: 'chart__plot' },
      days.map(d => el('div', { class: 'chart__day' },
        el('div', { class: 'chart__bars' },
          el('div', {
            class: 'chart__bar chart__bar--in',
            style: { height: height(d.inWeight) },
            title: `รับเข้า ${kg(d.inWeight)}`
          }),
          el('div', {
            class: 'chart__bar chart__bar--out',
            style: { height: height(d.outWeight) },
            title: `เบิกออก ${kg(d.outWeight)}`
          })
        ),
        el('span', { class: 'chart__label', text: shortDate(d.date).slice(0, 5) })
      ))
    )
  );
}

/** Expired and near-expiry lots first, then anything below its reorder point. */
function alertList(state) {
  const live = liveLots(state);
  const w = warnDays();

  const ageing = live
    .filter(l => ageLeftOf(l) <= w)
    .sort((a, b) => ageLeftOf(a) - ageLeftOf(b))
    .map(lot => {
      const days = ageLeftOf(lot);
      return {
        tone: statusOf(days).tone,
        title: `${lot.name} · ${lot.id}`,
        meta: `หมดอายุ ${shortDate(expiryOf(lot))} · คงเหลือ ${n(lot.qtyLeft)} หน่วย · ${baht(costOf(lot))}`,
        badge: days <= 0 ? 'หมดอายุแล้ว' : `อีก ${days} วัน`
      };
    });

  const reorder = lowStock(state).map(r => {
    const isCount = r.item.trackBy === 'count';
    const left = isCount ? `${n(r.qtyLeft)} ${r.item.unit}` : kg(r.weightLeft);
    const min = isCount ? `${n(r.item.minStock)} ${r.item.unit}` : `${n(r.item.minStock)} กก.`;
    return {
      tone: 'watch',
      title: `${r.item.name} · ต่ำกว่าจุดสั่งซื้อ`,
      meta: `คงเหลือ ${left} / ขั้นต่ำ ${min} · ${r.item.mainSupplier}`,
      badge: 'ควรสั่งซื้อ'
    };
  });

  const alerts = ageing.concat(reorder);

  return el('section', { class: 'card card--pad', style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    el('div', { class: 'row', style: { justifyContent: 'space-between' } },
      el('h2', { style: { margin: '0', fontSize: '14px', fontWeight: '600' }, text: 'ต้องจัดการวันนี้' }),
      el('span', { class: 'card__note card__note--mono', text: `${alerts.length} รายการ` })
    ),
    el('div', { class: 'alerts' },
      alerts.map(a => el('div', { class: ['alert', 'alert--' + a.tone] },
        el('div', { class: 'grow' },
          el('div', { class: 'alert__title', text: a.title }),
          el('div', { class: 'alert__meta', text: a.meta })
        ),
        el('span', { class: ['alert__badge', 'ink-' + a.tone], text: a.badge })
      )),
      when(!alerts.length, () => el('div', { class: 'card__note', text: 'ไม่มีรายการค้างในมุมมองนี้' }))
    )
  );
}

export function moveRow(state, m) {
  return tr(
    tdCode(`${shortDate(m.date)} ${m.time}`),
    td(badge(m.type, moveTone(m.type))),
    tdCode(m.id),
    td(m.name),
    tdNum(n(m.qty)),
    tdNum(n(m.weight, 1)),
    tdNum(baht(m.cost)),
    td(m.user)
  );
}

export function dashboardView() {
  const state = store.state;

  return el('div', { class: 'page__sections' },
    el('div', { class: 'grid-cards' }, kpiCards(state)),
    el('div', { class: 'grid-split' }, flowChart(state), alertList(state)),
    card({
      title: 'รายการเคลื่อนไหวล่าสุด',
      action: el('button', {
        class: 'btn btn--quiet', text: 'ดูรายงานทั้งหมด →',
        onClick: () => store.setView('moves')
      })
    }, table(MOVE_HEAD, sortedMoves(state).slice(0, 8).map(m => moveRow(state, m))))
  );
}
