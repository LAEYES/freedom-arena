export type StoredCard = {
  id?: unknown; name?: unknown; rarity?: unknown; power?: unknown;
  defense?: unknown; vitality?: unknown; level?: unknown;
};

export type Combatant = {
  maxHp: number; attack: number; defense: number; speed: number;
};

export type CombatTurn = {
  turn: number;
  actor: "player" | "enemy";
  action: "strike" | "heavy_strike" | "guard" | "skill";
  damage: number;
  targetHp: number;
  effect?: "guard" | "exposed" | "burn";
};

export type CombatEncounter = {
  victory: boolean;
  outcome: "victory" | "defeat" | "draw";
  enemyLevel: number;
  player: Combatant & { remainingHp: number };
  enemy: Combatant & { remainingHp: number };
  turns: CombatTurn[];
  xpAwarded: number;
  resourcesAwarded: number;
  threatDelta: number;
  equippedCardId: string | null;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? Math.floor(value) : min));

const stat = (value: unknown, fallback: number, max: number) =>
  clamp(typeof value === "number" ? value : fallback, 0, max);

const rollAt = (rolls: number[], index: number) =>
  Math.max(0, Math.min(0.999999, Number.isFinite(rolls[index]) ? rolls[index] : 0.5));

export function buildPlayerCombatant(
  playerLevel: number,
  card: StoredCard | null,
): Combatant {
  const level = clamp(playerLevel, 1, 100);
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
  playerLevel: number,
  worldThreat: number,
  cards: StoredCard[],
  equippedCardId: string | null,
  rolls: number[],
  currentHp?: number | null,
): CombatEncounter {
  const level = clamp(playerLevel, 1, 100);
  const threat = clamp(worldThreat, 1, 100);
  const card = equippedCardId
    ? cards.find((candidate) => candidate && candidate.id === equippedCardId) ?? null
    : null;
  const playerBase = buildPlayerCombatant(level, card);
  const enemyLevel = clamp(level + (threat >= 30 ? 2 : threat >= 12 ? 1 : 0) + (rollAt(rolls, 0) > 0.78 ? 1 : 0), 1, 100);
  const enemy: Combatant = {
    maxHp: clamp(62 + enemyLevel * 9 + threat, 60, 1800),
    attack: clamp(9 + enemyLevel * 2 + Math.floor(threat / 8), 8, 650),
    defense: clamp(4 + enemyLevel + Math.floor(threat / 12), 0, 550),
    speed: clamp(9 + enemyLevel + Math.floor(threat / 15), 5, 140),
  };

  let playerHp = currentHp === null || currentHp === undefined
    ? playerBase.maxHp
    : clamp(currentHp, 0, playerBase.maxHp);
  let enemyHp = enemy.maxHp;
  let enemyExposed = 0;
  let enemyGuard = 0;
  const turns: CombatTurn[] = [];
  const playerFirst = playerBase.speed >= enemy.speed;
  const maxRounds = 12;

  for (let round = 1; round <= maxRounds && playerHp > 0 && enemyHp > 0; round++) {
    const order: Array<"player" | "enemy"> = playerFirst
      ? ["player", "enemy"] : ["enemy", "player"];
    for (const actor of order) {
      if (playerHp <= 0 || enemyHp <= 0) break;
      if (actor === "player") {
        const useSkill = round % 3 === 0 && rollAt(rolls, round * 2) > 0.25;
        if (useSkill) {
          const damage = clamp(Math.max(1, Math.floor((playerBase.attack * 1.55 - enemy.defense * 0.45 - enemyGuard) * (enemyExposed ? 1.25 : 1))), 1, 900);
          enemyHp = Math.max(0, enemyHp - damage);
          enemyExposed = 1;
          enemyGuard = 0;
          turns.push({ turn: round, actor, action: "skill", damage, targetHp: enemyHp, effect: "exposed" });
        } else {
          const critical = rollAt(rolls, round * 2 + 1) > 0.9;
          const damage = clamp(Math.max(1, Math.floor((playerBase.attack * (critical ? 1.65 : 1) - enemy.defense * 0.55 - enemyGuard) * (enemyExposed ? 1.2 : 1))), 1, 800);
          enemyHp = Math.max(0, enemyHp - damage);
          enemyExposed = 0;
          enemyGuard = 0;
          turns.push({ turn: round, actor, action: "strike", damage, targetHp: enemyHp });
        }
      } else if (round % 5 === 0 && rollAt(rolls, round * 3) > 0.2) {
        enemyGuard = clamp(Math.floor(enemy.defense * 0.8), 0, 400);
        turns.push({ turn: round, actor, action: "guard", damage: 0, targetHp: enemyHp, effect: "guard" });
      } else {
        const enemyHeavy = round % 4 === 0 && rollAt(rolls, round * 3) > 0.35;
        const rawDamage = enemy.attack * (enemyHeavy ? 1.45 : 1);
        const damage = clamp(Math.max(1, Math.floor(rawDamage - playerBase.defense * 0.6)), 1, 750);
        playerHp = Math.max(0, playerHp - damage);
        turns.push({ turn: round, actor, action: enemyHeavy ? "heavy_strike" : "strike", damage, targetHp: playerHp });
      }
    }
  }

  const victory = enemyHp <= 0 && playerHp > 0;
  const outcome = victory ? "victory" : playerHp <= 0 && enemyHp <= 0 ? "draw" : "defeat";
  const xpAwarded = victory ? 25 + enemyLevel * 8 : 5 + Math.floor(level * 2);
  return {
    victory, outcome, enemyLevel,
    player: { ...playerBase, remainingHp: playerHp },
    enemy: { ...enemy, remainingHp: enemyHp },
    turns,
    xpAwarded,
    resourcesAwarded: victory ? 1 + Math.floor(enemyLevel / 10) : 0,
    threatDelta: victory ? -2 : outcome === "draw" ? 0 : 1,
    equippedCardId: card && typeof card.id === "string" ? card.id : null,
  };
}
