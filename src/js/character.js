// character.js — Placeholder person: bones, shapes, animation, and deform bindings
// All measurements assume the character is roughly 200px tall, centered on the canvas.

import { Shape } from './shapes.js';
import { AnimationClip } from './animation.js';
import { DeformBinding } from './deform.js';

// --- Skeleton definition ---
export function buildSkeleton(skeleton) {
  //                         id             length  parent
  skeleton.addBone(          'root',         0,      null);
  skeleton.addBone(          'spine',        40,     'root');
  skeleton.addBone(          'chest',        35,     'spine');
  skeleton.addBone(          'neck',         12,     'chest');
  skeleton.addBone(          'head',         20,     'neck');

  skeleton.addBone(          'shoulder_L',   20,     'chest');
  skeleton.addBone(          'elbow_L',      28,     'shoulder_L');
  skeleton.addBone(          'hand_L',       14,     'elbow_L');

  skeleton.addBone(          'shoulder_R',   20,     'chest');
  skeleton.addBone(          'elbow_R',      28,     'shoulder_R');
  skeleton.addBone(          'hand_R',       14,     'elbow_R');

  skeleton.addBone(          'hip_L',        30,     'root');
  skeleton.addBone(          'knee_L',       32,     'hip_L');
  skeleton.addBone(          'foot_L',       8,      'knee_L');

  skeleton.addBone(          'hip_R',        30,     'root');
  skeleton.addBone(          'knee_R',       32,     'hip_R');
  skeleton.addBone(          'foot_R',       8,      'knee_R');

  // Rest pose: character stands upright, arms slightly angled down
  const deg = (d) => d * Math.PI / 180;

  skeleton.getBone('root').baseAngle      = 0;
  skeleton.getBone('spine').baseAngle     = deg(-90);    // pointing up
  skeleton.getBone('chest').baseAngle     = deg(0);      // continues up
  skeleton.getBone('neck').baseAngle      = deg(0);
  skeleton.getBone('head').baseAngle      = deg(0);

  skeleton.getBone('shoulder_L').baseAngle = deg(100);   // angled down-left
  skeleton.getBone('elbow_L').baseAngle    = deg(5);
  skeleton.getBone('hand_L').baseAngle     = deg(5);

  skeleton.getBone('shoulder_R').baseAngle = deg(-100);  // mirrored
  skeleton.getBone('elbow_R').baseAngle    = deg(-5);
  skeleton.getBone('hand_R').baseAngle     = deg(-5);

  skeleton.getBone('hip_L').baseAngle     = deg(95);     // legs go down
  skeleton.getBone('knee_L').baseAngle    = deg(-5);
  skeleton.getBone('foot_L').baseAngle    = deg(-85);    // foot flat

  skeleton.getBone('hip_R').baseAngle     = deg(85);
  skeleton.getBone('knee_R').baseAngle    = deg(5);
  skeleton.getBone('foot_R').baseAngle    = deg(-85);

  skeleton.resetPose();
}

// --- Shape definitions ---
export function buildShapes(renderer) {
  const s = (id, type, props, binding, order) => {
    const shape = new Shape(id, type, props, binding);
    shape.drawOrder = order;
    renderer.addShape(shape);
  };

  // Draw order: legs back, torso, arms front, head on top

  // Left leg
  s('thigh_L', 'rect', { width: 14, height: 30, radius: 5 },
    { boneId: 'hip_L',  offset: { x: 0, y: 15 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 1);
  s('shin_L',  'rect', { width: 12, height: 32, radius: 5 },
    { boneId: 'knee_L', offset: { x: 0, y: 16 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 1);
  s('foot_shape_L', 'rect', { width: 16, height: 8, radius: 3 },
    { boneId: 'foot_L', offset: { x: 4, y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 1);

  // Right leg
  s('thigh_R', 'rect', { width: 14, height: 30, radius: 5 },
    { boneId: 'hip_R',  offset: { x: 0, y: 15 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 2);
  s('shin_R',  'rect', { width: 12, height: 32, radius: 5 },
    { boneId: 'knee_R', offset: { x: 0, y: 16 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 2);
  s('foot_shape_R', 'rect', { width: 16, height: 8, radius: 3 },
    { boneId: 'foot_R', offset: { x: 4, y: 0 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 2);

  // Torso
  s('torso', 'rect', { width: 44, height: 70, radius: 8 },
    { boneId: 'spine', offset: { x: 0, y: 35 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 5);

  // Left arm
  s('upper_arm_L', 'rect', { width: 10, height: 28, radius: 4 },
    { boneId: 'shoulder_L', offset: { x: 0, y: 14 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 6);
  s('lower_arm_L', 'rect', { width: 9, height: 26, radius: 4 },
    { boneId: 'elbow_L',    offset: { x: 0, y: 13 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 6);
  s('hand_shape_L', 'ellipse', { rx: 6, ry: 7 },
    { boneId: 'hand_L',     offset: { x: 0, y: 7 },  pivot: { x: 0, y: 0 }, rotation: 0 }, 6);

  // Right arm
  s('upper_arm_R', 'rect', { width: 10, height: 28, radius: 4 },
    { boneId: 'shoulder_R', offset: { x: 0, y: 14 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 7);
  s('lower_arm_R', 'rect', { width: 9, height: 26, radius: 4 },
    { boneId: 'elbow_R',    offset: { x: 0, y: 13 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 7);
  s('hand_shape_R', 'ellipse', { rx: 6, ry: 7 },
    { boneId: 'hand_R',     offset: { x: 0, y: 7 },  pivot: { x: 0, y: 0 }, rotation: 0 }, 7);

  // Head
  s('head_shape', 'ellipse', { rx: 18, ry: 22 },
    { boneId: 'head', offset: { x: 0, y: 10 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 10);

  // Torso outline (path for deformation demo)
  // A simple curved outline along the left side of the torso
  s('torso_outline', 'path', {
    closed: false,
    points: [
      { x: -22, y: -35 },
      { x: -24, y: -15 },
      { x: -23, y:   5 },
      { x: -22, y:  25 },
      { x: -20, y:  35 },
    ]
  }, { boneId: 'spine', offset: { x: 0, y: 35 }, pivot: { x: 0, y: 0 }, rotation: 0 }, 5);
}

// --- Deform bindings (path deformation demo) ---
export function buildDeformBindings(deformer) {
  // Bind the torso outline points to the spine and chest bones
  // so the outline subtly bends when those bones rotate

  // Middle points of the torso outline are influenced by chest
  deformer.addBinding(new DeformBinding('torso_outline', 1, [
    { boneId: 'chest', weight: 0.3 }
  ]));
  deformer.addBinding(new DeformBinding('torso_outline', 2, [
    { boneId: 'chest', weight: 0.5 }
  ]));
  deformer.addBinding(new DeformBinding('torso_outline', 3, [
    { boneId: 'chest', weight: 0.3 }
  ]));
}

// --- Idle animation clip ---
export function buildIdleClip() {
  const clip = new AnimationClip('idle', 3.0, true);
  const deg = (d) => d * Math.PI / 180;

  // Torso: subtle vertical breathing via spine angle oscillation
  // We vary the spine angle slightly to simulate rise/fall
  clip.addKeyframe(0.0,  'spine',  deg(-90));
  clip.addKeyframe(0.75, 'spine',  deg(-91.5));   // inhale: spine tilts a tiny bit
  clip.addKeyframe(1.5,  'spine',  deg(-90));
  clip.addKeyframe(2.25, 'spine',  deg(-89.5));    // exhale: slight lean other way
  clip.addKeyframe(3.0,  'spine',  deg(-90));       // loop seamless

  // Chest: follows spine with slight additional tilt
  clip.addKeyframe(0.0,  'chest',  deg(0));
  clip.addKeyframe(0.8,  'chest',  deg(-1));
  clip.addKeyframe(1.6,  'chest',  deg(0));
  clip.addKeyframe(2.4,  'chest',  deg(1));
  clip.addKeyframe(3.0,  'chest',  deg(0));

  // Head: slight tilt, offset timing from torso
  clip.addKeyframe(0.0,  'head',   deg(0));
  clip.addKeyframe(1.0,  'head',   deg(2));
  clip.addKeyframe(2.0,  'head',   deg(-1));
  clip.addKeyframe(3.0,  'head',   deg(0));

  // Left arm: gentle pendulum, 2.2s period (not aligned with torso)
  // We use two cycles within the 3s clip for asymmetry
  clip.addKeyframe(0.0,  'shoulder_L', deg(100));
  clip.addKeyframe(0.55, 'shoulder_L', deg(103));
  clip.addKeyframe(1.1,  'shoulder_L', deg(100));
  clip.addKeyframe(1.65, 'shoulder_L', deg(97));
  clip.addKeyframe(2.2,  'shoulder_L', deg(100));
  clip.addKeyframe(2.75, 'shoulder_L', deg(102));
  clip.addKeyframe(3.0,  'shoulder_L', deg(100));

  // Right arm: 1.8s period
  clip.addKeyframe(0.0,  'shoulder_R', deg(-100));
  clip.addKeyframe(0.45, 'shoulder_R', deg(-103));
  clip.addKeyframe(0.9,  'shoulder_R', deg(-100));
  clip.addKeyframe(1.35, 'shoulder_R', deg(-97));
  clip.addKeyframe(1.8,  'shoulder_R', deg(-100));
  clip.addKeyframe(2.25, 'shoulder_R', deg(-102));
  clip.addKeyframe(2.7,  'shoulder_R', deg(-100));
  clip.addKeyframe(3.0,  'shoulder_R', deg(-100));

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
