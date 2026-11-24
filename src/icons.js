const SVG_MAP = {
  coin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5" stroke-dasharray="2 2"/><path d="M12 8.5v7M10 10.5c0-.8.9-1.3 2-1.3s2 .5 2 1.3c0 1.4-4 1.1-4 2.7 0 .8.9 1.3 2 1.3s2-.5 2-1.3"/></svg>`,
  foamCan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="8" width="9" height="13" rx="2"/><path d="M8 8V5.5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 13 5.5V8"/><path d="M13 5h3"/><path d="M17.5 4.5c1.5-.5 2.8.5 2.5 1.8 1 .7.8 2.4-.5 2.7-1.2.3-2-.4-2.2-1.2"/><path d="M6 13h9"/></svg>`,
  waterGun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h11l2-2h3v4h-3l-2-2"/><path d="M7 10l-2 9h3.5l1.5-6"/><path d="M11 10v3.5h2.5"/><path d="M19.5 7.5l2-1.5M19.5 10h2.5M19.5 12.5l2 1.5"/></svg>`,
  screwdriver: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 9.5L19 5l1.5 1.5L16 11"/><path d="M19 5l1.5-1.5 1 1L20 6"/><path d="M4.2 19.8a2.5 2.5 0 0 1 0-3.5l5.3-5.3 3.5 3.5-5.3 5.3a2.5 2.5 0 0 1-3.5 0z"/><path d="M7.5 13l3.5 3.5"/></svg>`,
  sandblaster: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15l7-7 4 4-7 7H3v-4z"/><path d="M13.5 6.5l2-2 3.5 3.5-2 2"/><path d="M19 4l1.5-1.5M20.5 7.5H22M17 11l1.5 1.5"/><circle cx="18.5" cy="4.5" r="0.6" fill="currentColor"/><circle cx="21" cy="10.5" r="0.6" fill="currentColor"/></svg>`,
  oiler: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18a4 4 0 0 1 4-4h5l3 5H4z"/><path d="M13 14l7-8"/><path d="M7 14v-2.5a1.5 1.5 0 0 1 3 0V14"/><path d="M20.5 9.5c.8 1.2.8 2.4 0 3a1.4 1.4 0 0 1-2 0c-.8-.6-.8-1.8 0-3l1-1.5 1 1.5z"/></svg>`,
  polisher: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="13" r="7"/><circle cx="11" cy="13" r="2.5"/><path d="M11 6v2M11 18v2M4 13h2M16 13h2"/><path d="M19 3l.7 1.8L21.5 5.5l-1.8.7L19 8l-.7-1.8L16.5 5.5l1.8-.7z"/></svg>`,
  handAssemble: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="13" width="16" height="7" rx="1.5"/><path d="M7.5 4h9v5h-9z"/><path d="M12 9v4M9.5 11.5L12 14l2.5-2.5"/></svg>`,
  trowel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20l5-5M6.5 16.5l3-3 1.5 1.5-3 3z"/><path d="M9.5 13.5L13 5l6 6-8.5 3.5z"/></svg>`,
  scraper: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4.5-4.5M7 14l3 3"/><path d="M8.5 12.5l6.5-8 5 5-8 6.5z"/><path d="M13 6l5 5"/></svg>`,
  airbrush: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h5l2-2h7v3H10L8 9"/><path d="M12 7V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V7"/><path d="M13 10l-1.5 9h3L15 10"/><path d="M3 9l-1-1M2.5 9.5H1M3 10l-1 1"/></svg>`,
  solderIron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l5.5-5.5M8.5 13l4-4 2.5 2.5-4 4z"/><path d="M12.5 9l4.5-4.5L19.5 2l-2.5 5"/><path d="M19 3l1.5-.5M20 5l2 .2"/></svg>`,
  contactSpray: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="8" height="12" rx="1.8"/><path d="M11 9V6h4v3"/><path d="M11 7.2H4.5"/><path d="M9 13h8"/><path d="M3.5 5.5L2 4.5M3 7.2H1.5M3.5 9L2 10"/></svg>`,
  stampMark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="11" r="6.5"/><path d="M8.5 16.5L7 22l5-2.2L17 22l-1.5-5.5"/><path d="M10 11l1.5 1.5L14.5 9.5"/></svg>`,
  sparklePlay: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5l2 5.2 5.5 2-5.5 2-2 5.3-2-5.3-5.5-2 5.5-2 2-5.2z"/><path d="M18.5 15l1 2.2 2.2 1-2.2 1-1 2.3-1-2.3-2.2-1 2.2-1 1-2.2z"/></svg>`,
  wrench: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4.5 4.5 0 0 0-5.9 5.9L4 17a1.5 1.5 0 0 0 2.1 2.1l4.8-4.8a4.5 4.5 0 0 0 5.9-5.9l-2.3 2.3-2.1-.4-.4-2.1 2.7-1.9z"/></svg>`,
  museum: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-5 9 5H3z"/><path d="M5 9v9M9.5 9v9M14.5 9v9M19 9v9"/><path d="M3 18h18M2 21h20"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="12" cy="15.5" r="1.5" fill="currentColor"/></svg>`,
  volumeOn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`,
  volumeOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M21 9l-6 6M15 9l6 6"/></svg>`,
  loupe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/><path d="M8.5 10.5h4M10.5 8.5v4"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4.5 13.5H11L9.5 22 19.5 10H13L13 2z"/></svg>`,
  playAd: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M10 9l5.5 3-5.5 3V9z" fill="currentColor"/></svg>`,
  sealCheck: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 2.1 3.2-.3 1 3.1 2.9 1.4-.9 3.1 1.7 2.8-2.4 2.1.3 3.2-3.1 1-1.4 2.9-3.1-.9L9.8 23l-2.1-2.4-3.2.3-1-3.1-2.9-1.4.9-3.1L-.2 10.5l2.4-2.1-.3-3.2 3.1-1 1.4-2.9 3.1.9L12 2z"/><path d="M8.5 12.2l2.3 2.3 4.8-4.8"/></svg>`,
  boxSupply: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4v10l-9 4-9-4V7z"/><path d="M3 7l9 4 9-4M12 11v10"/></svg>`,
  rulerSize: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16L16 4l4 4L8 20H4v-4z"/><path d="M13 7l2 2M10 10l2 2M7 13l2 2"/></svg>`,
  gaugePower: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15a8 8 0 1 1 16 0"/><path d="M12 14l4-4"/><circle cx="12" cy="14" r="1.5" fill="currentColor"/></svg>`,
  scaleAppraisal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16M7 20h10M5 8h14"/><path d="M5 8l-2 5h4L5 8zM19 8l-2 5h4l-2-5z"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14.5 14.5 0 0 1 0 18 14.5 14.5 0 0 1 0-18z"/></svg>`,
  trophy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/></svg>`,
  gavel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6-3 3-6-6 3-3z"/><path d="M12.5 8.5L5 16l3 3 7.5-7.5"/><path d="M3 21h9"/></svg>`,
  helpCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 1 1 3.8 2.3c-.9.5-1.3 1-1.3 2"/><circle cx="12" cy="17" r="0.9" fill="currentColor"/></svg>`
};

export function iconSvg(name, className = 'ui-svg') {
  const raw = SVG_MAP[name] || SVG_MAP.wrench;
  return raw.replace('<svg ', `<svg class="${className}" aria-hidden="true" `);
}

export function getStepIconName(stepType, kind = null) {
  switch (stepType) {
    case 'excavate':
      return 'trowel';
    case 'scrape':
      return 'scraper';
    case 'paint':
      return 'airbrush';
    case 'foam':
      return 'foamCan';
    case 'rinse':
      return 'waterGun';
    case 'unscrew':
      return 'screwdriver';
    case 'sandblast':
      return 'sandblaster';
    case 'precision':
      if (kind === 'solder') return 'solderIron';
      if (kind === 'contacts') return 'contactSpray';
      return 'oiler';
    case 'polish':
      return 'polisher';
    case 'assemble':
      return 'handAssemble';
    default:
      return 'wrench';
  }
}
