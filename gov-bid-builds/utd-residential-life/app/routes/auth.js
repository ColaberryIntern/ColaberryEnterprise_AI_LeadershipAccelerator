'use strict';
const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/login', (req, res) => {
  if (req.cookies.user_id) return res.redirect('/');
  const users = db.prepare(
    'SELECT id, name, email, role, building FROM users ORDER BY role, name'
  ).all();
  res.render('login', { title: 'Sign In', layout: 'main', users });
});

router.post('/login', (req, res) => {
  const { user_id } = req.body;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
  if (!user) return res.redirect('/login');
  res.cookie('user_id', String(user.id), { httpOnly: true, maxAge: 86_400_000 });
  res.redirect('/');
});

router.get('/logout', (req, res) => {
  res.clearCookie('user_id');
  res.redirect('/login');
});

router.post('/logout', (req, res) => {
  res.clearCookie('user_id');
  res.redirect('/login');
});

module.exports = router;
