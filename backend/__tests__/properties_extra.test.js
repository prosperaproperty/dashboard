const request = require('supertest');
const app = require('../server');
const { db } = require('../db');

beforeAll((done) => {
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
      stmt.run([100, 80, 'House', 'Extra Test Property', 3, 2, 75000], function(err2) {
        if (err2) return done(err2);
        global.extraTestPropertyId = this.lastID;
        stmt.finalize();
        done();
      });
    });
  });
});

afterAll((done) => {
  db.close(done);
});

describe('Properties API extra', () => {
  test('PUT /api/properties/:id updates a property', async () => {
    const id = global.extraTestPropertyId;
    const res = await request(app).put(`/api/properties/${id}`).send({ price: 88888 }).set('Accept', 'application/json');
    expect(res.status).toBe(200);
    const verify = await request(app).get(`/api/properties/${id}`);
    expect(verify.status).toBe(200);
    expect(verify.body).toHaveProperty('price', 88888);
  });

  test('POST /api/properties missing required field returns 400', async () => {
    const payload = {
      land_size: 50,
      building_size: 40,
      // missing 'building'
      property_name: 'Invalid Property',
      bedrooms: 1,
      bathrooms: 1,
      price: 10000
    };
    const res = await request(app).post('/api/properties').send(payload).set('Accept', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Missing required field/);
  });
});
