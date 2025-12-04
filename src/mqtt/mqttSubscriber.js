import mqtt from 'mqtt';
import SpeckCipher from '../encryption/speck.js';
import 'dotenv/config';

class SecureMqttSubscriber {
  constructor(deviceId, sessionKey) {
    this.deviceId = deviceId;
    this.cipher = new SpeckCipher(sessionKey);
    this.decryptionKeys = new Map(); // [NEW] Map: topic -> Cipher instance
    this.client = null;
    this.heartbeatInterval = null;
    this.connected = false;
    this.heartbeatTopic = `device/${deviceId}/heartbeat`;
    this.brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
    this.messageHandler = null;
  }

  connect(options = {}) {
    return new Promise((resolve, reject) => {
      // Connect to MQTT broker
      this.client = mqtt.connect(this.brokerUrl, {
        ...options,
        clientId: `subscriber_${this.deviceId}_${Date.now()}`
      });

      this.client.on('connect', () => {
        console.log(`\n\x1b[36m📡 Subscriber ${this.deviceId} connected to MQTT broker\x1b[0m`);
        this.connected = true;
        this._startHeartbeat();
        resolve(true);
      });

      this.client.on('error', (error) => {
        console.error(`\n\x1b[31mMQTT connection error for subscriber ${this.deviceId}:\x1b[0m`, error);
        reject(error);
      });

      this.client.on('message', (topic, message) => {
        try {
          const encryptedMessage = message.toString();
          console.log(`\n\x1b[33m📩 Received encrypted message on ${topic}: ${encryptedMessage.substring(0, 40)}...\x1b[0m`);
          
          // Decrypt the message
          const decryptedMessage = this.cipher.decrypt(encryptedMessage);
          const decryptedData = JSON.parse(decryptedMessage);

          // Check for message delay(PRevent Replay Attack)
          const allowedDelay=5000;//5 seconds
          if(Date.now()-decryptedData.timestamp>allowedDelay){
            console.warn(`\n\x1b[33m⚠️  Warning: Message on ${topic} is delayed by more than ${allowedDelay} ms\x1b[0m`);
            return; //ignore delayed message
          }
          
          console.log(`\n\x1b[32m🔓 Decrypted message on ${topic}:`, decryptedData, '\x1b[0m');
          
          // Pass to custom handler if exists
          if (this.messageHandler) {
            this.messageHandler(topic, decryptedData);
          }
        } catch (error) {
          console.error('\n\x1b[31mFailed to decrypt message:\x1b[0m', error);
        }
      });
    });
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
          console.log(`\n\x1b[36m👂 Subscribed to ${topic}\x1b[0m`);
          resolve(true);
        }
      });
    });
  }

  setMessageHandler(handler) {
    this.messageHandler = handler;
  }

  disconnect() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    if (this.client && this.connected) {
      this.client.end();
      this.connected = false;
      console.log(`\n\x1b[36mSubscriber ${this.deviceId} disconnected from MQTT broker\x1b[0m`);
    }
  }

  _startHeartbeat() {
    const interval = parseInt(process.env.HEARTBEAT_INTERVAL) || 5000;
    
    this.heartbeatInterval = setInterval(() => {
      const heartbeat = {
        deviceId: this.deviceId,
        timestamp: Date.now(),
        status: 'online',
        type: 'subscriber',
        sequence: Math.floor(Math.random() * 1000)
      };
      
      const encryptedHeartbeat = this.cipher.encrypt(JSON.stringify(heartbeat));
      this.client.publish(this.heartbeatTopic, encryptedHeartbeat);
      console.log(`\x1b[36m❤️  Sent heartbeat (seq: ${heartbeat.sequence})\x1b[0m`);
    }, interval);
  }
}

export default SecureMqttSubscriber;
