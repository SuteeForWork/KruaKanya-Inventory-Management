/**
 * Inventory domain logic.
 *
 * Every function here is pure: it takes the ledger (lots / moves / outputs)
 * and returns derived figures. Nothing formats for display.
 */

import { addDays, diffDays } from './format.js';
import { config, today } from '../config.js';

export const ALL_BRANCHES = 'ALL';

/* -------------------------------------------------------------------------- */
/* Shelf life                                                                  */
/* -------------------------------------------------------------------------- */

/** The date a lot expires. */
export function expiryOf(lot) {
  return addDays(lot.mfgDate, lot.shelfLife);
}

/** Days of shelf life left today; zero or negative means expired. */
export function ageLeftOf(lot) {
  return diffDays(today(), expiryOf(lot));
}

/** Days the lot has already sat in the store. */
export function ageInStoreOf(lot) {
  return diffDays(lot.recvDate, today());
}

export function warnDays() {
  return Number(config.fefoWarnDays ?? 3);
}

/**
 * Freshness status for a number of days remaining.
 * `tone` drives the CSS class; `label` is what the user reads.
 */
export function statusOf(daysLeft) {
  const w = warnDays();
  if (daysLeft <= 0)     return { tone: 'danger', label: 'หมดอายุ' };
  if (daysLeft <= w)     return { tone: 'warn',   label: 'ใกล้หมดอายุ' };
  if (daysLeft <= w * 3) return { tone: 'watch',  label: 'เฝ้าระวัง' };
  return { tone: 'ok', label: 'ปกติ' };
}

/* -------------------------------------------------------------------------- */
/* Branch scoping                                                              */
/* -------------------------------------------------------------------------- */

export function inBranch(row, branch) {
  return branch === ALL_BRANCHES || (row.branch || 'BR-01') === branch;
}

export function scopedLots(state)    { return state.lots.filter(l => inBranch(l, state.branch)); }
export function scopedMoves(state)   { return state.moves.filter(m => inBranch(m, state.branch)); }
export function scopedOutputs(state) { return state.outputs.filter(o => inBranch(o, state.branch)); }

export function branchName(branches, id) {
  const b = branches.find(x => x.id === id);
  if (b) return b.name;
  return id === ALL_BRANCHES ? 'ทุกสาขา' : (id || '—');
}

/* -------------------------------------------------------------------------- */
/* Stock                                                                       */
/* -------------------------------------------------------------------------- */

/** Value still sitting in a lot, at the price it was received for. */
export function costOf(lot) {
  return lot.qtyLeft * lot.pricePerUnit;
}

export function weightOf(lot) {
  return lot.qtyLeft * lot.weightPerUnit;
}

/** Lots with stock left in the active branch, ordered first-expired-first-out. */
export function liveLots(state) {
  return state.lots
    .filter(l => l.qtyLeft > 0 && inBranch(l, state.branch))
    .slice()
    .sort((a, b) => (expiryOf(a) < expiryOf(b) ? -1 : 1));
}

/** Usable kilograms of an item — expired lots do not count. */
export function availableKg(state, code) {
  return liveLots(state)
    .filter(l => l.code === code && ageLeftOf(l) > 0)
    .reduce((sum, l) => sum + weightOf(l), 0);
}

/**
 * FEFO allocation: walk the live lots oldest-expiry-first and take from each
 * until the requested quantity is covered. `shortBy` is what stock cannot cover.
 */
export function allocate(state, code, qty) {
  let need = Number(qty) || 0;
  const rows = [];
  for (const lot of liveLots(state)) {
    if (need <= 0) break;
    if (lot.code !== code) continue;
    const take = Math.min(need, lot.qtyLeft);
    need -= take;
    rows.push({ lot, take });
  }
  return { rows, shortBy: need };
}

/** Per-item roll-up of the live lots, plus the ages that drive the badges. */
export function stockByItem(state) {
  const live = liveLots(state);
  return state.items.map(item => {
    const lots = live.filter(l => l.code === item.code);
    const ages = lots.map(ageLeftOf);
    return {
      item,
      lots,
      qtyLeft: lots.reduce((a, l) => a + l.qtyLeft, 0),
      weightLeft: lots.reduce((a, l) => a + weightOf(l), 0),
      cost: lots.reduce((a, l) => a + costOf(l), 0),
      soonestExpiry: ages.length ? Math.min(...ages) : null,
      oldestInStore: lots.length ? Math.max(...lots.map(ageInStoreOf)) : null
    };
  });
}

/** Items whose remaining weight is under their reorder point. */
export function lowStock(state) {
  return stockByItem(state).filter(r => r.weightLeft < r.item.minStock);
}

/** Latest known price per kilogram for an item, across all branches. */
export function pricePerKg(state, code) {
  const lots = state.lots.filter(l => l.code === code);
  if (!lots.length) return 0;
  const last = lots[lots.length - 1];
  return last.pricePerUnit / last.weightPerUnit;
}

/* -------------------------------------------------------------------------- */
/* Movements                                                                   */
/* -------------------------------------------------------------------------- */

/** Newest first. */
export function sortedMoves(state) {
  return scopedMoves(state)
    .slice()
    .sort((a, b) => (b.date + b.time > a.date + a.time ? 1 : -1));
}

/** What was issued and wasted on a given date, in the active branch. */
export function issuedOn(state, date) {
  const scoped = state.moves.filter(m => m.date === date && inBranch(m, state.branch));
  const issues = scoped.filter(m => m.type === 'เบิกออก');
  const waste  = scoped.filter(m => m.type === 'ตัดทิ้ง');
  return {
    weight:      issues.reduce((a, m) => a + m.weight, 0),
    cost:        issues.reduce((a, m) => a + m.cost, 0),
    wasteWeight: waste.reduce((a, m) => a + m.weight, 0),
    wasteCost:   waste.reduce((a, m) => a + m.cost, 0)
  };
}

/** Seven-day in/out weights ending today, for the dashboard chart. */
export function weeklyFlow(state) {
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(addDays(today(), -i));

  const moves = scopedMoves(state);
  const totals = days.map(date => {
    const onDay = moves.filter(m => m.date === date);
    return {
      date,
      inWeight:  onDay.filter(m => m.type === 'รับเข้า').reduce((a, m) => a + m.weight, 0),
      outWeight: onDay.filter(m => m.type !== 'รับเข้า').reduce((a, m) => a + m.weight, 0)
    };
  });

  const peak = Math.max(1, ...totals.map(t => Math.max(t.inWeight, t.outWeight)));
  return totals.map(t => ({ ...t, peak }));
}

/* -------------------------------------------------------------------------- */
/* Branches                                                                    */
/* -------------------------------------------------------------------------- */

/** Per-branch scorecard: stock, ageing, waste and yield side by side. */
export function branchSummary(state) {
  return state.branches.map(branch => {
    const lots    = state.lots.filter(l => (l.branch || 'BR-01') === branch.id && l.qtyLeft > 0);
    const moves   = state.moves.filter(m => (m.branch || 'BR-01') === branch.id);
    const outputs = state.outputs.filter(o => (o.branch || 'BR-01') === branch.id);

    const issuedWeight = moves.filter(m => m.type === 'เบิกออก').reduce((a, m) => a + m.weight, 0);
    const outputWeight = outputs.reduce((a, o) => a + o.weight, 0);

    return {
      branch,
      lotCount:  lots.length,
      cost:      lots.reduce((a, l) => a + costOf(l), 0),
      weight:    lots.reduce((a, l) => a + weightOf(l), 0),
      nearCount: lots.filter(l => ageLeftOf(l) <= warnDays()).length,
      wasteCost: moves.filter(m => m.type === 'ตัดทิ้ง').reduce((a, m) => a + m.cost, 0),
      yieldPct:  issuedWeight ? (outputWeight / issuedWeight) * 100 : 0
    };
  });
}
