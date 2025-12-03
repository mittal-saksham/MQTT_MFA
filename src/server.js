import express from 'express';
import cors from 'cors';
import authFilter from './auth/cuckooFilter.js';
import mfaService from './auth/mfaService.js';
import heartbeatMonitor from './heartbeat/monitor.js';
import mqttServer from './mqtt/mqttSever.js';
import 'dotenv/config';

const app = express();
const PORT = process.env.SERVER_PORT || 0;

// Middleware
app.use(cors());
app.use(express.json());

// Start MQTT server
mqttServer.start();

// Device registration endpoint
app.post('/api/devices/register', (req, res) => {
  const { deviceId, secret, metadata } = req.body;
  
  if (!deviceId || !secret) {
    return res.status(400).json({ error: 'Device ID and secret are required' });
  }
  
  const success = authFilter.registerDevice(deviceId, secret, metadata);
  
  if (success) {
    return res.status(201).json({ success: true, deviceId });
  } else {
    return res.status(500).json({ error: 'Failed to register device' });
  }
});

// Step 1: Initiate authentication
app.post('/api/auth/initiate', (req, res) => {
  const { deviceId } = req.body;
  
  if (!deviceId) {
    return res.status(400).json({ error: 'Device ID is required' });
  }
  
  const sessionId = mfaService.initiateAuthentication(deviceId);
  
  res.json({ success: true, sessionId });
});

// Step 2: Validate credentials (Factor 1)
app.post('/api/auth/validate-credentials', async (req, res) => {
  const { sessionId, secret } = req.body;
  
  if (!sessionId || !secret) {
    return res.status(400).json({ error: 'Session ID and secret are required' });
  }
  
  try {
    const result = await mfaService.validateCredentials(sessionId, secret);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Step 3: Validate OTK (Factor 2)
app.post('/api/auth/validate-otk', (req, res) => {
  const { sessionId, otk } = req.body;
  
  if (!sessionId || !otk) {
    return res.status(400).json({ error: 'Session ID and OTK are required' });
  }
  
  const result = mfaService.validateOTK(sessionId, otk);
  
  if (result.success) {
    const deviceId = mfaService.getDeviceIdFromSession(sessionId);
    mqttServer.registerDeviceSession(deviceId, result.sessionKey);
  }
  
  res.json(result);
});

// Get device status
app.get('/api/devices/:deviceId/status', (req, res) => {
  const { deviceId } = req.params;
  const status = heartbeatMonitor.getDeviceStatus(deviceId);
  
  res.json(status);
});

// [NEW] Key Exchange Endpoint
// Allows authorized devices to fetch the encryption key of a publisher they want to subscribe to
app.get('/api/devices/:targetId/key', (req, res) => {
  const { targetId } = req.params;
  
  const targetKey = mqttServer.getSessionKey(targetId);
  
  if (targetKey) {
    res.json({ success: true, key: targetKey });
  } else {
    res.status(404).json({ error: 'Target device not found or not authenticated' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
export default app;