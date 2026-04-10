// animation.js — Keyframe storage, interpolation, and playback

export class Keyframe {
  constructor(time, boneId, angle) {
    this.time = time;       // seconds
    this.boneId = boneId;
    this.angle = angle;     // radians
  }
}

export class AnimationClip {
  constructor(name, duration, loop = true) {
    this.name = name;
    this.duration = duration;  // seconds
    this.loop = loop;
    this.tracks = new Map();   // boneId → [Keyframe] sorted by time
  }

  addKeyframe(time, boneId, angle) {
    if (!this.tracks.has(boneId)) {
      this.tracks.set(boneId, []);
    }
    const track = this.tracks.get(boneId);
    track.push(new Keyframe(time, boneId, angle));
    track.sort((a, b) => a.time - b.time);
  }
}

export class AnimationPlayer {
  constructor(skeleton) {
    this.skeleton = skeleton;
    this.clip = null;
    this.time = 0;
    this.speed = 1;
    this.enabled = true;
    this.playing = true;
  }

  play(clip) {
    this.clip = clip;
    this.time = 0;
  }

  // Advance time and apply interpolated bone angles
  update(dt) {
    if (!this.clip || !this.enabled || !this.playing) return;

    this.time += dt * this.speed;

    if (this.clip.loop) {
      this.time = this.time % this.clip.duration;
    } else {
      this.time = Math.min(this.time, this.clip.duration);
    }

    this._apply();
  }

  seekTo(t) {
    if (!this.clip) return;
    this.time = Math.max(0, Math.min(t, this.clip.duration));
    this._apply();
  }

  _apply() {
    for (const [boneId, track] of this.clip.tracks) {
      const bone = this.skeleton.getBone(boneId);
      if (!bone || track.length === 0) continue;

      const t = this.time;

      // Find surrounding keyframes
      let prev = track[track.length - 1];
      let next = track[0];

      for (let i = 0; i < track.length; i++) {
        if (track[i].time <= t) prev = track[i];
        if (track[i].time >= t) { next = track[i]; break; }
      }

      if (prev === next || prev.time === next.time) {
        bone.angle = prev.angle;
      } else {
        // Handle wrap-around for looping
        let prevTime = prev.time;
        let nextTime = next.time;
        let currentTime = t;

        if (prevTime > nextTime) {
          // Wrapped: prev is near end, next is near start
          nextTime += this.clip.duration;
          if (currentTime < prevTime) currentTime += this.clip.duration;
        }

        const alpha = (currentTime - prevTime) / (nextTime - prevTime);
        // Sine ease in-out for organic feel
        const eased = 0.5 - 0.5 * Math.cos(alpha * Math.PI);
        bone.angle = prev.angle + (next.angle - prev.angle) * eased;
      }
    }
  }
}
