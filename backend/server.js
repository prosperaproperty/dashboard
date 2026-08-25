const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { initializeDatabase } = require('./db');
const propertyRoutes = require('./routes/properties');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:5500',
  'http://localhost:8080',
  'http://127.0.0.1:3000'
]);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., file:// pages, curl, Postman)
    if (!origin || origin === 'null') {
      return callback(null, true);
    }

    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize database
initializeDatabase();

// Routes
app.use('/api/properties', propertyRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ 
    message: 'Property Dashboard API ✓',
    status: 'running',
    port: PORT 
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Database: property_dashboard.db`);
  });
}

module.exports = app;
