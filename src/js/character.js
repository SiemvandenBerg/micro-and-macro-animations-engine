// character.js — Placeholder person: bones, shapes, animation, and deform bindings
// All measurements assume the character is roughly 200px tall, centered on the canvas.

import { Shape } from './shapes.js';
import { AnimationClip } from './animation.js';

const deg = (d) => d * Math.PI / 180;

// Helper: configure a bone's rest pose
function pose(skeleton, id, px, py, rot) {
  const b = skeleton.getBone(id);
  b.positionX = px;
  b.positionY = py;
  b.rotation = rot;
}

// --- Skeleton definition ---
// Uses the unified AE-style transform model: each bone has position, rotation, scale, anchor.
// Position is relative to parent's anchor. No bone lengths — children attach at anchor.
export function buildSkeleton(skeleton) {
  //                         id              parent
  skeleton.addBone(          'root',          null);
  skeleton.addBone(          'spine',         'root');
  skeleton.addBone(          'chest',         'spine');
  skeleton.addBone(          'neck',          'chest');
  skeleton.addBone(          'head',          'neck');

  skeleton.addBone(          'shoulder_L',    'chest');
  skeleton.addBone(          'elbow_L',       'shoulder_L');
  skeleton.addBone(          'hand_L',        'elbow_L');

  skeleton.addBone(          'shoulder_R',    'chest');
  skeleton.addBone(          'elbow_R',       'shoulder_R');
  skeleton.addBone(          'hand_R',        'elbow_R');

  skeleton.addBone(          'hip_L',         'root');
  skeleton.addBone(          'knee_L',        'hip_L');
  skeleton.addBone(          'foot_L',        'knee_L');

  skeleton.addBone(          'hip_R',         'root');
  skeleton.addBone(          'knee_R',        'hip_R');
  skeleton.addBone(          'foot_R',        'knee_R');

  // Tip bones — no shapes, purely for dragging to rotate the parent foot/hand
  skeleton.addBone(          'hand_tip_L',    'hand_L');
  skeleton.addBone(          'hand_tip_R',    'hand_R');
  skeleton.addBone(          'foot_tip_L',    'foot_L');
  skeleton.addBone(          'foot_tip_R',    'foot_R');

  // Rest pose positions (relative to parent anchor) and rotations
  // Spine chain goes upward: position offsets are "up" in parent local space
  pose(skeleton, 'root',        0,    0,    0);
  pose(skeleton, 'spine',       0,    0,    deg(-90));     // points up
  pose(skeleton, 'chest',       40,   0,    0);            // 40px along spine
  pose(skeleton, 'neck',        35,   0,    0);            // 35px along chest
  pose(skeleton, 'head',        12,   0,    0);            // 12px along neck

  // Shoulders branch from chest end sideways (perpendicular in chest-local space)
  pose(skeleton, 'shoulder_L',  30,  -18,   deg(190));     // left shoulder, angled down
  pose(skeleton, 'elbow_L',     20,   0,    deg(-5));      // 20px along shoulder
  pose(skeleton, 'hand_L',      28,   0,    deg(-5));      // 28px along elbow

  pose(skeleton, 'shoulder_R',  30,   18,   deg(-190));    // right shoulder, mirrored
  pose(skeleton, 'elbow_R',     20,   0,    deg(5));
  pose(skeleton, 'hand_R',      28,   0,    deg(5));

  // Hips branch from root sideways
  pose(skeleton, 'hip_L',       10,   0,    deg(95));      // slightly left, angled down
  pose(skeleton, 'knee_L',      30,   0,    deg(-5));      // 30px along hip
  pose(skeleton, 'foot_L',      32,   0,    deg(-85));     // 32px along knee

  pose(skeleton, 'hip_R',      -10,   0,    deg(85));      // right side
  pose(skeleton, 'knee_R',      30,   0,    deg(5));
  pose(skeleton, 'foot_R',      32,   0,    deg(-85));

  // Tip bones: positioned at the far end of the hand/foot shapes
  // hand shape rx=7 → tip at x=14; foot shape width=16 → tip at x=16
  pose(skeleton, 'hand_tip_L',  14,   0,    0);
  pose(skeleton, 'hand_tip_R',  14,   0,    0);
  pose(skeleton, 'foot_tip_L',  16,   0,    0);
  pose(skeleton, 'foot_tip_R',  16,   0,    0);

  skeleton.captureRestPose();
}

// --- Shape definitions ---
export function buildShapes(renderer) {
  // Colour palette — matches reference illustration
  const SKIN  = '#f5ddc0';  // pale cream  — face, hands
  const NAVY  = '#2d3a4a';  // dark navy   — sweater, sleeves
  const PANTS = '#f0f0ea';  // off-white   — trousers
  const DARK  = '#111827';  // near-black  — hair, shoes

  // Stroke: white on dark fills, near-black on light fills
  const strokeFor = (hex) => {
    const c = parseInt(hex.replace('#', ''), 16);
    const lum = 0.299 * ((c >> 16) & 0xff) + 0.587 * ((c >> 8) & 0xff) + 0.114 * (c & 0xff);
    return lum < 128 ? '#ffffff' : '#020618';
  };

  const s = (id, type, props, binding, order, fill, noStroke = false) => {
    const shape = new Shape(id, type, props, binding);
    shape.drawOrder = order;
    shape.fill = fill;
    if (!noStroke) shape.stroke = strokeFor(fill);
    renderer.addShape(shape);
    return shape;
  };

  // Legs (off-white trousers)
  s('leg_L', 'tribone-quad', { height: 14, radius: 6, length3: 14 },
    { boneId: 'hip_L', boneId2: 'knee_L', boneId3: 'foot_L', offset: { x: 0, y: 0 }, rotation: 0 }, 1, PANTS);

  // arm_R behind torso — draw before legs_R and torso
  s('arm_R', 'tribone-quad', { height: 12, radius: 5, length3: 14 },
    { boneId: 'shoulder_R', boneId2: 'elbow_R', boneId3: 'hand_R', offset: { x: 0, y: 0 }, rotation: 0 }, 2, NAVY);

  s('leg_R', 'tribone-quad', { height: 14, radius: 6, length3: 14 },
    { boneId: 'hip_R', boneId2: 'knee_R', boneId3: 'foot_R', offset: { x: 0, y: 0 }, rotation: 0 }, 3, PANTS);

  // Shoes (near-black, bound to foot-tip bones)
  s('shoe_L', 'rect', { width: 38, height: 18, radius: 5 },
    { boneId: 'foot_tip_L', offset: { x: -6, y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 4, DARK);

  s('shoe_R', 'rect', { width: 38, height: 18, radius: 5 },
    { boneId: 'foot_tip_R', offset: { x: -6, y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 5, DARK);

  // Torso (dark navy sweater) — no stroke
  s('torso', 'bibone-quad', { height: 40, radius: 8, length2: 30 },
    { boneId: 'spine', boneId2: 'chest', offset: { x: 0, y: 0 }, rotation: 0 }, 6, NAVY, true);

  // arm_L in front of torso
  s('arm_L', 'tribone-quad', { height: 12, radius: 5, length3: 14 },
    { boneId: 'shoulder_L', boneId2: 'elbow_L', boneId3: 'hand_L', offset: { x: 0, y: 0 }, rotation: 0 }, 7, NAVY);

  // Hair back — centered above head center so it peeks out at the top
  const hairBack = new Shape('hair_back', 'ellipse', { rx: 21, ry: 23 },
    { boneId: 'head', offset: { x: 16, y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 });
  hairBack.drawOrder = 8;
  hairBack.fill = DARK;
  renderer.addShape(hairBack);

  // Hands (skin-tone, at wrist tips)
  const handL = new Shape('hand_L_shape', 'ellipse', { rx: 8, ry: 7 },
    { boneId: 'hand_tip_L', offset: { x: 0, y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 });
  handL.drawOrder = 9;
  handL.fill = SKIN;
  handL.stroke = strokeFor(SKIN);
  renderer.addShape(handL);

  const handR = new Shape('hand_R_shape', 'ellipse', { rx: 8, ry: 7 },
    { boneId: 'hand_tip_R', offset: { x: 0, y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 });
  handR.drawOrder = 2;
  handR.fill = SKIN;
  handR.stroke = strokeFor(SKIN);
  renderer.addShape(handR);

  // Head (skin-tone, drawn over hair back)
  const headShape = new Shape('head_shape', 'ellipse', { rx: 18, ry: 20 },
    { boneId: 'head', offset: { x: 10, y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 });
  headShape.drawOrder = 10;
  headShape.fill = SKIN;
  headShape.stroke = strokeFor(SKIN);
  renderer.addShape(headShape);

}

// --- Deform bindings (path deformation demo) ---
export function buildDeformBindings(deformer) {
  // No bindings currently — torso outline was removed
}

// --- Catalyst Man pose ---
// Rotates the standard skeleton to the walking stride shown in the Catalyst Man PNG:
// left leg back, right leg forward, arms counter-swinging.
// Call AFTER buildSkeleton(). Does NOT call captureRestPose — that happens after shapes.
export function applyCatalystManPose(skeleton) {
  const b = (id) => skeleton.getBone(id);

  // Spine: slight forward lean
  b('spine').rotation    = deg(-92);

  // Left leg — back swing
  b('hip_L').rotation    = deg(120);
  b('knee_L').rotation   = deg(-20);
  b('foot_L').rotation   = deg(-100);

  // Right leg — forward swing
  b('hip_R').rotation    = deg(60);
  b('knee_R').rotation   = deg(5);
  b('foot_R').rotation   = deg(-85);

  // Left arm — forward swing (opposite left leg)
  b('shoulder_L').rotation = deg(170);
  b('elbow_L').rotation    = deg(-15);

  // Right arm — back swing (opposite right leg)
  b('shoulder_R').rotation = deg(-210);
  b('elbow_R').rotation    = deg(5);
}

// --- Catalyst Man skeleton ---
// Bone positions derived from the SVG skeleton overlay (Skeleton.svg, viewBox 0 0 2000 2700).
// All positions are in SVG-pixel world units (Y-down). The engine's _sizeCanvas sets
// scale = min(canvasW/2000, canvasH/2700) and offsets rootX/rootY so that SVG (0,0)
// maps to the top-left corner of the contained PNG background.
// The root bone's positionX/Y = the SVG pixel position of the hip circle (618, 784).
// Every child bone's positionX/Y = 0 (starts at parent's anchor), so local rotation
// and anchorX encode the direction and length of each limb segment.
export function buildCatalystManSkeleton(skeleton) {
  // All bones use rotation=0 at rest. Each bone's positionX/Y is the direct
  // world-space offset from the parent's anchor so that bone.worldX/worldY
  // (= where the pink dot appears) lands on the corresponding SVG circle.
  //
  // SVG viewBox 0 0 2000 2700 — exact circle positions from Skeleton.svg:
  //   root/hip   (618, 784)    chest  (780, 653)    head   (780, 445)
  //   knee_L     (641, 1173)   foot_L (721, 1863)   toe_L  (578, 2448)
  //   knee_R     (897, 1292)   foot_R (1270, 1797)
  // Arms estimated from the illustration (no SVG circles for them).

  skeleton.addBone('root',          null);
  skeleton.addBone('spine',         'root');
  skeleton.addBone('chest',         'spine');
  skeleton.addBone('neck',          'chest');
  skeleton.addBone('head',          'neck');

  skeleton.addBone('shoulder_L',    'chest');
  skeleton.addBone('elbow_L',       'shoulder_L');
  skeleton.addBone('hand_L',        'elbow_L');

  skeleton.addBone('shoulder_R',    'chest');
  skeleton.addBone('elbow_R',       'shoulder_R');
  skeleton.addBone('hand_R',        'elbow_R');

  skeleton.addBone('hip_L',         'root');
  skeleton.addBone('knee_L',        'hip_L');
  skeleton.addBone('shin_L',        'knee_L');
  skeleton.addBone('foot_L',        'shin_L');
  skeleton.addBone('ankle_L',       'foot_L');

  skeleton.addBone('hip_R',         'root');
  skeleton.addBone('knee_R',        'hip_R');
  skeleton.addBone('shin_R',        'knee_R');
  skeleton.addBone('foot_R',        'shin_R');
  skeleton.addBone('ankle_R',       'foot_R');

  skeleton.addBone('hand_tip_L',    'hand_L');
  skeleton.addBone('hand_tip_R',    'hand_R');
  // foot_tip_L/R replaced by ankle_L/R above

  const b = (id) => skeleton.getBone(id);
  // Helper: set local position offset so the bone's dot lands at (tx, ty)
  // given its parent anchor is at (px, py). All rests have rotation=0 so
  // positionX/Y are world-aligned deltas.
  const at = (id, px, py, tx, ty) => {
    b(id).positionX = tx - px;
    b(id).positionY = ty - py;
  };

  // --- ROOT ---  dot at SVG hip (618, 784)
  b('root').positionX = 618;
  b('root').positionY = 784;

  // --- TORSO / HEAD ---   parent anchor after root = (618, 784)
  at('spine',       618, 784,  780, 653);  // dot at chest junction ✓
  at('chest',       780, 653,  780, 653);  // zero-offset junction (stacked, that's OK)
  at('neck',        780, 653,  780, 653);  // idem
  at('head',        780, 653,  780, 445);  // dot at head circle ✓

  // --- ARM positions estimated from illustration anatomy ---
  // shoulder_L = character's left = FORWARD arm (screen-right), shoulder at x>chest
  // shoulder_R = character's right = BACK arm (screen-left, behind body)

  // Back arm (character right, behind body)
  at('shoulder_R',  780, 653,  730, 705);   // slightly left+down from chest
  at('elbow_R',     730, 705,  620, 930);   // back and down
  at('hand_R',      620, 930,  600, 1150);  // trailing hand
  b('hand_tip_R').positionX = -20;
  b('hand_tip_R').positionY =  80;

  // Forward arm (character left, in front of body)
  at('shoulder_L',  780, 653,  870, 690);   // slightly right+down from chest
  at('elbow_L',     870, 690,  1050, 960);  // extends forward+down
  at('hand_L',      1050, 960, 1150, 1220); // forward hand at hip level
  b('hand_tip_L').positionX =  60;
  b('hand_tip_L').positionY =  80;

  // --- LEFT (forward) LEG ---
  // hip_L  = hip joint pivot, zero-offset from root
  // knee_L = visual knee joint
  // shin_L = mid-shin (halfway between knee and ankle)
  // foot_L = ankle joint
  // ankle_L = toe/shoe tip
  at('hip_L',   618, 784,  618, 784);  // hip pivot (zero-offset from root)
  at('knee_L',  618, 784,  641, 1173); // dot at actual knee ✓
  at('shin_L',  641, 1173, 681, 1518); // dot at mid-shin (halfway)
  at('foot_L',  681, 1518, 721, 1863); // dot at ankle ✓
  at('ankle_L', 721, 1863, 578, 2448); // dot at toe/shoe tip

  // --- RIGHT (back) LEG ---
  at('hip_R',   618, 784,  618, 784);  // hip pivot (zero-offset from root)
  at('knee_R',  618, 784,  897, 1292); // dot at right knee ✓
  at('shin_R',  897, 1292, 1084, 1545); // dot at right mid-shin
  at('foot_R',  1084, 1545, 1270, 1797); // dot at right ankle ✓
  at('ankle_R', 1270, 1797, 1370, 1910); // dot at right toe/shoe tip

  skeleton.captureRestPose();
}

// --- Walk animation clip ---
// One full stride = 1.2s, loops seamlessly.
// Rest pose reference: hip_L=95°, hip_R=85°, knee_L=-5°, knee_R=5°,
//   foot_L=foot_R=-85°, shoulder_L=190°, shoulder_R=-190°
//
// Convention: positive hip delta = leg swings forward, negative = backward.
// Knee bends (negative local rotation) during back-swing to lift the foot.
// Foot counter-rotates to stay roughly parallel to ground.
// Arms swing opposite to ipsilateral leg (walk counter-swing).
export function buildIdleClip() {
  const clip = new AnimationClip('idle', 1.2, true);
  const T = 1.2;
  const h = T / 2; // 0.6s — half cycle

  // --- Spine: slight lateral rock, in phase with step ---
  clip.addKeyframe(0.0, 'spine', deg(-90));
  clip.addKeyframe(h/2, 'spine', deg(-91));
  clip.addKeyframe(h,   'spine', deg(-90));
  clip.addKeyframe(h + h/2, 'spine', deg(-91));
  clip.addKeyframe(T,   'spine', deg(-90));

  // --- Chest: slight counter-rotate for natural upper-body twist ---
  clip.addKeyframe(0.0, 'chest', deg(2));
  clip.addKeyframe(h,   'chest', deg(-2));
  clip.addKeyframe(T,   'chest', deg(2));

  // --- Head: stays mostly upright, tiny bob ---
  clip.addKeyframe(0.0, 'head', deg(0));
  clip.addKeyframe(h,   'head', deg(1));
  clip.addKeyframe(T,   'head', deg(0));

  // ---- LEFT LEG ----
  // t=0:   forward swing (hip forward, knee straight, foot flat)
  // t=h:   back swing   (hip back,    knee bent,    foot lifted)
  clip.addKeyframe(0.0, 'hip_L', deg(95 - 25));  // forward: 70°
  clip.addKeyframe(h,   'hip_L', deg(95 + 25));  // back:    120°
  clip.addKeyframe(T,   'hip_L', deg(95 - 25));

  clip.addKeyframe(0.0, 'knee_L', deg(-5));       // straight when forward
  clip.addKeyframe(h * 0.4, 'knee_L', deg(-30));  // bends as leg swings back
  clip.addKeyframe(h,   'knee_L', deg(-20));       // still bent at back
  clip.addKeyframe(h + h * 0.4, 'knee_L', deg(-5)); // straightens as it comes forward
  clip.addKeyframe(T,   'knee_L', deg(-5));

  clip.addKeyframe(0.0, 'foot_L', deg(-85));      // flat on stride
  clip.addKeyframe(h * 0.4, 'foot_L', deg(-60));  // toe-off / lift
  clip.addKeyframe(h,   'foot_L', deg(-100));      // dorsiflexed mid-swing
  clip.addKeyframe(T,   'foot_L', deg(-85));

  // ---- RIGHT LEG — half-cycle offset (opposite phase) ----
  clip.addKeyframe(0.0, 'hip_R', deg(85 + 25));  // back:    110°
  clip.addKeyframe(h,   'hip_R', deg(85 - 25));  // forward: 60°
  clip.addKeyframe(T,   'hip_R', deg(85 + 25));

  clip.addKeyframe(0.0, 'knee_R', deg(20));
  clip.addKeyframe(h * 0.4, 'knee_R', deg(5));
  clip.addKeyframe(h,   'knee_R', deg(5));
  clip.addKeyframe(h + h * 0.4, 'knee_R', deg(30));
  clip.addKeyframe(T,   'knee_R', deg(20));

  clip.addKeyframe(0.0, 'foot_R', deg(-100));
  clip.addKeyframe(h,   'foot_R', deg(-85));
  clip.addKeyframe(h + h * 0.4, 'foot_R', deg(-60));
  clip.addKeyframe(T,   'foot_R', deg(-100));

  // ---- ARMS — swing opposite to contra-lateral leg ----
  // L arm swings back when L leg is forward (and vice versa)
  clip.addKeyframe(0.0, 'shoulder_L', deg(190 + 20)); // back when L leg forward
  clip.addKeyframe(h,   'shoulder_L', deg(190 - 20)); // forward when L leg back
  clip.addKeyframe(T,   'shoulder_L', deg(190 + 20));

  clip.addKeyframe(0.0, 'shoulder_R', deg(-190 - 20)); // forward when R leg back
  clip.addKeyframe(h,   'shoulder_R', deg(-190 + 20)); // back when R leg forward
  clip.addKeyframe(T,   'shoulder_R', deg(-190 - 20));

  // Elbow swings slightly with the arm for a natural carry angle
  clip.addKeyframe(0.0, 'elbow_L', deg(-5));
  clip.addKeyframe(h,   'elbow_L', deg(-15));
  clip.addKeyframe(T,   'elbow_L', deg(-5));

  clip.addKeyframe(0.0, 'elbow_R', deg(15));
  clip.addKeyframe(h,   'elbow_R', deg(5));
  clip.addKeyframe(T,   'elbow_R', deg(15));

  return clip;
}
