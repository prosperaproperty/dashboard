const express = require('express');
const router = express.Router();
const { db, normalizePropertyCodes } = require('../db');

function normalizePhotosValue(value) {
  if (value === undefined || value === null) {
    return '{}';
  }

  if (typeof value === 'string') {
    try {
      JSON.parse(value);
      return value;
    } catch (error) {
      try {
        return JSON.stringify(value);
      } catch (stringifyErr) {
        return '{}';
      }
    }
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    return '{}';
  }
}

// GET /api/properties - Get all properties
router.get('/', (req, res) => {
  db.all(`
    SELECT * FROM properties
    ORDER BY id ASC
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
router.post('/', async (req, res) => {
  const allowedFields = [
    'land_size', 'building_size', 'building', 'property_name', 'bedrooms', 'bathrooms',
    'clean_kitchen', 'service_kitchen', 'electricity', 'swimming_pool',
    'garage', 'carport', 'security_post', 'furnishing', 'listing_type', 'price', 'photos'
  ];

  const requiredFields = ['land_size', 'building_size', 'building', 'bedrooms', 'bathrooms', 'price'];
  for (const field of requiredFields) {
    if (req.body[field] === undefined || req.body[field] === '') {
      return res.status(400).json({ error: `Missing required field: ${field}` });
    }
  }

  const data = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      if (field === 'photos') {
        data[field] = normalizePhotosValue(req.body[field]);
      } else if (['land_size', 'building_size', 'clean_kitchen', 'service_kitchen', 'electricity', 'swimming_pool', 'security_post', 'price'].includes(field)) {
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
     garage, carport, security_post, furnishing, listing_type, price, photos)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    data.land_size, data.building_size, data.building, data.property_name || null, data.bedrooms, data.bathrooms,
    data.clean_kitchen || 0, data.service_kitchen || 0, data.electricity || 0, data.swimming_pool || 0,
    data.garage || 0, data.carport || 0, data.security_post || 0, data.furnishing || 'None', data.listing_type || 'Sale', data.price, data.photos || '{}'
  ], async function(err) {
    stmt.finalize();
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    try {
      await normalizePropertyCodes();
      db.get('SELECT property_code, listing_type, photos FROM properties WHERE id = ?', [this.lastID], (codeErr, row) => {
        if (codeErr) {
          console.error('Error reading property code after create:', codeErr.message);
          return res.json({ id: this.lastID, listing_type: data.listing_type || 'Sale', photos: data.photos || '{}', message: 'Property created successfully' });
        }
        res.json({
          id: this.lastID,
          property_code: row && row.property_code ? row.property_code : `Pros-${this.lastID}`,
          listing_type: row && row.listing_type ? row.listing_type : (data.listing_type || 'Sale'),
          photos: row && row.photos ? row.photos : (data.photos || '{}'),
          message: 'Property created successfully'
        });
      });
    } catch (normalizeErr) {
      console.error('Error normalizing property codes after create:', normalizeErr.message);
      return res.status(500).json({ error: 'Unable to assign property code' });
    }
  });
});

// PUT /api/properties/:id - Update property
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const allowedFields = [
    'land_size', 'building_size', 'building', 'property_name', 'bedrooms', 'bathrooms',
    'clean_kitchen', 'service_kitchen', 'electricity', 'swimming_pool',
    'garage', 'carport', 'security_post', 'furnishing', 'listing_type', 'price', 'photos'
  ];

  // Reject empty updates
  if (Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'No fields provided for update' });
  }

  // Filter and sanitize input
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      if (field === 'photos') {
        updates[field] = normalizePhotosValue(req.body[field]);
      } else if (['land_size', 'building_size', 'clean_kitchen', 'service_kitchen', 'electricity', 'swimming_pool', 'security_post', 'price'].includes(field)) {
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
    db.get('SELECT photos FROM properties WHERE id = ?', [id], (photosErr, row) => {
      if (photosErr) {
        return res.json({ message: 'Property updated successfully' });
      }
      res.json({
        message: 'Property updated successfully',
        photos: row && row.photos ? row.photos : '{}'
      });
    });
  });
});

// DELETE /api/properties/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM properties WHERE id = ?', [id], async function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }

    try {
      await normalizePropertyCodes();
      res.json({ message: 'Property deleted successfully' });
    } catch (normalizeErr) {
      console.error('Error normalizing property codes after delete:', normalizeErr.message);
      res.status(500).json({ error: 'Property deleted, but code re-sequencing failed' });
    }
  });
});

module.exports = router;
