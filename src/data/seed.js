/**
 * Seed data — the opening balances the system starts from.
 *
 * Everything downstream (stock, costs, ages, yield, variance) is derived from
 * `lots`, `moves`, `outputs` and `recipes`; nothing here is a display value.
 */

export const ITEMS = [
  { code: 'ING-VEG-004', name: 'ผักกาดหอมสด',           category: 'ผักสด',       unit: 'ลัง',     weightPerUnit: 3,    shelfLife: 7,   minStock: 24, storage: 'แช่เย็น 2–4°C',  mainSupplier: 'ส.เจริญผักสด' },
  { code: 'ING-VEG-018', name: 'มะเขือเทศราชินี',        category: 'ผักสด',       unit: 'ตะกร้า',  weightPerUnit: 4,    shelfLife: 10,  minStock: 20, storage: 'แช่เย็น 6–8°C',  mainSupplier: 'ส.เจริญผักสด' },
  { code: 'ING-MEA-011', name: 'อกไก่สดไม่มีหนัง',       category: 'เนื้อสัตว์',   unit: 'แพ็ค',    weightPerUnit: 1,    shelfLife: 5,   minStock: 40, storage: 'แช่เย็น 0–2°C',  mainSupplier: 'ไทยฟาร์มโปรตีน' },
  { code: 'ING-MEA-021', name: 'หมูสามชั้นชิ้น',         category: 'เนื้อสัตว์',   unit: 'ถาด',     weightPerUnit: 2,    shelfLife: 6,   minStock: 30, storage: 'แช่เย็น 0–2°C',  mainSupplier: 'ไทยฟาร์มโปรตีน' },
  { code: 'ING-SEA-007', name: 'กุ้งขาวแช่แข็ง 31/40',   category: 'อาหารทะเล',   unit: 'กล่อง',   weightPerUnit: 1.5,  shelfLife: 120, minStock: 30, storage: 'แช่แข็ง −18°C',  mainSupplier: 'อันดามันซีฟู้ด' },
  { code: 'ING-DAI-005', name: 'วิปปิ้งครีมสด 1L',       category: 'นม/ไข่',      unit: 'ลัง',     weightPerUnit: 12,   shelfLife: 45,  minStock: 36, storage: 'แช่เย็น 2–6°C',  mainSupplier: 'เดลี่แลนด์ ดิสทริบิวชั่น' },
  { code: 'ING-DRY-002', name: 'แป้งสาลีอเนกประสงค์',    category: 'ของแห้ง',     unit: 'ถุง',     weightPerUnit: 22.5, shelfLife: 365, minStock: 90, storage: 'แห้ง 25°C',      mainSupplier: 'สยามดรายกู๊ดส์' },
  { code: 'ING-SAU-009', name: 'ซอสหอยนางรมเข้มข้น',    category: 'เครื่องปรุง',  unit: 'ลัง',     weightPerUnit: 9.6,  shelfLife: 540, minStock: 24, storage: 'แห้ง 25°C',      mainSupplier: 'สยามดรายกู๊ดส์' }
];

export const SUPPLIERS = [
  { id: 'SUP-001', name: 'ส.เจริญผักสด',              category: 'ผักและผลไม้',          contact: 'คุณสมชาย เจริญผล',  phone: '081-234-5678', terms: 'เครดิต 15 วัน', cert: 'GAP',          score: 92 },
  { id: 'SUP-002', name: 'ไทยฟาร์มโปรตีน',            category: 'เนื้อสัตว์',            contact: 'คุณพิมพ์ชนก ว.',    phone: '02-551-8890',  terms: 'เครดิต 30 วัน', cert: 'GMP/HACCP',    score: 96 },
  { id: 'SUP-003', name: 'อันดามันซีฟู้ด',             category: 'อาหารทะเลแช่แข็ง',      contact: 'คุณธีรพงษ์ ก.',     phone: '076-334-221',  terms: 'เงินสด',        cert: 'HACCP/BRC',    score: 88 },
  { id: 'SUP-004', name: 'เดลี่แลนด์ ดิสทริบิวชั่น',    category: 'นม เนย ไข่',            contact: 'คุณอรวรรณ ป.',      phone: '02-118-4477',  terms: 'เครดิต 30 วัน', cert: 'GMP',          score: 84 },
  { id: 'SUP-005', name: 'สยามดรายกู๊ดส์',            category: 'ของแห้งและเครื่องปรุง',  contact: 'คุณวรุตม์ ส.',      phone: '02-909-1120',  terms: 'เครดิต 45 วัน', cert: 'GMP/ฮาลาล',    score: 90 }
];

export const BRANCHES = [
  { id: 'BR-01', name: 'ครัวกลาง บางนา',  type: 'โรงผลิต',        manager: 'ณัฐพล ส.',    phone: '02-745-1120' },
  { id: 'BR-02', name: 'สาขาสยาม',        type: 'สาขาหน้าร้าน',   manager: 'กมลชนก ท.',   phone: '02-658-3341' },
  { id: 'BR-03', name: 'สาขาอโศก',        type: 'สาขาหน้าร้าน',   manager: 'ธีรภัทร อ.',  phone: '02-261-7788' },
  { id: 'BR-04', name: 'สาขาเชียงใหม่',   type: 'สาขาหน้าร้าน',   manager: 'อรุณี พ.',    phone: '053-217-440' }
];

export const RECIPES = [
  { id: 'BOM-001', product: 'ขนมปังโฮลวีต',          unit: 'ก้อน',   net: 0.2475, capPerDay: 400, lines: [{ code: 'ING-DRY-002', qty: 0.26 }] },
  { id: 'BOM-002', product: 'ข้าวกล่องผัดกะเพรา',     unit: 'กล่อง',  net: 0.085,  capPerDay: 600, lines: [{ code: 'ING-MEA-011', qty: 0.06 }, { code: 'ING-SAU-009', qty: 0.03 }] },
  { id: 'BOM-003', product: 'สลัดกุ้งซีซาร์',         unit: 'กล่อง',  net: 0.131,  capPerDay: 300, lines: [{ code: 'ING-SEA-007', qty: 0.05 }, { code: 'ING-VEG-004', qty: 0.09 }] },
  { id: 'BOM-004', product: 'ข้าวกล่องไก่ย่าง',       unit: 'กล่อง',  net: 0.082,  capPerDay: 600, lines: [{ code: 'ING-MEA-011', qty: 0.07 }, { code: 'ING-VEG-004', qty: 0.02 }] },
  { id: 'BOM-005', product: 'เค้กวิปครีมสด',          unit: 'ปอนด์',  net: 0.33,   capPerDay: 120, lines: [{ code: 'ING-DAI-005', qty: 0.28 }, { code: 'ING-DRY-002', qty: 0.09 }] },
  { id: 'BOM-006', product: 'ข้าวกล่องหมูสามชั้น',    unit: 'กล่อง',  net: 0.058,  capPerDay: 500, lines: [{ code: 'ING-MEA-021', qty: 0.058 }, { code: 'ING-VEG-018', qty: 0.015 }] },
  { id: 'BOM-007', product: 'สลัดผักรวมมะเขือเทศ',    unit: 'กล่อง',  net: 0.094,  capPerDay: 350, lines: [{ code: 'ING-VEG-004', qty: 0.06 }, { code: 'ING-VEG-018', qty: 0.048 }] }
];

/** Raw lot rows: [id, itemCode, branch, supplier, buyer, recvDate, recvTime, mfgDate, qtyIn, qtyLeft, pricePerUnit, ref] */
const LOT_ROWS = [
  ['LOT-260819-01', 'ING-DRY-002', 'BR-01', 'สยามดรายกู๊ดส์',             'ณัฐพล ส.',   '2026-08-19', '09:05', '2026-06-02', 12, 7,  610,  'PO-2608-014'],
  ['LOT-260820-02', 'ING-SAU-009', 'BR-01', 'สยามดรายกู๊ดส์',             'ณัฐพล ส.',   '2026-08-20', '09:20', '2026-03-11', 8,  5,  1180, 'PO-2608-014'],
  ['LOT-260821-01', 'ING-SEA-007', 'BR-02', 'อันดามันซีฟู้ด',              'กมลชนก ท.',  '2026-08-21', '06:40', '2026-07-28', 24, 18, 495,  'PO-2608-021'],
  ['LOT-260822-01', 'ING-VEG-004', 'BR-01', 'ส.เจริญผักสด',               'กมลชนก ท.',  '2026-08-22', '06:15', '2026-08-21', 14, 4,  168,  'PO-2608-025'],
  ['LOT-260823-01', 'ING-MEA-011', 'BR-01', 'ไทยฟาร์มโปรตีน',             'ณัฐพล ส.',   '2026-08-23', '07:10', '2026-08-22', 40, 12, 158,  'PO-2608-026'],
  ['LOT-260823-02', 'ING-DAI-005', 'BR-03', 'เดลี่แลนด์ ดิสทริบิวชั่น',    'อรุณี พ.',   '2026-08-23', '10:35', '2026-08-14', 6,  4,  1560, 'PO-2608-027'],
  ['LOT-260824-01', 'ING-VEG-018', 'BR-02', 'ส.เจริญผักสด',               'กมลชนก ท.',  '2026-08-24', '06:25', '2026-08-23', 10, 6,  320,  'PO-2608-031'],
  ['LOT-260824-02', 'ING-MEA-021', 'BR-01', 'ไทยฟาร์มโปรตีน',             'ณัฐพล ส.',   '2026-08-24', '07:30', '2026-08-23', 18, 11, 296,  'PO-2608-031'],
  ['LOT-260825-01', 'ING-VEG-004', 'BR-01', 'ส.เจริญผักสด',               'กมลชนก ท.',  '2026-08-25', '06:10', '2026-08-24', 16, 16, 174,  'PO-2608-034'],
  ['LOT-260825-02', 'ING-MEA-011', 'BR-01', 'ไทยฟาร์มโปรตีน',             'ณัฐพล ส.',   '2026-08-25', '07:05', '2026-08-24', 36, 34, 162,  'PO-2608-034'],
  ['LOT-260826-01', 'ING-SEA-007', 'BR-02', 'อันดามันซีฟู้ด',              'ธีรภัทร อ.', '2026-08-26', '06:50', '2026-08-10', 20, 20, 502,  'PO-2608-038'],
  ['LOT-260826-02', 'ING-DAI-005', 'BR-03', 'เดลี่แลนด์ ดิสทริบิวชั่น',    'อรุณี พ.',   '2026-08-26', '08:15', '2026-08-20', 8,  8,  1585, 'PO-2608-038']
];

/** Raw issue rows: [docId, lotId, date, time, qty, user, purpose, note] */
const ISSUE_ROWS = [
  ['IS-2608-101', 'LOT-260819-01', '2026-08-21', '05:40', 3,  'ณิชา บ.',      'เบิกผลิต',        'ครัวเบเกอรี่'],
  ['IS-2608-104', 'LOT-260820-02', '2026-08-22', '05:55', 3,  'เชฟกวิน ร.',   'เบิกผลิต',        'ครัวร้อน'],
  ['IS-2608-108', 'LOT-260821-01', '2026-08-23', '05:30', 6,  'เชฟกวิน ร.',   'เบิกผลิต',        'ครัวร้อน'],
  ['IS-2608-111', 'LOT-260822-01', '2026-08-23', '05:35', 6,  'ปิยะ ม.',      'เบิกผลิต',        'ครัวสลัด'],
  ['IS-2608-115', 'LOT-260823-01', '2026-08-24', '05:20', 16, 'เชฟกวิน ร.',   'เบิกผลิต',        'ครัวร้อน'],
  ['IS-2608-118', 'LOT-260822-01', '2026-08-25', '05:25', 3,  'ปิยะ ม.',      'ตัดทิ้ง/ของเสีย',  'ใบเหลือง เกินอายุ'],
  ['IS-2608-121', 'LOT-260823-01', '2026-08-25', '05:30', 12, 'เชฟกวิน ร.',   'เบิกผลิต',        'ครัวร้อน'],
  ['IS-2608-124', 'LOT-260823-02', '2026-08-25', '09:10', 2,  'ณิชา บ.',      'เบิกผลิต',        'ครัวเบเกอรี่'],
  ['IS-2608-127', 'LOT-260824-01', '2026-08-26', '05:20', 4,  'ปิยะ ม.',      'เบิกผลิต',        'ครัวสลัด'],
  ['IS-2608-130', 'LOT-260824-02', '2026-08-26', '05:35', 7,  'เชฟกวิน ร.',   'เบิกผลิต',        'ครัวร้อน'],
  ['IS-2608-133', 'LOT-260825-02', '2026-08-26', '05:45', 2,  'เชฟกวิน ร.',   'เบิกผลิต',        'ครัวร้อน'],
  ['IS-2608-136', 'LOT-260819-01', '2026-08-26', '06:05', 2,  'ณิชา บ.',      'เบิกผลิต',        'ครัวเบเกอรี่']
];

/** Raw output rows: [date, shift, product, qty, unit, weight, reject, staff, branch?] */
const OUTPUT_ROWS = [
  ['2026-08-21', 'กะเช้า 05:00–13:00',  'ขนมปังโฮลวีต',          240, 'ก้อน',   59.4, 2.1, 'ณิชา บ.'],
  ['2026-08-22', 'กะเช้า 05:00–13:00',  'ข้าวกล่องผัดกะเพรา',     300, 'กล่อง',  25.8, 1.2, 'เชฟกวิน ร.'],
  ['2026-08-23', 'กะเช้า 05:00–13:00',  'สลัดกุ้งซีซาร์',         180, 'กล่อง',  23.6, 1.6, 'ปิยะ ม.',    'BR-03'],
  ['2026-08-24', 'กะเช้า 05:00–13:00',  'ข้าวกล่องไก่ย่าง',       210, 'กล่อง',  14.2, 0.9, 'เชฟกวิน ร.'],
  ['2026-08-25', 'กะเช้า 05:00–13:00',  'ข้าวกล่องไก่ย่าง',       190, 'กล่อง',  11.4, 0.8, 'เชฟกวิน ร.'],
  ['2026-08-25', 'กะบ่าย 13:00–21:00',  'เค้กวิปครีมสด',          64,  'ปอนด์',  21.1, 1.4, 'ณิชา บ.'],
  ['2026-08-26', 'กะเช้า 05:00–13:00',  'ข้าวกล่องหมูสามชั้น',    240, 'กล่อง',  13.9, 1.7, 'เชฟกวิน ร.'],
  ['2026-08-26', 'กะเช้า 05:00–13:00',  'สลัดผักรวมมะเขือเทศ',    150, 'กล่อง',  14.1, 1.1, 'ปิยะ ม.',    'BR-02'],
  ['2026-08-26', 'กะบ่าย 13:00–21:00',  'ขนมปังโฮลวีต',          160, 'ก้อน',   40.2, 2.4, 'ณิชา บ.']
];

function buildLots() {
  return LOT_ROWS.map(([id, code, branch, supplier, buyer, recvDate, recvTime, mfgDate, qtyIn, qtyLeft, pricePerUnit, ref]) => {
    const item = ITEMS.find(i => i.code === code);
    return {
      id, branch, code, name: item.name, unit: item.unit,
      weightPerUnit: item.weightPerUnit, shelfLife: item.shelfLife,
      supplier, buyer, recvDate, recvTime, mfgDate,
      qtyIn, qtyLeft, pricePerUnit, ref
    };
  });
}

function buildMoves(lots) {
  const receipts = lots.map(l => ({
    branch: l.branch, id: 'RC-' + l.id.slice(4), type: 'รับเข้า', lotId: l.id,
    code: l.code, name: l.name, date: l.recvDate, time: l.recvTime,
    qty: l.qtyIn, weight: l.qtyIn * l.weightPerUnit, cost: l.qtyIn * l.pricePerUnit,
    user: l.buyer, purpose: 'รับเข้าคลัง', note: l.supplier + ' · ' + l.ref
  }));

  const issues = ISSUE_ROWS.map(([id, lotId, date, time, qty, user, purpose, note]) => {
    const l = lots.find(x => x.id === lotId);
    return {
      branch: l.branch, id, type: purpose === 'ตัดทิ้ง/ของเสีย' ? 'ตัดทิ้ง' : 'เบิกออก',
      lotId, code: l.code, name: l.name, date, time, qty,
      weight: qty * l.weightPerUnit, cost: qty * l.pricePerUnit,
      user, purpose, note
    };
  });

  return receipts.concat(issues);
}

function buildOutputs() {
  return OUTPUT_ROWS.map(([date, shift, product, qty, unit, weight, reject, staff, branch]) => ({
    branch: branch || 'BR-01',
    id: 'PD-' + date.slice(2).replace(/-/g, '') + '-' + product.slice(0, 2),
    date, shift, product, qty, unit, weight, reject, staff
  }));
}

/** A complete, independent copy of the opening data set. */
export function seed() {
  const lots = buildLots();
  return {
    items: ITEMS.map(i => ({ ...i })),
    suppliers: SUPPLIERS.map(s => ({ ...s })),
    branches: BRANCHES.map(b => ({ ...b })),
    recipes: RECIPES.map(r => ({ ...r, lines: r.lines.map(l => ({ ...l })) })),
    lots,
    moves: buildMoves(lots),
    outputs: buildOutputs()
  };
}
