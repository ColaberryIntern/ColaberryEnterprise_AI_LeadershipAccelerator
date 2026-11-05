'use strict';
const db = require('../db');

module.exports = function requireAuth(req, res, next) {
  const userId = req.cookies.user_id;
  if (!userId) return res.redirect('/login');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(userId));
  if (!user) {
    res.clearCookie('user_id');
    return res.redirect('/login');
  }
  req.user = user;
  res.locals.user = user;
  next();
};
