-- Trust Before Intelligence
INSERT INTO lead_sources (slug, name, domain, hmac_secret, is_active)
VALUES ('trustbeforeintelligence', 'Trust Before Intelligence', 'trustbeforeintelligence.ai', 'TRUST_WEBHOOK_SECRET', true)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, domain = EXCLUDED.domain, hmac_secret = EXCLUDED.hmac_secret, is_active = true, updated_at = NOW();

INSERT INTO entry_points (source_id, slug, name, page, form_name, description, is_active)
SELECT id, 'get_book_modal', 'Get the Book — Modal', '/', 'book-download', 'Home-page modal requesting the book PDF', true
FROM lead_sources WHERE slug = 'trustbeforeintelligence'
ON CONFLICT (source_id, slug) DO UPDATE SET name = EXCLUDED.name, is_active = true, updated_at = NOW();

INSERT INTO entry_points (source_id, slug, name, page, form_name, description, is_active)
SELECT id, 'newsletter_footer', 'Newsletter Signup (footer)', '*', 'newsletter', 'Footer newsletter form', true
FROM lead_sources WHERE slug = 'trustbeforeintelligence'
ON CONFLICT (source_id, slug) DO UPDATE SET name = EXCLUDED.name, is_active = true, updated_at = NOW();

INSERT INTO form_definitions (entry_point_id, field_map, required_fields, version, is_active)
SELECT ep.id,
  '{"full_name":"name","email":"email","company":"company","role":"role"}'::jsonb,
  '["email"]'::jsonb, 1, true
FROM entry_points ep JOIN lead_sources ls ON ls.id = ep.source_id
WHERE ls.slug = 'trustbeforeintelligence' AND ep.slug = 'get_book_modal'
  AND NOT EXISTS (SELECT 1 FROM form_definitions WHERE entry_point_id = ep.id AND is_active = true);

INSERT INTO form_definitions (entry_point_id, field_map, required_fields, version, is_active)
SELECT ep.id,
  '{"email":"email"}'::jsonb,
  '["email"]'::jsonb, 1, true
FROM entry_points ep JOIN lead_sources ls ON ls.id = ep.source_id
WHERE ls.slug = 'trustbeforeintelligence' AND ep.slug = 'newsletter_footer'
  AND NOT EXISTS (SELECT 1 FROM form_definitions WHERE entry_point_id = ep.id AND is_active = true);

-- Colaberry
INSERT INTO lead_sources (slug, name, domain, is_active)
VALUES ('colaberry', 'Colaberry', 'colaberry.ai', true)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, domain = EXCLUDED.domain, is_active = true, updated_at = NOW();

INSERT INTO entry_points (source_id, slug, name, page, form_name, description, is_active)
SELECT id, 'request_demo_form', 'Request Demo', '/demo', 'request-demo', 'Primary enterprise demo request', true
FROM lead_sources WHERE slug = 'colaberry'
ON CONFLICT (source_id, slug) DO UPDATE SET name = EXCLUDED.name, is_active = true, updated_at = NOW();

INSERT INTO entry_points (source_id, slug, name, page, form_name, description, is_active)
SELECT id, 'executive_overview_download', 'Executive Overview Download', '/', 'executive-overview', 'Home-page executive overview PDF form', true
FROM lead_sources WHERE slug = 'colaberry'
ON CONFLICT (source_id, slug) DO UPDATE SET name = EXCLUDED.name, is_active = true, updated_at = NOW();

INSERT INTO form_definitions (entry_point_id, field_map, required_fields, version, is_active)
SELECT ep.id,
  '{"name":"name","email":"email","phone":"phone","company":"company","company_size":"company_size","message":"metadata.message"}'::jsonb,
  '["email","company"]'::jsonb, 1, true
FROM entry_points ep JOIN lead_sources ls ON ls.id = ep.source_id
WHERE ls.slug = 'colaberry' AND ep.slug = 'request_demo_form'
  AND NOT EXISTS (SELECT 1 FROM form_definitions WHERE entry_point_id = ep.id AND is_active = true);

INSERT INTO form_definitions (entry_point_id, field_map, required_fields, version, is_active)
SELECT ep.id,
  '{"name":"name","email":"email","company":"company","title":"title"}'::jsonb,
  '["email"]'::jsonb, 1, true
FROM entry_points ep JOIN lead_sources ls ON ls.id = ep.source_id
WHERE ls.slug = 'colaberry' AND ep.slug = 'executive_overview_download'
  AND NOT EXISTS (SELECT 1 FROM form_definitions WHERE entry_point_id = ep.id AND is_active = true);

-- Advisor
INSERT INTO lead_sources (slug, name, domain, hmac_secret, is_active)
VALUES ('advisor', 'AI Workforce Designer (advisor.colaberry.ai)', 'advisor.colaberry.ai', 'ADVISORY_WEBHOOK_SECRET', true)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, domain = EXCLUDED.domain, hmac_secret = EXCLUDED.hmac_secret, is_active = true, updated_at = NOW();

INSERT INTO entry_points (source_id, slug, name, page, form_name, description, is_active)
SELECT id, 'advisory_inline_form', 'Advisor inline capture', '/', 'advisory-inline', 'Fallback for advisor forms that are NOT full advisory webhooks', true
FROM lead_sources WHERE slug = 'advisor'
ON CONFLICT (source_id, slug) DO UPDATE SET name = EXCLUDED.name, is_active = true, updated_at = NOW();

INSERT INTO form_definitions (entry_point_id, field_map, required_fields, version, is_active)
SELECT ep.id,
  '{"name":"name","email":"email","idea_input":"idea_input","maturity_score":"metadata.maturity_score"}'::jsonb,
  '["email"]'::jsonb, 1, true
FROM entry_points ep JOIN lead_sources ls ON ls.id = ep.source_id
WHERE ls.slug = 'advisor' AND ep.slug = 'advisory_inline_form'
  AND NOT EXISTS (SELECT 1 FROM form_definitions WHERE entry_point_id = ep.id AND is_active = true);

-- Summary
SELECT 'sources' AS table_name, COUNT(*) AS rows FROM lead_sources
UNION ALL SELECT 'entry_points', COUNT(*) FROM entry_points
UNION ALL SELECT 'form_definitions', COUNT(*) FROM form_definitions;
