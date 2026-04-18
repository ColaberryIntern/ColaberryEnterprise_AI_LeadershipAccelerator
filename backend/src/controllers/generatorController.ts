import { Request, Response } from 'express';
import { LeadSource, EntryPoint, FormDefinition } from '../models';

const DEFAULT_BASE = process.env.INGEST_PUBLIC_BASE_URL || 'https://enterprise.colaberry.ai';

function buildSamplePayload(fieldMap: Record<string, string>): Record<string, any> {
  const sample: Record<string, any> = {};
  for (const [incoming, dest] of Object.entries(fieldMap || {})) {
    if (dest === 'email' || dest.endsWith('.email')) sample[incoming] = 'lead@example.com';
    else if (dest === 'phone' || dest.endsWith('.phone')) sample[incoming] = '+1 512 555 1212';
    else if (dest === 'name' || dest.endsWith('.name')) sample[incoming] = 'Jane Doe';
    else if (dest === 'company' || dest.endsWith('.company')) sample[incoming] = 'Acme Corp';
    else if (dest === 'title' || dest.endsWith('.title')) sample[incoming] = 'VP of Engineering';
    else if (dest === 'role' || dest.endsWith('.role')) sample[incoming] = 'Engineering Leadership';
    else sample[incoming] = 'example';
  }
  if (Object.keys(sample).length === 0) {
    sample.name = 'Jane Doe';
    sample.email = 'lead@example.com';
  }
  return sample;
}

function buildCurl(url: string, payload: Record<string, any>): string {
  const body = JSON.stringify(payload, null, 2);
  return [
    `curl -X POST '${url}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${body.replace(/'/g, `'\\''`)}'`,
  ].join('\n');
}

function buildJsEmbed(url: string, formName: string | null, entrySlug: string): string {
  const selector = formName ? `form[data-colaberry-form="${entrySlug}"]` : `form[data-colaberry-form="${entrySlug}"]`;
  return `<script>
(function(){
  var form = document.querySelector('${selector}');
  if (!form) return;
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var data = new FormData(form);
    var body = {};
    data.forEach(function(v, k) { body[k] = v; });
    body.page_url = location.href;
    body.referrer = document.referrer;
    body.session_id = (document.cookie.match(/cb_sid=([^;]+)/) || [])[1] || '';
    fetch('${url}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function() { location = form.getAttribute('data-success-url') || '/thank-you'; });
  });
})();
</script>`;
}

export async function getGenerator(req: Request, res: Response): Promise<void> {
  const sourceSlug = String(req.params.sourceSlug || '');
  const entrySlug = String(req.params.entrySlug || '');

  const source = await LeadSource.findOne({ where: { slug: sourceSlug } });
  if (!source) {
    res.status(404).json({ error: `Unknown source: ${sourceSlug}` });
    return;
  }

  const entry = await EntryPoint.findOne({ where: { source_id: source.id, slug: entrySlug } });
  if (!entry) {
    res.status(404).json({ error: `Unknown entry point: ${entrySlug}` });
    return;
  }

  const formDef = await FormDefinition.findOne({
    where: { entry_point_id: entry.id, is_active: true },
    order: [['version', 'DESC']],
  });

  const fieldMap = (formDef?.field_map as Record<string, string>) || {};
  const webhookUrl = `${DEFAULT_BASE}/api/leads/ingest?source=${encodeURIComponent(sourceSlug)}&entry=${encodeURIComponent(entrySlug)}`;
  const samplePayload = buildSamplePayload(fieldMap);

  res.json({
    source: { id: source.id, slug: source.slug, name: source.name, domain: source.domain },
    entry_point: { id: entry.id, slug: entry.slug, name: entry.name, page: entry.page, form_name: entry.form_name },
    form_definition: formDef
      ? { id: formDef.id, field_map: formDef.field_map, required_fields: formDef.required_fields, version: formDef.version }
      : null,
    webhook_url: webhookUrl,
    sample_payload: samplePayload,
    curl: buildCurl(webhookUrl, samplePayload),
    js_embed: buildJsEmbed(webhookUrl, entry.form_name || null, entry.slug),
  });
}
