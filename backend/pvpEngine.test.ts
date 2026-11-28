import { strict as assert } from "node:assert";
import { test } from "node:test";
import { calculateElo, matchmakingRatingWindow, validatePvpAction } from "./pvpEngine.ts";

test("Elo favors the lower-rated player for an upset and remains bounded",()=>{
  const upset=calculateElo(900,1500,1);
  assert.ok(upset.ratingA>900);
  assert.ok(upset.ratingB<1500);
  assert.ok(upset.ratingA>=100&&upset.ratingA<=4000);
  assert.ok(upset.ratingB>=100&&upset.ratingB<=4000);
});
test("draw updates ratings toward equal expectation",()=>{
  const result=calculateElo(1200,1200,0.5);
  assert.equal(result.ratingA,1200);
  assert.equal(result.ratingB,1200);
});
test("matchmaking window expands gradually and is capped",()=>{
  assert.equal(matchmakingRatingWindow(0),100);
  assert.equal(matchmakingRatingWindow(20),200);
  assert.equal(matchmakingRatingWindow(10000),800);
});
test("only allowlisted PvP actions are accepted",()=>{
  assert.equal(validatePvpAction("strike"),"strike");
  assert.equal(validatePvpAction("admin_win"),null);
  assert.equal(validatePvpAction({action:"strike"}),null);
});

test("Elo remains zero-sum for ratings away from configured boundaries",()=>{
  const result=calculateElo(1100,1450,1);
  assert.equal(result.ratingA+result.ratingB,2550);
  assert.ok(result.ratingA>1100);
  assert.ok(result.ratingB<1450);
});
test("Elo clamps both ratings at the configured minimum and maximum",()=>{
  const low=calculateElo(100,1000,0);
  const high=calculateElo(4000,3000,1);
  assert.ok(low.ratingA>=100&&low.ratingB<=4000);
  assert.ok(high.ratingA<=4000&&high.ratingB>=100);
});
