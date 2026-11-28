import type { Biome, MaterialKind } from './assetFactory';

export const TERRAIN_DOCUMENT_FORMAT = 'freedom-arena-terrain-v1' as const;
export const TERRAIN_EDITOR_WIDTH = 16;
export const TERRAIN_EDITOR_HEIGHT = 16;
export interface TerrainCell { biome: Biome; kind: MaterialKind; seed: number; }
export interface TerrainDocument {
  format: typeof TERRAIN_DOCUMENT_FORMAT;
  version: 1;
  width: number;
  height: number;
  tileSize: 64;
  cells: TerrainCell[];
}
const BIOMES: Biome[] = ['temperate','arid','frozen','volcanic','coastal'];
const MATERIALS: MaterialKind[] = ['ground','water','rock','wall','sand','snow','lava'];

export function createTerrainDocument(width = TERRAIN_EDITOR_WIDTH, height = TERRAIN_EDITOR_HEIGHT): TerrainDocument {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 64 || height > 64) {
    throw new RangeError('Terrain dimensions must be integers between 1 and 64.');
  }
  return {
    format: TERRAIN_DOCUMENT_FORMAT, version: 1, width, height, tileSize: 64,
    cells: Array.from({length: width * height}, (_, index) => ({
      biome: 'temperate', kind: 'ground', seed: (42064 + index * 97) >>> 0
    }))
  };
}
export function paintTerrainCell(document: TerrainDocument, x: number, y: number, value: TerrainCell, brushSize = 1): TerrainDocument {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(brushSize) || brushSize < 1 || brushSize > 8) return document;
  const cells = document.cells.slice();
  const radius = Math.floor(brushSize / 2);
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const px = x + dx, py = y + dy;
    if (px < 0 || py < 0 || px >= document.width || py >= document.height) continue;
    cells[py * document.width + px] = {...value};
  }
  return {...document, cells};
}
export function validateTerrainDocument(value: unknown): value is TerrainDocument {
  if (!value || typeof value !== 'object') return false;
  const doc = value as Partial<TerrainDocument>;
  if (doc.format !== TERRAIN_DOCUMENT_FORMAT || doc.version !== 1 || doc.tileSize !== 64) return false;
  if (!Number.isInteger(doc.width) || !Number.isInteger(doc.height) || !doc.width || !doc.height || doc.width! < 1 || doc.height! < 1 || doc.width! > 64 || doc.height! > 64) return false;
  if (!Array.isArray(doc.cells) || doc.cells.length !== doc.width! * doc.height!) return false;
  return doc.cells.every(cell => !!cell && BIOMES.includes(cell.biome) && MATERIALS.includes(cell.kind) && Number.isInteger(cell.seed) && cell.seed >= 0 && cell.seed <= 0xffffffff);
}
export function serializeTerrainDocument(document: TerrainDocument): string {
  return JSON.stringify(document, null, 2);
}
export function parseTerrainDocument(source: string): TerrainDocument {
  const parsed: unknown = JSON.parse(source);
  if (!validateTerrainDocument(parsed)) throw new Error('Fichier terrain invalide ou version non prise en charge.');
  return parsed;
}
