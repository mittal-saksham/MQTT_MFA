import { EventEmitter } from 'events';
import authFilter from '../auth/cuckooFilter.js';

class HeartbeatMonitor extends EventEmitter {
  constructor(timeoutInterval = 30000) {
    super();
    // CHANGED: Map now stores objects: { lastSeen, lastSeq, missed, outOfOrder }
    this.devices = new Map(); 
    this.timeoutInterval = timeoutInterval; 
    this.checkInterval = 30000;
    
    // NEW: Define the sliding window size
    this.WINDOW_SIZE = 5; 
    
    this._startMonitoring();
  }

  // CHANGED: Accepted 'sequence' as a third argument
  recordHeartbeat(deviceId, status = 'online', sequence = null) {
    const now = Date.now();
    
    // 1. Initialize device if not exists
    if (!this.devices.has(deviceId)) {
      this.devices.set(deviceId, { 
        lastSeen: now, 
        lastSeq: sequence, 
        missed: 0,
        outOfOrder: 0
      });
      authFilter.updateDeviceStatus(deviceId, status);
      return { timestamp: now, status, missed: 0 };
    }

    const deviceData = this.devices.get(deviceId);
    
    // Check offline status before updating
    const wasOffline = (now - deviceData.lastSeen) > this.timeoutInterval;

    // 2. === SLIDING WINDOW LOGIC START ===
    if (sequence !== null && deviceData.lastSeq !== null) {
      const expected = deviceData.lastSeq + 1;

      if (sequence === expected) {
        // CASE A: Perfect sequence
        deviceData.lastSeq = sequence;
        
      } else if (sequence > deviceData.lastSeq && sequence <= (deviceData.lastSeq + this.WINDOW_SIZE)) {
        // CASE B: Within Window (Minor Gap/Out-of-Order)
        // We accept this without penalizing "missed" heavily, or count as "out of order"
        console.log(`\x1b[33m[Monitor] Packet Jump: ${deviceData.lastSeq} -> ${sequence} (Within Window)\x1b[0m`);
        deviceData.outOfOrder++;
        deviceData.lastSeq = sequence; 
        
      } else if (sequence > (deviceData.lastSeq + this.WINDOW_SIZE)) {
        // CASE C: Outside Window (Real Packet Loss)
        const gap = sequence - deviceData.lastSeq - 1;
        deviceData.missed += gap;
        deviceData.lastSeq = sequence;
        console.warn(`\x1b[31m[Monitor] Critical Loss: Missed ${gap} packets from ${deviceId}\x1b[0m`);
      }
      // CASE D: sequence < lastSeq (Late packet). We ignore it or log it.
    } else if (sequence !== null) {
      // First sequence received
      deviceData.lastSeq = sequence;
    }
    // === SLIDING WINDOW LOGIC END ===

    // Update timestamp
    deviceData.lastSeen = now;
    this.devices.set(deviceId, deviceData);
    authFilter.updateDeviceStatus(deviceId, status);

    if (wasOffline) {
      this.emit('deviceOnline', deviceId);
    }

    return { 
      timestamp: now, 
      status, 
      missed: deviceData.missed,
      outOfOrder: deviceData.outOfOrder
    };
  }

  getDeviceStatus(deviceId) {
    if (!this.devices.has(deviceId)) {
      return { status: 'unknown', lastSeen: null, stats: null };
    }

    // CHANGED: Access .lastSeen from the object
    const deviceData = this.devices.get(deviceId);
    const isOnline = (Date.now() - deviceData.lastSeen) <= this.timeoutInterval;

    return {
      status: isOnline ? 'online' : 'offline',
      lastSeen: new Date(deviceData.lastSeen).toISOString(),
      // Return reliability stats for your paper
      reliability: {
        missed: deviceData.missed,
        outOfOrder: deviceData.outOfOrder
      }
    };
  }

  _startMonitoring() {
    setInterval(() => {
      const now = Date.now();
      console.log('\n\x1b[33m=== Device Status Check ===\x1b[0m');

      this.devices.forEach((deviceData, deviceId) => {
        // CHANGED: Access .lastSeen property
        const status = (now - deviceData.lastSeen) <= this.timeoutInterval ? 'online' : 'offline';
        const lastSeenFormatted = new Date(deviceData.lastSeen).toLocaleTimeString();
        const statusColor = status === 'online' ? '\x1b[32m' : '\x1b[31m';

        // NEW: Display the reliability metrics in the console log
        console.log(
          `${statusColor}${deviceId.padEnd(25)}: ${status.toUpperCase()} ` +
          `(Last seen: ${lastSeenFormatted}) ` +
          `[Missed: ${deviceData.missed} | OoO: ${deviceData.outOfOrder}]\x1b[0m`
        );
      });
    }, this.checkInterval);
  }
}

export default new HeartbeatMonitor();