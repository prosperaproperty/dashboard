const request = require('supertest');
const app = require('../server');
const { db } = require('../db');

beforeAll((done) => {
  // Ensure properties table exists (initializeDatabase also runs on server require)
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS properties (
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, done);
  });
});

beforeEach((done) => {
  db.serialize(() => {
    db.run('DELETE FROM properties', (err) => {
      if (err) return done(err);
      const stmt = db.prepare('INSERT INTO properties (land_size, building_size, building, property_name, bedrooms, bathrooms, price) VALUES (?, ?, ?, ?, ?, ?, ?)');
      stmt.run([100, 80, 'House', 'Test Property', 3, 2, 50000], function(err2) {
        if (err2) return done(err2);
        global.testPropertyId = this.lastID;
        stmt.finalize();
        done();
      });
    });
  });
});

afterAll((done) => {
  db.close(done);
});

describe('Properties API', () => {
  test('GET /api/properties returns properties', async () => {
    const res = await request(app).get('/api/properties');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toHaveProperty('property_name', 'Test Property');
  });

  test('POST /api/properties creates a property', async () => {
    const payload = {
      land_size: 200,
      building_size: 150,
      building: 'Apartment',
      property_name: 'New Property',
      bedrooms: 2,
      bathrooms: 1,
      price: 100000
    };
    const res = await request(app).post('/api/properties').send(payload).set('Accept', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    const id = res.body.id;
    const verify = await request(app).get(`/api/properties/${id}`);
    expect(verify.status).toBe(200);
    expect(verify.body).toHaveProperty('property_name', 'New Property');
  });

  test('DELETE /api/properties/:id deletes a property', async () => {
    const id = global.testPropertyId;
    const res = await request(app).delete(`/api/properties/${id}`);
    expect(res.status).toBe(200);
    const verify = await request(app).get(`/api/properties/${id}`);
    expect(verify.status).toBe(404);
  });
});
