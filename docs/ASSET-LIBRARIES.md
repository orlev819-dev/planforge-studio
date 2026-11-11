# Where to get furniture models that are free to use

PlanForge now imports **glTF 2.0** (`.glb` and self-contained `.gltf`) as well as OBJ and STL, so any
of these libraries can be dropped straight into a project: Furniture tab → **My models** → ⇪.

The app itself ships no third-party models. Everything in its own catalogue is drawn parametrically
in code, so nothing has to be downloaded for the app to work offline.

## Licences, in plain terms

| Licence | What it means for you |
|---|---|
| **CC0 / public domain** | Use, change and redistribute freely, commercially too, no credit needed. The safest choice. |
| **CC BY 4.0** | Same freedoms, but you must credit the author wherever the model is shown. |
| **GPL** (e.g. Sweet Home 3D's own code) | Fine to *use* the program; do not copy its code into this one. Its furniture library has mixed licences — check each model. |

## Recommended sources

- **Poly Haven** — CC0 interior furniture (sofas, chairs, tables, shelves), high quality, GLB/glTF
  downloads. Heavy models: 20k–800k triangles each, so use the lower LOD where offered.
- **Kenney — Furniture Kit** (kenney.nl) — CC0, ~140 low-poly furniture models, a few KB each. Ideal
  for a web floor plan: they load instantly and read clearly in 3D. Also repackaged as a ready-made
  GLB pack ("Furniture Kit GLB Pack", CC0, 2.7 MB for all 140).
- **ambientCG** — CC0 PBR *materials* (wood, tile, stone). Useful as reference for picking finish
  colours; this renderer has no texture pipeline yet, so the maps themselves cannot be used.

Search terms that find more: `CC0 furniture glb`, `public domain interior 3d models`.

## Practical notes

- **Triangle budget.** The importer accepts up to 200,000 triangles per model and the app keeps the
  geometry inside the project file, so a 30 MB sofa will make the project slow to save and sync.
  Prefer models under ~50k triangles; decimate heavy ones in Blender (Decimate modifier) first.
- **Textures are not read.** glTF materials come in as their base colour, which is why flat-coloured
  kits (Kenney) look right and photo-textured models look plainer here than in a PBR viewer.
- **Units.** glTF is defined in meters and is detected as such. OBJ/STL have no units, so the import
  dialog guesses and lets you correct it.
- **Give credit where the licence asks for it.** CC BY models need the author's name wherever the
  plan is published; CC0 ones do not.
