// controls.js — Dev panel wiring: toggles, sliders, bone controls

export class DevControls {
  constructor(engine) {
    this.engine = engine;
    this.panel = null;
    this._boneSliders = new Map();
  }

  init() {
    this.panel = document.getElementById('dev-panel');
    if (!this.panel) return;

    // Clear previous controls (keep the panel-header)
    while (this.panel.children.length > 1) {
      this.panel.removeChild(this.panel.lastChild);
    }
    this._boneSliders = new Map();

    this._buildSliders();
    this._buildControls();
    this._buildLottieLoader();
    this._buildToggles();
    this._buildBoneControls();
    this._buildShapeColors();
    this._buildExport();
  }

  _buildLottieLoader() {
    const section = this._section('Lottie Import');

    // Preset buttons
    const presets = [
      { label: 'Walking Diego', path: null },
      { label: 'Walking Man', path: 'animations/walking/Walking man.json' },
      { label: 'Walking Office Man', path: 'animations/walking/walking office man.json' },
      { label: 'Catalyst Man', path: null, comingSoon: true },
    ];

    const presetRow = document.createElement('div');
    presetRow.className = 'control-row';
    presetRow.style.display = 'flex';
    presetRow.style.gap = '4px';
    presetRow.style.flexWrap = 'wrap';

    for (const preset of presets) {
      const btn = document.createElement('button');
      btn.textContent = preset.label;
      btn.addEventListener('click', () => {
        if (preset.comingSoon) { this.engine.loadCatalystMan(); return; }
        if (!preset.path) {
          this.engine.loadBuiltinCharacter();
          return;
        }
        btn.disabled = true;
        btn.textContent = 'Loading…';
        fetch(preset.path)
          .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then(data => this.engine.loadLottie(data))
          .catch(err => console.error('Failed to load preset:', err))
          .finally(() => { btn.disabled = false; btn.textContent = preset.label; });
      });
      presetRow.appendChild(btn);
    }
    section.appendChild(presetRow);

    // File picker
    const row = document.createElement('div');
    row.className = 'control-row';

    const label = document.createElement('label');
    label.textContent = 'Load .json file';
    label.style.cursor = 'pointer';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          // Detect format: our exported animation JSON has a 'tracks' key;
          // Lottie files have 'v' and 'layers'.
          if (data.tracks && !data.layers) {
            this.engine.loadAnimationJSON(data);
          } else {
            this.engine.loadLottie(data);
          }
        } catch (err) {
          console.error('Failed to load JSON file:', err);
        }
      };
      reader.readAsText(file);
    });

    label.appendChild(input);
    row.appendChild(label);
    section.appendChild(row);

    // Animation-only loader
    const animSection = document.createElement('div');
    animSection.style.marginTop = '8px';

    const animLabel = document.createElement('span');
    animLabel.className = 'slider-label';
    animLabel.textContent = 'Apply animation from:';
    animLabel.style.display = 'block';
    animLabel.style.marginBottom = '4px';
    animSection.appendChild(animLabel);

    const animRow = document.createElement('div');
    animRow.className = 'control-row';
    animRow.style.display = 'flex';
    animRow.style.gap = '4px';
    animRow.style.flexWrap = 'wrap';

    for (const preset of presets) {
      if (!preset.path) continue; // skip built-in (no Lottie to load clip from)
      const btn = document.createElement('button');
      btn.textContent = '♫ ' + preset.label;
      btn.title = 'Load animation only from ' + preset.label;
      btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = 'Loading…';
        fetch(preset.path)
          .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then(data => this.engine.loadLottieAnimationOnly(data))
          .catch(err => console.error('Failed to load animation:', err))
          .finally(() => { btn.disabled = false; btn.textContent = '♫ ' + preset.label; });
      });
      animRow.appendChild(btn);
    }
    animSection.appendChild(animRow);

    section.appendChild(animSection);
  }

  _buildToggles() {
    const section = this._section('Systems');

    this._toggle(section, 'Skeleton visible', true, (v) => {
      this.engine.showSkeleton = v;
    });
    this._toggle(section, 'Shape attachment', true, (v) => {
      this.engine.shapeRenderer.enabled = v;
    });
    this._toggle(section, 'Shape stroke', true, (v) => {
      this.engine.shapeRenderer.strokeEnabled = v;
      // Stroke is baked into 3D geometry — rebuild meshes to reflect the change
      this.engine.renderer3d.buildMeshes(
        this.engine.shapeRenderer.shapes,
        this.engine.skeleton,
        v
      );
    });
    this._toggle(section, 'Path deformation', true, (v) => {
      this.engine.deformer.enabled = v;
    });
    this._toggle(section, 'Skeletal animation', true, (v) => {
      this.engine.player.enabled = v;
      if (!v) this.engine.skeleton.resetPose();
    });
  }

  _buildSliders() {
    const section = this._section('Playback');

    // Y Rotation: slider + number input kept in sync
    (() => {
      const row = document.createElement('div');
      row.className = 'control-row';

      const lbl = document.createElement('span');
      lbl.className = 'slider-label';
      lbl.textContent = 'Y Rotation';

      const slider = document.createElement('input');
      slider.type  = 'range';
      slider.min   = 0;
      slider.max   = 360;
      slider.step  = 1;
      slider.value = 0;
      slider.setAttribute('data-control', 'Y Rotation');

      const numInput = document.createElement('input');
      numInput.type  = 'number';
      numInput.min   = 0;
      numInput.max   = 360;
      numInput.step  = 1;
      numInput.value = 0;
      numInput.className = 'slider-value rotation-number';

      const apply = (v) => {
        const clamped = Math.min(360, Math.max(0, v));
        slider.value   = clamped;
        numInput.value = clamped;
        this.engine.rotationY = clamped;
      };

      slider.addEventListener('input', () => apply(parseFloat(slider.value)));
      numInput.addEventListener('input', () => {
        const v = parseFloat(numInput.value);
        if (!isNaN(v)) apply(v);
      });
      numInput.addEventListener('change', () => {
        const v = parseFloat(numInput.value);
        apply(isNaN(v) ? 0 : v);
      });

      row.appendChild(lbl);
      row.appendChild(slider);
      row.appendChild(numInput);
      section.appendChild(row);
    })();

    this._slider(section, 'Speed', 0, 2, 0.05, 1, (v) => {
      this.engine.player.speed = v;
    });

    const clip = this.engine.player.clip;
    const duration = clip ? clip.duration : 3;
    this._slider(section, 'Time', 0, duration, 0.01, 0, (v) => {
      this.engine.player.playing = false;
      this.engine.player.seekTo(v);
    });
  }

  _buildControls() {
    const section = this._section('Controls');

    // Play/pause button
    const playRow = document.createElement('div');
    playRow.className = 'control-row';
    const playBtn = document.createElement('button');
    playBtn.textContent = '▶ Play';
    playBtn.addEventListener('click', () => {
      this.engine.player.playing = !this.engine.player.playing;
      playBtn.textContent = this.engine.player.playing ? '⏸ Pause' : '▶ Play';
    });
    playRow.appendChild(playBtn);
    section.appendChild(playRow);

    // Clear animation button
    const clearRow = document.createElement('div');
    clearRow.className = 'control-row';
    const clearBtn = document.createElement('button');
    clearBtn.textContent = '✕ Clear animation';
    clearBtn.title = 'Remove all keyframes from the current clip';
    clearBtn.addEventListener('click', () => {
      if (!this.engine.player.clip) return;
      this.engine.pushUndo();
      this.engine.player.clip.clearKeyframes();
      this.engine.player.playing = false;
      this.engine.timeline.build();
    });
    clearRow.appendChild(clearBtn);
    section.appendChild(clearRow);

    // Undo button
    const undoRow = document.createElement('div');
    undoRow.className = 'control-row';
    const undoBtn = document.createElement('button');
    undoBtn.textContent = '↩ Undo';
    undoBtn.title = 'Undo last action (Ctrl+Z)';
    undoBtn.addEventListener('click', () => this.engine.undo());
    undoRow.appendChild(undoBtn);
    section.appendChild(undoRow);
  }

  _buildBoneControls() {
    const section = this._section('Bone Angles', true);

    for (const bone of this.engine.skeleton.bones.values()) {
      // Container for this bone's controls
      const group = document.createElement('div');
      group.className = 'bone-control-group';

      // Row 1: checkbox + label + slider
      const sliderRow = document.createElement('div');
      sliderRow.className = 'control-row';

      // Checkbox to toggle shapes bound to this bone
      const shapes = this.engine.shapeRenderer.shapes.filter(s => s.binding.boneId === bone.id);
      if (shapes.length) {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.style.marginRight = '2px';
        cb.addEventListener('change', () => shapes.forEach(s => s.visible = cb.checked));
        sliderRow.appendChild(cb);
      }

      const lbl = document.createElement('span');
      lbl.className = 'slider-label';
      lbl.textContent = bone.id;

      const deg = Math.round(bone.restRotation * 180 / Math.PI);
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = deg - 45;
      slider.max = deg + 45;
      slider.step = 0.5;
      slider.value = deg;
      slider.setAttribute('data-bone', bone.id);

      const sliderVal = document.createElement('span');
      sliderVal.className = 'slider-value';
      sliderVal.textContent = deg;

      slider.addEventListener('mousedown', () => this.engine.pushUndo());
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        sliderVal.textContent = v;
        this.engine.player.playing = false;
        bone.rotation = v * Math.PI / 180;
      });

      sliderRow.appendChild(lbl);
      sliderRow.appendChild(slider);
      sliderRow.appendChild(sliderVal);
      group.appendChild(sliderRow);

      // Row 2: delta indicator bar
      const barRow = document.createElement('div');
      barRow.className = 'control-row bone-indicator-row';

      const bar = document.createElement('div');
      bar.className = 'bone-bar';

      const center = document.createElement('div');
      center.className = 'bone-bar-center';

      const fill = document.createElement('div');
      fill.className = 'bone-bar-fill';

      bar.appendChild(center);
      bar.appendChild(fill);

      const val = document.createElement('span');
      val.className = 'slider-value';
      val.textContent = '0°';

      barRow.appendChild(bar);
      barRow.appendChild(val);
      group.appendChild(barRow);

      section.appendChild(group);

      // Store references for per-frame updates
      this._boneSliders.set(bone.id, { fill, val, slider, sliderVal, bone });
    }
  }

  _buildShapeColors() {
    const section = this._section('Shape Colors');

    for (const shape of this.engine.shapeRenderer.shapes) {
      this._colorPicker(section, shape.id, shape.fill || '#ffffff', (v) => {
        shape.fill = v;
      });
    }
  }

  _buildExport() {
    const section = this._section('Export');

    const row = document.createElement('div');
    row.className = 'control-row';
    const btn = document.createElement('button');
    btn.textContent = 'Export shapes as SVGs';
    btn.addEventListener('click', () => this._exportShapeSVGs());
    row.appendChild(btn);
    section.appendChild(row);

    const animRow = document.createElement('div');
    animRow.className = 'control-row';
    const animBtn = document.createElement('button');
    animBtn.textContent = 'Export animation as JSON';
    animBtn.addEventListener('click', () => this._exportAnimationJSON());
    animRow.appendChild(animBtn);
    section.appendChild(animRow);
  }

  _exportAnimationJSON() {
    const clip = this.engine.player.clip;
    if (!clip) return;

    // Serialise the clip into a plain object
    const tracks = {};
    for (const [key, kfs] of clip.propertyTracks) {
      tracks[key] = kfs.map(kf => ({ time: kf.time, value: kf.value }));
    }
    const data = {
      name: clip.name,
      duration: clip.duration,
      loop: clip.loop,
      tracks,
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${clip.name || 'animation'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async _exportShapeSVGs() {
    const shapes = this.engine.shapeRenderer.shapes;
    if (!shapes.length) return;

    // Try File System Access API to write directly to a folder
    if (window.showDirectoryPicker) {
      try {
        const dirHandle = await window.showDirectoryPicker({ startIn: 'documents', mode: 'readwrite' });
        for (const shape of shapes) {
          if (!shape.visible) continue;
          const svg = this._shapeToSVG(shape);
          if (!svg) continue;
          const fileHandle = await dirHandle.getFileHandle(`${shape.id}.svg`, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(svg);
          await writable.close();
        }
        console.log(`Exported ${shapes.filter(s => s.visible).length} SVGs to selected folder`);
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // user cancelled
        console.warn('Directory picker failed, falling back to downloads:', err);
      }
    }

    // Fallback: download individual files
    for (const shape of shapes) {
      if (!shape.visible) continue;
      const svg = this._shapeToSVG(shape);
      if (!svg) continue;

      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${shape.id}.svg`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  _shapeToSVG(shape) {
    const p = shape.props;
    const fill = shape.noFill ? 'none' : (shape.fill || '#ffffff');
    const stroke = shape.stroke || '#000000';
    const sw = shape.strokeWidth ?? 1;
    const styleAttr = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"`;

    let pathD = '';
    let viewBox;

    switch (shape.type) {
      case 'ellipse': {
        const rx = p.rx, ry = p.ry;
        const pad = sw;
        viewBox = `${-rx - pad} ${-ry - pad} ${(rx + pad) * 2} ${(ry + pad) * 2}`;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">\n  <ellipse cx="0" cy="0" rx="${rx}" ry="${ry}" ${styleAttr}/>\n</svg>`;
      }
      case 'rect': {
        const hw = p.width / 2, hh = p.height / 2;
        const r = p.radius || 0;
        const pad = sw;
        viewBox = `${-hw - pad} ${-hh - pad} ${(hw + pad) * 2} ${(hh + pad) * 2}`;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">\n  <rect x="${-hw}" y="${-hh}" width="${p.width}" height="${p.height}" rx="${r}" ${styleAttr}/>\n</svg>`;
      }
      case 'path': {
        if (!p.points || p.points.length < 2) return null;
        const pts = p.points;

        // Build SVG path data
        pathD = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
          const prev = pts[i - 1];
          const curr = pts[i];
          if (prev.out || curr.in) {
            const cp1x = prev.x + (prev.out?.x || 0);
            const cp1y = prev.y + (prev.out?.y || 0);
            const cp2x = curr.x + (curr.in?.x || 0);
            const cp2y = curr.y + (curr.in?.y || 0);
            pathD += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${curr.x} ${curr.y}`;
          } else {
            pathD += ` L ${curr.x} ${curr.y}`;
          }
        }
        if (p.closed) {
          const last = pts[pts.length - 1];
          const first = pts[0];
          if (last.out || first.in) {
            const cp1x = last.x + (last.out?.x || 0);
            const cp1y = last.y + (last.out?.y || 0);
            const cp2x = first.x + (first.in?.x || 0);
            const cp2y = first.y + (first.in?.y || 0);
            pathD += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${first.x} ${first.y}`;
          }
          pathD += ' Z';
        }

        // Compute bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pt of pts) {
          minX = Math.min(minX, pt.x);
          minY = Math.min(minY, pt.y);
          maxX = Math.max(maxX, pt.x);
          maxY = Math.max(maxY, pt.y);
        }
        const pad = sw * 2;
        viewBox = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;

        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">\n  <path d="${pathD}" ${styleAttr}/>\n</svg>`;
      }
      default:
        return null;
    }
  }

  // Update time slider to reflect current playback position
  updateTimeSlider() {
    const slider = this.panel?.querySelector('[data-control="Time"]');
    if (slider && this.engine.player.playing) {
      slider.value = this.engine.player.time;
      const label = slider.parentElement.querySelector('.slider-value');
      if (label) label.textContent = this.engine.player.time.toFixed(2) + 's';
    }
  }

  // Update bone indicator bars and sliders to reflect current rotation
  updateBoneIndicators() {
    const maxDeg = 45; // full-scale range in degrees
    for (const [, entry] of this._boneSliders) {
      const delta = (entry.bone.rotation - entry.bone.restRotation) * 180 / Math.PI;
      const clamped = Math.max(-maxDeg, Math.min(maxDeg, delta));
      const pct = (clamped / maxDeg) * 50; // -50% to +50%

      entry.fill.style.left = pct >= 0 ? '50%' : `${50 + pct}%`;
      entry.fill.style.width = `${Math.abs(pct)}%`;
      entry.val.textContent = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}°`;

      // Sync slider thumb to current rotation during playback
      if (this.engine.player.playing && entry.slider) {
        const currentDeg = entry.bone.rotation * 180 / Math.PI;
        entry.slider.value = currentDeg;
        entry.sliderVal.textContent = Math.round(currentDeg);
      }
    }
  }

  // --- DOM helpers ---

  _section(title, collapsed = false) {
    const sec = document.createElement('div');
    sec.className = 'control-section';

    const h = document.createElement('h3');
    const chevron = document.createElement('span');
    chevron.className = 'section-chevron';
    chevron.textContent = collapsed ? '▶' : '▼';
    h.appendChild(chevron);
    h.appendChild(document.createTextNode(' ' + title));
    h.style.cursor = 'pointer';
    sec.appendChild(h);

    const body = document.createElement('div');
    body.className = 'section-body';
    if (collapsed) body.classList.add('collapsed');
    sec.appendChild(body);

    h.addEventListener('click', () => {
      const isCollapsed = body.classList.toggle('collapsed');
      chevron.textContent = isCollapsed ? '▶' : '▼';
    });

    this.panel.appendChild(sec);
    return body;
  }

  _toggle(parent, label, initial, onChange) {
    const row = document.createElement('div');
    row.className = 'control-row';

    const lbl = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = initial;
    cb.addEventListener('change', () => onChange(cb.checked));

    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + label));
    row.appendChild(lbl);
    parent.appendChild(row);
  }

  _slider(parent, label, min, max, step, initial, onChange, boneId) {
    const row = document.createElement('div');
    row.className = 'control-row';

    const lbl = document.createElement('span');
    lbl.className = 'slider-label';
    lbl.textContent = label;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = initial;
    input.setAttribute('data-control', label);
    if (boneId) input.setAttribute('data-bone', boneId);

    const val = document.createElement('span');
    val.className = 'slider-value';
    val.textContent = initial;

    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      val.textContent = label === 'Time' ? v.toFixed(2) + 's' : v;
      onChange(v);
    });

    row.appendChild(lbl);
    row.appendChild(input);
    row.appendChild(val);
    parent.appendChild(row);
  }

  _colorPicker(parent, label, initial, onChange) {
    const row = document.createElement('div');
    row.className = 'control-row color-row';

    const lbl = document.createElement('span');
    lbl.className = 'slider-label';
    lbl.textContent = label;

    // Swatch that toggles the popup
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.background = initial;

    const hex = document.createElement('span');
    hex.className = 'color-hex';
    hex.textContent = initial;

    // Popup
    const popup = document.createElement('div');
    popup.className = 'color-popup';
    popup.style.display = 'none';

    // SV area (saturation-x, value-y)
    const svCanvas = document.createElement('canvas');
    svCanvas.className = 'color-sv';
    svCanvas.width = 128;
    svCanvas.height = 96;
    const svCtx = svCanvas.getContext('2d');

    // Hue strip
    const hueCanvas = document.createElement('canvas');
    hueCanvas.className = 'color-hue';
    hueCanvas.width = 128;
    hueCanvas.height = 12;
    const hueCtx = hueCanvas.getContext('2d');

    // State
    const state = { ...this._hexToHsv(initial) };

    const drawHueStrip = () => {
      const w = hueCanvas.width, h = hueCanvas.height;
      const grad = hueCtx.createLinearGradient(0, 0, w, 0);
      for (let i = 0; i <= 6; i++) {
        grad.addColorStop(i / 6, `hsl(${i * 60}, 100%, 50%)`);
      }
      hueCtx.fillStyle = grad;
      hueCtx.fillRect(0, 0, w, h);
      // indicator
      const x = (state.h / 360) * w;
      hueCtx.strokeStyle = '#fff';
      hueCtx.lineWidth = 2;
      hueCtx.strokeRect(x - 2, 0, 4, h);
    };

    const drawSV = () => {
      const w = svCanvas.width, h = svCanvas.height;
      // Base hue fill
      svCtx.fillStyle = `hsl(${state.h}, 100%, 50%)`;
      svCtx.fillRect(0, 0, w, h);
      // White gradient left→right (saturation)
      const white = svCtx.createLinearGradient(0, 0, w, 0);
      white.addColorStop(0, 'rgba(255,255,255,1)');
      white.addColorStop(1, 'rgba(255,255,255,0)');
      svCtx.fillStyle = white;
      svCtx.fillRect(0, 0, w, h);
      // Black gradient top→bottom (value)
      const black = svCtx.createLinearGradient(0, 0, 0, h);
      black.addColorStop(0, 'rgba(0,0,0,0)');
      black.addColorStop(1, 'rgba(0,0,0,1)');
      svCtx.fillStyle = black;
      svCtx.fillRect(0, 0, w, h);
      // Cursor
      const cx = state.s * w;
      const cy = (1 - state.v) * h;
      svCtx.beginPath();
      svCtx.arc(cx, cy, 5, 0, Math.PI * 2);
      svCtx.strokeStyle = '#fff';
      svCtx.lineWidth = 2;
      svCtx.stroke();
      svCtx.beginPath();
      svCtx.arc(cx, cy, 4, 0, Math.PI * 2);
      svCtx.strokeStyle = '#000';
      svCtx.lineWidth = 1;
      svCtx.stroke();
    };

    const update = () => {
      const hexVal = this._hsvToHex(state.h, state.s, state.v);
      swatch.style.background = hexVal;
      hex.textContent = hexVal;
      onChange(hexVal);
      drawSV();
      drawHueStrip();
    };

    // SV drag
    const onSV = (e) => {
      const r = svCanvas.getBoundingClientRect();
      state.s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      state.v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
      update();
    };
    svCanvas.addEventListener('pointerdown', (e) => {
      onSV(e);
      svCanvas.setPointerCapture(e.pointerId);
      svCanvas.addEventListener('pointermove', onSV);
    });
    svCanvas.addEventListener('pointerup', (e) => {
      svCanvas.releasePointerCapture(e.pointerId);
      svCanvas.removeEventListener('pointermove', onSV);
    });

    // Hue drag
    const onHue = (e) => {
      const r = hueCanvas.getBoundingClientRect();
      state.h = Math.max(0, Math.min(360, (e.clientX - r.left) / r.width * 360));
      update();
    };
    hueCanvas.addEventListener('pointerdown', (e) => {
      onHue(e);
      hueCanvas.setPointerCapture(e.pointerId);
      hueCanvas.addEventListener('pointermove', onHue);
    });
    hueCanvas.addEventListener('pointerup', (e) => {
      hueCanvas.releasePointerCapture(e.pointerId);
      hueCanvas.removeEventListener('pointermove', onHue);
    });

    popup.appendChild(svCanvas);
    popup.appendChild(hueCanvas);

    // Editable hex input
    const hexRow = document.createElement('div');
    hexRow.className = 'color-input-row';
    const hexLabel = document.createElement('span');
    hexLabel.textContent = 'HEX';
    hexLabel.className = 'color-input-label';
    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'color-input';
    hexInput.value = initial;
    hexInput.spellcheck = false;
    hexRow.appendChild(hexLabel);
    hexRow.appendChild(hexInput);
    popup.appendChild(hexRow);

    // Editable rgb input
    const rgbRow = document.createElement('div');
    rgbRow.className = 'color-input-row';
    const rgbLabel = document.createElement('span');
    rgbLabel.textContent = 'RGB';
    rgbLabel.className = 'color-input-label';
    const rgbInput = document.createElement('input');
    rgbInput.type = 'text';
    rgbInput.className = 'color-input';
    rgbInput.spellcheck = false;
    const initRgb = this._hexToRgb(initial);
    rgbInput.value = `${initRgb.r}, ${initRgb.g}, ${initRgb.b}`;
    rgbRow.appendChild(rgbLabel);
    rgbRow.appendChild(rgbInput);
    popup.appendChild(rgbRow);

    // Patch update to sync text inputs
    const origUpdate = update;
    const syncInputs = () => {
      const hexVal = this._hsvToHex(state.h, state.s, state.v);
      hexInput.value = hexVal;
      const rgb = this._hexToRgb(hexVal);
      rgbInput.value = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
    };

    // Wrap the existing update
    const wrappedUpdate = () => { origUpdate(); syncInputs(); };
    // Re-bind SV and hue drag handlers to use wrapped update
    const onSVWrapped = (e) => {
      const r = svCanvas.getBoundingClientRect();
      state.s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      state.v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
      wrappedUpdate();
    };
    const onHueWrapped = (e) => {
      const r = hueCanvas.getBoundingClientRect();
      state.h = Math.max(0, Math.min(360, (e.clientX - r.left) / r.width * 360));
      wrappedUpdate();
    };

    // Replace previous event listeners by re-adding with capture
    svCanvas.addEventListener('pointerdown', (e) => {
      onSVWrapped(e);
      svCanvas.setPointerCapture(e.pointerId);
      const move = (ev) => onSVWrapped(ev);
      const up = (ev) => {
        svCanvas.releasePointerCapture(ev.pointerId);
        svCanvas.removeEventListener('pointermove', move);
        svCanvas.removeEventListener('pointerup', up);
      };
      svCanvas.addEventListener('pointermove', move);
      svCanvas.addEventListener('pointerup', up);
    }, true);

    hueCanvas.addEventListener('pointerdown', (e) => {
      onHueWrapped(e);
      hueCanvas.setPointerCapture(e.pointerId);
      const move = (ev) => onHueWrapped(ev);
      const up = (ev) => {
        hueCanvas.releasePointerCapture(ev.pointerId);
        hueCanvas.removeEventListener('pointermove', move);
        hueCanvas.removeEventListener('pointerup', up);
      };
      hueCanvas.addEventListener('pointermove', move);
      hueCanvas.addEventListener('pointerup', up);
    }, true);

    // Hex input: accept typed/pasted hex
    hexInput.addEventListener('change', () => {
      let v = hexInput.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        Object.assign(state, this._hexToHsv(v));
        wrappedUpdate();
      }
    });

    // RGB input: accept typed/pasted rgb like "255, 128, 0" or "255 128 0"
    rgbInput.addEventListener('change', () => {
      const parts = rgbInput.value.replace(/[^\d,\s]/g, '').split(/[\s,]+/).map(Number);
      if (parts.length === 3 && parts.every(n => n >= 0 && n <= 255)) {
        const hexVal = '#' + parts.map(n => n.toString(16).padStart(2, '0')).join('');
        Object.assign(state, this._hexToHsv(hexVal));
        wrappedUpdate();
      }
    });

    // Toggle popup on swatch click
    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = popup.style.display !== 'none';
      // Close all other popups first
      parent.querySelectorAll('.color-popup').forEach(p => p.style.display = 'none');
      if (!wasOpen) {
        popup.style.display = 'block';
        drawSV();
        drawHueStrip();
      }
    });

    // Close on outside click
    document.addEventListener('click', () => {
      popup.style.display = 'none';
    });
    popup.addEventListener('click', (e) => e.stopPropagation());

    row.appendChild(lbl);
    row.appendChild(swatch);
    row.appendChild(hex);
    row.appendChild(popup);
    parent.appendChild(row);
  }

  // --- Color conversion helpers ---

  _hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  _hexToHsv(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d + 6) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    const s = max === 0 ? 0 : d / max;
    return { h, s, v: max };
  }

  _hsvToHex(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let r, g, b;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    const toHex = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
}
