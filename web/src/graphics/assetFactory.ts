/**
 * Freedom Arena — deterministic, tileable procedural asset primitives.
 * Rendering-independent: safe to consume from Canvas2D, an editor or a later WebGL renderer.
 */
export type Biome = 'temperate' | 'arid' | 'frozen' | 'volcanic' | 'coastal';
export type MaterialKind = 'ground' | 'water' | 'rock' | 'wall' | 'sand' | 'snow' | 'lava';
export interface Palette { base: string; shades: readonly [string, string, string]; accent: string; }
export interface AssetDescriptor {
  id: string; kind: MaterialKind; biome: Biome; seed: number;
  tileSize: 64 | 128 | 256; palette: Palette; version: 1;
}
const PALETTES: Record<Biome, Record<MaterialKind, Palette>> = {
  temperate: {
    ground:{base:'#29432d',shades:['#355638','#203725','#496b3c'],accent:'#91a96a'},
    water:{base:'#155276',shades:['#247ca0','#103b5c','#55a9bd'],accent:'#9ad8df'},
    rock:{base:'#555b64',shades:['#777d83','#353c49','#a0a2a0'],accent:'#c4c4b9'},
    wall:{base:'#343b49',shades:['#596274','#202735','#737c88'],accent:'#b4a78e'},
    sand:{base:'#a68b5d',shades:['#c5aa75','#806a48','#dfc48e'],accent:'#f0d9a4'},
    snow:{base:'#c5d2d9',shades:['#edf4f4','#8fa6b5','#ffffff'],accent:'#b9e3ed'},
    lava:{base:'#6e2418',shades:['#e45b20','#391b20','#ffad36'],accent:'#ffe08a'}
  },
  arid: {
    ground:{base:'#8d7447',shades:['#b2955e','#665334','#d0ad6b'],accent:'#e3c58b'},
    water:{base:'#28677b',shades:['#4b9aa2','#174557','#9bcac0'],accent:'#d0eee0'},
    rock:{base:'#80694f',shades:['#b08a61','#574637','#d1ad7e'],accent:'#e8c99a'},
    wall:{base:'#795b3c',shades:['#a67b4f','#513d2c','#c69a66'],accent:'#ead0a0'},
    sand:{base:'#b99a61',shades:['#dfc17d','#8b7048','#f0d99b'],accent:'#fff0c4'},
    snow:{base:'#c5d2d9',shades:['#edf4f4','#8fa6b5','#ffffff'],accent:'#b9e3ed'},
    lava:{base:'#6e2418',shades:['#e45b20','#391b20','#ffad36'],accent:'#ffe08a'}
  },
  frozen: {
    ground:{base:'#647d83',shades:['#8ca8a9','#3f5965','#b1c9c5'],accent:'#d5e7df'},
    water:{base:'#174c70',shades:['#3b83a8','#102f54','#a2d7e5'],accent:'#e0f7ff'},
    rock:{base:'#596a79',shades:['#8195a3','#354455','#b3c2c9'],accent:'#e1e9ed'},
    wall:{base:'#526475',shades:['#7c91a2','#344453','#afc0ca'],accent:'#e0edf1'},
    sand:{base:'#a6a99c',shades:['#d1d2c3','#777f7b','#e8e8dc'],accent:'#ffffff'},
    snow:{base:'#d4e2e8',shades:['#ffffff','#9fb8c7','#eaf5f8'],accent:'#bceaff'},
    lava:{base:'#6e2418',shades:['#e45b20','#391b20','#ffad36'],accent:'#ffe08a'}
  },
  volcanic: {
    ground:{base:'#39353a',shades:['#62504a','#211f27','#8a5540'],accent:'#c16b3d'},
    water:{base:'#183c4a',shades:['#286575','#102630','#4b8990'],accent:'#9cc8bf'},
    rock:{base:'#454047',shades:['#6d6260','#25232b','#957c6c'],accent:'#d18a59'},
    wall:{base:'#302b32',shades:['#55434a','#1d1a22','#79534a'],accent:'#c17b50'},
    sand:{base:'#655448',shades:['#94715a','#42372f','#b18a65'],accent:'#d5a47a'},
    snow:{base:'#c5d2d9',shades:['#edf4f4','#8fa6b5','#ffffff'],accent:'#b9e3ed'},
    lava:{base:'#7d2417',shades:['#ff6424','#38151b','#ffb52e'],accent:'#fff0a0'}
  },
  coastal: {
    ground:{base:'#466044',shades:['#6c8150','#2d483e','#a1a16a'],accent:'#d0c17d'},
    water:{base:'#155a78',shades:['#2486a4','#103b61','#5bb7c2'],accent:'#c0f0e7'},
    rock:{base:'#6a7775',shades:['#96a49a','#414f56','#b8b9a6'],accent:'#e1d8b7'},
    wall:{base:'#555e5c',shades:['#7e8981','#333f43','#a8a38b'],accent:'#d9c89c'},
    sand:{base:'#b7a16d',shades:['#d9c38a','#89764f','#eee0ad'],accent:'#fff1c8'},
    snow:{base:'#c5d2d9',shades:['#edf4f4','#8fa6b5','#ffffff'],accent:'#b9e3ed'},
    lava:{base:'#6e2418',shades:['#e45b20','#391b20','#ffad36'],accent:'#ffe08a'}
  }
};
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}
export function createAsset(kind: MaterialKind, biome: Biome, seed: number, tileSize: 64 | 128 | 256 = 64): AssetDescriptor {
  return { id: `fa:${biome}:${kind}:${seed >>> 0}`, kind, biome, seed: seed >>> 0, tileSize, palette: PALETTES[biome][kind], version: 1 };
}
function cellRandom(seed: number, column: number, row: number): number {
  const wrappedColumn = column === 15 ? 0 : column;
  const wrappedRow = row === 15 ? 0 : row;
  const mixed = (seed ^ Math.imul(wrappedColumn + 1, 0x45d9f3b) ^ Math.imul(wrappedRow + 1, 0x119de1f3)) >>> 0;
  return seededRandom(mixed)();
}
/** Paints a repeatable tile. Opposite edge cells share the same pattern to reduce visible seams. */
export function paintProceduralTile(ctx: CanvasRenderingContext2D, asset: AssetDescriptor, x: number, y: number): void {
  const { tileSize, palette, kind, seed } = asset;
  const cell = Math.max(2, Math.floor(tileSize / 16));
  const count = Math.ceil(tileSize / cell);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = palette.base;
  ctx.fillRect(x, y, tileSize, tileSize);

  for (let row = 0; row < count; row++) {
    for (let column = 0; column < count; column++) {
      const roll = cellRandom(seed, column % 16, row % 16);
      if (roll < (kind === 'water' ? .38 : kind === 'snow' ? .24 : .34)) {
        const shadeIndex = Math.min(2, Math.floor(cellRandom(seed ^ 0x6d2b79f5, column % 16, row % 16) * 3));
        ctx.fillStyle = palette.shades[shadeIndex];
        const px = x + column * cell, py = y + row * cell;
        ctx.fillRect(px, py, Math.min(cell, x + tileSize - px), Math.min(cell, y + tileSize - py));
      }
    }
  }

  const detailRandom = seededRandom(seed ^ 0x27d4eb2d);
  if (kind === 'water' || kind === 'lava' || kind === 'sand') {
    ctx.strokeStyle = palette.accent;
    ctx.globalAlpha = kind === 'lava' ? .72 : .38;
    ctx.lineWidth = Math.max(1, tileSize / 64);
    for (let i = 0; i < 4; i++) {
      const yy = y + Math.floor(detailRandom() * Math.max(1, tileSize / 4)) * 4;
      ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + tileSize, yy); ctx.stroke();
    }
  } else if (kind === 'rock') {
    ctx.fillStyle = palette.accent;
    ctx.globalAlpha = .42;
    for (let i = 0; i < 5; i++) {
      const px = x + Math.floor(detailRandom() * 12) * (tileSize / 12);
      const py = y + Math.floor(detailRandom() * 12) * (tileSize / 12);
      ctx.fillRect(px, py, Math.max(2, tileSize / 24), Math.max(2, tileSize / 32));
    }
  } else if (kind === 'wall') {
    ctx.strokeStyle = palette.accent; ctx.globalAlpha = .35; ctx.lineWidth = Math.max(1, tileSize / 64);
    for (let row = 1; row < 4; row++) {
      const yy = y + row * tileSize / 4;
      ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + tileSize, yy); ctx.stroke();
    }
    for (let column = 1; column < 4; column++) {
      const xx = x + column * tileSize / 4;
      ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx, y + tileSize); ctx.stroke();
    }
  } else if (kind === 'ground' || kind === 'snow') {
    ctx.fillStyle = palette.accent; ctx.globalAlpha = .48;
    for (let i = 0; i < 7; i++) {
      const px = x + Math.floor(detailRandom() * 14) * (tileSize / 14);
      const py = y + Math.floor(detailRandom() * 14) * (tileSize / 14);
      ctx.fillRect(px, py, Math.max(1, tileSize / 64), Math.max(2, tileSize / 24));
    }
  }
  ctx.restore();
}
export const GRAPHICS_PIPELINE = {
  schemaVersion: 1, logicalGrid: 64, supportedTileSizes: [64,128,256] as const,
  stages: ['concept','palette','procedural-generation','preview','validation','atlas-export','runtime-cache'] as const,
  formats: ['png','webp','json'] as const
};
