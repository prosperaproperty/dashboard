const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path
const dbPath = process.env.DATABASE_URL || (process.env.NODE_ENV === 'test' ? ':memory:' : path.join(__dirname, 'property_dashboard.db'));
const db = new sqlite3.Database(dbPath);

const fs = require('fs');

function initializeDatabase() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS properties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        price REAL NOT NULL,
        property_code TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('Error creating table:', err.message);
        return;
      }

      // Ensure property_code column exists for older databases (safe to run repeatedly)
      db.all("PRAGMA table_info(properties)", (piErr, cols) => {
        if (!piErr && Array.isArray(cols) && !cols.find(c => c.name === 'property_code')) {
          db.run("ALTER TABLE properties ADD COLUMN property_code TEXT", (alterErr) => {
            if (alterErr) console.error('Error adding property_code column:', alterErr.message);
          });
        }
      });

      console.log('✓ Database initialized successfully');

      // Don't auto-seed during tests to avoid async logging after test runner finishes
      if (process.env.NODE_ENV === 'test') return;

      // Seed initial data from payload.json if table is empty
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
             garage, carport, security_post, furnishing, price)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          stmt.run([
            Number(payload.land_size || 0), Number(payload.building_size || 0), payload.building || '', payload.property_name || null,
            Number(payload.bedrooms || 0), Number(payload.bathrooms || 0), Number(payload.clean_kitchen || 0), Number(payload.service_kitchen || 0),
            Number(payload.electricity || 0), Number(payload.swimming_pool || 0), Number(payload.garage || 0), Number(payload.carport || 0),
            Number(payload.security_post || 0), payload.furnishing || 'None', Number(payload.price || 0)
          ], function(insertErr) {
            if (insertErr) {
              console.error('Error inserting initial payload:', insertErr.message);
            } else {
              // After insert, set property_code to P + YYYYMMDD + zero-padded id (e.g., P20260825-0001)
              const date = new Date().toISOString().slice(0,10).replace(/-/g, '');
              const code = `P${date}${String(this.lastID).padStart(4, '0')}`;
              db.run('UPDATE properties SET property_code = ? WHERE id = ?', [code, this.lastID], (updErr) => {
                if (updErr) console.error('Error setting property_code for seed:', updErr.message);
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

module.exports = { db, initializeDatabase };
