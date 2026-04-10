// engine.js — Main loop, timing, render orchestration

import { Skeleton } from './skeleton.js';
import { ShapeRenderer } from './shapes.js';
import { PathDeformer } from './deform.js';
import { AnimationPlayer } from './animation.js';
import { DevControls } from './controls.js';
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
  }

  init() {
    this._sizeCanvas();
    window.addEventListener('resize', () => this._sizeCanvas());

    // Build character
    buildSkeleton(this.skeleton);

    // Root position is set inside _sizeCanvas(), nothing to override here

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

    // Background
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, w, h);

    // Apply global scale so the rig fills the canvas
    ctx.save();
    ctx.scale(this.scale, this.scale);

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

    // Scale so the ~200px-tall rig fills ~70% of the canvas height
    this.scale = (this.canvas.height * 0.70) / 200;

    // Re-center root in pre-scale coordinates
    if (this.skeleton.root) {
      this.skeleton.rootX = this.canvas.width  / 2 / this.scale;
      this.skeleton.rootY = this.canvas.height * 0.62 / this.scale;
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
