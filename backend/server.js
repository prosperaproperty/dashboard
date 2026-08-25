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
app.use(cors({
  origin: true,
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
