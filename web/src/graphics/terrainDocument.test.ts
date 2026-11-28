import { describe, expect, it } from 'vitest';
import { createTerrainDocument, paintTerrainCell, parseTerrainDocument, serializeTerrainDocument, validateTerrainDocument } from './terrainDocument';

describe('Terrain document editor', () => {
  it('creates a bounded 16x16 document with the 64px logical tile contract', () => {
    const doc = createTerrainDocument();
    expect(doc.cells).toHaveLength(256);
    expect(doc.tileSize).toBe(64);
    expect(doc.format).toBe('freedom-arena-terrain-v1');
  });
  it('paints a cell without mutating the source document', () => {
    const original = createTerrainDocument();
    const next = paintTerrainCell(original, 3, 4, {biome:'arid',kind:'sand',seed:9});
    expect(next.cells[4 * 16 + 3]).toEqual({biome:'arid',kind:'sand',seed:9});
    expect(original.cells[4 * 16 + 3].kind).toBe('ground');
  });
  it('clips brush operations to the map bounds', () => {
    const next = paintTerrainCell(createTerrainDocument(), 0, 0, {biome:'frozen',kind:'snow',seed:1}, 3);
    expect(next.cells[0].kind).toBe('snow');
    expect(next.cells[1].kind).toBe('snow');
    expect(next.cells[16].kind).toBe('snow');
  });
  it('round-trips JSON and rejects malformed documents', () => {
    const doc = createTerrainDocument(4, 4);
    expect(parseTerrainDocument(serializeTerrainDocument(doc))).toEqual(doc);
    expect(validateTerrainDocument({...doc,cells:[]})).toBe(false);
    expect(() => parseTerrainDocument('{bad json')).toThrow();
  });
});
