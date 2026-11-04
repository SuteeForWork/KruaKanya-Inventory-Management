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
/* Item kinds                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What an item is for. Materials (ingredients and packaging) go into recipes
 * and production cost. Office and kitchen supplies (A4 paper, tissue, kitchen
 * gloves, hair nets) are stocked, received and issued the same way, but they
 * never expire unless given a shelf life, are counted rather than weighed,
 * stay out of BOM recipes, and stay out of production cost and yield.
 */
export const ITEM_KINDS = [
  { value: 'material', label: 'วัตถุดิบ / บรรจุภัณฑ์' },
  { value: 'office',   label: 'ของใช้สิ้นเปลือง · สำนักงาน' },
  { value: 'kitchen',  label: 'ของใช้สิ้นเปลือง · ครัว' }
];

export const isSupplyItem = item => Boolean(item && (item.kind === 'office' || item.kind === 'kitchen'));

export function isSupply(state, code) {
  return isSupplyItem(state.items.find(i => i.code === code));
}

export function kindLabel(kind) {
  return (ITEM_KINDS.find(k => k.value === kind) || ITEM_KINDS[0]).label;
}

/* -------------------------------------------------------------------------- */
/* Shelf life                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The date a lot expires — null when it doesn't: a shelf life of 0 means "no
 * expiry", which is what an office or kitchen supply (A4 paper, tissue) has.
 */
export function expiryOf(lot) {
  return lot.shelfLife > 0 ? addDays(lot.mfgDate, lot.shelfLife) : null;
}

/** Days of shelf life left today; zero or negative means expired, Infinity means it never expires. */
export function ageLeftOf(lot) {
  const expiry = expiryOf(lot);
  return expiry ? diffDays(today(), expiry) : Infinity;
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
    // A lot that never expires goes after every lot that does.
    .sort((a, b) => ((expiryOf(a) || '9999-12-31') < (expiryOf(b) || '9999-12-31') ? -1 : 1));
}

/** Usable kilograms of an item — expired lots do not count. */
export function availableKg(state, code) {
  return liveLots(state)
    .filter(l => l.code === code && ageLeftOf(l) > 0)
    .reduce((sum, l) => sum + weightOf(l), 0);
}

/** Usable pieces of a count-tracked item — expired lots do not count. */
export function availableQty(state, code) {
  return liveLots(state)
    .filter(l => l.code === code && ageLeftOf(l) > 0)
    .reduce((sum, l) => sum + l.qtyLeft, 0);
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

/** Float noise from dividing a weight into fractions of a unit isn't worth keeping — 6 places is far below a gram. */
export const roundUnits = x => Math.round(x * 1e6) / 1e6;

/**
 * What one unit of a lot weighs, kg. A lot carries its own snapshot; a
 * counted item whose lots carry none (weight 0) falls back to the weight per
 * unit set on the item, which is what lets stock counted in bags be issued
 * by weight. 0 means it can't be weighed at all.
 */
export function unitWeightOf(state, lot) {
  if (lot.weightPerUnit > 0) return lot.weightPerUnit;
  const item = state.items.find(i => i.code === lot.code);
  return item && item.weightPerUnit > 0 ? item.weightPerUnit : 0;
}

/**
 * FEFO allocation by weight: draw `kg` from the live lots oldest-expiry-first.
 * Each lot is converted through its own unit weight, so the units taken can
 * be a fraction (5 kg from a 15 kg bag takes a third of it). Rows have the
 * same shape allocate() returns plus `takeKg`; `shortBy` is the kg left over.
 */
export function allocateByWeight(state, code, kg) {
  let need = Number(kg) || 0;
  const rows = [];
  for (const lot of liveLots(state)) {
    if (need <= 1e-9) break;
    if (lot.code !== code) continue;
    const w = unitWeightOf(state, lot);
    if (!(w > 0)) continue;
    const availKg = lot.qtyLeft * w;
    const takeKg = Math.min(need, availKg);
    const take = takeKg >= availKg ? lot.qtyLeft : Math.min(lot.qtyLeft, roundUnits(takeKg / w));
    need -= takeKg;
    // A whole lot is exactly its units; a partial draw is exactly the kg asked for
    // — not take * w, which carries the rounding of take — and costs the same way.
    const whole = takeKg >= availKg;
    rows.push({
      lot, take,
      takeKg: whole ? take * w : takeKg,
      cost: roundUnits((whole ? take : takeKg / w) * lot.pricePerUnit)
    });
  }
  return { rows, shortBy: need > 1e-9 ? need : 0 };
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

/** Items below their reorder point — weight (kg) for a normal item, piece
 *  count for one tracked by count (minStock means pieces there, not kg). */
export function lowStock(state) {
  return stockByItem(state).filter(r =>
    (r.item.trackBy === 'count' ? r.qtyLeft : r.weightLeft) < r.item.minStock);
}

/** Latest known price per kilogram for an item, across all branches — null
 *  for a count-tracked item, where "per kg" is meaningless (weightPerUnit
 *  is 0), rather than dividing by zero. */
export function pricePerKg(state, code) {
  const lots = state.lots.filter(l => l.code === code);
  if (!lots.length) return null;
  const last = lots[lots.length - 1];
  return last.weightPerUnit ? last.pricePerUnit / last.weightPerUnit : null;
}

/** Latest known price per piece for an item, across all branches. */
export function pricePerPiece(state, code) {
  const lots = state.lots.filter(l => l.code === code);
  return lots.length ? lots[lots.length - 1].pricePerUnit : null;
}

/* -------------------------------------------------------------------------- */
/* Pack/case conversion — receiving convenience only; lots/moves always store */
/* qty in the item's base `unit`, regardless of what level it was entered at. */
/* -------------------------------------------------------------------------- */

/** Which counting levels an item supports, base unit first. */
export function unitLevels(item) {
  const levels = [{ value: 'base', label: item.unit, factor: 1 }];
  if (item.packUnit && item.packSize) {
    levels.push({ value: 'pack', label: item.packUnit, factor: Number(item.packSize) });
    if (item.caseUnit && item.caseSize) {
      levels.push({ value: 'case', label: item.caseUnit, factor: Number(item.packSize) * Number(item.caseSize) });
    }
  }
  return levels;
}

/** Converts a quantity entered at `level` (see unitLevels) to the item's base unit. */
export function baseQtyFor(item, qty, level) {
  const factor = unitLevels(item).find(l => l.value === level)?.factor || 1;
  return (Number(qty) || 0) * factor;
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
  // Office/kitchen supplies are not production inputs — issuing tissue or A4
  // paper must not land in a day's raw-material cost or waste.
  const scoped = state.moves.filter(m => m.date === date && inBranch(m, state.branch) && !isSupply(state, m.code));
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
