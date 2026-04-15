// lottie-importer.js — Convert Lottie JSON to engine skeleton, shapes, and animation clips

import { AnimationClip } from './animation.js';
import { Shape } from './shapes.js';

export class LottieImporter {

  /**
   * Import a Lottie JSON file and convert to engine-compatible data.
   * @param {object|string} json - Lottie JSON data (object or string)
   * @returns {{ meta, bones, shapes, clip }}
   */
  import(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;

    this._meta = {
      name: data.nm || 'untitled',
      version: data.v,
      fps: data.fr || 30,
      inFrame: data.ip || 0,
      outFrame: data.op || 60,
      width: data.w || 512,
      height: data.h || 512,
    };
    this._meta.duration = (this._meta.outFrame - this._meta.inFrame) / this._meta.fps;

    // Flatten pre-comp layers
    const layers = this._resolveLayers(data);

    // Build look-ups
    this._layerMap = new Map();
    this._boneIds = new Map();
    for (const layer of layers) {
      this._layerMap.set(layer.ind, layer);
      this._boneIds.set(layer.ind, this._makeBoneId(layer));
    }

    const bones = this._extractBones(layers);
    const shapes = this._extractShapes(layers);
    const clip = this._extractClip(layers);

    return { meta: this._meta, bones, shapes, clip };
  }

  // ─── Layer resolution ───────────────────────────────────────────────

  _resolveLayers(data) {
    const assetMap = new Map();
    if (data.assets) {
      for (const asset of data.assets) {
        if (asset.layers) assetMap.set(asset.id, asset);
      }
    }
    // If top-level layers are pre-comps, use the first asset's layers
    for (const layer of data.layers) {
      if (layer.ty === 0 && layer.refId) {
        const asset = assetMap.get(layer.refId);
        if (asset && asset.layers.length > 0) {
          return asset.layers.filter(l => l.ty === 3 || l.ty === 4);
        }
      }
    }
    return data.layers.filter(l => l.ty === 3 || l.ty === 4);
  }

  // ─── ID helpers ─────────────────────────────────────────────────────

  _makeBoneId(layer) {
    let base = (layer.nm || 'layer')
      .replace(/\|/g, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase();
    if (!base) base = 'layer';
    return `${base}_${layer.ind}`;
  }

  _getBoneId(ind) {
    return this._boneIds.get(ind) || null;
  }

  // ─── Value extraction ───────────────────────────────────────────────

  _getStaticValue(prop, fallback) {
    if (!prop) return fallback;
    if (prop.a === 1) {
      // Animated — return value at first keyframe
      const kfs = prop.k;
      if (Array.isArray(kfs) && kfs.length > 0 && kfs[0] && 's' in kfs[0]) {
        return kfs[0].s;
      }
      return fallback;
    }
    return prop.k ?? fallback;
  }

  _scalarValue(v) {
    if (Array.isArray(v)) return v[0];
    return v;
  }

  // ─── Bone extraction ───────────────────────────────────────────────

  _extractBones(layers) {
    const bones = [];

    // Lottie can have many parentless layers (they're all roots in comp space).
    // The engine supports only one root, so we inject a synthetic comp-root bone
    // at the origin and parent all otherwise-rootless layers to it.
    const COMP_ROOT = '__comp_root';
    bones.push({
      id: COMP_ROOT,
      parentId: null,
      positionX: 0, positionY: 0,
      restRotation: 0,
      anchorX: 0, anchorY: 0,
      scaleX: 1, scaleY: 1,
    });

    for (const layer of layers) {
      const ks = layer.ks || {};
      const position = this._getStaticValue(ks.p, [0, 0]);
      const anchor = this._getStaticValue(ks.a, [0, 0]);
      const rotation = this._scalarValue(this._getStaticValue(ks.r, 0));
      const scale = this._getStaticValue(ks.s, [100, 100]);

      bones.push({
        id: this._getBoneId(layer.ind),
        // If the layer has no Lottie parent, attach it to the comp root
        parentId: layer.parent != null ? this._getBoneId(layer.parent) : COMP_ROOT,
        positionX: Array.isArray(position) ? position[0] : position,
        positionY: Array.isArray(position) ? position[1] : position,
        restRotation: rotation * Math.PI / 180,
        anchorX: Array.isArray(anchor) ? anchor[0] : 0,
        anchorY: Array.isArray(anchor) ? anchor[1] : 0,
        scaleX: (Array.isArray(scale) ? scale[0] : 100) / 100,
        scaleY: (Array.isArray(scale) ? scale[1] : 100) / 100,
      });
    }
    return bones;
  }

  // ─── Shape extraction ──────────────────────────────────────────────

  _extractShapes(layers) {
    const shapes = [];
    // Lottie draws layers in reverse array order (first = on top)
    const reversed = [...layers].reverse();
    let orderIndex = 0;

    for (const layer of reversed) {
      if (layer.ty !== 4 || !layer.shapes) { orderIndex++; continue; }

      const boneId = this._getBoneId(layer.ind);
      const ks = layer.ks || {};
      const anchor = this._getStaticValue(ks.a, [0, 0]);
      const ax = Array.isArray(anchor) ? anchor[0] : 0;
      const ay = Array.isArray(anchor) ? anchor[1] : 0;

      for (let gi = 0; gi < layer.shapes.length; gi++) {
        const group = layer.shapes[gi];
        if (group.ty !== 'gr' || !group.it) continue;

        // Flatten nested groups recursively
        const leafGroups = this._flattenGroups(group);
        for (let si = 0; si < leafGroups.length; si++) {
          const converted = this._convertShapeGroup(leafGroups[si], ax, ay);
          if (!converted) continue;

          const shape = new Shape(`${boneId}_g${gi}_${si}`, 'path', converted.path, {
            boneId,
            offset: { x: 0, y: 0 },
            pivot: { x: 0, y: 0 },
            rotation: 0,
          });
          shape.drawOrder = orderIndex;
          shape.fill = converted.fill;
          shape.stroke = converted.stroke;
          shape.strokeWidth = converted.strokeWidth;
          shape.noFill = !converted.fill;

          shapes.push(shape);
        }
      }
      orderIndex++;
    }
    return shapes;
  }

  // Recursively collect leaf groups (those containing a drawable: sh, el, or rc)
  _flattenGroups(group) {
    if (!group.it) return [];
    const hasDrawable = group.it.some(i => i.ty === 'sh' || i.ty === 'el' || i.ty === 'rc');
    if (hasDrawable) return [group];

    const results = [];
    for (const item of group.it) {
      if (item.ty === 'gr') {
        results.push(...this._flattenGroups(item));
      }
    }
    return results;
  }

  _convertShapeGroup(group, anchorX, anchorY) {
    let pathData = null;
    let fill = null;
    let stroke = '#000000';
    let strokeWidth = 2;
    let groupTransform = null;

    for (const item of group.it) {
      switch (item.ty) {
        case 'sh': {
          const ksProp = item.ks;
          // Use static path or first keyframe of animated path
          const raw = ksProp?.a === 1
            ? (ksProp.k[0]?.s?.[0] || ksProp.k[0]?.s || null)
            : ksProp?.k;
          if (raw) pathData = this._convertPath(raw, anchorX, anchorY);
          break;
        }
        case 'el': {
          // Ellipse primitive: s = [width, height], p = [cx, cy]
          const size = this._getStaticValue(item.s, [100, 100]);
          const pos = this._getStaticValue(item.p, [0, 0]);
          pathData = this._ellipseToPath(size, pos);
          break;
        }
        case 'rc': {
          // Rectangle primitive: s = [width, height], p = [cx, cy], r = corner radius
          const size = this._getStaticValue(item.s, [100, 100]);
          const pos = this._getStaticValue(item.p, [0, 0]);
          const radius = this._scalarValue(this._getStaticValue(item.r, 0));
          pathData = this._rectToPath(size, pos, radius);
          break;
        }
        case 'fl': {
          const c = this._getStaticValue(item.c, [1, 1, 1, 1]);
          fill = this._colorToCSS(c);
          break;
        }
        case 'st': {
          const c = this._getStaticValue(item.c, [0, 0, 0, 1]);
          stroke = this._colorToCSS(c);
          strokeWidth = this._scalarValue(this._getStaticValue(item.w, 2));
          break;
        }
        case 'tr': {
          groupTransform = item;
          break;
        }
      }
    }
    if (!pathData) return null;

    // Apply group-level transform to vertices
    if (groupTransform) {
      const pos = this._getStaticValue(groupTransform.p, [0, 0]);
      const rot = this._scalarValue(this._getStaticValue(groupTransform.r, 0)) * Math.PI / 180;
      const sc = this._getStaticValue(groupTransform.s, [100, 100]);
      const anc = this._getStaticValue(groupTransform.a, [0, 0]);
      if (pos[0] !== 0 || pos[1] !== 0 || rot !== 0 || sc[0] !== 100 || sc[1] !== 100) {
        this._transformPoints(pathData.points, pos, rot, sc, anc);
      }
    }

    return { path: pathData, fill, stroke, strokeWidth };
  }

  _convertPath(raw, anchorX, anchorY) {
    const verts = raw.v || [];
    const inT = raw.i || [];
    const outT = raw.o || [];

    const points = verts.map((v, i) => {
      const pt = { x: v[0], y: v[1] };
      const ip = inT[i] || [0, 0];
      const op = outT[i] || [0, 0];
      if (ip[0] !== 0 || ip[1] !== 0) pt.in = { x: ip[0], y: ip[1] };
      if (op[0] !== 0 || op[1] !== 0) pt.out = { x: op[0], y: op[1] };
      return pt;
    });

    return { points, closed: !!raw.c };
  }

  // Convert an ellipse primitive to a 4-point cubic bezier path
  _ellipseToPath(size, pos) {
    const rx = size[0] / 2;
    const ry = size[1] / 2;
    const cx = pos[0], cy = pos[1];
    // Kappa constant for circular bezier approximation
    const k = 0.5522847498;
    const kx = rx * k, ky = ry * k;
    return {
      closed: true,
      points: [
        { x: cx,      y: cy - ry, out: { x:  kx, y: 0   }, in: { x: -kx, y: 0   } },
        { x: cx + rx,  y: cy,     out: { x: 0,   y:  ky  }, in: { x: 0,   y: -ky } },
        { x: cx,      y: cy + ry, out: { x: -kx, y: 0   }, in: { x:  kx, y: 0   } },
        { x: cx - rx,  y: cy,     out: { x: 0,   y: -ky }, in: { x: 0,   y:  ky } },
      ],
    };
  }

  // Convert a rectangle primitive to a path (with optional corner radius)
  _rectToPath(size, pos, radius) {
    const hw = size[0] / 2;
    const hh = size[1] / 2;
    const cx = pos[0], cy = pos[1];
    const r = Math.min(radius, hw, hh);

    if (r <= 0) {
      return {
        closed: true,
        points: [
          { x: cx - hw, y: cy - hh },
          { x: cx + hw, y: cy - hh },
          { x: cx + hw, y: cy + hh },
          { x: cx - hw, y: cy + hh },
        ],
      };
    }

    // Rounded rectangle: 4 corners × 2 points each (arc approximation)
    const k = 0.5522847498 * r;
    return {
      closed: true,
      points: [
        { x: cx - hw + r, y: cy - hh,     out: { x: 0, y: 0 }, in: { x: -k, y: 0 } },
        { x: cx + hw - r, y: cy - hh,     out: { x:  k, y: 0 }, in: { x: 0, y: 0 } },
        { x: cx + hw,     y: cy - hh + r, out: { x: 0, y: 0 }, in: { x: 0, y: -k } },
        { x: cx + hw,     y: cy + hh - r, out: { x: 0, y:  k }, in: { x: 0, y: 0 } },
        { x: cx + hw - r, y: cy + hh,     out: { x: 0, y: 0 }, in: { x:  k, y: 0 } },
        { x: cx - hw + r, y: cy + hh,     out: { x: -k, y: 0 }, in: { x: 0, y: 0 } },
        { x: cx - hw,     y: cy + hh - r, out: { x: 0, y: 0 }, in: { x: 0, y:  k } },
        { x: cx - hw,     y: cy - hh + r, out: { x: 0, y: -k }, in: { x: 0, y: 0 } },
      ],
    };
  }

  _transformPoints(points, position, rotation, scale, anchor) {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const sx = scale[0] / 100;
    const sy = scale[1] / 100;

    for (const pt of points) {
      let x = (pt.x - anchor[0]) * sx;
      let y = (pt.y - anchor[1]) * sy;
      pt.x = x * cos - y * sin + position[0];
      pt.y = x * sin + y * cos + position[1];

      if (pt.in) {
        const ix = pt.in.x * sx, iy = pt.in.y * sy;
        pt.in.x = ix * cos - iy * sin;
        pt.in.y = ix * sin + iy * cos;
      }
      if (pt.out) {
        const ox = pt.out.x * sx, oy = pt.out.y * sy;
        pt.out.x = ox * cos - oy * sin;
        pt.out.y = ox * sin + oy * cos;
      }
    }
  }

  // ─── Color conversion ──────────────────────────────────────────────

  _colorToCSS(c) {
    if (!c || !Array.isArray(c)) return '#000000';
    const r = Math.round((c[0] || 0) * 255);
    const g = Math.round((c[1] || 0) * 255);
    const b = Math.round((c[2] || 0) * 255);
    const a = c[3] ?? 1;
    if (a < 1) return `rgba(${r},${g},${b},${a.toFixed(2)})`;
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  // ─── Animation extraction ──────────────────────────────────────────

  _extractClip(layers) {
    const clip = new AnimationClip('lottie', this._meta.duration, true);
    const fps = this._meta.fps;
    const inFrame = this._meta.inFrame;

    for (const layer of layers) {
      const boneId = this._getBoneId(layer.ind);
      const ks = layer.ks || {};

      if (ks.r?.a === 1) this._addRotationKFs(clip, boneId, ks.r.k, fps, inFrame);
      if (ks.p?.a === 1) this._addPositionKFs(clip, boneId, ks.p.k, fps, inFrame);
      if (ks.s?.a === 1) this._addScaleKFs(clip, boneId, ks.s.k, fps, inFrame);
    }
    return clip;
  }

  _addRotationKFs(clip, boneId, keyframes, fps, inFrame) {
    for (const kf of keyframes) {
      const time = (kf.t - inFrame) / fps;
      const value = Array.isArray(kf.s) ? kf.s[0] : kf.s;
      if (time >= 0 && value != null) {
        clip.addPropertyKeyframe(time, boneId, 'rotation', value * Math.PI / 180);
      }
    }
  }

  _addPositionKFs(clip, boneId, keyframes, fps, inFrame) {
    for (const kf of keyframes) {
      const time = (kf.t - inFrame) / fps;
      if (time < 0 || !kf.s || !Array.isArray(kf.s)) continue;
      clip.addPropertyKeyframe(time, boneId, 'positionX', kf.s[0]);
      clip.addPropertyKeyframe(time, boneId, 'positionY', kf.s[1]);
    }
  }

  _addScaleKFs(clip, boneId, keyframes, fps, inFrame) {
    for (const kf of keyframes) {
      const time = (kf.t - inFrame) / fps;
      if (time < 0 || !kf.s || !Array.isArray(kf.s)) continue;
      clip.addPropertyKeyframe(time, boneId, 'scaleX', kf.s[0] / 100);
      clip.addPropertyKeyframe(time, boneId, 'scaleY', kf.s[1] / 100);
    }
  }
}
