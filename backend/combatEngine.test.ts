import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildEquippedCombatant, buildPlayerCombatant, normalizeEquipment, resolveCombatEncounter } from "./combatEngine.ts";

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

test("multi-slot equipment aggregates bounded combat attributes", () => {
  const cards = [
    { id: "blade", power: 35, defense: 0, vitality: 0, level: 4 },
    { id: "plate", power: 0, defense: 28, vitality: 60, level: 3 },
    { id: "charm", power: 12, defense: 8, vitality: 25, level: 2 },
  ];
  const base = buildPlayerCombatant(12, null);
  const loadout = { weapon: "blade", armor: "plate", accessory1: "charm" };
  const equipped = buildEquippedCombatant(12, cards, loadout);
  assert.ok(equipped.attack > base.attack);
  assert.ok(equipped.defense > base.defense);
  assert.ok(equipped.maxHp > base.maxHp);
  assert.ok(equipped.attack <= 700 && equipped.defense <= 600 && equipped.maxHp <= 2000);
});

test("loadout rejects unowned, duplicate and unknown-slot card references", () => {
  const cards = [{ id: "one" }, { id: "two" }];
  const loadout = normalizeEquipment({ weapon: "one", armor: "one", accessory1: "missing", unknown: "two" }, cards);
  assert.deepEqual(loadout, { weapon: "one" });
});

test("legacy equipped card maps to weapon slot", () => {
  const loadout = normalizeEquipment({}, [{ id: "legacy" }], "legacy");
  assert.deepEqual(loadout, { weapon: "legacy" });
});

test("combat stats use all equipped slots while skill stays on weapon", () => {
  const cards = [
    { id: "weapon", power: 25, ability: { effect: "burn", potency: 10 } },
    { id: "armor", defense: 40, vitality: 100 },
  ];
  const loadout = { weapon: "weapon", armor: "armor" };
  const result = resolveCombatEncounter(10, 5, cards, "weapon", Array(40).fill(0.5), null, [], loadout);
  assert.ok(result.player.defense > buildPlayerCombatant(10, cards[0]).defense);
  assert.equal(result.equippedCardId, "weapon");
});
