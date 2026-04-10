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

    this._buildToggles();
    this._buildSliders();
    this._buildBoneControls();
  }

  _buildToggles() {
    const section = this._section('Systems');

    this._toggle(section, 'Skeleton visible', true, (v) => {
      this.engine.showSkeleton = v;
    });
    this._toggle(section, 'Shape attachment', true, (v) => {
      this.engine.shapeRenderer.enabled = v;
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

    this._slider(section, 'Speed', 0, 2, 0.05, 1, (v) => {
      this.engine.player.speed = v;
    });

    const clip = this.engine.player.clip;
    const duration = clip ? clip.duration : 3;
    this._slider(section, 'Time', 0, duration, 0.01, 0, (v) => {
      this.engine.player.playing = false;
      this.engine.player.seekTo(v);
    });

    // Play/pause button
    const row = document.createElement('div');
    row.className = 'control-row';
    const btn = document.createElement('button');
    btn.textContent = '⏸ Pause';
    btn.addEventListener('click', () => {
      this.engine.player.playing = !this.engine.player.playing;
      btn.textContent = this.engine.player.playing ? '⏸ Pause' : '▶ Play';
    });
    row.appendChild(btn);
    section.appendChild(row);
  }

  _buildBoneControls() {
    const section = this._section('Bone Angles');

    for (const bone of this.engine.skeleton.bones.values()) {
      const deg = Math.round(bone.baseAngle * 180 / Math.PI);
      this._slider(section, bone.id, deg - 45, deg + 45, 0.5, deg, (v) => {
        bone.angle = v * Math.PI / 180;
      }, bone.id);
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

  // --- DOM helpers ---

  _section(title) {
    const sec = document.createElement('div');
    sec.className = 'control-section';
    const h = document.createElement('h3');
    h.textContent = title;
    sec.appendChild(h);
    this.panel.appendChild(sec);
    return sec;
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
}
