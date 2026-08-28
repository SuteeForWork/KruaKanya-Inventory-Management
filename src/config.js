/**
 * Application configuration.
 *
 * These were the tunable props on the design canvas (companyName, fefoWarnDays,
 * yieldTarget, density) and keep the same defaults here.
 */
export const config = {
  companyName: 'ครัวกลาง สยามคิทเช่น',

  /** A lot is flagged "ใกล้หมดอายุ" when this many days or fewer remain. */
  fefoWarnDays: 3,

  /** Target yield (%) used to grade daily production. */
  yieldTarget: 88,

  /** Table density: 'compact' | 'medium' | 'roomy'. */
  density: 'compact',

  /**
   * Business date the whole app reckons from.
   *
   * The seeded ledger is anchored to 2026-08-26, so ages, expiries and the
   * "today" figures are computed against that date rather than the wall clock.
   * Set to null to use the real current date once real data is flowing in.
   */
  businessDate: '2026-08-26'
};

/** Today, as YYYY-MM-DD. */
export function today() {
  return config.businessDate || new Date().toISOString().slice(0, 10);
}
