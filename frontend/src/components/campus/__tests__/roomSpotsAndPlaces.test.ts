import { SPOTS, spotOf, waysHeading, spotWords, hasCubicles } from '../interior/roomSpots';
import { peoplePlaces, furnitureOf, planOf, roomDepth, YOU_AT, YOU_FROM } from '../interior/room3d/roomPlaces';

/** Campus v6 D1: "your spot" per building, and where people and furniture stand in the CSS 3D room (prototype SPOTS / placeFigures). */
describe('your spot per building (the prototype SPOTS table)', () => {
  it('the working rooms get the right furniture and open the workstation; the cabinet opens the page; Admissions books', () => {
    expect(spotOf('studio')).toMatchObject({ kind: 'desk', opens: 'ws', tile: '🪑 Your desk' });
    expect(spotOf('career')).toMatchObject({ kind: 'desk', opens: 'ws', sub: 'Your seat at the team pod' });
    expect(spotOf('lecture')).toMatchObject({ kind: 'seat', opens: 'ws', tile: '💺 Your seat' });
    expect(spotOf('library')).toMatchObject({ kind: 'carrel', opens: 'ws', tile: '📚 Your carrel' });
    expect(spotOf('testing')).toMatchObject({ kind: 'booth', opens: 'ws', tile: '🎧 Your booth' });
    expect(spotOf('arcade')).toBeNull(); // C36 (v8 G5): five cabinets in an aisle instead of one spot
    expect(spotOf('admissions')).toMatchObject({ kind: 'meet', opens: 'book', tile: '📅 Meet a person' });
  });

  it('nobody works in the Events Hall, My Progress or the Schedule: no spot; the Lounge has doors, not a couch (v7 R2 wins)', () => {
    for (const id of ['amphi', 'observatory', 'tower', 'commons', 'gallery', 'gate']) expect(spotOf(id)).toBeNull();
  });

  it('positions match the prototype (front right, its size)', () => {
    expect(SPOTS.studio).toMatchObject({ x: 0.74, z: 0.16, w: 340, h: 250 });
    expect(SPOTS.lecture).toMatchObject({ x: 0.74, z: 0.18, w: 300, h: 215 });
  });

  it('Cert Prep\'s booth is for practice and the diagnostic, never a knowledge check (Ali 2026-10-24)', () => {
    expect(SPOTS.testing!.sub).toMatch(/practice and the diagnostic/);
    expect(JSON.stringify(SPOTS)).not.toMatch(/knowledge check/i);
  });

  it('the arrival heading, the trail words and the cubicle rooms', () => {
    expect(waysHeading(SPOTS.studio!)).toBe('Look up, or sit down');
    expect(waysHeading(SPOTS.admissions!)).toBe('Look up, or sit down with a person');
    expect(waysHeading({ ...SPOTS.studio!, opens: 'page' })).toBe('Look up, or jump in');
    expect(spotWords(SPOTS.testing!)).toBe('Your booth');
    expect(hasCubicles(spotOf('studio'))).toBe(true);
    expect(hasCubicles(spotOf('lecture'))).toBe(false);
    expect(hasCubicles(null)).toBe(false);
  });
});

describe('the room\'s floor (prototype placeFigures)', () => {
  it('our layouts map to the prototype\'s four plans', () => {
    expect([planOf('rows'), planOf('benches'), planOf('pods'), planOf('board'), planOf('tables'), planOf('circle')]).toEqual(['rows', 'rows', 'desks', 'desks', 'tables', 'standing']);
  });

  it('in the Classroom with your seat the rows shift left (no one sits where your seat is)', () => {
    const withSeat = peoplePlaces('rows', true), without = peoplePlaces('rows', false);
    expect(Math.max(...withSeat.map(([x]) => x))).toBeLessThan(Math.max(...without.map(([x]) => x)));
    expect(furnitureOf('rows', true).every((f) => f.x === 0.4 && f.w === 0.5)).toBe(true);
    expect(furnitureOf('rows', false).every((f) => f.x === 0.5 && f.w === 0.62)).toBe(true);
  });

  it('desks get 2 x 3 benches, tables two round tables, a standing room nothing', () => {
    expect(furnitureOf('desks', false)).toHaveLength(6);
    expect(furnitureOf('tables', false).map((f) => f.kind)).toEqual(['table', 'table']);
    expect(furnitureOf('standing', false)).toEqual([]);
  });

  it('you walk in from the front; the room is 0.6 x its width deep, at most 820', () => {
    expect(YOU_FROM[1]).toBeLessThan(0);
    expect(YOU_AT).toEqual([0.46, 0.12]);
    expect(roomDepth(1000)).toBe(600);
    expect(roomDepth(2000)).toBe(820);
  });
});
