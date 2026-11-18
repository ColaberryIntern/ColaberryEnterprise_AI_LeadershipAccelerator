/**
 * OH1o: the Brain tab shows the rules (hard rules and the Open House hold locked), everything each
 * shelf can choose from, what each Explorer already got, and a sample that shows what the brain passed.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { GivenBody, InventoryBody, RulesEditor, SampleBody, SnapshotDetails } from '../BrainTab';
import type { BrainControl, BrainSampleResult, MayaBrainRules } from '../../../services/explorerGrowthApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rules: MayaBrainRules = {
  explorerVoice: 'You are Maya, Director of Admissions at Colaberry. Warm, short, one useful thing.',
  neverSay: ['circle back'],
  rotation: [
    { piece: 'builder_spotlight', enabled: true }, { piece: 'build_prompt', enabled: true }, { piece: 'ai_fact', enabled: false },
    { piece: 'community_pulse', enabled: true }, { piece: 'live_event', enabled: true },
  ],
  brainPickMinHours: 72,
  weekAhead: true,
  openHouseHold: true,
};

const control: BrainControl = {
  rules, rules_problems: [], rules_stored: false, hard_rules: 'HARD RULES\n- Never sell.', send_enabled: false,
  inventory: {
    builders: [{ id: 'builder:a', name: 'Kesete', role: null, title: 'Intake agent', url: 'https://hire.refactored.ai/case-studies/a' }],
    events: [{ id: 'event:x', title: 'AI Build Night', when: 'Thursday, November 20, 6:30 PM CT', openHouse: false }],
    communityThemes: [{ id: 'community:roll-call', label: 'Roll Call', count: 4 }],
    aiFacts: [], buildPrompts: [],
    weekAhead: { id: 'week_ahead:2026-11-16', block: 'PLAN YOUR WEEK\n- Open House, Thursday' },
    unavailable: ['community'],
  },
  given: [{ recipient_masked: 'd***@example.com', date: '2026-11-18', shelf: 'builder_spotlight', item_id: 'builder:a', status: 'explorer_draft' }],
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const show = (node: React.ReactElement) => { act(() => root.render(node)); return host; };

describe('RulesEditor', () => {
  it('shows the voice, the shelves in order with their switches, the cadence, and the locked rules', () => {
    const el = show(<RulesEditor initial={rules} hardRules="HARD RULES\n- Never sell." />);
    expect((el.querySelector('#brain-voice') as HTMLTextAreaElement).value).toContain('You are Maya');
    const boxes = Array.from(el.querySelectorAll('table input[type="checkbox"]')) as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([true, true, false, true, true]);
    expect((el.querySelector('#brain-cadence') as HTMLSelectElement).value).toBe('72');
    const hold = el.querySelector('#brain-oh') as HTMLInputElement;
    expect(hold.checked).toBe(true);
    expect(hold.disabled).toBe(true);
    expect(el.textContent).toContain('Never sell.');
    expect((el.querySelector('#brain-never') as HTMLTextAreaElement).value).toBe('circle back');
  });
});

describe('InventoryBody (G)', () => {
  it('lists every shelf, and a reader that failed reads as unreadable, never empty', () => {
    const el = show(<InventoryBody c={control} />);
    expect(el.textContent).toContain('Kesete: Intake agent');
    expect(el.textContent).toContain('AI Build Night');
    expect(el.textContent).toContain('PLAN YOUR WEEK');
    expect(el.textContent).toMatch(/Community themes \(last 14 days\)\s*unreadable/);
  });
  it('says so when the shelves could not be read at all', () => {
    const el = show(<InventoryBody c={{ ...control, inventory: null }} />);
    expect(el.textContent).toContain('This is not the same as empty shelves');
  });
});

describe('GivenBody', () => {
  it('shows which shelf and item each Explorer already got, masked', () => {
    const el = show(<GivenBody c={control} />);
    expect(el.textContent).toContain('d***@example.com');
    expect(el.textContent).toContain('A real builder (hire.refactored.ai)');
    expect(el.textContent).toContain('builder:a');
  });
});

describe('SampleBody and SnapshotDetails (D)', () => {
  const sample: BrainSampleResult = {
    generated_at: '2026-11-18T20:00:00Z', note: 'Nothing was saved and nothing was sent.',
    people: [{
      recipient_masked: 'd***@example.com', action: 'SEND_EMAIL',
      emails: [{
        date: '2026-11-18', status: 'drafted', reason: null, issues: [], subject: 'A builder worth meeting',
        html: '<p>Hi Dana</p><div>Director of Admissions</div>',
        snapshot: {
          profile: 'WHO THEY ARE\n- First name: Dana', memory_excerpt: 'Dana asked how to start',
          piece: { shelf: 'builder_spotlight', item_id: 'builder:a', empty: false, block: 'A REAL BUILDER', allowed_links: [] },
          screen: { passed: true, issues: [], overlap_pct: 4 },
        },
      }],
    }],
  };
  it('shows the profile, the content piece, the memory, the screen result and the overlap', () => {
    const el = show(<SampleBody r={sample} />);
    expect(el.textContent).toContain('passes the screen');
    expect(el.textContent).toContain('overlap with earlier emails: 4%');
    expect(el.textContent).toContain('First name: Dana');
    expect(el.textContent).toContain('A REAL BUILDER');
    expect(el.textContent).toContain('Dana asked how to start');
    expect(el.querySelector('iframe')?.getAttribute('sandbox')).toBe('');
  });
  it('a missing snapshot says so', () => {
    const el = show(<SnapshotDetails s={null} />);
    expect(el.textContent).toContain('No brain snapshot was recorded');
  });
});
