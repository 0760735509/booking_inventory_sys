const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// PostgreSQL connection pool configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * 1. CUSTOMER: Book an appointment and calculate 10% deposit
 */
app.post('/api/appointments/book', async (req, res) => {
  const { customer_id, service_id, employee_id, appointment_time } = req.body;

  try {
    const serviceQuery = await pool.query('SELECT price FROM services WHERE id = $1', [service_id]);
    if (serviceQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const totalAmount = parseFloat(serviceQuery.rows[0].price);
    const depositAmount = totalAmount * 0.10; // Exactly 10% deposit requirement

    const newAppointment = await pool.query(
      `INSERT INTO appointments 
       (customer_id, employee_id, service_id, appointment_time, total_amount, deposit_amount, status) 
       VALUES ($1, $2, $3, $4, $5, $6, 'pending_deposit') 
       RETURNING *`,
      [customer_id, employee_id, service_id, appointment_time, totalAmount, depositAmount]
    );
    
    res.status(201).json({
      message: 'Appointment reserved. Please pay the 10% deposit to confirm.',
      appointment: newAppointment.rows[0],
      payment_due: depositAmount
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error during booking' });
  }
});

/**
 * 2. ADMIN: Manage Inventory & Check Restock Levels
 */
app.get('/api/admin/inventory', async (req, res) => {
  try {
    const inventory = await pool.query('SELECT * FROM inventory');
    const needsRestock = inventory.rows.filter(item => item.quantity <= item.min_stock_threshold);

    res.json({
      inventory: inventory.rows,
      restock_alerts: needsRestock
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

/**
 * 3. ADMIN: Allocate Employee to an Appointment
 */
app.patch('/api/admin/appointments/:id/allocate', async (req, res) => {
  const { id } = req.params;
  const { employee_id } = req.body;

  try {
    const updated = await pool.query(
      'UPDATE appointments SET employee_id = $1 WHERE id = $2 RETURNING *',
      [employee_id, id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.json({ message: 'Employee successfully allocated', appointment: updated.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to allocate employee' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
