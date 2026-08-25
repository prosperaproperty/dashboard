const express = require('express');
const router = express.Router();
const { db } = require('../db');

// GET /api/properties - Get all properties
router.get('/', (req, res) => {
  db.all(`
    SELECT * FROM properties 
    ORDER BY created_at DESC
  `, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// GET /api/properties/:id
router.get('/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM properties WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Property not found' });
    }
    res.json(row);
  });
});

// POST /api/properties - Create new property
router.post('/', (req, res) => {
  const allowedFields = [
    'land_size', 'building_size', 'building', 'property_name', 'bedrooms', 'bathrooms',
    'clean_kitchen', 'service_kitchen', 'electricity', 'swimming_pool',
    'garage', 'carport', 'security_post', 'furnishing', 'price'
  ];

  // Validate required fields
  const requiredFields = ['land_size', 'building_size', 'building', 'bedrooms', 'bathrooms', 'price'];
  for (const field of requiredFields) {
    if (req.body[field] === undefined || req.body[field] === '') {
      return res.status(400).json({ error: `Missing required field: ${field}` });
    }
  }

  // Filter and sanitize input
  const data = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      if (['land_size', 'building_size', 'clean_kitchen', 'service_kitchen', 'electricity', 'swimming_pool', 'security_post', 'price'].includes(field)) {
        data[field] = Number(req.body[field]);
        if (isNaN(data[field])) {
          return res.status(400).json({ error: `Invalid numeric value for ${field}` });
        }
      } else if (['bedrooms', 'bathrooms', 'garage', 'carport'].includes(field)) {
        data[field] = Math.max(0, Number(req.body[field]));
      } else {
        data[field] = req.body[field];
      }
    }
  }

  const stmt = db.prepare(`
    INSERT INTO properties 
    (land_size, building_size, building, property_name, bedrooms, bathrooms,
     clean_kitchen, service_kitchen, electricity, swimming_pool,
     garage, carport, security_post, furnishing, price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    data.land_size, data.building_size, data.building, data.property_name || null, data.bedrooms, data.bathrooms,
    data.clean_kitchen || 0, data.service_kitchen || 0, data.electricity || 0, data.swimming_pool || 0,
    data.garage || 0, data.carport || 0, data.security_post || 0, data.furnishing || 'None', data.price
  ], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    // Generate property_code after insert: P + YYYYMMDD + zero-padded id
    try {
      const date = new Date().toISOString().slice(0,10).replace(/-/g, '');
      const code = `P${date}${String(this.lastID).padStart(4, '0')}`;
      db.run('UPDATE properties SET property_code = ? WHERE id = ?', [code, this.lastID], (updErr) => {
        if (updErr) {
          console.error('Error setting property_code:', updErr.message);
          // Still respond with id even if property_code update failed
          return res.json({ id: this.lastID, message: 'Property created (property_code update failed)' });
        }
        res.json({ id: this.lastID, property_code: code, message: 'Property created successfully' });
      });
    } catch (e) {
      // Fallback: respond with id
      res.json({ id: this.lastID, message: 'Property created successfully' });
    }
  });
  stmt.finalize();
});

// PUT /api/properties/:id - Update property
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const allowedFields = [
    'land_size', 'building_size', 'building', 'property_name', 'bedrooms', 'bathrooms',
    'clean_kitchen', 'service_kitchen', 'electricity', 'swimming_pool',
    'garage', 'carport', 'security_post', 'furnishing', 'price'
  ];

  // Reject empty updates
  if (Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'No fields provided for update' });
  }

  // Filter and sanitize input
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      if (['land_size', 'building_size', 'clean_kitchen', 'service_kitchen', 'electricity', 'swimming_pool', 'security_post', 'price'].includes(field)) {
        const num = Number(req.body[field]);
        if (isNaN(num)) {
          return res.status(400).json({ error: `Invalid numeric value for ${field}` });
        }
        updates[field] = num;
      } else if (['bedrooms', 'bathrooms', 'garage', 'carport'].includes(field)) {
        updates[field] = Math.max(0, Number(req.body[field]));
      } else {
        updates[field] = req.body[field];
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields provided for update' });
  }

  const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
  const values = [...Object.values(updates), id];

  db.run(`
    UPDATE properties 
    SET ${fields} 
    WHERE id = ?
  `, values, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }
    res.json({ message: 'Property updated successfully' });
  });
});

// DELETE /api/properties/:id
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM properties WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }
    res.json({ message: 'Property deleted successfully' });
  });
});

module.exports = router;
