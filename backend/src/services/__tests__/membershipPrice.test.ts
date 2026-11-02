import * as fs from 'fs';
import * as path from 'path';
import {
  MEMBERSHIP_PRICE, ANNUAL_TERM_MONTHS, ANNUAL_CHARGE, ANNUAL_CHARGE_CENTS,
  ANNUAL_SAVING_VS_MONTHLY, NOT_THE_PRICE,
} from '../membershipPrice';

/**
 * C10.2 - the price of record. The ticket asked for one figure, every surface reading it, and
 * a guard that fails when two surfaces disagree. These are the unit-level guarantees; the
 * cross-surface check is scripts/checkPriceAgreement.js.
 */
describe('the price of record', () => {
  it('is $149/month on the annual plan and $199 month-to-month', () => {
    expect(MEMBERSHIP_PRICE.annualPerMonth).toBe(149);
    expect(MEMBERSHIP_PRICE.monthly).toBe(199);
  });

  it('derives the annual charge rather than typing it: $1,788', () => {
    expect(ANNUAL_CHARGE).toBe(1788);
    expect(ANNUAL_CHARGE).toBe(MEMBERSHIP_PRICE.annualPerMonth * ANNUAL_TERM_MONTHS);
  });

  it('matches what production actually holds', () => {
    // Measured 2 November 2026 against the production database: all 44 annual subscription
    // rows ever created carry amount_cents = 178800, and five paid enrollments carry
    // amount_paid = 1788.00. This test is what makes that measurement enforceable instead
    // of a note in a document.
    expect(ANNUAL_CHARGE_CENTS).toBe(178800);
    expect(ANNUAL_CHARGE_CENTS).toBe(ANNUAL_CHARGE * 100);
  });

  it('derives the annual saving quoted to prospects: $600', () => {
    // Maya says this number out loud on a pushback, so it must not be able to disagree with
    // the two rates it comes from.
    expect(ANNUAL_SAVING_VS_MONTHLY).toBe(600);
    expect(ANNUAL_SAVING_VS_MONTHLY)
      .toBe((MEMBERSHIP_PRICE.monthly - MEMBERSHIP_PRICE.annualPerMonth) * ANNUAL_TERM_MONTHS);
  });

  it('names $1,700 and $4,500 as prices this business does not charge', () => {
    const values = NOT_THE_PRICE.map((n) => n.value);
    expect(values).toContain(1700);
    expect(values).toContain(4500);
    for (const entry of NOT_THE_PRICE) {
      // Each has to say WHY, or the list decays into a number nobody can argue with.
      expect(entry.why.length).toBeGreaterThan(20);
      // And none of them may collide with a price we do charge.
      expect(entry.value).not.toBe(ANNUAL_CHARGE);
      expect(entry.value).not.toBe(MEMBERSHIP_PRICE.annualPerMonth);
      expect(entry.value).not.toBe(MEMBERSHIP_PRICE.monthly);
    }
  });

  /**
   * THE INVARIANT THAT KEEPS THE FIX WORKING.
   *
   * admissionsPricing could not import subscriptionService, because billing reaches the email
   * service through the enrollment service and the email service reads admissionsPricing - so
   * importing the plans there closes a cycle. That is the whole reason the old contract guard
   * regex-scraped a number out of a source file instead of comparing two imports.
   *
   * This module is importable from both sides only because it imports nothing. If someone adds
   * an import here, the cycle returns for every consumer at once and the next person has no way
   * to know why it broke. So the leaf property is asserted, not just documented.
   */
  it('imports nothing, so every surface can read it without a dependency cycle', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'membershipPrice.ts'), 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments, which do mention imports
      .replace(/^\s*\/\/.*$/gm, '');      // line comments
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).not.toMatch(/\brequire\s*\(/);
    expect(code).not.toMatch(/^\s*export\s+\*\s+from/m);
  });
});
