import {describe,expect,it} from 'vitest';
import {createBuilding} from './buildingFactory';
import {createBuildingDocument,parseBuildingDocument,serializeBuildingDocument,validateBuildingDocument} from './buildingDocument';
describe('Building documents',()=>{
 it('round-trips empty and populated documents',()=>{const doc=createBuildingDocument();doc.buildings=[createBuilding('house','Aegis',1,1)];expect(parseBuildingDocument(serializeBuildingDocument(doc))).toEqual(doc);});
 it('rejects overlapping and out-of-bounds buildings',()=>{const doc=createBuildingDocument();doc.buildings=[createBuilding('house','Aegis',1,1),createBuilding('tower','Nomads',2,2)];expect(validateBuildingDocument(doc)).toBe(false);});
 it('rejects unsupported document versions',()=>expect(validateBuildingDocument({...createBuildingDocument(),version:2})).toBe(false));
});