import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildPlayerCombatant, resolveCombatEncounter } from "./combatEngine.ts";

test("equipped card increases combat attributes", () => {
  const base = buildPlayerCombatant(10, null);
  const geared = buildPlayerCombatant(10, { id: "c1", power: 40, defense: 20, vitality: 80, level: 5 });
  assert.ok(geared.attack > base.attack);
  assert.ok(geared.defense > base.defense);
  assert.ok(geared.maxHp > base.maxHp);
});

test("same server inputs and rolls produce identical combat", () => {
  const args = [12, 8, [{ id: "c1", power: 30, defense: 15, vitality: 50, level: 3 }], "c1", Array(40).fill(0.42)];
  assert.deepEqual(resolveCombatEncounter(...args), resolveCombatEncounter(...args));
});

test("combat is bounded and rewards are server-calculated", () => {
  const result = resolveCombatEncounter(1000, 1000, [], null, Array(40).fill(0.99));
  assert.ok(result.turns.length <= 24);
  assert.ok(result.turns.every(turn => turn.damage >= 0 && turn.damage <= 900));
  assert.ok(result.xpAwarded >= 0 && result.xpAwarded <= 1000);
  assert.ok(result.resourcesAwarded >= 0 && result.resourcesAwarded <= 101);
});

test("invalid and missing equipped card safely falls back to base stats", () => {
  const result = resolveCombatEncounter(1, 1, [{ id: "other", power: 9999 }], "missing", Array(40).fill(0.5));
  assert.equal(result.equippedCardId, null);
  assert.equal(result.player.attack, buildPlayerCombatant(1, null).attack);
});
