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

  // Left leg  (hip_L=30, knee_L=32, foot_L=8)
  // offset.x = half bone length (along bone); width = bone length, height = limb width
  s('thigh_L', 'rect', { width: 30, height: 14, radius: 5 },
    { boneId: 'hip_L',  offset: { x: 15, y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 1, '#4a90d9');
  s('shin_L',  'rect', { width: 32, height: 12, radius: 5 },
    { boneId: 'knee_L', offset: { x: 16, y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 1, '#5ba0e6');
  s('foot_shape_L', 'rect', { width: 16, height: 8, radius: 3 },
    { boneId: 'foot_L', offset: { x: 8,  y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 1, '#3b7cc4');

  // Right leg  (hip_R=30, knee_R=32, foot_R=8)
  s('thigh_R', 'rect', { width: 30, height: 14, radius: 5 },
    { boneId: 'hip_R',  offset: { x: 15, y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 2, '#d94a7b');
  s('shin_R',  'rect', { width: 32, height: 12, radius: 5 },
    { boneId: 'knee_R', offset: { x: 16, y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 2, '#e65b8c');
  s('foot_shape_R', 'rect', { width: 16, height: 8, radius: 3 },
    { boneId: 'foot_R', offset: { x: 8,  y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 2, '#c43b6a');

  // Torso: one rect spanning spine (40) + chest (35) = 75px, centered on spine
  s('torso', 'rect', { width: 75, height: 44, radius: 8 },
    { boneId: 'spine', offset: { x: 37.5, y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 5, '#a8d8ea');

  // Left arm  (shoulder_L=20, elbow_L=28, hand_L=14)
  s('upper_arm_L', 'rect', { width: 20, height: 10, radius: 4 },
    { boneId: 'shoulder_L', offset: { x: 10, y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 6, '#6bc477');
  s('lower_arm_L', 'rect', { width: 28, height: 9,  radius: 4 },
    { boneId: 'elbow_L',    offset: { x: 14, y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 6, '#7dd48a');
  s('hand_shape_L', 'ellipse', { rx: 7, ry: 7 },
    { boneId: 'hand_L',     offset: { x: 7,  y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 6, '#f5c6a0');

  // Right arm  (shoulder_R=20, elbow_R=28, hand_R=14)
  s('upper_arm_R', 'rect', { width: 20, height: 10, radius: 4 },
    { boneId: 'shoulder_R', offset: { x: 10, y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 7, '#c4a06b');
  s('lower_arm_R', 'rect', { width: 28, height: 9,  radius: 4 },
    { boneId: 'elbow_R',    offset: { x: 14, y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 7, '#d4b07d');
  s('hand_shape_R', 'ellipse', { rx: 7, ry: 7 },
    { boneId: 'hand_R',     offset: { x: 7,  y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 7, '#f5c6a0');

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

// --- Idle animation clip ---
export function buildIdleClip() {
  const clip = new AnimationClip('idle', 3.0, true);

  // Torso: subtle vertical breathing via spine angle oscillation
  clip.addKeyframe(0.0,  'spine',  deg(-90));
  clip.addKeyframe(0.75, 'spine',  deg(-91.5));
  clip.addKeyframe(1.5,  'spine',  deg(-90));
  clip.addKeyframe(2.25, 'spine',  deg(-89.5));
  clip.addKeyframe(3.0,  'spine',  deg(-90));

  // Chest: follows spine with slight additional tilt
  clip.addKeyframe(0.0,  'chest',  deg(0));
  clip.addKeyframe(0.8,  'chest',  deg(-1));
  clip.addKeyframe(1.6,  'chest',  deg(0));
  clip.addKeyframe(2.4,  'chest',  deg(1));
  clip.addKeyframe(3.0,  'chest',  deg(0));

  // Head: slight tilt
  clip.addKeyframe(0.0,  'head',   deg(0));
  clip.addKeyframe(1.0,  'head',   deg(2));
  clip.addKeyframe(2.0,  'head',   deg(-1));
  clip.addKeyframe(3.0,  'head',   deg(0));

  // Left arm: gentle pendulum
  clip.addKeyframe(0.0,  'shoulder_L', deg(190));
  clip.addKeyframe(0.55, 'shoulder_L', deg(193));
  clip.addKeyframe(1.1,  'shoulder_L', deg(190));
  clip.addKeyframe(1.65, 'shoulder_L', deg(187));
  clip.addKeyframe(2.2,  'shoulder_L', deg(190));
  clip.addKeyframe(2.75, 'shoulder_L', deg(192));
  clip.addKeyframe(3.0,  'shoulder_L', deg(190));

  // Right arm
  clip.addKeyframe(0.0,  'shoulder_R', deg(-190));
  clip.addKeyframe(0.45, 'shoulder_R', deg(-193));
  clip.addKeyframe(0.9,  'shoulder_R', deg(-190));
  clip.addKeyframe(1.35, 'shoulder_R', deg(-187));
  clip.addKeyframe(1.8,  'shoulder_R', deg(-190));
  clip.addKeyframe(2.25, 'shoulder_R', deg(-192));
  clip.addKeyframe(2.7,  'shoulder_R', deg(-190));
  clip.addKeyframe(3.0,  'shoulder_R', deg(-190));

  // Knees: slight bend synced to torso inhale
  clip.addKeyframe(0.0,  'knee_L', deg(-5));
  clip.addKeyframe(0.75, 'knee_L', deg(-7));
  clip.addKeyframe(1.5,  'knee_L', deg(-5));
  clip.addKeyframe(2.25, 'knee_L', deg(-4));
  clip.addKeyframe(3.0,  'knee_L', deg(-5));

  clip.addKeyframe(0.0,  'knee_R', deg(5));
  clip.addKeyframe(0.75, 'knee_R', deg(7));
  clip.addKeyframe(1.5,  'knee_R', deg(5));
  clip.addKeyframe(2.25, 'knee_R', deg(4));
  clip.addKeyframe(3.0,  'knee_R', deg(5));

  return clip;
}
