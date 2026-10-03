/**
 * PARA SF: FOREST ACCURACY - Client Configuration & Constants
 */

export const GAME_CONFIG = {
  TITLE: 'PARA SF: FOREST ACCURACY',
  SUBTITLE: 'SPECIAL FORCES ACCURACY CHALLENGE',
  
  // Game limits
  MATCH_DURATION_SECONDS: 240, // 4 minutes
  DEFAULT_PORT: 3000,
  
  // Weapon Specs (TAR-21 Style Fictional Bullpup Commando Rifle)
  WEAPON: {
    NAME: 'TAR-21 PARA SF',
    MAGAZINE_SIZE: 30,
    TOTAL_RESERVE: 120,
    FIRE_RATE_MS: 110,
    RELOAD_TIME_MS: 3480, // Matches reloading-gun.mp3 duration (~3.48s)
    NORMAL_FOV: 65,
    SCOPE_FOV: 28,      // RMB Scope FOV (High Magnification)
    AIM_FOV: 46,        // Q Steady Aim FOV
    RECOIL_FORCE: 0.05,
    RECOIL_RECOVERY: 0.12
  },

  // Player Physics & Movement (Player at firing line Z = 0..10, looking at forward forest -Z)
  PLAYER: {
    HEIGHT: 1.7,
    MOVE_SPEED: 7.5,
    ACCELERATION: 18.0,
    DECELERATION: 12.0,
    MOUSE_SENSITIVITY: 0.0022,
    TOUCH_SENSITIVITY: 0.0035,
    // Movement is locked — player stays at designated firing position.
    // BOUNDS kept for legacy reference but are NOT used for movement.
    BOUNDS: {
      minX: -26,
      maxX: 26,
      minZ: -8,
      maxZ: 14
    }
  },

  // Graphics settings
  GRAPHICS: {
    SHADOW_MAP_SIZE: 2048,
    FOG_DENSITY: 0.015,
    FOG_COLOR: 0x1a261a, // Dark military olive woodland fog
    SKY_COLOR: 0x243324,
    TREE_COUNT: 75,
    ROCK_COUNT: 45,
    GRASS_PATCH_COUNT: 120
  }
};
