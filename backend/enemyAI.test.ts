import { strict as assert } from "node:assert";
import { test } from "node:test";
import { chooseEnemyArchetype, decideEnemyTactics, findNextStep } from "./enemyAI.ts";

test("archetype selection is deterministic and covers all four roles", () => {
  assert.equal(chooseEnemyArchetype(0.1), "bruiser");
  assert.equal(chooseEnemyArchetype(0.3), "skirmisher");
  assert.equal(chooseEnemyArchetype(0.6), "sentinel");
  assert.equal(chooseEnemyArchetype(0.9), "arcanist");
});

test("grid path planner advances by one cardinal tile and avoids obstacles", () => {
  const blocked = new Set([10 * 64 + 11]);
  const next = findNextStep({x:10,y:10},{x:12,y:10},blocked);
  assert.equal(Math.abs(next.x-10)+Math.abs(next.y-10),1);
  assert.notEqual(next.y * 64 + next.x, 10 * 64 + 11);
});

test("path planner remains inside the 64x64 grid and handles unreachable targets", () => {
  const wall = new Set<number>();
  for(let y=0;y<64;y++) wall.add(y*64+11);
  assert.deepEqual(findNextStep({x:10,y:10},{x:12,y:10},wall),{x:10,y:10});
  assert.deepEqual(findNextStep({x:0,y:0},{x:63,y:63},new Set()),{x:1,y:0});
});

test("bruiser applies high pressure, sentinel guards when wounded", () => {
  const bruiser = decideEnemyTactics({archetype:"bruiser",enemy:{x:1,y:1},player:{x:2,y:1},enemyHp:100,enemyMaxHp:100,turn:1,roll:0.9});
  const sentinel = decideEnemyTactics({archetype:"sentinel",enemy:{x:1,y:1},player:{x:2,y:1},enemyHp:20,enemyMaxHp:100,turn:2,roll:0.9});
  assert.equal(bruiser.action,"heavy_strike");
  assert.equal(sentinel.action,"guard");
});

test("skirmisher disengages when wounded and arcanist uses ranged skill", () => {
  const skirmisher = decideEnemyTactics({archetype:"skirmisher",enemy:{x:10,y:10},player:{x:11,y:10},enemyHp:20,enemyMaxHp:100,turn:2,roll:0.5});
  const arcanist = decideEnemyTactics({archetype:"arcanist",enemy:{x:10,y:10},player:{x:14,y:10},enemyHp:100,enemyMaxHp:100,turn:1,roll:0.5});
  assert.equal(skirmisher.action,"retreat");
  assert.equal(arcanist.action,"skill");
});
