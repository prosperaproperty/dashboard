const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Database file path
const dbPath = process.env.DATABASE_URL || (process.env.NODE_ENV === 'test' ? ':memory:' : path.join(__dirname, 'property_dashboard.db'));
const db = new sqlite3.Database(dbPath);

function generatePropertyUuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `prop-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function addMissingColumns() {
  return new Promise((resolve) => {
    db.all('PRAGMA table_info(properties)', (piErr, cols) => {
      if (piErr || !Array.isArray(cols)) {
        resolve();
        return;
      }

      const columnNames = cols.map((column) => column.name);
      const pending = [];

      if (!columnNames.includes('property_code')) {
        pending.push('ALTER TABLE properties ADD COLUMN property_code TEXT');
      }
      if (!columnNames.includes('listing_type')) {
        pending.push("ALTER TABLE properties ADD COLUMN listing_type TEXT NOT NULL DEFAULT 'Sale'");
      }
      if (!columnNames.includes('photos')) {
        pending.push("ALTER TABLE properties ADD COLUMN photos TEXT DEFAULT '{}' ");
      }
      if (!columnNames.includes('property_uuid')) {
        pending.push('ALTER TABLE properties ADD COLUMN property_uuid TEXT');
      }
      if (!columnNames.includes('deleted_at')) {
        pending.push('ALTER TABLE properties ADD COLUMN deleted_at DATETIME');
      }
      if (!columnNames.includes('updated_at')) {
        pending.push('ALTER TABLE properties ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
      }

      let remaining = pending.length;
      if (!remaining) {
        resolve();
        return;
      }

      pending.forEach((sql) => {
        db.run(sql, (alterErr) => {
          if (alterErr) {
            console.error('Error altering table:', alterErr.message);
          }
          remaining -= 1;
          if (remaining === 0) {
            resolve();
          }
        });
      });
    });
  });
}

function normalizePropertyCodes() {
  return new Promise((resolve, reject) => {
    db.all('SELECT id FROM properties WHERE deleted_at IS NULL OR deleted_at = "" ORDER BY id ASC', (err, rows) => {
      if (err) {
        return reject(err);
      }

      if (!rows.length) {
        return resolve();
      }

      let remaining = rows.length;
      rows.forEach((row, index) => {
        const nextCode = `Pros-${index + 1}`;
        db.run('UPDATE properties SET property_code = ? WHERE id = ?', [nextCode, row.id], (updateErr) => {
          if (updateErr) {
            return reject(updateErr);
          }
          remaining -= 1;
          if (remaining === 0) {
            resolve();
          }
        });
      });
    });
  });
}

function initializeDatabase() {
  db.serialize(() => {
    db.run('PRAGMA foreign_keys = ON');
    db.run(`
      CREATE TABLE IF NOT EXISTS properties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        property_uuid TEXT UNIQUE,
        land_size REAL NOT NULL,
        building_size REAL NOT NULL,
        building TEXT NOT NULL,
        property_name TEXT,
        bedrooms INTEGER NOT NULL,
        bathrooms INTEGER NOT NULL,
        clean_kitchen REAL NOT NULL DEFAULT 0,
        service_kitchen REAL NOT NULL DEFAULT 0,
        electricity REAL NOT NULL DEFAULT 0,
        swimming_pool REAL NOT NULL DEFAULT 0,
        garage INTEGER NOT NULL DEFAULT 0,
        carport INTEGER NOT NULL DEFAULT 0,
        security_post REAL NOT NULL DEFAULT 0,
        furnishing TEXT NOT NULL DEFAULT 'None',
        listing_type TEXT NOT NULL DEFAULT 'Sale',
        price REAL NOT NULL,
        property_code TEXT,
        photos TEXT DEFAULT '{}',
        deleted_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('Error creating properties table:', err.message);
        return;
      }

      db.run(`
        CREATE TABLE IF NOT EXISTS rooms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          property_id INTEGER NOT NULL,
          room_type TEXT NOT NULL,
          room_number INTEGER NOT NULL,
          display_name TEXT NOT NULL,
          photo_limit INTEGER NOT NULL DEFAULT 5,
          deleted_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(property_id, room_type, room_number),
          FOREIGN KEY(property_id) REFERENCES properties(id) ON DELETE CASCADE
        )
      `, (roomErr) => {
        if (roomErr) {
          console.error('Error creating rooms table:', roomErr.message);
          return;
        }

        db.run(`
          CREATE TABLE IF NOT EXISTS photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            property_id INTEGER NOT NULL,
            room_id INTEGER,
            room_type TEXT NOT NULL,
            room_number INTEGER,
            file_name TEXT,
            mime_type TEXT DEFAULT 'image/jpeg',
            data_url TEXT NOT NULL,
            file_size INTEGER DEFAULT 0,
            uploaded_by TEXT DEFAULT 'admin',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME,
            FOREIGN KEY(property_id) REFERENCES properties(id) ON DELETE CASCADE,
            FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
          )
        `, (photoErr) => {
          if (photoErr) {
            console.error('Error creating photos table:', photoErr.message);
            return;
          }

          db.run(`
            CREATE TABLE IF NOT EXISTS users (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             username TEXT NOT NULL UNIQUE,
             password TEXT NOT NULL,
             created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `, (userErr) => {
            if (userErr) {
             console.error('Error creating users table:', userErr.message);
             return;
            }

            addMissingColumns().then(() => {
             db.all('SELECT id, property_uuid FROM properties WHERE property_uuid IS NULL OR property_uuid = ?', ['',], (uuidErr, rows) => {
               if (uuidErr) {
                 console.error('Error reading missing property UUID values:', uuidErr.message);
                 return;
               }

               rows.forEach((row) => {
                 db.run('UPDATE properties SET property_uuid = ? WHERE id = ?', [generatePropertyUuid(), row.id]);
               });
             });

             db.get('SELECT id FROM users WHERE username = ?', ['admin'], (adminErr, existingUser) => {
               if (adminErr) {
                 console.error('Error checking admin user:', adminErr.message);
                 return;
               }

               if (!existingUser) {
                 db.run('INSERT INTO users (username, password) VALUES (?, ?)', ['admin', 'Prospera'], (insertErr) => {
                   if (insertErr) {
                     console.error('Error creating default admin user:', insertErr.message);
                   }
                 });
               }
             });

             normalizePropertyCodes().catch((codeErr) => {
               console.error('Error normalizing property codes:', codeErr.message);
             });
            });
          });
        });
      });

      if (process.env.NODE_ENV !== 'test') {
        console.log('✓ Database initialized successfully');
      }

      if (process.env.NODE_ENV === 'test') return;

      const payloadPath = path.join(__dirname, 'payload.json');
      let payload = null;
      try {
        if (fs.existsSync(payloadPath)) {
          payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
        }
      } catch (e) {
        console.error('Error reading payload.json:', e.message);
      }

      if (!payload) return;

      db.get('SELECT COUNT(1) as cnt FROM properties', (err2, row) => {
        if (err2) {
          console.error('Error checking properties count:', err2.message);
          return;
        }

        if (row && row.cnt === 0) {
          const stmt = db.prepare(`
            INSERT INTO properties
            (land_size, building_size, building, property_name, bedrooms, bathrooms,
             clean_kitchen, service_kitchen, electricity, swimming_pool,
             garage, carport, security_post, furnishing, price, property_uuid)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          stmt.run([
            Number(payload.land_size || 0), Number(payload.building_size || 0), payload.building || '', payload.property_name || null,
            Number(payload.bedrooms || 0), Number(payload.bathrooms || 0), Number(payload.clean_kitchen || 0), Number(payload.service_kitchen || 0),
            Number(payload.electricity || 0), Number(payload.swimming_pool || 0), Number(payload.garage || 0), Number(payload.carport || 0),
            Number(payload.security_post || 0), payload.furnishing || 'None', Number(payload.price || 0), generatePropertyUuid()
          ], function(insertErr) {
            if (insertErr) {
             console.error('Error inserting initial payload:', insertErr.message);
            } else {
             normalizePropertyCodes().catch((codeErr) => {
               console.error('Error normalizing seeded property codes:', codeErr.message);
             });
             console.log(`✓ Inserted initial property with id ${this.lastID}`);
            }
          });

          stmt.finalize();
        }
      });
    });
  });
}

module.exports = { db, initializeDatabase, normalizePropertyCodes, generatePropertyUuid };
