import { I18n, normalizeLang } from './i18n.js';
import { AudioEngine } from './audio.js';
import { PlatformBridge } from './yandex-sdk.js';
import { iconSvg, getStepIconName } from './icons.js';
import {
  ITEMS_CATALOG,
  UPGRADE_DEFS,
  DAILY_REWARDS,
  getDailyRewardAmount,
  getUpgradeCost,
  getBrushRadius,
  getBrushStrength,
  getOrderSpec,
  computeOrderPayout,
  getScavengerChestReward,
  generateMarketChoices
} from './items-data.js';
import { buildOrderPartBundles, renderCompositeSnapshot, getItemThumbDataUrl, loadWorkshopAssets } from './items-renderer.js';
import { WorkshopCanvas } from './workshop-canvas.js';
import { TOOLS_META } from './tools-meta.js';

const DEFAULT_STATE = {
  coins: 0,
  totalEarned: 0,
  orderIndex: 0,
  completedCount: 0,
  activeLot: null,
  savedOrderProgress: null,
  rackTutorialDone: false,
  upgrades: {
    brushSize: 1,
    brushPower: 1,
    appraisal: 1
  },
  collectionRecords: {},
  daily: {
    streak: 0,
    lastClaimDate: ''
  },
  muted: false
};

const $ = (id) => document.getElementById(id);

function getTodayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatCoinAmount(value) {
  const n = Math.floor(Math.max(0, Number(value) || 0));
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    const dec = n >= 10_000_000 ? 1 : 2;
    return `${m.toFixed(dec).replace(/\.?0+$/, '')}M`;
  }
  if (n >= 100_000) {
    const k = n / 1_000;
    return `${k.toFixed(1).replace(/\.0$/, '')}K`;
  }
  return String(n);
}

class GameApp {
  constructor() {
    this.i18n = new I18n('en');
    this.audio = new AudioEngine();
    this.platform = new PlatformBridge({ audio: this.audio, i18n: this.i18n });

    this.state = { ...DEFAULT_STATE };
    this.currentOrder = null;
    this.currentStepIndex = 0;
    this.currentPaintMap = {};
    this.selectedPaintIdx = 0;
    this.assemblyPhase = 'drag';
    this.currentPendingSale = null;

    this.turboRemainingSec = 0;
    this.chestCooldownSec = 0;
    this.dailyPromptedThisSession = false;

    this.displayedCoins = 0;
    this.coinAnimFrame = 0;
    this.lastMedallionToolKey = null;
    this.marketChoices = [];
    this.selectedPaintIdx = 0;
    this.pendingDailyAfterMarket = false;
    this.lastFocusedRackTool = null;
    this.orderStartedAtMs = performance.now();
    this.rackDragSuppressClickUntil = 0;

    this.workshop = null;
  }

  getPriorityAssetsForOrder(orderSpec) {
    const tools = new Set();
    const fx = new Set();
    for (const s of orderSpec?.item?.steps || []) {
      const tk = s.type === 'assemble' ? 'tool_screwdriver' : this.getStepToolSpriteKey(s);
      if (tk) tools.add(tk);
      if (s.type === 'foam') fx.add('fx_foam_jet');
      else if (s.type === 'rinse') fx.add('fx_water_jet');
      else if (s.type === 'sandblast') fx.add('fx_sand_jet');
      else if (s.type === 'paint') fx.add('fx_paint_jet');
      else if (s.type === 'precision') {
        if (s.kind === 'solder') fx.add('fx_solder_spark');
        else if (s.kind === 'contacts') fx.add('fx_water_jet');
        else fx.add('fx_oil_drop');
      }
    }
    return { tools: [...tools], fx: [...fx] };
  }

  async start() {
    this.bindGlobalGuards();
    this.mountStaticIcons();
    await this.platform.init();

    const loaded = await this.platform.loadState(DEFAULT_STATE);
    this.state = {
      ...DEFAULT_STATE,
      ...loaded,
      upgrades: { ...DEFAULT_STATE.upgrades, ...(loaded.upgrades || {}) },
      collectionRecords: { ...(loaded.collectionRecords || {}) },
      daily: { ...DEFAULT_STATE.daily, ...(loaded.daily || {}) }
    };
    this.displayedCoins = this.state.coins;

    delete this.state.lang;
    const chosenLang = this.platform.detectInitialLang();
    this.i18n.setLang(normalizeLang(chosenLang));

    this.audio.setUserMuted(Boolean(this.state.muted));

    this.workshop = new WorkshopCanvas($('workshop-canvas'), {
      audio: this.audio,
      onProgress: (pct, stepIdx) => this.handleProgress(pct, stepIdx),
      onStageComplete: (nextStepIdx) => this.handleStageComplete(nextStepIdx),
      onItemComplete: (snapshots) => this.handleItemComplete(snapshots),
      onFirstTouch: () => $('gesture-hint').classList.add('hidden'),
      onHintReady: (ready) => $('btn-hint-spot').classList.toggle('hidden', !ready),
      onAssemblyPhase: (phase) => {
        this.assemblyPhase = phase;
        this.renderWorkbenchRack();
        this.refreshOperationBar(this.currentStepIndex);
      },
      onNeedToolPick: (reqKey, wrongKey) => this.handleNeedToolPick(reqKey, wrongKey),
      onReadyForTest: () => this.handleReadyForTest(),
      onMakerMarkReveal: () => this.handleMakerMarkReveal(),
      onToolStateChange: () => {
        this.renderWorkbenchRack();
        this.refreshOperationBar(this.currentStepIndex);
      },
      onFrameSample: (rawDtMs, nowPerf) => {
        this.platform.recordGameplayFrame(rawDtMs, nowPerf);
      }
    });

    this.bindUiEvents();
    this.bindToolRackScrolling();
    this.applyTranslations();

    const firstOrderSpec = getOrderSpec(this.state.orderIndex, this.state.activeLot);
    const prio = this.getPriorityAssetsForOrder(firstOrderSpec);
    const [workshopAssets] = await Promise.all([
      loadWorkshopAssets(prio.tools, prio.fx),
      buildOrderPartBundles(firstOrderSpec)
    ]);
    this.workshop.setAssets(workshopAssets);
    await this.loadCurrentOrder();
    this.refreshAllUi();
    this.startTimers();

    requestAnimationFrame(() => {
      this.platform.signalLoadingReady();
      this.platform.showStickyBanner();
      this.platform.setGameplayActive(!document.hidden);
      setTimeout(() => {
        this.audio.preloadAll(['loop_dig', 'loop_foam', 'loop_water', 'loop_polish', 'sfx_bubble', 'sfx_oil_drop']);
      }, 900);
    });
  }

  mountStaticIcons() {
    $('coins-icon-slot').innerHTML = iconSvg('coin');
    $('est-coin-slot').innerHTML = iconSvg('coin');
    $('icon-daily-slot').innerHTML = iconSvg('calendar');
    $('icon-collection-slot').innerHTML = iconSvg('museum');
    $('icon-hint-slot').innerHTML = iconSvg('loupe');
    $('turbo-banner-icon').innerHTML = iconSvg('bolt');
    $('icon-equip-slot').innerHTML = iconSvg('wrench');
    $('icon-bolt-belt-slot').innerHTML = iconSvg('bolt');
    $('icon-turbo-slot').innerHTML = iconSvg('bolt');
    $('icon-chest-slot').innerHTML = iconSvg('boxSupply');
    $('icon-upg-size').innerHTML = iconSvg('rulerSize');
    $('icon-upg-power').innerHTML = iconSvg('gaugePower');
    $('icon-upg-appraisal').innerHTML = iconSvg('scaleAppraisal');
    $('act-stamp-slot').innerHTML = iconSvg('sealCheck');
    $('sell-x2-play-slot').innerHTML = iconSvg('playAd');
    $('icon-test-slot').innerHTML = iconSvg('sparklePlay');
    $('market-ad-icon').innerHTML = iconSvg('playAd');
    const langIconSlot = $('icon-lang-slot');
    if (langIconSlot) langIconSlot.innerHTML = iconSvg('globe');

    document.querySelectorAll('.ad-play-slot').forEach((el) => {
      el.innerHTML = iconSvg('playAd');
    });
    document.querySelectorAll('.coin-mini-slot').forEach((el) => {
      el.innerHTML = iconSvg('coin');
    });
  }

  bindGlobalGuards() {
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('dragstart', (e) => e.preventDefault());
    document.addEventListener('selectstart', (e) => e.preventDefault());

    for (const evt of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(evt, (e) => e.preventDefault(), { passive: false });
    }

    document.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches && e.touches.length > 1) {
          e.preventDefault();
          return;
        }
        const scrollable = e.target?.closest?.(
          '.workbench-tool-rack, .modal-scroll-pane, .controls-drawer, .paper-act-card'
        );
        if (!scrollable) {
          e.preventDefault();
        }
      },
      { passive: false }
    );

    document.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey) {
          e.preventDefault();
        }
      },
      { passive: false }
    );

    document.addEventListener('visibilitychange', () => {
      const hidden = Boolean(document.hidden);
      this.audio.setPageHidden(hidden);
      this.platform.setGameplayActive(!hidden && !this.hasOpenModal());
    });

    window.addEventListener('blur', () => {
      this.audio.setPageHidden(true);
      this.platform.setGameplayActive(false);
    });

    window.addEventListener('focus', () => {
      if (!document.hidden) {
        this.audio.setPageHidden(false);
        this.platform.setGameplayActive(!this.hasOpenModal());
      }
    });
  }

  hasOpenModal() {
    return (
      !$('modal-complete').classList.contains('hidden') ||
      !$('modal-collection').classList.contains('hidden') ||
      !$('modal-daily').classList.contains('hidden') ||
      !$('modal-market').classList.contains('hidden')
    );
  }

  bindUiEvents() {
    $('btn-sound').addEventListener('click', () => {
      this.audio.unlock();
      const muted = this.audio.setUserMuted(!this.audio.userMuted);
      this.state.muted = muted;
      this.save(true);
      this.refreshSoundBtn();
      if (!muted) this.audio.playClick();
    });

    $('btn-lang').addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playClick();
      this.i18n.nextLang();
      this.applyTranslations();
      this.refreshAllUi();
    });

    $('btn-hint-spot').addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playClick();
      this.workshop.triggerSpotHint();
    });

    // Mobile equipment drawer
    $('btn-drawer-equip').addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playClick();
      this.setDrawerOpen(true);
    });
    $('btn-close-drawer').addEventListener('click', () => this.setDrawerOpen(false));
    $('drawer-backdrop').addEventListener('click', () => this.setDrawerOpen(false));

    // Boosters
    $('btn-turbo').addEventListener('click', () => this.activateTurboAd());
    $('btn-turbo-belt').addEventListener('click', () => this.activateTurboAd());
    $('btn-chest').addEventListener('click', () => this.openChestAd());

    // Upgrades
    for (const key of ['brushSize', 'brushPower', 'appraisal']) {
      $(`upg-${key}`).addEventListener('click', () => this.buyUpgrade(key));
    }

    // Complete & Market modals
    $('btn-sell-normal').addEventListener('click', () => this.sellItem(1));
    $('btn-sell-x2').addEventListener('click', () => this.sellItemX2Ad());
    $('btn-test-item').addEventListener('click', () => this.triggerFunctionalTest(true));
    $('btn-market-ad').addEventListener('click', () => this.earnMarketAd());
    $('btn-close-market')?.addEventListener('click', () => {
      const freeLot = this.marketChoices?.find((l) => l.cost <= 0) || this.marketChoices?.[0];
      if (freeLot) {
        this.chooseMarketLot(freeLot);
      } else {
        this.closeModal('modal-market');
      }
    });
    this.bindBaCompareSlider();

    // Archive modal
    $('btn-collection').addEventListener('click', () => this.openCollectionModal());
    $('btn-close-collection').addEventListener('click', () => this.closeModal('modal-collection'));
    $('tab-museum').addEventListener('click', () => this.switchCollectionTab('museum'));
    $('tab-leaderboard').addEventListener('click', () => this.switchCollectionTab('leaderboard'));
    $('btn-lb-auth').addEventListener('click', () => this.handleLeaderboardAuth());

    // Daily modal
    $('btn-daily').addEventListener('click', () => this.openDailyModal());
    $('btn-close-daily').addEventListener('click', () => this.closeModal('modal-daily'));
    $('btn-claim-daily').addEventListener('click', () => this.claimDailyReward());

    // Desktop hotkeys 1-9 for selecting tools on the rack
    window.addEventListener('keydown', (e) => {
      if (this.hasOpenModal() || e.repeat) return;
      if (e.key >= '1' && e.key <= '9') {
        const rack = $('workbench-tool-rack');
        if (!rack || rack.classList.contains('hidden')) return;
        const buttons = rack.querySelectorAll('.rack-tool-btn');
        const idx = Number(e.key) - 1;
        if (buttons[idx]) {
          this.audio.unlock();
          buttons[idx].click();
        }
      }
    });
  }

  bindToolRackScrolling() {
    const rack = $('workbench-tool-rack');
    if (!rack) return;

    rack.addEventListener(
      'wheel',
      (e) => {
        if (rack.scrollWidth <= rack.clientWidth) return;
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          rack.scrollLeft += e.deltaY;
        }
      },
      { passive: false }
    );

    let mouseDown = false;
    let dragged = false;
    let startX = 0;
    let startScrollLeft = 0;

    rack.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (rack.scrollWidth <= rack.clientWidth) return;
      mouseDown = true;
      dragged = false;
      startX = e.clientX;
      startScrollLeft = rack.scrollLeft;
    });

    window.addEventListener('pointermove', (e) => {
      if (!mouseDown || e.pointerType !== 'mouse') return;
      const dx = e.clientX - startX;
      if (!dragged && Math.abs(dx) > 6) {
        dragged = true;
      }
      if (dragged) {
        rack.scrollLeft = startScrollLeft - dx;
      }
    });

    const endMouseDrag = (e) => {
      if (!mouseDown || (e && e.pointerType && e.pointerType !== 'mouse')) return;
      if (dragged) {
        this.rackDragSuppressClickUntil = performance.now() + 180;
      }
      mouseDown = false;
      dragged = false;
    };

    window.addEventListener('pointerup', endMouseDrag);
    window.addEventListener('pointercancel', endMouseDrag);

    let touchActive = false;
    let touchNativeMoved = false;
    let touchManualDrag = false;
    let tStartX = 0;
    let tStartY = 0;
    let tStartScroll = 0;

    rack.addEventListener(
      'touchstart',
      (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        touchActive = true;
        touchNativeMoved = false;
        touchManualDrag = false;
        tStartX = e.touches[0].clientX;
        tStartY = e.touches[0].clientY;
        tStartScroll = rack.scrollLeft;
      },
      { passive: true }
    );

    rack.addEventListener(
      'touchmove',
      (e) => {
        if (!touchActive || !e.touches || e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - tStartX;
        const dy = e.touches[0].clientY - tStartY;
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 6) {
          e.preventDefault();
          return;
        }
        if (Math.abs(rack.scrollLeft - tStartScroll) > 1) {
          touchNativeMoved = true;
        }
        if (!touchNativeMoved && rack.scrollWidth > rack.clientWidth && Math.abs(dx) > 7) {
          touchManualDrag = true;
          rack.scrollLeft = tStartScroll - dx;
          e.preventDefault();
        }
      },
      { passive: false }
    );

    const endTouch = () => {
      if (touchManualDrag) {
        this.rackDragSuppressClickUntil = performance.now() + 200;
      }
      touchActive = false;
      touchManualDrag = false;
    };

    rack.addEventListener('touchend', endTouch, { passive: true });
    rack.addEventListener('touchcancel', endTouch, { passive: true });
  }

  scrollRackButtonIntoCenter(btn, smooth = true) {
    const rack = $('workbench-tool-rack');
    if (!rack || !btn || rack.scrollWidth <= rack.clientWidth) return;
    const targetLeft = Math.max(
      0,
      Math.min(
        rack.scrollWidth - rack.clientWidth,
        btn.offsetLeft - (rack.clientWidth - btn.offsetWidth) * 0.5
      )
    );
    try {
      rack.scrollTo({ left: targetLeft, behavior: smooth ? 'smooth' : 'auto' });
    } catch {
      rack.scrollLeft = targetLeft;
    }
  }

  setDrawerOpen(open) {
    $('equipment-drawer').classList.toggle('open', open);
    $('drawer-backdrop').classList.toggle('hidden', !open);
  }

  startTimers() {
    setInterval(() => {
      if (this.platform.isPaused || document.hidden) return;
      let dirty = false;
      if (this.turboRemainingSec > 0) {
        this.turboRemainingSec -= 1;
        dirty = true;
        if (this.turboRemainingSec === 0) {
          this.syncBrushTool();
        }
      }
      if (this.chestCooldownSec > 0) {
        this.chestCooldownSec -= 1;
        dirty = true;
      }
      if (dirty) {
        this.refreshBoostersUi();
      }
    }, 1000);
  }

  persistOrderProgress(awaitingTest = Boolean(this.workshop?.awaitingTest)) {
    if (!this.currentOrder) return;
    const stepIndex = awaitingTest
      ? this.currentOrder.item.steps.length
      : this.currentStepIndex;
    this.state.savedOrderProgress = {
      orderIndex: this.state.orderIndex,
      itemId: this.currentOrder.item.id,
      isReplay: Boolean(this.currentOrder.isReplay),
      lotKind: this.currentOrder.lotKind || 'client',
      stepIndex,
      awaitingTest: Boolean(awaitingTest),
      paintMap: { ...this.currentPaintMap }
    };
    this.save();
  }

  async loadCurrentOrder() {
    clearTimeout(this.autoTestTimer);
    $('test-item-wrap').classList.add('hidden');
    this.currentOrder = getOrderSpec(this.state.orderIndex, this.state.activeLot);
    this.orderStartedAtMs = performance.now();
    this.lastFocusedRackTool = null;
    this.finalStepTelemetrySent = false;
    const saved = this.state.savedOrderProgress;
    const isMatchingSave = Boolean(
      saved &&
      saved.orderIndex === this.state.orderIndex &&
      saved.itemId === this.currentOrder.item.id &&
      Boolean(saved.isReplay) === Boolean(this.currentOrder.isReplay)
    );

    let resumeState = null;
    if (isMatchingSave) {
      const totalSteps = this.currentOrder.item.steps.length;
      const clampedStep = saved.awaitingTest
        ? Math.max(0, totalSteps - 1)
        : Math.max(0, Math.min(totalSteps - 1, saved.stepIndex || 0));
      this.currentPaintMap = { ...(saved.paintMap || {}) };
      this.currentStepIndex = clampedStep;
      resumeState = {
        stepIndex: clampedStep,
        awaitingTest: Boolean(saved.awaitingTest),
        paintMap: this.currentPaintMap
      };
      if (saved.awaitingTest) {
        this.finalStepTelemetrySent = true;
      }
    } else {
      if (saved) {
        this.state.savedOrderProgress = null;
        this.save();
      }
      this.currentPaintMap = {};
      this.currentStepIndex = 0;
    }

    const activeStep = this.currentOrder.item.steps[this.currentStepIndex];
    this.selectedPaintIdx = (activeStep?.type === 'paint' && this.currentPaintMap[activeStep.partId] != null)
      ? this.currentPaintMap[activeStep.partId]
      : 0;
    this.assemblyPhase = 'drag';

    const bundles = await buildOrderPartBundles(this.currentOrder);
    const beforeDataUrl = renderCompositeSnapshot(this.currentOrder.item, bundles, 'dirty');
    const afterDataUrl = renderCompositeSnapshot(this.currentOrder.item, bundles, 'clean');

    this.workshop.loadOrder(this.currentOrder, bundles, beforeDataUrl, afterDataUrl, resumeState);
    this.syncBrushTool();

    $('gesture-hint').classList.toggle('hidden', this.state.completedCount > 0 || Boolean(resumeState));
    this.renderWorkbenchRack();
    this.refreshOrderHeader();
    this.refreshOperationBar(this.currentStepIndex);
    if (this.state.orderIndex > 0 && !resumeState) {
      this.audio.playPaperRustle();
    }

    const headerTag = $('item-header-card');
    if (headerTag) {
      headerTag.classList.remove('tag-swing');
      headerTag.offsetHeight;
      headerTag.classList.add('tag-swing');
    }

    this.platform.notifyLevelStarted(this.currentOrder.orderNumber);
  }

  syncBrushTool() {
    const turbo = this.turboRemainingSec > 0;
    const ordNum = this.currentOrder?.orderNumber || (this.state.orderIndex + 1);
    const radius = getBrushRadius(this.state.upgrades.brushSize, turbo, ordNum);
    const strength = getBrushStrength(this.state.upgrades.brushPower, turbo, ordNum);
    this.workshop.setToolStats({ radius, strength, turboActive: turbo });
  }

  handleProgress(pct, stepIdx) {
    const rounded = Math.min(100, Math.round(pct));
    $('stage-progress-fill').style.width = `${rounded}%`;
    $('stage-progress-text').textContent = `${rounded}%`;
    if (stepIdx !== this.currentStepIndex) {
      this.currentStepIndex = stepIdx;
      const step = this.currentOrder?.item?.steps?.[stepIdx];
      this.selectedPaintIdx = (step?.type === 'paint' && this.currentPaintMap[step.partId] != null)
        ? this.currentPaintMap[step.partId]
        : 0;
      this.refreshOperationBar(stepIdx);
    }
  }

  getStepToolTitle(step) {
    if (!step) return '';
    const toolKey = step.type === 'precision'
      ? `tool_precision_${step.kind || 'oil'}`
      : `tool_${step.type}`;
    return this.i18n.t(toolKey);
  }

  handleStageComplete(nextStepIdx) {
    const completedIdx = Math.max(0, nextStepIdx - 1);
    const completedStep = this.currentOrder?.item?.steps?.[completedIdx];
    if (this.currentOrder && completedStep) {
      this.platform.sendTelemetryEvent('step_completed', {
        item_id: this.currentOrder.item.id,
        order_number: this.currentOrder.orderNumber,
        step_index: completedIdx + 1,
        step_total: this.currentOrder.item.steps.length,
        step_type: completedStep.type === 'precision'
          ? `precision_${completedStep.kind || 'oil'}`
          : completedStep.type
      });
    }

    this.currentStepIndex = nextStepIdx;
    const nextStep = this.currentOrder?.item?.steps?.[nextStepIdx];
    this.selectedPaintIdx = (nextStep?.type === 'paint' && this.currentPaintMap[nextStep.partId] != null)
      ? this.currentPaintMap[nextStep.partId]
      : 0;
    this.persistOrderProgress(false);
    this.refreshOperationBar(nextStepIdx);

    const opBar = document.querySelector('.operation-bar');
    if (opBar) {
      opBar.classList.remove('step-shift');
      opBar.offsetHeight;
      opBar.classList.add('step-shift');
      clearTimeout(this.opBarTimer);
      this.opBarTimer = setTimeout(() => opBar.classList.remove('step-shift'), 450);
    }

    const nextTool = this.getStepToolTitle(nextStep);
    const toastMsg = nextTool
      ? `${this.i18n.t('stageDone')} · ${nextTool}`
      : this.i18n.t('stageDone');
    this.showStageToast(toastMsg);
  }

  showStageToast(msg) {
    const el = $('stage-toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = '';
    clearTimeout(this.stageToastTimer);
    this.stageToastTimer = setTimeout(() => {
      el.classList.add('hidden');
    }, 850);
  }

  handleItemComplete({ beforeDataUrl, afterDataUrl }) {
    $('test-item-wrap').classList.add('hidden');
    const payout = computeOrderPayout(this.currentOrder, this.state.upgrades.appraisal);
    this.currentPendingSale = {
      order: this.currentOrder,
      payout,
      beforeDataUrl,
      afterDataUrl
    };

    $('ba-before-img').src = beforeDataUrl;
    $('ba-after-img').src = afterDataUrl;
    const stage = $('ba-compare-stage');
    if (stage) {
      stage.style.setProperty('--ba-split', '78%');
      requestAnimationFrame(() => {
        setTimeout(() => {
          stage.style.setProperty('--ba-split', '50%');
        }, 120);
      });
    }

    $('complete-kicker').textContent = this.i18n.t('completeKicker', { num: this.currentOrder.orderNumber });
    $('complete-item-title').textContent = this.i18n.t(`item_${this.currentOrder.item.id}`);
    $('grade-value').textContent = this.currentOrder.isVipOrder ? 'S+ · VIP' : 'A+ · 100%';

    const hallmarkRow = $('hallmark-row');
    if (hallmarkRow) {
      if (this.currentOrder.markRevealed) {
        hallmarkRow.classList.remove('hidden');
        $('hallmark-value').textContent = this.i18n.t('hallmarkValue', { mult: this.currentOrder.markMult });
      } else {
        hallmarkRow.classList.add('hidden');
      }
    }

    $('reward-value').textContent = String(payout);
    $('sell-normal-amount').textContent = String(payout);
    $('sell-x2-amount').textContent = String(payout * 2);
    $('btn-sell-x2').classList.toggle('hidden', !this.platform.isRewardedSupported());

    const nextIdx = this.currentOrder.isReplay ? this.state.orderIndex : this.state.orderIndex + 1;
    const nextSpec = getOrderSpec(nextIdx);
    const nextEst = computeOrderPayout(nextSpec, this.state.upgrades.appraisal);
    const teaserEl = $('next-order-teaser');
    if (teaserEl && nextSpec?.item) {
      teaserEl.classList.remove('hidden');
      $('next-order-kicker').textContent = this.i18n.t('nextOnBenchKicker', {
        amount: formatCoinAmount(nextEst)
      });
      $('next-order-name').textContent = this.i18n.t(`item_${nextSpec.item.id}`);
      const nextThumb = $('next-order-thumb');
      if (nextThumb) {
        nextThumb.src = `assets/items/${nextSpec.item.basePartId}_clean.webp`;
      }
    }

    this.setDrawerOpen(false);
    this.audio.playPaperRustle();
    this.openModal('modal-complete');
  }

  handleNeedToolPick(reqKey, wrongKey = null) {
    const rack = $('workbench-tool-rack');
    if (rack && reqKey) {
      const targetBtn = rack.querySelector(`[data-tool="${reqKey}"]`);
      if (targetBtn) {
        targetBtn.classList.remove('pulse-needed');
        targetBtn.offsetWidth;
        targetBtn.classList.add('pulse-needed');
        this.scrollRackButtonIntoCenter(targetBtn, true);
      }
      if (wrongKey) {
        const wrongBtn = rack.querySelector(`[data-tool="${wrongKey}"]`);
        if (wrongBtn) {
          wrongBtn.classList.remove('wrong-shake');
          wrongBtn.offsetWidth;
          wrongBtn.classList.add('wrong-shake');
        }
      }
    }
    const step = this.currentOrder?.item?.steps?.[this.currentStepIndex];
    const toolTitle = this.getStepToolTitle(step);
    if (toolTitle) {
      this.showToast(this.i18n.t('wrongToolToast', { tool: toolTitle }));
    }
  }

  handleReadyForTest() {
    if (this.currentOrder && !this.finalStepTelemetrySent) {
      this.finalStepTelemetrySent = true;
      const steps = this.currentOrder.item.steps || [];
      const finalStep = steps[steps.length - 1];
      if (finalStep) {
        this.platform.sendTelemetryEvent('step_completed', {
          item_id: this.currentOrder.item.id,
          order_number: this.currentOrder.orderNumber,
          step_index: steps.length,
          step_total: steps.length,
          step_type: finalStep.type === 'precision'
            ? `precision_${finalStep.kind || 'oil'}`
            : finalStep.type
        });
      }
    }

    $('btn-hint-spot').classList.add('hidden');
    $('test-item-label').textContent = this.i18n.t('testItemBtn');
    $('test-item-wrap').classList.remove('hidden');
    $('step-hint-text').textContent = this.i18n.t('testItemBtn');
    this.persistOrderProgress(true);

    clearTimeout(this.autoTestTimer);
    const delayMs = (this.currentOrder?.orderNumber || 3) <= 2 ? 320 : 850;
    this.autoTestTimer = setTimeout(() => {
      if (this.workshop?.awaitingTest && !this.hasOpenModal()) {
        this.triggerFunctionalTest(false);
      }
    }, delayMs);
  }

  triggerFunctionalTest(fromUserClick = true) {
    clearTimeout(this.autoTestTimer);
    if (fromUserClick) {
      this.audio.unlock();
      this.audio.playClick();
    }
    $('test-item-wrap').classList.add('hidden');
    $('step-hint-text').textContent = this.i18n.t('testingInProgress');
    this.workshop.runFunctionalTest();
  }

  handleMakerMarkReveal() {
    this.audio.playHallmarkReveal();
    if (this.state.activeLot) {
      this.state.activeLot.markRevealed = true;
      this.save();
    }
    this.refreshOrderHeader();
    this.showToast(this.i18n.t('hallmarkFoundToast', { mult: this.currentOrder?.markMult || 1.9 }));
  }

  bindBaCompareSlider() {
    const stage = $('ba-compare-stage');
    if (!stage) return;
    let dragging = false;
    const setFromClientX = (clientX) => {
      const rect = stage.getBoundingClientRect();
      const ratio = ((clientX - rect.left) / Math.max(1, rect.width)) * 100;
      const pct = Math.max(6, Math.min(94, ratio));
      stage.style.setProperty('--ba-split', `${pct}%`);
    };
    stage.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragging = true;
      stage.setPointerCapture?.(e.pointerId);
      setFromClientX(e.clientX);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      e.preventDefault();
      setFromClientX(e.clientX);
    });
    const endDrag = () => {
      dragging = false;
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
  }

  async sellItemX2Ad() {
    if (!this.currentPendingSale) return;
    this.audio.unlock();
    this.audio.playClick();

    const btn = $('btn-sell-x2');
    btn.disabled = true;
    const { rewarded } = await this.platform.showRewarded('x2_sell');
    btn.disabled = false;

    if (rewarded) {
      await this.sellItem(2, true);
    } else {
      this.showToast(this.i18n.t('toastAdFail'));
    }
  }

  async sellItem(multiplier = 1, skipInterstitial = false) {
    if (!this.currentPendingSale) return;
    const { order, payout } = this.currentPendingSale;
    const finalCoins = payout * multiplier;
    this.currentPendingSale = null;

    const sellBtn = $(multiplier > 1 ? 'btn-sell-x2' : 'btn-sell-normal');
    this.spawnFlyingCoins(sellBtn, multiplier > 1 ? 10 : 7);

    this.state.coins += finalCoins;
    this.state.totalEarned += finalCoins;
    this.state.completedCount += 1;
    if (!order.isReplay) {
      this.state.orderIndex += 1;
    }
    this.state.activeLot = null;
    this.state.savedOrderProgress = null;
    this.currentPaintMap = {};

    const prevBest = this.state.collectionRecords[order.item.id] || 0;
    if (finalCoins > prevBest) {
      this.state.collectionRecords[order.item.id] = finalCoins;
    }

    this.audio.playCoins();
    this.pulseCoins();
    this.animateCoinsTo(this.state.coins);
    this.closeModal('modal-complete');

    this.save(true);
    const durationSec = Math.max(1, Math.round((performance.now() - this.orderStartedAtMs) / 1000));
    this.platform.notifyLevelCompleted(order.orderNumber);
    this.platform.sendTelemetryEvent('order_sold', {
      item_id: order.item.id,
      order_number: order.orderNumber,
      lot_kind: order.lotKind || 'client',
      auction_x2: multiplier > 1,
      duration_sec: durationSec
    });
    this.platform.submitLeaderboardScore(this.state.totalEarned);

    if (!skipInterstitial) {
      await this.platform.showInterstitialIfReady();
    }

    // Fast zero-modal transition from tutorial Order #1 directly onto teased Order #2
    if (this.state.completedCount === 1) {
      await this.loadCurrentOrder();
      this.refreshAllUi();
      return;
    }

    if (this.state.completedCount === 3 && !this.dailyPromptedThisSession && this.canClaimDailyToday()) {
      this.dailyPromptedThisSession = true;
      this.pendingDailyAfterMarket = true;
    }

    await this.openMarketModal();
  }

  buyUpgrade(key) {
    this.audio.unlock();
    const def = UPGRADE_DEFS[key];
    const currentLvl = this.state.upgrades[key] || 1;
    if (currentLvl >= def.maxLevel) return;

    const cost = getUpgradeCost(key, currentLvl);
    if (this.state.coins < cost) return;

    if (this.coinAnimFrame) {
      cancelAnimationFrame(this.coinAnimFrame);
      this.coinAnimFrame = 0;
    }
    this.state.coins -= cost;
    this.displayedCoins = this.state.coins;
    this.state.upgrades[key] = currentLvl + 1;
    this.audio.playUpgrade();

    this.syncBrushTool();
    this.save(true);
    this.platform.sendTelemetryEvent('upgrade_purchased', {
      upgrade_id: key,
      level: this.state.upgrades[key]
    });
    this.refreshAllUi();

    const upgCard = $(`upg-${key}`);
    if (upgCard) {
      upgCard.classList.remove('stamp-pop');
      upgCard.offsetHeight;
      upgCard.classList.add('stamp-pop');
    }

    const nameKey =
      key === 'brushSize'
        ? 'upgBrushSizeName'
        : key === 'brushPower'
          ? 'upgBrushPowerName'
          : 'upgAppraisalName';
    this.showToast(
      this.i18n.t('toastUpgrade', {
        name: this.i18n.t(nameKey),
        lvl: this.state.upgrades[key]
      })
    );
  }

  async activateTurboAd() {
    if (this.turboRemainingSec > 0) return;
    this.audio.unlock();
    this.audio.playClick();

    const { rewarded } = await this.platform.showRewarded('turbo_boost');
    if (rewarded) {
      this.turboRemainingSec = 45;
      this.syncBrushTool();
      this.refreshBoostersUi();
      this.audio.playUpgrade();
      this.showToast(this.i18n.t('toastTurboOn'));
    } else {
      this.showToast(this.i18n.t('toastAdFail'));
    }
  }

  async openChestAd() {
    if (this.chestCooldownSec > 0) return;
    this.audio.unlock();
    this.audio.playClick();

    const { rewarded } = await this.platform.showRewarded('scavenger_chest');
    if (rewarded) {
      const amount = getScavengerChestReward(this.state.upgrades.appraisal, this.state.orderIndex);
      this.spawnFlyingCoins($('btn-chest'), 8);
      this.state.coins += amount;
      this.state.totalEarned += amount;
      this.chestCooldownSec = 90;
      this.audio.playCoins();
      this.pulseCoins();
      this.animateCoinsTo(this.state.coins);
      this.save(true);
      this.refreshAllUi();
      this.showToast(this.i18n.t('toastChest', { amount }));
    } else {
      this.showToast(this.i18n.t('toastAdFail'));
    }
  }

  canClaimDailyToday() {
    return this.state.daily.lastClaimDate !== getTodayStr();
  }

  openDailyModal() {
    this.audio.unlock();
    this.audio.playClick();
    this.setDrawerOpen(false);
    this.renderDailyModal();
    this.openModal('modal-daily');
  }

  renderDailyModal() {
    const canClaim = this.canClaimDailyToday();
    const activeIdx = this.state.daily.streak % DAILY_REWARDS.length;
    const grid = $('daily-days-grid');
    grid.innerHTML = '';

    DAILY_REWARDS.forEach((_, idx) => {
      const amount = getDailyRewardAmount(
        idx,
        this.state.orderIndex,
        this.state.upgrades.appraisal
      );
      const card = document.createElement('div');
      let cls = 'daily-day-card';
      if (idx < activeIdx || (!canClaim && idx === activeIdx)) cls += ' claimed';
      else if (canClaim && idx === activeIdx) cls += ' current';
      card.className = cls;

      const label = document.createElement('small');
      label.textContent = this.i18n.t('dailyDay', { day: idx + 1 });

      const val = document.createElement('strong');
      val.textContent = `+${amount}`;

      card.append(label, val);
      grid.appendChild(card);
    });

    const btn = $('btn-claim-daily');
    btn.disabled = !canClaim;
    btn.textContent = this.i18n.t(canClaim ? 'dailyClaim' : 'dailyClaimed');
  }

  claimDailyReward() {
    if (!this.canClaimDailyToday()) return;
    const idx = this.state.daily.streak % DAILY_REWARDS.length;
    const amount = getDailyRewardAmount(
      idx,
      this.state.orderIndex,
      this.state.upgrades.appraisal
    );

    this.spawnFlyingCoins($('btn-claim-daily'), 9);
    this.state.coins += amount;
    this.state.totalEarned += amount;
    this.state.daily.lastClaimDate = getTodayStr();
    this.state.daily.streak = (idx + 1) % DAILY_REWARDS.length;

    this.audio.playCoins();
    this.pulseCoins();
    this.animateCoinsTo(this.state.coins);
    this.save(true);
    this.refreshAllUi();
    this.renderDailyModal();
    this.showToast(this.i18n.t('toastDaily', { amount }));
    setTimeout(() => this.closeModal('modal-daily'), 500);
  }

  openCollectionModal() {
    this.audio.unlock();
    this.audio.playClick();
    this.setDrawerOpen(false);
    const lbType = this.platform.getLeaderboardType();
    const lbTabHidden = lbType === 'not_available' || lbType === 'native';
    $('tab-leaderboard').classList.toggle('hidden', lbTabHidden);
    this.renderCollectionGrid();
    this.switchCollectionTab('museum');
    this.openModal('modal-collection');
  }

  switchCollectionTab(tab) {
    if (tab === 'leaderboard') {
      const lbType = this.platform.getLeaderboardType();
      if (lbType === 'not_available' || lbType === 'native') return;
      if (lbType === 'native_popup') {
        this.platform.showNativeLeaderboardPopup();
        return;
      }
    }
    const isMuseum = tab === 'museum';
    $('tab-museum').classList.toggle('active', isMuseum);
    $('tab-leaderboard').classList.toggle('active', !isMuseum);
    $('pane-museum').classList.toggle('hidden', !isMuseum);
    $('pane-leaderboard').classList.toggle('hidden', isMuseum);

    if (!isMuseum) {
      this.renderLeaderboardPane();
    }
  }

  async renderCollectionGrid() {
    const grid = $('collection-grid');
    grid.innerHTML = '';
    const renderToken = (this.collectionRenderToken || 0) + 1;
    this.collectionRenderToken = renderToken;
    const thumbJobs = [];

    for (const item of ITEMS_CATALOG) {
      const best = this.state.collectionRecords[item.id] || 0;
      const unlocked = best > 0;
      const card = document.createElement('div');
      card.className = `collection-item ${unlocked ? 'unlocked' : 'locked'}`;

      const img = document.createElement('img');
      img.className = 'collection-thumb';
      img.decoding = 'async';
      img.alt = unlocked ? this.i18n.t(`item_${item.id}`) : '---';

      const name = document.createElement('div');
      name.className = 'collection-item-name';
      name.textContent = unlocked ? this.i18n.t(`item_${item.id}`) : this.i18n.t('lockedName');

      const meta = document.createElement('div');
      meta.className = 'collection-item-meta';
      meta.textContent = unlocked ? `${best}` : this.i18n.t(`rarity_${item.rarity}`);

      card.append(img, name, meta);
      if (unlocked) {
        const replayBtn = document.createElement('button');
        replayBtn.type = 'button';
        replayBtn.className = 'collection-replay-btn';
        replayBtn.textContent = this.i18n.t('replayItemBtn');
        replayBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.startReplayOrder(item.id);
        });
        card.appendChild(replayBtn);
      }
      grid.appendChild(card);
      thumbJobs.push({ item, img });
    }

    for (let i = 0; i < thumbJobs.length; i += 4) {
      if (this.collectionRenderToken !== renderToken) return;
      const batch = thumbJobs.slice(i, i + 4);
      await Promise.all(
        batch.map(async ({ item, img }) => {
          try {
            const url = await getItemThumbDataUrl(item);
            if (this.collectionRenderToken === renderToken) {
              img.src = url;
            }
          } catch {
            // Ignore cancelled/failed thumb
          }
        })
      );
    }
  }

  async startReplayOrder(itemId) {
    this.audio.unlock();
    this.audio.playClick();
    this.closeModal('modal-collection');
    this.state.activeLot = {
      kind: 'replay',
      itemId,
      cost: 0,
      payoutMult: 0.35,
      hasMakerMark: false,
      markMult: 1,
      markRevealed: false,
      isReplay: true
    };
    this.state.savedOrderProgress = null;
    this.save(true);
    await this.loadCurrentOrder();
    this.refreshAllUi();
  }

  async renderLeaderboardPane() {
    $('stat-total-earned-val').textContent = String(this.state.totalEarned);
    $('stat-orders-done-val').textContent = String(this.state.completedCount);
    const shouldShowAuth = this.platform.isAuthSupported() && !this.platform.isPlayerAuthorized();
    $('lb-auth-box').classList.toggle('hidden', !shouldShowAuth);

    const list = $('leaderboard-list');
    list.innerHTML = `<div class="lb-row">${this.i18n.t('lbEmpty')}</div>`;

    const entries = await this.platform.getLeaderboardEntries(this.state.totalEarned);
    list.innerHTML = '';
    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = `lb-row ${entry.isMe ? 'me' : ''}`;
      const left = document.createElement('span');
      left.textContent = `#${entry.rank} ${entry.name}`;
      const right = document.createElement('strong');
      right.textContent = String(entry.score);
      row.append(left, right);
      list.appendChild(row);
    }
  }

  async handleLeaderboardAuth() {
    this.audio.unlock();
    this.audio.playClick();
    const ok = await this.platform.promptAuth();
    if (ok) {
      await this.platform.submitLeaderboardScore(this.state.totalEarned);
      this.showToast(this.i18n.t('toastAuthOk'));
      await this.renderLeaderboardPane();
    }
  }

  openModal(id) {
    $(id).classList.remove('hidden');
    this.platform.setGameplayActive(false);
    this.audio.stopScrub();
  }

  closeModal(id) {
    $(id).classList.add('hidden');
    if (!this.hasOpenModal() && !document.hidden) {
      this.platform.setGameplayActive(true);
    }
  }

  refreshAllUi() {
    if (!this.coinAnimFrame) {
      this.displayedCoins = this.state.coins;
      $('coins-value').textContent = formatCoinAmount(this.state.coins);
      const pill = $('coins-pill');
      if (pill) pill.title = String(this.state.coins);
    }
    this.refreshOrderHeader();
    this.renderWorkbenchRack();
    this.refreshOperationBar(this.currentStepIndex);
    this.refreshUpgradesUi();
    this.refreshBoostersUi();
    this.refreshSoundBtn();

    const unlockedCount = Object.keys(this.state.collectionRecords).length;
    $('collection-count-badge').textContent = `${unlockedCount}/${ITEMS_CATALOG.length}`;
    $('daily-dot').classList.toggle('hidden', !this.canClaimDailyToday());
    const nativeLangNames = { en: 'English', ru: 'Русский', tr: 'Türkçe' };
    $('lang-label').textContent = nativeLangNames[this.i18n.lang] || 'English';
  }

  refreshOrderHeader() {
    if (!this.currentOrder) return;
    const { item, orderNumber, isVipOrder, isReplay } = this.currentOrder;
    $('order-number').textContent = `#${orderNumber}`;

    const modeTag = $('order-mode-tag');
    if (modeTag) {
      if (isReplay) {
        modeTag.textContent = this.i18n.t('replayBadge');
        modeTag.classList.remove('hidden');
      } else if (isVipOrder) {
        modeTag.innerHTML = `<span class="mode-tag-full">${this.i18n.t('vipOrderTag')}</span><span class="mode-tag-short">VIP</span>`;
        modeTag.classList.remove('hidden');
      } else {
        modeTag.classList.add('hidden');
      }
    }

    const badge = $('rarity-badge');
    badge.className = `rarity-badge rarity-${item.rarity}`;
    badge.textContent = this.i18n.t(`rarity_${item.rarity}`);
    $('item-name').textContent = this.i18n.t(`item_${item.id}`);

    const est = computeOrderPayout(this.currentOrder, this.state.upgrades.appraisal);
    const estEl = $('est-value-amount');
    estEl.textContent = formatCoinAmount(est);
    estEl.title = String(est);
  }

  getStepToolSpriteKey(step) {
    if (!step) return null;
    if (step.type === 'excavate') return 'tool_trowel';
    if (step.type === 'scrape') return 'tool_scraper';
    if (step.type === 'foam') return 'tool_foam';
    if (step.type === 'rinse') return 'tool_rinse';
    if (step.type === 'sandblast') return 'tool_sandblast';
    if (step.type === 'paint') return 'tool_airbrush';
    if (step.type === 'polish') return 'tool_polish';
    if (step.type === 'unscrew') return 'tool_screwdriver';
    if (step.type === 'precision') {
      if (step.kind === 'solder') return 'tool_solder';
      if (step.kind === 'contacts') return 'tool_cleaner';
      return 'tool_oiler';
    }
    if (step.type === 'assemble') {
      return this.assemblyPhase === 'fasten' ? 'tool_screwdriver' : null;
    }
    return null;
  }

  async openMarketModal() {
    this.marketChoices = generateMarketChoices(this.state.orderIndex, this.state.upgrades.appraisal);
    await this.renderMarketModal();
    this.refreshAllUi();
    this.audio.playPaperRustle();
    this.openModal('modal-market');
  }

  async renderMarketModal() {
    $('market-modal-title').textContent = this.i18n.t('marketTitle');
    $('market-subtitle').textContent = this.i18n.t('marketSub');
    const bonusAmt = getScavengerChestReward(this.state.upgrades.appraisal, this.state.orderIndex);
    $('market-ad-label').textContent = this.i18n.t('marketAdBtn', { amount: bonusAmt });
    $('btn-market-ad').classList.toggle('hidden', !this.platform.isRewardedSupported());

    const list = $('market-lots-list');
    list.innerHTML = '';

    for (const lot of this.marketChoices) {
      const item = ITEMS_CATALOG.find((x) => x.id === lot.itemId) || ITEMS_CATALOG[0];
      const card = document.createElement('div');
      card.className = `market-lot-card lot-${lot.kind}`;

      const thumbBox = document.createElement('div');
      thumbBox.className = `lot-thumb-box${lot.isMystery ? ' lot-thumb-mystery' : ''}`;
      const thumbImg = document.createElement('img');
      thumbImg.alt = '';
      thumbImg.src = `assets/items/${item.basePartId}_muddy.webp`;
      thumbBox.appendChild(thumbImg);

      const info = document.createElement('div');
      info.className = 'lot-info';
      const badge = document.createElement('span');
      badge.className = 'lot-badge';
      badge.textContent = this.i18n.t(
        lot.kind === 'client' ? 'lotClientTag' : lot.kind === 'attic' ? 'lotAtticTag' : 'lotBlindTag'
      );

      const name = document.createElement('strong');
      name.className = 'lot-name';
      name.textContent = lot.isMystery
        ? this.i18n.t('mysteryItemName')
        : this.i18n.t(`item_${item.id}`);

      const desc = document.createElement('span');
      desc.className = 'lot-desc';
      desc.textContent = this.i18n.t(
        lot.kind === 'client' ? 'lotClientDesc' : lot.kind === 'attic' ? 'lotAtticDesc' : 'lotBlindDesc'
      );

      info.append(badge, name, desc);

      const btn = document.createElement('button');
      btn.type = 'button';
      const isFree = lot.cost <= 0;
      const canAfford = this.state.coins >= lot.cost;
      btn.className = `market-lot-btn${isFree ? ' lot-free-btn' : ''}`;
      btn.disabled = !canAfford;
      btn.textContent = isFree
        ? this.i18n.t('lotFree')
        : this.i18n.t('lotBuyFor', { cost: lot.cost });
      btn.addEventListener('click', () => this.chooseMarketLot(lot));

      card.append(thumbBox, info, btn);
      list.appendChild(card);
    }
  }

  async chooseMarketLot(lot) {
    if (!lot || this.state.coins < lot.cost) return;
    this.audio.unlock();
    this.audio.playClick();

    if (lot.cost > 0) {
      if (this.coinAnimFrame) {
        cancelAnimationFrame(this.coinAnimFrame);
        this.coinAnimFrame = 0;
      }
      this.state.coins -= lot.cost;
      this.displayedCoins = this.state.coins;
    }
    this.state.activeLot = { ...lot };
    this.state.savedOrderProgress = null;
    this.currentPaintMap = {};
    this.closeModal('modal-market');
    this.save(true);

    await this.loadCurrentOrder();
    this.refreshAllUi();

    const noUpgradesYet =
      (this.state.upgrades.brushSize || 1) === 1 &&
      (this.state.upgrades.brushPower || 1) === 1 &&
      (this.state.upgrades.appraisal || 1) === 1;
    if (
      this.state.completedCount === 2 &&
      noUpgradesYet &&
      this.state.coins >= getUpgradeCost('brushSize', 1) &&
      typeof window !== 'undefined' &&
      window.innerWidth < 900
    ) {
      setTimeout(() => {
        if (!this.hasOpenModal()) {
          this.setDrawerOpen(true);
        }
      }, 320);
      return;
    }

    if (this.pendingDailyAfterMarket) {
      this.pendingDailyAfterMarket = false;
      setTimeout(() => {
        if (!this.hasOpenModal() && this.canClaimDailyToday()) {
          this.openDailyModal();
        }
      }, 360);
    }
  }

  async earnMarketAd() {
    this.audio.unlock();
    this.audio.playClick();
    const { rewarded } = await this.platform.showRewarded('market_advance');
    if (rewarded) {
      const amount = getScavengerChestReward(this.state.upgrades.appraisal, this.state.orderIndex);
      this.spawnFlyingCoins($('btn-market-ad'), 8);
      this.state.coins += amount;
      this.state.totalEarned += amount;
      this.audio.playCoins();
      this.pulseCoins();
      this.animateCoinsTo(this.state.coins);
      this.save(true);
      this.refreshAllUi();
      await this.renderMarketModal();
      this.showToast(this.i18n.t('toastChest', { amount }));
    } else {
      this.showToast(this.i18n.t('toastAdFail'));
    }
  }

  renderWorkbenchRack() {
    const rack = $('workbench-tool-rack');
    if (!rack || !this.currentOrder) return;

    const steps = this.currentOrder.item.steps;
    const keys = [];
    const seen = new Set();
    const lastStepForTool = new Map();
    steps.forEach((s, i) => {
      const k = s.type === 'assemble' ? 'tool_screwdriver' : this.getStepToolSpriteKey(s);
      if (k && TOOLS_META[k]) {
        if (!seen.has(k)) {
          seen.add(k);
          keys.push(k);
        }
        lastStepForTool.set(k, i);
      }
    });

    const prevScrollLeft = rack.scrollLeft;
    rack.classList.remove('hidden');
    rack.innerHTML = '';

    const activeStep = steps[this.currentStepIndex];
    const reqKey = this.getStepToolSpriteKey(activeStep);
    const equipped = this.workshop?.equippedToolKey;
    const locked = Boolean(this.workshop?.toolLocked);
    const isOrderFinished = Boolean(this.workshop?.awaitingTest || this.workshop?.completed || this.workshop?.testingAnim?.active);

    const coach = $('rack-coach-banner');
    if (coach) {
      const shouldShowCoach = Boolean(
        !this.state.rackTutorialDone &&
        locked &&
        (this.currentOrder?.orderNumber || 1) >= 3 &&
        !isOrderFinished
      );
      coach.textContent = this.i18n.t('rackCoachText');
      coach.classList.toggle('hidden', !shouldShowCoach);
    }

    let focusBtn = null;
    const focusKey = !isOrderFinished ? (locked ? reqKey : equipped || reqKey) : null;

    keys.forEach((toolKey, idx) => {
      const meta = TOOLS_META[toolKey];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.tool = toolKey;
      const isDone = isOrderFinished || (lastStepForTool.get(toolKey) ?? -1) < this.currentStepIndex;
      let cls = 'rack-tool-btn';
      if (equipped === toolKey && !locked && !isOrderFinished) cls += ' equipped';
      else if (locked && reqKey === toolKey) cls += ' pulse-needed';
      else if (isDone) cls += ' tool-done';
      btn.className = cls;

      if (toolKey === focusKey) {
        focusBtn = btn;
      }

      if (idx < 9) {
        const hk = document.createElement('span');
        hk.className = 'rack-hotkey';
        hk.textContent = String(idx + 1);
        btn.appendChild(hk);
      }

      const img = document.createElement('img');
      img.src = meta.src;
      img.alt = '';
      btn.appendChild(img);

      const lbl = document.createElement('span');
      lbl.className = 'rack-tool-label';
      lbl.textContent = this.i18n.t(`rack_${toolKey}`);
      btn.appendChild(lbl);

      btn.addEventListener('click', () => {
        if (performance.now() < this.rackDragSuppressClickUntil) return;
        this.audio.unlock();
        if (this.workshop.selectToolFromRack(toolKey) && !this.state.rackTutorialDone) {
          this.state.rackTutorialDone = true;
          $('rack-coach-banner')?.classList.add('hidden');
          this.save();
        }
      });
      rack.appendChild(btn);
    });

    rack.scrollLeft = prevScrollLeft;
    if (focusBtn && focusKey !== this.lastFocusedRackTool) {
      const isFirstFocus = this.lastFocusedRackTool === null;
      this.lastFocusedRackTool = focusKey;
      requestAnimationFrame(() => {
        this.scrollRackButtonIntoCenter(focusBtn, !isFirstFocus);
      });
    }
  }

  refreshOperationBar(stepIdx) {
    if (!this.currentOrder) return;
    const steps = this.currentOrder.item.steps;
    const step = steps[stepIdx] || steps[0];

    $('step-counter-label').textContent = this.i18n.t('stepProgressLabel', {
      cur: stepIdx + 1,
      total: steps.length
    });

    const iconHtml = iconSvg(getStepIconName(step.type, step.kind));
    const iconEl = $('active-tool-icon');
    iconEl.innerHTML = iconHtml;
    $('belt-tool-icon').innerHTML = iconHtml;

    const toolImgEl = $('op-tool-img');
    const spriteKey = this.getStepToolSpriteKey(step);
    const toolMeta = spriteKey ? TOOLS_META[spriteKey] : null;
    if (toolImgEl && toolMeta) {
      if (toolImgEl.getAttribute('src') !== toolMeta.src) {
        toolImgEl.src = toolMeta.src;
      }
      toolImgEl.classList.remove('hidden');
      iconEl.classList.add('hidden');
      if (this.lastMedallionToolKey !== spriteKey) {
        this.lastMedallionToolKey = spriteKey;
        toolImgEl.classList.remove('tool-pop');
        toolImgEl.offsetWidth;
        toolImgEl.classList.add('tool-pop');
      }
    } else {
      if (toolImgEl) toolImgEl.classList.add('hidden');
      iconEl.classList.remove('hidden');
      if (this.lastMedallionToolKey !== '__hand__') {
        this.lastMedallionToolKey = '__hand__';
        iconEl.classList.remove('tool-pop');
        iconEl.offsetWidth;
        iconEl.classList.add('tool-pop');
      }
    }

    let toolKey = `tool_${step.type}`;
    let hintKey = `hint_${step.type}`;
    if (step.type === 'precision') {
      toolKey = `tool_precision_${step.kind || 'oil'}`;
      hintKey = `hint_precision_${step.kind || 'oil'}`;
    } else if (step.type === 'assemble') {
      hintKey = this.assemblyPhase === 'fasten' ? 'hint_assemble_screw' : 'hint_assemble_drag';
    }

    $('active-tool-name').textContent = this.i18n.t(toolKey);
    if (this.workshop?.awaitingTest) {
      $('step-hint-text').textContent = this.i18n.t('testItemBtn');
    } else if (this.workshop?.toolLocked) {
      $('step-hint-text').textContent = this.i18n.t('pickToolHint', { tool: this.i18n.t(toolKey) });
    } else {
      $('step-hint-text').textContent = this.i18n.t(hintKey);
    }

    const swatchesWrap = $('paint-swatches');
    if (swatchesWrap) {
      if (step.type === 'paint' && Array.isArray(step.palette) && step.palette.length > 0) {
        swatchesWrap.classList.remove('hidden');
        swatchesWrap.innerHTML = '';
        step.palette.forEach((sw, idx) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `paint-swatch-btn${idx === this.selectedPaintIdx ? ' active' : ''}`;
          btn.style.backgroundColor = sw.hex;
          btn.addEventListener('click', () => {
            this.audio.unlock();
            this.audio.playClick();
            this.selectedPaintIdx = idx;
            this.workshop.setPaintSwatch(sw);
            if (step.partId) {
              this.currentPaintMap[step.partId] = idx;
              this.persistOrderProgress(Boolean(this.workshop?.awaitingTest));
            }
            swatchesWrap.querySelectorAll('.paint-swatch-btn').forEach((el, j) => {
              el.classList.toggle('active', j === idx);
            });
          });
          swatchesWrap.appendChild(btn);
        });
      } else {
        swatchesWrap.classList.add('hidden');
        swatchesWrap.innerHTML = '';
      }
    }

    const activePartId = step.partId || step.dragPartId || this.currentOrder.item.basePartId;
    $('belt-part-name').textContent = this.i18n.t(`part_${activePartId}`);

    const dotsWrap = $('step-dots');
    dotsWrap.innerHTML = '';
    for (let i = 0; i < steps.length; i++) {
      const seg = document.createElement('span');
      seg.className = `step-seg${i < stepIdx ? ' done' : i === stepIdx ? ' active' : ''}`;
      dotsWrap.appendChild(seg);
    }
  }

  refreshUpgradesUi() {
    let anyAffordable = false;
    for (const key of ['brushSize', 'brushPower', 'appraisal']) {
      const def = UPGRADE_DEFS[key];
      const lvl = this.state.upgrades[key] || 1;
      const isMax = lvl >= def.maxLevel;
      const cost = getUpgradeCost(key, lvl);
      const canBuy = !isMax && this.state.coins >= cost;
      if (canBuy) anyAffordable = true;

      const card = $(`upg-${key}`);
      card.disabled = !canBuy;
      card.classList.toggle('affordable', canBuy);
      $(`upg-${key}-lvl`).textContent = `${this.i18n.t('lvlPrefix')} ${lvl}`;
      $(`upg-${key}-cost`).textContent = isMax ? 'MAX' : formatCoinAmount(cost);
    }
    $('equip-affordable-dot').classList.toggle('hidden', !anyAffordable);
    $('btn-drawer-equip')?.classList.toggle('has-upgrade', anyAffordable);
  }

  refreshBoostersUi() {
    const rewSupported = this.platform.isRewardedSupported();
    const suppliesSection = $('rack-supplies-section');
    const turboBtn = $('btn-turbo');
    const turboBeltBtn = $('btn-turbo-belt');
    const turboBeltAd = $('turbo-belt-ad');
    const turboBanner = $('turbo-banner');
    const chestBtn = $('btn-chest');

    if (suppliesSection) {
      suppliesSection.classList.toggle('hidden', !rewSupported);
    }
    turboBeltBtn.classList.toggle('hidden', !rewSupported && this.turboRemainingSec <= 0);

    if (this.turboRemainingSec > 0) {
      turboBtn.disabled = true;
      turboBeltBtn.disabled = true;
      if (turboBeltAd) turboBeltAd.classList.add('hidden');
      $('turbo-title').textContent = this.i18n.t('turboActiveBtn', { sec: this.turboRemainingSec });
      $('turbo-belt-label').textContent = this.i18n.t('turboActiveBtn', { sec: this.turboRemainingSec });
      turboBanner.classList.remove('hidden');
      $('turbo-banner-text').textContent = this.i18n.t('turboBanner', { sec: this.turboRemainingSec });
    } else {
      turboBtn.disabled = false;
      turboBeltBtn.disabled = false;
      if (turboBeltAd) turboBeltAd.classList.remove('hidden');
      $('turbo-title').textContent = this.i18n.t('turboTitle');
      $('turbo-belt-label').textContent = this.i18n.t('turboBtn');
      turboBanner.classList.add('hidden');
    }

    const reward = getScavengerChestReward(this.state.upgrades.appraisal, this.state.orderIndex);
    $('chest-sub').textContent = this.i18n.t('chestSub', { amount: formatCoinAmount(reward) });
    const badge = $('chest-badge');
    if (this.chestCooldownSec > 0) {
      chestBtn.disabled = true;
      badge.textContent = this.i18n.t('chestCooldown', { sec: this.chestCooldownSec });
    } else {
      chestBtn.disabled = false;
      badge.innerHTML = `${iconSvg('playAd', 'ui-svg svg-xs')}<span>AD</span>`;
    }
  }

  refreshSoundBtn() {
    $('sound-icon-slot').innerHTML = iconSvg(this.state.muted ? 'volumeOff' : 'volumeOn');
  }

  applyTranslations() {
    $('order-badge-label').textContent = this.i18n.t('orderLabel');
    $('est-value-label').textContent = this.i18n.t('estValue');
    $('hint-btn-text').textContent = this.i18n.t('hintBtn');
    $('gesture-hint-text').textContent = this.i18n.t('gestureHint');
    $('equip-btn-label').textContent = this.i18n.t('equipBtn');
    $('drawer-title-mobile').textContent = this.i18n.t('upgradesHeading');
    $('supplies-heading').textContent = this.i18n.t('suppliesHeading');
    $('upgrades-heading').textContent = this.i18n.t('upgradesHeading');
    $('turbo-sub').textContent = this.i18n.t('turboSub');
    $('chest-title').textContent = this.i18n.t('chestTitle');

    $('upg-brushSize-name').textContent = this.i18n.t('upgBrushSizeName');
    $('upg-brushSize-desc').textContent = this.i18n.t('upgBrushSizeDesc');
    $('upg-brushPower-name').textContent = this.i18n.t('upgBrushPowerName');
    $('upg-brushPower-desc').textContent = this.i18n.t('upgBrushPowerDesc');
    $('upg-appraisal-name').textContent = this.i18n.t('upgAppraisalName');
    $('upg-appraisal-desc').textContent = this.i18n.t('upgAppraisalDesc');

    $('complete-cert-sub').textContent = this.i18n.t('completeCertSub');
    $('ba-before-label').textContent = this.i18n.t('baBefore');
    $('ba-after-label').textContent = this.i18n.t('baAfter');
    $('ba-drag-hint').textContent = this.i18n.t('baDragHint');
    $('hallmark-label').textContent = this.i18n.t('hallmarkLabel');
    $('grade-label').textContent = this.i18n.t('gradeLabel');
    $('reward-label').textContent = this.i18n.t('rewardLabel');
    $('sell-x2-label').textContent = this.i18n.t('sellX2');
    $('sell-normal-label').textContent = this.i18n.t('sellNormal');
    $('test-item-label').textContent = this.i18n.t('testItemBtn');
    $('market-modal-title').textContent = this.i18n.t('marketTitle');
    $('market-subtitle').textContent = this.i18n.t('marketSub');

    $('collection-modal-title').textContent = this.i18n.t('collectionTitle');
    $('tab-museum').textContent = this.i18n.t('tabMuseum');
    $('tab-leaderboard').textContent = this.i18n.t('tabLeaderboard');
    $('stat-total-earned-label').textContent = this.i18n.t('statTotalEarned');
    $('stat-orders-done-label').textContent = this.i18n.t('statOrdersDone');
    $('lb-heading').textContent = this.i18n.t('lbHeading');
    $('lb-auth-hint').textContent = this.i18n.t('lbAuthHint');
    $('btn-lb-auth').textContent = this.i18n.t('lbAuthBtn');

    $('daily-modal-title').textContent = this.i18n.t('dailyTitle');
    $('daily-subtitle').textContent = this.i18n.t('dailySubtitle');
  }

  pulseCoins() {
    const pill = $('coins-pill');
    pill.classList.remove('pulse');
    pill.offsetHeight;
    pill.classList.add('pulse');
  }

  animateCoinsTo(targetCoins) {
    if (this.coinAnimFrame) {
      cancelAnimationFrame(this.coinAnimFrame);
      this.coinAnimFrame = 0;
    }
    const startVal = Number.isFinite(this.displayedCoins) ? this.displayedCoins : targetCoins;
    const diff = targetCoins - startVal;
    const pill = $('coins-pill');
    if (diff === 0) {
      this.displayedCoins = targetCoins;
      $('coins-value').textContent = formatCoinAmount(targetCoins);
      if (pill) pill.title = String(targetCoins);
      return;
    }
    const duration = 520;
    const startTs = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - startTs) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = Math.round(startVal + diff * eased);
      this.displayedCoins = cur;
      $('coins-value').textContent = formatCoinAmount(cur);
      if (t < 1) {
        this.coinAnimFrame = requestAnimationFrame(tick);
      } else {
        this.coinAnimFrame = 0;
        this.displayedCoins = targetCoins;
        $('coins-value').textContent = formatCoinAmount(targetCoins);
        if (pill) pill.title = String(targetCoins);
      }
    };
    this.coinAnimFrame = requestAnimationFrame(tick);
  }

  spawnFlyingCoins(sourceEl, count = 8) {
    const targetEl = $('coins-pill');
    if (!targetEl) return;
    const tRect = targetEl.getBoundingClientRect();
    const sRect = sourceEl ? sourceEl.getBoundingClientRect() : null;
    const hasSrc = sRect && sRect.width > 0 && sRect.height > 0;
    const startX = hasSrc ? sRect.left + sRect.width * 0.5 : window.innerWidth * 0.5;
    const startY = hasSrc ? sRect.top + sRect.height * 0.5 : window.innerHeight * 0.55;
    const endX = tRect.left + tRect.width * 0.35;
    const endY = tRect.top + tRect.height * 0.5;
    const coinMarkup = iconSvg('coin');

    for (let i = 0; i < count; i++) {
      const coin = document.createElement('div');
      coin.className = 'flying-coin';
      coin.innerHTML = coinMarkup;
      const sx = startX + (Math.random() - 0.5) * 34;
      const sy = startY + (Math.random() - 0.5) * 18;
      const ctrlX = (sx + endX) * 0.5 + (Math.random() - 0.5) * 90;
      const ctrlY = Math.min(sy, endY) - 45 - Math.random() * 55;
      coin.style.left = `${sx - 11}px`;
      coin.style.top = `${sy - 11}px`;
      coin.style.opacity = '0';
      document.body.appendChild(coin);

      const delay = i * 42;
      const dur = 460 + Math.random() * 140;
      const bornAt = performance.now() + delay;

      const stepFrame = (now) => {
        if (now < bornAt) {
          requestAnimationFrame(stepFrame);
          return;
        }
        const t = Math.min(1, (now - bornAt) / dur);
        const u = 1 - t;
        const x = u * u * sx + 2 * u * t * ctrlX + t * t * endX;
        const y = u * u * sy + 2 * u * t * ctrlY + t * t * endY;
        const scale = 1.05 - 0.35 * t;
        coin.style.transform = `translate3d(${x - sx}px, ${y - sy}px, 0) scale(${scale})`;
        coin.style.opacity = t > 0.85 ? String((1 - t) / 0.15) : '1';
        if (t < 1) {
          requestAnimationFrame(stepFrame);
        } else {
          coin.remove();
          if (i === count - 1) this.pulseCoins();
        }
      };
      requestAnimationFrame(stepFrame);
    }
  }

  showToast(msg) {
    const container = $('toast-container');
    const pill = document.createElement('div');
    pill.className = 'toast-pill';
    pill.textContent = msg;
    container.appendChild(pill);
    setTimeout(() => pill.remove(), 2150);
  }

  save(immediate = false) {
    this.platform.saveState(this.state, immediate);
  }
}

const app = new GameApp();
app.start();
