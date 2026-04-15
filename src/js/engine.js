// engine.js — Main loop, timing, render orchestration

import { Skeleton } from './skeleton.js';
import { ShapeRenderer } from './shapes.js';
import { PathDeformer } from './deform.js';
import { AnimationPlayer, AnimationClip } from './animation.js';
import { DevControls } from './controls.js';
import { Timeline } from './timeline.js';
import { LottieImporter } from './lottie-importer.js';
import { buildSkeleton, buildShapes, buildDeformBindings, buildIdleClip, applyCatalystManPose, buildCatalystManSkeleton } from './character.js';
import { Renderer3D } from './renderer3d.js';

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    // 3D WebGL renderer — takes ownership of the canvas context
    this.renderer3d = new Renderer3D(canvas);
    this.showSkeleton = true;

    // Core systems
    this.skeleton = new Skeleton();
    this.shapeRenderer = new ShapeRenderer(this.skeleton);
    this.deformer = new PathDeformer(this.skeleton, this.shapeRenderer);
    this.player = new AnimationPlayer(this.skeleton);
    this.controls = new DevControls(this);
    this.timeline  = new Timeline(this);

    // Timing
    this._lastTime = 0;
    this._running = false;

    // User zoom (1.0 = fit-to-canvas default)
    this.userZoom = 1.0;
    this._lottieMeta = null;  // set when a Lottie file is loaded
    this._catalystManMode = false;  // set when Catalyst Man PNG skeleton is active
    this.rotationY = 0; // degrees: simulated Y-axis rotation (0=front, 90=side, 180=back)

    // Drag state
    this._drag = null;          // { bone, wasPaused }
    this._hoverBoneId = null;

    // Undo stack — each entry is a deep-clone of clip.propertyTracks
    this._undoStack = [];
  }

  // Snapshot the current clip state AND bone visual state onto the undo stack.
  // Call this BEFORE any mutation that should be undoable.
  pushUndo() {
    const clip = this.player.clip;
    if (!clip) return;
    // Deep-clone animation tracks
    const tracks = new Map();
    for (const [key, track] of clip.propertyTracks) {
      tracks.set(key, track.map(kf => ({ ...kf })));
    }
    // Snapshot every bone's visual rotation + depth so undo restores exact
    // on-screen state without re-applying the full animation via seekTo
    const boneState = new Map();
    for (const [id, bone] of this.skeleton.bones) {
      boneState.set(id, { rotation: bone.rotation, positionZ: bone.positionZ || 0 });
    }
    this._undoStack.push({ tracks, boneState });
    // Cap stack to 50 entries
    if (this._undoStack.length > 50) this._undoStack.shift();
  }

  // Restore the most recent snapshot: both animation tracks and bone positions.
  undo() {
    if (!this._undoStack.length) return;
    const clip = this.player.clip;
    if (!clip) return;
    const { tracks, boneState } = this._undoStack.pop();
    // Restore animation data
    clip.propertyTracks = tracks;
    // Restore each bone to its exact pre-action visual state
    for (const [id, state] of boneState) {
      const bone = this.skeleton.getBone(id);
      if (bone) {
        bone.rotation = state.rotation;
        bone.positionZ = state.positionZ;
      }
    }
    this.skeleton.solve();
    this.timeline.build();
  }

  init() {
    // Wire Ctrl+Z for undo
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      }
    });

    // Build character first so root exists for positioning
    buildSkeleton(this.skeleton);

    this._sizeCanvas();
    window.addEventListener('resize', () => this._sizeCanvas());

    buildShapes(this.shapeRenderer);
    buildDeformBindings(this.deformer);

    // Needed after shapes and bindings are set
    this.skeleton.solve();
    this.deformer.captureRestPose();

    // Build 3D meshes for the initial character
    this.renderer3d.buildMeshes(
      this.shapeRenderer.shapes, this.skeleton, this.shapeRenderer.strokeEnabled
    );

    // Start idle animation
    const idle = buildIdleClip();
    this.player.play(idle);

    // Init dev panel
    this.controls.init();

    // Build timeline (init wires listeners once; build populates DOM)
    this.timeline.init();
    this.timeline.build();

    // Wire up bone-drag interaction
    this._initDrag();
  }

  // Load and play a Lottie JSON animation, replacing the current character
  loadLottie(jsonData) {
    this._clearSvgLayer();
    this._setBackground(null);
    this._catalystManMode = false;
    this.renderer3d.skeletonJointRadius = 3;
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
      // Mark the injected comp-root as synthetic so it's hidden from the overlay
      if (bone.id === '__comp_root') b.synthetic = true;
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

    // Build 3D meshes for the imported character
    this.renderer3d.buildMeshes(
      this.shapeRenderer.shapes, this.skeleton, this.shapeRenderer.strokeEnabled
    );

    // Play the animation
    this.player.play(result.clip);
    this.player.playing = true;

    // Rebuild controls for new rig
    this.controls.init();
    this.timeline.build();
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

    // Rebuild controls and timeline to reflect new clip duration
    this.controls.init();
    this.timeline.build();

    console.log(`Animation (rotations only) loaded from "${result.meta.name}" → mapped: ${[...boneMap.entries()].map(([s,t]) => s+'→'+t).join(', ')}`);
  }

  // Load an animation clip from the exported {name, duration, loop, tracks} JSON format.
  // Applies to the current skeleton without replacing it.
  loadAnimationJSON(data) {
    const clip = new AnimationClip(data.name || 'imported', data.duration || 1, data.loop !== false);
    for (const [key, kfs] of Object.entries(data.tracks || {})) {
      clip.propertyTracks.set(key, kfs.map(kf => ({ time: kf.time, value: kf.value })));
    }
    this.player.play(clip);
    this.player.playing = false;
    this.timeline.build();
    console.log(`Animation JSON loaded: "${clip.name}" (${clip.duration.toFixed(2)}s, ${clip.propertyTracks.size} tracks)`);
  }

  // Reset to the built-in character rig
  loadBuiltinCharacter() {
    this._clearSvgLayer();
    this._setBackground(null);  // clear any background image
    this._catalystManMode = false;
    this.renderer3d.skeletonJointRadius = 3;
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

    // Rebuild 3D meshes for the new built-in character
    this.renderer3d.buildMeshes(
      this.shapeRenderer.shapes, this.skeleton, this.shapeRenderer.strokeEnabled
    );

    const idle = buildIdleClip();
    this.player.play(idle);
    this.player.playing = true;

    this.controls.init();
    this.timeline.build();
    if (typeof window.updateZoomUI === 'function') window.updateZoomUI();
  }

  loadCatalystMan() {
    this._clearSvgLayer();
    this._setBackground(null);
    this._catalystManMode = true;
    this._lottieMeta = null;

    this.skeleton = new Skeleton();
    this.shapeRenderer = new ShapeRenderer(this.skeleton);
    this.deformer = new PathDeformer(this.skeleton, this.shapeRenderer);
    this.player = new AnimationPlayer(this.skeleton);

    buildCatalystManSkeleton(this.skeleton);

    this.userZoom = 1.0;
    this.showSkeleton = true;
    this._sizeCanvas();
    this.skeleton.solve();

    // No procedural shapes — the SVG IS the character
    this.renderer3d.skeletonJointRadius = 18; // large joints so they're visible at SVG scale
    this.renderer3d.buildMeshes([], this.skeleton, false);

    // Load catalyst man SVG as the character visual
    this._loadCatalystSvg();

    // Blank clip — animate from scratch
    const clip = new AnimationClip('catalyst-man', 3, true);
    this.player.play(clip);
    this.player.playing = false;

    this.controls.init();
    this.timeline.build();
    if (typeof window.updateZoomUI === 'function') window.updateZoomUI();
  }

  // Fetch catalyst-man.svg and inject it inline into #svg-layer.
  _loadCatalystSvg() {
    const layer = document.getElementById('svg-layer');
    if (!layer) return;
    layer.innerHTML = '';
    fetch('catalyst-man.svg')
      .then(r => r.text())
      .then(svgText => {
        if (!this._catalystManMode) return; // switched away before load finished
        const tmp = document.createElement('div');
        tmp.innerHTML = svgText;
        const svg = tmp.querySelector('svg');
        if (!svg) return;

        // Remove the internal clip-path that cuts the character rectangle.
        // .cls-6 applies clip-path: url(#clippath) which clips the whole character
        // to a fixed 241,201 1569×2367 rect — any limb outside that gets cut off.
        const style = svg.querySelector('style');
        if (style) style.textContent += '\n.cls-6 { clip-path: none !important; }';

        // Remove the viewBox — viewBox creates an implicit clip rectangle that cuts off
        // limbs that rotate outside the 0 0 2000 2700 bounds.
        // Instead, set the SVG to canvas pixel dimensions and apply a transform group
        // to scale + position the content identically to how viewBox+preserveAspectRatio would.
        svg.removeAttribute('viewBox');
        svg.removeAttribute('preserveAspectRatio');

        const W = this.canvas.width;
        const H = this.canvas.height;
        const s  = Math.min(W / 2000, H / 2700);
        const tx = (W - 2000 * s) / 2;
        const ty = (H - 2700 * s) / 2;

        svg.setAttribute('width',    W);
        svg.setAttribute('height',   H);
        svg.setAttribute('overflow', 'visible');
        svg.style.position = 'absolute';
        svg.style.left     = '0';
        svg.style.top      = '0';
        svg.style.width    = W + 'px';
        svg.style.height   = H + 'px';

        // Wrap all existing children in a scale/translate group so pivot coordinates
        // in _updateCatalystSvg (which are in 2000×2700 SVG user units) still work.
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.id = 'catalyst-content';
        g.setAttribute('transform', `translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${s.toFixed(6)})`);
        while (svg.firstChild) g.appendChild(svg.firstChild);
        svg.appendChild(g);

        // Store scale info for potential repositioning on resize
        svg._catalystScale = s;
        svg._catalystTx    = tx;
        svg._catalystTy    = ty;

        this._initArmBend(svg);
        layer.appendChild(svg);
      })
      .catch(err => console.warn('Could not load catalyst-man.svg:', err));
  }

  // Parse and store the forward arm paths for per-frame linear-blend skinning.
  // No DOM restructuring needed — we write directly to the path d attributes each frame.
  _initArmBend(svg) {
    const handL = svg.getElementById('hand_L');
    if (!handL) return;
    this._armPaths = Array.from(handL.querySelectorAll('path')).map(p => ({
      el: p,
      segments: this._parseSvgPath(p.getAttribute('d'))
    }));

    // Back arm: parse hand_R paths for the same LBS treatment.
    // Exclude paths inside epMjnnml733FbOE6a1-j-2 — that sub-group gets its own
    // compound rotation applied separately, so including its paths in LBS would
    // double-transform them and produce stray lines.
    const handR = svg.getElementById('hand_R');
    if (!handR) return;
    const handDetailR = svg.getElementById('epMjnnml733FbOE6a1-j-2');
    this._backArmPaths = Array.from(handR.querySelectorAll('path'))
      .filter(p => !handDetailR || !handDetailR.contains(p))
      .map(p => ({
        el: p,
        segments: this._parseSvgPath(p.getAttribute('d'))
      }));
  }

  // Minimal SVG path parser: converts all commands to absolute-coordinate segments.
  // Handles M, m, L, l, H, h, V, v, C, c, Q, q, Z, z.
  _parseSvgPath(d) {
    const segs = [];
    const re = /([MmLlHhVvCcQqZz])([^MmLlHhVvCcQqZz]*)/g;
    let cx = 0, cy = 0, mx = 0, my = 0, m;
    while ((m = re.exec(d)) !== null) {
      const cmd = m[1];
      const rel = cmd === cmd.toLowerCase();
      const nums = (m[2].match(/-?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g) || []).map(Number);
      switch (cmd.toUpperCase()) {
        case 'M':
          for (let i = 0; i < nums.length; i += 2) {
            const x = rel ? cx + nums[i] : nums[i], y = rel ? cy + nums[i+1] : nums[i+1];
            segs.push({ type: i === 0 ? 'M' : 'L', pts: [{x, y}] });
            if (i === 0) { mx = x; my = y; } cx = x; cy = y;
          } break;
        case 'L':
          for (let i = 0; i < nums.length; i += 2) {
            const x = rel ? cx + nums[i] : nums[i], y = rel ? cy + nums[i+1] : nums[i+1];
            segs.push({ type: 'L', pts: [{x, y}] }); cx = x; cy = y;
          } break;
        case 'H':
          for (let i = 0; i < nums.length; i++) {
            const x = rel ? cx + nums[i] : nums[i];
            segs.push({ type: 'L', pts: [{x, y: cy}] }); cx = x;
          } break;
        case 'V':
          for (let i = 0; i < nums.length; i++) {
            const y = rel ? cy + nums[i] : nums[i];
            segs.push({ type: 'L', pts: [{x: cx, y}] }); cy = y;
          } break;
        case 'C':
          for (let i = 0; i < nums.length; i += 6) {
            const x1 = rel?cx+nums[i]:nums[i], y1 = rel?cy+nums[i+1]:nums[i+1];
            const x2 = rel?cx+nums[i+2]:nums[i+2], y2 = rel?cy+nums[i+3]:nums[i+3];
            const x  = rel?cx+nums[i+4]:nums[i+4], y  = rel?cy+nums[i+5]:nums[i+5];
            segs.push({ type: 'C', pts: [{x:x1,y:y1},{x:x2,y:y2},{x,y}] }); cx=x; cy=y;
          } break;
        case 'Q':
          for (let i = 0; i < nums.length; i += 4) {
            const x1=rel?cx+nums[i]:nums[i], y1=rel?cy+nums[i+1]:nums[i+1];
            const x=rel?cx+nums[i+2]:nums[i+2], y=rel?cy+nums[i+3]:nums[i+3];
            segs.push({ type: 'Q', pts: [{x:x1,y:y1},{x,y}] }); cx=x; cy=y;
          } break;
        case 'Z':
          segs.push({ type: 'Z', pts: [] }); cx = mx; cy = my; break;
      }
    }
    return segs;
  }

  _rebuildSvgPath(segs) {
    return segs.map(s => s.type === 'Z' ? 'Z' :
      s.type + ' ' + s.pts.map(p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
    ).join(' ');
  }

  // Linear-blend skinning for the forward arm paths.
  // Each path point blends between shoulder-only and full (shoulder+elbow) transform
  // based on its REST y-coordinate — points above the elbow follow the shoulder,
  // points below the elbow follow both bones, with a smooth transition in between.
  _updateArmSkin() {
    if (!this._armPaths || !this._armPaths.length) return;
    const sB = this.skeleton.getBone('shoulder_L');
    const eB = this.skeleton.getBone('elbow_L');
    const hB = this.skeleton.getBone('hand_L');
    if (!sB || !eB || !hB) return;

    const SA  = sB.worldAngle;          // shoulder world angle
    const EA  = eB.worldAngle - SA;     // elbow LOCAL angle
    const HA  = hB.worldAngle - eB.worldAngle; // wrist LOCAL angle
    const SPX = 780,  SPY = 653;        // shoulder pivot (SVG rest space)
    const ERX = 1050, ERY = 960;        // elbow rest position
    const WRX = 1150, WRY = 1220;       // wrist/hand rest position

    const ELBOW_BLEND_START = 870,  ELBOW_BLEND_END = 1060;
    const WRIST_BLEND_START = 1120, WRIST_BLEND_END = 1280;

    const rot = (x, y, cx, cy, a) => {
      const c = Math.cos(a), s = Math.sin(a);
      return { x: cx+(x-cx)*c-(y-cy)*s, y: cy+(x-cx)*s+(y-cy)*c };
    };

    // Pivot positions after each bone's rotation is applied
    const elbowPivot = rot(ERX, ERY, SPX, SPY, SA);
    const wristPivot = rot(
      rot(WRX, WRY, SPX, SPY, SA).x,
      rot(WRX, WRY, SPX, SPY, SA).y,
      elbowPivot.x, elbowPivot.y, EA
    );

    const skinPt = (rx, ry) => {
      // Step 1: shoulder rotation — all points
      const afterShoulder = rot(rx, ry, SPX, SPY, SA);

      // Step 2: elbow blend
      let afterElbow = afterShoulder;
      if (EA !== 0) {
        const withElbow = rot(afterShoulder.x, afterShoulder.y, elbowPivot.x, elbowPivot.y, EA);
        const t = Math.max(0, Math.min(1, (ry - ELBOW_BLEND_START) / (ELBOW_BLEND_END - ELBOW_BLEND_START)));
        afterElbow = t <= 0 ? afterShoulder :
                     t >= 1 ? withElbow :
                     { x: afterShoulder.x*(1-t)+withElbow.x*t, y: afterShoulder.y*(1-t)+withElbow.y*t };
      }

      // Step 3: wrist blend
      if (HA === 0) return afterElbow;
      const withWrist = rot(afterElbow.x, afterElbow.y, wristPivot.x, wristPivot.y, HA);
      const u = Math.max(0, Math.min(1, (ry - WRIST_BLEND_START) / (WRIST_BLEND_END - WRIST_BLEND_START)));
      if (u <= 0) return afterElbow;
      if (u >= 1) return withWrist;
      return { x: afterElbow.x*(1-u)+withWrist.x*u, y: afterElbow.y*(1-u)+withWrist.y*u };
    };

    for (const { el, segments } of this._armPaths) {
      const deformed = segments.map(seg => ({
        type: seg.type,
        pts:  seg.pts.map(p => skinPt(p.x, p.y))
      }));
      el.setAttribute('d', this._rebuildSvgPath(deformed));
    }
  }

  // Linear-blend skinning for the back arm (hand_R). Same logic as _updateArmSkin
  // but for shoulder_R, elbow_R, hand_R bones.
  _updateBackArmSkin() {
    if (!this._backArmPaths || !this._backArmPaths.length) return;
    const sB = this.skeleton.getBone('shoulder_R');
    const eB = this.skeleton.getBone('elbow_R');
    const hB = this.skeleton.getBone('hand_R');
    if (!sB || !eB || !hB) return;

    const SA  = sB.worldAngle;
    const EA  = eB.worldAngle - SA;
    const HA  = hB.worldAngle - eB.worldAngle;
    const SPX = 780, SPY = 653;    // shoulder pivot
    const ERX = 620, ERY = 930;    // elbow rest
    const WRX = 600, WRY = 1150;   // wrist rest

    const ELBOW_BLEND_START = 830,  ELBOW_BLEND_END = 1020;
    const WRIST_BLEND_START = 1050, WRIST_BLEND_END = 1200;

    const rot = (x, y, cx, cy, a) => {
      const c = Math.cos(a), s = Math.sin(a);
      return { x: cx+(x-cx)*c-(y-cy)*s, y: cy+(x-cx)*s+(y-cy)*c };
    };

    const elbowPivot = rot(ERX, ERY, SPX, SPY, SA);
    const wristPivot = rot(
      rot(WRX, WRY, SPX, SPY, SA).x,
      rot(WRX, WRY, SPX, SPY, SA).y,
      elbowPivot.x, elbowPivot.y, EA
    );

    const skinPt = (rx, ry) => {
      const afterShoulder = rot(rx, ry, SPX, SPY, SA);
      let afterElbow = afterShoulder;
      if (EA !== 0) {
        const withElbow = rot(afterShoulder.x, afterShoulder.y, elbowPivot.x, elbowPivot.y, EA);
        const t = Math.max(0, Math.min(1, (ry - ELBOW_BLEND_START) / (ELBOW_BLEND_END - ELBOW_BLEND_START)));
        afterElbow = t <= 0 ? afterShoulder :
                     t >= 1 ? withElbow :
                     { x: afterShoulder.x*(1-t)+withElbow.x*t, y: afterShoulder.y*(1-t)+withElbow.y*t };
      }
      if (HA === 0) return afterElbow;
      const withWrist = rot(afterElbow.x, afterElbow.y, wristPivot.x, wristPivot.y, HA);
      const u = Math.max(0, Math.min(1, (ry - WRIST_BLEND_START) / (WRIST_BLEND_END - WRIST_BLEND_START)));
      if (u <= 0) return afterElbow;
      if (u >= 1) return withWrist;
      return { x: afterElbow.x*(1-u)+withWrist.x*u, y: afterElbow.y*(1-u)+withWrist.y*u };
    };

    for (const { el, segments } of this._backArmPaths) {
      const deformed = segments.map(seg => ({
        type: seg.type,
        pts:  seg.pts.map(p => skinPt(p.x, p.y))
      }));
      el.setAttribute('d', this._rebuildSvgPath(deformed));
    }
  }

  // Clear the SVG layer (call when switching to another character).
  _clearSvgLayer() {
    const layer = document.getElementById('svg-layer');
    if (layer) layer.innerHTML = '';
  }

  // Per-frame: apply bone world angles as SVG rotate() transforms to body part groups.
  // Each group rotates around its pivot joint in SVG user-unit space (0 0 2000 2700).
  // Because all bones start at rotation=0, bone.worldAngle IS the delta from rest.
  _updateCatalystSvg() {
    if (!this._catalystManMode) return;
    const layer = document.getElementById('svg-layer');
    const svg   = layer && layer.querySelector('svg');
    if (!svg) return;

    // Mapping: SVG group id → driving bone → pivot SVG coords (from Skeleton.svg circles)
    // Bone L/R matches the skeleton overlay directly — no swap needed.
    const parts = [
      // Legs: SVG foot_L/foot_R groups use viewer screen-space naming (opposite anatomy),
      // so foot_L (screen-left = back leg) is driven by hip_R and vice-versa.
      { id: 'foot_L',                  boneId: 'hip_R',      px: 618, py: 784 },
      { id: 'foot_R',                  boneId: 'hip_L',      px: 618, py: 784 },
      // Torso & head
      { id: 'body',                    boneId: 'spine',      px: 618, py: 784 },
      { id: 'head',                    boneId: 'head',       px: 780, py: 653 },
      // Both arms paths are deformed directly by LBS — no group rotation needed
      // epMjnnml compound blocks below handle the floating hand details
    ];

    for (const { id, boneId, px, py } of parts) {
      const el   = svg.getElementById(id);
      const bone = this.skeleton.getBone(boneId);
      if (!el || !bone) continue;
      const deg = bone.worldAngle * 180 / Math.PI;
      el.setAttribute('transform', `rotate(${deg.toFixed(3)}, ${px}, ${py})`);
    }

    // Nested sub-groups: elements that sit inside an already-rotating parent group.
    // The pivot is expressed in the parent's local pre-transform space.
    // IMPORTANT: deg uses the LOCAL rotation delta (bone.worldAngle - parentBone.worldAngle)
    // because the parent SVG group already applied parentBone.worldAngle.
    const nestedParts = [
      // ZKd3Ba2CG09dJWD2jOkIJ (back arm forearm) removed — now handled by _updateBackArmSkin LBS
    ];

    for (const { id, boneId, parentBoneId, parentPx, parentPy, globalPx, globalPy } of nestedParts) {
      const el         = svg.getElementById(id);
      const bone       = this.skeleton.getBone(boneId);
      const parentBone = this.skeleton.getBone(parentBoneId);
      if (!el || !bone || !parentBone) continue;

      // Compute the global pivot's position in the parent's local (pre-rotation) space.
      const invA  = -parentBone.worldAngle;
      const dx    = globalPx - parentPx, dy = globalPy - parentPy;
      const cos   = Math.cos(invA), sin = Math.sin(invA);
      const localPx = parentPx + dx * cos - dy * sin;
      const localPy = parentPy + dx * sin + dy * cos;

      // Use LOCAL rotation delta so the parent's already-applied worldAngle is not double-counted.
      const deg = (bone.worldAngle - parentBone.worldAngle) * 180 / Math.PI;
      el.setAttribute('transform', `rotate(${deg.toFixed(3)}, ${localPx.toFixed(1)}, ${localPy.toFixed(1)})`);
    }

    // Helper: rotate a point (px,py) around a pivot (cx,cy) by angle a (radians)
    const rotPt = (px, py, cx, cy, a) => {
      const c = Math.cos(a), s = Math.sin(a);
      return { x: cx + (px - cx) * c - (py - cy) * s,
               y: cy + (px - cx) * s + (py - cy) * c };
    };
    // Helper: convert a global SVG rest-position to parent-local space
    const toLocal = (gx, gy, basePx, basePy, parentAngle) => {
      const invA = -parentAngle;
      const dx = gx - basePx, dy = gy - basePy;
      const c = Math.cos(invA), s = Math.sin(invA);
      return { x: basePx + dx * c - dy * s, y: basePy + dx * s + dy * c };
    };

    // ---- COMPOUND nested parts: shoe groups follow hip → knee → shin → foot (ankle) → ankle (toe) ----
    const compoundShoes = [
      // Back leg shoe (inside foot_L, parent = hip_R rotating from 618,784)
      { id: 'PUjcIyaolh0lGDYHVFZyT',
        parentBoneId: 'hip_R', basePx: 618, basePy: 784,
        kneeBoneId:  'knee_R', kneeGx: 897,  kneeGy: 1292,
        shinBoneId:  'shin_R', shinGx: 1084, shinGy: 1545,
        footBoneId:  'foot_R', anklGx: 1270, anklGy: 1797,
        ankleBoneId: 'ankle_R', toeGx: 1370,  toeGy: 1910 },
      // Forward leg shoe (inside foot_R, parent = hip_L rotating from 618,784)
      { id: 'PFwJL0kw84eAo3B64eP45',
        parentBoneId: 'hip_L', basePx: 618, basePy: 784,
        kneeBoneId:  'knee_L', kneeGx: 641,  kneeGy: 1173,
        shinBoneId:  'shin_L', shinGx: 681,  shinGy: 1518,
        footBoneId:  'foot_L', anklGx: 721,  anklGy: 1863,
        ankleBoneId: 'ankle_L', toeGx: 578,   toeGy: 2448 },
      // Lower-leg shapes (same parent groups): follow hip → knee → shin only,
      // so their bottom edge stays glued to the shoe top regardless of foot/ankle rotation.
      { id: 'No-GH59VJPjHisFvfajAx',
        parentBoneId: 'hip_R', basePx: 618, basePy: 784,
        kneeBoneId:  'knee_R', kneeGx: 897,  kneeGy: 1292,
        shinBoneId:  'shin_R', shinGx: 1084, shinGy: 1545,
        footBoneId:  null },
      { id: 'bWrU_ivayxV1i5cmb2spU',
        parentBoneId: 'hip_L', basePx: 618, basePy: 784,
        kneeBoneId:  'knee_L', kneeGx: 641,  kneeGy: 1173,
        shinBoneId:  'shin_L', shinGx: 681,  shinGy: 1518,
        footBoneId:  null },
    ];

    for (const { id, parentBoneId, basePx, basePy, kneeBoneId, kneeGx, kneeGy, shinBoneId, shinGx, shinGy, footBoneId, anklGx, anklGy, ankleBoneId, toeGx, toeGy } of compoundShoes) {
      const el         = svg.getElementById(id);
      const parentBone = this.skeleton.getBone(parentBoneId);
      const kneeBone   = this.skeleton.getBone(kneeBoneId);
      const shinBone   = this.skeleton.getBone(shinBoneId);
      if (!el || !parentBone || !kneeBone || !shinBone) continue;

      const lkp   = toLocal(kneeGx, kneeGy, basePx, basePy, parentBone.worldAngle);
      const lshin = toLocal(shinGx, shinGy,  basePx, basePy, parentBone.worldAngle);

      const kneeDelta = kneeBone.worldAngle - parentBone.worldAngle;
      const shinDelta = shinBone.worldAngle - kneeBone.worldAngle;

      const lshinAfterKnee = rotPt(lshin.x, lshin.y, lkp.x, lkp.y, kneeDelta);

      const d1 = (kneeDelta * 180 / Math.PI).toFixed(3);
      const d2 = (shinDelta * 180 / Math.PI).toFixed(3);

      // Leg-shape-only entries stop here (knee+shin only)
      if (!footBoneId) {
        el.setAttribute('transform',
          `rotate(${d2}, ${lshinAfterKnee.x.toFixed(1)}, ${lshinAfterKnee.y.toFixed(1)}) rotate(${d1}, ${lkp.x.toFixed(1)}, ${lkp.y.toFixed(1)})`);
        continue;
      }

      // Shoe entries: continue adding foot and ankle rotations
      const footBone   = this.skeleton.getBone(footBoneId);
      const ankleBone  = this.skeleton.getBone(ankleBoneId);
      if (!footBone || !ankleBone) continue;

      // Pivot positions in parent-local space (at rest = same as global when parentAngle=0)
      const lakp  = toLocal(anklGx, anklGy,  basePx, basePy, parentBone.worldAngle);
      const ltoe  = toLocal(toeGx,  toeGy,   basePx, basePy, parentBone.worldAngle);

      const footDelta  = footBone.worldAngle  - shinBone.worldAngle;
      const ankleDelta = ankleBone.worldAngle - footBone.worldAngle;

      const lakAfterShin   = rotPt(lakp.x,  lakp.y,  lshinAfterKnee.x, lshinAfterKnee.y, shinDelta);
      const ltoeAfterFoot  = rotPt(
        rotPt(ltoe.x, ltoe.y, lkp.x, lkp.y, kneeDelta).x,
        rotPt(ltoe.x, ltoe.y, lkp.x, lkp.y, kneeDelta).y,
        lshinAfterKnee.x, lshinAfterKnee.y, shinDelta
      );
      const ltoeAfterFootFinal = rotPt(ltoeAfterFoot.x, ltoeAfterFoot.y, lakAfterShin.x, lakAfterShin.y, footDelta);

      const d3 = (footDelta  * 180 / Math.PI).toFixed(3);
      const d4 = (ankleDelta * 180 / Math.PI).toFixed(3);
      el.setAttribute('transform',
        `rotate(${d4}, ${ltoeAfterFootFinal.x.toFixed(1)}, ${ltoeAfterFootFinal.y.toFixed(1)}) rotate(${d3}, ${lakAfterShin.x.toFixed(1)}, ${lakAfterShin.y.toFixed(1)}) rotate(${d2}, ${lshinAfterKnee.x.toFixed(1)}, ${lshinAfterKnee.y.toFixed(1)}) rotate(${d1}, ${lkp.x.toFixed(1)}, ${lkp.y.toFixed(1)})`);
    }

    // ---- Forward arm: linear blend skinning directly on path d attributes ----
    this._updateArmSkin();

    // ---- Back arm: same LBS treatment as forward arm ----
    this._updateBackArmSkin();

    // ---- Floating detailed hand - forward arm (epMjnnml) follows full shoulder+elbow+wrist chain ----
    {
      const el           = svg.getElementById('epMjnnml733FbOE6a1-j');
      const shoulderBone = this.skeleton.getBone('shoulder_L');
      const elbowBone    = this.skeleton.getBone('elbow_L');
      const handBone     = this.skeleton.getBone('hand_L');
      if (el && shoulderBone && elbowBone && handBone) {
        const elbowRot = rotPt(1050, 960, 780, 653, shoulderBone.worldAngle);
        const wristRot = rotPt(
          rotPt(1150, 1220, 780, 653, shoulderBone.worldAngle).x,
          rotPt(1150, 1220, 780, 653, shoulderBone.worldAngle).y,
          elbowRot.x, elbowRot.y, elbowBone.worldAngle - shoulderBone.worldAngle
        );
        const d1 = (shoulderBone.worldAngle                         * 180 / Math.PI).toFixed(3);
        const d2 = ((elbowBone.worldAngle - shoulderBone.worldAngle) * 180 / Math.PI).toFixed(3);
        const d3 = ((handBone.worldAngle  - elbowBone.worldAngle)    * 180 / Math.PI).toFixed(3);
        el.setAttribute('transform',
          `rotate(${d3}, ${wristRot.x.toFixed(1)}, ${wristRot.y.toFixed(1)}) rotate(${d2}, ${elbowRot.x.toFixed(1)}, ${elbowRot.y.toFixed(1)}) rotate(${d1}, 780, 653)`);
      }
    }

    // ---- Floating detailed hand - back arm (epMjnnml733FbOE6a1-j-2) follows shoulder_R+elbow_R+hand_R ----
    {
      const el           = svg.getElementById('epMjnnml733FbOE6a1-j-2');
      const shoulderBone = this.skeleton.getBone('shoulder_R');
      const elbowBone    = this.skeleton.getBone('elbow_R');
      const handBone     = this.skeleton.getBone('hand_R');
      if (el && shoulderBone && elbowBone && handBone) {
        const elbowRot = rotPt(620, 930, 780, 653, shoulderBone.worldAngle);
        const wristRot = rotPt(
          rotPt(600, 1150, 780, 653, shoulderBone.worldAngle).x,
          rotPt(600, 1150, 780, 653, shoulderBone.worldAngle).y,
          elbowRot.x, elbowRot.y, elbowBone.worldAngle - shoulderBone.worldAngle
        );
        const d1 = (shoulderBone.worldAngle                          * 180 / Math.PI).toFixed(3);
        const d2 = ((elbowBone.worldAngle  - shoulderBone.worldAngle) * 180 / Math.PI).toFixed(3);
        const d3 = ((handBone.worldAngle   - elbowBone.worldAngle)    * 180 / Math.PI).toFixed(3);
        el.setAttribute('transform',
          `rotate(${d3}, ${wristRot.x.toFixed(1)}, ${wristRot.y.toFixed(1)}) rotate(${d2}, ${elbowRot.x.toFixed(1)}, ${elbowRot.y.toFixed(1)}) rotate(${d1}, 780, 653)`);
      }
    }
  }

  // Set (or clear) a reference background image shown behind the canvas.
  _setBackground(url, opacity = 1) {
    const ref = document.getElementById('bg-ref');
    if (!ref) return;
    if (url) {
      ref.style.backgroundImage = `url('${url}')`;
      ref.style.opacity = String(opacity);
    } else {
      ref.style.backgroundImage = '';
      ref.style.opacity = '';
    }
    // Clear any old canvas background (from earlier approach)
    this.canvas.style.backgroundImage = '';
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
    this.timeline.update();

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
    this.renderer3d.update(
      this.shapeRenderer.shapes,
      this.skeleton,
      this.canvas.width,
      this.canvas.height,
      this.scale,
      this.userZoom,
      this.rotationY,
      this.showSkeleton,
      this.shapeRenderer.enabled
    );
    this._updateCatalystSvg();
  }

  // Convert a canvas pixel coordinate to world (pre-scale) space.
  // Accounts for the current Y rotation so dragging a bone in the rotated view
  // moves it in the correct world-space direction.
  _canvasToWorld(cx, cy) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ts = this.scale * this.userZoom;
    const cosY = Math.cos(this.rotationY * Math.PI / 180);
    // Near 90°/270° the X dimension is edge-on; clamp cos to avoid huge values.
    // In practice, at pure 90° the X drag simply doesn’t change the world X.
    const xDiv = (Math.abs(cosY) > 0.08 ? cosY : Math.sign(cosY || 1) * 0.08) * ts;
    return {
      x: (cx - w / 2) / xDiv + w / 2 / this.scale,
      y: (cy - h / 2) / ts  + h / 2 / this.scale,
    };
  }

  // Write the dragged parent bone's current rotation as a keyframe at player.time.
  _writeDragKeyframe() {
    if (!this._drag || !this.player.clip) return;
    const bone = this._drag.bone;
    const parent = bone.parentId ? this.skeleton.getBone(bone.parentId) : bone;
    const t = this.player.time;
    this.player.clip.upsertKeyframe(t, parent.id, 'rotation', parent.rotation);
    // Remember what was last written so endDrag can highlight it
    this._lastDragKf = { boneId: parent.id, time: t };
  }

  // Write rotation + positionZ keyframes for the dragged bone's parent.
  _writeDragKeyframe() {
    if (!this._drag || !this.player.clip) return;
    const bone   = this._drag.bone;
    const parent = bone.parentId ? this.skeleton.getBone(bone.parentId) : bone;
    const t = this.player.time;
    this.player.clip.upsertKeyframe(t, parent.id, 'rotation', parent.rotation);
    // Also keyframe depth (positionZ) if it was set during a 3D drag
    if (parent.positionZ !== 0) {
      this.player.clip.upsertKeyframe(t, parent.id, 'positionZ', parent.positionZ);
    }
    this._lastDragKf = { boneId: parent.id, time: t };
  }

  // Drag a bone so it visually tracks the cursor at any Y-rotation angle.
  // • Cursor Y → bone rotation in the XY plane (unchanged from 0° to 90°).
  // • Cursor X with sinY weighting → parent positionZ (depth), making limbs
  //   visually swing left/right when viewed from the side.
  _dragBoneToScreen(bone, cx, cy) {
    const parent = bone.parentId ? this.skeleton.getBone(bone.parentId) : null;
    if (!parent) {
      // Root bone — translate in world space avoiding cosY amplification
      const ts = this.scale * this.userZoom;
      const w = this.canvas.width, h = this.canvas.height;
      bone.positionX = (cx - w / 2) / ts + w / 2 / this.scale - this.skeleton.rootX;
      bone.positionY = (cy - h / 2) / ts + h / 2 / this.scale - this.skeleton.rootY;
      return;
    }

    const ts   = this.scale * this.userZoom;
    const w    = this.canvas.width, h = this.canvas.height;
    const θ    = this.rotationY * Math.PI / 180;
    const cosY = Math.cos(θ);
    const sinY = Math.sin(θ);
    const cxW  = w / 2 / this.scale;
    const cyW  = h / 2 / this.scale;
    const gp   = parent.parentId ? this.skeleton.getBone(parent.parentId) : null;
    const gpAngle = gp ? gp.worldAngle : 0;

    // Project parent bone to canvas pixels (includes worldZ contribution)
    const psx = w / 2 + (parent.worldX - cxW) * cosY * ts + (parent.worldZ || 0) * sinY * ts;
    const psy = h / 2 + (parent.worldY - cyW) * ts;

    // ---- XY rotation (from cursor Y and cosY-weighted cursor X) ----
    const sdx = (cx - psx) / ts;
    const sdy = (cy - psy) / ts;
    if (Math.hypot(sdx, sdy) > 0.1) {
      // At θ=0°: atan2(sdy, sdx)        — full 2D drag as before
      // At θ=90°: atan2(sdy, 0) = ±π/2   — only vertical cursor steers the XY rotation
      const worldAngle = Math.atan2(sdy, sdx * cosY);
      const localAngle  = Math.atan2(bone.positionY, bone.positionX);
      parent.rotation   = worldAngle - localAngle - gpAngle;
    }

    // ---- Depth / Z drag (from cursor X, weighted by sinY) ----
    // At θ=0°: sinY=0 → no Z change (depth invisible from front).
    // At θ=90°: sinY=1 → full Z control — cursor X maps directly to worldZ.
    // Between: smooth blend so partial rotations work naturally.
    if (Math.abs(sinY) > 0.05) {
      // After rotating in XY, solve to get updated bone.worldX, then use screen X
      // relationship to find positionZ:
      //   screen_X = (bone.worldX * cosY + bone.worldZ * sinY) * ts + w/2
      //   ⇒ bone.worldZ = ((cx - w/2)/ts - bone.worldX * cosY) / sinY
      // bone.worldZ = parent.positionZ + bone.positionZ ≈ parent.positionZ  (positionZ=0 on child)
      this.skeleton.solve(); // get updated bone.worldX after rotation change
      const targetCombined = (cx - w / 2) / ts;       // desired (worldX*cos + worldZ*sin)
      parent.positionZ = (targetCombined - bone.worldX * cosY) / sinY;
    } else {
      // Near 0°/180° — depth is invisible; reset positionZ so keyframes stay clean
      // (only clear it if it was non-zero from a previous side-view drag)
      if (Math.abs(parent.positionZ || 0) > 0.5) parent.positionZ = 0;
    }
  }

  _initDrag() {
    const HIT_PX = 14; // hit radius in screen pixels

    // Project a bone’s world position to canvas pixel coordinates, respecting Y rotation.
    // Matches the Three.js orthographic projection used by Renderer3D._syncCamera.
    const boneToScreen = (bone) => {
      const w    = this.canvas.width;
      const h    = this.canvas.height;
      const ts   = this.scale * this.userZoom;
      const θ    = this.rotationY * Math.PI / 180;
      const cosY = Math.cos(θ);
      const sinY = Math.sin(θ);
      const cxW  = w / 2 / this.scale;
      const cyW  = h / 2 / this.scale;
      return {
        sx: w / 2 + (bone.worldX - cxW) * cosY * ts + (bone.worldZ || 0) * sinY * ts,
        sy: h / 2 + (bone.worldY - cyW) * ts,
      };
    };

    const nearestBone = (cx, cy) => {
      let best = null, bestDist = Infinity;
      for (const bone of this.skeleton.bones.values()) {
        const { sx, sy } = boneToScreen(bone);
        const d = Math.hypot(sx - cx, sy - cy);
        if (d < HIT_PX && d < bestDist) { best = bone; bestDist = d; }
      }
      return best;
    };

    this.canvas.addEventListener('mousedown', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const bone = nearestBone(e.clientX - rect.left, e.clientY - rect.top);
      if (!bone) return;
      e.preventDefault();
      // Snapshot before this drag potentially writes keyframes
      this.pushUndo();
      this._drag = { bone };
      this.player.playing = false;
      this.skeleton.highlightBoneId = bone.id;
      // Highlight matching timeline keyframe for this bone at the current time
      this.timeline.selectKeyframe(bone.id, this.player.currentTime);
      this.canvas.style.cursor = 'grabbing';
    });

    // Use window events for move/up so drag keeps working when cursor leaves canvas
    window.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      if (this._drag) {
        this._dragBoneToScreen(this._drag.bone, cx, cy);
        this.skeleton.solve();
        // Write/update the keyframe at the current playhead time
        this._writeDragKeyframe();
        return;
      }

      // Hover highlight — only when the pointer is actually inside the canvas
      if (e.target === this.canvas) {
        const hovered = nearestBone(cx, cy);
        this._hoverBoneId = hovered ? hovered.id : null;
        this.skeleton.highlightBoneId = this._hoverBoneId;
        this.canvas.style.cursor = hovered ? 'grab' : 'default';
      }
    });

    window.addEventListener('mouseup', () => {
      if (!this._drag) return;
      const kf = this._lastDragKf;
      // Rebuild timeline so new/updated keyframe diamonds are visible
      this.timeline.build();
      // Auto-select the diamond that was just written for visual confirmation
      if (kf) this.timeline.selectKeyframe(kf.boneId, kf.time);
      this._drag = null;
      this._lastDragKf = null;
      this.skeleton.highlightBoneId = this._hoverBoneId;
      this.canvas.style.cursor = this._hoverBoneId ? 'grab' : 'default';
    });
  }

  _sizeCanvas() {
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;

    // Keep Three.js renderer size in sync with the canvas
    this.renderer3d.setSize(this.canvas.width, this.canvas.height);

    if (this._lottieMeta) {
      // Scale to fit the comp's declared dimensions (same as a standard Lottie player).
      // This is reliable regardless of where individual layers sit in comp space.
      const meta = this._lottieMeta;
      const padding = 0.92;
      this.scale = Math.min(
        this.canvas.width  / meta.width,
        this.canvas.height / meta.height
      ) * padding;

      // Center the comp rectangle on the canvas.
      // __comp_root sits at (rootX, rootY); all Lottie positions are relative to it,
      // so placing the comp center at the canvas center means:
      //   rootX + meta.width/2  == canvas.width/2  / scale
      //   rootY + meta.height/2 == canvas.height/2 / scale
      if (this.skeleton.root) {
        this.skeleton.rootX = this.canvas.width  / 2 / this.scale - meta.width  / 2;
        this.skeleton.rootY = this.canvas.height / 2 / this.scale - meta.height / 2;
      }
    } else if (this._catalystManMode) {
      // Scale exactly to match the CSS `backgroundSize: contain` for the 2000×2700 PNG.
      // This ensures skeleton joint positions (in SVG pixels) land precisely on the PNG circles.
      this.scale = Math.min(this.canvas.width / 2000, this.canvas.height / 2700);
      if (this.skeleton.root) {
        // PNG may have horizontal letterbox bars; offset rootX so SVG (0,0) = PNG top-left corner.
        // root.positionX=618, positionY=784: world (rootX+618, rootY+784) → canvas pixel (offX+618*scale, offY+784*scale).
        const pngW = 2000 * this.scale;
        const pngH = 2700 * this.scale;
        this.skeleton.rootX = (this.canvas.width  - pngW) / 2 / this.scale;
        this.skeleton.rootY = (this.canvas.height - pngH) / 2 / this.scale;
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
