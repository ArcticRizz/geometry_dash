const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  menuOverlay: document.getElementById("menu-overlay"),
  deathOverlay: document.getElementById("death-overlay"),
  clearOverlay: document.getElementById("clear-overlay"),
  levelList: document.getElementById("level-list"),
  playButton: document.getElementById("play-button"),
  practiceButton: document.getElementById("practice-button"),
  resetProgressButton: document.getElementById("reset-progress-button"),
  retryButton: document.getElementById("retry-button"),
  deathMenuButton: document.getElementById("death-menu-button"),
  nextLevelButton: document.getElementById("next-level-button"),
  clearReplayButton: document.getElementById("clear-replay-button"),
  clearMenuButton: document.getElementById("clear-menu-button"),
  clearTitle: document.getElementById("clear-title"),
  clearSubtitle: document.getElementById("clear-subtitle"),
  deathSubtitle: document.getElementById("death-subtitle"),
  menuButton: document.getElementById("menu-button"),
  hudLevelName: document.getElementById("hud-level-name"),
  hudProgressText: document.getElementById("hud-progress-text"),
  hudModeText: document.getElementById("hud-mode-text"),
  hudProgressFill: document.getElementById("hud-progress-fill"),
  hudAttempts: document.getElementById("hud-attempts"),
  summaryUnlocked: document.getElementById("summary-unlocked"),
  summaryCompleted: document.getElementById("summary-completed"),
  summaryAttempts: document.getElementById("summary-attempts"),
};

const STORAGE_KEY = "pulse-runner-save-v2";
const CAMERA_X = 260;
const TILE = 56;
const BASE_GROUND_Y = 586;
const PLAYER_SIZE = 38;
const SCROLL_SPEED = 470;
const GRAVITY = 2460;
const JUMP_VELOCITY = 598;
const HOLD_BOOST = 170;
const MAX_HOLD_TIME = 0.028;
const DEATH_RESTART_DELAY = 0.42;

let audioContext = null;
let musicState = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const full = normalized.length === 3
    ? normalized.split("").map((char) => `${char}${char}`).join("")
    : normalized;

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.save));
}

function applyDifficultyPass(level, index) {
  const densityScale = 0.88 - index * 0.015;
  const safeLead = 160;

  level.objects.forEach((object) => {
    object.x = safeLead + (object.x - safeLead) * densityScale;

    if (object.type === "spike") {
      object.width *= index >= 4 ? 1.22 : 1.14;
      object.height *= index >= 4 ? 1.22 : 1.14;
      object.y = object.height > 38 ? object.y - (object.height - 38) : object.y;
    }

    if (object.type === "gap") {
      object.width *= index >= 5 ? 1.24 : 1.14;
    }

    if (object.type === "block") {
      object.width *= index >= 4 ? 0.82 : 0.9;
    }

    if (object.type === "pad") {
      object.width *= 0.82;
    }

    if (object.type === "mover") {
      object.width *= 1.18;
      object.speed *= index >= 5 ? 1.28 : 1.16;
      object.span *= index >= 5 ? 1.18 : 1.08;
    }
  });

  level.length *= densityScale;
}

function addFinalePattern(level, startBeat, index) {
  addPortal(level, startBeat + 0.6);
  addSpikeRow(level, startBeat + 3.1, 4, 0.14, index % 2);
  addGap(level, startBeat + 6.1, 1.56);
  addMover(level, startBeat + 9.4, index % 2, 82, 4.2 + index * 0.08);
  addSpike(level, startBeat + 12.4, index % 2);
  addGap(level, startBeat + 15.3, 1.62);
}

function addMarathonSections(level, startBeat, index) {
  let beat = startBeat;
  let section = 0;

  while (beat < level.lengthBeats - 24) {
    addExtensionPattern(level, beat, index + section);

    if (section % 3 === 1) {
      addSpikeRow(level, beat + 17.2, 2 + (index % 2), 0.14, (section + index) % 2);
    }

    if (section % 4 === 2) {
      addGap(level, beat + 18.2, 1.44 + (index % 3) * 0.04);
    }

    beat += 19;
    section += 1;
  }

  addFinalePattern(level, level.lengthBeats - 20, index);
}

function createLevel(index, config) {
  const level = {
    id: index + 1,
    title: config.title,
    theme: config.theme,
    bpm: config.bpm,
    beatWidth: config.beatWidth || 132,
    skyGlow: config.skyGlow || config.theme,
    groundGlow: config.groundGlow || config.theme,
    accent: config.accent || "#ffffff",
    lengthBeats: config.lengthBeats,
    objects: [],
  };

  config.build(level);
  addMarathonSections(level, config.marathonStart || Math.max(56, Math.floor(level.lengthBeats * 0.15)), index);
  level.length = level.lengthBeats * level.beatWidth;
  applyDifficultyPass(level, index);
  return level;
}

function addSpike(level, beat, lane = 0, width = 1) {
  level.objects.push({
    type: "spike",
    x: beat * level.beatWidth,
    y: lane === 0 ? BASE_GROUND_Y - 38 : BASE_GROUND_Y - TILE - 38,
    width: 38 * width,
    height: 38,
  });
}

function addSpikeRow(level, beat, count, spacing = 0.14, lane = 0) {
  for (let i = 0; i < count; i += 1) {
    addSpike(level, beat + i * spacing, lane);
  }
}

function addBlock(level, beat, lane = 0, widthBeats = 1) {
  level.objects.push({
    type: "block",
    x: beat * level.beatWidth,
    y: lane === 0 ? BASE_GROUND_Y - TILE : BASE_GROUND_Y - TILE * 2,
    width: widthBeats * level.beatWidth,
    height: TILE,
  });
}

function addGap(level, beat, widthBeats = 1) {
  level.objects.push({
    type: "gap",
    x: beat * level.beatWidth,
    width: widthBeats * level.beatWidth,
  });
}

function addPad(level, beat, strength = 1.04) {
  level.objects.push({
    type: "pad",
    x: beat * level.beatWidth + 18,
    y: BASE_GROUND_Y - 14,
    width: 40,
    height: 14,
    strength,
  });
}

function addPortal(level, beat) {
  level.objects.push({
    type: "portal",
    x: beat * level.beatWidth + 12,
    y: BASE_GROUND_Y - TILE * 2 - 22,
    width: 44,
    height: TILE * 2 + 44,
  });
}

function addMover(level, beat, lane = 0, span = 64, speed = 3) {
  const baseY = lane === 0 ? BASE_GROUND_Y - 30 : BASE_GROUND_Y - TILE - 30;
  level.objects.push({
    type: "mover",
    x: beat * level.beatWidth,
    y: baseY,
    baseY,
    width: 48,
    height: 30,
    span,
    speed,
  });
}

function addCheckpoint(level, beat) {
  level.objects.push({
    type: "checkpoint",
    x: beat * level.beatWidth + 10,
    y: BASE_GROUND_Y - TILE * 2 - 10,
    width: 24,
    height: TILE * 2 + 20,
  });
}

function addExtensionPattern(level, startBeat, index) {
  const variant = index % 5;

  if (variant === 0) {
    addSpikeRow(level, startBeat + 0.6, 4, 0.14);
    addGap(level, startBeat + 2.7, 1.34);
    addBlock(level, startBeat + 5.5, 0, 0.84);
    addSpike(level, startBeat + 6.62, 1);
    addPad(level, startBeat + 8.9, 1.08);
    addGap(level, startBeat + 11.7, 1.42);
    addSpikeRow(level, startBeat + 15, 3, 0.14);
  } else if (variant === 1) {
    addGap(level, startBeat + 0.9, 1.28);
    addBlock(level, startBeat + 3.4, 1, 0.82);
    addSpike(level, startBeat + 4.48, 1);
    addSpikeRow(level, startBeat + 6.9, 4, 0.14);
    addGap(level, startBeat + 10, 1.44);
    addPad(level, startBeat + 13, 1.08);
    addBlock(level, startBeat + 16.1, 0, 0.88);
    addSpike(level, startBeat + 17.25, 1);
  } else if (variant === 2) {
    addPortal(level, startBeat + 0.8);
    addSpikeRow(level, startBeat + 3.1, 3, 0.14, 1);
    addGap(level, startBeat + 5.9, 1.4);
    addPortal(level, startBeat + 9);
    addSpikeRow(level, startBeat + 11.7, 4, 0.14);
    addGap(level, startBeat + 15.2, 1.5);
  } else if (variant === 3) {
    addMover(level, startBeat + 1, 0, 78, 3.9 + index * 0.1);
    addGap(level, startBeat + 4.2, 1.4);
    addSpikeRow(level, startBeat + 7.1, 2, 0.14);
    addBlock(level, startBeat + 9.6, 1, 0.8);
    addSpike(level, startBeat + 10.65, 1);
    addPortal(level, startBeat + 13.1);
    addGap(level, startBeat + 16.1, 1.54);
  } else {
    addPad(level, startBeat + 0.9, 1.08);
    addSpikeRow(level, startBeat + 3.2, 3, 0.14);
    addGap(level, startBeat + 5.9, 1.42);
    addMover(level, startBeat + 8.9, 1, 74, 4 + index * 0.08);
    addPortal(level, startBeat + 12.1);
    addSpikeRow(level, startBeat + 14.7, 2, 0.14, 1);
  }
}

const levels = [
  createLevel(0, {
    title: "Starter Pulse",
    theme: "#45b8ff",
    accent: "#b6f3ff",
    bpm: 110,
    lengthBeats: 760,
    marathonStart: 82,
    build(level) {
      addSpike(level, 4);
      addSpike(level, 6.2);
      addGap(level, 9.3, 0.96);
      addBlock(level, 12.2, 0, 1);
      addSpike(level, 13.55, 1);
      addSpikeRow(level, 16.8, 3, 0.19);
      addGap(level, 19.4, 1.02);
      addPad(level, 22, 1.12);
      addSpikeRow(level, 25.2, 2, 0.22);
      addGap(level, 28.1, 1.14);
      addBlock(level, 30.9, 0, 1.05);
      addSpike(level, 32.3, 1);
      addGap(level, 35.1, 1.06);
      addSpikeRow(level, 38.1, 2, 0.2);
      addExtensionPattern(level, 42, 0);
      addExtensionPattern(level, 60, 1);
    },
  }),
  createLevel(1, {
    title: "Grid Bounce",
    theme: "#57f2c1",
    accent: "#d6fff1",
    bpm: 118,
    lengthBeats: 980,
    marathonStart: 92,
    build(level) {
      addSpikeRow(level, 3.5, 2, 0.21);
      addGap(level, 6.8, 0.96);
      addBlock(level, 9.8, 0, 1.05);
      addSpike(level, 11.18, 1);
      addGap(level, 13.9, 1.12);
      addPad(level, 16.8, 1.1);
      addSpikeRow(level, 20.2, 2, 0.2);
      addBlock(level, 23.6, 1, 1);
      addSpike(level, 24.95, 1);
      addGap(level, 28.6, 1.28);
      addSpikeRow(level, 32.4, 3, 0.19);
      addBlock(level, 36.3, 0, 1.12);
      addSpike(level, 37.7, 1);
      addGap(level, 40.8, 1.2);
      addPad(level, 44, 1.12);
      addExtensionPattern(level, 48, 1);
      addExtensionPattern(level, 68, 2);
    },
  }),
  createLevel(2, {
    title: "Mirror Steps",
    theme: "#ffd166",
    accent: "#fff0c2",
    bpm: 126,
    lengthBeats: 1200,
    marathonStart: 110,
    build(level) {
      addBlock(level, 5, 0, 1);
      addSpike(level, 6.4, 1);
      addGap(level, 8.7, 1);
      addBlock(level, 11.7, 1, 1);
      addSpike(level, 13.05, 1);
      addGap(level, 16.1, 1.16);
      addPad(level, 19.1, 1.12);
      addBlock(level, 22.9, 0, 1.15);
      addSpike(level, 24.25, 1);
      addSpike(level, 27.5);
      addGap(level, 31.1, 1.32);
      addBlock(level, 35.2, 1, 1.08);
      addSpike(level, 36.6, 1);
      addGap(level, 40.2, 1.34);
      addSpikeRow(level, 44.2, 3, 0.18);
      addBlock(level, 48.6, 0, 1);
      addSpike(level, 49.95, 1);
      addExtensionPattern(level, 54, 2);
      addExtensionPattern(level, 74, 3);
      addExtensionPattern(level, 92, 0);
    },
  }),
  createLevel(3, {
    title: "Sky Flip",
    theme: "#ff8fab",
    accent: "#ffd7e3",
    bpm: 132,
    lengthBeats: 1450,
    marathonStart: 122,
    build(level) {
      addSpike(level, 4);
      addPad(level, 6.7, 1.1);
      addPortal(level, 9.4);
      addSpike(level, 11.5, 1);
      addBlock(level, 14, 1, 1.1);
      addSpike(level, 15.35, 1);
      addGap(level, 17.6, 1.08);
      addSpike(level, 20.7, 1);
      addPortal(level, 23.8);
      addGap(level, 27.3, 1.22);
      addSpikeRow(level, 31.1, 2, 0.22);
      addPad(level, 34.2, 1.1);
      addPortal(level, 37.2);
      addSpike(level, 39.2, 1);
      addGap(level, 42.4, 1.3);
      addPortal(level, 45.8);
      addSpikeRow(level, 49.1, 2, 0.2, 1);
      addGap(level, 52.9, 1.2);
      addExtensionPattern(level, 58, 3);
      addExtensionPattern(level, 78, 4);
      addExtensionPattern(level, 98, 2);
    },
  }),
  createLevel(4, {
    title: "Neon Conveyor",
    theme: "#9bff7a",
    accent: "#e8ffd4",
    bpm: 138,
    lengthBeats: 1700,
    marathonStart: 136,
    build(level) {
      addMover(level, 4.2, 0, 62, 2.8);
      addSpike(level, 7.2);
      addGap(level, 9.8, 1.08);
      addBlock(level, 12.5, 0, 1.05);
      addSpike(level, 13.85, 1);
      addMover(level, 16.9, 1, 64, 3.1);
      addGap(level, 20.7, 1.24);
      addPad(level, 24.5, 1.12);
      addSpikeRow(level, 28.1, 3, 0.18);
      addPortal(level, 31.7);
      addSpike(level, 34.4, 1);
      addGap(level, 38.1, 1.3);
      addPortal(level, 41.4);
      addMover(level, 44.8, 0, 70, 3.3);
      addSpike(level, 47.8);
      addGap(level, 50.9, 1.28);
      addSpikeRow(level, 54.8, 2, 0.2);
      addBlock(level, 58.1, 1, 1.05);
      addExtensionPattern(level, 62, 4);
      addExtensionPattern(level, 80, 3);
      addExtensionPattern(level, 100, 1);
      addExtensionPattern(level, 118, 0);
    },
  }),
  createLevel(5, {
    title: "Sync Drift",
    theme: "#7ad3ff",
    accent: "#e2f6ff",
    bpm: 144,
    lengthBeats: 1950,
    marathonStart: 148,
    build(level) {
      addSpike(level, 4);
      addGap(level, 6.9, 1.06);
      addBlock(level, 9.8, 1, 1);
      addSpike(level, 11.1, 1);
      addGap(level, 14.2, 1.18);
      addPad(level, 17.7, 1.14);
      addMover(level, 21.4, 0, 68, 3.2);
      addSpike(level, 24.4, 1);
      addPortal(level, 27.4);
      addGap(level, 30.9, 1.3);
      addSpikeRow(level, 34.3, 2, 0.22, 1);
      addBlock(level, 38.1, 1, 1.05);
      addGap(level, 41.8, 1.32);
      addPortal(level, 45.3);
      addSpikeRow(level, 48.7, 3, 0.18);
      addGap(level, 53.2, 1.32);
      addBlock(level, 56.8, 0, 1.05);
      addSpike(level, 58.15, 1);
      addGap(level, 61.5, 1.2);
      addExtensionPattern(level, 66, 5);
      addExtensionPattern(level, 84, 1);
      addExtensionPattern(level, 104, 3);
      addExtensionPattern(level, 124, 2);
    },
  }),
  createLevel(6, {
    title: "Vector Rush",
    theme: "#ffcf5a",
    accent: "#fff0bf",
    bpm: 150,
    lengthBeats: 2200,
    marathonStart: 160,
    build(level) {
      addGap(level, 4.1, 1.08);
      addSpikeRow(level, 7, 3, 0.19);
      addBlock(level, 10.3, 0, 1);
      addSpike(level, 11.7, 1);
      addPad(level, 15.2, 1.12);
      addPortal(level, 18.9);
      addMover(level, 21.8, 1, 66, 3.35);
      addGap(level, 25.6, 1.38);
      addSpike(level, 28.8, 1);
      addBlock(level, 32.4, 1, 1.05);
      addSpike(level, 33.75, 1);
      addGap(level, 36.6, 1.35);
      addPortal(level, 40.1);
      addSpikeRow(level, 43.4, 2, 0.19);
      addGap(level, 47.4, 1.36);
      addMover(level, 51.1, 0, 74, 3.5);
      addSpike(level, 54.1);
      addBlock(level, 57.6, 0, 1.08);
      addSpike(level, 58.95, 1);
      addGap(level, 62.2, 1.34);
      addPortal(level, 65.7);
      addExtensionPattern(level, 70, 6);
      addExtensionPattern(level, 88, 2);
      addExtensionPattern(level, 108, 4);
      addExtensionPattern(level, 128, 1);
      addExtensionPattern(level, 144, 3);
    },
  }),
  createLevel(7, {
    title: "Pulse Reactor",
    theme: "#ff7a7a",
    accent: "#ffe3e3",
    bpm: 156,
    lengthBeats: 2450,
    marathonStart: 174,
    build(level) {
      addSpike(level, 4);
      addGap(level, 7, 1.12);
      addPortal(level, 9.8);
      addSpikeRow(level, 12.9, 2, 0.2, 1);
      addPad(level, 15.8, 1.14);
      addGap(level, 19.1, 1.24);
      addBlock(level, 22.9, 1, 1);
      addSpike(level, 24.25, 1);
      addPortal(level, 27.7);
      addMover(level, 31.2, 0, 70, 3.55);
      addGap(level, 35.1, 1.34);
      addSpikeRow(level, 38.2, 3, 0.18);
      addBlock(level, 42.4, 0, 1.12);
      addSpike(level, 43.75, 1);
      addGap(level, 47.2, 1.44);
      addPortal(level, 50.8);
      addSpike(level, 53.1, 1);
      addGap(level, 56.8, 1.34);
      addMover(level, 60.2, 1, 72, 3.7);
      addPortal(level, 64.2);
      addSpike(level, 67.1);
      addExtensionPattern(level, 74, 7);
      addExtensionPattern(level, 94, 4);
      addExtensionPattern(level, 116, 2);
      addExtensionPattern(level, 136, 0);
      addExtensionPattern(level, 154, 3);
    },
  }),
  createLevel(8, {
    title: "Prism Climb",
    theme: "#b18cff",
    accent: "#efe6ff",
    bpm: 164,
    lengthBeats: 2700,
    marathonStart: 190,
    build(level) {
      addBlock(level, 4.2, 0, 1);
      addSpike(level, 5.6, 1);
      addGap(level, 8.1, 1.16);
      addPad(level, 11.3, 1.18);
      addPortal(level, 14.2);
      addSpike(level, 17.1, 1);
      addMover(level, 20.1, 1, 68, 3.6);
      addGap(level, 24.1, 1.38);
      addSpikeRow(level, 27.8, 2, 0.2, 1);
      addBlock(level, 31.8, 1, 1.02);
      addGap(level, 35.7, 1.42);
      addPortal(level, 39.2);
      addSpikeRow(level, 42.9, 3, 0.18);
      addGap(level, 47.6, 1.38);
      addPad(level, 51.5, 1.2);
      addBlock(level, 55.5, 0, 1.15);
      addSpike(level, 56.85, 1);
      addPortal(level, 60);
      addGap(level, 63.2, 1.5);
      addMover(level, 67.2, 0, 74, 3.8);
      addSpike(level, 70.2);
      addGap(level, 73.1, 1.34);
      addExtensionPattern(level, 78, 8);
      addExtensionPattern(level, 100, 0);
      addExtensionPattern(level, 122, 4);
      addExtensionPattern(level, 144, 1);
      addExtensionPattern(level, 164, 3);
    },
  }),
  createLevel(9, {
    title: "Final Frequency",
    theme: "#57f2c1",
    accent: "#f1fff9",
    bpm: 172,
    lengthBeats: 3000,
    marathonStart: 218,
    build(level) {
      addSpike(level, 4.2);
      addGap(level, 7.1, 1.18);
      addPad(level, 9.9, 1.18);
      addPortal(level, 13.2);
      addSpikeRow(level, 16.2, 2, 0.2, 1);
      addMover(level, 19.4, 1, 68, 3.7);
      addGap(level, 23.5, 1.42);
      addSpike(level, 27.3, 1);
      addBlock(level, 31.1, 1, 1.02);
      addSpike(level, 32.45, 1);
      addGap(level, 35.8, 1.4);
      addPortal(level, 39.2);
      addSpikeRow(level, 42.6, 3, 0.18);
      addGap(level, 47.4, 1.48);
      addPad(level, 51.2, 1.24);
      addMover(level, 55.3, 0, 78, 3.95);
      addPortal(level, 59.6);
      addGap(level, 63.1, 1.55);
      addSpike(level, 67.1, 1);
      addMover(level, 70.2, 1, 80, 4.1);
      addPortal(level, 73.8);
      addGap(level, 77.2, 1.52);
      addSpikeRow(level, 81.1, 2, 0.2);
      addGap(level, 83.8, 1.3);
      addExtensionPattern(level, 88, 9);
      addExtensionPattern(level, 108, 7);
      addExtensionPattern(level, 124, 2);
      addExtensionPattern(level, 144, 4);
      addExtensionPattern(level, 164, 1);
      addExtensionPattern(level, 184, 3);
      addExtensionPattern(level, 200, 2);
    },
  }),
];

levels.forEach((level) => {
  const compressionRatio = level.length / (level.lengthBeats * level.beatWidth);
  const checkpointBeats = [];
  for (let beat = 90; beat < level.lengthBeats - 20; beat += 90) {
    checkpointBeats.push(beat);
  }

  checkpointBeats.forEach((beat) => {
    addCheckpoint(level, beat);
    const checkpoint = level.objects[level.objects.length - 1];
    checkpoint.x = 160 + (checkpoint.x - 160) * compressionRatio;
  });
});

const state = {
  save: loadSave(),
  levelIndex: 0,
  selectedLevelIndex: 0,
  screen: "menu",
  practiceMode: false,
  holdJump: false,
  holdTime: 0,
  pulseTimer: 0,
  visualPulse: 0,
  beatFlash: 0,
  deathTimer: 0,
  checkpoint: null,
  stars: Array.from({ length: 56 }, (_, index) => ({
    x: (index * 137) % 1280,
    y: 70 + ((index * 83) % 420),
    size: 2 + (index % 3),
    depth: 0.15 + (index % 5) * 0.07,
    phase: index * 0.33,
  })),
  player: createPlayer(),
};

function createPlayer() {
  return {
    x: 120,
    y: BASE_GROUND_Y - PLAYER_SIZE,
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    vx: SCROLL_SPEED,
    vy: 0,
    rotation: 0,
    gravityDir: 1,
    grounded: true,
    alive: true,
    justFlipped: false,
    trail: [],
  };
}

function getLevel() {
  return levels[state.levelIndex];
}

function getLevelSave(levelId) {
  if (!state.save[levelId]) {
    state.save[levelId] = {
      attempts: 0,
      completed: false,
      bestProgress: 0,
    };
  }

  return state.save[levelId];
}

function getHighestUnlockedIndex() {
  let highest = 0;

  for (let i = 0; i < levels.length; i += 1) {
    if (getLevelSave(levels[i].id).completed) {
      highest = Math.min(levels.length - 1, i + 1);
    }
  }

  return highest;
}

function getCompletedCount() {
  return levels.filter((level) => getLevelSave(level.id).completed).length;
}

function getTotalAttempts() {
  return levels.reduce((total, level) => total + getLevelSave(level.id).attempts, 0);
}

function setScreen(screen) {
  state.screen = screen;
  ui.menuOverlay.classList.toggle("visible", screen === "menu");
  ui.deathOverlay.classList.toggle("visible", screen === "death");
  ui.clearOverlay.classList.toggle("visible", screen === "clear");
}

function rebuildLevelList() {
  const highestUnlocked = getHighestUnlockedIndex();
  ui.levelList.innerHTML = "";

  levels.forEach((level, index) => {
    const save = getLevelSave(level.id);
    const isUnlocked = index <= highestUnlocked;
    const isSelected = index === state.selectedLevelIndex;
    const button = document.createElement("button");
    const status = save.completed ? "Complete" : isUnlocked ? "Unlocked" : "Locked";
    const best = `${Math.floor(save.bestProgress)}% best`;

    button.type = "button";
    button.disabled = !isUnlocked;
    button.className = `level-card${save.completed ? " complete" : ""}${isSelected ? " selected" : ""}${!isUnlocked ? " locked" : ""}`;
    button.innerHTML = `
      <strong>${level.id}. ${level.title}</strong>
      <span>${level.bpm} BPM · ${level.lengthBeats} beats</span>
      <small>${status} · ${save.attempts} attempts · ${best}</small>
    `;

    button.addEventListener("click", () => {
      if (!isUnlocked) {
        return;
      }

      state.selectedLevelIndex = index;
      updateMenuText();
      rebuildLevelList();
    });

    ui.levelList.appendChild(button);
  });

  ui.summaryUnlocked.textContent = `${getHighestUnlockedIndex() + 1} / ${levels.length}`;
  ui.summaryCompleted.textContent = `${getCompletedCount()} / ${levels.length}`;
  ui.summaryAttempts.textContent = `${getTotalAttempts()}`;
}

function updateMenuText() {
  const level = levels[state.selectedLevelIndex];
  ui.playButton.textContent = `Play ${level.id}. ${level.title}`;
  ui.practiceButton.textContent = `Practice Mode: ${state.practiceMode ? "On" : "Off"}`;
}

function resetPlayerFromCheckpoint() {
  const player = createPlayer();

  if (state.practiceMode && state.checkpoint) {
    player.x = state.checkpoint.x;
    player.y = state.checkpoint.y;
    player.gravityDir = state.checkpoint.gravityDir;
    player.rotation = state.checkpoint.gravityDir === 1 ? 0 : Math.PI;
  }

  state.player = player;
}

function resetRunState() {
  state.holdJump = false;
  state.holdTime = 0;
  state.pulseTimer = 0;
  state.visualPulse = 0;
  state.beatFlash = 0;
  state.deathTimer = 0;
  musicState = null;
}

function startLevel(index) {
  state.levelIndex = index;
  state.selectedLevelIndex = index;
  state.checkpoint = null;
  resetPlayerFromCheckpoint();
  getLevelSave(getLevel().id).attempts += 1;
  saveState();
  resetRunState();
  setScreen("game");
  updateHud();
}

function restartLevel() {
  resetPlayerFromCheckpoint();
  resetRunState();
  if (!state.practiceMode) {
    state.checkpoint = null;
  }
  getLevelSave(getLevel().id).attempts += 1;
  saveState();
  updateHud();
}

function openMenu() {
  state.selectedLevelIndex = clamp(state.selectedLevelIndex, 0, getHighestUnlockedIndex());
  state.player = createPlayer();
  setScreen("menu");
  updateMenuText();
  rebuildLevelList();
  updateHud();
}

function completeLevel() {
  const level = getLevel();
  const save = getLevelSave(level.id);
  const hasNext = state.levelIndex < levels.length - 1;

  save.completed = true;
  save.bestProgress = 100;
  saveState();

  ui.clearTitle.textContent = `${level.title} Complete`;
  ui.clearSubtitle.textContent = hasNext
    ? `Level ${state.levelIndex + 2} is now unlocked.`
    : "Every level is clear. The whole run is yours now.";
  ui.nextLevelButton.disabled = !hasNext;

  setScreen("clear");
  rebuildLevelList();
  updateHud();
}

function failRun() {
  if (!state.player.alive) {
    return;
  }

  state.player.alive = false;
  state.deathTimer = DEATH_RESTART_DELAY;
  ui.deathSubtitle.textContent = `${getLevel().title} ended at ${Math.floor(getProgress() * 100)}%.`;
  setScreen("death");
  playSynth("death");
}

function getProgress() {
  return clamp(state.player.x / getLevel().length, 0, 1);
}

function getGroundSegments(level) {
  const segments = [{ start: -2000, end: level.length + 2000 }];
  const gaps = level.objects.filter((object) => object.type === "gap");

  gaps.forEach((gap) => {
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      if (gap.x < segment.end && gap.x + gap.width > segment.start) {
        const replacement = [];

        if (gap.x > segment.start) {
          replacement.push({ start: segment.start, end: gap.x });
        }

        if (gap.x + gap.width < segment.end) {
          replacement.push({ start: gap.x + gap.width, end: segment.end });
        }

        segments.splice(i, 1, ...replacement);
        i += replacement.length - 1;
      }
    }
  });

  return segments;
}

function isStandingOnGround(x, width) {
  return getGroundSegments(getLevel()).some((segment) => x + width > segment.start && x < segment.end);
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function getPlayerRect() {
  return {
    x: state.player.x,
    y: state.player.y,
    width: state.player.width,
    height: state.player.height,
  };
}

function initAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  audioContext = new AudioContextClass();
}

function startLevelMusic() {
  if (!audioContext) {
    return;
  }

  musicState = {
    beatAccumulator: 0,
    step: 0,
  };
}

function playEnvelope(type, frequency, duration, gainAmount) {
  if (!audioContext || audioContext.state !== "running") {
    return;
  }

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  gain.gain.setValueAtTime(gainAmount, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function playNoise(duration, gainAmount) {
  if (!audioContext || audioContext.state !== "running") {
    return;
  }

  const buffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * duration), audioContext.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < channel.length; i += 1) {
    channel[i] = (Math.random() * 2 - 1) * (1 - i / channel.length);
  }

  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();

  filter.type = "highpass";
  filter.frequency.value = 1500;
  gain.gain.value = gainAmount;
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);

  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);
  source.start();
  source.stop(audioContext.currentTime + duration);
}

function playSynth(type) {
  if (!audioContext || audioContext.state !== "running") {
    return;
  }

  if (type === "beat") {
    playEnvelope("triangle", 90, 0.08, 0.035);
    if (musicState && musicState.step % 2 === 1) {
      playNoise(0.03, 0.008);
    }
    return;
  }

  if (type === "jump") {
    playEnvelope("square", 480, 0.06, 0.025);
    return;
  }

  if (type === "pad") {
    playEnvelope("sawtooth", 650, 0.09, 0.028);
    return;
  }

  if (type === "portal") {
    playEnvelope("triangle", 280, 0.12, 0.03);
    return;
  }

  if (type === "checkpoint") {
    playEnvelope("triangle", 720, 0.08, 0.03);
    playEnvelope("triangle", 960, 0.08, 0.02);
    return;
  }

  if (type === "death") {
    playEnvelope("sawtooth", 140, 0.16, 0.04);
    return;
  }

  if (type === "clear") {
    playEnvelope("triangle", 520, 0.12, 0.03);
    playEnvelope("triangle", 780, 0.16, 0.025);
  }
}

function updateAudio(dt) {
  if (!audioContext || audioContext.state !== "running" || state.screen !== "game" || !state.player.alive) {
    return;
  }

  if (!musicState) {
    startLevelMusic();
  }

  const beatInterval = 60 / getLevel().bpm;
  musicState.beatAccumulator += dt;
  state.pulseTimer += dt;

  while (musicState.beatAccumulator >= beatInterval) {
    musicState.beatAccumulator -= beatInterval;
    musicState.step += 1;
    state.visualPulse = 1;
    state.beatFlash = 1;
    playSynth("beat");
  }
}

function triggerJump(force = JUMP_VELOCITY) {
  if (!state.player.grounded || !state.player.alive || state.screen !== "game") {
    return;
  }

  state.player.grounded = false;
  state.player.vy = -force * state.player.gravityDir;
  playSynth("jump");
}

function handleInputStart() {
  if (!audioContext) {
    initAudio();
  }

  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume();
  }

  if (state.screen === "menu") {
    startLevel(state.selectedLevelIndex);
    return;
  }

  if (state.screen === "death" || state.screen === "clear") {
    return;
  }

  state.holdJump = true;
  state.holdTime = 0;
  triggerJump();
}

function handleInputEnd() {
  state.holdJump = false;
}

function captureCheckpoint() {
  state.checkpoint = {
    x: Math.max(120, state.player.x - 28),
    y: state.player.y,
    gravityDir: state.player.gravityDir,
  };
  playSynth("checkpoint");
}

function updateCheckpointSystem(level, playerRect) {
  if (!state.practiceMode) {
    return;
  }

  level.objects.forEach((object) => {
    if (object.type !== "checkpoint") {
      return;
    }

    if (object.used) {
      return;
    }

    if (rectsIntersect(playerRect, object)) {
      object.used = true;
      captureCheckpoint();
    }
  });
}

function update(dt) {
  state.visualPulse = Math.max(0, state.visualPulse - dt * 2.2);
  state.beatFlash = Math.max(0, state.beatFlash - dt * 3.6);

  if (state.screen !== "game") {
    return;
  }

  if (!state.player.alive) {
    return;
  }

  updateAudio(dt);

  if (state.holdJump && !state.player.grounded && state.holdTime < MAX_HOLD_TIME) {
    state.holdTime += dt;
    state.player.vy -= HOLD_BOOST * dt * state.player.gravityDir;
  }

  const previousRect = getPlayerRect();
  const level = getLevel();
  const floorY = BASE_GROUND_Y - state.player.height;
  const ceilingY = 120;

  state.player.vy += GRAVITY * dt * state.player.gravityDir;
  state.player.x += state.player.vx * dt;
  state.player.y += state.player.vy * dt;
  state.player.rotation += dt * 8 * (state.player.grounded ? 0.34 : 1.55) * state.player.gravityDir;

  if (state.player.gravityDir === 1) {
    if (state.player.y >= floorY && isStandingOnGround(state.player.x + 4, state.player.width - 8)) {
      state.player.y = floorY;
      state.player.vy = 0;
      state.player.grounded = true;
      state.player.rotation = 0;
    } else {
      state.player.grounded = false;
    }

    if (state.player.y > canvas.height + 120) {
      failRun();
    }
  } else {
    if (state.player.y <= ceilingY && isStandingOnGround(state.player.x + 4, state.player.width - 8)) {
      state.player.y = ceilingY;
      state.player.vy = 0;
      state.player.grounded = true;
      state.player.rotation = Math.PI;
    } else {
      state.player.grounded = false;
    }

    if (state.player.y + state.player.height < -120) {
      failRun();
    }
  }

  level.objects.forEach((object) => {
    if (object.type === "mover") {
      object.y = object.baseY + Math.sin(performance.now() / 1000 * object.speed) * object.span;
    }
  });

  const playerRect = getPlayerRect();

  level.objects.forEach((object) => {
    if (object.type === "gap" || object.type === "checkpoint") {
      return;
    }

    if (object.type === "pad") {
      if (rectsIntersect(playerRect, object) && state.player.gravityDir === 1 && state.player.vy >= 0) {
        state.player.grounded = false;
        state.player.vy = -JUMP_VELOCITY * object.strength;
        playSynth("pad");
      }
      return;
    }

    if (object.type === "portal") {
      const touching = rectsIntersect(playerRect, object);

      if (touching && !state.player.justFlipped) {
        state.player.gravityDir *= -1;
        state.player.justFlipped = true;
        playSynth("portal");
      } else if (!touching) {
        state.player.justFlipped = false;
      }
      return;
    }

    if (object.type === "block") {
      if (rectsIntersect(playerRect, object)) {
        const previousBottom = previousRect.y + previousRect.height;
        const previousTop = previousRect.y;
        const previousRight = previousRect.x + previousRect.width;
        const previousLeft = previousRect.x;
        const withinHorizontalFace =
          previousRight > object.x + 6 && previousLeft < object.x + object.width - 6;

        if (state.player.gravityDir === 1 && previousBottom <= object.y + 8 && withinHorizontalFace) {
          state.player.y = object.y - state.player.height;
          state.player.vy = 0;
          state.player.grounded = true;
        } else if (
          state.player.gravityDir === -1 &&
          previousTop >= object.y + object.height - 8 &&
          withinHorizontalFace
        ) {
          state.player.y = object.y + object.height;
          state.player.vy = 0;
          state.player.grounded = true;
        } else {
          failRun();
        }
      }
      return;
    }

    if ((object.type === "spike" || object.type === "mover") && rectsIntersect(playerRect, object)) {
      failRun();
    }
  });

  updateCheckpointSystem(level, playerRect);

  state.player.trail.unshift({
    x: state.player.x,
    y: state.player.y,
    alpha: 0.24,
  });

  state.player.trail = state.player.trail
    .slice(0, 10)
    .map((particle) => ({
      ...particle,
      alpha: Math.max(0, particle.alpha - 0.028),
    }))
    .filter((particle) => particle.alpha > 0);

  const save = getLevelSave(level.id);
  const nextBestProgress = Math.max(save.bestProgress, getProgress() * 100);
  if (nextBestProgress > save.bestProgress) {
    save.bestProgress = nextBestProgress;
    saveState();
  }

  if (state.player.x >= level.length) {
    playSynth("clear");
    completeLevel();
  }

  updateHud();
}

function drawBackground(level) {
  const pulse = 0.35 + state.visualPulse * 0.65;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, withAlpha(level.theme, 0.26 + pulse * 0.09));
  gradient.addColorStop(0.4, "#0f1d37");
  gradient.addColorStop(1, "#050913");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const camera = state.player.x - CAMERA_X;

  state.stars.forEach((star, index) => {
    const x = ((star.x - camera * star.depth) % (canvas.width + 140) + (canvas.width + 140)) % (canvas.width + 140) - 40;
    const y = star.y + Math.sin(performance.now() / 1000 + star.phase) * (4 + (index % 3));
    const alpha = 0.12 + 0.1 * Math.sin(performance.now() / 700 + star.phase) + state.beatFlash * 0.06;
    ctx.fillStyle = withAlpha(level.accent, alpha);
    ctx.fillRect(x, y, star.size * 10, star.size);
  });

  for (let i = 0; i < 9; i += 1) {
    const lineX = ((i * 210) - camera * 0.56) % (canvas.width + 260);
    ctx.fillStyle = withAlpha(level.theme, 0.08 + pulse * 0.08);
    ctx.fillRect(lineX, 84, 2, BASE_GROUND_Y - 150);
  }

  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(0, BASE_GROUND_Y, canvas.width, canvas.height - BASE_GROUND_Y);
  ctx.fillStyle = withAlpha(level.groundGlow, 0.28 + pulse * 0.14);
  ctx.fillRect(0, BASE_GROUND_Y - 18, canvas.width, 18);
}

function drawGround(level) {
  const camera = state.player.x - CAMERA_X;
  const segments = getGroundSegments(level);

  segments.forEach((segment) => {
    const x = segment.start - camera;
    const width = segment.end - segment.start;

    const groundGradient = ctx.createLinearGradient(0, BASE_GROUND_Y, 0, canvas.height);
    groundGradient.addColorStop(0, withAlpha(level.theme, 0.92));
    groundGradient.addColorStop(1, withAlpha("#09203a", 0.92));
    ctx.fillStyle = groundGradient;
    ctx.fillRect(x, BASE_GROUND_Y, width, canvas.height - BASE_GROUND_Y);

    ctx.fillStyle = withAlpha("#ffffff", 0.12);
    for (let offset = 0; offset < width; offset += TILE) {
      ctx.fillRect(x + offset, BASE_GROUND_Y + 18, 2, canvas.height - BASE_GROUND_Y - 18);
    }
  });
}

function drawObjects(level) {
  const camera = state.player.x - CAMERA_X;

  level.objects.forEach((object) => {
    const x = object.x - camera;

    if (object.type === "gap") {
      return;
    }

    if (object.type === "checkpoint") {
      if (!state.practiceMode) {
        return;
      }

      ctx.strokeStyle = withAlpha(object.used ? "#ffffff" : level.accent, object.used ? 0.25 : 0.7);
      ctx.setLineDash([8, 10]);
      ctx.lineWidth = 3;
      ctx.strokeRect(x, object.y, object.width, object.height);
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      return;
    }

    if (object.type === "spike") {
      const spikeGradient = ctx.createLinearGradient(0, object.y, 0, object.y + object.height);
      spikeGradient.addColorStop(0, "#ffd6df");
      spikeGradient.addColorStop(1, "#ff5d73");
      ctx.fillStyle = spikeGradient;
      ctx.beginPath();
      ctx.moveTo(x, object.y + object.height);
      ctx.lineTo(x + object.width / 2, object.y);
      ctx.lineTo(x + object.width, object.y + object.height);
      ctx.closePath();
      ctx.fill();
      return;
    }

    if (object.type === "block") {
      ctx.fillStyle = withAlpha(level.theme, 0.95);
      ctx.fillRect(x, object.y, object.width, object.height);
      ctx.strokeStyle = withAlpha("#ffffff", 0.22);
      ctx.strokeRect(x, object.y, object.width, object.height);
      ctx.fillStyle = withAlpha("#ffffff", 0.16);
      ctx.fillRect(x + 8, object.y + 8, object.width - 16, 6);
      return;
    }

    if (object.type === "pad") {
      ctx.fillStyle = "#ffd166";
      ctx.fillRect(x, object.y, object.width, object.height);
      ctx.fillStyle = withAlpha("#ffffff", 0.4);
      ctx.fillRect(x + 6, object.y - 5, object.width - 12, 4);
      return;
    }

    if (object.type === "portal") {
      ctx.strokeStyle = withAlpha("#57f2c1", 0.92);
      ctx.lineWidth = 6;
      ctx.strokeRect(x, object.y, object.width, object.height);
      ctx.strokeStyle = withAlpha("#ff5d73", 0.92);
      ctx.strokeRect(x + 10, object.y + 10, object.width - 20, object.height - 20);
      ctx.lineWidth = 1;
      return;
    }

    if (object.type === "mover") {
      ctx.fillStyle = "#ff9b54";
      ctx.fillRect(x, object.y, object.width, object.height);
      ctx.fillStyle = withAlpha("#ffffff", 0.26);
      ctx.fillRect(x + 4, object.y + 4, object.width - 8, 5);
    }
  });
}

function drawBeatGuide(level) {
  const camera = state.player.x - CAMERA_X;
  const visibleStart = Math.floor(camera / level.beatWidth) - 1;
  const visibleEnd = Math.ceil((camera + canvas.width) / level.beatWidth) + 1;

  for (let beat = visibleStart; beat <= visibleEnd; beat += 1) {
    if (beat < 0 || beat > level.lengthBeats) {
      continue;
    }

    const x = beat * level.beatWidth - camera;
    const isStrongBeat = beat % 4 === 0;
    ctx.fillStyle = withAlpha(level.accent, isStrongBeat ? 0.16 : 0.08);
    ctx.fillRect(x, 96, 2, BASE_GROUND_Y - 124);
  }
}

function drawPlayer() {
  const drawX = CAMERA_X;
  const color = state.player.alive ? "#57f2c1" : "#ffffff";

  state.player.trail.forEach((particle, index) => {
    const trailX = drawX - index * 6;
    ctx.save();
    ctx.globalAlpha = particle.alpha;
    ctx.fillStyle = "#b7fff0";
    ctx.fillRect(trailX, particle.y, state.player.width, state.player.height);
    ctx.restore();
  });

  ctx.save();
  ctx.translate(drawX + state.player.width / 2, state.player.y + state.player.height / 2);
  ctx.rotate(state.player.rotation);
  ctx.fillStyle = color;
  ctx.fillRect(-state.player.width / 2, -state.player.height / 2, state.player.width, state.player.height);
  ctx.strokeStyle = "#ddffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(-state.player.width / 2, -state.player.height / 2, state.player.width, state.player.height);
  ctx.fillStyle = "#06212b";
  ctx.fillRect(-6, -6, 5, 5);
  ctx.fillRect(4, -6, 5, 5);
  ctx.restore();
}

function drawCheckpointMarker() {
  if (!state.practiceMode || !state.checkpoint || state.screen !== "game") {
    return;
  }

  const camera = state.player.x - CAMERA_X;
  const x = state.checkpoint.x - camera;

  ctx.strokeStyle = withAlpha("#ffffff", 0.24);
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(x, 88);
  ctx.lineTo(x, BASE_GROUND_Y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawDeathFlash() {
  if (state.screen !== "game" || state.player.alive) {
    return;
  }

  const alpha = clamp(state.deathTimer / DEATH_RESTART_DELAY, 0, 1) * 0.35;
  ctx.fillStyle = `rgba(255, 96, 128, ${alpha})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function updateHud() {
  const menuLevel = levels[state.selectedLevelIndex];
  const activeLevel = state.screen === "game" || state.screen === "clear" ? getLevel() : menuLevel;
  const save = getLevelSave(activeLevel.id);
  const progress = state.screen === "menu" ? save.bestProgress / 100 : getProgress();
  const displayProgress = Math.floor(progress * 100);

  ui.hudLevelName.textContent = `Level ${activeLevel.id}. ${activeLevel.title}`;
  ui.hudProgressText.textContent = `${displayProgress}%`;
  ui.hudModeText.textContent = state.practiceMode ? "Practice Mode" : "Normal Mode";
  ui.hudProgressFill.style.width = `${displayProgress}%`;
  ui.hudAttempts.textContent = `Attempts ${save.attempts}`;
}

function render() {
  const level = state.screen === "menu" ? levels[state.selectedLevelIndex] : getLevel();
  drawBackground(level);
  drawBeatGuide(level);
  drawGround(level);
  drawObjects(level);
  drawCheckpointMarker();
  drawPlayer();
  drawDeathFlash();
}

let previousTime = performance.now();

function loop(now) {
  const dt = Math.min(0.02, (now - previousTime) / 1000);
  previousTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width);
  canvas.height = Math.floor(rect.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function resetCheckpointObjects() {
  levels.forEach((level) => {
    level.objects.forEach((object) => {
      if (object.type === "checkpoint") {
        object.used = false;
      }
    });
  });
}

ui.playButton.addEventListener("click", () => {
  resetCheckpointObjects();
  startLevel(state.selectedLevelIndex);
});

ui.practiceButton.addEventListener("click", () => {
  state.practiceMode = !state.practiceMode;
  updateMenuText();
  updateHud();
});

ui.retryButton.addEventListener("click", () => {
  restartLevel();
  setScreen("game");
});

ui.deathMenuButton.addEventListener("click", openMenu);

ui.resetProgressButton.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  state.save = {};
  state.levelIndex = 0;
  state.selectedLevelIndex = 0;
  state.practiceMode = false;
  state.checkpoint = null;
  resetCheckpointObjects();
  updateMenuText();
  rebuildLevelList();
  updateHud();
});

ui.nextLevelButton.addEventListener("click", () => {
  if (state.levelIndex < levels.length - 1) {
    resetCheckpointObjects();
    startLevel(state.levelIndex + 1);
  }
});

ui.clearReplayButton.addEventListener("click", () => {
  resetCheckpointObjects();
  startLevel(state.levelIndex);
});

ui.clearMenuButton.addEventListener("click", openMenu);
ui.menuButton.addEventListener("click", openMenu);

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    handleInputStart();
  }

  if (event.code === "Escape") {
    if (state.screen === "game") {
      openMenu();
    } else if (state.screen === "menu") {
      startLevel(state.selectedLevelIndex);
    }
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    handleInputEnd();
  }
});

canvas.addEventListener("pointerdown", handleInputStart);
window.addEventListener("pointerup", handleInputEnd);

resizeCanvas();
updateMenuText();
rebuildLevelList();
openMenu();
requestAnimationFrame(loop);
