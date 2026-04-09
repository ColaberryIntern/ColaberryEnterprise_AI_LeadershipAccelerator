/**
 * Taxonomy Generator — derives business-specific capability categories
 * from the project's context (organization, industry, requirements document).
 *
 * Generated ONCE and stored in project.project_variables.generated_taxonomy.
 * Subsequent reclassifications use the stored taxonomy for consistency.
 *
 * The LLM is used ONCE to generate the taxonomy. All subsequent categorization
 * uses the stored taxonomy deterministically.
 */

export interface TaxonomyCategory {
  name: string;
  description: string;
  keywords: string[];
}

export interface BusinessTaxonomy {
  source: 'generated' | 'manual';
  generated_at: string;
  business_context: {
    organization: string;
    industry: string;
    business_summary: string;
  };
  categories: TaxonomyCategory[];
}

/**
 * Generate a business-specific taxonomy from the project's context.
 * Reads the requirements document and project fields to derive categories
 * that reflect the actual business, not generic software layers.
 */
export async function generateTaxonomy(projectId: string): Promise<BusinessTaxonomy> {
  const { Project } = await import('../../models');
  const project = await Project.findByPk(projectId);
  if (!project) throw new Error('Project not found');

  // Check if taxonomy already exists
  const vars = (project as any).project_variables || {};
  if (vars.generated_taxonomy?.categories?.length > 0) {
    return vars.generated_taxonomy as BusinessTaxonomy;
  }

  // Extract business context
  const orgName = (project as any).organization_name || 'Unknown Organization';
  const industry = (project as any).industry || '';
  const businessProblem = (project as any).primary_business_problem || '';
  const useCase = (project as any).selected_use_case || '';
  const reqDoc = (project as any).requirements_document || '';

  // Extract executive summary from requirements doc (first 3000 chars)
  const docSummary = reqDoc.substring(0, 3000).trim();

  // Discover existing application structure from admin routes + GitHub tree
  let appStructure = '';
  try {
    const { getConnection } = await import('../../services/githubService');
    const conn = await getConnection(project.enrollment_id);
    if (conn?.file_tree_json?.tree) {
      const blobs = conn.file_tree_json.tree.filter((t: any) => t.type === 'blob').map((t: any) => t.path);
      // Extract admin route files → application domains
      const adminRoutes = blobs.filter((p: string) => p.includes('/routes/admin/') && p.endsWith('.ts'))
        .map((p: string) => {
          const name = (p.split('/').pop() || '').replace('Routes.ts', '').replace('.ts', '');
          return name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1').trim();
        });
      // Extract service files → capabilities
      const services = blobs.filter((p: string) => p.includes('/services/') && p.endsWith('Service.ts'))
        .map((p: string) => {
          const name = (p.split('/').pop() || '').replace('Service.ts', '');
          return name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1').trim();
        });
      // Extract model files → data domains
      const models = blobs.filter((p: string) => p.includes('/models/') && p.endsWith('.ts') && !p.includes('index'))
        .map((p: string) => (p.split('/').pop() || '').replace('.ts', ''));

      if (adminRoutes.length > 0) {
        appStructure = `\nEXISTING APPLICATION STRUCTURE (discovered from codebase):
Admin Pages: ${adminRoutes.join(', ')}
Services: ${services.slice(0, 30).join(', ')}
Data Models: ${models.slice(0, 30).join(', ')}

IMPORTANT: The taxonomy MUST include categories that cover these existing application areas.
Complex modules (with multiple routes/services) should be their own categories.`;
      }
    }
  } catch { /* non-critical */ }

  // Build business context string
  const businessContext = [
    `Organization: ${orgName}`,
    industry ? `Industry: ${industry}` : null,
    businessProblem ? `Business Problem: ${businessProblem}` : null,
    useCase ? `Use Case: ${useCase}` : null,
    appStructure || null,
    docSummary ? `\nDocument Summary:\n${docSummary}` : null,
  ].filter(Boolean).join('\n');

  // Derive industry from document if not explicitly set
  const derivedIndustry = industry || await deriveIndustry(orgName, docSummary);

  // Generate taxonomy via LLM
  const categories = await callLLMForTaxonomy(orgName, derivedIndustry, businessContext);

  // Build and store taxonomy
  const taxonomy: BusinessTaxonomy = {
    source: 'generated',
    generated_at: new Date().toISOString(),
    business_context: {
      organization: orgName,
      industry: derivedIndustry,
      business_summary: docSummary.substring(0, 500),
    },
    categories,
  };

  // Store in project_variables
  const updatedVars = { ...vars, generated_taxonomy: taxonomy };
  (project as any).project_variables = updatedVars;
  (project as any).changed('project_variables', true);
  await project.save();

  console.log(`[TaxonomyGenerator] Generated ${categories.length} categories for "${orgName}" (${derivedIndustry})`);
  return taxonomy;
}

/**
 * Derive industry from organization name and document content.
 */
async function deriveIndustry(orgName: string, docSummary: string): Promise<string> {
  if (!docSummary) return 'Technology';
  try {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await openai.chat.completions.create({
      model: 'gpt-4o-mini', temperature: 0, max_tokens: 50,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Identify the industry/sector. Respond: {"industry":"2-4 word industry name"}' },
        { role: 'user', content: `Organization: ${orgName}\n\n${docSummary.substring(0, 1000)}` },
      ],
    });
    const parsed = JSON.parse(result.choices[0]?.message?.content || '{}');
    return parsed.industry || 'Technology';
  } catch {
    return 'Technology';
  }
}

/**
 * Call LLM to generate business-specific taxonomy categories.
 */
async function callLLMForTaxonomy(
  orgName: string,
  industry: string,
  businessContext: string
): Promise<TaxonomyCategory[]> {
  try {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const result = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a business analyst specializing in ${industry}. Your job is to create a capability taxonomy for a software system.

A capability taxonomy defines WHAT a system does for its users — not HOW it's built technically.

RULES:
1. Generate 12-20 categories specific to this business and industry
2. Each category must describe a USER-FACING or BUSINESS capability
3. Category names must be 2-5 words, title case
4. NEVER use generic technical names like "Backend", "Frontend", "Database", "API Layer"
5. Include categories specific to the business domain (e.g., for EdTech: "Curriculum Design", "Student Assessment", "Learning Analytics")
6. Also include necessary cross-cutting capabilities (Security, Analytics, etc.) but name them in business terms
7. Each category needs: name, one-sentence description, and 3-5 keywords for matching
8. Use "and" (not "&") in category names for consistency

Respond with valid JSON:
{"categories":[{"name":"Category Name","description":"What this capability does","keywords":["keyword1","keyword2","keyword3"]}]}`,
        },
        {
          role: 'user',
          content: `Create a capability taxonomy for this organization:

${businessContext}

Generate categories that reflect THIS specific business, not a generic software template.`,
        },
      ],
    });

    const parsed = JSON.parse(result.choices[0]?.message?.content || '{}');
    const categories: TaxonomyCategory[] = (parsed.categories || []).map((c: any) => ({
      name: c.name || 'Unknown',
      description: c.description || '',
      keywords: c.keywords || [],
    }));

    if (categories.length === 0) return getDefaultTaxonomy(industry);
    return categories;
  } catch (err: any) {
    console.error('[TaxonomyGenerator] LLM error:', err.message);
    return getDefaultTaxonomy(industry);
  }
}

/**
 * Fallback taxonomy when LLM is unavailable.
 */
function getDefaultTaxonomy(industry: string): TaxonomyCategory[] {
  return [
    { name: 'User Management and Access', description: 'Authentication, authorization, and role management', keywords: ['user', 'auth', 'role', 'permission', 'login'] },
    { name: 'Data Management and Storage', description: 'Data persistence, retrieval, and integrity', keywords: ['data', 'storage', 'database', 'model', 'migration'] },
    { name: 'Analytics and Reporting', description: 'Business intelligence, dashboards, and metrics', keywords: ['analytics', 'report', 'dashboard', 'metric', 'chart'] },
    { name: 'Content and Communication', description: 'Content delivery, notifications, and messaging', keywords: ['content', 'notification', 'email', 'message', 'communication'] },
    { name: 'Search and Discovery', description: 'Search functionality and content discovery', keywords: ['search', 'filter', 'query', 'discover', 'browse'] },
    { name: 'Workflow and Automation', description: 'Business process automation and scheduling', keywords: ['workflow', 'automate', 'schedule', 'trigger', 'process'] },
    { name: 'Security and Compliance', description: 'Security controls, audit, and regulatory compliance', keywords: ['security', 'compliance', 'audit', 'encrypt', 'privacy'] },
    { name: 'Integration and APIs', description: 'External system integration and API management', keywords: ['api', 'integration', 'webhook', 'connect', 'sync'] },
    { name: 'Performance and Reliability', description: 'System performance, error handling, and resilience', keywords: ['performance', 'error', 'reliability', 'cache', 'optimize'] },
    { name: 'Testing and Quality', description: 'Testing strategy and quality assurance', keywords: ['test', 'quality', 'validation', 'verify', 'qa'] },
    { name: 'Deployment and Operations', description: 'CI/CD, infrastructure, and monitoring', keywords: ['deploy', 'infrastructure', 'monitor', 'ci', 'devops'] },
    { name: `${industry} Core Features`, description: `Domain-specific capabilities for ${industry}`, keywords: [industry.toLowerCase().split(' ')[0]] },
  ];
}
