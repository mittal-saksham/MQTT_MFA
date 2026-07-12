# MQTT Multi-Layer Security Framework

A lightweight application-layer security framework for MQTT-based IoT deployments. Combines Cuckoo-filter pre-authentication, multi-factor device binding with one-time keys, AES-128-GCM authenticated encryption, and heartbeat-driven anomaly detection — all without trusting the broker.

---

## Architecture

The framework enforces security at four independent layers:

| Layer | Purpose | Module |
|---|---|---|
| 1 — Pre-authentication | O(1) Cuckoo-filter gate rejects unknown device IDs before any DB or crypto work | `src/auth/cuckooFilter.js` |
| 2 — Multi-factor binding | Static secret (Factor 1) + time-bounded OTK challenge (Factor 2) | `src/auth/mfaService.js`, `src/auth/otk.js` |
| 3 — Authenticated encryption | AES-128-GCM with per-message IV; broker never sees plaintext | `src/encryption/aesGCM.js` |
| 4 — Liveness & replay defense | Heartbeats with strict sequence numbers and sliding-window validation | `src/heartbeat/monitor.js` |

The central authentication server (`src/server.js`) exposes a REST API for registration and the three-step MFA handshake. Once authenticated, the publisher derives a session key and uses it for all MQTT payload encryption. Subscribers fetch the corresponding key from the server before decrypting.

---

## Repository Structure

```
mittal-saksham-mqtt_mfa/
├── runServer.js              # Entry point: central auth server
├── runPublisher.js           # Entry point: simulated IoT publisher
├── runSubscriber.js          # Entry point: subscriber client
├── chaos.js                  # Chaos monkey: random attack injector
├── visualize.py              # Generates result plots from CSV logs
├── package.json
│
├── attacks/                  # Adversarial scripts for evaluation
│   ├── brute.js              # Brute-force credential attack
│   ├── flood.js              # Connection / publish flooding
│   ├── replay.js             # Replay attack (resends old encrypted packets)
│   ├── rogue.js              # Rogue-device injection
│   └── tamper.js             # Payload tampering / bit flips
│
└── src/
    ├── server.js             # Express REST API + MQTT broker hooks
    ├── auth/
    │   ├── cuckooFilter.js   # Layer 1: probabilistic device gate
    │   ├── mfaService.js     # Layer 2: handshake orchestrator
    │   └── otk.js            # Layer 2: one-time key store
    ├── encryption/
    │   └── aesGCM.js         # Layer 3: AES-128-GCM cipher
    ├── heartbeat/
    │   └── monitor.js        # Layer 4: liveness + sequence tracking
    ├── mqtt/
    │   ├── mqttClient.js     # Publisher-side secure client
    │   ├── mqttSever.js      # Broker-side handlers
    │   └── mqttSubscriber.js # Subscriber-side secure client
    └── utils/
        ├── deviceSimulator.js   # Simulated publisher device
        └── subscriberDevice.js  # Simulated subscriber client
```

---

## Prerequisites

- **Node.js** v18 or higher
- **Mosquitto** MQTT broker running locally on the default port (1883)
- **Python 3.9+** with `pandas` and `matplotlib` (only for `visualize.py`)

Install Mosquitto:
```bash
# macOS
brew install mosquitto && brew services start mosquitto

# Ubuntu / Debian
sudo apt install mosquitto mosquitto-clients
sudo systemctl start mosquitto
```

---

## Setup

```bash
git clone <repo-url>
cd mittal-saksham-mqtt_mfa
npm install
```

Create a `.env` file in the project root (optional — sensible defaults are used otherwise):

```
SERVER_PORT=3000
MQTT_BROKER_URL=mqtt://localhost:1883
```

---

## Running the Framework

Open four terminals.

**Terminal 1 — Authentication server:**
```bash
node runServer.js
```

**Terminal 2 — Publisher (IoT device):**
```bash
node runPublisher.js
```
Note the `publisher-XXXX` ID printed on startup; you will need it for the subscriber.

**Terminal 3 — Subscriber:**
```bash
node runSubscriber.js
```
When prompted, paste the publisher ID from Terminal 2.

**Terminal 4 — (Optional) Chaos monkey:**
```bash
node chaos.js
```
Launches randomized attacks every 5–10 seconds while the legitimate session is running.

---

## Running Individual Attacks

Each attack module under `attacks/` is independently executable for targeted experiments:

```bash
node attacks/brute.js        # Brute-force the auth endpoint
node attacks/flood.js        # Flood the broker with connections
node attacks/replay.js       # Capture and replay a valid packet
node attacks/rogue.js        # Connect as an unregistered device
node attacks/tamper.js       # Modify a ciphertext in transit
```

Each attack logs its outcome (rejected / accepted / blocked) to stdout.

---

## Generating Result Plots

The subscriber writes per-message latency and crypto-time data to `experiment_data.csv`. After a run:

```bash
python visualize.py
```

This regenerates the latency, throughput, CDF, and cryptographic-overhead figures from your run's CSV log (figures are not committed to the repo — they are produced from your own experiment data).

---

## Configuration Reference

| Variable | Default | Description |
|---|---|---|
| `SERVER_PORT` | `3000` | REST API port for the auth server |
| `MQTT_BROKER_URL` | `mqtt://localhost:1883` | Mosquitto broker endpoint |
| `PUBLISH_INTERVAL` | `3000` ms | Publisher message frequency (in `runPublisher.js`) |
| `HEARTBEAT_INTERVAL` | `5000` ms (code default; `.env.example` uses `8000`) | Heartbeat frequency (in `src/mqtt/mqttClient.js` / `mqttSubscriber.js`) |
| Session validity | `4 min` | Auto re-authentication trigger (in `deviceSimulator.js`) |

---

## Known limitations (research prototype)

This is a research/thesis prototype, and several simplifications are deliberate.
They are listed here so the threat model is honest:

- **The OTK (second factor) is returned in-band** in the factor-1 HTTP response
  rather than delivered over a separate channel (SMS/email/TPM). Both factors
  therefore share one channel; a production system needs true out-of-band delivery.
- **The session key is delivered unwrapped**, and the
  `GET /api/devices/:targetId/key` helper endpoint is unauthenticated — it exists
  so the subscriber simulation can decrypt traffic, but in a real deployment it
  would defeat the encryption layer. A proper key-exchange (e.g. ECDH) is future work.
- **Cuckoo-filter pre-auth is probabilistic**: it has a small false-positive rate
  by design, which is why it is only layer 1 of 4 and is benchmarked (not trusted)
  as an authentication mechanism.
- **A synthetic 30–60 ms network delay is injected** before publishing
  (`src/mqtt/mqttClient.js`) to emulate a WAN hop on localhost; reported
  end-to-end latencies include this simulated component.
- Single-process, in-memory state throughout — no persistence or clustering.

A follow-up repo, [MQTT-2-layer](https://github.com/mittal-saksham/MQTT-2-layer),
isolates the two authentication layers and ships the full reproducible
attack-benchmark suite (brute force, OTK brute force, false-positive sweep,
session flood) with committed CSVs and figures.

---

## Owners

- **Saksham Mittal** 
- **Vaishant Sharma** 
