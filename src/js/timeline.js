// timeline.js — Keyframe timeline UI
//
// Renders one row per bone that has keyframes in the current clip.
// Clicking a keyframe diamond seeks to that time.
// The top scrubber bar and playhead stay in sync with the AnimationPlayer.

export class Timeline {
  constructor(engine) {
    this.engine = engine;

    this._tracks  = document.getElementById('timeline-tracks');
    this._header  = document.getElementById('timeline-scrubber-wrap');
    this._timeEl  = document.getElementById('timeline-time');
    this._playBtn = document.getElementById('timeline-toggle-play');
    this._tlCanvas = document.getElementById('timeline-canvas');

    this._playhead = null;   // absolutely positioned div inside tracks area
    this._duration = 1;
    this._built = false;
    this._selectedKfEl = null; // currently selected keyframe DOM element
  }

  // Call once after engine.init() to wire all persistent event listeners
  init() {
    if (this._playBtn) {
      this._playBtn.addEventListener('click', () => {
        this.engine.player.playing = !this.engine.player.playing;
        this._updatePlayBtn();
      });
    }
    this._initScrubber();
    this._initTrackScrubber();
  }

  // Call after engine.init() so the clip is ready
  build() {
    this._built = false;
    // Clear stale selection before destroying the DOM
    this._selectedKfEl = null;
    this.engine.shapeRenderer.highlightBoneIds = new Set();
    this._tracks.innerHTML = '';

    const clip = this.engine.player.clip;
    if (!clip) return;
    this._duration = clip.duration || 1;

    // Gather unique bone ids that have keyframes
    const boneTrackMap = new Map();   // boneId → Set of times
    for (const [key, kfs] of clip.propertyTracks) {
      const boneId = key.slice(0, key.lastIndexOf(':'));
      if (!boneTrackMap.has(boneId)) boneTrackMap.set(boneId, new Set());
      for (const kf of kfs) boneTrackMap.get(boneId).add(kf.time);
    }

    // Create playhead (spans the full track area; always shown even with no rows)
    this._playhead = document.createElement('div');
    this._playhead.id = 'tl-playhead';
    this._playhead.style.height = `${Math.max(1, boneTrackMap.size) * 22}px`;
    // Drag handle at the top of the playhead
    const handle = document.createElement('div');
    handle.id = 'tl-playhead-handle';
    this._playhead.appendChild(handle);
    this._tracks.style.position = 'relative';
    this._tracks.appendChild(this._playhead);

    // Build one row per bone
    for (const [boneId, times] of boneTrackMap) {
      const row = document.createElement('div');
      row.className = 'tl-row';

      const label = document.createElement('div');
      label.className = 'tl-label';
      label.textContent = boneId;
      label.title = boneId;
      row.appendChild(label);

      const track = document.createElement('div');
      track.className = 'tl-track';

      for (const t of times) {
        const kf = document.createElement('div');
        kf.className = 'tl-kf';
        kf.style.left = `${(t / this._duration) * 100}%`;
        kf.title = `${boneId} @ ${t.toFixed(2)}s`;
        this._attachKfHandlers(kf, track, boneId, t);
        track.appendChild(kf);
      }

      row.appendChild(track);
      this._tracks.appendChild(row);
    }

    // Scrubber: draw time ruler on the canvas
    this._drawRuler();

    this._built = true;
  }

  // Called every frame by the engine loop to keep playhead/time in sync
  update() {
    if (!this._built) return;
    const t = this.engine.player.time;
    // Playhead left is relative to the tracks container.
    // The first 90px is the label column, the rest is the track area.
    const LABEL_W = 90;
    if (this._playhead && this._tracks) {
      const trackW = this._tracks.clientWidth - LABEL_W;
      const px = LABEL_W + (t / this._duration) * trackW;
      this._playhead.style.left = `${px}px`;
    }

    if (this._timeEl) {
      this._timeEl.textContent = t.toFixed(2) + 's';
    }

    this._updatePlayBtn();
  }

  _updatePlayBtn() {
    if (this._playBtn) {
      this._playBtn.textContent = this.engine.player.playing ? '⏸' : '▶';
    }
  }

  // Attach drag-to-move + click-to-select handlers to a keyframe diamond element.
  // `trackEl` is the .tl-track container; `origT` is the initial time in seconds.
  _attachKfHandlers(kf, trackEl, boneId, origT) {
    const DRAG_THRESHOLD = 4; // px to distinguish click from drag

    kf.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      let dragging = false;
      let currentT = origT;

      const onMove = (me) => {
        const dx = me.clientX - startX;
        if (!dragging && Math.abs(dx) < DRAG_THRESHOLD) return;
        dragging = true;

        const rect = trackEl.getBoundingClientRect();
        const LABEL_W = 90;
        const trackW = rect.width; // .tl-track has no label offset, it's already track-only
        const frac = Math.max(0, Math.min(1, (me.clientX - rect.left) / trackW));
        currentT = frac * this._duration;

        kf.style.left = `${frac * 100}%`;
        kf.title = `${boneId} @ ${currentT.toFixed(2)}s`;
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);

        if (dragging) {
          // Commit the move by updating clip data then rebuilding
          const clip = this.engine.player.clip;
          if (clip) {
            clip.moveKeyframe(boneId, origT, currentT);
            this.engine.player.seekTo(currentT);
          }
          this.build();
          this.selectKeyframe(boneId, currentT);
        } else {
          // Treat as click: seek + toggle selection
          this.engine.player.playing = false;
          this.engine.player.seekTo(origT);
          this._updatePlayBtn();
          const isAlreadySelected = this._selectedKfEl === kf;
          this._clearSelection();
          if (!isAlreadySelected) {
            kf.classList.add('selected');
            this._selectedKfEl = kf;
            this.engine.shapeRenderer.highlightBoneIds = new Set([boneId]);
          }
        }
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  _clearSelection() {
    if (this._selectedKfEl) {
      this._selectedKfEl.classList.remove('selected');
      this._selectedKfEl = null;
    }
    this.engine.shapeRenderer.highlightBoneIds = new Set();
  }

  // Select the keyframe diamond for boneId at the given time (called after drag)
  selectKeyframe(boneId, time) {
    if (!this._built) return;
    const t = Math.round(time * 1000) / 1000;
    // Find the diamond whose title matches "boneId @ t.XXs"
    const diamonds = this._tracks.querySelectorAll('.tl-kf');
    for (const kf of diamonds) {
      const [kb, kt] = kf.title.split(' @ ');
      if (kb === boneId && Math.abs(parseFloat(kt) - t) < 0.01) {
        this._clearSelection();
        kf.classList.add('selected');
        this._selectedKfEl = kf;
        this.engine.shapeRenderer.highlightBoneIds = new Set([boneId]);
        return;
      }
    }
  }

  _drawRuler() {
    const canvas = this._tlCanvas;
    if (!canvas) return;
    const w = canvas.offsetWidth || 400;
    const h = canvas.offsetHeight || 22;
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, w, h);

    // Tick marks: every 0.1s minor, every 0.5s major
    const pxPerSec = w / this._duration;
    const step = pxPerSec >= 40 ? 0.1 : pxPerSec >= 15 ? 0.2 : 0.5;

    ctx.fillStyle   = '#555';
    ctx.strokeStyle = '#555';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';

    for (let t = 0; t <= this._duration + 0.001; t += step) {
      const x = Math.round((t / this._duration) * w);
      const major = Math.abs(t % 0.5) < 0.001;
      const tickH = major ? 10 : 5;
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x, h - tickH);
      ctx.strokeStyle = major ? '#666' : '#3a3a3a';
      ctx.stroke();
      if (major) {
        ctx.fillStyle = '#666';
        ctx.fillText(t.toFixed(1) + 's', x, h - 12);
      }
    }
  }

  _initScrubber() {
    const wrap = this._header;
    if (!wrap) return;

    const seek = (e) => {
      const rect = wrap.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.engine.player.playing = false;
      this.engine.player.seekTo(frac * this._duration);
      this._updatePlayBtn();
    };

    let dragging = false;
    wrap.addEventListener('mousedown', (e) => { dragging = true; seek(e); });
    window.addEventListener('mousemove', (e) => { if (dragging) seek(e); });
    window.addEventListener('mouseup',   ()  => { dragging = false; });
  }

  // Make the track area also scrub on click+drag (offset by label column width)
  _initTrackScrubber() {
    const tracks = this._tracks;
    if (!tracks) return;
    const LABEL_W = 90; // must match .tl-label width in CSS

    const seek = (e) => {
      const rect = tracks.getBoundingClientRect();
      const trackW = rect.width - LABEL_W;
      if (trackW <= 0) return;
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left - LABEL_W) / trackW));
      this.engine.player.playing = false;
      this.engine.player.seekTo(frac * this._duration);
      this._updatePlayBtn();
    };

    let dragging = false;
    tracks.addEventListener('mousedown', (e) => {
      // Only start drag if not clicking a keyframe diamond
      if (e.target.classList.contains('tl-kf')) return;
      // Clicking empty track area clears keyframe selection
      this._clearSelection();
      dragging = true;
      seek(e);
    });
    window.addEventListener('mousemove', (e) => { if (dragging) seek(e); });
    window.addEventListener('mouseup',   ()  => { dragging = false; });
  }
}
