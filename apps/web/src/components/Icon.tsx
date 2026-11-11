/** Line icon set (24×24, stroke = currentColor). Original glyphs drawn for PlanForge. */
export type IconName =
  | 'home' | 'plan' | 'library' | 'reports' | 'estimates' | 'team' | 'settings'
  | 'select' | 'pan' | 'room' | 'wall' | 'railing' | 'corner' | 'door' | 'window' | 'opening'
  | 'dimension' | 'ceiling' | 'furniture' | 'note' | 'eraser' | 'more'
  | 'roomExact' | 'import' | 'layers' | 'undo' | 'redo' | 'share' | 'export' | 'ruler' | 'back' | 'split' | 'plus' | 'minus' | 'close' | 'info' | 'lock' | 'unlock' | 'camera' | 'openWall';

const P: Record<IconName, string> = {
  home: 'M3.5 11.2 12 4l8.5 7.2M5.8 10v9.5h12.4V10',
  plan: 'M3.5 4.5h17v15h-17zM3.5 10h17M10 10v9.5',
  library: 'M12 3.4 20 7.7v8.6L12 20.6 4 16.3V7.7zM12 12l8-4.3M12 12v8.6M12 12 4 7.7',
  reports: 'M4 19.5h16M7 19V9.5M12 19V5M17 19v-6.5',
  estimates: 'M6.5 3.5h11v17l-2.7-1.8-2.8 1.8-2.8-1.8-2.7 1.8zM9.3 8.5h5.4M9.3 12.5h5.4',
  team: 'M9 11.2a2.9 2.9 0 1 0 0-5.8 2.9 2.9 0 0 0 0 5.8ZM3.6 19.2c0-3 2.4-5 5.4-5s5.4 2 5.4 5M16 6.1a2.6 2.6 0 0 1 0 5M17.4 14.6c2 .6 3.3 2.3 3.3 4.6',
  settings: 'M12 15.1a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2ZM12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5',
  select: 'M5.5 3.2 18.8 10l-6 2.1-2.2 6z',
  pan: 'M8.2 12.6V6.3a1.4 1.4 0 0 1 2.8 0v4.9V4.7a1.4 1.4 0 0 1 2.8 0v6.5V6.6a1.4 1.4 0 0 1 2.8 0v8.1a6 6 0 0 1-6 6h-.7a4.8 4.8 0 0 1-4.8-4.8v-2.6L3.9 11a1.3 1.3 0 0 1 1.9-1.8z',
  room: 'M4.3 5.5h15.4v13H4.3z',
  wall: 'M3.2 9.8h17.6v4.4H3.2z',
  railing: 'M2.6 8.6h18.8M5.2 8.6v9M9.7 8.6v9M14.3 8.6v9M18.8 8.6v9',
  openWall: 'M3.2 9.8h5.4v4.4H3.2zM15.4 9.8h5.4v4.4h-5.4M10.4 12h1.2M12.8 12H14',
  camera: 'M3.4 8.4h3.4l1.6-2.4h7.2l1.6 2.4h3.4v10.2H3.4zM12 16.6a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6z',
  lock: 'M6 11h12v9H6zM8.4 11V7.8a3.6 3.6 0 0 1 7.2 0V11M12 14.4v2.6',
  unlock: 'M6 11h12v9H6zM8.4 11V7.8a3.6 3.6 0 0 1 6.9-1.3M12 14.4v2.6',
  corner: 'M5.2 19.4V4.6h14.2',
  door: 'M6.8 20.2V3.8h6.6v16.4H6.8zM13.4 3.8a13 13 0 0 1 8.2 8.2',
  window: 'M3.4 7.4h17.2v9.2H3.4zM3.4 12h17.2M12 7.4v9.2',
  opening: 'M4.4 20V7.4h3.8M19.6 20V7.4h-3.8M9.6 7.4h1.6M12.8 7.4h1.6',
  dimension: 'M3.4 12h17.2M6.6 8.8 3.4 12l3.2 3.2M17.4 8.8 20.6 12l-3.2 3.2M3.4 5.2v3M20.6 5.2v3',
  ceiling: 'M4 5.2h16v5.4H4zM4 10.6l4-5.4M9.4 10.6l4-5.4M14.8 10.6l4-5.4M4 19h16',
  furniture: 'M3.4 12.2V9.6a2 2 0 0 1 4 0v2.6h9.2V9.6a2 2 0 0 1 4 0v2.6M2.6 12.2h18.8v5H2.6zM5 17.2v2.2M19 17.2v2.2',
  note: 'M4 20.2l4.2-1.1 9.9-9.9-3.1-3.1-9.9 9.9zM14.3 5.4l3.1 3.1',
  eraser: 'M4.3 15.8 11 9.1l6.6 6.6-4.3 4.3H7.4zM3 20h18',
  more: 'M6.4 12h.1M12 12h.1M17.6 12h.1',
  roomExact: 'M4.3 5.5h15.4v13H4.3zM12 9v6M9 12h6',
  import: 'M12 3.6v11M8.4 7.2 12 3.6l3.6 3.6M4.4 16.4v4h15.2v-4',
  layers: 'M12 3.4 20.6 8 12 12.6 3.4 8zM3.4 12.8 12 17.4l8.6-4.6M3.4 16.6 12 21.2l8.6-4.6',
  undo: 'M8.6 7.4 4.6 11.4l4 4M4.6 11.4h9.2a5.6 5.6 0 0 1 0 11.2',
  redo: 'M15.4 7.4l4 4-4 4M19.4 11.4h-9.2a5.6 5.6 0 0 0 0 11.2',
  share: 'M12 3.6v11M8.4 7.2 12 3.6l3.6 3.6M5 14.6v5.8h14v-5.8',
  export: 'M12 14.6V3.6M8.4 7.2 12 3.6l3.6 3.6M5 14.6v5.8h14v-5.8',
  ruler: 'M3.2 14.4 14.4 3.2l6.4 6.4L9.6 20.8zM7 10.6l2 2M10 7.6l2 2M13 4.6l2 2',
  back: 'M14.6 5.4 8 12l6.6 6.6',
  split: 'M4 5.4h16v13.2H4zM12 5.4v13.2',
  plus: 'M12 6v12M6 12h12',
  minus: 'M6 12h12',
  close: 'M6.4 6.4l11.2 11.2M17.6 6.4 6.4 17.6',
  info: 'M12 20.4a8.4 8.4 0 1 0 0-16.8 8.4 8.4 0 0 0 0 16.8ZM12 11v5.2M12 7.9h.1',
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d={P[name]} />
    </svg>
  );
}
