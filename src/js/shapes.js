// shapes.js — Shape definitions, bone binding, and draw routines

export class Shape {
  constructor(id, type, props, binding) {
    this.id = id;
    this.type = type;          // 'ellipse' | 'rect' | 'path'
    this.props = props;        // type-specific dimensions
    this.binding = binding;    // { boneId, offset: {x,y}, pivot: {x,y}, rotation: 0 }
    this.drawOrder = 0;        // higher = drawn later (in front)
    this.visible = true;       // toggled by dev panel per-bone checkboxes
    this.fill = null;          // CSS color or null (defaults to '#ffffff')
    this.stroke = null;        // CSS color or null (defaults to '#000000')
    this.strokeWidth = null;   // stroke width in comp-space or null (defaults to 1)
    this.noFill = false;       // if true, skip fill (stroke only)
  }
}

export class ShapeRenderer {
  constructor(skeleton) {
    this.skeleton = skeleton;
    this.shapes = [];
    this.enabled = true;
  }

  addShape(shape) {
    this.shapes.push(shape);
    this.shapes.sort((a, b) => a.drawOrder - b.drawOrder);
    return shape;
  }

  draw(ctx) {
    if (!this.enabled) return;

    // Capture base scale before any bone transforms (a = scaleX * cos(0))
    const t = ctx.getTransform();
    const screenScale = Math.hypot(t.a, t.b) || 1;

    for (const shape of this.shapes) {
      if (!shape.visible) continue;
      const bone = this.skeleton.getBone(shape.binding.boneId);
      if (!bone) continue;

      ctx.save();

      // Move to bone world position and apply its transform
      ctx.translate(bone.worldX, bone.worldY);
      ctx.rotate(bone.worldAngle);
      ctx.scale(bone.worldScaleX, bone.worldScaleY);
      ctx.translate(-bone.anchorX, -bone.anchorY);

      // Apply binding offset
      ctx.translate(shape.binding.offset.x, shape.binding.offset.y);
      ctx.rotate(shape.binding.rotation || 0);

      // Style: per-shape fill or default white, black stroke
      ctx.fillStyle = shape.fill || '#ffffff';
      ctx.strokeStyle = shape.stroke || '#000000';
      ctx.lineWidth = (shape.strokeWidth ?? 1) / screenScale;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      this._drawShape(ctx, shape);

      ctx.restore();
    }
  }

  _drawShape(ctx, shape) {
    const p = shape.props;

    switch (shape.type) {
      case 'ellipse': {
        ctx.beginPath();
        ctx.ellipse(0, 0, p.rx, p.ry, 0, 0, Math.PI * 2);
        if (!shape.noFill) ctx.fill();
        ctx.stroke();
        break;
      }
      case 'rect': {
        const hw = p.width / 2;
        const hh = p.height / 2;
        const r = p.radius || 0;
        ctx.beginPath();
        ctx.roundRect(-hw, -hh, p.width, p.height, r);
        if (!shape.noFill) ctx.fill();
        ctx.stroke();
        break;
      }
      case 'path': {
        if (!p.points || p.points.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(p.points[0].x, p.points[0].y);
        for (let i = 1; i < p.points.length; i++) {
          const prev = p.points[i - 1];
          const curr = p.points[i];
          if (prev.out || curr.in) {
            ctx.bezierCurveTo(
              prev.x + (prev.out?.x || 0), prev.y + (prev.out?.y || 0),
              curr.x + (curr.in?.x || 0),  curr.y + (curr.in?.y || 0),
              curr.x, curr.y
            );
          } else {
            ctx.lineTo(curr.x, curr.y);
          }
        }
        if (p.closed) {
          const last = p.points[p.points.length - 1];
          const first = p.points[0];
          if (last.out || first.in) {
            ctx.bezierCurveTo(
              last.x + (last.out?.x || 0),  last.y + (last.out?.y || 0),
              first.x + (first.in?.x || 0), first.y + (first.in?.y || 0),
              first.x, first.y
            );
          }
          ctx.closePath();
        }
        if (!shape.noFill) ctx.fill();
        ctx.stroke();
        break;
      }
    }
  }
}
