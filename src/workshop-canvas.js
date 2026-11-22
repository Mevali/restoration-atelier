import { applyPartPaintTint, renderCompositeSnapshot } from './items-renderer.js';

export class WorkshopCanvas {
  constructor(canvas, {
    audio,
    onProgress,
    onStageComplete,
    onItemComplete,
    onFirstTouch,
    onHintReady,
    onAssemblyPhase,
    onNeedToolPick,
    onReadyForTest,
    onMakerMarkReveal,
    onToolStateChange,
    onFrameSample
  }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = audio;
    this.onProgress = onProgress;
    this.onStageComplete = onStageComplete;
    this.onItemComplete = onItemComplete;
    this.onFirstTouch = onFirstTouch;
    this.onHintReady = onHintReady;
    this.onAssemblyPhase = onAssemblyPhase;
    this.onNeedToolPick = onNeedToolPick;
    this.onReadyForTest = onReadyForTest;
    this.onMakerMarkReveal = onMakerMarkReveal;
    this.onToolStateChange = onToolStateChange;
    this.onFrameSample = onFrameSample;

    this.size = 600;
    this.assets = null;
    this.foamPattern = null;
    this.soilPattern = null;

    this.orderSpec = null;
    this.bundles = null;
    this.sampleMap = new Map();

    this.stepIndex = 0;
    this.stepProgress = 0;
    this.completed = false;
    this.isDisassembled = false;
    this.screwsInTray = 0;

    this.screwStates = [];
    this.flyingScrews = [];
    this.precisionSpots = [];
    this.assemblyState = {
      phase: 'drag',
      dragging: false,
      x: 132,
      y: 162,
      grabOffsetX: 0,
      grabOffsetY: 0,
      scale: 0.56
    };

    this.hintShown = false;
    this.hintPulseUntil = 0;
    this.dirtyPoints = [];
    this.lastScrubTime = performance.now();
    this.firstTouchFired = false;

    this.brushRadius = 40;
    this.brushStrength = 0.45;
    this.turboActive = false;

    this.pointerDown = false;
    this.pointerPos = null;
    this.lastPos = null;
    this.hoverPos = null;
    this.toolPos = { x: 470, y: 475 };
    this.lastMeasureAt = 0;
    this.lastPrecisionSoundAt = 0;
    this.lastFrameAt = performance.now();

    this.particles = [];
    this.fallingChunks = [];
    this.lastChunkSoundAt = 0;
    this.excavateGlintDone = false;
    this.lastDigClodAt = 0;
    this.flashAlpha = 0;
    this.sweepPhase = 0;
    this.beforeDataUrl = '';
    this.afterDataUrl = '';
    this.transition = {
      active: false,
      timer: 0,
      duration: 0.62,
      kind: 'none',
      prevStep: null,
      prevToolKey: null,
      toolFrom: { x: 468, y: 472 },
      swapSoundPlayed: false
    };

    this.sheenCanvas = document.createElement('canvas');
    this.sheenCanvas.width = this.size;
    this.sheenCanvas.height = this.size;
    this.sheenCtx = this.sheenCanvas.getContext('2d');

    this.excavateMaskCanvas = document.createElement('canvas');
    this.excavateMaskCanvas.width = this.size;
    this.excavateMaskCanvas.height = this.size;
    this.excavateMaskCanvas.getContext('2d', { willReadFrequently: true });
    this.excavateLayer = document.createElement('canvas');
    this.excavateLayer.width = this.size;
    this.excavateLayer.height = this.size;
    this.excavateDirty = false;

    this.fxTintCanvas = document.createElement('canvas');
    this.fxTintCanvas.width = 256;
    this.fxTintCanvas.height = 256;
    this.lastPaintTintColor = '';
    this.equippedToolKey = null;
    this.toolLocked = false;
    this.activePaintSwatch = null;
    this.awaitingTest = false;
    this.testingAnim = { active: false, timer: 0, duration: 1.55, itemId: '' };

    this.rafId = null;
    this.bindEvents();
    this.startLoop();
  }

  setAssets(assets) {
    this.assets = assets;
    if (assets?.foamTexture) {
      this.foamPattern = this.ctx.createPattern(assets.foamTexture, 'repeat');
    }
    if (assets?.soilTexture) {
      this.soilPattern = this.ctx.createPattern(assets.soilTexture, 'repeat');
      if (this.orderSpec?.item?.steps?.[0]?.type === 'excavate') {
        this.rebuildExcavateLayer();
      }
    }
    this.syncCursorMode();
  }

  syncCursorMode() {
    if (!this.canvas) return;
    const step = this.getCurrentStep();
    const isPointer = Boolean(this.awaitingTest && !this.completed && !this.testingAnim.active);
    const isDrag = Boolean(
      !isPointer &&
      !this.completed &&
      !this.testingAnim.active &&
      step?.type === 'assemble' &&
      this.assemblyState.phase === 'drag'
    );
    const reqKey = this.getStepToolKey(step);
    const hasToolSprite = Boolean(
      step &&
      !isPointer &&
      !isDrag &&
      !this.completed &&
      !this.testingAnim.active &&
      !this.toolLocked &&
      !(this.transition.active && this.toolLocked) &&
      reqKey &&
      this.assets?.tools?.[reqKey]
    );

    this.canvas.classList.toggle('pointer-cursor', isPointer);
    this.canvas.classList.toggle('drag-cursor', isDrag);
    this.canvas.classList.toggle('tool-cursor', hasToolSprite);
  }

  bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.audio.unlock();
      if (!this.bundles) return;
      const pos = this.clientToCanvas(e.clientX, e.clientY, e.pointerType);
      if (this.awaitingTest) {
        if (Math.hypot(pos.x - 300, pos.y - 320) < 245) {
          this.runFunctionalTest();
        }
        return;
      }
      if (this.completed || this.testingAnim.active) return;
      this.canvas.setPointerCapture?.(e.pointerId);
      this.hoverPos = pos;
      if (this.transition.active) {
        this.pointerDown = true;
        this.pointerPos = pos;
        this.lastPos = pos;
        return;
      }

      const step = this.getCurrentStep();
      if (!step) return;

      const isDragStep = step.type === 'assemble' && this.assemblyState.phase === 'drag';
      if (!isDragStep && this.toolLocked) {
        this.pointerDown = false;
        this.audio.playWrongTool();
        this.onNeedToolPick?.(this.getStepToolKey(step));
        return;
      }

      this.pointerDown = true;
      this.pointerPos = pos;
      this.lastPos = pos;
      this.lastScrubTime = performance.now();
      this.hintPulseUntil = 0;

      if (!this.firstTouchFired) {
        this.firstTouchFired = true;
        this.onFirstTouch?.();
      }

      if (isDragStep) {
        const dx = pos.x - this.assemblyState.x;
        const dy = pos.y - this.assemblyState.y;
        if (Math.hypot(dx, dy) < 130) {
          this.assemblyState.dragging = true;
          this.assemblyState.grabOffsetX = dx;
          this.assemblyState.grabOffsetY = dy;
        }
        return;
      }

      if (this.isScrubStep(step.type)) {
        this.applyBrushStroke(step, pos, pos, 14);
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      const pos = this.clientToCanvas(e.clientX, e.clientY, e.pointerType);
      this.hoverPos = pos;
      this.pointerPos = pos;
      if (!this.pointerDown || this.completed || this.awaitingTest || this.testingAnim.active || !this.bundles) return;
      e.preventDefault();
      if (this.transition.active) {
        this.lastPos = pos;
        return;
      }

      const step = this.getCurrentStep();
      if (!step) return;

      if (step.type === 'assemble' && this.assemblyState.phase === 'drag') {
        if (this.assemblyState.dragging) {
          this.assemblyState.x = Math.max(85, Math.min(515, pos.x - this.assemblyState.grabOffsetX));
          this.assemblyState.y = Math.max(95, Math.min(515, pos.y - this.assemblyState.grabOffsetY));
          const distCenter = Math.hypot(this.assemblyState.x - 300, this.assemblyState.y - 320);
          this.assemblyState.scale = Math.min(1, Math.max(0.58, 1 - (distCenter / 260) * 0.42));
          this.onProgress?.(Math.min(50, Math.round((1 - Math.min(1, distCenter / 240)) * 50)), this.stepIndex);
          if (distCenter < 56) {
            this.snapAssemblyPart(step);
          }
        }
        return;
      }

      if (this.toolLocked) return;

      if (this.isScrubStep(step.type)) {
        const from = this.lastPos || pos;
        const dist = Math.hypot(pos.x - from.x, pos.y - from.y);
        this.applyBrushStroke(step, from, pos, Math.max(4, dist));
        this.lastPos = pos;
        this.lastScrubTime = performance.now();
      }
    });

    const endPointer = (e) => {
      if (e && e.pointerType === 'touch') {
        this.hoverPos = null;
        this.pointerPos = null;
      }
      if (!this.pointerDown) return;
      this.pointerDown = false;
      this.lastPos = null;
      this.audio.stopScrub();
      if (this.transition.active) return;

      const step = this.getCurrentStep();
      if (step && step.type === 'assemble' && this.assemblyState.phase === 'drag' && this.assemblyState.dragging) {
        this.assemblyState.dragging = false;
        const distCenter = Math.hypot(this.assemblyState.x - 300, this.assemblyState.y - 320);
        if (distCenter < 95) {
          this.snapAssemblyPart(step);
        }
        return;
      }

      if (step && this.isScrubStep(step.type)) {
        this.measureScrubProgress(step, true);
      }
    };

    this.canvas.addEventListener('pointerup', endPointer);
    this.canvas.addEventListener('pointercancel', endPointer);
    this.canvas.addEventListener('pointerleave', () => {
      this.hoverPos = null;
    });
  }

  clientToCanvas(clientX, clientY, pointerType = 'mouse') {
    const rect = this.canvas.getBoundingClientRect();
    const side = Math.max(1, Math.min(rect.width, rect.height));
    const left = rect.left + (rect.width - side) * 0.5;
    const top = rect.top + (rect.height - side) * 0.5;
    const x = ((clientX - left) / side) * this.size;
    let y = ((clientY - top) / side) * this.size;
    if (pointerType === 'touch') {
      const step = this.getCurrentStep();
      if (step && this.isScrubStep(step.type)) {
        y -= 14;
      }
    }
    return {
      x: Math.max(0, Math.min(this.size, x)),
      y: Math.max(0, Math.min(this.size, y))
    };
  }

  isScrubStep(type) {
    return (
      type === 'excavate' ||
      type === 'scrape' ||
      type === 'foam' ||
      type === 'rinse' ||
      type === 'sandblast' ||
      type === 'paint' ||
      type === 'polish'
    );
  }

  setToolStats({ radius, strength, turboActive }) {
    this.brushRadius = radius;
    this.brushStrength = strength;
    this.turboActive = turboActive;
  }

  loadOrder(orderSpec, bundles, beforeDataUrl, afterDataUrl, resumeState = null) {
    this.orderSpec = orderSpec;
    this.bundles = bundles;
    this.beforeDataUrl = beforeDataUrl;
    this.afterDataUrl = afterDataUrl;
    this.savedPaintMap = resumeState?.paintMap && typeof resumeState.paintMap === 'object'
      ? { ...resumeState.paintMap }
      : {};

    this.sampleMap.clear();
    const stride = 6;
    for (const partId of orderSpec.item.parts) {
      const b = bundles[partId];
      const data = b.maskCanvas.getContext('2d').getImageData(0, 0, this.size, this.size).data;
      const pts = [];
      for (let y = 0; y < this.size; y += stride) {
        for (let x = 0; x < this.size; x += stride) {
          const idx = (y * this.size + x) * 4;
          if (data[idx + 3] > 140) {
            pts.push({ x, y, idx: idx + 3 });
          }
        }
      }
      this.sampleMap.set(partId, pts);
    }

    this.stepIndex = 0;
    this.completed = false;
    this.awaitingTest = false;
    this.testingAnim = { active: false, timer: 0, duration: 1.55, itemId: orderSpec.item.id };
    this.isDisassembled = false;
    this.screwsInTray = 0;
    this.flyingScrews = [];
    this.particles = [];
    this.fallingChunks = [];
    this.lastChunkSoundAt = 0;
    this.excavateGlintDone = false;
    this.lastDigClodAt = 0;
    for (const partId of orderSpec.item.parts) {
      const plates = bundles[partId]?.crustPlates;
      if (Array.isArray(plates)) {
        for (const pl of plates) {
          pl.hp = pl.maxHp ?? 1;
          pl.cracked = false;
          pl.popped = false;
        }
      }
    }
    this.flashAlpha = 0;
    this.pointerDown = false;
    this.lastPos = null;
    this.firstTouchFired = false;
    this.equippedToolKey = null;
    this.toolLocked = false;
    this.activePaintSwatch = null;
    this.transition.active = false;
    this.transition.timer = 0;
    this.transition.kind = 'none';
    this.transition.prevStep = null;
    this.transition.prevToolKey = null;

    if (orderSpec.item.steps[0]?.type === 'excavate') {
      this.initExcavationMound();
    } else {
      this.excavateMaskCanvas.getContext('2d').clearRect(0, 0, this.size, this.size);
      this.excavateLayer.getContext('2d').clearRect(0, 0, this.size, this.size);
    }

    // Apply previously saved paint tint choices before replaying layers
    if (Object.keys(this.savedPaintMap).length > 0) {
      let tintedAny = false;
      for (const s of orderSpec.item.steps) {
        if (s.type === 'paint' && this.savedPaintMap[s.partId] != null) {
          const sw = s.palette?.[this.savedPaintMap[s.partId]] || s.palette?.[0];
          const b = bundles[s.partId];
          if (sw && b) {
            applyPartPaintTint(b, sw);
            tintedAny = true;
          }
        }
      }
      if (tintedAny) {
        this.afterDataUrl = renderCompositeSnapshot(orderSpec.item, bundles, 'clean');
      }
    }

    const totalSteps = orderSpec.item.steps.length;
    const replayCount = resumeState?.awaitingTest
      ? totalSteps
      : Number.isInteger(resumeState?.stepIndex) && resumeState.stepIndex > 0 && resumeState.stepIndex < totalSteps
        ? resumeState.stepIndex
        : 0;

    for (let i = 0; i < replayCount; i++) {
      const doneStep = orderSpec.item.steps[i];
      const bundle = bundles[doneStep.partId];
      if (doneStep.type === 'excavate') {
        this.excavateMaskCanvas.getContext('2d').clearRect(0, 0, this.size, this.size);
        this.excavateLayer.getContext('2d').clearRect(0, 0, this.size, this.size);
        this.excavateGlintDone = true;
      } else if (doneStep.type === 'scrape' && bundle) {
        if (Array.isArray(bundle.crustPlates)) {
          for (const pl of bundle.crustPlates) {
            pl.hp = 0;
            pl.cracked = true;
            pl.popped = true;
          }
        }
        bundle.crustMaskCanvas.getContext('2d').clearRect(0, 0, this.size, this.size);
        bundle.crustLayer.getContext('2d').clearRect(0, 0, this.size, this.size);
      } else if (doneStep.type === 'unscrew') {
        this.isDisassembled = true;
        this.screwsInTray += doneStep.screws?.length || 0;
      } else if (doneStep.type === 'foam' && bundle) {
        const mctx = bundle.foamMaskCanvas.getContext('2d');
        mctx.save();
        mctx.fillStyle = '#ffffff';
        mctx.fillRect(0, 0, this.size, this.size);
        mctx.globalCompositeOperation = 'destination-in';
        mctx.drawImage(bundle.maskCanvas, 0, 0);
        mctx.restore();
        this.rebuildFoamLayer(bundle);
      } else if (doneStep.type === 'rinse' && bundle) {
        bundle.foamMaskCanvas.getContext('2d').clearRect(0, 0, this.size, this.size);
        bundle.foamLayer.getContext('2d').clearRect(0, 0, this.size, this.size);
        bundle.muddyLayer.getContext('2d').clearRect(0, 0, this.size, this.size);
      } else if (doneStep.type === 'sandblast' && bundle) {
        bundle.rustyLayer.getContext('2d').clearRect(0, 0, this.size, this.size);
      } else if (doneStep.type === 'paint' && bundle) {
        bundle.primerLayer.getContext('2d').clearRect(0, 0, this.size, this.size);
      } else if (doneStep.type === 'polish' && bundle) {
        bundle.dullLayer.getContext('2d').clearRect(0, 0, this.size, this.size);
      } else if (doneStep.type === 'assemble') {
        this.isDisassembled = false;
        this.screwsInTray = Math.max(0, this.screwsInTray - (doneStep.screws?.length || 0));
      }
    }

    const revealIdx = Math.max(1, Math.floor(totalSteps / 2));
    if (replayCount >= revealIdx && orderSpec.hasMakerMark && !orderSpec.markRevealed) {
      orderSpec.markRevealed = true;
    }

    if (resumeState?.awaitingTest) {
      this.stepIndex = Math.max(0, totalSteps - 1);
      this.stepProgress = 100;
      this.dirtyPoints = [];
      this.awaitingTest = true;
      this.toolLocked = false;
      this.canvas.classList.remove('drag-cursor');
      this.syncCursorMode();
      this.onToolStateChange?.();
      this.onProgress?.(100, this.stepIndex);
      this.onReadyForTest?.();
    } else {
      this.stepIndex = replayCount;
      this.setupCurrentStep();
    }
  }

  getCurrentStep() {
    if (!this.orderSpec) return null;
    return this.orderSpec.item.steps[this.stepIndex] || null;
  }

  setupCurrentStep() {
    const step = this.getCurrentStep();
    this.stepProgress = 0;
    this.dirtyPoints = [];
    this.hintShown = false;
    this.hintPulseUntil = 0;
    this.lastScrubTime = performance.now();
    this.onHintReady?.(false);

    if (!step) return;

    const savedPaintIdx = this.savedPaintMap?.[step.partId];
    this.activePaintSwatch = step.type === 'paint'
      ? (step.palette?.[savedPaintIdx] || step.palette?.[0] || { hex: step.color || '#eab308', tint: false })
      : null;

    const dragMode = step.type === 'assemble' && this.assemblyState.phase === 'drag';
    this.canvas.classList.toggle('drag-cursor', dragMode);

    if (step.type === 'unscrew') {
      this.screwStates = step.screws.map((s) => ({
        x: s.x,
        y: s.y,
        progress: 0,
        done: false,
        angle: Math.random() * Math.PI
      }));
    } else if (step.type === 'precision') {
      this.precisionSpots = step.spots.map((s) => ({
        x: s.x,
        y: s.y,
        progress: 0,
        done: false
      }));
    } else if (step.type === 'assemble') {
      this.assemblyState = {
        phase: 'drag',
        dragging: false,
        x: 132,
        y: 162,
        grabOffsetX: 0,
        grabOffsetY: 0,
        scale: 0.56
      };
      this.screwStates = step.screws.map((s) => ({
        x: s.x,
        y: s.y,
        progress: 0,
        done: false,
        angle: 0
      }));
      this.canvas.classList.add('drag-cursor');
      this.onAssemblyPhase?.('drag');
    }

    const reqKey = this.getStepToolKey(step);
    if ((this.orderSpec?.orderNumber || 1) <= 2 || !reqKey) {
      this.equippedToolKey = reqKey;
      this.toolLocked = false;
    } else if (this.equippedToolKey !== reqKey) {
      this.toolLocked = true;
    } else {
      this.toolLocked = false;
    }
    this.syncCursorMode();
    this.onToolStateChange?.();
    this.onProgress?.(0, this.stepIndex);
  }

  selectToolFromRack(toolKey) {
    const step = this.getCurrentStep();
    if (!step || this.completed || this.awaitingTest || this.testingAnim.active) return false;
    const requiredKey = this.getStepToolKey(step);
    if (!requiredKey) return false;
    if (toolKey !== requiredKey) {
      this.audio.playWrongTool();
      this.onNeedToolPick?.(requiredKey, toolKey);
      return false;
    }
    this.equippedToolKey = toolKey;
    this.toolLocked = false;
    const target = this.hoverPos || { x: 468, y: 472 };
    this.toolPos = { x: target.x + 80, y: target.y + 80 };
    this.audio.playToolSwap();
    this.spawnBurst(target.x, target.y, 10, '#e2c48d');
    this.syncCursorMode();
    this.onToolStateChange?.();
    return true;
  }

  setPaintSwatch(swatch) {
    this.activePaintSwatch = swatch || null;
    const step = this.getCurrentStep();
    const partId = step?.partId;
    if (partId && this.bundles?.[partId]) {
      applyPartPaintTint(this.bundles[partId], swatch);
    }
  }

  initExcavationMound() {
    const mctx = this.excavateMaskCanvas.getContext('2d', { willReadFrequently: true });
    mctx.clearRect(0, 0, this.size, this.size);
    const isIntro = (this.orderSpec?.orderNumber || 2) === 1;
    const baseR = isIntro ? 186 : 235;

    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.arc(300, 315, baseR, 0, Math.PI * 2);
    mctx.fill();

    for (let i = 0; i < 18; i++) {
      const ang = (Math.PI * 2 * i) / 18 + (i % 2) * 0.14;
      const dist = (isIntro ? 142 : 185) + ((i * 19) % (isIntro ? 28 : 40));
      const r = (isIntro ? 36 : 48) + ((i * 23) % 24);
      mctx.beginPath();
      mctx.arc(300 + Math.cos(ang) * dist, 315 + Math.sin(ang) * dist, r, 0, Math.PI * 2);
      mctx.fill();
    }

    if (isIntro) {
      // Let a corner of the golden pocket watch gleam out of the dirt from frame 1
      mctx.save();
      mctx.globalCompositeOperation = 'destination-out';
      const peek = mctx.createRadialGradient(328, 298, 18, 328, 298, 56);
      peek.addColorStop(0, 'rgba(0,0,0,1)');
      peek.addColorStop(0.65, 'rgba(0,0,0,0.92)');
      peek.addColorStop(1, 'rgba(0,0,0,0)');
      mctx.fillStyle = peek;
      mctx.beginPath();
      mctx.arc(328, 298, 56, 0, Math.PI * 2);
      mctx.fill();
      mctx.restore();
    }

    this.excavateDirty = false;
    this.rebuildExcavateLayer();
  }

  rebuildExcavateLayer() {
    const ectx = this.excavateLayer.getContext('2d');
    ectx.clearRect(0, 0, this.size, this.size);

    ectx.save();
    ectx.shadowColor = 'rgba(8, 6, 4, 0.72)';
    ectx.shadowBlur = this.pointerDown ? 3 : 10;
    ectx.shadowOffsetY = 5;
    ectx.drawImage(this.excavateMaskCanvas, 0, 0);
    ectx.restore();

    ectx.save();
    ectx.globalCompositeOperation = 'source-in';
    ectx.fillStyle = this.soilPattern || '#4b3624';
    ectx.fillRect(0, 0, this.size, this.size);

    ectx.globalCompositeOperation = 'source-atop';
    const g = ectx.createLinearGradient(0, 70, 0, 560);
    g.addColorStop(0, 'rgba(255, 224, 175, 0.16)');
    g.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, 'rgba(8, 6, 4, 0.34)');
    ectx.fillStyle = g;
    ectx.fillRect(0, 0, this.size, this.size);
    ectx.restore();
  }

  rebuildCrustLayer(bundle) {
    const clctx = bundle.crustLayer.getContext('2d');
    clctx.clearRect(0, 0, this.size, this.size);

    clctx.save();
    clctx.shadowColor = 'rgba(8, 6, 4, 0.72)';
    clctx.shadowBlur = 2.5;
    clctx.shadowOffsetY = 3.5;
    clctx.drawImage(bundle.crustMaskCanvas, 0, 0);
    clctx.restore();

    clctx.save();
    clctx.globalCompositeOperation = 'source-in';
    clctx.fillStyle = this.soilPattern || '#5a4330';
    clctx.fillRect(0, 0, this.size, this.size);

    clctx.globalCompositeOperation = 'source-atop';
    clctx.globalAlpha = 0.45;
    clctx.drawImage(bundle.muddyLayer, 0, 0);
    clctx.globalAlpha = 1;
    clctx.fillStyle = 'rgba(130, 112, 86, 0.25)';
    clctx.fillRect(0, 0, this.size, this.size);
    if (bundle.crustCrackOverlay) {
      clctx.drawImage(bundle.crustCrackOverlay, 0, 0);
    }
    if (Array.isArray(bundle.crustPlates) && bundle.crustPlates.length > 0) {
      clctx.strokeStyle = 'rgba(12, 8, 4, 0.65)';
      clctx.lineWidth = 2.2;
      clctx.lineJoin = 'round';
      for (const plate of bundle.crustPlates) {
        if (!plate.cracked || plate.popped || !plate.verts?.length) continue;
        clctx.beginPath();
        plate.verts.forEach((v, idx) => {
          const px = plate.cx + v.dx;
          const py = plate.cy + v.dy;
          if (idx === 0) clctx.moveTo(px, py);
          else clctx.lineTo(px, py);
        });
        clctx.closePath();
        clctx.stroke();
      }
    }
    clctx.restore();

    clctx.save();
    clctx.globalCompositeOperation = 'destination-in';
    clctx.drawImage(bundle.maskCanvas, 0, 0);
    clctx.restore();
  }

  rebuildFoamLayer(bundle) {
    const fctx = bundle.foamLayer.getContext('2d');
    fctx.clearRect(0, 0, this.size, this.size);

    // 1. Contact drop-shadow thickness of raised foam mound
    fctx.save();
    fctx.shadowColor = 'rgba(10, 16, 20, 0.48)';
    fctx.shadowBlur = 5;
    fctx.shadowOffsetY = 2.5;
    fctx.drawImage(bundle.foamMaskCanvas, 0, 0);
    fctx.restore();

    // 2. Fill foam silhouette with realistic macro soap bubble pattern
    fctx.save();
    fctx.globalCompositeOperation = 'source-in';
    if (this.foamPattern) {
      fctx.fillStyle = this.foamPattern;
    } else {
      fctx.fillStyle = '#f1f6fb';
    }
    fctx.fillRect(0, 0, this.size, this.size);

    // 3. Soft overhead volume highlight & bottom shading
    fctx.globalCompositeOperation = 'source-atop';
    const volGrad = fctx.createLinearGradient(0, 90, 0, 520);
    volGrad.addColorStop(0, 'rgba(255, 255, 255, 0.24)');
    volGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
    volGrad.addColorStop(1, 'rgba(170, 192, 212, 0.22)');
    fctx.fillStyle = volGrad;
    fctx.fillRect(0, 0, this.size, this.size);
    fctx.restore();

    // 4. Hard clip inside object silhouette
    fctx.save();
    fctx.globalCompositeOperation = 'destination-in';
    fctx.drawImage(bundle.maskCanvas, 0, 0);
    fctx.restore();
  }

  applyBrushStroke(step, from, to, speedPx) {
    const bundle = this.bundles?.[step.partId];
    if (!bundle) return;

    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const stepSize = Math.max(5, this.brushRadius * 0.28);
    const count = Math.max(1, Math.ceil(dist / stepSize));

    const hardness = this.orderSpec?.dirtHardness || 1;
    const effectivePower = this.turboActive
      ? 0.90
      : Math.min(0.86, Math.max(0.28, this.brushStrength / Math.pow(hardness, 0.36)));

    if (step.type === 'excavate') {
      const ectx = this.excavateMaskCanvas.getContext('2d');
      ectx.save();
      ectx.globalCompositeOperation = 'destination-out';
      const moveAngle = dist > 2 ? Math.atan2(to.y - from.y, to.x - from.x) : -0.6;
      const powerBoost = 1 + effectivePower * 0.35;
      const rx = this.brushRadius * 1.12 * powerBoost;
      for (let i = 0; i <= count; i++) {
        const t = count === 0 ? 1 : i / count;
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t;
        const g = ectx.createRadialGradient(x, y, rx * 0.12, x, y, rx);
        g.addColorStop(0, 'rgba(0,0,0,0.96)');
        g.addColorStop(0.75, 'rgba(0,0,0,0.90)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ectx.fillStyle = g;
        ectx.beginPath();
        ectx.arc(x, y, rx, 0, Math.PI * 2);
        ectx.fill();

        // Carve jagged peripheral soil chips along trowel stroke
        ectx.fillStyle = '#000000';
        for (let k = 0; k < 2; k++) {
          const ang = moveAngle + (k === 0 ? 1.1 : -1.1) + (Math.random() - 0.5) * 0.9;
          const off = rx * (0.55 + Math.random() * 0.35);
          const chipX = x + Math.cos(ang) * off;
          const chipY = y + Math.sin(ang) * off;
          const cr = (9 + Math.random() * 10) * (0.85 + effectivePower * 0.25);
          ectx.beginPath();
          for (let v = 0; v < 5; v++) {
            const va = (Math.PI * 2 * v) / 5;
            const vr = cr * (0.65 + Math.random() * 0.55);
            const vx = chipX + Math.cos(va) * vr;
            const vy = chipY + Math.sin(va) * vr;
            if (v === 0) ectx.moveTo(vx, vy);
            else ectx.lineTo(vx, vy);
          }
          ectx.closePath();
          ectx.fill();
        }
      }
      ectx.restore();
      this.excavateDirty = true;

      const nowPerf = performance.now();
      if (speedPx > 5.5 && nowPerf - this.lastDigClodAt > 125) {
        this.lastDigClodAt = nowPerf;
        this.spawnExcavationClod(to.x, to.y, moveAngle, speedPx);
      }
    } else if (step.type === 'scrape') {
      const mctx = bundle.crustMaskCanvas.getContext('2d');
      mctx.save();
      mctx.globalCompositeOperation = 'destination-out';
      mctx.fillStyle = '#000000';
      const moveAngle = Math.hypot(to.x - from.x, to.y - from.y) > 2
        ? Math.atan2(to.y - from.y, to.x - from.x)
        : -0.6;
      const powerBoost = 1 + effectivePower * 0.35;
      const bw = this.brushRadius * 0.88 * powerBoost;
      const halfThick = 10 + effectivePower * 4;
      for (let i = 0; i <= count; i++) {
        const t = count === 0 ? 1 : i / count;
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t;
        mctx.save();
        mctx.translate(x, y);
        mctx.rotate(moveAngle);
        mctx.fillRect(-halfThick, -bw / 2, halfThick * 2, bw);
        for (let k = 0; k < 2; k++) {
          const cy = (Math.random() - 0.5) * bw * 0.7;
          const cr = (7 + Math.random() * 8) * (0.9 + effectivePower * 0.25);
          mctx.beginPath();
          for (let v = 0; v < 5; v++) {
            const a = (Math.PI * 2 * v) / 5;
            const r2 = cr * (0.65 + Math.random() * 0.5);
            if (v === 0) mctx.moveTo(Math.cos(a) * r2, cy + Math.sin(a) * r2);
            else mctx.lineTo(Math.cos(a) * r2, cy + Math.sin(a) * r2);
          }
          mctx.closePath();
          mctx.fill();
        }
        mctx.restore();
      }

      // Pry and snap off whole cracked Voronoi clay crust plates under the scraper blade
      if (Array.isArray(bundle.crustPlates) && bundle.crustPlates.length > 0) {
        const segDx = to.x - from.x;
        const segDy = to.y - from.y;
        const segLenSq = segDx * segDx + segDy * segDy;
        const dmg = effectivePower * (0.42 + Math.min(0.48, speedPx / 28));
        const perfNow = performance.now();

        for (const plate of bundle.crustPlates) {
          if (plate.popped || !plate.verts?.length) continue;
          let distSq;
          if (segLenSq < 1e-4) {
            distSq = (plate.cx - to.x) ** 2 + (plate.cy - to.y) ** 2;
          } else {
            const u = Math.max(0, Math.min(1, ((plate.cx - from.x) * segDx + (plate.cy - from.y) * segDy) / segLenSq));
            const projX = from.x + u * segDx;
            const projY = from.y + u * segDy;
            distSq = (plate.cx - projX) ** 2 + (plate.cy - projY) ** 2;
          }
          const hitR = this.brushRadius * 0.92 + plate.avgR * 0.35;
          if (distSq <= hitR * hitR) {
            plate.hp -= dmg;
            if (plate.hp < 0.62) {
              plate.cracked = true;
            }
            if (plate.hp <= 0) {
              plate.popped = true;
              mctx.beginPath();
              plate.verts.forEach((v, idx) => {
                const px = plate.cx + v.dx * 1.08;
                const py = plate.cy + v.dy * 1.08;
                if (idx === 0) mctx.moveTo(px, py);
                else mctx.lineTo(px, py);
              });
              mctx.closePath();
              mctx.fill();

              this.spawnFallingCrustChunk(plate, moveAngle, speedPx);
              if (perfNow - this.lastChunkSoundAt > 95) {
                this.lastChunkSoundAt = perfNow;
                this.audio.playScrapeChip();
              }
            }
          }
        }
      }
      mctx.restore();
      bundle.crustDirty = true;
    } else if (step.type === 'foam') {
      const mctx = bundle.foamMaskCanvas.getContext('2d');
      mctx.save();
      mctx.globalCompositeOperation = 'source-over';
      mctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      const powerBoost = 1 + effectivePower * 0.32;

      for (let i = 0; i <= count; i++) {
        const t = count === 0 ? 1 : i / count;
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t;
        const spread = this.brushRadius * 0.90 * powerBoost;

        // Core dense mound
        mctx.beginPath();
        mctx.arc(x, y, this.brushRadius * 0.56 * powerBoost, 0, Math.PI * 2);
        mctx.fill();

        // Clustered billowing foam lobes (crisp edges, zero blurry gradient)
        for (let b = 0; b < 5; b++) {
          const ang = Math.random() * Math.PI * 2;
          const distOff = Math.random() * spread * 0.65;
          const bx = x + Math.cos(ang) * distOff;
          const by = y + Math.sin(ang) * distOff;
          const br = 5 + Math.random() * (this.brushRadius * 0.30 * powerBoost);
          mctx.beginPath();
          mctx.arc(bx, by, br, 0, Math.PI * 2);
          mctx.fill();
        }
      }
      mctx.globalCompositeOperation = 'destination-in';
      mctx.drawImage(bundle.maskCanvas, 0, 0);
      mctx.restore();

      bundle.foamDirty = true;
    } else if (step.type === 'rinse') {
      const cAlpha = Math.min(0.96, 0.58 + effectivePower * 0.36);
      const eAlpha = Math.min(0.85, 0.38 + effectivePower * 0.30);
      const rx = this.brushRadius * 1.05;
      const ry = this.brushRadius * 0.66;
      for (const targetCanvas of [bundle.foamMaskCanvas, bundle.foamLayer, bundle.muddyLayer]) {
        const lctx = targetCanvas.getContext('2d');
        lctx.save();
        lctx.globalCompositeOperation = 'destination-out';
        for (let i = 0; i <= count; i++) {
          const t = count === 0 ? 1 : i / count;
          const x = from.x + (to.x - from.x) * t;
          const y = from.y + (to.y - from.y) * t;
          const g = lctx.createRadialGradient(x, y, rx * 0.12, x, y, rx);
          g.addColorStop(0, `rgba(0,0,0,${cAlpha})`);
          g.addColorStop(0.68, `rgba(0,0,0,${cAlpha})`);
          g.addColorStop(0.86, `rgba(0,0,0,${eAlpha})`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          lctx.fillStyle = g;
          lctx.beginPath();
          lctx.ellipse(x, y, rx, ry, -0.32, 0, Math.PI * 2);
          lctx.fill();
        }
        lctx.restore();
      }
    } else {
      const isSandblast = step.type === 'sandblast';
      const isPaint = step.type === 'paint';
      const targetLayer = isSandblast ? bundle.rustyLayer : isPaint ? bundle.primerLayer : bundle.dullLayer;
      const r = this.brushRadius * (isSandblast ? 0.78 : isPaint ? 0.96 : 0.90);
      const cAlpha = Math.min(0.95, (isSandblast ? 0.48 : isPaint ? 0.56 : 0.56) + effectivePower * 0.40);
      const eAlpha = cAlpha * (isPaint ? 0.62 : 0.58);
      const lctx = targetLayer.getContext('2d');
      lctx.save();
      lctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i <= count; i++) {
        const t = count === 0 ? 1 : i / count;
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t;
        const g = lctx.createRadialGradient(x, y, r * 0.12, x, y, r);
        g.addColorStop(0, `rgba(0,0,0,${cAlpha})`);
        g.addColorStop(isPaint ? 0.78 : 0.66, `rgba(0,0,0,${cAlpha})`);
        g.addColorStop(0.88, `rgba(0,0,0,${eAlpha})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        lctx.fillStyle = g;
        lctx.beginPath();
        lctx.arc(x, y, r, 0, Math.PI * 2);
        lctx.fill();
      }
      lctx.restore();
    }

    this.spawnToolParticles(step.type, to.x, to.y, speedPx, step);
    this.audio.updateScrub(step.type, speedPx, this.stepProgress / 100, this.turboActive);

    const now = performance.now();
    if (now - this.lastMeasureAt > 140) {
      this.lastMeasureAt = now;
      this.measureScrubProgress(step, false);
    }
  }

  measureScrubProgress(step, force) {
    const pts = this.sampleMap.get(step.partId);
    const bundle = this.bundles?.[step.partId];
    if (!pts || !bundle || pts.length === 0) return;

    let layerCanvas = bundle.dullLayer;
    let isCoverageGoal = false;
    if (step.type === 'excavate') {
      layerCanvas = this.excavateMaskCanvas;
    } else if (step.type === 'scrape') {
      layerCanvas = bundle.crustMaskCanvas;
    } else if (step.type === 'foam') {
      layerCanvas = bundle.foamMaskCanvas;
      isCoverageGoal = true;
    } else if (step.type === 'rinse') {
      layerCanvas = bundle.muddyLayer;
    } else if (step.type === 'sandblast') {
      layerCanvas = bundle.rustyLayer;
    } else if (step.type === 'paint') {
      layerCanvas = bundle.primerLayer;
    }

    const data = layerCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, this.size, this.size).data;
    let doneCount = 0;
    const remaining = [];
    let clearedSample = null;

    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      const a = data[pt.idx];
      const ok = isCoverageGoal ? a > 115 : a < 76;
      if (ok) {
        doneCount += 1;
        if (!clearedSample || Math.random() < 0.08) clearedSample = pt;
      } else {
        remaining.push(pt);
      }
    }

    const rawPct = (doneCount / pts.length) * 100;
    const ordNum = this.orderSpec?.orderNumber || 3;
    const baseThresh = step.type === 'excavate' ? 86 : step.type === 'scrape' ? 88 : isCoverageGoal ? 86 : 89;
    const threshold = ordNum === 1 ? baseThresh - 11 : ordNum <= 3 ? baseThresh - 5 : baseThresh;
    const displayPct = Math.min(100, (rawPct / threshold) * 100);
    this.stepProgress = displayPct;
    this.dirtyPoints = remaining;
    this.onProgress?.(displayPct, this.stepIndex);

    if (step.type === 'excavate' && displayPct >= 30 && !this.excavateGlintDone) {
      this.excavateGlintDone = true;
      const gx = clearedSample?.x ?? 300;
      const gy = clearedSample?.y ?? 320;
      this.spawnBurst(gx, gy, 24, '#fbbf24');
      this.flashAlpha = Math.max(this.flashAlpha, 0.35);
      this.audio.playSample('sfx_blade_ring', { volume: 0.25, rateMin: 1.30, rateMax: 1.38 });
    }

    const hintTriggerPct = ordNum <= 2 ? 62 : 72;
    if (displayPct >= hintTriggerPct && !this.hintShown) {
      this.hintShown = true;
      this.onHintReady?.(true);
    }

    if (rawPct >= threshold || (force && rawPct >= threshold - 1)) {
      this.completeScrubStep(step, bundle);
    }
  }

  completeScrubStep(step, bundle) {
    if (step.type === 'excavate') {
      this.excavateDirty = false;
      this.excavateMaskCanvas.getContext('2d').clearRect(0, 0, this.size, this.size);
      this.excavateLayer.getContext('2d').clearRect(0, 0, this.size, this.size);
      this.spawnBurst(300, 320, 22, '#9c7853');
    } else if (step.type === 'scrape') {
      bundle.crustDirty = false;
      if (Array.isArray(bundle.crustPlates)) {
        let spawned = 0;
        for (const plate of bundle.crustPlates) {
          if (!plate.popped && plate.verts?.length) {
            plate.popped = true;
            if (spawned < 6) {
              this.spawnFallingCrustChunk(plate, -0.6, 12);
              spawned += 1;
            }
          }
        }
      }
      bundle.crustMaskCanvas.getContext('2d').clearRect(0, 0, this.size, this.size);
      bundle.crustLayer.getContext('2d').clearRect(0, 0, this.size, this.size);
    } else if (step.type === 'foam') {
      bundle.foamDirty = false;
      const mctx = bundle.foamMaskCanvas.getContext('2d');
      mctx.save();
      mctx.fillStyle = '#ffffff';
      mctx.fillRect(0, 0, this.size, this.size);
      mctx.globalCompositeOperation = 'destination-in';
      mctx.drawImage(bundle.maskCanvas, 0, 0);
      mctx.restore();
      this.rebuildFoamLayer(bundle);
    } else if (step.type === 'rinse') {
      bundle.foamDirty = false;
      bundle.foamMaskCanvas.getContext('2d').clearRect(0, 0, this.size, this.size);
      bundle.foamLayer.getContext('2d').clearRect(0, 0, this.size, this.size);
      bundle.muddyLayer.getContext('2d').clearRect(0, 0, this.size, this.size);
    } else if (step.type === 'sandblast') {
      bundle.rustyLayer.getContext('2d').clearRect(0, 0, this.size, this.size);
    } else if (step.type === 'paint') {
      bundle.primerLayer.getContext('2d').clearRect(0, 0, this.size, this.size);
    } else if (step.type === 'polish') {
      bundle.dullLayer.getContext('2d').clearRect(0, 0, this.size, this.size);
    }

    this.advanceStep();
  }

  snapAssemblyPart() {
    this.assemblyState.phase = 'fasten';
    this.assemblyState.dragging = false;
    this.assemblyState.x = 300;
    this.assemblyState.y = 320;
    this.assemblyState.scale = 1;
    this.isDisassembled = false;
    this.canvas.classList.remove('drag-cursor');
    this.audio.playSnapClick();
    this.spawnBurst(300, 320, 22, '#f0d8a8');
    if ((this.orderSpec?.orderNumber || 1) >= 3 && this.equippedToolKey !== 'tool_screwdriver') {
      this.toolLocked = true;
    } else {
      this.equippedToolKey = 'tool_screwdriver';
      this.toolLocked = false;
    }
    this.syncCursorMode();
    this.onToolStateChange?.();
    this.onAssemblyPhase?.('fasten');
    this.onProgress?.(50, this.stepIndex);
  }

  advanceStep() {
    this.stepProgress = 100;
    this.dirtyPoints = [];
    this.hintPulseUntil = 0;
    this.flashAlpha = 0.72;
    this.pointerDown = false;
    this.audio.stopScrub();
    this.onHintReady?.(false);
    this.onProgress?.(100, this.stepIndex);

    const prevStep = this.getCurrentStep();
    const prevToolKey = this.getStepToolKey(
      prevStep,
      prevStep?.type === 'assemble' ? 'fasten' : this.assemblyState.phase
    );
    if (prevStep?.type === 'unscrew') {
      this.isDisassembled = true;
    }

    this.spawnBurst(300, 320, 26, '#e2c48d');

    if (this.stepIndex < this.orderSpec.item.steps.length - 1) {
      this.audio.playStageClear();
      this.stepIndex += 1;
      this.setupCurrentStep();
      const nextStep = this.getCurrentStep();

      const revealIdx = Math.max(1, Math.floor(this.orderSpec.item.steps.length / 2));
      if (
        this.stepIndex === revealIdx &&
        this.orderSpec.hasMakerMark &&
        !this.orderSpec.markRevealed
      ) {
        this.orderSpec.markRevealed = true;
        this.spawnBurst(300, 320, 34, '#fbbf24');
        this.onMakerMarkReveal?.(this.orderSpec);
      }

      let kind = 'tool_swap';
      let duration = 0.56;
      if (prevStep?.type === 'unscrew' && this.orderSpec.item.coverPartId) {
        kind = 'detach_to_tray';
        duration = 0.72;
        this.audio.playPartLift();
      } else if (nextStep?.type === 'assemble') {
        kind = 'prep_assemble';
        duration = 0.68;
        this.audio.playPartLift();
      } else if (
        this.isDisassembled &&
        prevStep?.partId &&
        nextStep?.partId &&
        prevStep.partId !== nextStep.partId
      ) {
        kind = 'swap_parts';
        duration = 0.68;
        this.audio.playPartLift();
      } else if (prevStep?.type === 'foam' && nextStep?.type === 'rinse') {
        kind = 'foam_react';
        duration = 0.66;
        this.audio.playFoamFizz();
        const b = this.bundles?.[prevStep.partId];
        if (b) {
          const fctx = b.foamLayer.getContext('2d');
          fctx.save();
          fctx.globalCompositeOperation = 'source-atop';
          fctx.fillStyle = 'rgba(148, 128, 102, 0.14)';
          fctx.fillRect(0, 0, this.size, this.size);
          fctx.restore();
        }
      }

      this.transition = {
        active: true,
        timer: 0,
        duration,
        kind,
        prevStep,
        prevToolKey,
        toolFrom: { x: this.toolPos.x, y: this.toolPos.y },
        swapSoundPlayed: false
      };

      this.onStageComplete?.(this.stepIndex, prevStep, nextStep);
    } else {
      this.awaitingTest = true;
      this.toolLocked = false;
      this.canvas.classList.remove('drag-cursor');
      this.syncCursorMode();
      this.audio.playStageClear();
      this.onToolStateChange?.();
      this.onReadyForTest?.();
    }
  }

  runFunctionalTest() {
    if (!this.awaitingTest || this.testingAnim.active || this.completed) return;
    this.awaitingTest = false;
    this.pointerDown = false;
    this.syncCursorMode();
    const itemId = this.orderSpec?.item?.id || 'pocket_watch';
    this.testingAnim = {
      active: true,
      timer: 0,
      duration: 1.55,
      itemId
    };

    if (
      itemId === 'pocket_watch' ||
      itemId === 'imperial_medallion' ||
      itemId === 'brass_sextant' ||
      itemId === 'ship_binnacle' ||
      itemId === 'steam_governor' ||
      itemId === 'celestial_armillary'
    ) {
      this.audio.playWatchTick();
      if (itemId === 'steam_governor') {
        this.audio.playFoamFizz();
      }
    } else if (
      itemId === 'vintage_lighter' ||
      itemId === 'railroad_lantern' ||
      itemId === 'moto_carburetor'
    ) {
      this.audio.playLighterSpark();
    } else if (itemId === 'espresso_lever') {
      this.audio.playFoamFizz();
    } else if (itemId === 'vintage_camera' || itemId === 'brass_microscope') {
      this.audio.playCameraShutter();
    } else if (itemId === 'retro_console' || itemId === 'arcade_stick') {
      this.audio.playRetroBoot();
    } else if (
      itemId === 'music_box' ||
      itemId === 'gramophone' ||
      itemId === 'tube_radio' ||
      itemId === 'vintage_saxophone' ||
      itemId === 'faberge_egg'
    ) {
      this.audio.playMusicBoxTune();
    } else {
      this.audio.playBladeRing();
    }
  }

  triggerSpotHint() {
    const step = this.getCurrentStep();
    if (!step || !this.isScrubStep(step.type)) return;
    this.measureScrubProgress(step, true);
    if (this.dirtyPoints.length > 0) {
      this.hintPulseUntil = performance.now() + 3000;
    }
  }

  spawnToolParticles(type, x, y, speedPx, step = null) {
    const count = this.turboActive ? 5 : speedPx > 14 ? 4 : 2;
    for (let i = 0; i < count; i++) {
      if (this.particles.length > 180) break;
      const ang = Math.random() * Math.PI * 2;
      let spd = 0.9 + Math.random() * 2.5;
      let vx = Math.cos(ang) * spd;
      let vy = Math.sin(ang) * spd - 0.4;
      let gy = 0;
      let grow = 0;
      let rot = Math.random() * Math.PI * 2;
      let vrot = 0;
      let color = '#e0f2fe';
      let radius = 3 + Math.random() * 4.5;
      let kind = 'circle';
      let decay = 0.032 + Math.random() * 0.024;

      if (type === 'excavate') {
        if (Math.random() > 0.35) {
          kind = 'clod';
          spd = 1.6 + Math.random() * 2.8;
          vx = Math.cos(ang) * spd;
          vy = Math.sin(ang) * spd - 1.4;
          gy = 0.18;
          vrot = (Math.random() - 0.5) * 0.28;
          radius = 4 + Math.random() * 4.5;
          const rPalette = ['#5c4028', '#3f2a1a', '#7c5c3e'];
          color = rPalette[i % rPalette.length];
          decay = 0.032 + Math.random() * 0.02;
        } else {
          kind = 'dust';
          spd = 0.7 + Math.random() * 1.2;
          vx = Math.cos(ang) * spd;
          vy = Math.sin(ang) * spd - 0.4;
          grow = 0.2;
          radius = 4.5 + Math.random() * 4;
          color = 'rgba(130, 98, 68, 0.45)';
          decay = 0.028;
        }
      } else if (type === 'scrape') {
        if (Math.random() > 0.3) {
          kind = 'clod';
          spd = 2.0 + Math.random() * 3.0;
          vx = Math.cos(ang) * spd;
          vy = Math.sin(ang) * spd - 1.5;
          gy = 0.22;
          vrot = (Math.random() - 0.5) * 0.36;
          radius = 3.5 + Math.random() * 4;
          const sPalette = ['#8a7052', '#6b553b', '#a89070'];
          color = sPalette[i % sPalette.length];
          decay = 0.034 + Math.random() * 0.02;
        } else {
          kind = 'dust';
          grow = 0.18;
          radius = 4 + Math.random() * 3;
          color = 'rgba(180, 158, 126, 0.42)';
          decay = 0.03;
        }
      } else if (type === 'paint') {
        spd = 1.1 + Math.random() * 2.0;
        vx = Math.cos(ang) * spd;
        vy = Math.sin(ang) * spd;
        color = this.activePaintSwatch?.hex || step?.color || '#eab308';
        radius = 2.0 + Math.random() * 2.8;
        decay = 0.042 + Math.random() * 0.02;
      } else if (this.turboActive && type !== 'rinse' && type !== 'sandblast') {
        color = Math.random() > 0.4 ? '#38bdf8' : '#e2c48d';
        radius = 2.5 + Math.random() * 3;
      } else if (type === 'foam') {
        color = 'rgba(255, 255, 255, 0.94)';
        radius = 3.5 + Math.random() * 5;
      } else if (type === 'rinse') {
        if (Math.random() > 0.42) {
          kind = 'streak';
          spd = 2.4 + Math.random() * 2.8;
          const fanAng = ang * 0.7 - Math.PI * 0.4;
          vx = Math.cos(fanAng) * spd;
          vy = Math.sin(fanAng) * spd;
          gy = 0.06;
          radius = 1.6 + Math.random() * 1.3;
          color = 'rgba(215, 244, 255, 0.92)';
          decay = 0.042 + Math.random() * 0.025;
        } else {
          gy = 0.08;
          spd = 1.4 + Math.random() * 2.0;
          vx = Math.cos(ang) * spd;
          vy = Math.sin(ang) * spd - 0.5;
          color = 'rgba(255, 255, 255, 0.88)';
          radius = 2.6 + Math.random() * 3.4;
        }
      } else if (type === 'sandblast') {
        if (Math.random() > 0.42) {
          kind = 'spark';
          spd = 2.8 + Math.random() * 3.0;
          vx = Math.cos(ang) * spd;
          vy = Math.sin(ang) * spd - 0.6;
          gy = 0.14;
          radius = 1.6 + Math.random() * 1.4;
          color = Math.random() > 0.3 ? '#fde68a' : '#fbbf24';
          decay = 0.045 + Math.random() * 0.025;
        } else {
          kind = 'dust';
          spd = 0.8 + Math.random() * 1.4;
          vx = Math.cos(ang) * spd;
          vy = Math.sin(ang) * spd - 0.35;
          gy = -0.02;
          grow = 0.22;
          radius = 4 + Math.random() * 4;
          color = Math.random() > 0.45 ? 'rgba(172, 84, 42, 0.55)' : 'rgba(214, 190, 152, 0.50)';
          decay = 0.028 + Math.random() * 0.02;
        }
      } else {
        color = '#fef3c7';
        radius = 4 + Math.random() * 4.5;
        kind = 'star';
      }

      this.particles.push({
        x: x + (Math.random() - 0.5) * this.brushRadius * 0.65,
        y: y + (Math.random() - 0.5) * this.brushRadius * 0.65,
        vx,
        vy,
        gy,
        grow,
        rot,
        vrot,
        life: 1,
        decay,
        radius,
        color,
        kind
      });
    }
  }

  spawnPrecisionParticles(kind, x, y) {
    if (this.particles.length > 180) return;
    if (kind === 'oil') {
      if (Math.random() < 0.45) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 0.6 + Math.random() * 1.3;
        this.particles.push({
          x: x + (Math.random() - 0.5) * 6,
          y: y + (Math.random() - 0.5) * 6,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 0.3,
          gy: 0.04,
          grow: 0,
          life: 1,
          decay: 0.032,
          radius: 2.6 + Math.random() * 1.6,
          color: Math.random() > 0.3 ? '#f59e0b' : '#fef08a',
          kind: 'oil_drop'
        });
      }
    } else if (kind === 'solder') {
      const n = Math.random() > 0.5 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        if (this.particles.length > 180) break;
        const ang = Math.random() * Math.PI * 2;
        const spd = 2.4 + Math.random() * 3.0;
        this.particles.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 0.7,
          gy: 0.14,
          grow: 0,
          life: 1,
          decay: 0.05,
          radius: 1.5 + Math.random() * 1.2,
          color: Math.random() > 0.35 ? '#ffffff' : '#fbbf24',
          kind: 'spark'
        });
      }
      if (Math.random() < 0.35 && this.particles.length <= 180) {
        this.particles.push({
          x: x + (Math.random() - 0.5) * 8,
          y: y - 4,
          vx: (Math.random() - 0.5) * 0.4,
          vy: -0.9 - Math.random() * 0.4,
          gy: 0,
          grow: 0.28,
          life: 0.9,
          decay: 0.022,
          radius: 4 + Math.random() * 2,
          color: 'rgba(226, 232, 240, 0.42)',
          kind: 'smoke'
        });
      }
    } else if (kind === 'contacts') {
      if (Math.random() < 0.65) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 1.8 + Math.random() * 2.2;
        this.particles.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          gy: 0.03,
          grow: 0,
          life: 1,
          decay: 0.045,
          radius: 1.6 + Math.random() * 1.1,
          color: Math.random() > 0.4 ? 'rgba(125, 211, 252, 0.92)' : 'rgba(110, 231, 183, 0.88)',
          kind: 'streak'
        });
      }
    }
  }

  spawnBurst(cx, cy, count = 24, color = '#fde68a') {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.25;
      const spd = 2 + Math.random() * 4;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 1,
        decay: 0.024 + Math.random() * 0.015,
        radius: 3.5 + Math.random() * 4,
        color: i % 2 === 0 ? color : '#ffffff',
        kind: 'star'
      });
    }
  }

  startLoop() {
    const tick = (now) => {
      this.rafId = requestAnimationFrame(tick);
      const rawDtMs = Math.max(0, now - this.lastFrameAt);
      const dt = Math.min(0.05, Math.max(0.004, rawDtMs / 1000));
      this.lastFrameAt = now;
      this.onFrameSample?.(rawDtMs, now);
      this.update(now, dt);
      this.render(now);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  update(now, dt) {
    this.sweepPhase = (this.sweepPhase + dt * 0.55) % 2.2;
    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.5);
    }

    const step = this.getCurrentStep();
    if (this.testingAnim.active) {
      this.testingAnim.timer += dt;
      const testId = this.testingAnim.itemId;
      if ((testId === 'vintage_lighter' || testId === 'railroad_lantern') && Math.random() < 0.45 && this.particles.length < 140) {
        const fx = testId === 'railroad_lantern' ? 300 : 295;
        const fy = testId === 'railroad_lantern' ? 315 : 175;
        this.particles.push({
          x: fx + (Math.random() - 0.5) * 8,
          y: fy + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 0.6,
          vy: -1.4 - Math.random() * 1.2,
          gy: -0.02,
          life: 0.9,
          decay: 0.045,
          radius: 2.2 + Math.random() * 2,
          color: Math.random() > 0.4 ? '#fde047' : '#f97316',
          kind: 'circle'
        });
      } else if (
        (testId === 'music_box' ||
          testId === 'gramophone' ||
          testId === 'tube_radio' ||
          testId === 'vintage_saxophone' ||
          testId === 'faberge_egg') &&
        Math.random() < 0.25 &&
        this.particles.length < 140
      ) {
        this.particles.push({
          x: 300 + (Math.random() - 0.5) * 140,
          y: 260 + (Math.random() - 0.5) * 40,
          vx: (Math.random() - 0.5) * 0.9,
          vy: -1.3 - Math.random() * 0.9,
          life: 1,
          decay: 0.025,
          radius: 5 + Math.random() * 3,
          color: '#fde68a',
          kind: 'star'
        });
      } else if (
        (testId === 'steam_governor' || testId === 'espresso_lever' || testId === 'jade_censer') &&
        Math.random() < 0.38 &&
        this.particles.length < 140
      ) {
        this.particles.push({
          x: 300 + (Math.random() - 0.5) * 44,
          y: testId === 'jade_censer' ? 215 : 235,
          vx: (Math.random() - 0.5) * 0.7,
          vy: -1.1 - Math.random() * 0.9,
          gy: -0.01,
          grow: 0.24,
          life: 0.95,
          decay: 0.022,
          radius: 5 + Math.random() * 4,
          color: 'rgba(241, 245, 249, 0.55)',
          kind: 'smoke'
        });
      } else if (testId === 'moto_carburetor' && Math.random() < 0.35 && this.particles.length < 140) {
        const sideX = Math.random() > 0.5 ? 245 : 355;
        this.particles.push({
          x: sideX + (Math.random() - 0.5) * 10,
          y: 230,
          vx: (Math.random() - 0.5) * 2.2,
          vy: -1.8 - Math.random() * 1.4,
          gy: 0.08,
          life: 0.85,
          decay: 0.05,
          radius: 1.8 + Math.random() * 1.2,
          color: '#fde047',
          kind: 'spark'
        });
      }

      if (this.testingAnim.timer >= this.testingAnim.duration) {
        this.testingAnim.active = false;
        this.completed = true;
        this.audio.playCompleteFanfare();
        this.spawnBurst(300, 320, 32, '#fde68a');
        const finalAfter = renderCompositeSnapshot(this.orderSpec.item, this.bundles, 'clean');
        this.afterDataUrl = finalAfter;
        this.onItemComplete?.({
          beforeDataUrl: this.beforeDataUrl,
          afterDataUrl: finalAfter
        });
      }
    } else if (this.transition.active) {
      this.transition.timer += dt;
      const p = Math.min(1, this.transition.timer / this.transition.duration);

      if (p >= 0.42 && !this.transition.swapSoundPlayed && !this.toolLocked) {
        this.transition.swapSoundPlayed = true;
        this.audio.playToolSwap();
      }

      if (this.transition.kind === 'foam_react' && Math.random() < 0.75) {
        const pts = this.sampleMap.get(this.transition.prevStep?.partId);
        if (pts && pts.length > 0) {
          for (let i = 0; i < 2; i++) {
            if (this.particles.length > 140) break;
            const pt = pts[Math.floor(Math.random() * pts.length)];
            this.particles.push({
              x: pt.x + (Math.random() - 0.5) * 14,
              y: pt.y + (Math.random() - 0.5) * 14,
              vx: (Math.random() - 0.5) * 0.6,
              vy: -0.8 - Math.random() * 1.1,
              life: 0.9,
              decay: 0.035 + Math.random() * 0.02,
              radius: 2.2 + Math.random() * 2.8,
              color: 'rgba(255, 255, 255, 0.92)',
              kind: 'circle'
            });
          }
        }
      }

      const holster = { x: 648, y: 652 };
      if (p >= 0.45 && !this.toolLocked) {
        const u = this.easeOutCubic((p - 0.45) / 0.55);
        const target = this.computeToolTarget(now, step);
        this.toolPos.x = this.lerp(holster.x, target.x, u);
        this.toolPos.y = this.lerp(holster.y, target.y, u);
      }

      if (p >= 1) {
        this.transition.active = false;
        this.lastPos = this.pointerPos;
      }
    } else {
      if (!this.completed && !this.awaitingTest && !this.testingAnim.active && !this.toolLocked && step) {
        if (step.type === 'unscrew' && this.pointerDown && this.pointerPos) {
          this.updateScrewHold(this.screwStates, dt, true);
        }
        if (step.type === 'assemble' && this.assemblyState.phase === 'fasten' && this.pointerDown && this.pointerPos) {
          this.updateScrewHold(this.screwStates, dt, false);
        }
        if (step.type === 'precision' && this.pointerDown && this.pointerPos) {
          this.updatePrecisionHold(now, dt, step);
        }
        if (
          this.isScrubStep(step.type) &&
          this.stepProgress >= 75 &&
          !this.pointerDown &&
          this.dirtyPoints.length > 0 &&
          now - this.lastScrubTime > 1300
        ) {
          this.hintPulseUntil = now + 900;
        }
      }

      // Smoothly track active tool nozzle target
      const toolTarget = this.computeToolTarget(now, step);
      const lerpFactor = 1 - Math.exp(-24 * dt);
      this.toolPos.x += (toolTarget.x - this.toolPos.x) * lerpFactor;
      this.toolPos.y += (toolTarget.y - this.toolPos.y) * lerpFactor;
    }

    for (let i = this.flyingScrews.length - 1; i >= 0; i--) {
      const fs = this.flyingScrews[i];
      fs.t += dt * 2.8;
      if (fs.t >= 1) {
        this.screwsInTray += 1;
        this.flyingScrews.splice(i, 1);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.gy) p.vy += p.gy;
      p.vx *= 0.96;
      p.vy *= 0.96;
      if (p.grow) p.radius += p.grow;
      if (p.vrot) p.rot = (p.rot || 0) + p.vrot;
      p.life -= p.decay;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    const dt60 = dt * 60;
    const dampX = Math.pow(0.985, dt60);
    for (let i = this.fallingChunks.length - 1; i >= 0; i--) {
      const chunk = this.fallingChunks[i];
      chunk.age += dt;
      chunk.vy += 0.44 * dt60;
      chunk.vx *= dampX;
      chunk.x += chunk.vx * dt60;
      chunk.y += chunk.vy * dt60;
      chunk.rot += chunk.vrot * dt60;
      chunk.z = Math.max(0, chunk.z + chunk.vz * dt60);
      chunk.vz -= 0.34 * dt60;

      if (!chunk.bounced && chunk.vy > 2.5 && chunk.y >= Math.min(548, chunk.startY + 175)) {
        chunk.bounced = true;
        chunk.vy = -chunk.vy * 0.26;
        chunk.vx *= 0.72;
        chunk.vrot *= 1.45;
        const clodPalette = ['#5c4028', '#3f2a1a', '#7c5c3e', '#6b553b'];
        for (let k = 0; k < 4; k++) {
          if (this.particles.length >= 180) break;
          const ang = -Math.PI * (0.1 + Math.random() * 0.8);
          const spd = 1.6 + Math.random() * 2.8;
          this.particles.push({
            x: chunk.x + (Math.random() - 0.5) * 14,
            y: chunk.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 0.8,
            gy: 0.22,
            grow: 0,
            rot: Math.random() * Math.PI * 2,
            vrot: (Math.random() - 0.5) * 0.34,
            life: 1,
            decay: 0.036 + Math.random() * 0.02,
            radius: 3.5 + Math.random() * 3.5,
            color: clodPalette[k % clodPalette.length],
            kind: 'clod'
          });
        }
        for (let k = 0; k < 2; k++) {
          if (this.particles.length >= 180) break;
          this.particles.push({
            x: chunk.x + (Math.random() - 0.5) * 16,
            y: chunk.y,
            vx: (Math.random() - 0.5) * 1.4,
            vy: -0.6 - Math.random() * 0.9,
            gy: 0,
            grow: 0.24,
            rot: 0,
            vrot: 0,
            life: 0.85,
            decay: 0.032,
            radius: 4.5 + Math.random() * 3,
            color: 'rgba(170, 148, 118, 0.45)',
            kind: 'dust'
          });
        }
      }

      if (chunk.y > 565 || chunk.age > 1.45) {
        chunk.alpha -= dt * 3.4;
      }
      if (chunk.alpha <= 0 || chunk.y > 650) {
        this.fallingChunks.splice(i, 1);
      }
    }

    this.syncCursorMode();
  }

  computeToolTarget(now, step) {
    const parked = { x: 468, y: 472 + Math.sin(now * 0.0025) * 4 };
    if (!step || this.completed) return parked;
    if (step.type === 'assemble' && this.assemblyState.phase === 'drag') return parked;

    const raw = this.pointerDown ? this.pointerPos : this.hoverPos;
    if (!raw) return parked;

    if (this.pointerDown && (step.type === 'unscrew' || (step.type === 'assemble' && this.assemblyState.phase === 'fasten'))) {
      for (const s of this.screwStates) {
        if (!s.done && Math.hypot(raw.x - s.x, raw.y - s.y) < 54) {
          return { x: s.x, y: s.y };
        }
      }
    }

    if (this.pointerDown && step.type === 'precision') {
      for (const sp of this.precisionSpots) {
        if (!sp.done && Math.hypot(raw.x - sp.x, raw.y - sp.y) < 54) {
          return { x: sp.x, y: sp.y };
        }
      }
    }

    return raw;
  }

  updateScrewHold(list, dt, removing) {
    const powerScale = 0.92 + this.brushStrength * 1.05;
    const rate = (removing ? 1.75 : 2.15) * powerScale * (this.turboActive ? 1.55 : 1);
    let activeAny = false;
    for (const s of list) {
      if (s.done) continue;
      if (Math.hypot(this.pointerPos.x - s.x, this.pointerPos.y - s.y) < 54) {
        activeAny = true;
        s.progress = Math.min(1, s.progress + dt * rate);
        s.angle += dt * (removing ? -14 : 16);
        if (Math.random() < 0.35) this.audio.playScrewTurn();
        if (s.progress >= 1) {
          s.done = true;
          this.audio.playScrewPop();
          if (removing) {
            this.flyingScrews.push({ sx: s.x, sy: s.y, tx: 528, ty: 66, t: 0 });
          } else {
            this.screwsInTray = Math.max(0, this.screwsInTray - 1);
            this.spawnBurst(s.x, s.y, 8, '#e2c48d');
          }
        }
      }
    }

    if (activeAny) {
      const doneCount = list.filter((x) => x.done).length;
      const basePct = removing ? 0 : 50;
      const span = removing ? 100 : 50;
      const pct = basePct + (doneCount / list.length) * span;
      this.stepProgress = pct;
      this.onProgress?.(pct, this.stepIndex);
      if (doneCount === list.length) {
        this.advanceStep();
      }
    }
  }

  updatePrecisionHold(now, dt, step) {
    const powerScale = 0.92 + this.brushStrength * 1.05;
    const introSpeed = (this.orderSpec?.orderNumber || 3) <= 2 ? 1.32 : 1;
    const rate = 1.52 * powerScale * introSpeed * (this.turboActive ? 1.55 : 1);
    const kind = step?.kind || 'oil';
    let updated = false;
    for (const sp of this.precisionSpots) {
      if (sp.done) continue;
      if (Math.hypot(this.pointerPos.x - sp.x, this.pointerPos.y - sp.y) < 54) {
        updated = true;
        sp.progress = Math.min(1, sp.progress + dt * rate);
        this.spawnPrecisionParticles(kind, sp.x, sp.y);
        if (kind === 'oil' && now - this.lastPrecisionSoundAt > 260) {
          this.lastPrecisionSoundAt = now;
          this.audio.playOilDrop();
        } else if (kind === 'solder' && now - this.lastPrecisionSoundAt > 140) {
          this.lastPrecisionSoundAt = now;
          this.audio.playSolderSpark();
        } else if (kind === 'contacts' && now - this.lastPrecisionSoundAt > 180) {
          this.lastPrecisionSoundAt = now;
          this.audio.playBubble(920);
        }
        if (sp.progress >= 1) {
          sp.done = true;
          this.audio.playPrecisionDone();
          this.spawnBurst(sp.x, sp.y, 12, kind === 'contacts' ? '#38bdf8' : '#f59e0b');
        }
      }
    }

    if (updated) {
      const doneCount = this.precisionSpots.filter((x) => x.done).length;
      const pct = (doneCount / this.precisionSpots.length) * 100;
      this.stepProgress = pct;
      this.onProgress?.(pct, this.stepIndex);
      if (doneCount === this.precisionSpots.length) {
        this.advanceStep();
      }
    }
  }

  easeOutCubic(t) {
    const c = Math.max(0, Math.min(1, t));
    return 1 - Math.pow(1 - c, 3);
  }

  easeInOutCubic(t) {
    const c = Math.max(0, Math.min(1, t));
    return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
  }

  lerp(a, b, t) {
    return a + (b - a) * t;
  }

  getStepToolKey(step, assemblyPhase = this.assemblyState.phase) {
    if (!step) return null;
    if (step.type === 'excavate') return 'tool_trowel';
    if (step.type === 'scrape') return 'tool_scraper';
    if (step.type === 'paint') return 'tool_airbrush';
    if (step.type === 'foam') return 'tool_foam';
    if (step.type === 'rinse') return 'tool_rinse';
    if (step.type === 'sandblast') return 'tool_sandblast';
    if (step.type === 'unscrew') return 'tool_screwdriver';
    if (step.type === 'precision') {
      if (step.kind === 'solder') return 'tool_solder';
      if (step.kind === 'contacts') return 'tool_cleaner';
      return 'tool_oiler';
    }
    if (step.type === 'polish') return 'tool_polish';
    if (step.type === 'assemble') return assemblyPhase === 'fasten' ? 'tool_screwdriver' : null;
    return null;
  }

  renderTransformedPart(ctx, partId, cx, cy, scale, withShadow = false) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-300, -320);
    this.renderPartLayers(ctx, partId, withShadow);
    ctx.restore();
  }

  render(now) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.size, this.size);

    this.renderMatBackground(ctx);
    if (!this.orderSpec || !this.bundles) return;

    if (this.excavateDirty) {
      this.excavateDirty = false;
      this.rebuildExcavateLayer();
    }
    for (const partId of this.orderSpec.item.parts) {
      const b = this.bundles[partId];
      if (!b) continue;
      if (b.crustDirty) {
        b.crustDirty = false;
        this.rebuildCrustLayer(b);
      }
      if (b.foamDirty) {
        b.foamDirty = false;
        this.rebuildFoamLayer(b);
      }
    }

    const item = this.orderSpec.item;
    const step = this.getCurrentStep();
    const tr = this.transition;
    const p = tr.active ? Math.min(1, tr.timer / tr.duration) : 0;
    const trayScale = 80 / 600;
    const trayCx = 64;
    const trayCy = 66.67;

    if (step?.type === 'excavate' || (tr.active && tr.prevStep?.type === 'excavate')) {
      this.renderExcavationCrate(ctx);
    }

    if (tr.active && tr.kind === 'detach_to_tray' && item.coverPartId) {
      this.renderParkedPartTray(ctx, item.coverPartId, false);
      this.renderPartLayers(ctx, item.basePartId, true);

      let cx = 300;
      let cy = 320;
      let sc = 1;
      if (p < 0.28) {
        const u = this.easeOutCubic(p / 0.28);
        cy = this.lerp(320, 304, u);
        sc = this.lerp(1, 1.06, u);
      } else {
        const u = this.easeInOutCubic((p - 0.28) / 0.72);
        cx = this.lerp(300, trayCx, u);
        cy = this.lerp(304, trayCy, u) - Math.sin(u * Math.PI) * 34;
        sc = this.lerp(1.06, trayScale, u);
      }
      this.renderTransformedPart(ctx, item.coverPartId, cx, cy, sc, true);
    } else if (tr.active && tr.kind === 'swap_parts' && tr.prevStep?.partId && step?.partId) {
      this.renderParkedPartTray(ctx, tr.prevStep.partId, false);
      const u = this.easeInOutCubic(p);

      const cx1 = this.lerp(300, trayCx, u);
      const cy1 = this.lerp(320, trayCy, u) + Math.sin(u * Math.PI) * 32;
      const sc1 = this.lerp(1, trayScale, u);

      const cx2 = this.lerp(trayCx, 300, u);
      const cy2 = this.lerp(trayCy, 320, u) - Math.sin(u * Math.PI) * 32;
      const sc2 = this.lerp(trayScale, 1, u);

      if (u < 0.5) {
        this.renderTransformedPart(ctx, step.partId, cx2, cy2, sc2, true);
        this.renderTransformedPart(ctx, tr.prevStep.partId, cx1, cy1, sc1, true);
      } else {
        this.renderTransformedPart(ctx, tr.prevStep.partId, cx1, cy1, sc1, true);
        this.renderTransformedPart(ctx, step.partId, cx2, cy2, sc2, true);
      }
    } else if (tr.active && tr.kind === 'prep_assemble' && step?.type === 'assemble') {
      const u = this.easeInOutCubic(p);
      ctx.save();
      ctx.globalAlpha = 1 - u;
      this.renderParkedPartTray(ctx, step.basePartId, false);
      ctx.restore();

      const cxBase = this.lerp(trayCx, 300, u);
      const cyBase = this.lerp(trayCy, 320, u) - Math.sin(u * Math.PI) * 24;
      const scBase = this.lerp(trayScale, 1, u);
      this.renderTransformedPart(ctx, step.basePartId, cxBase, cyBase, scBase, true);

      const cxDrag = this.lerp(300, 132, u);
      const cyDrag = this.lerp(320, 162, u);
      const scDrag = this.lerp(1, 0.56, u);
      this.renderTransformedPart(ctx, step.dragPartId, cxDrag, cyDrag, scDrag, true);
    } else {
      if (item.coverPartId && this.isDisassembled && step && step.type !== 'assemble') {
        const activePartId = step.partId;
        const parkedPartId = activePartId === item.basePartId ? item.coverPartId : item.basePartId;
        this.renderParkedPartTray(ctx, parkedPartId, true);
      }

      const spinActive = this.testingAnim.active && this.testingAnim.itemId === 'supercar_wheel';
      if (spinActive) {
        const tp = Math.min(1, this.testingAnim.timer / this.testingAnim.duration);
        const spinAng = this.easeInOutCubic(tp) * Math.PI * 2 * 1.25;
        ctx.save();
        ctx.translate(300, 320);
        ctx.rotate(spinAng);
        ctx.translate(-300, -320);
      }

      if (step && step.type === 'assemble') {
        this.renderPartLayers(ctx, step.basePartId, true);
        if (this.assemblyState.phase === 'drag') {
          ctx.save();
          ctx.strokeStyle = 'rgba(200, 157, 84, 0.72)';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.arc(300, 320, 108, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.translate(this.assemblyState.x, this.assemblyState.y);
          ctx.scale(this.assemblyState.scale, this.assemblyState.scale);
          ctx.translate(-300, -320);
          ctx.shadowColor = 'rgba(0,0,0,0.55)';
          ctx.shadowBlur = 24;
          this.renderPartLayers(ctx, step.dragPartId, false);
          ctx.restore();
        } else {
          this.renderPartLayers(ctx, step.dragPartId, false);
          this.renderScrews(ctx, this.screwStates, false);
        }
      } else if (!this.isDisassembled && item.coverPartId) {
        this.renderPartLayers(ctx, item.basePartId, true);
        this.renderPartLayers(ctx, item.coverPartId, false);
        if (step?.type === 'unscrew') {
          this.renderScrews(ctx, this.screwStates, true);
        }
      } else {
        const partId = step ? step.partId : item.basePartId;
        this.renderPartLayers(ctx, partId, true);
      }

      if (spinActive) {
        ctx.restore();
      }
    }

    if (this.screwsInTray > 0 || step?.type === 'unscrew' || step?.type === 'assemble') {
      this.renderMagneticTray(ctx);
    }

    ctx.drawImage(this.excavateLayer, 0, 0);

    this.renderFallingChunks(ctx);

    if (this.testingAnim.active) {
      const tp = Math.min(1, this.testingAnim.timer / this.testingAnim.duration);
      this.renderTestingEffect(ctx, now, tp, this.testingAnim.itemId);
    }

    for (const fs of this.flyingScrews) {
      const x = fs.sx + (fs.tx - fs.sx) * fs.t;
      const y = fs.sy + (fs.ty - fs.sy) * fs.t - Math.sin(fs.t * Math.PI) * 75;
      this.drawSingleScrew(ctx, x, y, fs.t * 14, 1, true);
    }

    if (step?.type === 'precision' && !this.completed && (!tr.active || p > 0.45)) {
      this.renderPrecisionMarkers(ctx, now, step);
    }

    if (now < this.hintPulseUntil && this.dirtyPoints.length > 0 && !this.completed) {
      const stride = Math.max(1, Math.floor(this.dirtyPoints.length / 7));
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.01);
      ctx.save();
      ctx.strokeStyle = `rgba(200, 157, 84, ${0.5 + pulse * 0.45})`;
      ctx.lineWidth = 3;
      for (let i = 0; i < this.dirtyPoints.length; i += stride) {
        const pt = this.dirtyPoints[i];
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 12 + pulse * 8, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (let i = 0; i < this.particles.length; i++) {
      const pt = this.particles[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.life);
      if (pt.kind === 'star') {
        ctx.fillStyle = pt.color;
        this.drawStar(ctx, pt.x, pt.y, pt.radius);
      } else if (pt.kind === 'streak' || pt.kind === 'spark') {
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = pt.radius;
        ctx.lineCap = 'round';
        const tailScale = pt.kind === 'spark' ? 2.4 : 2.8;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.x - pt.vx * tailScale, pt.y - pt.vy * tailScale);
        ctx.stroke();
      } else if (pt.kind === 'smoke') {
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (pt.kind === 'clod') {
        ctx.translate(pt.x, pt.y);
        ctx.rotate(pt.rot || 0);
        const r = pt.radius;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.moveTo(-r, -r * 0.4);
        ctx.lineTo(r * 0.3, -r);
        ctx.lineTo(r, -r * 0.1);
        ctx.lineTo(r * 0.5, r * 0.9);
        ctx.lineTo(-r * 0.7, r * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (pt.kind === 'oil_drop') {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        ctx.arc(pt.x - pt.radius * 0.3, pt.y - pt.radius * 0.3, Math.max(0.8, pt.radius * 0.28), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (tr.active) {
      const holster = { x: 648, y: 652 };
      if (p < 0.45) {
        if (tr.prevToolKey) {
          const u = this.easeInOutCubic(p / 0.45);
          const ox = this.lerp(tr.toolFrom.x, holster.x, u);
          const oy = this.lerp(tr.toolFrom.y, holster.y, u);
          this.drawToolSprite(ctx, tr.prevToolKey, ox, oy, u * 0.22);
        }
      } else if (!this.toolLocked) {
        const nextToolKey = this.getStepToolKey(step);
        if (nextToolKey) {
          const u = this.easeOutCubic((p - 0.45) / 0.55);
          this.drawToolSprite(ctx, nextToolKey, this.toolPos.x, this.toolPos.y, (1 - u) * 0.18);
        }
      }
    } else if (!this.toolLocked && !this.awaitingTest && !this.testingAnim.active) {
      // Nozzle target ring while scrubbing
      if (this.hoverPos && !this.completed && step && this.isScrubStep(step.type)) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.hoverPos.x, this.hoverPos.y, this.brushRadius, 0, Math.PI * 2);
        ctx.strokeStyle = this.turboActive
          ? 'rgba(56, 189, 248, 0.72)'
          : 'rgba(228, 193, 122, 0.45)';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([6, 5]);
        ctx.stroke();
        ctx.restore();
      }

      // Animated onboarding gesture cue on early orders when idle
      const ordNum = this.orderSpec?.orderNumber || 3;
      const shouldShowGuide = Boolean(
        step &&
        !this.completed &&
        !this.pointerDown &&
        ordNum <= 2 &&
        (this.stepProgress < 10 || now - this.lastScrubTime > 2400)
      );
      if (shouldShowGuide) {
        this.renderOnboardingGuide(ctx, now, step);
      }

      // Photorealistic handheld tool sprite following user cursor/finger
      if (step && !this.completed && !(step.type === 'assemble' && this.assemblyState.phase === 'drag')) {
        this.renderActiveToolCursor(ctx, now, step);
      }
    }
  }

  renderOnboardingGuide(ctx, now, step) {
    ctx.save();
    if (this.isScrubStep(step.type)) {
      const t = (now * 0.0028) % (Math.PI * 2);
      const gx = 300 + Math.sin(t) * 98;
      const gy = 315 + Math.sin(t * 2) * 38;
      const trailT = t - 0.35;
      const tx = 300 + Math.sin(trailT) * 98;
      const ty = 315 + Math.sin(trailT * 2) * 38;

      const grad = ctx.createLinearGradient(tx, ty, gx, gy);
      grad.addColorStop(0, 'rgba(242, 207, 131, 0)');
      grad.addColorStop(1, 'rgba(242, 207, 131, 0.72)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(gx, gy);
      ctx.stroke();

      ctx.fillStyle = 'rgba(253, 230, 138, 0.92)';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(gx, gy, 11, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(gx, gy, 18 + Math.sin(now * 0.01) * 3, 0, Math.PI * 2);
      ctx.stroke();
    } else if (step.type === 'unscrew' || (step.type === 'assemble' && this.assemblyState.phase === 'fasten')) {
      const target = this.screwStates.find((s) => !s.done);
      if (target) {
        const pulse = (now % 900) / 900;
        ctx.strokeStyle = `rgba(253, 230, 138, ${(1 - pulse) * 0.95})`;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(target.x, target.y, 18 + pulse * 24, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (step.type === 'assemble' && this.assemblyState.phase === 'drag') {
      const u = (now % 1300) / 1300;
      const ease = 1 - Math.pow(1 - u, 2);
      const ax = this.lerp(this.assemblyState.x, 300, ease);
      const ay = this.lerp(this.assemblyState.y, 320, ease);
      ctx.strokeStyle = 'rgba(253, 230, 138, 0.68)';
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(this.assemblyState.x, this.assemblyState.y);
      ctx.lineTo(300, 320);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = `rgba(253, 230, 138, ${1 - u * 0.65})`;
      ctx.beginPath();
      ctx.arc(ax, ay, 11, 0, Math.PI * 2);
      ctx.fill();
    } else if (step.type === 'precision') {
      const target = this.precisionSpots.find((s) => !s.done);
      if (target) {
        const pulse = (now % 900) / 900;
        ctx.strokeStyle = `rgba(253, 230, 138, ${(1 - pulse) * 0.95})`;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(target.x, target.y, 18 + pulse * 24, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawToolSprite(ctx, toolKey, ox, oy, rot = 0) {
    const entry = toolKey ? this.assets?.tools?.[toolKey] : null;
    if (!entry) return;
    const { img, meta } = entry;
    const scale = 0.72;
    const drawSize = meta.size * scale;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(rot);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 6;
    ctx.shadowOffsetY = 10;
    ctx.drawImage(img, -meta.tipX * scale, -meta.tipY * scale, drawSize, drawSize);
    ctx.restore();
  }

  drawJetFxSprite(ctx, fxKey, nozzleX, nozzleY, targetX, targetY, widthScale, now, tintAlpha = 1, customImg = null) {
    const fxEntry = this.assets?.fx?.[fxKey];
    if (!fxEntry) return false;

    const img = customImg || fxEntry.img;
    const { meta } = fxEntry;
    const sx = meta.nozzleX ?? meta.size * 0.78;
    const sy = meta.nozzleY ?? meta.size * 0.76;
    const ix = meta.impactX ?? meta.size * 0.34;
    const iy = meta.impactY ?? meta.size * 0.36;

    const sdx = ix - sx;
    const sdy = iy - sy;
    const srcDist = Math.hypot(sdx, sdy) || 1;
    const srcAngle = Math.atan2(sdy, sdx);

    const tdx = targetX - nozzleX;
    const tdy = targetY - nozzleY;
    const tgtDist = Math.hypot(tdx, tdy) || 1;
    const tgtAngle = Math.atan2(tdy, tdx);

    const baseScale = Math.max(0.32, (tgtDist / srcDist) * 1.28);
    const rotDiff = tgtAngle - srcAngle;

    const layers = [
      {
        s: 0.96 + 0.08 * Math.sin(now * 0.045),
        alpha: 0.92 * tintAlpha,
        jitter: Math.sin(now * 0.03) * 0.025
      },
      {
        s: 0.88 + 0.10 * Math.cos(now * 0.062),
        alpha: 0.52 * tintAlpha,
        jitter: -Math.cos(now * 0.04) * 0.03
      }
    ];

    for (const l of layers) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, l.alpha));
      ctx.translate(nozzleX, nozzleY);
      ctx.rotate(rotDiff + l.jitter);
      ctx.scale(baseScale * l.s, Math.max(baseScale, widthScale) * l.s);
      ctx.drawImage(img, -sx, -sy, meta.size, meta.size);
      ctx.restore();
    }
    return true;
  }

  drawTintedPaintJet(ctx, nozzleX, nozzleY, targetX, targetY, paintCol, widthScale, now) {
    const fxEntry = this.assets?.fx?.fx_paint_jet;
    if (!fxEntry) return false;

    const sz = fxEntry.meta?.size || 256;
    if (this.fxTintCanvas.width !== sz || this.fxTintCanvas.height !== sz) {
      this.fxTintCanvas.width = sz;
      this.fxTintCanvas.height = sz;
      this.lastPaintTintColor = '';
    }

    if (this.lastPaintTintColor !== paintCol) {
      const tctx = this.fxTintCanvas.getContext('2d');
      tctx.save();
      tctx.globalCompositeOperation = 'source-over';
      tctx.globalAlpha = 1;
      tctx.clearRect(0, 0, sz, sz);
      tctx.drawImage(fxEntry.img, 0, 0, sz, sz);
      tctx.globalCompositeOperation = 'source-in';
      tctx.fillStyle = paintCol;
      tctx.fillRect(0, 0, sz, sz);
      tctx.globalCompositeOperation = 'source-atop';
      tctx.globalAlpha = 0.28;
      tctx.drawImage(fxEntry.img, 0, 0, sz, sz);
      tctx.restore();
      this.lastPaintTintColor = paintCol;
    }

    const drawn = this.drawJetFxSprite(ctx, 'fx_paint_jet', nozzleX, nozzleY, targetX, targetY, widthScale, now, 0.94, this.fxTintCanvas);

    const spotR = Math.max(14, this.brushRadius * 0.45);
    const spotGrad = ctx.createRadialGradient(targetX, targetY, 2, targetX, targetY, spotR);
    spotGrad.addColorStop(0, paintCol);
    spotGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = spotGrad;
    ctx.beginPath();
    ctx.arc(targetX, targetY, spotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    return drawn;
  }

  renderActiveToolCursor(ctx, now, step) {
    const toolKey = this.getStepToolKey(step);
    const entry = toolKey ? this.assets?.tools?.[toolKey] : null;
    if (!entry) return;

    let ox = this.toolPos.x;
    let oy = this.toolPos.y;
    let toolDrawX = ox;
    let toolDrawY = oy;
    let rot = 0;
    let drawPendingDropAfterTool = null;

    if (this.pointerDown) {
      if (step.type === 'polish') {
        ox += (Math.random() - 0.5) * 3.4;
        oy += (Math.random() - 0.5) * 3.4;
        toolDrawX = ox;
        toolDrawY = oy;
      } else if (step.type === 'unscrew' || step.type === 'assemble') {
        rot = Math.sin(now * 0.028) * 0.15;
      }

      // Draw photorealistic FX sprites (and crisp fallback) beneath the tool nozzle
      ctx.save();
      if (step.type === 'excavate') {
        rot = Math.sin(now * 0.022) * 0.14;
        toolDrawX = ox + Math.sin(now * 0.022) * 4;
        toolDrawY = oy + Math.abs(Math.cos(now * 0.022)) * 3;
        const g = ctx.createRadialGradient(ox, oy, 2, ox, oy, this.brushRadius * 0.72);
        g.addColorStop(0, 'rgba(92, 64, 40, 0.52)');
        g.addColorStop(1, 'rgba(92, 64, 40, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(ox, oy, this.brushRadius * 0.72, 0, Math.PI * 2);
        ctx.fill();
      } else if (step.type === 'scrape') {
        ox += (Math.random() - 0.5) * 2.4;
        oy += (Math.random() - 0.5) * 2.4;
        toolDrawX = ox;
        toolDrawY = oy;
        rot = -0.05 + Math.sin(now * 0.035) * 0.06;
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.58)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ox - 12, oy + 12);
        ctx.lineTo(ox + 14, oy - 14);
        ctx.stroke();
      } else if (step.type === 'paint') {
        rot = Math.sin(now * 0.02) * 0.03;
        const nozzleX = ox + 26;
        const nozzleY = oy + 14;
        toolDrawX = nozzleX;
        toolDrawY = nozzleY;
        const wScale = Math.max(0.40, this.brushRadius / 66);
        const paintCol = this.activePaintSwatch?.hex || step.color || '#eab308';
        if (!this.drawTintedPaintJet(ctx, nozzleX, nozzleY, ox - 6, oy - 3, paintCol, wScale, now)) {
          const g = ctx.createRadialGradient(ox, oy, 2, ox, oy, this.brushRadius * 0.85);
          g.addColorStop(0, paintCol);
          g.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.globalAlpha = 0.58;
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(ox, oy, this.brushRadius * 0.85, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (step.type === 'foam') {
        rot = Math.sin(now * 0.018) * 0.04;
        const nozzleX = ox + 20;
        const nozzleY = oy + 14;
        toolDrawX = nozzleX;
        toolDrawY = nozzleY;
        const wScale = Math.max(0.36, this.brushRadius / 72);
        if (!this.drawJetFxSprite(ctx, 'fx_foam_jet', nozzleX, nozzleY, ox - 8, oy - 4, wScale, now, 0.94)) {
          const g = ctx.createRadialGradient(ox, oy, 2, ox, oy, this.brushRadius * 0.9);
          g.addColorStop(0, 'rgba(255, 255, 255, 0.78)');
          g.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(ox, oy, this.brushRadius * 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (step.type === 'rinse') {
        rot = Math.sin(now * 0.02) * 0.035;
        const nozzleX = ox + 26 + (Math.random() - 0.5) * 1.6;
        const nozzleY = oy + 13 + (Math.random() - 0.5) * 1.6;
        toolDrawX = nozzleX;
        toolDrawY = nozzleY;
        const wScale = Math.max(0.42, this.brushRadius / 68);
        if (!this.drawJetFxSprite(ctx, 'fx_water_jet', nozzleX, nozzleY, ox - 6, oy - 3, wScale, now, 0.96)) {
          const g = ctx.createRadialGradient(ox, oy, 2, ox, oy, this.brushRadius);
          g.addColorStop(0, 'rgba(186, 230, 253, 0.75)');
          g.addColorStop(1, 'rgba(125, 211, 252, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(ox, oy, this.brushRadius * 1.1, this.brushRadius * 0.65, -0.32, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (step.type === 'sandblast') {
        const nozzleX = ox + 28 + (Math.random() - 0.5) * 3.0;
        const nozzleY = oy + 14 + (Math.random() - 0.5) * 3.0;
        toolDrawX = nozzleX;
        toolDrawY = nozzleY;
        const wScale = Math.max(0.40, this.brushRadius / 72);
        if (!this.drawJetFxSprite(ctx, 'fx_sand_jet', nozzleX, nozzleY, ox - 4, oy - 2, wScale, now, 0.95)) {
          const g = ctx.createRadialGradient(ox, oy, 2, ox, oy, this.brushRadius * 0.8);
          g.addColorStop(0, 'rgba(251, 191, 36, 0.72)');
          g.addColorStop(1, 'rgba(251, 191, 36, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(ox, oy, this.brushRadius * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (step.type === 'polish') {
        const g = ctx.createRadialGradient(ox, oy, 2, ox, oy, 26);
        g.addColorStop(0, 'rgba(255, 252, 230, 0.82)');
        g.addColorStop(1, 'rgba(255, 252, 230, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(ox, oy, 26, 0, Math.PI * 2);
        ctx.fill();
      } else if (step.type === 'precision') {
        const kind = step.kind || 'oil';
        if (kind === 'oil') {
          rot = Math.sin(now * 0.014) * 0.08;
          toolDrawX = ox + 4;
          toolDrawY = oy - 12;

          const ringPhase = (now % 900) / 900;
          const ringR = 6 + ringPhase * 16;
          const honey = ctx.createRadialGradient(ox, oy, 1, ox, oy, 11);
          honey.addColorStop(0, 'rgba(254, 240, 138, 0.85)');
          honey.addColorStop(0.55, 'rgba(217, 119, 6, 0.5)');
          honey.addColorStop(1, 'rgba(217, 119, 6, 0)');
          ctx.fillStyle = honey;
          ctx.beginPath();
          ctx.arc(ox, oy, 11, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = `rgba(245, 178, 38, ${(1 - ringPhase) * 0.85})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ox, oy, ringR, 0, Math.PI * 2);
          ctx.stroke();

          // Real photo amber oil drop growing on spout and falling to knot every 380 ms
          const dropEntry = this.assets?.fx?.fx_oil_drop;
          const cycle = (now % 380) / 380;
          if (dropEntry) {
            drawPendingDropAfterTool = () => {
              const { img: dImg, meta: dMeta } = dropEntry;
              let dropY = toolDrawY + 3;
              let dropScale = 0.14;
              let dropAlpha = 1;
              if (cycle < 0.35) {
                const u = cycle / 0.35;
                dropScale = 0.09 + 0.13 * u;
                dropY = toolDrawY + 2;
              } else if (cycle < 0.8) {
                const u = (cycle - 0.35) / 0.45;
                dropScale = 0.22;
                dropY = this.lerp(toolDrawY + 2, oy + 1, u * u);
              } else {
                const u = (cycle - 0.8) / 0.2;
                dropScale = 0.22 + 0.08 * u;
                dropY = oy + 1;
                dropAlpha = 1 - u;
              }
              const ds = dMeta.size * dropScale;
              ctx.save();
              ctx.globalAlpha = dropAlpha;
              ctx.drawImage(dImg, (ox + 1) - ds / 2, dropY - ds / 2, ds, ds);
              ctx.restore();
            };
          }
        } else if (kind === 'solder') {
          const sparkEntry = this.assets?.fx?.fx_solder_spark;
          if (sparkEntry) {
            const { img: sImg, meta: sMeta } = sparkEntry;
            for (let i = 0; i < 2; i++) {
              const spScale = i === 0 ? (0.42 + 0.08 * Math.sin(now * 0.04)) : (0.34 + 0.07 * Math.cos(now * 0.055));
              const spRot = (now * (i === 0 ? 0.002 : -0.003)) % (Math.PI * 2);
              const sSize = sMeta.size * spScale;
              ctx.save();
              ctx.globalAlpha = i === 0 ? 0.94 : 0.6;
              ctx.translate(ox, oy);
              ctx.rotate(spRot);
              ctx.drawImage(sImg, -sSize / 2, -sSize / 2, sSize, sSize);
              ctx.restore();
            }
          } else {
            const arcR = 9 + Math.sin(now * 0.035) * 3 + Math.random() * 3;
            const arcGrad = ctx.createRadialGradient(ox, oy, 1, ox, oy, arcR * 1.4);
            arcGrad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
            arcGrad.addColorStop(0.45, 'rgba(251, 191, 36, 0.8)');
            arcGrad.addColorStop(1, 'rgba(251, 191, 36, 0)');
            ctx.fillStyle = arcGrad;
            ctx.beginPath();
            ctx.arc(ox, oy, arcR * 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          // contacts cleaner
          const sx = ox + 16;
          const sy = oy + 14;
          toolDrawX = sx;
          toolDrawY = sy;
          if (!this.drawJetFxSprite(ctx, 'fx_water_jet', sx, sy, ox, oy, 0.34, now, 0.78)) {
            const cg = ctx.createLinearGradient(sx, sy, ox, oy);
            cg.addColorStop(0, 'rgba(110, 231, 183, 0.78)');
            cg.addColorStop(1, 'rgba(56, 189, 248, 0.16)');
            ctx.fillStyle = cg;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ox - 10, oy + 4);
            ctx.lineTo(ox + 4, oy - 10);
            ctx.closePath();
            ctx.fill();
          }
          const evapPhase = (now % 650) / 650;
          ctx.strokeStyle = `rgba(56, 189, 248, ${(1 - evapPhase) * 0.85})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ox, oy, 6 + evapPhase * 15, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    this.drawToolSprite(ctx, toolKey, toolDrawX, toolDrawY, rot);
    if (drawPendingDropAfterTool) {
      drawPendingDropAfterTool();
    }
  }

  renderExcavationCrate(ctx) {
    const x = 44;
    const y = 62;
    const w = 512;
    const h = 508;
    ctx.save();

    ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;

    const rimGrad = ctx.createLinearGradient(x, y, x + w, y + h);
    rimGrad.addColorStop(0, '#5a3d24');
    rimGrad.addColorStop(0.5, '#422b18');
    rimGrad.addColorStop(1, '#2b1b0e');
    ctx.fillStyle = rimGrad;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 16);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(218, 174, 102, 0.42)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 16);
    ctx.stroke();

    // Recessed burlap/sand tray bed
    const bedX = x + 18;
    const bedY = y + 18;
    const bedW = w - 36;
    const bedH = h - 36;
    const bedGrad = ctx.createRadialGradient(300, 316, 40, 300, 316, 260);
    bedGrad.addColorStop(0, '#2c2016');
    bedGrad.addColorStop(1, '#19120c');
    ctx.fillStyle = bedGrad;
    ctx.beginPath();
    ctx.roundRect(bedX, bedY, bedW, bedH, 10);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Brass corner brackets with rivets
    const corners = [
      [x + 10, y + 10],
      [x + w - 10, y + 10],
      [x + 10, y + h - 10],
      [x + w - 10, y + h - 10]
    ];
    for (const [cx, cy] of corners) {
      ctx.fillStyle = '#b4833e';
      ctx.beginPath();
      ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2d28b';
      ctx.beginPath();
      ctx.arc(cx - 1, cy - 1, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  renderTestingEffect(ctx, now, p, itemId) {
    ctx.save();
    const fade = p < 0.15 ? p / 0.15 : p > 0.85 ? (1 - p) / 0.15 : 1;

    if (
      itemId === 'pocket_watch' ||
      itemId === 'imperial_medallion' ||
      itemId === 'brass_sextant' ||
      itemId === 'ship_binnacle' ||
      itemId === 'steam_governor' ||
      itemId === 'celestial_armillary'
    ) {
      const cx = 300;
      const cy = itemId === 'celestial_armillary' ? 285 : 335;
      const ang = -Math.PI / 2 + p * Math.PI * 4;
      ctx.globalAlpha = fade;
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.85)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * 58, cy + Math.sin(ang) * 58);
      ctx.stroke();

      const ringR = 54 + ((now % 450) / 450) * 38;
      ctx.strokeStyle = `rgba(245, 198, 92, ${(1 - (now % 450) / 450) * 0.65})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();
    } else if (itemId === 'vintage_lighter' || itemId === 'railroad_lantern') {
      const fx = itemId === 'railroad_lantern' ? 300 : 295;
      const fy = itemId === 'railroad_lantern' ? 338 : 176;
      const sway = Math.sin(now * 0.025) * 4;
      const fh = 42 + Math.sin(now * 0.032) * 7;
      ctx.globalAlpha = fade;
      const glow = ctx.createRadialGradient(fx, fy - 12, 4, fx, fy - 12, 85);
      glow.addColorStop(0, 'rgba(251, 191, 36, 0.62)');
      glow.addColorStop(0.5, 'rgba(249, 115, 22, 0.24)');
      glow.addColorStop(1, 'rgba(249, 115, 22, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(fx, fy - 12, 85, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(fx - 12, fy + 6);
      ctx.quadraticCurveTo(fx - 14, fy - fh * 0.55, fx + sway, fy - fh);
      ctx.quadraticCurveTo(fx + 14, fy - fh * 0.55, fx + 12, fy + 6);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(fx - 6, fy + 4);
      ctx.quadraticCurveTo(fx - 6, fy - fh * 0.4, fx + sway * 0.5, fy - fh * 0.68);
      ctx.quadraticCurveTo(fx + 6, fy - fh * 0.4, fx + 6, fy + 4);
      ctx.closePath();
      ctx.fill();
    } else if (itemId === 'moto_carburetor') {
      ctx.globalAlpha = fade;
      for (const tx of [245, 355]) {
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.03 + tx);
        const fg = ctx.createRadialGradient(tx, 255, 2, tx, 255, 34);
        fg.addColorStop(0, `rgba(254, 240, 138, ${0.85 * pulse})`);
        fg.addColorStop(0.5, `rgba(249, 115, 22, ${0.42 * pulse})`);
        fg.addColorStop(1, 'rgba(249, 115, 22, 0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(tx, 255, 34, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (itemId === 'espresso_lever') {
      ctx.globalAlpha = fade * 0.8;
      const sg = ctx.createRadialGradient(300, 290, 8, 300, 290, 110);
      sg.addColorStop(0, 'rgba(255, 251, 235, 0.72)');
      sg.addColorStop(0.55, 'rgba(245, 198, 92, 0.30)');
      sg.addColorStop(1, 'rgba(245, 198, 92, 0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(300, 290, 110, 0, Math.PI * 2);
      ctx.fill();
    } else if (itemId === 'vintage_camera' || itemId === 'brass_microscope') {
      const lx = itemId === 'brass_microscope' ? 305 : 313;
      const ly = itemId === 'brass_microscope' ? 275 : 347;
      const burst = Math.max(0, 1 - Math.abs(p - 0.35) * 3.5);
      if (burst > 0) {
        const fg = ctx.createRadialGradient(lx, ly, 4, lx, ly, 190 * burst + 40);
        fg.addColorStop(0, `rgba(255, 255, 255, ${0.95 * burst})`);
        fg.addColorStop(0.45, `rgba(224, 242, 254, ${0.55 * burst})`);
        fg.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(lx, ly, 230, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = `rgba(186, 230, 253, ${0.7 * fade})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(lx, ly, 36 + p * 85, 0, Math.PI * 2);
      ctx.stroke();
    } else if (itemId === 'retro_console' || itemId === 'arcade_stick') {
      ctx.globalAlpha = fade * 0.72;
      const bx = itemId === 'arcade_stick' ? 160 : 226;
      const by = itemId === 'arcade_stick' ? 215 : 174;
      const bw = itemId === 'arcade_stick' ? 280 : 148;
      const bh = itemId === 'arcade_stick' ? 190 : 118;
      const sg = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
      sg.addColorStop(0, 'rgba(56, 189, 248, 0.32)');
      sg.addColorStop(0.5, 'rgba(167, 243, 208, 0.56)');
      sg.addColorStop(1, 'rgba(34, 197, 94, 0.25)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 10);
      ctx.fill();

      const scanY = by + 8 + ((now * 0.14) % Math.max(24, bh - 22));
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.fillRect(bx + 10, scanY, bw - 20, 6);
    } else if (
      itemId === 'music_box' ||
      itemId === 'gramophone' ||
      itemId === 'tube_radio' ||
      itemId === 'vintage_saxophone' ||
      itemId === 'faberge_egg' ||
      itemId === 'rotary_phone'
    ) {
      ctx.globalAlpha = fade;
      if (itemId === 'tube_radio') {
        const dialGlow = ctx.createRadialGradient(300, 355, 8, 300, 355, 95);
        dialGlow.addColorStop(0, 'rgba(253, 224, 71, 0.68)');
        dialGlow.addColorStop(0.55, 'rgba(245, 158, 11, 0.26)');
        dialGlow.addColorStop(1, 'rgba(245, 158, 11, 0)');
        ctx.fillStyle = dialGlow;
        ctx.beginPath();
        ctx.arc(300, 355, 95, 0, Math.PI * 2);
        ctx.fill();
      }
      const waveY = itemId === 'rotary_phone' ? 185 : itemId === 'gramophone' ? 225 : 305;
      const waveCount = itemId === 'rotary_phone' ? 4 : 3;
      for (let i = 0; i < waveCount; i++) {
        const phase = (p * 2.4 + i * (1 / waveCount)) % 1;
        const r = 34 + phase * 115;
        ctx.strokeStyle = `rgba(251, 191, 36, ${(1 - phase) * 0.78})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        if (itemId === 'rotary_phone') {
          ctx.arc(215, waveY, r * 0.55, -Math.PI * 0.9, -Math.PI * 0.1);
          ctx.moveTo(385 + Math.cos(-Math.PI * 0.9) * r * 0.55, waveY + Math.sin(-Math.PI * 0.9) * r * 0.55);
          ctx.arc(385, waveY, r * 0.55, -Math.PI * 0.9, -Math.PI * 0.1);
        } else {
          ctx.arc(300, waveY, r, -Math.PI * 0.85, -Math.PI * 0.15);
        }
        ctx.stroke();
      }
    } else if (itemId === 'diving_helmet') {
      ctx.globalAlpha = fade * 0.65;
      const beam = ctx.createRadialGradient(300, 320, 10, 300, 320, 210);
      beam.addColorStop(0, 'rgba(254, 243, 199, 0.92)');
      beam.addColorStop(0.45, 'rgba(251, 191, 36, 0.35)');
      beam.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.arc(300, 320, 210, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Dagger / Crown / Tsuba / Hoplite Helmet / Scarab / Gauntlet / Jade Censer / Pharaoh Mask shimmer
      ctx.globalAlpha = fade;
      if (itemId === 'tutankhamun_mask' || itemId === 'scarab_amulet') {
        const sunHalo = ctx.createRadialGradient(300, 300, 24, 300, 300, 220);
        sunHalo.addColorStop(0, 'rgba(254, 240, 138, 0.52)');
        sunHalo.addColorStop(0.5, 'rgba(245, 158, 11, 0.18)');
        sunHalo.addColorStop(1, 'rgba(245, 158, 11, 0)');
        ctx.fillStyle = sunHalo;
        ctx.beginPath();
        ctx.arc(300, 300, 220, 0, Math.PI * 2);
        ctx.fill();
      }
      const gx = 190 + p * 220;
      const gy = 390 - p * 160;
      ctx.fillStyle = '#fffbeb';
      this.drawStar(ctx, gx, gy, 24);
      this.drawStar(ctx, 300, 260, 14 + Math.sin(now * 0.02) * 5);
    }
    ctx.restore();
  }

  renderMatBackground(ctx) {
    if (this.assets?.workbenchBg) {
      ctx.drawImage(this.assets.workbenchBg, 0, 0, this.size, this.size);
      // Soft edge vignette so the central artifact reads clearly
      const vig = ctx.createRadialGradient(300, 300, 180, 300, 300, 440);
      vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vig.addColorStop(1, 'rgba(10, 8, 6, 0.34)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, this.size, this.size);
    } else {
      ctx.fillStyle = '#1d2b24';
      ctx.fillRect(0, 0, this.size, this.size);
    }
  }

  renderPartLayers(ctx, partId, withShadow) {
    const b = this.bundles?.[partId];
    if (!b) return;

    ctx.save();
    if (withShadow) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.58)';
      ctx.shadowBlur = 22;
      ctx.shadowOffsetY = 10;
    }
    ctx.drawImage(b.cleanCanvas, 0, 0);
    ctx.restore();

    this.drawSpecularSweep(ctx, b.maskCanvas);
    ctx.drawImage(b.dullLayer, 0, 0);
    ctx.drawImage(b.primerLayer, 0, 0);
    ctx.drawImage(b.rustyLayer, 0, 0);
    ctx.drawImage(b.muddyLayer, 0, 0);
    ctx.drawImage(b.foamLayer, 0, 0);
    ctx.drawImage(b.crustLayer, 0, 0);

    if (this.flashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.flashAlpha * 0.45;
      ctx.drawImage(b.maskCanvas, 0, 0);
      ctx.restore();
    }
  }

  renderParkedPartTray(ctx, partId, drawPart = true) {
    const b = this.bundles?.[partId];
    ctx.save();
    ctx.fillStyle = 'rgba(18, 16, 14, 0.86)';
    ctx.strokeStyle = 'rgba(200, 157, 84, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(18, 18, 92, 92, 10);
    ctx.fill();
    ctx.stroke();

    if (drawPart && b) {
      ctx.drawImage(b.cleanCanvas, 0, 0, 600, 600, 24, 24, 80, 80);
      ctx.drawImage(b.dullLayer, 0, 0, 600, 600, 24, 24, 80, 80);
      ctx.drawImage(b.primerLayer, 0, 0, 600, 600, 24, 24, 80, 80);
      ctx.drawImage(b.rustyLayer, 0, 0, 600, 600, 24, 24, 80, 80);
      ctx.drawImage(b.muddyLayer, 0, 0, 600, 600, 24, 24, 80, 80);
      ctx.drawImage(b.foamLayer, 0, 0, 600, 600, 24, 24, 80, 80);
      ctx.drawImage(b.crustLayer, 0, 0, 600, 600, 24, 24, 80, 80);
    }
    ctx.restore();
  }

  renderMagneticTray(ctx) {
    ctx.save();
    const cx = 528;
    const cy = 64;
    const g = ctx.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, 38);
    g.addColorStop(0, '#52525b');
    g.addColorStop(0.75, '#27272a');
    g.addColorStop(1, '#a1a1aa');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d4d4d8';
    ctx.lineWidth = 2;
    ctx.stroke();

    for (let i = 0; i < this.screwsInTray; i++) {
      const ang = i * 1.4 + 0.4;
      const r = i === 0 ? 0 : 14;
      this.drawSingleScrew(ctx, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, ang, 0.75, true);
    }
    ctx.restore();
  }

  renderScrews(ctx, screws, rustyStyle) {
    for (const s of screws) {
      // Recessed threaded screw socket underneath
      ctx.save();
      ctx.fillStyle = '#12100e';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200, 185, 160, 0.45)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();

      if (s.done && rustyStyle) continue;

      const elevationScale = rustyStyle
        ? 0.96 + s.progress * 0.22
        : s.done
          ? 0.96
          : 1.18 - s.progress * 0.22;

      this.drawSingleScrew(ctx, s.x, s.y, s.angle, elevationScale, rustyStyle);

      if (!s.done && s.progress > 0) {
        ctx.save();
        ctx.strokeStyle = '#e2c48d';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.progress);
        ctx.stroke();
        ctx.restore();
      } else if (!s.done) {
        ctx.save();
        ctx.strokeStyle = 'rgba(226, 196, 141, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 19, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  drawSingleScrew(ctx, x, y, angle, scale = 1, rusty = false) {
    ctx.save();
    // Non-rotating drop shadow beneath screw head
    ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
    ctx.beginPath();
    ctx.arc(x, y + 3 * scale, 12.5 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(x, y);
    ctx.rotate(angle);
    const sprite = rusty ? this.assets?.screwRusty : this.assets?.screwClean;
    const size = 26 * scale;
    if (sprite) {
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = rusty ? '#854d27' : '#d4b475';
      ctx.beginPath();
      ctx.arc(0, 0, 11 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  renderPrecisionMarkers(ctx, now, step) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);
    const isOil = (step?.kind || 'oil') === 'oil';
    for (const sp of this.precisionSpots) {
      ctx.save();
      if (sp.done) {
        if (isOil) {
          const g = ctx.createRadialGradient(sp.x, sp.y, 2, sp.x, sp.y, 21);
          g.addColorStop(0, 'rgba(245, 178, 38, 0.68)');
          g.addColorStop(1, 'rgba(245, 178, 38, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 21, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(46, 160, 102, 0.9)';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(sp.x - 5, sp.y);
        ctx.lineTo(sp.x - 1, sp.y + 4);
        ctx.lineTo(sp.x + 6, sp.y - 4);
        ctx.stroke();
      } else {
        ctx.strokeStyle = `rgba(226, 196, 141, ${0.55 + pulse * 0.45})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 15 + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(200, 157, 84, 0.25)';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 12, 0, Math.PI * 2);
        ctx.fill();

        if (sp.progress > 0) {
          ctx.strokeStyle = '#4ade80';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sp.progress);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  drawSpecularSweep(targetCtx, maskCanvas) {
    const offset = -this.size + this.sweepPhase * this.size;
    const sctx = this.sheenCtx;
    sctx.clearRect(0, 0, this.size, this.size);

    const grad = sctx.createLinearGradient(offset, 0, offset + 180, this.size);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');

    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, this.size, this.size);
    sctx.globalCompositeOperation = 'destination-in';
    sctx.drawImage(maskCanvas, 0, 0);
    sctx.globalCompositeOperation = 'source-over';

    targetCtx.drawImage(this.sheenCanvas, 0, 0);
  }

  drawStar(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
  }

  spawnExcavationClod(cx, cy, moveAngle, speedPx) {
    const avgR = 13 + Math.random() * 9;
    const verts = [];
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8 + (Math.random() - 0.5) * 0.25;
      const r = avgR * (0.68 + Math.random() * 0.48);
      verts.push({ dx: Math.cos(a) * r, dy: Math.sin(a) * r });
    }
    this.spawnFallingCrustChunk({ cx, cy, avgR, verts }, moveAngle, speedPx);
  }

  spawnFallingCrustChunk(plate, moveAngle, speedPx) {
    while (this.fallingChunks.length >= 28) {
      this.fallingChunks.shift();
    }
    const pushSpd = 1.6 + Math.min(3.2, speedPx * 0.11) + Math.random() * 1.2;
    this.fallingChunks.push({
      x: plate.cx,
      y: plate.cy,
      startY: plate.cy,
      verts: plate.verts,
      avgR: plate.avgR,
      vx: Math.cos(moveAngle) * pushSpd * 0.65 + (Math.random() - 0.5) * 2.2,
      vy: Math.sin(moveAngle) * pushSpd * 0.35 - (2.4 + Math.random() * 1.8),
      z: 2,
      vz: 2.8 + Math.random() * 1.6,
      rot: 0,
      vrot: (Math.random() - 0.5) * 0.16,
      bounced: false,
      alpha: 1,
      age: 0,
      shade: 0.88 + Math.random() * 0.22
    });
  }

  renderFallingChunks(ctx) {
    if (!this.fallingChunks || this.fallingChunks.length === 0) return;
    const tracePoly = (verts, scale = 1) => {
      ctx.beginPath();
      for (let i = 0; i < verts.length; i++) {
        const vx = verts[i].dx * scale;
        const vy = verts[i].dy * scale;
        if (i === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
    };

    for (const chunk of this.fallingChunks) {
      const a = Math.max(0, Math.min(1, chunk.alpha));
      if (a <= 0 || !chunk.verts?.length) continue;
      const sc = 1 + Math.min(0.14, chunk.z * 0.012);

      // 1. Cast shadow onto the workbench
      ctx.save();
      ctx.translate(chunk.x + 4 + chunk.z * 0.55, chunk.y + 8 + chunk.z * 0.85);
      ctx.rotate(chunk.rot);
      ctx.scale(sc, sc);
      ctx.fillStyle = `rgba(8, 6, 4, ${0.45 * a})`;
      tracePoly(chunk.verts);
      ctx.fill();
      ctx.restore();

      // 2. 3D thickness slab underneath
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(chunk.x, chunk.y + 3.5);
      ctx.rotate(chunk.rot);
      ctx.scale(sc, sc);
      ctx.fillStyle = '#2a1d13';
      tracePoly(chunk.verts);
      ctx.fill();
      ctx.restore();

      // 3. Textured top face + crisp fracture bevel highlight
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(chunk.x, chunk.y);
      ctx.rotate(chunk.rot);
      ctx.scale(sc, sc);
      tracePoly(chunk.verts);
      ctx.fillStyle = this.soilPattern || '#634b35';
      ctx.fill();
      ctx.fillStyle = chunk.shade < 1
        ? 'rgba(72, 54, 38, 0.28)'
        : 'rgba(120, 98, 72, 0.28)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(218, 196, 162, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    }
  }
}
