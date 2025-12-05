
//NEW
import mqtt from 'mqtt';
import aesCipher from '../encryption/aesGCM.js';
import heartbeatMonitor from '../heartbeat/monitor.js';
import { config } from 'dotenv';

config();

class MqttServer {
  constructor() {
    this.client = null;
    this.deviceSessions = new Map(); // deviceId -> { sessionKey, cipher }
    this.brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
    this.username = process.env.MQTT_USERNAME;
    this.password = process.env.MQTT_PASSWORD;
    
    // Add heartbeat statistics
    this.heartbeatStats = new Map(); // deviceId -> { received: count, missed: count, lastSequence: number }
  }

  start() {
    // Connect to MQTT broker
    this.client = mqtt.connect(this.brokerUrl, {
      clientId: `mqtt_server_${Date.now()}`,
      username: this.username,
      password: this.password,
      clean: true
    });

    this.client.on('connect', () => {
      console.log('\n\x1b[33m🔌 MQTT server connected to broker\x1b[0m');
      
      // Subscribe to all device heartbeats
      this.client.subscribe('device/+/heartbeat');
      console.log('\n\x1b[33m👂 Listening for device heartbeats\x1b[0m\n');
      
      // Start heartbeat status display
      this._startHeartbeatDashboard();
    });

    this.client.on('message', (topic, message) => {
      // Extract deviceId from topic (e.g., "device/123/heartbeat")
      
      const topicParts = topic.split('/');
      if (topicParts.length >= 3 && topicParts[0] === 'device' && topicParts[2] === 'heartbeat') {
        const deviceId = topicParts[1];
        
        // Decrypt message if we have a session for this device
        if (this.deviceSessions.has(deviceId)) {
          try {
            const { cipher } = this.deviceSessions.get(deviceId);
            const decryptedMessage = cipher.decrypt(message.toString());
            const heartbeatData = JSON.parse(decryptedMessage);
            
            // Update heartbeat stats
            if (!this.heartbeatStats.has(deviceId)) {
              this.heartbeatStats.set(deviceId, { received: 0, missed: 0, lastSequence: null });
            }
            
            const stats = this.heartbeatStats.get(deviceId);
            stats.received++;
            
            // If there's a sequence number, check for missed heartbeats
            if (heartbeatData.sequence !== undefined && stats.lastSequence !== null) {
              const expectedSequence = (stats.lastSequence + 1) % 1000; // Assuming 0-999 range for sequence
              if (heartbeatData.sequence !== expectedSequence) {
                stats.missed++;
              }
            }
            
            if (heartbeatData.sequence !== undefined) {
              stats.lastSequence = heartbeatData.sequence;
            }
            
            // Format timestamp for logging
            const timestamp = new Date(heartbeatData.timestamp).toLocaleTimeString();
            
            // Log heartbeat with color based on device type
            const colorCode = heartbeatData.type === 'publisher' ? '\x1b[35m' : '\x1b[36m';
            console.log(`${colorCode}💓 Heartbeat from ${deviceId} (${heartbeatData.type}) at ${timestamp} - seq: ${heartbeatData.sequence || 'N/A'}\x1b[0m`);
            
            // Record heartbeat
            heartbeatMonitor.recordHeartbeat(deviceId, heartbeatData.status);
          } catch (error) {
            console.error(`\n\x1b[31m⚠️ Failed to process heartbeat from ${deviceId}:\x1b[0m`, error.message);
          }
        } else {
          console.warn(`\n\x1b[33m⚠️ Received heartbeat from unauthenticated device ${deviceId}\x1b[0m`);
        }
      }
    });

    this.client.on('error', (error) => {
      console.error('\n\x1b[31m🔥 MQTT server error:\x1b[0m', error);
    });

    // Set up event listeners for device status changes with enhanced logging
    heartbeatMonitor.on('deviceOffline', (deviceId) => {
      console.log(`\n\x1b[31m⚠️ Device ${deviceId} went OFFLINE\x1b[0m`);
      // You could add notification logic here
    });

    heartbeatMonitor.on('deviceOnline', (deviceId) => {
      console.log(`\n\x1b[32m✅ Device ${deviceId} came ONLINE\x1b[0m`);
    });
  }

  // Add a method to display heartbeat status periodically
  _startHeartbeatDashboard() {
    const interval = parseInt(process.env.HEARTBEAT_DASHBOARD_INTERVAL) || 15000; // 15 seconds by default
    
    setInterval(() => {
      // console.log("CAME HERE TO START HEARTBEAT DASHBOARD ");
      
      // if (!global.Logging) return;
      console.log('\n\x1b[33m==================== DEVICE HEARTBEAT STATUS ====================\x1b[0m');
      
      if (this.heartbeatStats.size === 0) {
        console.log('\x1b[33mNo devices have sent heartbeats yet\x1b[0m');
      } else {
        console.log('\x1b[33m' + 'DEVICE ID'.padEnd(25) + 'STATUS'.padEnd(10) + 'LAST SEEN'.padEnd(15) + 'RELIABILITY\x1b[0m');
        console.log('\x1b[33m' + '─'.repeat(65) + '\x1b[0m');
        
        // Get devices from heartbeat monitor
        for (const [deviceId, stats] of this.heartbeatStats.entries()) {
          const status = heartbeatMonitor.getDeviceStatus(deviceId);
          const statusColor = status.status === 'online' ? '\x1b[32m' : '\x1b[31m';
          const reliability = stats.received > 0 ? 
            ((stats.received / (stats.received + stats.missed)) * 100).toFixed(1) + '%' : 
            'N/A';
          
          console.log(
            statusColor + 
            deviceId.padEnd(25) + 
            status.status.toUpperCase().padEnd(10) + 
            (status.lastSeen ? new Date(status.lastSeen).toLocaleTimeString().padEnd(15) : 'N/A'.padEnd(15)) + 
            `${reliability} (${stats.received} recv, ${stats.missed} missed)` +
            '\x1b[0m'
          );
        }
      }
      
      console.log('\x1b[33m=================================================================\x1b[0m\n');
    }, interval);
  }

  registerDeviceSession(deviceId, sessionKey) {
    const cipher = new aesCipher(sessionKey);
    this.deviceSessions.set(deviceId, { sessionKey, cipher });
    console.log(`\n\x1b[32m🔒 Registered secure session for device ${deviceId}\x1b[0m`);
  }

  sendMessageToDevice(deviceId, topic, message) {
    if (!this.deviceSessions.has(deviceId)) {
      throw new Error(`No secure session for device ${deviceId}`);
    }
    
    const { cipher } = this.deviceSessions.get(deviceId);
    const encryptedMessage = cipher.encrypt(
      typeof message === 'string' ? message : JSON.stringify(message)
    );
    
    this.client.publish(topic, encryptedMessage);
    console.log(`\n\x1b[32m📤 Sent encrypted message to ${deviceId} on ${topic}\x1b[0m`);
  }
  // [NEW] Method  to retrieve a specific device's session key
  getSessionKey(deviceId) {
    if (this.deviceSessions.has(deviceId)) {
      return this.deviceSessions.get(deviceId).sessionKey;
    }
    return null;
  }
  // Add method to get current heartbeat statistics
  getHeartbeatStats(deviceId) {
    if (deviceId) {
      return this.heartbeatStats.get(deviceId);
    }
    return Object.fromEntries(this.heartbeatStats.entries());
  }
}

export default new MqttServer();

