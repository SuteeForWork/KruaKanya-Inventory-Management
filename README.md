# ระบบจัดการวัตถุดิบอาหาร · Ingredient Inventory

Implementation of the `Ingredient Inventory` Claude Design canvas: a multi-branch
raw-material inventory system for a central kitchen — receiving, stock on hand,
FEFO issuing, daily production yield, recipe (BOM) variance, supplier and item
masters, a full movement ledger, branch comparison, and a role-permission matrix.

No build step and no dependencies. It is plain ES modules, so it needs to be
served over HTTP (ES modules do not load from `file://`).

```bash
python3 -m http.server 8123
```

Then open <http://localhost:8123>.

## Signing in

Demo accounts, all with password `1234`. The login screen lists them as
one-click chips.

| user | role | branch |
| --- | --- | --- |
| `admin` | ผู้ดูแลระบบ | ทุกสาขา |
| `purchase` | พนักงานจัดซื้อ | ทุกสาขา |
| `store` | พนักงานคลัง | BR-01 |
| `chef` | ครัว / ฝ่ายผลิต | BR-01 |
| `siam` | พนักงานคลัง | BR-02 |
| `qa` | QA / คุณภาพ | ทุกสาขา |
| `exec` | ผู้บริหาร | ทุกสาขา |

Signed in as `admin` you can switch the role preview from the top bar and edit
the permission matrix under **ตั้งค่าสิทธิ์ผู้ใช้**.

## Layout

```
index.html          shell
styles.css          design tokens + component classes
src/
  config.js         company name, FEFO warning window, yield target, density,
                    and the business date the ledger is reckoned from
  data/seed.js      opening balances (items, suppliers, branches, lots, moves,
                    outputs, recipes)
  core/
    format.js       number / currency / weight / date formatting
    access.js       roles, sections, accounts, permission matrix
    inventory.js    shelf life, branch scoping, FEFO allocation, stock roll-ups
    production.js   recipes, capacity, daily yield, recipe-vs-actual variance
    store.js        the only mutable state; all write operations live here
    export.js       CSV export per view + print-to-PDF
  ui/
    dom.js          minimal element builder
    components.js   cards, tables, badges, meters, form fields
    views/*.js      one module per page
  app.js            sidebar, top bar, routing, render loop
```

`src/core` is pure domain logic with no DOM access; `src/ui` never mutates state
directly, it only calls actions on the store.

### Rendering

State changes trigger a full rebuild of the tree. The data set is small enough
that this is instant, and it keeps every view a plain function of state. Inputs
carry a `data-bind` attribute so `app.js` can restore focus and caret position
after each rebuild — typing into a form feels normal despite the full redraw.

## Deploying

See [DEPLOY.md](DEPLOY.md) for the free-tier database (Supabase) and hosting
(Cloudflare Pages) setup.

## Things worth knowing

- **Business date.** The seeded ledger is anchored to 2026-08-26, so ages,
  expiries and "today" figures are computed against `config.businessDate`
  rather than the wall clock. Set it to `null` to switch to the real date once
  live data replaces the seed.
- **Authentication is client-side and for demonstration only.** Replacing
  `authenticate()` in `src/core/access.js` is the single point to wire this to a
  real identity provider; nothing else reads credentials.
- **State is in memory.** A reload resets everything to the seed. Persistence
  (a backend, or `localStorage`) was not part of the design and has not been
  added.
- **Yield variance is an estimate.** Issues are booked per day, not per menu, so
  a day's issued weight is split across that day's products in proportion to
  their recipe demand. The variance table says so in its subheading.

### Deviations from the design source

Two calculation bugs in the prototype were corrected rather than reproduced:

- Date arithmetic used `toISOString()`, which shifts a day backwards for any
  timezone ahead of UTC — every computed expiry date was one day early when
  viewed from Thailand. `src/core/format.js` formats dates in local time.
- The confirmation toast after recording production said "Yield รวมของวัน" but
  divided only the new record's weight by the day's issued weight. It now
  reports the day's total, matching both the wording and the daily table.
