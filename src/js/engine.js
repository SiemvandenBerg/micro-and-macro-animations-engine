// engine.js — Main loop, timing, render orchestration

import { Skeleton } from './skeleton.js';
import { ShapeRenderer } from './shapes.js';
import { PathDeformer } from './deform.js';
import { AnimationPlayer } from './animation.js';
import { DevControls } from './controls.js';
import { LottieImporter } from './lottie-importer.js';
import { buildSkeleton, buildShapes, buildDeformBindings, buildIdleClip } from './character.js';

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.showSkeleton = true;

    // Core systems
    this.skeleton = new Skeleton();
    this.shapeRenderer = new ShapeRenderer(this.skeleton);
    this.deformer = new PathDeformer(this.skeleton, this.shapeRenderer);
    this.player = new AnimationPlayer(this.skeleton);
    this.controls = new DevControls(this);

    // Timing
    this._lastTime = 0;
    this._running = false;

    // User zoom (1.0 = fit-to-canvas default)
    this.userZoom = 1.0;
    this._lottieMeta = null;  // set when a Lottie file is loaded
  }

  init() {
    // Build character first so root exists for positioning
    buildSkeleton(this.skeleton);

    this._sizeCanvas();
    window.addEventListener('resize', () => this._sizeCanvas());

    buildShapes(this.shapeRenderer);
    buildDeformBindings(this.deformer);

    // Needed after shapes and bindings are set
    this.skeleton.solve();
    this.deformer.captureRestPose();

    // Start idle animation
    const idle = buildIdleClip();
    this.player.play(idle);

    // Init dev panel
    this.controls.init();
  }

  // Load and play a Lottie JSON animation, replacing the current character
  loadLottie(jsonData) {
    const importer = new LottieImporter();
    const result = importer.import(jsonData);

    // Replace core systems
    this.skeleton = new Skeleton();
    this.shapeRenderer = new ShapeRenderer(this.skeleton);
    this.deformer = new PathDeformer(this.skeleton, this.shapeRenderer);
    this.player = new AnimationPlayer(this.skeleton);

    // Build skeleton from imported bones
    for (const bone of result.bones) {
      const b = this.skeleton.addBone(bone.id, bone.parentId);
      b.positionX = bone.positionX;
      b.positionY = bone.positionY;
      b.rotation = bone.restRotation;
      b.anchorX = bone.anchorX;
      b.anchorY = bone.anchorY;
      b.scaleX = bone.scaleX;
      b.scaleY = bone.scaleY;
    }
    this.skeleton.finalize();
    this.skeleton.captureRestPose();

    // Add imported shapes
    for (const shape of result.shapes) {
      this.shapeRenderer.addShape(shape);
    }

    // Configure canvas for Lottie dimensions
    this._lottieMeta = result.meta;
    this.userZoom = 1.0;
    this._sizeCanvas();
    this.skeleton.solve();

    // Play the animation
    this.player.play(result.clip);
    this.player.playing = true;

    // Rebuild controls for new rig
    this.controls.init();
    if (typeof window.updateZoomUI === 'function') window.updateZoomUI();

    console.log(`Lottie loaded: "${result.meta.name}" (${result.bones.length} bones, ${result.shapes.length} shapes, ${result.meta.duration.toFixed(1)}s)`);
  }

  // Load only the rotation animation from a Lottie, remapping to the current skeleton
  loadLottieAnimationOnly(jsonData) {
    const importer = new LottieImporter();
    const result = importer.import(jsonData);

    // Build source skeleton temporarily to walk hierarchy
    const srcSkeleton = new Skeleton();
    for (const bone of result.bones) {
      const b = srcSkeleton.addBone(bone.id, bone.parentId);
      b.rotation = bone.restRotation;
    }
    srcSkeleton.finalize();

    // Build bone mapping by DFS hierarchy walk
    const boneMap = new Map();
    const sourceRestRotations = new Map();
    for (const b of result.bones) {
      sourceRestRotations.set(b.id, b.restRotation);
    }

    const walkDFS = (skeleton) => {
      const order = [];
      const visit = (bone) => {
        order.push(bone);
        for (const child of bone.children) visit(child);
      };
      if (skeleton.root) visit(skeleton.root);
      return order;
    };

    const srcOrder = walkDFS(srcSkeleton);
    const tgtOrder = walkDFS(this.skeleton);

    const count = Math.min(srcOrder.length, tgtOrder.length);
    for (let i = 0; i < count; i++) {
      boneMap.set(srcOrder[i].id, tgtOrder[i].id);
    }

    // Only transfer rotation tracks with delta conversion
    const clip = result.clip;
    const remappedTracks = new Map();
    for (const [trackKey, track] of clip.propertyTracks) {
      const sepIdx = trackKey.lastIndexOf(':');
      const srcBoneId = trackKey.slice(0, sepIdx);
      const property = trackKey.slice(sepIdx + 1);

      // Only transfer rotation — position/scale are comp-specific
      if (property !== 'rotation') continue;

      const targetBoneId = boneMap.get(srcBoneId);
      const targetBone = targetBoneId && this.skeleton.getBone(targetBoneId);
      if (!targetBone) continue;

      const srcBase = sourceRestRotations.get(srcBoneId) || 0;
      const remapped = track.map(kf => ({
        time: kf.time,
        value: targetBone.restRotation + (kf.value - srcBase),
      }));
      remappedTracks.set(`${targetBoneId}:rotation`, remapped);
    }
    clip.propertyTracks = remappedTracks;

    // Play the remapped clip
    this.player.play(clip);
    this.player.playing = true;

    // Rebuild controls to reflect new clip duration
    this.controls.init();

    console.log(`Animation (rotations only) loaded from "${result.meta.name}" → mapped: ${[...boneMap.entries()].map(([s,t]) => s+'→'+t).join(', ')}`);
  }

  // Reset to the built-in character rig
  loadBuiltinCharacter() {
    this.skeleton = new Skeleton();
    this.shapeRenderer = new ShapeRenderer(this.skeleton);
    this.deformer = new PathDeformer(this.skeleton, this.shapeRenderer);
    this.player = new AnimationPlayer(this.skeleton);

    buildSkeleton(this.skeleton);

    this._lottieMeta = null;
    this.userZoom = 1.0;
    this._sizeCanvas();

    buildShapes(this.shapeRenderer);
    buildDeformBindings(this.deformer);

    this.skeleton.solve();
    this.deformer.captureRestPose();

    const idle = buildIdleClip();
    this.player.play(idle);
    this.player.playing = true;

    this.controls.init();
    if (typeof window.updateZoomUI === 'function') window.updateZoomUI();
  }

  start() {
    this._running = true;
    this._lastTime = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  _loop(timestamp) {
    if (!this._running) return;

    const dt = (timestamp - this._lastTime) / 1000;
    this._lastTime = timestamp;

    this._update(dt);
    this._render();

    this.controls.updateTimeSlider();
    this.controls.updateBoneIndicators();

    requestAnimationFrame((t) => this._loop(t));
  }

  _update(dt) {
    // 1. Advance animation (sets bone angles)
    this.player.update(dt);

    // 2. Solve skeleton (compute world positions)
    this.skeleton.solve();

    // 3. Apply path deformations
    this.deformer.apply();
  }

  _render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background — soft pink to white gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#ffbdf5');
    grad.addColorStop(1, '#ffffff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Apply global scale so the rig fills the canvas, plus user zoom
    const totalScale = this.scale * this.userZoom;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(totalScale, totalScale);
    ctx.translate(-w / 2 / this.scale, -h / 2 / this.scale);

    // Draw shapes (character body)
    this.shapeRenderer.draw(ctx);

    // Draw skeleton overlay
    if (this.showSkeleton) {
      this.skeleton.draw(ctx);
    }

    ctx.restore();
  }

  _sizeCanvas() {
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;

    if (this._lottieMeta) {
      // First pass: compute scale from comp dimensions, center at origin
      const meta = this._lottieMeta;
      this.scale = Math.min(
        this.canvas.width / meta.width,
        this.canvas.height / meta.height
      );
      if (this.skeleton.root) {
        this.skeleton.rootX = 0;
        this.skeleton.rootY = 0;
      }

      // Solve skeleton to get world positions, then compute actual content bounds
      this.skeleton.solve();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const bone of this.skeleton.bones.values()) {
        minX = Math.min(minX, bone.worldX, bone.anchorWorldX);
        maxX = Math.max(maxX, bone.worldX, bone.anchorWorldX);
        minY = Math.min(minY, bone.worldY, bone.anchorWorldY);
        maxY = Math.max(maxY, bone.worldY, bone.anchorWorldY);
      }

      // Use content bounds for fit (with 10% padding)
      const contentW = maxX - minX || 1;
      const contentH = maxY - minY || 1;
      const padding = 0.9;
      this.scale = Math.min(
        this.canvas.width / contentW,
        this.canvas.height / contentH
      ) * padding;

      // Center content in canvas
      if (this.skeleton.root) {
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        this.skeleton.rootX = -cx + this.canvas.width / 2 / this.scale;
        this.skeleton.rootY = -cy + this.canvas.height / 2 / this.scale;
      }
    } else {
      // Default rig sizing: ~200px tall fills ~70% of canvas
      this.scale = (this.canvas.height * 0.70) / 200;
      if (this.skeleton.root) {
        this.skeleton.rootX = this.canvas.width  / 2 / this.scale;
        this.skeleton.rootY = this.canvas.height * 0.62 / this.scale;
      }
    }
  }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('canvas');
  const engine = new Engine(canvas);
  engine.init();
  engine.start();

  // Expose for console debugging
  window.__engine = engine;
});
