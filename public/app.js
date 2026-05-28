// 개인 로컬용 카드팩 오픈 시뮬레이터입니다.
// 목표:
// 1. index.html 더블클릭만으로 실행됩니다.
// 2. 프로젝트 안에 저작권 이미지 파일을 넣지 않습니다.
// 3. data/cards.json, 외부 API, 내장 샘플 데이터 중 가능한 소스를 사용합니다.
// 4. 나중에 모든 세트와 모든 카드를 넣을 수 있도록 sets / packs / cards 구조를 사용합니다.

const PACK_SIZE = 5;
const STORAGE_KEY = "pkTCGLocalCollectionV2";
const API_KEY_STORAGE_KEY = "pkTCGApiKeyV1";
const ADMIN_MODE_SESSION_KEY = "pkTCGAdminModeSessionV1";
const SOUND_STORAGE_KEY = "pkTCGSoundEnabledV1";
const PREMIUM_STORAGE_KEY = "is_premium";
const PREMIUM_USER_ID_KEY = "pkTCGPremiumUserIdV1";
const PREMIUM_UNLOCK_CODE_KEY = "pkTCGPremiumUnlockCodeV1";
const PREMIUM_CODE_PREFIX = "ANSWER-";
const PREMIUM_CODE_SALT = "LOCAL-PKTCG-PREMIUM-2026";
const IDB_NAME = "PokemonTCG_Cache";
const IDB_STORE_NAME = "cards";
const IDB_META_ID = "last_api_sync_time";
const IDB_SET_META_ID = "set_catalog_sync_time";
const LEGACY_LOCAL_STORAGE_CARD_CACHE_KEYS = [
  "pkTCGApiCatalogCacheV1",
  "pkTCGApiProxyCacheV1",
  "pkTCGApiSyncTimestampV1"
];
const LEGACY_LOCAL_STORAGE_CARD_CACHE_PREFIXES = [
  "pkTCGApiSetCacheV1:"
];
const ODDS_MODE_STORAGE_KEY = "pkTCGOddsModeV1";
const API_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const API_CARD_PAGE_SIZE = 250;
const API_CARD_FETCH_CONCURRENCY = 4;
const POKEMON_TCG_API_ORIGIN = "https://api.pokemontcg.io";
const POKEMON_TCG_PROXY_PATH = "/.netlify/functions/pokemon-tcg-proxy";
const JSON_ERROR_PREVIEW_LIMIT = 160;
const API_CARD_LIGHT_SELECT_FIELDS = [
  "id",
  "name",
  "number",
  "types",
  "hp",
  "rarity",
  "images",
  "attacks",
  "weaknesses",
  "resistances",
  "retreatCost",
  "supertype",
  "subtypes",
  "tcgplayer",
  "cardmarket"
].join(",");
const CARD_ADVANCE_DELAY_MS = 960;
const LAST_CARD_PAUSE_MS = 1320;
const MANUAL_SERIES_NEXT_PACK_DELAY_MS = 1650;
const ADMIN_UNLOCK_CLICK_COUNT = 5;
const ADMIN_UNLOCK_CLICK_WINDOW_MS = 1800;
// 실제 카드 뒷면 이미지는 프로젝트에 저장하지 않고 런타임에만 불러옵니다.
// 인터넷이 막히거나 이미지 로딩이 실패하면 CSS로 만든 기본 카드 뒷면이 그대로 보입니다.
const PACK_ART_BASE_URL = "https://pokesymbols.com/images/tcg/sets/booster-pack-art";
const PACK_ART_VARIANTS = 4;
const PACK_SHELF_LIMIT = 40;
const COLLECTION_RENDER_LIMIT = 240;

// Pokemon TCG API의 실제 rarity 이름들입니다. API가 주는 문자열은 최대한 그대로 보여주고,
// 연출과 가격 계산만 아래 tier로 묶어서 처리합니다.
const OFFICIAL_RARITIES = [
  "ACE SPEC Rare",
  "Amazing Rare",
  "Black White Rare",
  "Classic Collection",
  "Common",
  "Double Rare",
  "Hyper Rare",
  "Illustration Rare",
  "LEGEND",
  "MEGA_ATTACK_RARE",
  "Mega Hyper Rare",
  "Promo",
  "Radiant Rare",
  "Rare",
  "Rare ACE",
  "Rare BREAK",
  "Rare Holo",
  "Rare Holo EX",
  "Rare Holo GX",
  "Rare Holo LV.X",
  "Rare Holo Star",
  "Rare Holo V",
  "Rare Holo VMAX",
  "Rare Holo VSTAR",
  "Rare Prime",
  "Rare Prism Star",
  "Rare Rainbow",
  "Rare Secret",
  "Rare Shining",
  "Rare Shiny",
  "Rare Shiny GX",
  "Rare Ultra",
  "Shiny Rare",
  "Shiny Ultra Rare",
  "Special Illustration Rare",
  "Trainer Gallery Rare Holo",
  "Ultra Rare",
  "Uncommon"
];

const RARITY_BY_LOWERCASE = Object.fromEntries(OFFICIAL_RARITIES.map((rarity) => [rarity.toLowerCase(), rarity]));

// 기본 랜덤 풀입니다. 10장 부스터는 아래 buildPackSlots의 실제 슬롯 구조를 우선 사용합니다.
const RARITY_TABLE = [
  { rarity: "Common", chance: 55 },
  { rarity: "Uncommon", chance: 30 },
  { rarity: "Rare", chance: 10 },
  { rarity: "Rare Holo", chance: 3 },
  { rarity: "Double Rare", chance: 1 },
  { rarity: "Illustration Rare", chance: 0.6 },
  { rarity: "Ultra Rare", chance: 0.3 },
  { rarity: "Rare Secret", chance: 0.1 }
];

const GOD_PACK_RARITY_TABLE = [
  { rarity: "Rare Holo", chance: 18 },
  { rarity: "Double Rare", chance: 16 },
  { rarity: "Illustration Rare", chance: 18 },
  { rarity: "Ultra Rare", chance: 18 },
  { rarity: "Special Illustration Rare", chance: 14 },
  { rarity: "Hyper Rare", chance: 10 },
  { rarity: "Rare Secret", chance: 6 }
];

const ODDS_MODES = {
  realistic: {
    label: "Realistic",
    description: "팩 시대별 기본 확률",
    multipliers: { common: 1, uncommon: 1, rare: 1, holo: 1, ultra: 1, special: 1 }
  },
  lucky: {
    label: "Lucky",
    description: "고레어가 살짝 잘 나오는 모드",
    multipliers: { common: 0.92, uncommon: 0.94, rare: 0.9, holo: 1.25, ultra: 1.8, special: 2.35 }
  },
  showcase: {
    label: "Showcase",
    description: "연출 확인용 고레어 부스트",
    multipliers: { common: 0.7, uncommon: 0.8, rare: 0.72, holo: 1.7, ultra: 3.4, special: 5.2 }
  },
  hard: {
    label: "Hard",
    description: "히트가 더 희귀한 모드",
    multipliers: { common: 1.12, uncommon: 1.08, rare: 1.16, holo: 0.72, ultra: 0.46, special: 0.28 }
  },
  godpack: {
    label: "God Pack",
    description: "프리미엄 전용 · 모든 슬롯 고레어 확정",
    premium: true,
    forceHighHit: true,
    multipliers: { common: 0.01, uncommon: 0.01, rare: 0.04, holo: 4.5, ultra: 8, special: 10 }
  }
};

const PACK_PROFILES = {
  "scarlet-violet": {
    label: "Scarlet & Violet",
    note: "4 common / 3 uncommon / 3 foil 구조를 5장 팩으로 압축",
    slots: [
      { label: "Common 1", rarity: "Common" },
      { label: "Common 2", rarity: "Common" },
      { label: "Uncommon", rarity: "Uncommon" },
      {
        label: "Reverse / Art Slot",
        weights: [
          { rarity: "Common", chance: 39 },
          { rarity: "Uncommon", chance: 34 },
          { rarity: "Rare", chance: 13 },
          { rarity: "Rare Holo", chance: 7 },
          { rarity: "Illustration Rare", chance: 5 },
          { rarity: "Special Illustration Rare", chance: 1.4 },
          { rarity: "Hyper Rare", chance: 0.6 }
        ]
      },
      {
        label: "Foil Rare / Hit Slot",
        weights: [
          { rarity: "Rare Holo", chance: 68 },
          { rarity: "Double Rare", chance: 14 },
          { rarity: "Illustration Rare", chance: 7 },
          { rarity: "Ultra Rare", chance: 5 },
          { rarity: "Special Illustration Rare", chance: 3 },
          { rarity: "Hyper Rare", chance: 2 },
          { rarity: "ACE SPEC Rare", chance: 1 }
        ]
      }
    ]
  },
  "sword-shield": {
    label: "Sword & Shield",
    note: "reverse slot + rare slot 구조",
    slots: [
      { label: "Common 1", rarity: "Common" },
      { label: "Common 2", rarity: "Common" },
      { label: "Uncommon", rarity: "Uncommon" },
      {
        label: "Reverse Slot",
        weights: [
          { rarity: "Common", chance: 48 },
          { rarity: "Uncommon", chance: 34 },
          { rarity: "Rare", chance: 11 },
          { rarity: "Rare Holo", chance: 4 },
          { rarity: "Trainer Gallery Rare Holo", chance: 2 },
          { rarity: "Radiant Rare", chance: 1 }
        ]
      },
      {
        label: "Rare / V Slot",
        weights: [
          { rarity: "Rare", chance: 58 },
          { rarity: "Rare Holo", chance: 18 },
          { rarity: "Rare Holo V", chance: 9 },
          { rarity: "Rare Holo VMAX", chance: 4 },
          { rarity: "Rare Holo VSTAR", chance: 3 },
          { rarity: "Ultra Rare", chance: 3 },
          { rarity: "Rare Secret", chance: 2 },
          { rarity: "Rare Rainbow", chance: 1.4 },
          { rarity: "Trainer Gallery Rare Holo", chance: 1.6 }
        ]
      }
    ]
  },
  "sun-moon": {
    label: "Sun & Moon",
    note: "reverse slot + rare/GX/secret 구조",
    slots: [
      { label: "Common 1", rarity: "Common" },
      { label: "Common 2", rarity: "Common" },
      { label: "Uncommon", rarity: "Uncommon" },
      {
        label: "Reverse Slot",
        weights: [
          { rarity: "Common", chance: 50 },
          { rarity: "Uncommon", chance: 35 },
          { rarity: "Rare", chance: 11 },
          { rarity: "Rare Holo", chance: 4 }
        ]
      },
      {
        label: "Rare / GX Slot",
        weights: [
          { rarity: "Rare", chance: 61 },
          { rarity: "Rare Holo", chance: 20 },
          { rarity: "Rare Holo GX", chance: 8 },
          { rarity: "Ultra Rare", chance: 5 },
          { rarity: "Rare Secret", chance: 3 },
          { rarity: "Rare Rainbow", chance: 3 }
        ]
      }
    ]
  },
  xy: {
    label: "XY",
    note: "reverse slot + rare/EX/BREAK 구조",
    slots: [
      { label: "Common 1", rarity: "Common" },
      { label: "Common 2", rarity: "Common" },
      { label: "Uncommon", rarity: "Uncommon" },
      {
        label: "Reverse Slot",
        weights: [
          { rarity: "Common", chance: 53 },
          { rarity: "Uncommon", chance: 33 },
          { rarity: "Rare", chance: 10 },
          { rarity: "Rare Holo", chance: 3 },
          { rarity: "Rare BREAK", chance: 1 }
        ]
      },
      {
        label: "Rare / EX Slot",
        weights: [
          { rarity: "Rare", chance: 64 },
          { rarity: "Rare Holo", chance: 21 },
          { rarity: "Rare Holo EX", chance: 7 },
          { rarity: "Rare BREAK", chance: 3 },
          { rarity: "Ultra Rare", chance: 3 },
          { rarity: "Rare Secret", chance: 2 }
        ]
      }
    ]
  },
  "black-white": {
    label: "Black & White",
    note: "reverse slot + rare/EX/secret 구조",
    slots: [
      { label: "Common 1", rarity: "Common" },
      { label: "Common 2", rarity: "Common" },
      { label: "Uncommon", rarity: "Uncommon" },
      {
        label: "Reverse Slot",
        weights: [
          { rarity: "Common", chance: 54 },
          { rarity: "Uncommon", chance: 32 },
          { rarity: "Rare", chance: 11 },
          { rarity: "Rare Holo", chance: 3 }
        ]
      },
      {
        label: "Rare / EX Slot",
        weights: [
          { rarity: "Rare", chance: 68 },
          { rarity: "Rare Holo", chance: 20 },
          { rarity: "Rare Holo EX", chance: 6 },
          { rarity: "Ultra Rare", chance: 3 },
          { rarity: "Rare Secret", chance: 3 }
        ]
      }
    ]
  },
  older: {
    label: "Older / Classic",
    note: "구형 팩 느낌의 rare 중심 구조",
    slots: [
      { label: "Common 1", rarity: "Common" },
      { label: "Common 2", rarity: "Common" },
      { label: "Common 3", rarity: "Common" },
      { label: "Uncommon", rarity: "Uncommon" },
      {
        label: "Rare / Holo Slot",
        weights: [
          { rarity: "Rare", chance: 78 },
          { rarity: "Rare Holo", chance: 18 },
          { rarity: "Rare Secret", chance: 4 }
        ]
      }
    ]
  },
  mixed: {
    label: "Mixed / Fallback",
    note: "세트 시대를 모를 때 쓰는 범용 5장 구조",
    slots: [
      { label: "Common 1", rarity: "Common" },
      { label: "Common 2", rarity: "Common" },
      { label: "Uncommon", rarity: "Uncommon" },
      {
        label: "Reverse / Parallel Slot",
        weights: [
          { rarity: "Common", chance: 45 },
          { rarity: "Uncommon", chance: 35 },
          { rarity: "Rare", chance: 15 },
          { rarity: "Rare Holo", chance: 4 },
          { rarity: "Illustration Rare", chance: 1 }
        ]
      },
      {
        label: "Rare / Hit Slot",
        weights: [
          { rarity: "Rare", chance: 55 },
          { rarity: "Rare Holo", chance: 18 },
          { rarity: "Double Rare", chance: 8 },
          { rarity: "Ultra Rare", chance: 6 },
          { rarity: "Illustration Rare", chance: 5 },
          { rarity: "Rare Secret", chance: 2 },
          { rarity: "Special Illustration Rare", chance: 2 },
          { rarity: "Hyper Rare", chance: 1.5 },
          { rarity: "Radiant Rare", chance: 1 },
          { rarity: "ACE SPEC Rare", chance: 1 },
          { rarity: "Rare Rainbow", chance: 0.5 }
        ]
      }
    ]
  }
};

// fakePrice가 없을 때 자동으로 붙이는 가격 범위입니다. 실제 rarity를 tier로 묶어 계산합니다.
const PRICE_RANGES = {
  common: [0.1, 1.2],
  uncommon: [0.2, 2.2],
  rare: [1.5, 8],
  holo: [5, 24],
  ultra: [18, 120],
  secret: [80, 420],
  special: [160, 900]
};

const TYPE_SYMBOLS = {
  Fire: "F",
  Water: "W",
  Grass: "G",
  Electric: "L",
  Psychic: "P",
  Fighting: "N",
  Dark: "D",
  Metal: "M",
  Dragon: "Dr",
  Colorless: "C"
};

const RARITY_TIER_ORDER = ["common", "uncommon", "rare", "holo", "ultra", "secret", "special"];
const HIGH_RARITY_TIERS = new Set(["holo", "ultra", "secret", "special"]);
const CARD_IMAGE_PRELOAD_LIMIT = 20;
const preloadedImageUrls = new Set();
const preloadedImageElements = new Map();
const imagePreloadInFlight = new Map();

// 더블클릭 실행에서 data/cards.json 자동 fetch가 막혀도 앱이 빈 상태가 되지 않도록
// starter catalog를 코드 안에 하나 더 둡니다. 실제 전체 데이터는 data/cards.json에 계속 추가하면 됩니다.
const STARTER_CATALOG = {
  schemaVersion: 2,
  meta: {
    name: "Embedded Starter Catalog",
    note: "No copyrighted image files are bundled. Cards are original text/sample entries."
  },
  sets: [
    {
      id: "local-base",
      name: "Local Base Set",
      series: "Local",
      releaseDate: "2026-05-26",
      totalCards: 18
    },
    {
      id: "local-night",
      name: "Neon Night Set",
      series: "Local",
      releaseDate: "2026-05-26",
      totalCards: 18
    }
  ],
  packs: [
    {
      id: "local-base-booster",
      setId: "local-base",
      name: "Local Base Booster",
      cardCount: PACK_SIZE
    },
    {
      id: "local-night-booster",
      setId: "local-night",
      name: "Neon Night Booster",
      cardCount: PACK_SIZE
    },
    {
      id: "all-local-booster",
      setId: "all",
      name: "All Local Sets",
      cardCount: PACK_SIZE
    }
  ],
  cards: [
    makeStarterCard("lb-001", "Sprig Mouse", "local-base", "Local Base Set", "Grass", "Basic", 60, "Common", 0.35, 1),
    makeStarterCard("lb-002", "Cinder Pup", "local-base", "Local Base Set", "Fire", "Basic", 60, "Common", 0.45, 2),
    makeStarterCard("lb-003", "Bubble Otter", "local-base", "Local Base Set", "Water", "Basic", 70, "Common", 0.5, 3),
    makeStarterCard("lb-004", "Volt Finch", "local-base", "Local Base Set", "Electric", "Basic", 50, "Common", 0.42, 4),
    makeStarterCard("lb-005", "Pebble Cub", "local-base", "Local Base Set", "Fighting", "Basic", 70, "Common", 0.38, 5),
    makeStarterCard("lb-006", "Moss Antler", "local-base", "Local Base Set", "Grass", "Stage 1", 90, "Rare", 4.2, 6),
    makeStarterCard("lb-007", "Torch Lynx", "local-base", "Local Base Set", "Fire", "Stage 1", 100, "Rare", 5.4, 7),
    makeStarterCard("lb-008", "Aqua Crest", "local-base", "Local Base Set", "Water", "Stage 1", 100, "Rare", 6.1, 8),
    makeStarterCard("lb-009", "Mirror Serpent", "local-base", "Local Base Set", "Psychic", "Stage 1", 110, "Rare Holo", 17.5, 9),
    makeStarterCard("lb-010", "Thunder Crown", "local-base", "Local Base Set", "Electric", "Stage 2", 140, "Rare Holo", 22.4, 10),
    makeStarterCard("lb-011", "Blaze Monarch", "local-base", "Local Base Set", "Fire", "Stage 2", 180, "Ultra Rare", 72.5, 11),
    makeStarterCard("lb-012", "Goldleaf Guardian", "local-base", "Local Base Set", "Grass", "Stage 2", 210, "Rare Secret", 210, 12),
    makeStarterCard("lb-013", "Dawn Titan", "local-base", "Local Base Set", "Dragon", "V", 240, "Special Illustration Rare", 980, 13),
    makeStarterCard("lb-014", "Shell Courier", "local-base", "Local Base Set", "Water", "Basic", 60, "Common", 0.32, 14),
    makeStarterCard("lb-015", "Iron Beetle", "local-base", "Local Base Set", "Metal", "Basic", 80, "Common", 0.58, 15),
    makeStarterCard("lb-016", "Night Moth", "local-base", "Local Base Set", "Dark", "Basic", 70, "Rare", 3.8, 16),
    makeStarterCard("lb-017", "Quartz Bloom", "local-base", "Local Base Set", "Psychic", "Stage 1", 100, "Rare Holo", 14.2, 17),
    makeStarterCard("lb-018", "Meteor Forge", "local-base", "Local Base Set", "Metal", "Stage 2", 190, "Ultra Rare", 88, 18),

    makeStarterCard("nn-001", "Neon Tadpole", "local-night", "Neon Night Set", "Water", "Basic", 50, "Common", 0.4, 1),
    makeStarterCard("nn-002", "Alley Spark", "local-night", "Neon Night Set", "Electric", "Basic", 60, "Common", 0.47, 2),
    makeStarterCard("nn-003", "Smoke Kit", "local-night", "Neon Night Set", "Dark", "Basic", 60, "Common", 0.52, 3),
    makeStarterCard("nn-004", "Copper Shell", "local-night", "Neon Night Set", "Metal", "Basic", 70, "Common", 0.44, 4),
    makeStarterCard("nn-005", "Mind Lamp", "local-night", "Neon Night Set", "Psychic", "Basic", 60, "Common", 0.62, 5),
    makeStarterCard("nn-006", "Signal Drake", "local-night", "Neon Night Set", "Dragon", "Stage 1", 110, "Rare", 6.7, 6),
    makeStarterCard("nn-007", "Chrome Stag", "local-night", "Neon Night Set", "Metal", "Stage 1", 120, "Rare", 5.9, 7),
    makeStarterCard("nn-008", "Night Arcade", "local-night", "Neon Night Set", "Colorless", "Trainer", 0, "Rare", 3.2, 8),
    makeStarterCard("nn-009", "Holo Lantern", "local-night", "Neon Night Set", "Psychic", "Stage 1", 120, "Rare Holo", 19.4, 9),
    makeStarterCard("nn-010", "Voltage Diva", "local-night", "Neon Night Set", "Electric", "Stage 2", 160, "Rare Holo", 23.9, 10),
    makeStarterCard("nn-011", "Midnight Vortex", "local-night", "Neon Night Set", "Dark", "V", 210, "Ultra Rare", 94.4, 11),
    makeStarterCard("nn-012", "Secret Neon Gate", "local-night", "Neon Night Set", "Psychic", "Item", 0, "Rare Secret", 260, 12),
    makeStarterCard("nn-013", "Mythic Eclipse", "local-night", "Neon Night Set", "Dragon", "VSTAR", 280, "Special Illustration Rare", 1280, 13),
    makeStarterCard("nn-014", "Metro Mole", "local-night", "Neon Night Set", "Fighting", "Basic", 70, "Common", 0.36, 14),
    makeStarterCard("nn-015", "Rain Signal", "local-night", "Neon Night Set", "Water", "Basic", 60, "Common", 0.49, 15),
    makeStarterCard("nn-016", "Cobalt Fang", "local-night", "Neon Night Set", "Dark", "Stage 1", 110, "Rare", 7.4, 16),
    makeStarterCard("nn-017", "Prism Wire", "local-night", "Neon Night Set", "Metal", "Stage 1", 120, "Rare Holo", 16.6, 17),
    makeStarterCard("nn-018", "Solar Overdrive", "local-night", "Neon Night Set", "Fire", "Stage 2", 200, "Ultra Rare", 101.3, 18)
  ]
};

const state = {
  sets: [],
  packs: [],
  cards: [],
  collection: {},
  currentPack: [],
  manualSeries: null,
  activeSetId: "all",
  activePackId: "all-local-booster",
  seriesFilter: "all",
  packSearch: "",
  collectionSearch: "",
  collectionFilter: "all",
  collectionSort: "set",
  oddsMode: "realistic",
  apiLoadedSetIds: new Set(),
  apiSyncInFlight: null,
  packBestDrawId: null,
  flippedCount: 0,
  autoAdvanceTimer: null,
  isCardTransitioning: false,
  isAdminMode: false,
  adminPanelVisible: false,
  adminClickCount: 0,
  adminClickTimer: null,
  premiumUserId: "",
  isPremium: false,
  soundEnabled: true,
  audioContext: null
};

const dom = {
  openPackBtn: document.querySelector("#openPackBtn"),
  open5PacksBtn: document.querySelector("#open5PacksBtn"),
  open10PacksBtn: document.querySelector("#open10PacksBtn"),
  openBoxBtn: document.querySelector("#openBoxBtn"),
  collectionBtn: document.querySelector("#collectionBtn"),
  soundToggleBtn: document.querySelector("#soundToggleBtn"),
  resetSaveBtn: document.querySelector("#resetSaveBtn"),
  closeCollectionBtn: document.querySelector("#closeCollectionBtn"),
  packSearchInput: document.querySelector("#packSearchInput"),
  seriesSelect: document.querySelector("#seriesSelect"),
  setSelect: document.querySelector("#setSelect"),
  packSelect: document.querySelector("#packSelect"),
  oddsModeSelect: document.querySelector("#oddsModeSelect"),
  localJsonInput: document.querySelector("#localJsonInput"),
  adminPanel: document.querySelector("#adminPanel"),
  ownerAdminPanel: document.querySelector("#ownerAdminPanel"),
  forceActiveSetSyncBtn: document.querySelector("#forceActiveSetSyncBtn"),
  forceApiSyncBtn: document.querySelector("#forceApiSyncBtn"),
  refreshAdminStatusBtn: document.querySelector("#refreshAdminStatusBtn"),
  ownerAdminStats: document.querySelector("#ownerAdminStats"),
  forceApiSyncStatus: document.querySelector("#forceApiSyncStatus"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  saveApiKeyBtn: document.querySelector("#saveApiKeyBtn"),
  loadApiBtn: document.querySelector("#loadApiBtn"),
  clearApiKeyBtn: document.querySelector("#clearApiKeyBtn"),
  packShelfStatus: document.querySelector("#packShelfStatus"),
  packShelf: document.querySelector("#packShelf"),
  dataSourceLabel: document.querySelector("#dataSourceLabel"),
  totalCardsStat: document.querySelector("#totalCardsStat"),
  ownedCardsStat: document.querySelector("#ownedCardsStat"),
  collectionRateStat: document.querySelector("#collectionRateStat"),
  stageTitle: document.querySelector("#stageTitle"),
  stageStatus: document.querySelector("#stageStatus"),
  packGrid: document.querySelector("#packGrid"),
  packResultPanel: document.querySelector("#packResultPanel"),
  resultHeading: document.querySelector("#resultHeading"),
  bestCardSummary: document.querySelector("#bestCardSummary"),
  resultList: document.querySelector("#resultList"),
  collectionPanel: document.querySelector("#collectionPanel"),
  collectionSearchInput: document.querySelector("#collectionSearchInput"),
  collectionFilterSelect: document.querySelector("#collectionFilterSelect"),
  collectionSortSelect: document.querySelector("#collectionSortSelect"),
  collectionDashboard: document.querySelector("#collectionDashboard"),
  collectionGrid: document.querySelector("#collectionGrid"),
  premiumStatusText: document.querySelector("#premiumStatusText"),
  premiumUserIdText: document.querySelector("#premiumUserIdText"),
  premiumUnlockForm: document.querySelector("#premiumUnlockForm"),
  premiumCodeInput: document.querySelector("#premiumCodeInput"),
  premiumOddsSelect: document.querySelector("#premiumOddsSelect"),
  rarityOverlay: document.querySelector("#rarityOverlay"),
  effectCard: document.querySelector("#effectCard"),
  effectText: document.querySelector("#effectText")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cleanupLegacyLocalStorageCardCaches();
  state.isAdminMode = isAdminModeFromUrl();
  state.premiumUserId = getOrCreatePremiumUserId();
  state.isPremium = loadPremiumStatus();
  state.soundEnabled = loadSoundEnabled();
  state.collection = loadCollection();
  state.oddsMode = loadOddsMode();

  dom.openPackBtn.addEventListener("click", openBoosterPack);
  dom.open5PacksBtn.addEventListener("click", () => openManualPackSeries(5));
  dom.open10PacksBtn.addEventListener("click", () => openBulkPacks(10));
  dom.openBoxBtn.addEventListener("click", () => openBulkPacks(30));
  dom.collectionBtn.addEventListener("click", showCollection);
  if (dom.soundToggleBtn) {
    dom.soundToggleBtn.addEventListener("click", toggleSound);
  }
  dom.closeCollectionBtn.addEventListener("click", hideCollection);
  dom.resetSaveBtn.addEventListener("click", resetSave);
  dom.packSearchInput.addEventListener("input", handlePackSearch);
  dom.seriesSelect.addEventListener("change", handleSeriesChange);
  dom.setSelect.addEventListener("change", handleSetChange);
  dom.packSelect.addEventListener("change", handlePackChange);
  dom.oddsModeSelect.addEventListener("change", handleOddsModeChange);
  dom.collectionSearchInput.addEventListener("input", handleCollectionSearch);
  dom.collectionFilterSelect.addEventListener("change", handleCollectionFilterChange);
  dom.collectionSortSelect.addEventListener("change", handleCollectionSortChange);
  dom.premiumUnlockForm.addEventListener("submit", unlockPremiumFromCode);
  dom.premiumOddsSelect.addEventListener("change", handleOddsModeChange);
  dom.localJsonInput.addEventListener("change", handleLocalJsonFile);
  dom.saveApiKeyBtn.addEventListener("click", saveApiKeyFromInput);
  dom.loadApiBtn.addEventListener("click", loadApiCatalogFromButton);
  dom.clearApiKeyBtn.addEventListener("click", clearApiKey);
  if (dom.forceActiveSetSyncBtn) {
    dom.forceActiveSetSyncBtn.addEventListener("click", forceSyncActiveSetFromAdmin);
  }
  if (dom.forceApiSyncBtn) {
    dom.forceApiSyncBtn.addEventListener("click", forceSyncApiDataFromAdmin);
  }
  if (dom.refreshAdminStatusBtn) {
    dom.refreshAdminStatusBtn.addEventListener("click", refreshOwnerAdminStatus);
  }
  [dom.openPackBtn, dom.open5PacksBtn, dom.open10PacksBtn, dom.openBoxBtn].filter(Boolean).forEach((button) => {
    button.addEventListener("mouseenter", () => scheduleActivePackImagePreload({ loadMissing: true }));
    button.addEventListener("focus", () => scheduleActivePackImagePreload({ loadMissing: true }));
    button.addEventListener("touchstart", () => scheduleActivePackImagePreload({ loadMissing: true }), { passive: true });
  });
  document.addEventListener("click", handleCardDetailClick);
  document.addEventListener("keydown", handleCardDetailKeydown);
  document.addEventListener("error", handleImageLoadError, true);
  window.addEventListener("popstate", updateAdminModeFromLocation);
  window.addEventListener("hashchange", updateAdminModeFromLocation);
  dom.apiKeyInput.value = getApiKey();
  setupAdminPanelToggle();
  setupOwnerAdminPanel();
  renderPremiumPanel();
  renderSoundToggle();
  renderOddsModeSelect();
  setOpeningControlsDisabled(false);

  // 먼저 내장 샘플로 즉시 실행 가능한 상태를 만듭니다.
  applyCatalog(STARTER_CATALOG, "내장 샘플 DB");
  setStageStatus("내장 샘플 카드로 바로 실행할 수 있습니다.");

  // 그 다음 data/cards.json을 자동으로 시도합니다.
  // file:// 보안 정책 때문에 실패할 수 있으니, 실패해도 앱은 내장 DB로 계속 작동합니다.
  try {
    const localCatalog = await fetchJson("data/cards.json");
    applyCatalog(localCatalog, "data/cards.json");
    setStageStatus("data/cards.json을 불러왔습니다.");
    await hydrateIndexedDbCacheOnStartup();
  } catch (error) {
    console.warn("data/cards.json 자동 로딩 실패. 더블클릭 환경에서는 정상일 수 있습니다.", error);

    await hydrateIndexedDbCacheOnStartup();
  }
}

function makeStarterCard(id, name, setId, setName, type, stage, hp, rarity, fakePrice, number) {
  const attackBase = hp > 0 ? Math.max(10, Math.round(hp / 4 / 10) * 10) : 0;

  return {
    id,
    name,
    setId,
    setName,
    number: String(number).padStart(3, "0"),
    type,
    stage,
    hp,
    rarity,
    imageUrl: "",
    fakePrice,
    attacks: hp > 0
      ? [
          {
            cost: [type],
            name: `${type} Jab`,
            damage: attackBase,
            text: "Flip-ready sample attack."
          },
          {
            cost: [type, "Colorless"],
            name: "Booster Rush",
            damage: attackBase + 30,
            text: "This attack feels stronger when pulled from a fresh pack."
          }
        ]
      : [
          {
            cost: ["Colorless"],
            name: "Support Play",
            damage: "",
            text: "Search your local binder for a card you like."
          }
        ],
    weakness: type === "Fire" ? "Water" : type === "Water" ? "Electric" : "Fire",
    resistance: type === "Fighting" ? "Dark" : "",
    retreatCost: hp >= 180 ? 3 : hp >= 100 ? 2 : 1,
    flavorText: "Original local-only sample card.",
    owned: false,
    duplicateCount: 0
  };
}

async function fetchJson(url, options = {}) {
  const timeoutMs = options.timeoutMs || (options.useApiKey ? 30000 : 8000);
  const retries = Number(options.retries ?? (options.useApiKey ? 2 : 1));
  const apiKey = getApiKey();
  const shouldUseApiKeyHeader = Boolean(options.useApiKey && apiKey && canUseApiKeyHeader());
  const attempts = shouldUseApiKeyHeader
    ? [{ "X-Api-Key": apiKey }, {}]
    : [{}];
  const canProxyPokemonTcgApi = Boolean(options.useApiKey && isPokemonTcgApiUrl(url) && canUsePokemonTcgProxy());
  const preferPokemonTcgProxy = canProxyPokemonTcgApi && shouldPreferPokemonTcgProxy();
  let lastError = null;

  if (preferPokemonTcgProxy) {
    try {
      return await fetchPokemonTcgProxyJson(url, {
        apiKey,
        timeoutMs,
        retries
      });
    } catch (error) {
      lastError = error;
    }
  }

  for (const headers of attempts) {
    try {
      return await fetchJsonWithRetry(url, {
        headers,
        timeoutMs,
        retries
      });
    } catch (error) {
      lastError = error;
    }

    if (lastError && ![401, 403].includes(Number(lastError.status || 0))) {
      break;
    }
  }

  if (canProxyPokemonTcgApi && !preferPokemonTcgProxy) {
    try {
      return await fetchPokemonTcgProxyJson(url, {
        apiKey,
        timeoutMs,
        retries
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Fetch failed");
}

async function fetchPokemonTcgProxyJson(url, options = {}) {
  return fetchJsonWithRetry(getPokemonTcgProxyUrl(url), {
    headers: options.apiKey ? { "X-Api-Key": options.apiKey } : {},
    timeoutMs: options.timeoutMs,
    retries: options.retries
  });
}

async function fetchJsonWithRetry(url, options = {}) {
  const timeoutMs = options.timeoutMs || 8000;
  const retries = Number(options.retries || 0);
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
        headers: options.headers || {}
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        const error = new Error(formatHttpErrorMessage(response, errorText));
        error.status = response.status;
        error.statusText = response.statusText;
        error.responseText = errorText;
        throw error;
      }

      return parseJsonText(await response.text(), url);
    } catch (error) {
      lastError = error;

      if (!isRetryableFetchError(error) || attempt >= retries) {
        break;
      }

      await sleep(500 * (attempt + 1));
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error("Fetch failed");
}

function parseJsonText(text, source) {
  const normalizedText = String(text || "").replace(/^\uFEFF/, "").trim();

  if (!normalizedText) {
    return {};
  }

  try {
    return JSON.parse(normalizedText);
  } catch (error) {
    const parseError = new Error(`Invalid JSON response${source ? ` from ${source}` : ""}`);
    parseError.cause = error;
    throw parseError;
  }
}

function formatHttpErrorMessage(response, bodyText) {
  const preview = String(bodyText || "").replace(/\s+/g, " ").trim().slice(0, JSON_ERROR_PREVIEW_LIMIT);
  return preview
    ? `HTTP ${response.status} ${response.statusText}: ${preview}`
    : `HTTP ${response.status} ${response.statusText}`;
}

function isRetryableFetchError(error) {
  const status = Number(error && error.status || 0);
  return error && error.name === "AbortError"
    || status === 408
    || status === 429
    || status === 500
    || status === 502
    || status === 503
    || status === 504;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function canUseApiKeyHeader() {
  return window.location.protocol !== "file:";
}

function isPokemonTcgApiUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.origin === POKEMON_TCG_API_ORIGIN && parsedUrl.pathname.startsWith("/v2/");
  } catch (error) {
    return false;
  }
}

function canUsePokemonTcgProxy() {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

function shouldPreferPokemonTcgProxy() {
  const hostname = String(window.location.hostname || "").toLowerCase();
  return hostname.endsWith(".netlify.app") || hostname.endsWith(".netlify.com");
}

function getPokemonTcgProxyUrl(url) {
  const parsedUrl = new URL(url);
  const proxyUrl = new URL(POKEMON_TCG_PROXY_PATH, window.location.origin);

  proxyUrl.searchParams.set("path", parsedUrl.pathname);

  if (parsedUrl.search) {
    proxyUrl.searchParams.set("query", parsedUrl.search.slice(1));
  }

  return `${proxyUrl.pathname}${proxyUrl.search}`;
}

function buildPokemonTcgApiUrl(path, params = {}) {
  const apiUrl = new URL(path, POKEMON_TCG_API_ORIGIN);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      apiUrl.searchParams.set(key, String(value));
    }
  });

  return apiUrl.toString();
}

function setStageStatus(message) {
  if (dom.stageStatus) {
    dom.stageStatus.textContent = message;
  }
}

function formatAdminSyncDate(value) {
  const time = Number(value || 0);

  if (!time) {
    return "없음";
  }

  return new Date(time).toLocaleString();
}

function getAdminTargetSet() {
  const activePack = getActivePack();
  const setId = state.activeSetId !== "all"
    ? state.activeSetId
    : activePack && activePack.setId && activePack.setId !== "all"
      ? activePack.setId
      : "";

  if (!setId) {
    return null;
  }

  return state.sets.find((set) => set.id === setId) || {
    id: setId,
    name: prettifyApiSetId(setId),
    source: activePack && activePack.source || ""
  };
}

async function getIndexedDbAdminStatus() {
  const targetSet = getAdminTargetSet();
  const [meta, setMeta, cardCount, setCount, targetSetCardCount] = await Promise.all([
    getIndexedDbMeta().catch(() => null),
    getIndexedDbSetMeta().catch(() => null),
    countIndexedDbRecordsByType("card").catch(() => 0),
    countIndexedDbRecordsByType("set").catch(() => 0),
    countIndexedDbCardsForSet(targetSet && targetSet.id || "all").catch(() => 0)
  ]);
  const failedPages = Array.isArray(meta && meta.failedPages) ? meta.failedPages : [];

  return {
    cardCount,
    setCount,
    targetSet,
    targetSetCardCount,
    lastSync: Number(meta && meta.lastSync || 0),
    setLastSync: Number(setMeta && setMeta.lastSync || 0),
    partial: Boolean(meta && meta.partial),
    failedPages
  };
}

async function refreshOwnerAdminStatus() {
  if (!state.isAdminMode || !dom.ownerAdminStats) {
    return;
  }

  dom.ownerAdminStats.innerHTML = "<span>IndexedDB 상태 확인 중...</span>";

  try {
    const status = await getIndexedDbAdminStatus();
    const targetSetName = status.targetSet ? status.targetSet.name : "선택 세트 없음";

    dom.ownerAdminStats.innerHTML = `
      <span>저장 카드<strong>${status.cardCount.toLocaleString()}장</strong></span>
      <span>저장 세트<strong>${status.setCount.toLocaleString()}개</strong></span>
      <span>마지막 카드 동기화<strong>${escapeHtml(formatAdminSyncDate(status.lastSync))}</strong></span>
      <span>마지막 세트 동기화<strong>${escapeHtml(formatAdminSyncDate(status.setLastSync))}</strong></span>
      <span>현재 선택 세트<strong>${escapeHtml(targetSetName)}</strong></span>
      <span>선택 세트 캐시<strong>${status.targetSetCardCount.toLocaleString()}장</strong></span>
      <span>부분 동기화<strong>${status.partial ? "예" : "아니오"}</strong></span>
      <span>실패 페이지<strong>${status.failedPages.length.toLocaleString()}개</strong></span>
    `;
  } catch (error) {
    console.warn("IndexedDB 관리자 상태 확인 실패", error);
    dom.ownerAdminStats.innerHTML = "<span>IndexedDB 상태를 읽지 못했습니다.</span>";
  }
}

function isAdminModeFromUrl() {
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const hashText = String(window.location.hash || "").replace(/^#/, "");
    const hashParams = new URLSearchParams(hashText.includes("=") ? hashText : "");
    const pathText = String(window.location.pathname || "").toLowerCase();
    const adminValue = searchParams.get("admin") || searchParams.get("dev") || hashParams.get("admin") || hashParams.get("dev");
    const adminFlag = adminValue === "true" || adminValue === "1" || searchParams.has("admin") && adminValue === "" || hashText === "admin" || hashText === "dev" || pathText.endsWith("/admin");

    if (adminValue === "false" || adminValue === "0") {
      sessionStorage.removeItem(ADMIN_MODE_SESSION_KEY);
      return false;
    }

    if (adminFlag) {
      sessionStorage.setItem(ADMIN_MODE_SESSION_KEY, "true");
      return true;
    }

    return sessionStorage.getItem(ADMIN_MODE_SESSION_KEY) === "true";
  } catch (error) {
    return false;
  }
}

function updateAdminModeFromLocation() {
  const nextAdminMode = isAdminModeFromUrl();

  if (state.isAdminMode === nextAdminMode) {
    return;
  }

  state.isAdminMode = nextAdminMode;
  setAdminPanelVisible(false, false);
  setupOwnerAdminPanel();
}

function setupAdminPanelToggle() {
  setAdminPanelVisible(false, false);

  if (!state.isAdminMode) {
    return;
  }

  if (dom.dataSourceLabel) {
    dom.dataSourceLabel.setAttribute("role", "button");
    dom.dataSourceLabel.setAttribute("tabindex", "0");
    dom.dataSourceLabel.setAttribute("aria-expanded", "false");
    dom.dataSourceLabel.setAttribute("aria-controls", "adminPanel");
    dom.dataSourceLabel.addEventListener("click", handleAdminBadgeClick);
    dom.dataSourceLabel.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleAdminBadgeClick();
      }
    });
  }

  document.addEventListener("keydown", handleAdminHotkey);
}

function setupOwnerAdminPanel() {
  if (!dom.ownerAdminPanel) {
    return;
  }

  dom.ownerAdminPanel.hidden = !state.isAdminMode;

  if (!state.isAdminMode) {
    return;
  }

  if (dom.forceApiSyncStatus) {
    dom.forceApiSyncStatus.textContent = "API 락을 무시하고 IndexedDB를 즉시 최신화합니다.";
  }

  refreshOwnerAdminStatus();
}

function handleAdminBadgeClick() {
  window.clearTimeout(state.adminClickTimer);
  state.adminClickCount += 1;

  if (state.adminClickCount >= ADMIN_UNLOCK_CLICK_COUNT) {
    state.adminClickCount = 0;
    toggleAdminPanel();
    return;
  }

  state.adminClickTimer = window.setTimeout(() => {
    state.adminClickCount = 0;
  }, ADMIN_UNLOCK_CLICK_WINDOW_MS);
}

function handleAdminHotkey(event) {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "a") {
    event.preventDefault();
    state.adminClickCount = 0;
    toggleAdminPanel();
  }
}

function toggleAdminPanel() {
  setAdminPanelVisible(!state.adminPanelVisible, true);
}

function setAdminPanelVisible(visible, announce) {
  state.adminPanelVisible = Boolean(visible);

  if (!dom.adminPanel) {
    return;
  }

  dom.adminPanel.hidden = !state.adminPanelVisible;

  if (dom.dataSourceLabel) {
    dom.dataSourceLabel.setAttribute("aria-expanded", String(state.adminPanelVisible));
  }

  if (announce) {
    setStageStatus(state.adminPanelVisible
      ? "관리자 설정 패널을 열었습니다."
      : "관리자 설정 패널을 숨겼습니다.");
  }
}

function getOrCreatePremiumUserId() {
  const savedId = localStorage.getItem(PREMIUM_USER_ID_KEY);

  if (/^USER-\d{4}$/.test(savedId || "")) {
    return savedId;
  }

  const userId = `USER-${String(Math.floor(1000 + Math.random() * 9000))}`;
  localStorage.setItem(PREMIUM_USER_ID_KEY, userId);
  return userId;
}

function loadPremiumStatus() {
  return localStorage.getItem(PREMIUM_STORAGE_KEY) === "true";
}

function renderPremiumPanel() {
  if (dom.premiumUserIdText) {
    dom.premiumUserIdText.textContent = state.premiumUserId;
  }

  if (dom.premiumStatusText) {
    dom.premiumStatusText.textContent = state.isPremium
      ? "프리미엄 활성화"
      : "무료 모드 · 컬렉션은 새로고침 시 초기화";
  }

  if (dom.premiumCodeInput) {
    dom.premiumCodeInput.disabled = state.isPremium;
    dom.premiumCodeInput.placeholder = state.isPremium ? "인증 완료" : "ANSWER-000000";
  }

  if (dom.premiumUnlockForm) {
    dom.premiumUnlockForm.classList.toggle("is-premium", state.isPremium);
    const unlockButton = dom.premiumUnlockForm.querySelector("button");

    if (unlockButton) {
      unlockButton.disabled = state.isPremium;
      unlockButton.textContent = state.isPremium ? "Unlocked" : "Unlock";
    }
  }
}

function unlockPremiumFromCode(event) {
  event.preventDefault();

  if (state.isPremium) {
    setStageStatus("이미 프리미엄이 활성화되어 있습니다.");
    return;
  }

  const code = normalizePremiumCode(dom.premiumCodeInput.value);
  const expectedCode = createPremiumAnswerCode(state.premiumUserId);

  if (code !== expectedCode) {
    setStageStatus("인증 코드가 이 브라우저 고유 번호와 맞지 않습니다.");
    dom.premiumCodeInput.select();
    return;
  }

  state.isPremium = true;
  localStorage.setItem(PREMIUM_STORAGE_KEY, "true");
  localStorage.setItem(PREMIUM_UNLOCK_CODE_KEY, code);
  saveCollection();
  renderPremiumPanel();
  renderOddsModeSelect();
  renderCollection();
  updateStats();
  setStageStatus("프리미엄이 활성화되었습니다. 컬렉션 영구 저장과 God Pack 모드가 열렸습니다.");
}

function normalizePremiumCode(code) {
  return String(code || "").trim().toUpperCase().replace(/\s+/g, "");
}

function createPremiumAnswerCode(userId) {
  const hash = createStableHash(`${userId}|${PREMIUM_CODE_SALT}`);
  return `${PREMIUM_CODE_PREFIX}${String(hash % 1000000).padStart(6, "0")}`;
}

function createStableHash(text) {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function canUseOddsMode(modeId) {
  const mode = ODDS_MODES[modeId];
  return Boolean(mode && (!mode.premium || state.isPremium));
}

function loadSoundEnabled() {
  return localStorage.getItem(SOUND_STORAGE_KEY) !== "false";
}

function saveSoundEnabled() {
  localStorage.setItem(SOUND_STORAGE_KEY, String(state.soundEnabled));
}

function renderSoundToggle() {
  if (!dom.soundToggleBtn) {
    return;
  }

  dom.soundToggleBtn.textContent = state.soundEnabled ? "Sound On" : "Sound Off";
  dom.soundToggleBtn.setAttribute("aria-pressed", String(state.soundEnabled));
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  saveSoundEnabled();
  renderSoundToggle();

  if (state.soundEnabled) {
    playUiSound("toggle");
  }
}

function getAudioContext() {
  if (!state.soundEnabled) {
    return null;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    return null;
  }

  if (!state.audioContext) {
    state.audioContext = new AudioContextClass();
  }

  if (state.audioContext.state === "suspended") {
    state.audioContext.resume().catch(() => {});
  }

  return state.audioContext;
}

function playUiSound(kind, options = {}) {
  const audioContext = getAudioContext();

  if (!audioContext) {
    return;
  }

  const now = audioContext.currentTime;

  if (kind === "select") {
    playTone(audioContext, now, 520, 0.05, { type: "triangle", volume: 0.035, to: 760 });
    return;
  }

  if (kind === "toggle") {
    playTone(audioContext, now, 620, 0.08, { type: "sine", volume: 0.045, to: 920 });
    playTone(audioContext, now + 0.07, 920, 0.08, { type: "sine", volume: 0.032 });
    return;
  }

  if (kind === "pack") {
    playNoiseBurst(audioContext, now, 0.26, 0.045);
    playTone(audioContext, now + 0.04, 140, 0.09, { type: "sawtooth", volume: 0.05, to: 90 });
    playTone(audioContext, now + 0.18, 760, 0.08, { type: "triangle", volume: 0.045, to: 1180 });
    return;
  }

  if (kind === "flip") {
    playTone(audioContext, now, 360, 0.055, { type: "triangle", volume: 0.035, to: 540 });
    playTone(audioContext, now + 0.055, 720, 0.04, { type: "sine", volume: 0.025 });
    return;
  }

  if (kind === "result") {
    [440, 660, 880].forEach((frequency, index) => {
      playTone(audioContext, now + index * 0.07, frequency, 0.11, { type: "triangle", volume: 0.035 });
    });
  }
}

function playRaritySound(tier, options = {}) {
  const audioContext = getAudioContext();

  if (!audioContext) {
    return;
  }

  const now = audioContext.currentTime;

  if (tier === "rare" || tier === "holo") {
    playTone(audioContext, now, 640, 0.1, { type: "sine", volume: 0.036 });
    playTone(audioContext, now + 0.08, 960, 0.13, { type: "triangle", volume: 0.035 });
    return;
  }

  const base = tier === "special" ? 520 : tier === "secret" ? 490 : 460;
  [base, base * 1.25, base * 1.5, base * 2].forEach((frequency, index) => {
    playTone(audioContext, now + index * 0.065, frequency, 0.18, {
      type: index % 2 ? "triangle" : "sine",
      volume: options.finalCard ? 0.052 : 0.044
    });
  });
  playTone(audioContext, now, 82, 0.2, { type: "sine", volume: 0.04, to: 58 });
}

function playTone(audioContext, startTime, frequency, duration, options = {}) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const volume = Number(options.volume || 0.04);

  oscillator.type = options.type || "sine";
  oscillator.frequency.setValueAtTime(frequency, startTime);

  if (options.to) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, options.to), startTime + duration);
  }

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

function playNoiseBurst(audioContext, startTime, duration, volume) {
  const sampleRate = audioContext.sampleRate;
  const buffer = audioContext.createBuffer(1, Math.max(1, Math.floor(sampleRate * duration)), sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < data.length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
  }

  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();

  filter.type = "highpass";
  filter.frequency.setValueAtTime(900, startTime);
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  source.buffer = buffer;
  source.connect(filter).connect(gain).connect(audioContext.destination);
  source.start(startTime);
}

function isGodPackMode() {
  return state.isPremium && state.oddsMode === "godpack";
}

function getPremiumCollectionValue() {
  return Object.values(state.collection).reduce((total, card) => {
    const copies = Math.max(1, Number(card.copies || card.duplicateCount + 1 || 1));
    return total + Number(card.fakePrice || 0) * copies;
  }, 0);
}

function cleanupLegacyLocalStorageCardCaches() {
  // 예전 버전은 카드 전체 데이터를 localStorage에 넣었기 때문에 5MB 제한에 걸릴 수 있었습니다.
  // 이제 카드 풀은 IndexedDB에만 저장하므로, 오래된 카드 캐시 키만 안전하게 정리합니다.
  LEGACY_LOCAL_STORAGE_CARD_CACHE_KEYS.forEach((key) => {
    localStorage.removeItem(key);
  });

  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    const isLegacyCardCache = LEGACY_LOCAL_STORAGE_CARD_CACHE_PREFIXES.some((prefix) => key && key.startsWith(prefix));

    if (isLegacyCardCache) {
      localStorage.removeItem(key);
    }
  }
}

function openCardCacheDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }

    const request = indexedDB.open(IDB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(IDB_STORE_NAME)
        ? request.transaction.objectStore(IDB_STORE_NAME)
        : db.createObjectStore(IDB_STORE_NAME, { keyPath: "id" });

      if (!store.indexNames.contains("setId")) {
        store.createIndex("setId", "setId", { unique: false });
      }

      if (!store.indexNames.contains("recordType")) {
        store.createIndex("recordType", "recordType", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbTransactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });
}

async function getIndexedDbMeta() {
  const db = await openCardCacheDb();

  try {
    const transaction = db.transaction(IDB_STORE_NAME, "readonly");
    const store = transaction.objectStore(IDB_STORE_NAME);
    return await idbRequest(store.get(IDB_META_ID));
  } finally {
    db.close();
  }
}

async function loadAllCardsFromIndexedDb() {
  const db = await openCardCacheDb();

  try {
    const transaction = db.transaction(IDB_STORE_NAME, "readonly");
    const store = transaction.objectStore(IDB_STORE_NAME);
    const records = await idbRequest(store.getAll());
    return records
      .filter((record) => record && record.recordType === "card")
      .map(sanitizeIndexedDbCardRecord);
  } finally {
    db.close();
  }
}

async function loadCardsFromIndexedDbForSet(setId) {
  const db = await openCardCacheDb();

  try {
    const transaction = db.transaction(IDB_STORE_NAME, "readonly");
    const store = transaction.objectStore(IDB_STORE_NAME);
    const records = await idbRequest(store.index("setId").getAll(setId));
    return records
      .filter((record) => record && record.recordType === "card")
      .map(sanitizeIndexedDbCardRecord);
  } finally {
    db.close();
  }
}

function sanitizeIndexedDbCardRecord(record) {
  const inferredSetId = inferApiSetIdFromCardId(record.id);
  const hasBrokenSet = !record.setId || record.setId === "api-unknown" || record.setName === "API Set";

  if (!hasBrokenSet || inferredSetId === "api-unknown") {
    return record;
  }

  return {
    ...record,
    setId: inferredSetId,
    setName: prettifyApiSetId(inferredSetId)
  };
}

async function saveCardsToIndexedDb(cards, meta = {}) {
  const db = await openCardCacheDb();
  const normalizedCards = normalizeCards(cards);

  try {
    const transaction = db.transaction(IDB_STORE_NAME, "readwrite");
    const store = transaction.objectStore(IDB_STORE_NAME);

    normalizedCards.forEach((card) => {
      store.put({
        ...card,
        imageUrl: getCardSmallImageUrl(card),
        imageSmallUrl: getCardSmallImageUrl(card),
        imageLargeUrl: getCardLargeImageUrl(card),
        basePrice: card.basePrice !== null && card.basePrice !== undefined && Number.isFinite(Number(card.basePrice))
          ? Number(card.basePrice)
          : null,
        fakePrice: Number.isFinite(Number(card.fakePrice))
          ? Number(Number(card.fakePrice).toFixed(2))
          : getCardPriceValue(card, card.id, card.rarity),
        cachedAt: new Date().toISOString(),
        recordType: "card"
      });
    });
    store.put({
      id: IDB_META_ID,
      recordType: "meta",
      lastSync: Number(meta.lastSync ?? Date.now()),
      syncedAt: meta.syncedAt || new Date().toISOString(),
      cardCount: normalizedCards.length,
      source: meta.source || "pokemon-tcg-api",
      partial: Boolean(meta.partial),
      failedPages: Array.isArray(meta.failedPages) ? meta.failedPages : []
    });

    await idbTransactionDone(transaction);
  } finally {
    db.close();
  }

  return normalizedCards;
}

async function saveIndexedDbCardMeta(meta = {}) {
  const db = await openCardCacheDb();

  try {
    const transaction = db.transaction(IDB_STORE_NAME, "readwrite");
    const store = transaction.objectStore(IDB_STORE_NAME);
    store.put({
      id: IDB_META_ID,
      recordType: "meta",
      lastSync: Number(meta.lastSync ?? Date.now()),
      syncedAt: meta.syncedAt || new Date().toISOString(),
      cardCount: Number(meta.cardCount || 0),
      source: meta.source || "pokemon-tcg-api",
      partial: Boolean(meta.partial),
      failedPages: Array.isArray(meta.failedPages) ? meta.failedPages : []
    });
    await idbTransactionDone(transaction);
  } finally {
    db.close();
  }
}

async function loadIndexedDbSetRecords() {
  const db = await openCardCacheDb();

  try {
    const transaction = db.transaction(IDB_STORE_NAME, "readonly");
    const store = transaction.objectStore(IDB_STORE_NAME);
    const records = await idbRequest(store.getAll());

    return records
      .filter((record) => record && record.recordType === "set")
      .map(normalizeIndexedDbSetRecord);
  } finally {
    db.close();
  }
}

async function getIndexedDbSetMeta() {
  const db = await openCardCacheDb();

  try {
    const transaction = db.transaction(IDB_STORE_NAME, "readonly");
    const store = transaction.objectStore(IDB_STORE_NAME);
    return await idbRequest(store.get(IDB_SET_META_ID));
  } finally {
    db.close();
  }
}

async function countIndexedDbRecordsByType(recordType) {
  const db = await openCardCacheDb();

  try {
    const transaction = db.transaction(IDB_STORE_NAME, "readonly");
    const store = transaction.objectStore(IDB_STORE_NAME);
    return await idbRequest(store.index("recordType").count(IDBKeyRange.only(recordType)));
  } finally {
    db.close();
  }
}

async function countIndexedDbCardsForSet(setId) {
  if (!setId || setId === "all") {
    return countIndexedDbRecordsByType("card");
  }

  const db = await openCardCacheDb();

  try {
    const transaction = db.transaction(IDB_STORE_NAME, "readonly");
    const store = transaction.objectStore(IDB_STORE_NAME);
    const records = await idbRequest(store.index("setId").getAll(setId));
    return records.filter((record) => record && record.recordType === "card").length;
  } finally {
    db.close();
  }
}

async function saveSetsToIndexedDb(sets, meta = {}) {
  const db = await openCardCacheDb();
  const normalizedSets = sets.map(normalizeIndexedDbSetRecord).filter((set) => set.id);

  try {
    const transaction = db.transaction(IDB_STORE_NAME, "readwrite");
    const store = transaction.objectStore(IDB_STORE_NAME);

    normalizedSets.forEach((set) => {
      store.put({
        ...set,
        id: `set:${set.id}`,
        setId: set.id,
        recordType: "set"
      });
    });
    store.put({
      id: IDB_SET_META_ID,
      recordType: "meta",
      lastSync: Number(meta.lastSync ?? Date.now()),
      syncedAt: meta.syncedAt || new Date().toISOString(),
      setCount: normalizedSets.length,
      source: meta.source || "pokemon-tcg-api-sets"
    });

    await idbTransactionDone(transaction);
  } finally {
    db.close();
  }

  return normalizedSets;
}

function normalizeIndexedDbSetRecord(rawSet) {
  const rawId = String(rawSet.setId || rawSet.id || "").replace(/^set:/, "");

  return {
    id: rawId,
    name: String(rawSet.name || rawSet.setName || rawId),
    series: String(rawSet.series || ""),
    releaseDate: String(rawSet.releaseDate || ""),
    totalCards: Number(rawSet.totalCards || rawSet.total || rawSet.printedTotal || rawSet.listedTotal || 0),
    listedTotal: Number(rawSet.listedTotal || rawSet.totalCards || rawSet.total || rawSet.printedTotal || 0),
    logoUrl: String(rawSet.logoUrl || rawSet.images && rawSet.images.logo || ""),
    symbolUrl: String(rawSet.symbolUrl || rawSet.images && rawSet.images.symbol || ""),
    profileId: String(rawSet.profileId || inferPackProfileIdForApiSet(rawSet)),
    source: "api"
  };
}

async function putCardsIntoIndexedDb(cards) {
  const db = await openCardCacheDb();
  const normalizedCards = normalizeCards(cards);

  try {
    const transaction = db.transaction(IDB_STORE_NAME, "readwrite");
    const store = transaction.objectStore(IDB_STORE_NAME);

    normalizedCards.forEach((card) => {
      store.put({
        ...card,
        imageUrl: getCardSmallImageUrl(card),
        imageSmallUrl: getCardSmallImageUrl(card),
        imageLargeUrl: getCardLargeImageUrl(card),
        recordType: "card"
      });
    });

    await idbTransactionDone(transaction);
  } finally {
    db.close();
  }

  return normalizedCards;
}

function isApiSyncDue(meta, now = Date.now()) {
  const lastSyncTime = Number(meta && meta.lastSync || 0);
  return !lastSyncTime || now - lastSyncTime >= API_SYNC_INTERVAL_MS;
}

function getApiSyncRemainingMs(meta, now = Date.now()) {
  const lastSyncTime = Number(meta && meta.lastSync || 0);
  return Math.max(0, API_SYNC_INTERVAL_MS - (now - lastSyncTime));
}

async function loadIndexedDbCatalog() {
  const [meta, setMeta, cards, sets] = await Promise.all([
    getIndexedDbMeta(),
    getIndexedDbSetMeta(),
    loadAllCardsFromIndexedDb(),
    loadIndexedDbSetRecords()
  ]);

  if (sets.length > 0) {
    return buildCatalogFromSetRecords(sets, cards, {
      lastSync: Number(meta && meta.lastSync || 0),
      setLastSync: Number(setMeta && setMeta.lastSync || 0),
      syncedAt: meta && meta.syncedAt || setMeta && setMeta.syncedAt || "",
      cardCount: cards.length
    });
  }

  return null;
}

function isCompleteIndexedDbCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.cards) || catalog.cards.length === 0) {
    return false;
  }

  const sourceLooksPartial = Boolean(catalog.meta && catalog.meta.partial);
  const cardCountLooksPartial = catalog.cards.length < 1000;
  const onlyBrokenApiSet = catalog.sets.filter((set) => set.id !== "all").length <= 1
    && catalog.sets.some((set) => set.name === "API Set" || set.id === "api-unknown");

  return !sourceLooksPartial && !cardCountLooksPartial && !onlyBrokenApiSet;
}

async function syncIndexedDbApiCacheIfNeeded() {
  if (state.apiSyncInFlight) {
    return state.apiSyncInFlight;
  }

  state.apiSyncInFlight = (async () => {
    const meta = await getIndexedDbMeta();
    const cachedCatalog = await loadIndexedDbCatalog();

    // 24시간이 지나지 않았다면 외부 API 호출은 완전히 스킵하고 IndexedDB만 사용합니다.
    if (cachedCatalog && !isApiSyncDue(meta)) {
      return {
        catalog: cachedCatalog,
        didFetch: false,
        skipped: true,
        remainingMs: getApiSyncRemainingMs(meta)
      };
    }

    try {
      const catalog = await fetchIndexedDbApiSnapshot();
      const syncedAt = Date.now();
      const partial = Boolean(catalog.meta && catalog.meta.partial);
      const failedPages = Array.isArray(catalog.meta && catalog.meta.failedPages) ? catalog.meta.failedPages : [];
      const cards = await saveCardsToIndexedDb(catalog.cards, {
        lastSync: partial ? 0 : syncedAt,
        syncedAt: new Date(syncedAt).toISOString(),
        source: partial ? "pokemon-tcg-api-partial" : "pokemon-tcg-api",
        partial,
        failedPages
      });

      return {
        catalog: buildCatalogFromCachedCards(cards, {
          lastSync: partial ? 0 : syncedAt,
          syncedAt: new Date(syncedAt).toISOString(),
          partial,
          failedPages
        }),
        didFetch: true,
        skipped: false,
        partial,
        remainingMs: partial ? 0 : API_SYNC_INTERVAL_MS
      };
    } catch (error) {
      if (error.partialCatalog && error.partialCatalog.cards.length > 0) {
        const syncedAt = Date.now();
        const cards = await saveCardsToIndexedDb(error.partialCatalog.cards, {
          lastSync: 0,
          syncedAt: new Date(syncedAt).toISOString(),
          source: "pokemon-tcg-api-partial",
          partial: true
        });

        return {
          catalog: buildCatalogFromCachedCards(cards, {
            lastSync: 0,
            syncedAt: new Date(syncedAt).toISOString(),
            partial: true
          }),
          didFetch: true,
          skipped: false,
          partial: true,
          remainingMs: 0
        };
      }

      if (cachedCatalog) {
        console.warn("IndexedDB 캐시 업데이트 실패. 기존 캐시 데이터로 계속 실행합니다.", error);
        return {
          catalog: cachedCatalog,
          didFetch: false,
          skipped: true,
          stale: true,
          remainingMs: 0
        };
      }

      throw error;
    }
  })().finally(() => {
    state.apiSyncInFlight = null;
  });

  return state.apiSyncInFlight;
}

async function hydrateIndexedDbCacheOnStartup() {
  try {
    const cachedCatalog = await loadIndexedDbCatalog();

    if (isCompleteIndexedDbCatalog(cachedCatalog)) {
      applyCatalog(cachedCatalog, "IndexedDB Pokemon TCG cache");
      setStageStatus("완성된 IndexedDB 카드 캐시로 시작했습니다.");
      return true;
    }

    if (cachedCatalog && cachedCatalog.cards.length > 0) {
      setStageStatus("부분 카드 캐시가 있습니다. Load API를 누르면 공식 세트 목록과 함께 정리됩니다.");
      return false;
    }
  } catch (error) {
    console.warn("IndexedDB 카드 캐시 확인 실패. 로컬 DB 또는 내장 샘플 DB로 유지합니다.", error);
  }

  setStageStatus("IndexedDB 카드 캐시가 없어 로컬 DB 또는 내장 샘플 DB로 실행 중입니다.");
  return false;
}

async function fetchIndexedDbApiSnapshot() {
  // 이 함수만 공식 API를 호출합니다. 앱 시작, 버튼 클릭, 팩 오픈은 모두 syncIndexedDbApiCacheIfNeeded를 거칩니다.
  const pageSize = API_CARD_PAGE_SIZE;
  const cards = [];
  const failedPages = [];
  const selectedFields = API_CARD_LIGHT_SELECT_FIELDS;
  const setLookup = await fetchApiSetLookup().catch((error) => {
    console.warn("세트 목록 API를 불러오지 못해 카드 ID에서 세트 ID를 추론합니다.", error);
    return new Map();
  });

  if (setLookup.size > 0) {
    await saveSetsToIndexedDb(Array.from(setLookup.values()), {
      lastSync: Date.now(),
      syncedAt: new Date().toISOString()
    });
  }

  try {
    const firstPage = await fetchApiCardsPage(1, pageSize, selectedFields);
    const firstPageCards = Array.isArray(firstPage.data) ? firstPage.data : [];
    const totalCount = Number(firstPage.totalCount || 0);

    cards.push(...firstPageCards.map((card) => normalizeApiCard(card, setLookup)));
    setStageStatus(totalCount > 0
      ? `IndexedDB 카드 캐시 동기화 중... ${Math.min(cards.length, totalCount)} / ${totalCount}`
      : `IndexedDB 카드 캐시 동기화 중... ${cards.length}장`);

    if (totalCount > 0) {
      const totalPages = Math.ceil(totalCount / pageSize);
      const remainingPages = Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => index + 2);

      for (let index = 0; index < remainingPages.length; index += API_CARD_FETCH_CONCURRENCY) {
        const pageBatch = remainingPages.slice(index, index + API_CARD_FETCH_CONCURRENCY);
        const pageResults = await Promise.allSettled(pageBatch.map((page) => fetchApiCardsPage(page, pageSize, selectedFields)));

        pageResults.forEach((result, resultIndex) => {
          if (result.status !== "fulfilled") {
            failedPages.push(pageBatch[resultIndex]);
            console.warn(`API 카드 페이지 ${pageBatch[resultIndex]} 동기화 실패. 다음 페이지로 계속 진행합니다.`, result.reason);
            return;
          }

          const json = result.value;
          const pageCards = Array.isArray(json.data) ? json.data : [];
          cards.push(...pageCards.map((card) => normalizeApiCard(card, setLookup)));
        });

        setStageStatus(failedPages.length > 0
          ? `IndexedDB 카드 캐시 동기화 중... ${Math.min(cards.length, totalCount)} / ${totalCount} · 실패 ${failedPages.length}페이지`
          : `IndexedDB 카드 캐시 동기화 중... ${Math.min(cards.length, totalCount)} / ${totalCount}`);
      }
    } else {
      for (let page = 2; ; page += 1) {
        const json = await fetchApiCardsPage(page, pageSize, selectedFields);
        const pageCards = Array.isArray(json.data) ? json.data : [];

        cards.push(...pageCards.map((card) => normalizeApiCard(card, setLookup)));
        setStageStatus(`IndexedDB 카드 캐시 동기화 중... ${cards.length}장`);

        if (pageCards.length < pageSize) {
          break;
        }
      }
    }
  } catch (error) {
    if (cards.length > 0) {
      error.partialCatalog = buildCatalogFromCachedCards(cards, {
        lastSync: 0,
        syncedAt: new Date().toISOString(),
        partial: true,
        failedPages
      });
    }

    throw error;
  }

  return buildCatalogFromCachedCards(cards, {
    lastSync: Date.now(),
    syncedAt: new Date().toISOString(),
    partial: failedPages.length > 0,
    failedPages
  });
}

async function fetchApiCardsPage(page, pageSize, selectedFields) {
  const apiUrl = buildPokemonTcgApiUrl("/v2/cards", {
    page: String(page),
    pageSize: String(pageSize),
    select: selectedFields
  });

  return fetchJson(apiUrl, {
    useApiKey: true,
    timeoutMs: 45000
  });
}

async function fetchApiCardsForSet(setOrPack) {
  const setId = String(setOrPack && setOrPack.setId || setOrPack && setOrPack.id || "");

  if (!setId || setId === "all") {
    return [];
  }

  const setLookup = new Map([
    [
      setId,
      {
        id: setId,
        name: String(setOrPack.setName || setOrPack.name || prettifyApiSetId(setId)).replace(/\s+Booster$/i, ""),
        series: String(setOrPack.series || ""),
        releaseDate: String(setOrPack.releaseDate || ""),
        totalCards: Number(setOrPack.totalCards || 0),
        logoUrl: String(setOrPack.logoUrl || ""),
        symbolUrl: String(setOrPack.symbolUrl || "")
      }
    ]
  ]);
  const cards = [];

  for (let page = 1; ; page += 1) {
    const apiUrl = buildPokemonTcgApiUrl("/v2/cards", {
      q: `set.id:${setId}`,
      page: String(page),
      pageSize: String(API_CARD_PAGE_SIZE),
      select: API_CARD_LIGHT_SELECT_FIELDS
    });
    const json = await fetchJson(apiUrl, {
      useApiKey: true,
      timeoutMs: 45000
    });
    const pageCards = Array.isArray(json.data) ? json.data : [];
    const totalCount = Number(json.totalCount || 0);

    cards.push(...pageCards.map((card) => normalizeApiCard(card, setLookup)));
    setStageStatus(`${setLookup.get(setId).name} 카드 캐시 중... ${totalCount > 0 ? `${Math.min(cards.length, totalCount)} / ${totalCount}` : `${cards.length}장`}`);

    if (pageCards.length < API_CARD_PAGE_SIZE || (totalCount > 0 && cards.length >= totalCount)) {
      break;
    }
  }

  return cards;
}

async function fetchApiSetLookup() {
  const pageSize = 250;
  const sets = [];

  for (let page = 1; ; page += 1) {
    const json = await fetchApiSetsPage(page, pageSize);
    const pageSets = Array.isArray(json.data) ? json.data : [];
    const totalCount = Number(json.totalCount || 0);

    sets.push(...pageSets);

    if (pageSets.length < pageSize || (totalCount > 0 && sets.length >= totalCount)) {
      break;
    }
  }

  return new Map(sets.map((set) => [
    String(set.id || ""),
    {
      id: String(set.id || ""),
      name: String(set.name || set.id || ""),
      series: String(set.series || ""),
      releaseDate: String(set.releaseDate || ""),
      totalCards: Number(set.total || set.printedTotal || 0),
      logoUrl: String(set.images && set.images.logo || ""),
      symbolUrl: String(set.images && set.images.symbol || "")
    }
  ]).filter(([setId]) => Boolean(setId)));
}

async function fetchApiSetsPage(page, pageSize) {
  const selectedUrl = buildPokemonTcgApiUrl("/v2/sets", {
    page: String(page),
    pageSize: String(pageSize),
    select: "id,name,series,releaseDate,total,printedTotal,images"
  });

  try {
    return await fetchJson(selectedUrl, {
      useApiKey: true,
      timeoutMs: 60000
    });
  } catch (error) {
    console.warn("선택 필드 세트 API 요청 실패. 전체 세트 응답으로 재시도합니다.", error);
    const fallbackUrl = buildPokemonTcgApiUrl("/v2/sets", {
      page: String(page),
      pageSize: String(pageSize)
    });

    return fetchJson(fallbackUrl, {
      useApiKey: true,
      timeoutMs: 60000
    });
  }
}

async function fetchApiSetCatalog() {
  const setLookup = await fetchApiSetLookup();
  const sets = Array.from(setLookup.values())
    .map(normalizeIndexedDbSetRecord)
    .sort((a, b) => {
      const dateSort = String(b.releaseDate || "").localeCompare(String(a.releaseDate || ""));
      return dateSort || a.name.localeCompare(b.name);
    });
  await saveSetsToIndexedDb(sets, {
    lastSync: Date.now(),
    syncedAt: new Date().toISOString()
  });

  return buildCatalogFromSetRecords(sets, [], {
    setLastSync: Date.now(),
    syncedAt: new Date().toISOString()
  });
}

function buildCatalogFromSetRecords(sets, cards = [], meta = {}) {
  const normalizedSets = sets
    .map(normalizeIndexedDbSetRecord)
    .filter((set) => set.id)
    .sort((a, b) => {
      const dateSort = String(b.releaseDate || "").localeCompare(String(a.releaseDate || ""));
      return dateSort || a.name.localeCompare(b.name);
    });
  const packs = normalizedSets.map((set) => ({
    id: `api-${set.id}-booster`,
    setId: set.id,
    name: `${set.name} Booster`,
    cardCount: PACK_SIZE,
    packImageUrl: buildPackArtUrl(set.name, stableVariantIndex(set.id)),
    logoUrl: set.logoUrl,
    symbolUrl: set.symbolUrl,
    series: set.series,
    profileId: set.profileId,
    source: "api"
  }));

  packs.unshift({
    id: "api-official-random-booster",
    setId: "all",
    name: "Official Random Booster",
    cardCount: PACK_SIZE,
    source: "api",
    series: "Official",
    profileId: "mixed",
    isApiRandom: true
  });

  return {
    schemaVersion: 2,
    meta: {
      name: "Pokemon TCG API Set Catalog",
      source: "pokemon-tcg-api",
      syncedAt: meta.syncedAt || "",
      lastSync: Number(meta.lastSync || 0),
      setLastSync: Number(meta.setLastSync || 0),
      cardCount: Number(meta.cardCount || cards.length || 0)
    },
    sets: normalizedSets,
    packs,
    cards
  };
}

function buildCatalogFromCachedCards(cards, meta = {}) {
  const normalizedCards = normalizeCards(cards);
  const setMap = new Map();

  normalizedCards.forEach((card) => {
    if (!setMap.has(card.setId)) {
      setMap.set(card.setId, {
        id: card.setId,
        name: card.setName || card.setId,
        series: card.setSeries || "",
        profileId: inferPackProfileIdForApiSet({
          id: card.setId,
          name: card.setName,
          series: card.setSeries || "",
          releaseDate: card.setReleaseDate || ""
        }),
        releaseDate: card.setReleaseDate || "",
        listedTotal: Number(card.setTotal || 0),
        totalCards: 0,
        logoUrl: card.setLogoUrl || "",
        symbolUrl: card.setSymbolUrl || "",
        source: "api"
      });
    }

    setMap.get(card.setId).totalCards += 1;
  });

  const sets = Array.from(setMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  const packs = sets.map((set) => ({
    id: `api-${set.id}-booster`,
    setId: set.id,
    name: `${set.name} Booster`,
    cardCount: PACK_SIZE,
    packImageUrl: buildPackArtUrl(set.name, stableVariantIndex(set.id)),
    logoUrl: set.logoUrl,
    symbolUrl: set.symbolUrl,
    series: set.series,
    profileId: set.profileId,
    source: "api"
  }));

  packs.unshift({
    id: "api-indexeddb-random-booster",
    setId: "all",
    name: "IndexedDB Official Booster",
    cardCount: PACK_SIZE,
    source: "api",
    series: "Cached",
    profileId: "mixed",
    isApiRandom: true
  });

  return {
    schemaVersion: 2,
    meta: {
      name: "IndexedDB Pokemon TCG Cache",
      source: "indexeddb",
      syncedAt: meta.syncedAt || "",
      lastSync: Number(meta.lastSync || 0),
      cardCount: normalizedCards.length,
      partial: Boolean(meta.partial),
      failedPages: Array.isArray(meta.failedPages) ? meta.failedPages : []
    },
    sets,
    packs,
    cards: normalizedCards
  };
}

function getArrayPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.data)) {
    return payload.data;
  }

  if (payload && Array.isArray(payload.value)) {
    return payload.value;
  }

  return [];
}

function inferPackProfileIdForApiSet(set) {
  const setId = String(set.id || "").toLowerCase();
  const releaseYear = Number(String(set.releaseDate || "").slice(0, 4));
  const text = [set.id, set.name, set.series].filter(Boolean).join(" ").toLowerCase();

  if (text.includes("scarlet") || text.includes("violet") || setId.startsWith("sv") || releaseYear >= 2023) {
    return "scarlet-violet";
  }

  if (text.includes("sword") || text.includes("shield") || releaseYear >= 2020) {
    return "sword-shield";
  }

  if (text.includes("sun") || text.includes("moon") || setId.startsWith("sm") || releaseYear >= 2017) {
    return "sun-moon";
  }

  if (text.includes("xy") || releaseYear >= 2014) {
    return "xy";
  }

  if (text.includes("black") || text.includes("white") || releaseYear >= 2011) {
    return "black-white";
  }

  if (releaseYear > 0) {
    return "older";
  }

  return "mixed";
}

function normalizeApiCard(apiCard, setLookup = new Map()) {
  const type = Array.isArray(apiCard.types) && apiCard.types.length > 0
    ? normalizeType(apiCard.types[0])
    : "Colorless";
  const cardId = String(apiCard.id || "");
  const setId = apiCard.set && apiCard.set.id ? apiCard.set.id : inferApiSetIdFromCardId(cardId);
  const setInfo = setLookup.get(setId) || {};
  const setName = apiCard.set && apiCard.set.name ? apiCard.set.name : setInfo.name || prettifyApiSetId(setId);
  const basePrice = extractApiBasePrice(apiCard);
  const rarity = normalizeRarity(apiCard.rarity);
  const fakePrice = basePrice !== null ? basePrice : makeStableFakePrice(cardId, rarity);
  const imageSmallUrl = apiCard.images && apiCard.images.small ? String(apiCard.images.small) : "";
  const imageLargeUrl = apiCard.images && apiCard.images.large ? String(apiCard.images.large) : imageSmallUrl;

  return {
    id: cardId,
    name: String(apiCard.name || "Unknown Card"),
    setId,
    setName,
    setSeries: apiCard.set && apiCard.set.series ? apiCard.set.series : setInfo.series || "",
    setReleaseDate: apiCard.set && apiCard.set.releaseDate ? apiCard.set.releaseDate : setInfo.releaseDate || "",
    setTotal: Number(apiCard.set && (apiCard.set.total || apiCard.set.printedTotal) || setInfo.totalCards || 0),
    setLogoUrl: apiCard.set && apiCard.set.images && apiCard.set.images.logo ? apiCard.set.images.logo : setInfo.logoUrl || "",
    setSymbolUrl: apiCard.set && apiCard.set.images && apiCard.set.images.symbol ? apiCard.set.images.symbol : setInfo.symbolUrl || "",
    number: String(apiCard.number || ""),
    type,
    stage: Array.isArray(apiCard.subtypes) && apiCard.subtypes.length > 0
      ? apiCard.subtypes[0]
      : String(apiCard.supertype || "Basic"),
    hp: Number(apiCard.hp || 0),
    rarity,
    imageUrl: imageSmallUrl,
    imageSmallUrl,
    imageLargeUrl,
    basePrice,
    fakePrice,
    attacks: normalizeApiAttacks(apiCard.attacks, type),
    weakness: Array.isArray(apiCard.weaknesses) && apiCard.weaknesses[0] ? normalizeType(apiCard.weaknesses[0].type) : "",
    resistance: Array.isArray(apiCard.resistances) && apiCard.resistances[0] ? normalizeType(apiCard.resistances[0].type) : "",
    retreatCost: Array.isArray(apiCard.retreatCost) ? apiCard.retreatCost.length : 0,
    flavorText: "",
    owned: false,
    duplicateCount: 0
  };
}

function inferApiSetIdFromCardId(cardId) {
  const normalizedId = String(cardId || "").trim();
  const dashIndex = normalizedId.lastIndexOf("-");

  if (dashIndex > 0) {
    return normalizedId.slice(0, dashIndex);
  }

  return normalizedId || "api-unknown";
}

function prettifyApiSetId(setId) {
  const normalizedSetId = String(setId || "api-unknown");

  if (normalizedSetId === "api-unknown") {
    return "API Set";
  }

  return normalizedSetId
    .replace(/[-_]+/g, " ")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function normalizeApiAttacks(attacks, fallbackType) {
  if (!Array.isArray(attacks) || attacks.length === 0) {
    return [
      {
        cost: [fallbackType],
        name: "Quick Hit",
        damage: "10",
        text: "Runtime API card."
      }
    ];
  }

  return attacks.slice(0, 2).map((attack) => ({
    cost: Array.isArray(attack.cost) && attack.cost.length > 0
      ? attack.cost.map(normalizeType)
      : [fallbackType],
    name: String(attack.name || "Attack"),
    damage: String(attack.damage || ""),
    text: String(attack.text || "")
  }));
}

function applyCatalog(rawCatalog, sourceLabel) {
  const catalog = normalizeCatalog(rawCatalog);
  state.sets = catalog.sets;
  state.packs = catalog.packs;
  state.cards = applyCollectionState(catalog.cards);
  state.apiLoadedSetIds = new Set(catalog.cards.map((card) => card.setId));

  if (!state.sets.some((set) => set.id === state.activeSetId)) {
    state.activeSetId = "all";
  }

  const activePackStillExists = state.packs.some((pack) => pack.id === state.activePackId);
  if (!activePackStillExists) {
    const firstPackForSet = getPacksForSet(state.activeSetId)[0];
    state.activePackId = firstPackForSet ? firstPackForSet.id : state.packs[0].id;
  }

  dom.dataSourceLabel.textContent = `Data source: ${sourceLabel}`;
  renderSelectors();
  updateStats();
  renderCollection();
  scheduleActivePackImagePreload({ loadMissing: false });
  refreshOwnerAdminStatus();
}

function normalizeCatalog(rawCatalog) {
  const rawCards = Array.isArray(rawCatalog)
    ? rawCatalog
    : Array.isArray(rawCatalog.cards)
      ? rawCatalog.cards
      : [];

  const rawSets = Array.isArray(rawCatalog.sets) ? rawCatalog.sets : [];
  const rawPacks = Array.isArray(rawCatalog.packs) ? rawCatalog.packs : [];
  const normalizedCards = normalizeCards(rawCards);
  const setMap = new Map();

  rawSets.forEach((set) => {
    const listedTotal = Number(set.totalCards || set.total || set.printedTotal || 0);

    setMap.set(String(set.id), {
      id: String(set.id),
      name: String(set.name || set.id),
      series: String(set.series || ""),
      profileId: String(set.profileId || set.packProfile || set.pullRateProfile || ""),
      releaseDate: String(set.releaseDate || ""),
      listedTotal,
      totalCards: listedTotal,
      logoUrl: String(set.logoUrl || set.images && set.images.logo || ""),
      symbolUrl: String(set.symbolUrl || set.images && set.images.symbol || ""),
      packImageUrl: String(set.packImageUrl || ""),
      source: String(set.source || "")
    });
  });

  normalizedCards.forEach((card) => {
    if (!setMap.has(card.setId)) {
      setMap.set(card.setId, {
        id: card.setId,
        name: card.setName,
        series: "",
        releaseDate: "",
        totalCards: 0
      });
    }

    const set = setMap.get(card.setId);
    set.loadedTotal = Number(set.loadedTotal || 0) + 1;
    if (!Number(set.listedTotal || 0)) {
      set.totalCards = set.loadedTotal;
    }
  });

  const setList = Array.from(setMap.values()).map((set) => ({
    ...set,
    totalCards: Number(set.listedTotal || set.totalCards || set.loadedTotal || 0)
  }));
  const listedAllTotal = setList.reduce((total, set) => total + Number(set.listedTotal || set.totalCards || 0), 0);
  const allTotal = listedAllTotal > 0
    ? listedAllTotal
    : normalizedCards.length > 0
      ? normalizedCards.length
      : setList.reduce((total, set) => total + Number(set.totalCards || 0), 0);

  const sets = [
    {
      id: "all",
      name: "All Sets",
      series: "Local",
      releaseDate: "",
      totalCards: allTotal
    },
    ...setList.filter((set) => set.id !== "all")
  ];

  let packs = rawPacks.length > 0
    ? rawPacks.map((pack) => {
        const slotProfile = normalizeCustomSlotProfile(pack.slotProfile || pack.slots || pack.pullSlots, pack.name);

        return {
          id: String(pack.id),
          setId: String(pack.setId || "all"),
          name: String(pack.name || "Booster Pack"),
          cardCount: Number(pack.cardCount || slotProfile && slotProfile.slots.length || PACK_SIZE),
          packImageUrl: String(pack.packImageUrl || ""),
          logoUrl: String(pack.logoUrl || ""),
          symbolUrl: String(pack.symbolUrl || ""),
          series: String(pack.series || ""),
          profileId: String(pack.profileId || pack.packProfile || pack.pullRateProfile || ""),
          slotProfile,
          source: String(pack.source || ""),
          isApiRandom: Boolean(pack.isApiRandom)
        };
      })
    : sets.map((set) => ({
        id: `${set.id}-booster`,
        setId: set.id,
        name: `${set.name} Booster`,
        cardCount: PACK_SIZE,
        packImageUrl: String(set.packImageUrl || ""),
        logoUrl: String(set.logoUrl || ""),
        symbolUrl: String(set.symbolUrl || ""),
        series: String(set.series || ""),
        profileId: String(set.profileId || ""),
        slotProfile: null,
        source: String(set.source || "")
      }));

  packs = packs.map((pack) => {
    const set = setMap.get(pack.setId);

    return {
      ...pack,
      series: pack.series || String(set && set.series || ""),
      profileId: pack.profileId || String(set && set.profileId || ""),
      logoUrl: pack.logoUrl || String(set && set.logoUrl || ""),
      symbolUrl: pack.symbolUrl || String(set && set.symbolUrl || ""),
      packImageUrl: pack.packImageUrl || String(set && set.packImageUrl || "")
    };
  });

  if (!packs.some((pack) => pack.setId === "all")) {
    packs.unshift({
      id: "all-sets-booster",
      setId: "all",
      name: "All Sets Booster",
      cardCount: PACK_SIZE
    });
  }

  return {
    sets,
    packs,
    cards: normalizedCards
  };
}

function normalizeCustomSlotProfile(rawProfile, fallbackLabel) {
  const rawSlots = Array.isArray(rawProfile)
    ? rawProfile
    : rawProfile && Array.isArray(rawProfile.slots)
      ? rawProfile.slots
      : [];

  if (rawSlots.length === 0) {
    return null;
  }

  const slots = rawSlots.map((slot, index) => {
    const label = String(slot.label || `Slot ${index + 1}`);

    if (slot.rarity) {
      return {
        label,
        rarity: normalizeRarity(slot.rarity)
      };
    }

    const weights = Array.isArray(slot.weights)
      ? slot.weights.map((row) => ({
          rarity: normalizeRarity(row.rarity),
          chance: Number(row.chance || 0)
        })).filter((row) => row.rarity && row.chance > 0)
      : [];

    return {
      label,
      weights: weights.length > 0 ? weights : RARITY_TABLE
    };
  });

  return {
    label: String(rawProfile && rawProfile.label || fallbackLabel || "Custom Pack"),
    note: String(rawProfile && rawProfile.note || "Custom slot profile from data/cards.json"),
    slots
  };
}

function normalizeCards(rawCards) {
  const usedIds = new Set();

  return rawCards.map((card, index) => {
    const setId = String(card.setId || card.set || "local-unknown");
    const rarity = normalizeRarity(card.rarity);
    const type = normalizeType(card.type || card.types && card.types[0] || "Colorless");
    let id = String(card.id || `${setId}-${index + 1}`);

    if (usedIds.has(id)) {
      id = `${id}-${index + 1}`;
    }
    usedIds.add(id);

    const hp = Number(card.hp || 0);
    const imageSmallUrl = String(card.imageSmallUrl || card.smallImageUrl || card.images && card.images.small || card.imageUrl || "");
    const imageLargeUrl = String(card.imageLargeUrl || card.largeImageUrl || card.images && card.images.large || imageSmallUrl);

    return {
      id,
      name: String(card.name || `Mystery Card ${index + 1}`),
      setId,
      setName: String(card.setName || setId),
      setSeries: String(card.setSeries || ""),
      setReleaseDate: String(card.setReleaseDate || ""),
      setTotal: Number(card.setTotal || 0),
      setLogoUrl: String(card.setLogoUrl || ""),
      setSymbolUrl: String(card.setSymbolUrl || ""),
      number: String(card.number || index + 1),
      type,
      stage: String(card.stage || "Basic"),
      hp,
      rarity,
      imageUrl: imageSmallUrl,
      imageSmallUrl,
      imageLargeUrl,
      imageLocale: String(card.imageLocale || ""),
      language: String(card.language || ""),
      basePrice: card.basePrice !== null && card.basePrice !== undefined && Number.isFinite(Number(card.basePrice))
        ? Number(card.basePrice)
        : null,
      fakePrice: getCardPriceValue(card, id, rarity),
      attacks: normalizeAttacks(card.attacks, type, hp),
      weakness: card.weakness ? normalizeType(card.weakness) : "",
      resistance: card.resistance ? normalizeType(card.resistance) : "",
      retreatCost: Number(card.retreatCost || 0),
      flavorText: String(card.flavorText || ""),
      owned: false,
      duplicateCount: 0
    };
  });
}

function getCardPriceValue(card, id, rarity) {
  if (card.fakePrice !== null && card.fakePrice !== undefined && Number.isFinite(Number(card.fakePrice))) {
    return Number(Number(card.fakePrice).toFixed(2));
  }

  if (card.basePrice !== null && card.basePrice !== undefined && Number.isFinite(Number(card.basePrice))) {
    return Number(Number(card.basePrice).toFixed(2));
  }

  return makeStableFakePrice(id, rarity);
}

function extractApiBasePrice(apiCard) {
  const tcgPrices = apiCard.tcgplayer && apiCard.tcgplayer.prices ? Object.values(apiCard.tcgplayer.prices) : [];
  const tcgValue = tcgPrices
    .flatMap((price) => [price && price.market, price && price.mid, price && price.low])
    .find((value) => Number.isFinite(Number(value)));
  const cardmarketPrices = apiCard.cardmarket && apiCard.cardmarket.prices
    ? apiCard.cardmarket.prices
    : null;
  const cardmarketValue = cardmarketPrices
    ? cardmarketPrices.averageSellPrice || cardmarketPrices.trendPrice || cardmarketPrices.avg30 || cardmarketPrices.avg7 || cardmarketPrices.lowPrice
    : null;
  const value = Number.isFinite(Number(tcgValue)) ? Number(tcgValue) : Number(cardmarketValue);

  return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
}

function normalizeAttacks(attacks, type, hp) {
  if (Array.isArray(attacks) && attacks.length > 0) {
    return attacks.slice(0, 2).map((attack) => ({
      cost: Array.isArray(attack.cost) && attack.cost.length > 0
        ? attack.cost.map(normalizeType)
        : [type],
      name: String(attack.name || "Attack"),
      damage: String(attack.damage || ""),
      text: String(attack.text || "")
    }));
  }

  if (hp <= 0) {
    return [
      {
        cost: ["Colorless"],
        name: "Support Play",
        damage: "",
        text: "A sample trainer-style card effect."
      }
    ];
  }

  return [
    {
      cost: [type],
      name: "Quick Strike",
      damage: "20",
      text: "A clean starter attack."
    },
    {
      cost: [type, "Colorless"],
      name: "Pack Burst",
      damage: String(Math.max(40, Math.round(hp / 2 / 10) * 10)),
      text: "A stronger sample attack for local play."
    }
  ];
}

function normalizeRarity(rarity) {
  const value = String(rarity || "Common").toLowerCase();
  const exactRarity = RARITY_BY_LOWERCASE[value];

  if (exactRarity) return exactRarity;
  if (value.includes("mythic")) return "Special Illustration Rare";
  if (value.includes("special illustration")) return "Special Illustration Rare";
  if (value.includes("illustration")) return "Illustration Rare";
  if (value.includes("mega hyper")) return "Mega Hyper Rare";
  if (value.includes("hyper")) return "Hyper Rare";
  if (value.includes("secret")) return "Rare Secret";
  if (value.includes("rainbow")) return "Rare Rainbow";
  if (value.includes("double")) return "Double Rare";
  if (value.includes("ace spec")) return "ACE SPEC Rare";
  if (value.includes("ultra")) return "Ultra Rare";
  if (value === "holo" || value.includes("rare holo") || value.includes("holo rare")) return "Rare Holo";
  if (value.includes("radiant")) return "Radiant Rare";
  if (value.includes("shiny")) return "Shiny Rare";
  if (value.includes("uncommon")) return "Uncommon";
  if (value.includes("common")) return "Common";
  if (value.includes("promo")) return "Promo";
  if (value.includes("rare")) return "Rare";

  return "Common";
}

function getRarityTier(rarity) {
  const value = String(rarity || "Common").toLowerCase();

  if (value.includes("special illustration")
    || value.includes("hyper")
    || value.includes("secret")
    || value.includes("rainbow")
    || value.includes("ace spec")
    || value.includes("rare ace")
    || value.includes("shiny ultra")
    || value.includes("mega_attack")) {
    return "special";
  }

  if (value.includes("illustration")
    || value.includes("ultra")
    || value.includes("double")
    || value.includes("holo v")
    || value.includes("holo ex")
    || value.includes("holo gx")
    || value.includes("lv.x")
    || value.includes("holo star")
    || value.includes("shiny")
    || value.includes("radiant")
    || value.includes("amazing")
    || value.includes("break")
    || value.includes("prime")
    || value.includes("prism")
    || value.includes("legend")
    || value.includes("black white")) {
    return "ultra";
  }

  if (value.includes("holo") || value.includes("shining")) {
    return "holo";
  }

  if (value === "rare" || value.includes("promo") || value.includes("classic collection")) {
    return "rare";
  }

  if (value.includes("uncommon")) {
    return "uncommon";
  }

  return "common";
}

function normalizeType(type) {
  const value = String(type || "Colorless").toLowerCase();

  if (value.includes("fire")) return "Fire";
  if (value.includes("water")) return "Water";
  if (value.includes("grass")) return "Grass";
  if (value.includes("lightning") || value.includes("electric")) return "Electric";
  if (value.includes("psychic")) return "Psychic";
  if (value.includes("fighting")) return "Fighting";
  if (value.includes("dark")) return "Dark";
  if (value.includes("metal") || value.includes("steel")) return "Metal";
  if (value.includes("dragon")) return "Dragon";

  return "Colorless";
}

function makeStableFakePrice(id, rarity) {
  const range = PRICE_RANGES[getRarityTier(rarity)] || PRICE_RANGES.common;
  const [min, max] = range;
  let hash = 0;

  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 100000;
  }

  const ratio = hash / 100000;
  return Number((min + (max - min) * ratio).toFixed(2));
}

function renderSelectors() {
  renderSeriesSelector();
  renderOddsModeSelect();

  const filteredSets = getFilteredSets();
  const activeSetIsVisible = filteredSets.some((set) => set.id === state.activeSetId);

  if (!activeSetIsVisible) {
    state.activeSetId = filteredSets[0] ? filteredSets[0].id : "all";
  }

  dom.setSelect.innerHTML = filteredSets.map((set) => (
    `<option value="${escapeHtml(set.id)}"${set.id === state.activeSetId ? " selected" : ""}>${escapeHtml(set.name)} (${set.totalCards})</option>`
  )).join("");

  const packsForSet = getFilteredPacksForSet(state.activeSetId);

  if (!packsForSet.some((pack) => pack.id === state.activePackId)) {
    state.activePackId = packsForSet[0] ? packsForSet[0].id : state.packs[0].id;
  }

  dom.packSelect.innerHTML = packsForSet.map((pack) => (
    `<option value="${escapeHtml(pack.id)}"${pack.id === state.activePackId ? " selected" : ""}>${escapeHtml(pack.name)}</option>`
  )).join("");

  renderPackShelf();
}

function renderOddsModeSelect() {
  if (!canUseOddsMode(state.oddsMode)) {
    state.oddsMode = "realistic";
    saveOddsMode();
  }

  const optionsHtml = Object.entries(ODDS_MODES).map(([id, mode]) => {
    const locked = mode.premium && !state.isPremium;
    const label = locked
      ? `${mode.label} - Premium Locked`
      : `${mode.label} - ${mode.description}`;

    return `<option value="${escapeHtml(id)}"${id === state.oddsMode ? " selected" : ""}${locked ? " disabled" : ""}>${escapeHtml(label)}</option>`;
  }).join("");

  if (dom.oddsModeSelect) {
    dom.oddsModeSelect.innerHTML = optionsHtml;
  }

  if (dom.premiumOddsSelect) {
    dom.premiumOddsSelect.innerHTML = optionsHtml;
  }
}

function renderSeriesSelector() {
  const seriesList = ["all", ...new Set(state.sets
    .filter((set) => set.id !== "all")
    .map((set) => set.series || "Other")
  )];

  if (!seriesList.includes(state.seriesFilter)) {
    state.seriesFilter = "all";
  }

  dom.seriesSelect.innerHTML = seriesList.map((series) => (
    `<option value="${escapeHtml(series)}"${series === state.seriesFilter ? " selected" : ""}>${series === "all" ? "All Series" : escapeHtml(series)}</option>`
  )).join("");
}

function getFilteredSets() {
  const query = state.packSearch.trim().toLowerCase();
  const setIdsWithMatchingPacks = new Set(getFilteredPacks(false).map((pack) => pack.setId));

  return state.sets.filter((set) => {
    const matchesSeries = state.seriesFilter === "all" || set.id === "all" || set.series === state.seriesFilter;
    const matchesSearch = !query
      || set.id === "all"
      || set.name.toLowerCase().includes(query)
      || setIdsWithMatchingPacks.has(set.id);

    return matchesSeries && matchesSearch;
  });
}

function getPacksForSet(setId) {
  const matching = state.packs.filter((pack) => pack.setId === setId);
  return matching.length > 0 ? matching : state.packs;
}

function getFilteredPacks(includeSetScope = true) {
  const query = state.packSearch.trim().toLowerCase();

  return state.packs.filter((pack) => {
    const set = state.sets.find((item) => item.id === pack.setId);
    const setName = set ? set.name : "";
    const series = pack.series || set && set.series || "";
    const matchesSeries = state.seriesFilter === "all" || pack.setId === "all" || series === state.seriesFilter;
    const matchesQuery = !query
      || pack.name.toLowerCase().includes(query)
      || setName.toLowerCase().includes(query)
      || series.toLowerCase().includes(query);
    const matchesActiveSet = !includeSetScope
      || state.activeSetId === "all"
      || pack.setId === state.activeSetId
      || pack.setId === "all";

    return matchesSeries && matchesQuery && matchesActiveSet;
  });
}

function getFilteredPacksForSet(setId) {
  const packs = getFilteredPacks(true);
  const matching = packs.filter((pack) => pack.setId === setId);

  if (setId === "all") {
    return packs.filter((pack) => pack.setId === "all").length > 0
      ? packs.filter((pack) => pack.setId === "all")
      : packs;
  }

  return matching.length > 0 ? matching : packs;
}

function getShelfPacks() {
  // All Sets에서는 실제 세트별 부스터를 진열해서 팩을 고르는 느낌을 먼저 보여줍니다.
  if (state.activeSetId === "all") {
    const setPacks = getFilteredPacks(false).filter((pack) => pack.setId !== "all");
    const visiblePacks = setPacks.length > 0 ? setPacks : getFilteredPacks(false);
    return visiblePacks.slice(0, PACK_SHELF_LIMIT);
  }

  return getFilteredPacksForSet(state.activeSetId).slice(0, PACK_SHELF_LIMIT);
}

function renderPackShelf() {
  if (!dom.packShelf || !dom.packShelfStatus) {
    return;
  }

  const shelfPacks = getShelfPacks();
  const activeSetName = getSetName(state.activeSetId);
  const searchLabel = state.packSearch ? ` · "${state.packSearch}"` : "";

  dom.packShelfStatus.textContent = state.activeSetId === "all"
    ? `${shelfPacks.length}개 팩 표시 중${searchLabel}`
    : `${activeSetName} 팩 ${shelfPacks.length}개${searchLabel}`;

  dom.packShelf.innerHTML = shelfPacks.map(createShelfPackHtml).join("");

  dom.packShelf.querySelectorAll(".pack-shelf-card").forEach((button) => {
    button.addEventListener("click", () => {
      selectPackFromShelf(button.dataset.packId);
    });
    button.addEventListener("mouseenter", () => {
      const pack = state.packs.find((item) => item.id === button.dataset.packId);
      schedulePackImagePreload(pack, { loadMissing: true });
    });
    button.addEventListener("focus", () => {
      const pack = state.packs.find((item) => item.id === button.dataset.packId);
      schedulePackImagePreload(pack, { loadMissing: true });
    });
  });
}

function createShelfPackHtml(pack) {
  const set = state.sets.find((item) => item.id === pack.setId);
  const setName = set ? set.name : getSetName(pack.setId);
  const cardTotal = set ? Number(set.totalCards || 0) : 0;
  const selectedClass = pack.id === state.activePackId ? " is-selected" : "";
  const sourceClass = pack.source === "api" ? " is-api-pack" : "";
  const imageUrl = getPackImageUrl(pack);
  const imageClass = imageUrl ? " has-pack-image" : "";
  const symbolUrl = pack.symbolUrl || set && set.symbolUrl || "";
  const logoUrl = pack.logoUrl || set && set.logoUrl || "";
  const imageHtml = imageUrl
    ? `<img class="shelf-pack-image" src="${escapeHtml(imageUrl)}" alt="" loading="lazy">`
    : "";
  const logoHtml = logoUrl
    ? `<img class="shelf-pack-logo" src="${escapeHtml(logoUrl)}" alt="" loading="lazy">`
    : "";
  const symbolHtml = symbolUrl
    ? `<img class="shelf-pack-symbol" src="${escapeHtml(symbolUrl)}" alt="" loading="lazy">`
    : "";
  const profile = getPackProfile(pack);

  return `
    <button class="pack-shelf-card${selectedClass}${sourceClass}${imageClass}" type="button" data-pack-id="${escapeHtml(pack.id)}" aria-label="${escapeHtml(pack.name)} 선택">
      <span class="shelf-pack-crimp"></span>
      <span class="shelf-pack-art">
        ${imageHtml}
        <span class="shelf-pack-orb"></span>
        ${symbolHtml}
        ${logoHtml}
        <span class="shelf-pack-name">${escapeHtml(pack.name)}</span>
        <span class="shelf-pack-set">${escapeHtml(setName)}</span>
        <span class="shelf-pack-count">${escapeHtml(profile.label)} · ${cardTotal > 0 ? `${cardTotal} cards` : "runtime load"}</span>
      </span>
      <span class="shelf-pack-crimp bottom"></span>
    </button>
  `;
}

function selectPackFromShelf(packId) {
  const pack = state.packs.find((item) => item.id === packId);

  if (!pack) {
    return;
  }

  playUiSound("select");
  state.activePackId = pack.id;
  state.activeSetId = pack.setId || "all";
  renderSelectors();
  updateStats();
  renderCollection();
  scheduleActivePackImagePreload({ loadMissing: true });
  refreshOwnerAdminStatus();
  dom.stageStatus.textContent = `${pack.name} 선택됨 · ${getPackProfile(pack).label} 슬롯`;
}

function handleSetChange() {
  playUiSound("select");
  state.activeSetId = dom.setSelect.value;
  const firstPack = getFilteredPacksForSet(state.activeSetId)[0];
  state.activePackId = firstPack ? firstPack.id : state.activePackId;
  renderSelectors();
  updateStats();
  renderCollection();
  scheduleActivePackImagePreload({ loadMissing: true });
  refreshOwnerAdminStatus();
  dom.stageStatus.textContent = `${getSetName(state.activeSetId)} 선택됨`;
}

function handlePackChange() {
  playUiSound("select");
  state.activePackId = dom.packSelect.value;
  const pack = getActivePack();
  renderPackShelf();
  scheduleActivePackImagePreload({ loadMissing: true });
  refreshOwnerAdminStatus();
  dom.stageStatus.textContent = `${pack.name} 선택됨 · ${getPackProfile(pack).label} 슬롯`;
}

function handleSeriesChange() {
  playUiSound("select");
  state.seriesFilter = dom.seriesSelect.value;
  state.activeSetId = "all";
  renderSelectors();
  updateStats();
  renderCollection();
  scheduleActivePackImagePreload({ loadMissing: false });
  refreshOwnerAdminStatus();
  dom.stageStatus.textContent = state.seriesFilter === "all"
    ? "전체 시리즈를 표시합니다."
    : `${state.seriesFilter} 시리즈를 표시합니다.`;
}

function handlePackSearch() {
  state.packSearch = dom.packSearchInput.value;
  renderSelectors();
  dom.stageStatus.textContent = state.packSearch
    ? `"${state.packSearch}" 검색 결과를 표시합니다.`
    : "팩 검색을 초기화했습니다.";
}

function handleImageLoadError(event) {
  const target = event.target;

  if (target instanceof HTMLImageElement && target.closest(".app-shell, .rarity-overlay, .owner-admin-panel")) {
    target.remove();
  }
}

function handleOddsModeChange(event) {
  const sourceSelect = event && event.currentTarget ? event.currentTarget : dom.oddsModeSelect;
  const nextMode = sourceSelect.value;

  if (!canUseOddsMode(nextMode)) {
    state.oddsMode = "realistic";
    saveOddsMode();
    renderOddsModeSelect();
    setStageStatus("God Pack 모드는 프리미엄 인증 후 사용할 수 있습니다.");
    return;
  }

  state.oddsMode = ODDS_MODES[nextMode] ? nextMode : "realistic";
  saveOddsMode();
  renderOddsModeSelect();
  renderSelectors();
  dom.stageStatus.textContent = `${ODDS_MODES[state.oddsMode].label} 확률 모드가 적용되었습니다.`;
}

function handleCollectionSearch() {
  state.collectionSearch = dom.collectionSearchInput.value;
  renderCollection();
}

function handleCollectionFilterChange() {
  state.collectionFilter = dom.collectionFilterSelect.value;
  renderCollection();
}

function handleCollectionSortChange() {
  state.collectionSort = dom.collectionSortSelect.value;
  renderCollection();
}

async function handleLocalJsonFile(event) {
  const file = event.target.files && event.target.files[0];

  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    applyCatalog(parsed, `파일 선택: ${file.name}`);
    dom.stageStatus.textContent = "선택한 JSON DB를 불러왔습니다.";
  } catch (error) {
    console.error(error);
    dom.stageStatus.textContent = "JSON 파일을 읽지 못했습니다. data/cards.json 구조를 확인해 주세요.";
  } finally {
    event.target.value = "";
  }
}

function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE_KEY) || "";
}

function saveApiKeyFromInput() {
  const key = dom.apiKeyInput.value.trim();

  if (!key) {
    clearApiKey();
    return;
  }

  localStorage.setItem(API_KEY_STORAGE_KEY, key);
  dom.apiKeyInput.value = key;
  dom.stageStatus.textContent = "API 키를 이 브라우저에 저장했습니다.";
}

function clearApiKey() {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
  dom.apiKeyInput.value = "";
  dom.stageStatus.textContent = "API 키 저장을 해제했습니다.";
}

async function loadApiCatalogFromButton() {
  setStageStatus("공식 API 세트 목록을 불러오는 중입니다.");

  try {
    const cachedCatalog = await loadIndexedDbCatalog();

    if (isCompleteIndexedDbCatalog(cachedCatalog)) {
      applyCatalog(cachedCatalog, "IndexedDB Pokemon TCG cache");
      setStageStatus("IndexedDB에 저장된 카드 캐시를 불러왔습니다.");
      return;
    }

    const setCatalog = await fetchApiSetCatalog();
    applyCatalog(setCatalog, "Pokemon TCG API set catalog");

    if (cachedCatalog && cachedCatalog.cards.length > 0) {
      mergeCardsIntoCatalog(cachedCatalog.cards);
      updateStats();
      renderCollection();
    }

    setStageStatus("공식 세트/팩 목록을 불러왔습니다. 팩을 열면 해당 세트 카드를 IndexedDB에 저장합니다.");

    syncIndexedDbApiCacheIfNeeded().catch((error) => {
      console.warn("백그라운드 전체 카드 캐시 동기화 실패. 세트별 로드는 계속 사용할 수 있습니다.", error);
    });
  } catch (error) {
    console.error(error);
    const indexedDbCatalog = await loadIndexedDbCatalog();

    if (isCompleteIndexedDbCatalog(indexedDbCatalog)) {
      applyCatalog(indexedDbCatalog, "IndexedDB Pokemon TCG cache");
      setStageStatus("API 동기화는 실패했지만 IndexedDB 카드 캐시를 불러왔습니다.");
      return;
    }

    setStageStatus("API 세트 목록을 불러오지 못했습니다. 잠시 후 다시 Load API를 눌러주세요.");
  }
}

async function forceSyncApiDataFromAdmin() {
  if (!state.isAdminMode) {
    return;
  }

  const button = dom.forceApiSyncBtn;
  const originalText = button ? button.textContent : "";

  try {
    if (button) {
      button.disabled = true;
      button.textContent = "데이터 동기화 중...";
    }

    if (dom.forceApiSyncStatus) {
      dom.forceApiSyncStatus.textContent = "pokemontcg.io API를 강제 호출하는 중입니다.";
    }

    setStageStatus("관리자 강제 동기화 중... 기존 API 락을 무시합니다.");
    state.apiSyncInFlight = null;

    const catalog = await fetchIndexedDbApiSnapshot();
    const syncedAt = Date.now();
    const partial = Boolean(catalog.meta && catalog.meta.partial);
    const failedPages = Array.isArray(catalog.meta && catalog.meta.failedPages) ? catalog.meta.failedPages : [];
    const cards = await saveCardsToIndexedDb(catalog.cards, {
      lastSync: partial ? 0 : syncedAt,
      syncedAt: new Date(syncedAt).toISOString(),
      source: "pokemon-tcg-api-admin-force",
      partial,
      failedPages
    });
    const syncedCatalog = buildCatalogFromCachedCards(cards, {
      lastSync: partial ? 0 : syncedAt,
      syncedAt: new Date(syncedAt).toISOString(),
      partial,
      failedPages
    });

    applyCatalog(syncedCatalog, "IndexedDB Pokemon TCG cache");
    setStageStatus(partial
      ? "부분 동기화 완료. 실패한 페이지는 다음 동기화 때 다시 시도합니다."
      : "동기화 완료! IndexedDB가 최신화되었습니다.");

    if (dom.forceApiSyncStatus) {
      dom.forceApiSyncStatus.textContent = partial
        ? `부분 동기화 완료 · ${cards.length}장 저장 · 실패 ${failedPages.length}페이지`
        : `동기화 완료 · ${cards.length}장 저장 · ${new Date(syncedAt).toLocaleString()}`;
    }

    await refreshOwnerAdminStatus();
    window.alert(partial
      ? "부분 동기화 완료. 받은 데이터는 IndexedDB에 저장했고 실패한 페이지는 다음 동기화 때 다시 시도합니다."
      : "동기화 완료! IndexedDB가 최신화되었습니다.");
  } catch (error) {
    console.error(error);

    if (error.partialCatalog && error.partialCatalog.cards && error.partialCatalog.cards.length > 0) {
      const syncedAt = Date.now();
      const failedPages = Array.isArray(error.partialCatalog.meta && error.partialCatalog.meta.failedPages)
        ? error.partialCatalog.meta.failedPages
        : [];
      const cards = await saveCardsToIndexedDb(error.partialCatalog.cards, {
        lastSync: 0,
        syncedAt: new Date(syncedAt).toISOString(),
        source: "pokemon-tcg-api-admin-force-partial",
        partial: true,
        failedPages
      });
      applyCatalog(buildCatalogFromCachedCards(cards, {
        lastSync: 0,
        syncedAt: new Date(syncedAt).toISOString(),
        partial: true,
        failedPages
      }), "IndexedDB Pokemon TCG cache");

      if (dom.forceApiSyncStatus) {
        dom.forceApiSyncStatus.textContent = `부분 동기화 완료 · ${cards.length}장 저장 · 네트워크 재시도 필요`;
      }

      setStageStatus("부분 동기화 완료. 받은 데이터는 IndexedDB에 저장했습니다.");
      await refreshOwnerAdminStatus();
      window.alert("부분 동기화 완료. 받은 데이터는 IndexedDB에 저장했습니다.");
      return;
    }

    const detail = error && error.message ? error.message : "알 수 없는 오류";

    if (dom.forceApiSyncStatus) {
      dom.forceApiSyncStatus.textContent = `동기화 실패 · ${detail}`;
    }

    setStageStatus(`관리자 강제 동기화 실패: ${detail}`);
    window.alert(`동기화 실패. API 키, 네트워크, 요청 제한을 확인하세요.\n${detail}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText || "시세 및 카드 데이터 강제 동기화";
    }
  }
}

async function forceSyncActiveSetFromAdmin() {
  if (!state.isAdminMode) {
    return;
  }

  const targetSet = getAdminTargetSet();
  const button = dom.forceActiveSetSyncBtn;
  const originalText = button ? button.textContent : "";

  if (!targetSet || targetSet.id === "all") {
    window.alert("먼저 동기화할 공식 세트를 선택해 주세요.");
    return;
  }

  if (targetSet.source && targetSet.source !== "api") {
    window.alert("로컬 샘플 세트는 공식 API 동기화 대상이 아닙니다. Pokemon TCG API 세트를 선택해 주세요.");
    return;
  }

  try {
    if (button) {
      button.disabled = true;
      button.textContent = "선택 세트 동기화 중...";
    }

    if (dom.forceApiSyncStatus) {
      dom.forceApiSyncStatus.textContent = `${targetSet.name} 세트 데이터를 불러오는 중입니다.`;
    }

    setStageStatus(`${targetSet.name} 세트만 강제 동기화 중입니다.`);

    const fetchedCards = await fetchApiCardsForSet({
      ...targetSet,
      setId: targetSet.id,
      totalCards: targetSet.totalCards || targetSet.listedTotal || 0,
      logoUrl: targetSet.logoUrl || "",
      symbolUrl: targetSet.symbolUrl || ""
    });

    if (fetchedCards.length === 0) {
      throw new Error("API에서 카드 데이터를 받지 못했습니다.");
    }

    const syncedAt = Date.now();
    await saveSetsToIndexedDb([targetSet], {
      lastSync: syncedAt,
      syncedAt: new Date(syncedAt).toISOString()
    });
    const savedCards = await putCardsIntoIndexedDb(fetchedCards);
    upsertCardsIntoCatalog(savedCards);
    const totalCardCount = await countIndexedDbRecordsByType("card").catch(() => state.cards.length);
    await saveIndexedDbCardMeta({
      lastSync: syncedAt,
      syncedAt: new Date(syncedAt).toISOString(),
      cardCount: totalCardCount,
      source: "pokemon-tcg-api-admin-set",
      partial: false,
      failedPages: []
    });

    state.apiLoadedSetIds.add(targetSet.id);
    renderSelectors();
    updateStats();
    renderCollection();
    await refreshOwnerAdminStatus();
    setStageStatus(`${targetSet.name} 동기화 완료! IndexedDB가 최신화되었습니다.`);

    if (dom.forceApiSyncStatus) {
      dom.forceApiSyncStatus.textContent = `${targetSet.name} 동기화 완료 · ${savedCards.length}장 저장`;
    }

    window.alert("동기화 완료! IndexedDB가 최신화되었습니다.");
  } catch (error) {
    console.error(error);
    const detail = error && error.message ? error.message : "알 수 없는 오류";

    if (dom.forceApiSyncStatus) {
      dom.forceApiSyncStatus.textContent = `선택 세트 동기화 실패 · ${detail}`;
    }

    setStageStatus(`선택 세트 동기화 실패: ${detail}`);
    window.alert(`선택 세트 동기화 실패\n${detail}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText || "현재 선택 세트만 동기화";
    }
  }
}

async function openBoosterPack() {
  return openPack();
}

async function openPack() {
  const pack = getActivePack();

  if (!pack) {
    setStageStatus("선택할 팩이 없습니다.");
    return;
  }

  cancelManualSeries();
  resetRevealFlow();
  setOpeningControlsDisabled(true);

  try {
    hideCollection();
    state.flippedCount = 0;
    dom.packResultPanel.hidden = true;
    dom.stageTitle.textContent = pack.name;
    setStageStatus("팩 카드풀을 준비하는 중입니다.");

    const packCards = await ensureCardsForPack(pack);

    if (packCards.length === 0) {
      setStageStatus("이 팩에서 불러올 카드가 없습니다.");
      return;
    }

    const targetCount = pack.cardCount || PACK_SIZE;

    state.currentPack = buildPackDraws(packCards, targetCount, pack);
    preloadCardImages(state.currentPack);

    const bestCard = getBestCard(state.currentPack);

    state.packBestDrawId = bestCard.drawId;
    setStageStatus(`${getPackProfile(pack).label} 슬롯 · ${ODDS_MODES[state.oddsMode].label} 모드로 준비되었습니다.`);
    renderSealedPackOpening(pack, targetCount);
  } catch (error) {
    console.error(error);
    setStageStatus("팩을 준비하지 못했습니다. API 키, 인터넷 연결, 요청 제한을 확인해 주세요.");
  } finally {
    setOpeningControlsDisabled(false);
  }
}

async function openBulkPacks(packCount) {
  const pack = getActivePack();

  if (!pack) {
    setStageStatus("선택할 팩이 없습니다.");
    return;
  }

  playUiSound("pack");
  cancelManualSeries();
  resetRevealFlow();
  setOpeningControlsDisabled(true);

  try {
    hideCollection();
    state.flippedCount = 0;
    dom.packResultPanel.hidden = true;
    dom.stageTitle.textContent = `${pack.name} x ${packCount}`;
    setStageStatus(`${packCount}팩 카드풀을 준비하는 중입니다.`);

    const packCards = await ensureCardsForPack(pack);

    if (packCards.length === 0) {
      setStageStatus("이 팩에서 불러올 카드가 없습니다.");
      return;
    }

    const targetCount = pack.cardCount || PACK_SIZE;
    const allDraws = [];

    for (let packIndex = 1; packIndex <= packCount; packIndex += 1) {
      const packDraws = buildPackDraws(packCards, targetCount, pack).map((card, cardIndex) => ({
        ...card,
        packNumber: packIndex,
        slotLabel: `Pack ${packIndex} · ${card.slotLabel}`,
        drawId: `bulk-${Date.now()}-${packIndex}-${cardIndex}-${Math.random().toString(16).slice(2)}`,
        revealed: true
      }));

      allDraws.push(...packDraws);
    }

    preloadCardImages(allDraws);
    allDraws.forEach(addCardToCollection);
    state.currentPack = allDraws;
    state.packBestDrawId = getBestCard(allDraws).drawId;
    updateStats();
    renderCollection();
    renderBulkPackResult(pack, packCount, allDraws);
  } catch (error) {
    console.error(error);
    setStageStatus("묶음 개봉을 준비하지 못했습니다. API 키, 인터넷 연결, 요청 제한을 확인해 주세요.");
  } finally {
    setOpeningControlsDisabled(false);
  }
}

async function openManualPackSeries(packCount) {
  const pack = getActivePack();

  if (!pack) {
    setStageStatus("선택할 팩이 없습니다.");
    return;
  }

  playUiSound("pack");
  cancelManualSeries();
  resetRevealFlow();
  setOpeningControlsDisabled(true);

  try {
    hideCollection();
    dom.packResultPanel.hidden = true;
    dom.stageTitle.textContent = `${pack.name} x ${packCount}`;
    setStageStatus(`${packCount}팩 직접 개봉을 준비하는 중입니다.`);

    const packCards = await ensureCardsForPack(pack);

    if (packCards.length === 0) {
      setStageStatus("이 팩에서 불러올 카드가 없습니다.");
      setOpeningControlsDisabled(false);
      return;
    }

    state.manualSeries = {
      pack,
      packCards,
      packCount,
      openedPacks: 0,
      allDraws: [],
      currentPackRecorded: false
    };

    prepareManualSeriesPack();
    setOpeningControlsDisabled(false);
  } catch (error) {
    console.error(error);
    state.manualSeries = null;
    setOpeningControlsDisabled(false);
    setStageStatus(`${packCount}팩 직접 개봉을 준비하지 못했습니다. API 키, 인터넷 연결, 요청 제한을 확인해 주세요.`);
  }
}

function prepareManualSeriesPack() {
  const series = state.manualSeries;

  if (!series) {
    return;
  }

  const packNumber = series.openedPacks + 1;
  const targetCount = series.pack.cardCount || PACK_SIZE;

  resetRevealFlow();
  series.currentPackRecorded = false;
  state.flippedCount = 0;
  dom.packResultPanel.hidden = true;
  dom.stageTitle.textContent = `${series.pack.name} (${packNumber}/${series.packCount})`;
  setStageStatus(`${packNumber}번째 팩 · ${getPackProfile(series.pack).label} 슬롯 · ${ODDS_MODES[state.oddsMode].label} 모드`);

  state.currentPack = buildPackDraws(series.packCards, targetCount, series.pack).map((card, index) => ({
    ...card,
    packNumber,
    slotLabel: `Pack ${packNumber} · ${card.slotLabel}`,
    drawId: `manual-${Date.now()}-${packNumber}-${index}-${Math.random().toString(16).slice(2)}`
  }));
  preloadCardImages(state.currentPack);
  state.packBestDrawId = getBestCard(state.currentPack).drawId;

  renderSealedPackOpening(series.pack, targetCount);
  setOpeningControlsDisabled(false);
}

function finishManualSeriesPack() {
  const series = state.manualSeries;

  if (!series) {
    return false;
  }

  if (!series.currentPackRecorded) {
    series.allDraws.push(...state.currentPack);
    series.openedPacks += 1;
    series.currentPackRecorded = true;
  }

  if (series.openedPacks >= series.packCount) {
    state.currentPack = series.allDraws;
    state.packBestDrawId = getBestCard(series.allDraws).drawId;
    renderBulkPackResult(series.pack, series.packCount, series.allDraws);
    state.manualSeries = null;
    setOpeningControlsDisabled(false);
    return true;
  }

  renderManualSeriesInterimResult(series);
  scheduleNextManualSeriesPack(series);
  setOpeningControlsDisabled(false);
  return true;
}

function renderManualSeriesInterimResult(series) {
  const currentBestCard = getBestCard(state.currentPack);
  const seriesBestCard = getBestCard(series.allDraws);

  dom.stageTitle.textContent = `${series.openedPacks}/${series.packCount}팩 개봉 완료`;
  setStageStatus("다음 팩이 자동으로 준비됩니다.");
  renderFinalPackGrid();

  dom.packGrid.querySelectorAll(".card-button").forEach((button, index) => {
    if (state.currentPack[index].drawId === currentBestCard.drawId) {
      button.classList.add("best-pull");
    }
  });

  renderResultPanel({
    heading: `5-Pack Run · Pack ${series.openedPacks} Complete`,
    cards: series.allDraws,
    displayCards: state.currentPack,
    bestCard: seriesBestCard,
    packCount: series.packCount,
    openedPacks: series.openedPacks,
    listHeading: `Pack ${series.openedPacks} Pulls`,
    displayBestDrawId: currentBestCard.drawId,
    actionHtml: `
      <span class="result-countdown">다음 팩 자동 준비 중</span>
    `
  });

  requestAnimationFrame(() => {
    dom.packResultPanel.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function scheduleNextManualSeriesPack(series) {
  clearAutoAdvanceTimer();
  setStageStatus("다음 팩을 자동으로 준비합니다.");

  state.autoAdvanceTimer = window.setTimeout(() => {
    state.autoAdvanceTimer = null;

    if (state.manualSeries !== series) {
      return;
    }

    prepareManualSeriesPack();
  }, MANUAL_SERIES_NEXT_PACK_DELAY_MS);
}

function cancelManualSeries() {
  if (!state.manualSeries) {
    return;
  }

  resetRevealFlow();
  state.manualSeries = null;
  setOpeningControlsDisabled(false);
}

function setOpeningControlsDisabled(disabled) {
  [
    dom.openPackBtn,
    dom.open5PacksBtn,
    dom.open10PacksBtn,
    dom.openBoxBtn
  ].forEach((button) => {
    if (button) {
      button.disabled = disabled;
    }
  });
}

function getActivePack() {
  return state.packs.find((pack) => pack.id === state.activePackId) || state.packs[0] || {
    id: "fallback-pack",
    setId: "all",
    name: "Fallback Booster",
    cardCount: PACK_SIZE
  };
}

function getCardsForPack(pack, fallbackToAll = true) {
  if (!pack || pack.setId === "all") {
    return state.cards;
  }

  const cards = state.cards.filter((card) => card.setId === pack.setId);
  return cards.length > 0 || !fallbackToAll ? cards : state.cards;
}

function scheduleActivePackImagePreload(options = {}) {
  schedulePackImagePreload(getActivePack(), options);
}

function schedulePackImagePreload(pack, options = {}) {
  if (!pack) {
    return Promise.resolve([]);
  }

  const key = `${pack.id || pack.setId || "active"}:${options.loadMissing ? "load" : "cached"}`;

  if (imagePreloadInFlight.has(key)) {
    return imagePreloadInFlight.get(key);
  }

  const preloadTask = new Promise((resolve) => {
    const run = () => {
      preloadImagesForPack(pack, options).then(resolve).catch((error) => {
        console.warn("카드 이미지 프리로드 실패", error);
        resolve([]);
      });
    };

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(run, { timeout: 700 });
    } else {
      window.setTimeout(run, 80);
    }
  }).finally(() => {
    imagePreloadInFlight.delete(key);
  });

  imagePreloadInFlight.set(key, preloadTask);
  return preloadTask;
}

async function preloadImagesForPack(pack, options = {}) {
  const cards = await getCardsForImagePreload(pack, Boolean(options.loadMissing));
  const preloadCards = getPreloadCardsForPack(pack, cards, Number(options.limit || CARD_IMAGE_PRELOAD_LIMIT));

  await preloadCardImages(preloadCards, { includeLarge: Boolean(options.includeLarge) });
  return preloadCards;
}

async function getCardsForImagePreload(pack, loadMissing) {
  let cards = getCardsForPack(pack, false);

  if (cards.length > 0 || !loadMissing || pack.isApiRandom || pack.setId === "all") {
    return cards.length > 0 ? cards : getCardsForPack(pack, true);
  }

  if (pack.source === "api") {
    const cachedCards = await loadCardsFromIndexedDbForSet(pack.setId).catch(() => []);

    if (cachedCards.length > 0) {
      mergeCardsIntoCatalog(cachedCards);
      cards = getCardsForPack(pack, false);

      if (cards.length > 0) {
        return cards;
      }
    }

    return [];
  }

  return cards.length > 0 ? cards : getCardsForPack(pack, true);
}

function getPreloadCardsForPack(pack, cards, limit) {
  const profile = getPackProfile(pack);
  const slots = buildPackSlots(Number(pack && pack.cardCount || PACK_SIZE), profile);
  const rows = isGodPackMode()
    ? GOD_PACK_RARITY_TABLE
    : slots.flatMap((slot) => slot.rarity ? [{ rarity: slot.rarity, chance: 100 }] : applyOddsModeToWeights(slot.weights || RARITY_TABLE));
  const maxCards = Math.max(1, limit);
  const topCards = [];

  cards.forEach((card) => {
    if (!getCardSmallImageUrl(card)) {
      return;
    }

    const score = getPreloadRarityScore(card, rows) + Math.log10(Number(card.fakePrice || 0) + 1) * 0.35;
    topCards.push({ card, score });
    topCards.sort((a, b) => b.score - a.score || Number(b.card.fakePrice || 0) - Number(a.card.fakePrice || 0));

    if (topCards.length > maxCards) {
      topCards.pop();
    }
  });

  return topCards.map((item) => item.card);
}

function getPreloadRarityScore(card, rows) {
  const cardTier = getRarityTier(card.rarity);

  return rows.reduce((score, row) => {
    const chance = Number(row.chance || 0);

    if (row.rarity === card.rarity) {
      return score + chance;
    }

    return getRarityTier(row.rarity) === cardTier ? score + chance * 0.45 : score;
  }, 0);
}

function preloadCardImages(cards, options = {}) {
  const urls = cards
    .flatMap((card) => {
      const smallUrl = getCardSmallImageUrl(card);
      const largeUrl = options.includeLarge ? getCardLargeImageUrl(card) : "";
      return largeUrl && largeUrl !== smallUrl ? [smallUrl, largeUrl] : [smallUrl];
    })
    .filter(Boolean);

  return Promise.all([...new Set(urls)].map(preloadImageUrl));
}

function preloadImageUrl(url) {
  if (!url || preloadedImageUrls.has(url)) {
    return Promise.resolve(url);
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.loading = "eager";
    image.onload = () => {
      preloadedImageUrls.add(url);
      preloadedImageElements.set(url, image);
      resolve(url);
    };
    image.onerror = () => resolve(url);
    image.src = url;
  });
}

function getCardSmallImageUrl(card) {
  return sanitizeImageUrl(card && (card.imageSmallUrl || card.smallImageUrl || card.imageUrl));
}

function getCardLargeImageUrl(card) {
  return sanitizeImageUrl(card && (card.imageLargeUrl || card.largeImageUrl || card.imageSmallUrl || card.imageUrl));
}

function sanitizeImageUrl(value) {
  const url = String(value || "").trim();

  if (!url) {
    return "";
  }

  if (url.startsWith("data:image/") || url.startsWith("blob:")) {
    return url;
  }

  try {
    const parsedUrl = new URL(url, window.location.href);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:"
      ? parsedUrl.href
      : "";
  } catch (error) {
    return "";
  }
}

async function getCardsFromIndexedDbForPack(pack) {
  if (!pack || pack.setId === "all" || pack.isApiRandom) {
    return loadAllCardsFromIndexedDb();
  }

  return loadCardsFromIndexedDbForSet(pack.setId);
}

function getCardsFromCatalogForPack(catalog, pack) {
  const normalizedCards = normalizeCards(Array.isArray(catalog && catalog.cards) ? catalog.cards : []);

  if (!pack || pack.setId === "all" || pack.isApiRandom) {
    return normalizedCards;
  }

  return normalizedCards.filter((card) => card.setId === pack.setId);
}

function getEmergencyFallbackCards() {
  return applyCollectionState(normalizeCards(STARTER_CATALOG.cards));
}

function isUsableApiSetCardPool(pack, cards) {
  if (!pack || pack.source !== "api" || pack.setId === "all" || pack.isApiRandom) {
    return Array.isArray(cards) && cards.length > 0;
  }

  const set = state.sets.find((item) => item.id === pack.setId);
  const expectedTotal = Number(set && set.totalCards || pack.totalCards || 0);
  const minimumUsefulCount = expectedTotal > 0
    ? Math.min(expectedTotal, 20)
    : PACK_SIZE;

  return Array.isArray(cards) && cards.length >= Math.max(PACK_SIZE, minimumUsefulCount);
}

async function ensureCardsForPack(pack) {
  if (pack.isApiRandom) {
    const wantedSource = pack.source || "api";
    const apiSets = state.sets.filter((set) => set.id !== "all" && set.source === wantedSource);
    const randomSet = pickOne(apiSets);

    if (!randomSet) {
      return state.cards;
    }

    const randomPack = {
      ...pack,
      ...(state.packs.find((item) => item.setId === randomSet.id && !item.isApiRandom) || {}),
      setId: randomSet.id,
      name: `${randomSet.name} Booster`,
      source: wantedSource,
      isApiRandom: false
    };
    state.activeSetId = randomSet.id;
    state.activePackId = randomPack.id || `api-${randomSet.id}-booster`;
    renderSelectors();
    dom.stageTitle.textContent = randomPack.name;

    return ensureCardsForPack(randomPack);
  }

  const loadedCards = getCardsForPack(pack, false);

  if (pack.source !== "api") {
    if (loadedCards.length > 0) {
      return loadedCards;
    }

    return getCardsForPack(pack, true);
  }

  if (isUsableApiSetCardPool(pack, loadedCards)) {
    return loadedCards;
  }

  setStageStatus(`${pack.name} 카드 풀을 IndexedDB 카드 캐시에서 준비하는 중입니다.`);
  const cachedCards = await loadCardsFromIndexedDbForSet(pack.setId);

  if (cachedCards.length > 0) {
    mergeCardsIntoCatalog(cachedCards);
    state.apiLoadedSetIds.add(pack.setId);
    updateStats();
    renderCollection();

    const preparedCards = getCardsForPack(pack, false);

    if (isUsableApiSetCardPool(pack, preparedCards)) {
      setStageStatus("세트별 카드 캐시로 팩을 준비했습니다.");
      return preparedCards;
    }
  }

  const indexedDbCards = await getCardsFromIndexedDbForPack(pack);

  if (indexedDbCards.length > 0) {
    mergeCardsIntoCatalog(indexedDbCards);
    state.apiLoadedSetIds.add(pack.setId);
    updateStats();
    renderCollection();

    const preparedCards = getCardsForPack(pack, false);

    if (isUsableApiSetCardPool(pack, preparedCards)) {
      setStageStatus("IndexedDB에 저장된 카드 데이터로 팩을 준비했습니다.");
      return preparedCards;
    }
  }

  try {
    const set = state.sets.find((item) => item.id === pack.setId);
    const fetchedSetCards = await fetchApiCardsForSet({
      ...pack,
      id: pack.setId,
      name: set && set.name || pack.name,
      series: set && set.series || pack.series,
      releaseDate: set && set.releaseDate || "",
      totalCards: set && set.totalCards || 0,
      logoUrl: set && set.logoUrl || pack.logoUrl,
      symbolUrl: set && set.symbolUrl || pack.symbolUrl
    });

    if (fetchedSetCards.length > 0) {
      const savedCards = await putCardsIntoIndexedDb(fetchedSetCards);
      mergeCardsIntoCatalog(savedCards);
      state.apiLoadedSetIds.add(pack.setId);
      updateStats();
      renderCollection();
      setStageStatus("선택한 세트 카드를 IndexedDB에 저장하고 팩을 준비했습니다.");

      return getCardsForPack(pack, false);
    }
  } catch (error) {
    console.warn("세트별 카드 로드 실패. 전체 IndexedDB 동기화를 시도합니다.", error);
  }

  try {
    const syncResult = await syncIndexedDbApiCacheIfNeeded();
    const syncedCards = syncResult.catalog ? getCardsFromCatalogForPack(syncResult.catalog, pack) : [];

    if (syncedCards.length > 0) {
      mergeCardsIntoCatalog(syncedCards);
      state.apiLoadedSetIds.add(pack.setId);
      updateStats();
      renderCollection();
      setStageStatus(syncResult.didFetch
        ? syncResult.partial
          ? "API가 중간에 끊겼지만 받은 카드 캐시로 팩을 준비했습니다."
          : "24시간이 지나 IndexedDB 카드 캐시를 동기화하고 팩을 준비했습니다."
        : syncResult.stale
          ? "API 업데이트는 실패했지만 기존 IndexedDB 카드 캐시로 팩을 준비했습니다."
          : "24시간 이내라 API 호출 없이 IndexedDB 카드 캐시로 팩을 준비했습니다.");

      return getCardsForPack(pack, false);
    }
  } catch (error) {
    console.warn("IndexedDB 카드 캐시 동기화 실패. 내장 샘플 카드로 대체합니다.", error);
  }

  const fallbackCards = getEmergencyFallbackCards();
  mergeCardsIntoCatalog(fallbackCards);
  setStageStatus("사용 가능한 API 캐시가 없어 내장 샘플 카드로 팩을 준비했습니다.");

  return fallbackCards;
}

function mergeCardsIntoCatalog(cards) {
  const existingIds = new Set(state.cards.map((card) => card.id));
  const normalizedCards = normalizeCards(cards).filter((card) => !existingIds.has(card.id));

  if (normalizedCards.length === 0) {
    return;
  }

  state.cards = applyCollectionState([...state.cards, ...normalizedCards]);
  normalizedCards.forEach((card) => {
    const set = state.sets.find((item) => item.id === card.setId);

    if (set) {
      const loadedCount = state.cards.filter((item) => item.setId === card.setId).length;
      set.totalCards = Math.max(Number(set.totalCards || 0), loadedCount);
    }
  });
}

function upsertCardsIntoCatalog(cards) {
  const normalizedCards = normalizeCards(cards);

  if (normalizedCards.length === 0) {
    return [];
  }

  const cardMap = new Map(state.cards.map((card) => [card.id, card]));

  normalizedCards.forEach((card) => {
    cardMap.set(card.id, {
      ...cardMap.get(card.id),
      ...card
    });
  });

  state.cards = applyCollectionState(Array.from(cardMap.values()));
  normalizedCards.forEach((card) => {
    const set = state.sets.find((item) => item.id === card.setId);

    if (set) {
      const loadedCount = state.cards.filter((item) => item.setId === card.setId).length;
      set.totalCards = Math.max(Number(set.totalCards || 0), loadedCount);
      set.source = set.source || "api";
    }
  });

  return normalizedCards;
}

function buildPackDraws(cardPool, targetCount, pack) {
  const profile = getPackProfile(pack);
  const slots = buildPackSlots(targetCount, profile);
  const godPack = isGodPackMode();

  return slots.map((slot, index) => {
    const wantedRarity = godPack ? pickWeighted(GOD_PACK_RARITY_TABLE) : pickRarityForSlot(slot);
    const card = godPack ? drawGodPackCard(cardPool, wantedRarity) : drawRandomCard(cardPool, wantedRarity);

    return {
      ...card,
      wantedRarity,
      packProfile: godPack ? "God Pack" : profile.label,
      slotLabel: godPack ? `God Pack Slot ${index + 1}` : slot.label,
      drawId: `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
      revealed: false
    };
  });
}

function drawGodPackCard(cardPool, wantedRarity) {
  const pool = Array.isArray(cardPool) && cardPool.length > 0 ? cardPool : state.cards;
  const exactPool = pool.filter((card) => card.rarity === wantedRarity);

  if (exactPool.length > 0) {
    return pickOne(exactPool);
  }

  const wantedTier = getRarityTier(wantedRarity);
  const sameTierPool = pool.filter((card) => getRarityTier(card.rarity) === wantedTier && HIGH_RARITY_TIERS.has(getRarityTier(card.rarity)));

  if (sameTierPool.length > 0) {
    return pickOne(sameTierPool);
  }

  const highHitPool = pool.filter((card) => HIGH_RARITY_TIERS.has(getRarityTier(card.rarity)));

  if (highHitPool.length > 0) {
    return pickOne(highHitPool);
  }

  return drawRandomCard(pool, wantedRarity);
}

function buildPackSlots(targetCount, profile = PACK_PROFILES.mixed) {
  if (profile && Array.isArray(profile.slots) && profile.slots.length === targetCount) {
    return profile.slots.map((slot) => ({ ...slot }));
  }

  if (targetCount !== PACK_SIZE) {
    return Array.from({ length: targetCount }, (_, index) => ({
      label: `Slot ${index + 1}`,
      weights: RARITY_TABLE
    }));
  }

  return profile.slots.map((slot) => ({ ...slot }));
}

function pickRarityForSlot(slot) {
  if (slot.rarity) {
    return slot.rarity;
  }

  return pickWeighted(applyOddsModeToWeights(slot.weights || RARITY_TABLE));
}

function applyOddsModeToWeights(rows) {
  const oddsMode = ODDS_MODES[state.oddsMode] || ODDS_MODES.realistic;

  return rows.map((row) => {
    const tier = getRarityTier(row.rarity);
    const multiplier = Number(oddsMode.multipliers[tier] || 1);

    return {
      ...row,
      chance: Math.max(0.01, Number(row.chance || 0) * multiplier)
    };
  });
}

function getPackProfile(pack) {
  if (pack && pack.slotProfile && Array.isArray(pack.slotProfile.slots) && pack.slotProfile.slots.length > 0) {
    return pack.slotProfile;
  }

  if (pack && pack.profileId && PACK_PROFILES[pack.profileId]) {
    return PACK_PROFILES[pack.profileId];
  }

  const era = getPackEra(pack);
  return PACK_PROFILES[era] || PACK_PROFILES.mixed;
}

function getPackEra(pack) {
  if (!pack || pack.setId === "all" || pack.isApiRandom) {
    return "mixed";
  }

  const set = state.sets.find((item) => item.id === pack.setId);
  const setId = String(pack.setId || set && set.id || "").toLowerCase();
  const text = [
    pack.name,
    pack.series,
    pack.setId,
    set && set.name,
    set && set.series
  ].filter(Boolean).join(" ").toLowerCase();

  if (text.includes("scarlet") || text.includes("violet")) return "scarlet-violet";
  if (text.includes("sword") || text.includes("shield")) return "sword-shield";
  if (text.includes("sun") || text.includes("moon")) return "sun-moon";
  if (text.includes("스칼렛") || text.includes("바이올렛")) return "scarlet-violet";
  if (text.includes("검과 방패") || text.includes("소드") || text.includes("실드")) return "sword-shield";
  if (text.includes("썬") || text.includes("문")) return "sun-moon";
  if (setId.startsWith("sv") || setId.startsWith("cs")) return "scarlet-violet";
  if (setId.startsWith("sm")) return "sun-moon";
  if (setId.startsWith("s")) return "sword-shield";
  if (text.includes("xy")) return "xy";
  if (text.includes("black") || text.includes("white")) return "black-white";

  const releaseYear = Number(String(set && set.releaseDate || "").slice(0, 4));

  if (releaseYear >= 2023) return "scarlet-violet";
  if (releaseYear >= 2020) return "sword-shield";
  if (releaseYear >= 2017) return "sun-moon";
  if (releaseYear >= 2014) return "xy";
  if (releaseYear >= 2011) return "black-white";
  if (releaseYear > 0) return "older";

  return "mixed";
}

function drawRandomCard(cardPool, wantedRarity) {
  // 먼저 원하는 희귀도 풀을 찾습니다.
  const exactPool = cardPool.filter((card) => card.rarity === wantedRarity);

  if (exactPool.length > 0) {
    return pickOne(exactPool);
  }

  const wantedTier = getRarityTier(wantedRarity);
  const sameTierPool = cardPool.filter((card) => getRarityTier(card.rarity) === wantedTier);

  if (sameTierPool.length > 0) {
    return pickOne(sameTierPool);
  }

  // 특정 세트에 해당 rarity/tier가 없으면 가까운 아래 tier부터 찾아 undefined를 방지합니다.
  const wantedIndex = RARITY_TIER_ORDER.indexOf(wantedTier);

  for (let i = wantedIndex - 1; i >= 0; i -= 1) {
    const fallbackPool = cardPool.filter((card) => getRarityTier(card.rarity) === RARITY_TIER_ORDER[i]);

    if (fallbackPool.length > 0) {
      return pickOne(fallbackPool);
    }
  }

  for (let i = wantedIndex + 1; i < RARITY_TIER_ORDER.length; i += 1) {
    const fallbackPool = cardPool.filter((card) => getRarityTier(card.rarity) === RARITY_TIER_ORDER[i]);

    if (fallbackPool.length > 0) {
      return pickOne(fallbackPool);
    }
  }

  return pickOne(cardPool.length > 0 ? cardPool : state.cards);
}

function pickOne(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function pickRarity() {
  return pickWeighted(applyOddsModeToWeights(RARITY_TABLE));
}

function pickWeighted(rows) {
  const totalWeight = rows.reduce((total, row) => total + Math.max(0, Number(row.chance || 0)), 0);

  if (totalWeight <= 0) {
    return "Common";
  }

  const roll = Math.random() * totalWeight;
  let total = 0;

  for (const row of rows) {
    total += Math.max(0, Number(row.chance || 0));

    if (roll <= total) {
      return row.rarity;
    }
  }

  return rows[rows.length - 1] ? rows[rows.length - 1].rarity : "Common";
}

function renderSealedPackOpening(pack, targetCount) {
  const imageUrl = getPackImageUrl(pack);
  const set = state.sets.find((item) => item.id === pack.setId);
  const logoUrl = pack.logoUrl || set && set.logoUrl || "";
  const symbolUrl = pack.symbolUrl || set && set.symbolUrl || "";
  const imageHtml = imageUrl
    ? `<img class="booster-pack-image" src="${escapeHtml(imageUrl)}" alt="" loading="lazy">`
    : "";
  const logoHtml = logoUrl
    ? `<img class="booster-pack-logo" src="${escapeHtml(logoUrl)}" alt="" loading="lazy">`
    : "";
  const symbolHtml = symbolUrl
    ? `<img class="booster-pack-symbol" src="${escapeHtml(symbolUrl)}" alt="" loading="lazy">`
    : "";
  const packImageClass = imageUrl ? " has-pack-image" : "";
  const boosterInnerHtml = `
    <span class="booster-real-pack">
      <span class="booster-crimp top"></span>
      <span class="booster-art">
        <span class="booster-orb"></span>
        ${symbolHtml}
        ${logoHtml}
        <span class="booster-title">${escapeHtml(pack.name)}</span>
        <span class="booster-subtitle">${targetCount} cards</span>
      </span>
      <span class="booster-crimp bottom"></span>
      ${imageHtml}
      <span class="booster-open-strip" aria-hidden="true">
        <span class="booster-open-notch"></span>
      </span>
    </span>
  `;

  dom.packGrid.className = "pack-grid pack-opening";
  dom.packGrid.innerHTML = `
    <button class="booster-pack-button${packImageClass}" type="button" aria-label="Open ${escapeHtml(pack.name)}">
      ${boosterInnerHtml}
    </button>
  `;

  const packButton = dom.packGrid.querySelector(".booster-pack-button");
  setStageStatus(`${targetCount}장 팩이 준비되었습니다. 팩 이미지를 클릭해서 뜯어보세요.`);
  packButton.addEventListener("click", () => {
    playUiSound("pack");
    packButton.disabled = true;
    packButton.classList.add("is-tearing");
    setStageStatus("팩 윗부분을 뜯는 중입니다.");

    window.setTimeout(() => {
      setStageStatus("카드를 클릭해 한 장씩 확인하세요.");
      renderPack();
    }, 950);
  });
}

function renderPack() {
  state.isCardTransitioning = false;
  const activeIndex = state.currentPack.findIndex((card) => !card.revealed);

  if (activeIndex === -1) {
    finishPackReveal();
    return;
  }

  const activeCard = state.currentPack[activeIndex];
  const remainingCount = Math.max(0, state.currentPack.length - activeIndex - 1);
  const lastCardClass = remainingCount === 0 ? " is-last-card" : "";

  dom.packGrid.className = `pack-grid pack-stack-mode${lastCardClass}`;
  dom.packGrid.innerHTML = `
    <div class="stack-board">
      <div class="stack-progress">
        <span>Card ${activeIndex + 1} / ${state.currentPack.length} · ${escapeHtml(activeCard.slotLabel || "Booster Slot")}</span>
        <strong>
          ${escapeHtml(activeCard.rarity)}
          <small>${remainingCount === 0 ? "Last card" : `${remainingCount} left`}</small>
        </strong>
      </div>
      <div class="stack-table${lastCardClass}">
        <div class="revealed-strip">
          ${state.currentPack.slice(0, activeIndex).map(createRevealedChipHtml).join("")}
        </div>
        <div class="active-card-wrap">
          ${createPackCardHtml(activeCard, activeIndex)}
        </div>
        ${createStackBacksHtml(remainingCount)}
      </div>
      <p class="stack-hint">${remainingCount === 0 ? "마지막 카드입니다. 뒤집으면 잠깐 멈춘 뒤 결과가 열립니다." : "카드를 뒤집으면 옆으로 밀려나며 다음 카드가 나옵니다."}</p>
    </div>
  `;

  dom.packGrid.querySelectorAll(".card-button").forEach((button) => {
    button.addEventListener("click", () => {
      revealCard(Number(button.dataset.index));
    });
  });
}

function createStackBacksHtml(remainingCount) {
  if (remainingCount <= 0) {
    return "";
  }

  const shadowCount = Math.min(4, remainingCount);
  const shadows = Array.from({ length: shadowCount }, (_, index) => (
    `<span style="--stack-index: ${index + 1}"></span>`
  )).join("");

  return `
    <div class="stack-shadow-cards" aria-hidden="true" data-remaining="${remainingCount}">
      ${shadows}
    </div>
  `;
}

function createPackCardHtml(card, index) {
  const rarityClass = toCssClass("rarity", card.rarity);
  const tierClass = toCssClass("tier", getRarityTier(card.rarity));
  const typeClass = toCssClass("type", card.type);
  const flippedClass = card.revealed ? "is-flipped" : "";
  const detailAttrs = card.revealed
    ? ` data-card-detail-id="${escapeHtml(card.id)}" data-card-detail-draw-id="${escapeHtml(card.drawId || "")}"`
    : "";

  return `
    <button class="card-button ${rarityClass} ${tierClass} ${typeClass} ${flippedClass}" type="button" data-index="${index}"${detailAttrs} aria-label="${escapeHtml(card.name)}">
      <span class="card-inner">
        <span class="card-face card-back">
          ${createCardBackDesignHtml()}
        </span>
        ${getCardSmallImageUrl(card) ? createOfficialCardFrontHtml(card) : createLocalCardFrontHtml(card)}
      </span>
    </button>
  `;
}

function createCardBackDesignHtml() {
  return `
    <span class="back-swirl back-swirl-blue"></span>
    <span class="back-swirl back-swirl-red"></span>
    <span class="back-center-ball">
      <span class="back-ball-top"></span>
      <span class="back-ball-line"></span>
      <span class="back-ball-dot"></span>
    </span>
    <span class="back-title">TCG</span>
  `;
}

function createOfficialCardFrontHtml(card) {
  const imageUrl = getCardSmallImageUrl(card);

  return `
    <span class="card-face card-front official-card-front">
      <span class="official-card-fallback ${toCssClass("type", card.type)}">
        <span class="official-fallback-name">${escapeHtml(card.name)}</span>
        <span class="official-fallback-art">${createFallbackArtHtml(card, false)}</span>
        <span class="official-fallback-meta">${escapeHtml(card.setName)} · ${escapeHtml(card.rarity)}</span>
      </span>
      <img class="official-card-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(card.name)}" loading="eager" decoding="async" fetchpriority="high">
      <span class="official-card-badge">
        <span>${escapeHtml(card.rarity)}</span>
        <strong>${formatPrice(card.fakePrice)}</strong>
      </span>
    </span>
  `;
}

function createLocalCardFrontHtml(card) {
  const hpHtml = card.hp > 0 ? `<span class="hp-number">HP ${escapeHtml(card.hp)}</span>` : `<span class="hp-number">TRAINER</span>`;
  const artHtml = createFallbackArtHtml(card, false);
  const attacksHtml = card.attacks.map(createAttackHtml).join("");
  const retreatDots = "●".repeat(Math.max(0, Math.min(4, Number(card.retreatCost || 0)))) || "-";

  return `
    <span class="card-face card-front">
      <span class="card-topline">
        <span>
          <span class="card-stage">${escapeHtml(card.stage)}</span>
          <span class="card-name">${escapeHtml(card.name)}</span>
        </span>
        <span class="hp-block">
          ${hpHtml}
          <span class="type-pill">${escapeHtml(TYPE_SYMBOLS[card.type] || "C")}</span>
        </span>
      </span>
      <span class="card-art">${artHtml}</span>
      <span class="card-meta-strip">
        <span>${escapeHtml(card.type)}</span>
        <span>${escapeHtml(card.rarity)}</span>
        <span>${formatPrice(card.fakePrice)}</span>
      </span>
      <span class="attack-list">${attacksHtml}</span>
      <span class="card-footer">
        <span class="battle-row">
          <span>Weak ${escapeHtml(card.weakness || "-")}</span>
          <span>Res ${escapeHtml(card.resistance || "-")}</span>
          <span>Ret ${retreatDots}</span>
        </span>
        <span class="set-row">
          <span>${escapeHtml(card.setName)}</span>
          <span>${escapeHtml(card.number)}</span>
        </span>
      </span>
    </span>
  `;
}

function createRevealedChipHtml(card) {
  return `
    <span class="revealed-chip ${toCssClass("rarity", card.rarity)} ${toCssClass("tier", getRarityTier(card.rarity))}">
      <span class="chip-name">${escapeHtml(card.name)}</span>
      <span class="chip-meta">${escapeHtml(card.rarity)} · ${formatPrice(card.fakePrice)}</span>
    </span>
  `;
}

function renderFinalPackGrid() {
  dom.packGrid.className = "pack-grid pack-final-grid";
  dom.packGrid.innerHTML = state.currentPack.map((card, index) => createPackCardHtml(card, index)).join("");
}

function createFallbackArtHtml(card, escapedForAttribute) {
  const initials = getInitials(card.name);
  const html = `
    <span class="art-fallback">
      <span class="art-creature">${escapeHtml(initials)}</span>
      <span class="art-caption">${escapeHtml(card.flavorText || `${card.type} sample card`)}</span>
    </span>
  `;

  return escapedForAttribute
    ? html.replace(/"/g, "&quot;").replace(/\n/g, "")
    : html;
}

function createAttackHtml(attack) {
  const cost = attack.cost.map((type) => `<span class="energy-dot type-${toPlainClass(type)}" title="${escapeHtml(type)}"></span>`).join("");

  return `
    <span class="attack-row">
      <span class="energy-cost">${cost}</span>
      <span>
        <span class="attack-name">${escapeHtml(attack.name)}</span>
        <span class="attack-text">${escapeHtml(attack.text)}</span>
      </span>
      <span class="attack-damage">${escapeHtml(attack.damage)}</span>
    </span>
  `;
}

function revealCard(index) {
  const card = state.currentPack[index];

  if (!card) {
    return;
  }

  if (state.isCardTransitioning) {
    return;
  }

  if (card.revealed) {
    if (state.flippedCount < state.currentPack.length) {
      playUiSound("select");
      advanceToNextCard(dom.packGrid.querySelector(`[data-index="${index}"]`), 220);
    }
    return;
  }

  playUiSound("flip");
  state.isCardTransitioning = true;
  card.revealed = true;
  state.flippedCount += 1;

  const cardElement = dom.packGrid.querySelector(`[data-index="${index}"]`);
  if (cardElement) {
    cardElement.classList.add("is-flipped");
    cardElement.disabled = true;
  }

  addCardToCollection(card);
  let effectDuration = 0;
  const isLastReveal = state.flippedCount === state.currentPack.length;

  try {
    effectDuration = Number(playRarityEffect(card, { finalCard: isLastReveal }) || 0);
  } catch (error) {
    console.error("고레어 연출 중 오류가 났지만 결과 화면은 계속 표시합니다.", error);
  }

  updateStats();
  renderCollection();

  if (isLastReveal) {
    dom.packGrid.classList.add("is-final-card-revealed");
    setStageStatus(effectDuration > 0
      ? "마지막 카드 히트 연출 중입니다. 결과를 곧 정리합니다."
      : "마지막 카드입니다. 잠깐 멈춘 뒤 결과가 열립니다.");
    window.setTimeout(() => {
      cardElement.classList.add("is-final-suspense");
    }, Math.max(380, effectDuration > 0 ? effectDuration - 360 : 420));
    state.autoAdvanceTimer = window.setTimeout(() => {
      state.autoAdvanceTimer = null;
      state.isCardTransitioning = false;
      finishPackReveal();
    }, Math.max(LAST_CARD_PAUSE_MS, effectDuration + 540));
  } else {
    setStageStatus("카드가 정리되면 다음 카드가 나옵니다.");
    advanceToNextCard(cardElement, Math.max(CARD_ADVANCE_DELAY_MS, effectDuration + 360));
  }
}

function advanceToNextCard(cardElement, delayMs) {
  clearAutoAdvanceTimer();
  state.isCardTransitioning = true;

  window.setTimeout(() => {
    if (cardElement) {
      cardElement.classList.add("is-dealing-away");
    }
  }, Math.max(160, Math.min(720, delayMs - 320)));

  state.autoAdvanceTimer = window.setTimeout(() => {
    state.autoAdvanceTimer = null;
    state.isCardTransitioning = false;
    renderPack();
  }, delayMs);
}

function resetRevealFlow() {
  clearAutoAdvanceTimer();
  state.isCardTransitioning = false;
}

function clearAutoAdvanceTimer() {
  if (state.autoAdvanceTimer) {
    window.clearTimeout(state.autoAdvanceTimer);
    state.autoAdvanceTimer = null;
  }
}

function finishPackReveal() {
  resetRevealFlow();

  if (finishManualSeriesPack()) {
    return;
  }

  dom.stageTitle.textContent = "팩 결과";
  setStageStatus("이번 팩의 모든 카드가 공개되었습니다.");
  renderFinalPackGrid();

  dom.packGrid.querySelectorAll(".card-button").forEach((button, index) => {
    if (state.currentPack[index].drawId === state.packBestDrawId) {
      button.classList.add("best-pull");
    }
  });

  playUiSound("result");
  renderPackResult();
}

function renderPackResult() {
  const bestCard = state.currentPack.find((card) => card.drawId === state.packBestDrawId);

  renderResultPanel({
    heading: "Pack Result",
    cards: state.currentPack,
    displayCards: state.currentPack,
    bestCard,
    packCount: 1,
    openedPacks: 1,
    listHeading: "Card List"
  });
}

function renderBulkPackResult(pack, packCount, cards) {
  const bestCard = getBestCard(cards);
  const topCards = [...cards]
    .sort((a, b) => Number(b.fakePrice || 0) - Number(a.fakePrice || 0))
    .slice(0, Math.min(12, cards.length));

  dom.stageTitle.textContent = packCount === 30 ? "박스 개봉 결과" : `${packCount}팩 개봉 결과`;
  setStageStatus(`${packCount}팩 · ${cards.length}장 개봉 완료`);
  dom.packGrid.className = "pack-grid pack-final-grid bulk-final-grid";
  dom.packGrid.innerHTML = topCards.map((card, index) => createPackCardHtml(card, index)).join("");

  dom.packGrid.querySelectorAll(".card-button").forEach((button, index) => {
    if (topCards[index].drawId === bestCard.drawId) {
      button.classList.add("best-pull");
    }
  });

  playUiSound("result");
  renderResultPanel({
    heading: packCount === 30 ? "Box Result Summary" : "Multi-Pack Result Summary",
    cards,
    displayCards: cards,
    bestCard,
    packCount,
    openedPacks: packCount,
    listHeading: "All Pulls",
    fallbackSlotLabel: pack.name
  });
}

function renderResultPanel(options) {
  const cards = options.cards || [];
  const displayCards = options.displayCards || cards;
  const bestCard = options.bestCard || getBestCard(cards);
  const bestDrawId = options.displayBestDrawId || (bestCard ? bestCard.drawId : "");

  if (!bestCard) {
    dom.resultHeading.textContent = options.heading || "Pack Result";
    dom.bestCardSummary.className = "best-card-summary";
    dom.bestCardSummary.innerHTML = "<span>No cards to show.</span>";
    dom.resultList.className = "result-list";
    dom.resultList.innerHTML = "";
    dom.packResultPanel.hidden = false;
    return;
  }

  dom.resultHeading.textContent = options.heading;
  dom.bestCardSummary.className = "best-card-summary result-dashboard";
  dom.bestCardSummary.innerHTML = createResultDashboardHtml({
    cards,
    bestCard,
    packCount: options.packCount,
    openedPacks: options.openedPacks,
    actionHtml: options.actionHtml
  });

  dom.resultList.className = "result-list result-breakdown";
  dom.resultList.innerHTML = `
    ${createHitRecapHtml(cards)}
    <section class="result-list-block">
      <div class="result-list-heading">${escapeHtml(options.listHeading || "Cards")}</div>
      <div class="result-card-grid">
        ${createMiniCardListHtml(displayCards, bestDrawId, options.fallbackSlotLabel)}
      </div>
    </section>
  `;
  dom.packResultPanel.hidden = false;
}

function createResultDashboardHtml({ cards, bestCard, packCount, openedPacks, actionHtml }) {
  const totalValue = getTotalValue(cards);
  const rareOrBetter = getRareOrBetter(cards);
  const highHits = getHighHits(cards);
  const progressText = packCount > 1 ? `${openedPacks} / ${packCount} Packs` : "1 Pack";
  const profileText = cards[0] && cards[0].packProfile ? cards[0].packProfile : "Mixed / Fallback";
  const oddsText = ODDS_MODES[state.oddsMode] ? ODDS_MODES[state.oddsMode].label : "Realistic";

  return `
    <section class="result-hero ${toCssClass("tier", getRarityTier(bestCard.rarity))}">
      <div class="result-best-art">
        ${createResultImageHtml(bestCard, "result-best-image")}
      </div>
      <div class="result-best-copy">
        <span class="result-label">Best Pull</span>
        <strong>${escapeHtml(bestCard.name)}</strong>
        <span>${escapeHtml(bestCard.rarity)} · ${escapeHtml(bestCard.setName)}</span>
        <b>${formatPrice(bestCard.fakePrice)}</b>
      </div>
    </section>
    <section class="result-metrics" aria-label="Pack summary">
      <span class="result-stat"><small>Progress</small><strong>${escapeHtml(progressText)}</strong></span>
      <span class="result-stat"><small>Cards</small><strong>${cards.length}</strong></span>
      <span class="result-stat"><small>Total Value</small><strong>${formatPrice(totalValue)}</strong></span>
      <span class="result-stat"><small>Rare+</small><strong>${rareOrBetter.length}</strong></span>
      <span class="result-stat"><small>High Hits</small><strong>${highHits.length}</strong></span>
    </section>
    <p class="result-mode-note">Pack profile: ${escapeHtml(profileText)} · Odds mode: ${escapeHtml(oddsText)}</p>
    ${actionHtml ? `<section class="result-actions">${actionHtml}</section>` : ""}
  `;
}

function createHitRecapHtml(cards) {
  const hits = getRareOrBetter(cards)
    .sort((a, b) => Number(b.fakePrice || 0) - Number(a.fakePrice || 0))
    .slice(0, 8);

  if (hits.length === 0) {
    return `
      <section class="hit-recap">
        <div class="result-list-heading">Hit Recap</div>
        <p class="result-empty-note">No rare-or-better pulls yet.</p>
      </section>
    `;
  }

  return `
    <section class="hit-recap">
      <div class="result-list-heading">Hit Recap</div>
      <div class="hit-rail">
        ${hits.map((card) => `
          <article class="hit-row ${toCssClass("tier", getRarityTier(card.rarity))}">
            ${createResultImageHtml(card, "hit-row-image")}
            <div>
              <strong>${escapeHtml(card.name)}</strong>
              <span>${escapeHtml(card.rarity)} · ${formatPrice(card.fakePrice)}</span>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function createMiniCardListHtml(cards, bestDrawId, fallbackSlotLabel) {
  return cards.map((card) => `
    <div class="mini-card ${card.drawId === bestDrawId ? "best" : ""} ${toCssClass("tier", getRarityTier(card.rarity))}">
      ${createResultImageHtml(card, "mini-thumb")}
      <div>
        <div class="mini-title">${escapeHtml(card.name)}</div>
        <div class="mini-meta">${escapeHtml(card.slotLabel || fallbackSlotLabel || "Booster Slot")} · ${escapeHtml(card.rarity)} · ${escapeHtml(card.type)} · ${formatPrice(card.fakePrice)} · ${escapeHtml(card.setName)}</div>
      </div>
    </div>
  `).join("");
}

function createResultImageHtml(card, className) {
  const imageUrl = getCardSmallImageUrl(card);

  if (imageUrl) {
    return `<img class="${className} card-detail-trigger" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(card.name)}" loading="lazy" decoding="async" data-card-detail-id="${escapeHtml(card.id)}" data-card-detail-draw-id="${escapeHtml(card.drawId || "")}">`;
  }

  return `<span class="${className} result-fallback-art card-detail-trigger ${toCssClass("type", card.type)}" data-card-detail-id="${escapeHtml(card.id)}" data-card-detail-draw-id="${escapeHtml(card.drawId || "")}">${escapeHtml(getInitials(card.name))}</span>`;
}

function handleCardDetailClick(event) {
  const trigger = event.target.closest("[data-card-detail-id]");

  if (!trigger || trigger.closest(".collection-item.locked")) {
    return;
  }

  const card = findCardForDetail(trigger.dataset.cardDetailId, trigger.dataset.cardDetailDrawId);

  if (!card) {
    return;
  }

  event.preventDefault();
  openCardDetailPopup(card);
}

function handleCardDetailKeydown(event) {
  if (event.key === "Escape") {
    closeCardDetailPopup();
  }
}

function findCardForDetail(cardId, drawId) {
  if (drawId) {
    const drawCard = state.currentPack.find((card) => card.drawId === drawId);

    if (drawCard) {
      return drawCard;
    }
  }

  return state.cards.find((card) => card.id === cardId)
    || state.currentPack.find((card) => card.id === cardId)
    || state.collection[cardId]
    || null;
}

function openCardDetailPopup(card) {
  const popup = getCardDetailPopup();
  const smallUrl = getCardSmallImageUrl(card);
  const largeUrl = getCardLargeImageUrl(card);
  const imageHtml = smallUrl
    ? `<img class="card-detail-image" src="${escapeHtml(smallUrl)}" alt="${escapeHtml(card.name)}" decoding="async">`
    : `<span class="card-detail-fallback ${toCssClass("type", card.type)}">${escapeHtml(getInitials(card.name))}</span>`;

  popup.dataset.cardDetailId = card.id;
  popup.innerHTML = `
    <div class="card-detail-backdrop" data-card-detail-close="true"></div>
    <article class="card-detail-panel ${toCssClass("tier", getRarityTier(card.rarity))}" role="dialog" aria-modal="true" aria-label="${escapeHtml(card.name)} 상세보기">
      <button class="card-detail-close" type="button" data-card-detail-close="true" aria-label="Close">×</button>
      <div class="card-detail-art">${imageHtml}</div>
      <div class="card-detail-copy">
        <span>${escapeHtml(card.setName || "")} #${escapeHtml(card.number || "")}</span>
        <strong>${escapeHtml(card.name)}</strong>
        <small>${escapeHtml(card.rarity || "")} · ${escapeHtml(card.type || "")}</small>
        <b>${formatPrice(card.fakePrice)}</b>
      </div>
    </article>
  `;
  popup.hidden = false;
  document.body.classList.add("has-card-detail-popup");
  popup.querySelectorAll("[data-card-detail-close]").forEach((button) => {
    button.addEventListener("click", closeCardDetailPopup);
  });

  if (largeUrl && largeUrl !== smallUrl) {
    preloadImageUrl(largeUrl).then(() => {
      if (popup.dataset.cardDetailId !== card.id || popup.hidden) {
        return;
      }

      const image = popup.querySelector(".card-detail-image");

      if (image) {
        image.src = largeUrl;
        image.classList.add("is-large-loaded");
      }
    });
  }
}

function closeCardDetailPopup() {
  const popup = document.querySelector("#cardDetailPopup");

  if (!popup) {
    return;
  }

  popup.hidden = true;
  popup.innerHTML = "";
  document.body.classList.remove("has-card-detail-popup");
}

function getCardDetailPopup() {
  let popup = document.querySelector("#cardDetailPopup");

  if (!popup) {
    popup = document.createElement("div");
    popup.id = "cardDetailPopup";
    popup.className = "card-detail-popup";
    popup.hidden = true;
    document.body.appendChild(popup);
    injectCardDetailPopupStyles();
  }

  return popup;
}

function injectCardDetailPopupStyles() {
  if (document.querySelector("#cardDetailPopupStyles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "cardDetailPopupStyles";
  style.textContent = `
    .card-detail-trigger,[data-card-detail-id]{cursor:zoom-in}
    .has-card-detail-popup{overflow:hidden}
    .card-detail-popup[hidden]{display:none}
    .card-detail-popup{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:24px}
    .card-detail-backdrop{position:absolute;inset:0;background:rgba(7,10,18,.72);backdrop-filter:blur(10px)}
    .card-detail-panel{position:relative;display:grid;grid-template-columns:minmax(220px,360px) minmax(220px,320px);gap:22px;align-items:center;max-width:min(860px,96vw);max-height:92vh;padding:22px;border:1px solid rgba(255,255,255,.22);border-radius:16px;background:linear-gradient(135deg,rgba(20,24,35,.96),rgba(11,14,22,.98));box-shadow:0 30px 80px rgba(0,0,0,.48);color:#fff}
    .card-detail-close{position:absolute;top:12px;right:12px;width:36px;height:36px;border:0;border-radius:999px;background:rgba(255,255,255,.12);color:#fff;font-size:24px;line-height:1;cursor:pointer}
    .card-detail-art{display:grid;place-items:center;min-height:320px}
    .card-detail-image{max-width:100%;max-height:74vh;border-radius:14px;box-shadow:0 18px 44px rgba(0,0,0,.42);transition:filter .18s ease,transform .18s ease}
    .card-detail-image.is-large-loaded{filter:saturate(1.08);transform:translateY(-1px)}
    .card-detail-fallback{display:grid;place-items:center;width:min(320px,70vw);aspect-ratio:5/7;border-radius:14px;background:rgba(255,255,255,.1);font-size:64px;font-weight:800}
    .card-detail-copy{display:grid;gap:10px}
    .card-detail-copy span,.card-detail-copy small{color:rgba(255,255,255,.72)}
    .card-detail-copy strong{font-size:clamp(28px,4vw,46px);line-height:1}
    .card-detail-copy b{font-size:28px}
    @media (max-width:720px){.card-detail-popup{padding:14px}.card-detail-panel{grid-template-columns:1fr;gap:14px;padding:18px}.card-detail-art{min-height:0}.card-detail-copy strong{font-size:28px}}
  `;
  document.head.appendChild(style);
}

function getTotalValue(cards) {
  return cards.reduce((total, card) => total + Number(card.fakePrice || 0), 0);
}

function getRareOrBetter(cards) {
  return cards.filter((card) => !["common", "uncommon"].includes(getRarityTier(card.rarity)));
}

function getHighHits(cards) {
  return cards.filter((card) => ["ultra", "secret", "special"].includes(getRarityTier(card.rarity)));
}

function getBestCard(cards) {
  return cards.reduce((best, card) => (
    Number(card.fakePrice || 0) > Number(best.fakePrice || 0) ? card : best
  ), cards[0]);
}

function playRarityEffect(card, options = {}) {
  const rarity = card.rarity;
  const tier = getRarityTier(rarity);

  if (tier === "common" || tier === "uncommon") {
    return 0;
  }

  playRaritySound(tier, options);

  const overlayClass = {
    rare: "rare",
    holo: "holo",
    ultra: "ultra",
    secret: "secret",
    special: "special"
  }[tier];

  if (tier === "ultra" || tier === "secret" || tier === "special") {
    document.body.classList.add("screen-shake");
    window.setTimeout(() => document.body.classList.remove("screen-shake"), 450);
  }

  if (dom.effectCard) {
    dom.effectCard.innerHTML = shouldShowCardCutIn(tier) ? createCutInCardHtml(card) : "";
  }

  dom.effectText.textContent = options.finalCard && shouldShowCardCutIn(tier)
    ? `LAST CARD HIT · ${rarity.toUpperCase()}`
    : rarity.toUpperCase();
  dom.rarityOverlay.className = `rarity-overlay is-active ${overlayClass}${shouldShowCardCutIn(tier) ? " has-card-cutin" : ""}`;

  const baseDuration = tier === "special" ? 2050 : tier === "secret" ? 1850 : tier === "ultra" ? 1650 : 620;
  const duration = options.finalCard && shouldShowCardCutIn(tier) ? baseDuration + 340 : baseDuration;
  window.setTimeout(() => {
    dom.rarityOverlay.className = "rarity-overlay";
    if (dom.effectCard) {
      dom.effectCard.innerHTML = "";
    }
    dom.effectText.textContent = "";
  }, duration);

  return duration;
}

function shouldShowCardCutIn(tier) {
  return tier === "ultra" || tier === "secret" || tier === "special";
}

function createCutInCardHtml(card) {
  const imageUrl = getCardSmallImageUrl(card);

  if (imageUrl) {
    return `
      <div class="cutin-card-frame ${toCssClass("tier", getRarityTier(card.rarity))}">
        <img class="cutin-card-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(card.name)}" loading="eager" decoding="async">
      </div>
    `;
  }

  return `
    <div class="cutin-card-frame cutin-local-card ${toCssClass("type", card.type)} ${toCssClass("tier", getRarityTier(card.rarity))}">
      <div class="cutin-local-title">${escapeHtml(card.name)}</div>
      <div class="cutin-local-art">${createFallbackArtHtml(card, false)}</div>
      <div class="cutin-local-meta">${escapeHtml(card.rarity)} · ${formatPrice(card.fakePrice)}</div>
    </div>
  `;
}

function loadCollection() {
  if (!state.isPremium) {
    localStorage.removeItem(STORAGE_KEY);
    return {};
  }

  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (error) {
    console.warn("저장 데이터를 읽지 못해 새 컬렉션으로 시작합니다.", error);
    return {};
  }
}

function saveCollection() {
  if (!state.isPremium) {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.collection));
}

function loadOddsMode() {
  const savedMode = localStorage.getItem(ODDS_MODE_STORAGE_KEY);
  return canUseOddsMode(savedMode) ? savedMode : "realistic";
}

function saveOddsMode() {
  localStorage.setItem(ODDS_MODE_STORAGE_KEY, state.oddsMode);
}

function addCardToCollection(card) {
  const existing = state.collection[card.id];

  if (existing) {
    existing.duplicateCount = Number(existing.duplicateCount || 0) + 1;
    existing.copies = Number(existing.copies || 1) + 1;
    existing.lastPulledAt = new Date().toISOString();
    existing.imageUrl = getCardSmallImageUrl(card);
    existing.imageSmallUrl = getCardSmallImageUrl(card);
    existing.imageLargeUrl = getCardLargeImageUrl(card);
  } else {
    state.collection[card.id] = {
      id: card.id,
      name: card.name,
      setId: card.setId,
      setName: card.setName,
      type: card.type,
      rarity: card.rarity,
      imageUrl: getCardSmallImageUrl(card),
      imageSmallUrl: getCardSmallImageUrl(card),
      imageLargeUrl: getCardLargeImageUrl(card),
      fakePrice: card.fakePrice,
      owned: true,
      duplicateCount: 0,
      copies: 1,
      firstPulledAt: new Date().toISOString(),
      lastPulledAt: new Date().toISOString()
    };
  }

  state.cards = applyCollectionState(state.cards);
  saveCollection();
}

function applyCollectionState(cards) {
  return cards.map((card) => {
    const saved = state.collection[card.id];

    return {
      ...card,
      owned: Boolean(saved),
      duplicateCount: saved ? Number(saved.duplicateCount || 0) : 0
    };
  });
}

function updateStats() {
  const visibleCards = getVisibleCollectionCards();
  const totalCards = getVisibleTotalCardCount(visibleCards);
  const ownedCards = visibleCards.filter((card) => card.owned).length;
  const collectionRate = totalCards === 0 ? 0 : (ownedCards / totalCards) * 100;

  dom.totalCardsStat.textContent = String(totalCards);
  dom.ownedCardsStat.textContent = String(ownedCards);
  dom.collectionRateStat.textContent = `${collectionRate.toFixed(1)}%`;
}

function getVisibleCollectionCards() {
  if (state.activeSetId === "all") {
    return state.cards;
  }

  return state.cards.filter((card) => card.setId === state.activeSetId);
}

function getVisibleTotalCardCount(visibleCards) {
  if (state.activeSetId === "all") {
    const listedTotal = state.sets
      .filter((set) => set.id !== "all")
      .reduce((total, set) => total + Number(set.totalCards || 0), 0);

    return Math.max(visibleCards.length, listedTotal);
  }

  const activeSet = state.sets.find((set) => set.id === state.activeSetId);
  return Math.max(visibleCards.length, Number(activeSet && activeSet.totalCards || 0));
}

function showCollection() {
  dom.collectionPanel.hidden = false;
  renderCollection();
  dom.collectionPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function hideCollection() {
  dom.collectionPanel.hidden = true;
}

function renderCollection() {
  if (dom.collectionPanel && dom.collectionPanel.hidden) {
    return;
  }

  const cards = getFilteredCollectionCards();
  renderCollectionDashboard();

  if (cards.length === 0) {
    dom.collectionGrid.innerHTML = `
      <div class="collection-empty">
        조건에 맞는 카드가 없습니다.
      </div>
    `;
    return;
  }

  const visibleCards = cards.slice(0, COLLECTION_RENDER_LIMIT);
  const limitNoticeHtml = cards.length > visibleCards.length
    ? `<div class="collection-limit-note">성능 보호를 위해 ${visibleCards.length} / ${cards.length}장만 표시 중입니다. 검색이나 필터를 사용해 범위를 좁혀주세요.</div>`
    : "";

  dom.collectionGrid.innerHTML = `${limitNoticeHtml}${visibleCards.map((card) => {
    const saved = state.collection[card.id];
    const isOwned = Boolean(saved);
    const duplicateCount = isOwned ? Number(saved.duplicateCount || 0) : 0;
    const copies = isOwned ? Number(saved.copies || duplicateCount + 1) : 0;

    return `
      <div class="collection-item ${isOwned ? "" : "locked"}"${isOwned ? ` data-card-detail-id="${escapeHtml(card.id)}"` : ""}>
        <div class="collection-card-visual">
          ${createCollectionVisualHtml(card, isOwned)}
        </div>
        <div class="collection-title">${isOwned ? escapeHtml(card.name) : "Unknown Card"}</div>
        <div class="collection-meta">
          ${escapeHtml(card.rarity)} · ${escapeHtml(card.type)} · ${formatPrice(card.fakePrice)}<br>
          ${escapeHtml(card.setName)} #${escapeHtml(card.number)}<br>
          보유 ${copies}장 · 중복 ${duplicateCount}장
        </div>
      </div>
    `;
  }).join("")}`;
}

function getFilteredCollectionCards() {
  const query = state.collectionSearch.trim().toLowerCase();

  return getVisibleCollectionCards()
    .filter((card) => {
      const isOwned = Boolean(state.collection[card.id]);
      const matchesStatus = state.collectionFilter === "all"
        || state.collectionFilter === "owned" && isOwned
        || state.collectionFilter === "missing" && !isOwned;
      const matchesSearch = !query
        || card.name.toLowerCase().includes(query)
        || card.setName.toLowerCase().includes(query)
        || card.rarity.toLowerCase().includes(query);

      return matchesStatus && matchesSearch;
    })
    .sort(sortCollectionCards);
}

function sortCollectionCards(a, b) {
  const savedA = state.collection[a.id];
  const savedB = state.collection[b.id];

  if (state.collectionSort === "price") {
    return Number(b.fakePrice || 0) - Number(a.fakePrice || 0) || defaultCollectionSort(a, b);
  }

  if (state.collectionSort === "duplicates") {
    const duplicateCompare = Number(savedB && savedB.duplicateCount || 0) - Number(savedA && savedA.duplicateCount || 0);
    return duplicateCompare || defaultCollectionSort(a, b);
  }

  if (state.collectionSort === "newest") {
    const dateA = savedA && savedA.lastPulledAt ? Date.parse(savedA.lastPulledAt) : 0;
    const dateB = savedB && savedB.lastPulledAt ? Date.parse(savedB.lastPulledAt) : 0;
    return dateB - dateA || defaultCollectionSort(a, b);
  }

  if (state.collectionSort === "rarity") {
    const tierCompare = RARITY_TIER_ORDER.indexOf(getRarityTier(b.rarity)) - RARITY_TIER_ORDER.indexOf(getRarityTier(a.rarity));
    return tierCompare || Number(b.fakePrice || 0) - Number(a.fakePrice || 0) || defaultCollectionSort(a, b);
  }

  return defaultCollectionSort(a, b);
}

function defaultCollectionSort(a, b) {
  const setCompare = a.setName.localeCompare(b.setName);

  if (setCompare !== 0) {
    return setCompare;
  }

  return String(a.number).localeCompare(String(b.number), undefined, { numeric: true });
}

function renderCollectionDashboard() {
  if (!dom.collectionDashboard) {
    return;
  }

  const visibleCards = getVisibleCollectionCards();
  const ownedCards = visibleCards.filter((card) => card.owned);
  const duplicateCards = ownedCards
    .filter((card) => Number(card.duplicateCount || 0) > 0)
    .sort((a, b) => Number(b.duplicateCount || 0) - Number(a.duplicateCount || 0))
    .slice(0, 5);
  const topValueCards = [...ownedCards]
    .sort((a, b) => Number(b.fakePrice || 0) - Number(a.fakePrice || 0))
    .slice(0, 10);
  const premiumAssetHtml = state.isPremium
    ? `
      <section class="binder-panel premium-asset-panel">
        <div>
          <span class="premium-eyebrow">Premium Asset Dashboard</span>
          <strong>나의 총 수집 자산 가치: ${formatPrice(getPremiumCollectionValue())}</strong>
        </div>
        <p>프리미엄 컬렉션은 이 브라우저에 영구 저장됩니다.</p>
      </section>
    `
    : `
      <section class="binder-panel premium-asset-panel is-locked">
        <div>
          <span class="premium-eyebrow">Premium Locked</span>
          <strong>무료 모드는 새로고침하면 컬렉션이 초기화됩니다.</strong>
        </div>
        <p>하단의 고유 번호로 인증 코드를 발급받으면 영구 저장과 God Pack 모드가 열립니다.</p>
      </section>
    `;

  dom.collectionDashboard.innerHTML = `
    ${premiumAssetHtml}
    <section class="binder-panel">
      <div class="binder-panel-heading">
        <span>Set Progress</span>
        <strong>${ownedCards.length} owned</strong>
      </div>
      <div class="set-progress-list">
        ${createSetProgressHtml(visibleCards)}
      </div>
    </section>
    <section class="binder-panel">
      <div class="binder-panel-heading">
        <span>Rarity Map</span>
        <strong>${getHighHits(ownedCards).length} high hits</strong>
      </div>
      <div class="rarity-progress-list">
        ${createRarityProgressHtml(visibleCards)}
      </div>
    </section>
    <section class="binder-panel">
      <div class="binder-panel-heading">
        <span>Top Value</span>
        <strong>${formatPrice(getTotalValue(ownedCards))}</strong>
      </div>
      <div class="binder-card-list">
        ${createBinderTinyListHtml(topValueCards, "아직 보유한 카드가 없습니다.")}
      </div>
    </section>
    <section class="binder-panel">
      <div class="binder-panel-heading">
        <span>Duplicate Champs</span>
        <strong>${duplicateCards.reduce((total, card) => total + Number(card.duplicateCount || 0), 0)} dupes</strong>
      </div>
      <div class="binder-card-list">
        ${createBinderTinyListHtml(duplicateCards, "중복 카드가 아직 없습니다.", true)}
      </div>
    </section>
  `;
}

function createSetProgressHtml(cards) {
  const cardsBySet = groupBy(cards, (card) => card.setId);
  const rows = Array.from(cardsBySet.entries()).map(([setId, setCards]) => {
    const set = state.sets.find((item) => item.id === setId);
    const total = Math.max(setCards.length, Number(set && set.totalCards || 0));
    const owned = setCards.filter((card) => card.owned).length;
    const rate = total === 0 ? 0 : owned / total * 100;

    return {
      name: set ? set.name : setCards[0].setName,
      owned,
      total,
      rate
    };
  }).sort((a, b) => b.rate - a.rate || b.owned - a.owned || a.name.localeCompare(b.name));

  if (rows.length === 0) {
    return `<p class="binder-empty">세트 데이터가 없습니다.</p>`;
  }

  return rows.slice(0, 8).map((row) => `
    <div class="progress-row">
      <div>
        <strong>${escapeHtml(row.name)}</strong>
        <span>${row.owned} / ${row.total} · ${row.rate.toFixed(1)}%</span>
      </div>
      <span class="progress-track"><span style="width: ${Math.min(100, row.rate).toFixed(1)}%"></span></span>
    </div>
  `).join("");
}

function createRarityProgressHtml(cards) {
  const rows = RARITY_TIER_ORDER.map((tier) => {
    const tierCards = cards.filter((card) => getRarityTier(card.rarity) === tier);

    return {
      tier,
      total: tierCards.length,
      owned: tierCards.filter((card) => card.owned).length
    };
  }).filter((row) => row.total > 0);

  if (rows.length === 0) {
    return `<p class="binder-empty">레어도 데이터가 없습니다.</p>`;
  }

  return rows.map((row) => {
    const rate = row.total === 0 ? 0 : row.owned / row.total * 100;

    return `
      <div class="rarity-row ${toCssClass("tier", row.tier)}">
        <span>${escapeHtml(toTitleLabel(row.tier))}</span>
        <strong>${row.owned}/${row.total}</strong>
        <small>${rate.toFixed(1)}%</small>
      </div>
    `;
  }).join("");
}

function createBinderTinyListHtml(cards, emptyText, showDuplicates = false) {
  if (cards.length === 0) {
    return `<p class="binder-empty">${escapeHtml(emptyText)}</p>`;
  }

  return cards.map((card) => `
    <article class="binder-tiny-card ${toCssClass("tier", getRarityTier(card.rarity))}">
      ${createResultImageHtml(card, "binder-tiny-image")}
      <div>
        <strong>${escapeHtml(card.name)}</strong>
        <span>${escapeHtml(card.rarity)} · ${showDuplicates ? `중복 ${card.duplicateCount}장` : formatPrice(card.fakePrice)}</span>
      </div>
    </article>
  `).join("");
}

function groupBy(items, getKey) {
  return items.reduce((map, item) => {
    const key = getKey(item);

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key).push(item);
    return map;
  }, new Map());
}

function toTitleLabel(value) {
  return String(value || "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function createCollectionVisualHtml(card, isOwned) {
  if (!isOwned) {
    return `
      <span class="collection-card-back">
        ${createCardBackDesignHtml()}
      </span>
    `;
  }

  const imageUrl = getCardSmallImageUrl(card);

  if (imageUrl) {
    return `<img class="collection-card-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(card.name)}" loading="lazy" decoding="async">`;
  }

  return `
    <span class="collection-local-art ${toCssClass("type", card.type)}">
      ${createFallbackArtHtml(card, false)}
    </span>
  `;
}

function resetSave() {
  const shouldReset = window.confirm("저장된 컬렉션을 모두 삭제할까요?");

  if (!shouldReset) {
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
  resetRevealFlow();
  state.collection = {};
  state.cards = applyCollectionState(state.cards);
  state.currentPack = [];
  state.manualSeries = null;
  state.flippedCount = 0;
  state.packBestDrawId = null;
  setOpeningControlsDisabled(false);

  dom.packResultPanel.hidden = true;
  dom.packGrid.className = "pack-grid is-empty";
  dom.packGrid.innerHTML = `
    <div class="sealed-pack">
      <div class="sealed-pack-shine"></div>
      <div class="sealed-pack-title">BOOSTER</div>
      <div class="sealed-pack-subtitle">5 cards</div>
    </div>
  `;
  dom.stageTitle.textContent = "팩 개봉 대기 중";
  dom.stageStatus.textContent = "저장 데이터가 초기화되었습니다.";

  updateStats();
  renderCollection();
}

function getPackImageUrl(pack) {
  if (!pack) {
    return "";
  }

  if (pack.packImageUrl) {
    return sanitizeImageUrl(pack.packImageUrl);
  }

  const set = state.sets.find((item) => item.id === pack.setId);

  if (set && set.packImageUrl) {
    return sanitizeImageUrl(set.packImageUrl);
  }

  if (pack.source === "api" && set && set.name && hasLikelyPackArt(set)) {
    return buildPackArtUrl(set.name, stableVariantIndex(pack.id || set.id));
  }

  return "";
}

function hasLikelyPackArt(set) {
  const name = String(set && set.name || "").toLowerCase();
  const releaseTime = new Date(set && set.releaseDate || 0).getTime();
  const latestKnownPackArtTime = new Date("2025-01-17").getTime();
  const excluded = [
    "black star",
    "classic",
    "collection",
    "energies",
    "energy",
    "gallery",
    "promos",
    "promo",
    "shiny vault",
    "trainer kit"
  ];

  return Boolean(name)
    && Number.isFinite(releaseTime)
    && releaseTime <= latestKnownPackArtTime
    && !excluded.some((word) => name.includes(word));
}

function buildPackArtUrl(setName, variantIndex = 0) {
  const slug = slugifyPackArtName(setName);

  if (!slug) {
    return "";
  }

  const safeIndex = Math.abs(Number(variantIndex) || 0) % PACK_ART_VARIANTS;
  return `${PACK_ART_BASE_URL}/${slug}-pack-${safeIndex}.jpg`;
}

function slugifyPackArtName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function stableVariantIndex(value) {
  let hash = 0;
  const text = String(value || "");

  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33 + text.charCodeAt(i)) % 100000;
  }

  return hash % PACK_ART_VARIANTS;
}

function getSetName(setId) {
  const set = state.sets.find((item) => item.id === setId);
  return set ? set.name : "All Sets";
}

function toCssClass(prefix, value) {
  return `${prefix}-${toPlainClass(value)}`;
}

function toPlainClass(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function formatPrice(price) {
  return `$${Number(price || 0).toFixed(2)}`;
}

function getInitials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("") || "TCG";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}
