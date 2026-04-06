import React from 'react';

interface Props {
  models: string[];
  repoUrl?: string | null;
}

export default function DatabaseERD({ models, repoUrl }: Props) {
  if (models.length === 0) {
    return (
      <div className="text-center text-muted py-3" style={{ fontSize: 11 }}>
        <i className="bi bi-database d-block mb-1" style={{ fontSize: 20, color: '#ef4444' }}></i>
        No database models detected
      </div>
    );
  }

  // Group models by domain (guess from filename)
  const groups = new Map<string, string[]>();
  for (const m of models) {
    const name = m.split('/').pop()?.replace('.ts', '') || m;
    let domain = 'Core';
    if (name.toLowerCase().includes('campaign')) domain = 'Campaigns';
    else if (name.toLowerCase().includes('lead') || name.toLowerCase().includes('visitor')) domain = 'Leads';
    else if (name.toLowerCase().includes('user') || name.toLowerCase().includes('enrollment') || name.toLowerCase().includes('auth')) domain = 'Users';
    else if (name.toLowerCase().includes('agent') || name.toLowerCase().includes('intelligence')) domain = 'Intelligence';
    else if (name.toLowerCase().includes('audit') || name.toLowerCase().includes('log')) domain = 'Logging';
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain)!.push(m);
  }

  const domainColors: Record<string, string> = { Campaigns: '#3b82f6', Leads: '#10b981', Users: '#8b5cf6', Intelligence: '#f59e0b', Logging: '#6b7280', Core: '#6366f1' };

  return (
    <div>
      {Array.from(groups.entries()).map(([domain, files]) => (
        <div key={domain} className="mb-2">
          <div className="fw-semibold mb-1" style={{ fontSize: 10, color: domainColors[domain] || '#6b7280' }}>{domain}</div>
          <div className="d-flex flex-wrap gap-1">
            {files.map((f, i) => {
              const name = f.split('/').pop()?.replace('.ts', '') || f;
              return (
                <div key={i} className="px-2 py-1" style={{ background: `${domainColors[domain] || '#6b7280'}08`, border: `1px solid ${domainColors[domain] || '#6b7280'}25`, borderRadius: 6 }}>
                  {repoUrl ? (
                    <a href={`${repoUrl}/blob/main/${f}`} target="_blank" rel="noopener noreferrer" className="text-decoration-none" style={{ fontSize: 9, color: domainColors[domain] }}><i className="bi bi-database me-1"></i>{name}</a>
                  ) : (
                    <span style={{ fontSize: 9 }}><i className="bi bi-database me-1"></i>{name}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
