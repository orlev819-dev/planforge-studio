# Implementation status — 2026-11-10

Legend: ✅ implemented and tested · 🟡 implemented, partial or manually verified only · ❌ not implemented

## Phase summary
| Phase | Status | Notes |
|---|---|---|
| 1 Foundation | 🟡 | Monorepo, data model, dashboard, project management, IndexedDB ✅. **Database server and authentication ❌** (no server). |
| 2 Geometry engine | ✅ | 19 geometry tests |
| 3 2D editor | ✅ | All tools, snapping, undo/redo, typed dimensions. E2E covered. |
| 4 Architectural components | ✅ | Doors (7 types), windows (6 types), openings, connected rooms, multiple floors |
| 5 3D engine | ✅ | Own WebGL renderer: extrusion, holes, cameras, walk, picking. Shadows ❌ |
| 6 Import/export | 🟡 | PDF/SVG/DXF/PNG/JPEG/GLB/OBJ/CSV/JSON export ✅. Reference import + calibration ✅. DXF import, USDZ, IFC and XLSX ❌ (shown as unsupported in the UI) |
| 7 Advanced modules | 🟡 | Object library ✅, reports (room schedule table/CSV/PDF page) ✅. Cost estimation, photos/attachments, collaboration ❌ |
| 8 Device integration | 🟡 | **Bosch GLM 50-27 C/CG over Web Bluetooth** (community-documented protocol; unit + simulated E2E tests; not yet verified on real hardware). Scanning: interfaces only, no native code. |
| 9 Hardening | 🟡 | Offline PWA ✅, i18n he/en ✅, E2E ✅, production build ✅. Server security and sync ❌. Large-plan performance not benchmarked. |

## Feature completion matrix
| Area | Feature | Status |
|---|---|---|
| Projects | create, rename, duplicate, archive/unarchive, delete to trash, restore, delete forever, search, date filter, sort, address/description, autosave, thumbnails, area/floors/status on cards | ✅ |
| Projects | cover images, folders/organisation, sharing | ❌ (sharing = JSON export only) |
| Floors | add, duplicate, delete, rename, elevation, default height/thickness | ✅ |
| 2D canvas | wheel/pinch zoom, pan, selection, multi-select (shift + marquee), drag, rotate, resize handles, shortcuts, context menu, copy/paste/duplicate, delete, undo/redo, grid, rulers, layer visibility | ✅ |
| Snapping | grid (adaptive), corner, midpoint, on-wall, alignment guides, 45° angle | ✅ |
| Rooms | rectangle, freeform polygon, L/irregular/angled, connected (shared walls, T-junctions), exact-dimension dialog, attach to side | ✅ |
| Rooms | internal cutouts (holes) | ❌ |
| Ceilings | lowered ceiling / soffit zones: draw (tool `C`), move, size, rotate, height validated below room ceiling; 2D hatch + label, PDF/SVG/DXF (layer CEILINGS), 3D block; room volume reduced, lowered area + soffit side faces reported | ✅ |
| Geometry edits | move/insert/delete corner, wall length and angle, move wall, split wall, merge collinear walls, split room, merge rooms, move/rotate room, validation messages | ✅ |
| Walls | thickness, height (auto/override), exterior/interior (auto + manual), material, partition walls | ✅ |
| Walls | partial-height walls | 🟡 (height override works; no dedicated UI preset) |
| Railings | balcony/stair railing as a wall type: own tool (`B`), or switch any wall to a railing and back; styles bars / glass / low parapet; height (default 1.05 m, validated 0.20–2.00 m), thickness, material; open in 2D (rails, balusters, posts) and in 3D (posts + handrail + bars/glass/parapet); excluded from paintable wall area and reported as railing length; doors/windows refused on railings | ✅ |
| Openings | door types single/double/sliding/pocket/folding/double-sliding/custom; window fixed/sliding/casement/double/floor-to-ceiling/custom; width/height/sill/offset/hinge/swing/material/frame depth; 2D arcs; 3D holes; preserved through wall edits/splits | ✅ |
| Measurements | auto wall dimensions, manual dimensions, gross/net area, perimeter, volume, wall/ceiling area, opening area, object-to-wall distance, mm/cm/m/ft-in, precision | ✅ |
| Measurements | angle dimension objects, configurable rounding modes | ❌ |
| 3D | orbit/pan/zoom, top, perspective, isometric, walk/first-person, roof/ceilings toggle, solid/transparent/hidden walls, floor selection, picking, incremental updates, materials as colours | ✅ |
| 3D | shadows, PBR textures | ❌ |
| Library | 44 original items in 8 categories, search, click-to-place, drag & drop, rotate, resize, mirror, layer, colour, custom metadata | ✅ |
| Library | import user OBJ / STL (ASCII + binary): unit auto-detect + override, Y/Z-up, colour; stored in the project; real footprint (convex hull) in 2D/PDF/DXF, real mesh in 3D and GLB/OBJ export; resize/rotate/mirror like furniture; ≤200k triangles | ✅ |
| Library | grouping, GLB/GLTF/SVG model import | ❌ |
| Import | PDF (page choice), PNG, JPG, SVG as reference; 2-point calibration; rotate/opacity/lock/hide; trace | ✅ |
| Import | DXF import, image-analysis wall suggestions | ❌ |
| Export | PDF (A4/A3/custom, orientation, 1:N or fit, header/footer/logo/date/legend, room schedule), PNG/JPEG (DPI), SVG, DXF, GLB, OBJ, JSON, CSV | ✅ |
| Export | USDZ, IFC, XLSX | ❌ (disabled in UI) |
| Persistence | IndexedDB, debounced autosave, reload-safe, version snapshots + restore, backup download, JSON import, offline PWA | ✅ |
| Persistence | cloud sync, conflict handling | ❌ |
| i18n | Hebrew RTL / English LTR, live switching, Hebrew room names, Hebrew in PDF (rasterized), non-mirrored canvas | ✅ |
| Accounts / teams / comments / audit | — | ❌ |
| Photos / notes / checklists / issues | text notes on the plan only | 🟡 |
| Cost estimation | — | ❌ |
| Bluetooth laser | Bosch GLM 50-27 C/CG: connect, status, auto-reconnect (3 tries), reading → focused length field / drawing wall-room toward cursor / selected wall length | 🟡 (awaiting hardware test) |
| Bluetooth laser | other brands (Leica DISTO, Hilti, Stabila…) | ❌ |
| Scanning (RoomPlan/ARKit/ARCore) | interfaces only, nothing simulated | ❌ |

## Known limitations
- Room dimensions are measured on **wall centerlines**. Net (interior) area is shown separately. magicplan-style interior-first entry is not offered yet.
- `setWallLength` moves the perpendicular wall at the moving end. Non-rectangular neighbourhoods only move the end corner. Partially shared walls (T-junction chains) keep their junction vertices fixed.
- Room overlap is detected with edge crossings and interior sampling. It is robust for architectural shapes but is not a full polygon-boolean engine.
- Hit-testing and snapping scan linearly. Plans up to a few thousand segments are fine; there is no spatial index yet.
- Hebrew text in PDFs is a raster image (correct shaping, not selectable). Latin text is vector.
- The 3D renderer has no shadows or textures. Furniture is made of parametric boxes, not modelled assets.
- The UI type-check runs against an offline React type shim. Run with real `@types/react` after `npm install`.
- No server: no accounts, permissions, sharing or sync. All data lives in the browser's IndexedDB on one device. Use JSON backups.

## Compatibility
| Environment | Status |
|---|---|
| Chromium 153 (desktop) | Tested (headless, SwiftShader WebGL) |
| Firefox / Safari desktop | Expected to work (standard APIs only); **not tested** |
| iPad (Safari, home-screen app) | Dedicated touch UI: icon rail, 44 px+ targets, 16 px inputs (no focus zoom), properties drawer in portrait / docked in landscape, long-press context menu, one-finger pan + pinch, tap-to-draw with Finish/Undo/Cancel bar, typed-length + direction buttons (and laser) instead of keyboard, 3D two-finger pan + on-screen walk pad, safe areas, apple-touch-icon + home-screen meta. Tested in Chromium iPad emulation (portrait 820×1180, landscape 1180×820); **not yet on a physical iPad / WebKit**. Bluetooth on iPad only via Bluefy. |
| Bosch GLM 50-27 C/CG | Chrome/Edge (Web Bluetooth); Firefox/Safari have no Web Bluetooth |
| LiDAR / RoomPlan / ARCore / other lasers | **Not supported** in this build |

## Next steps (in priority order)
1. `apps/api`: Fastify + PostgreSQL/Prisma, auth, workspaces, RBAC enforced on the server, revision-based sync and conflict handling.
2. `packages/estimating`: quantities from `roomMetrics` × price lists, waste %, labour, VAT/ILS configuration, PDF/XLSX output.
3. Attachments (photos/notes/checklists per entity) and the full report builder.
4. Spatial index plus performance benchmarks on large plans; DXF import; cutouts; furniture grouping and GLB import.
5. Native mobile shells implementing `packages/scanning`.
