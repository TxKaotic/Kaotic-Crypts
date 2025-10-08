// =============================================================
// Retro Dungeon Crawler — Single-File Template
// Directional movement • Hidden Exit • Empty revisits • Weapon drops & equip • Weapon Trader
// + Meta Upgrades: XP/Gold/Heal modifiers, Explorer (Scout Pulse)
// =============================================================

// ------------------------------
// Core Data
// ------------------------------
const RNG = {
  int(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  pick(arr) {
    return arr[this.int(0, arr.length - 1)];
  },
  chance(pct) {
    return Math.random() * 100 < pct;
  },
};
const TOKEN_MULT = 0.75; // tune later (e.g., 1.25 if you want juicier rewards)
const REST_DIMINISH_FACTOR = 0.85; // try 0.90–0.95 for very gentle, 0.85 for moderate
const REST_DECAY_STYLE = "gentle"; // "gentle" | "exp"
const BOSS_FLOOR_INTERVAL = 10; // 10, 20, 30, ...
const BOSS_MAP_SIZE = 1;
// ---- Meta (stubbed) ----
// Persisted player-wide upgrades (not items). Adjust values here to test.

const COST_MULT = 1.0; // nudge whole economy: 0.9 cheaper, 1.2 pricier, etc.

// Linear → Exponential after an elbow.
// tier is the number of tiers already owned (0-based).
function elbowCostFactory({ base, step, elbow, growth }) {
  return (tier) => {
    const lin = base + step * tier; // gentle start
    if (tier < elbow) return Math.round(COST_MULT * lin);
    const after = tier - elbow + 1; // post-elbow steps
    return Math.round(COST_MULT * lin * Math.pow(growth, after));
  };
}

const META_KEY = "retro-dungeon-meta";
function loadMeta() {
  try {
    const s = localStorage.getItem(META_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return { upgrades: { xpMult: 0, goldMult: 0, vitality: 0, explorer: 0 } };
}
function saveMeta() {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(META));
  } catch {}
}
let META = loadMeta();

function restDiminish(n) {
  if (n <= 0) return 1;
  const f = REST_DIMINISH_FACTOR;
  // "gentle" decays with sqrt(n): 1.00, 0.90, 0.81, 0.81, 0.73, 0.73, ...
  return REST_DECAY_STYLE === "gentle"
    ? Math.pow(f, Math.sqrt(n))
    : Math.pow(f, n);
}

function isBossFloor(depth) {
  return depth > 0 && depth % BOSS_FLOOR_INTERVAL === 0;
}

// --- Meta currency (for lobby purchases) ---
function ensureMetaShape() {
  META = META || { upgrades: {} };
  META.upgrades = META.upgrades || {};
  // tiers already used by getters:
  META.upgrades.xpMult = META.upgrades.xpMult ?? 0; // +10% XP per tier (cap via getter)
  META.upgrades.goldMult = META.upgrades.goldMult ?? 0; // +10% Gold per tier (cap via getter)
  META.upgrades.vitality = META.upgrades.vitality ?? 0; // +2 MaxHP & +5% heal per tier
  META.upgrades.explorer = META.upgrades.explorer ?? 0; // +1 scout per floor (max 3)
  // new: persistent currency to spend in Lobby
  META.tokens = META.tokens ?? 0;
}
ensureMetaShape();
saveMeta();

// ---- Upgrade Getters (single source of truth) ----
function getXpMult() {
  return Math.min(2.0, 1 + 0.1 * (META?.upgrades?.xpMult || 0));
}
function getGoldMult() {
  return Math.min(1.5, 1 + 0.1 * (META?.upgrades?.goldMult || 0));
}
function getHealMult() {
  return Math.min(1.25, 1 + 0.05 * (META?.upgrades?.vitality || 0));
}
function getBonusHP() {
  return 2 * (META?.upgrades?.vitality || 0);
} // +2 Max HP per tier
function getScoutPerFloor() {
  return Math.min(3, META?.upgrades?.explorer || 0);
}

// ---------- Lobby: Upgrade catalog ----------
const UPGRADE_DEFS = {
  xpMult: {
    label: "XP Booster",
    desc: "+10% XP per tier (max 2.0× total)",
    maxTier: 20,
    // Starts cheap, ramps hard after tier 6. Last tiers ~200 tokens each.
    cost: elbowCostFactory({ base: 4, step: 2, elbow: 6, growth: 1.12 }),
  },

  goldMult: {
    label: "Gold Booster",
    desc: "+10% Gold per tier (max 1.5× total)",
    maxTier: 20,
    // Slightly pricier curve than XP because it feeds your run economy.
    // Last tiers ~350–360 tokens each.
    cost: elbowCostFactory({ base: 8, step: 3, elbow: 5, growth: 1.12 }),
  },

  vitality: {
    label: "Vitality",
    desc: "+2 Max HP & +5% healing per tier",
    maxTier: 20,
    // Mid-high endgame cost; tanky builds still pay a lot to cap.
    // Last tiers ~300 tokens each.
    cost: elbowCostFactory({ base: 6, step: 6, elbow: 4, growth: 1.4 }),
  },

  explorer: {
    label: "Explorer",
    desc: "+1 Scout Pulse per floor (max +3)",
    maxTier: 3,
    // Tiny tree; make each step stingy. 18 → 60 → ~170–180
    cost: elbowCostFactory({ base: 18, step: 12, elbow: 1, growth: 2.0 }),
  },
};

function getTier(key) {
  return META?.upgrades?.[key] ?? 0;
}
function canBuy(key) {
  const tier = getTier(key);
  const def = UPGRADE_DEFS[key];
  if (!def) return false;
  if (tier >= def.maxTier) return false;
  const price = def.cost(tier);
  return META.tokens >= price;
}
function buyUpgrade(key) {
  const tier = getTier(key);
  const def = UPGRADE_DEFS[key];
  if (!def) return;
  if (tier >= def.maxTier) return;
  const price = def.cost(tier);
  if (META.tokens < price) return;
  META.tokens -= price;
  META.upgrades[key] = tier + 1;
  saveMeta();
  renderLobby(); // re-render UI
}

// Optional: respec (full reset of upgrades → refund 75% of spent tokens)
function refundAllUpgrades() {
  let spent = 0;
  for (const k of Object.keys(UPGRADE_DEFS)) {
    const t = getTier(k);
    for (let i = 0; i < t; i++) spent += UPGRADE_DEFS[k].cost(i);
    META.upgrades[k] = 0;
  }
  const refund = Math.floor(spent * 0.75);
  META.tokens += refund;
  saveMeta();
}

// ---- Drop rate knobs (percent chances) ----
const DROP_RATES = {
  weapon: 12, // swords: ~12% after a kill (was 20%)
  shield: 7, // shields: ~7% after a kill (was 15%)
};

const ENEMIES = [
  {
    key: "rat",
    name: "Mutated Rat",
    hp: 10,
    atk: [1, 6],
    gold: [1, 3],
    xp: 8,
    img: "./assets/ratSVG.svg",
    minDepth: 1,
  },
  {
    key: "bat",
    name: "Grimy Bat",
    hp: 15,
    atk: [1, 8],
    gold: [2, 5],
    xp: 10,
    img: "assets/batSVG.svg",
    minDepth: 1,
  },
  {
    key: "slime",
    name: "Noxious Slime",
    hp: 18,
    atk: [1, 9],
    gold: [3, 7],
    xp: 14,
    img: "./assets/slimeSVG.svg",
    minDepth: 1,
  },
  {
    key: "skeleton",
    name: "Cracked Skull",
    hp: 20,
    atk: [2, 12],
    gold: [5, 10],
    xp: 18,
    img: "assets/crackedskullSVG.svg",
    minDepth: 3,
  },
  {
    key: "one_eye",
    name: "One Eye",
    hp: 30,
    atk: [5, 22],
    gold: [5, 100],
    xp: 25,
    img: "assets/monster1SVG.svg",
    minDepth: 5,
  },
  {
    key: "tumekens_minion",
    name: "Tumeken's Minion",
    hp: 35,
    atk: [5, 25],
    gold: [10, 120],
    xp: 35,
    img: "assets/wizardSVG.svg",
    minDepth: 5,
  },
  {
    key: "tumekens_guardian",
    name: "Tumeken's Guardian",
    hp: 45,
    atk: [7, 28],
    gold: [50, 120],
    xp: 75,
    img: "assets/tumekensguardianSVG.svg",
    minDepth: 8,
  },
  {
    key: "tumekens_shadow",
    name: "Tumeken's Shadow",
    hp: 90,
    atk: [3, 30],
    gold: [100, 300],
    xp: 250,
    img: "assets/temekensshadowSVG.svg",
    minDepth: 9,
  },
  {
    key: "tumeken",
    name: "Tumeken",
    hp: 160,
    atk: [3, 24],
    gold: [1000, 3000],
    xp: 2500,
    img: "assets/tumekenSVG.svg",
    minDepth: 11,
  },
  {
    key: "nightmare",
    name: "Nightmare",
    hp: 190,
    atk: [3, 30],
    gold: [1000, 5000],
    xp: 3000,
    img: "assets/boss1SVG.svg",
    minDepth: 12,
  },
];

// New boss catalog — tweak freely
const BOSSES = [
  {
    depth: 10,
    key: "guardian_idol",
    name: "Guardian Idol",
    hp: 230,
    atk: [5, 22],
    gold: [100, 2400],
    xp: 250,
    img: "assets/guardianidolSVG.svg",
    drops: {
      // loot table (all optional)
      items: [
        { key: "potion_greater", qty: 5, chance: 100 },
        { key: "bomb_incendiary", qty: 3, chance: 100 },
      ],
      weapons: [
        { template: "knight_blade", powerFactor: 1.0, chance: 50 }, // must match a SWORDS key
      ],
      shields: [
        { template: "steel_heater", chance: 50 }, // must match a SHIELDS key
      ],
    },
  },
  {
    depth: 20,
    key: "abyssal_wyrmling",
    name: "Abyssal Wyrmling",
    hp: 300,
    atk: [3, 25],
    gold: [200, 3500],
    xp: 550,
    img: "assets/abyssalwyrmSVG.svg",
    drops: {
      items: [
        { key: "potion_giga", qty: 5, chance: 100 },
        { key: "bomb_incendiary", qty: 3, chance: 100 },
      ],

      weapons: [
        { template: "obsidian_falchion", powerFactor: 1.0, chance: 30 },
      ],
      shields: [{ template: "sunsteel_barrier", chance: 30 }],
    },
  },
  {
    depth: 30,
    key: "abyssal_wyrm",
    name: "Abyssal Wyrm",
    hp: 450,
    atk: [4, 35],
    gold: [500, 3500],
    xp: 750,
    img: "assets/abyssalwyrmSVG.svg",
    drops: {
      items: [
        { key: "potion_giga", qty: 5, chance: 100 },
        { key: "bomb_incendiary", qty: 3, chance: 100 },
      ],

      weapons: [{ template: "dragonfang", powerFactor: 1.0, chance: 50 }],
      shields: [{ template: "crystal_ward", chance: 50 }],
    },
  },
  {
    depth: 40,
    key: "guardian_idol",
    name: "Guardian Idol",
    hp: 500,
    atk: [2, 40],
    gold: [1000, 5000],
    xp: 1000,
    img: "assets/guardianidolSVG.svg",
    drops: {
      // loot table (all optional)
      items: [
        { key: "potion_greater", qty: 10, chance: 100 },
        { key: "bomb_incendiary", qty: 5, chance: 100 },
      ],
      weapons: [
        { template: "obsidian_falchion", powerFactor: 1.0, chance: 50 }, // must match a SWORDS key
      ],
      shields: [
        { template: "crystal_ward", chance: 50 }, // must match a SHIELDS key
      ],
    },
  },
  // Add more for 30, 40, ... (or reuse the closest lower one if missing)
];

// Consumables — unique keys, clear scaling
const LOOT_TABLE = [
  // --- Healing ---
  {
    key: "potion_minor",
    name: "Minor Health Potion",
    kind: "consumable",
    heal: 8,
    price: 10,
  },
  {
    key: "potion_small",
    name: "Small Health Potion",
    kind: "consumable",
    heal: 12,
    price: 16,
  },
  {
    key: "potion",
    name: "Health Potion",
    kind: "consumable",
    heal: 15,
    price: 22,
  },
  {
    key: "potion_strong",
    name: "Strong Health Potion",
    kind: "consumable",
    heal: 25,
    price: 38,
  },
  {
    key: "potion_greater",
    name: "Greater Health Potion",
    kind: "consumable",
    heal: 35,
    price: 64,
  },
  {
    key: "potion_giga",
    name: "Giga Health Potion",
    kind: "consumable",
    heal: 50,
    price: 110,
  },

  // --- Explosives (more variety) ---
  {
    key: "bomb_crude",
    name: "Crude Bomb",
    kind: "consumable",
    dmg: 8,
    price: 22,
  },
  { key: "bomb", name: "Bomb", kind: "consumable", dmg: 12, price: 40 },
  {
    key: "bomb_shrapnel",
    name: "Shrapnel Bomb",
    kind: "consumable",
    dmg: 16,
    price: 55,
  },
  {
    key: "bomb_toxic",
    name: "Toxic Bomb",
    kind: "consumable",
    dmg: 20,
    price: 75,
  },
  {
    key: "bomb_frost",
    name: "Frost Bomb",
    kind: "consumable",
    dmg: 24,
    price: 90,
  },
  {
    key: "bomb_incendiary",
    name: "Incendiary Bomb",
    kind: "consumable",
    dmg: 28,
    price: 100,
  },
  { key: "tnt", name: "TNT", kind: "consumable", dmg: 75, price: 120 },
];

// Weapon templates — higher power => rarer (weights drop with atk), unlock by depth
const SWORDS = [
  // --- Commons (Depth 1–2) ---
  {
    key: "rusty_dagger",
    name: "Rusty Dagger",
    atk: 1,
    minDepth: 1,
    weight: 60,
  },
  { key: "bent_shiv", name: "Bent Shiv", atk: 1, minDepth: 1, weight: 60 },
  { key: "fire_poker", name: "Fire Poker", atk: 1, minDepth: 1, weight: 55 },
  { key: "dusty_knife", name: "Dusty Knife", atk: 2, minDepth: 1, weight: 50 },
  { key: "bone_shard", name: "Bone Shard", atk: 2, minDepth: 1, weight: 50 },
  {
    key: "makeshift_dagger",
    name: "Makeshift Dagger",
    atk: 2,
    minDepth: 1,
    weight: 45,
  },

  // --- Uncommons (Depth 3–7) ---
  { key: "short_sword", name: "Short Sword", atk: 3, minDepth: 3, weight: 40 },
  { key: "bone_dagger", name: "Bone Dagger", atk: 3, minDepth: 3, weight: 35 },
  { key: "iron_saber", name: "Iron Saber", atk: 3, minDepth: 4, weight: 30 },
  {
    key: "bronze_gladius",
    name: "Bronze Gladius",
    atk: 4,
    minDepth: 5,
    weight: 25,
  },
  {
    key: "serrated_kopis",
    name: "Serrated Kopis",
    atk: 4,
    minDepth: 6,
    weight: 22,
  },
  {
    key: "steel_longsword",
    name: "Steel Longsword",
    atk: 4,
    minDepth: 7,
    weight: 18,
  },

  // --- Rares (Depth 9–13) ---
  {
    key: "knight_blade",
    name: "Knight Blade",
    atk: 5,
    minDepth: 9,
    weight: 12,
  },
  {
    key: "storm_rapier",
    name: "Storm Rapier",
    atk: 5,
    minDepth: 10,
    weight: 10,
  },
  {
    key: "crystal_saber",
    name: "Crystal Saber",
    atk: 6,
    minDepth: 12,
    weight: 8,
  },
  {
    key: "obsidian_falchion",
    name: "Obsidian Falchion",
    atk: 6,
    minDepth: 13,
    weight: 7,
  },

  // --- Epics (Depth 14+) ---
  { key: "dragonfang", name: "Dragonfang", atk: 7, minDepth: 14, weight: 5 },
  {
    key: "empyrean_sword",
    name: "Empyrean Sword",
    atk: 8,
    minDepth: 14, // moved from 1 to appropriate tier
    weight: 3,
  },
  {
    key: "sunsteel_edge",
    name: "Sunsteel Edge",
    atk: 9,
    minDepth: 16,
    weight: 3,
  },
  { key: "voidreaver", name: "Voidreaver", atk: 12, minDepth: 20, weight: 2 },
  {
    key: "empyrean_greatsword",
    name: "Empyrean Greatsword",
    atk: 15,
    minDepth: 24,
    weight: 2,
  },
  {
    key: "abyssal_whip",
    name: "Abyssal Whip",
    atk: 8,
    minDepth: 3,
    weight: 1,
  },
];

const SHIELDS = [
  {
    key: "wooden_shield",
    name: "Wooden Shield",
    def: 1,
    rollChance: 10,
    minDepth: 1,
    weight: 60,
  },
  {
    key: "hide_kite",
    name: "Hide Kite",
    def: 2,
    rollChance: 12,
    minDepth: 2,
    weight: 45,
  },
  {
    key: "bronze_roundel",
    name: "Bronze Roundel",
    def: 2,
    rollChance: 16,
    minDepth: 3,
    weight: 35,
  },
  {
    key: "iron_targe",
    name: "Iron Targe",
    def: 3,
    rollChance: 18,
    minDepth: 5,
    weight: 28,
  },
  {
    key: "steel_heater",
    name: "Steel Heater",
    def: 3,
    rollChance: 22,
    minDepth: 7,
    weight: 20,
  },
  {
    key: "knights_wall",
    name: "Knight’s Wall",
    def: 4,
    rollChance: 24,
    minDepth: 9,
    weight: 14,
  },
  {
    key: "obsidian_scutum",
    name: "Obsidian Scutum",
    def: 4,
    rollChance: 28,
    minDepth: 12,
    weight: 9,
  },
  {
    key: "runed_aegis",
    name: "Runed Aegis",
    def: 5,
    rollChance: 30,
    minDepth: 15,
    weight: 6,
  },
  {
    key: "crystal_ward",
    name: "Crystal Ward",
    def: 5,
    rollChance: 35,
    minDepth: 18,
    weight: 3,
  },
  {
    key: "sunsteel_barrier",
    name: "Sunsteel Barrier",
    def: 6,
    rollChance: 40,
    minDepth: 22,
    weight: 1,
  },
];

const ROOM_TAGS = [
  "Calm",
  "Damp",
  "Echoing",
  "Dank",
  "Fetid",
  "Fungal",
  "Icy",
  "Gusty",
  "Mossy",
  "Dripping",
  "Whispering",
  "Gloomy",
  "Stagnant",
  "Claustrophobic",
  "Crumbling",
  "Ruined",
  "Collapsed",
  "Flooded",
  "Silted",
  "Frostbitten",
  "Chill",
  "Webbed",
  "Infested",
  "Ossuary",
  "Bone-Littered",
  "Mildewed",
  "Moldy",
  "Rot-Stained",
  "Dust-Choked",
  "Sulfurous",
  "Miasmic",
  "Smoky",
  "Ashen",
  "Scorched",
  "Sooty",
  "Crystalline",
  "Shimmering",
  "Phosphorescent",
  "Bioluminescent",
  "Arcane",
  "Runed",
  "Hexed",
  "Cursed",
  "Haunted",
  "Spectral",
  "Unholy",
  "Sanctified",
  "Ancient",
  "Forgotten",
  "Hidden",
  "Labyrinthine",
  "Twisting",
  "Narrow",
  "Broad",
  "Eerie",
  "Gloaming",
  "Shadowed",
  "Wind-Scoured",
  "Seismic",
  "Rumbling",
  "Quaking",
  "Verminous",
  "Putrid",
  "Stench-Ridden",
  "Slick",
  "Iridescent",
  "Frozen",
  "Ember-Lit",
  "Torchlit",
  "Starved of Light",
  "Thunderous",
];

// ------------------------------
// Game State
// ------------------------------
const initialState = () => ({
  name: "Adventurer",
  depth: 1,
  level: 1,
  hp: 20,
  maxHp: 20,
  xp: 0,
  xpToNext: 10,
  gold: 0,
  // Inventory can contain consumables {key, qty} and weapons {key:'weapon', id, name, atk, rarity, price, source}
  inventory: [{ key: "potion", qty: 1 }],
  mapSize: 7,
  map: [],
  pos: { x: 3, y: 3 },
  enemy: null,
  busy: false,
  _offers: null,
  // Exit (hidden until discovered)
  exitPos: null,
  exitDiscovered: false,
  // Equipment
  equipped: { weapon: null, shield: null }, // ← added shield slot
  // Trader cooldown to avoid back-to-back encounters
  traderCooldown: 0,
  // Explorer (Scout Pulse) per-floor charges
  scoutCharges: 0,
  restsThisFloor: 0,
});

let S = initialState();
let resumeCombatAfterInv = false;
// Blocks input while the death screen is up
let __deathKeyHandler = null;

// ------------------------------
// Utilities
// ------------------------------
const $ = (sel) => document.querySelector(sel);
const logEl = $("#log");

function addLog(html, cls) {
  const p = document.createElement("p");
  if (cls) p.className = cls;
  p.innerHTML = html;
  logEl.appendChild(p);
  logEl.scrollTop = logEl.scrollHeight;
}
function addCombatLog(html, cls) {
  const box = $("#combatLog");
  const p = document.createElement("p");
  if (cls) p.className = cls;
  p.innerHTML = html;
  box.appendChild(p);
  box.scrollTop = box.scrollHeight;
}

function uid() {
  return "w" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function weightedPick(items, weightKey = "weight") {
  const total = items.reduce((s, it) => s + (it[weightKey] || 0), 0);
  if (!total) return items[0];
  let r = Math.random() * total;
  for (const it of items) {
    r -= it[weightKey] || 0;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}
function sanitizeState() {
  if (!S) S = initialState();

  if (!S.equipped || typeof S.equipped !== "object")
    S.equipped = { weapon: null, shield: null };
  if (!("weapon" in S.equipped)) S.equipped.weapon = null;
  if (!("shield" in S.equipped)) S.equipped.shield = null; // ← ensure shield
  if (typeof S.restsThisFloor !== "number") S.restsThisFloor = 0;

  if (typeof S.traderCooldown !== "number") S.traderCooldown = 0;
  if (typeof S.scoutCharges !== "number") S.scoutCharges = 0;

  if (!Array.isArray(S.inventory)) S.inventory = [];
  if (!S.mapSize) S.mapSize = 7;
  if (!S.map || !Array.isArray(S.map))
    S.map = Array.from({ length: S.mapSize }, () =>
      Array(S.mapSize).fill(false)
    );
  if (!S.pos) S.pos = { x: 0, y: 0 };

  if (
    S.enemy &&
    (typeof S.enemy.hp !== "number" || !Array.isArray(S.enemy.atk))
  ) {
    S.enemy = null;
  }

  if (!S.exitPos && !isBossFloor(S.depth)) generateExit();
}

// --- Helper: only allow enemies whose required depth is met ---
function eligibleEnemies(depth) {
  const req = (e) => e.minDepth ?? 1;
  const allowed = ENEMIES.filter((e) => req(e) <= depth);
  if (allowed.length) return allowed;

  // Fallback: if nothing matches (e.g., all are gated too high),
  // use the earliest-available group instead of crashing.
  const minReq = Math.min(...ENEMIES.map(req));
  return ENEMIES.filter((e) => req(e) === minReq);
}

// Helper: cheaper pricing for weapon shop (uses final atk after powerFactor)
function shopWeaponPrice(atk) {
  // Old shop formula was 50 + 40*atk + 10*depth -> felt too pricey.
  // New, gentler curve:
  return Math.max(5, Math.round(25 + atk * 18 + S.depth * 5));
}

// Helper: pick N unique templates with weighting
function pickUniqueWeighted(pool, count, weightKey = "weight") {
  const available = [...pool];
  const picks = [];
  for (let i = 0; i < count && available.length > 0; i++) {
    const choice = weightedPick(available, weightKey);
    picks.push(choice);
    // remove ALL items sharing the same key
    for (let j = available.length - 1; j >= 0; j--) {
      if (available[j].key === choice.key) available.splice(j, 1);
    }
  }
  return picks;
}

function getBossForDepth(depth) {
  // exact match first
  let b = BOSSES.find((x) => x.depth === depth);
  if (b) return clone(b);

  // else pick the highest boss <= depth (fallback for future 30, 40... if not defined yet)
  const candidates = BOSSES.filter((x) => x.depth <= depth).sort(
    (a, z) => a.depth - z.depth
  );
  return clone(candidates[candidates.length - 1] || BOSSES[0]);
}

function startBossEncounter(depth) {
  const boss = getBossForDepth(depth);
  boss.isBoss = true; // tag so defeat handler knows it's a boss
  S.enemy = boss;
  setEncounterStatus("Boss!");
  openCombat(
    `A <strong>${boss.name}</strong> towers before you! (HP ${boss.hp})`
  );
}

function handleBossDrops(boss) {
  const d = boss?.drops || {};

  // Items (from LOOT_TABLE by key)
  if (Array.isArray(d.items)) {
    d.items.forEach((it) => {
      const chance = it.chance ?? 100;
      if (RNG.chance(chance)) {
        const qty = it.qty ?? 1;
        addItem(it.key, qty);
        const meta = LOOT_TABLE.find((l) => l.key === it.key);
        addLog(
          `Boss drops <strong>${meta?.name || it.key}</strong> x${qty}.`,
          "good"
        );
      }
    });
  }

  // Weapons (by SWORDS template key)
  if (Array.isArray(d.weapons)) {
    d.weapons.forEach((dw) => {
      const chance = dw.chance ?? 100;
      if (RNG.chance(chance)) {
        const tpl = SWORDS.find((s) => s.key === dw.template);
        if (tpl) {
          const pf = dw.powerFactor ?? 1.0;
          const w = makeWeaponFromTemplate(tpl, "drop", pf);
          addWeapon(w);
          addLog(
            `Boss drops <strong>${w.name}</strong> <span class="good">(+${w.atk})</span>.`,
            "good"
          );
        }
      }
    });
  }

  // Shields (by SHIELDS template key)
  if (Array.isArray(d.shields)) {
    d.shields.forEach((ds) => {
      const chance = ds.chance ?? 100;
      if (RNG.chance(chance)) {
        const tpl = SHIELDS.find((s) => s.key === ds.template);
        if (tpl) {
          const sh = makeShieldFromTemplate(tpl, "drop");
          addShield(sh);
          addLog(
            `Boss drops <strong>${sh.name}</strong> <small>(${sh.def} DEF • ${sh.rollChance}% block)</small>.`,
            "good"
          );
        }
      }
    });
  }
}

// Glimmer effect
function flashGlimmer() {
  const fx = document.getElementById("fx");
  fx?.classList.remove("glimmer");
  void fx?.offsetWidth; // restart animation
  fx?.classList.add("glimmer");
}

// ------------------------------
// Stats & UI
// ------------------------------

// ---------- Meta Multipliers Pill ----------

// Safely compute current multipliers even if lobby/meta helpers aren't present yet
function __computeMultipliers() {
  const meta =
    typeof META !== "undefined" && META && META.upgrades ? META.upgrades : {};

  const xpMult =
    typeof getXpMult === "function"
      ? getXpMult()
      : Math.min(2.0, 1 + 0.1 * (meta.xpMult || 0));

  const goldMult =
    typeof getGoldMult === "function"
      ? getGoldMult()
      : Math.min(1.5, 1 + 0.1 * (meta.goldMult || 0));

  // Vitality: healing boost only (maxHP bonus is static; we show the multiplier here)
  const healPct =
    typeof getVitalityHealBonusPct === "function"
      ? getVitalityHealBonusPct()
      : 5 * (meta.vitality || 0); // % value, e.g., 10 => +10%

  // Explorer: we display “+N” bonus pulses (not total)
  const scoutBonus =
    typeof getScoutPerFloor === "function"
      ? Math.max(0, (getScoutPerFloor() || 0) - 1) // if your getter returns total-per-floor
      : meta.explorer || 0; // else treat stored tier as bonus

  return { xpMult, goldMult, healPct, scoutBonus };
}

function ensureMetaPill() {
  let pill = document.getElementById("metaPill");
  if (pill) return pill;

  pill = document.createElement("div");
  pill.id = "metaPill";
  pill.title = "Current run modifiers";
  Object.assign(pill.style, {
    position: "fixed",
    right: "10px",
    bottom: "10px",
    zIndex: "9999",
    padding: "6px 10px",
    borderRadius: "999px",
    border: "1px solid #263774",
    background: "linear-gradient(180deg, #0a0f1f, #070a15)",
    color: "#e8edff",
    fontFamily: "inherit",
    fontSize: "12px",
    lineHeight: "1",
    boxShadow: "0 8px 24px rgba(0,0,0,.35)",
    opacity: "0.95",
  });

  document.body.appendChild(pill);
  return pill;
}

function renderMetaPill() {
  const pill = ensureMetaPill();
  const { xpMult, goldMult, healPct, scoutBonus } = __computeMultipliers();

  // Build compact text, hide segments that are baseline
  const parts = [];
  if (xpMult && xpMult !== 1) parts.push(`⚡ XP×${xpMult.toFixed(2)}`);
  if (goldMult && goldMult !== 1) parts.push(`💰 Gold×${goldMult.toFixed(2)}`);
  if (healPct && healPct > 0) parts.push(`✚ Heal+${healPct}%`);
  if (typeof scoutBonus === "number" && scoutBonus > 0)
    parts.push(`🧭 Scout+${scoutBonus}`);

  if (parts.length === 0) {
    pill.style.display = "none"; // nothing special active
  } else {
    pill.textContent = parts.join(" • ");
    pill.style.display = "inline-block";
  }
}

function setBar(el, val, max, textEl) {
  const pct = Math.max(0, Math.min(100, Math.round((val / max) * 100)));
  el.style.setProperty("--val", pct + "%");
  if (textEl) textEl.textContent = `${val}/${max}`;
}

function updateScoutUI() {
  const pill = document.getElementById("scoutPill");
  if (pill) pill.textContent = `Scout: ${S.scoutCharges}`;
  const btn = document.getElementById("actScout");
  if (btn) btn.disabled = S.scoutCharges <= 0;
}

function renderStats() {
  setBar($("#hpBar"), S.hp, S.maxHp, $("#hpText"));
  setBar($("#xpBar"), S.xp, S.xpToNext, $("#xpText"));
  $("#goldPill").textContent = `Gold: ${S.gold}`;
  $("#levelPill").textContent = `Lvl ${S.level}`;
  $("#playerName").textContent = S.name;
  $("#depthPill").textContent = `Delve ${S.depth}`;
  if (S.enemy) $("#combatEnemyHp").textContent = `HP ${S.enemy.hp}`;
  $("#shopGold").textContent = `Gold: ${S.gold}`;
  $("#invGold").textContent = `Gold: ${S.gold}`;

  updateScoutUI();

  // --- Mini HUD mirrors (only present on mobile; safe to no-op if missing)
  const miniHpBar = document.getElementById("miniHpBar");
  if (miniHpBar)
    setBar(miniHpBar, S.hp, S.maxHp, document.getElementById("miniHpText"));
  const miniXpBar = document.getElementById("miniXpBar");
  if (miniXpBar)
    setBar(miniXpBar, S.xp, S.xpToNext, document.getElementById("miniXpText"));
}

function renderInventory() {
  const wrap = $("#inventory");
  wrap.innerHTML = "";
  S.inventory.forEach((it) => {
    const meta = LOOT_TABLE.find((l) => l.key === it.key);
    const div = document.createElement("div");
    div.className = "item";

    if (meta) {
      div.innerHTML = `<span>• ${meta.name}</span> <small>x${it.qty}</small>`;
      div.style.cursor = "pointer";
      div.title = `Click to use 1 ${meta.name}`;
      div.addEventListener("click", () => useSpecificItem(it.key));
    } else if (it.key === "weapon") {
      const equippedMark =
        S.equipped?.weapon && S.equipped.weapon.id === it.id
          ? " <small>(E)</small>"
          : "";
      div.innerHTML = `<span>🗡️ ${it.name} <small>+${it.atk} • ${it.rarity}${equippedMark}</small></span>`;
      div.style.cursor = "pointer";
      div.title = "Click to equip";
      div.tabIndex = 0;
      div.addEventListener("click", () => equipWeaponById(it.id));
      div.addEventListener("keypress", (e) => {
        if (e.key === "Enter") equipWeaponById(it.id);
      });
    } else if (it.key === "shield") {
      const equippedMark =
        S.equipped?.shield && S.equipped.shield.id === it.id
          ? " <small>(E)</small>"
          : "";
      div.innerHTML = `<span>🛡️ ${it.name} <small>${it.def} DEF • ${it.rollChance}% • ${it.rarity}${equippedMark}</small></span>`;
      div.style.cursor = "pointer";
      div.title = "Click to equip shield";
      div.tabIndex = 0;
      div.addEventListener("click", () => equipShieldById(it.id));
      div.addEventListener("keypress", (e) => {
        if (e.key === "Enter") equipShieldById(it.id);
      });
    } else {
      div.textContent = it.key;
    }

    wrap.appendChild(div);
  });
  if (!S.inventory.length) wrap.textContent = "(Empty)";
}

function ensureMap() {
  if (!S.map || !S.map.length) {
    S.map = Array.from({ length: S.mapSize }, () =>
      Array(S.mapSize).fill(false)
    );
  }
  S.map[S.pos.y][S.pos.x] = true;
  if (!S.exitPos && !isBossFloor(S.depth)) generateExit();
}

function renderMap() {
  ensureMap();
  const g = $("#map");
  g.innerHTML = "";
  for (let y = 0; y < S.mapSize; y++) {
    for (let x = 0; x < S.mapSize; x++) {
      const d = document.createElement("div");
      d.className = "cell";
      if (S.map[y][x]) d.classList.add("discovered");
      if (x === S.pos.x && y === S.pos.y) d.classList.add("player");
      // Only show exit if discovered
      if (S.exitDiscovered && x === S.exitPos.x && y === S.exitPos.y)
        d.classList.add("exit");
      g.appendChild(d);
    }
  }
}

function setEncounterStatus(text) {
  $("#encounterPill").textContent = text;
}

function setRoom() {
  const ROOM_NAMES = [
    "Dank Passage",
    "Mossy Archway",
    "Collapsed Hall",
    "Silent Crypt",
    "Crystal Cavern",
    "Forgotten Library",
    "Shimmering Tunnel",
    "Broken Bridge",
    "Abandoned Barracks",
    "Sealed Vault",
    "Forgotten Armory",
    "Dust-Choked Stacks",
    "Sarcophagus Row",
    "Ossuary Niche",
    "Ghoul Warren",
    "Spider Den",
    "Mushroom Grotto",
    "Glowworm Hollow",
    "Phosphor Cavern",
    "Bioluminescent Pool",
    "Dripping Gallery",
    "Whispering Hall",
    "Hall of Echoes",
    "Howling Vent",
    "Flooded Tunnel",
    "Sunken Archive",
    "Drowned Chapel",
    "Rotted Sluice",
    "Stagnant Cistern",
    "Collapsed Aqueduct",
    "Cracked Causeway",
    "Broken Stair",
    "Rift Walk",
    "Seismic Fissure",
    "Rubble Ramp",
    "Shattered Sanctum",
    "Desecrated Shrine",
    "Black Altar",
    "Runesmith’s Forge",
    "Ashen Furnace",
    "Soot-Stained Chimney",
    "Obsidian Gallery",
    "Vein of Crystal",
    "Quarry Cut",
    "Mosaic Rotunda",
    "Timeworn Rotunda",
    "Hidden Antechamber",
    "Secret Pantry",
    "Servants’ Passage",
    "Supply Cache",
    "Prospector’s Camp",
    "Miner’s Rest",
    "Collapsed Shaft",
    "Rust Gate",
    "Iron Portcullis",
    "Warden’s Watch",
    "Jailor’s Gallery",
    "Chainworks",
    "Wardstone Ring",
    "Arcane Observatory",
    "Star Chamber",
    "Chill Refectory",
    "Frostbitten Corridor",
    "Bonepile Crossing",
    "Gallows Landing",
    "Worm-Tunnel",
    "Slime Channel",
    "Chittering Nest",
    "Thorn Pit",
    "Gloomed Nave",
    "Runed Threshold",
    "Echoing Narthex",
  ];
  $("#roomTitle").textContent = RNG.pick(ROOM_NAMES);
  $("#roomTags").textContent = RNG.pick(ROOM_TAGS);
}

function refreshUI() {
  renderStats();
  renderInventory();
  renderMap();
  setRoom();
  renderMetaPill(); // ← add this
}

// ------------------------------
// Exit / Floors
// ------------------------------
function generateExit() {
  // Never make an exit on boss floors or 1×1 maps
  if (isBossFloor(S.depth) || S.mapSize <= 1) {
    S.exitPos = null;
    S.exitDiscovered = false;
    return;
  }
  let x, y;
  do {
    x = RNG.int(0, S.mapSize - 1);
    y = RNG.int(0, S.mapSize - 1);
  } while (x === S.pos.x && y === S.pos.y);
  S.exitPos = { x, y };
  S.exitDiscovered = false;
}

function checkExitContact() {
  if (!S.exitPos) return false;
  if (S.pos.x === S.exitPos.x && S.pos.y === S.exitPos.y) {
    if (!S.exitDiscovered) {
      S.exitDiscovered = true;
      addLog("You discover a hidden stairwell <strong>★</strong>!", "good");
      renderMap();
    }

    // Event modal instead of confirm
    openEventModal({
      title: "Hidden Stairwell",
      img: "assets/stairsSVG.svg",
      html: `Descend to <strong>Depth ${
        S.depth + 1
      }</strong>? Who knows what lurks below.`,
      primaryText: "Descend",
      secondaryText: "Stay Here",
      onPrimary: () => descend(),
      onSecondary: () => addLog("You decide to explore a bit longer."),
    });

    return true;
  }
  return false;
}

function descend() {
  S.depth += 1;

  // Boss floors are single-tile, otherwise use your normal map size (7)
  S.mapSize = isBossFloor(S.depth) ? BOSS_MAP_SIZE : 7;

  S.map = Array.from({ length: S.mapSize }, () => Array(S.mapSize).fill(false));
  S.pos = { x: 0, y: 0 };
  S.map[S.pos.y][S.pos.x] = true;
  S.restsThisFloor = 0;

  // No exit on boss floor; otherwise generate as usual
  if (isBossFloor(S.depth)) {
    S.exitPos = null;
    S.exitDiscovered = false;
  } else {
    generateExit();
  }

  // Refresh Explorer charges per floor
  S.scoutCharges = getScoutPerFloor();
  if (S.scoutCharges > 0)
    addLog(
      `<small>[Scout charges refreshed: ${S.scoutCharges}]</small>`,
      "good"
    );

  addLog(
    isBossFloor(S.depth)
      ? `<em>You descend to Depth ${S.depth}… A vast presence fills the air.</em>`
      : `<em>You descend to Depth ${S.depth}…</em>`,
    "good"
  );

  renderMap();
  setRoom();
  renderStats();

  // Force the boss encounter immediately
  if (isBossFloor(S.depth)) {
    startBossEncounter(S.depth);
  } else {
    setEncounterStatus("Idle");
  }
}

// ------------------------------
// Inventory Helpers
// ------------------------------
function addItem(key, qty = 1) {
  // stack only consumables
  const existing = S.inventory.find((i) => i.key === key && i.qty != null);
  if (existing) existing.qty += qty;
  else S.inventory.push({ key, qty });
  renderInventory();
  renderStats();
}
function removeItem(key, qty = 1) {
  const idx = S.inventory.findIndex((i) => i.key === key && i.qty != null);
  if (idx >= 0) {
    S.inventory[idx].qty -= qty;
    if (S.inventory[idx].qty <= 0) S.inventory.splice(idx, 1);
    renderInventory();
    renderStats();
    return true;
  }
  return false;
}
function addWeapon(weapon) {
  S.inventory.push(weapon);
  renderInventory();
  renderStats();
}
function removeWeaponById(id) {
  const idx = S.inventory.findIndex((i) => i.key === "weapon" && i.id === id);
  if (idx >= 0) {
    S.inventory.splice(idx, 1);
    renderInventory();
    renderStats();
    return true;
  }
  return false;
}
function equipWeaponById(id) {
  const w = S.inventory.find((i) => i.key === "weapon" && i.id === id);
  if (!w) return;
  // swap
  if (S.equipped.weapon) {
    S.inventory.push(S.equipped.weapon);
  }
  S.equipped.weapon = w;
  removeWeaponById(id);
  addLog(
    `You equip <strong>${w.name}</strong> <span class="good">(+${w.atk} ATK)</span>.`,
    "good"
  );
  renderInventory();
  renderStats();
}

// ---- Shield Pricing (single version; pass rollChance) ----
function priceForShield(def, rollChance, source = "drop") {
  // Expected mitigation scales value: def × (chance%)
  const eff = def * (rollChance / 100);
  return source === "shop"
    ? Math.round(60 + eff * 140 + S.depth * 12) // pricier in shops + depth
    : Math.round(30 + eff * 90 + Math.max(0, S.depth - 1) * 8); // drop value
}

// app.js — REPLACE your openInventoryModal() with this
function openInventoryModal() {
  const m = document.getElementById("invModal");
  const list = document.getElementById("invList");
  if (!m || !list) return;
  list.innerHTML = "";
  if (!S.inventory.length) list.innerHTML = "<p>(Inventory empty)</p>";

  S.inventory.forEach((it) => {
    const meta = LOOT_TABLE.find((x) => x.key === it.key);
    if (meta) {
      const row = document.createElement("p");
      row.innerHTML = `<strong>${meta.name}</strong> x${it.qty}`;
      const btn = document.createElement("button");
      btn.textContent = `Use ${meta.name} x1`;
      btn.addEventListener("click", () => useSpecificItem(it.key));
      list.appendChild(row);
      list.appendChild(btn);
    } else if (it.key === "weapon") {
      const row = document.createElement("p");
      row.innerHTML = `<strong>🗡️ ${it.name}</strong> <small>+${it.atk} • ${it.rarity}</small>`;
      const btn = document.createElement("button");
      btn.textContent = "Equip";
      btn.addEventListener("click", () => equipWeaponById(it.id));
      list.appendChild(row);
      list.appendChild(btn);
    } else if (it.key === "shield") {
      const row = document.createElement("p");
      row.innerHTML = `<strong>🛡️ ${it.name}</strong> <small>${it.def} DEF • ${it.rollChance}% • ${it.rarity}</small>`;
      const btn = document.createElement("button");
      btn.textContent = "Equip";
      btn.addEventListener("click", () => equipShieldById(it.id));
      list.appendChild(row);
      list.appendChild(btn);
    }
  });

  // If combat was open, temporarily close it to avoid dialog conflicts
  if (combatModal && combatModal.open) {
    resumeCombatAfterInv = true;
    try {
      combatModal.close();
    } catch {}
  }
  try {
    m.showModal();
  } catch {}
  renderStats();
}

function useSpecificItem(key) {
  const meta = LOOT_TABLE.find((l) => l.key === key);
  if (!meta) return;

  // --- Healers: any item with a numeric "heal"
  if (typeof meta.heal === "number") {
    if (removeItem(key, 1)) {
      const heal = Math.ceil(meta.heal * getHealMult());
      S.hp = Math.min(S.maxHp, S.hp + heal);
      const msg = `You drink ${meta.name} and restore <span class="good">${heal} HP</span>.`;
      addLog(msg, "good");
      if (document.getElementById("combatModal")?.open)
        addCombatLog(msg, "good");
      renderStats();
      if (S.enemy) enemyAttack();
    }
    return;
  }

  // --- Explosives: any item with a numeric "dmg"
  if (typeof meta.dmg === "number") {
    if (!S.enemy) {
      addLog("You consider lighting it… but decide against it.");
      return;
    }
    if (removeItem(key, 1)) {
      const dmg = meta.dmg;
      S.enemy.hp -= dmg;
      addCombatLog(`You use ${meta.name} for <strong>${dmg}</strong> damage!`);
      if (S.enemy.hp <= 0) {
        const gold = RNG.int(...S.enemy.gold);
        const xp = S.enemy.xp;

        // 🔒 Boss-specific defeat flow
        if (S.enemy.isBoss) {
          addCombatLog(
            `The ${S.enemy.name} is obliterated! <span class="good">${gold}g</span> scooped.`,
            "good"
          );
          gainGold(gold);
          gainXP(xp);
          handleBossDrops(S.enemy);
          S.enemy = null;
          setEncounterStatus("Idle");
          closeCombat();
          addLog(
            "<em>With the guardian fallen, a path below reveals itself…</em>",
            "good"
          );
          descend();
          return;
        }

        // Normal enemy defeat flow (no boss)
        addCombatLog(
          `The ${S.enemy.name} is obliterated! <span class="good">${gold}g</span> scooped.`,
          "good"
        );
        gainGold(gold);
        gainXP(xp);
        S.enemy = null;
        setEncounterStatus("Idle");
        closeCombat();
      } else {
        enemyAttack();
      }
      renderStats();
    }
    return;
  }

  addLog(`${meta.name} doesn't seem usable right now.`);
}

// ------------------------------
// Weapons: Drops & Shop variants
// ------------------------------
function priceForWeapon(atk, source = "drop") {
  return source === "shop"
    ? 50 + atk * 40 + S.depth * 10
    : 25 + atk * 25 + Math.max(0, S.depth - 1) * 6;
}
function rarityName(atk) {
  return atk >= 7
    ? "epic"
    : atk >= 5
    ? "rare"
    : atk >= 3
    ? "uncommon"
    : "common";
}
function pickDropWeapon() {
  const c = SWORDS.filter((w) => w.minDepth <= S.depth);
  return weightedPick(c);
}
function makeWeaponFromTemplate(tpl, source = "drop", powerFactor = 1) {
  const atk = Math.max(1, Math.floor(tpl.atk * powerFactor));
  return {
    key: "weapon",
    id: uid(),
    name: tpl.name,
    atk,
    rarity: rarityName(atk),
    price: priceForWeapon(atk, source),
    source,
  };
}
function maybeDropWeapon() {
  if (!RNG.chance(DROP_RATES.weapon)) return;
  const tpl = pickDropWeapon();
  const w = makeWeaponFromTemplate(tpl, "drop", 1);
  addWeapon(w);
  addLog(
    `You find a <strong>${w.name}</strong> <span class="good">(+${w.atk})</span>!`,
    "good"
  );
  flashGlimmer();
}

// ==============================
// Shields: drops, equip, pricing
// ==============================
function rarityNameShield(def) {
  return def >= 5
    ? "epic"
    : def >= 3
    ? "rare"
    : def >= 2
    ? "uncommon"
    : "common";
}
function pickDropShield() {
  const pool = SHIELDS.filter((s) => s.minDepth <= S.depth);
  return weightedPick(pool.length ? pool : SHIELDS);
}
function makeShieldFromTemplate(tpl, source = "drop") {
  return {
    key: "shield",
    id: uid(),
    name: tpl.name,
    def: tpl.def,
    rollChance: tpl.rollChance, // % chance to reduce damage
    rarity: rarityNameShield(tpl.def),
    price: priceForShield(tpl.def, tpl.rollChance, source),
    source,
  };
}
function addShield(sh) {
  S.inventory.push(sh);
  renderInventory();
  renderStats();
}
function removeShieldById(id) {
  const idx = S.inventory.findIndex((i) => i.key === "shield" && i.id === id);
  if (idx >= 0) {
    S.inventory.splice(idx, 1);
    renderInventory();
    renderStats();
    return true;
  }
  return false;
}
function equipShieldById(id) {
  const sh = S.inventory.find((i) => i.key === "shield" && i.id === id);
  if (!sh) return;
  if (S.equipped.shield) S.inventory.push(S.equipped.shield); // swap out
  S.equipped.shield = sh;
  removeShieldById(id);
  addLog(
    `You equip <strong>${sh.name}</strong> <span class="good">(${sh.def} DEF • ${sh.rollChance}% block)</span>.`,
    "good"
  );
  renderInventory();
  renderStats();
}
function maybeDropShield() {
  if (!RNG.chance(DROP_RATES.shield)) return;
  const tpl = pickDropShield();
  const sh = makeShieldFromTemplate(tpl, "drop");
  addShield(sh);
  addLog(
    `You find a <strong>${sh.name}</strong> <small>(${sh.def} DEF • ${sh.rollChance}% block)</small>!`,
    "good"
  );
  flashGlimmer();
}

// ------------------------------
// Progression
// ------------------------------
// Make higher-minDepth enemies slightly more common as depth increases
const ENEMY_BIAS = {
  perDepth: 0.02, // +2% weighting per depth
  cap: 0.6, // cap the extra weighting at +60%
  curve: 1.2, // >1 = slightly favors very new unlocks over mid-tier
  newUnlockBonus: 0.35, // flat bump for enemies unlocked at (depth-1 or depth)
};

function pickEnemyBiased(depth) {
  const byDepth = eligibleEnemies(depth);

  // --- Softer HP gate + explicit allow for late-game elites ---
  // This lets big elites enter the pool once you're past their minDepth,
  // without opening the floodgates to absolutely everything.
  const hpGate = 10 + depth * 18; // was *4; loosened so 300–350 HP can appear by mid-teens
  const eliteKeys = new Set(["tumeken", "nightmare"]); // always allow these at/after minDepth

  const byScale = byDepth.filter(
    (e) =>
      e.hp <= hpGate || (eliteKeys.has(e.key) && (e.minDepth ?? 1) <= depth)
  );

  const pool = byScale.length ? byScale : byDepth;

  // --- Existing biasing, with a tiny rarity nerf for huge elites ---
  const depthBias = Math.min(ENEMY_BIAS.cap, ENEMY_BIAS.perDepth * depth);

  const weightedPool = pool.map((e) => {
    const rel = Math.max(
      0,
      Math.min(1, (e.minDepth ?? 1) / Math.max(1, depth))
    );
    let w = 1 + depthBias * Math.pow(rel, ENEMY_BIAS.curve);
    if ((e.minDepth ?? 1) >= depth - 1) w += ENEMY_BIAS.newUnlockBonus;
    if (e.hp >= 200) w *= 0.6; // make big elites rarer but still possible
    return { ...e, weight: w };
  });

  const choice = weightedPick(weightedPool, "weight");
  const { weight, ...enemy } = choice;
  return clone(enemy);
}

function gainXP(x) {
  x = Math.max(1, Math.floor(x * getXpMult()));
  S.xp += x;
  addLog(`You gain <span class="good">${x} XP</span>.`, "good");
  while (S.xp >= S.xpToNext) {
    S.xp -= S.xpToNext;
    S.level++;
    S.maxHp += 4;
    S.hp = Math.min(S.maxHp, S.hp + 4);
    S.xpToNext = Math.round(S.xpToNext * 1.35);
    addLog(
      `<strong>Level Up!</strong> You are now <span class="good">Lv. ${S.level}</span>.`,
      "good"
    );
  }
  renderStats();
}
function gainGold(g) {
  g = Math.max(0, Math.floor(g * getGoldMult()));
  S.gold += g;
  renderStats();
}

// ------------------------------
// Encounters & Combat
// ------------------------------
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ---------- Generic Event Modal (two choices, no "X") ----------
let __eventModal = null;

function ensureEventModal() {
  if (__eventModal) return __eventModal;

  const d = document.createElement("dialog");
  d.id = "eventModal";
  d.addEventListener("cancel", (e) => e.preventDefault()); // disable Esc-close

  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    minWidth: "min(520px, 92vw)",
    maxWidth: "92vw",
    padding: "18px 16px",
    borderRadius: "14px",
    border: "1px solid #263774",
    background: "linear-gradient(180deg, #0a0f1f, #070a15)",
    color: "#e8edff",
    textAlign: "center",
    fontFamily: "inherit",
  });

  const img = document.createElement("img");
  img.id = "eventImg";
  Object.assign(img.style, {
    maxWidth: "60%",
    maxHeight: "120px",
    display: "block",
    margin: "0 auto 10px",
    border: "1px solid #263774",
    borderRadius: "12px",
    imageRendering: "pixelated",
  });

  const title = document.createElement("div");
  title.id = "eventTitle";
  Object.assign(title.style, {
    fontSize: "20px",
    marginBottom: "6px",
    color: "#c7d2ff",
  });

  const body = document.createElement("div");
  body.id = "eventBody";
  Object.assign(body.style, { marginBottom: "14px", lineHeight: "1.35" });

  const actions = document.createElement("div");
  Object.assign(actions.style, {
    display: "flex",
    gap: "10px",
    justifyContent: "center",
    flexWrap: "wrap",
  });

  const primary = document.createElement("button");
  primary.id = "eventPrimary";
  primary.textContent = "OK";
  primary.style.padding = "10px 14px";
  primary.style.borderRadius = "999px";
  primary.style.border = "1px solid #c98d0b";
  primary.style.cursor = "pointer";
  primary.style.font = "inherit";
  primary.style.minWidth = "140px";
  primary.style.boxShadow = "0 8px 24px rgba(0,0,0,.35)";
  primary.style.background = "linear-gradient(180deg, #ffd76e, #ffb703)";
  primary.style.color = "#2b2411";

  const secondary = document.createElement("button");
  secondary.id = "eventSecondary";
  secondary.textContent = "Cancel";
  secondary.style.padding = "10px 14px";
  secondary.style.borderRadius = "999px";
  secondary.style.border = "1px solid #3b425a";
  secondary.style.cursor = "pointer";
  secondary.style.font = "inherit";
  secondary.style.minWidth = "140px";
  secondary.style.background = "transparent";
  secondary.style.color = "#e8edff";

  actions.appendChild(primary);
  actions.appendChild(secondary);

  wrap.appendChild(img);
  wrap.appendChild(title);
  wrap.appendChild(body);
  wrap.appendChild(actions);
  d.appendChild(wrap);
  document.body.appendChild(d);

  __eventModal = d;
  return d;
}

// ---------- Lobby Modal ----------
let __lobby = null;
function ensureLobby() {
  if (__lobby) return __lobby;

  const d = document.createElement("dialog");
  d.id = "lobbyModal";
  d.addEventListener("cancel", (e) => e.preventDefault());

  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    minWidth: "min(640px, 96vw)",
    padding: "18px 16px",
    borderRadius: "14px",
    border: "1px solid #2a3a7a",
    background: "linear-gradient(180deg, #0c1224, #0a0e1d)",
    color: "#e8edff",
    fontFamily: "inherit",
  });

  const title = document.createElement("div");
  title.textContent = "Lobby — Upgrades";
  Object.assign(title.style, {
    fontSize: "22px",
    marginBottom: "6px",
    color: "#c7d2ff",
    textAlign: "center",
  });

  const tokens = document.createElement("div");
  tokens.id = "lobbyTokens";
  tokens.textContent = "Tokens: 0";
  Object.assign(tokens.style, {
    textAlign: "center",
    marginBottom: "10px",
    color: "#ffd76e",
  });

  const grid = document.createElement("div");
  grid.id = "lobbyGrid";
  Object.assign(grid.style, {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "10px",
    marginBottom: "14px",
  });

  const actions = document.createElement("div");
  Object.assign(actions.style, {
    display: "flex",
    gap: "10px",
    justifyContent: "center",
    flexWrap: "wrap",
  });

  const startBtn = document.createElement("button");
  startBtn.textContent = "Enter Dungeon";
  Object.assign(startBtn.style, {
    padding: "10px 14px",
    borderRadius: "999px",
    border: "1px solid #c98d0b",
    background: "linear-gradient(180deg, #ffd76e, #ffb703)",
    color: "#2b2411",
    cursor: "pointer",
    minWidth: "160px",
  });
  startBtn.addEventListener("click", () => {
    try {
      d.close();
    } catch {}
    newGame();
  });

  const resetBtn = document.createElement("button");
  resetBtn.textContent = "Respec (75% refund)";
  Object.assign(resetBtn.style, {
    padding: "10px 14px",
    borderRadius: "999px",
    border: "1px solid #3b425a",
    background: "transparent",
    color: "#e8edff",
    cursor: "pointer",
    minWidth: "160px",
  });
  resetBtn.addEventListener("click", () => {
    openEventModal({
      title: "Reset Upgrades?",
      html: "Refund 75% of all tokens spent, and set all upgrade tiers to 0.",
      primaryText: "Confirm Reset",
      secondaryText: "Cancel",
      onPrimary: () => {
        refundAllUpgrades();
        renderLobby();
      },
    });
  });

  actions.appendChild(startBtn);
  actions.appendChild(resetBtn);

  wrap.appendChild(title);
  wrap.appendChild(tokens);
  wrap.appendChild(grid);
  wrap.appendChild(actions);
  d.appendChild(wrap);
  document.body.appendChild(d);

  __lobby = d;
  return d;
}

function renderLobby() {
  ensureMetaShape();
  const d = ensureLobby();
  const tokenEl = d.querySelector("#lobbyTokens");
  const grid = d.querySelector("#lobbyGrid");
  tokenEl.textContent = `Tokens: ${META.tokens}`;

  grid.innerHTML = "";
  Object.entries(UPGRADE_DEFS).forEach(([key, def]) => {
    const tier = getTier(key);
    const atMax = tier >= def.maxTier;
    const price = atMax ? "MAX" : def.cost(tier);

    const card = document.createElement("div");
    Object.assign(card.style, {
      border: "1px solid #2a3a7a",
      borderRadius: "12px",
      padding: "12px",
      background: "rgba(255,255,255,0.03)",
    });

    const h = document.createElement("div");
    h.innerHTML = `<strong>${def.label}</strong>`;
    h.style.marginBottom = "6px";

    const p = document.createElement("div");
    p.style.opacity = "0.9";
    p.style.fontSize = "0.95em";
    p.textContent = def.desc;

    const t = document.createElement("div");
    t.style.margin = "8px 0";
    t.innerHTML = `Tier: <strong>${tier}</strong> / ${def.maxTier}`;

    const buy = document.createElement("button");
    buy.textContent = atMax ? "Maxed" : `Buy — ${price} tokens`;
    Object.assign(buy.style, {
      padding: "8px 10px",
      borderRadius: "999px",
      border: "1px solid #c98d0b",
      background: atMax
        ? "transparent"
        : "linear-gradient(180deg, #ffd76e, #ffb703)",
      color: atMax ? "#aaa" : "#2b2411",
      cursor: atMax ? "not-allowed" : "pointer",
      minWidth: "140px",
    });
    buy.disabled = atMax || !canBuy(key);
    buy.addEventListener("click", () => buyUpgrade(key));

    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(t);
    card.appendChild(buy);
    grid.appendChild(card);
  });
}

function openLobby() {
  renderLobby();
  try {
    ensureLobby().showModal();
  } catch {}
}

function openEventModal({
  title,
  img,
  html,
  primaryText,
  secondaryText,
  onPrimary,
  onSecondary,
}) {
  const d = ensureEventModal();
  d.querySelector("#eventTitle").innerHTML = title || "";
  d.querySelector("#eventBody").innerHTML = html || "";
  const im = d.querySelector("#eventImg");
  if (img) {
    im.style.display = "block";
    im.src = img;
    im.alt = title || "event";
  } else {
    im.style.display = "none";
  }

  const p = d.querySelector("#eventPrimary");
  const s = d.querySelector("#eventSecondary");
  p.textContent = primaryText || "OK";
  s.textContent = secondaryText || "Cancel";

  // Clear old handlers by replacing nodes
  const pClone = p.cloneNode(true);
  const sClone = s.cloneNode(true);
  p.parentNode.replaceChild(pClone, p);
  s.parentNode.replaceChild(sClone, s);

  pClone.addEventListener("click", () => {
    try {
      onPrimary?.();
    } finally {
      closeEventModal();
    }
  });
  sClone.addEventListener("click", () => {
    try {
      onSecondary?.();
    } finally {
      closeEventModal();
    }
  });

  // Enter -> primary, Backspace -> secondary (Esc disabled)
  d.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      pClone.click();
    } else if (e.key.toLowerCase() === "backspace") {
      e.preventDefault();
      sClone.click();
    }
  };

  try {
    d.showModal();
  } catch {}
}

function closeEventModal() {
  if (__eventModal?.open) {
    try {
      __eventModal.close();
    } catch {}
  }
}

// --------- Modal-based Events (no confirms) ----------
function doTreasureChest() {
  openEventModal({
    title: "Iron-Banded Chest",
    img: "assets/treasureSVG.svg",
    html: "A heavy chest sits half-buried in rubble. It could be a jackpot… or a trap.",
    primaryText: "Open the Chest",
    secondaryText: "Leave It",
    onPrimary: () => {
      const roll = RNG.int(1, 100);
      if (roll <= 20) {
        // Mimic!
        const byDepth = eligibleEnemies(S.depth);
        const meta = RNG.pick(byDepth);
        S.enemy = clone(meta);
        setEncounterStatus("Mimic!");
        openCombat(
          `The chest sprouts fangs! It's a <strong>${S.enemy.name}</strong>! (HP ${S.enemy.hp})`
        );
      } else if (roll <= 80) {
        const gold = RNG.int(50 + S.depth, 25 + S.depth * 2);
        addLog(`Inside: <strong>${gold}g</strong>.`, "good");
        gainGold(gold);
      } else {
        const loot = RNG.pick(LOOT_TABLE);
        addItem(loot.key, 2);
        addLog(`Inside: <strong>${loot.name}</strong>.`, "good");
      }
    },
    onSecondary: () => addLog("You leave the chest untouched."),
  });
}

function doFountain() {
  openEventModal({
    title: "Glowing Fountain",
    img: "assets/fountainSVG.svg",
    html: "Waters shimmer with faint magic. Drink to risk boon or bane.",
    primaryText: "Drink",
    secondaryText: "Do Not Drink",
    onPrimary: () => {
      const roll = RNG.int(1, 100);
      if (roll <= 40) {
        const heal = Math.ceil((10 + Math.floor(S.depth / 3)) * getHealMult());
        S.hp = Math.min(S.maxHp, S.hp + heal);
        addLog(
          `The water is rejuvenating. <span class="good">+${heal} HP</span>.`,
          "good"
        );
      } else if (roll <= 70) {
        const heal = Math.ceil((12 + Math.floor(S.depth / 5)) * getHealMult());
        S.hp = Math.min(S.maxHp, S.hp + heal);
        addLog(
          `Cool and refreshing. <span class="good">+${heal} HP</span>.`,
          "good"
        );
      } else if (roll <= 90) {
        addLog("Nothing happens. Perhaps its magic is spent.");
      } else {
        const dmg = RNG.int(2, 15);
        S.hp = Math.max(0, S.hp - dmg);
        addLog(`Ugh—tainted! <span class="bad">-${dmg} HP</span>.`, "bad");
        if (S.hp <= 0) return onDeath();
      }
      renderStats();
    },
    onSecondary: () => addLog("You decide against it and move on."),
  });
}

function doCampfire() {
  openEventModal({
    title: "Smoldering Campfire",
    img: "assets/campfireSVG.svg",
    html: "The embers still glow. Resting here could restore you… or draw attention.",
    primaryText: "Rest",
    secondaryText: "Move On",
    onPrimary: () => {
      const heal = Math.ceil(RNG.int(3, 20) * getHealMult());
      S.hp = Math.min(S.maxHp, S.hp + heal);
      addLog(
        `You warm your bones. <span class="good">+${heal} HP</span>.`,
        "good"
      );
      renderStats();
      if (RNG.chance(15)) {
        addLog("Shadows stir beyond the light…", "warn");
        const byDepth = eligibleEnemies(S.depth);
        S.enemy = clone(RNG.pick(byDepth));
        setEncounterStatus("Ambush!");
        openCombat(
          `Ambush! A <strong>${S.enemy.name}</strong> lunges from the dark! (HP ${S.enemy.hp})`
        );
      }
    },
    onSecondary: () => addLog("You keep your distance."),
  });
}

function doSecretPassage() {
  openEventModal({
    title: "Hidden Lever",
    img: "assets/leverSVG.svg",
    html: "A loose stone reveals a concealed lever. It might expose new routes.",
    primaryText: "Pull the Lever",
    secondaryText: "Leave It",
    onPrimary: () => {
      addLog("Hidden passages grind open…", "good");
      S.exitDiscovered = true;
      const R = 1;
      for (let dy = -R; dy <= R; dy++) {
        const y = S.pos.y + dy;
        if (!S.map[y]) continue;
        for (let dx = -R; dx <= R; dx++) {
          const x = S.pos.x + dx;
          if (S.map[y][x] !== undefined) S.map[y][x] = true;
        }
      }
      addLog(
        "You mark the route to a hidden stairwell <strong>★</strong>.",
        "good"
      );
      renderMap();
    },
    onSecondary: () => addLog("You resist the urge to meddle."),
  });
}

function doOreVein() {
  openEventModal({
    title: "Glittering Ore Vein",
    img: "assets/oreSVG.svg",
    html: "Rich veins snake through the rock. Mining might pay… or cause a cave-in.",
    primaryText: "Mine Ore",
    secondaryText: "Leave It",
    onPrimary: () => {
      const gold = RNG.int(10 + S.depth, 15 + S.depth * 2);
      addLog(`You chip free <strong>${gold}g</strong>.`, "good");
      gainGold(gold);
      if (RNG.chance(20)) {
        const dmg = RNG.int(1, 10);
        S.hp = Math.max(0, S.hp - dmg);
        addLog(
          `The ceiling sheds rubble! <span class="bad">-${dmg} HP</span>.`,
          "bad"
        );
        if (S.hp <= 0) return onDeath();
        renderStats();
      }
    },
    onSecondary: () => addLog("You move on, pockets unfilled."),
  });
}

function doAncientTablet() {
  openEventModal({
    title: "Ancient Tablet",
    img: "assets/tabletSVG.svg",
    html: "Runes spiral in a forgotten script. Study them to glean hidden lore.",
    primaryText: "Study",
    secondaryText: "Ignore",
    onPrimary: () => {
      const xp = RNG.int(5, 55) + Math.floor(S.depth / 3);
      addLog(
        `You decipher a fragment of lore. <span class="good">+${xp} XP</span>.`,
        "good"
      );
      gainXP(xp);
    },
    onSecondary: () =>
      addLog("You avert your eyes from the unsettling glyphs."),
  });
}

function rollEncounter(opts = {}) {
  // New target distribution (out of 100):
  //  1–28   => Enemy (28%)                      ↓ fewer monsters
  // 29–43   => Trap (15%)                        ↓ fewer traps
  // 44–65   => Event bundle (22%)                ↑ more events
  //              (biased toward loot-only events; no surprise combats)
  // 66–75   => Wandering Trader (10%)            (falls back to loot event if on cooldown)
  // 76–80   => Weapon Trader (5%)                (falls back to loot event if on cooldown)
  // 81–100  => Empty (20%)
  const { forbidEvents = false } = opts;

  // No random encounters on boss floors
  if (isBossFloor(S.depth)) return;

  // ---------- Loot-only micro events (guaranteed loot, zero combat) ----------
  const doLooseStash = () => {
    // 1–2 consumables from LOOT_TABLE
    const cnt = RNG.chance(40) ? 2 : 1;
    const picks = [];
    for (let i = 0; i < cnt; i++) picks.push(RNG.pick(LOOT_TABLE));

    // Merge duplicates for a cleaner dialog
    const merged = {};
    picks.forEach((p) => {
      merged[p.key] = (merged[p.key] || 0) + 1;
    });

    const lines = Object.entries(merged).map(([k, q]) => {
      const meta = LOOT_TABLE.find((l) => l.key === k);
      return `<li><strong>${meta?.name || k}</strong> ×${q}</li>`;
    });

    if (forbidEvents) {
      // Rest forbids modals — just grant
      Object.entries(merged).forEach(([k, q]) => addItem(k, q));
      addLog(
        `You find a tucked-away stash: ${lines.length} item(s) added.`,
        "good"
      );
      return;
    }

    openEventModal({
      title: "Loose Stash",
      img: "assets/treasureSVG.svg",
      html: `Under a broken flagstone you uncover:<ul style="text-align:left;margin:8px 0 0 20px">${lines.join(
        ""
      )}</ul>`,
      primaryText: "Take Everything",
      secondaryText: "Leave It",
      onPrimary: () => {
        Object.entries(merged).forEach(([k, q]) => {
          addItem(k, q);
          const meta = LOOT_TABLE.find((l) => l.key === k);
          addLog(`You take <strong>${meta?.name || k}</strong> ×${q}.`, "good");
        });
      },
      onSecondary: () => addLog("You leave the stash untouched."),
    });
  };

  const doGearCache = () => {
    // One free weapon or shield (no strings attached)
    const giveWeapon = RNG.chance(50);
    if (giveWeapon) {
      const tpl = pickDropWeapon();
      const w = makeWeaponFromTemplate(tpl, "drop", 1.0);
      if (forbidEvents) {
        addWeapon(w);
        addLog(
          `You pry open a gear cache: <strong>${w.name}</strong> <span class="good">(+${w.atk})</span>.`,
          "good"
        );
        return;
      }
      openEventModal({
        title: "Gear Cache",
        img: "assets/treasureSVG.svg",
        html: `Inside the splintered crate lies a <strong>${w.name}</strong> <span class="good">(+${w.atk})</span>.`,
        primaryText: "Take Weapon",
        secondaryText: "Leave It",
        onPrimary: () => {
          addWeapon(w);
          addLog(
            `You take <strong>${w.name}</strong> <span class="good">(+${w.atk})</span>.`,
            "good"
          );
        },
        onSecondary: () => addLog("You leave the cache closed."),
      });
    } else {
      const tpl = pickDropShield();
      const sh = makeShieldFromTemplate(tpl, "drop");
      if (forbidEvents) {
        addShield(sh);
        addLog(
          `You pry open a gear cache: <strong>${sh.name}</strong> <small>(${sh.def} DEF • ${sh.rollChance}% block)</small>.`,
          "good"
        );
        return;
      }
      openEventModal({
        title: "Gear Cache",
        img: "assets/treasureSVG.svg",
        html: `Packed in straw: <strong>${sh.name}</strong> <small>(${sh.def} DEF • ${sh.rollChance}% block)</small>.`,
        primaryText: "Take Shield",
        secondaryText: "Leave It",
        onPrimary: () => {
          addShield(sh);
          addLog(
            `You take <strong>${sh.name}</strong> <small>(${sh.def} DEF • ${sh.rollChance}% block)</small>.`,
            "good"
          );
        },
        onSecondary: () => addLog("You leave the cache closed."),
      });
    }
  };

  // Pick a weighted event, biased toward loot/gold
  const runWeightedEvent = () => {
    if (forbidEvents) {
      // If we were called while resting with forbidEvents=true, still allow non-modal loot
      RNG.chance(55) ? doLooseStash() : doGearCache();
      return;
    }
    const eventPool = [
      { fn: doLooseStash, weight: 6 }, // ⭐ guaranteed consumable loot
      { fn: doGearCache, weight: 3 }, // ⭐ guaranteed gear (weapon/shield)
      { fn: doOreVein, weight: 3 }, // 💰 gold
      { fn: doTreasureChest, weight: 2 }, // 💰/🎁 (mimic possible, lower weight)
      { fn: doAncientTablet, weight: 2 }, // 📜 XP
      { fn: doCampfire, weight: 2 }, // ✚ heal (risk ambush)
      { fn: doFountain, weight: 2 }, // ✚ small heal / risk
      { fn: doSecretPassage, weight: 1 }, // ★ reveal exit
    ];
    const choice = weightedPick(eventPool, "weight");
    choice.fn();
  };

  const r = RNG.int(1, 100);

  // --- Enemy (28%) ---
  if (r <= 28) {
    S.enemy = pickEnemyBiased(S.depth);
    setEncounterStatus("Enemy!");
    openCombat(
      `A <strong>${S.enemy.name}</strong> emerges from the dark! (HP ${S.enemy.hp})`
    );
    return;
  }

  // --- Trap (15%) ---
  if (r <= 43) {
    const dmg = RNG.int(1, 2 + Math.floor(S.depth / 2));
    S.hp = Math.max(0, S.hp - dmg);
    addLog(
      `A hidden trap damages you for <span class="bad">${dmg} damage</span>.`,
      "bad"
    );
    if (S.hp <= 0) return onDeath();
    renderStats();
    return;
  }

  // --- Event bundle (22%) ---
  if (r <= 65) {
    runWeightedEvent();
    return;
  }

  // --- Wandering Trader (10%) ---
  if (r <= 75) {
    if (S.traderCooldown <= 0) {
      openShop();
      S.traderCooldown = 8;
    } else {
      // Fallback to a loot-leaning event
      runWeightedEvent();
    }
    return;
  }

  // --- Weapon Trader (5%) ---
  if (r <= 80) {
    if (S.traderCooldown <= 0) {
      openWeaponShop();
      S.traderCooldown = 8;
    } else {
      // Fallback to a loot-leaning event
      runWeightedEvent();
    }
    return;
  }

  // --- Empty (20%) ---
  addLog("This room appears empty.");
}

function enemyAttack() {
  if (!S.enemy) return;

  let dmg = RNG.int(S.enemy.atk[0], S.enemy.atk[1]);
  let reduced = 0;

  const sh = S.equipped?.shield;
  if (sh && RNG.chance(sh.rollChance)) {
    reduced = Math.min(dmg, sh.def);
    dmg -= reduced;
  }

  if (reduced > 0) {
    addCombatLog(
      `🛡️ Your ${sh.name} reduces damage by <strong>${reduced}</strong>.`,
      "good"
    );
  }

  S.hp = Math.max(0, S.hp - dmg);
  addCombatLog(
    `${S.enemy.name} strikes for <span class="bad">${dmg}</span>.`,
    "bad"
  );
  renderStats();

  if (S.hp <= 0) {
    addCombatLog("<strong>You collapse…</strong>", "bad");
    closeCombat(true);
    onDeath();
  }
}

function currentWeaponBonus() {
  return S &&
    S.equipped &&
    S.equipped.weapon &&
    typeof S.equipped.weapon.atk === "number"
    ? S.equipped.weapon.atk
    : 0;
}

function playerAttack() {
  try {
    if (!S.enemy) return;

    const base = [2, 6];
    const wpn = currentWeaponBonus();
    const dmg = RNG.int(
      base[0] + Math.floor(S.level / 2) + wpn,
      base[1] + Math.floor(S.level / 1.5) + wpn
    );

    S.enemy.hp -= dmg;
    const wtxt =
      wpn && S?.equipped?.weapon ? ` with your ${S.equipped.weapon.name}` : "";
    addCombatLog(`You strike${wtxt} for <strong>${dmg}</strong>.`);
    renderStats();

    if (S.enemy.hp <= 0) {
      const gold = RNG.int(...S.enemy.gold);
      const xp = S.enemy.xp;

      if (S.enemy.isBoss) {
        addCombatLog(
          `The ${S.enemy.name} is vanquished! You seize <span class="good">${gold}g</span>.`,
          "good"
        );
        gainGold(gold);
        gainXP(xp);

        // Boss-specific drops
        handleBossDrops(S.enemy);

        S.enemy = null;
        setEncounterStatus("Idle");
        closeCombat();

        addLog(
          "<em>With the guardian fallen, a shift in the stone reveals a path below…</em>",
          "good"
        );
        // Auto-descend after a boss
        descend();
        return; // important: don't fall through to normal drop logic
      }

      // --- Normal enemy defeat flow ---
      addCombatLog(
        `The ${S.enemy.name} is defeated! You loot <span class="good">${gold}g</span>.`,
        "good"
      );
      gainGold(gold);
      gainXP(xp);
      maybeDropWeapon();
      maybeDropShield();
      S.enemy = null;
      setEncounterStatus("Idle");
      closeCombat();

      if (RNG.chance(5)) {
        addLog(
          "<em>You feel the dungeon pull you deeper within...But Cody's scared so we will stay here...</em>"
        );
      }
      renderStats();
    } else {
      enemyAttack();
    }
  } catch (err) {
    console.error("Attack error:", err);
    addCombatLog(
      `<span class="bad">[Error]</span> Attack failed: ${err.message || err}`,
      "bad"
    );
  }
}

function tryFlee() {
  if (!S.enemy) return;

  if (S.enemy.isBoss) {
    addCombatLog("There is no escape from this foe!", "warn");
    enemyAttack();
    return;
  }

  if (RNG.chance(55)) {
    addCombatLog("You slip away into the shadows.", "good");
    S.enemy = null;
    setEncounterStatus("Idle");
    closeCombat();
  } else {
    addCombatLog("You fail to escape!", "warn");
    enemyAttack();
  }
}

// ------------------------------
// Shops
// ------------------------------
const shopModal = document.getElementById("shopModal");

function openShop() {
  // General trader: potions & (normal) bombs
  const offers = Array.from({ length: 3 }, () => RNG.pick(LOOT_TABLE));
  renderShopUI(
    "A Wandering Trader",
    offers.map((o) => ({ type: "consumable", item: o })),
    []
  );
}

// Replacement: weapon shop with 5 unique, cheaper items
function openWeaponShop() {
  // Choose from templates unlocked at current depth
  const candidates = SWORDS.filter((w) => w.minDepth <= S.depth);

  // Grab up to 5 unique templates (weighted, no duplicates)
  const uniqueTemplates = pickUniqueWeighted(candidates, 5);

  // Build shop items at FULL power (no reduction/replicas)
  const weaponsForSale = uniqueTemplates.map((tpl) => {
    // Full strength: powerFactor = 1.0
    const w = makeWeaponFromTemplate(tpl, "shop", 1.0);

    // Use the gentler shop price curve you defined
    w.price = shopWeaponPrice(w.atk);

    return w;
  });

  // Only weapons here (no bombs), exactly 5 if available
  const offers = weaponsForSale.map((w) => ({ type: "weapon", item: w }));

  renderShopUI("A Weapon Trader", offers, weaponsForSale);
}

function renderShopUI(title, offers, weaponsForSale) {
  $("#shopTitle").textContent = title;
  const list = $("#shopList");
  const actions = $("#shopActions");
  const sellList = $("#sellList");
  const sellActions = $("#sellActions");
  list.innerHTML = "";
  actions.innerHTML = "";
  sellList.innerHTML = "";
  sellActions.innerHTML = "";

  // BUY
  offers.forEach((o, idx) => {
    if (o.type === "consumable") {
      const it = o.item;
      const p = document.createElement("p");
      p.innerHTML = `${idx + 1}. <strong>${it.name}</strong> — ${it.price}g`;
      list.appendChild(p);
      const b = document.createElement("button");
      b.textContent = `Buy ${it.name}`;
      b.addEventListener("click", () => {
        if (S.gold >= it.price) {
          S.gold -= it.price;
          addItem(it.key, 1);
          addLog(`Purchased ${it.name} for ${it.price}g.`, "good");
          renderStats();
        } else {
          addLog("Not enough gold to trade.");
        }
      });
      actions.appendChild(b);
    } else if (o.type === "weapon") {
      const w = o.item;
      const p = document.createElement("p");
      p.innerHTML = `${idx + 1}. <strong>🗡️ ${w.name}</strong> <small>+${
        w.atk
      } • ${w.rarity}</small> — ${w.price}g`;
      list.appendChild(p);
      const b = document.createElement("button");
      b.textContent = `Buy ${w.name}`;
      b.addEventListener("click", () => {
        if (S.gold >= w.price) {
          S.gold -= w.price;
          addWeapon({ ...w });
          addLog(`Purchased ${w.name} for ${w.price}g.`, "good");
          renderStats();
        } else {
          addLog("Not enough gold to trade.");
        }
      });
      actions.appendChild(b);
    }
  });

  // SELL (50% of value)
  if (!S.inventory.length) sellList.innerHTML = "<p>(Nothing to sell)</p>";

  // Consumables
  S.inventory.forEach((it) => {
    const meta = LOOT_TABLE.find((x) => x.key === it.key);
    if (meta) {
      const price = Math.max(1, Math.floor((meta.price || 1) * 0.5));
      const p = document.createElement("p");
      p.innerHTML = `<strong>${meta.name}</strong> x${it.qty} — ${price}g each`;
      sellList.appendChild(p);
      const b = document.createElement("button");
      b.textContent = `Sell 1 ${meta.name}`;
      b.addEventListener("click", () => {
        if (removeItem(it.key, 1)) {
          S.gold += price;
          addLog(`Sold ${meta.name} for ${price}g.`, "good");
          renderStats();
          renderShopUI(title, offers, weaponsForSale);
        }
      });
      sellActions.appendChild(b);
    }
  });

  // Weapons
  S.inventory
    .filter((x) => x.key === "weapon")
    .forEach((w) => {
      const price = Math.max(
        1,
        Math.floor((w.price || priceForWeapon(w.atk, "drop")) * 0.5)
      );
      const p = document.createElement("p");
      p.innerHTML = `<strong>🗡️ ${w.name}</strong> <small>+${w.atk} • ${w.rarity}</small> — ${price}g`;
      sellList.appendChild(p);
      const b = document.createElement("button");
      b.textContent = `Sell ${w.name}`;
      b.addEventListener("click", () => {
        if (removeWeaponById(w.id)) {
          S.gold += price;
          addLog(`Sold ${w.name} for ${price}g.`, "good");
          renderStats();
          renderShopUI(title, offers, weaponsForSale);
        }
      });
      sellActions.appendChild(b);
    });

  // Shields (moved outside weapon loop to avoid duplication)
  S.inventory
    .filter((x) => x.key === "shield")
    .forEach((sh) => {
      const price = Math.max(
        1,
        Math.floor(
          (sh.price || priceForShield(sh.def, sh.rollChance, "drop")) * 0.5
        )
      );
      const p = document.createElement("p");
      p.innerHTML = `<strong>🛡️ ${sh.name}</strong> <small>${sh.def} DEF • ${sh.rollChance}% • ${sh.rarity}</small> — ${price}g`;
      sellList.appendChild(p);
      const b = document.createElement("button");
      b.textContent = `Sell ${sh.name}`;
      b.addEventListener("click", () => {
        if (removeShieldById(sh.id)) {
          S.gold += price;
          addLog(`Sold ${sh.name} for ${price}g.`, "good");
          renderStats();
          renderShopUI(title, offers, weaponsForSale);
        }
      });
      sellActions.appendChild(b);
    });

  renderStats();
  try {
    shopModal?.showModal();
  } catch {}
}

// ------------------------------
// Movement & Actions
// ------------------------------
function move(dx, dy) {
  if (S.enemy) {
    addLog(
      "You cannot move while engaged! Try <strong>Flee</strong> or resolve the fight.",
      "warn"
    );
    return;
  }

  const nx = Math.max(0, Math.min(S.mapSize - 1, S.pos.x + dx));
  const ny = Math.max(0, Math.min(S.mapSize - 1, S.pos.y + dy));
  const revisiting = !!(S.map[ny] && S.map[ny][nx]);

  S.pos.x = nx;
  S.pos.y = ny;
  S.map[ny][nx] = true;

  if (S.traderCooldown > 0) S.traderCooldown--;

  renderMap();
  setRoom();

  // 🔒 Boss floors: no exit, no encounters, no wandering
  if (isBossFloor(S.depth)) {
    addLog("There is no way out but through…", "warn");
    setEncounterStatus(S.enemy ? "Boss!" : "Idle");
    return;
  }

  if (checkExitContact()) return;

  if (revisiting) {
    addLog("You return to a room you already explored. It's quiet.");
    setEncounterStatus("Idle");
    return;
  }

  rollEncounter();
}

function rest() {
  const diminish = restDiminish(S.restsThisFloor);
  const base = RNG.int(2, 6) * getHealMult(); // slightly tighter band plays nicer with decay
  const extra = Math.max(0, base - 1);
  const decayedExtra = Math.floor(extra * diminish);
  const heal = Math.max(1, 1 + decayedExtra); // always at least 1 HP

  S.hp = Math.min(S.maxHp, S.hp + heal);
  S.restsThisFloor++;

  addLog(
    `You rest, patching wounds (+<span class="good">${heal} HP</span>)` +
      (S.restsThisFloor > 1
        ? ` <small>(${diminish.toFixed(2)}% this floor)</small>`
        : ""),
    "good"
  );

  if (RNG.chance(15)) {
    addLog("You hear something behind you!", "warn");
    rollEncounter({ forbidEvents: true });
  }

  renderStats();
}

function useScoutPulse() {
  if (S.scoutCharges <= 0) {
    addLog("Your scouting sense is spent.", "warn");
    return;
  }
  S.scoutCharges--;

  const cells = [{ x: S.pos.x, y: S.pos.y }];

  const dirs = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  const neighbors = dirs
    .map(([dx, dy]) => ({ x: S.pos.x + dx, y: S.pos.y + dy }))
    .filter((c) => c.x >= 0 && c.y >= 0 && c.x < S.mapSize && c.y < S.mapSize);

  // Prefer undiscovered first, then fill up to 3
  neighbors.sort((a, b) => {
    const A = S.map[a.y][a.x] ? 1 : 0;
    const B = S.map[b.y][b.x] ? 1 : 0;
    return A - B; // false (0) first → undiscovered first
  });

  cells.push(...neighbors.slice(0, 3));

  for (const c of cells) {
    if (S.map[c.y]) S.map[c.y][c.x] = true; // mark as discovered => revisits are quiet; no events/enemies will roll
  }

  addLog(
    "You survey the area—nearby rooms are now charted (no threats stirred).",
    "good"
  );
  renderMap();
  renderStats();
}

function waitTurn() {
  addLog("You wait, knowing the only way out is to keep moving…");
}

// ------------------------------
// Death & New Game
// ------------------------------
// function onDeath() {
//   addLog("<strong>You are dead…</strong>", "bad");
//   setEncounterStatus("Defeated");
//   newGame();
// }

function onDeath() {
  // Close any open dialogs to avoid stacking issues
  document.querySelectorAll("dialog").forEach((d) => {
    try {
      if (d.open) d.close();
    } catch {}
  });

  // 🔒 PERMADEATH: erase the save slot immediately
  try {
    localStorage.removeItem("retro-dungeon-save");
  } catch {}

  addLog("<strong>You are dead…</strong>", "bad");
  setEncounterStatus("Defeated");

  // Build and show the dramatic death screen
  showDeathScreen();
}

function calcRunTokens() {
  const raw = S.depth * 2 + S.level * 1 + S.gold / 50;
  return Math.max(1, Math.floor(raw * TOKEN_MULT));
}

function showDeathScreen() {
  const old = document.getElementById("deathScreen");
  if (old) old.remove();

  // 🎁 Award tokens for the run
  const earned = calcRunTokens();
  META.tokens = (META.tokens || 0) + earned;
  saveMeta();

  const weaponTxt = S.equipped?.weapon
    ? `${S.equipped.weapon.name} (+${S.equipped.weapon.atk})`
    : "None";
  const depthTxt = `Depth ${S.depth}`;
  const levelTxt = `Lv. ${S.level}`;
  const goldTxt = `${S.gold}g`;

  const overlay = document.createElement("div");
  overlay.id = "deathScreen";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "100000",
    display: "grid",
    placeItems: "center",
    pointerEvents: "auto",
    background:
      "radial-gradient(70% 60% at 50% 35%, rgba(120,0,0,0.55), rgba(0,0,0,0.92))",
    animation: "deathFadeIn 300ms ease-out both",
  });

  const panel = document.createElement("div");
  Object.assign(panel.style, {
    width: "min(560px, 92vw)",
    padding: "20px 18px",
    borderRadius: "16px",
    border: "1px solid #5a1c1c",
    background: "linear-gradient(180deg, #1b0d10, #0b0507)",
    boxShadow: "0 10px 60px rgba(0,0,0,.7), inset 0 0 40px rgba(255,0,0,.08)",
    textAlign: "center",
    color: "#f2dede",
    fontFamily: "inherit",
  });

  const title = document.createElement("div");
  title.textContent = "YOU HAVE FALLEN";
  Object.assign(title.style, {
    fontSize: "28px",
    letterSpacing: "2px",
    marginBottom: "8px",
    color: "#ffb3b3",
    textShadow: "0 0 18px rgba(255,70,70,.35)",
  });

  const sub = document.createElement("div");
  sub.innerHTML = `${depthTxt} • ${levelTxt} • <span style="color:#ffd86b">${goldTxt}</span>`;
  Object.assign(sub.style, { marginBottom: "10px", color: "#f7c6c6" });

  const wline = document.createElement("div");
  wline.innerHTML = `Weapon: <span style="color:#c7d2ff">${weaponTxt}</span>`;
  Object.assign(wline.style, { marginBottom: "8px", color: "#e6c8c8" });

  const reward = document.createElement("div");
  reward.innerHTML = `<span style="color:#ffd76e">+${earned}</span> tokens earned for your efforts.`;
  Object.assign(reward.style, { marginBottom: "14px" });

  const btnWrap = document.createElement("div");
  Object.assign(btnWrap.style, {
    display: "flex",
    gap: "10px",
    justifyContent: "center",
    flexWrap: "wrap",
  });

  const mkBtn = (text) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.style.padding = "10px 14px";
    b.style.borderRadius = "999px";
    b.style.border = "1px solid #c98d0b";
    b.style.cursor = "pointer";
    b.style.font = "inherit";
    b.style.minWidth = "160px";
    b.style.boxShadow = "0 8px 24px rgba(0,0,0,.35)";
    b.style.background = "linear-gradient(180deg, #ffd76e, #ffb703)";
    b.style.color = "#2b2411";
    return b;
  };

  const restartBtn = mkBtn("Restart Run");
  const lobbyBtn = mkBtn("Return to Lobby");

  const cleanup = () => {
    if (__deathKeyHandler) {
      window.removeEventListener("keydown", __deathKeyHandler, true);
      __deathKeyHandler = null;
    }
    overlay.remove();
  };

  restartBtn.addEventListener("click", () => {
    cleanup();
    newGame();
  });
  lobbyBtn.addEventListener("click", () => {
    cleanup();
    openLobby();
  });

  btnWrap.appendChild(restartBtn);
  btnWrap.appendChild(lobbyBtn);

  panel.appendChild(title);
  panel.appendChild(sub);
  panel.appendChild(wline);
  panel.appendChild(reward);
  panel.appendChild(btnWrap);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  __deathKeyHandler = (e) => {
    const k = e.key.toLowerCase();
    e.stopImmediatePropagation();
    e.preventDefault();
    if (k === "enter" || k === "r") {
      cleanup();
      newGame();
    }
    if (k === "l") {
      cleanup();
      openLobby();
    }
  };
  window.addEventListener("keydown", __deathKeyHandler, true);

  const styleId = "deathScreen-anim";
  if (!document.getElementById(styleId)) {
    const s = document.createElement("style");
    s.id = styleId;
    s.textContent = `@keyframes deathFadeIn { from { opacity: 0 } to { opacity: 1 } }`;
    document.head.appendChild(s);
  }

  try {
    navigator.vibrate?.(80);
  } catch {}
}

function newGame() {
  S = initialState();
  sanitizeState();
  ensureMap();
  generateExit();

  // Apply meta bonuses at run start
  S.maxHp += getBonusHP();
  S.hp = S.maxHp;
  S.scoutCharges = getScoutPerFloor();
  if (S.scoutCharges > 0)
    addLog(`<small>[Scout charges: ${S.scoutCharges}]</small>`);

  logEl.innerHTML = "";
  addLog("You descend the stairs into the unknown.");
  refreshUI();
}

// ------------------------------
// Save / Load
// ------------------------------
const SAVE_KEY = "retro-dungeon-save";
function saveGame() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(S));
  addLog("<small>[Saved]</small>");
}
// app.js — REPLACE your loadGame() with this
function loadGame() {
  if (document.getElementById("deathScreen")) {
    addLog("You cannot load while dead.", "warn");
    return;
  }
  const snap = localStorage.getItem(SAVE_KEY);
  if (!snap) {
    addLog("No save found.");
    return;
  }
  try {
    S = JSON.parse(snap);
  } catch (e) {
    addLog("Corrupt save. Starting fresh.", "warn");
    S = initialState();
  }

  // Clean up death overlay & key-capture if present
  const ds = document.getElementById("deathScreen");
  if (ds) ds.remove();
  if (typeof __deathKeyHandler === "function") {
    try {
      window.removeEventListener("keydown", __deathKeyHandler, true);
    } catch {}
    __deathKeyHandler = null;
  }
  // Close any open dialogs
  document.querySelectorAll("dialog").forEach((d) => {
    try {
      if (d.open) d.close();
    } catch {}
  });

  // Harden state loaded from old saves
  sanitizeState();

  refreshUI();
  addLog("<small>[Loaded]</small>");

  // Resume combat modal if save had an active enemy
  if (S.enemy) {
    setEncounterStatus("Enemy!");
    openCombat(
      `You come to your senses mid-fight with a <strong>${S.enemy.name}</strong>! (HP ${S.enemy.hp})`
    );
  } else {
    setEncounterStatus("Idle");
  }
}

// ------------------------------
// Modals & Wiring
// ------------------------------
const combatModal = document.getElementById("combatModal");
// Disable default Esc-close on the combat dialog
combatModal?.addEventListener("cancel", (e) => e.preventDefault());
// app.js — REPLACE the whole openCombat() function
function openCombat(openingLine) {
  const log = $("#combatLog");
  log.innerHTML = "";

  // 🔒 Hide/disable the close button during combat
  const closeBtn = document.getElementById("combatClose");
  if (closeBtn) {
    closeBtn.disabled = true;
    closeBtn.style.display = "none";
    closeBtn.setAttribute("aria-hidden", "true");
    closeBtn.title = "You can't close this while an enemy is present.";
  }

  // Show portrait if the enemy defines an image
  if (S.enemy && S.enemy.img) {
    const img = document.createElement("img");
    img.src = S.enemy.img;
    img.alt = S.enemy.name || S.enemy.key;
    img.style.maxWidth = "60%";
    img.style.maxHeight = "100px";
    img.style.display = "block";
    img.style.margin = "0 auto 8px";
    img.style.border = "1px solid #263774";
    img.style.borderRadius = "12px";
    img.style.imageRendering = "pixelated";
    log.appendChild(img);
  }

  // Make sure the HP pill shows the starting HP right away
  if (S.enemy) $("#combatEnemyHp").textContent = `HP ${S.enemy.hp}`;

  addCombatLog(openingLine, "warn");
  try {
    combatModal?.showModal();
  } catch {}
}
document.getElementById("invModal")?.addEventListener("close", () => {
  // If the player is still in combat, bring the combat modal back to the top layer.
  if (resumeCombatAfterInv && S.enemy && !combatModal?.open) {
    setTimeout(() => {
      try {
        combatModal?.showModal();
      } catch {}
    }, 0);
  }
  resumeCombatAfterInv = false;
});

function closeCombat(force = false) {
  if (combatModal && combatModal.open) {
    // Defer so the last combat log paints before the dialog actually closes
    setTimeout(() => {
      try {
        combatModal.close();
      } catch {}
    }, 0);
  }
  if (!force) addLog("The dust settles.");
}

document.getElementById("dirUp")?.addEventListener("click", () => move(0, -1));
document.getElementById("dirDown")?.addEventListener("click", () => move(0, 1));
document
  .getElementById("dirLeft")
  ?.addEventListener("click", () => move(-1, 0));
document
  .getElementById("dirRight")
  ?.addEventListener("click", () => move(1, 0));

document.getElementById("actRest")?.addEventListener("click", rest);
document.getElementById("actWait")?.addEventListener("click", waitTurn);
document
  .getElementById("actInventory")
  ?.addEventListener("click", openInventoryModal);

// Optional Scout button if present
document.getElementById("actScout")?.addEventListener("click", useScoutPulse);

document
  .getElementById("combatAttack")
  ?.addEventListener("click", () => playerAttack());
document
  .getElementById("combatFlee")
  ?.addEventListener("click", () => tryFlee());
document
  .getElementById("combatInventory")
  ?.addEventListener("click", openInventoryModal);
document
  .getElementById("combatClose")
  ?.addEventListener("click", () => closeCombat());

document.getElementById("shopClose")?.addEventListener("click", () => {
  if (shopModal?.open) shopModal.close();
  S._offers = null;
});

document.getElementById("invClose")?.addEventListener("click", () => {
  const m = document.getElementById("invModal");
  if (m?.open) m.close();
});

document.getElementById("newGame")?.addEventListener("click", newGame);
document.getElementById("saveGame")?.addEventListener("click", saveGame);
document.getElementById("loadGame")?.addEventListener("click", loadGame);

document.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();

  // If in combat, handle combat hotkeys only
  if (document.getElementById("combatModal")?.open) {
    if (k === "a") document.getElementById("combatAttack")?.click();
    else if (k === "f") document.getElementById("combatFlee")?.click();
    else if (k === "i") openInventoryModal();
    else if (k === "escape") document.getElementById("combatClose")?.click();
    return;
  }

  // --- Shortcuts with modifiers (handle first) ---
  if ((e.ctrlKey || e.metaKey) && k === "s") {
    e.preventDefault();
    document.getElementById("saveGame")?.click();
    return;
  }

  // --- Movement / actions ---
  if (k === "w" || e.key === "ArrowUp")
    document.getElementById("dirUp")?.click();
  else if (k === "s" || e.key === "ArrowDown")
    document.getElementById("dirDown")?.click();
  else if (k === "a" || e.key === "ArrowLeft")
    document.getElementById("dirLeft")?.click();
  else if (k === "d" || e.key === "ArrowRight")
    document.getElementById("dirRight")?.click();
  else if (k === "r") document.getElementById("actRest")?.click();
  else if (k === " ") {
    e.preventDefault();
    document.getElementById("actWait")?.click();
  } else if (k === "i") document.getElementById("actInventory")?.click();
  else if (k === "x") useScoutPulse(); // Hotkey for Explorer bonus
  else if (k === "n") document.getElementById("newGame")?.click();
  else if (k === "l") document.getElementById("loadGame")?.click();
});

const about = document.getElementById("about");
document
  .getElementById("aboutBtn")
  ?.addEventListener("click", () => about?.showModal());

// Boot
// Boot into Lobby
openLobby();

