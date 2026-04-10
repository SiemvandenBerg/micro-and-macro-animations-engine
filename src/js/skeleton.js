// skeleton.js — Unified bone hierarchy with AE-compatible transform model
//
// Each bone is a transform node: position → rotation → scale → anchor
// This matches the Lottie/After Effects layer model, making imports direct.
// The built-in character rig uses the same model.

export class Bone {
  constructor(id, parentId = null) {
    this.id = id;
    this.parentId = parentId;
    this.children = [];

    // Animatable local transform (AE layer model)
    this.positionX = 0;      // local position relative to parent anchor
    this.positionY = 0;
    this.rotation = 0;       // local rotation in radians
    this.scaleX = 1;         // local scale
    this.scaleY = 1;
    this.anchorX = 0;        // pivot point for rotation/scale and child attachment
    this.anchorY = 0;

    // Rest pose (for resetPose and delta-based animation transfer)
    this.restPositionX = 0;
    this.restPositionY = 0;
    this.restRotation = 0;
    this.restScaleX = 1;
    this.restScaleY = 1;

    // Computed world-space values (updated by solve())
    this.worldX = 0;         // world position of this bone's origin
    this.worldY = 0;
    this.worldAngle = 0;     // accumulated world rotation
    this.worldScaleX = 1;    // accumulated world scale
    this.worldScaleY = 1;
    // World position of anchor (where children attach + shape pivot)
    this.anchorWorldX = 0;
    this.anchorWorldY = 0;
  }
}

export class Skeleton {
  constructor() {
    this.bones = new Map();   // id → Bone
    this.root = null;
    this.rootX = 0;           // global offset (canvas centering)
    this.rootY = 0;
  }

  addBone(id, parentId = null) {
    const bone = new Bone(id, parentId);
    this.bones.set(id, bone);
    if (parentId === null) {
      this.root = bone;
    } else {
      const parent = this.bones.get(parentId);
      if (parent) parent.children.push(bone);
    }
    return bone;
  }

  // Wire up parent-child links for bones added out of order (e.g. Lottie import)
  finalize() {
    for (const bone of this.bones.values()) {
      if (bone.parentId === null) continue;
      const parent = this.bones.get(bone.parentId);
      if (parent && !parent.children.includes(bone)) {
        parent.children.push(bone);
      }
    }
  }

  getBone(id) {
    return this.bones.get(id);
  }

  // Forward kinematics: walk the tree from root, compute world transforms.
  //
  // Transform chain per bone (matches AE):
  //   1. Start at parent's anchor world position
  //   2. Translate by bone's position (rotated+scaled into parent space)
  //   3. Rotate by bone's rotation
  //   4. Scale by bone's scale
  //   5. Translate by -anchor to get the anchor world position (child attachment)
  //
  solve() {
    if (!this.root) return;
    this._solveRecursive(this.root, this.rootX, this.rootY, 0, 1, 1);
  }

  _solveRecursive(bone, parentAnchorX, parentAnchorY, parentAngle, parentScaleX, parentScaleY) {
    // Step 1-2: Position this bone relative to parent's anchor point
    const cos = Math.cos(parentAngle);
    const sin = Math.sin(parentAngle);
    const px = bone.positionX * parentScaleX;
    const py = bone.positionY * parentScaleY;

    bone.worldX = parentAnchorX + px * cos - py * sin;
    bone.worldY = parentAnchorY + px * sin + py * cos;

    // Step 3-4: Accumulate rotation and scale
    bone.worldAngle = parentAngle + bone.rotation;
    bone.worldScaleX = parentScaleX * bone.scaleX;
    bone.worldScaleY = parentScaleY * bone.scaleY;

    // Step 5: Compute anchor world position (where children connect, shapes pivot)
    const wcos = Math.cos(bone.worldAngle);
    const wsin = Math.sin(bone.worldAngle);
    const ax = -bone.anchorX * bone.worldScaleX;
    const ay = -bone.anchorY * bone.worldScaleY;
    bone.anchorWorldX = bone.worldX + ax * wcos - ay * wsin;
    bone.anchorWorldY = bone.worldY + ax * wsin + ay * wcos;

    // Recurse: children attach at this bone's anchor world position
    for (const child of bone.children) {
      this._solveRecursive(child, bone.anchorWorldX, bone.anchorWorldY,
        bone.worldAngle, bone.worldScaleX, bone.worldScaleY);
    }
  }

  // Snapshot current transform as rest pose
  captureRestPose() {
    for (const bone of this.bones.values()) {
      bone.restPositionX = bone.positionX;
      bone.restPositionY = bone.positionY;
      bone.restRotation = bone.rotation;
      bone.restScaleX = bone.scaleX;
      bone.restScaleY = bone.scaleY;
    }
  }

  // Reset all bones to rest pose
  resetPose() {
    for (const bone of this.bones.values()) {
      bone.positionX = bone.restPositionX;
      bone.positionY = bone.restPositionY;
      bone.rotation = bone.restRotation;
      bone.scaleX = bone.restScaleX;
      bone.scaleY = bone.restScaleY;
    }
  }

  // Debug draw: render bones as lines and joints as circles
  draw(ctx) {
    ctx.save();
    const t = ctx.getTransform();
    const screenScale = Math.hypot(t.a, t.b) || 1;
    ctx.strokeStyle = '#ff3366';
    ctx.fillStyle = '#ff3366';
    ctx.lineWidth = 1 / screenScale;
    ctx.setLineDash([4 / screenScale, 4 / screenScale]);

    for (const bone of this.bones.values()) {
      // Line from this bone's origin to each child's origin
      for (const child of bone.children) {
        ctx.beginPath();
        ctx.moveTo(bone.worldX, bone.worldY);
        ctx.lineTo(child.worldX, child.worldY);
        ctx.stroke();
      }

      // Joint dot at bone origin
      ctx.beginPath();
      ctx.arc(bone.worldX, bone.worldY, 3, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.setLineDash([]);
      ctx.font = `${9 / screenScale}px monospace`;
      ctx.fillText(bone.id, bone.worldX + 5 / screenScale, bone.worldY - 5 / screenScale);
      ctx.setLineDash([4 / screenScale, 4 / screenScale]);
    }

    ctx.restore();
  }
}
