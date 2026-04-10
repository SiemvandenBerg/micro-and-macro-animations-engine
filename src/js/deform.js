// deform.js — Path point displacement driven by bone transforms

export class DeformBinding {
  constructor(shapeId, pointIndex, influences) {
    this.shapeId = shapeId;
    this.pointIndex = pointIndex;
    // influences: [{ boneId, weight, restDx, restDy }]
    // restDx/restDy = point position relative to bone rest position
    this.influences = influences;
  }
}

export class PathDeformer {
  constructor(skeleton, shapeRenderer) {
    this.skeleton = skeleton;
    this.shapeRenderer = shapeRenderer;
    this.bindings = [];
    this.enabled = true;
    // Snapshot of original point positions (taken once at init)
    this._restPoints = new Map(); // 'shapeId:pointIndex' → {x, y}
  }

  addBinding(binding) {
    this.bindings.push(binding);
    return binding;
  }

  // Call once after all shapes and bindings are set up to capture rest positions
  captureRestPose() {
    this._restPoints.clear();
    for (const b of this.bindings) {
      const shape = this.shapeRenderer.shapes.find(s => s.id === b.shapeId);
      if (!shape || shape.type !== 'path') continue;
      const pt = shape.props.points[b.pointIndex];
      if (!pt) continue;
      const key = `${b.shapeId}:${b.pointIndex}`;
      this._restPoints.set(key, { x: pt.x, y: pt.y });
    }
  }

  // Apply deformations: shift path points based on bone delta from rest pose
  apply() {
    if (!this.enabled) {
      this._resetToRest();
      return;
    }

    for (const b of this.bindings) {
      const shape = this.shapeRenderer.shapes.find(s => s.id === b.shapeId);
      if (!shape || shape.type !== 'path') continue;
      const pt = shape.props.points[b.pointIndex];
      if (!pt) continue;

      const key = `${b.shapeId}:${b.pointIndex}`;
      const rest = this._restPoints.get(key);
      if (!rest) continue;

      // Start from rest position
      let dx = 0;
      let dy = 0;

      for (const inf of b.influences) {
        const bone = this.skeleton.getBone(inf.boneId);
        if (!bone) continue;

        // Displacement = how far the bone's rotation deviates from rest
        const angleDelta = bone.rotation - bone.restRotation;

        // Convert angular displacement into a positional offset
        // perpendicular to the bone direction, scaled by weight
        const boneLen = Math.hypot(bone.anchorWorldX - bone.worldX, bone.anchorWorldY - bone.worldY) || 1;
        const perpX = -Math.sin(bone.worldAngle) * angleDelta * boneLen * inf.weight;
        const perpY =  Math.cos(bone.worldAngle) * angleDelta * boneLen * inf.weight;

        dx += perpX;
        dy += perpY;
      }

      pt.x = rest.x + dx;
      pt.y = rest.y + dy;
    }
  }

  _resetToRest() {
    for (const b of this.bindings) {
      const shape = this.shapeRenderer.shapes.find(s => s.id === b.shapeId);
      if (!shape || shape.type !== 'path') continue;
      const pt = shape.props.points[b.pointIndex];
      if (!pt) continue;
      const key = `${b.shapeId}:${b.pointIndex}`;
      const rest = this._restPoints.get(key);
      if (!rest) continue;
      pt.x = rest.x;
      pt.y = rest.y;
    }
  }
}
