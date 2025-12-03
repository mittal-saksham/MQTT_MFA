import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import authFilter from './cuckooFilter.js';
import otkManager from './otk.js';
import SpeckCipher from '../encryption/speck.js';
import heartbeatMonitor from '../heartbeat/monitor.js';
import dotenv from 'dotenv';
dotenv.config();

const encryptionKey = process.env.ENCRYPTION_KEY || 'default_encryption_key';
const cipher = new SpeckCipher(encryptionKey);

class MFAService {
  constructor() {
    this.sessions = new Map(); // sessionId -> { deviceId, authenticated, factors }
    this.sessionTimeout = 5 * 60 * 1000; // 5 minutes
  }

  // Step 1: Initialize authentication session
  initiateAuthentication(deviceId) {
    const sessionId = uuidv4();
    this.sessions.set(sessionId, {
      deviceId,
      authenticated: false,
      factors: {
        credentials: false,
        otk: false
      },
      createdAt: Date.now()
    });
    
    // Schedule session cleanup
    setTimeout(() => {
      if (this.sessions.has(sessionId)) {
        this.sessions.delete(sessionId);
      }
    }, this.sessionTimeout);
    
    return sessionId;
  }

  // Step 2: Validate device credentials (Factor 1)
  async validateCredentials(sessionId, secret) {
    if (!this.sessions.has(sessionId)) {
      throw new Error('Invalid or expired session');
    }
    
    const session = this.sessions.get(sessionId);
    const { deviceId } = session;
    
    const isValid = authFilter.validateDevice(deviceId, secret);
    if (isValid) {
      session.factors.credentials = true;
      this.sessions.set(sessionId, session);
      
      // Generate OTK for second factor
      const otk = otkManager.generateKey(deviceId);
      
      // In a real system, this would be sent via a separate channel (SMS, email, etc.)
      // For this example, we'll return it
      return { success: true, otk };
    }
    
    return { success: false, message: 'Invalid credentials' };
  }

  // Step 3: Validate one-time key (Factor 2)
  validateOTK(sessionId, providedOtk) {
    if (!this.sessions.has(sessionId)) {
      return { success: false, message: 'Invalid or expired session' };
    }
    
    const session = this.sessions.get(sessionId);
    const { deviceId, factors } = session;
    
    // Ensure first factor was completed
    if (!factors.credentials) {
      return { success: false, message: 'Must complete first authentication factor' };
    }
    
    const isValid = otkManager.validateKey(deviceId, providedOtk);
    if (isValid) {
      session.factors.otk = true;
      session.authenticated = true;
      this.sessions.set(sessionId, session);
      
      // Generate session key for encrypted communication
      //only sending a generated random session Key which is not encrypted
      const sessionKey = crypto.randomBytes(16).toString('hex');      

      //PREV HARD CODED VALUE

      // const sessionKey = 'shared_fixed_session_key_for_all_devices';


      //const encryptedSessionKey = cipher.encrypt(sessionKey);          //error hai yaha par next sem karliyo theek hai
      
      // Record initial heartbeat
      heartbeatMonitor.recordHeartbeat(deviceId, 'online');
      
      return { 
        success: true, 
        authenticated: true,
        sessionKey: sessionKey //UnEncrypted Session Key
      };
    }
    
    return { success: false, message: 'Invalid one-time key' };
  }

  // Verify if a session is fully authenticated
  isAuthenticated(sessionId) {
    if (!this.sessions.has(sessionId)) {
      return false;
    }
    
    return this.sessions.get(sessionId).authenticated;
  }

  // Get device ID from session
  getDeviceIdFromSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      return null;
    }
    
    return this.sessions.get(sessionId).deviceId;
  }
}

export default new MFAService();
