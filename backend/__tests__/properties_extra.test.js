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
     listing_type TEXT NOT NULL DEFAULT 'Sale',
     price REAL NOT NULL,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, done);
  });
});

beforeEach((done) => {
  db.serialize(() => {
    db.run('DELETE FROM properties', (err) => {
      if (err) return done(err);
      const stmt = db.prepare('INSERT INTO properties (land_size, building_size, building, property_name, bedrooms, bathrooms, listing_type, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      stmt.run([100, 80, 'House', 'Extra Test Property', 3, 2, 'Sale', 75000], function(err2) {
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

  test('POST /api/properties accepts listing type and assigns sequential Pros codes and DELETE renumbers without gaps', async () => {
    const first = await request(app).post('/api/properties').send({
      land_size: 120,
      building_size: 90,
      building: 'Apartment',
      property_name: 'Alpha',
      bedrooms: 2,
      bathrooms: 1,
      listing_type: 'Rent',
      price: 150000
    }).set('Accept', 'application/json');

    expect(first.status).toBe(200);
    expect(first.body.property_code).toBe('Pros-2');
    expect(first.body).toHaveProperty('listing_type', 'Rent');

    const second = await request(app).post('/api/properties').send({
      land_size: 130,
      building_size: 100,
      building: 'Villa',
      property_name: 'Bravo',
      bedrooms: 3,
      bathrooms: 2,
      listing_type: 'Sale',
      price: 220000
    }).set('Accept', 'application/json');

    expect(second.status).toBe(200);
    expect(second.body.property_code).toBe('Pros-3');

    const deleteRes = await request(app).delete(`/api/properties/${first.body.id}`);
    expect(deleteRes.status).toBe(200);

    const list = await request(app).get('/api/properties');
    expect(list.status).toBe(200);
    expect(list.body.map(item => item.property_code)).toEqual(['Pros-1', 'Pros-2']);
    expect(new Set(list.body.map(item => item.property_code)).size).toBe(list.body.length);
  });

  test('POST /api/properties missing required field returns 400', async () => {
    const payload = {
      land_size: 50,
      building_size: 40,
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
