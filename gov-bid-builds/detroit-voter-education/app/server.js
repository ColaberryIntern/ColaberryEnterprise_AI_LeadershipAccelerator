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

const HEALTH_WS_PUSH_INTERVAL_MS = 5000;

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

// STORY-025: reuses this same WebSocket server for a distinct admin-only
// health channel, routed by req.url rather than a second WebSocketServer
// instance. Scoped to its own path so it never reaches resident-facing
// connections on the voter-preferences path -- those behave exactly as
// before, zero change to the SET_PREFERENCES flow below.
wss.on('connection', (ws, req) => {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');

  if (pathname === '/admin/health') {
    const providedKey = searchParams.get('key');
    if (!process.env.ADMIN_API_KEY || providedKey !== process.env.ADMIN_API_KEY) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const pushHealth = async () => {
      try {
        ws.send(JSON.stringify({ type: 'HEALTH_UPDATE', health: await getSystemHealth() }));
      } catch (err) {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          service: 'detroit-voter-education',
          event: 'health_ws_push_failed',
          error_class: err.constructor.name,
          error: err.message,
        }));
      }
    };

    pushHealth();
    const interval = setInterval(pushHealth, HEALTH_WS_PUSH_INTERVAL_MS);
    ws.on('close', () => clearInterval(interval));
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
