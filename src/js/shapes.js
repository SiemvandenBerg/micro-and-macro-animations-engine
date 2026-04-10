// shapes.js — Shape definitions, bone binding, and draw routines

export class Shape {
  constructor(id, type, props, binding) {
    this.id = id;
    this.type = type;          // 'ellipse' | 'rect' | 'path'
    this.props = props;        // type-specific dimensions
    this.binding = binding;    // { boneId, offset: {x,y}, pivot: {x,y}, rotation: 0 }
    this.drawOrder = 0;        // higher = drawn later (in front)
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

    for (const shape of this.shapes) {
      const bone = this.skeleton.getBone(shape.binding.boneId);
      if (!bone) continue;

      ctx.save();

      // Move to bone world position
      ctx.translate(bone.worldX, bone.worldY);
      ctx.rotate(bone.worldAngle);

      // Apply binding offset
      ctx.translate(shape.binding.offset.x, shape.binding.offset.y);
      ctx.rotate(shape.binding.rotation || 0);

      // Style: white fill, black stroke
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
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
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'rect': {
        const hw = p.width / 2;
        const hh = p.height / 2;
        const r = p.radius || 0;
        ctx.beginPath();
        ctx.roundRect(-hw, -hh, p.width, p.height, r);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'path': {
        // p.points is an array of {x, y} — draw as a closed or open polyline
        if (!p.points || p.points.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(p.points[0].x, p.points[0].y);
        for (let i = 1; i < p.points.length; i++) {
          ctx.lineTo(p.points[i].x, p.points[i].y);
        }
        if (p.closed) ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
    }
  }
}
