export type CombatOutcome = {
  victory: boolean;
  enemyLevel: number;
  xpAwarded: number;
  resourcesAwarded: number;
  threatDelta: number;
};

export function resolveServerCombat(playerLevel: number, randomValue: number): CombatOutcome {
  const level = Math.max(1, Math.min(100, Math.floor(playerLevel)));
  const roll = Math.max(0, Math.min(0.999999999, randomValue));
  const enemyLevel = Math.max(1, Math.min(100, level + (roll > 0.72 ? 1 : 0)));
  const playerPower = level + 2;
  const enemyPower = enemyLevel + 1;
  const victory = roll < Math.min(0.9, Math.max(0.1, 0.5 + (playerPower - enemyPower) * 0.08));
  return {
    victory,
    enemyLevel,
    xpAwarded: victory ? 20 + enemyLevel * 10 : 5,
    resourcesAwarded: victory ? 1 : 0,
    threatDelta: victory ? -1 : 1,
  };
}
