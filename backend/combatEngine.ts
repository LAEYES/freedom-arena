import { chooseEnemyArchetype, decideEnemyTactics, type EnemyArchetype } from "./enemyAI.ts";
export type CombatEffect = "burn" | "poison" | "weaken" | "expose" | "shield" | "regeneration";
export type PersistentStatus = { type: "burn" | "poison" | "weaken"; remaining: number; potency: number };
export type StoredCard = {
  id?: unknown; name?: unknown; rarity?: unknown; slot?: unknown; power?: unknown;
  defense?: unknown; vitality?: unknown; level?: unknown;
  ability?: { id?: unknown; effect?: unknown; potency?: unknown };
  resistances?: unknown;
};
export type Combatant = { maxHp: number; attack: number; defense: number; speed: number };
export type CombatTurn = {
  turn: number; actor: "player" | "enemy";
  action: "strike" | "heavy_strike" | "guard" | "skill";
  damage: number; targetHp: number; effect?: CombatEffect | "guard";
};
export type CombatEncounter = {
  victory: boolean; outcome: "victory" | "defeat" | "draw"; enemyLevel: number;
  player: Combatant & { remainingHp: number }; enemy: Combatant & { remainingHp: number };
  turns: CombatTurn[]; xpAwarded: number; resourcesAwarded: number;
  threatDelta: number; equippedCardId: string | null; remainingStatuses: PersistentStatus[]; enemyArchetype: EnemyArchetype;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(v) ? Math.floor(v) : min));
const stat = (v: unknown, fallback: number, max: number) => clamp(typeof v === "number" ? v : fallback, 0, max);
const rollAt = (rolls: number[], i: number) => Math.max(0, Math.min(0.999999, Number.isFinite(rolls[i]) ? rolls[i] : 0.5));
const EFFECTS = new Set<CombatEffect>(["burn", "poison", "weaken", "expose", "shield", "regeneration"]);
const RESISTIBLE = new Set(["burn", "poison", "weaken"]);
const normalizeStatuses = (input: PersistentStatus[] = []): PersistentStatus[] => Array.isArray(input)
  ? input.slice(0, 4).flatMap((s) => s && RESISTIBLE.has(s.type) && Number.isFinite(s.remaining) && Number.isFinite(s.potency)
    ? [{ type: s.type as PersistentStatus["type"], remaining: clamp(s.remaining, 0, 3), potency: clamp(s.potency, 1, 30) }]
    : []) : [];

export function buildPlayerCombatant(levelInput: number, card: StoredCard | null): Combatant {
  const level = clamp(levelInput, 1, 100);
  const power = card ? stat(card.power, 0, 500) : 0;
  const defense = card ? stat(card.defense, 0, 500) : 0;
  const vitality = card ? stat(card.vitality, 0, 1000) : 0;
  const cardLevel = card ? clamp(typeof card.level === "number" ? card.level : 1, 1, 100) : 1;
  return {
    maxHp: clamp(70 + level * 8 + vitality, 50, 2000),
    attack: clamp(8 + level * 2 + power + Math.floor(cardLevel / 2), 5, 700),
    defense: clamp(3 + level + defense, 0, 600),
    speed: clamp(10 + level + Math.floor(power / 10), 5, 150),
  };
}

export function resolveCombatEncounter(
  playerLevel: number, worldThreat: number, cards: StoredCard[], equippedCardId: string | null,
  rolls: number[], currentHp?: number | null, activeStatuses: PersistentStatus[] = [], equipment?: EquipmentLoadout,
): CombatEncounter {
  const level = clamp(playerLevel, 1, 100);
  const threat = clamp(worldThreat, 1, 100);
  const loadout = equipment ?? (equippedCardId ? { weapon: equippedCardId } : {});
  const card = loadout.weapon ? cards.find(c => c && c.id === loadout.weapon) ?? null : null;
  const playerBase = equipment ? buildEquippedCombatant(level, cards, loadout) : buildPlayerCombatant(level, card);
  const enemyLevel = clamp(level + (threat >= 30 ? 2 : threat >= 12 ? 1 : 0) + (rollAt(rolls, 0) > 0.78 ? 1 : 0), 1, 100);
  const enemyArchetype = chooseEnemyArchetype(rollAt(rolls, 39));
  const enemy: Combatant = {
    maxHp: clamp(62 + enemyLevel * 9 + threat, 60, 1800),
    attack: clamp(9 + enemyLevel * 2 + Math.floor(threat / 8), 8, 650),
    defense: clamp(4 + enemyLevel + Math.floor(threat / 12), 0, 550),
    speed: clamp(9 + enemyLevel + Math.floor(threat / 15), 5, 140),
  };
  const resistances = new Set(Array.isArray(card?.resistances)
    ? card!.resistances.filter((v): v is string => typeof v === "string" && RESISTIBLE.has(v)).slice(0, 3) : []);
  const ability = card?.ability && typeof card.ability === "object" ? card.ability : null;
  const abilityEffect = typeof ability?.effect === "string" && EFFECTS.has(ability.effect as CombatEffect)
    ? ability.effect as CombatEffect : "expose";
  const abilityPower = stat(ability?.potency, 12, 40);
  let playerHp = currentHp == null ? playerBase.maxHp : clamp(currentHp, 0, playerBase.maxHp);
  let enemyHp = enemy.maxHp;
  let enemyDots: PersistentStatus[] = [];
  let enemyWeakenedRounds = 0;
  let enemyExposed = 0, enemyGuard = 0, playerShield = 0, regeneration = 0, weakenedRounds = 0;
  let statuses = normalizeStatuses(activeStatuses);
  const turns: CombatTurn[] = [];
  const playerFirst = playerBase.speed >= enemy.speed;
  for (let round = 1; round <= 12 && playerHp > 0 && enemyHp > 0; round++) {
    for (const status of statuses) {
      if (status.remaining <= 0 || playerHp <= 0) continue;
      if (status.type === "burn" || status.type === "poison") {
        const damage = Math.min(playerHp, status.potency);
        playerHp -= damage;
        turns.push({ turn: round, actor: "enemy", action: "skill", damage, targetHp: playerHp, effect: status.type });
      } else if (status.type === "weaken") weakenedRounds = Math.max(weakenedRounds, status.remaining);
      status.remaining--;
    }
    statuses = statuses.filter(s => s.remaining > 0);
    if (regeneration > 0 && playerHp > 0) {
      const healed = Math.min(playerBase.maxHp - playerHp, regeneration);
      playerHp += healed;
      turns.push({ turn: round, actor: "player", action: "skill", damage: 0, targetHp: playerHp, effect: "regeneration" });
    }
    for (const dot of enemyDots) {
      if (dot.remaining > 0 && enemyHp > 0) {
        const damage = Math.min(enemyHp, dot.potency);
        enemyHp -= damage;
        turns.push({ turn: round, actor: "player", action: "skill", damage, targetHp: enemyHp, effect: dot.type });
        dot.remaining--;
      }
    }
    enemyDots = enemyDots.filter(dot => dot.remaining > 0);
    const order: Array<"player" | "enemy"> = playerFirst ? ["player", "enemy"] : ["enemy", "player"];
    for (const actor of order) {
      if (playerHp <= 0 || enemyHp <= 0) break;
      if (actor === "player") {
        if (round % 3 === 0 && abilityEffect === "shield") {
          playerShield = clamp(abilityPower, 1, 40);
          turns.push({ turn: round, actor, action: "skill", damage: 0, targetHp: playerHp, effect: "shield" });
        } else if (round % 3 === 0 && abilityEffect === "regeneration") {
          regeneration = abilityPower;
          turns.push({ turn: round, actor, action: "skill", damage: 0, targetHp: playerHp, effect: "regeneration" });
        } else {
          const skill = round % 3 === 0;
          const weakened = weakenedRounds > 0 ? 0.7 : 1;
          const raw = playerBase.attack * (skill ? 1.55 : rollAt(rolls, round * 2 + 1) > 0.9 ? 1.65 : 1) * weakened;
          const damage = clamp(Math.max(1, Math.floor((raw - enemy.defense * (skill ? 0.45 : 0.55) - enemyGuard) * (enemyExposed ? 1.2 : 1))), 1, 900);
          enemyHp = Math.max(0, enemyHp - damage);
          enemyGuard = 0;
          enemyExposed = abilityEffect === "expose" && skill ? 1 : 0;
          if (skill && (abilityEffect === "burn" || abilityEffect === "poison")) enemyDots.push({ type: abilityEffect, remaining: 2, potency: abilityPower });
          if (skill && abilityEffect === "weaken") enemyWeakenedRounds = 2;
          turns.push({ turn: round, actor, action: skill ? "skill" : "strike", damage, targetHp: enemyHp, effect: skill ? abilityEffect : undefined });
        }
      } else {
        const decision = decideEnemyTactics({
          archetype: enemyArchetype, enemy: { x: 10, y: 10 }, player: { x: 11, y: 10 },
          enemyHp, enemyMaxHp: enemy.maxHp, turn: round, roll: rollAt(rolls, round * 3),
        });
        if (decision.action === "guard" || decision.action === "retreat") {
          enemyGuard = clamp(Math.floor(enemy.defense * (enemyArchetype === "sentinel" ? 1.1 : 0.8)), 0, 450);
          turns.push({ turn: round, actor, action: "guard", damage: 0, targetHp: enemyHp, effect: "guard" });
        } else if (decision.action === "skill") {
          const applies = !resistances.has("weaken");
          if (applies) statuses.push({ type: "weaken", remaining: 1, potency: 5 });
          turns.push({ turn: round, actor, action: "skill", damage: 0, targetHp: playerHp, effect: applies ? "weaken" : undefined });
        } else {
          const heavy = decision.action === "heavy_strike" || (enemyArchetype === "bruiser" && rollAt(rolls, round * 3 + 1) > 0.35);
          const raw = enemy.attack * (heavy ? (enemyArchetype === "bruiser" ? 1.6 : 1.45) : 1) * (enemyWeakenedRounds > 0 ? 0.7 : 1);
          const damage = clamp(Math.max(1, Math.floor(raw - playerBase.defense * 0.6 - playerShield)), 1, 750);
          playerHp = Math.max(0, playerHp - damage);
          playerShield = 0;
          turns.push({ turn: round, actor, action: heavy ? "heavy_strike" : "strike", damage, targetHp: playerHp });
          if (heavy && playerHp > 0 && rollAt(rolls, round * 3 + 1) > 0.6 && !resistances.has("burn")) {
            statuses.push({ type: "burn", remaining: 2, potency: 4 });
            turns.push({ turn: round, actor: "enemy", action: "skill", damage: 0, targetHp: playerHp, effect: "burn" });
          }
        }
      }
    }
    if (weakenedRounds > 0) weakenedRounds--;
    if (enemyWeakenedRounds > 0) enemyWeakenedRounds--;
  }
  const victory = enemyHp <= 0 && playerHp > 0;
  const outcome = victory ? "victory" : playerHp <= 0 && enemyHp <= 0 ? "draw" : "defeat";
  return {
    victory, outcome, enemyLevel,
    player: { ...playerBase, remainingHp: playerHp },
    enemy: { ...enemy, remainingHp: enemyHp }, turns,
    xpAwarded: victory ? 25 + enemyLevel * 8 : 5 + Math.floor(level * 2),
    resourcesAwarded: victory ? 1 + Math.floor(enemyLevel / 10) : 0,
    threatDelta: victory ? -2 : outcome === "draw" ? 0 : 1,
    equippedCardId: card && typeof card.id === "string" ? card.id : null,
    remainingStatuses: normalizeStatuses(statuses), enemyArchetype,
  };
}

export type EquipmentSlot = "weapon" | "armor" | "accessory1" | "accessory2";
export type EquipmentLoadout = Partial<Record<EquipmentSlot, string>>;
const EQUIPMENT_SLOTS: EquipmentSlot[] = ["weapon", "armor", "accessory1", "accessory2"];

export function normalizeEquipment(value: unknown, cards: StoredCard[], legacyEquippedId?: string | null): EquipmentLoadout {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const inventory = new Set(cards.slice(0, 500).flatMap(card => typeof card?.id === "string" ? [card.id] : []));
  const result: EquipmentLoadout = {};
  for (const slot of EQUIPMENT_SLOTS) {
    const id = source[slot];
    if (typeof id === "string" && inventory.has(id) && !Object.values(result).includes(id)) result[slot] = id;
  }
  if (!result.weapon && typeof legacyEquippedId === "string" && inventory.has(legacyEquippedId) && !Object.values(result).includes(legacyEquippedId)) {
    result.weapon = legacyEquippedId;
  }
  return result;
}

export function buildEquippedCombatant(level: number, cards: StoredCard[], loadout: EquipmentLoadout): Combatant {
  const equipped = EQUIPMENT_SLOTS.flatMap(slot => {
    const id = loadout[slot];
    return id ? [cards.find(card => card && card.id === id)].filter((card): card is StoredCard => Boolean(card)) : [];
  });
  const aggregate: StoredCard = {
    power: Math.min(500, equipped.reduce((sum, card) => sum + stat(card.power, 0, 250), 0)),
    defense: Math.min(500, equipped.reduce((sum, card) => sum + stat(card.defense, 0, 250), 0)),
    vitality: Math.min(1000, equipped.reduce((sum, card) => sum + stat(card.vitality, 0, 500), 0)),
    level: Math.max(1, ...equipped.map(card => clamp(typeof card.level === "number" ? card.level : 1, 1, 100))),
  };
  return buildPlayerCombatant(level, equipped.length ? aggregate : null);
}

export type LootDrop = { itemId: string; quantity: number };
const LOOT_TABLE: Array<{ itemId: string; chance: number; min: number; max: number }> = [
  { itemId: "scrap_metal", chance: 0.75, min: 1, max: 3 },
  { itemId: "arcane_shard", chance: 0.22, min: 1, max: 2 },
  { itemId: "medicinal_herb", chance: 0.35, min: 1, max: 2 },
];

export function resolveVictoryLoot(victory: boolean, rolls: number[]): LootDrop[] {
  if (!victory) return [];
  const drops: LootDrop[] = [];
  LOOT_TABLE.forEach((entry, index) => {
    const chanceRoll = rollAt(rolls, 30 + index * 2);
    const quantityRoll = rollAt(rolls, 31 + index * 2);
    if (chanceRoll < entry.chance) {
      drops.push({ itemId: entry.itemId, quantity: entry.min + Math.floor(quantityRoll * (entry.max - entry.min + 1)) });
    }
  });
  return drops;
}
