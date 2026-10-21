/**
 * submittalBuckets — the deterministic grouping of flat proposal requirements into the 8 SUBMITTAL categories
 * (the proposal volume/tab model). The routing is load-bearing: it is how the 80+ flat requirements become a
 * manageable <=10 checklist. These tests pin each category's signal AND the precedence tie-breaks, so a mutant
 * that drops a signal or reorders precedence fails. Pure + total.
 */
import { classifySubmittalBucket, SUBMITTAL_BUCKETS, submittalBucket } from '../submittalBuckets';

const cat = (text: string, section?: string) => classifySubmittalBucket({ text, section });

describe('SUBMITTAL_BUCKETS catalog', () => {
  it('is exactly 8 mutually-distinct buckets in display order 1..8', () => {
    expect(SUBMITTAL_BUCKETS).toHaveLength(8);
    expect(SUBMITTAL_BUCKETS.map((b) => b.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(SUBMITTAL_BUCKETS.map((b) => b.key)).size).toBe(8);
  });
  it('flags the four pass/fail gates (admin, certs, price, socioeconomic) and not the scored ones', () => {
    const gates = SUBMITTAL_BUCKETS.filter((b) => b.gate).map((b) => b.key).sort();
    expect(gates).toEqual(['admin', 'certs', 'price', 'socioeconomic']);
    expect(submittalBucket('technical').gate).toBe(false);
  });
});

describe('classifySubmittalBucket — each category by its real signal', () => {
  it('socioeconomic: HUB subcontracting plan, DBE/MBE/WBE, small-business participation', () => {
    expect(cat('A completed HUB Subcontracting Plan is required.')).toBe('socioeconomic');
    expect(cat('Describe your DBE participation.')).toBe('socioeconomic');
    expect(cat('Provide the small business subcontracting plan.')).toBe('socioeconomic');
  });
  it('price: the cost proposal / pricing schedule / fee schedule', () => {
    expect(cat('Submit the Cost Proposal on Form 3.')).toBe('price');
    expect(cat('Complete the pricing schedule in Attachment A.')).toBe('price');
    expect(cat('Provide your fee schedule and hourly rate.')).toBe('price');
  });
  it('financial: financial statements, insurance, bonding capacity', () => {
    expect(cat('Provide audited financial statements for the last two years.')).toBe('financial');
    expect(cat('Submit a certificate of insurance meeting the stated limits.')).toBe('financial');
    expect(cat('Demonstrate bonding capacity.')).toBe('financial');
  });
  it('management: key personnel, resumes, staffing, PM', () => {
    expect(cat('Provide resumes for all key personnel.')).toBe('management');
    expect(cat('Identify the day-to-day Project Manager and staffing plan.')).toBe('management');
    expect(cat('Include an organizational chart and a transition plan.')).toBe('management');
  });
  it('experience: past performance, references, similar contracts', () => {
    expect(cat('Complete the Past Performance Questionnaire.')).toBe('experience');
    expect(cat('Submit three references for similar contracts.')).toBe('experience');
    expect(cat('Describe your corporate experience on relevant projects.')).toBe('experience');
  });
  it('certs: SAM, E-Verify, 889, conflict of interest, W-9, good standing', () => {
    expect(cat('Offeror shall be registered in SAM.gov with active certifications.')).toBe('certs');
    expect(cat('Provide E-Verify registration documentation.')).toBe('certs');
    expect(cat('Certification of No Conflict of Interest.')).toBe('certs');
    expect(cat('Submit a completed W-9.')).toBe('certs');
  });
  it('admin: cover letter, signed offer, amendment acknowledgment, copies, bid bond', () => {
    expect(cat('Include a signed and dated cover letter.')).toBe('admin');
    expect(cat('Complete the Execution of Offer form.')).toBe('admin');
    expect(cat('Acknowledge all amendments to this solicitation.')).toBe('admin');
    expect(cat('Submit one original and three copies.')).toBe('admin');
    expect(cat('Provide a proposal bond with the response.')).toBe('admin');
  });
  it('technical: solution approach, methodology, scope-of-work response', () => {
    expect(cat('Describe your technical approach and methodology.')).toBe('technical');
    expect(cat('Provide a work plan addressing the scope of work.')).toBe('technical');
  });
  it('defaults an unsignalled requirement to technical (a narrative response), never throws', () => {
    expect(cat('Provide a narrative describing how you would deliver.')).toBe('technical');
    expect(classifySubmittalBucket({})).toBe('technical');
    expect(classifySubmittalBucket({ text: null, section: null })).toBe('technical');
    expect(classifySubmittalBucket(undefined as any)).toBe('technical');
  });
});

describe('classifySubmittalBucket — the precedence tie-breaks (first match wins)', () => {
  it('a RESUME files under Management, not Experience (management tested first)', () => {
    // Mentions both "resume" (management) and "experience" (experience) - management must win.
    expect(cat('Provide a resume for each key person showing relevant experience.')).toBe('management');
  });
  it('a CERTIFICATE OF INSURANCE files under Financial, not Certs (insurance is the stronger signal)', () => {
    expect(cat('Provide a certificate of insurance; the certification must be current.')).toBe('financial');
  });
  it('a PROPOSAL/BID BOND files under Admin, not Financial (Financial matches only bonding-capacity/performance-bond)', () => {
    expect(cat('A proposal bond must accompany the bid.')).toBe('admin');
  });
  it('EXCEPTIONS TO THE TERMS file under Certs; the word "technical" still falls through to Technical', () => {
    expect(cat('State any exceptions to the terms and conditions.')).toBe('certs');
    expect(cat('List any exceptions to the technical requirements.')).toBe('technical');
  });
  it('uses the SECTION heading as a signal when the text alone is generic', () => {
    expect(cat('Provide the requested information.', 'Past Performance References')).toBe('experience');
    expect(cat('Complete as directed.', 'HUB Subcontracting Plan')).toBe('socioeconomic');
  });
});
