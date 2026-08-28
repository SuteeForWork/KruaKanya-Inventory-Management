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
  businessDate: '2026-08-26',

  /**
   * Supabase project. The publishable/anon key is meant to be embedded in
   * client-side code — Row Level Security in db/schema.sql is what actually
   * protects the data, not secrecy of this key. Never put the service_role
   * (secret) key here; that one grants full access and must never reach the
   * browser.
   *
   * Set supabaseUrl to null to run against the in-memory seed instead (no
   * persistence) — useful for trying the app with no backend at all.
   */
  supabaseUrl: 'https://dxiqhaihssdrmwuowodm.supabase.co',
  supabaseAnonKey: 'sb_publishable_fqGpBrpSukKe9IGEj7EI4Q_ghX-v4mz'
};

/** Today, as YYYY-MM-DD. */
export function today() {
  return config.businessDate || new Date().toISOString().slice(0, 10);
}
