import mqtt from 'mqtt';
import SpeckCipher from '../encryption/speck.js';
import { config } from 'dotenv';

config();

class SecureMqttClient {
  constructor(deviceId, sessionKey) {
    this.deviceId = deviceId;
    this.cipher = new SpeckCipher(sessionKey);
    this.client = null;
    this.heartbeatInterval = null;
    this.connected = false;
    this.heartbeatTopic = `device/${deviceId}/heartbeat`;
    this.brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
    this.sequenceCounter = 0;
  }

  connect(options = {}) {
    return new Promise((resolve, reject) => {
      // Connect to MQTT broker
      this.client = mqtt.connect(this.brokerUrl, {
        ...options,
        clientId: `publisher_${this.deviceId}_${Date.now()}`
      });

      this.client.on('connect', () => {
        console.log(`\n\x1b[35m📡 Publisher ${this.deviceId} connected to MQTT broker\x1b[0m`);
        this.connected = true;
        this._startHeartbeat();
        resolve(true);
      });

      this.client.on('error', (error) => {
        console.error(`\n\x1b[31mMQTT connection error for publisher ${this.deviceId}:\x1b[0m`, error);
        reject(error);
      });

      this.client.on('message', (topic, message) => {
        try {
          const encryptedMessage = message.toString();
          console.log(`\n\x1b[33mReceived encrypted message on ${topic}: ${encryptedMessage.substring(0, 40)}...\x1b[0m`);
          
          // Decrypt the message
          const decryptedMessage = this.cipher.decrypt(encryptedMessage);
          console.log(`\n\x1b[32mDecrypted message on ${topic}: ${decryptedMessage}\x1b[0m`);
          // Handle the message here
        } catch (error) {
          console.error('\n\x1b[31mFailed to decrypt message:\x1b[0m', error);
        }
      });
    });
  }

  publish(topic, message) {
    if (!this.connected) {
      throw new Error('Client not connected');
    }
    
    try {
      // Convert message to string if it's not already
      const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
      
      // Encrypt the message
      const encryptedMessage = this.cipher.encrypt(messageStr);
      
      // Log the messages with visualization
      console.log(`\n\x1b[35m📤 Publishing to ${topic}: ${messageStr.substring(0, 40)}...\x1b[0m`);
      console.log(`\n\x1b[33m🔒 Encrypted message: ${encryptedMessage.substring(0, 40)}...\x1b[0m`);
      
      // Publish the encrypted message
      this.client.publish(topic, encryptedMessage);
      return true;
    } catch (error) {
      console.error('\n\x1b[31mFailed to publish message:\x1b[0m', error);
      return false;
    }
  }

  subscribe(topic) {
    if (!this.connected) {
      throw new Error('Client not connected');
    }
    
    return new Promise((resolve, reject) => {
      this.client.subscribe(topic, (error) => {
        if (error) {
          console.error(`\n\x1b[31mFailed to subscribe to ${topic}:\x1b[0m`, error);
          reject(error);
        } else {
          console.log(`\n\x1b[35m👂 Subscribed to ${topic}\x1b[0m`);
          resolve(true);
        }
      });
    });
  }

  disconnect() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    if (this.client && this.connected) {
      this.client.end();
      this.connected = false;
      console.log(`\n\x1b[35m📡 Publisher ${this.deviceId} disconnected from MQTT broker\x1b[0m`);
    }
  }

  // [NEW] Allow updating the key without disconnecting
  updateSessionKey(newSessionKey) {
    this.cipher = new SpeckCipher(newSessionKey);
    console.log(`\n\x1b[35m🔄 MQTT Client updated with NEW session key\x1b[0m`);
  }

  _startHeartbeat() {
    const interval = parseInt(process.env.HEARTBEAT_INTERVAL) || 5000;
    this.heartbeatInterval = setInterval(() => {
      
      // [NEW] Increment the counter
      this.sequenceCounter++; 

      const heartbeat = {
        deviceId: this.deviceId,
        timestamp: Date.now(),
        status: 'online',
        type: 'publisher',
        // [MODIFIED] Use the counter instead of random
        sequence: this.sequenceCounter 
      };
      
      this.publish(this.heartbeatTopic, heartbeat);
      console.log(`\n\x1b[35m❤️  Sent heartbeat (seq: ${heartbeat.sequence})\x1b[0m`);
    }, interval);
  }
}

export default SecureMqttClient;