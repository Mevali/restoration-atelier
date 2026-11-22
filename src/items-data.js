export const ITEMS_CATALOG = [
  {
    id: 'pocket_watch',
    rarity: 'common',
    baseReward: 115,
    dirtHardness: 0.55,
    parts: ['lvl1_watch'],
    basePartId: 'lvl1_watch',
    coverPartId: null,
    steps: [
      { type: 'excavate', partId: 'lvl1_watch' },
      { type: 'foam', partId: 'lvl1_watch' },
      { type: 'rinse', partId: 'lvl1_watch' },
      { type: 'polish', partId: 'lvl1_watch' }
    ]
  },
  {
    id: 'vintage_camera',
    rarity: 'rare',
    baseReward: 210,
    dirtHardness: 0.82,
    parts: ['lvl2_cam_body', 'lvl2_cam_lens'],
    basePartId: 'lvl2_cam_body',
    coverPartId: 'lvl2_cam_lens',
    steps: [
      {
        type: 'unscrew',
        partId: 'lvl2_cam_lens',
        basePartId: 'lvl2_cam_body',
        screws: [
          { x: 253, y: 287 },
          { x: 373, y: 407 }
        ]
      },
      { type: 'scrape', partId: 'lvl2_cam_body' },
      { type: 'foam', partId: 'lvl2_cam_body' },
      { type: 'rinse', partId: 'lvl2_cam_body' },
      {
        type: 'paint',
        partId: 'lvl2_cam_body',
        color: '#334155',
        palette: [
          { hex: '#334155', tint: false },
          { hex: '#166534', tint: true },
          { hex: '#991b1b', tint: true }
        ]
      },
      { type: 'polish', partId: 'lvl2_cam_lens' },
      {
        type: 'assemble',
        dragPartId: 'lvl2_cam_lens',
        basePartId: 'lvl2_cam_body',
        screws: [
          { x: 253, y: 287 },
          { x: 373, y: 407 }
        ]
      }
    ]
  },
  {
    id: 'royal_dagger',
    rarity: 'rare',
    baseReward: 320,
    dirtHardness: 1.06,
    parts: ['lvl3_dagger'],
    basePartId: 'lvl3_dagger',
    coverPartId: null,
    steps: [
      { type: 'excavate', partId: 'lvl3_dagger' },
      { type: 'scrape', partId: 'lvl3_dagger' },
      { type: 'foam', partId: 'lvl3_dagger' },
      { type: 'rinse', partId: 'lvl3_dagger' },
      { type: 'sandblast', partId: 'lvl3_dagger' },
      {
        type: 'precision',
        partId: 'lvl3_dagger',
        kind: 'solder',
        spots: [
          { x: 172, y: 448 },
          { x: 242, y: 378 },
          { x: 285, y: 335 }
        ]
      },
      { type: 'polish', partId: 'lvl3_dagger' }
    ]
  },
  {
    id: 'retro_console',
    rarity: 'epic',
    baseReward: 480,
    dirtHardness: 1.16,
    parts: ['lvl4_console_base', 'lvl4_console_shell'],
    basePartId: 'lvl4_console_base',
    coverPartId: 'lvl4_console_shell',
    steps: [
      {
        type: 'unscrew',
        partId: 'lvl4_console_shell',
        basePartId: 'lvl4_console_base',
        screws: [
          { x: 228, y: 152 },
          { x: 372, y: 152 },
          { x: 228, y: 486 },
          { x: 372, y: 486 }
        ]
      },
      { type: 'sandblast', partId: 'lvl4_console_base' },
      {
        type: 'precision',
        partId: 'lvl4_console_base',
        kind: 'contacts',
        spots: [
          { x: 235, y: 225 },
          { x: 355, y: 225 },
          { x: 246, y: 382 },
          { x: 354, y: 382 }
        ]
      },
      { type: 'polish', partId: 'lvl4_console_base' },
      { type: 'scrape', partId: 'lvl4_console_shell' },
      { type: 'foam', partId: 'lvl4_console_shell' },
      { type: 'rinse', partId: 'lvl4_console_shell' },
      {
        type: 'paint',
        partId: 'lvl4_console_shell',
        color: '#d6cfc2',
        palette: [
          { hex: '#d6cfc2', tint: false },
          { hex: '#4f46e5', tint: true },
          { hex: '#0d9488', tint: true }
        ]
      },
      { type: 'polish', partId: 'lvl4_console_shell' },
      {
        type: 'assemble',
        dragPartId: 'lvl4_console_shell',
        basePartId: 'lvl4_console_base',
        screws: [
          { x: 228, y: 152 },
          { x: 372, y: 152 },
          { x: 228, y: 486 },
          { x: 372, y: 486 }
        ]
      }
    ]
  },
  {
    id: 'imperial_medallion',
    rarity: 'epic',
    baseReward: 680,
    dirtHardness: 1.25,
    parts: ['lvl5_medallion_core', 'lvl5_medallion_lid'],
    basePartId: 'lvl5_medallion_core',
    coverPartId: 'lvl5_medallion_lid',
    steps: [
      { type: 'excavate', partId: 'lvl5_medallion_lid' },
      { type: 'foam', partId: 'lvl5_medallion_lid' },
      { type: 'rinse', partId: 'lvl5_medallion_lid' },
      {
        type: 'unscrew',
        partId: 'lvl5_medallion_lid',
        basePartId: 'lvl5_medallion_core',
        screws: [
          { x: 300, y: 162 },
          { x: 458, y: 320 },
          { x: 300, y: 478 },
          { x: 142, y: 320 }
        ]
      },
      { type: 'sandblast', partId: 'lvl5_medallion_core' },
      {
        type: 'precision',
        partId: 'lvl5_medallion_core',
        kind: 'oil',
        spots: [
          { x: 256, y: 284 },
          { x: 344, y: 290 },
          { x: 300, y: 372 },
          { x: 300, y: 295 }
        ]
      },
      { type: 'polish', partId: 'lvl5_medallion_core' },
      {
        type: 'paint',
        partId: 'lvl5_medallion_lid',
        color: '#2563eb',
        palette: [
          { hex: '#2563eb', tint: false },
          { hex: '#047857', tint: true },
          { hex: '#be123c', tint: true }
        ]
      },
      { type: 'polish', partId: 'lvl5_medallion_lid' },
      {
        type: 'assemble',
        dragPartId: 'lvl5_medallion_lid',
        basePartId: 'lvl5_medallion_core',
        screws: [
          { x: 300, y: 162 },
          { x: 458, y: 320 },
          { x: 300, y: 478 },
          { x: 142, y: 320 }
        ]
      }
    ]
  },
  {
    id: 'vintage_lighter',
    rarity: 'rare',
    baseReward: 880,
    dirtHardness: 1.34,
    parts: ['lvl6_lighter'],
    basePartId: 'lvl6_lighter',
    coverPartId: null,
    steps: [
      { type: 'excavate', partId: 'lvl6_lighter' },
      { type: 'scrape', partId: 'lvl6_lighter' },
      { type: 'foam', partId: 'lvl6_lighter' },
      { type: 'rinse', partId: 'lvl6_lighter' },
      { type: 'sandblast', partId: 'lvl6_lighter' },
      {
        type: 'precision',
        partId: 'lvl6_lighter',
        kind: 'oil',
        spots: [
          { x: 275, y: 262 },
          { x: 295, y: 315 },
          { x: 395, y: 265 }
        ]
      },
      { type: 'polish', partId: 'lvl6_lighter' }
    ]
  },
  {
    id: 'supercar_wheel',
    rarity: 'epic',
    baseReward: 1200,
    dirtHardness: 1.42,
    parts: ['lvl7_wheel_base', 'lvl7_wheel_cap'],
    basePartId: 'lvl7_wheel_base',
    coverPartId: 'lvl7_wheel_cap',
    steps: [
      {
        type: 'unscrew',
        partId: 'lvl7_wheel_cap',
        basePartId: 'lvl7_wheel_base',
        screws: [
          { x: 300, y: 272 },
          { x: 348, y: 320 },
          { x: 300, y: 368 },
          { x: 252, y: 320 }
        ]
      },
      { type: 'scrape', partId: 'lvl7_wheel_base' },
      { type: 'foam', partId: 'lvl7_wheel_base' },
      { type: 'rinse', partId: 'lvl7_wheel_base' },
      { type: 'sandblast', partId: 'lvl7_wheel_base' },
      {
        type: 'paint',
        partId: 'lvl7_wheel_base',
        color: '#eab308',
        palette: [
          { hex: '#eab308', tint: false },
          { hex: '#dc2626', tint: true },
          { hex: '#2563eb', tint: true }
        ]
      },
      {
        type: 'precision',
        partId: 'lvl7_wheel_base',
        kind: 'oil',
        spots: [
          { x: 385, y: 275 },
          { x: 395, y: 355 },
          { x: 268, y: 295 },
          { x: 332, y: 345 }
        ]
      },
      { type: 'polish', partId: 'lvl7_wheel_base' },
      { type: 'foam', partId: 'lvl7_wheel_cap' },
      { type: 'rinse', partId: 'lvl7_wheel_cap' },
      {
        type: 'assemble',
        dragPartId: 'lvl7_wheel_cap',
        basePartId: 'lvl7_wheel_base',
        screws: [
          { x: 300, y: 272 },
          { x: 348, y: 320 },
          { x: 300, y: 368 },
          { x: 252, y: 320 }
        ]
      }
    ]
  },
  {
    id: 'music_box',
    rarity: 'epic',
    baseReward: 1580,
    dirtHardness: 1.50,
    parts: ['lvl8_music_core', 'lvl8_music_lid'],
    basePartId: 'lvl8_music_core',
    coverPartId: 'lvl8_music_lid',
    steps: [
      { type: 'scrape', partId: 'lvl8_music_lid' },
      { type: 'foam', partId: 'lvl8_music_lid' },
      { type: 'rinse', partId: 'lvl8_music_lid' },
      {
        type: 'unscrew',
        partId: 'lvl8_music_lid',
        basePartId: 'lvl8_music_core',
        screws: [
          { x: 185, y: 205 },
          { x: 415, y: 205 },
          { x: 185, y: 435 },
          { x: 415, y: 435 }
        ]
      },
      { type: 'sandblast', partId: 'lvl8_music_core' },
      {
        type: 'precision',
        partId: 'lvl8_music_core',
        kind: 'oil',
        spots: [
          { x: 235, y: 365 },
          { x: 300, y: 382 },
          { x: 365, y: 365 },
          { x: 300, y: 240 }
        ]
      },
      { type: 'polish', partId: 'lvl8_music_core' },
      {
        type: 'paint',
        partId: 'lvl8_music_lid',
        color: '#b45309',
        palette: [
          { hex: '#b45309', tint: false },
          { hex: '#991b1b', tint: true },
          { hex: '#065f46', tint: true }
        ]
      },
      { type: 'polish', partId: 'lvl8_music_lid' },
      {
        type: 'assemble',
        dragPartId: 'lvl8_music_lid',
        basePartId: 'lvl8_music_core',
        screws: [
          { x: 185, y: 205 },
          { x: 415, y: 205 },
          { x: 185, y: 435 },
          { x: 415, y: 435 }
        ]
      }
    ]
  },
  {
    id: 'diving_helmet',
    rarity: 'legendary',
    baseReward: 2050,
    dirtHardness: 1.58,
    parts: ['lvl9_helmet'],
    basePartId: 'lvl9_helmet',
    coverPartId: null,
    steps: [
      { type: 'excavate', partId: 'lvl9_helmet' },
      { type: 'scrape', partId: 'lvl9_helmet' },
      { type: 'foam', partId: 'lvl9_helmet' },
      { type: 'rinse', partId: 'lvl9_helmet' },
      { type: 'sandblast', partId: 'lvl9_helmet' },
      {
        type: 'precision',
        partId: 'lvl9_helmet',
        kind: 'solder',
        spots: [
          { x: 215, y: 320 },
          { x: 385, y: 320 },
          { x: 300, y: 165 },
          { x: 300, y: 320 }
        ]
      },
      {
        type: 'paint',
        partId: 'lvl9_helmet',
        color: '#d97706',
        palette: [
          { hex: '#d97706', tint: false },
          { hex: '#0f766e', tint: true },
          { hex: '#475569', tint: true }
        ]
      },
      { type: 'polish', partId: 'lvl9_helmet' }
    ]
  },
  {
    id: 'imperial_crown',
    rarity: 'legendary',
    baseReward: 2800,
    dirtHardness: 1.66,
    parts: ['lvl10_crown'],
    basePartId: 'lvl10_crown',
    coverPartId: null,
    steps: [
      { type: 'excavate', partId: 'lvl10_crown' },
      { type: 'scrape', partId: 'lvl10_crown' },
      { type: 'foam', partId: 'lvl10_crown' },
      { type: 'rinse', partId: 'lvl10_crown' },
      { type: 'sandblast', partId: 'lvl10_crown' },
      {
        type: 'precision',
        partId: 'lvl10_crown',
        kind: 'solder',
        spots: [
          { x: 300, y: 175 },
          { x: 300, y: 238 },
          { x: 222, y: 435 },
          { x: 300, y: 455 },
          { x: 378, y: 435 }
        ]
      },
      {
        type: 'paint',
        partId: 'lvl10_crown',
        color: '#eab308',
        palette: [
          { hex: '#eab308', tint: false },
          { hex: '#dc2626', tint: true },
          { hex: '#2563eb', tint: true }
        ]
      },
      { type: 'polish', partId: 'lvl10_crown' }
    ]
  },
  {
    id: 'brass_sextant',
    rarity: 'rare',
    baseReward: 3300,
    dirtHardness: 1.72,
    parts: ['lvl11_sextant'],
    basePartId: 'lvl11_sextant',
    coverPartId: null,
    steps: [
      { type: 'excavate', partId: 'lvl11_sextant' },
      { type: 'scrape', partId: 'lvl11_sextant' },
      { type: 'foam', partId: 'lvl11_sextant' },
      { type: 'rinse', partId: 'lvl11_sextant' },
      { type: 'sandblast', partId: 'lvl11_sextant' },
      {
        type: 'precision',
        partId: 'lvl11_sextant',
        kind: 'oil',
        spots: [
          { x: 300, y: 175 },
          { x: 245, y: 315 },
          { x: 360, y: 315 },
          { x: 300, y: 452 }
        ]
      },
      { type: 'polish', partId: 'lvl11_sextant' }
    ]
  },
  {
    id: 'rotary_phone',
    rarity: 'epic',
    baseReward: 4000,
    dirtHardness: 1.78,
    parts: ['lvl12_phone_base', 'lvl12_phone_shell'],
    basePartId: 'lvl12_phone_base',
    coverPartId: 'lvl12_phone_shell',
    steps: [
      {
        type: 'unscrew',
        partId: 'lvl12_phone_shell',
        basePartId: 'lvl12_phone_base',
        screws: [
          { x: 236, y: 255 },
          { x: 364, y: 255 },
          { x: 196, y: 462 },
          { x: 404, y: 462 }
        ]
      },
      { type: 'sandblast', partId: 'lvl12_phone_base' },
      {
        type: 'precision',
        partId: 'lvl12_phone_base',
        kind: 'contacts',
        spots: [
          { x: 236, y: 295 },
          { x: 364, y: 295 },
          { x: 252, y: 412 },
          { x: 348, y: 412 }
        ]
      },
      { type: 'polish', partId: 'lvl12_phone_base' },
      { type: 'scrape', partId: 'lvl12_phone_shell' },
      { type: 'foam', partId: 'lvl12_phone_shell' },
      { type: 'rinse', partId: 'lvl12_phone_shell' },
      {
        type: 'paint',
        partId: 'lvl12_phone_shell',
        color: '#1e293b',
        palette: [
          { hex: '#1e293b', tint: false },
          { hex: '#881337', tint: true },
          { hex: '#065f46', tint: true }
        ]
      },
      { type: 'polish', partId: 'lvl12_phone_shell' },
      {
        type: 'assemble',
        dragPartId: 'lvl12_phone_shell',
        basePartId: 'lvl12_phone_base',
        screws: [
          { x: 236, y: 255 },
          { x: 364, y: 255 },
          { x: 196, y: 462 },
          { x: 404, y: 462 }
        ]
      }
    ]
  },
  {
    id: 'samurai_tsuba',
    rarity: 'rare',
    baseReward: 4800,
    dirtHardness: 1.84,
    parts: ['lvl13_tsuba'],
    basePartId: 'lvl13_tsuba',
    coverPartId: null,
    steps: [
      { type: 'excavate', partId: 'lvl13_tsuba' },
      { type: 'scrape', partId: 'lvl13_tsuba' },
      { type: 'foam', partId: 'lvl13_tsuba' },
      { type: 'rinse', partId: 'lvl13_tsuba' },
      { type: 'sandblast', partId: 'lvl13_tsuba' },
      {
        type: 'precision',
        partId: 'lvl13_tsuba',
        kind: 'solder',
        spots: [
          { x: 300, y: 190 },
          { x: 402, y: 315 },
          { x: 300, y: 446 },
          { x: 198, y: 315 }
        ]
      },
      { type: 'polish', partId: 'lvl13_tsuba' }
    ]
  },
  {
    id: 'gramophone',
    rarity: 'epic',
    baseReward: 5700,
    dirtHardness: 1.90,
    parts: ['lvl14_gramophone'],
    basePartId: 'lvl14_gramophone',
    coverPartId: null,
    steps: [
      { type: 'scrape', partId: 'lvl14_gramophone' },
      { type: 'foam', partId: 'lvl14_gramophone' },
      { type: 'rinse', partId: 'lvl14_gramophone' },
      { type: 'sandblast', partId: 'lvl14_gramophone' },
      {
        type: 'precision',
        partId: 'lvl14_gramophone',
        kind: 'oil',
        spots: [
          { x: 300, y: 325 },
          { x: 392, y: 382 },
          { x: 245, y: 425 }
        ]
      },
      {
        type: 'paint',
        partId: 'lvl14_gramophone',
        color: '#d97706',
        palette: [
          { hex: '#d97706', tint: false },
          { hex: '#1d4ed8', tint: true },
          { hex: '#991b1b', tint: true }
        ]
      },
      { type: 'polish', partId: 'lvl14_gramophone' }
    ]
  },
  {
    id: 'moto_carburetor',
    rarity: 'rare',
    baseReward: 6700,
    dirtHardness: 1.96,
    parts: ['lvl15_carburetor'],
    basePartId: 'lvl15_carburetor',
    coverPartId: null,
    steps: [
      { type: 'scrape', partId: 'lvl15_carburetor' },
      { type: 'foam', partId: 'lvl15_carburetor' },
      { type: 'rinse', partId: 'lvl15_carburetor' },
      { type: 'sandblast', partId: 'lvl15_carburetor' },
      {
        type: 'precision',
        partId: 'lvl15_carburetor',
        kind: 'oil',
        spots: [
          { x: 245, y: 270 },
          { x: 355, y: 270 },
          { x: 300, y: 345 },
          { x: 248, y: 425 },
          { x: 352, y: 425 }
        ]
      },
      { type: 'polish', partId: 'lvl15_carburetor' }
    ]
  },
  {
    id: 'hoplite_helmet',
    rarity: 'epic',
    baseReward: 7900,
    dirtHardness: 2.02,
    parts: ['lvl16_spartan'],
    basePartId: 'lvl16_spartan',
    coverPartId: null,
    steps: [
      { type: 'excavate', partId: 'lvl16_spartan' },
      { type: 'scrape', partId: 'lvl16_spartan' },
      { type: 'foam', partId: 'lvl16_spartan' },
      { type: 'rinse', partId: 'lvl16_spartan' },
      { type: 'sandblast', partId: 'lvl16_spartan' },
      {
        type: 'precision',
        partId: 'lvl16_spartan',
        kind: 'solder',
        spots: [
          { x: 300, y: 175 },
          { x: 215, y: 392 },
          { x: 385, y: 392 }
        ]
      },
      { type: 'polish', partId: 'lvl16_spartan' }
    ]
  },
  {
    id: 'arcade_stick',
    rarity: 'epic',
    baseReward: 9300,
    dirtHardness: 2.08,
    parts: ['lvl17_arcade_base', 'lvl17_arcade_panel'],
    basePartId: 'lvl17_arcade_base',
    coverPartId: 'lvl17_arcade_panel',
    steps: [
      {
        type: 'unscrew',
        partId: 'lvl17_arcade_panel',
        basePartId: 'lvl17_arcade_base',
        screws: [
          { x: 168, y: 212 },
          { x: 432, y: 212 },
          { x: 168, y: 428 },
          { x: 432, y: 428 }
        ]
      },
      { type: 'sandblast', partId: 'lvl17_arcade_base' },
      {
        type: 'precision',
        partId: 'lvl17_arcade_base',
        kind: 'contacts',
        spots: [
          { x: 222, y: 318 },
          { x: 342, y: 278 },
          { x: 394, y: 318 },
          { x: 342, y: 365 }
        ]
      },
      { type: 'polish', partId: 'lvl17_arcade_base' },
      { type: 'scrape', partId: 'lvl17_arcade_panel' },
      { type: 'foam', partId: 'lvl17_arcade_panel' },
      { type: 'rinse', partId: 'lvl17_arcade_panel' },
      {
        type: 'paint',
        partId: 'lvl17_arcade_panel',
        color: '#dc2626',
        palette: [
          { hex: '#dc2626', tint: false },
          { hex: '#7c3aed', tint: true },
          { hex: '#0d9488', tint: true }
        ]
      },
      { type: 'polish', partId: 'lvl17_arcade_panel' },
      {
        type: 'assemble',
        dragPartId: 'lvl17_arcade_panel',
        basePartId: 'lvl17_arcade_base',
        screws: [
          { x: 168, y: 212 },
          { x: 432, y: 212 },
          { x: 168, y: 428 },
          { x: 432, y: 428 }
        ]
      }
    ]
  },
  {
    id: 'railroad_lantern',
    rarity: 'rare',
    baseReward: 10800,
    dirtHardness: 2.14,
    parts: ['lvl18_lantern'],
    basePartId: 'lvl18_lantern',
    coverPartId: null,
    steps: [
      { type: 'excavate', partId: 'lvl18_lantern' },
      { type: 'scrape', partId: 'lvl18_lantern' },
      { type: 'foam', partId: 'lvl18_lantern' },
      { type: 'rinse', partId: 'lvl18_lantern' },
      { type: 'sandblast', partId: 'lvl18_lantern' },
      {
        type: 'paint',
        partId: 'lvl18_lantern',
        color: '#d97706',
        palette: [
          { hex: '#d97706', tint: false },
          { hex: '#b91c1c', tint: true },
          { hex: '#15803d', tint: true }
        ]
      },
      {
        type: 'precision',
        partId: 'lvl18_lantern',
        kind: 'oil',
        spots: [
          { x: 300, y: 205 },
          { x: 256, y: 422 },
          { x: 344, y: 422 }
        ]
      },
      { type: 'polish', partId: 'lvl18_lantern' }
    ]
  },
  {
    id: 'brass_microscope',
    rarity: 'epic',
    baseReward: 12500,
    dirtHardness: 2.20,
    parts: ['lvl19_microscope'],
    basePartId: 'lvl19_microscope',
    coverPartId: null,
    steps: [
      { type: 'scrape', partId: 'lvl19_microscope' },
      { type: 'foam', partId: 'lvl19_microscope' },
      { type: 'rinse', partId: 'lvl19_microscope' },
      { type: 'sandblast', partId: 'lvl19_microscope' },
      {
        type: 'precision',
        partId: 'lvl19_microscope',
        kind: 'oil',
        spots: [
          { x: 248, y: 235 },
          { x: 325, y: 285 },
          { x: 295, y: 365 },
          { x: 300, y: 445 }
        ]
      },
      { type: 'polish', partId: 'lvl19_microscope' }
    ]
  },
  {
    id: 'scarab_amulet',
    rarity: 'legendary',
    baseReward: 14500,
    dirtHardness: 2.26,
    parts: ['lvl20_scarab'],
    basePartId: 'lvl20_scarab',
    coverPartId: null,
    steps: [
      { type: 'excavate', partId: 'lvl20_scarab' },
      { type: 'scrape', partId: 'lvl20_scarab' },
      { type: 'foam', partId: 'lvl20_scarab' },
      { type: 'rinse', partId: 'lvl20_scarab' },
      { type: 'sandblast', partId: 'lvl20_scarab' },
      {
        type: 'precision',
        partId: 'lvl20_scarab',
        kind: 'solder',
        spots: [
          { x: 300, y: 255 },
          { x: 195, y: 318 },
          { x: 405, y: 318 },
          { x: 300, y: 382 }
        ]
      },
      {
        type: 'paint',
        partId: 'lvl20_scarab',
        color: '#eab308',
        palette: [
          { hex: '#eab308', tint: false },
          { hex: '#0284c7', tint: true },
          { hex: '#059669', tint: true }
        ]
      },
      { type: 'polish', partId: 'lvl20_scarab' }
    ]
  },
  {
    id: 'espresso_lever',
    rarity: 'epic',
    baseReward: 16500,
    dirtHardness: 2.32,
    parts: ['lvl21_espresso'],
    basePartId: 'lvl21_espresso',
    coverPartId: null,
    steps: [
      { type: 'scrape', partId: 'lvl21_espresso' },
      { type: 'foam', partId: 'lvl21_espresso' },
      { type: 'rinse', partId: 'lvl21_espresso' },
      { type: 'sandblast', partId: 'lvl21_espresso' },
      {
        type: 'precision',
        partId: 'lvl21_espresso',
        kind: 'oil',
        spots: [
          { x: 300, y: 185 },
          { x: 255, y: 295 },
          { x: 350, y: 295 },
          { x: 300, y: 405 }
        ]
      },
      {
        type: 'paint',
        partId: 'lvl21_espresso',
        color: '#d97706',
        palette: [
          { hex: '#d97706', tint: false },
          { hex: '#b91c1c', tint: true },
          { hex: '#0f766e', tint: true }
        ]
      },
      { type: 'polish', partId: 'lvl21_espresso' }
    ]
  },
  {
    id: 'knights_gauntlet',
    rarity: 'epic',
    baseReward: 18600,
    dirtHardness: 2.38,
    parts: ['lvl22_gauntlet'],
    basePartId: 'lvl22_gauntlet',
    coverPartId: null,
    steps: [
      { type: 'excavate', partId: 'lvl22_gauntlet' },
      { type: 'scrape', partId: 'lvl22_gauntlet' },
      { type: 'foam', partId: 'lvl22_gauntlet' },
      { type: 'rinse', partId: 'lvl22_gauntlet' },
      { type: 'sandblast', partId: 'lvl22_gauntlet' },
      {
        type: 'precision',
        partId: 'lvl22_gauntlet',
        kind: 'oil',
        spots: [
          { x: 265, y: 215 },
          { x: 335, y: 215 },
          { x: 295, y: 315 },
          { x: 300, y: 418 }
        ]
      },
      { type: 'polish', partId: 'lvl22_gauntlet' }
    ]
  },
  {
    id: 'tube_radio',
    rarity: 'epic',
    baseReward: 21000,
    dirtHardness: 2.44,
    parts: ['lvl23_radio_base', 'lvl23_radio_grille'],
    basePartId: 'lvl23_radio_base',
    coverPartId: 'lvl23_radio_grille',
    steps: [
      {
        type: 'unscrew',
        partId: 'lvl23_radio_grille',
        basePartId: 'lvl23_radio_base',
        screws: [
          { x: 210, y: 245 },
          { x: 390, y: 245 },
          { x: 202, y: 465 },
          { x: 398, y: 465 }
        ]
      },
      { type: 'sandblast', partId: 'lvl23_radio_base' },
      {
        type: 'precision',
        partId: 'lvl23_radio_base',
        kind: 'contacts',
        spots: [
          { x: 242, y: 260 },
          { x: 358, y: 260 },
          { x: 242, y: 390 },
          { x: 358, y: 390 }
        ]
      },
      { type: 'polish', partId: 'lvl23_radio_base' },
      { type: 'scrape', partId: 'lvl23_radio_grille' },
      { type: 'foam', partId: 'lvl23_radio_grille' },
      { type: 'rinse', partId: 'lvl23_radio_grille' },
      {
        type: 'paint',
        partId: 'lvl23_radio_grille',
        color: '#92400e',
        palette: [
          { hex: '#92400e', tint: false },
          { hex: '#7f1d1d', tint: true },
          { hex: '#1e3a8a', tint: true }
        ]
      },
      { type: 'polish', partId: 'lvl23_radio_grille' },
      {
        type: 'assemble',
        dragPartId: 'lvl23_radio_grille',
        basePartId: 'lvl23_radio_base',
        screws: [
          { x: 210, y: 245 },
          { x: 390, y: 245 },
          { x: 202, y: 465 },
          { x: 398, y: 465 }
        ]
      }
    ]
  },
  {
    id: 'jade_censer',
    rarity: 'legendary',
    baseReward: 23600,
    dirtHardness: 2.50,
    parts: ['lvl24_censer'],
    basePartId: 'lvl24_censer',
    coverPartId: null,
    steps: [
      { type: 'excavate', partId: 'lvl24_censer' },
      { type: 'scrape', partId: 'lvl24_censer' },
      { type: 'foam', partId: 'lvl24_censer' },
      { type: 'rinse', partId: 'lvl24_censer' },
      { type: 'sandblast', partId: 'lvl24_censer' },
      {
        type: 'precision',
        partId: 'lvl24_censer',
        kind: 'solder',
        spots: [
          { x: 300, y: 185 },
          { x: 195, y: 315 },
          { x: 405, y: 315 },
          { x: 300, y: 438 }
        ]
      },
      { type: 'polish', partId: 'lvl24_censer' }
    ]
  },
  {
    id: 'vintage_saxophone',
    rarity: 'epic',
    baseReward: 26400,
    dirtHardness: 2.56,
    parts: ['lvl25_sax'],
    basePartId: 'lvl25_sax',
    coverPartId: null,
    steps: [
      { type: 'scrape', partId: 'lvl25_sax' },
      { type: 'foam', partId: 'lvl25_sax' },
      { type: 'rinse', partId: 'lvl25_sax' },
      { type: 'sandblast', partId: 'lvl25_sax' },
      {
        type: 'precision',
        partId: 'lvl25_sax',
        kind: 'oil',
        spots: [
          { x: 270, y: 195 },
          { x: 268, y: 295 },
          { x: 278, y: 390 },
          { x: 355, y: 360 }
        ]
      },
      { type: 'polish', partId: 'lvl25_sax' }
    ]
  },
  {
    id: 'ship_binnacle',
    rarity: 'legendary',
    baseReward: 29200,
    dirtHardness: 2.62,
    parts: ['lvl26_compass'],
    basePartId: 'lvl26_compass',
    coverPartId: null,
    steps: [
      { type: 'excavate', partId: 'lvl26_compass' },
      { type: 'scrape', partId: 'lvl26_compass' },
      { type: 'foam', partId: 'lvl26_compass' },
      { type: 'rinse', partId: 'lvl26_compass' },
      { type: 'sandblast', partId: 'lvl26_compass' },
      {
        type: 'precision',
        partId: 'lvl26_compass',
        kind: 'oil',
        spots: [
          { x: 300, y: 225 },
          { x: 205, y: 285 },
          { x: 395, y: 285 },
          { x: 300, y: 405 }
        ]
      },
      {
        type: 'paint',
        partId: 'lvl26_compass',
        color: '#b45309',
        palette: [
          { hex: '#b45309', tint: false },
          { hex: '#0f766e', tint: true },
          { hex: '#1e3a8a', tint: true }
        ]
      },
      { type: 'polish', partId: 'lvl26_compass' }
    ]
  },
  {
    id: 'steam_governor',
    rarity: 'epic',
    baseReward: 32200,
    dirtHardness: 2.68,
    parts: ['lvl27_steam'],
    basePartId: 'lvl27_steam',
    coverPartId: null,
    steps: [
      { type: 'scrape', partId: 'lvl27_steam' },
      { type: 'foam', partId: 'lvl27_steam' },
      { type: 'rinse', partId: 'lvl27_steam' },
      { type: 'sandblast', partId: 'lvl27_steam' },
      {
        type: 'paint',
        partId: 'lvl27_steam',
        color: '#dc2626',
        palette: [
          { hex: '#dc2626', tint: false },
          { hex: '#15803d', tint: true },
          { hex: '#1d4ed8', tint: true }
        ]
      },
      {
        type: 'precision',
        partId: 'lvl27_steam',
        kind: 'oil',
        spots: [
          { x: 300, y: 200 },
          { x: 220, y: 335 },
          { x: 380, y: 335 },
          { x: 300, y: 428 }
        ]
      },
      { type: 'polish', partId: 'lvl27_steam' }
    ]
  },
  {
    id: 'faberge_egg',
    rarity: 'legendary',
    baseReward: 35400,
    dirtHardness: 2.74,
    parts: ['lvl28_egg_core', 'lvl28_egg_shell'],
    basePartId: 'lvl28_egg_core',
    coverPartId: 'lvl28_egg_shell',
    steps: [
      { type: 'excavate', partId: 'lvl28_egg_shell' },
      { type: 'foam', partId: 'lvl28_egg_shell' },
      { type: 'rinse', partId: 'lvl28_egg_shell' },
      {
        type: 'unscrew',
        partId: 'lvl28_egg_shell',
        basePartId: 'lvl28_egg_core',
        screws: [
          { x: 300, y: 175 },
          { x: 372, y: 290 },
          { x: 300, y: 398 },
          { x: 228, y: 290 }
        ]
      },
      { type: 'sandblast', partId: 'lvl28_egg_core' },
      {
        type: 'precision',
        partId: 'lvl28_egg_core',
        kind: 'oil',
        spots: [
          { x: 268, y: 265 },
          { x: 332, y: 265 },
          { x: 300, y: 325 },
          { x: 300, y: 215 }
        ]
      },
      { type: 'polish', partId: 'lvl28_egg_core' },
      {
        type: 'paint',
        partId: 'lvl28_egg_shell',
        color: '#1d4ed8',
        palette: [
          { hex: '#1d4ed8', tint: false },
          { hex: '#be123c', tint: true },
          { hex: '#047857', tint: true }
        ]
      },
      { type: 'polish', partId: 'lvl28_egg_shell' },
      {
        type: 'assemble',
        dragPartId: 'lvl28_egg_shell',
        basePartId: 'lvl28_egg_core',
        screws: [
          { x: 300, y: 175 },
          { x: 372, y: 290 },
          { x: 300, y: 398 },
          { x: 228, y: 290 }
        ]
      }
    ]
  },
  {
    id: 'celestial_armillary',
    rarity: 'legendary',
    baseReward: 38800,
    dirtHardness: 2.80,
    parts: ['lvl29_armillary'],
    basePartId: 'lvl29_armillary',
    coverPartId: null,
    steps: [
      { type: 'excavate', partId: 'lvl29_armillary' },
      { type: 'scrape', partId: 'lvl29_armillary' },
      { type: 'foam', partId: 'lvl29_armillary' },
      { type: 'rinse', partId: 'lvl29_armillary' },
      { type: 'sandblast', partId: 'lvl29_armillary' },
      {
        type: 'precision',
        partId: 'lvl29_armillary',
        kind: 'oil',
        spots: [
          { x: 300, y: 175 },
          { x: 225, y: 290 },
          { x: 375, y: 290 },
          { x: 300, y: 425 }
        ]
      },
      { type: 'polish', partId: 'lvl29_armillary' }
    ]
  },
  {
    id: 'tutankhamun_mask',
    rarity: 'legendary',
    baseReward: 43000,
    dirtHardness: 2.86,
    parts: ['lvl30_pharaoh'],
    basePartId: 'lvl30_pharaoh',
    coverPartId: null,
    steps: [
      { type: 'excavate', partId: 'lvl30_pharaoh' },
      { type: 'scrape', partId: 'lvl30_pharaoh' },
      { type: 'foam', partId: 'lvl30_pharaoh' },
      { type: 'rinse', partId: 'lvl30_pharaoh' },
      { type: 'sandblast', partId: 'lvl30_pharaoh' },
      {
        type: 'precision',
        partId: 'lvl30_pharaoh',
        kind: 'solder',
        spots: [
          { x: 300, y: 195 },
          { x: 262, y: 278 },
          { x: 338, y: 278 },
          { x: 235, y: 425 },
          { x: 365, y: 425 }
        ]
      },
      {
        type: 'paint',
        partId: 'lvl30_pharaoh',
        color: '#eab308',
        palette: [
          { hex: '#eab308', tint: false },
          { hex: '#0284c7', tint: true },
          { hex: '#dc2626', tint: true }
        ]
      },
      { type: 'polish', partId: 'lvl30_pharaoh' }
    ]
  }
];

export const UPGRADE_DEFS = {
  brushSize: {
    baseCost: 35,
    costScale: 1.5,
    maxLevel: 30
  },
  brushPower: {
    baseCost: 40,
    costScale: 1.54,
    maxLevel: 30
  },
  appraisal: {
    baseCost: 45,
    costScale: 1.6,
    maxLevel: 40
  }
};

export const DAILY_REWARDS = [50, 90, 140, 210, 320, 460, 750];

export function getUpgradeCost(key, level) {
  const def = UPGRADE_DEFS[key];
  if (!def) return 999999;
  return Math.round(def.baseCost * Math.pow(def.costScale, Math.max(0, level - 1)));
}

export function getBrushRadius(sizeLevel, turboActive = false, orderNumber = 3) {
  const introBoost = orderNumber === 1 && sizeLevel === 1
    ? 7.5
    : orderNumber === 2 && sizeLevel === 1
      ? 3.5
      : 0;
  const base = 25.5 + introBoost + (sizeLevel - 1) * 1.9;
  return Math.min(58, base) * (turboActive ? 1.4 : 1);
}

export function getBrushStrength(powerLevel, turboActive = false, orderNumber = 3) {
  if (turboActive) return 0.92;
  const introBoost = orderNumber === 1 && powerLevel === 1
    ? 0.14
    : orderNumber === 2 && powerLevel === 1
      ? 0.06
      : 0;
  return Math.min(0.86, 0.34 + introBoost + (powerLevel - 1) * 0.055);
}

export function getAppraisalMultiplier(appraisalLevel) {
  return 1 + (appraisalLevel - 1) * 0.15;
}

export function getOrderSpec(orderIndex, lotOverride = null) {
  const catalogIdx = orderIndex % ITEMS_CATALOG.length;
  const vipCycle = Math.floor(orderIndex / ITEMS_CATALOG.length);
  const baseItem = ITEMS_CATALOG[catalogIdx];
  const item = (lotOverride?.itemId && ITEMS_CATALOG.find((x) => x.id === lotOverride.itemId)) || baseItem;
  const isReplay = Boolean(lotOverride?.isReplay);

  const vipRewardMult = isReplay ? 1 : 1 + vipCycle * 0.7;
  const vipHardnessMult = isReplay ? 1 : 1 + vipCycle * 0.22;
  const lotMult = lotOverride?.payoutMult || 1;
  const rewardBase = isReplay ? item.baseReward : Math.max(item.baseReward, baseItem.baseReward);

  return {
    orderNumber: orderIndex + 1,
    vipCycle,
    isVipOrder: !isReplay && vipCycle > 0,
    isReplay,
    lotKind: lotOverride?.kind || 'client',
    lotCost: lotOverride?.cost || 0,
    hasMakerMark: Boolean(lotOverride?.hasMakerMark),
    markMult: lotOverride?.markMult || 1,
    markRevealed: Boolean(lotOverride?.markRevealed),
    item,
    basePayout: Math.round(rewardBase * vipRewardMult * lotMult),
    dirtHardness: item.dirtHardness * vipHardnessMult
  };
}

export function computeOrderPayout(orderSpec, appraisalLevel) {
  const mult = getAppraisalMultiplier(appraisalLevel);
  const markBonus = orderSpec?.markRevealed ? (orderSpec.markMult || 1) : 1;
  return Math.round(orderSpec.basePayout * mult * markBonus);
}

export function getDailyRewardAmount(dayIdx, orderIndex = 0, appraisalLevel = 1) {
  const dayMults = [0.25, 0.35, 0.50, 0.65, 0.85, 1.10, 1.50];
  const clampedIdx = Math.max(0, Math.min(dayMults.length - 1, dayIdx));
  const floorVal = DAILY_REWARDS[clampedIdx] || 50;
  const tierRef = computeOrderPayout(getOrderSpec(Math.max(0, orderIndex)), Math.max(1, appraisalLevel));
  const scaled = Math.round((tierRef * dayMults[clampedIdx]) / 5) * 5;
  return Math.max(floorVal, scaled);
}

export function generateMarketChoices(orderIndex, appraisalLevel) {
  const len = ITEMS_CATALOG.length;
  const clientItem = ITEMS_CATALOG[orderIndex % len];
  const atticItem = ITEMS_CATALOG[(orderIndex + 2) % len];
  const blindItem = ITEMS_CATALOG[(orderIndex + 5) % len];

  const baseSpec = getOrderSpec(orderIndex);
  const tierRef = Math.max(80, computeOrderPayout(baseSpec, appraisalLevel));
  const roundTo5 = (v) => Math.max(25, Math.round(v / 5) * 5);

  return [
    {
      kind: 'client',
      itemId: clientItem.id,
      cost: 0,
      payoutMult: 1.0,
      hasMakerMark: false,
      markMult: 1,
      markRevealed: false,
      isMystery: false
    },
    {
      kind: 'attic',
      itemId: atticItem.id,
      cost: roundTo5(tierRef * 0.35),
      payoutMult: 1.45,
      hasMakerMark: Math.random() < 0.4,
      markMult: 1.9,
      markRevealed: false,
      isMystery: false
    },
    {
      kind: 'blind',
      itemId: blindItem.id,
      cost: roundTo5(tierRef * 0.6),
      payoutMult: 1.8,
      hasMakerMark: Math.random() < 0.65,
      markMult: 2.25,
      markRevealed: false,
      isMystery: true
    }
  ];
}

export function getScavengerChestReward(appraisalLevel, orderIndex) {
  const spec = getOrderSpec(orderIndex);
  const base = Math.max(75, Math.round(computeOrderPayout(spec, appraisalLevel) * 0.65));
  return Math.round(base / 5) * 5;
}
