import type { TileDefinition } from './tileRegistry';
import { TILE_SIZE } from './tileRegistry';

export type TerrainKind = 'ground' | 'water' | 'rock' | 'wall' | string;

/**
 * Atlas-ready renderer. When real PNG sources are present, the registry can
 * point at them; until then this keeps the world visually coherent without
 * inventing asset files. Every cell still resolves to a canonical 32×32 tile.
 */
export function paintTacticalTile(
  ctx: CanvasRenderingContext2D,
  tile: TileDefinition,
  terrain: TerrainKind,
  x: number,
  y: number,
  seed: number,
) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;
  const hue = tile.category === 'WATER' ? '#123653'
    : tile.category === 'WALLS' ? '#090f1b'
    : tile.category === 'DESERT' ? '#3a3022'
    : tile.category === 'SNOW_ICE' ? '#26394b'
    : tile.category === 'NATURE' ? '#142d2a'
    : tile.category === 'DUNGEON' ? '#211d2d'
    : '#101b30';

  ctx.fillStyle = hue;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  // Tactical micro-detail makes the fallback atlas feel authored rather than flat.
  const phase = (seed * 17 + tile.index * 13) % 7;
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = '#9bb9e8';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  ctx.globalAlpha = 0.10;
  ctx.beginPath();
  ctx.moveTo(px + 5 + phase, py + 24);
  ctx.lineTo(px + 14 + phase, py + 7);
  ctx.lineTo(px + 27, py + 18);
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (terrain === 'water' || tile.category === 'WATER') {
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#76b9dc';
    for (let i = 0; i < 3; i++) {
      const yy = py + 7 + i * 9;
      ctx.beginPath();
      ctx.moveTo(px + 3, yy);
      ctx.quadraticCurveTo(px + 10, yy - 3, px + 16, yy);
      ctx.quadraticCurveTo(px + 22, yy + 3, px + 29, yy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (terrain === 'rock' || terrain === 'wall') {
    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = '#7383a0';
    ctx.beginPath();
    ctx.moveTo(px + 5, py + 24); ctx.lineTo(px + 13, py + 14); ctx.lineTo(px + 20, py + 23); ctx.lineTo(px + 28, py + 8);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
