import mqtt from 'mqtt';
import 'dotenv/config';

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const client = mqtt.connect(BROKER_URL, { clientId: 'tamper_attacker_' + Date.now() });

let stolenPacket = null;

console.log('\x1b[31m😈  [TAMPER ATTACK] Ready. Listening for a packet...\x1b[0m');

client.on('connect', () => {
    client.subscribe('device/+/data');
});

client.on('message', (topic, message) => {
    // Ignore our own fake packets
    if (stolenPacket && message.toString() === stolenPacket) return;

    console.log(`\n\x1b[31m⚡  Intercepted packet from ${topic}\x1b[0m`);
    stolenPacket = message.toString();
    client.unsubscribe('device/+/data'); // Stop listening

    // CORRUPT THE DATA
    const parts = stolenPacket.split(':');
    if (parts.length === 3) {
        const iv = parts[0];
        const ciphertext = parts[1];
        const authTag = parts[2];

        // Change the last 5 characters of the encrypted text
        const corruptedCipher = ciphertext.substring(0, ciphertext.length - 5) + "ABCDE";
        const fakeMessage = `${iv}:${corruptedCipher}:${authTag}`;
        
        console.log('\x1b[31m🔨  Modifying payload bits...\x1b[0m');
        console.log('\x1b[31m📤  Sending Corrupted Packet!\x1b[0m');
        
        client.publish(topic, fakeMessage, () => {
            setTimeout(() => {
                console.log('\x1b[31m😈  Attack Complete. Check Subscriber logs for "Decryption Failed".\x1b[0m');
                process.exit(0);
            }, 500);
        });
    }
});