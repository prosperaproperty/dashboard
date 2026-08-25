const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'property_dashboard.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open DB:', err.message);
    process.exit(1);
  }
});

function ensureColumn(cb) {
  db.all("PRAGMA table_info(properties)", (err, cols) => {
    if (err) return cb(err);
    const has = cols.find(c => c.name === 'property_code');
    if (!has) {
      db.run("ALTER TABLE properties ADD COLUMN property_code TEXT", (alterErr) => cb(alterErr));
    } else cb(null);
  });
}

function backfill(cb) {
  db.all("SELECT id, created_at FROM properties WHERE property_code IS NULL OR property_code = ''", (err, rows) => {
    if (err) return cb(err);
    if (!rows || rows.length === 0) return cb(null, 0);

    let updated = 0;
    const tasks = rows.map(r => new Promise((resolve) => {
      // created_at expected like 'YYYY-MM-DD HH:MM:SS'
      const datePart = (r.created_at || new Date().toISOString()).toString().slice(0,10).replace(/-/g,'');
      const code = `P${datePart}${String(r.id).padStart(4,'0')}`;
      db.run('UPDATE properties SET property_code = ? WHERE id = ?', [code, r.id], function(uErr) {
        if (uErr) console.error('Failed to update id', r.id, uErr.message);
        else updated++;
        resolve();
      });
    }));

    Promise.all(tasks).then(() => cb(null, updated));
  });
}

ensureColumn((err) => {
  if (err) {
    console.error('Error ensuring column:', err.message);
    process.exit(1);
  }
  backfill((bErr, count) => {
    if (bErr) {
      console.error('Backfill error:', bErr.message);
      process.exit(1);
    }
    console.log(`Backfilled property_code for ${count} rows`);
    db.close(() => process.exit(0));
  });
});
