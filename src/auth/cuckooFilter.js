import { CuckooFilter } from 'cuckoo-filter';
import crypto from 'crypto';

class AuthenticationFilter {
  constructor() {
    // Initialize with reasonable capacity and false positive rate
    // Adjusted bucket size to 2 (a common default for cuckoo filters)
    this.filter = new CuckooFilter(1000, 2);
    this.deviceCredentials = new Map(); // Store additional device info
  }

  hashCredential(deviceId, secret) {
    // Create a unique hash of the device credentials
    return crypto.createHash('sha256').update(`${deviceId}:${secret}`).digest('hex');
  }

  registerDevice(deviceId, secret, metadata = {}) {
    const hashedCredential = this.hashCredential(deviceId, secret);
    const success = this.filter.add(hashedCredential);
    
    if (success) {
      this.deviceCredentials.set(deviceId, {
        hashedCredential,
        metadata,
        lastActive: Date.now()
      });
      return true;
    }
    
    return false;
  }

  validateDevice(deviceId, secret) {
    const hashedCredential = this.hashCredential(deviceId, secret);
    return this.filter.contains(hashedCredential);
  }

  updateDeviceStatus(deviceId, status) {
    if (this.deviceCredentials.has(deviceId)) {
      const device = this.deviceCredentials.get(deviceId);
      device.lastActive = Date.now();
      device.status = status;
      return true;
    }
    return false;
  }

  getDeviceInfo(deviceId) {
    return this.deviceCredentials.get(deviceId);
  }
}

export default new AuthenticationFilter();
