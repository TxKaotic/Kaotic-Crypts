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

const ENEMIES = [
  { key: "rat", name: "Cave Rat", hp: 6, atk: [1, 3], gold: [1, 3], xp: 2 },
  { key: "bat", name: "Gloom Bat", hp: 8, atk: [1, 4], gold: [2, 5], xp: 3 },
  {
    key: "slime",
    name: "Neon Slime",
    hp: 10,
    atk: [2, 5],
    gold: [3, 7],
    xp: 4,
  },
  {
    key: "skeleton",
    name: "Restless Bones",
    hp: 14,
    atk: [3, 7],
    gold: [5, 10],
    xp: 6,
  },
  {
    key: "mage",
    name: "Ashen Acolyte",
    hp: 18,
    atk: [4, 8],
    gold: [6, 12],
    xp: 8,
  },
];

// Consumables
const LOOT_TABLE = [
  {
    key: "potion",
    name: "Small Potion",
    kind: "consumable",
    heal: 8,
    price: 6,
  },
  { key: "mega", name: "Mega Potion", kind: "consumable", heal: 18, price: 16 },
  { key: "bomb", name: "Bomb", kind: "consumable", dmg: 10, price: 12 },
];

// Weapon templates — higher power => rarer (weights drop with atk), unlock by depth
const SWORDS = [
  {
    key: "rusty_dagger",
    name: "Rusty Dagger",
    atk: 1,
    minDepth: 1,
    weight: 60,
  },
  { key: "short_sword", name: "Short Sword", atk: 2, minDepth: 1, weight: 35 },
  { key: "iron_saber", name: "Iron Saber", atk: 3, minDepth: 2, weight: 25 },
  {
    key: "steel_longsword",
    name: "Steel Longsword",
    atk: 4,
    minDepth: 3,
    weight: 15,
  },
  { key: "knight_blade", name: "Knight Blade", atk: 5, minDepth: 4, weight: 8 },
  {
    key: "crystal_saber",
    name: "Crystal Saber",
    atk: 6,
    minDepth: 5,
    weight: 5,
  },
  { key: "dragonfang", name: "Dragonfang", atk: 7, minDepth: 6, weight: 3 },
  {
    key: "sunsteel_edge",
    name: "Sunsteel Edge",
    atk: 9,
    minDepth: 8,
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
];

// ------------------------------
// Game State
// ------------------------------
const initialState = () => ({
  name: "The Wanderer",
  depth: 1,
  level: 1,
  hp: 20,
  maxHp: 20,
  xp: 0,
  xpToNext: 10,
  gold: 0,
  // Inventory can contain consumables {key, qty} and weapons {key:'weapon', id, name, atk, rarity, price, source}
  inventory: [{ key: "potion", qty: 2 }],
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
  equipped: { weapon: null },
  // Trader cooldown to avoid back-to-back encounters
  traderCooldown: 0,
});

let S = initialState();

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

// Glimmer effect
function flashGlimmer() {
  const fx = document.getElementById("fx");
  fx.classList.remove("glimmer");
  void fx.offsetWidth; // restart animation
  fx.classList.add("glimmer");
}

// ------------------------------
// Stats & UI
// ------------------------------
function setBar(el, val, max, textEl) {
  const pct = Math.max(0, Math.min(100, Math.round((val / max) * 100)));
  el.style.setProperty("--val", pct + "%");
  if (textEl) textEl.textContent = `${val}/${max}`;
}

function renderStats() {
  setBar($("#hpBar"), S.hp, S.maxHp, $("#hpText"));
  setBar($("#xpBar"), S.xp, S.xpToNext, $("#xpText"));
  $("#goldPill").textContent = `Gold: ${S.gold}`;
  $("#levelPill").textContent = `Lv. ${S.level}`;
  $("#playerName").textContent = S.name;
  $("#depthPill").textContent = `Depth ${S.depth}`;
  if (S.enemy) $("#combatEnemyHp").textContent = `HP ${S.enemy.hp}`;
  $("#shopGold").textContent = `Gold: ${S.gold}`;
  $("#invGold").textContent = `Gold: ${S.gold}`;
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
        S.equipped.weapon && S.equipped.weapon.id === it.id
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
  if (!S.exitPos) generateExit();
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
  $("#roomTitle").textContent = RNG.pick([
    "Dank Passage",
    "Mossy Archway",
    "Collapsed Hall",
    "Silent Crypt",
    "Crystal Cavern",
    "Forgotten Library",
    "Shimmering Tunnel",
    "Broken Bridge",
  ]);
  $("#roomTags").textContent = RNG.pick(ROOM_TAGS);
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
      addLog("You discover a hidden stairwell <strong>★</strong>!", "good");
      renderMap();
    }
    const ok = confirm(`Descend to Depth ${S.depth + 1}?`);
    if (ok) {
      descend();
      return true;
    }
    addLog("You decide to explore a bit longer.");
  }
  return false;
}

function descend() {
  S.depth += 1;
  S.map = Array.from({ length: S.mapSize }, () => Array(S.mapSize).fill(false));
  S.pos = { x: 0, y: 0 };
  S.map[S.pos.y][S.pos.x] = true;
  generateExit();
  addLog(`<em>You descend to Depth ${S.depth}…</em>`, "good");
  renderMap();
  setRoom();
  renderStats();
  setEncounterStatus("Idle");
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

function openInventoryModal() {
  const m = document.getElementById("invModal");
  const list = document.getElementById("invList");
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
    }
  });
  m.showModal();
  renderStats();
}

function useSpecificItem(key) {
  const meta = LOOT_TABLE.find((l) => l.key === key);
  if (!meta) return;
  if (key === "potion" || key === "mega") {
    if (removeItem(key, 1)) {
      S.hp = Math.min(S.maxHp, S.hp + (meta.heal || 0));
      const msg = `You drink ${meta.name} and restore <span class="good">${meta.heal} HP</span>.`;
      addLog(msg, "good");
      if (document.getElementById("combatModal").open)
        addCombatLog(msg, "good");
      renderStats();
      if (S.enemy) enemyAttack();
    }
  } else if (key === "bomb") {
    if (!S.enemy) {
      addLog("You consider lighting a bomb…but decide against it.");
      return;
    }
    if (removeItem("bomb", 1)) {
      const dmg = meta.dmg;
      S.enemy.hp -= dmg;
      addCombatLog(`You hurl a bomb for <strong>${dmg}</strong>!`);
      if (S.enemy.hp <= 0) {
        const gold = RNG.int(...S.enemy.gold);
        const xp = S.enemy.xp;
        addCombatLog(
          `The ${S.enemy.name} is blasted apart! <span class="good">${gold}g</span> scooped.`,
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
    }
  }
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
  if (!RNG.chance(30)) return; // 30% to drop
  const tpl = pickDropWeapon();
  const w = makeWeaponFromTemplate(tpl, "drop", 1);
  addWeapon(w);
  addLog(
    `You find a <strong>${w.name}</strong> <span class="good">(+${w.atk})</span>!`,
    "good"
  );
  flashGlimmer();
}

// ------------------------------
// Progression
// ------------------------------
function gainXP(x) {
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
  S.gold += g;
  renderStats();
}

// ------------------------------
// Encounters & Combat
// ------------------------------
function rollEncounter(opts = {}) {
  // enemy 45%, loot 15%, trap 12%, weapon trader 3%, general trader 2%, empty 23%
  const { forbidLoot = false } = opts; // ← new: lets us disable item finds (e.g., during rest)
  const r = RNG.int(1, 100);

  if (r <= 45) {
    const pool = ENEMIES.filter((e) => e.hp <= 10 + S.depth * 4);
    const meta = RNG.pick(pool.length ? pool : ENEMIES);
    S.enemy = JSON.parse(JSON.stringify(meta));
    setEncounterStatus("Enemy!");
    openCombat(
      `A <strong>${S.enemy.name}</strong> emerges from the dark! (HP ${S.enemy.hp})`
    );
  } else if (r <= 60) {
    if (forbidLoot) {
      // While resting, you shouldn't randomly "find" items.
      // Treat this roll as a quiet moment instead.
      addLog("You keep still; nothing turns up while you rest.");
    } else {
      const loot = RNG.pick(LOOT_TABLE);
      addItem(loot.key, 1);
      addLog(`You find <strong>${loot.name}</strong>.`, "good");
    }
  } else if (r <= 72) {
    const dmg = RNG.int(1, 4 + Math.floor(S.depth / 2));
    S.hp = Math.max(0, S.hp - dmg);
    addLog(
      `A hidden trap snaps! You take <span class="bad">${dmg} damage</span>.`,
      "bad"
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
    addLog("The corridor stretches on in eerie silence.");
  }
}

function enemyAttack() {
  if (!S.enemy) return;
  const dmg = RNG.int(S.enemy.atk[0], S.enemy.atk[1]);
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
  return S.equipped.weapon ? S.equipped.weapon.atk : 0;
}

function playerAttack() {
  if (!S.enemy) return;
  const base = [2, 6];
  const wpn = currentWeaponBonus();
  const dmg = RNG.int(
    base[0] + Math.floor(S.level / 2) + wpn,
    base[1] + Math.floor(S.level / 1.5) + wpn
  );
  S.enemy.hp -= dmg;
  const wtxt = wpn ? ` with your ${S.equipped.weapon.name}` : "";
  addCombatLog(`You strike${wtxt} for <strong>${dmg}</strong>.`);
  renderStats();
  if (S.enemy.hp <= 0) {
    const gold = RNG.int(...S.enemy.gold);
    const xp = S.enemy.xp;
    addCombatLog(
      `The ${S.enemy.name} is defeated! You loot <span class="good">${gold}g</span>.`,
      "good"
    );
    gainGold(gold);
    gainXP(xp);
    maybeDropWeapon();
    S.enemy = null;
    setEncounterStatus("Idle");
    closeCombat();
    // Optional random descent
    if (RNG.chance(30)) {
      S.depth++;
      addLog("<em>You feel the pull of deeper darkness…</em>");
    }
    renderStats();
  } else {
    enemyAttack();
  }
}

function tryFlee() {
  if (!S.enemy) return;
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

function openWeaponShop() {
  // Weapon trader: pricey, weaker than drops (0.7–0.85 power), plus premium bombs
  const candidates = SWORDS.filter((w) => w.minDepth <= S.depth);
  const picks = [];
  for (let i = 0; i < 2; i++) picks.push(weightedPick(candidates));
  const weaponsForSale = picks.map((tpl) => {
    const powerFactor = 0.7 + Math.random() * 0.15; // 70%–85% of template power
    const w = makeWeaponFromTemplate(tpl, "shop", powerFactor);
    if (!w.name.includes("(Replica)") && powerFactor < 0.8)
      w.name += " (Replica)";
    return w;
  });
  const bombMeta = LOOT_TABLE.find((x) => x.key === "bomb");
  const priceyBomb = { ...bombMeta, price: bombMeta.price + 10 };
  const offers = weaponsForSale
    .map((w) => ({ type: "weapon", item: w }))
    .concat([{ type: "consumable", item: priceyBomb }]);

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

  renderStats();
  shopModal.showModal();
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

  // tick down trader cooldown per step
  if (S.traderCooldown > 0) S.traderCooldown--;

  renderMap();
  setRoom();

  // Exit handling first
  if (checkExitContact()) return;

  if (revisiting) {
    addLog("You return to a room you already explored. It's quiet.");
    setEncounterStatus("Idle");
    return;
  }

  rollEncounter();
}

function rest() {
  const heal = RNG.int(1, 3);
  S.hp = Math.min(S.maxHp, S.hp + heal);
  addLog(
    `You rest, patching wounds (+<span class=\"good\">${heal} HP</span>). <em>Risk: you might be ambushed.</em>`,
    "good"
  );
  if (RNG.chance(30)) {
    addLog("…Ambush!", "warn");
    rollEncounter({ forbidLoot: true });
  }
  renderStats();
}

function waitTurn() {
  addLog("You wait, listening to distant drips and skittering…");
  if (RNG.chance(15)) {
    addLog("Something approaches!", "warn");
    rollEncounter();
  }
}

// ------------------------------
// Death & New Game
// ------------------------------
function onDeath() {
  addLog("<strong>You are dead…</strong>", "bad");
  setEncounterStatus("Defeated");
}

function newGame() {
  S = initialState();
  ensureMap();
  generateExit();
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
function loadGame() {
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
  refreshUI();
  addLog("<small>[Loaded]</small>");
}

// ------------------------------
// Modals & Wiring
// ------------------------------
const combatModal = document.getElementById("combatModal");
function openCombat(openingLine) {
  $("#combatLog").innerHTML = "";
  addCombatLog(openingLine, "warn");
  combatModal.showModal();
}
function closeCombat(force = false) {
  if (combatModal.open) combatModal.close();
  if (!force) addLog("The dust settles.");
}

document.getElementById("dirUp").addEventListener("click", () => move(0, -1));
document.getElementById("dirDown").addEventListener("click", () => move(0, 1));
document.getElementById("dirLeft").addEventListener("click", () => move(-1, 0));
document.getElementById("dirRight").addEventListener("click", () => move(1, 0));

document.getElementById("actRest").addEventListener("click", rest);
document.getElementById("actWait").addEventListener("click", waitTurn);
document
  .getElementById("actInventory")
  .addEventListener("click", openInventoryModal);

document
  .getElementById("combatAttack")
  .addEventListener("click", () => playerAttack());
document
  .getElementById("combatFlee")
  .addEventListener("click", () => tryFlee());
document
  .getElementById("combatInventory")
  .addEventListener("click", openInventoryModal);
document
  .getElementById("combatClose")
  .addEventListener("click", () => closeCombat());

document.getElementById("shopClose").addEventListener("click", () => {
  if (shopModal.open) shopModal.close();
  S._offers = null;
});

document.getElementById("invClose").addEventListener("click", () => {
  const m = document.getElementById("invModal");
  if (m.open) m.close();
});

document.getElementById("newGame").addEventListener("click", newGame);
document.getElementById("saveGame").addEventListener("click", saveGame);
document.getElementById("loadGame").addEventListener("click", loadGame);

document.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (document.getElementById("combatModal").open) {
    if (k === "a") document.getElementById("combatAttack").click();
    else if (k === "f") document.getElementById("combatFlee").click();
    else if (k === "i") openInventoryModal();
    else if (k === "escape") document.getElementById("combatClose").click();
    return;
  }
  if (k === "w" || e.key === "ArrowUp")
    document.getElementById("dirUp").click();
  else if (k === "s" || e.key === "ArrowDown")
    document.getElementById("dirDown").click();
  else if (k === "a" || e.key === "ArrowLeft")
    document.getElementById("dirLeft").click();
  else if (k === "d" || e.key === "ArrowRight")
    document.getElementById("dirRight").click();
  else if (k === "r") document.getElementById("actRest").click();
  else if (k === " ") {
    e.preventDefault();
    document.getElementById("actWait").click();
  } else if (k === "i") document.getElementById("actInventory").click();
  else if (k === "n") document.getElementById("newGame").click();
  else if (k === "s") document.getElementById("saveGame").click();
  else if (k === "l") document.getElementById("loadGame").click();
});

const about = document.getElementById("about");
document
  .getElementById("aboutBtn")
  .addEventListener("click", () => about.showModal());

// Boot
newGame();
