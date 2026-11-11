# Test results — 2026-11-11

Environment: Linux sandbox, Node 22.23, TypeScript 6.0, Chromium (Playwright 1.63, headless, SwiftShader WebGL).

| Suite | Command | Result |
|---|---|---|
| Type-check (strict, packages + app) | `npm run typecheck` | ✅ 0 errors |
| Unit tests (geometry, export, laser, ceilings, model import, railings, interior dimensions, closing walls) | `npm test` | ✅ 92 / 92 passed |
| Production build | `npm run build` | ✅ |
| End-to-end (real UI in Chromium, incl. iPad emulation) | `npm run test:e2e` | ✅ 30 / 30 passed |

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

## Closing walls into a room (8 unit + 2 E2E)
Unit (8): an open chain closes nothing · the closing wall makes the 4.00 × 3.50 ring a room of 14.00 m² with its 4 drawn
walls promoted (none left standalone) · a ring of railings becomes a balcony whose 4 edges stay railings at 1.05 m ·
3 walls closed against an existing room make a 7.00 m² connected room over 7 walls, the shared wall belonging to both ·
a dangling wall closes nothing while the ring beside it is still found · a ring drawn inside a room is refused (overlap) ·
a self-crossing ring is refused · a partition drawn across a room does not silently become a room.
E2E (2): tap/click 4 corners back onto the first → room panel with 14.00 m², 4 wall rows, all walls exterior, draw bar gone →
one undo removes room + closing wall, redo restores → 3 walls onto the room's right-hand wall → second room 7.00 m²,
7 walls, 1 interior → an open chain stays walls → both rooms survive a reload. Railing ring → 4.50 m² balcony.

## Open plan — no wall between rooms (6 unit + 1 E2E)
Unit (6): deleting the shared wall of two rooms leaves two rooms with their own names and areas (14.00 and 10.50 m²) and an edge of kind `open` ·
an open edge adds no wall surface, raises the net area (nothing to inset for) and is reported as the clear passage width ·
2D draws one dashed line instead of a filled body and still dimensions it, 3D builds nothing for it ·
a door must be removed before the passage opens, and none can be added to it afterwards · the passage closes again from the wall type, and a second delete says it is already open ·
a drawn partition is still deleted outright, and the open state survives a save/load.
E2E (1): two rooms sharing a wall → eraser on it → still two rooms, 7 walls, kind `open` → Living stays 14.00 m², Kitchen 10.50 m², passage 3.35 m → 3D part count drops →
the wall panel shows Open with its hint, *Put the wall back* closes it, and *Remove this wall (open space)* opens it again from the panel with both rooms intact → survives a reload.

## Camera / site photos (3 unit + 2 E2E)
Unit (3): a photo is pinned where it was taken, named for you, cleaned to the plan's precision and stamped, without touching the input floor · renamed, annotated and deleted like anything else, with a missing id and an empty image both refused ·
photos travel in the project JSON and a project saved before photos existed loads with none.
E2E (2): with a fake rear camera (a canvas stream) — Photo tool → tap the plan → live view → shutter → preview → Use → pinned at that point, selected, stored as a JPEG of a few KB → name and note stick →
deselect and tap the pin to open it again → a photo taken from the room panel is filed under the room → both survive a reload. Without permission: the error is shown, the shutter stays disabled and the file picker is offered.

## Opening offsets (7 unit + 1 E2E)
Unit (7): offsets are measured to the opening's edges, not its centre (1.60 / 0.80 / 1.60 on a 4.00 wall) · interior mode runs from the inside faces (span 3.85, 1.525 each side) ·
setting a measured distance from either end moves the opening and keeps its width · an interior measurement lands on the inside face it was taken from, and follows a side wall that gets thicker ·
measuring both sides sets the width from the two readings · a distance that would push the opening off its wall is refused and nothing moves · the offsets match where the jambs really are on the plan.
E2E (1): place a door → panel shows 1.60 / 0.80 / 1.60 → type 0.92 from the corner → the far side becomes 2.28 and the width holds → Interior shows 0.845 and a 3.85 span → 1.10 interior lands at t = 1.575 →
both-sides mode turns a 1.50 far measurement into a 1.25 window → 9 m is refused and the field snaps back → survives a reload.

## Measured (locked) walls (11 unit + 1 E2E)
Unit (9): without a lock, setting one wall still squares the room up (unchanged behaviour) · a locked 4.18 m wall holds while the opposite wall is set to 4.05, the side taking up the difference ·
all four walls of a room keep their own measurements (4.18 / 3.46 / 4.05 / 3.52) · a locked wall refuses both the centerline and the interior setter until released ·
no other edit may stretch it either (a corner drag is refused; sliding both corners together is allowed) · a corner held by a measured wall is triangulated so both lengths come out exact ·
measurements that cannot physically meet are refused and nothing moves · interior measurements lock the same way and survive save/load, and a project saved before locks existed loads with every wall free ·
a lock blocks the length only, not thickness or anything else · after one measurement the next one grows into the free corner, leaving the held corner exactly where it was · with nothing measured yet the edge's first corner still anchors, as before.
E2E (1): type 4.18 on Wall 1 → Wall 3 follows (no lock) → lock Wall 1 → set Wall 3 to 4.05 → both hold → editing Wall 1 is refused with a message and the field snaps back →
the next measurement leaves the held corner untouched → lock and measure all four → 4.18 / 3.46 / 4.05 / 3.52 → survives a reload with three walls still locked.

## Laser unit tests (7)
Checksum and command frames reproduce the published captures byte for byte (`C0 55 02 01 00 1A`, `C0 56 01 00 1E`, `C0 40 00 EE`, heartbeat CRC `3A`) · the two captured measurement frames decode to 1.8251 m and 1.5144 m · heartbeats, laser-state and failure events, truncated frames, NaN, negative and out-of-range values are all rejected · frame parser: two frames in one indication, one frame split over two, wrong checksum reported not used, replies (status | length | data | CRC) · driver against a mock GATT: subscribe, status request written **with response**, heartbeat counted without a reading, results emitted (kinds 06 and 0A), Measure sends `C0 56 01 00 1E`, disconnect · the status reply's current display value is not emitted as a new measurement · a write that needs a response falls back to write-without-response.

E2E, measuring (1): heartbeats show "Link alive" without touching the plan → **Measure** writes `C0 56 01 00 1E` → the pushed result 2.750 m lands in Wall 1 and is named in the log.

E2E, aiming (1): connect with a room selected → the panel shows the next reading goes to Wall 1 → reading with no field focused fills Wall 1 and the aim moves to Wall 2 → second reading gives 13.02 m² → tap Wall 4, open the panel (focus lost), switch the advance off → two readings both land on Wall 4 → in Interior mode a 3.72 m reading sets the inside face and the centerline follows (3.87 m).

## Lowered ceiling tests
Unit (4): convex clipping · volume reduction, lowered area, soffit side faces (flush-with-wall edge excluded) · height/size validation · 2D label, DXF layer, 3D block heights, re-id, old-project migration.
E2E (1): draw zone with the tool → default 30 cm below ceiling → set 2.35 m → room shows 2.00 m² lowered → invalid 3 m rejected → 3D gains one part.

## Model import tests
Unit (5): binary = ASCII STL · OBJ quads / negative indices / v/vt/vn · mm→m, Z-up→Y-up, centring, hull · placed model scaled + rotated in 3D, 2D footprint, GLB export, JSON round-trip · unit auto-detect.
E2E (1): upload STL (mm) → detected 0.600 × 0.400 × 0.750 m → place → 3D part → persists after reload.

## Interior-dimension tests
Unit (7): interior = centerline − half of each neighbouring wall (3.85 × 3.35 for a 4.00 × 3.50 room with 15 cm walls) · editing an interior length is exact, keeps the anchored corner and the other direction · different wall thicknesses on the two ends · angled rooms and railing edges converge · invalid values and a door that no longer fits are refused without changing the model · interior mode dimensions the inside faces and labels the net area · projects saved earlier default to centerline.
E2E (1): switch the room panel to Interior → 3.85 / 3.35 → type a site measurement of 3.72 → net area and centerline geometry follow → PDF contains 3.72 m and 3.35 m and not the centerline value → switching back shows 3.87 m.

## Railing tests
Unit (7): standalone railing defaults (1.05 m, thin, bars) · converting a room wall keeps the area, reports railing length, removes that side from paintable wall area, and converts back to a full wall · doors/windows refused both ways · height validation 0.20–2.00 m and kind preserved through geometry edits · 2D has no solid wall body and differs per style (+ DXF/SVG) · 3D is open posts/rail capped at railing height, 3 solid walls remain, glass style adds a translucent panel · old projects without `kind` migrate to solid.
E2E (1): convert a room wall from the room panel → railing length 3.85 m → wall panel shows railing type/height → glass style + 1.10 m → 3D part count grows → draw a standalone railing with the tool → door refused with a message → survives reload.

## iPad tests (8, Chromium with touch + coarse pointer)
Portrait: icon rail, ≥44 px tools, drawer hidden → opens on selection → closes, 16 px inputs · tap 4 corners + Finish → 6.00 m² · typed length + direction buttons → 13.02 m² · long-press context menu, one-finger pan (exact offset, geometry untouched) · 3D walk pad. Landscape: docked panel, apple-touch-icon PNG + home-screen meta.
Tablet chrome: secondary tools hidden until **More** is opened and selecting from it works · −/+ steppers change ceiling height by 5 cm · draggable splitter resizes the 2D pane in split view.
Not covered: real WebKit/Safari, Apple Pencil, iOS on-screen keyboard behaviour.

## End-to-end tests (9)
1. **Primary acceptance (§23):** new project “My Apartment” → Floor 1 (+ add floor) → draw a room with the mouse →
   type 4.00 / 3.50 → **14.00 m²** → connected 3 × 3.5 room (7 walls, 1 shared) → **80 cm door** on the shared wall →
   **120 cm window** → sofa + dining table → wall 4.00 → 4.50: living **15.75 m²**, kitchen **8.75 m²** → undo/redo →
   3D (≥13 mesh parts, non-blank WebGL canvas) → 2D → export PDF (3 pages; text contains 15.75 m, 4.50 m, 3.50 m,
   scale) → reload → **project state deep-equal to before reload**, zero console/page errors.
2. Hebrew RTL: `dir=rtl`, Hebrew project/room names, +x stays to the right on screen, canvas container `ltr`, PDF exported.
3. Reference import: SVG plan → 2-point calibration (400 px = 8 m → 0.02 m/px) → room traced, 32.00 m².
4. Project management: create ×2, search, duplicate, delete to trash, restore.
5–7. Laser (simulated GLM injected by the test only): connect, enable command sent, reading → focused wall field (14.00 → 15.75 m²), reading → selected wall length 2.8 m.

**Not yet verified with a physical Bosch GLM 50-27 CG.**

## Not covered by automated tests
Touch/pinch on real devices, Firefox/Safari, PNG/JPEG/GLB/OBJ downloads through the UI (writers are unit-tested),
version-history UI, large-plan performance. No server, sync or authorization tests exist because those modules are not built.
