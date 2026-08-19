import { sameHuman } from '../repairPaysimpleCustomerIds';

jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn(), close: jest.fn(), transaction: jest.fn() } }));
jest.mock('../../services/paysimpleService', () => ({ getCustomerById: jest.fn(), getPayment: jest.fn() }));

/**
 * `sameHuman` is the gate that decides whether a differing email means "contaminated,
 * repair it" or "same person under a second address, leave it alone". It sits directly
 * in front of a write that remaps identity to money, so both directions matter: a false
 * negative rewrites a correct id, a false positive leaves a stranger's id in place.
 */
describe('sameHuman — alias vs contamination', () => {
  it('treats the real contamination case as different people', () => {
    expect(sameHuman('Victor Oragwu', 'Shefat Rahman')).toBe(false);
    expect(sameHuman('Victor Oragwu', 'Ikenna Nzeribe')).toBe(false);
    expect(sameHuman('Victor Oragwu', 'Ali Muwwakkil')).toBe(false);
    expect(sameHuman('Victor Oragwu', 'Syillian McNeil')).toBe(false);
    expect(sameHuman('Victor Oragwu', 'Taiwo Oludimimu')).toBe(false);
  });

  it('recognises the three real alias cases as the same person', () => {
    // Britiana Akhile — gmail on the enrollment, yahoo.co.uk in PaySimple.
    expect(sameHuman('Britiana Akhile', 'Britiana Akhile')).toBe(true);
    // Jude Mofunanya — a +2 alias.
    expect(sameHuman('Jude Mofunanya', 'Jude Mofunanya')).toBe(true);
    // Marione Nkerbu — PaySimple stores it shouting, and the enrollment adds a middle name.
    expect(sameHuman('MARIONE NKERBU', 'Marione Nkerbu')).toBe(true);
    expect(sameHuman('MARIONE NKERBU', 'MARIONE NKERBU TAPSOBA')).toBe(true);
  });

  it('ignores case, punctuation and token order', () => {
    expect(sameHuman('ada lovelace', 'Ada Lovelace')).toBe(true);
    expect(sameHuman('Lovelace, Ada', 'Ada Lovelace')).toBe(true);
    expect(sameHuman("Se'an O'Brien", 'Sean OBrien')).toBe(true);
  });

  it('refuses to call a bare first-name collision the same person', () => {
    // One shared token is not identity — this must not suppress a real contamination.
    expect(sameHuman('Victor', 'Victor Chukwukere')).toBe(false);
    expect(sameHuman('Ikenna', 'Ikenna Nzeribe')).toBe(false);
  });

  it('fails closed on missing or empty names', () => {
    expect(sameHuman('', 'Ada Lovelace')).toBe(false);
    expect(sameHuman('Ada Lovelace', null)).toBe(false);
    expect(sameHuman(undefined, undefined)).toBe(false);
    expect(sameHuman('   ', 'Ada Lovelace')).toBe(false);
  });

  it('does not match two different people who share a surname', () => {
    expect(sameHuman('Ada Lovelace', 'Grace Lovelace')).toBe(false);
  });
});
