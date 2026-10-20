import { doorOf, routeTo, START } from '../walkPath';
import { CAMPUS_BUILDINGS } from '../campusMap';

const b = (id: string) => CAMPUS_BUILDINGS.find((x) => x.id === id)!;

describe('walkPath: the avatar follows the prototype paths', () => {
  it('a door is just below the ground line; the gate door is the gate', () => {
    expect(doorOf(b('library'))).toEqual({ x: 250, y: 221 });
    expect(doorOf(b('gate'))).toEqual({ x: 500, y: 640 });
  });

  it('from the gate to an upper building: up the spine to the hub, then to the door', () => {
    expect(routeTo(START, b('library'))).toEqual([{ x: 500, y: 592 }, { x: 500, y: 400 }, { x: 250, y: 221 }]);
  });

  it('from the gate to a lower building: to the avenue, along it, then up to the door', () => {
    expect(routeTo(START, b('commons'))).toEqual([{ x: 500, y: 592 }, { x: 310, y: 592 }, { x: 310, y: 552 }]);
  });

  it('from an upper building to another: back to the hub, then out', () => {
    const at = { ...doorOf(b('library')), zone: 'up' as const };
    expect(routeTo(at, b('lecture'))).toEqual([{ x: 500, y: 400 }, { x: 500, y: 191 }]);
  });

  it('from a lower building to an upper one: down to the avenue, to the spine, up to the hub, then out', () => {
    const at = { ...doorOf(b('commons')), zone: 'ave' as const };
    expect(routeTo(at, b('tower'))).toEqual([{ x: 310, y: 592 }, { x: 500, y: 592 }, { x: 500, y: 400 }, { x: 395, y: 276 }]);
  });

  it('every building is reachable from the gate, and every route ends at its door', () => {
    for (const x of CAMPUS_BUILDINGS) {
      const r = routeTo(START, x);
      expect(r[r.length - 1]).toEqual(doorOf(x));
    }
  });
});
