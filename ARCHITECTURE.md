# Architecture

## Principles
1. **One document model, many views.** `Project → Floor → {vertices, walls, rooms, openings, furniture, dimensions, annotations, reference}`
   (`packages/shared-types`). The 2D canvas, 3D viewer, PDF, SVG, DXF, GLB, OBJ, CSV and the inspector all read it.
   Nothing keeps its own copy of the geometry.
2. **Real-world units.** Every coordinate is in meters in plan space (+x right/east, +y down/south). Pixels exist only
   inside the view transform `screen = world·scale + offset`. 3D is Y-up: plan (x, y) at height h maps to (x, elevation+h, y).
   DXF is Y-up, so exporters negate Y. That flips the axis but never mirrors the geometry.
3. **Commands, not mutation.** Each edit is a pure function `Floor → Floor` in `packages/geometry/src/commands.ts`
   that either returns a new, fully validated floor or throws `GeometryError`. The app store keeps a
   `{label, before}` history, so undo and redo are exact snapshot swaps. A multi-object edit (moving a shared wall,
   rotating a room together with its doors and furniture) is a single command, which makes it a single transaction.
4. **Never silently corrupt.** `finalize()` runs after every command. It rebuilds walls from room edges, reattaches
   openings by world position (after splits), removes orphan vertices, and calls `validateFloor()`. That function
   checks simple polygons, no room overlap, positive sizes, that every opening fits its wall, and that openings do not overlap.

## Geometry kernel (`packages/geometry`)
- **Topology:** rooms are cycles of shared vertex IDs. A wall is the unique edge `{a, b}` between two vertices, or a
  standalone partition. Adjacent rooms share vertices, so they share walls (`exterior` is set automatically:
  1 room means exterior, 2 means interior). When a new room's corner lands on another room's edge, that edge is split
  (T-junction) so both rooms reference the same vertices.
- **Wall convention:** room polygons follow wall **centerlines**. *Gross area* is the centerline polygon. *Net area*
  is that polygon inset by half of each edge's wall thickness (`insetPolygon`). Volume, ceiling area and wall
  surface are derived from the net outline, minus openings.
- **Constraint solving for dimensions:** `setWallLength` keeps the anchor corner fixed and moves the other end along
  the wall. It does a BFS through walls that are perpendicular at the moving corner and translates those too, so
  rectangles stay rectangular and shared walls carry the neighbour along. Openings are measured from wall vertex `a`,
  so they keep their offset from the anchor.
- **Operations:** add room (rectangle/polygon), move/insert/delete corner, move wall (parallel), set wall length/angle,
  split/merge rooms, merge collinear walls, move/rotate room (detaches shared corners and carries its own doors and
  furniture), partition walls, openings, furniture, dimensions, annotations, floors (add/duplicate/re-id), project duplicate.
- `schema.ts` (zod) validates projects that are imported or loaded, both structurally and geometrically.

## 2D editor (`apps/web/src/editor`)
- `cad-io/drawing.ts` turns a floor into a renderer-independent **drawing list** (polygons, arcs, text, dimension prims,
  with layers). The canvas painter (`paint.ts`) and the PDF, SVG and DXF writers all render this same list, so the
  screen and the exports cannot drift apart.
- `Canvas2D.tsx` handles hit-testing (handles → vertices → openings → furniture → notes → dimensions → walls → rooms),
  snapping (vertex, wall midpoint, on-wall, alignment guides, 45° angle, adaptive grid) and tools. A drag runs the real
  command on each pointer move against the drag's base floor to give a live preview, then commits one undoable command on release.
- The canvas container is always `dir="ltr"`, so switching to Hebrew never mirrors the drawing.

## 3D (`packages/renderer-3d`)
- `mesh.ts` builds `MeshPart[]` per wall, floor slab, ceiling, door leaf, glass and furniture group. Walls are split into
  prisms around openings (below the sill and above the head), which makes real holes. Every part has a content `key`.
- `webgl.ts` uploads a part only when its key is new and frees buffers whose key has disappeared. A furniture edit
  therefore re-uploads one part, not the scene. The app caches meshes per immutable `Floor` object in a WeakMap.
  It supports colour-ID picking, orbit/ortho/top/iso cameras, a WASD walk mode, and transparent/hidden walls.

## Persistence (`apps/web/src/db.ts`, `store.ts`)
- IndexedDB stores `projects` (the latest state) and `snapshots` (version history). Autosave is debounced by 400 ms
  and also flushes on `visibilitychange` and `beforeunload`. A service worker precaches the whole build, so the app
  opens and edits offline.
- `window.__planforge.getState()` is a read-only hook used by the E2E tests to compare model state before and after reload.

## Exports (`packages/cad-io`)
| Format | Implementation | Validation in tests |
|---|---|---|
| PDF | pdf-lib vector drawing at a standard scale (1:N), title block, legend, scale bar, header/footer/logo, room schedule page | pdf-lib load, page size, pdf.js text extraction |
| SVG | meters as user units, mm width/height at 1:50, one group per layer | sax strict XML parse |
| DXF | R12 ASCII, layers, POLYLINE/ARC/TEXT/LINE, `\U+` escapes for Hebrew | own group-code parser, coordinates |
| GLB | glTF 2.0 binary with accessors, min/max and materials | header/chunk parse, accessor ↔ bufferView sizes, index bounds, world bounds |
| OBJ/MTL | per-part objects | face indices within the vertex count |
| CSV | room schedule, UTF-8 BOM | content check |
| JSON | `{format:'planforge-project', version, project}` | zod + geometric re-validation round trip |

## Planned (not built)
`apps/api` (Fastify + PostgreSQL/Prisma: auth, workspaces, RBAC enforced on the server, revision-based sync, audit log),
`packages/estimating` (quantity takeoff from `roomMetrics` × price lists, VAT/ILS configurable), and native
`apps/mobile` implementing the `packages/scanning` interfaces.
