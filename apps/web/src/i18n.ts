import { useStore } from './store';

export type Lang = 'en' | 'he';

const en = {
  appName: 'PlanForge Studio', dashboard: 'Dashboard', projects: 'Projects', floorPlans: 'Floor plan', library: 'Object library', reports: 'Reports', estimates: 'Estimates', team: 'Team workspace', settings: 'Settings',
  notImplemented: 'Not implemented in this build', newProject: 'New project', projectName: 'Project name', address: 'Address', description: 'Description', create: 'Create', cancel: 'Cancel', save: 'Save', apply: 'Apply', close: 'Close',
  search: 'Search projects…', sortModified: 'Last modified', sortName: 'Name', active: 'Active', archived: 'Archived', trash: 'Trash', open: 'Open', rename: 'Rename', duplicate: 'Duplicate', archive: 'Archive', unarchive: 'Unarchive', delete: 'Delete', restore: 'Restore', deleteForever: 'Delete forever',
  floors: 'floors', area: 'Area', modified: 'Modified', noProjects: 'No projects yet. Create your first project to start drawing.', importJson: 'Import project (.json)', demo: 'Demo content',
  undo: 'Undo', redo: 'Redo', saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved changes', saveError: 'Save failed', export: 'Export', share: 'Share', view2d: '2D', view3d: '3D', split: 'Split',
  select: 'Select', pan: 'Pan', room: 'Room', wall: 'Wall', corner: 'Add corner', door: 'Door', window: 'Window', opening: 'Opening', dimension: 'Dimension', furniture: 'Furniture', annotation: 'Note', eraser: 'Eraser', import: 'Import', calibrate: 'Calibrate',
  roomDialog: 'Create room with exact dimensions', width: 'Width', length: 'Length', height: 'Ceiling height', name: 'Name', positionX: 'Position X', positionY: 'Position Y', attach: 'Attach to selected room', none: 'None', right: 'Right', left: 'Left', above: 'Above', below: 'Below',
  inspector: 'Properties', nothingSelected: 'Nothing selected', floor: 'Floor', elevation: 'Elevation', defaultHeight: 'Default height', wallThickness: 'Wall thickness', grossArea: 'Area (centerline)', netArea: 'Net area', perimeter: 'Perimeter', volume: 'Volume', wallArea: 'Wall surface', ceilingArea: 'Ceiling area',
  thickness: 'Thickness', angle: 'Angle', exterior: 'Exterior', material: 'Material', type: 'Type', sill: 'Sill height', offset: 'Offset from start', swing: 'Swing side', hinge: 'Hinge', flip: 'Flip', rotation: 'Rotation', depth: 'Depth', mirror: 'Mirror', x: 'X', y: 'Y', text: 'Text', layer: 'Layer', distToWall: 'Distance to wall',
  splitRoom: 'Split room', mergeRooms: 'Merge rooms', rotate90: 'Rotate 90°', deleteCorner: 'Delete corner', mergeWalls: 'Merge walls here', addFloor: 'Add floor', duplicateFloor: 'Duplicate floor', deleteFloor: 'Delete floor',
  units: 'Units', snap: 'Snap', grid: 'Grid', scale: 'Scale', layers: 'Layers', language: 'Language', theme: 'Theme', light: 'Light', dark: 'Dark', precision: 'Precision',
  exportTitle: 'Export', format: 'Format', paper: 'Paper', orientation: 'Orientation', landscape: 'Landscape', portrait: 'Portrait', fit: 'Fit to page', header: 'Header', footer: 'Footer', logo: 'Logo (PNG)', includeFurniture: 'Furniture', includeDims: 'Dimensions', includeNotes: 'Annotations', legend: 'Legend', schedule: 'Room schedule page', download: 'Download', unsupported: 'Not supported yet', allFloors: 'All floors', dpi: 'Resolution (DPI)',
  versions: 'Version history', saveVersion: 'Save version', restoreVersion: 'Restore', backup: 'Download backup',
  reference: 'Reference plan', importPlan: 'Import plan (PDF/PNG/JPG/SVG)', page: 'Page', opacity: 'Opacity', locked: 'Locked', visible: 'Visible', calibrateHint: 'Click two points with a known distance on the reference plan.', knownDistance: 'Real distance between the two points', removeReference: 'Remove reference',
  perspective: 'Perspective', top: 'Top', iso: 'Isometric', walk: 'Walk (WASD)', walls: 'Walls', solid: 'Solid', transparent: 'Transparent', hidden: 'Hidden', ceilings: 'Roof / ceilings', currentFloor: 'Current floor', fitView: 'Fit',
  roomsList: 'Rooms', report: 'Report', totals: 'Totals', count: 'Count', doors: 'Doors', windows: 'Windows',
  shareInfo: 'Cloud sharing requires the server (not part of this build). Use Export → Project JSON to share a file.',
  hintRoom: 'Drag a rectangle, or click to place corners (double-click / Enter to close).', hintWall: 'Click start and end points. Esc to finish.', hintOpening: 'Click on a wall to place.', hintFurniture: 'Pick an object, then click on the plan.', hintDimension: 'Click two points.', hintCorner: 'Click on a wall to insert a corner.',
  placeObject: 'Click on the plan to place', categories: 'Categories', all: 'All',
  more: 'More', pencilHint: 'Use Apple Pencil to draw walls, rooms, and objects',
  railing: 'Railing', railingStyle: 'Railing style', bars: 'Bars', glass: 'Glass', panel: 'Low parapet', wallType: 'Type', solidWall: 'Wall', hintRailing: 'Click start and end points to draw a balcony railing. Esc to finish.', railingLength: 'Railing length', railingNoOpening: 'Railings hold no doors or windows.',
  hintRoomTouch: 'Tap corners → ✓ Finish, or drag a rectangle. Long-press for options.', hintWallTouch: 'Tap start and end. Exact length: type it below, then tap a direction.',
  objHeight: 'Height', finish: 'Finish', undoPoint: 'Point', placeNext: 'Place next corner at this length', enterLength: 'Enter a length first (or measure with the laser).',
  importModel: 'Import 3D model (OBJ / STL)', myModels: 'My models', fileUnits: 'File units', upAxis: 'Up axis', modelHint: 'Check the size looks right; change File units if not. You can resize the object after placing it.', modelTooBig: 'Model is larger than 30 m — check the File units.', modelInUse: 'This model is placed in the plan; delete those objects first.',
  ceiling: 'Lowered ceiling', hintCeiling: 'Drag a rectangle over the area where the ceiling is lower.', ceilingHeightAt: 'Ceiling height here', dropBy: 'Lower by', loweredArea: 'Lowered ceiling area', soffitFaces: 'Soffit side faces',
  laser: 'Laser measure (Bluetooth)', connect: 'Connect', disconnect: 'Disconnect', lastReading: 'Last reading',
  laser_unsupported: 'Bluetooth not available', laser_idle: 'Not connected', laser_connecting: 'Connecting…', laser_connected: 'Connected', laser_reconnecting: 'Reconnecting…', laser_error: 'Error',
  laserTarget_field: 'entered in field', laserTarget_drawing: 'placed drawing point', laserTarget_wall: 'set selected wall length', laserTarget_none: 'not applied',
  laserTips: 'Close MeasureOn on your phone (or turn the phone Bluetooth off): the GLM accepts one connection|If the GLM is paired in Windows Settings > Bluetooth, remove it there, then try again|Make sure Bluetooth is on in the GLM (BT symbol on its display) and the device is awake|Press Connect again: on Windows it often succeeds on the second try',
  laserInsecure: 'Browsers allow Bluetooth only on secure pages (https:// or localhost). On the server PC open http://localhost:8080; on other devices it is not available over plain http.',
  laserUnsupported: 'Use Chrome or Edge on Windows/Android/macOS with Bluetooth turned on.',
  laserHow: 'Turn on Bluetooth on the GLM, click Connect and pick it. Each measurement goes into the focused length field, the wall/room you are drawing (toward the cursor), or the selected wall.',
  laserNote: 'Protocol is community-documented (not an official Bosch SDK). Close the MeasureOn app first — the device accepts one connection.',
};
type Dict = typeof en;
const he: Dict = {
  appName: 'PlanForge Studio', dashboard: 'לוח בקרה', projects: 'פרויקטים', floorPlans: 'תוכנית קומה', library: 'ספריית אובייקטים', reports: 'דוחות', estimates: 'הערכות עלות', team: 'סביבת צוות', settings: 'הגדרות',
  notImplemented: 'לא מומש בגרסה זו', newProject: 'פרויקט חדש', projectName: 'שם הפרויקט', address: 'כתובת', description: 'תיאור', create: 'צור', cancel: 'ביטול', save: 'שמור', apply: 'החל', close: 'סגור',
  search: 'חיפוש פרויקטים…', sortModified: 'עודכן לאחרונה', sortName: 'שם', active: 'פעילים', archived: 'בארכיון', trash: 'סל מחזור', open: 'פתח', rename: 'שנה שם', duplicate: 'שכפל', archive: 'העבר לארכיון', unarchive: 'החזר מארכיון', delete: 'מחק', restore: 'שחזר', deleteForever: 'מחק לצמיתות',
  floors: 'קומות', area: 'שטח', modified: 'עודכן', noProjects: 'אין עדיין פרויקטים. צרו פרויקט ראשון כדי להתחיל לשרטט.', importJson: 'ייבוא פרויקט (‎.json)', demo: 'תוכן הדגמה',
  undo: 'בטל', redo: 'בצע שוב', saved: 'נשמר', saving: 'שומר…', unsaved: 'שינויים לא שמורים', saveError: 'השמירה נכשלה', export: 'ייצוא', share: 'שיתוף', view2d: '2D', view3d: '3D', split: 'מפוצל',
  select: 'בחירה', pan: 'הזזה', room: 'חדר', wall: 'קיר', corner: 'הוסף פינה', door: 'דלת', window: 'חלון', opening: 'פתח', dimension: 'מידה', furniture: 'ריהוט', annotation: 'הערה', eraser: 'מחק', import: 'ייבוא', calibrate: 'כיול',
  roomDialog: 'יצירת חדר במידות מדויקות', width: 'רוחב', length: 'אורך', height: 'גובה תקרה', name: 'שם', positionX: 'מיקום X', positionY: 'מיקום Y', attach: 'הצמד לחדר הנבחר', none: 'ללא', right: 'ימין', left: 'שמאל', above: 'מעל', below: 'מתחת',
  inspector: 'מאפיינים', nothingSelected: 'לא נבחר דבר', floor: 'קומה', elevation: 'מפלס', defaultHeight: 'גובה ברירת מחדל', wallThickness: 'עובי קיר', grossArea: 'שטח (ציר קיר)', netArea: 'שטח נטו', perimeter: 'היקף', volume: 'נפח', wallArea: 'שטח קירות', ceilingArea: 'שטח תקרה',
  thickness: 'עובי', angle: 'זווית', exterior: 'חיצוני', material: 'חומר', type: 'סוג', sill: 'גובה אדן', offset: 'מרחק מתחילת הקיר', swing: 'כיוון פתיחה', hinge: 'ציר', flip: 'הפוך', rotation: 'סיבוב', depth: 'עומק', mirror: 'שיקוף', x: 'X', y: 'Y', text: 'טקסט', layer: 'שכבה', distToWall: 'מרחק לקיר',
  splitRoom: 'פצל חדר', mergeRooms: 'אחד חדרים', rotate90: 'סובב 90°', deleteCorner: 'מחק פינה', mergeWalls: 'אחד קירות כאן', addFloor: 'הוסף קומה', duplicateFloor: 'שכפל קומה', deleteFloor: 'מחק קומה',
  units: 'יחידות', snap: 'הצמדה', grid: 'רשת', scale: 'קנה מידה', layers: 'שכבות', language: 'שפה', theme: 'ערכת נושא', light: 'בהיר', dark: 'כהה', precision: 'דיוק',
  exportTitle: 'ייצוא', format: 'פורמט', paper: 'נייר', orientation: 'כיוון', landscape: 'לרוחב', portrait: 'לאורך', fit: 'התאם לדף', header: 'כותרת עליונה', footer: 'כותרת תחתונה', logo: 'לוגו (PNG)', includeFurniture: 'ריהוט', includeDims: 'מידות', includeNotes: 'הערות', legend: 'מקרא', schedule: 'עמוד טבלת חדרים', download: 'הורדה', unsupported: 'עדיין לא נתמך', allFloors: 'כל הקומות', dpi: 'רזולוציה (DPI)',
  versions: 'היסטוריית גרסאות', saveVersion: 'שמור גרסה', restoreVersion: 'שחזר', backup: 'הורד גיבוי',
  reference: 'תוכנית רקע', importPlan: 'ייבוא תוכנית (PDF/PNG/JPG/SVG)', page: 'עמוד', opacity: 'שקיפות', locked: 'נעול', visible: 'גלוי', calibrateHint: 'לחצו על שתי נקודות שהמרחק ביניהן ידוע בתוכנית הרקע.', knownDistance: 'המרחק האמיתי בין שתי הנקודות', removeReference: 'הסר רקע',
  perspective: 'פרספקטיבה', top: 'מבט על', iso: 'איזומטרי', walk: 'הליכה (WASD)', walls: 'קירות', solid: 'מלא', transparent: 'שקוף', hidden: 'מוסתר', ceilings: 'גג / תקרות', currentFloor: 'קומה נוכחית', fitView: 'התאם',
  roomsList: 'חדרים', report: 'דוח', totals: 'סיכום', count: 'כמות', doors: 'דלתות', windows: 'חלונות',
  shareInfo: 'שיתוף בענן דורש שרת (לא כלול בגרסה זו). השתמשו בייצוא ← JSON כדי לשתף קובץ.',
  hintRoom: 'גררו מלבן, או לחצו כדי למקם פינות (לחיצה כפולה / Enter לסגירה).', hintWall: 'לחצו על נקודת התחלה וסיום. Esc לסיום.', hintOpening: 'לחצו על קיר כדי למקם.', hintFurniture: 'בחרו אובייקט ולחצו על התוכנית.', hintDimension: 'לחצו על שתי נקודות.', hintCorner: 'לחצו על קיר כדי להוסיף פינה.',
  placeObject: 'לחצו על התוכנית כדי למקם', categories: 'קטגוריות', all: 'הכל',
  more: 'עוד', pencilHint: 'השתמשו ב-Apple Pencil לשרטוט קירות, חדרים ואובייקטים',
  railing: 'מעקה', railingStyle: 'סוג מעקה', bars: 'מוטות', glass: 'זכוכית', panel: 'קיר נמוך', wallType: 'סוג', solidWall: 'קיר', hintRailing: 'לחצו על נקודת התחלה וסיום כדי לשרטט מעקה מרפסת. Esc לסיום.', railingLength: 'אורך מעקה', railingNoOpening: 'במעקה אין דלתות או חלונות.',
  hintRoomTouch: 'הקישו על פינות ← ✓ סיום, או גררו מלבן. לחיצה ארוכה לאפשרויות.', hintWallTouch: 'הקישו התחלה וסיום. אורך מדויק: הקלידו למטה והקישו על כיוון.',
  objHeight: 'גובה', finish: 'סיום', undoPoint: 'נקודה', placeNext: 'מקם את הפינה הבאה באורך הזה', enterLength: 'הזינו אורך קודם (או מדדו עם הלייזר).',
  importModel: 'ייבוא מודל תלת-ממד (OBJ / STL)', myModels: 'המודלים שלי', fileUnits: 'יחידות הקובץ', upAxis: 'ציר למעלה', modelHint: 'בדקו שהמידות נראות נכון; אם לא – שנו את יחידות הקובץ. אפשר לשנות גודל אחרי המיקום.', modelTooBig: 'המודל גדול מ-30 מ׳ – בדקו את יחידות הקובץ.', modelInUse: 'המודל ממוקם בתוכנית; מחקו קודם את האובייקטים.',
  ceiling: 'הנמכת תקרה', hintCeiling: 'גררו מלבן על האזור שבו התקרה נמוכה יותר.', ceilingHeightAt: 'גובה התקרה באזור', dropBy: 'הנמכה של', loweredArea: 'שטח הנמכות תקרה', soffitFaces: 'דפנות הנמכה',
  laser: 'מד לייזר (בלוטות\')', connect: 'התחבר', disconnect: 'התנתק', lastReading: 'מדידה אחרונה',
  laser_unsupported: 'בלוטות\' לא זמין', laser_idle: 'לא מחובר', laser_connecting: 'מתחבר…', laser_connected: 'מחובר', laser_reconnecting: 'מתחבר מחדש…', laser_error: 'שגיאה',
  laserTarget_field: 'הוזן לשדה', laserTarget_drawing: 'מוקמה נקודת שרטוט', laserTarget_wall: 'נקבע אורך הקיר הנבחר', laserTarget_none: 'לא הוחל',
  laserTips: 'סגרו את MeasureOn בטלפון (או כבו בו בלוטות׳): המד מקבל חיבור אחד בלבד|אם ה-GLM מצומד ב-Windows (הגדרות > Bluetooth), הסירו אותו משם ונסו שוב|ודאו שהבלוטות׳ דלוק במד (סמל BT בתצוגה) ושהמד לא במצב שינה|לחצו שוב «התחבר»: ב-Windows זה מצליח לעיתים רק בניסיון השני',
  laserInsecure: 'דפדפנים מאפשרים בלוטות׳ רק בדף מאובטח (https:// או localhost). במחשב השרת פתחו http://localhost:8080; במכשירים אחרים דרך http רגיל זה לא זמין.',
  laserUnsupported: 'השתמשו ב-Chrome או Edge עם בלוטות\' פעיל.',
  laserHow: 'הפעילו בלוטות\' במד, לחצו "התחבר" ובחרו אותו. כל מדידה נכנסת לשדה האורך הפעיל, לקיר/חדר שאתם משרטטים (לכיוון הסמן), או לקיר הנבחר.',
  laserNote: 'הפרוטוקול מתועד ע"י הקהילה (לא SDK רשמי של בוש). סגרו קודם את אפליקציית MeasureOn – המכשיר מקבל חיבור אחד בלבד.',
};

export const dicts: Record<Lang, Dict> = { en, he };
export type TKey = keyof Dict;
export function useT() {
  const lang = useStore((s) => s.lang);
  const d = dicts[lang];
  return { t: (k: TKey) => d[k], lang, dir: lang === 'he' ? 'rtl' : 'ltr' as 'rtl' | 'ltr' };
}
