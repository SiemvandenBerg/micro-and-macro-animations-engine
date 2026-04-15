// renderer3d.js — Three.js WebGL renderer for the puppet
// Replaces the 2D canvas rendering with real 3D geometry so the character
// has actual depth and looks correct from any Y-rotation angle.

import * as THREE from 'three';

export class Renderer3D {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.shadowMap.enabled = false;
    this.renderer.setClearColor(0x000000, 0); // transparent — background comes from CSS

    this.scene = new THREE.Scene();

    // rootGroup rotates around Y-axis (the "look from side" slider).
    // Its position is set to the canvas-center world point each frame so
    // rotation pivots around the character's screen center.
    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);

    // Skeleton overlay sits inside rootGroup so it rotates with shapes.
    this._skelGroup = new THREE.Group();
    this.rootGroup.add(this._skelGroup);

    // Orthographic camera — preserves the flat animation art style.
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
    this.camera.position.set(0, 0, 1000);

    // Per-shape mesh parts: Map<shapeId, [{mesh, part}]>
    this._shapeParts = new Map();

    // Skeleton line-segment buffer and joint sphere meshes
    this._skelLineSeg = null;
    this._skelJoints  = []; // [{mesh, boneId}]
    this.skeletonJointRadius = 3; // world-unit radius for joint spheres

    // Cached world-space center (updated each frame)
    this._cx = 0;
    this._cy = 0;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /** Call whenever the canvas is resized. */
  setSize(w, h) {
    this.renderer.setSize(w, h, false);
  }

  /**
   * Build (or rebuild) all Three.js meshes from the current shape list.
   * Call after loadBuiltinCharacter / loadLottie and after any shape list change.
   */
  buildMeshes(shapes, skeleton, strokeEnabled) {
    // Remove old shape meshes from rootGroup
    const toRemove = this.rootGroup.children.filter(c => c !== this._skelGroup);
    for (const c of toRemove) {
      this._disposeObject(c);
      this.rootGroup.remove(c);
    }

    // Clear skeleton overlay
    while (this._skelGroup.children.length) {
      const c = this._skelGroup.children[0];
      this._disposeObject(c);
      this._skelGroup.remove(c);
    }

    this._shapeParts.clear();
    this._skelJoints  = [];
    this._skelLineSeg = null;

    // Build shape meshes in draw-order
    const sorted = [...shapes].sort((a, b) => a.drawOrder - b.drawOrder);
    for (const shape of sorted) {
      const parts = this._createParts(shape, strokeEnabled);
      this._shapeParts.set(shape.id, parts);
      for (const { mesh } of parts) this.rootGroup.add(mesh);
    }

    // Build skeleton overlay
    this._buildSkel(skeleton);
  }

  /**
   * Per-frame update: sync mesh transforms from bone world positions, set
   * Y-rotation, then render.
   */
  update(shapes, skeleton, canvasW, canvasH, scale, userZoom, rotationY, showSkeleton, shapesEnabled = true) {
    this._syncCamera(canvasW, canvasH, scale, userZoom);
    this.rootGroup.rotation.y = rotationY * Math.PI / 180;

    for (const shape of shapes) {
      const parts = this._shapeParts.get(shape.id);
      if (!parts) continue;

      // Respect both shapesEnabled global flag and per-shape visibility
      const isVisible = shapesEnabled && shape.visible !== false;
      for (const { mesh } of parts) mesh.visible = isVisible;
      if (!isVisible) continue;

      // Sync fill AND stroke colours to materials so live panel edits take effect
      if (shape.fill) {
        for (const { mesh } of parts) {
          if (mesh.material && mesh.material.color) mesh.material.color.set(shape.fill);
          // Update BackSide outline children
          mesh.children.forEach(child => {
            if (child.isMesh && child.material && child.material.side === THREE.BackSide && shape.stroke) {
              child.material.color.set(shape.stroke);
            }
          });
        }
      }

      if (shape.type === 'ellipse' || shape.type === 'rect' || shape.type === 'path') {
        this._updateSimpleShape(shape, parts, skeleton);
      } else if (shape.type === 'bibone-quad') {
        this._updateBiboneShape(shape, parts, skeleton);
      } else if (shape.type === 'tribone-quad') {
        this._updateTriboneShape(shape, parts, skeleton);
      }
    }

    this._skelGroup.visible = showSkeleton;
    if (showSkeleton) this._updateSkel(skeleton);

    this.renderer.render(this.scene, this.camera);
  }

  // ─── Camera ──────────────────────────────────────────────────────────────

  _syncCamera(canvasW, canvasH, scale, userZoom) {
    const ts    = scale * userZoom;
    const halfW = canvasW / (2 * ts);
    const halfH = canvasH / (2 * ts);
    const cx    = canvasW / (2 * scale);
    const cy    = canvasH / (2 * scale);

    this._cx = cx;
    this._cy = cy;

    // Orthographic frustum covering the same world region the 2D canvas showed.
    // Three.js Y = −worldY, so the world top (low worldY) becomes Three.js top.
    this.camera.left   =  cx - halfW;
    this.camera.right  =  cx + halfW;
    this.camera.top    = -(cy - halfH); // = −worldY_min
    this.camera.bottom = -(cy + halfH); // = −worldY_max
    this.camera.updateProjectionMatrix();

    // Pivot the rootGroup around the canvas centre so Y-rotation looks natural.
    this.rootGroup.position.set(cx, -cy, 0);
  }

  /** Canvas 2D world coordinates → rootGroup local space (Y flipped, Z passed through). */
  _local(wx, wy, wz = 0) {
    return { x: wx - this._cx, y: -(wy - this._cy), z: wz };
  }

  // ─── Mesh creation ───────────────────────────────────────────────────────

  _createParts(shape, strokeEnabled) {
    const col   = new THREE.Color(shape.fill || '#ffffff');
    const order = shape.drawOrder || 0;
    const parts = [];

    // Painter's algorithm: depthTest:false + renderOrder ensures draw order is
    // always respected regardless of geometry overlap or rotation angle.
    const applyOrder = (mesh) => {
      mesh.renderOrder = order;
      if (mesh.material) mesh.material.depthTest = false;
    };

    // BackSide outline gives a clean cartoon stroke around any convex mesh.
    // sx/sz inflate radius; sy=1.0 on cylinders keeps segment length unchanged.
    // Outline renders just behind the fill (renderOrder - 0.5).
    const addOutline = (mesh, sx = 1.12, sy = 1.12, sz = 1.12) => {
      if (!strokeEnabled || !shape.stroke) return;
      const outMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(shape.stroke),
        side: THREE.BackSide,
        depthTest: false
      });
      const outMesh = new THREE.Mesh(mesh.geometry, outMat);
      outMesh.scale.set(sx, sy, sz);
      outMesh.renderOrder = order - 0.5;
      mesh.add(outMesh);
    };

    switch (shape.type) {
      case 'ellipse': {
        const rx = shape.props.rx || 20;
        const ry = shape.props.ry || 20;
        const rz = (rx + ry) / 2 * 1.0; // true sphere — looks circular from every angle
        const geom = new THREE.SphereGeometry(1, 20, 14);
        const mat  = new THREE.MeshBasicMaterial({ color: col });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.scale.set(rx, ry, rz);
        applyOrder(mesh);
        addOutline(mesh);
        parts.push({ mesh, part: 'main' });
        break;
      }

      case 'rect': {
        const w = shape.props.width  || 40;
        const h = shape.props.height || 40;
        const d = Math.max(Math.min(w, h) * 0.55, 5); // depth ~ 55% of smaller side
        const geom = new THREE.BoxGeometry(w, h, d);
        const mat  = new THREE.MeshBasicMaterial({ color: col });
        const mesh = new THREE.Mesh(geom, mat);
        applyOrder(mesh);

        if (strokeEnabled && shape.stroke) {
          const sCol = new THREE.Color(shape.stroke);
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(geom, 30),
            new THREE.LineBasicMaterial({ color: sCol, depthTest: false })
          );
          edges.renderOrder = order + 0.1;
          mesh.add(edges);
        }
        parts.push({ mesh, part: 'main' });
        break;
      }

      case 'bibone-quad': {
        const r      = Math.max((shape.props.height || 20) / 2, 2);
        const depthF = 0.65;
        const mk = () => new THREE.MeshBasicMaterial({ color: col, depthTest: false });
        const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 14), mk());
        const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 14), mk());
        const cap0 = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mk()); // start
        const jnt  = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mk()); // junction
        const cap1 = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mk()); // end
        for (const m of [seg1, seg2]) m.userData.depthF = depthF;
        for (const m of [cap0, jnt, cap1]) m.scale.z = depthF;
        for (const m of [seg1, seg2, cap0, jnt, cap1]) m.renderOrder = order;
        for (const m of [seg1, seg2]) addOutline(m, 1.12, 1.0, 1.12);
        for (const m of [cap0, jnt, cap1]) addOutline(m);
        parts.push(
          { mesh: seg1, part: 'seg1'  },
          { mesh: seg2, part: 'seg2'  },
          { mesh: cap0, part: 'cap0'  },
          { mesh: jnt,  part: 'joint' },
          { mesh: cap1, part: 'cap1'  },
        );
        break;
      }

      case 'tribone-quad': {
        const r      = Math.max((shape.props.height || 20) / 2, 2);
        const depthF = 0.65;
        const mk = () => new THREE.MeshBasicMaterial({ color: col, depthTest: false });
        const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 14), mk());
        const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 14), mk());
        const seg3 = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 14), mk());
        const cap0 = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mk()); // b1 start
        const jnt1 = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mk()); // b1→b2 joint
        const jnt2 = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mk()); // b2→b3 joint
        const cap1 = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mk()); // b3 end
        for (const m of [seg1, seg2, seg3]) m.userData.depthF = depthF;
        for (const m of [cap0, jnt1, jnt2, cap1]) m.scale.z = depthF;
        for (const m of [seg1, seg2, seg3, cap0, jnt1, jnt2, cap1]) m.renderOrder = order;
        for (const m of [seg1, seg2, seg3]) addOutline(m, 1.12, 1.0, 1.12);
        for (const m of [cap0, jnt1, jnt2, cap1]) addOutline(m);
        parts.push(
          { mesh: seg1, part: 'seg1'  },
          { mesh: seg2, part: 'seg2'  },
          { mesh: seg3, part: 'seg3'  },
          { mesh: cap0, part: 'cap0'  },
          { mesh: jnt1, part: 'jnt1'  },
          { mesh: jnt2, part: 'jnt2'  },
          { mesh: cap1, part: 'cap1'  },
        );
        break;
      }

      case 'path': {
        const mesh = this._buildPathMesh(shape.props, col, order);
        if (mesh) parts.push({ mesh, part: 'main' });
        break;
      }
    }

    return parts;
  }

  /** Build an extruded Three.js mesh from a 2D bezier path (Lottie shapes). */
  _buildPathMesh(props, col, renderOrder = 0) {
    if (!props.points || props.points.length < 2) return null;
    try {
      const threeShape = new THREE.Shape();
      const pts = props.points;

      // Canvas Y is down; Three.js Y is up — flip Y throughout.
      threeShape.moveTo(pts[0].x, -pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const curr = pts[i];
        if (prev.out || curr.in) {
          threeShape.bezierCurveTo(
            prev.x + (prev.out?.x || 0), -(prev.y + (prev.out?.y || 0)),
            curr.x + (curr.in?.x  || 0), -(curr.y + (curr.in?.y  || 0)),
            curr.x, -curr.y
          );
        } else {
          threeShape.lineTo(curr.x, -curr.y);
        }
      }
      if (props.closed) {
        const last  = pts[pts.length - 1];
        const first = pts[0];
        if (last.out || first.in) {
          threeShape.bezierCurveTo(
            last.x  + (last.out?.x  || 0), -(last.y  + (last.out?.y  || 0)),
            first.x + (first.in?.x  || 0), -(first.y + (first.in?.y  || 0)),
            first.x, -first.y
          );
        }
        threeShape.closePath();
      }

      // Estimate extrusion depth from bounding box.
      const pts2 = threeShape.getPoints(12);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of pts2) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
      const depth = Math.max(Math.min(maxX - minX, maxY - minY) * 0.4, 3);

      const geom = new THREE.ExtrudeGeometry(threeShape, { depth, bevelEnabled: false });
      geom.translate(0, 0, -depth / 2); // centre along Z so it rotates symmetrically

      const mesh = new THREE.Mesh(
        geom,
        new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, depthTest: false })
      );
      mesh.renderOrder = renderOrder;
      return mesh;
    } catch {
      return null;
    }
  }

  // ─── Per-frame mesh transform updates ────────────────────────────────────

  /** Ellipse / rect / path: single mesh bound to one bone. */
  _updateSimpleShape(shape, parts, skeleton) {
    const { mesh } = parts.find(p => p.part === 'main') || {};
    if (!mesh) return;
    const bone = skeleton.getBone(shape.binding.boneId);
    if (!bone) return;

    // Replicate the 2D canvas transform chain:
    //   translate(bone.worldX, bone.worldY) · rotate(worldAngle) · scale(worldScaleX/Y)
    //   · translate(-anchorX, -anchorY) · translate(offset.x, offset.y) · rotate(binding.rotation)
    const cos = Math.cos(bone.worldAngle);
    const sin = Math.sin(bone.worldAngle);
    const sx  = bone.worldScaleX || 1;
    const sy  = bone.worldScaleY || 1;
    const ox  = (shape.binding.offset.x - (bone.anchorX || 0)) * sx;
    const oy  = (shape.binding.offset.y - (bone.anchorY || 0)) * sy;
    const wx  = bone.worldX + cos * ox - sin * oy;
    const wy  = bone.worldY + sin * ox + cos * oy;
    const angle = bone.worldAngle + (shape.binding.rotation || 0);

    const lp = this._local(wx, wy, bone.worldZ || 0);
    mesh.position.set(lp.x, lp.y, lp.z);
    mesh.rotation.z = -angle; // negate: Y-flip reverses rotation direction
  }

  /** Bibone-quad: spans bone1 origin → bone2 end, with a bend at the junction. */
  _updateBiboneShape(shape, parts, skeleton) {
    const b1 = skeleton.getBone(shape.binding.boneId);
    const b2 = skeleton.getBone(shape.binding.boneId2);
    if (!b1 || !b2) return;

    const p1 = this._local(b1.worldX, b1.worldY, b1.worldZ || 0);
    const p2 = this._local(b2.worldX, b2.worldY, b2.worldZ || 0);
    const ex  = b2.worldX + Math.cos(b2.worldAngle) * (shape.props.length2 || 0);
    const ey  = b2.worldY + Math.sin(b2.worldAngle) * (shape.props.length2 || 0);
    const p3  = this._local(ex, ey, b2.worldZ || 0);

    const get = (part) => parts.find(p => p.part === part)?.mesh;
    this._fitCylinder(get('seg1'), p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    this._fitCylinder(get('seg2'), p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
    this._placeAt(get('cap0'),  p1.x, p1.y, p1.z);
    this._placeAt(get('joint'), p2.x, p2.y, p2.z);
    this._placeAt(get('cap1'),  p3.x, p3.y, p3.z);
  }

  /** Tribone-quad: spans bone1 → bone2 → bone3 end, with bends at each junction. */
  _updateTriboneShape(shape, parts, skeleton) {
    const b1 = skeleton.getBone(shape.binding.boneId);
    const b2 = skeleton.getBone(shape.binding.boneId2);
    const b3 = skeleton.getBone(shape.binding.boneId3);
    if (!b1 || !b2 || !b3) return;

    const p1 = this._local(b1.worldX, b1.worldY, b1.worldZ || 0);
    const p2 = this._local(b2.worldX, b2.worldY, b2.worldZ || 0);
    const p3 = this._local(b3.worldX, b3.worldY, b3.worldZ || 0);
    const ex  = b3.worldX + Math.cos(b3.worldAngle) * (shape.props.length3 || 0);
    const ey  = b3.worldY + Math.sin(b3.worldAngle) * (shape.props.length3 || 0);
    const p4  = this._local(ex, ey, b3.worldZ || 0);

    const get = (part) => parts.find(p => p.part === part)?.mesh;
    this._fitCylinder(get('seg1'), p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    this._fitCylinder(get('seg2'), p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
    this._fitCylinder(get('seg3'), p3.x, p3.y, p3.z, p4.x, p4.y, p4.z);
    this._placeAt(get('cap0'), p1.x, p1.y, p1.z);
    this._placeAt(get('jnt1'), p2.x, p2.y, p2.z);
    this._placeAt(get('jnt2'), p3.x, p3.y, p3.z);
    this._placeAt(get('cap1'), p4.x, p4.y, p4.z);
  }

  // ─── Skeleton overlay ─────────────────────────────────────────────────────

  _buildSkel(skeleton) {
    // Line buffer: up to (boneCount) segments × 2 endpoints × 3 floats
    const cap     = skeleton.bones.size * 2 * 3;
    const posArr  = new Float32Array(cap);
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    lineGeom.setDrawRange(0, 0);

    this._skelLineSeg = new THREE.LineSegments(
      lineGeom,
      new THREE.LineDashedMaterial({ color: '#ff3366', dashSize: 4, gapSize: 4, depthTest: false })
    );
    this._skelLineSeg.renderOrder = 999; // always drawn on top
    this._skelGroup.add(this._skelLineSeg);

    // One sphere per non-synthetic bone
    this._skelJoints = [];
    for (const bone of skeleton.bones.values()) {
      if (bone.synthetic) continue;
      const mat  = new THREE.MeshBasicMaterial({ color: '#ff3366', depthTest: false });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(this.skeletonJointRadius, 8, 6), mat);
      mesh.renderOrder = 1000; // drawn after lines, always on top
      mesh._boneId = bone.id;
      this._skelJoints.push(mesh);
      this._skelGroup.add(mesh);
    }
  }

  _updateSkel(skeleton) {
    if (!this._skelLineSeg) return;

    const posAttr = this._skelLineSeg.geometry.getAttribute('position');
    const arr     = posAttr.array;
    let   count   = 0;

    for (const bone of skeleton.bones.values()) {
      if (bone.synthetic) continue;
      for (const child of bone.children) {
        if (child.synthetic) continue;
        const i  = count * 6;
        const p1 = this._local(bone.worldX,  bone.worldY,  bone.worldZ  || 0);
        const p2 = this._local(child.worldX, child.worldY, child.worldZ || 0);
        arr[i]   = p1.x; arr[i+1] = p1.y; arr[i+2] = p1.z;
        arr[i+3] = p2.x; arr[i+4] = p2.y; arr[i+5] = p2.z;
        count++;
      }
    }

    this._skelLineSeg.geometry.setDrawRange(0, count * 2);
    posAttr.needsUpdate = true;
    this._skelLineSeg.computeLineDistances(); // required for dashed lines

    const hl = skeleton.highlightBoneId;
    for (const jMesh of this._skelJoints) {
      const bone = skeleton.getBone(jMesh._boneId);
      if (!bone) { jMesh.visible = false; continue; }
      const lp  = this._local(bone.worldX, bone.worldY, bone.worldZ || 0);
      jMesh.position.set(lp.x, lp.y, lp.z);
      const isHl = jMesh._boneId === hl;
      jMesh.scale.setScalar(isHl ? 1.7 : 1);
      jMesh.material.color.set(isHl ? '#ffffff' : '#ff3366');
      jMesh.visible = true;
    }
  }

  // ─── Cylinder helpers ────────────────────────────────────────────────────

  /**
   * Position and orient a CylinderGeometry (height = 1) mesh so it spans
   * from (ax, ay, az) to (bx, by, bz) in 3D space.
   */
  _fitCylinder(mesh, ax, ay, az, bx, by, bz) {
    if (!mesh) return;
    const dx  = bx - ax;
    const dy  = by - ay;
    const dz  = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.5) { mesh.visible = false; return; }
    mesh.visible = true;
    const dF   = mesh.userData.depthF ?? 1;
    mesh.scale.set(1, len, dF);
    mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    // rotation.z maps Y axis onto the XY direction; rotation.x handles Z tilt
    const lenXY = Math.hypot(dx, dy);
    mesh.rotation.order = 'ZXY';
    mesh.rotation.z = Math.atan2(-dx, dy);
    mesh.rotation.x = lenXY > 0.001 ? -Math.atan2(dz, lenXY) : 0;
  }

  /** Place a mesh (sphere / cap) at local coords. */
  _placeAt(mesh, lx, ly, lz = 0) {
    if (!mesh) return;
    mesh.position.set(lx, ly, lz);
  }

  // ─── Disposal ─────────────────────────────────────────────────────────────

  _disposeObject(obj) {
    obj.traverse(node => {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
        else node.material.dispose();
      }
    });
  }
}
