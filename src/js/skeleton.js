// skeleton.js — Bone hierarchy and forward-kinematics transforms

export class Bone {
  constructor(id, length, parentId = null) {
    this.id = id;
    this.length = length;
    this.parentId = parentId;
    this.angle = 0;          // local rotation in radians
    this.baseAngle = 0;      // rest pose angle
    this.scaleX = 1;
    this.scaleY = 1;
    this.children = [];
    // computed world-space values (updated by solve())
    this.worldX = 0;
    this.worldY = 0;
    this.worldAngle = 0;
    this.endX = 0;
    this.endY = 0;
  }
}

export class Skeleton {
  constructor() {
    this.bones = new Map();   // id → Bone
    this.root = null;
    this.rootX = 0;
    this.rootY = 0;
  }

  addBone(id, length, parentId = null) {
    const bone = new Bone(id, length, parentId);
    this.bones.set(id, bone);
    if (parentId === null) {
      this.root = bone;
    } else {
      const parent = this.bones.get(parentId);
      if (parent) parent.children.push(bone);
    }
    return bone;
  }

  getBone(id) {
    return this.bones.get(id);
  }

  // Forward kinematics: walk the tree from root and compute world positions
  solve() {
    if (!this.root) return;
    this._solveRecursive(this.root, this.rootX, this.rootY, 0);
  }

  _solveRecursive(bone, parentX, parentY, parentAngle) {
    bone.worldX = parentX;
    bone.worldY = parentY;
    bone.worldAngle = parentAngle + bone.angle;

    bone.endX = bone.worldX + Math.cos(bone.worldAngle) * bone.length;
    bone.endY = bone.worldY + Math.sin(bone.worldAngle) * bone.length;

    for (const child of bone.children) {
      this._solveRecursive(child, bone.endX, bone.endY, bone.worldAngle);
    }
  }

  // Reset all bones to their base (rest) angles
  resetPose() {
    for (const bone of this.bones.values()) {
      bone.angle = bone.baseAngle;
    }
  }

  // Debug draw: render bones as lines and joints as circles
  draw(ctx) {
    ctx.save();
    const screenScale = ctx.getTransform().a || 1;
    ctx.strokeStyle = '#ff3366';
    ctx.fillStyle = '#ff3366';
    ctx.lineWidth = 1.5 / screenScale;
    ctx.setLineDash([4 / screenScale, 4 / screenScale]);

    for (const bone of this.bones.values()) {
      // bone line
      ctx.beginPath();
      ctx.moveTo(bone.worldX, bone.worldY);
      ctx.lineTo(bone.endX, bone.endY);
      ctx.stroke();

      // joint dot
      ctx.beginPath();
      ctx.arc(bone.worldX, bone.worldY, 3, 0, Math.PI * 2);
      ctx.fill();

      // label
      ctx.setLineDash([]);
      ctx.font = `${9 / screenScale}px monospace`;
      ctx.fillText(bone.id, bone.worldX + 5 / screenScale, bone.worldY - 5 / screenScale);
      ctx.setLineDash([4 / screenScale, 4 / screenScale]);
    }

    ctx.restore();
  }
}
