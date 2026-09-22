export type Combatant={id:string;name:string;level:number;maxHp:number;hp:number;attack:number;defense:number};
export type CombatEffect='bleed'|'weakened';
export type CombatState={player:Combatant;enemy:Combatant;turn:'player'|'enemy';status:'active'|'victory'|'defeat';log:string[];guarding:boolean;heavyCooldown:number;enemyStunned:boolean;momentum:number;enemyEffects:Partial<Record<CombatEffect,number>>;playerEffects:Partial<Record<CombatEffect,number>>};
export type CombatBonuses={power?:number;defense?:number;vitality?:number;threat?:number;faction?:string;encounterChance?:number};
export function createEncounter(playerLevel:number,zoneLevel:number,bonuses:CombatBonuses={}):CombatState{
 const level=Math.max(1,zoneLevel+Math.floor((Math.max(1,bonuses.threat??1)-1)/2)),power=Math.max(0,bonuses.power??0),defense=Math.max(0,bonuses.defense??0),vitality=Math.max(0,bonuses.vitality??0);
 const player:Combatant={id:'player',name:'Player',level:playerLevel,maxHp:100+playerLevel*10+vitality,hp:100+playerLevel*10+vitality,attack:12+playerLevel*3+power,defense:5+playerLevel*2+defense};
 const faction=bonuses.faction??(level>=3?'Eclipse':level===2?'Nomads':'Aegis');
 const names:Record<string,string>={Aegis:'Aegis Sentinel',Nomads:'Nomad Raider',Eclipse:'Eclipse Warden'};
 const encounterBoost=Math.max(0,Math.floor((bonuses.encounterChance??15)/30));
 const enemy:Combatant={id:'enemy',name:names[faction]??'Frontier Scout',level,maxHp:70+level*15+encounterBoost*8,hp:70+level*15+encounterBoost*8,attack:9+level*3+encounterBoost,defense:4+level+Math.floor(encounterBoost/2)};
 return {player,enemy,turn:'player',status:'active',log:[`Encounter: ${enemy.name}`],guarding:false,heavyCooldown:0,enemyStunned:false,momentum:0,enemyEffects:{},playerEffects:{}};
}
function damage(attack:number,defense:number):number{return Math.max(1,attack-Math.floor(defense*.6));}
function tickEffects(state:CombatState):CombatState{
 const enemyBleed=state.enemyEffects.bleed??0;
 const playerBleed=state.playerEffects.bleed??0;
 let next={...state,enemyEffects:{...state.enemyEffects},playerEffects:{...state.playerEffects},enemy:{...state.enemy},player:{...state.player}};
 if(enemyBleed>0){next.enemy.hp=Math.max(0,next.enemy.hp-3);next.enemyEffects.bleed=enemyBleed-1;next.log=[...next.log,'Bleed deals 3 damage to the enemy.'];}
 if(playerBleed>0){next.player.hp=Math.max(0,next.player.hp-3);next.playerEffects.bleed=playerBleed-1;next.log=[...next.log,'Bleed deals 3 damage to you.'];}
 return next;
}

export function playerAttack(state:CombatState):CombatState{
 if(state.status!=='active'||state.turn!=='player')return state;
 const bonus=state.momentum>=2?2:state.momentum;
 const dealt=damage(state.player.attack+bonus,state.enemy.defense),enemyHp=Math.max(0,state.enemy.hp-dealt);
 const bleedTurns=nextBleed(state.enemyEffects.bleed, dealt);
 const nextMomentum=Math.min(3,state.momentum+1);
 if(enemyHp===0)return {...state,enemy:{...state.enemy,hp:0},status:'victory',momentum:nextMomentum,enemyEffects:{...state.enemyEffects,bleed:bleedTurns},log:[...state.log,'You deal '+dealt+' damage.'+(bonus>0?' Momentum +'+bonus+'.':'')+' Victory!']};
 return enemyTurn({...state,enemy:{...state.enemy,hp:enemyHp},turn:'enemy',momentum:nextMomentum,enemyStunned:false,enemyEffects:{...state.enemyEffects,bleed:bleedTurns},log:[...state.log,'You deal '+dealt+' damage.'+(bonus>0?' Momentum +'+bonus+'.':'')]});
}

function nextBleed(current:number|undefined,dealt:number):number{return Math.max(current??0,dealt>=14?2:0);}

function enemyTurn(state:CombatState):CombatState{
 state=tickEffects(state);
 if(state.enemy.hp===0)return {...state,status:'victory'};
 if(state.player.hp===0)return {...state,status:'defeat'};
 const base=damage(state.enemy.attack,state.player.defense);
 const weakened=(state.enemyEffects.weakened??0)>0;
 const dealt=state.guarding?Math.max(1,Math.floor(base*.5)):Math.max(1,weakened?Math.floor(base*.75):base);
 const guardLog=state.guarding?' Guard absorbs part of the impact.':'';
 const playerHp=Math.max(0,state.player.hp-dealt);
 if(playerHp===0)return {...state,player:{...state.player,hp:0},status:'defeat',guarding:false,heavyCooldown:Math.max(0,state.heavyCooldown-1),playerEffects:{...state.playerEffects,weakened:Math.max(0,(state.playerEffects.weakened??0)-1)},log:[...state.log,`${state.enemy.name} deals ${dealt} damage.${guardLog} Defeat.`]};
 return {...state,player:{...state.player,hp:playerHp},turn:'player',guarding:false,heavyCooldown:Math.max(0,state.heavyCooldown-1),playerEffects:{...state.playerEffects,weakened:Math.max(0,(state.playerEffects.weakened??0)-1)},log:[...state.log,`${state.enemy.name} deals ${dealt} damage.${guardLog}`]};
}
export function getCombatReward(state:CombatState):number{return state.status==='victory'?25+state.enemy.level*10:0;}

export function getCombatPerformance(state:CombatState):number { const s=getCombatSummary(state); if(state.status!=='victory') return 0; return Math.max(1,Math.round(getCombatReward(state)+s.damageDealt-s.damageTaken-Math.max(0,s.rounds-3)*2)); }

export function getCombatSummary(state:CombatState):{rounds:number;damageTaken:number;damageDealt:number} {
 const damageDealt=Math.max(0,state.enemy.maxHp-state.enemy.hp);
 const damageTaken=Math.max(0,state.player.maxHp-state.player.hp);
 const rounds=state.log.filter(entry=>entry.startsWith('You deal ')).length;
 return {rounds,damageTaken,damageDealt};
}

export function playerGuard(state:CombatState):CombatState{
 if(state.status!=='active'||state.turn!=='player')return state;
 return enemyTurn({...state,turn:'enemy',guarding:true,momentum:0,log:[...state.log,'You brace for the next attack. Momentum reset.']});
}

export function playerHeavyStrike(state:CombatState):CombatState{
 if(state.status!=='active'||state.turn!=='player'||state.heavyCooldown>0)return state;
 const momentumBonus=Math.min(6,state.momentum*2);
 const dealt=Math.max(2,damage(state.player.attack+8+momentumBonus,state.enemy.defense));
 const enemyHp=Math.max(0,state.enemy.hp-dealt);
 if(enemyHp===0)return {...state,enemy:{...state.enemy,hp:0},status:'victory',heavyCooldown:2,enemyStunned:false,momentum:0,enemyEffects:{...state.enemyEffects,weakened:2},log:[...state.log,'Heavy strike deals '+dealt+' damage. Momentum released: '+momentumBonus+'. Victory!']};
 const stunned=dealt>=Math.max(1,Math.floor(state.enemy.maxHp*.25));
 if(stunned)return {...state,enemy:{...state.enemy,hp:enemyHp},turn:'player',guarding:false,playerEffects:{...state.playerEffects,weakened:Math.max(0,(state.playerEffects.weakened??0)-1)},heavyCooldown:2,enemyStunned:true,momentum:0,enemyEffects:{...state.enemyEffects,weakened:2},log:[...state.log,'Heavy strike deals '+dealt+' damage. Momentum released: '+momentumBonus+'. Enemy staggered — you keep initiative.']};
 return enemyTurn({...state,enemy:{...state.enemy,hp:enemyHp},turn:'enemy',guarding:false,heavyCooldown:2,enemyStunned:false,momentum:0,enemyEffects:{...state.enemyEffects,weakened:2},log:[...state.log,'Heavy strike deals '+dealt+' damage. Momentum released: '+momentumBonus+'.']});
}
