/**
 * Production domain logic — recipes (BOM), capacity, daily yield and the
 * variance between what a recipe says should have been used and what the
 * store actually issued.
 */

import { config } from '../config.js';
import { availableKg, issuedOn, pricePerKg, scopedOutputs, scopedMoves } from './inventory.js';

/* -------------------------------------------------------------------------- */
/* Recipes                                                                     */
/* -------------------------------------------------------------------------- */

export function recipeFor(state, product) {
  return state.recipes.find(r => r.product === product) || null;
}

/**
 * Ingredient weight and standard cost for one unit of output.
 * Blank or zero lines are ignored so half-filled forms still preview.
 */
export function recipePlan(state, recipe) {
  const lines = (recipe.lines || []).filter(l => l.code && Number(l.qty) > 0);
  return {
    lines,
    kg:   lines.reduce((a, l) => a + Number(l.qty), 0),
    cost: lines.reduce((a, l) => a + Number(l.qty) * pricePerKg(state, l.code), 0)
  };
}

/** Standard yield (%) — net output weight over ingredient weight. */
export function standardYield(recipe, plan) {
  return plan.kg ? (Number(recipe.net) / plan.kg) * 100 : 0;
}

/**
 * How many units the recipe can still produce.
 *
 * Bounded by whichever runs out first: the scarcest ingredient in stock, or
 * the line's stated daily capacity.
 */
export function capacityOf(state, recipe) {
  const plan = recipePlan(state, recipe);
  if (!plan.lines.length) {
    return { stockUnits: 0, capPerDay: Number(recipe.capPerDay) || 0, units: 0, limit: '—', bound: 'วัตถุดิบ' };
  }

  let stockUnits = Infinity;
  let limit = '—';
  for (const line of plan.lines) {
    const available = availableKg(state, line.code);
    const units = Math.floor(available / Number(line.qty));
    if (units < stockUnits) {
      stockUnits = units;
      const item = state.items.find(i => i.code === line.code);
      limit = { name: item ? item.name : line.code, availableKg: available };
    }
  }
  if (stockUnits === Infinity) stockUnits = 0;

  const capPerDay = Number(recipe.capPerDay) || 0;
  const capped = capPerDay && capPerDay < stockUnits;
  return {
    stockUnits,
    capPerDay,
    units: capPerDay ? Math.min(stockUnits, capPerDay) : stockUnits,
    limit,
    bound: capped ? 'กำลังผลิต' : 'วัตถุดิบ'
  };
}

/* -------------------------------------------------------------------------- */
/* Yield                                                                       */
/* -------------------------------------------------------------------------- */

export function yieldTarget() {
  return Number(config.yieldTarget ?? 88);
}

/** Grade a yield percentage against the configured target. */
export function yieldStatus(pct) {
  const target = yieldTarget();
  if (!pct)          return { tone: 'watch',  label: 'ไม่มีข้อมูล' };
  if (pct > 100)     return { tone: 'danger', label: 'ข้อมูลไม่สมเหตุสมผล' };
  if (pct >= target) return { tone: 'ok',     label: 'ถึงเป้า' };
  if (pct >= target - 8) return { tone: 'warn', label: 'ต่ำกว่าเป้า' };
  return { tone: 'danger', label: 'ต้องตรวจสอบ' };
}

/**
 * One row per production date: what came out, what was issued against it, and
 * the resulting yield. Dates with issues but no recorded output still appear,
 * because that gap is exactly what the page is for.
 */
export function dailyProduction(state) {
  const outputs = scopedOutputs(state);
  const issueDates = scopedMoves(state).filter(m => m.type === 'เบิกออก').map(m => m.date);
  const dates = Array.from(new Set(outputs.map(o => o.date).concat(issueDates))).sort().reverse();

  return dates.map(date => {
    const onDay = outputs.filter(o => o.date === date);
    const issued = issuedOn(state, date);
    const outputWeight = onDay.reduce((a, o) => a + o.weight, 0);

    return {
      date,
      outputs: onDay,
      issued,
      outputWeight,
      qty:    onDay.reduce((a, o) => a + o.qty, 0),
      reject: onDay.reduce((a, o) => a + o.reject, 0),
      pct:    issued.weight ? (outputWeight / issued.weight) * 100 : 0,
      /** What the recipes say the day's output should have consumed. */
      planKg: onDay.reduce((a, o) => {
        const recipe = recipeFor(state, o.product);
        return a + (recipe ? o.qty * recipePlan(state, recipe).kg : 0);
      }, 0)
    };
  });
}

/**
 * Recipe-versus-reality, per menu item.
 *
 * Issues are booked per day, not per menu, so a day's issued weight is split
 * across that day's products in proportion to their recipe demand. That makes
 * `actualKg`, `gapKg` and `achieved` estimates — the UI says so.
 */
export function productVariance(state, daily) {
  const outputs = scopedOutputs(state);
  const products = Array.from(new Set(outputs.map(o => o.product)));

  return products.map(product => {
    const rows = outputs.filter(o => o.product === product);
    const recipe = recipeFor(state, product);
    const plan = recipe ? recipePlan(state, recipe) : null;

    const qty       = rows.reduce((a, o) => a + o.qty, 0);
    const actualOut = rows.reduce((a, o) => a + o.weight, 0);
    const planKg    = plan ? rows.reduce((a, o) => a + o.qty * plan.kg, 0) : 0;
    const expectKg  = plan ? rows.reduce((a, o) => a + o.qty * Number(recipe.net), 0) : 0;

    const actualKg = rows.reduce((a, o) => {
      const day = daily.find(d => d.date === o.date);
      if (!day || !day.planKg || !plan) return a;
      return a + day.issued.weight * ((o.qty * plan.kg) / day.planKg);
    }, 0);

    const costPerKg = plan && plan.kg ? plan.cost / plan.kg : 0;
    const gapKg = actualKg - planKg;

    return {
      product, rows, recipe, plan,
      qty,
      unit: rows[0].unit,
      actualOut, planKg, expectKg, actualKg, gapKg,
      gapCost:   gapKg * costPerKg,
      achieved:  actualKg ? (actualOut / actualKg) * 100 : 0,
      stdYield:  plan ? standardYield(recipe, plan) : 0
    };
  }).sort((a, b) => b.gapCost - a.gapCost);
}

/** Grade one variance row. */
export function varianceStatus(v) {
  if (!v.plan)          return { tone: 'watch',  label: 'ยังไม่มีสูตร' };
  if (v.achieved > 100) return { tone: 'watch',  label: 'ประมาณการ · ควรผูกเมนูตอนเบิก' };
  if (v.gapKg < -0.05)  return { tone: 'ok',     label: 'ใช้น้อยกว่าสูตร' };
  if (v.achieved >= v.stdYield)     return { tone: 'ok',   label: 'ตามสูตร' };
  if (v.achieved >= v.stdYield - 6) return { tone: 'warn', label: 'ต่ำกว่าสูตร' };
  return { tone: 'danger', label: 'สูญเสียสูง' };
}
