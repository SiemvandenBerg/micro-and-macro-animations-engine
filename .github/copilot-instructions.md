# Copilot Instructions for this Repository

## Project purpose and style constraints
- This is a browser-only Canvas 2D animation prototype (no framework, no bundler) focused on stylized character motion.
- Keep the visual grammar strict: white fill (`#ffffff`), black stroke (`#000000`), 2px stroke, minimal geometry. See `src/js/shapes.js`.
- Preserve the prototype scope from `README.md`: skeletal transforms + shape attachment + path deformation as independently toggleable systems.

## Runtime architecture (read before editing)
- Entry point is `src/index.html`, which loads `src/js/engine.js` as an ES module.
- `Engine` orchestrates update/render in this order: `AnimationPlayer.update()` → `Skeleton.solve()` → `PathDeformer.apply()` → `ShapeRenderer.draw()` → optional `Skeleton.draw()`.
- Character setup is centralized in `src/js/character.js`:
  - `buildSkeleton()` defines hierarchy + rest (`baseAngle`) pose.
  - `buildShapes()` binds drawables to bones with offsets.
  - `buildDeformBindings()` connects path points to bone influence.
  - `buildIdleClip()` defines the default looping animation.

## Module boundaries and data flow
- `src/js/skeleton.js`: FK bone tree, world-space solving, and debug overlay drawing.
- `src/js/animation.js`: keyframe tracks per bone ID, clip playback, seek support, sine ease interpolation.
- `src/js/shapes.js`: painter's algorithm via `drawOrder`; shape-local coordinates transformed by bound bone world transform.
- `src/js/deform.js`: mutates `path` shape points from captured rest pose using weighted angular deltas.
- `src/js/controls.js`: dev-panel wiring; controls directly mutate engine system flags and player/bone state.

## Project-specific editing conventions
- Keep files as plain ES modules with named exports; match the current class/function style.
- Prefer adding new character behavior in `character.js` first (bones, shapes, clips) instead of scattering constants.
- Bone IDs are the integration contract across skeleton, animation tracks, shape bindings, and deformation influences.
- If you add/rename a bone, update all four touchpoints (`buildSkeleton`, clip keyframes, shape bindings, deform bindings).
- Preserve draw order semantics (`shape.drawOrder`) to avoid accidental front/back layering regressions.
- Deformation relies on `captureRestPose()` after shape/binding setup; keep that lifecycle intact.

## Developer workflows
- Install deps: `npm install`
- Start local preview: `npm run dev` (serves `src/` on port `8080` via `npx serve`).
- Equivalent VS Code task: `🚀 Dev Server`.
- There is currently no automated test/build pipeline in `package.json`; validate changes by running and interacting with the dev panel.
- For console debugging, use `window.__engine` exposed in `engine.js`.

## High-value file references
- Engine loop and bootstrap: `src/js/engine.js`
- Character rig and idle clip: `src/js/character.js`
- Control panel UI logic: `src/js/controls.js`
- Canvas/dev panel layout: `src/css/styles.css`
