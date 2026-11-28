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

test("persistent health is used as the combat starting point", () => {
  const full = resolveCombatEncounter(8, 1, [], null, Array(40).fill(0.5));
  const injured = resolveCombatEncounter(8, 1, [], null, Array(40).fill(0.5), Math.floor(full.player.maxHp / 2));
  assert.equal(injured.player.remainingHp <= Math.floor(full.player.maxHp / 2), true);
  assert.equal(injured.player.maxHp, full.player.maxHp);
});

test("zero health cannot act in the combat simulation", () => {
  const result = resolveCombatEncounter(8, 1, [], null, Array(40).fill(0.5), 0);
  assert.equal(result.player.remainingHp, 0);
  assert.equal(result.turns.length, 0);
  assert.equal(result.victory, false);
});

test("card ability applies a bounded damage-over-time effect", () => {
  const result = resolveCombatEncounter(15, 10, [{ id: "burner", power: 30, ability: { id: "ember", effect: "burn", potency: 18 } }], "burner", Array(40).fill(0.5));
  assert.ok(result.turns.some(turn => turn.effect === "burn"));
  assert.ok(result.turns.every(turn => turn.damage >= 0 && turn.damage <= 900));
});

test("resistance prevents the corresponding persistent enemy status", () => {
  const card = { id: "ward", power: 10, resistances: ["burn"] };
  const result = resolveCombatEncounter(4, 30, [card], "ward", Array(40).fill(0.99));
  assert.equal(result.remainingStatuses.some(status => status.type === "burn"), false);
});

test("incoming statuses are normalized and bounded", () => {
  const result = resolveCombatEncounter(10, 5, [], null, Array(40).fill(0.5), 50, [
    { type: "burn", remaining: 999, potency: 999 },
    { type: "unknown", remaining: 2, potency: 2 },
  ]);
  assert.ok(result.remainingStatuses.length <= 4);
  assert.ok(result.remainingStatuses.every(status => status.remaining <= 3 && status.potency <= 30));
});