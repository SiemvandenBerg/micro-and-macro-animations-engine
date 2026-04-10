// animation.js — Keyframe storage, interpolation, and playback

export class AnimationClip {
  constructor(name, duration, loop = true) {
    this.name = name;
    this.duration = duration;  // seconds
    this.loop = loop;
    this.propertyTracks = new Map();  // 'boneId:prop' → [{time, value}]
  }

  // Convenience: add a rotation keyframe (radians)
  addKeyframe(time, boneId, angle) {
    this.addPropertyKeyframe(time, boneId, 'rotation', angle);
  }

  addPropertyKeyframe(time, boneId, property, value) {
    const key = `${boneId}:${property}`;
    if (!this.propertyTracks.has(key)) {
      this.propertyTracks.set(key, []);
    }
    const track = this.propertyTracks.get(key);
    track.push({ time, value });
    track.sort((a, b) => a.time - b.time);
  }

  // Remove all keyframes from every track
  clearKeyframes() {
    this.propertyTracks.clear();
  }

  // Move all keyframes at oldTime to newTime for the given boneId
  moveKeyframe(boneId, oldTime, newTime) {
    const ot = Math.round(oldTime * 1000) / 1000;
    const nt = Math.max(0, Math.min(this.duration, Math.round(newTime * 1000) / 1000));
    for (const [key, track] of this.propertyTracks) {
      const kb = key.slice(0, key.lastIndexOf(':'));
      if (kb !== boneId) continue;
      const idx = track.findIndex(kf => Math.abs(kf.time - ot) < 0.005);
      if (idx < 0) continue;
      track[idx].time = nt;
      track.sort((a, b) => a.time - b.time);
    }
  }

  // Add or replace a keyframe at exactly this time (rounded to 3 decimal places)
  upsertKeyframe(time, boneId, property, value) {
    const t = Math.round(time * 1000) / 1000;
    const key = `${boneId}:${property}`;
    if (!this.propertyTracks.has(key)) {
      this.propertyTracks.set(key, []);
    }
    const track = this.propertyTracks.get(key);
    const existing = track.findIndex(kf => Math.abs(kf.time - t) < 0.001);
    if (existing >= 0) {
      track[existing].value = value;
    } else {
      track.push({ time: t, value });
      track.sort((a, b) => a.time - b.time);
    }
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
    for (const [trackKey, track] of this.clip.propertyTracks) {
      if (track.length === 0) continue;
      const sepIdx = trackKey.lastIndexOf(':');
      const boneId = trackKey.slice(0, sepIdx);
      const property = trackKey.slice(sepIdx + 1);
      const bone = this.skeleton.getBone(boneId);
      if (!bone) continue;

      const value = this._interpolateTrack(track);
      switch (property) {
        case 'rotation':  bone.rotation = value;  break;
        case 'positionX': bone.positionX = value; break;
        case 'positionY': bone.positionY = value; break;
        case 'scaleX':    bone.scaleX = value;    break;
        case 'scaleY':    bone.scaleY = value;    break;
      }
    }
  }

  _interpolateTrack(track) {
    const t = this.time;

    let prev = track[track.length - 1];
    let next = track[0];

    for (let i = 0; i < track.length; i++) {
      if (track[i].time <= t) prev = track[i];
      if (track[i].time >= t) { next = track[i]; break; }
    }

    if (prev === next || prev.time === next.time) {
      return prev.value;
    }

    let prevTime = prev.time;
    let nextTime = next.time;
    let currentTime = t;

    if (prevTime > nextTime) {
      nextTime += this.clip.duration;
      if (currentTime < prevTime) currentTime += this.clip.duration;
    }

    const alpha = (currentTime - prevTime) / (nextTime - prevTime);
    const eased = 0.5 - 0.5 * Math.cos(alpha * Math.PI);
    return prev.value + (next.value - prev.value) * eased;
  }
}
