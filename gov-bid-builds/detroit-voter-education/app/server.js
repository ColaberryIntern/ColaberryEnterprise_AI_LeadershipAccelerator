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
const { handleMessage } = require('./ws/handler');

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

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, 'client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

wss.on('connection', (ws) => {
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
