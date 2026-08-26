const express = require('express');
const router = express.Router();
const { db } = require('../db');

router.get('/', (req, res) => {
  db.all('SELECT id, username FROM users ORDER BY id ASC', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  db.get('SELECT id, username FROM users WHERE username = ? AND password = ?', [String(username).trim(), String(password).trim()], (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    res.json({ valid: true, user });
  });
});

router.post('/', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const cleanUsername = String(username).trim();
  const cleanPassword = String(password).trim();

  if (!cleanUsername || !cleanPassword) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  db.get('SELECT id FROM users WHERE username = ?', [cleanUsername], (selectErr, existingUser) => {
    if (selectErr) {
      return res.status(500).json({ error: selectErr.message });
    }

    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [cleanUsername, cleanPassword], function(insertErr) {
      if (insertErr) {
        return res.status(500).json({ error: insertErr.message });
      }

      res.status(201).json({
        id: this.lastID,
        username: cleanUsername,
        message: 'User created successfully'
      });
    });
  });
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT username FROM users WHERE id = ?', [id], (findErr, user) => {
    if (findErr) {
      return res.status(500).json({ error: findErr.message });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.username === 'admin') {
      return res.status(400).json({ error: 'The admin account cannot be deleted' });
    }

    db.run('DELETE FROM users WHERE id = ?', [id], function(deleteErr) {
      if (deleteErr) {
        return res.status(500).json({ error: deleteErr.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ message: 'User deleted successfully' });
    });
  });
});

module.exports = router;
