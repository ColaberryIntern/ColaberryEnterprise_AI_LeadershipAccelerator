import CampaignQATab from '../../../../pages/admin/ai-settings/CampaignQATab';

interface QAScanTabProps {
  entityFilter?: { type: string; id: string; name: string } | null;
  layerFilter?: number | null;
}

export default function QAScanTab({ entityFilter }: QAScanTabProps) {
  return (
    <div className="p-3">
      {entityFilter && (
        <div className="alert alert-info py-2 d-flex align-items-center gap-2 small mb-3">
          <i className="bi bi-funnel-fill" />
          Showing QA results filtered by <strong>{entityFilter.name}</strong>
        </div>
      )}
      <CampaignQATab />
    </div>
  );
}
