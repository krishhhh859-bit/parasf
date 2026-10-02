/**
 * Verification test for target hit detection across all scenarios:
 * - short, medium, long range targets
 * - moving targets with latency
 * - rotated targets (various yaws)
 * - blocked shots vs clear line of sight
 */

const MatchManager = require('./matchManager');
const config = require('./config');

// Setup mock room and io
const room = {
  code: 'TEST_ROOM',
  players: {
    'socket_1': { slot: 1, name: 'Commando 1' }
  }
};

const io = {
  to: () => ({ emit: () => {} }),
  sockets: { sockets: new Map() }
};

const manager = new MatchManager(room, io);
manager.startTime = Date.now() - 10000;
manager.endTime = manager.startTime + 240000;
manager.state = 'PLAYING';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    passedTests++;
    console.log(`✔ PASS: ${message}`);
  }
}

// 1. Short-range target test (e.g. z = -12, distance ~13m)
console.log('\n--- 1. SHORT-RANGE TARGET TEST ---');
const nearTarget = {
  id: 'near-target-1',
  spawnIndex: 0,
  path: manager.buildMovementPath(0, -13, 0),
  x: 0,
  y: manager.terrainHeight(0, -13),
  z: -13,
  yaw: 0,
  active: true,
  hitboxDisabled: false,
  state: 'ACTIVE'
};
manager.rangeTargets = [nearTarget];

const shooterOrigin = { x: -4, y: 1.7, z: 0 };
// Aim directly at nearTarget center: (0, nearTarget.y + 2.1, -13)
let targetCenter = { x: nearTarget.x, y: nearTarget.y + 2.1, z: nearTarget.z };
let dx = targetCenter.x - shooterOrigin.x;
let dy = targetCenter.y - shooterOrigin.y;
let dz = targetCenter.z - shooterOrigin.z;
let len = Math.hypot(dx, dy, dz);

let shot = {
  origin: shooterOrigin,
  direction: { x: dx / len, y: dy / len, z: dz / len },
  targetId: nearTarget.id
};

let hit = manager.validateRangeTargetHit(shot);
assert(hit && hit.target.id === nearTarget.id, 'Short-range center shot hits target');

// Aim at short-range target without targetId (null targetId)
let shotNoId = {
  origin: shooterOrigin,
  direction: { x: dx / len, y: dy / len, z: dz / len },
  targetId: null
};
let hitNoId = manager.validateRangeTargetHit(shotNoId);
assert(hitNoId && hitNoId.target.id === nearTarget.id, 'Short-range shot with null targetId still validates authoritatively');

// Aim at edge of short-range target board (width 2.8m, edge at x = +1.3m)
let edgePoint = { x: nearTarget.x + 1.3, y: nearTarget.y + 2.1, z: nearTarget.z };
dx = edgePoint.x - shooterOrigin.x; dy = edgePoint.y - shooterOrigin.y; dz = edgePoint.z - shooterOrigin.z;
len = Math.hypot(dx, dy, dz);
let edgeHit = manager.validateRangeTargetHit({ origin: shooterOrigin, direction: { x: dx / len, y: dy / len, z: dz / len }, targetId: nearTarget.id });
assert(edgeHit && edgeHit.target.id === nearTarget.id, 'Short-range board edge shot hits target');

// Clear miss (aim far to the left of the board)
let missPoint = { x: nearTarget.x - 4.0, y: nearTarget.y + 2.1, z: nearTarget.z };
dx = missPoint.x - shooterOrigin.x; dy = missPoint.y - shooterOrigin.y; dz = missPoint.z - shooterOrigin.z;
len = Math.hypot(dx, dy, dz);
let missHit = manager.validateRangeTargetHit({ origin: shooterOrigin, direction: { x: dx / len, y: dy / len, z: dz / len }, targetId: nearTarget.id });
assert(missHit === null, 'Clear miss does NOT register a hit');

// Duplicate hit prevention: after target is marked FALLING and hitboxDisabled = true
nearTarget.state = 'FALLING';
nearTarget.hitboxDisabled = true;
let duplicateHit = manager.validateRangeTargetHit(shot);
assert(duplicateHit === null, 'Previously hit board (FALLING) does not award duplicate hits');
nearTarget.state = 'ACTIVE';
nearTarget.hitboxDisabled = false;

// 2. Medium-range target test (e.g. z = -35, distance ~37m)
console.log('\n--- 2. MEDIUM-RANGE TARGET TEST ---');
const midTarget = {
  id: 'mid-target-1',
  spawnIndex: 7,
  path: manager.buildMovementPath(8, -35, 1),
  x: 8,
  y: manager.terrainHeight(8, -35),
  z: -35,
  yaw: 0,
  active: true,
  hitboxDisabled: false,
  state: 'ACTIVE'
};
manager.rangeTargets = [midTarget];

targetCenter = { x: midTarget.x, y: midTarget.y + 2.1, z: midTarget.z };
dx = targetCenter.x - shooterOrigin.x; dy = targetCenter.y - shooterOrigin.y; dz = targetCenter.z - shooterOrigin.z;
len = Math.hypot(dx, dy, dz);
hit = manager.validateRangeTargetHit({ origin: shooterOrigin, direction: { x: dx / len, y: dy / len, z: dz / len }, targetId: midTarget.id });
assert(hit && hit.target.id === midTarget.id, 'Medium-range center shot hits target');

// 3. Long-range target test (e.g. z = -72, distance ~75m)
console.log('\n--- 3. LONG-RANGE TARGET TEST ---');
const farTarget = {
  id: 'far-target-1',
  spawnIndex: 18,
  path: manager.buildMovementPath(-8, -68, 2),
  x: -8,
  y: manager.terrainHeight(-8, -68),
  z: -68,
  yaw: 0,
  active: true,
  hitboxDisabled: false,
  state: 'ACTIVE'
};
manager.rangeTargets = [farTarget];

targetCenter = { x: farTarget.x, y: farTarget.y + 2.1, z: farTarget.z };
dx = targetCenter.x - shooterOrigin.x; dy = targetCenter.y - shooterOrigin.y; dz = targetCenter.z - shooterOrigin.z;
len = Math.hypot(dx, dy, dz);
hit = manager.validateRangeTargetHit({ origin: shooterOrigin, direction: { x: dx / len, y: dy / len, z: dz / len }, targetId: farTarget.id });
assert(hit && hit.target.id === farTarget.id, 'Long-range center shot hits target reliably');

// Aim at lower half of far target
let lowerFarPoint = { x: farTarget.x, y: farTarget.y + 0.6, z: farTarget.z };
dx = lowerFarPoint.x - shooterOrigin.x; dy = lowerFarPoint.y - shooterOrigin.y; dz = lowerFarPoint.z - shooterOrigin.z;
len = Math.hypot(dx, dy, dz);
let lowerHit = manager.validateRangeTargetHit({ origin: shooterOrigin, direction: { x: dx / len, y: dy / len, z: dz / len }, targetId: farTarget.id });
assert(lowerHit && lowerHit.target.id === farTarget.id, 'Long-range lower board shot is NOT falsely blocked by terrain');

// 4. Moving target with network latency test
console.log('\n--- 4. MOVING TARGET WITH LATENCY TEST ---');
const movingTarget = {
  id: 'moving-target-1',
  spawnIndex: 2,
  path: {
    pathType: 0,
    baseX: 0,
    baseZ: -25,
    halfAmpX: 15,
    halfAmpZ: 0,
    speed: 0.25, // moving fast horizontally
    phase: 0
  },
  x: 0,
  y: manager.terrainHeight(0, -25),
  z: -25,
  yaw: 0,
  active: true,
  hitboxDisabled: false,
  state: 'ACTIVE'
};
manager.rangeTargets = [movingTarget];

// Evaluate target at now vs 70ms ago
const nowElapsed = (Date.now() - manager.startTime) / 1000;
const currentPos = manager.evalTargetPos(movingTarget.path, nowElapsed);
movingTarget.x = currentPos.x; movingTarget.z = currentPos.z;
movingTarget.y = manager.terrainHeight(currentPos.x, currentPos.z);

// Player aimed at where target was 80ms ago
const clientElapsed = nowElapsed - 0.08;
const clientPos = manager.evalTargetPos(movingTarget.path, clientElapsed);
const clientAimPoint = { x: clientPos.x, y: manager.terrainHeight(clientPos.x, clientPos.z) + 2.1, z: clientPos.z };
dx = clientAimPoint.x - shooterOrigin.x; dy = clientAimPoint.y - shooterOrigin.y; dz = clientAimPoint.z - shooterOrigin.z;
len = Math.hypot(dx, dy, dz);

let movingHit = manager.validateRangeTargetHit({ origin: shooterOrigin, direction: { x: dx / len, y: dy / len, z: dz / len }, targetId: movingTarget.id });
assert(movingHit && movingHit.target.id === movingTarget.id, 'Fast moving target hit validated despite 80ms client-server latency');

// 5. Rotated target test (e.g. yaw = 35 deg, yaw = 60 deg)
console.log('\n--- 5. ROTATED TARGET TEST ---');
const rotatedTarget = {
  id: 'rotated-target-1',
  spawnIndex: 3,
  path: manager.buildMovementPath(5, -20, 0),
  x: 5,
  y: manager.terrainHeight(5, -20),
  z: -20,
  yaw: 0.6, // ~35 degrees rotated
  active: true,
  hitboxDisabled: false,
  state: 'ACTIVE'
};
manager.rangeTargets = [rotatedTarget];

targetCenter = { x: rotatedTarget.x, y: rotatedTarget.y + 2.1, z: rotatedTarget.z };
dx = targetCenter.x - shooterOrigin.x; dy = targetCenter.y - shooterOrigin.y; dz = targetCenter.z - shooterOrigin.z;
len = Math.hypot(dx, dy, dz);
let rotHit = manager.validateRangeTargetHit({ origin: shooterOrigin, direction: { x: dx / len, y: dy / len, z: dz / len }, targetId: rotatedTarget.id });
assert(rotHit && rotHit.target.id === rotatedTarget.id, 'Rotated target (yaw = 35 deg) hits target board reliably');

// Test 60 degrees rotation
rotatedTarget.yaw = 1.05; // ~60 degrees
rotHit = manager.validateRangeTargetHit({ origin: shooterOrigin, direction: { x: dx / len, y: dy / len, z: dz / len }, targetId: rotatedTarget.id });
assert(rotHit && rotHit.target.id === rotatedTarget.id, 'Rotated target (yaw = 60 deg) hits target board reliably');

// 6. Blocked shot vs Clear line of sight
console.log('\n--- 6. OBSTRUCTION / BLOCKER TEST ---');
// Tree blocker at [10, -36]
const behindTreeTarget = {
  id: 'behind-tree-1',
  spawnIndex: 4,
  path: manager.buildMovementPath(10, -42, 0),
  x: 10,
  y: manager.terrainHeight(10, -42),
  z: -42, // directly behind tree at (10, -36)
  yaw: 0,
  active: true,
  hitboxDisabled: false,
  state: 'ACTIVE'
};
manager.rangeTargets = [behindTreeTarget];

// Shooter at (10, 1.7, 0) shooting straight along x = 10 into the tree trunk at (10, -36)
const treeShooter = { x: 10, y: 1.7, z: 0 };
dx = behindTreeTarget.x - treeShooter.x; dy = (behindTreeTarget.y + 2.1) - treeShooter.y; dz = behindTreeTarget.z - treeShooter.z;
len = Math.hypot(dx, dy, dz);
let blockedHit = manager.validateRangeTargetHit({ origin: treeShooter, direction: { x: dx / len, y: dy / len, z: dz / len }, targetId: behindTreeTarget.id });
assert(blockedHit === null, 'Shot directly hitting a tree trunk is properly BLOCKED');

// Shot passing near tree trunk at (10, -36) with clear line of sight
const clearTarget = {
  id: 'clear-target-1',
  spawnIndex: 5,
  path: manager.buildMovementPath(8, -36, 0),
  x: 8, // 2 meters away from tree trunk at (10, -36)
  y: manager.terrainHeight(8, -36),
  z: -36,
  yaw: 0,
  active: true,
  hitboxDisabled: false,
  state: 'ACTIVE'
};
manager.rangeTargets = [clearTarget];
const gapShooter = { x: 0, y: 1.7, z: 0 };
dx = clearTarget.x - gapShooter.x; dy = (clearTarget.y + 2.1) - gapShooter.y; dz = clearTarget.z - gapShooter.z;
len = Math.hypot(dx, dy, dz);
let clearHit = manager.validateRangeTargetHit({ origin: gapShooter, direction: { x: dx / len, y: dy / len, z: dz / len }, targetId: clearTarget.id });
assert(clearHit && clearHit.target.id === clearTarget.id, 'Shot through clear gap near tree trunk is NOT falsely blocked');

console.log(`\n========================================`);
console.log(`TEST SUMMARY: ${passedTests}/${totalTests} tests passed`);
console.log(`========================================`);
if (passedTests !== totalTests) {
  process.exit(1);
}
