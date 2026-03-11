import * as cheerio from 'cheerio';
import { env } from '../config/env';

/* ── Public route list (derived from publicRoutes.tsx) ──────────── */

const PUBLIC_ROUTES = [
  '/',
  '/program',
  '/pricing',
  '/sponsorship',
  '/advisory',
  '/case-studies',
  '/enroll',
  '/contact',
  '/executive-overview/thank-you',
  '/strategy-call-prep',
  '/executive-roi-calculator',
];

/* ── Interfaces ─────────────────────────────────────────────────── */

export interface LinkInfo {
  href: string;
  text: string;
  isInternal: boolean;
  isExternal: boolean;
  isEmpty: boolean;
  element: string;
  classes: string;
}

export interface FormInfo {
  action: string;
  method: string;
  fields: { name: string; type: string; label: string; required: boolean }[];
  fieldCount: number;
}

export interface ButtonInfo {
  text: string;
  type: string;
  classes: string;
  hasOnClick: boolean;
  ariaLabel: string;
}

export interface ImageInfo {
  src: string;
  alt: string;
  hasAlt: boolean;
  classes: string;
}

export interface HeadingInfo {
  level: number;
  text: string;
}

export interface TextNodeInfo {
  text: string;
  inlineColor: string;
  inlineBgColor: string;
  parentTag: string;
}

export interface MetaTagInfo {
  name: string;
  content: string;
}

export interface AriaIssue {
  selector: string;
  issue: string;
}

export interface PageScanResult {
  url: string;
  route: string;
  title: string;
  links: LinkInfo[];
  forms: FormInfo[];
  buttons: ButtonInfo[];
  images: ImageInfo[];
  headings: HeadingInfo[];
  textNodes: TextNodeInfo[];
  metaTags: Record<string, string>;
  ariaIssues: AriaIssue[];
  wordCount: number;
  scanTimestamp: Date;
  error?: string;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function baseUrl(): string {
  return env.frontendUrl.replace(/\/$/, '');
}

function isInternalHref(href: string): boolean {
  if (!href) return false;
  if (href.startsWith('/') && !href.startsWith('//')) return true;
  try {
    const url = new URL(href);
    const base = new URL(baseUrl());
    return url.hostname === base.hostname;
  } catch {
    return false;
  }
}

/* ── Page scanner ────────────────────────────────────────────────── */

export async function scanPage(route: string): Promise<PageScanResult> {
  const url = `${baseUrl()}${route}`;
  const result: PageScanResult = {
    url,
    route,
    title: '',
    links: [],
    forms: [],
    buttons: [],
    images: [],
    headings: [],
    textNodes: [],
    metaTags: {},
    ariaIssues: [],
    wordCount: 0,
    scanTimestamp: new Date(),
  };

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ColaberryWebsiteIntelligence/1.0' },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      result.error = `HTTP ${response.status}`;
      return result;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Title
    result.title = $('title').text().trim();

    // Meta tags
    $('meta').each((_, el) => {
      const name = $(el).attr('name') || $(el).attr('property') || '';
      const content = $(el).attr('content') || '';
      if (name && content) result.metaTags[name] = content;
    });

    // Links
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      result.links.push({
        href,
        text: $(el).text().trim(),
        isInternal: isInternalHref(href),
        isExternal: !isInternalHref(href) && href.startsWith('http'),
        isEmpty: !href || href === '#',
        element: 'a',
        classes: $(el).attr('class') || '',
      });
    });

    // Forms
    $('form').each((_, el) => {
      const fields: FormInfo['fields'] = [];
      $(el).find('input, select, textarea').each((__, field) => {
        const $field = $(field);
        const name = $field.attr('name') || $field.attr('id') || '';
        const fieldId = $field.attr('id') || '';
        let label = '';
        if (fieldId) {
          label = $(`label[for="${fieldId}"]`).text().trim();
        }
        fields.push({
          name,
          type: $field.attr('type') || field.tagName,
          label,
          required: $field.attr('required') !== undefined,
        });
      });
      result.forms.push({
        action: $(el).attr('action') || '',
        method: $(el).attr('method') || 'GET',
        fields,
        fieldCount: fields.length,
      });
    });

    // Buttons
    $('button, [role="button"]').each((_, el) => {
      result.buttons.push({
        text: $(el).text().trim(),
        type: $(el).attr('type') || '',
        classes: $(el).attr('class') || '',
        hasOnClick: $(el).attr('onclick') !== undefined,
        ariaLabel: $(el).attr('aria-label') || '',
      });
    });

    // Images
    $('img').each((_, el) => {
      const alt = $(el).attr('alt');
      result.images.push({
        src: $(el).attr('src') || '',
        alt: alt || '',
        hasAlt: alt !== undefined && alt !== '',
        classes: $(el).attr('class') || '',
      });
    });

    // Headings
    $('h1, h2, h3, h4, h5, h6').each((_, el) => {
      const level = parseInt(el.tagName.replace('h', ''), 10);
      result.headings.push({
        level,
        text: $(el).text().trim(),
      });
    });

    // Text with inline styles (for contrast checks)
    $('[style]').each((_, el) => {
      const style = $(el).attr('style') || '';
      const colorMatch = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
      const bgMatch = style.match(/background(?:-color)?\s*:\s*([^;]+)/i);
      if (colorMatch || bgMatch) {
        result.textNodes.push({
          text: $(el).text().trim().slice(0, 200),
          inlineColor: colorMatch ? colorMatch[1].trim() : '',
          inlineBgColor: bgMatch ? bgMatch[1].trim() : '',
          parentTag: el.tagName,
        });
      }
    });

    // Aria issues — hidden elements with interactive content
    $('[aria-hidden="true"]').each((_, el) => {
      const $el = $(el);
      if ($el.find('a, button, input, select, textarea').length > 0) {
        result.ariaIssues.push({
          selector: `${el.tagName}[aria-hidden="true"]`,
          issue: 'aria-hidden element contains interactive content',
        });
      }
    });

    // Hidden labels
    $('input, select, textarea').each((_, el) => {
      const $el = $(el);
      const id = $el.attr('id');
      const type = $el.attr('type');
      if (type === 'hidden' || type === 'submit') return;
      const hasLabel = id ? $(`label[for="${id}"]`).length > 0 : false;
      const hasAriaLabel = !!$el.attr('aria-label') || !!$el.attr('aria-labelledby');
      const hasPlaceholder = !!$el.attr('placeholder');
      if (!hasLabel && !hasAriaLabel && !hasPlaceholder) {
        result.ariaIssues.push({
          selector: `${el.tagName}#${id || '(no-id)'}`,
          issue: 'Form field missing label, aria-label, and placeholder',
        });
      }
    });

    // Word count
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    result.wordCount = bodyText.split(' ').filter(Boolean).length;

  } catch (err: any) {
    result.error = err.message;
  }

  return result;
}

/* ── Scan all public pages ───────────────────────────────────────── */

export async function scanAllPublicPages(): Promise<PageScanResult[]> {
  const results: PageScanResult[] = [];
  // Scan sequentially to avoid overwhelming the server
  for (const route of PUBLIC_ROUTES) {
    const result = await scanPage(route);
    results.push(result);
  }
  return results;
}

export function getPublicRoutes(): string[] {
  return [...PUBLIC_ROUTES];
}

export function getKnownInternalPaths(): string[] {
  return [...PUBLIC_ROUTES, '/enroll/success', '/enroll/cancel', '/about'];
}
