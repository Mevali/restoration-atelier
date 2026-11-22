import { TOOLS_META } from './tools-meta.js';
import { FX_META } from './fx-meta.js';

const SIZE = 600;
const SPRITE_RECT = { x: 50, y: 70, w: 500, h: 500 };

const imageCache = new Map();
const thumbCache = new Map();
let workshopAssetsState = null;
let workshopCorePromise = null;
let workshopFullPromise = null;

function createCanvas(w = SIZE, h = SIZE, readFreq = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  if (readFreq) {
    c.getContext('2d', { willReadFrequently: true });
  }
  return c;
}

function loadImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);

  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load asset: ${src}`));
    img.src = src;
  });

  imageCache.set(src, promise);
  return promise;
}

function loadWebp(partId, state) {
  return loadImage(`assets/items/${partId}_${state}.webp`);
}

export async function loadWorkshopAssets(priorityToolIds = null, priorityFxIds = null) {
  if (!workshopCorePromise) {
    workshopCorePromise = (async () => {
      const [workbenchBg, foamTexture, soilTexture, screwClean, screwRusty] = await Promise.all([
        loadImage('assets/env/workbench_bg.webp'),
        loadImage('assets/env/foam_texture.webp'),
        loadImage('assets/env/soil_texture.webp'),
        loadImage('assets/env/screw_clean.webp'),
        loadImage('assets/env/screw_rusty.webp')
      ]);
      workshopAssetsState = {
        workbenchBg,
        foamTexture,
        soilTexture,
        screwClean,
        screwRusty,
        tools: {},
        fx: {}
      };
      return workshopAssetsState;
    })();
  }

  const state = await workshopCorePromise;

  const toolEntries = Object.entries(TOOLS_META);
  const fxEntries = Object.entries(FX_META);
  const prioTools = Array.isArray(priorityToolIds) ? new Set(priorityToolIds) : null;
  const prioFx = Array.isArray(priorityFxIds) ? new Set(priorityFxIds) : null;

  const loadToolEntry = async ([toolId, meta]) => {
    if (state.tools[toolId]) return;
    const img = await loadImage(meta.src);
    state.tools[toolId] = { img, meta };
  };
  const loadFxEntry = async ([fxId, meta]) => {
    if (state.fx[fxId]) return;
    const img = await loadImage(meta.src);
    state.fx[fxId] = { img, meta };
  };

  if (prioTools || prioFx) {
    await Promise.all([
      ...toolEntries.filter(([id]) => !prioTools || prioTools.has(id)).map(loadToolEntry),
      ...fxEntries.filter(([id]) => !prioFx || prioFx.has(id)).map(loadFxEntry)
    ]);
    // Defer warming remaining tools and FX until after initial item textures & game_ready
    if (!workshopFullPromise) {
      setTimeout(() => {
        if (!workshopFullPromise) {
          workshopFullPromise = Promise.all([
            ...toolEntries.map(loadToolEntry),
            ...fxEntries.map(loadFxEntry)
          ]).catch(() => {});
        }
      }, 1400);
    }
    return state;
  }

  if (!workshopFullPromise) {
    workshopFullPromise = Promise.all([
      ...toolEntries.map(loadToolEntry),
      ...fxEntries.map(loadFxEntry)
    ]);
  }
  await workshopFullPromise;
  return state;
}

function drawSpriteCentered(ctx, img) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.drawImage(img, SPRITE_RECT.x, SPRITE_RECT.y, SPRITE_RECT.w, SPRITE_RECT.h);
}

function buildPartLayerBundle(partId, cleanImg, rustyImg, muddyImg, steps, soilTexture) {
  const cleanCanvas = createCanvas();
  const cctx = cleanCanvas.getContext('2d');
  cctx.save();
  cctx.filter = 'contrast(1.06) saturate(1.08) brightness(1.03)';
  drawSpriteCentered(cctx, cleanImg);
  cctx.restore();

  const maskCanvas = createCanvas(SIZE, SIZE, true);
  const mctx = maskCanvas.getContext('2d', { willReadFrequently: true });
  drawSpriteCentered(mctx, cleanImg);
  mctx.globalCompositeOperation = 'source-in';
  mctx.fillStyle = '#ffffff';
  mctx.fillRect(0, 0, SIZE, SIZE);

  const hasScrape = steps.some((s) => s.partId === partId && s.type === 'scrape');
  const hasRinse = steps.some((s) => s.partId === partId && s.type === 'rinse');
  const hasSandblast = steps.some((s) => s.partId === partId && s.type === 'sandblast');
  const hasPaint = steps.some((s) => s.partId === partId && s.type === 'paint');
  const hasPolish = steps.some((s) => s.partId === partId && s.type === 'polish');

  const dullCanvas = createCanvas();
  const dctx = dullCanvas.getContext('2d');
  dctx.save();
  dctx.filter = hasPaint
    ? 'saturate(0.76) brightness(0.76) contrast(0.92)'
    : 'saturate(0.38) brightness(0.66) contrast(0.86)';
  drawSpriteCentered(dctx, cleanImg);
  dctx.restore();
  dctx.globalCompositeOperation = 'source-atop';
  dctx.fillStyle = hasPaint ? 'rgba(92, 82, 68, 0.30)' : 'rgba(96, 78, 52, 0.40)';
  dctx.fillRect(0, 0, SIZE, SIZE);
  dctx.globalCompositeOperation = 'source-over';

  const rustyLayer = createCanvas(SIZE, SIZE, true);
  const rctx = rustyLayer.getContext('2d', { willReadFrequently: true });
  drawSpriteCentered(rctx, rustyImg);
  rctx.globalCompositeOperation = 'destination-in';
  rctx.drawImage(maskCanvas, 0, 0);
  rctx.globalCompositeOperation = 'source-over';

  const muddyLayer = createCanvas(SIZE, SIZE, true);
  const mdctx = muddyLayer.getContext('2d', { willReadFrequently: true });
  drawSpriteCentered(mdctx, muddyImg);
  mdctx.globalCompositeOperation = 'destination-in';
  mdctx.drawImage(maskCanvas, 0, 0);
  mdctx.globalCompositeOperation = 'source-over';

  // Align layer stack with the actual operations configured for this part
  if (!hasRinse && hasSandblast) {
    rctx.globalCompositeOperation = 'source-over';
    rctx.globalAlpha = 0.72;
    rctx.drawImage(muddyLayer, 0, 0);
    rctx.globalAlpha = 1;
    rctx.globalCompositeOperation = 'destination-in';
    rctx.drawImage(maskCanvas, 0, 0);
    rctx.globalCompositeOperation = 'source-over';
    mdctx.clearRect(0, 0, SIZE, SIZE);
  } else if (!hasSandblast && hasRinse) {
    const tempMud = createCanvas();
    tempMud.getContext('2d').drawImage(muddyLayer, 0, 0);
    mdctx.globalCompositeOperation = 'source-over';
    mdctx.clearRect(0, 0, SIZE, SIZE);
    mdctx.drawImage(rustyLayer, 0, 0);
    mdctx.globalAlpha = 0.88;
    mdctx.drawImage(tempMud, 0, 0);
    mdctx.globalAlpha = 1;
    mdctx.globalCompositeOperation = 'destination-in';
    mdctx.drawImage(maskCanvas, 0, 0);
    mdctx.globalCompositeOperation = 'source-over';
    rctx.clearRect(0, 0, SIZE, SIZE);
  } else if (!hasSandblast && !hasRinse) {
    rctx.clearRect(0, 0, SIZE, SIZE);
    mdctx.clearRect(0, 0, SIZE, SIZE);
  }

  const primerLayer = createCanvas(SIZE, SIZE, true);
  if (hasPaint) {
    const pctx = primerLayer.getContext('2d', { willReadFrequently: true });
    pctx.save();
    pctx.filter = 'grayscale(1) brightness(1.24) contrast(0.75)';
    drawSpriteCentered(pctx, cleanImg);
    pctx.restore();
    pctx.globalCompositeOperation = 'source-atop';
    pctx.fillStyle = 'rgba(196, 203, 212, 0.56)';
    pctx.fillRect(0, 0, SIZE, SIZE);
    pctx.globalCompositeOperation = 'destination-in';
    pctx.drawImage(maskCanvas, 0, 0);
    pctx.globalCompositeOperation = 'source-over';
  }

  const crustMaskCanvas = createCanvas(SIZE, SIZE, true);
  const crustCrackOverlay = createCanvas();
  const crustLayer = createCanvas();
  let crustPlates = [];
  if (hasScrape) {
    const cmctx = crustMaskCanvas.getContext('2d', { willReadFrequently: true });
    cmctx.drawImage(maskCanvas, 0, 0);

    let seed = 0;
    for (let i = 0; i < partId.length; i++) seed = (seed * 31 + partId.charCodeAt(i)) % 9973;
    const rand = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };

    cmctx.save();
    cmctx.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 9; k++) {
      const ang = (Math.PI * 2 * k) / 9 + rand() * 0.45;
      const dist = 115 + rand() * 95;
      const cx = 300 + Math.cos(ang) * dist;
      const cy = 320 + Math.sin(ang) * dist;
      const rr = 22 + rand() * 24;
      cmctx.beginPath();
      cmctx.moveTo(cx + rr, cy);
      for (let v = 1; v <= 6; v++) {
        const a = (Math.PI * 2 * v) / 6;
        const r2 = rr * (0.65 + rand() * 0.45);
        cmctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      }
      cmctx.closePath();
      cmctx.fill();
    }
    cmctx.restore();

    cmctx.save();
    cmctx.globalCompositeOperation = 'destination-in';
    cmctx.drawImage(maskCanvas, 0, 0);
    cmctx.restore();

    // Generate deterministic Voronoi clay plates & surface crack network inside crustMaskCanvas
    const cmData = cmctx.getImageData(0, 0, SIZE, SIZE).data;
    const targetPlates = 22 + Math.floor(rand() * 7); // 22..28
    const seeds = [];
    const tryAddSeeds = (minDist, maxAttempts) => {
      for (let attempt = 0; attempt < maxAttempts && seeds.length < targetPlates; attempt++) {
        const cx = Math.floor(24 + rand() * (SIZE - 48));
        const cy = Math.floor(24 + rand() * (SIZE - 48));
        if (cmData[(cy * SIZE + cx) * 4 + 3] <= 150) continue;
        let ok = true;
        for (let j = 0; j < seeds.length; j++) {
          const dx = cx - seeds[j].cx;
          const dy = cy - seeds[j].cy;
          if (dx * dx + dy * dy < minDist * minDist) {
            ok = false;
            break;
          }
        }
        if (ok) seeds.push({ cx, cy });
      }
    };
    tryAddSeeds(42, 1100);
    if (seeds.length < 14) {
      tryAddSeeds(30, 500);
    }

    const RAY_COUNT = 12;
    for (let i = 0; i < seeds.length; i++) {
      const si = seeds[i];
      const verts = [];
      let sumR = 0;
      for (let m = 0; m < RAY_COUNT; m++) {
        const theta = (Math.PI * 2 * m) / RAY_COUNT;
        const dx = Math.cos(theta);
        const dy = Math.sin(theta);
        let rLimit = 52;
        for (let j = 0; j < seeds.length; j++) {
          if (i === j) continue;
          const vx = seeds[j].cx - si.cx;
          const vy = seeds[j].cy - si.cy;
          const dot = dx * vx + dy * vy;
          if (dot > 1e-4) {
            const t = (vx * vx + vy * vy) / (2 * dot);
            if (t < rLimit) rLimit = t;
          }
        }
        rLimit *= 0.88 + rand() * 0.20;

        let rValid = 4;
        for (let r = 4; r <= rLimit; r += 4) {
          const px = Math.round(si.cx + dx * r);
          const py = Math.round(si.cy + dy * r);
          if (px < 2 || px >= SIZE - 2 || py < 2 || py >= SIZE - 2) break;
          if (cmData[(py * SIZE + px) * 4 + 3] < 128) break;
          rValid = r;
        }
        verts.push({ dx: dx * rValid, dy: dy * rValid });
        sumR += rValid;
      }

      const avgR = sumR / RAY_COUNT;
      if (avgR >= 10) {
        crustPlates.push({
          cx: si.cx,
          cy: si.cy,
          avgR,
          verts,
          hp: 1,
          maxHp: 1,
          cracked: false,
          popped: false
        });
      }
    }

    const octx = crustCrackOverlay.getContext('2d');
    octx.save();
    octx.lineJoin = 'round';
    octx.lineCap = 'round';
    octx.strokeStyle = 'rgba(218, 198, 165, 0.24)';
    octx.lineWidth = 1.5;
    for (const pl of crustPlates) {
      octx.beginPath();
      pl.verts.forEach((v, idx) => {
        const px = pl.cx + v.dx + 1;
        const py = pl.cy + v.dy + 1;
        if (idx === 0) octx.moveTo(px, py);
        else octx.lineTo(px, py);
      });
      octx.closePath();
      octx.stroke();
    }
    octx.strokeStyle = 'rgba(18, 12, 7, 0.58)';
    octx.lineWidth = 1.5;
    for (const pl of crustPlates) {
      octx.beginPath();
      pl.verts.forEach((v, idx) => {
        const px = pl.cx + v.dx;
        const py = pl.cy + v.dy;
        if (idx === 0) octx.moveTo(px, py);
        else octx.lineTo(px, py);
      });
      octx.closePath();
      octx.stroke();
    }
    octx.globalCompositeOperation = 'destination-in';
    octx.drawImage(crustMaskCanvas, 0, 0);
    octx.restore();

    const clctx = crustLayer.getContext('2d');
    clctx.save();
    clctx.shadowColor = 'rgba(8, 6, 4, 0.72)';
    clctx.shadowBlur = 2.5;
    clctx.shadowOffsetY = 3.5;
    clctx.drawImage(crustMaskCanvas, 0, 0);
    clctx.restore();

    clctx.save();
    clctx.globalCompositeOperation = 'source-in';
    if (soilTexture) {
      clctx.fillStyle = clctx.createPattern(soilTexture, 'repeat');
      clctx.fillRect(0, 0, SIZE, SIZE);
    } else {
      clctx.fillStyle = '#5a4330';
      clctx.fillRect(0, 0, SIZE, SIZE);
    }
    clctx.globalCompositeOperation = 'source-atop';
    clctx.globalAlpha = 0.45;
    clctx.drawImage(muddyLayer, 0, 0);
    clctx.globalAlpha = 1;
    clctx.fillStyle = 'rgba(130, 112, 86, 0.25)';
    clctx.fillRect(0, 0, SIZE, SIZE);
    clctx.drawImage(crustCrackOverlay, 0, 0);
    clctx.restore();

    clctx.save();
    clctx.globalCompositeOperation = 'destination-in';
    clctx.drawImage(maskCanvas, 0, 0);
    clctx.restore();
  }

  const dullLayer = createCanvas(SIZE, SIZE, true);
  if (hasPolish) {
    dullLayer.getContext('2d', { willReadFrequently: true }).drawImage(dullCanvas, 0, 0);
  }

  const foamMaskCanvas = createCanvas(SIZE, SIZE, true);
  const foamLayer = createCanvas();

  const baseCleanCanvas = createCanvas();
  baseCleanCanvas.getContext('2d').drawImage(cleanCanvas, 0, 0);

  const baseDullCanvas = createCanvas();
  baseDullCanvas.getContext('2d').drawImage(dullCanvas, 0, 0);

  return {
    partId,
    cleanCanvas,
    dullCanvas,
    baseCleanCanvas,
    baseDullCanvas,
    maskCanvas,
    primerLayer,
    rustyLayer,
    muddyLayer,
    crustMaskCanvas,
    crustCrackOverlay,
    crustLayer,
    crustPlates,
    dullLayer,
    foamMaskCanvas,
    foamLayer,
    hasScrape,
    hasRinse,
    hasSandblast,
    hasPaint,
    hasPolish
  };
}

function paintTintedCopy(dstCanvas, srcCanvas, maskCanvas, swatch) {
  const ctx = dstCanvas.getContext('2d');
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.drawImage(srcCanvas, 0, 0);

  if (swatch && swatch.tint && swatch.hex) {
    ctx.globalCompositeOperation = 'color';
    ctx.globalAlpha = 0.56;
    ctx.fillStyle = swatch.hex;
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = swatch.hex;
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.globalCompositeOperation = 'destination-in';
    ctx.globalAlpha = 1;
    ctx.drawImage(maskCanvas, 0, 0);
  }
  ctx.restore();
}

export function applyPartPaintTint(bundle, swatch) {
  if (!bundle || !bundle.baseCleanCanvas || !bundle.baseDullCanvas) return;

  const tmpClean = createCanvas();
  const tmpDull = createCanvas();
  paintTintedCopy(tmpClean, bundle.baseCleanCanvas, bundle.maskCanvas, swatch);
  paintTintedCopy(tmpDull, bundle.baseDullCanvas, bundle.maskCanvas, swatch);

  const cctx = bundle.cleanCanvas.getContext('2d');
  cctx.clearRect(0, 0, SIZE, SIZE);
  cctx.drawImage(tmpClean, 0, 0);

  const dctx = bundle.dullCanvas.getContext('2d');
  dctx.clearRect(0, 0, SIZE, SIZE);
  dctx.drawImage(tmpDull, 0, 0);

  if (bundle.hasPolish) {
    const dlctx = bundle.dullLayer.getContext('2d');
    dlctx.save();
    dlctx.globalCompositeOperation = 'source-in';
    dlctx.drawImage(tmpDull, 0, 0);
    dlctx.restore();
  }
}

export async function buildOrderPartBundles(orderSpec) {
  const { item } = orderSpec;
  const bundles = {};
  const { soilTexture } = await loadWorkshopAssets([], []);

  await Promise.all(
    item.parts.map(async (partId) => {
      const [cleanImg, rustyImg, muddyImg] = await Promise.all([
        loadWebp(partId, 'clean'),
        loadWebp(partId, 'rusty'),
        loadWebp(partId, 'muddy')
      ]);
      bundles[partId] = buildPartLayerBundle(partId, cleanImg, rustyImg, muddyImg, item.steps, soilTexture);
    })
  );

  return bundles;
}

export function renderCompositeSnapshot(item, bundles, mode = 'dirty') {
  const snap = createCanvas();
  const ctx = snap.getContext('2d');
  const baseBundle = bundles[item.basePartId];
  const coverBundle = item.coverPartId ? bundles[item.coverPartId] : null;

  const drawPartState = (b) => {
    if (!b) return;
    if (mode === 'clean') {
      ctx.drawImage(b.cleanCanvas, 0, 0);
    } else {
      ctx.drawImage(b.dullCanvas, 0, 0);
      ctx.drawImage(b.primerLayer, 0, 0);
      ctx.drawImage(b.rustyLayer, 0, 0);
      ctx.drawImage(b.muddyLayer, 0, 0);
      ctx.drawImage(b.crustLayer, 0, 0);
    }
  };

  drawPartState(baseBundle);
  if (coverBundle) {
    drawPartState(coverBundle);
  }
  return snap.toDataURL('image/png');
}

export async function getItemThumbDataUrl(item) {
  if (thumbCache.has(item.id)) return thumbCache.get(item.id);
  if (!item.coverPartId) {
    const directUrl = `assets/items/${item.basePartId}_clean.webp`;
    thumbCache.set(item.id, directUrl);
    return directUrl;
  }

  const thumb = createCanvas(200, 200);
  const tctx = thumb.getContext('2d');

  try {
    const baseImg = await loadWebp(item.basePartId, 'clean');
    tctx.drawImage(baseImg, 12, 12, 176, 176);
    if (item.coverPartId) {
      const coverImg = await loadWebp(item.coverPartId, 'clean');
      tctx.drawImage(coverImg, 12, 12, 176, 176);
    }
  } catch {
    // Safe blank placeholder
  }

  const url = thumb.toDataURL('image/png');
  thumbCache.set(item.id, url);
  return url;
}
