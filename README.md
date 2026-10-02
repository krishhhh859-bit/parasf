# PARA SF: FOREST ACCURACY

A competitive, 2-player multiplayer browser FPS accuracy challenge built with Three.js, Node.js, Express, and Socket.IO.

Inspired by fictional 10 PARA SF Commando operations, two players connect from different devices (PC or Mobile) into a synchronized 3D woodland environment to compete in a 4-minute target engagement duel.

---

## 🎖️ Game Overview

- **Format:** Exactly 2 Players per match.
- **Match Duration:** 4:00 Minutes (240 Seconds), strictly server-authoritative.
- **Environment:** 3D Woodland / Tactical Forest with rolling terrain, pine trees, rocks, and sandbag firing covers.
- **Targets:** Six physical boards per 5-second round, printed with `client/assets/logos/terrorist-reference.png`; boards move during the final 60 seconds.
- **Scoring:** Each active board awards +1 once. Highest target count at 00:00 wins (or Draw if tied).
- **Cross-Platform:** PC and Mobile players can join the same room and compete fairly.

---

## 🕹️ Controls Guide

### PC / Laptop Controls
| Action | Key / Input | Description |
| :--- | :--- | :--- |
| **Move** | `W`, `A`, `S`, `D` | Commando movement within firing line |
| **Look** | Mouse (PointerLock) | 360° first-person aim look |
| **Shoot** | `LMB` (Left Click) | Fires TAR-21 Commando Bullpup Rifle |
| **Scope** | `RMB` (Right Click) | 4x Optical zoom with mil-dot reticle overlay |
| **Steady Aim** | `Q` | Precision steady aim focus mode |
| **Reload** | `R` | Reload 30-round magazine (2.2s server-validated) |

### Mobile / Tablet Touch Controls
| Control Area | Action |
| :--- | :--- |
| **Lower Left** | **Virtual Joystick:** Smooth dynamic thumbstick for movement |
| **Right Screen** | **Touch Swipe:** Drag anywhere on right half to aim camera |
| **[ FIRE ] Button** | Large tactical red trigger button on bottom-right |
| **[ SCOPE ] Button** | Toggle 4x Optical scope overlay |
| **[ AIM ] Button** | Toggle precision steady aim |
| **[ RELOAD ] Button** | Reload magazine |

---

## ⚡ Multiplayer & Server-Authoritative Architecture

All critical match states are calculated and verified on the server:
1. **Server-Authoritative Clock:** 240s timer synchronized via Socket.IO broadcasts down to `00:00`.
2. **Authoritative Target Rounds:** The server activates a varied board arrangement every 5 seconds and broadcasts target IDs and positions at 30 Hz. Boards move during the final 60 seconds.
3. **Server Hit Validation:** The client sends the first board ID along its unobstructed shot ray. The server verifies the active board plane, range blockers, and one-hit-per-board state before awarding a point.
4. **Authoritative Ammo & Anti-Spam:** Rate limiting (~110ms min fire interval) and server-tracked magazine capacity prevent speed hacking and ammo modification.
5. **6-Character Room Codes:** Unique alphanumeric codes (e.g. `K7P4X9`) for instant match pairing and shareable invite links (`?room=CODE`).

---

## 🚀 Quick Start (Local Setup)

### Prerequisites
- [Node.js](https://nodejs.org/) (v16.0.0 or higher recommended)
- `npm` (v8.0.0 or higher)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Game Server
```bash
npm start
```
or for development:
```bash
npm run dev
```

### 3. Open in Browser
- **Player 1 (Host):** Open [http://localhost:3000](http://localhost:3000)
- Select device (`PC` or `MOBILE`), click **CREATE MATCH**, and copy the Room Code (e.g., `K7P4X9`).
- **Player 2 (Joiner):** Open [http://localhost:3000](http://localhost:3000) (or via LAN IP), click **JOIN MATCH**, enter the 6-character room code, and join.

---

## 📱 Cross-Device LAN Play (PC vs Mobile)

When running the server, the terminal will display your local network IP:
```text
====================================================
  PARA SF: FOREST ACCURACY - MULTIPLAYER SERVER
====================================================
> Local Server:     http://localhost:3000
> Mobile/LAN Access: http://192.168.1.100:3000
====================================================
```

1. Ensure both your PC and Mobile device are connected to the same Wi-Fi network.
2. On your mobile device, open Chrome/Safari and visit the LAN URL: `http://<YOUR-IP>:3000` (e.g. `http://192.168.1.100:3000`).
3. Select **MOBILE** on your phone and **PC** on your computer.
4. Create a room on PC, enter the code on Mobile, and enjoy the synchronized duel!

---

## 📁 Project Structure

```
.
├── server/
│   ├── server.js              # Express static server & Socket.IO message gateway
│   ├── config.js              # Authoritative weapon specs, target bounds & timer
│   ├── roomManager.js         # 2-player matchmaking, room codes & rematch logic
│   └── matchManager.js        # Server clock, target AI, and raycast hit validation
│
├── client/
│   ├── index.html             # Multi-screen layout (Device select, Loading, Lobby, HUD, Results)
│   ├── styles.css             # Dark olive military UI, glassmorphic HUD & responsive touch
│   ├── assets/
│   │   └── logos/             # Indian Army & PARA SF vector insignias
│   └── src/
│       ├── main.js            # App coordinator & state router
│       ├── config.js          # Client constants & graphics settings
│       ├── audio.js           # Procedural Web Audio synthesizer (gunfire, reloads, hits, wind)
│       ├── networking.js      # Socket.IO client interface
│       ├── loading.js         # Multi-stage asset loader
│       ├── environment.js     # 3D procedural woodland (trees, rocks, sandbags, lighting)
│       ├── playerModel.js     # 3D PARA SF Commando model with idle breathing & gear
│       ├── weapon.js          # Viewmodel TAR-21 rifle with muzzle flash & reload animation
│       ├── target.js          # Moving fictional target with smooth interpolation & hit markers
│       ├── controls.js        # PC PointerLock WASD + Scope/Aim controls
│       ├── mobileControls.js  # Mobile touch joystick, camera swipe zone & action buttons
│       ├── lobby.js           # Interactive 3D Commando viewer in lobby
│       └── ui.js              # HUD updates, scoreboard, modals & tactical toasts
│
├── package.json
└── README.md
```

---

## 🌐 Production Deployment

This project is fully deployment-ready for standard Node.js hosting environments:
- **Render / Railway / Heroku:** Connect repository, set build command to `npm install`, and start command to `npm start`.
- **Docker:**
  ```dockerfile
  FROM node:20-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN npm install --production
  COPY . .
  EXPOSE 3000
  CMD ["npm", "start"]
  ```

---

## 🛠️ Troubleshooting

- **Audio not playing?** Browser autoplay policies require a user interaction (click or touch) before enabling Web Audio. Clicking anywhere on the screen activates the procedural audio engine.
- **Pointer Lock on PC:** Click inside the game area to lock the mouse cursor. Press `ESC` at any time to release.
- **Room Code Invalid:** Room codes are 6 characters long and case-insensitive. Ensure the host is in the waiting room before the second player joins.
