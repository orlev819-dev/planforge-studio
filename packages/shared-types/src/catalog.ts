/** Original object library. Dimensions in meters (width along local x, depth along local y). */
export type Shape = 'box' | 'table' | 'sofa' | 'bed' | 'chair' | 'cabinet' | 'toilet' | 'bath' | 'shower' | 'basin' | 'cylinder' | 'flat' | 'stairs' | 'column';

export interface CatalogItem {
  id: string;
  category: string;
  name: { en: string; he: string };
  width: number; depth: number; height: number; elevation?: number;
  color: string;
  shape: Shape;
  tags?: string[];
}

export const CATEGORIES: { id: string; en: string; he: string }[] = [
  { id: 'living', en: 'Living room', he: 'סלון' },
  { id: 'bedroom', en: 'Bedroom', he: 'חדר שינה' },
  { id: 'kitchen', en: 'Kitchen', he: 'מטבח' },
  { id: 'bathroom', en: 'Bathroom', he: 'חדר רחצה' },
  { id: 'office', en: 'Office', he: 'משרד' },
  { id: 'electrical', en: 'Electrical', he: 'חשמל' },
  { id: 'smart', en: 'Smart home', he: 'בית חכם' },
  { id: 'other', en: 'Other', he: 'אחר' },
];

const I = (id: string, category: string, en: string, he: string, width: number, depth: number, height: number, color: string, shape: Shape, elevation = 0): CatalogItem =>
  ({ id, category, name: { en, he }, width, depth, height, color, shape, elevation });

export const CATALOG: CatalogItem[] = [
  I('sofa-3', 'living', 'Sofa (3 seat)', 'ספה תלת', 2.1, 0.9, 0.85, '#7d8597', 'sofa'),
  I('sofa-2', 'living', 'Sofa (2 seat)', 'ספה דו', 1.6, 0.9, 0.85, '#7d8597', 'sofa'),
  I('armchair', 'living', 'Armchair', 'כורסה', 0.85, 0.85, 0.85, '#8d7b68', 'sofa'),
  I('coffee-table', 'living', 'Coffee table', 'שולחן סלון', 1.1, 0.6, 0.42, '#a47551', 'table'),
  I('tv-unit', 'living', 'TV unit', 'מזנון טלוויזיה', 1.8, 0.45, 0.5, '#5c5c5c', 'cabinet'),
  I('shelving', 'living', 'Shelving', 'כוננית', 1.0, 0.35, 1.9, '#b08968', 'cabinet'),
  I('dining-table', 'living', 'Dining table', 'שולחן אוכל', 1.6, 0.9, 0.75, '#a47551', 'table'),
  I('dining-chair', 'living', 'Dining chair', 'כיסא אוכל', 0.45, 0.5, 0.9, '#6f4e37', 'chair'),
  I('bed-double', 'bedroom', 'Double bed', 'מיטה זוגית', 1.6, 2.0, 0.5, '#d6ccc2', 'bed'),
  I('bed-single', 'bedroom', 'Single bed', 'מיטת יחיד', 0.9, 2.0, 0.5, '#d6ccc2', 'bed'),
  I('wardrobe', 'bedroom', 'Wardrobe', 'ארון בגדים', 1.8, 0.6, 2.2, '#bfa58a', 'cabinet'),
  I('nightstand', 'bedroom', 'Nightstand', 'שידת לילה', 0.45, 0.4, 0.5, '#bfa58a', 'cabinet'),
  I('dresser', 'bedroom', 'Dresser', 'שידה', 1.2, 0.5, 0.8, '#bfa58a', 'cabinet'),
  I('base-cabinet', 'kitchen', 'Base cabinet', 'ארון תחתון', 0.6, 0.6, 0.9, '#e9ecef', 'cabinet'),
  I('wall-cabinet', 'kitchen', 'Wall cabinet', 'ארון עליון', 0.6, 0.35, 0.7, '#e9ecef', 'cabinet', 1.45),
  I('sink', 'kitchen', 'Kitchen sink', 'כיור מטבח', 0.8, 0.6, 0.9, '#ced4da', 'basin'),
  I('fridge', 'kitchen', 'Refrigerator', 'מקרר', 0.7, 0.7, 1.85, '#dee2e6', 'box'),
  I('oven', 'kitchen', 'Oven', 'תנור', 0.6, 0.6, 0.9, '#495057', 'box'),
  I('cooktop', 'kitchen', 'Cooktop', 'כיריים', 0.6, 0.52, 0.92, '#343a40', 'flat'),
  I('dishwasher', 'kitchen', 'Dishwasher', 'מדיח כלים', 0.6, 0.6, 0.85, '#adb5bd', 'box'),
  I('toilet', 'bathroom', 'Toilet', 'אסלה', 0.38, 0.65, 0.78, '#f8f9fa', 'toilet'),
  I('shower', 'bathroom', 'Shower tray', 'מקלחון', 0.9, 0.9, 2.0, '#cfe8ff', 'shower'),
  I('bathtub', 'bathroom', 'Bathtub', 'אמבטיה', 1.7, 0.75, 0.55, '#f8f9fa', 'bath'),
  I('basin', 'bathroom', 'Basin', 'כיור', 0.6, 0.45, 0.85, '#f8f9fa', 'basin'),
  I('vanity', 'bathroom', 'Vanity', 'ארון כיור', 0.9, 0.5, 0.85, '#bfa58a', 'cabinet'),
  I('desk', 'office', 'Desk', 'שולחן עבודה', 1.4, 0.7, 0.75, '#a47551', 'table'),
  I('office-chair', 'office', 'Office chair', 'כיסא משרדי', 0.6, 0.6, 1.0, '#343a40', 'chair'),
  I('file-cabinet', 'office', 'File cabinet', 'ארון תיוק', 0.45, 0.6, 1.3, '#868e96', 'cabinet'),
  I('socket', 'electrical', 'Socket', 'שקע', 0.08, 0.02, 0.08, '#f1f3f5', 'flat', 0.3),
  I('switch', 'electrical', 'Light switch', 'מפסק', 0.08, 0.02, 0.08, '#f1f3f5', 'flat', 1.1),
  I('ceiling-light', 'electrical', 'Ceiling light', 'גוף תאורה', 0.4, 0.4, 0.1, '#ffd43b', 'cylinder', 2.45),
  I('data-outlet', 'electrical', 'Data outlet', 'נקודת רשת', 0.08, 0.02, 0.08, '#74c0fc', 'flat', 0.3),
  I('panel', 'electrical', 'Electrical panel', 'לוח חשמל', 0.5, 0.15, 0.7, '#868e96', 'box', 1.3),
  I('sensor', 'smart', 'Sensor', 'חיישן', 0.1, 0.1, 0.05, '#ffffff', 'cylinder', 2.4),
  I('hub', 'smart', 'Smart hub', 'רכזת חכמה', 0.15, 0.15, 0.05, '#212529', 'box', 0.8),
  I('smart-switch', 'smart', 'Smart switch', 'מפסק חכם', 0.09, 0.02, 0.09, '#343a40', 'flat', 1.1),
  I('camera', 'smart', 'Camera', 'מצלמה', 0.1, 0.1, 0.1, '#212529', 'cylinder', 2.3),
  I('access-point', 'smart', 'Access point', 'נקודת גישה', 0.2, 0.2, 0.04, '#f8f9fa', 'cylinder', 2.5),
  I('hvac', 'other', 'AC indoor unit', 'מזגן', 0.9, 0.25, 0.3, '#f8f9fa', 'box', 2.1),
  I('stairs', 'other', 'Stairs', 'מדרגות', 1.0, 3.0, 2.8, '#ced4da', 'stairs'),
  I('column', 'other', 'Column', 'עמוד', 0.3, 0.3, 2.6, '#adb5bd', 'column'),
  I('washer', 'other', 'Washing machine', 'מכונת כביסה', 0.6, 0.6, 0.85, '#f1f3f5', 'box'),
  I('dryer', 'other', 'Dryer', 'מייבש', 0.6, 0.6, 0.85, '#f1f3f5', 'box'),
  I('parking', 'other', 'Parking space', 'חניה', 2.5, 5.0, 0.01, '#ced4da', 'flat'),
];

export const catalogById = (id: string) => CATALOG.find((c) => c.id === id);
