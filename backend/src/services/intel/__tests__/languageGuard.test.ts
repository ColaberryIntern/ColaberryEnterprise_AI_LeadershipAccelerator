import { isLikelyNonEnglishText, isNonEnglishLanguageCode } from '../languageGuard';

describe('isNonEnglishLanguageCode', () => {
  it('treats missing/empty metadata as "no signal" (false)', () => {
    expect(isNonEnglishLanguageCode(undefined)).toBe(false);
    expect(isNonEnglishLanguageCode(null)).toBe(false);
    expect(isNonEnglishLanguageCode('')).toBe(false);
  });

  it('accepts any en* variant as English', () => {
    expect(isNonEnglishLanguageCode('en')).toBe(false);
    expect(isNonEnglishLanguageCode('en-US')).toBe(false);
    expect(isNonEnglishLanguageCode('EN-GB')).toBe(false);
  });

  it('flags an explicit non-English code', () => {
    expect(isNonEnglishLanguageCode('de')).toBe(true);
    expect(isNonEnglishLanguageCode('hi')).toBe(true);
    expect(isNonEnglishLanguageCode('tr')).toBe(true);
  });
});

describe('isLikelyNonEnglishText', () => {
  it('is false for empty/blank input', () => {
    expect(isLikelyNonEnglishText()).toBe(false);
    expect(isLikelyNonEnglishText(null, undefined, '  ')).toBe(false);
  });

  it('is false for a plain English title', () => {
    expect(isLikelyNonEnglishText('AI Agent Architecture Explained', 'A deep dive into agent design.')).toBe(false);
  });

  it('flags Chinese script (the confirmed production case)', () => {
    expect(isLikelyNonEnglishText('Prompt 没用了？复杂 Agent 开发的三层控制架构拆解 #Shorts')).toBe(true);
  });

  it('flags Bengali, Korean, Thai, and Devanagari script titles', () => {
    expect(isLikelyNonEnglishText('LLM Architecture - প্রোডাকশনে এআই কোড কেন ফেইল করে?')).toBe(true);
    expect(isLikelyNonEnglishText('N잡러2 EP.3 System Architecture')).toBe(true);
    expect(isLikelyNonEnglishText('Data Ingestion Systems สถาปัตยกรรมข้อมูลเบื้องหลัง AI')).toBe(true);
    expect(isLikelyNonEnglishText('एआई सिस्टम आर्किटेक्चर')).toBe(true);
  });

  it('flags an explicit "| Hindi" / "#khmer" language tag on an otherwise Latin-script title', () => {
    expect(isLikelyNonEnglishText('AI System Design (Ep. 3) | Single AI Agent vs Multi-Agent Systems | Hindi')).toBe(true);
    expect(isLikelyNonEnglishText('Which System Architecture Should You Use #AI #khmer #TechJourney')).toBe(true);
  });

  it('flags "Yapay Zeka" (Turkish for AI) titles', () => {
    expect(isLikelyNonEnglishText('Yapay Zeka Sistemleri: 4 Bağlam Hata Modu')).toBe(true);
  });

  it('does not flag incidental substrings that are not whole-word language names', () => {
    // "behind" contains "hind" but not the whole word "hindi".
    expect(isLikelyNonEnglishText('What lies behind the AI agent curtain')).toBe(false);
  });

  it('checks both title and excerpt', () => {
    expect(isLikelyNonEnglishText('An English title', '中文描述')).toBe(true);
  });
});
