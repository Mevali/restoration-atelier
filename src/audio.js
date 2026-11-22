import { AUDIO_META } from './audio-meta.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.compressor = null;
    this.warmFilter = null;
    this.masterGain = null;

    this.rawBuffers = new Map();
    this.buffers = new Map();
    this.decoding = new Set();

    this.bgmSource = null;
    this.bgmGain = null;

    this.activeLoopKey = null;
    this.activeLoopSource = null;
    this.activeLoopGain = null;
    this.loopStopTimer = null;

    this.userMuted = false;
    this.platformAudioEnabled = true;
    this.platformPaused = false;
    this.adOpen = false;
    this.pageHidden = Boolean(document.hidden);
    this.initialized = false;

    this.lastBubbleAt = 0;
    this.lastPulseAt = 0;
    this.decayTimer = null;
    this.preloadStarted = false;
    this.fetching = new Map();
  }

  fetchKey(key) {
    if (typeof fetch !== 'function') return Promise.resolve(null);
    if (this.rawBuffers.has(key)) return Promise.resolve(this.rawBuffers.get(key));
    if (this.fetching.has(key)) return this.fetching.get(key);
    const src = AUDIO_META[key];
    if (!src) return Promise.resolve(null);

    const req = fetch(src)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((buf) => {
        this.fetching.delete(key);
        if (!buf) return null;
        this.rawBuffers.set(key, buf);
        if (this.initialized) {
          this.decodeKey(key);
        }
        return buf;
      })
      .catch(() => {
        this.fetching.delete(key);
        return null;
      });

    this.fetching.set(key, req);
    return req;
  }

  preloadAll(priorityKeys = []) {
    if (this.preloadStarted || typeof fetch !== 'function') return;
    this.preloadStarted = true;

    const ordered = [];
    const seen = new Set();
    for (const k of [
      'bgm_atelier',
      'sfx_click',
      'sfx_tool_pickup',
      'sfx_stage_chime',
      ...priorityKeys,
      ...Object.keys(AUDIO_META)
    ]) {
      if (AUDIO_META[k] && !seen.has(k)) {
        seen.add(k);
        ordered.push(k);
      }
    }

    const head = ordered.slice(0, 6);
    const tail = ordered.slice(6);
    Promise.all(head.map((k) => this.fetchKey(k))).finally(() => {
      for (const k of tail) {
        this.fetchKey(k);
      }
    });
  }

  decodeKey(key) {
    if (!this.ctx || this.buffers.has(key) || this.decoding.has(key)) return;
    const raw = this.rawBuffers.get(key);
    if (!raw) return;
    this.decoding.add(key);
    this.ctx
      .decodeAudioData(raw.slice(0))
      .then((audioBuffer) => {
        this.buffers.set(key, audioBuffer);
        this.decoding.delete(key);
        if (key === 'bgm_atelier') {
          this.ensureBgmPlaying();
        }
      })
      .catch(() => {
        this.decoding.delete(key);
      });
  }

  isSilenced() {
    return (
      this.userMuted ||
      !this.platformAudioEnabled ||
      this.platformPaused ||
      this.adOpen ||
      this.pageHidden
    );
  }

  ensureContext() {
    if (this.initialized) return true;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;

    try {
      this.ctx = new AudioCtx();

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -16;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.004;
      this.compressor.release.value = 0.14;

      this.warmFilter = this.ctx.createBiquadFilter();
      this.warmFilter.type = 'highshelf';
      this.warmFilter.frequency.value = 7200;
      this.warmFilter.gain.value = -2.5;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isSilenced() ? 0 : 0.88;

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = this.isSilenced() ? 0 : 0.16;

      this.bgmGain.connect(this.compressor);
      this.compressor.connect(this.warmFilter);
      this.warmFilter.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.initialized = true;
      for (const key of this.rawBuffers.keys()) {
        this.decodeKey(key);
      }
      this.ensureBgmPlaying();
      return true;
    } catch {
      return false;
    }
  }

  ensureBgmPlaying() {
    if (!this.initialized || !this.ctx || !this.bgmGain || this.bgmSource) return;
    const buf = this.buffers.get('bgm_atelier');
    if (!buf) {
      if (this.rawBuffers.has('bgm_atelier')) this.decodeKey('bgm_atelier');
      else this.fetchKey('bgm_atelier');
      return;
    }
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(this.bgmGain);
      src.start(0);
      this.bgmSource = src;
    } catch {
      this.bgmSource = null;
    }
  }

  haptic(pattern = 16) {
    if (this.isSilenced()) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // Safe no-op on browsers without Vibration API
    }
  }

  unlock() {
    if (!this.ensureContext() || !this.ctx) return;
    this.ensureBgmPlaying();
    if (!this.isSilenced() && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.syncAudioState();
  }

  setUserMuted(muted) {
    this.userMuted = Boolean(muted);
    if (this.userMuted) {
      this.stopScrub();
    }
    this.syncAudioState();
    return this.userMuted;
  }

  setPlatformAudioEnabled(enabled) {
    this.platformAudioEnabled = Boolean(enabled);
    if (!this.platformAudioEnabled) {
      this.stopScrub();
    }
    this.syncAudioState();
  }

  setPlatformPaused(paused) {
    this.platformPaused = Boolean(paused);
    if (this.platformPaused) {
      this.stopScrub();
    }
    this.syncAudioState();
  }

  setAdOpen(isOpen) {
    this.adOpen = Boolean(isOpen);
    this.stopScrub();
    this.syncAudioState();
  }

  setPageHidden(isHidden) {
    this.pageHidden = Boolean(isHidden);
    if (this.pageHidden) {
      this.stopScrub();
    }
    this.syncAudioState();
  }

  syncAudioState() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    if (this.isSilenced()) {
      this.masterGain.gain.setValueAtTime(0, now);
      if (this.bgmGain) this.bgmGain.gain.setValueAtTime(0, now);
      if (this.activeLoopGain) this.activeLoopGain.gain.setValueAtTime(0, now);
      if (this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      }
    } else {
      this.ensureBgmPlaying();
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this.masterGain.gain.setTargetAtTime(0.88, now, 0.04);
      if (this.bgmGain) this.bgmGain.gain.setTargetAtTime(0.16, now, 0.14);
    }
  }

  playSample(key, { volume = 0.72, rateMin = 0.94, rateMax = 1.06, delay = 0 } = {}) {
    if (this.isSilenced()) return false;
    if (!this.ensureContext() || !this.ctx || !this.compressor) return false;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const buf = this.buffers.get(key);
    if (!buf) {
      if (this.rawBuffers.has(key)) {
        this.decodeKey(key);
      } else {
        this.fetchKey(key);
      }
      return false;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const rate = rateMin === rateMax ? rateMin : rateMin + Math.random() * (rateMax - rateMin);
    src.playbackRate.value = rate;

    const g = this.ctx.createGain();
    g.gain.value = volume;

    src.connect(g);
    g.connect(this.compressor);
    src.start(this.ctx.currentTime + delay);
    return true;
  }

  getLoopKeyForMode(mode) {
    if (mode === 'excavate') return 'loop_dig';
    if (mode === 'scrape') return 'loop_scrape';
    if (mode === 'foam' || mode === 1) return 'loop_foam';
    if (mode === 'rinse') return 'loop_water';
    if (mode === 'sandblast' || mode === 2) return 'loop_sand';
    if (mode === 'paint') return 'loop_paint';
    return 'loop_polish';
  }

  updateScrub(mode, speedPx, progressRatio, turboActive) {
    if (this.isSilenced()) return;
    if (!this.ensureContext() || !this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const now = this.ctx.currentTime;
    const clampedSpeed = Math.min(1, Math.max(0.08, speedPx / 26));
    const loopKey = this.getLoopKeyForMode(mode);
    const loopBuf = this.buffers.get(loopKey);

    clearTimeout(this.loopStopTimer);

    if (loopBuf) {
      const baseVol = (0.28 + clampedSpeed * 0.54) * (turboActive ? 1.12 : 1.0);
      let volTarget = Math.min(0.95, baseVol);
      let rateTarget = (0.90 + clampedSpeed * 0.22) * (turboActive ? 1.08 : 1.0);

      if (mode === 'excavate') {
        volTarget = Math.min(0.95, baseVol * 0.88);
        rateTarget = 0.90 + clampedSpeed * 0.13;
      } else if (mode === 'scrape') {
        volTarget = Math.min(0.95, baseVol * 0.82);
        rateTarget = 0.91 + clampedSpeed * 0.12;
      } else if (mode === 'sandblast' || mode === 2) {
        volTarget = Math.min(0.95, baseVol * 0.86);
        rateTarget = (0.94 + clampedSpeed * 0.10) * (turboActive ? 1.03 : 1.0);
      }

      if (this.activeLoopKey !== loopKey || !this.activeLoopSource || !this.activeLoopGain) {
        this.stopActiveLoopImmediate(now);
        const src = this.ctx.createBufferSource();
        src.buffer = loopBuf;
        src.loop = true;
        src.playbackRate.value = rateTarget;

        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.001, now);
        g.gain.setTargetAtTime(volTarget, now, 0.045);

        src.connect(g);
        g.connect(this.compressor);
        src.start(now, Math.random() * Math.max(0.05, loopBuf.duration * 0.5));

        this.activeLoopKey = loopKey;
        this.activeLoopSource = src;
        this.activeLoopGain = g;
      } else {
        this.activeLoopGain.gain.setTargetAtTime(volTarget, now, 0.04);
        this.activeLoopSource.playbackRate.setTargetAtTime(rateTarget, now, 0.05);
      }
    } else if (this.rawBuffers.has(loopKey)) {
      this.decodeKey(loopKey);
    } else {
      this.fetchKey(loopKey);
    }

    const perfNow = performance.now();
    if (mode === 'excavate') {
      if (speedPx > 5.5 && perfNow - this.lastPulseAt > 270 + Math.random() * 190) {
        this.lastPulseAt = perfNow;
        this.playDigCrunch();
      }
    } else if (mode === 'scrape') {
      if (speedPx > 6.5 && perfNow - this.lastPulseAt > 300 + Math.random() * 220) {
        this.lastPulseAt = perfNow;
        this.playScrapeChip();
      }
    } else if (mode === 'foam' || mode === 1) {
      if (perfNow - this.lastBubbleAt > 90 + Math.random() * 90) {
        this.lastBubbleAt = perfNow;
        this.playSample('sfx_bubble', { volume: 0.34, rateMin: 0.90, rateMax: 1.12 });
      }
    } else if (mode === 'rinse') {
      if (perfNow - this.lastBubbleAt > 125 + Math.random() * 90) {
        this.lastBubbleAt = perfNow;
        this.playSample('sfx_bubble', { volume: 0.24, rateMin: 0.85, rateMax: 1.04 });
      }
    }

    clearTimeout(this.decayTimer);
    this.decayTimer = setTimeout(() => {
      this.stopScrub();
    }, 95);
  }

  stopActiveLoopImmediate(now = this.ctx?.currentTime || 0) {
    if (this.activeLoopGain && this.ctx) {
      try {
        this.activeLoopGain.gain.setTargetAtTime(0, now, 0.025);
      } catch {}
    }
    const oldSrc = this.activeLoopSource;
    if (oldSrc) {
      setTimeout(() => {
        try {
          oldSrc.stop();
          oldSrc.disconnect();
        } catch {}
      }, 85);
    }
    this.activeLoopSource = null;
    this.activeLoopGain = null;
    this.activeLoopKey = null;
  }

  stopScrub() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.activeLoopGain) {
      this.activeLoopGain.gain.setTargetAtTime(0, now, 0.045);
      clearTimeout(this.loopStopTimer);
      this.loopStopTimer = setTimeout(() => {
        this.stopActiveLoopImmediate();
      }, 120);
    }
  }

  playClick() {
    this.playSample('sfx_click', { volume: 0.56, rateMin: 0.95, rateMax: 1.05 });
  }

  playPaperRustle() {
    this.playSample('sfx_paper', { volume: 0.62, rateMin: 0.94, rateMax: 1.06 });
  }

  playUpgrade() {
    this.playSample('sfx_stage_chime', { volume: 0.62, rateMin: 1.06, rateMax: 1.12 });
  }

  playStageClear() {
    this.playSample('sfx_stage_chime', { volume: 0.68, rateMin: 0.96, rateMax: 1.04 });
    this.haptic([18, 28, 22]);
  }

  playCompleteFanfare() {
    this.playSample('sfx_stage_chime', { volume: 0.72, rateMin: 1.0, rateMax: 1.0 });
    this.playSample('sfx_coins', { volume: 0.52, rateMin: 0.98, rateMax: 1.04, delay: 0.12 });
    this.haptic([24, 36, 32]);
  }

  playCoins() {
    this.playSample('sfx_coins', { volume: 0.78, rateMin: 0.95, rateMax: 1.05 });
  }

  playScrewTurn() {
    this.playSample('sfx_screw_ratchet', { volume: 0.45, rateMin: 0.92, rateMax: 1.08 });
  }

  playScrewPop() {
    this.playSample('sfx_screw_pop', { volume: 0.65, rateMin: 0.95, rateMax: 1.06 });
    this.haptic(14);
  }

  playSnapClick() {
    this.playSample('sfx_part_snap', { volume: 0.76, rateMin: 0.95, rateMax: 1.05 });
    this.haptic([18, 28, 22]);
  }

  playPrecisionDone() {
    this.playSample('sfx_stage_chime', { volume: 0.56, rateMin: 1.12, rateMax: 1.18 });
    this.haptic(14);
  }

  playToolSwap() {
    this.playSample('sfx_tool_pickup', { volume: 0.68, rateMin: 0.94, rateMax: 1.06 });
  }

  playFoamFizz() {
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        if (!this.isSilenced()) {
          this.playSample('sfx_bubble', { volume: 0.40, rateMin: 0.92, rateMax: 1.12 });
        }
      }, i * 85);
    }
  }

  playPartLift() {
    this.playSample('sfx_tool_pickup', { volume: 0.55, rateMin: 0.84, rateMax: 0.92 });
  }

  playOilDrop() {
    this.playSample('sfx_oil_drop', { volume: 0.62, rateMin: 0.93, rateMax: 1.07 });
  }

  playSolderSpark() {
    this.playSample('sfx_solder_sizzle', { volume: 0.52, rateMin: 0.92, rateMax: 1.08 });
  }

  playBubble() {
    this.playSample('sfx_bubble', { volume: 0.36, rateMin: 1.02, rateMax: 1.18 });
  }

  playDigCrunch() {
    this.playSample('sfx_dig_crunch', { volume: 0.30, rateMin: 0.88, rateMax: 1.04 });
    this.haptic(6);
  }

  playScrapeChip() {
    this.playSample('sfx_scrape_chip', { volume: 0.24, rateMin: 0.90, rateMax: 1.05 });
    this.haptic(6);
  }

  playWrongTool() {
    this.playSample('sfx_wrong', { volume: 0.64, rateMin: 0.96, rateMax: 1.04 });
    this.haptic(12);
  }

  playHallmarkReveal() {
    this.playSample('sfx_blade_ring', { volume: 0.62, rateMin: 1.06, rateMax: 1.12 });
    this.playSample('sfx_coins', { volume: 0.62, rateMin: 1.0, rateMax: 1.06, delay: 0.14 });
    this.haptic([16, 26, 22]);
  }

  playWatchTick() {
    this.playSample('sfx_watch_tick', { volume: 0.72, rateMin: 0.98, rateMax: 1.02 });
    this.haptic([12, 40, 12]);
  }

  playCameraShutter() {
    this.playSample('sfx_part_snap', { volume: 0.72, rateMin: 1.08, rateMax: 1.16 });
    this.playSample('sfx_blade_ring', { volume: 0.44, rateMin: 1.25, rateMax: 1.32, delay: 0.08 });
    this.haptic(18);
  }

  playRetroBoot() {
    this.playSample('sfx_stage_chime', { volume: 0.64, rateMin: 1.08, rateMax: 1.14 });
    this.playSample('sfx_click', { volume: 0.46, rateMin: 1.15, rateMax: 1.20, delay: 0.09 });
    this.haptic(16);
  }

  playLighterSpark() {
    this.playSample('sfx_scrape_chip', { volume: 0.65, rateMin: 1.12, rateMax: 1.22 });
    this.playSample('sfx_solder_sizzle', { volume: 0.56, rateMin: 0.85, rateMax: 0.92, delay: 0.07 });
    this.haptic(18);
  }

  playMusicBoxTune() {
    this.playSample('sfx_stage_chime', { volume: 0.66, rateMin: 1.02, rateMax: 1.06 });
    this.playSample('sfx_blade_ring', { volume: 0.44, rateMin: 1.18, rateMax: 1.24, delay: 0.16 });
    this.haptic(14);
  }

  playBladeRing() {
    this.playSample('sfx_blade_ring', { volume: 0.76, rateMin: 0.96, rateMax: 1.04 });
    this.haptic(16);
  }
}
