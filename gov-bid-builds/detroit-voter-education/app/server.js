require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const http = require('http');
const path = require('path');
const express = require('express');
const WebSocket = require('ws');
const preferencesRouter = require('./routes/preferences');
const feedbackRouter = require('./routes/feedback');
const jurisdictionsRouter = require('./routes/jurisdictions');
const summariesRouter = require('./routes/summaries');
const summaryReviewsRouter = require('./routes/summaryReviews');
const publicSummariesRouter = require('./routes/publicSummaries');
const governanceRouter = require('./routes/governance');
const dataIngestionRouter = require('./routes/dataIngestion');
const subscriptionsRouter = require('./routes/subscriptions');
const governmentDataRouter = require('./routes/governmentData');
const dataExportRouter = require('./routes/dataExport');
const accessibilityAuditRouter = require('./routes/accessibilityAudit');
const auditLogRouter = require('./routes/auditLog');
const systemHealthRouter = require('./routes/systemHealth');
const metricsEndpointRouter = require('./routes/metricsEndpoint');
const { handleMessage } = require('./ws/handler');
const { getSystemHealth } = require('./services/systemHealthAgent');
const { listPendingReview } = require('./services/coordinatorAgent');
const { listRecentActions } = require('./services/auditLogAgent');
const { hasPermission, logAccessAttempt } = require('./middleware/rbac');

const HEALTH_WS_PUSH_INTERVAL_MS = 5000;
const PENDING_APPROVALS_WS_PUSH_INTERVAL_MS = 5000;
const RECENT_ACTIONS_WS_PUSH_INTERVAL_MS = 5000;

// STORY-025/026/027: shared shape for an admin-only, key-authenticated,
// periodic-push WebSocket channel -- STORY-025's health channel was the
// first instance of this, STORY-026's pending-approvals channel the
// second copy-pasted verbatim, so it was extracted rather than becoming a
// third near-identical `if (pathname === ...)` block. `authorize` defaults
// to the original flat ADMIN_API_KEY check (health/pending-approvals pass
// nothing and get byte-for-byte the same behavior as before); STORY-027's
// recent-actions channel passes a role-aware `authorize` instead, since
// that resource is deliberately gated by the stronger data_steward role
// (see STORY-024) rather than the general admin key.
async function handleAdminPushChannel(ws, searchParams, {
  messageType, getData, intervalMs, authorize,
}) {
  const providedKey = searchParams.get('key');
  const defaultAuthorize = async (key) => Boolean(process.env.ADMIN_API_KEY) && key === process.env.ADMIN_API_KEY;
  const isAuthorized = await (authorize || defaultAuthorize)(providedKey);
  if (!isAuthorized) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  const push = async () => {
    try {
      ws.send(JSON.stringify({ type: messageType, data: await getData() }));
    } catch (err) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'detroit-voter-education',
        event: 'admin_push_channel_failed',
        message_type: messageType,
        error_class: err.constructor.name,
        error: err.message,
      }));
    }
  };

  push();
  const interval = setInterval(push, intervalMs);
  ws.on('close', () => clearInterval(interval));
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use('/api/preferences', preferencesRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/jurisdictions', jurisdictionsRouter);
app.use('/api/summaries', summariesRouter);
app.use('/api/summary-reviews', summaryReviewsRouter);
app.use('/api/public/summaries', publicSummariesRouter);
app.use('/api/governance', governanceRouter);
app.use('/api/officeholders', dataIngestionRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/government-data', governmentDataRouter);
app.use('/api/exports', dataExportRouter);
app.use('/api/accessibility-audits', accessibilityAuditRouter);
app.use('/api/audit-log', auditLogRouter);
app.use('/api/system-health', systemHealthRouter);
app.use('/metrics', metricsEndpointRouter);

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, 'client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// STORY-025/026/027: reuses this same WebSocket server for distinct
// admin-only channels, routed by req.url rather than a second
// WebSocketServer instance. Each is scoped to its own path so it never
// reaches resident-facing connections on the voter-preferences path --
// those behave exactly as before, zero change to the SET_PREFERENCES flow
// below.
wss.on('connection', (ws, req) => {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');

  if (pathname === '/admin/health') {
    handleAdminPushChannel(ws, searchParams, {
      messageType: 'HEALTH_UPDATE',
      getData: getSystemHealth,
      intervalMs: HEALTH_WS_PUSH_INTERVAL_MS,
    });
    return;
  }

  if (pathname === '/admin/pending-approvals') {
    handleAdminPushChannel(ws, searchParams, {
      messageType: 'PENDING_APPROVALS_UPDATE',
      getData: listPendingReview,
      intervalMs: PENDING_APPROVALS_WS_PUSH_INTERVAL_MS,
    });
    return;
  }

  if (pathname === '/admin/recent-actions') {
    handleAdminPushChannel(ws, searchParams, {
      messageType: 'RECENT_ACTIONS_UPDATE',
      getData: () => listRecentActions(),
      intervalMs: RECENT_ACTIONS_WS_PUSH_INTERVAL_MS,
      // STORY-024/027: this resource is gated by the data_steward role,
      // not the general admin key -- see decision-record-STORY-027.md.
      // Logs the attempt the same way requireRole() does over HTTP, so
      // WS connection attempts to the audit trail are just as observable
      // as REST ones.
      authorize: async (key) => {
        const permitted = hasPermission(key, 'audit_log:read');
        await logAccessAttempt(permitted, key, 'audit_log:read', { channel: 'ws:/admin/recent-actions' });
        return permitted;
      },
    });
    return;
  }

  ws.send(JSON.stringify({ type: 'CONNECTED' }));

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'ERROR', error: 'Invalid JSON' }));
      return;
    }
    await handleMessage(ws, wss, msg);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'detroit-voter-education',
    event: 'server_start',
    port: PORT,
  }));
});

module.exports = { app, server, wss };
