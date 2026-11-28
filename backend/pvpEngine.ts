export type PvPRatingResult = { expectedA: number; expectedB: number; ratingA: number; ratingB: number };
const clamp = (v:number,min:number,max:number) => Math.max(min,Math.min(max,Math.floor(Number.isFinite(v)?v:min)));
export function matchmakingRatingWindow(waitSeconds:number):number {
  return clamp(100 + Math.floor(Math.max(0,waitSeconds)/10)*50,100,800);
}
export function calculateElo(ratingA:number,ratingB:number,scoreA:0|0.5|1,k=32):PvPRatingResult {
  const a=clamp(ratingA,100,4000), b=clamp(ratingB,100,4000), factor=clamp(k,1,64);
  const expectedA=1/(1+Math.pow(10,(b-a)/400));
  const expectedB=1-expectedA;
  const nextA=clamp(Math.round(a+factor*(scoreA-expectedA)),100,4000);
  return {expectedA,expectedB,ratingA:nextA,ratingB:clamp(b-(nextA-a),100,4000)};
}
export function validatePvpAction(value:unknown):"strike"|"guard"|"skill"|null {
  return value==="strike"||value==="guard"||value==="skill"?value:null;
}


/** Maps one unsigned 32-bit cryptographic random word to [0.9, 1.1). */
export function pvpDamageVariance(randomWord: number): number {
  if (!Number.isInteger(randomWord) || randomWord < 0 || randomWord > 0xffffffff) return 0.9;
  return 0.9 + (randomWord / 0x1_0000_0000) * 0.2;
}
