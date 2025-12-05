import crypto from 'crypto';
import { performance } from 'perf_hooks';
class SpeckCipher {
  constructor(key) {
    // Store original key for debugging
    this.originalKey = key;
    
    // Create a consistent 16-byte key from any input
    const keyBytes = crypto.createHash('sha256')
      .update(typeof key === 'string' ? key : JSON.stringify(key))
      .digest();
      
    // Take exactly 16 bytes for AES-128
    this.key = keyBytes.slice(0, 16);
    
    // Debug output
    // console.log(`\n\x1b[33mCipher initialized with key fingerprint: ${this.key.toString('hex').substring(0, 8)}...\x1b[0m`);
  }

  encrypt(plaintext) {
    const start = performance.now(); // [START TIMER]
    try {
      // Ensure plaintext is a string
      const textToEncrypt = typeof plaintext === 'string' 
        ? plaintext 
        : JSON.stringify(plaintext);
        
      // Generate random IV (12 bytes is standard for GCM, though 16 works too)
      const iv = crypto.randomBytes(12); // GCM prefers 12-byte IVs for performance
      
      // [CHANGE 1] Use 'aes-128-gcm' instead of 'cbc'
      const cipher = crypto.createCipheriv('aes-128-gcm', this.key, iv);
      
      // Encrypt the data
      let encrypted = cipher.update(textToEncrypt, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // [CHANGE 2] Get the Authentication Tag (The "Integrity Seal")
      const authTag = cipher.getAuthTag();

      const end = performance.now(); // [END TIMER]

      
      // [CHANGE 3] Format as IV:EncryptedData:AuthTag
      return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
      
    } catch (error) {
      console.error('\x1b[31mEncryption error:\x1b[0m', error);
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  decrypt(ciphertext) {
    const start = performance.now(); // [START TIMER]
    try {
      
      // Validate input
      if (!ciphertext || typeof ciphertext !== 'string') {
        throw new Error('Invalid ciphertext: must be a non-empty string');
      }
      
      // [CHANGE 4] Split into 3 parts: IV, Data, and Tag
      const parts = ciphertext.split(':');
      
      if (parts.length !== 3) {
        throw new Error(`Invalid ciphertext format (found ${parts.length} parts, expected 3)`);
      }
      
      // Extract IV, encrypted data, and the Auth Tag
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      const authTag = Buffer.from(parts[2], 'hex'); // The seal to check
      
      // Create decipher
      const decipher = crypto.createDecipheriv('aes-128-gcm', this.key, iv);
      
      // [CHANGE 5] Set the Auth Tag BEFORE decrypting
      // If the data was tampered with, decipher.final() will throw an error
      decipher.setAuthTag(authTag);
      
      // Decrypt the data
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      const end = performance.now(); // [STOP TIMER]
       console.log(`\x1b[36m🔓 Decryption Cost: ${(end - start).toFixed(3)}ms\x1b[0m`);

      return decrypted;
      
    } catch (error) {
      // If GCM detects tampering, it throws a specific error here
      // console.error('\x1b[31mDecryption error (Integrity Check Failed):\x1b[0m', error.message);
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }
}

export default SpeckCipher;





//AES 128 CBC 

// import crypto from 'crypto';

// class SpeckCipher {
//   constructor(key) {
//     // Store original key for debugging
//     this.originalKey = key;
    
//     // Create a consistent 16-byte key from any input
//     const keyBytes = crypto.createHash('sha256')
//       .update(typeof key === 'string' ? key : JSON.stringify(key))
//       .digest();
      
//     // Take exactly 16 bytes for AES-128
//     this.key = keyBytes.slice(0, 16);
    
//     // Debug output
//     console.log(`\n\x1b[33mCipher initialized with key fingerprint: ${this.key.toString('hex').substring(0, 8)}...\x1b[0m`);
//   }

//   encrypt(plaintext) {
//     try {
//       // Ensure plaintext is a string
//       const textToEncrypt = typeof plaintext === 'string' 
//         ? plaintext 
//         : JSON.stringify(plaintext);
      
//       // Generate random IV for this encryption
//       const iv = crypto.randomBytes(16);
      
//       // Create cipher with our key and IV
//       const cipher = crypto.createCipheriv('aes-128-cbc', this.key, iv);
      
//       // Encrypt the data
//       let encrypted = cipher.update(textToEncrypt, 'utf8', 'hex');
//       encrypted += cipher.final('hex');
      
//       // Format as IV:encryptedData
//       return `${iv.toString('hex')}:${encrypted}`;
//     } catch (error) {
//       console.error('\x1b[31mEncryption error:\x1b[0m', error);
//       throw new Error(`Encryption failed: ${error.message}`);
//     }
//   }

//   decrypt(ciphertext) {
//     try {
//       // Validate input
//       if (!ciphertext || typeof ciphertext !== 'string') {
//         throw new Error('Invalid ciphertext: must be a non-empty string');
//       }
      
//       // Split the ciphertext into IV and encrypted data
//       const parts = ciphertext.split(':');
      
//       if (parts.length !== 2) {
//         throw new Error(`Invalid ciphertext format (found ${parts.length} parts)`);
//       }
      
//       // Extract IV and encrypted data
//       const iv = Buffer.from(parts[0], 'hex');
//       const encrypted = parts[1];
      
//       // Validate IV length
//       if (iv.length !== 16) {
//         throw new Error(`Invalid IV length: ${iv.length} (expected 16)`);
//       }
      
//       // Create decipher with same key and the extracted IV
//       const decipher = crypto.createDecipheriv('aes-128-cbc', this.key, iv);
      
//       // Decrypt the data
//       let decrypted = decipher.update(encrypted, 'hex', 'utf8');
//       decrypted += decipher.final('utf8');
      
//       return decrypted;
//     } catch (error) {
//       console.error('\x1b[31mDecryption error:\x1b[0m', error);
//       throw new Error(`Decryption failed: ${error.message}`);
//     }
//   }
// }

// export default SpeckCipher;

