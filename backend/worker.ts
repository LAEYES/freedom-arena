import { isServerTraversable, validateServerMove } from './worldRules';
import { verifySupabaseBearer, type AuthEnv } from './auth';
import { calculateElo, matchmakingRatingWindow, validatePvpAction } from './pvpEngine';
import { buildEquippedCombatant, normalizeEquipment, resolveCombatEncounter, resolveVictoryLoot, type EquipmentSlot, type StoredCard } from './combatEngine';

export interface Env extends AuthEnv {
  DB: D1Database;
}

const headers = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

type PlayerPayload = {
  name?: string; level?: number; xp?: number; faction?: string;
  victories?: number; zoneId?: string; explorationCount?: number;
  lastDiscovery?: string; arenaWins?: number; equippedCardId?: string | null;
  fusionMaterials?: number; worldThreat?: number; worldResources?: number;
  worldTile?: { x: number; y: number }; visitedPoiIds?: string[];
  factionStates?: unknown[]; npcMemories?: unknown[]; quests?: unknown[]; cards?: unknown[];
};

const finiteNumber = (value: unknown, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalize = (p: PlayerPayload) => ({
  name: String(p.name ?? "Arena Player").slice(0, 24),
  level: Math.max(1, Math.floor(finiteNumber(p.level, 1))),
  xp: Math.max(0, Math.floor(finiteNumber(p.xp, 0))),
  faction: String(p.faction ?? "Aegis"),
  victories: Math.max(0, Math.floor(finiteNumber(p.victories, 0))),
  zone_id: String(p.zoneId ?? "outpost"),
  exploration_count: Math.max(0, Math.floor(finiteNumber(p.explorationCount, 0))),
  last_discovery: String(p.lastDiscovery ?? "").slice(0, 120),
  arena_wins: Math.max(0, Math.floor(finiteNumber(p.arenaWins, 0))),
  equipped_card_id: p.equippedCardId ?? null,
  fusion_materials: Math.max(0, Math.floor(finiteNumber(p.fusionMaterials, 0))),
  world_threat: Math.max(1, Math.floor(finiteNumber(p.worldThreat, 1))),
  world_resources: Math.max(0, Math.floor(finiteNumber(p.worldResources, 0))),
  world_tile: JSON.stringify(p.worldTile ?? { x: 0, y: 0 }),
  visited_poi_ids: JSON.stringify(Array.isArray(p.visitedPoiIds) ? p.visitedPoiIds : []),
  faction_states: JSON.stringify(Array.isArray(p.factionStates) ? p.factionStates : []),
  npc_memories: JSON.stringify(Array.isArray(p.npcMemories) ? p.npcMemories : []),
  quests: JSON.stringify(Array.isArray(p.quests) ? p.quests : []),
  cards: JSON.stringify(Array.isArray(p.cards) ? p.cards : []),
});



type WorldPosition = { x: number; y: number };
type WorldPresenceRow = {
  player_id: string; zone_id: string; tile_x: number; tile_y: number;
  revision: number; updated_at: string;
};

const isWorldPosition = (value: unknown): value is WorldPosition => {
  if (!value || typeof value !== 'object') return false;
  const point = value as Partial<WorldPosition>;
  return Number.isInteger(point.x) && Number.isInteger(point.y)
    && (point.x as number) >= 0 && (point.x as number) < 64
    && (point.y as number) >= 0 && (point.y as number) < 64;
};

const parseObject = (value: unknown): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(String(value ?? '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const validPlayerId = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 8 && value.length <= 128 && /^[a-zA-Z0-9:_-]+$/.test(value);

const presencePayload = (row: WorldPresenceRow) => ({
  playerId: row.player_id,
  zoneId: row.zone_id,
  worldTile: { x: row.tile_x, y: row.tile_y },
  revision: row.revision,
  updatedAt: row.updated_at,
});


async function enforceRateLimit(db: D1Database, subject: string, routeKey: string): Promise<boolean> {
  const windowStart = Math.floor(Date.now() / 60_000);
  try {
    const row = await db.prepare(`INSERT INTO api_rate_limits(subject,route_key,window_start,request_count)
      VALUES(?,?,?,1)
      ON CONFLICT(subject,route_key,window_start) DO UPDATE SET request_count=request_count+1
      RETURNING request_count`).bind(subject, routeKey, windowStart).first<{ request_count: number }>();
    if (windowStart % 10 === 0) {
      await db.prepare('DELETE FROM api_rate_limits WHERE window_start < ?').bind(windowStart - 10).run();
    }
    return Number(row?.request_count ?? 0) <= 60;
  } catch {
    // Fail closed: a missing migration or D1 error must not silently disable throttling.
    return false;
  }
}


async function applyPvpRatingSettlement(db: D1Database, matchId: string): Promise<void> {
  const match = await db.prepare("SELECT match_id,player_a,player_b,rating_a,rating_b,winner_id,status FROM pvp_matches WHERE match_id=? AND status='completed'").bind(matchId).first<{match_id:string;player_a:string;player_b:string;rating_a:number;rating_b:number;winner_id:string|null;status:string}>();
  if (!match) return;
  const scoreA: 0|0.5|1 = match.winner_id === null ? 0.5 : match.winner_id === match.player_a ? 1 : 0;
  const elo = calculateElo(match.rating_a,match.rating_b,scoreA);
  const resultA = scoreA===0.5 ? "draw" : scoreA===1 ? "win" : "loss";
  const resultB = scoreA===0.5 ? "draw" : scoreA===0 ? "win" : "loss";
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO pvp_rating_log(match_id,player_a,player_b,before_a,before_b,after_a,after_b) VALUES(?,?,?,?,?,?,?)").bind(matchId,match.player_a,match.player_b,match.rating_a,match.rating_b,elo.ratingA,elo.ratingB),
    db.prepare("INSERT OR IGNORE INTO pvp_rating_events(match_id,player_id,rating_after,result) SELECT match_id,player_a,after_a,? FROM pvp_rating_log WHERE match_id=?").bind(resultA,matchId),
    db.prepare("INSERT OR IGNORE INTO pvp_rating_events(match_id,player_id,rating_after,result) SELECT match_id,player_b,after_b,? FROM pvp_rating_log WHERE match_id=?").bind(resultB,matchId),
    db.prepare("INSERT INTO pvp_ratings(player_id,rating,matches_played,wins,losses,draws) SELECT player_id,rating_after,1,CASE WHEN result='win' THEN 1 ELSE 0 END,CASE WHEN result='loss' THEN 1 ELSE 0 END,CASE WHEN result='draw' THEN 1 ELSE 0 END FROM pvp_rating_events WHERE match_id=? AND applied_at IS NULL ON CONFLICT(player_id) DO UPDATE SET rating=excluded.rating,matches_played=pvp_ratings.matches_played+1,wins=pvp_ratings.wins+excluded.wins,losses=pvp_ratings.losses+excluded.losses,draws=pvp_ratings.draws+excluded.draws,updated_at=CURRENT_TIMESTAMP").bind(matchId),
    db.prepare("UPDATE pvp_rating_events SET applied_at=CURRENT_TIMESTAMP WHERE match_id=? AND applied_at IS NULL").bind(matchId),
    db.prepare("UPDATE pvp_queue SET rating=(SELECT rating FROM pvp_ratings WHERE player_id=pvp_queue.player_id),status='cancelled',match_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE player_id IN (?,?)").bind(match.player_a,match.player_b),
    db.prepare("DELETE FROM pvp_active_players WHERE match_id=?").bind(matchId)
  ]);
}

async function adjudicateExpiredPvpMatches(db: D1Database): Promise<number> {
  const expired = await db.prepare("SELECT match_id,player_a,player_b,turn_number FROM pvp_matches WHERE status IN ('ready','active') AND turn_deadline IS NOT NULL AND turn_deadline < CURRENT_TIMESTAMP ORDER BY turn_deadline ASC LIMIT 100").all<{match_id:string;player_a:string;player_b:string;turn_number:number}>();
  let settled = 0;
  for (const match of expired.results) {
    const timedOutPlayer = Number(match.turn_number)%2===0 ? match.player_a : match.player_b;
    const winner = timedOutPlayer===match.player_a ? match.player_b : match.player_a;
    const result = await db.prepare("UPDATE pvp_matches SET status='completed',winner_id=?,updated_at=CURRENT_TIMESTAMP,settled_at=CURRENT_TIMESTAMP WHERE match_id=? AND status IN ('ready','active') AND turn_number=? AND turn_deadline < CURRENT_TIMESTAMP").bind(winner,match.match_id,match.turn_number).run();
    if (Number(result.meta.changes??0)===1) {
      await db.prepare("INSERT OR IGNORE INTO pvp_timeout_log(match_id,timed_out_player_id,winner_id) VALUES(?,?,?)").bind(match.match_id,timedOutPlayer,winner).run();
      await applyPvpRatingSettlement(db,match.match_id);
      settled++;
    }
  }
  return settled;
}

const parseJson = <T>(value: unknown, fallback: T): T => {
  try {
    return JSON.parse(String(value ?? "")) as T;
  } catch {
    return fallback;
  }
};

const fromRow = (row: Record<string, unknown>) => ({
  name: row.name,
  level: row.level,
  xp: row.xp,
  faction: row.faction,
  victories: row.victories,
  zoneId: row.zone_id,
  explorationCount: row.exploration_count,
  lastDiscovery: row.last_discovery,
  arenaWins: row.arena_wins,
  equippedCardId: row.equipped_card_id,
  fusionMaterials: row.fusion_materials,
  worldThreat: row.world_threat,
  worldResources: row.world_resources,
  worldTile: parseJson(row.world_tile, { x: 0, y: 0 }),
  visitedPoiIds: parseJson(row.visited_poi_ids, []),
  factionStates: parseJson(row.faction_states, []),
  npcMemories: parseJson(row.npc_memories, []),
  quests: parseJson(row.quests, []),
  cards: parseJson(row.cards, []),
  currentHp: row.current_hp,
  statusEffects: parseJson(row.status_effects, []),
  equipment: parseJson(row.equipment_json, {}),
  equipmentRevision: row.equipment_revision ?? 0,
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "freedom-arena-api", worldSync: "v1" });
    }

    const identity = await verifySupabaseBearer(request, env);
    if (!identity) {
      const configured = Boolean(env.SUPABASE_URL?.trim() && env.SUPABASE_JWT_ISSUER?.trim());
      return json({ error: configured ? "unauthorized" : "auth_not_configured" }, configured ? 401 : 503);
    }
    const routeFamily = url.pathname.startsWith('/world/') ? 'world' : url.pathname === '/player' ? 'player' : 'other';
    if (!await enforceRateLimit(env.DB, identity.subject, routeFamily)) {
      return json({ error: "rate_limited_or_security_migration_missing" }, 429);
    }

    const pvpRoute = url.pathname.match(/^\\/world\\/([a-z0-9-]{1,48})\\/pvp\\/(queue|status|cancel)$/);
    if (pvpRoute) {
      const zoneId = pvpRoute[1], action = pvpRoute[2], playerId = identity.subject;
      if (request.method === "POST" && action === "queue") {
        try {
          const player = await env.DB.prepare("SELECT level FROM players WHERE id=?").bind(playerId).first<{level:number}>();
          if (!player) return json({ error: "player_not_initialized" }, 409);
          const presence = await env.DB.prepare("SELECT 1 AS ok FROM world_player_presence WHERE player_id=? AND zone_id=? AND updated_at >= datetime('now','-90 seconds')").bind(playerId,zoneId).first();
          if (!presence) return json({ error: "player_not_present_in_zone" }, 403);
          const active = await env.DB.prepare("SELECT m.match_id,m.status FROM pvp_match_participants p JOIN pvp_matches m ON m.match_id=p.match_id WHERE p.player_id=? AND m.status IN ('ready','active')").bind(playerId).first<{match_id:string;status:string}>();
          if (active) return json({ status: active.status, matchId: active.match_id, alreadyMatched: true }, 200);
          const existing = await env.DB.prepare("SELECT rating,queued_at,status,match_id FROM pvp_queue WHERE player_id=?").bind(playerId).first<{rating:number;queued_at:string;status:string;match_id:string|null}>();
          if (existing?.status === "matched" && existing.match_id) return json({status:"matched",matchId:existing.match_id},200);
          await env.DB.prepare("INSERT INTO pvp_queue(player_id,zone_id,rating,level,status,match_id,queued_at,updated_at) VALUES(?,?,1000,?,'queued',NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(player_id) DO UPDATE SET zone_id=excluded.zone_id,level=excluded.level,status='queued',match_id=NULL,queued_at=CASE WHEN pvp_queue.status='queued' THEN pvp_queue.queued_at ELSE CURRENT_TIMESTAMP END,updated_at=CURRENT_TIMESTAMP WHERE pvp_queue.status IN ('queued','cancelled')").bind(playerId,zoneId,Math.max(1,Math.min(100,Math.floor(player.level)))).run();
          const ratingRow = await env.DB.prepare("SELECT rating FROM pvp_ratings WHERE player_id=?").bind(playerId).first<{rating:number}>();
          const playerRating = Number(ratingRow?.rating ?? existing?.rating ?? 1000);
          const me = await env.DB.prepare("SELECT rating,queued_at FROM pvp_queue WHERE player_id=? AND status='queued'").bind(playerId).first<{rating:number;queued_at:string}>();
          if (!me) return json({error:"queue_state_conflict"},409);
          if (Number(me.rating)!==playerRating) await env.DB.prepare("UPDATE pvp_queue SET rating=? WHERE player_id=? AND status='queued'").bind(playerRating,playerId).run();
          const waited = Math.max(0,Math.floor((Date.now()-Date.parse(me.queued_at+"Z"))/1000));
          const ratingWindow = matchmakingRatingWindow(waited);
          const opponent = await env.DB.prepare("SELECT q.player_id,q.rating,q.level FROM pvp_queue q JOIN world_player_presence p ON p.player_id=q.player_id AND p.zone_id=q.zone_id WHERE q.status='queued' AND q.zone_id=? AND q.player_id<>? AND ABS(q.rating-?)<=? AND ABS(q.level-?)<=10 AND p.updated_at >= datetime('now','-90 seconds') ORDER BY q.queued_at ASC LIMIT 1").bind(zoneId,playerId,playerRating,ratingWindow,player.level).first<{player_id:string;rating:number;level:number}>();
          if (!opponent) return json({status:"queued",rating:playerRating,ratingWindow,waitSeconds:waited});
          const matchId = crypto.randomUUID();
          try {
            await env.DB.batch([
              env.DB.prepare("INSERT INTO pvp_matches(match_id,zone_id,player_a,player_b,rating_a,rating_b,level_a,level_b,status,turn_deadline) SELECT ?,?,?,?,?,?,?,?,'ready',datetime('now','+45 seconds') WHERE EXISTS(SELECT 1 FROM pvp_queue WHERE player_id=? AND status='queued') AND EXISTS(SELECT 1 FROM pvp_queue WHERE player_id=? AND status='queued')").bind(matchId,zoneId,playerId,opponent.player_id,me.rating,opponent.rating,player.level,opponent.level,playerId,opponent.player_id),
              env.DB.prepare("INSERT INTO pvp_match_participants(match_id,player_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM pvp_matches WHERE match_id=?)").bind(matchId,playerId,matchId),
              env.DB.prepare("INSERT INTO pvp_match_participants(match_id,player_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM pvp_matches WHERE match_id=?)").bind(matchId,opponent.player_id,matchId),
              env.DB.prepare("INSERT INTO pvp_active_players(player_id,match_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM pvp_matches WHERE match_id=?)").bind(playerId,matchId,matchId),
              env.DB.prepare("INSERT INTO pvp_active_players(player_id,match_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM pvp_matches WHERE match_id=?)").bind(opponent.player_id,matchId,matchId),
              env.DB.prepare("UPDATE pvp_queue SET status='matched',match_id=?,updated_at=CURRENT_TIMESTAMP WHERE player_id IN (?,?) AND status='queued'").bind(matchId,playerId,opponent.player_id),
            ]);
            const matched = await env.DB.prepare("SELECT match_id FROM pvp_match_participants WHERE player_id=? AND match_id=?").bind(playerId,matchId).first();
            if (matched) return json({status:"matched",matchId,opponent:{level:opponent.level,rating:opponent.rating}});
          } catch { /* Another queue request may have claimed one participant first. */ }
          const current = await env.DB.prepare("SELECT m.match_id,m.status FROM pvp_match_participants p JOIN pvp_matches m ON m.match_id=p.match_id WHERE p.player_id=? AND m.status IN ('ready','active')").bind(playerId).first<{match_id:string;status:string}>();
          if (current) return json({status:current.status,matchId:current.match_id});
          return json({status:"queued",rating:playerRating,ratingWindow});
        } catch { return json({error:"pvp_queue_failed"},500); }
      }
      if (request.method === "GET" && action === "status") {
        try {
          const match = await env.DB.prepare("SELECT m.match_id,m.zone_id,m.player_a,m.player_b,m.rating_a,m.rating_b,m.level_a,m.level_b,m.status,m.winner_id,m.turn_number,m.turn_deadline,m.created_at FROM pvp_match_participants p JOIN pvp_matches m ON m.match_id=p.match_id WHERE p.player_id=? AND m.status IN ('ready','active') ORDER BY m.created_at DESC LIMIT 1").bind(playerId).first<Record<string,unknown>>();
          if (match) return json({match});
          const queued = await env.DB.prepare("SELECT rating,queued_at FROM pvp_queue WHERE player_id=? AND status='queued' AND zone_id=?").bind(playerId,zoneId).first<{rating:number;queued_at:string}>();
          return json(queued ? {status:"queued",rating:queued.rating,queuedAt:queued.queued_at} : {status:"idle"});
        } catch { return json({error:"pvp_status_failed"},500); }
      }
      if (request.method === "POST" && action === "cancel") {
        try {
          const result = await env.DB.prepare("UPDATE pvp_queue SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE player_id=? AND zone_id=? AND status='queued'").bind(playerId,zoneId).run();
          return json({cancelled:Number(result.meta.changes??0)===1});
        } catch { return json({error:"pvp_cancel_failed"},500); }
      }
      return json({error:"method_not_allowed"},405);
    }

    const pvpMatchRoute = url.pathname.match(/^\\/pvp\\/matches\\/([a-f0-9-]{36})\\/(state|action|forfeit)$/i);
    if (pvpMatchRoute) {
      const matchId = pvpMatchRoute[1], action = pvpMatchRoute[2], playerId = identity.subject;
      try {
        const match = await env.DB.prepare("SELECT * FROM pvp_matches WHERE match_id=? AND (player_a=? OR player_b=?)").bind(matchId,playerId,playerId).first<Record<string,unknown>>();
        if (!match) return json({error:"match_not_found"},404);
        const parseState = (raw:unknown) => { try { const v=JSON.parse(String(raw??"{}")); return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,any>:{}; } catch { return {}; } };
        if (request.method==="GET" && action==="state") {
          const turns=await env.DB.prepare("SELECT turn_number,actor_id,action,damage,target_hp,created_at FROM pvp_turns WHERE match_id=? ORDER BY turn_number ASC").bind(matchId).all<Record<string,unknown>>();
          return json({matchId,status:match.status,turnNumber:match.turn_number,turnDeadline:match.turn_deadline,winnerId:match.winner_id,players:{a:match.player_a,b:match.player_b},state:parseState(match.state_json),turns:turns.results});
        }
        if (request.method!=="POST" || (action!=="action" && action!=="forfeit")) return json({error:"method_not_allowed"},405);
        if (action==="forfeit") {
          if (match.status!=="ready" && match.status!=="active") return json({error:"match_not_active"},409);
          const winner=playerId===match.player_a?String(match.player_b):String(match.player_a);
          const changed=await env.DB.prepare("UPDATE pvp_matches SET status='completed',winner_id=?,updated_at=CURRENT_TIMESTAMP,settled_at=CURRENT_TIMESTAMP WHERE match_id=? AND status IN ('ready','active')").bind(winner,matchId).run();
          if (Number(changed.meta.changes??0)!==1) return json({error:"match_already_settled"},409);
          await applyPvpRatingSettlement(env.DB,matchId);
          return json({matchId,status:"completed",winnerId:winner,forfeit:true,ratings:{a:elo.ratingA,b:elo.ratingB}});
        }
        if (match.status!=="ready" && match.status!=="active") return json({error:"match_not_active"},409);
        const body=await request.json().catch(()=>null) as {commandId?:unknown;action?:unknown}|null;
        if (typeof body?.commandId!=="string" || !/^[a-zA-Z0-9_-]{12,80}$/.test(body.commandId)) return json({error:"invalid_command_id"},400);
        const combatAction=validatePvpAction(body.action);
        if (!combatAction) return json({error:"invalid_pvp_action"},400);
        const prior=await env.DB.prepare("SELECT turn_number,state_json,damage,target_hp FROM pvp_turns WHERE command_id=? AND actor_id=?").bind(body.commandId,playerId).first<Record<string,unknown>>();
        if (prior) return json({matchId,duplicate:true,turnNumber:prior.turn_number,state:parseState(prior.state_json),damage:prior.damage,targetHp:prior.target_hp});
        let state=parseState(match.state_json);
        if (!state.a || !state.b) {
          const [a,b]=await Promise.all([
            env.DB.prepare("SELECT level,cards,equipment_json FROM players WHERE id=?").bind(match.player_a).first<Record<string,unknown>>(),
            env.DB.prepare("SELECT level,cards,equipment_json FROM players WHERE id=?").bind(match.player_b).first<Record<string,unknown>>()
          ]);
          if (!a||!b) return json({error:"match_player_data_missing"},409);
          const stats=(row:Record<string,unknown>)=>{
            const cards=parseJson<StoredCard[]>(row.cards,[]);
            const equipment=parseJson<Record<string,string>>(row.equipment_json,{});
            return buildEquippedCombatant(Math.max(1,Math.min(100,Number(row.level)||1)),Array.isArray(cards)?cards:[],equipment);
          };
          const ca=stats(a),cb=stats(b);
          state={a:{hp:ca.maxHp,maxHp:ca.maxHp,attack:ca.attack,defense:ca.defense,speed:ca.speed,guard:0},b:{hp:cb.maxHp,maxHp:cb.maxHp,attack:cb.attack,defense:cb.defense,speed:cb.speed,guard:0}};
        }
        const turnNumber=Number(match.turn_number??0), actor=turnNumber%2===0?String(match.player_a):String(match.player_b);
        if (actor!==playerId) return json({error:"not_your_turn",expectedTurn:turnNumber+1},409);
        if (typeof match.turn_deadline==="string" && Date.parse(match.turn_deadline.replace(" ","T")+"Z") < Date.now()) {
          await adjudicateExpiredPvpMatches(env.DB);
          return json({error:"turn_expired",reason:"match_timeout_adjudicated"},409);
        }
        const mine=actor===match.player_a?"a":"b",target=mine==="a"?"b":"a";
        const me=state[mine],foe=state[target];
        let damage=0;
        if (combatAction==="guard") me.guard=Math.min(100,Math.floor(me.defense*0.75)+8);
        else {
          const multiplier=combatAction==="skill"?1.5:1;
          const variance=0.9+Math.random()*0.2;
          const raw=Math.floor(me.attack*multiplier*variance);
          damage=Math.max(1,Math.min(250,raw-Math.max(0,foe.defense+foe.guard)));
          foe.hp=Math.max(0,foe.hp-damage); foe.guard=0;
        }
        const nextTurn=turnNumber+1, winner=foe.hp<=0?playerId:null, completed=Boolean(winner)||nextTurn>=40;
        const nextState=JSON.stringify(state), status=completed?"completed":"active";
        const command=body.commandId;
        const statements=[
          env.DB.prepare("INSERT INTO pvp_turns(command_id,match_id,turn_number,actor_id,action,damage,target_hp,state_json) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM pvp_matches WHERE match_id=? AND status IN ('ready','active') AND turn_number=? AND (CASE WHEN turn_number%2=0 THEN player_a ELSE player_b END)=?)").bind(command,matchId,nextTurn,playerId,combatAction,damage,foe.hp,nextState,matchId,turnNumber,playerId),
          env.DB.prepare("UPDATE pvp_matches SET status=?,turn_number=?,state_json=?,winner_id=?,updated_at=CURRENT_TIMESTAMP,turn_deadline=datetime('now','+45 seconds'),settled_at=CASE WHEN ?='completed' THEN CURRENT_TIMESTAMP ELSE settled_at END,action_count=action_count+1 WHERE match_id=? AND status IN ('ready','active') AND turn_number=? AND (CASE WHEN turn_number%2=0 THEN player_a ELSE player_b END)=? AND EXISTS(SELECT 1 FROM pvp_turns WHERE command_id=?)").bind(status,nextTurn,nextState,winner,status,matchId,turnNumber,playerId,command)
        ];
        await env.DB.batch(statements);
        const confirmed=await env.DB.prepare("SELECT status,turn_number,winner_id FROM pvp_matches WHERE match_id=?").bind(matchId).first<{status:string;turn_number:number;winner_id:string|null}>();
        const committed=await env.DB.prepare("SELECT command_id FROM pvp_turns WHERE command_id=?").bind(command).first();
        if (!committed) return json({error:"turn_conflict_retry_state"},409);
        if (confirmed?.status==="completed") {
          await applyPvpRatingSettlement(env.DB,matchId);
        }
        return json({matchId,status:confirmed?.status,turnNumber:confirmed?.turn_number,winnerId:confirmed?.winner_id,state:parseState(nextState),damage,action:combatAction});
      } catch { return json({error:"pvp_action_failed"},500); }
    }

    const worldRoute = url.pathname.match(/^\/world\/([a-z0-9-]{1,48})\/(snapshot|join|move|heartbeat|state|command|rest|equip|inventory)$/);
    if (worldRoute) {
      const zoneId = worldRoute[1];
      const action = worldRoute[2];

      if (request.method === "GET" && action === "snapshot") {
        try {
          const [zoneState, presence, events] = await Promise.all([
            env.DB.prepare("SELECT revision,state_json,updated_at FROM world_zone_state WHERE zone_id = ?").bind(zoneId).first<Record<string, unknown>>(),
            env.DB.prepare("SELECT player_id,zone_id,tile_x,tile_y,revision,updated_at FROM world_player_presence WHERE zone_id = ? AND updated_at >= datetime('now','-90 seconds') ORDER BY updated_at DESC LIMIT 100").bind(zoneId).all<WorldPresenceRow>(),
            env.DB.prepare("SELECT event_id,player_id,event_type,payload_json,created_at FROM world_event_log WHERE zone_id = ? ORDER BY created_at DESC LIMIT 50").bind(zoneId).all<Record<string, unknown>>(),
          ]);
          return json({
            zoneId,
            state: zoneState ? { revision: zoneState.revision, value: parseObject(zoneState.state_json), updatedAt: zoneState.updated_at } : { revision: 0, value: {}, updatedAt: null },
            players: presence.results.map(presencePayload),
            events: events.results.map(event => ({
              id: event.event_id, playerId: event.player_id, type: event.event_type,
              payload: parseObject(event.payload_json), createdAt: event.created_at,
            })),
          });
        } catch {
          return json({ error: "world_snapshot_failed" }, 500);
        }
      }

      if (request.method === "POST" && action === "join") {
        const body = await request.json().catch(() => null) as { playerId?: unknown; worldTile?: unknown } | null;
        if (!validPlayerId(body?.playerId) || body?.playerId !== identity.subject || !isWorldPosition(body?.worldTile)) {
          return json({ error: "invalid_world_join" }, 400);
        }
        if (!isServerTraversable(body.worldTile.x, body.worldTile.y)) {
          return json({ error: "world_spawn_blocked" }, 422);
        }
        try {
          const row = await env.DB.prepare(`INSERT INTO world_player_presence
            (player_id,zone_id,tile_x,tile_y,revision,updated_at)
            VALUES(?,?,?,?,0,CURRENT_TIMESTAMP)
            ON CONFLICT(player_id) DO UPDATE SET
              tile_x=CASE WHEN world_player_presence.zone_id=excluded.zone_id THEN world_player_presence.tile_x ELSE excluded.tile_x END,
              tile_y=CASE WHEN world_player_presence.zone_id=excluded.zone_id THEN world_player_presence.tile_y ELSE excluded.tile_y END,
              revision=CASE WHEN world_player_presence.zone_id=excluded.zone_id THEN world_player_presence.revision ELSE world_player_presence.revision+1 END,
              zone_id=excluded.zone_id,updated_at=CURRENT_TIMESTAMP
            RETURNING player_id,zone_id,tile_x,tile_y,revision,updated_at`)
            .bind(body.playerId, zoneId, body.worldTile.x, body.worldTile.y)
            .first<WorldPresenceRow>();
          return json({ presence: row ? presencePayload(row) : null });
        } catch {
          return json({ error: "world_join_failed" }, 500);
        }
      }

      if (request.method === "POST" && action === "move") {
        const body = await request.json().catch(() => null) as {
          playerId?: unknown; from?: unknown; to?: unknown; expectedRevision?: unknown;
        } | null;
        if (!body || !validPlayerId(body.playerId) || body.playerId !== identity.subject || !isWorldPosition(body.from) || !isWorldPosition(body.to)
          || !Number.isInteger(body.expectedRevision) || (body.expectedRevision as number) < 0) {
          return json({ error: "invalid_world_move" }, 400);
        }
        const movementValidation = validateServerMove(body.from, body.to);
        if (movementValidation === 'invalid_step') {
          return json({ error: "movement_must_be_cardinal_adjacent" }, 422);
        }
        if (movementValidation === 'terrain_blocked') {
          return json({ error: "movement_terrain_blocked" }, 422);
        }
        const expectedRevision = body.expectedRevision as number;
        const eventId = body.playerId + ':' + (expectedRevision + 1);
        try {
          const results = await env.DB.batch([
            env.DB.prepare(`UPDATE world_player_presence SET
              tile_x=?,tile_y=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP
              WHERE player_id=? AND zone_id=? AND tile_x=? AND tile_y=? AND revision=?`)
              .bind(body.to.x, body.to.y, body.playerId, zoneId, body.from.x, body.from.y, expectedRevision),
            env.DB.prepare(`INSERT OR IGNORE INTO world_event_log
              (event_id,zone_id,player_id,event_type,payload_json,created_at)
              SELECT ?,?,?, 'player_moved',?,CURRENT_TIMESTAMP
              WHERE EXISTS (SELECT 1 FROM world_player_presence
                WHERE player_id=? AND zone_id=? AND tile_x=? AND tile_y=? AND revision=?)`)
              .bind(eventId, zoneId, body.playerId, JSON.stringify({ from: body.from, to: body.to, revision: expectedRevision + 1 }),
                body.playerId, zoneId, body.to.x, body.to.y, expectedRevision + 1),
          ]);
          const changes = Number(results[0]?.meta?.changes ?? 0);
          if (changes !== 1) {
            const current = await env.DB.prepare("SELECT player_id,zone_id,tile_x,tile_y,revision,updated_at FROM world_player_presence WHERE player_id = ?")
              .bind(body.playerId).first<WorldPresenceRow>();
            return json({ error: "movement_conflict", current: current ? presencePayload(current) : null }, 409);
          }
          const current = await env.DB.prepare("SELECT player_id,zone_id,tile_x,tile_y,revision,updated_at FROM world_player_presence WHERE player_id = ?")
            .bind(body.playerId).first<WorldPresenceRow>();
          return json({ presence: current ? presencePayload(current) : null });
        } catch {
          return json({ error: "world_move_failed" }, 500);
        }
      }

      if (request.method === "POST" && action === "heartbeat") {
        const body = await request.json().catch(() => null) as { playerId?: unknown } | null;
        if (!validPlayerId(body?.playerId) || body?.playerId !== identity.subject) return json({ error: "invalid_player_id" }, 400);
        try {
          const row = await env.DB.prepare(`UPDATE world_player_presence SET updated_at=CURRENT_TIMESTAMP
            WHERE player_id=? AND zone_id=?
            RETURNING player_id,zone_id,tile_x,tile_y,revision,updated_at`)
            .bind(body.playerId, zoneId).first<WorldPresenceRow>();
          return row ? json({ presence: presencePayload(row) }) : json({ error: "presence_not_found" }, 404);
        } catch {
          return json({ error: "world_heartbeat_failed" }, 500);
        }
      }

      if (request.method === "GET" && action === "inventory") {
        try {
          const present = await env.DB.prepare("SELECT 1 AS present FROM world_player_presence WHERE player_id=? AND zone_id=?")
            .bind(identity.subject, zoneId).first<{ present: number }>();
          if (!present) return json({ error: "player_not_in_zone" }, 403);
          const [items, recent] = await Promise.all([
            env.DB.prepare("SELECT item_id,quantity,updated_at FROM world_inventory WHERE player_id=? AND quantity>0 ORDER BY item_id")
              .bind(identity.subject).all<{ item_id: string; quantity: number; updated_at: string }>(),
            env.DB.prepare("SELECT item_id,quantity,reason,created_at FROM world_inventory_log WHERE player_id=? ORDER BY created_at DESC LIMIT 30")
              .bind(identity.subject).all<Record<string, unknown>>(),
          ]);
          return json({
            items: items.results.map(item => ({ itemId: item.item_id, quantity: item.quantity, updatedAt: item.updated_at })),
            recentTransactions: recent.results.map(entry => ({
              itemId: entry.item_id, quantity: entry.quantity, reason: entry.reason, createdAt: entry.created_at,
            })),
          });
        } catch { return json({ error: "inventory_read_failed" }, 500); }
      }

      if (request.method === "POST" && action === "command") {
        const body = await request.json().catch(() => null) as { commandId?: unknown; type?: unknown } | null;
        if (!body || typeof body.commandId !== 'string'
          || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.commandId) || body.type !== 'combat') {
          return json({ error: "invalid_world_command" }, 400);
        }

        try {
          const prior = await env.DB.prepare(
            "SELECT outcome_json FROM world_command_log WHERE command_id=? AND player_id=?"
          ).bind(body.commandId, identity.subject).first<{ outcome_json: string }>();
          if (prior) return json({ outcome: parseObject(prior.outcome_json), replayed: true });

          const player = await env.DB.prepare(
            "SELECT level,xp,victories,world_resources,world_threat,cards,equipped_card_id,current_hp,status_effects,equipment_json,equipment_revision FROM players WHERE id=?"
          ).bind(identity.subject).first<{
            level: number; xp: number; victories: number; world_resources: number; world_threat: number;
            cards: string; equipped_card_id: string | null; current_hp: number | null; status_effects: string; equipment_json: string; equipment_revision: number;
          }>();
          if (!player) return json({ error: "player_not_initialized" }, 409);

          const presence = await env.DB.prepare(
            "SELECT 1 AS present FROM world_player_presence WHERE player_id=? AND zone_id=?"
          ).bind(identity.subject, zoneId).first<{ present: number }>();
          if (!presence) return json({ error: "player_not_in_zone" }, 403);

          if (player.current_hp !== null && player.current_hp <= 0) {
            return json({ error: "player_needs_rest", action: "POST /world/" + zoneId + "/rest" }, 409);
          }
          const storedCards = parseJson<StoredCard[]>(player.cards, []);
          const safeCards = Array.isArray(storedCards) ? storedCards.slice(0, 500) : [];
          const randomBytes = new Uint32Array(40);
          crypto.getRandomValues(randomBytes);
          const rolls = Array.from(randomBytes, value => value / 4294967296);
          const loadout = normalizeEquipment(parseJson(player.equipment_json, {}), safeCards, player.equipped_card_id);
          const outcome = resolveCombatEncounter(
            player.level, player.world_threat, safeCards, loadout.weapon ?? player.equipped_card_id, rolls, player.current_hp, parseJson(player.status_effects, []), loadout,
          );
          const nextXp = player.xp + outcome.xpAwarded;
          const nextLevel = 1 + Math.floor(nextXp / 100);
          const loot = resolveVictoryLoot(outcome.victory, rolls);
          const resultJson = JSON.stringify({ ...outcome, loot });

          const results = await env.DB.batch([
            env.DB.prepare(`UPDATE players SET xp=?,level=?,victories=victories+?,
              world_resources=world_resources+?,world_threat=MAX(1,world_threat+?),current_hp=?,status_effects=?,updated_at=CURRENT_TIMESTAMP
              WHERE id=? AND EXISTS(SELECT 1 FROM world_player_presence WHERE player_id=? AND zone_id=?)
              AND NOT EXISTS(SELECT 1 FROM world_command_log WHERE command_id=?)`)
              .bind(nextXp, nextLevel, outcome.victory ? 1 : 0, outcome.resourcesAwarded,
                outcome.threatDelta, outcome.player.remainingHp, JSON.stringify(outcome.remainingStatuses), identity.subject, identity.subject, zoneId, body.commandId),
            env.DB.prepare(`INSERT INTO world_command_log(command_id,player_id,zone_id,command_type,outcome_json)
              SELECT ?,?,?, 'combat',? WHERE changes()=1`)
              .bind(body.commandId, identity.subject, zoneId, resultJson),
            ...loot.map(drop => env.DB.prepare(`INSERT INTO world_inventory(player_id,item_id,quantity,updated_at)
              SELECT ?,?,?,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM world_command_log WHERE command_id=? AND player_id=?)
              ON CONFLICT(player_id,item_id) DO UPDATE SET quantity=MIN(999,world_inventory.quantity+excluded.quantity),updated_at=CURRENT_TIMESTAMP`)
              .bind(identity.subject, drop.itemId, drop.quantity, body.commandId, identity.subject)),
            ...loot.map(drop => env.DB.prepare(`INSERT INTO world_inventory_log(command_id,player_id,zone_id,item_id,quantity,reason)
              SELECT ?,?,?,?,?, 'combat_loot' WHERE EXISTS(SELECT 1 FROM world_command_log WHERE command_id=? AND player_id=? )`)
              .bind(body.commandId + ":" + drop.itemId, identity.subject, zoneId, drop.itemId, drop.quantity, body.commandId, identity.subject)),
          ]);
          if (Number(results[0]?.meta?.changes ?? 0) !== 1) {
            const duplicate = await env.DB.prepare(
              "SELECT outcome_json FROM world_command_log WHERE command_id=? AND player_id=?"
            ).bind(body.commandId, identity.subject).first<{ outcome_json: string }>();
            if (duplicate) return json({ outcome: parseObject(duplicate.outcome_json), replayed: true });
            return json({ error: "world_command_conflict" }, 409);
          }
          return json({ outcome: { ...outcome, loot }, replayed: false });
        } catch {
          return json({ error: "world_command_failed" }, 500);
        }
      }

      if (request.method === "POST" && action === "equip") {
        const body = await request.json().catch(() => null) as {
          commandId?: unknown; slot?: unknown; cardId?: unknown; expectedRevision?: unknown;
        } | null;
        const slots = ["weapon", "armor", "accessory1", "accessory2"];
        if (!body || typeof body.commandId !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.commandId)
          || typeof body.slot !== "string" || !slots.includes(body.slot)
          || !(body.cardId === null || (typeof body.cardId === "string" && body.cardId.length <= 80))
          || !Number.isInteger(body.expectedRevision) || (body.expectedRevision as number) < 0) {
          return json({ error: "invalid_equipment_command" }, 400);
        }
        try {
          const prior = await env.DB.prepare("SELECT revision,slot,card_id FROM world_equipment_log WHERE command_id=? AND player_id=?")
            .bind(body.commandId, identity.subject).first<{ revision: number; slot: string; card_id: string | null }>();
          if (prior) return json({ revision: prior.revision, slot: prior.slot, cardId: prior.card_id, replayed: true });
          const player = await env.DB.prepare("SELECT cards,equipment_json,equipment_revision,equipped_card_id FROM players WHERE id=?")
            .bind(identity.subject).first<{ cards: string; equipment_json: string; equipment_revision: number; equipped_card_id: string | null }>();
          if (!player) return json({ error: "player_not_initialized" }, 409);
          const presence = await env.DB.prepare("SELECT 1 AS present FROM world_player_presence WHERE player_id=? AND zone_id=?")
            .bind(identity.subject, zoneId).first<{ present: number }>();
          if (!presence) return json({ error: "player_not_in_zone" }, 403);
          if (player.equipment_revision !== body.expectedRevision) return json({ error: "equipment_revision_conflict", revision: player.equipment_revision }, 409);
          const cards = parseJson<StoredCard[]>(player.cards, []);
          const safeCards = Array.isArray(cards) ? cards.slice(0, 500) : [];
          const loadout = normalizeEquipment(parseJson(player.equipment_json, {}), safeCards, player.equipped_card_id);
          const slot = body.slot as EquipmentSlot;
          if (body.cardId !== null) {
            const card = safeCards.find(item => item && item.id === body.cardId);
            if (!card) return json({ error: "card_not_owned" }, 403);
            const declaredSlot = card.slot;
            if (typeof declaredSlot === "string" && declaredSlot !== slot) return json({ error: "card_slot_incompatible" }, 422);
            if (Object.entries(loadout).some(([otherSlot, id]) => otherSlot !== slot && id === body.cardId)) {
              return json({ error: "card_already_equipped" }, 409);
            }
            loadout[slot] = body.cardId as string;
          } else {
            delete loadout[slot];
          }
          const nextRevision = player.equipment_revision + 1;
          const serialized = JSON.stringify(loadout);
          const results = await env.DB.batch([
            env.DB.prepare("UPDATE players SET equipment_json=?,equipment_revision=?,equipped_card_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND equipment_revision=? AND EXISTS(SELECT 1 FROM world_player_presence WHERE player_id=? AND zone_id=?) AND NOT EXISTS(SELECT 1 FROM world_equipment_log WHERE command_id=?)")
              .bind(serialized, nextRevision, loadout.weapon ?? null, identity.subject, body.expectedRevision, identity.subject, zoneId, body.commandId),
            env.DB.prepare("INSERT INTO world_equipment_log(command_id,player_id,zone_id,slot,card_id,revision) SELECT ?,?,?,?,?,? WHERE changes()=1")
              .bind(body.commandId, identity.subject, zoneId, slot, body.cardId, nextRevision),
          ]);
          if (Number(results[0]?.meta?.changes ?? 0) !== 1) {
            const duplicate = await env.DB.prepare("SELECT revision,slot,card_id FROM world_equipment_log WHERE command_id=? AND player_id=?")
              .bind(body.commandId, identity.subject).first<{ revision: number; slot: string; card_id: string | null }>();
            if (duplicate) return json({ revision: duplicate.revision, slot: duplicate.slot, cardId: duplicate.card_id, replayed: true });
            return json({ error: "equipment_revision_conflict" }, 409);
          }
          return json({ loadout, revision: nextRevision, replayed: false });
        } catch { return json({ error: "equipment_update_failed" }, 500); }
      }

      if (request.method === "POST" && action === "rest") {
        const body = await request.json().catch(() => null) as { commandId?: unknown } | null;
        if (!body || typeof body.commandId !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.commandId)) return json({ error: "invalid_rest_command" }, 400);
        try {
          const prior = await env.DB.prepare("SELECT hp_restored,resources_spent FROM world_rest_log WHERE command_id=? AND player_id=?").bind(body.commandId, identity.subject).first<{ hp_restored: number; resources_spent: number }>();
          if (prior) return json({ restored: prior.hp_restored, resourcesSpent: prior.resources_spent, replayed: true });
          const player = await env.DB.prepare("SELECT level,world_resources,cards,equipped_card_id,current_hp,equipment_json FROM players WHERE id=?").bind(identity.subject).first<{ level: number; world_resources: number; cards: string; equipped_card_id: string | null; current_hp: number | null; equipment_json: string }>();
          if (!player) return json({ error: "player_not_initialized" }, 409);
          const present = await env.DB.prepare("SELECT 1 AS present FROM world_player_presence WHERE player_id=? AND zone_id=?").bind(identity.subject, zoneId).first<{ present: number }>();
          if (!present) return json({ error: "player_not_in_zone" }, 403);
          if (player.world_resources < 1) return json({ error: "insufficient_world_resources" }, 409);
          const cards = parseJson<StoredCard[]>(player.cards, []);
          const safeCards = Array.isArray(cards) ? cards.slice(0, 500) : [];
          const loadout = normalizeEquipment(parseJson(player.equipment_json, {}), safeCards, player.equipped_card_id);
          const maximum = buildEquippedCombatant(player.level, safeCards, loadout).maxHp;
          const current = player.current_hp === null ? maximum : Math.max(0, Math.min(maximum, player.current_hp));
          const restored = maximum - current;
          if (restored <= 0) return json({ error: "health_already_full" }, 409);
          const results = await env.DB.batch([
            env.DB.prepare("UPDATE players SET current_hp=?,status_effects='[]',world_resources=world_resources-1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND world_resources>=1 AND COALESCE(current_hp,?)<? AND EXISTS(SELECT 1 FROM world_player_presence WHERE player_id=? AND zone_id=?) AND NOT EXISTS(SELECT 1 FROM world_rest_log WHERE command_id=?)").bind(maximum, identity.subject, maximum, maximum, identity.subject, zoneId, body.commandId),
            env.DB.prepare("INSERT INTO world_rest_log(command_id,player_id,zone_id,hp_restored,resources_spent) SELECT ?,?,?,?,1 WHERE changes()=1").bind(body.commandId, identity.subject, zoneId, restored),
          ]);
          if (Number(results[0]?.meta?.changes ?? 0) !== 1) {
            const duplicate = await env.DB.prepare("SELECT hp_restored,resources_spent FROM world_rest_log WHERE command_id=? AND player_id=?").bind(body.commandId, identity.subject).first<{ hp_restored: number; resources_spent: number }>();
            if (duplicate) return json({ restored: duplicate.hp_restored, resourcesSpent: duplicate.resources_spent, replayed: true });
            return json({ error: "rest_conflict_or_full_health" }, 409);
          }
          return json({ restored, currentHp: maximum, maxHp: maximum, resourcesSpent: 1, replayed: false });
        } catch { return json({ error: "world_rest_failed" }, 500); }
      }
      if (request.method === "POST" && action === "state") {
        return json({ error: "client_zone_state_writes_disabled" }, 403);
        const body = await request.json().catch(() => null) as { expectedRevision?: unknown; state?: unknown } | null;
        if (!body || !Number.isInteger(body.expectedRevision) || (body.expectedRevision as number) < 0
          || !body.state || typeof body.state !== 'object' || Array.isArray(body.state)) {
          return json({ error: "invalid_world_state" }, 400);
        }
        const stateJson = JSON.stringify(body.state);
        if (stateJson.length > 32768) return json({ error: "world_state_too_large" }, 413);
        const expectedRevision = body.expectedRevision as number;
        try {
          const result = await env.DB.prepare(`INSERT INTO world_zone_state(zone_id,revision,state_json,updated_at)
            SELECT ?,1,?,CURRENT_TIMESTAMP
            WHERE ?=0 OR EXISTS(SELECT 1 FROM world_zone_state WHERE zone_id=?)
            ON CONFLICT(zone_id) DO UPDATE SET
              revision=world_zone_state.revision+1,state_json=excluded.state_json,updated_at=CURRENT_TIMESTAMP
            WHERE world_zone_state.revision=?`)
            .bind(zoneId, stateJson, expectedRevision, zoneId, expectedRevision).run();
          if (Number(result.meta.changes ?? 0) !== 1) {
            const current = await env.DB.prepare("SELECT revision,state_json,updated_at FROM world_zone_state WHERE zone_id=?")
              .bind(zoneId).first<Record<string, unknown>>();
            return json({ error: "world_state_conflict", current: current ? {
              revision: current.revision, value: parseObject(current.state_json), updatedAt: current.updated_at,
            } : { revision: 0, value: {}, updatedAt: null } }, 409);
          }
          return json({ revision: expectedRevision + 1, value: body.state });
        } catch {
          return json({ error: "world_state_write_failed" }, 500);
        }
      }

      return json({ error: "method_not_allowed" }, 405);
    }

    if (url.pathname === "/player" && request.method === "GET") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "missing id" }, 400);
      if (id !== identity.subject) return json({ error: "forbidden_player_id" }, 403);
      try {
        const row = await env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(id).first();
        return json({ player: row ? fromRow(row as Record<string, unknown>) : null });
      } catch {
        return json({ error: "database_read_failed" }, 500);
      }
    }

    if (url.pathname === "/player" && request.method === "POST") {
      return json({ error: "client_player_state_writes_disabled" }, 403);
      const body = await request.json().catch(() => null) as { id?: string; player?: PlayerPayload } | null;
      const id = body?.id?.trim();
      if (!id || !body?.player) return json({ error: "invalid payload" }, 400);

      const p = normalize(body.player);
      try {
        await env.DB.prepare(`INSERT INTO players (
          id,name,level,xp,faction,victories,zone_id,exploration_count,last_discovery,
          arena_wins,equipped_card_id,fusion_materials,world_threat,world_resources,
          world_tile,visited_poi_ids,faction_states,npc_memories,quests,cards,updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,level=excluded.level,xp=excluded.xp,faction=excluded.faction,
          victories=excluded.victories,zone_id=excluded.zone_id,exploration_count=excluded.exploration_count,
          last_discovery=excluded.last_discovery,arena_wins=excluded.arena_wins,
          equipped_card_id=excluded.equipped_card_id,fusion_materials=excluded.fusion_materials,
          world_threat=excluded.world_threat,world_resources=excluded.world_resources,
          world_tile=excluded.world_tile,visited_poi_ids=excluded.visited_poi_ids,
          faction_states=excluded.faction_states,npc_memories=excluded.npc_memories,
          quests=excluded.quests,cards=excluded.cards,updated_at=CURRENT_TIMESTAMP`).bind(
          id,p.name,p.level,p.xp,p.faction,p.victories,p.zone_id,p.exploration_count,
          p.last_discovery,p.arena_wins,p.equipped_card_id,p.fusion_materials,p.world_threat,
          p.world_resources,p.world_tile,p.visited_poi_ids,p.faction_states,p.npc_memories,p.quests,p.cards
        ).run();

        const row = await env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(id).first();
        return json({ player: row ? fromRow(row as Record<string, unknown>) : null });
      } catch {
        return json({ error: "database_write_failed" }, 500);
      }
    }

    return json({ error: "not_found" }, 404);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(adjudicateExpiredPvpMatches(env.DB).catch(() => 0).then(() => undefined));
  },
};
