# Test results — 2026-11-10

Environment: Linux sandbox, Node 22.23, TypeScript 6.0, Chromium (Playwright 1.63, headless, SwiftShader WebGL).

| Suite | Command | Result |
|---|---|---|
| Type-check (strict, packages + app) | `npm run typecheck` | ✅ 0 errors |
| Geometry + export + laser unit tests | `npm test` | ✅ 30 / 30 passed |
| Production build | `npm run build` | ✅ |
| End-to-end (real UI in Chromium) | `npm run test:e2e` | ✅ 5 / 5 passed |

## Unit tests (27)
Geometry (19): rectangle area / perimeter / volume (4.00 × 3.50 = 14.00 m²) · exact 4.25 × 3.60 × 2.75 creation ·
irregular / L-shaped / angled areas + triangulation · invalid polygons (self-intersection, too few, degenerate) ·
shared walls (6 vertices / 7 walls / 1 interior) · T-junction split · overlap rejection · wall-length constraint
(rectangle kept, shared neighbour updated, input immutable) · doors: placement, fit validation, overlap, survive
wall split with exact offset · door offset preserved from anchor · split + merge preserve area, merge collinear walls ·
room move/rotate carries openings + furniture, detaches shared walls · vertex move rejects self-intersection ·
moving a shared wall changes both rooms · delete room keeps neighbour intact · object-to-wall distance ·
unit parse/format (mm, cm, m, ft-in, comma decimals) · floor re-id + project JSON round-trip · opening update validation.

Export (8): drawing list (gaps, arcs, dims, labels) · SVG well-formed (sax) · DXF parse, layers, coordinates, Hebrew
escapes · PDF (pdf-lib load, A4 landscape size, pdf.js text: project name, 14.00 m, 4.00 m, scale) · GLB container +
accessor consistency + bounds (height 2.75 m, x −0.075…7.075 m) · 3D walls have real holes at openings · OBJ indices +
CSV + JSON round-trip · exports reflect edits.

## Laser unit tests (3)
Packet parser (valid / malformed / NaN / out-of-range — synthetic fixtures) · driver against a mock GATT: subscribe, enable command `C0 55 02 01 00 1A`, reading emitted, disconnect.

## End-to-end tests (5)
1. **Primary acceptance (§23):** new project “My Apartment” → Floor 1 (+ add floor) → draw a room with the mouse →
   type 4.00 / 3.50 → **14.00 m²** → connected 3 × 3.5 room (7 walls, 1 shared) → **80 cm door** on the shared wall →
   **120 cm window** → sofa + dining table → wall 4.00 → 4.50: living **15.75 m²**, kitchen **8.75 m²** → undo/redo →
   3D (≥13 mesh parts, non-blank WebGL canvas) → 2D → export PDF (3 pages; text contains 15.75 m, 4.50 m, 3.50 m,
   scale) → reload → **project state deep-equal to before reload**, zero console/page errors.
2. Hebrew RTL: `dir=rtl`, Hebrew project/room names, +x stays to the right on screen, canvas container `ltr`, PDF exported.
3. Reference import: SVG plan → 2-point calibration (400 px = 8 m → 0.02 m/px) → room traced, 32.00 m².
4. Project management: create ×2, search, duplicate, delete to trash, restore.
5. Laser (simulated GLM injected by the test only): connect, enable command sent, reading → focused wall field (14.00 → 15.75 m²), reading → selected wall length 2.8 m.

**Not yet verified with a physical Bosch GLM 50-27 CG.**

## Not covered by automated tests
Touch/pinch on real devices, Firefox/Safari, PNG/JPEG/GLB/OBJ downloads through the UI (writers are unit-tested),
version-history UI, large-plan performance. No server, sync or authorization tests exist because those modules are not built.
