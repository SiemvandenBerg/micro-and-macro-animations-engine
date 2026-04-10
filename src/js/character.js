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
  const s = (id, type, props, binding, order, fill) => {
    const shape = new Shape(id, type, props, binding);
    shape.drawOrder = order;
    shape.fill = fill;
    renderer.addShape(shape);
  };

  // Draw order: legs back, torso, arms front, head on top
  // Shapes are centered along their bone: offset.x = bone.length/2, width = bone.length.
  // The renderer translates to bone.worldX/Y and rotates by worldAngle, so
  // local +X runs along the bone toward its child joint; local +Y is perpendicular.

  // Left leg — one seamless shape from hip to foot tip
  // tribone-quad: hip_L → knee_L → foot_L, extending 16px past foot joint
  s('leg_L', 'tribone-quad', { height: 14, radius: 5, length3: 16 },
    { boneId: 'hip_L', boneId2: 'knee_L', boneId3: 'foot_L', offset: { x: 0, y: 0 }, rotation: 0 }, 1, '#4a90d9');

  // Right leg
  s('leg_R', 'tribone-quad', { height: 14, radius: 5, length3: 16 },
    { boneId: 'hip_R', boneId2: 'knee_R', boneId3: 'foot_R', offset: { x: 0, y: 0 }, rotation: 0 }, 2, '#d94a7b');

  // Torso: single seamless shape spanning spine (40px) \u2192 chest (35px).
  // bibone-quad draws one miter-joined polygon in world space \u2014 no visible seam at any angle.
  s('torso', 'bibone-quad', { height: 44, radius: 8, length2: 35 },
    { boneId: 'spine', boneId2: 'chest', offset: { x: 0, y: 0 }, rotation: 0 }, 5, '#a8d8ea');

  // Left arm — one seamless shape from shoulder to hand tip
  // tribone-quad: shoulder_L → elbow_L → hand_L, extending 14px past hand joint
  s('arm_L', 'tribone-quad', { height: 10, radius: 4, length3: 14 },
    { boneId: 'shoulder_L', boneId2: 'elbow_L', boneId3: 'hand_L', offset: { x: 0, y: 0 }, rotation: 0 }, 6, '#6bc477');

  // Right arm
  s('arm_R', 'tribone-quad', { height: 10, radius: 4, length3: 14 },
    { boneId: 'shoulder_R', boneId2: 'elbow_R', boneId3: 'hand_R', offset: { x: 0, y: 0 }, rotation: 0 }, 7, '#c4a06b');

  // Head: ellipse centered along the head bone (length 20), sitting above neck
  const headShape = new Shape('head_shape', 'ellipse', { rx: 18, ry: 20 },
    { boneId: 'head', offset: { x: 10, y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 });
  headShape.drawOrder = 10;
  headShape.fill = '#ffcc88';
  renderer.addShape(headShape);
}

// --- Deform bindings (path deformation demo) ---
export function buildDeformBindings(deformer) {
  // No bindings currently — torso outline was removed
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
