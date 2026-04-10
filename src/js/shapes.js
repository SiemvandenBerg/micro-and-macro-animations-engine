// shapes.js — Shape definitions, bone binding, and draw routines

// --- bibone-quad helpers (module-private) ---

// Intersection of two rays: pa+t*d1 and pb+s*d2
function _rayIntersect(pa, dx1, dy1, pb, dx2, dy2) {
  const d = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(d) < 1e-6) return null;
  const t = ((pb.x - pa.x) * dy2 - (pb.y - pa.y) * dx2) / d;
  return { x: pa.x + dx1 * t, y: pa.y + dy1 * t };
}

// Draw a convex polygon with per-vertex arc rounding (radius=0 → sharp corner)
function _roundedPolygon(ctx, pts, radii) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const r = radii[i];
    if (r === 0) {
      i === 0 ? ctx.moveTo(curr.x, curr.y) : ctx.lineTo(curr.x, curr.y);
    } else {
      const dpLen = Math.hypot(prev.x - curr.x, prev.y - curr.y) || 1;
      const dnLen = Math.hypot(next.x - curr.x, next.y - curr.y) || 1;
      const rr    = Math.min(r, dpLen / 2, dnLen / 2);
      const p1x = curr.x + (prev.x - curr.x) / dpLen * rr;
      const p1y = curr.y + (prev.y - curr.y) / dpLen * rr;
      const p2x = curr.x + (next.x - curr.x) / dnLen * rr;
      const p2y = curr.y + (next.y - curr.y) / dnLen * rr;
      i === 0 ? ctx.moveTo(p1x, p1y) : ctx.lineTo(p1x, p1y);
      ctx.arcTo(curr.x, curr.y, p2x, p2y, rr);
    }
  }
  ctx.closePath();
}

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
    this.highlightBoneIds = new Set(); // bones whose shapes should glow
  }

  addShape(shape) {
    this.shapes.push(shape);
    this.shapes.sort((a, b) => a.drawOrder - b.drawOrder);
    return shape;
  }

  draw(ctx) {
    if (!this.enabled) return;

    // Capture base scale before any bone transforms
    const t = ctx.getTransform();
    const screenScale = Math.hypot(t.a, t.b) || 1;

    // First pass: glow halos for highlighted shapes (drawn under everything)
    if (this.highlightBoneIds.size > 0) {
      for (const shape of this.shapes) {
        if (!shape.visible) continue;
        if (!this._shapeInvolvesAnyBone(shape, this.highlightBoneIds)) continue;
        this._drawHighlightHalo(ctx, shape, screenScale);
      }
    }

    for (const shape of this.shapes) {
      if (!shape.visible) continue;

      // bibone-quad: seamless shape spanning two bones, drawn in world space
      if (shape.type === 'bibone-quad') {
        this._drawBiboneQuad(ctx, shape, screenScale);
        continue;
      }

      // tribone-quad: seamless shape spanning three bones with two miter folds
      if (shape.type === 'tribone-quad') {
        this._drawTriboneQuad(ctx, shape, screenScale);
        continue;
      }

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

  // Draw a seamless shape spanning THREE bones with two miter folds.
  // props: { height, radius, length3 }
  //   height  — cross-section width
  //   radius  — corner rounding on start/end only
  //   length3 — how far along bone3 the shape extends
  // binding: { boneId (bone1), boneId2 (bone2), boneId3 (bone3) }
  _drawTriboneQuad(ctx, shape, screenScale) {
    const p  = shape.props;
    const b1 = this.skeleton.getBone(shape.binding.boneId);
    const b2 = this.skeleton.getBone(shape.binding.boneId2);
    const b3 = this.skeleton.getBone(shape.binding.boneId3);
    if (!b1 || !b2 || !b3) return;

    const hw = p.height / 2;
    const r  = Math.min(p.radius || 4, hw);

    const c1 = Math.cos(b1.worldAngle), s1 = Math.sin(b1.worldAngle);
    const c2 = Math.cos(b2.worldAngle), s2 = Math.sin(b2.worldAngle);
    const c3 = Math.cos(b3.worldAngle), s3 = Math.sin(b3.worldAngle);

    // Left (+perp) offset vectors for each bone direction
    const L1 = { x: -s1 * hw, y:  c1 * hw };
    const L2 = { x: -s2 * hw, y:  c2 * hw };
    const L3 = { x: -s3 * hw, y:  c3 * hw };

    // Key world positions
    const ox = b1.worldX, oy = b1.worldY;         // start of bone1
    const tx = b3.worldX + c3 * p.length3;        // tip of bone3
    const ty = b3.worldY + s3 * p.length3;

    // Points on bone2’s left/right edges at its origin
    const jl2 = { x: b2.worldX + L2.x, y: b2.worldY + L2.y };
    const jr2 = { x: b2.worldX - L2.x, y: b2.worldY - L2.y };

    // Points on bone3’s left/right edges at its origin
    const jl3 = { x: b3.worldX + L3.x, y: b3.worldY + L3.y };
    const jr3 = { x: b3.worldX - L3.x, y: b3.worldY - L3.y };

    // Outer start/end corners
    const bl = { x: ox + L1.x, y: oy + L1.y };
    const br = { x: ox - L1.x, y: oy - L1.y };
    const tl = { x: tx + L3.x, y: ty + L3.y };
    const tr = { x: tx - L3.x, y: ty - L3.y };

    // Miter at bone1–bone2 junction
    const ml12 = _rayIntersect(bl,  c1, s1, jl2, -c2, -s2) ?? jl2;
    const mr12 = _rayIntersect(br,  c1, s1, jr2, -c2, -s2) ?? jr2;

    // Miter at bone2–bone3 junction
    const ml23 = _rayIntersect(jl2, c2, s2, jl3, -c3, -s3) ?? jl3;
    const mr23 = _rayIntersect(jr2, c2, s2, jr3, -c3, -s3) ?? jr3;

    // Polygon: bl → ml12 → ml23 → tl → tr → mr23 → mr12 → br
    ctx.save();
    ctx.fillStyle   = shape.fill   || '#ffffff';
    ctx.strokeStyle = shape.stroke || '#000000';
    ctx.lineWidth   = (shape.strokeWidth ?? 1) / screenScale;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';

    ctx.beginPath();
    _roundedPolygon(ctx,
      [bl, ml12, ml23, tl, tr, mr23, mr12, br],
      [r,  0,    0,    r,  r,  0,    0,    r  ]);
    if (!shape.noFill) ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Returns true if this shape involves any of the given bone IDs
  _shapeInvolvesAnyBone(shape, boneIds) {
    if (boneIds.has(shape.binding.boneId)) return true;
    if (shape.binding.boneId2 && boneIds.has(shape.binding.boneId2)) return true;
    if (shape.binding.boneId3 && boneIds.has(shape.binding.boneId3)) return true;
    return false;
  }

  // Draw a soft glow halo behind a shape by re-drawing it with a thick semi-transparent stroke
  _drawHighlightHalo(ctx, shape, screenScale) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    const glowWidth = 12 / screenScale;

    if (shape.type === 'bibone-quad' || shape.type === 'tribone-quad') {
      // Re-draw the multi-bone shape with a thick coloured stroke
      const origStroke = shape.stroke;
      const origSW = shape.strokeWidth;
      const origFill = shape.fill;
      shape.stroke = '#ffee00';
      shape.strokeWidth = glowWidth * screenScale;
      shape.fill = 'transparent';
      shape.noFill = true;
      if (shape.type === 'bibone-quad') this._drawBiboneQuad(ctx, shape, screenScale);
      else this._drawTriboneQuad(ctx, shape, screenScale);
      shape.stroke = origStroke;
      shape.strokeWidth = origSW;
      shape.fill = origFill;
      shape.noFill = false;
    } else {
      const bone = this.skeleton.getBone(shape.binding.boneId);
      if (!bone) { ctx.restore(); return; }
      ctx.translate(bone.worldX, bone.worldY);
      ctx.rotate(bone.worldAngle);
      ctx.scale(bone.worldScaleX, bone.worldScaleY);
      ctx.translate(-bone.anchorX, -bone.anchorY);
      ctx.translate(shape.binding.offset.x, shape.binding.offset.y);
      ctx.rotate(shape.binding.rotation || 0);
      ctx.fillStyle = 'transparent';
      ctx.strokeStyle = '#ffee00';
      ctx.lineWidth = glowWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      this._drawShape(ctx, shape);
    }
    ctx.restore();
  }

  // Draw a seamless quadrilateral spanning bone1 (proximal) → bone2 (distal).
  // props: { height, radius, length2 }
  //   height  — cross-section width of the tube
  //   radius  — corner rounding on the outer (non-junction) ends
  //   length2 — how far along bone2 the shape extends
  // binding: { boneId (bone1), boneId2 (bone2) }
  _drawBiboneQuad(ctx, shape, screenScale) {
    const p  = shape.props;
    const b1 = this.skeleton.getBone(shape.binding.boneId);
    const b2 = this.skeleton.getBone(shape.binding.boneId2);
    if (!b1 || !b2) return;

    const hw = p.height / 2;
    const r  = Math.min(p.radius || 8, hw);

    const a1 = b1.worldAngle, a2 = b2.worldAngle;
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const c2 = Math.cos(a2), s2 = Math.sin(a2);

    // Key world positions
    const ox = b1.worldX, oy = b1.worldY;    // spine start  (bottom)
    const jx = b2.worldX, jy = b2.worldY;    // junction     (spine→chest join)
    const tx = jx + c2 * p.length2;          // chest end    (top)
    const ty = jy + s2 * p.length2;

    // Left (+perp) and right (-perp) offsets for each bone direction
    const L1 = { x: -s1 * hw, y:  c1 * hw };
    const L2 = { x: -s2 * hw, y:  c2 * hw };

    // Four outer corners
    const bl = { x: ox + L1.x, y: oy + L1.y };
    const br = { x: ox - L1.x, y: oy - L1.y };
    const tl = { x: tx + L2.x, y: ty + L2.y };
    const tr = { x: tx - L2.x, y: ty - L2.y };

    // Miter at junction: intersect left edge of b1 with left edge of b2
    // Left edge of b1 goes from bl in direction (c1,s1)
    // Left edge of b2 goes from tl in direction (-c2,-s2)
    const ml = _rayIntersect(bl, c1, s1, tl, -c2, -s2) ?? { x: jx + L1.x, y: jy + L1.y };
    const mr = _rayIntersect(br, c1, s1, tr, -c2, -s2) ?? { x: jx - L1.x, y: jy - L1.y };

    // Polygon: bl → ml (miter-left) → tl → tr → mr (miter-right) → br
    // Outer corners (bl, tl, tr, br) get radius; miter points (ml, mr) stay sharp
    ctx.save();
    ctx.fillStyle   = shape.fill   || '#ffffff';
    ctx.strokeStyle = shape.stroke || '#000000';
    ctx.lineWidth   = (shape.strokeWidth ?? 1) / screenScale;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';

    ctx.beginPath();
    _roundedPolygon(ctx, [bl, ml, tl, tr, mr, br], [r, 0, r, r, 0, r]);
    if (!shape.noFill) ctx.fill();
    ctx.stroke();
    ctx.restore();
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
        // p.radii = [TL, TR, BR, BL] for per-corner control; falls back to uniform p.radius
        const r = p.radii || p.radius || 0;
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
