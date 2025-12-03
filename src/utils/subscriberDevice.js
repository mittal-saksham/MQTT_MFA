// src/utils/subscriberDevice.js
import axios from 'axios';
import SecureMqttSubscriber from '../mqtt/mqttSubscriber.js';

class SubscriberDevice {
  constructor(deviceId, secret, serverUrl = 'http://localhost:3000') {
    this.deviceId = deviceId;
    this.secret = secret;
    this.serverUrl = serverUrl;
    this.mqttClient = null;
    this.sessionKey = null;
    this.messageHandler = null;
  }

  async register() {
    try {
      const response = await axios.post(`${this.serverUrl}/api/devices/register`, {
        deviceId: this.deviceId,
        secret: this.secret,
        metadata: {
          type: 'subscriber',
          createdAt: new Date().toISOString()
        }
      });
      
      console.log('\n\x1b[36mSubscriber device registered:\x1b[0m', response.data);
      return response.data;
    } catch (error) {
      console.error('\x1b[31mSubscriber registration failed:\x1b[0m', error.response?.data || error.message);
      throw error;
    }
  }

  async authenticate() {
    try {
      // Step 1: Initiate authentication
      const initResponse = await axios.post(`${this.serverUrl}/api/auth/initiate`, {
        deviceId: this.deviceId
      });
      
      const { sessionId } = initResponse.data;
      console.log('\n\x1b[36mSubscriber authentication initiated with session:\x1b[0m', sessionId);
      
      // Step 2: Validate credentials (Factor 1)
      const credResponse = await axios.post(`${this.serverUrl}/api/auth/validate-credentials`, {
        sessionId,
        secret: this.secret
      });
      
      if (!credResponse.data.success) {
        throw new Error('Subscriber credential validation failed');
      }
      
      const { otk } = credResponse.data;
      console.log('\x1b[36mSubscriber credentials validated, received OTK\x1b[0m');
      
      // Step 3: Validate OTK (Factor 2)
      const otkResponse = await axios.post(`${this.serverUrl}/api/auth/validate-otk`, {
        sessionId,
        otk
      });
      
      if (!otkResponse.data.success) {
        throw new Error('Subscriber OTK validation failed');
      }
      
      console.log('\x1b[36mSubscriber authentication successful!\x1b[0m');
      this.sessionKey = otkResponse.data.sessionKey;
    
      return otkResponse.data;
    } catch (error) {
      console.error('\x1b[31mSubscriber authentication failed:\x1b[0m', error.response?.data || error.message);
      throw error;
    }
  }

  async connectMqtt() {
    if (!this.sessionKey) {
      throw new Error('Must authenticate before connecting to MQTT');
    }
    
    this.mqttClient = new SecureMqttSubscriber(this.deviceId, this.sessionKey);
    await this.mqttClient.connect();
    
    // Set message handler if one was provided
    if (this.messageHandler) {
      this.mqttClient.setMessageHandler(this.messageHandler);
    }
    
    console.log('\x1b[36mSubscriber connected to MQTT broker with secure session\x1b[0m\n');
  }

  async subscribeToDevice(publisherDeviceId) {
    if (!this.mqttClient) {
      throw new Error('MQTT client not connected');
    }
    
    const topic = `device/${publisherDeviceId}/data`;
    try {
      // [NEW] Step 1: Fetch the session key for the publisher we want to hear
        const keyResponse = await axios.get(`${this.serverUrl}/api/devices/${publisherDeviceId}/key`);
        const publisherKey = keyResponse.data.key;
        
        // [NEW] Step 2: Register this key with our MQTT client
        this.mqttClient.addSubscriptionKey(topic, publisherKey);
        
        // Step 3: Actually subscribe
        await this.mqttClient.subscribe(topic);
        console.log(`\x1b[36mSubscribed to publisher device data: ${publisherDeviceId}\x1b[0m`);

    } catch (error) {
      console.error(`\x1b[31mFailed to get key for publisher ${publisherDeviceId}:\x1b[0m`, error.message);
    }
  }

  setMessageHandler(handler) {
    this.messageHandler = handler;
    if (this.mqttClient) {
      this.mqttClient.setMessageHandler(handler);
    }
  }

  disconnect() {
    if (this.mqttClient) {
      this.mqttClient.disconnect();
      this.mqttClient = null;
    }
  }
}

export default SubscriberDevice;
