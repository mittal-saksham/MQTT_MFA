import axios from 'axios';
import SecureMqttClient from '../mqtt/mqttClient.js';

class DeviceSimulator {
  constructor(deviceId, secret, serverUrl = 'http://localhost:3000') {
    this.deviceId = deviceId;
    this.secret = secret;
    this.serverUrl = serverUrl;
    this.mqttClient = null;
    this.sessionKey = null;
  }

  async register() {
    try {
      const response = await axios.post(`${this.serverUrl}/api/devices/register`, {
        deviceId: this.deviceId,
        secret: this.secret,
        metadata: {
          type: 'simulator',
          createdAt: new Date().toISOString()
        }
      });
      
      console.log('Device registered:', response.data);
      return response.data;
    } catch (error) {
      console.error('Registration failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async authenticate() {
    console.log('\x1b[34m🏁 Starting Authentication Handshake...\x1b[0m');
    const startTime = Date.now(); // [START TIMER]
    try {
      // Step 1: Initiate authentication
      const initResponse = await axios.post(`${this.serverUrl}/api/auth/initiate`, {
        deviceId: this.deviceId
      });
      
      const { sessionId } = initResponse.data;
      console.log('Authentication initiated with session:', sessionId);
      
      // Step 2: Validate credentials (Factor 1)
      const credResponse = await axios.post(`${this.serverUrl}/api/auth/validate-credentials`, {
        sessionId,
        secret: this.secret
      });
      
      if (!credResponse.data.success) {
        throw new Error('Credential validation failed');
      }
      
      const { otk } = credResponse.data;
      console.log('Credentials validated, received OTK');
      
      // Step 3: Validate OTK (Factor 2)
      const otkResponse = await axios.post(`${this.serverUrl}/api/auth/validate-otk`, {
        sessionId,
        otk
      });
      
      if (!otkResponse.data.success) {
        throw new Error('OTK validation failed');
      }
      
      console.log('Authentication successful!');
      this.sessionKey = otkResponse.data.sessionKey;

      this.sessionExpiry=Date.now()+(4*60*1000); //session valid for 4 minutes

      const totalTime = Date.now() - startTime; // [STOP TIMER]
      console.log(`\x1b[32m✅ Auth Complete in: ${totalTime}ms\x1b[0m`);

      return otkResponse.data;
    } catch (error) {
      console.error('Authentication failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async connectMqtt() {
    if (!this.sessionKey) {
      throw new Error('Must authenticate before connecting to MQTT');
    }
    
    this.mqttClient = new SecureMqttClient(this.deviceId, this.sessionKey);
    await this.mqttClient.connect();
    
    // Subscribe to device-specific topics
    await this.mqttClient.subscribe(`device/${this.deviceId}/commands`);
    
    console.log('Connected to MQTT broker with secure session');
  }

  async publishData(data) {
    if (!this.mqttClient) {
      throw new Error('MQTT client not connected');
    }

    // [NEW] Check if session is about to expire
    if (Date.now() > this.sessionExpiry) {
        console.log('\n\x1b[33m⚠️ Session expired! Re-authenticating...\x1b[0m');
        
        // 1. Run the full auth flow again (Get new SessionID -> OTK -> Key)
        await this.authenticate();
        
        // 2. Update the running MQTT client with the new key
        this.mqttClient.updateSessionKey(this.sessionKey);
        
        console.log('\x1b[32m✅ Re-authentication complete. Resuming data...\x1b[0m');
    }
    
    const topic = `device/${this.deviceId}/data`;
    return this.mqttClient.publish(topic, data);
  }

  disconnect() {
    if (this.mqttClient) {
      this.mqttClient.disconnect();
      this.mqttClient = null;
    }
  }
}

export default DeviceSimulator;
