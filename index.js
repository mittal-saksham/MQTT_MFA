import 'dotenv/config';
import * as server from './src/server.js';
import DeviceSimulator from './src/utils/deviceSimulator.js';
import SubscriberDevice from './src/utils/subscriberDevice.js';
import readline from 'readline';

// Set up devices with unique IDs
const publisherId = `publisher-${Date.now()}`;
const subscriberId = `subscriber-${Date.now()}`;
const secret = 'secure-secret-123';

// Global logging control
global.enableLogging = true;
global.menuActive = false;

// Override console.log to respect logging flag
const originalConsoleLog = console.log;
console.log = function() {
  // Always show menu-related messages (prefixed with [MENU])
  if (global.enableLogging || (arguments[0] && arguments[0].toString().includes('[MENU]'))) {
    originalConsoleLog.apply(console, arguments);
  }
};

// Create interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// For handling message publishing
let dataInterval = null;
let counter = 0;
let publishInterval = 3000; // Default interval

// Function to control logging state
function setLogging(enabled) {
  // console.log("LOGGING IS TRUE");
  global.enableLogging = enabled;
}

// Function to display the command menu
function showMenu() {
  global.menuActive = true;
  console.log("LOGGING IS FALSE NOW");
  
  setLogging(false); // Disable background logging
  
  console.log('\n[MENU] === MQTT-MFA Command Menu ===');
  console.log(`[MENU] 1. Start sending data (current interval: ${publishInterval}ms)`);
  console.log('[MENU] 2. Stop sending data');
  console.log('[MENU] 3. Send a single message');
  console.log('[MENU] 4. Change publish interval');
  console.log('[MENU] 5. Show device status');
  console.log('[MENU] 6. Exit');
  console.log('[MENU] ===========================');
  console.log('[MENU] Press Enter anytime to show this menu');
}

// Process user commands
function processCommand(publisher, subscriber, command) {
  // First, exit menu mode for all commands

  switch (command.trim()) {
    
    case '1': // Start sending data
    if (dataInterval) {
      console.log('[MENU] Data transmission already running!');
      // Stay in menu mode for error
      showMenu();
      promptUser(publisher, subscriber);
      return;
    }
    
    // Reset counter if needed
    counter = 0;
    
    // Get interval from user
    rl.question('[MENU] Enter interval in milliseconds (default: 3000): ', (interval) => {
      publishInterval = parseInt(interval) || 3000;
      
      // Force exit menu mode first, then enable logging to ensure proper sequence
      global.menuActive = false;
      
      // Ensure we exit from menu loop completely before logging
      process.nextTick(() => {
        // Enable logging after everything else is set up
        setLogging(true);
        
        console.log(`\n\x1b[33m[SYSTEM] Starting data transmission every ${publishInterval}ms...\x1b[0m`);
        console.log(`\x1b[33m[SYSTEM] Press Enter anytime to show the menu again\x1b[0m`);
        
        dataInterval = setInterval(() => {
          counter++;
          const data = {
            temperature: 20 + Math.random() * 10,
            humidity: 40 + Math.random() * 20,
            timestamp: Date.now(),
            messageNumber: counter
          };
          
          publisher.publishData(data);
          // Ensure message is treated as non-menu message
          if (global.enableLogging){
            originalConsoleLog(`\n\x1b[35mPublished message #${counter}\x1b[0m`);
          }
        }, publishInterval);
      });
    });
    break;
  
    case '2': // Stop sending data
      if (!dataInterval) {
        console.log('[MENU] No data transmission running!');
      } else {
        clearInterval(dataInterval);
        dataInterval = null;
        console.log(`[MENU] Stopped data transmission after ${counter} messages`);
      }
      
      // Important: Enable logging after stopping
      setLogging(true);
      global.menuActive = false;
      console.log('[MENU] Returning to normal operation. Press Enter for menu.');
      break;
      
    case '3': // Send a single message
      counter++;
      const data = {
        temperature: 20 + Math.random() * 10,
        humidity: 40 + Math.random() * 20,
        timestamp: Date.now(),
        messageNumber: counter
      };
      
      // Enable logging to see the message
      setLogging(true);
      global.menuActive = false;
      publisher.publishData(data);
      console.log(`\n\x1b[35mPublished single message #${counter}\x1b[0m`);
      console.log('[MENU] Message sent. Press Enter for menu.');
      break;
      
    case '4': // Change publish interval
      if (dataInterval) {
        clearInterval(dataInterval);
        dataInterval = null;
      }
      
      rl.question('[MENU] Enter new interval in milliseconds: ', (interval) => {
        publishInterval = parseInt(interval) || 3000;
        console.log(`[MENU] Interval updated to ${publishInterval}ms`);
        
        rl.question('[MENU] Start sending data now? (y/n): ', (answer) => {
          if (answer.toLowerCase() === 'y') {
            console.log(`[MENU] Starting data transmission every ${publishInterval}ms...`);
            console.log('[MENU] Press Enter anytime to show the menu again');
            // Re-Enable logging
            setLogging(true);
            global.menuActive = false;
            
            dataInterval = setInterval(() => {
              counter++;
              const data = {
                temperature: 20 + Math.random() * 10,
                humidity: 40 + Math.random() * 20,
                timestamp: Date.now(),
                messageNumber: counter
              };
              
              publisher.publishData(data);
              console.log(`\n\x1b[35mPublished message #${counter}\x1b[0m`);
            }, publishInterval);
          } else {
            // Enable logging even if not sending data
            setLogging(true);
            global.menuActive = false;
            console.log('[MENU] Returning to normal operation. Press Enter for menu.');
          }
        });
      });
      break;
      
    case '5': // Show device status
      console.log('\n\n[MENU] === Device Status ===');
      console.log(`[MENU] Publisher: ${publisherId} (Messages sent: ${counter})`);
      console.log(`[MENU] Subscriber: ${subscriberId}`);
      console.log(`[MENU] Data transmission: ${dataInterval ? 'RUNNING' : 'STOPPED'}`);
      
      // Brief status view then back to normal operation
      setLogging(true);
      global.menuActive = false;
      console.log('[MENU] Returning to normal operation. Press Enter for menu.');
      break;
      
    case '6': // Exit
      console.log('[MENU] Shutting down devices...');
      if (dataInterval) {
        clearInterval(dataInterval);
      }
      publisher.disconnect();
      subscriber.disconnect();
      
      setTimeout(() => {
        console.log('\x1b[34m========================================================\x1b[0m');
        console.log('\x1b[34m✅ Session terminated by user! ✅\x1b[0m');
        console.log('\x1b[34m========================================================\x1b[0m');
        rl.close();
        process.exit(0);
      }, 1000);
      break;
      
    default:
      console.log('[MENU] Invalid command. Please try again.');
      showMenu();
      promptUser(publisher, subscriber);
  }
}

// Prompt for user input
function promptUser(publisher, subscriber) {
  rl.question('[MENU] Enter command number: ', (command) => {
    processCommand(publisher, subscriber, command);
  });
}

// Main function with interactive control
async function runSimulation() {
  try {
    console.log('\x1b[34m========================================================\x1b[0m');
    console.log('\x1b[34m🔐 Starting Secure MQTT Communication Simulation 🔐\x1b[0m');
    console.log('\x1b[34m========================================================\x1b[0m');

    // Set up publisher device
    console.log('\n\x1b[35m[PUBLISHER SETUP]\x1b[0m');
    const publisher = new DeviceSimulator(publisherId, secret);
    
    // Set up subscriber device
    console.log('\n\x1b[36m[SUBSCRIBER SETUP]\x1b[0m');
    const subscriber = new SubscriberDevice(subscriberId, secret);
    
    // Register devices
    await publisher.register();
    await subscriber.register();
    
    // Authenticate devices using MFA
    await publisher.authenticate();
    await subscriber.authenticate();
    
    // Connect devices to MQTT broker
    await publisher.connectMqtt();
    await subscriber.connectMqtt();
    
    // Subscribe to publisher's data
    await subscriber.subscribeToDevice(publisherId);
    
    console.log('\n\x1b[34m========================================================\x1b[0m');
    console.log('\x1b[34m🚀 Secure communication channel established! 🚀\x1b[0m');
    console.log('\x1b[34m========================================================\x1b[0m\n');
    
    // Set up message handler for subscriber
    subscriber.setMessageHandler((topic, data) => {
      console.log(`\n\x1b[32m💡 Subscriber received data: Temperature: ${data.temperature.toFixed(2)}°C, Humidity: ${data.humidity.toFixed(2)}%, Message #${data.messageNumber}\x1b[0m`);
    });
    
    // Enable raw mode for Enter key detection
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    // Set up Enter key detection
    process.stdin.on('data', (key) => {
      // Check if Enter key is pressed (outside of readline question)
      const keyCode = key.toString();
      
      if ((keyCode === '\r' || keyCode === '\n') && !global.menuActive) {
        // Show menu when Enter is pressed
        showMenu();
        promptUser(publisher, subscriber);
      } else if (keyCode === '\u0003') {
        // Handle Ctrl+C
        process.emit('SIGINT');
      }
    });
    
    console.log('[MENU] Press Enter key anytime to show the command menu');
    
    // Start with normal logging enabled
    setLogging(true);
    
    // Show command menu and start accepting user input
    showMenu();
    promptUser(publisher, subscriber);
    
    // Handle interruption
    process.on('SIGINT', () => {
      console.log('\n\x1b[33mShutting down devices...\x1b[0m');
      if (dataInterval) {
        clearInterval(dataInterval);
      }
      publisher.disconnect();
      subscriber.disconnect();
      process.exit(0);
    });
  } catch (error) {
    console.error('\n\x1b[31mSimulation error:\x1b[0m', error);
    process.exit(1);
  }
}

// Run the simulation
runSimulation();

