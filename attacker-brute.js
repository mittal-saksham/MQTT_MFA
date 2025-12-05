import axios from 'axios';
import 'dotenv/config';

const SERVER_URL = 'http://localhost:3000'; // Adjust if your port differs

// ⚠️ INSTRUCTION: Copy a valid Publisher ID from your running terminal
// Example: 'publisher-1764914450753'
const TARGET_DEVICE_ID = process.argv[2]; 

if (!TARGET_DEVICE_ID) {
    console.error('\x1b[31m❌ Error: You must provide a Device ID as an argument.\x1b[0m');
    console.log('Usage: node attack-brute.js <publisher-id>');
    process.exit(1);
}

// A list of common passwords a hacker might try
const PASSWORD_LIST = [
    'password', '123456', 'admin', 'secret', 'mqtt-secret',
    'publisher', 'root', 'qwerty', 'access', 'secure-secret-999'
];

console.log(`\n\x1b[31m😈  [BRUTE FORCE] Targeting Device: ${TARGET_DEVICE_ID}\x1b[0m`);
console.log('\x1b[31m😈  [BRUTE FORCE] Attempting to crack the secret...\x1b[0m');

async function runAttack() {
    try {
        // Step 1: Initialize Auth (The Hacker knocks on the door)
        // The server allows this because the ID exists in the Cuckoo Filter
        const initResponse = await axios.post(`${SERVER_URL}/api/auth/initiate`, {
            deviceId: TARGET_DEVICE_ID
        });
        
        const { sessionId } = initResponse.data;
        console.log(`\x1b[33m🔑  [ATTACKER] Obtained valid Session ID: ${sessionId.substring()}...\x1b[0m`);

        // Step 2: Rapid-fire guess passwords
        console.log('\x1b[31m⚡  [ATTACKER] Launching Dictionary Attack...\x1b[0m');

        for (const guess of PASSWORD_LIST) {
            process.stdout.write(`    Trying secret: "${guess}"... `);
            
            try {
                const response = await axios.post(`${SERVER_URL}/api/auth/validate-credentials`, {
                    sessionId: sessionId,
                    secret: guess
                });

                if (response.data.success) {
                    console.log('\n\x1b[32m✅  CRACKED! Secret found!\x1b[0m');
                    process.exit(0);
                } else {
                    console.log('\x1b[31m❌ Rejected\x1b[0m');
                }
            } catch (error) {
                // Your server returns 400/error on failure
                console.log('\x1b[31m❌ Rejected (Cuckoo Filter Blocked)\x1b[0m');
            }
        }

        console.log('\n\x1b[34m🛡️  [RESULT] Attack Failed. The Cuckoo Filter rejected all guesses.\x1b[0m');

    } catch (error) {
        console.error('Attack failed to start:', error.message);
    }
}

runAttack();