// app.js

// =============================================================
// Retro Dungeon Crawler — Single‑File Template
// Directional movement • Hidden Exit • Empty revisits • Weapon drops & equip • Weapon Trader
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

// ---- Drop rate knobs (percent chances) ----
const DROP_RATES = {
  weapon: 12, // swords: ~12% after a kill (was 20%)
  shield: 7, // shields: ~7% after a kill (was 15%)
};

const ENEMIES = [
  {
    key: 'rat',
    name: 'Mutated Rat',
    hp: 6,
    atk: [1, 5],
    gold: [1, 3],
    xp: 2,
    img: './assets/ratSVG.svg',
    minDepth: 1,
  },
  {
    key: 'bat',
    name: 'Grimy Bat',
    hp: 8,
    atk: [1, 5],
    gold: [2, 5],
    xp: 3,
    img: 'assets/batSVG.svg',
    minDepth: 1,
  },
  {
    key: 'slime',
    name: 'Noxious Slime',
    hp: 10,
    atk: [2, 8],
    gold: [3, 7],
    xp: 3,
    img: './assets/slimeSVG.svg',
    minDepth: 1,
  },
  {
    key: 'skeleton',
    name: 'Cracked Skull',
    hp: 14,
    atk: [3, 10],
    gold: [5, 10],
    xp: 8,
    img: 'assets/crackedskullSVG.svg',
    minDepth: 3,
  },
  {
    key: 'mage',
    name: "Tumeken's Minion",
    hp: 18,
    atk: [4, 15],
    gold: [6, 12],
    xp: 10,
    img: 'assets/wizardSVG.svg',
    minDepth: 5,
  },
  {
    key: 'mage',
    name: "Tumeken's Guardian",
    hp: 32,
    atk: [6, 21],
    gold: [20, 30],
    xp: 25,
    img: 'assets/tumekensguardianSVG.svg',
    minDepth: 8,
  },
  {
    key: 'mage',
    name: "Tumeken's Shadow",
    hp: 90,
    atk: [12, 25],
    gold: [100, 300],
    xp: 250,
    img: 'assets/temekensshadowSVG.svg',
    minDepth: 9,
  },
  {
    key: 'mage',
    name: 'Tumeken',
    hp: 300,
    atk: [15, 30],
    gold: [1000, 3000],
    xp: 2500,
    img: 'assets/tumekenSVG.svg',
    minDepth: 10,
  },
  {
    key: 'mage',
    name: 'Nightmare',
    hp: 350,
    atk: [25, 40],
    gold: [1000, 5000],
    xp: 3000,
    img: 'assets/boss1SVG.svg',
    minDepth: 15,
  },
];

// Consumables
const LOOT_TABLE = [
  {
    key: 'potion',
    name: 'Basic Potion',
    kind: 'consumable',
    heal: 5,
    price: 12,
  },
  {
    key: 'mega',
    name: 'Strong Potion',
    kind: 'consumable',
    heal: 15,
    price: 25,
  },
  {
    key: 'giga',
    name: 'Giga Potion',
    kind: 'consumable',
    heal: 20,
    price: 64,
  },
  { key: 'bomb', name: 'Bomb', kind: 'consumable', dmg: 10, price: 40 },
  { key: 'toxic', name: 'Toxic Bomb', kind: 'consumable', dmg: 15, price: 80 },
];

// Weapon templates — higher power => rarer (weights drop with atk), unlock by depth
const SWORDS = [
  {
    key: 'rusty_dagger',
    name: 'Rusty Dagger',
    atk: 1,
    minDepth: 1,
    weight: 60,
  },
  {
    key: 'fire_poker',
    name: 'Fire_poker',
    atk: 1,
    minDepth: 1,
    weight: 60,
  },
  {
    key: 'dusty_knife',
    name: 'Dusty Knife',
    atk: 2,
    minDepth: 1,
    weight: 60,
  },
  {
    key: 'bone_shard',
    name: 'Bone Shard',
    atk: 2,
    minDepth: 1,
    weight: 60,
  },
  {
    key: 'makeshift_dagger',
    name: 'Makeshift Dagger',
    atk: 2,
    minDepth: 1,
    weight: 30,
  },
  {
    key: 'bone_dagger',
    name: 'Bone Dagger',
    atk: 3,
    minDepth: 3,
    weight: 30,
  },
  { key: 'short_sword', name: 'Short Sword', atk: 2, minDepth: 3, weight: 35 },
  { key: 'iron_saber', name: 'Iron Saber', atk: 3, minDepth: 5, weight: 25 },
  {
    key: 'steel_longsword',
    name: 'Steel Longsword',
    atk: 4,
    minDepth: 8,
    weight: 15,
  },
  {
    key: 'knight_blade',
    name: 'Knight Blade',
    atk: 5,
    minDepth: 10,
    weight: 8,
  },
  {
    key: 'crystal_saber',
    name: 'Crystal Saber',
    atk: 6,
    minDepth: 15,
    weight: 5,
  },
  { key: 'dragonfang', name: 'Dragonfang', atk: 7, minDepth: 15, weight: 3 },
  {
    key: 'sunsteel_edge',
    name: 'Sunsteel Edge',
    atk: 9,
    minDepth: 20,
    weight: 1,
  },
];
const SHIELDS = [
  {
    key: 'wooden_shield',
    name: 'Wooden Shield',
    def: 1,
    rollChance: 10,
    minDepth: 1,
    weight: 60, // common
  },
  {
    key: 'hide_kite',
    name: 'Hide Kite',
    def: 2,
    rollChance: 12,
    minDepth: 2,
    weight: 45,
  },
  {
    key: 'bronze_roundel',
    name: 'Bronze Roundel',
    def: 2,
    rollChance: 16,
    minDepth: 3,
    weight: 35,
  },
  {
    key: 'iron_targe',
    name: 'Iron Targe',
    def: 3,
    rollChance: 18,
    minDepth: 5,
    weight: 28,
  },
  {
    key: 'steel_heater',
    name: 'Steel Heater',
    def: 3,
    rollChance: 22,
    minDepth: 7,
    weight: 20,
  },
  {
    key: 'knights_wall',
    name: 'Knight’s Wall',
    def: 4,
    rollChance: 24,
    minDepth: 9,
    weight: 14,
  },
  {
    key: 'obsidian_scutum',
    name: 'Obsidian Scutum',
    def: 4,
    rollChance: 28,
    minDepth: 12,
    weight: 9,
  },
  {
    key: 'runed_aegis',
    name: 'Runed Aegis',
    def: 5,
    rollChance: 30,
    minDepth: 15,
    weight: 6,
  },
  {
    key: 'crystal_ward',
    name: 'Crystal Ward',
    def: 5,
    rollChance: 35,
    minDepth: 18,
    weight: 3,
  },
  {
    key: 'sunsteel_barrier',
    name: 'Sunsteel Barrier',
    def: 6,
    rollChance: 40,
    minDepth: 22,
    weight: 1, // ultra-rare
  },
];
const ROOM_TAGS = [
  'Calm',
  'Damp',
  'Echoing',
  'Dank',
  'Fetid',
  'Fungal',
  'Icy',
  'Gusty',
  'Mossy',
  'Dripping',
  'Whispering',
  'Gloomy',
  'Stagnant',
  'Claustrophobic',
  'Crumbling',
  'Ruined',
  'Collapsed',
  'Flooded',
  'Silted',
  'Frostbitten',
  'Chill',
  'Webbed',
  'Infested',
  'Ossuary',
  'Bone-Littered',
  'Mildewed',
  'Moldy',
  'Rot-Stained',
  'Dust-Choked',
  'Sulfurous',
  'Miasmic',
  'Smoky',
  'Ashen',
  'Scorched',
  'Sooty',
  'Crystalline',
  'Shimmering',
  'Phosphorescent',
  'Bioluminescent',
  'Arcane',
  'Runed',
  'Hexed',
  'Cursed',
  'Haunted',
  'Spectral',
  'Unholy',
  'Sanctified',
  'Ancient',
  'Forgotten',
  'Hidden',
  'Labyrinthine',
  'Twisting',
  'Narrow',
  'Broad',
  'Eerie',
  'Gloaming',
  'Shadowed',
  'Wind-Scoured',
  'Seismic',
  'Rumbling',
  'Quaking',
  'Verminous',
  'Putrid',
  'Stench-Ridden',
  'Slick',
  'Iridescent',
  'Frozen',
  'Ember-Lit',
  'Torchlit',
  'Starved of Light',
  'Thunderous',
];

// ------------------------------
// Game State
// ------------------------------
const initialState = () => ({
  name: 'Adventurer',
  depth: 1,
  level: 1,
  hp: 20,
  maxHp: 20,
  xp: 0,
  xpToNext: 10,
  gold: 0,
  // Inventory can contain consumables {key, qty} and weapons {key:'weapon', id, name, atk, rarity, price, source}
  inventory: [{ key: 'potion', qty: 1 }],
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
});

let S = initialState();
let resumeCombatAfterInv = false;
// Blocks input while the death screen is up
let __deathKeyHandler = null;
// ------------------------------
// Utilities
// ------------------------------
const $ = (sel) => document.querySelector(sel);
const logEl = $('#log');

function addLog(html, cls) {
  const p = document.createElement('p');
  if (cls) p.className = cls;
  p.innerHTML = html;
  logEl.appendChild(p);
  logEl.scrollTop = logEl.scrollHeight;
}
function addCombatLog(html, cls) {
  const box = $('#combatLog');
  const p = document.createElement('p');
  if (cls) p.className = cls;
  p.innerHTML = html;
  box.appendChild(p);
  box.scrollTop = box.scrollHeight;
}

function uid() {
  return 'w' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function weightedPick(items, weightKey = 'weight') {
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

  if (!S.equipped || typeof S.equipped !== 'object')
    S.equipped = { weapon: null, shield: null };
  if (!('weapon' in S.equipped)) S.equipped.weapon = null;
  if (!('shield' in S.equipped)) S.equipped.shield = null; // ← ensure shield

  if (typeof S.traderCooldown !== 'number') S.traderCooldown = 0;
  if (!Array.isArray(S.inventory)) S.inventory = [];
  if (!S.mapSize) S.mapSize = 7;
  if (!S.map || !Array.isArray(S.map))
    S.map = Array.from({ length: S.mapSize }, () =>
      Array(S.mapSize).fill(false)
    );
  if (!S.pos) S.pos = { x: 0, y: 0 };

  if (
    S.enemy &&
    (typeof S.enemy.hp !== 'number' || !Array.isArray(S.enemy.atk))
  ) {
    S.enemy = null;
  }

  if (!S.exitPos) generateExit();
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

// Glimmer effect
function flashGlimmer() {
  const fx = document.getElementById('fx');
  fx.classList.remove('glimmer');
  void fx.offsetWidth; // restart animation
  fx.classList.add('glimmer');
}

// ------------------------------
// Stats & UI
// ------------------------------
function setBar(el, val, max, textEl) {
  const pct = Math.max(0, Math.min(100, Math.round((val / max) * 100)));
  el.style.setProperty('--val', pct + '%');
  if (textEl) textEl.textContent = `${val}/${max}`;
}

function renderStats() {
  setBar($('#hpBar'), S.hp, S.maxHp, $('#hpText'));
  setBar($('#xpBar'), S.xp, S.xpToNext, $('#xpText'));
  $('#goldPill').textContent = `Gold: ${S.gold}`;
  $('#levelPill').textContent = `Lvl ${S.level}`;
  $('#playerName').textContent = S.name;
  $('#depthPill').textContent = `Delve ${S.depth}`;
  if (S.enemy) $('#combatEnemyHp').textContent = `HP ${S.enemy.hp}`;
  $('#shopGold').textContent = `Gold: ${S.gold}`;
  $('#invGold').textContent = `Gold: ${S.gold}`;

  // --- Mini HUD mirrors (only present on mobile; safe to no-op if missing)
  const miniHpBar = document.getElementById('miniHpBar');
  if (miniHpBar)
    setBar(miniHpBar, S.hp, S.maxHp, document.getElementById('miniHpText'));
  const miniXpBar = document.getElementById('miniXpBar');
  if (miniXpBar)
    setBar(miniXpBar, S.xp, S.xpToNext, document.getElementById('miniXpText'));
}

function renderInventory() {
  const wrap = $('#inventory');
  wrap.innerHTML = '';
  S.inventory.forEach((it) => {
    const meta = LOOT_TABLE.find((l) => l.key === it.key);
    const div = document.createElement('div');
    div.className = 'item';

    if (meta) {
      div.innerHTML = `<span>• ${meta.name}</span> <small>x${it.qty}</small>`;
      div.style.cursor = 'pointer';
      div.title = `Click to use 1 ${meta.name}`;
      div.addEventListener('click', () => useSpecificItem(it.key));
    } else if (it.key === 'weapon') {
      const equippedMark =
        S.equipped?.weapon && S.equipped.weapon.id === it.id
          ? ' <small>(E)</small>'
          : '';
      div.innerHTML = `<span>🗡️ ${it.name} <small>+${it.atk} • ${it.rarity}${equippedMark}</small></span>`;
      div.style.cursor = 'pointer';
      div.title = 'Click to equip';
      div.tabIndex = 0;
      div.addEventListener('click', () => equipWeaponById(it.id));
      div.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') equipWeaponById(it.id);
      });
    } else if (it.key === 'shield') {
      const equippedMark =
        S.equipped?.shield && S.equipped.shield.id === it.id
          ? ' <small>(E)</small>'
          : '';
      div.innerHTML = `<span>🛡️ ${it.name} <small>${it.def} DEF • ${it.rollChance}% • ${it.rarity}${equippedMark}</small></span>`;
      div.style.cursor = 'pointer';
      div.title = 'Click to equip shield';
      div.tabIndex = 0;
      div.addEventListener('click', () => equipShieldById(it.id));
      div.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') equipShieldById(it.id);
      });
    } else {
      div.textContent = it.key;
    }

    wrap.appendChild(div);
  });
  if (!S.inventory.length) wrap.textContent = '(Empty)';
}

function ensureMap() {
  if (!S.map || !S.map.length) {
    S.map = Array.from({ length: S.mapSize }, () =>
      Array(S.mapSize).fill(false)
    );
  }
  S.map[S.pos.y][S.pos.x] = true;
  if (!S.exitPos) generateExit();
}

function renderMap() {
  ensureMap();
  const g = $('#map');
  g.innerHTML = '';
  for (let y = 0; y < S.mapSize; y++) {
    for (let x = 0; x < S.mapSize; x++) {
      const d = document.createElement('div');
      d.className = 'cell';
      if (S.map[y][x]) d.classList.add('discovered');
      if (x === S.pos.x && y === S.pos.y) d.classList.add('player');
      // Only show exit if discovered
      if (S.exitDiscovered && x === S.exitPos.x && y === S.exitPos.y)
        d.classList.add('exit');
      g.appendChild(d);
    }
  }
}

function setEncounterStatus(text) {
  $('#encounterPill').textContent = text;
}

function setRoom() {
  const ROOM_NAMES = [
    'Dank Passage',
    'Mossy Archway',
    'Collapsed Hall',
    'Silent Crypt',
    'Crystal Cavern',
    'Forgotten Library',
    'Shimmering Tunnel',
    'Broken Bridge',
    'Abandoned Barracks',
    'Sealed Vault',
    'Forgotten Armory',
    'Dust-Choked Stacks',
    'Sarcophagus Row',
    'Ossuary Niche',
    'Ghoul Warren',
    'Spider Den',
    'Mushroom Grotto',
    'Glowworm Hollow',
    'Phosphor Cavern',
    'Bioluminescent Pool',
    'Dripping Gallery',
    'Whispering Hall',
    'Hall of Echoes',
    'Howling Vent',
    'Flooded Tunnel',
    'Sunken Archive',
    'Drowned Chapel',
    'Rotted Sluice',
    'Stagnant Cistern',
    'Collapsed Aqueduct',
    'Cracked Causeway',
    'Broken Stair',
    'Rift Walk',
    'Seismic Fissure',
    'Rubble Ramp',
    'Shattered Sanctum',
    'Desecrated Shrine',
    'Black Altar',
    'Runesmith’s Forge',
    'Ashen Furnace',
    'Soot-Stained Chimney',
    'Obsidian Gallery',
    'Vein of Crystal',
    'Quarry Cut',
    'Mosaic Rotunda',
    'Timeworn Rotunda',
    'Hidden Antechamber',
    'Secret Pantry',
    'Servants’ Passage',
    'Supply Cache',
    'Prospector’s Camp',
    'Miner’s Rest',
    'Collapsed Shaft',
    'Rust Gate',
    'Iron Portcullis',
    'Warden’s Watch',
    'Jailor’s Gallery',
    'Chainworks',
    'Wardstone Ring',
    'Arcane Observatory',
    'Star Chamber',
    'Chill Refectory',
    'Frostbitten Corridor',
    'Bonepile Crossing',
    'Gallows Landing',
    'Worm-Tunnel',
    'Slime Channel',
    'Chittering Nest',
    'Thorn Pit',
    'Gloomed Nave',
    'Runed Threshold',
    'Echoing Narthex',
  ];
  $('#roomTitle').textContent = RNG.pick(ROOM_NAMES);
  $('#roomTags').textContent = RNG.pick(ROOM_TAGS);
}

function refreshUI() {
  renderStats();
  renderInventory();
  renderMap();
  setRoom();
}

// ------------------------------
// Exit / Floors
// ------------------------------
function generateExit() {
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
      addLog('You discover a hidden stairwell <strong>★</strong>!', 'good');
      renderMap();
    }
    const ok = confirm(`Descend to Depth ${S.depth + 1}?`);
    if (ok) {
      descend();
      return true;
    }
    addLog('You decide to explore a bit longer.');
  }
  return false;
}

function descend() {
  S.depth += 1;
  S.map = Array.from({ length: S.mapSize }, () => Array(S.mapSize).fill(false));
  S.pos = { x: 0, y: 0 };
  S.map[S.pos.y][S.pos.x] = true;
  generateExit();
  addLog(`<em>You descend to Depth ${S.depth}…</em>`, 'good');
  renderMap();
  setRoom();
  renderStats();
  setEncounterStatus('Idle');
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
  const idx = S.inventory.findIndex((i) => i.key === 'weapon' && i.id === id);
  if (idx >= 0) {
    S.inventory.splice(idx, 1);
    renderInventory();
    renderStats();
    return true;
  }
  return false;
}
function equipWeaponById(id) {
  const w = S.inventory.find((i) => i.key === 'weapon' && i.id === id);
  if (!w) return;
  // swap
  if (S.equipped.weapon) {
    S.inventory.push(S.equipped.weapon);
  }
  S.equipped.weapon = w;
  removeWeaponById(id);
  addLog(
    `You equip <strong>${w.name}</strong> <span class="good">(+${w.atk} ATK)</span>.`,
    'good'
  );
  renderInventory();
  renderStats();
}

function priceForShield(def, rollChance, source = 'drop') {
  // Expected mitigation scales value: def × (chance%)
  const eff = def * (rollChance / 100); // e.g., def 3 @ 20% ≈ 0.6 effective
  return source === 'shop'
    ? Math.round(60 + eff * 140 + S.depth * 12) // pricier in shops + depth
    : Math.round(30 + eff * 90 + Math.max(0, S.depth - 1) * 8); // drop value
}

// app.js — REPLACE your openInventoryModal() with this
function openInventoryModal() {
  const m = document.getElementById('invModal');
  const list = document.getElementById('invList');
  list.innerHTML = '';
  if (!S.inventory.length) list.innerHTML = '<p>(Inventory empty)</p>';

  S.inventory.forEach((it) => {
    const meta = LOOT_TABLE.find((x) => x.key === it.key);
    if (meta) {
      const row = document.createElement('p');
      row.innerHTML = `<strong>${meta.name}</strong> x${it.qty}`;
      const btn = document.createElement('button');
      btn.textContent = `Use ${meta.name} x1`;
      btn.addEventListener('click', () => useSpecificItem(it.key));
      list.appendChild(row);
      list.appendChild(btn);
    } else if (it.key === 'weapon') {
      const row = document.createElement('p');
      row.innerHTML = `<strong>🗡️ ${it.name}</strong> <small>+${it.atk} • ${it.rarity}</small>`;
      const btn = document.createElement('button');
      btn.textContent = 'Equip';
      btn.addEventListener('click', () => equipWeaponById(it.id));
      list.appendChild(row);
      list.appendChild(btn);
    } else if (it.key === 'shield') {
      const row = document.createElement('p');
      row.innerHTML = `<strong>🛡️ ${it.name}</strong> <small>${it.def} DEF • ${it.rollChance}% • ${it.rarity}</small>`;
      const btn = document.createElement('button');
      btn.textContent = 'Equip';
      btn.addEventListener('click', () => equipShieldById(it.id));
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
  if (key === 'potion' || key === 'mega' || key === 'giga') {
    if (removeItem(key, 1)) {
      S.hp = Math.min(S.maxHp, S.hp + (meta.heal || 0));
      const msg = `You drink ${meta.name} and restore <span class="good">${meta.heal} HP</span>.`;
      addLog(msg, 'good');
      if (document.getElementById('combatModal').open)
        addCombatLog(msg, 'good');
      renderStats();
      if (S.enemy) enemyAttack();
    }
  } else if (key === 'bomb' || key === 'toxic') {
    if (!S.enemy) {
      addLog('You consider lighting a bomb…but decide against it.');
      return;
    }
    if (removeItem('bomb', 1)) {
      const dmg = meta.dmg;
      S.enemy.hp -= dmg;
      addCombatLog(`You hurl a bomb for <strong>${dmg}</strong>!`);
      if (S.enemy.hp <= 0) {
        const gold = RNG.int(...S.enemy.gold);
        const xp = S.enemy.xp;
        addCombatLog(
          `The ${S.enemy.name} is blasted apart! <span class="good">${gold}g</span> scooped.`,
          'good'
        );
        gainGold(gold);
        gainXP(xp);
        S.enemy = null;
        setEncounterStatus('Idle');
        closeCombat();
      } else {
        enemyAttack();
      }
    } else if (removeItem('toxic', 1)) {
      const dmg = meta.dmg;
      S.enemy.hp -= dmg;
      addCombatLog(`You hurl a toxic bomb for <strong>${dmg}</strong>!`);
      if (S.enemy.hp <= 0) {
        const gold = RNG.int(...S.enemy.gold);
        const xp = S.enemy.xp;
        addCombatLog(
          `The ${S.enemy.name} is blasted apart! <span class="good">${gold}g</span> scooped.`,
          'good'
        );
        gainGold(gold);
        gainXP(xp);
        S.enemy = null;
        setEncounterStatus('Idle');
        closeCombat();
      } else {
        enemyAttack();
      }
    }
  }
}

// ------------------------------
// Weapons: Drops & Shop variants
// ------------------------------
function priceForWeapon(atk, source = 'drop') {
  return source === 'shop'
    ? 50 + atk * 40 + S.depth * 10
    : 25 + atk * 25 + Math.max(0, S.depth - 1) * 6;
}
function rarityName(atk) {
  return atk >= 7
    ? 'epic'
    : atk >= 5
    ? 'rare'
    : atk >= 3
    ? 'uncommon'
    : 'common';
}
function pickDropWeapon() {
  const c = SWORDS.filter((w) => w.minDepth <= S.depth);
  return weightedPick(c);
}
function makeWeaponFromTemplate(tpl, source = 'drop', powerFactor = 1) {
  const atk = Math.max(1, Math.floor(tpl.atk * powerFactor));
  return {
    key: 'weapon',
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
  const w = makeWeaponFromTemplate(tpl, 'drop', 1);
  addWeapon(w);
  addLog(
    `You find a <strong>${w.name}</strong> <span class="good">(+${w.atk})</span>!`,
    'good'
  );
  flashGlimmer();
}

// ==============================
// Shields: drops, equip, pricing
// ==============================
function priceForShield(def, source = 'drop') {
  return source === 'shop'
    ? 50 + def * 35 + S.depth * 10
    : 25 + def * 20 + Math.max(0, S.depth - 1) * 5;
}
function rarityNameShield(def) {
  return def >= 5
    ? 'epic'
    : def >= 3
    ? 'rare'
    : def >= 2
    ? 'uncommon'
    : 'common';
}
function pickDropShield() {
  const pool = SHIELDS.filter((s) => s.minDepth <= S.depth);
  return weightedPick(pool.length ? pool : SHIELDS);
}
function makeShieldFromTemplate(tpl, source = 'drop') {
  return {
    key: 'shield',
    id: uid(),
    name: tpl.name,
    def: tpl.def,
    rollChance: tpl.rollChance, // % chance to reduce damage
    rarity: rarityNameShield(tpl.def),
    price: priceForShield(tpl.def, source),
    source,
  };
}
function addShield(sh) {
  S.inventory.push(sh);
  renderInventory();
  renderStats();
}
function removeShieldById(id) {
  const idx = S.inventory.findIndex((i) => i.key === 'shield' && i.id === id);
  if (idx >= 0) {
    S.inventory.splice(idx, 1);
    renderInventory();
    renderStats();
    return true;
  }
  return false;
}
function equipShieldById(id) {
  const sh = S.inventory.find((i) => i.key === 'shield' && i.id === id);
  if (!sh) return;
  if (S.equipped.shield) S.inventory.push(S.equipped.shield); // swap out
  S.equipped.shield = sh;
  removeShieldById(id);
  addLog(
    `You equip <strong>${sh.name}</strong> <span class="good">(${sh.def} DEF • ${sh.rollChance}% block)</span>.`,
    'good'
  );
  renderInventory();
  renderStats();
}
function maybeDropShield() {
  if (!RNG.chance(DROP_RATES.shield)) return;
  const tpl = pickDropShield();
  const sh = makeShieldFromTemplate(tpl, 'drop');
  addShield(sh);
  addLog(
    `You find a <strong>${sh.name}</strong> <small>(${sh.def} DEF • ${sh.rollChance}% block)</small>!`,
    'good'
  );
  flashGlimmer();
}

// ------------------------------
// Progression
// ------------------------------
function gainXP(x) {
  S.xp += x;
  addLog(`You gain <span class="good">${x} XP</span>.`, 'good');
  while (S.xp >= S.xpToNext) {
    S.xp -= S.xpToNext;
    S.level++;
    S.maxHp += 4;
    S.hp = Math.min(S.maxHp, S.hp + 4);
    S.xpToNext = Math.round(S.xpToNext * 1.35);
    addLog(
      `<strong>Level Up!</strong> You are now <span class="good">Lv. ${S.level}</span>.`,
      'good'
    );
  }
  renderStats();
}
function gainGold(g) {
  S.gold += g;
  renderStats();
}

// ------------------------------
// Encounters & Combat
// ------------------------------
function rollEncounter(opts = {}) {
  // enemy 45%, loot 15%, trap 12%, weapon trader 3%, general trader 2%, empty 23%
  const { forbidLoot = false } = opts;
  const r = RNG.int(1, 100);

  if (r <= 45) {
    // Respect depth gate first, then apply your scaling cap as a soft filter
    const byDepth = eligibleEnemies(S.depth);
    const byScale = byDepth.filter((e) => e.hp <= 10 + S.depth * 4);
    const pickFrom = byScale.length ? byScale : byDepth;

    const meta = RNG.pick(pickFrom);
    S.enemy = JSON.parse(JSON.stringify(meta));
    setEncounterStatus('Enemy!');
    openCombat(
      `A <strong>${S.enemy.name}</strong> emerges from the dark! (HP ${S.enemy.hp})`
    );
  } else if (r <= 60) {
    if (forbidLoot) {
      addLog('You keep still; nothing turns up while you rest.');
    } else {
      const loot = RNG.pick(LOOT_TABLE);
      addItem(loot.key, 1);
      addLog(`You find <strong>${loot.name}</strong>.`, 'good');
    }
  } else if (r <= 72) {
    const dmg = RNG.int(1, 4 + Math.floor(S.depth / 2));
    S.hp = Math.max(0, S.hp - dmg);
    addLog(
      `A hidden trap damages you for <span class="bad">${dmg} damage</span>.`,
      'bad'
    );
    if (S.hp <= 0) return onDeath();
    renderStats();
  } else if (r <= 75 && S.traderCooldown <= 0) {
    openWeaponShop();
    S.traderCooldown = 8;
  } else if (r <= 77 && S.traderCooldown <= 0) {
    openShop(); // general trader
    S.traderCooldown = 8;
  } else {
    addLog('This room appears empty.');
  }
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
      'good'
    );
  }

  S.hp = Math.max(0, S.hp - dmg);
  addCombatLog(
    `${S.enemy.name} strikes for <span class="bad">${dmg}</span>.`,
    'bad'
  );
  renderStats();

  if (S.hp <= 0) {
    addCombatLog('<strong>You collapse…</strong>', 'bad');
    closeCombat(true);
    onDeath();
  }
}

function currentWeaponBonus() {
  return S &&
    S.equipped &&
    S.equipped.weapon &&
    typeof S.equipped.weapon.atk === 'number'
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
      wpn && S?.equipped?.weapon ? ` with your ${S.equipped.weapon.name}` : '';
    addCombatLog(`You strike${wtxt} for <strong>${dmg}</strong>.`);
    renderStats();

    if (S.enemy.hp <= 0) {
      const gold = RNG.int(...S.enemy.gold);
      const xp = S.enemy.xp;
      addCombatLog(
        `The ${S.enemy.name} is defeated! You loot <span class="good">${gold}g</span>.`,
        'good'
      );
      gainGold(gold);
      gainXP(xp);
      maybeDropWeapon();
      maybeDropShield(); // ← NEW: chance to drop a shield
      S.enemy = null;
      setEncounterStatus('Idle');
      closeCombat();

      if (RNG.chance(5)) {
        addLog('<em>You feel the dungeon pull you deeper within...</em>');
        descend(); // ensures map/reset like taking stairs
      }
      renderStats();
    } else {
      enemyAttack();
    }
  } catch (err) {
    console.error('Attack error:', err);
    addCombatLog(
      `<span class="bad">[Error]</span> Attack failed: ${err.message || err}`,
      'bad'
    );
  }
}

function tryFlee() {
  if (!S.enemy) return;
  if (RNG.chance(55)) {
    addCombatLog('You slip away into the shadows.', 'good');
    S.enemy = null;
    setEncounterStatus('Idle');
    closeCombat();
  } else {
    addCombatLog('You fail to escape!', 'warn');
    enemyAttack();
  }
}

// ------------------------------
// Shops
// ------------------------------
const shopModal = document.getElementById('shopModal');

function openShop() {
  // General trader: potions & (normal) bombs
  const offers = Array.from({ length: 3 }, () => RNG.pick(LOOT_TABLE));
  renderShopUI(
    'A Wandering Trader',
    offers.map((o) => ({ type: 'consumable', item: o })),
    []
  );
}

function openWeaponShop() {
  // Weapon trader: pricey, weaker than drops (0.7–0.85 power), plus premium bombs
  const candidates = SWORDS.filter((w) => w.minDepth <= S.depth);
  const picks = [];
  for (let i = 0; i < 2; i++) picks.push(weightedPick(candidates));
  const weaponsForSale = picks.map((tpl) => {
    const powerFactor = 0.7 + Math.random() * 0.15; // 70%–85% of template power
    const w = makeWeaponFromTemplate(tpl, 'shop', powerFactor);
    if (!w.name.includes('(Replica)') && powerFactor < 0.8)
      w.name += ' (Replica)';
    return w;
  });
  const bombMeta = LOOT_TABLE.find((x) => x.key === 'bomb');
  const priceyBomb = { ...bombMeta, price: bombMeta.price + 10 };
  const offers = weaponsForSale
    .map((w) => ({ type: 'weapon', item: w }))
    .concat([{ type: 'consumable', item: priceyBomb }]);

  renderShopUI('A Weapon Trader', offers, weaponsForSale);
}

function renderShopUI(title, offers, weaponsForSale) {
  $('#shopTitle').textContent = title;
  const list = $('#shopList');
  const actions = $('#shopActions');
  const sellList = $('#sellList');
  const sellActions = $('#sellActions');
  list.innerHTML = '';
  actions.innerHTML = '';
  sellList.innerHTML = '';
  sellActions.innerHTML = '';

  // BUY
  offers.forEach((o, idx) => {
    if (o.type === 'consumable') {
      const it = o.item;
      const p = document.createElement('p');
      p.innerHTML = `${idx + 1}. <strong>${it.name}</strong> — ${it.price}g`;
      list.appendChild(p);
      const b = document.createElement('button');
      b.textContent = `Buy ${it.name}`;
      b.addEventListener('click', () => {
        if (S.gold >= it.price) {
          S.gold -= it.price;
          addItem(it.key, 1);
          addLog(`Purchased ${it.name} for ${it.price}g.`, 'good');
          renderStats();
        } else {
          addLog('Not enough gold to trade.');
        }
      });
      actions.appendChild(b);
    } else if (o.type === 'weapon') {
      const w = o.item;
      const p = document.createElement('p');
      p.innerHTML = `${idx + 1}. <strong>🗡️ ${w.name}</strong> <small>+${
        w.atk
      } • ${w.rarity}</small> — ${w.price}g`;
      list.appendChild(p);
      const b = document.createElement('button');
      b.textContent = `Buy ${w.name}`;
      b.addEventListener('click', () => {
        if (S.gold >= w.price) {
          S.gold -= w.price;
          addWeapon({ ...w });
          addLog(`Purchased ${w.name} for ${w.price}g.`, 'good');
          renderStats();
        } else {
          addLog('Not enough gold to trade.');
        }
      });
      actions.appendChild(b);
    }
  });

  // SELL (50% of value)
  if (!S.inventory.length) sellList.innerHTML = '<p>(Nothing to sell)</p>';
  S.inventory.forEach((it) => {
    const meta = LOOT_TABLE.find((x) => x.key === it.key);
    if (meta) {
      const price = Math.max(1, Math.floor((meta.price || 1) * 0.5));
      const p = document.createElement('p');
      p.innerHTML = `<strong>${meta.name}</strong> x${it.qty} — ${price}g each`;
      sellList.appendChild(p);
      const b = document.createElement('button');
      b.textContent = `Sell 1 ${meta.name}`;
      b.addEventListener('click', () => {
        if (removeItem(it.key, 1)) {
          S.gold += price;
          addLog(`Sold ${meta.name} for ${price}g.`, 'good');
          renderStats();
          renderShopUI(title, offers, weaponsForSale);
        }
      });
      sellActions.appendChild(b);
    }
  });

  S.inventory
    .filter((x) => x.key === 'weapon')
    .forEach((w) => {
      const price = Math.max(
        1,
        Math.floor((w.price || priceForWeapon(w.atk, 'drop')) * 0.5)
      );
      const p = document.createElement('p');
      p.innerHTML = `<strong>🗡️ ${w.name}</strong> <small>+${w.atk} • ${w.rarity}</small> — ${price}g`;
      sellList.appendChild(p);
      const b = document.createElement('button');
      b.textContent = `Sell ${w.name}`;
      b.addEventListener('click', () => {
        if (removeWeaponById(w.id)) {
          S.gold += price;
          addLog(`Sold ${w.name} for ${price}g.`, 'good');
          renderStats();
          renderShopUI(title, offers, weaponsForSale);
        }
      });
      sellActions.appendChild(b);

      S.inventory
        .filter((x) => x.key === 'shield')
        .forEach((sh) => {
          const price = Math.max(
            1,
            Math.floor((sh.price || priceForShield(sh.def, 'drop')) * 0.5)
          );
          const p = document.createElement('p');
          p.innerHTML = `<strong>🛡️ ${sh.name}</strong> <small>${sh.def} DEF • ${sh.rollChance}% • ${sh.rarity}</small> — ${price}g`;
          sellList.appendChild(p);
          const b = document.createElement('button');
          b.textContent = `Sell ${sh.name}`;
          b.addEventListener('click', () => {
            if (removeShieldById(sh.id)) {
              S.gold += price;
              addLog(`Sold ${sh.name} for ${price}g.`, 'good');
              renderStats();
              renderShopUI(title, offers, weaponsForSale);
            }
          });
          sellActions.appendChild(b);
        });
    });

  renderStats();
  shopModal.showModal();
}

// ------------------------------
// Movement & Actions
// ------------------------------
function move(dx, dy) {
  if (S.enemy) {
    addLog(
      'You cannot move while engaged! Try <strong>Flee</strong> or resolve the fight.',
      'warn'
    );
    return;
  }

  const nx = Math.max(0, Math.min(S.mapSize - 1, S.pos.x + dx));
  const ny = Math.max(0, Math.min(S.mapSize - 1, S.pos.y + dy));
  const revisiting = !!(S.map[ny] && S.map[ny][nx]);

  S.pos.x = nx;
  S.pos.y = ny;
  S.map[ny][nx] = true;

  // tick down trader cooldown per step
  if (S.traderCooldown > 0) S.traderCooldown--;

  renderMap();
  setRoom();

  // Exit handling first
  if (checkExitContact()) return;

  if (revisiting) {
    addLog("You return to a room you already explored. It's quiet.");
    setEncounterStatus('Idle');
    return;
  }

  rollEncounter();
}

function rest() {
  const heal = RNG.int(1, 2);
  S.hp = Math.min(S.maxHp, S.hp + heal);
  addLog(
    `You rest, patching wounds (+<span class=\"good\">${heal} HP</span>). <em>Risk: you might be ambushed.</em>`,
    'good'
  );
  if (RNG.chance(30)) {
    addLog('You hear something behind you!', 'warn');
    rollEncounter({ forbidLoot: true });
  }
  renderStats();
}

function waitTurn() {
  addLog('You wait, knowing the only way out is to keep moving…');
  if (RNG.chance(15)) {
    addLog('Something approaches!', 'warn');
    rollEncounter();
  }
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
  document.querySelectorAll('dialog').forEach((d) => {
    try {
      if (d.open) d.close();
    } catch {}
  });

  // 🔒 PERMADEATH: erase the save slot immediately
  try {
    localStorage.removeItem('retro-dungeon-save');
  } catch {}

  addLog('<strong>You are dead…</strong>', 'bad');
  setEncounterStatus('Defeated');

  // Build and show the dramatic death screen
  showDeathScreen();
}

function showDeathScreen() {
  const old = document.getElementById('deathScreen');
  if (old) old.remove();

  const weaponTxt = S.equipped?.weapon
    ? `${S.equipped.weapon.name} (+${S.equipped.weapon.atk})`
    : 'None';
  const depthTxt = `Depth ${S.depth}`;
  const levelTxt = `Lv. ${S.level}`;
  const goldTxt = `${S.gold}g`;

  const overlay = document.createElement('div');
  overlay.id = 'deathScreen';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '100000',
    display: 'grid',
    placeItems: 'center',
    pointerEvents: 'auto',
    background:
      'radial-gradient(70% 60% at 50% 35%, rgba(120,0,0,0.55), rgba(0,0,0,0.92))',
    animation: 'deathFadeIn 300ms ease-out both',
  });

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    width: 'min(560px, 92vw)',
    padding: '20px 18px',
    borderRadius: '16px',
    border: '1px solid #5a1c1c',
    background: 'linear-gradient(180deg, #1b0d10, #0b0507)',
    boxShadow: '0 10px 60px rgba(0,0,0,.7), inset 0 0 40px rgba(255,0,0,.08)',
    textAlign: 'center',
    color: '#f2dede',
    fontFamily: 'inherit',
  });

  const title = document.createElement('div');
  title.textContent = 'YOU HAVE FALLEN';
  Object.assign(title.style, {
    fontSize: '28px',
    letterSpacing: '2px',
    marginBottom: '8px',
    color: '#ffb3b3',
    textShadow: '0 0 18px rgba(255,70,70,.35)',
  });

  const sub = document.createElement('div');
  sub.innerHTML = `${depthTxt} • ${levelTxt} • <span style="color:#ffd86b">${goldTxt}</span>`;
  Object.assign(sub.style, { marginBottom: '10px', color: '#f7c6c6' });

  const wline = document.createElement('div');
  wline.innerHTML = `Weapon: <span style="color:#c7d2ff">${weaponTxt}</span>`;
  Object.assign(wline.style, { marginBottom: '14px', color: '#e6c8c8' });

  const btnWrap = document.createElement('div');
  Object.assign(btnWrap.style, {
    display: 'flex',
    gap: '10px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  });

  const mkBtn = (text) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.padding = '10px 14px';
    b.style.borderRadius = '999px';
    b.style.border = '1px solid #c98d0b';
    b.style.cursor = 'pointer';
    b.style.font = 'inherit';
    b.style.minWidth = '140px';
    b.style.boxShadow = '0 8px 24px rgba(0,0,0,.35)';
    b.style.background = 'linear-gradient(180deg, #ffd76e, #ffb703)';
    b.style.color = '#2b2411';
    return b;
  };

  const restartBtn = mkBtn('Restart Run');

  const cleanup = () => {
    if (__deathKeyHandler) {
      window.removeEventListener('keydown', __deathKeyHandler, true);
      __deathKeyHandler = null;
    }
    overlay.remove();
  };

  restartBtn.addEventListener('click', () => {
    cleanup();
    newGame();
  });

  btnWrap.appendChild(restartBtn);

  panel.appendChild(title);
  panel.appendChild(sub);
  panel.appendChild(wline);
  panel.appendChild(btnWrap);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  __deathKeyHandler = (e) => {
    const k = e.key.toLowerCase();
    e.stopImmediatePropagation();
    e.preventDefault();
    // Only allow quick restart
    if (k === 'enter' || k === 'r') {
      cleanup();
      newGame();
    }
    // No loading allowed here.
  };
  window.addEventListener('keydown', __deathKeyHandler, true);

  const styleId = 'deathScreen-anim';
  if (!document.getElementById(styleId)) {
    const s = document.createElement('style');
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
  logEl.innerHTML = '';
  addLog('You descend the stairs into the unknown.');
  refreshUI();
}

// ------------------------------
// Save / Load
// ------------------------------
const SAVE_KEY = 'retro-dungeon-save';
function saveGame() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(S));
  addLog('<small>[Saved]</small>');
}
// app.js — REPLACE your loadGame() with this
function loadGame() {
  if (document.getElementById('deathScreen')) {
    addLog('You cannot load while dead.', 'warn');
    return;
  }
  const snap = localStorage.getItem(SAVE_KEY);
  if (!snap) {
    addLog('No save found.');
    return;
  }
  try {
    S = JSON.parse(snap);
  } catch (e) {
    addLog('Corrupt save. Starting fresh.', 'warn');
    S = initialState();
  }

  // Clean up death overlay & key-capture if present
  const ds = document.getElementById('deathScreen');
  if (ds) ds.remove();
  if (typeof __deathKeyHandler === 'function') {
    try {
      window.removeEventListener('keydown', __deathKeyHandler, true);
    } catch {}
    __deathKeyHandler = null;
  }
  // Close any open dialogs
  document.querySelectorAll('dialog').forEach((d) => {
    try {
      if (d.open) d.close();
    } catch {}
  });

  // Harden state loaded from old saves
  sanitizeState();

  refreshUI();
  addLog('<small>[Loaded]</small>');

  // Resume combat modal if save had an active enemy
  if (S.enemy) {
    setEncounterStatus('Enemy!');
    openCombat(
      `You come to your senses mid-fight with a <strong>${S.enemy.name}</strong>! (HP ${S.enemy.hp})`
    );
  } else {
    setEncounterStatus('Idle');
  }
}

// ------------------------------
// Modals & Wiring
// ------------------------------
const combatModal = document.getElementById('combatModal');
// app.js — REPLACE the whole openCombat() function
function openCombat(openingLine) {
  const log = $('#combatLog');
  log.innerHTML = '';

  // Show portrait if the enemy defines an image
  if (S.enemy && S.enemy.img) {
    const img = document.createElement('img');
    img.src = S.enemy.img;
    img.alt = S.enemy.name || S.enemy.key;
    // minimal inline styling so you don't need CSS changes
    img.style.maxWidth = '60%';
    img.style.maxHeight = '100px';
    img.style.display = 'block';
    img.style.margin = '0 auto 8px';
    img.style.border = '1px solid #263774';
    img.style.borderRadius = '12px';
    img.style.imageRendering = 'pixelated';
    log.appendChild(img);
  }

  // Make sure the HP pill shows the starting HP right away
  if (S.enemy) {
    $('#combatEnemyHp').textContent = `HP ${S.enemy.hp}`;
  }

  addCombatLog(openingLine, 'warn');
  combatModal.showModal();
}
document.getElementById('invModal').addEventListener('close', () => {
  // If the player is still in combat, bring the combat modal back to the top layer.
  if (resumeCombatAfterInv && S.enemy && !combatModal.open) {
    setTimeout(() => {
      try {
        combatModal.showModal();
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
  if (!force) addLog('The dust settles.');
}

document.getElementById('dirUp').addEventListener('click', () => move(0, -1));
document.getElementById('dirDown').addEventListener('click', () => move(0, 1));
document.getElementById('dirLeft').addEventListener('click', () => move(-1, 0));
document.getElementById('dirRight').addEventListener('click', () => move(1, 0));

document.getElementById('actRest').addEventListener('click', rest);
document.getElementById('actWait').addEventListener('click', waitTurn);
document
  .getElementById('actInventory')
  .addEventListener('click', openInventoryModal);

document
  .getElementById('combatAttack')
  .addEventListener('click', () => playerAttack());
document
  .getElementById('combatFlee')
  .addEventListener('click', () => tryFlee());
document
  .getElementById('combatInventory')
  .addEventListener('click', openInventoryModal);
document
  .getElementById('combatClose')
  .addEventListener('click', () => closeCombat());

document.getElementById('shopClose').addEventListener('click', () => {
  if (shopModal.open) shopModal.close();
  S._offers = null;
});

document.getElementById('invClose').addEventListener('click', () => {
  const m = document.getElementById('invModal');
  if (m.open) m.close();
});

document.getElementById('newGame').addEventListener('click', newGame);
document.getElementById('saveGame').addEventListener('click', saveGame);
document.getElementById('loadGame').addEventListener('click', loadGame);

document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (document.getElementById('combatModal').open) {
    if (k === 'a') document.getElementById('combatAttack').click();
    else if (k === 'f') document.getElementById('combatFlee').click();
    else if (k === 'i') openInventoryModal();
    else if (k === 'escape') document.getElementById('combatClose').click();
    return;
  }
  if (k === 'w' || e.key === 'ArrowUp')
    document.getElementById('dirUp').click();
  else if (k === 's' || e.key === 'ArrowDown')
    document.getElementById('dirDown').click();
  else if (k === 'a' || e.key === 'ArrowLeft')
    document.getElementById('dirLeft').click();
  else if (k === 'd' || e.key === 'ArrowRight')
    document.getElementById('dirRight').click();
  else if (k === 'r') document.getElementById('actRest').click();
  else if (k === ' ') {
    e.preventDefault();
    document.getElementById('actWait').click();
  } else if (k === 'i') document.getElementById('actInventory').click();
  else if (k === 'n') document.getElementById('newGame').click();
  else if (k === 's') document.getElementById('saveGame').click();
  else if (k === 'l') document.getElementById('loadGame').click();
});

const about = document.getElementById('about');
document
  .getElementById('aboutBtn')
  .addEventListener('click', () => about.showModal());

// Boot
newGame();
