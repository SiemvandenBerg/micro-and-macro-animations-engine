# Micro and Macro Animations Engine

A style-first character animation workshop for building signature 2D motion from reusable rigs and vector assets.

## Pitch

We want full artistic control over our animated characters instead of relying on stock motion libraries. This engine is our experimental playground: a small, focused tool where we define the visual language, rig the characters, animate loops, and export the results in formats we can use everywhere.

The style is intentionally minimal: **white fill, black outline, no shading**. Every character is built from simple geometric shapes bound to a skeleton. The constraint is the point — it forces the motion itself to carry all the personality.

## Design Brief

### Visual Grammar

| Element | Rule |
|---------|------|
| **Fill** | White (`#FFFFFF`) only. No gradients, no textures. |
| **Stroke** | Black (`#000000`), uniform weight (2px at reference scale). |
| **Shapes** | Ellipses, rounded rectangles, simple paths. No detail decoration. |
| **Character** | Assembled from ~10-15 discrete shape parts attached to bones. |
| **Silhouette** | Must read clearly at 64×64px. If the pose is ambiguous at icon size, simplify. |
| **Motion** | Personality lives in timing and easing, not in complexity. Fewer keyframes, better curves. |

### Prototype Character: Placeholder Person

A standing human figure made from minimal shapes:

```
 ( o )          ← Head: ellipse
   |            ← Neck: line segment
 ┌─┼─┐         ← Torso: rounded rect
 / | \         ← Upper arms: lines or thin rects
╱  |  ╲        ← Lower arms: lines or thin rects
   |            ← Spine/hip connection
  ╱ ╲           ← Upper legs: lines or thin rects
 ╱   ╲          ← Lower legs: lines or thin rects
▬     ▬         ← Feet: small rounded rects
```

Each body part is a separate shape with its own fill+stroke, attached to a bone via a pivot point.

### First Animation: Idle Loop

A subtle standing idle. The character breathes and shifts weight slightly. No walking, no gesturing — just alive.

Motion targets:
- **Torso**: slow vertical oscillation (~2px, sine ease, 2s period)
- **Head**: slight tilt following torso with ~100ms delay
- **Arms**: gentle pendulum swing, asymmetric timing (left: 2.2s, right: 1.8s)
- **Legs**: near-static, slight knee bend synced to torso drop
- **Spine**: subtle compression on inhale phase
- **Hair/extras**: secondary motion; follows head with overshoot

## Architecture

### Three Motion Systems (all MVP, all toggleable)

The prototype implements three independent motion approaches. Each can be enabled or disabled at runtime via dev controls. They compose when multiple are active.

#### 1. Skeletal Transforms

A bone hierarchy where each bone has position, rotation, and scale. Child bones inherit parent transforms. Animation is defined as keyframed bone rotations over time.

- Bones: `root → spine → chest → head`, `chest → shoulder_L → elbow_L → hand_L`, etc.
- Each bone stores: `{ angle, length, origin }`
- Keyframes define bone angles at specific times; the engine interpolates between them.

#### 2. Shape Attachment

Each visual shape (ellipse, rect, path) is bound to a bone. The shape has a local offset and pivot relative to its bone. When the bone transforms, the shape follows.

- Binding: `{ boneId, offset: {x, y}, pivot: {x, y}, rotation: 0 }`
- Shapes are rendered in a defined draw order (painter's algorithm, back to front).
- Shapes have no awareness of each other — all positioning comes from bones.

#### 3. Path Deformation

For shapes defined as paths (outlines, limbs, organic curves), control points can be influenced by nearby bones. This enables soft bending and squash/stretch on contour lines.

- Each path point can have a `boneInfluence: [{ boneId, weight }]` list.
- When a bone moves, influenced points shift proportionally.
- This is the most experimental system — the MVP just needs to visibly bend a limb outline.

### Dev Controls Panel

A collapsible panel overlaid on the canvas with:

| Control | Type | Purpose |
|---------|------|---------|
| **Skeleton visible** | Toggle | Show/hide bone debug overlay |
| **Shape attachment** | Toggle | Enable/disable shape-following-bone rendering |
| **Path deformation** | Toggle | Enable/disable vertex displacement |
| **Skeletal animation** | Toggle | Freeze/unfreeze bone keyframe playback |
| **Playback speed** | Slider (0–2×) | Control animation tempo |
| **Current time** | Slider | Scrub through the animation timeline |
| **Bone angles** | Per-bone sliders | Manually pose individual bones |

When a system is toggled off, its effect is removed from the render but the others keep working. This lets you isolate and compare each motion layer.

## Tech Stack

- **Runtime**: Vanilla JS + HTML Canvas 2D (zero dependencies for the prototype)
- **Animation loop**: `requestAnimationFrame` with delta-time accumulator
- **Data format**: JSON for rig definitions, keyframes, and shape bindings
- **Dev controls**: HTML/CSS panel, no framework

## Project Structure

```
src/
  index.html          ← Entry point, canvas + dev panel
  css/
    styles.css        ← Dev panel and canvas layout
  js/
    engine.js         ← Main loop, timing, render orchestration
    skeleton.js       ← Bone hierarchy, FK transforms
    shapes.js         ← Shape definitions, bone binding, draw
    deform.js         ← Path point displacement from bones
    animation.js      ← Keyframe storage, interpolation, playback
    controls.js       ← Dev panel wiring
    character.js      ← Placeholder person: bones + shapes + animation data
animations/
  styles/
    examples/         ← Icons8 reference files
```

## Collaboration

- Repository: `SiemvandenBerg/micro-and-macro-animations-engine`
- Workflow: push to main, but always pull and merge first
- Commit style: direct, clear titles, emoji markers where they help

## Stretch Goals (later)

- Figma vector round-trip: export SVG layers, edit in Figma, reimport
- Lottie JSON export adapter
- GIF render export
- Scene objects and camera tracking
- Particle effects at keyframe triggers
- BVH motion data import
- Color scheme and style mode toggles

## Onboarding

### Set Up Luuk

- Log in to GitHub Copilot
- Configure GitHub credentials and token access
- Set up Git locally
- Set up task shortcuts
