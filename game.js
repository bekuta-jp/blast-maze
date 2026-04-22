const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const overlay = document.querySelector("#overlay");
const startButton = document.querySelector("#startButton");
const hud = {
  stage: document.querySelector("#stage"),
  score: document.querySelector("#score"),
  time: document.querySelector("#time"),
  lives: document.querySelector("#lives"),
};

const TILE = 64;
const MOVE_STEP = TILE / 8;
const COLS = 13;
const ROWS = 11;
const MAP = {
  empty: 0,
  wall: 1,
  crate: 2,
  exit: 3,
  power: 4,
};

const keys = new Set();
const touchKeys = new Map();
let state;
let lastFrame = 0;
let accumulator = 0;

function makeState(stage = 1, score = 0, lives = 3) {
  const map = [];
  for (let y = 0; y < ROWS; y += 1) {
    const row = [];
    for (let x = 0; x < COLS; x += 1) {
      const border = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
      const pillar = x % 2 === 0 && y % 2 === 0;
      row.push(border || pillar ? MAP.wall : MAP.empty);
    }
    map.push(row);
  }

  const safe = new Set(["1,1", "2,1", "1,2"]);
  const crateChance = Math.min(0.48 + stage * 0.035, 0.68);
  const hidden = [];
  for (let y = 1; y < ROWS - 1; y += 1) {
    for (let x = 1; x < COLS - 1; x += 1) {
      if (map[y][x] !== MAP.empty || safe.has(`${x},${y}`)) continue;
      if (Math.random() < crateChance) {
        map[y][x] = MAP.crate;
        hidden.push({ x, y });
      }
    }
  }

  shuffle(hidden);
  if (hidden[0]) hidden[0].contains = MAP.exit;
  if (hidden[1]) hidden[1].contains = MAP.power;
  hidden.forEach((item) => {
    if (item.contains) map[item.y][item.x] = item.contains === MAP.exit ? MAP.crate + 10 : MAP.crate + 20;
  });

  const enemies = [];
  const enemyCount = Math.min(3 + stage, 8);
  const starts = openTiles(map).filter((tile) => tile.x + tile.y > 7);
  shuffle(starts);
  for (let i = 0; i < enemyCount && starts[i]; i += 1) {
    enemies.push({
      x: starts[i].x * TILE + TILE / 2,
      y: starts[i].y * TILE + TILE / 2,
      vx: 0,
      vy: 0,
      dirTimer: 0,
      speed: 72 + stage * 5,
      alive: true,
    });
  }

  return {
    stage,
    score,
    lives,
    time: 180,
    map,
    player: {
      x: TILE + TILE / 2,
      y: TILE + TILE / 2,
      speed: 150,
      radius: 22,
      moveCarryX: 0,
      moveCarryY: 0,
      bombs: 1,
      power: 2,
      invincible: 1.4,
      alive: true,
    },
    bombs: [],
    blasts: [],
    enemies,
    status: "ready",
    message: "Blast Maze",
  };
}

function startGame() {
  state = makeState();
  state.status = "playing";
  overlay.classList.add("hidden");
  updateHud();
  lastFrame = performance.now();
}

function nextStage() {
  state = makeState(state.stage + 1, state.score + 1000, state.lives);
  state.status = "playing";
  overlay.classList.add("hidden");
  updateHud();
}

function restartAfterHit() {
  const nextLives = state.lives - 1;
  if (nextLives <= 0) {
    endGame("GAME OVER", "Startで再挑戦");
    return;
  }
  state = makeState(state.stage, state.score, nextLives);
  state.status = "playing";
  overlay.classList.add("hidden");
  updateHud();
}

function endGame(title, body) {
  state.status = "ended";
  overlay.querySelector("h1").textContent = title;
  overlay.querySelector("p").textContent = body;
  startButton.textContent = "Restart";
  overlay.classList.remove("hidden");
}

function gameLoop(now) {
  if (!state) state = makeState();
  const delta = Math.min((now - lastFrame) / 1000 || 0, 0.05);
  lastFrame = now;

  if (state.status === "playing") {
    accumulator += delta;
    while (accumulator >= 1) {
      state.time -= 1;
      accumulator -= 1;
      if (state.time <= 0) damagePlayer();
    }
    update(delta);
    updateHud();
  }

  draw();
  requestAnimationFrame(gameLoop);
}

function update(delta) {
  const player = state.player;
  player.invincible = Math.max(0, player.invincible - delta);
  updateBombPassage();
  movePlayer(delta);
  updateBombs(delta);
  updateBlasts(delta);
  updateEnemies(delta);
  checkPickupsAndExit();
}

function movePlayer(delta) {
  const p = state.player;
  let dx = 0;
  let dy = 0;
  if (keys.has("ArrowLeft") || keys.has("a")) dx -= 1;
  if (keys.has("ArrowRight") || keys.has("d")) dx += 1;
  if (keys.has("ArrowUp") || keys.has("w")) dy -= 1;
  if (keys.has("ArrowDown") || keys.has("s")) dy += 1;
  if (dx && dy) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }
  if (!dx) p.moveCarryX = 0;
  if (!dy) p.moveCarryY = 0;
  p.moveCarryX += dx * p.speed * delta;
  p.moveCarryY += dy * p.speed * delta;
  moveStepped(p, "x", "moveCarryX");
  moveStepped(p, "y", "moveCarryY");
}

function moveStepped(entity, axis, carryKey) {
  while (Math.abs(entity[carryKey]) >= MOVE_STEP) {
    const step = Math.sign(entity[carryKey]) * MOVE_STEP;
    if (axis === "x") moveEntity(entity, step, 0, true);
    else moveEntity(entity, 0, step, true);
    entity[carryKey] -= step;
  }
}

function updateBombs(delta) {
  for (const bomb of state.bombs) {
    bomb.timer -= delta;
    if (bomb.timer <= 0 && !bomb.exploded) explodeBomb(bomb);
  }
  state.bombs = state.bombs.filter((bomb) => !bomb.exploded);
}

function updateBlasts(delta) {
  for (const blast of state.blasts) blast.timer -= delta;
  state.blasts = state.blasts.filter((blast) => blast.timer > 0);

  for (const blast of state.blasts) {
    if (tileOf(state.player).x === blast.x && tileOf(state.player).y === blast.y) damagePlayer();
    for (const enemy of state.enemies) {
      if (enemy.alive && tileOf(enemy).x === blast.x && tileOf(enemy).y === blast.y) {
        enemy.alive = false;
        state.score += 150;
      }
    }
  }
  state.enemies = state.enemies.filter((enemy) => enemy.alive);
}

function updateEnemies(delta) {
  for (const enemy of state.enemies) {
    enemy.dirTimer -= delta;
    if (enemy.dirTimer <= 0 || blockedAhead(enemy, enemy.vx, enemy.vy)) {
      const dirs = shuffle([
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]);
      const dir = dirs.find(([dx, dy]) => !blockedAhead(enemy, dx, dy)) || [0, 0];
      enemy.vx = dir[0];
      enemy.vy = dir[1];
      enemy.dirTimer = 0.4 + Math.random() * 1.5;
    }
    moveEntity(enemy, enemy.vx * enemy.speed * delta, enemy.vy * enemy.speed * delta, true);
    if (distance(enemy, state.player) < 36) damagePlayer();
  }
}

function checkPickupsAndExit() {
  const tile = tileOf(state.player);
  const value = state.map[tile.y]?.[tile.x];
  if (value === MAP.power) {
    state.map[tile.y][tile.x] = MAP.empty;
    state.player.power += 1;
    state.player.bombs += 1;
    state.score += 250;
  }
  if (value === MAP.exit && state.enemies.length === 0) nextStage();
}

function placeBomb() {
  if (!state || state.status !== "playing") return;
  const tile = tileOf(state.player);
  const occupied = state.bombs.some((bomb) => bomb.x === tile.x && bomb.y === tile.y);
  if (occupied || state.bombs.length >= state.player.bombs) return;
  state.bombs.push({
    x: tile.x,
    y: tile.y,
    timer: 2.15,
    power: state.player.power,
    exploded: false,
    passableForPlayer: true,
  });
}

function updateBombPassage() {
  for (const bomb of state.bombs) {
    if (!bomb.passableForPlayer) continue;
    if (!entityOverlapsTile(state.player, bomb.x, bomb.y)) bomb.passableForPlayer = false;
  }
}

function explodeBomb(bomb) {
  bomb.exploded = true;
  const blasts = [{ x: bomb.x, y: bomb.y, timer: 0.42 }];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  for (const [dx, dy] of dirs) {
    for (let i = 1; i <= bomb.power; i += 1) {
      const x = bomb.x + dx * i;
      const y = bomb.y + dy * i;
      const value = state.map[y]?.[x];
      if (value === undefined || value === MAP.wall) break;
      blasts.push({ x, y, timer: 0.42 });
      if (isCrate(value)) {
        revealCrate(x, y, value);
        state.score += 50;
        break;
      }
    }
  }
  state.blasts.push(...blasts);

  for (const other of state.bombs) {
    if (!other.exploded && blasts.some((blast) => blast.x === other.x && blast.y === other.y)) {
      other.timer = Math.min(other.timer, 0.04);
    }
  }
}

function revealCrate(x, y, value) {
  if (value === MAP.crate + 10) state.map[y][x] = MAP.exit;
  else if (value === MAP.crate + 20) state.map[y][x] = MAP.power;
  else state.map[y][x] = MAP.empty;
}

function damagePlayer() {
  if (state.status !== "playing" || state.player.invincible > 0) return;
  state.player.invincible = 1.5;
  state.status = "paused";
  setTimeout(restartAfterHit, 700);
}

function moveEntity(entity, dx, dy, blocksBombs) {
  if (dx) {
    entity.x += dx;
    if (collides(entity, blocksBombs)) entity.x -= dx;
  }
  if (dy) {
    entity.y += dy;
    if (collides(entity, blocksBombs)) entity.y -= dy;
  }
}

function collides(entity, blocksBombs) {
  const r = entity.radius || 20;
  const checks = [
    [entity.x - r, entity.y - r],
    [entity.x + r, entity.y - r],
    [entity.x - r, entity.y + r],
    [entity.x + r, entity.y + r],
  ];
  return checks.some(([px, py]) => {
    const x = Math.floor(px / TILE);
    const y = Math.floor(py / TILE);
    if (isSolid(state.map[y]?.[x])) return true;
    if (!blocksBombs) return false;
    return state.bombs.some((bomb) => {
      if (bomb.x !== x || bomb.y !== y) return false;
      return entity !== state.player || !bomb.passableForPlayer;
    });
  });
}

function entityOverlapsTile(entity, tileX, tileY) {
  const r = entity.radius || 20;
  const left = tileX * TILE;
  const top = tileY * TILE;
  return (
    entity.x + r > left &&
    entity.x - r < left + TILE &&
    entity.y + r > top &&
    entity.y - r < top + TILE
  );
}

function blockedAhead(entity, dx, dy) {
  if (!dx && !dy) return false;
  const probe = { ...entity, x: entity.x + dx * 12, y: entity.y + dy * 12, radius: 20 };
  return collides(probe, true);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawMap();
  drawExitAndPower();
  drawBombs();
  drawBlasts();
  drawEnemies();
  drawPlayer();
}

function drawMap() {
  ctx.fillStyle = "#24362f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const px = x * TILE;
      const py = y * TILE;
      ctx.fillStyle = (x + y) % 2 ? "#2f5142" : "#2a493c";
      ctx.fillRect(px, py, TILE, TILE);
      const value = state.map[y][x];
      if (value === MAP.wall) drawBlock(px, py, "#74827a", "#4d5a54");
      if (isCrate(value)) drawCrate(px, py);
    }
  }
}

function drawBlock(x, y, top, side) {
  ctx.fillStyle = side;
  ctx.fillRect(x + 5, y + 7, TILE - 10, TILE - 9);
  ctx.fillStyle = top;
  ctx.fillRect(x + 5, y + 5, TILE - 10, 18);
  ctx.strokeStyle = "#2c3833";
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 5, y + 5, TILE - 10, TILE - 10);
}

function drawCrate(x, y) {
  ctx.fillStyle = "#8a5a30";
  ctx.fillRect(x + 8, y + 8, TILE - 16, TILE - 14);
  ctx.fillStyle = "#b2773f";
  ctx.fillRect(x + 12, y + 12, TILE - 24, 10);
  ctx.strokeStyle = "#5a351d";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 12, y + 12);
  ctx.lineTo(x + TILE - 12, y + TILE - 12);
  ctx.moveTo(x + TILE - 12, y + 12);
  ctx.lineTo(x + 12, y + TILE - 12);
  ctx.stroke();
}

function drawExitAndPower() {
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const value = state.map[y][x];
      const cx = x * TILE + TILE / 2;
      const cy = y * TILE + TILE / 2;
      if (value === MAP.exit) {
        ctx.fillStyle = state.enemies.length ? "#5b655d" : "#64c381";
        ctx.fillRect(cx - 18, cy - 22, 36, 44);
        ctx.fillStyle = "#17231e";
        ctx.fillRect(cx - 7, cy - 2, 5, 5);
      }
      if (value === MAP.power) {
        ctx.fillStyle = "#f2c14e";
        ctx.beginPath();
        ctx.arc(cx, cy, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#4b310a";
        ctx.fillRect(cx - 4, cy - 12, 8, 24);
        ctx.fillRect(cx - 12, cy - 4, 24, 8);
      }
    }
  }
}

function drawBombs() {
  for (const bomb of state.bombs) {
    const cx = bomb.x * TILE + TILE / 2;
    const cy = bomb.y * TILE + TILE / 2;
    const pulse = Math.sin(performance.now() / 90) * 2;
    ctx.fillStyle = "#1a1b20";
    ctx.beginPath();
    ctx.arc(cx, cy + 3, 20 + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f2c14e";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx + 10, cy - 17, 7, Math.PI, Math.PI * 1.7);
    ctx.stroke();
  }
}

function drawBlasts() {
  for (const blast of state.blasts) {
    const cx = blast.x * TILE + TILE / 2;
    const cy = blast.y * TILE + TILE / 2;
    const size = 24 + blast.timer * 26;
    ctx.fillStyle = "#f7e07e";
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    ctx.fillStyle = "#e85d4f";
    ctx.fillRect(cx - size / 3, cy - size / 3, size * 0.66, size * 0.66);
  }
}

function drawEnemies() {
  for (const enemy of state.enemies) {
    drawCirclePerson(enemy.x, enemy.y, "#e85d4f", "#4f1712", false);
  }
}

function drawPlayer() {
  const p = state.player;
  if (p.invincible > 0 && Math.floor(performance.now() / 90) % 2 === 0) return;
  drawCirclePerson(p.x, p.y, "#5aa6d8", "#102f44", true);
}

function drawCirclePerson(x, y, color, dark, player) {
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(x, y + 17, 21, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff7d8";
  ctx.fillRect(x - 11, y - 8, 7, 8);
  ctx.fillRect(x + 4, y - 8, 7, 8);
  ctx.fillStyle = dark;
  ctx.fillRect(x - 8, y - 5, 3, 3);
  ctx.fillRect(x + 7, y - 5, 3, 3);
  if (player) {
    ctx.fillStyle = "#f2c14e";
    ctx.fillRect(x - 15, y - 27, 30, 10);
  }
}

function updateHud() {
  hud.stage.textContent = state.stage;
  hud.score.textContent = state.score;
  hud.time.textContent = Math.max(0, state.time);
  hud.lives.textContent = state.lives;
}

function tileOf(entity) {
  return {
    x: Math.floor(entity.x / TILE),
    y: Math.floor(entity.y / TILE),
  };
}

function openTiles(map) {
  const tiles = [];
  for (let y = 1; y < ROWS - 1; y += 1) {
    for (let x = 1; x < COLS - 1; x += 1) {
      if (!isSolid(map[y][x])) tiles.push({ x, y });
    }
  }
  return tiles;
}

function isCrate(value) {
  return value === MAP.crate || value === MAP.crate + 10 || value === MAP.crate + 20;
}

function isSolid(value) {
  return value === MAP.wall || isCrate(value);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

window.addEventListener("keydown", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Enter"].includes(event.key)) {
    event.preventDefault();
  }
  keys.add(key);
  if (event.key === " " || event.key === "Enter") placeBomb();
});

window.addEventListener("keyup", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  keys.delete(key);
});

document.querySelectorAll(".control").forEach((button) => {
  const controlKey = button.dataset.key;
  const press = (event) => {
    event.preventDefault();
    if (controlKey === " ") placeBomb();
    keys.add(controlKey);
    touchKeys.set(event.pointerId, controlKey);
    button.setPointerCapture(event.pointerId);
  };
  const release = (event) => {
    const key = touchKeys.get(event.pointerId);
    if (key) keys.delete(key);
    touchKeys.delete(event.pointerId);
  };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
});

startButton.addEventListener("click", startGame);
state = makeState();
updateHud();
requestAnimationFrame(gameLoop);
