const SAVE_KEY = 'restoration_atelier_save';
const LEADERBOARD_ID = 'restoration_tycoon';
const YA_LEADERBOARD_ID = 'restorationtycoon';
export const GAME_VERSION = '1.1.0';

function cleanPlayerName(raw, fallback) {
  const s = String(raw || '').trim();
  if (!s) return fallback;
  if (/^(guest|гость|misafir|player|user)[\s_#-]*[a-z0-9]{3,}$/i.test(s)) {
    return fallback;
  }
  return s;
}

function percentileSorted(sortedAsc, p) {
  if (!sortedAsc.length) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor((sortedAsc.length - 1) * p)));
  return Math.round(sortedAsc[idx] * 100) / 100;
}

export class PlatformBridge {
  constructor({ audio, i18n, onPauseChange = null }) {
    this.audio = audio;
    this.i18n = i18n;
    this.onPauseChange = onPauseChange;
    this.bridge = null;
    this.ysdk = null;
    this.yaPlayer = null;
    this.yaSafeStorage = null;
    this.yaGameplayRunning = false;
    this.cgsdk = null;
    this.cgGameplayRunning = false;
    this.cgNoFillDetected = false;
    this.vkb = null;
    this.vkPlayerName = '';
    this.interstitialOrderCounter = 0;
    this.readySent = false;
    this.gameplayActive = false;
    this.isPaused = false;

    this.saveDebounceTimer = null;
    this.pendingState = null;
    this.memoryFallbackState = null;

    this.interstitialResolver = null;
    this.rewardedContext = null;

    this.perfWindowStartedAt = 0;
    this.perfActiveMs = 0;
    this.perfFrames = [];
    this.perfSkipNextFrame = true;
    this.perfJsErrors = 0;
    this.perfUnhandledRejections = 0;

    if (typeof window !== 'undefined') {
      window.addEventListener('error', () => {
        this.perfJsErrors += 1;
      });
      window.addEventListener('unhandledrejection', () => {
        this.perfUnhandledRejections += 1;
      });
    }
  }

  async init() {
    const ya = typeof window !== 'undefined' ? window.YaGames : null;
    if (ya && typeof ya.init === 'function') {
      try {
        this.ysdk = await ya.init();
        if (typeof this.ysdk.getStorage === 'function') {
          try {
            this.yaSafeStorage = await this.ysdk.getStorage();
          } catch {
            this.yaSafeStorage = null;
          }
        }
        if (typeof this.ysdk.getPlayer === 'function') {
          try {
            this.yaPlayer = await this.ysdk.getPlayer({ scopes: false });
          } catch {
            this.yaPlayer = null;
          }
        }
        if (typeof this.ysdk.on === 'function') {
          this.ysdk.on('game_api_pause', () => {
            this.isPaused = true;
            this.perfSkipNextFrame = true;
            this.audio.setPlatformPaused(true);
            this.syncYaGameplayState();
            this.onPauseChange?.(true);
          });
          this.ysdk.on('game_api_resume', () => {
            this.isPaused = false;
            this.perfSkipNextFrame = true;
            this.audio.setPlatformPaused(false);
            this.syncYaGameplayState();
            this.onPauseChange?.(false);
          });
        }
        return this.ysdk;
      } catch {
        this.ysdk = null;
      }
    }

    const cg = typeof window !== 'undefined' ? window.CrazyGames?.SDK : null;
    if (cg && typeof cg.init === 'function') {
      try {
        await cg.init();
        this.cgsdk = cg;
        try {
          const mute = this.cgsdk.game?.settings?.muteAudio;
          if (typeof mute === 'boolean') {
            this.audio.setPlatformAudioEnabled(!mute);
          }
          this.cgsdk.game?.addSettingsChangeListener?.((settings) => {
            if (typeof settings?.muteAudio === 'boolean') {
              this.audio.setPlatformAudioEnabled(!settings.muteAudio);
            }
          });
        } catch {}
        try {
          this.cgsdk.game?.loadingStart?.();
        } catch {}
        return this.cgsdk;
      } catch {
        this.cgsdk = null;
      }
    }

    const vkb = typeof window !== 'undefined' ? window.vkBridge : null;
    if (vkb && typeof vkb.send === 'function') {
      this.vkb = vkb;
      try {
        await vkb.send('VKWebAppInit');
      } catch {}
      vkb.send('VKWebAppGetUserInfo')
        .then((u) => {
          const full = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
          if (full) this.vkPlayerName = full;
        })
        .catch(() => {});
      if (typeof vkb.subscribe === 'function') {
        vkb.subscribe((evt) => {
          const t = evt?.detail?.type;
          if (t === 'VKWebAppViewHide') {
            this.isPaused = true;
            this.perfSkipNextFrame = true;
            this.audio.setPlatformPaused(true);
            this.onPauseChange?.(true);
          } else if (t === 'VKWebAppViewRestore') {
            this.isPaused = false;
            this.perfSkipNextFrame = true;
            this.audio.setPlatformPaused(false);
            this.onPauseChange?.(false);
          }
        });
      }
      vkb.send('VKWebAppCheckNativeAds', { ad_format: 'interstitial' }).catch(() => {});
      vkb.send('VKWebAppCheckNativeAds', { ad_format: 'reward' }).catch(() => {});
      return this.vkb;
    }

    const b = typeof window !== 'undefined' ? window.bridge : null;
    if (b && typeof b.initialize === 'function') {
      try {
        await b.initialize();
        this.bridge = b;
      } catch {
        this.bridge = null;
      }
    }

    if (this.bridge) {
      const initialAudio = this.bridge.platform?.isAudioEnabled !== false;
      this.audio.setPlatformAudioEnabled(initialAudio);

      const interState = this.bridge.advertisement?.interstitialState;
      const rewState = this.bridge.advertisement?.rewardedState;
      if (interState === 'opened' || rewState === 'opened') {
        this.audio.setAdOpen(true);
      }

      const EV = this.bridge.EVENT_NAME || {};

      if (EV.AUDIO_STATE_CHANGED && this.bridge.platform?.on) {
        this.bridge.platform.on(EV.AUDIO_STATE_CHANGED, (isEnabled) => {
          this.audio.setPlatformAudioEnabled(Boolean(isEnabled));
        });
      }

      if (EV.PAUSE_STATE_CHANGED && this.bridge.platform?.on) {
        this.bridge.platform.on(EV.PAUSE_STATE_CHANGED, (isPaused) => {
          this.isPaused = Boolean(isPaused);
          if (this.isPaused) this.perfSkipNextFrame = true;
          this.audio.setPlatformPaused(this.isPaused);
          this.onPauseChange?.(this.isPaused);
        });
      }

      if (EV.INTERSTITIAL_STATE_CHANGED && this.bridge.advertisement?.on) {
        this.bridge.advertisement.on(EV.INTERSTITIAL_STATE_CHANGED, (state) => {
          if (state === 'opened' || state === 'loading') {
            this.perfSkipNextFrame = true;
            this.audio.setAdOpen(state === 'opened');
          } else if (state === 'closed' || state === 'failed') {
            this.perfSkipNextFrame = true;
            this.audio.setAdOpen(false);
            if (this.interstitialResolver) {
              const resolve = this.interstitialResolver;
              this.interstitialResolver = null;
              resolve(state === 'closed');
            }
          }
        });
      }

      if (EV.REWARDED_STATE_CHANGED && this.bridge.advertisement?.on) {
        this.bridge.advertisement.on(EV.REWARDED_STATE_CHANGED, (state) => {
          if (state === 'opened') {
            this.perfSkipNextFrame = true;
            this.audio.setAdOpen(true);
          } else if (state === 'rewarded') {
            if (this.rewardedContext) {
              this.rewardedContext.rewarded = true;
            }
          } else if (state === 'closed' || state === 'failed') {
            this.perfSkipNextFrame = true;
            this.audio.setAdOpen(false);
            if (this.rewardedContext) {
              const ctx = this.rewardedContext;
              this.rewardedContext = null;
              ctx.resolve({ rewarded: Boolean(ctx.rewarded), placement: ctx.placement });
            }
          }
        });
      }
    }

    return this.bridge;
  }

  detectInitialLang() {
    if (this.ysdk?.environment?.i18n?.lang) {
      return this.ysdk.environment.i18n.lang;
    }
    if (this.vkb) {
      try {
        const params = new URLSearchParams(window.location?.search || '');
        const vkl = params.get('vk_language');
        if (vkl === '3' || vkl === 'en') return 'en';
        if (vkl === '82' || vkl === 'tr') return 'tr';
      } catch {}
      return 'ru';
    }
    if (this.cgsdk) {
      const nav = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language.slice(0, 2).toLowerCase() : 'en';
      if (nav === 'ru' || nav === 'tr' || nav === 'en') return nav;
      return 'en';
    }
    if (this.bridge?.platform?.language) {
      return this.bridge.platform.language;
    }
    return this.ysdk ? 'ru' : 'en';
  }

  signalLoadingReady() {
    if (this.readySent) return;
    this.readySent = true;
    try {
      if (this.ysdk) {
        this.ysdk.features?.LoadingAPI?.ready?.();
        this.syncYaGameplayState();
        return;
      }
      if (this.cgsdk) {
        this.cgsdk.game?.loadingStop?.();
        this.syncCgGameplayState();
        return;
      }
      if (this.vkb) return;
      this.bridge?.platform?.sendMessage?.('game_ready');
    } catch {
      // Safe no-op
    }
  }

  syncCgGameplayState() {
    if (!this.cgsdk || !this.readySent) return;
    const shouldRun = Boolean(this.gameplayActive && !this.isPaused && !this.audio?.adOpen);
    if (this.cgGameplayRunning === shouldRun) return;
    this.cgGameplayRunning = shouldRun;
    try {
      if (shouldRun) {
        this.cgsdk.game?.gameplayStart?.();
      } else {
        this.cgsdk.game?.gameplayStop?.();
      }
    } catch {
      // Safe no-op
    }
  }

  syncYaGameplayState() {
    if (!this.ysdk || !this.readySent) return;
    const shouldRun = Boolean(this.gameplayActive && !this.isPaused && !this.audio?.adOpen);
    if (this.yaGameplayRunning === shouldRun) return;
    this.yaGameplayRunning = shouldRun;
    try {
      if (shouldRun) {
        this.ysdk.features?.GameplayAPI?.start?.();
      } else {
        this.ysdk.features?.GameplayAPI?.stop?.();
      }
    } catch {
      // Safe no-op
    }
  }

  notifyLevelStarted(levelNumber) {
    try {
      this.bridge?.platform?.sendMessage?.('level_started', { level: String(levelNumber) });
    } catch {}
  }

  notifyLevelCompleted(levelNumber) {
    try {
      this.bridge?.platform?.sendMessage?.('level_completed', { level: String(levelNumber) });
    } catch {}
  }

  setGameplayActive(active) {
    const next = Boolean(active);
    if (this.gameplayActive === next) {
      if (this.ysdk) this.syncYaGameplayState();
      if (this.cgsdk) this.syncCgGameplayState();
      return;
    }
    this.gameplayActive = next;
    this.perfSkipNextFrame = true;
    if (!this.readySent) return;
    if (this.ysdk) {
      this.syncYaGameplayState();
      return;
    }
    if (this.cgsdk) {
      this.syncCgGameplayState();
      return;
    }
    if (this.vkb) return;
    try {
      this.bridge?.platform?.sendMessage?.(next ? 'level_resumed' : 'level_paused');
    } catch {
      // Safe no-op
    }
  }

  sendTelemetryEvent(eventName, data = null) {
    if (!eventName || !this.bridge?.analytics?.send) return;
    try {
      if (data && typeof data === 'object') {
        this.bridge.analytics.send(eventName, data);
      } else {
        this.bridge.analytics.send(eventName);
      }
    } catch {
      // Safe no-op
    }
  }

  emitPerformanceSample(sample) {
    // Single game-local adapter for performance_sample
    this.sendTelemetryEvent('performance_sample', sample);
  }

  recordGameplayFrame(rawDtMs, nowPerf) {
    const visibleActive = Boolean(
      this.readySent &&
      this.gameplayActive &&
      !this.isPaused &&
      !this.audio?.adOpen &&
      typeof document !== 'undefined' &&
      !document.hidden
    );

    if (!visibleActive) {
      this.perfSkipNextFrame = true;
      return;
    }

    if (this.perfSkipNextFrame) {
      this.perfSkipNextFrame = false;
      if (!this.perfWindowStartedAt) {
        this.perfWindowStartedAt = nowPerf;
      }
      return;
    }

    if (rawDtMs <= 0 || !Number.isFinite(rawDtMs)) return;

    if (!this.perfWindowStartedAt) {
      this.perfWindowStartedAt = nowPerf - rawDtMs;
    }

    this.perfFrames.push(rawDtMs);
    this.perfActiveMs += rawDtMs;

    if (this.perfActiveMs >= 30000 && this.perfFrames.length >= 30) {
      const frames = this.perfFrames;
      const sorted = frames.slice().sort((a, b) => a - b);
      const frameCount = frames.length;
      const activeMs = Math.round(this.perfActiveMs);
      const windowMs = Math.max(activeMs, Math.round(nowPerf - this.perfWindowStartedAt));
      const fpsAvg = activeMs > 0 ? Math.round(((frameCount * 1000) / activeMs) * 10) / 10 : 0;

      // 10th percentile of FPS corresponds to 90th percentile of frame_time_ms
      const p90FrameMs = percentileSorted(sorted, 0.9);
      const fpsP10 = p90FrameMs > 0 ? Math.round((1000 / p90FrameMs) * 10) / 10 : 0;

      let over50 = 0;
      let over100 = 0;
      let over250 = 0;
      let over500 = 0;
      let over1000 = 0;
      for (let i = 0; i < frameCount; i++) {
        const dt = frames[i];
        if (dt > 50) over50 += 1;
        if (dt > 100) over100 += 1;
        if (dt > 250) over250 += 1;
        if (dt > 500) over500 += 1;
        if (dt > 1000) over1000 += 1;
      }

      this.emitPerformanceSample({
        target_fps: 60,
        window_ms: windowMs,
        active_ms: activeMs,
        frame_count: frameCount,
        fps_avg: fpsAvg,
        fps_p10: fpsP10,
        frame_time_p50_ms: percentileSorted(sorted, 0.5),
        frame_time_p95_ms: percentileSorted(sorted, 0.95),
        frame_time_p99_ms: percentileSorted(sorted, 0.99),
        frame_time_max_ms: Math.round(sorted[sorted.length - 1] * 100) / 100,
        frames_over_50ms: over50,
        frames_over_100ms: over100,
        frames_over_250ms: over250,
        frames_over_500ms: over500,
        frames_over_1000ms: over1000,
        game_version: GAME_VERSION,
        js_error_count: this.perfJsErrors,
        unhandled_rejection_count: this.perfUnhandledRejections
      });

      this.perfWindowStartedAt = nowPerf;
      this.perfActiveMs = 0;
      this.perfFrames = [];
      this.perfJsErrors = 0;
      this.perfUnhandledRejections = 0;
    }
  }

  showStickyBanner() {
    // Disabled during full-screen workbench gameplay per rule 2.3.2 (never cover controls)
  }

  isRewardedSupported() {
    if (this.ysdk) return Boolean(this.ysdk.adv?.showRewardedVideo);
    if (this.cgsdk) return Boolean(this.cgsdk.ad?.requestAd);
    if (this.vkb) return true;
    if (!this.bridge) return true;
    return Boolean(this.bridge.advertisement?.isRewardedSupported);
  }

  getLeaderboardType() {
    if (this.ysdk || this.cgsdk || this.vkb) return 'in_game';
    if (!this.bridge) return 'in_game';
    const t = this.bridge.leaderboards?.type;
    return t === 'native_popup' ? 'native_popup' : 'in_game';
  }

  getPlayerDisplayName() {
    const fallback = this.i18n.t('lbYou');
    if (this.ysdk) {
      return cleanPlayerName(this.yaPlayer?.getName?.(), fallback);
    }
    if (this.vkb && this.vkPlayerName) {
      return cleanPlayerName(this.vkPlayerName, fallback);
    }
    if (this.bridge?.player?.name) {
      return cleanPlayerName(this.bridge.player.name, fallback);
    }
    return fallback;
  }

  isAuthSupported() {
    if (this.ysdk) return Boolean(this.ysdk.auth?.openAuthDialog);
    if (!this.bridge) return false;
    return Boolean(this.bridge.player?.isAuthorizationSupported);
  }

  isPlayerAuthorized() {
    if (this.ysdk) {
      if (!this.yaPlayer) return false;
      if (typeof this.yaPlayer.isAuthorized === 'function') {
        return Boolean(this.yaPlayer.isAuthorized());
      }
      return this.yaPlayer.getMode?.() !== 'lite';
    }
    if (!this.bridge) return false;
    return Boolean(this.bridge.player?.isAuthorized);
  }

  async promptAuth() {
    if (this.ysdk) {
      if (!this.isAuthSupported()) return false;
      try {
        await this.ysdk.auth.openAuthDialog();
        this.yaPlayer = await this.ysdk.getPlayer({ scopes: false });
        await this.flushSaveImmediate();
        return this.isPlayerAuthorized();
      } catch {
        return false;
      }
    }
    if (!this.bridge || !this.isAuthSupported()) return false;
    try {
      await this.bridge.player.authorize();
      await this.flushSaveImmediate();
      return this.isPlayerAuthorized();
    } catch {
      return false;
    }
  }

  async loadState(defaultState) {
    if (this.ysdk) {
      let cloudObj = null;
      let safeObj = null;
      if (this.yaPlayer?.getData) {
        try {
          const data = await this.yaPlayer.getData([SAVE_KEY]);
          const raw = data?.[SAVE_KEY];
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (parsed && typeof parsed === 'object') cloudObj = parsed;
        } catch {
          // Ignore cloud read error
        }
      }
      if (this.yaSafeStorage?.getItem) {
        try {
          const raw = this.yaSafeStorage.getItem(SAVE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') safeObj = parsed;
          }
        } catch {
          // Ignore safeStorage read error
        }
      }
      const cloudScore = (Number(cloudObj?.completedCount) || 0) * 1000000 + (Number(cloudObj?.totalEarned) || 0);
      const safeScore = (Number(safeObj?.completedCount) || 0) * 1000000 + (Number(safeObj?.totalEarned) || 0);
      const chosen = cloudScore >= safeScore ? (cloudObj || safeObj) : safeObj;
      if (chosen) {
        return { ...defaultState, ...chosen };
      }
      return this.memoryFallbackState ? { ...defaultState, ...this.memoryFallbackState } : { ...defaultState };
    }

    if (this.cgsdk?.data?.getItem) {
      try {
        const raw = this.cgsdk.data.getItem(SAVE_KEY);
        if (raw) {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (parsed && typeof parsed === 'object') {
            return { ...defaultState, ...parsed };
          }
        }
      } catch {}
      return this.memoryFallbackState ? { ...defaultState, ...this.memoryFallbackState } : { ...defaultState };
    }

    if (this.vkb?.send) {
      try {
        const res = await this.vkb.send('VKWebAppStorageGet', { keys: [SAVE_KEY] });
        const raw = res?.keys?.[0]?.value;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            return { ...defaultState, ...parsed };
          }
        }
      } catch {}
      return this.memoryFallbackState ? { ...defaultState, ...this.memoryFallbackState } : { ...defaultState };
    }

    if (!this.bridge?.storage?.get) {
      return this.memoryFallbackState ? { ...defaultState, ...this.memoryFallbackState } : { ...defaultState };
    }
    try {
      const data = await this.bridge.storage.get([SAVE_KEY]);
      const raw = Array.isArray(data) ? data[0] : data;
      if (!raw) return { ...defaultState };
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') {
        return { ...defaultState, ...parsed };
      }
    } catch {
      // Safe fallback to defaults
    }
    return { ...defaultState };
  }

  saveState(state, immediate = false) {
    this.pendingState = state;
    this.memoryFallbackState = state;
    clearTimeout(this.saveDebounceTimer);
    if (immediate) {
      this.flushSaveImmediate();
    } else {
      this.saveDebounceTimer = setTimeout(() => {
        this.flushSaveImmediate();
      }, 220);
    }
  }

  async flushSaveImmediate() {
    if (!this.pendingState) return;
    const snapshot = this.pendingState;
    if (this.ysdk) {
      const serialized = JSON.stringify(snapshot);
      try {
        this.yaSafeStorage?.setItem?.(SAVE_KEY, serialized);
      } catch {
        // Safe storage unavailable
      }
      if (this.yaPlayer?.setData) {
        try {
          await this.yaPlayer.setData({ [SAVE_KEY]: snapshot }, true);
        } catch {
          // Cloud save unavailable for guest or offline
        }
      }
      return;
    }
    if (this.cgsdk?.data?.setItem) {
      try {
        this.cgsdk.data.setItem(SAVE_KEY, JSON.stringify(snapshot));
      } catch {}
      return;
    }
    if (this.vkb?.send) {
      try {
        await this.vkb.send('VKWebAppStorageSet', {
          key: SAVE_KEY,
          value: JSON.stringify(snapshot)
        });
      } catch {}
      return;
    }
    if (!this.bridge?.storage?.set) return;
    try {
      await this.bridge.storage.set([SAVE_KEY], [JSON.stringify(snapshot)]);
    } catch {
      // Platform storage unavailable or rejected
    }
  }

  async getYaLeaderboards() {
    if (!this.ysdk) return null;
    if (this.ysdk.leaderboards) return this.ysdk.leaderboards;
    if (typeof this.ysdk.getLeaderboards === 'function') {
      try {
        return await this.ysdk.getLeaderboards();
      } catch {
        return null;
      }
    }
    return null;
  }

  async submitLeaderboardScore(totalEarned) {
    const score = Math.max(0, Math.floor(totalEarned));
    if (this.ysdk) {
      if (!this.isPlayerAuthorized()) return;
      try {
        if (typeof this.ysdk.isAvailableMethod === 'function') {
          const allowed = await this.ysdk.isAvailableMethod('leaderboards.setLeaderboardScore');
          if (!allowed) return;
        }
        const lb = await this.getYaLeaderboards();
        await lb?.setLeaderboardScore?.(YA_LEADERBOARD_ID, score);
      } catch {
        // Ignore leaderboard rate-limit or unavailable errors
      }
      return;
    }

    const lbType = this.getLeaderboardType();
    if (lbType === 'not_available' || !this.bridge?.leaderboards?.setScore) return;
    try {
      await this.bridge.leaderboards.setScore(LEADERBOARD_ID, score);
    } catch {
      // Ignore guest/unsupported errors
    }
  }

  async getLeaderboardEntries(userScore) {
    if (this.ysdk) {
      try {
        const lb = await this.getYaLeaderboards();
        if (lb?.getLeaderboardEntries) {
          const isAuth = this.isPlayerAuthorized();
          const res = await lb.getLeaderboardEntries(YA_LEADERBOARD_ID, {
            quantityTop: 10,
            includeUser: isAuth,
            quantityAround: 3
          });
          if (Array.isArray(res?.entries) && res.entries.length > 0) {
            const myUid = this.yaPlayer?.getUniqueID?.();
            return res.entries.slice(0, 10).map((e, idx) => ({
              rank: e.rank || idx + 1,
              name: cleanPlayerName(e.player?.publicName, this.i18n.t('lbYou')),
              score: Number(e.score) || 0,
              isMe: Boolean(myUid && e.player?.uniqueID === myUid)
            }));
          }
        }
      } catch {
        // Fallback row below when leaderboard is not yet created or empty
      }
      return [
        {
          rank: 1,
          name: this.getPlayerDisplayName(),
          score: Math.max(0, Math.floor(userScore)),
          isMe: true
        }
      ];
    }

    const lbType = this.getLeaderboardType();
    if (lbType !== 'in_game' || !this.bridge?.leaderboards?.getEntries) {
      return [];
    }
    try {
      const entries = await this.bridge.leaderboards.getEntries(LEADERBOARD_ID);
      if (Array.isArray(entries) && entries.length > 0) {
        const myId = this.bridge.player?.id;
        return entries.slice(0, 10).map((e, idx) => ({
          rank: e.rank || idx + 1,
          name: cleanPlayerName(e.name, this.i18n.t('lbYou')),
          score: Number(e.score) || 0,
          isMe: Boolean(myId && e.id && String(e.id) === String(myId))
        }));
      }
    } catch {
      // Empty state handled by caller
    }
    return [
      {
        rank: 1,
        name: this.getPlayerDisplayName(),
        score: Math.max(0, Math.floor(userScore)),
        isMe: true
      }
    ];
  }

  async showNativeLeaderboardPopup() {
    if (this.getLeaderboardType() !== 'native_popup' || !this.bridge?.leaderboards?.showNativePopup) {
      return false;
    }
    try {
      await this.bridge.leaderboards.showNativePopup(LEADERBOARD_ID);
      return true;
    } catch {
      return false;
    }
  }

  showInterstitialIfReady() {
    this.interstitialOrderCounter += 1;
    if (this.interstitialOrderCounter < 3 || this.interstitialOrderCounter % 2 !== 1) {
      return Promise.resolve(false);
    }
    if (this.ysdk) {
      if (!this.ysdk.adv?.showFullscreenAdv || this.interstitialResolver) {
        return Promise.resolve(false);
      }
      return new Promise((resolve) => {
        let settled = false;
        const finish = (val) => {
          if (settled) return;
          settled = true;
          clearTimeout(maxTimer);
          this.perfSkipNextFrame = true;
          this.audio.setAdOpen(false);
          this.syncYaGameplayState();
          if (this.interstitialResolver === finish) {
            this.interstitialResolver = null;
          }
          resolve(val);
        };
        const maxTimer = setTimeout(() => finish(false), 60000);
        this.interstitialResolver = finish;
        try {
          this.ysdk.adv.showFullscreenAdv({
            callbacks: {
              onOpen: () => {
                this.perfSkipNextFrame = true;
                this.audio.setAdOpen(true);
                this.syncYaGameplayState();
              },
              onClose: (wasShown) => finish(Boolean(wasShown)),
              onError: () => finish(false),
              onOffline: () => finish(false)
            }
          });
        } catch {
          finish(false);
        }
      });
    }

    if (this.cgsdk?.ad?.requestAd) {
      if (this.interstitialResolver || this.cgNoFillDetected) return Promise.resolve(false);
      return new Promise((resolve) => {
        let settled = false;
        let started = false;
        const finish = (val) => {
          if (settled) return;
          settled = true;
          clearTimeout(openTimer);
          clearTimeout(maxTimer);
          this.perfSkipNextFrame = true;
          this.audio.setAdOpen(false);
          this.syncCgGameplayState();
          if (this.interstitialResolver === finish) {
            this.interstitialResolver = null;
          }
          resolve(val);
        };
        const openTimer = setTimeout(() => {
          if (!started) finish(false);
        }, 4000);
        const maxTimer = setTimeout(() => finish(false), 60000);
        this.interstitialResolver = finish;
        try {
          this.cgsdk.ad.requestAd('midgame', {
            adStarted: () => {
              started = true;
              this.cgNoFillDetected = false;
              this.perfSkipNextFrame = true;
              this.audio.setAdOpen(true);
              this.syncCgGameplayState();
            },
            adFinished: () => finish(true),
            adError: () => {
              if (!started) this.cgNoFillDetected = true;
              finish(false);
            }
          });
        } catch {
          finish(false);
        }
      });
    }

    if (this.vkb?.send) {
      if (this.interstitialResolver) return Promise.resolve(false);
      this.interstitialResolver = () => {};
      this.perfSkipNextFrame = true;
      this.audio.setAdOpen(true);
      return this.vkb
        .send('VKWebAppShowNativeAds', { ad_format: 'interstitial' })
        .then((res) => Boolean(res?.result))
        .catch(() => false)
        .finally(() => {
          this.perfSkipNextFrame = true;
          this.audio.setAdOpen(false);
          this.interstitialResolver = null;
          this.vkb.send('VKWebAppCheckNativeAds', { ad_format: 'interstitial' }).catch(() => {});
        });
    }

    if (!this.bridge?.advertisement?.isInterstitialSupported) {
      return Promise.resolve(false);
    }
    if (this.interstitialResolver) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = (val) => {
        if (settled) return;
        settled = true;
        clearTimeout(openTimer);
        clearTimeout(maxTimer);
        if (this.interstitialResolver === finish) {
          this.interstitialResolver = null;
        }
        resolve(val);
      };

      const openTimer = setTimeout(() => {
        const st = this.bridge?.advertisement?.interstitialState;
        if (st !== 'opened' && st !== 'loading') {
          finish(false);
        }
      }, 3500);
      const maxTimer = setTimeout(() => finish(false), 60000);
      this.interstitialResolver = finish;

      try {
        this.bridge.advertisement.showInterstitial('level_completed');
      } catch {
        finish(false);
      }
    });
  }

  showRewarded(placement = 'x2_sell') {
    if (this.ysdk) {
      if (!this.ysdk.adv?.showRewardedVideo || this.rewardedContext) {
        return Promise.resolve({ rewarded: false, placement });
      }
      return new Promise((resolve) => {
        let settled = false;
        let gotReward = false;
        const finish = (res) => {
          if (settled) return;
          settled = true;
          clearTimeout(safetyTimer);
          this.perfSkipNextFrame = true;
          this.audio.setAdOpen(false);
          this.syncYaGameplayState();
          if (this.rewardedContext?.resolve === finish) {
            this.rewardedContext = null;
          }
          resolve(res);
        };
        const safetyTimer = setTimeout(() => finish({ rewarded: false, placement }), 90000);
        this.rewardedContext = { placement, rewarded: false, resolve: finish };
        try {
          this.ysdk.adv.showRewardedVideo({
            callbacks: {
              onOpen: () => {
                this.perfSkipNextFrame = true;
                this.audio.setAdOpen(true);
                this.syncYaGameplayState();
              },
              onRewarded: () => {
                gotReward = true;
              },
              onClose: () => finish({ rewarded: gotReward, placement }),
              onError: () => finish({ rewarded: false, placement })
            }
          });
        } catch {
          finish({ rewarded: false, placement });
        }
      });
    }

    if (this.cgsdk?.ad?.requestAd) {
      if (this.rewardedContext) return Promise.resolve({ rewarded: false, placement, noFill: false });
      return new Promise((resolve) => {
        let settled = false;
        let wasStarted = false;
        const finish = (res) => {
          if (settled) return;
          settled = true;
          clearTimeout(safetyTimer);
          this.perfSkipNextFrame = true;
          this.audio.setAdOpen(false);
          this.syncCgGameplayState();
          if (this.rewardedContext?.resolve === finish) {
            this.rewardedContext = null;
          }
          resolve(res);
        };
        const safetyTimer = setTimeout(() => finish({ rewarded: false, placement, noFill: false }), 90000);
        this.rewardedContext = { placement, rewarded: false, resolve: finish };
        try {
          this.cgsdk.ad.requestAd('rewarded', {
            adStarted: () => {
              wasStarted = true;
              this.cgNoFillDetected = false;
              this.perfSkipNextFrame = true;
              this.audio.setAdOpen(true);
              this.syncCgGameplayState();
            },
            adFinished: () => finish({ rewarded: true, placement, noFill: false }),
            adError: () => {
              const noFill = !wasStarted;
              if (noFill) this.cgNoFillDetected = true;
              finish({ rewarded: false, placement, noFill });
            }
          });
        } catch {
          finish({ rewarded: false, placement, noFill: true });
        }
      });
    }

    if (this.vkb?.send) {
      if (this.rewardedContext) return Promise.resolve({ rewarded: false, placement });
      this.rewardedContext = { placement, rewarded: false, resolve: () => {} };
      this.perfSkipNextFrame = true;
      this.audio.setAdOpen(true);
      return this.vkb
        .send('VKWebAppShowNativeAds', { ad_format: 'reward' })
        .then((res) => ({ rewarded: Boolean(res?.result), placement }))
        .catch(() => ({ rewarded: false, placement }))
        .finally(() => {
          this.perfSkipNextFrame = true;
          this.audio.setAdOpen(false);
          this.rewardedContext = null;
          this.vkb.send('VKWebAppCheckNativeAds', { ad_format: 'reward' }).catch(() => {});
        });
    }

    if (!this.bridge) {
      return this.showOfflineMockRewarded(placement);
    }
    if (!this.isRewardedSupported() || this.rewardedContext) {
      return Promise.resolve({ rewarded: false, placement });
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = (res) => {
        if (settled) return;
        settled = true;
        clearTimeout(safetyTimer);
        if (this.rewardedContext?.resolve === finish) {
          this.rewardedContext = null;
        }
        resolve(res);
      };

      // Allow up to 90s for watching full rewarded video
      const safetyTimer = setTimeout(() => finish({ rewarded: false, placement }), 90000);
      this.rewardedContext = {
        placement,
        rewarded: false,
        resolve: finish
      };

      try {
        this.bridge.advertisement.showRewarded(placement);
      } catch {
        finish({ rewarded: false, placement });
      }
    });
  }

  showOfflineMockRewarded(placement) {
    return new Promise((resolve) => {
      this.audio.setAdOpen(true);
      const overlay = document.createElement('div');
      overlay.className = 'mock-ad-overlay';
      let sec = 2;
      const box = document.createElement('div');
      box.className = 'mock-ad-box';

      const titleEl = document.createElement('h3');
      titleEl.style.margin = '0 0 8px';
      titleEl.textContent = this.i18n.t('mockAdTitle');

      const descEl = document.createElement('p');
      descEl.style.margin = '0';
      descEl.style.color = '#cbd5e1';
      descEl.textContent = this.i18n.t('mockAdReward', { sec });

      box.append(titleEl, descEl);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      const timer = setInterval(() => {
        sec -= 1;
        if (sec <= 0) {
          clearInterval(timer);
          overlay.remove();
          this.audio.setAdOpen(false);
          resolve({ rewarded: true, placement });
        } else {
          descEl.textContent = this.i18n.t('mockAdReward', { sec });
        }
      }, 1000);
    });
  }
}
