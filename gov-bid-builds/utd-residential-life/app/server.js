'use strict';
const express = require('express');
const { create } = require('express-handlebars');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

require('./db'); // run schema migrations on boot

const app = express();
const PORT = process.env.PORT || 3000;

// ── Handlebars setup ──────────────────────────────────────────────────────────
const FORM_TYPE_LABELS = {
  noise_complaint: 'Noise Complaint',
  lockout: 'Lockout',
  on_call_log: 'On-Call Log',
  roommate_agreement: 'Roommate Agreement',
  evaluation: 'Performance Evaluation',
};

const hbs = create({
  extname: '.hbs',
  helpers: {
    eq: (a, b) => a === b,
    ne: (a, b) => a !== b,
    or: (a, b) => a || b,
    add: (a, b) => (Number(a) || 0) + (Number(b) || 0),
    formatDate(d) {
      if (!d) return '—';
      return new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    },
    badgeClass(status) {
      return { open: 'secondary', in_progress: 'primary', escalated: 'danger', resolved: 'success' }[status] || 'secondary';
    },
    statusLabel(status) {
      return { open: 'Open', in_progress: 'In Progress', escalated: 'Escalated', resolved: 'Resolved' }[status] || status;
    },
    formTypeLabel(type) {
      return FORM_TYPE_LABELS[type] || type;
    },
    formTypeIcon(type) {
      return {
        noise_complaint: 'bi-volume-up',
        lockout: 'bi-lock',
        on_call_log: 'bi-journal-text',
        roommate_agreement: 'bi-people',
        evaluation: 'bi-star',
      }[type] || 'bi-file-earmark-text';
    },
    titleCase(str) {
      return String(str).replace(/\b\w/g, c => c.toUpperCase());
    },
    roleLabel(role) {
      return {
        student_staff: 'Student Staff',
        community_coordinator: 'Community Coordinator',
        residence_director: 'Residence Director',
        admin: 'Admin',
      }[role] || role;
    },
  },
});

app.engine('.hbs', hbs.engine);
app.set('view engine', '.hbs');
app.set('views', path.join(__dirname, 'views'));

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const uploadDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    cb(null, /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype));
  },
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/dashboard'));
app.use('/reports', require('./routes/reports')(upload));
app.use('/schedule', require('./routes/schedule'));
app.use('/proposals', require('./routes/proposals'));
app.use('/evaluations', require('./routes/evaluations'));
app.use('/communications', require('./routes/communications'));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`UTD Residential Life  →  http://localhost:${PORT}`);
  console.log(`  Sign in with any seeded user (run "npm run seed" first if empty)`);
});
