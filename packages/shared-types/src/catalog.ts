/**
 * Object library. Every entry is an original, parametric design: the dimensions below are real
 * world sizes in meters (width along local x, depth along local y, height up), and the `shape`
 * names the generator that builds its 2D symbol and its 3D geometry out of real parts — a sofa has
 * a frame, seat cushions, back cushions and arms; a fridge has doors, a gap and handles. Nothing in
 * here is a textured cube or a link to a model someone else has to host.
 */
export type Shape =
  // seating
  | 'sofa' | 'sofa-l' | 'sofa-module' | 'armchair' | 'pouffe' | 'chair' | 'stool' | 'office-chair' | 'bench'
  // tables and surfaces
  | 'table' | 'table-round' | 'desk' | 'counter' | 'flat' | 'rug'
  // storage
  | 'cabinet' | 'wardrobe' | 'wardrobe-sliding' | 'dresser' | 'shelf' | 'kitchen-base' | 'kitchen-upper'
  | 'kitchen-tall' | 'kitchen-drawers' | 'kitchen-corner' | 'island'
  // beds
  | 'bed' | 'bed-kids' | 'bunk' | 'crib'
  // appliances
  | 'fridge' | 'fridge-side' | 'oven' | 'cooktop' | 'hood' | 'microwave' | 'dishwasher' | 'washer'
  | 'ac' | 'boiler' | 'coffee' | 'tv'
  // bathroom
  | 'toilet' | 'toilet-wall' | 'bidet' | 'basin' | 'vanity' | 'bath' | 'shower' | 'shower-screen' | 'towel'
  | 'sink'
  // windows dressing
  | 'curtain' | 'curtain-sheer' | 'roller' | 'venetian'
  // lighting
  | 'pendant' | 'ceiling-lamp' | 'spot' | 'sconce' | 'floor-lamp' | 'table-lamp'
  // outdoor and decor
  | 'parasol' | 'planter' | 'bbq' | 'lounger' | 'plant' | 'mirror' | 'picture' | 'vase'
  // generic / technical
  | 'box' | 'cylinder' | 'stairs' | 'column' | 'door-panel';

export interface CatalogItem {
  id: string;
  category: string;
  name: { en: string; he: string };
  /** real world size in meters */
  width: number; depth: number; height: number;
  /** height of its underside above the floor (wall units, pendants, sockets) */
  elevation?: number;
  color: string;
  shape: Shape;
  /** finishes offered in the properties panel; the first one is the default */
  finishes?: string[];
  /** stands against a wall: snapping puts its back on the wall */
  wall?: boolean;
  tags?: string[];
}

export const CATEGORIES: { id: string; en: string; he: string }[] = [
  { id: 'living', en: 'Living room', he: 'סלון' },
  { id: 'kitchen', en: 'Kitchen', he: 'מטבח' },
  { id: 'dining', en: 'Dining', he: 'פינת אוכל' },
  { id: 'bedroom', en: 'Bedroom', he: 'חדר שינה' },
  { id: 'kids', en: 'Kids room', he: 'חדר ילדים' },
  { id: 'bathroom', en: 'Bathroom', he: 'חדר רחצה' },
  { id: 'toilet', en: 'Toilet', he: 'שירותים' },
  { id: 'appliances', en: 'Appliances', he: 'מוצרי חשמל' },
  { id: 'curtains', en: 'Curtains & blinds', he: 'וילונות ותריסים' },
  { id: 'lighting', en: 'Lighting', he: 'תאורה' },
  { id: 'storage', en: 'Wardrobes & storage', he: 'ארונות ואחסון' },
  { id: 'balcony', en: 'Balcony', he: 'מרפסת' },
  { id: 'decor', en: 'Decor', he: 'דקורציה' },
  { id: 'office', en: 'Office', he: 'משרד' },
  { id: 'electrical', en: 'Electrical & smart home', he: 'חשמל ובית חכם' },
  { id: 'other', en: 'Other', he: 'אחר' },
];

/** finish sets, so one palette serves many objects */
export const FINISHES = {
  fabric: ['#c9c2b6', '#8d9aa8', '#6b705c', '#b08968', '#3f4756', '#d8c3a5'],
  wood: ['#c8a27a', '#8d6e52', '#e3cdb0', '#5c4433', '#d9b382'],
  panel: ['#f1f0ec', '#e6e0d6', '#2f3337', '#9aa5a0', '#c7d0d8', '#5b6b5a'],
  stone: ['#ece8e1', '#2b2b2b', '#b9b4a8', '#d7cfc2', '#6b6f73'],
  metal: ['#aeb6bf', '#8c949e', '#2b2f33', '#c9a227'],
  white: ['#f6f6f4', '#e9ecef', '#dee2e6'],
  glassTint: ['#cfe3f2', '#d8e8d8', '#e8e0d0'],
} as const;

const I = (
  id: string, category: string, en: string, he: string,
  width: number, depth: number, height: number, color: string, shape: Shape,
  extra: Partial<CatalogItem> = {},
): CatalogItem => ({ id, category, name: { en, he }, width, depth, height, color, shape, ...extra });

export const CATALOG: CatalogItem[] = [
  // ---------------------------------------------------------------- living room
  I('sofa-3', 'living', 'Sofa (3 seat)', 'ספה תלת מושבית', 2.1, 0.92, 0.84, '#8d9aa8', 'sofa', { finishes: [...FINISHES.fabric], wall: true }),
  I('sofa-2', 'living', 'Sofa (2 seat)', 'ספה דו מושבית', 1.6, 0.92, 0.84, '#8d9aa8', 'sofa', { finishes: [...FINISHES.fabric], wall: true }),
  I('sofa-l', 'living', 'L-shaped sofa', 'ספה פינתית', 2.6, 1.9, 0.84, '#c9c2b6', 'sofa-l', { finishes: [...FINISHES.fabric], wall: true, tags: ['corner', 'פינתית'] }),
  I('sofa-module', 'living', 'Modular seat', 'מודול ישיבה', 0.9, 0.92, 0.84, '#c9c2b6', 'sofa-module', { finishes: [...FINISHES.fabric] }),
  I('armchair', 'living', 'Armchair', 'כורסה', 0.88, 0.88, 0.86, '#6b705c', 'armchair', { finishes: [...FINISHES.fabric] }),
  I('pouffe', 'living', 'Pouffe', 'פוף', 0.6, 0.6, 0.42, '#b08968', 'pouffe', { finishes: [...FINISHES.fabric] }),
  I('coffee-table', 'living', 'Coffee table', 'שולחן סלון', 1.1, 0.6, 0.42, '#c8a27a', 'table', { finishes: [...FINISHES.wood] }),
  I('coffee-round', 'living', 'Round coffee table', 'שולחן סלון עגול', 0.8, 0.8, 0.42, '#c8a27a', 'table-round', { finishes: [...FINISHES.wood] }),
  I('tv-unit', 'living', 'TV unit', 'מזנון טלוויזיה', 1.8, 0.45, 0.5, '#f1f0ec', 'cabinet', { finishes: [...FINISHES.panel], wall: true }),
  I('tv-55', 'living', 'TV 55"', 'טלוויזיה 55', 1.24, 0.07, 0.72, '#2b2f33', 'tv', { elevation: 0.95, wall: true }),
  I('tv-65', 'living', 'TV 65"', 'טלוויזיה 65', 1.45, 0.07, 0.84, '#2b2f33', 'tv', { elevation: 0.9, wall: true }),
  I('bookshelf', 'living', 'Bookshelf', 'כוננית', 1.0, 0.35, 1.9, '#c8a27a', 'shelf', { finishes: [...FINISHES.wood], wall: true }),
  I('sideboard', 'living', 'Sideboard', 'מזנון', 1.6, 0.42, 0.78, '#8d6e52', 'cabinet', { finishes: [...FINISHES.wood], wall: true }),
  I('rug-l', 'living', 'Rug 2.0 × 3.0', 'שטיח 2×3', 3.0, 2.0, 0.015, '#d8c3a5', 'rug', { finishes: [...FINISHES.fabric] }),
  I('rug-m', 'living', 'Rug 1.6 × 2.3', 'שטיח 1.6×2.3', 2.3, 1.6, 0.015, '#d8c3a5', 'rug', { finishes: [...FINISHES.fabric] }),

  // ---------------------------------------------------------------- kitchen
  I('kb-60', 'kitchen', 'Base cabinet 60', 'ארון תחתון 60', 0.6, 0.6, 0.9, '#f1f0ec', 'kitchen-base', { finishes: [...FINISHES.panel], wall: true }),
  I('kb-45', 'kitchen', 'Base cabinet 45', 'ארון תחתון 45', 0.45, 0.6, 0.9, '#f1f0ec', 'kitchen-base', { finishes: [...FINISHES.panel], wall: true }),
  I('kb-90', 'kitchen', 'Base cabinet 90', 'ארון תחתון 90', 0.9, 0.6, 0.9, '#f1f0ec', 'kitchen-base', { finishes: [...FINISHES.panel], wall: true }),
  I('kd-60', 'kitchen', 'Drawer unit 60', 'יחידת מגירות 60', 0.6, 0.6, 0.9, '#f1f0ec', 'kitchen-drawers', { finishes: [...FINISHES.panel], wall: true }),
  I('kc-90', 'kitchen', 'Corner base unit', 'ארון פינתי', 0.9, 0.9, 0.9, '#f1f0ec', 'kitchen-corner', { finishes: [...FINISHES.panel], wall: true }),
  I('ku-60', 'kitchen', 'Wall cabinet 60', 'ארון עליון 60', 0.6, 0.35, 0.72, '#f1f0ec', 'kitchen-upper', { elevation: 1.45, finishes: [...FINISHES.panel], wall: true }),
  I('ku-90', 'kitchen', 'Wall cabinet 90', 'ארון עליון 90', 0.9, 0.35, 0.72, '#f1f0ec', 'kitchen-upper', { elevation: 1.45, finishes: [...FINISHES.panel], wall: true }),
  I('kt-60', 'kitchen', 'Tall unit 60', 'ארון גבוה 60', 0.6, 0.6, 2.1, '#f1f0ec', 'kitchen-tall', { finishes: [...FINISHES.panel], wall: true }),
  I('island', 'kitchen', 'Kitchen island', 'אי מטבח', 1.8, 0.9, 0.9, '#f1f0ec', 'island', { finishes: [...FINISHES.panel] }),
  I('counter-run', 'kitchen', 'Countertop run', 'משטח עבודה', 1.2, 0.62, 0.04, '#2b2b2b', 'counter', { elevation: 0.86, finishes: [...FINISHES.stone], wall: true }),
  I('sink-kitchen', 'kitchen', 'Kitchen sink', 'כיור מטבח', 0.8, 0.5, 0.2, '#aeb6bf', 'sink', { elevation: 0.7, finishes: [...FINISHES.metal] }),
  I('hood', 'kitchen', 'Extractor hood', 'קולט אדים', 0.6, 0.5, 0.6, '#aeb6bf', 'hood', { elevation: 1.5, finishes: [...FINISHES.metal], wall: true }),
  I('cooktop', 'kitchen', 'Cooktop', 'כיריים', 0.6, 0.52, 0.05, '#2b2f33', 'cooktop', { elevation: 0.86 }),
  I('oven', 'kitchen', 'Built-in oven', 'תנור בנוי', 0.6, 0.57, 0.6, '#2b2f33', 'oven', { elevation: 0.3, wall: true }),

  // ---------------------------------------------------------------- dining
  I('dining-table', 'dining', 'Dining table 160', 'שולחן אוכל 160', 1.6, 0.9, 0.75, '#c8a27a', 'table', { finishes: [...FINISHES.wood] }),
  I('dining-table-200', 'dining', 'Dining table 200', 'שולחן אוכל 200', 2.0, 1.0, 0.75, '#c8a27a', 'table', { finishes: [...FINISHES.wood] }),
  I('dining-round', 'dining', 'Round table Ø120', 'שולחן עגול 120', 1.2, 1.2, 0.75, '#c8a27a', 'table-round', { finishes: [...FINISHES.wood] }),
  I('dining-chair', 'dining', 'Dining chair', 'כיסא אוכל', 0.45, 0.5, 0.9, '#8d6e52', 'chair', { finishes: [...FINISHES.wood, ...FINISHES.fabric] }),
  I('bar-stool', 'dining', 'Bar stool', 'שרפרף בר', 0.38, 0.38, 1.05, '#2b2f33', 'stool', { finishes: [...FINISHES.metal, ...FINISHES.wood] }),
  I('bench', 'dining', 'Bench', 'ספסל', 1.4, 0.38, 0.45, '#8d6e52', 'bench', { finishes: [...FINISHES.wood] }),

  // ---------------------------------------------------------------- bedroom
  I('bed-double', 'bedroom', 'Double bed 160', 'מיטה זוגית 160', 1.6, 2.0, 0.5, '#d8c3a5', 'bed', { finishes: [...FINISHES.fabric], wall: true }),
  I('bed-queen', 'bedroom', 'Double bed 180', 'מיטה זוגית 180', 1.8, 2.0, 0.5, '#d8c3a5', 'bed', { finishes: [...FINISHES.fabric], wall: true }),
  I('bed-single', 'bedroom', 'Single bed', 'מיטת יחיד', 0.9, 2.0, 0.5, '#d8c3a5', 'bed', { finishes: [...FINISHES.fabric], wall: true }),
  I('nightstand', 'bedroom', 'Nightstand', 'שידת לילה', 0.45, 0.4, 0.5, '#c8a27a', 'cabinet', { finishes: [...FINISHES.wood], wall: true }),
  I('dresser', 'bedroom', 'Dresser', 'שידת מגירות', 1.2, 0.5, 0.8, '#c8a27a', 'dresser', { finishes: [...FINISHES.wood], wall: true }),
  I('vanity-desk', 'bedroom', 'Dressing table', 'שולחן איפור', 1.1, 0.45, 0.78, '#e3cdb0', 'desk', { finishes: [...FINISHES.wood], wall: true }),
  I('mirror-tall', 'bedroom', 'Full-length mirror', 'מראה מלאה', 0.6, 0.05, 1.7, '#cfe3f2', 'mirror', { elevation: 0.2, wall: true }),

  // ---------------------------------------------------------------- kids
  I('bed-kids', 'kids', "Child's bed", 'מיטת ילדים', 0.9, 1.7, 0.5, '#c7d0d8', 'bed-kids', { finishes: [...FINISHES.panel], wall: true }),
  I('bunk', 'kids', 'Bunk bed', 'מיטת קומותיים', 1.0, 2.0, 1.65, '#e3cdb0', 'bunk', { finishes: [...FINISHES.wood], wall: true }),
  I('crib', 'kids', 'Cot', 'מיטת תינוק', 0.7, 1.3, 0.95, '#f6f6f4', 'crib', { finishes: [...FINISHES.white, ...FINISHES.wood], wall: true }),
  I('kids-desk', 'kids', 'Study desk', 'שולחן לימודים', 1.2, 0.6, 0.75, '#e3cdb0', 'desk', { finishes: [...FINISHES.wood] }),
  I('toy-shelf', 'kids', 'Toy shelf', 'כוננית צעצועים', 1.0, 0.33, 1.0, '#c7d0d8', 'shelf', { finishes: [...FINISHES.panel], wall: true }),

  // ---------------------------------------------------------------- bathroom
  I('bath-170', 'bathroom', 'Bathtub 170', 'אמבטיה 170', 1.7, 0.75, 0.56, '#f6f6f4', 'bath', { finishes: [...FINISHES.white], wall: true }),
  I('shower-90', 'bathroom', 'Shower 90 × 90', 'מקלחון 90×90', 0.9, 0.9, 2.0, '#f6f6f4', 'shower', { wall: true }),
  I('shower-120', 'bathroom', 'Shower 120 × 80', 'מקלחון 120×80', 1.2, 0.8, 2.0, '#f6f6f4', 'shower', { wall: true }),
  I('shower-screen', 'bathroom', 'Shower screen', 'מחיצת זכוכית', 0.9, 0.04, 2.0, '#cfe3f2', 'shower-screen'),
  I('vanity-80', 'bathroom', 'Vanity 80', 'ארון אמבטיה 80', 0.8, 0.48, 0.85, '#9aa5a0', 'vanity', { finishes: [...FINISHES.panel, ...FINISHES.wood], wall: true }),
  I('vanity-120', 'bathroom', 'Vanity 120', 'ארון אמבטיה 120', 1.2, 0.48, 0.85, '#9aa5a0', 'vanity', { finishes: [...FINISHES.panel, ...FINISHES.wood], wall: true }),
  I('basin', 'bathroom', 'Basin', 'כיור רחצה', 0.55, 0.42, 0.18, '#f6f6f4', 'basin', { elevation: 0.8, wall: true }),
  I('bath-mirror', 'bathroom', 'Bathroom mirror', 'מראה אמבטיה', 0.8, 0.04, 0.9, '#cfe3f2', 'mirror', { elevation: 1.1, wall: true }),
  I('towel-rail', 'bathroom', 'Towel rail', 'מתלה מגבות', 0.6, 0.12, 0.8, '#aeb6bf', 'towel', { elevation: 0.9, wall: true }),
  I('bath-cabinet', 'bathroom', 'Tall bathroom cabinet', 'ארון אמבטיה גבוה', 0.4, 0.35, 1.8, '#f6f6f4', 'cabinet', { finishes: [...FINISHES.white, ...FINISHES.panel], wall: true }),

  // ---------------------------------------------------------------- toilet
  I('wc-floor', 'toilet', 'Toilet', 'אסלה', 0.38, 0.68, 0.79, '#f6f6f4', 'toilet', { wall: true }),
  I('wc-wall', 'toilet', 'Wall-hung toilet', 'אסלה תלויה', 0.38, 0.56, 0.42, '#f6f6f4', 'toilet-wall', { elevation: 0.4, wall: true }),
  I('bidet', 'toilet', 'Bidet', 'בידה', 0.36, 0.56, 0.4, '#f6f6f4', 'bidet', { wall: true }),
  I('wc-basin', 'toilet', 'Cloakroom basin', 'כיור שירותים', 0.4, 0.3, 0.16, '#f6f6f4', 'basin', { elevation: 0.82, wall: true }),

  // ---------------------------------------------------------------- appliances
  I('fridge', 'appliances', 'Fridge-freezer', 'מקרר', 0.7, 0.7, 1.85, '#dee2e6', 'fridge', { finishes: [...FINISHES.metal, ...FINISHES.white], wall: true }),
  I('fridge-side', 'appliances', 'Side-by-side fridge', 'מקרר אמריקאי', 0.92, 0.75, 1.8, '#8c949e', 'fridge-side', { finishes: [...FINISHES.metal], wall: true }),
  I('oven-free', 'appliances', 'Cooker', 'תנור משולב', 0.6, 0.6, 0.9, '#2b2f33', 'oven', { wall: true }),
  I('microwave', 'appliances', 'Microwave', 'מיקרוגל', 0.5, 0.38, 0.3, '#2b2f33', 'microwave', { elevation: 1.4 }),
  I('dishwasher', 'appliances', 'Dishwasher', 'מדיח כלים', 0.6, 0.58, 0.85, '#aeb6bf', 'dishwasher', { finishes: [...FINISHES.metal, ...FINISHES.panel], wall: true }),
  I('washer', 'appliances', 'Washing machine', 'מכונת כביסה', 0.6, 0.6, 0.85, '#f6f6f4', 'washer', { wall: true }),
  I('dryer', 'appliances', 'Tumble dryer', 'מייבש כביסה', 0.6, 0.6, 0.85, '#f6f6f4', 'washer', { wall: true }),
  I('ac-split', 'appliances', 'Air conditioner', 'מזגן עילי', 0.9, 0.22, 0.3, '#f6f6f4', 'ac', { elevation: 2.2, wall: true }),
  I('boiler', 'appliances', 'Water heater', 'דוד שמש', 0.5, 0.5, 1.2, '#aeb6bf', 'boiler', { finishes: [...FINISHES.metal] }),
  I('coffee', 'appliances', 'Coffee machine', 'מכונת קפה', 0.3, 0.4, 0.38, '#2b2f33', 'coffee', { elevation: 0.9 }),

  // ---------------------------------------------------------------- curtains and blinds
  I('curtain-black', 'curtains', 'Blackout curtain', 'וילון האפלה', 1.6, 0.14, 2.4, '#6b705c', 'curtain', { elevation: 0.1, finishes: [...FINISHES.fabric], wall: true }),
  I('curtain-sheer', 'curtains', 'Sheer curtain', 'וילון שקוף', 1.6, 0.1, 2.4, '#f1f0ec', 'curtain-sheer', { elevation: 0.1, finishes: [...FINISHES.white], wall: true }),
  I('curtain-double', 'curtains', 'Double curtain', 'וילון כפול', 1.6, 0.22, 2.4, '#8d9aa8', 'curtain', { elevation: 0.1, finishes: [...FINISHES.fabric], wall: true, tags: ['sheer', 'כפול'] }),
  I('roller', 'curtains', 'Roller blind', 'וילון גלילה', 1.2, 0.08, 1.6, '#c9c2b6', 'roller', { elevation: 0.8, finishes: [...FINISHES.fabric, ...FINISHES.white], wall: true }),
  I('venetian', 'curtains', 'Venetian blind', 'וילון רפפות', 1.2, 0.06, 1.4, '#aeb6bf', 'venetian', { elevation: 0.9, finishes: [...FINISHES.metal, ...FINISHES.white], wall: true }),

  // ---------------------------------------------------------------- lighting
  I('pendant', 'lighting', 'Pendant light', 'מנורת תלייה', 0.35, 0.35, 0.3, '#2b2f33', 'pendant', { elevation: 2.0, finishes: [...FINISHES.metal] }),
  I('pendant-3', 'lighting', 'Pendant cluster', 'מקבץ תלייה', 1.0, 0.2, 0.3, '#c9a227', 'pendant', { elevation: 2.0, finishes: [...FINISHES.metal] }),
  I('ceiling-lamp', 'lighting', 'Ceiling light', 'מנורת תקרה', 0.45, 0.45, 0.1, '#f6f6f4', 'ceiling-lamp', { elevation: 2.5 }),
  I('spot', 'lighting', 'Downlight', 'שקוע תקרה', 0.1, 0.1, 0.04, '#f6f6f4', 'spot', { elevation: 2.56 }),
  I('led-strip', 'lighting', 'LED strip', 'פס לד', 1.5, 0.03, 0.03, '#ffe8a3', 'spot', { elevation: 2.5 }),
  I('sconce', 'lighting', 'Wall light', 'מנורת קיר', 0.14, 0.14, 0.25, '#c9a227', 'sconce', { elevation: 1.8, wall: true }),
  I('floor-lamp', 'lighting', 'Floor lamp', 'מנורה עומדת', 0.4, 0.4, 1.65, '#2b2f33', 'floor-lamp', { finishes: [...FINISHES.metal] }),
  I('table-lamp', 'lighting', 'Table lamp', 'מנורת שולחן', 0.28, 0.28, 0.45, '#e3cdb0', 'table-lamp', { elevation: 0.5 }),

  // ---------------------------------------------------------------- wardrobes and storage
  I('wardrobe-2', 'storage', 'Wardrobe 2 door', 'ארון 2 דלתות', 1.0, 0.6, 2.4, '#e3cdb0', 'wardrobe', { finishes: [...FINISHES.wood, ...FINISHES.panel], wall: true }),
  I('wardrobe-3', 'storage', 'Wardrobe 3 door', 'ארון 3 דלתות', 1.5, 0.6, 2.4, '#e3cdb0', 'wardrobe', { finishes: [...FINISHES.wood, ...FINISHES.panel], wall: true }),
  I('wardrobe-4', 'storage', 'Wardrobe 4 door', 'ארון 4 דלתות', 2.0, 0.6, 2.4, '#e3cdb0', 'wardrobe', { finishes: [...FINISHES.wood, ...FINISHES.panel], wall: true }),
  I('wardrobe-slide', 'storage', 'Sliding wardrobe', 'ארון הזזה', 2.4, 0.65, 2.4, '#9aa5a0', 'wardrobe-sliding', { finishes: [...FINISHES.panel, ...FINISHES.wood], wall: true }),
  I('shoe-cabinet', 'storage', 'Shoe cabinet', 'ארון נעליים', 0.9, 0.35, 1.0, '#f1f0ec', 'cabinet', { finishes: [...FINISHES.panel], wall: true }),
  I('storage-shelf', 'storage', 'Shelving unit', 'יחידת מדפים', 0.9, 0.4, 1.8, '#aeb6bf', 'shelf', { finishes: [...FINISHES.metal, ...FINISHES.wood], wall: true }),
  I('laundry-cab', 'storage', 'Laundry cabinet', 'ארון שירות', 0.7, 0.6, 2.0, '#f1f0ec', 'cabinet', { finishes: [...FINISHES.panel], wall: true }),

  // ---------------------------------------------------------------- balcony
  I('out-sofa', 'balcony', 'Outdoor sofa', 'ספה למרפסת', 1.7, 0.85, 0.75, '#6b705c', 'sofa', { finishes: [...FINISHES.fabric] }),
  I('out-table', 'balcony', 'Outdoor table', 'שולחן מרפסת', 1.2, 0.7, 0.74, '#8d6e52', 'table', { finishes: [...FINISHES.wood, ...FINISHES.metal] }),
  I('out-chair', 'balcony', 'Outdoor chair', 'כיסא מרפסת', 0.55, 0.55, 0.85, '#6b705c', 'chair', { finishes: [...FINISHES.metal, ...FINISHES.wood] }),
  I('lounger', 'balcony', 'Sun lounger', 'מיטת שיזוף', 0.7, 1.9, 0.6, '#c9c2b6', 'lounger', { finishes: [...FINISHES.fabric] }),
  I('parasol', 'balcony', 'Parasol', 'שמשייה', 2.2, 2.2, 2.3, '#8d9aa8', 'parasol', { finishes: [...FINISHES.fabric] }),
  I('bbq', 'balcony', 'Barbecue', 'גריל', 1.1, 0.6, 1.1, '#2b2f33', 'bbq', { finishes: [...FINISHES.metal] }),
  I('planter', 'balcony', 'Planter', 'אדנית', 0.9, 0.3, 0.45, '#8d6e52', 'planter', { finishes: [...FINISHES.wood, ...FINISHES.stone] }),

  // ---------------------------------------------------------------- decor
  I('plant-l', 'decor', 'Large plant', 'צמח גדול', 0.7, 0.7, 1.6, '#4f6b43', 'plant'),
  I('plant-s', 'decor', 'Small plant', 'צמח קטן', 0.35, 0.35, 0.6, '#4f6b43', 'plant'),
  I('picture', 'decor', 'Picture', 'תמונה', 0.8, 0.04, 0.6, '#c8a27a', 'picture', { elevation: 1.4, wall: true }),
  I('mirror-round', 'decor', 'Round mirror', 'מראה עגולה', 0.8, 0.05, 0.8, '#cfe3f2', 'mirror', { elevation: 1.2, wall: true }),
  I('vase', 'decor', 'Vase', 'אגרטל', 0.25, 0.25, 0.45, '#b9b4a8', 'vase', { finishes: [...FINISHES.stone] }),
  I('rug-round', 'decor', 'Round rug Ø200', 'שטיח עגול 200', 2.0, 2.0, 0.015, '#d8c3a5', 'rug', { finishes: [...FINISHES.fabric] }),

  // ---------------------------------------------------------------- office
  I('desk', 'office', 'Desk', 'שולחן עבודה', 1.4, 0.7, 0.75, '#c8a27a', 'desk', { finishes: [...FINISHES.wood, ...FINISHES.panel] }),
  I('desk-corner', 'office', 'Corner desk', 'שולחן פינתי', 1.6, 1.4, 0.75, '#c8a27a', 'desk', { finishes: [...FINISHES.wood] }),
  I('office-chair', 'office', 'Office chair', 'כיסא משרדי', 0.62, 0.62, 1.05, '#2b2f33', 'office-chair', { finishes: [...FINISHES.fabric] }),
  I('file-cabinet', 'office', 'Filing cabinet', 'ארון תיוק', 0.45, 0.6, 1.3, '#8c949e', 'cabinet', { finishes: [...FINISHES.metal, ...FINISHES.panel], wall: true }),

  // ---------------------------------------------------------------- electrical & smart home
  I('socket', 'electrical', 'Socket', 'שקע', 0.09, 0.02, 0.09, '#f1f3f5', 'flat', { elevation: 0.3, wall: true }),
  I('switch', 'electrical', 'Light switch', 'מפסק', 0.09, 0.02, 0.09, '#f1f3f5', 'flat', { elevation: 1.1, wall: true }),
  I('data-outlet', 'electrical', 'Data outlet', 'נקודת רשת', 0.09, 0.02, 0.09, '#74c0fc', 'flat', { elevation: 0.3, wall: true }),
  I('panel', 'electrical', 'Electrical panel', 'לוח חשמל', 0.5, 0.15, 0.7, '#8c949e', 'box', { elevation: 1.3, wall: true }),
  I('smart-switch', 'electrical', 'Smart switch', 'מפסק חכם', 0.09, 0.02, 0.09, '#2b2f33', 'flat', { elevation: 1.1, wall: true }),
  I('sensor', 'electrical', 'Motion sensor', 'חיישן תנועה', 0.1, 0.1, 0.05, '#ffffff', 'cylinder', { elevation: 2.4 }),
  I('camera', 'electrical', 'Camera', 'מצלמה', 0.1, 0.1, 0.1, '#2b2f33', 'cylinder', { elevation: 2.3 }),
  I('hub', 'electrical', 'Smart hub', 'רכזת חכמה', 0.15, 0.15, 0.05, '#2b2f33', 'box', { elevation: 0.8 }),
  I('access-point', 'electrical', 'Access point', 'נקודת גישה', 0.2, 0.2, 0.04, '#f6f6f4', 'cylinder', { elevation: 2.5 }),

  // ---------------------------------------------------------------- other
  I('stairs', 'other', 'Stairs', 'מדרגות', 1.0, 3.0, 2.8, '#ced4da', 'stairs'),
  I('column', 'other', 'Column', 'עמוד', 0.3, 0.3, 2.6, '#adb5bd', 'column'),
  I('parking', 'other', 'Parking space', 'חניה', 2.5, 5.0, 0.01, '#ced4da', 'flat'),
  I('box', 'other', 'Box', 'תיבה', 0.6, 0.6, 0.6, '#adb5bd', 'box'),
];

export const catalogById = (id: string) => CATALOG.find((c) => c.id === id);
export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id);
/** items whose back goes against a wall when snapped */
export const isWallItem = (id: string) => !!catalogById(id)?.wall;
