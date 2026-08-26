const express = require('express');
const router = express.Router();
const { db, normalizePropertyCodes, generatePropertyUuid } = require('../db');

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

function roomKeyFromRoomType(roomType, roomNumber) {
  if (roomType === 'electricity') {
    return 'electricity';
  }
  return `${roomType}-${roomNumber}`;
}

function parseRoomKey(roomKey) {
  if (!roomKey || roomKey === 'electricity') {
    return { roomType: 'electricity', roomNumber: 1 };
  }

  const match = roomKey.match(/^(.+)-?(\d+)$/);
  if (!match) {
    return null;
  }

  const [, rawType, rawNumber] = match;
  return {
    roomType: rawType,
    roomNumber: Number(rawNumber)
  };
}

function getDesiredRoomList(data) {
  const desired = [];
  const roomTypes = [
    { key: 'bedrooms', label: 'Bedroom' },
    { key: 'bathrooms', label: 'Bathroom' },
    { key: 'clean_kitchen', label: 'Clean Kitchen' },
    { key: 'service_kitchen', label: 'Service Kitchen' }
  ];

  roomTypes.forEach(({ key, label }) => {
    const count = Math.max(0, Number(data[key] || 0));
    for (let idx = 1; idx <= count; idx += 1) {
     desired.push({
       room_type: key,
       room_number: idx,
       display_name: `${label} ${idx}`,
       photo_limit: 5
     });
    }
  });

  if (Number(data.electricity || 0) > 0) {
    desired.push({
     room_type: 'electricity',
     room_number: 1,
     display_name: 'Electricity',
     photo_limit: 5
    });
  }

  return desired;
}

function ensureRoomsForProperty(propertyId, data) {
  return new Promise((resolve, reject) => {
    const desiredRooms = getDesiredRoomList(data);
    const desiredMap = new Map(desiredRooms.map((room) => [`${room.room_type}:${room.room_number}`, room]));

    db.all('SELECT * FROM rooms WHERE property_id = ? AND (deleted_at IS NULL OR deleted_at = "") ORDER BY room_type, room_number', [propertyId], (roomErr, existingRows) => {
     if (roomErr) {
       return reject(roomErr);
     }

     const existingMap = new Map((existingRows || []).map((row) => [`${row.room_type}:${row.room_number}`, row]));
     const tasks = [];

     (existingRows || []).forEach((room) => {
       const key = `${room.room_type}:${room.room_number}`;
       if (!desiredMap.has(key)) {
         tasks.push(new Promise((innerResolve, innerReject) => {
           db.run('DELETE FROM photos WHERE property_id = ? AND room_id = ?', [propertyId, room.id], (photoErr) => {
             if (photoErr) {
               return innerReject(photoErr);
             }
             db.run('DELETE FROM rooms WHERE id = ?', [room.id], (deleteErr) => {
               if (deleteErr) {
                 return innerReject(deleteErr);
               }
               innerResolve();
             });
           });
         }));
       }
     });

     desiredRooms.forEach((room) => {
       const key = `${room.room_type}:${room.room_number}`;
       if (existingMap.has(key)) {
         tasks.push(new Promise((innerResolve, innerReject) => {
           db.run(
             'UPDATE rooms SET display_name = ?, photo_limit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
             [room.display_name, room.photo_limit, existingMap.get(key).id],
             (updateErr) => {
               if (updateErr) {
                 return innerReject(updateErr);
               }
               innerResolve();
             }
           );
         }));
         return;
       }

       tasks.push(new Promise((innerResolve, innerReject) => {
         db.run(
           'INSERT INTO rooms (property_id, room_type, room_number, display_name, photo_limit) VALUES (?, ?, ?, ?, ?)',
           [propertyId, room.room_type, room.room_number, room.display_name, room.photo_limit],
           (insertErr) => {
             if (insertErr) {
               return innerReject(insertErr);
             }
             innerResolve();
           }
         );
       }));
     });

     Promise.all(tasks)
       .then(() => resolve())
       .catch(reject);
    });
  });
}

function saveRoomPhotosForProperty(propertyId, photosState) {
  return new Promise((resolve, reject) => {
    if (!propertyId || !photosState || typeof photosState !== 'object') {
     resolve();
     return;
    }

    db.run('DELETE FROM photos WHERE property_id = ?', [propertyId], async (deleteErr) => {
     if (deleteErr) {
       return reject(deleteErr);
     }

     try {
       const photoEntries = [];
       for (const [roomKey, list] of Object.entries(photosState)) {
         const photoList = Array.isArray(list) ? list : [];
         const roomData = roomKey === 'electricity' ? { roomType: 'electricity', roomNumber: 1 } : parseRoomKey(roomKey);
         if (!roomData || !roomData.roomType || !Number.isFinite(roomData.roomNumber)) {
           continue;
         }

         const roomRow = await new Promise((innerResolve, innerReject) => {
           db.get(
             'SELECT id FROM rooms WHERE property_id = ? AND room_type = ? AND room_number = ? AND (deleted_at IS NULL OR deleted_at = "")',
             [propertyId, roomData.roomType, roomData.roomNumber],
             (roomErr, row) => {
               if (roomErr) return innerReject(roomErr);
               innerResolve(row);
             }
           );
         });

         photoList.forEach((photoUrl, index) => {
           if (!photoUrl || typeof photoUrl !== 'string') {
             return;
           }
           const fileName = `${roomData.roomType}-${roomData.roomNumber}-${index + 1}.jpg`;
           photoEntries.push([
             propertyId,
             roomRow ? roomRow.id : null,
             roomData.roomType,
             roomData.roomNumber,
             fileName,
             'image/jpeg',
             photoUrl,
             Math.min(10 * 1024 * 1024, String(photoUrl).length),
             'admin'
           ]);
         });
       }

       if (!photoEntries.length) {
         resolve();
         return;
       }

       const insertQueue = photoEntries.map((entry) => new Promise((innerResolve, innerReject) => {
         db.run(
           'INSERT INTO photos (property_id, room_id, room_type, room_number, file_name, mime_type, data_url, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
           entry,
           (insertErr) => {
             if (insertErr) return innerReject(insertErr);
             innerResolve();
           }
         );
       }));

       await Promise.all(insertQueue);
       resolve();
     } catch (saveErr) {
       reject(saveErr);
     }
    });
  });
}

function enrichPropertyRow(row) {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, property_id, room_type, room_number, display_name, photo_limit FROM rooms WHERE property_id = ? AND (deleted_at IS NULL OR deleted_at = "") ORDER BY room_type, room_number', [row.id], (roomErr, rooms) => {
     if (roomErr) {
       return reject(roomErr);
     }

     db.all('SELECT room_type, room_number, data_url FROM photos WHERE property_id = ? AND (deleted_at IS NULL OR deleted_at = "") ORDER BY created_at ASC', [row.id], (photoErr, photoRows) => {
       if (photoErr) {
         return reject(photoErr);
       }

       const photoMap = {};
       (photoRows || []).forEach((photo) => {
         const key = roomKeyFromRoomType(photo.room_type, photo.room_number);
         if (!photoMap[key]) {
           photoMap[key] = [];
         }
         photoMap[key].push(photo.data_url);
       });

       resolve({
         ...row,
         property_uuid: row.property_uuid || null,
         rooms: rooms || [],
         photos: photoMap
       });
     });
    });
  });
}

// GET /api/properties - Get all properties
router.get('/', (req, res) => {
  db.all(`
    SELECT * FROM properties
    WHERE deleted_at IS NULL OR deleted_at = ''
    ORDER BY id ASC
  `, async (err, rows) => {
    if (err) {
     return res.status(500).json({ error: err.message });
    }

    try {
     const properties = await Promise.all((rows || []).map(enrichPropertyRow));
     res.json(properties);
    } catch (enrichErr) {
     res.status(500).json({ error: enrichErr.message });
    }
  });
});

// GET /api/properties/:id
router.get('/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM properties WHERE id = ? AND (deleted_at IS NULL OR deleted_at = "")', [id], async (err, row) => {
    if (err) {
     return res.status(500).json({ error: err.message });
    }
    if (!row) {
     return res.status(404).json({ error: 'Property not found' });
    }

    try {
     const property = await enrichPropertyRow(row);
     res.json(property);
    } catch (enrichErr) {
     res.status(500).json({ error: enrichErr.message });
    }
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

  const propertyUuid = generatePropertyUuid();
  const stmt = db.prepare(`
    INSERT INTO properties
    (property_uuid, land_size, building_size, building, property_name, bedrooms, bathrooms,
     clean_kitchen, service_kitchen, electricity, swimming_pool,
     garage, carport, security_post, furnishing, listing_type, price, photos)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    propertyUuid,
    data.land_size, data.building_size, data.building, data.property_name || null, data.bedrooms, data.bathrooms,
    data.clean_kitchen || 0, data.service_kitchen || 0, data.electricity || 0, data.swimming_pool || 0,
    data.garage || 0, data.carport || 0, data.security_post || 0, data.furnishing || 'None', data.listing_type || 'Sale', data.price, data.photos || '{}'
  ], async function(err) {
    stmt.finalize();
    if (err) {
     return res.status(500).json({ error: err.message });
    }

    try {
     await ensureRoomsForProperty(this.lastID, data);
     if (data.photos && typeof data.photos === 'string') {
       try {
         const parsed = JSON.parse(data.photos);
         await saveRoomPhotosForProperty(this.lastID, parsed);
       } catch (parseErr) {
         console.warn('Unable to parse saved photos payload:', parseErr.message);
       }
     }
     await normalizePropertyCodes();
     const row = await new Promise((resolve, reject) => {
       db.get('SELECT property_code, listing_type, photos, property_uuid FROM properties WHERE id = ?', [this.lastID], (codeErr, propertyRow) => {
         if (codeErr) return reject(codeErr);
         resolve(propertyRow);
       });
     });

     res.json({
       id: this.lastID,
       property_uuid: row && row.property_uuid ? row.property_uuid : propertyUuid,
       property_code: row && row.property_code ? row.property_code : `Pros-${this.lastID}`,
       listing_type: row && row.listing_type ? row.listing_type : (data.listing_type || 'Sale'),
       photos: row && row.photos ? row.photos : (data.photos || '{}'),
       message: 'Property created successfully'
     });
    } catch (createErr) {
     console.error('Error creating property rooms/photos:', createErr.message);
     return res.status(500).json({ error: 'Unable to create property rooms and files' });
    }
  });
});

// PUT /api/properties/:id - Update property
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const allowedFields = [
    'land_size', 'building_size', 'building', 'property_name', 'bedrooms', 'bathrooms',
    'clean_kitchen', 'service_kitchen', 'electricity', 'swimming_pool',
    'garage', 'carport', 'security_post', 'furnishing', 'listing_type', 'price', 'photos'
  ];

  if (Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'No fields provided for update' });
  }

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

  const fields = Object.keys(updates).map((key) => `${key} = ?`).join(', ');
  const values = [...Object.values(updates), id];

  try {
    db.run(`UPDATE properties SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values, async function(err) {
     if (err) {
       return res.status(500).json({ error: err.message });
     }
     if (this.changes === 0) {
       return res.status(404).json({ error: 'Property not found' });
     }

     try {
       await ensureRoomsForProperty(id, updates);
       if (updates.photos) {
         let parsedPhotos = {};
         try {
           parsedPhotos = typeof updates.photos === 'string' ? JSON.parse(updates.photos) : updates.photos;
         } catch (parseErr) {
           console.warn('Unable to parse updated photos:', parseErr.message);
         }
         await saveRoomPhotosForProperty(id, parsedPhotos);
       }

       db.get('SELECT property_uuid, property_code, photos FROM properties WHERE id = ?', [id], (photosErr, row) => {
         if (photosErr) {
           return res.json({ message: 'Property updated successfully' });
         }
         res.json({
           message: 'Property updated successfully',
           property_uuid: row && row.property_uuid ? row.property_uuid : null,
           property_code: row && row.property_code ? row.property_code : null,
           photos: row && row.photos ? row.photos : '{}'
         });
       });
     } catch (roomErr) {
       console.error('Error syncing property room/photo records:', roomErr.message);
       res.status(500).json({ error: 'Unable to sync room and photo records' });
     }
    });
  } catch (outerErr) {
    res.status(500).json({ error: outerErr.message });
  }
});

// DELETE /api/properties/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  db.run('UPDATE properties SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND (deleted_at IS NULL OR deleted_at = "")', [id], async function(err) {
    if (err) {
     return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
     return res.status(404).json({ error: 'Property not found' });
    }

    db.run('UPDATE rooms SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE property_id = ?', [id], (roomErr) => {
     if (roomErr) {
       console.error('Error soft deleting rooms:', roomErr.message);
     }
    });

    db.run('UPDATE photos SET deleted_at = CURRENT_TIMESTAMP WHERE property_id = ?', [id], (photoErr) => {
     if (photoErr) {
       console.error('Error soft deleting photos:', photoErr.message);
     }
    });

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
