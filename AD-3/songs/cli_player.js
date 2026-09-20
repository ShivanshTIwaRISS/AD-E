#!/usr/bin/env node

const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const listenKeys = require("../../AD-4/raw_io");

const SONGS_DIR = __dirname;
const SEEK_TMP_FILE = `/tmp/.cli_player_seek_${process.pid}.mp3`;

// ─── State ────────────────────────────────────────────────────────────────────
let songs = [];
let filtered = [];
let cursorIdx = 0;
let playingIdx = -1;
let player = null;
let ticker = null;
let elapsed = 0;
let duration = 0;
let paused = false;
let loopMode = "OFF";
let shuffle = false;
let volume = 80;
let muted = false;
let speed = 1.0;
let searchMode = false;
let searchQuery = "";
let notification = "";
let notifTimer = null;
let frame = 0;

const SPEEDS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];
const SPEED_LABELS = {
    0.25: "0.25x 🐢",
    0.5:  "0.5x 🐌",
    0.75: "0.75x 🚶",
    1.0:  "1x ▶",
    1.25: "1.25x ⚡",
    1.5:  "1.5x 🚀",
    2.0:  "2x 🔥",
    3.0:  "3x ⚡🔥"
};

// ─── Animation frames ─────────────────────────────────────────────────────────
const BARS = [
    "▁▂▃▄▅▆▇█▇▆▅▄▃▂▁",
    "▂▃▄▅▆▇█▇▆▅▄▃▂▁▂",
    "▃▄▅▆▇█▇▆▅▄▃▂▁▂▃",
    "▄▅▆▇█▇▆▅▄▃▂▁▂▃▄",
    "▅▆▇█▇▆▅▄▃▂▁▂▃▄▅",
    "▆▇█▇▆▅▄▃▂▁▂▃▄▅▆",
    "▇█▇▆▅▄▃▂▁▂▃▄▅▆▇",
    "█▇▆▅▄▃▂▁▂▃▄▅▆▇█",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTermWidth() {
    return process.stdout.columns && process.stdout.columns > 30 ? process.stdout.columns : 72;
}

function fmt(s) {
    const sec = Math.max(0, Math.floor(s));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function cleanName(f) {
    return f.replace(/\.mp3$/i, "").replace(/[_]/g, " ");
}

function notify(msg) {
    notification = msg;
    clearTimeout(notifTimer);
    notifTimer = setTimeout(() => { notification = ""; draw(); }, 1800);
}

function out(line) { process.stdout.write(line + "\n"); }

function cleanupSeekFile() {
    try {
        if (fs.existsSync(SEEK_TMP_FILE)) fs.unlinkSync(SEEK_TMP_FILE);
    } catch (_) {}
}

function draw() {
    const W = getTermWidth();
    const LINE = "─".repeat(Math.max(10, W - 2));

    // Jump cursor to top-left, then wipe everything below
    process.stdout.write("\x1b[H\x1b[J");

    const C = "\x1b[96m", M = "\x1b[95m", Y = "\x1b[93m", G = "\x1b[92m",
          R = "\x1b[91m", D = "\x1b[90m", B = "\x1b[1m", X = "\x1b[0m";

    // Header
    out(`${C}┌${LINE}┐${X}`);
    const title = `${B}${M}🎵 MUSIC PLAYER CLI 🎵${X}`;
    const volStr = muted ? `${R}🔇 MUTED${X}` : `${G}VOL ${volume}%${X}`;
    const loopStr = loopMode === "SINGLE" ? `${Y}🔂 ONE${X}` : loopMode === "ALL" ? `${Y}🔁 ALL${X}` : `${D}LOOP OFF${X}`;
    const shufStr = shuffle ? `${Y}🔀 ON${X}` : `${D}SHUF OFF${X}`;
    const spdStr = speed === 1.0 ? `${D}1x${X}` : speed > 1 ? `${G}${SPEED_LABELS[speed]}${X}` : `${Y}${SPEED_LABELS[speed]}${X}`;
    out(`${C}│${X}  ${title}   ${loopStr}  ${shufStr}  ${spdStr}  ${volStr}`);
    out(`${C}├${LINE}┤${X}`);

    // Search bar
    if (searchMode || searchQuery) {
        const q = searchQuery + (searchMode ? "\x1b[5m█\x1b[25m" : "");
        out(`${C}│${X}  🔍 Search: ${Y}${q}${X}  (${filtered.length} results)`);
        out(`${C}├${LINE}┤${X}`);
    }

    // Playlist
    out(`${C}│${X}  ${D}PLAYLIST  (↑/↓ navigate · Enter play · n/p next/prev · ←/→ seek 5s · f speed · / search)${X}`);
    out(`${C}│${X}`);

    if (filtered.length === 0) {
        out(`${C}│${X}   ${D}  No songs found.${X}`);
    } else {
        filtered.forEach((song, i) => {
            const name = cleanName(song);
            const num = i < 9 ? `${D}[${i + 1}]${X}` : `   `;
            const isSelected = i === cursorIdx;
            const isPlaying = i === playingIdx && player;

            let icon = "  ";
            let nameColor = D;
            if (isPlaying) { icon = paused ? `${Y}⏸ ${X}` : `${G}▶ ${X}`; nameColor = G; }
            if (isSelected && isPlaying) nameColor = G + "\x1b[1m";
            if (isSelected && !isPlaying) { icon = `${M}→ ${X}`; nameColor = M + "\x1b[1m"; }

            const maxLen = Math.max(15, W - 18);
            const padded = name.length > maxLen ? name.substring(0, maxLen - 3) + "..." : name;
            out(`${C}│${X}  ${num} ${icon}${nameColor}${padded}${X}`);
        });
    }

    out(`${C}│${X}`);
    out(`${C}├${LINE}┤${X}`);

    // Now playing dashboard
    if (playingIdx !== -1 && player && filtered[playingIdx]) {
        const name = cleanName(filtered[playingIdx]);
        const curElapsed = Math.min(duration, Math.max(0, Math.floor(elapsed)));
        const pct = duration > 0 ? Math.min(1, curElapsed / duration) : 0;
        const barW = Math.max(10, W - 18);
        const filled = Math.min(barW, Math.floor(barW * pct));
        const progressBar = `${G}${"█".repeat(filled)}${D}${"░".repeat(Math.max(0, barW - filled))}${X}`;
        const statusStr = paused ? `${Y}⏸  PAUSED${X}` : `${G}▶  PLAYING${X}`;

        // Animated visualizer
        const vizFrame = paused ? "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁" : BARS[frame % BARS.length];
        const viz = paused ? `${D}${vizFrame}${X}` : `${G}${vizFrame}${X}`;

        out(`${C}│${X}  ${statusStr}   ${B}${M}${name}${X}`);
        out(`${C}│${X}  ${viz}  ${viz}  ${viz}`);
        out(`${C}│${X}  ${Y}${fmt(curElapsed)}${X} ${progressBar} ${Y}${fmt(duration)}${X}  ${Math.floor(pct * 100)}%`);
    } else {
        out(`${C}│${X}  ${D}▶  Not playing · Select a song and press Enter${X}`);
        out(`${C}│${X}`);
        out(`${C}│${X}`);
    }

    // Notification
    if (notification) {
        out(`${C}│${X}  ${Y}${notification}${X}`);
    }

    out(`${C}├${LINE}┤${X}`);
    out(`${C}│${X}  ${D}[Space] Pause  [←/→] -/+5s  [f] Speed  [n/p] Next/Prev  [+/-] Vol  [m] Mute  [l] Loop  [s] Shuffle  [/] Search  [q] Quit${X}`);
    out(`${C}└${LINE}┘${X}`);
}

// ─── Playback ─────────────────────────────────────────────────────────────────
function spawnPlayer(songPath, startAt) {
    const vol = muted ? 0 : volume / 100;
    const volStr = String(vol);
    const rateStr = String(speed);

    let fileToPlay = songPath;
    if (startAt > 0 && duration > 0) {
        try {
            const stat = fs.statSync(songPath);
            const ratio = Math.min(0.99, Math.max(0, startAt / duration));
            const byteOffset = Math.floor(ratio * stat.size);
            const fullBuf = fs.readFileSync(songPath);
            const sliceBuf = fullBuf.subarray(byteOffset);
            fs.writeFileSync(SEEK_TMP_FILE, sliceBuf);
            fileToPlay = SEEK_TMP_FILE;
        } catch (_) {
            fileToPlay = songPath;
        }
    }

    return spawn("afplay", ["-v", volStr, "-r", rateStr, fileToPlay], {
        stdio: ["ignore", "ignore", "ignore"]
    });
}

function killPlayer(proc) {
    if (!proc) return;
    try {
        proc.kill("SIGKILL");
    } catch (_) {}
}

function startTicker() {
    clearInterval(ticker);
    ticker = setInterval(() => {
        if (!paused && player) {
            elapsed += 0.5 * speed;
            frame++;
            if (elapsed >= duration && duration > 0) {
                elapsed = duration;
            }
            draw();
        }
    }, 500);
}

function playSong(idx, startAt) {
    if (idx < 0 || idx >= filtered.length) return;

    if (player) { killPlayer(player); player = null; }
    clearInterval(ticker);
    ticker = null;

    cursorIdx  = idx;
    playingIdx = idx;
    paused     = false;
    elapsed    = startAt || 0;
    frame      = 0;

    const songPath = path.join(SONGS_DIR, filtered[idx]);
    if (!startAt) duration = parseMp3Duration(songPath);

    player = spawnPlayer(songPath, startAt || 0);

    player.on("error", () => { player = null; cleanupSeekFile(); draw(); });
    player.on("close", (code, signal) => {
        if (signal === "SIGKILL") return;
        player = null;
        clearInterval(ticker);
        ticker = null;
        cleanupSeekFile();
        handleSongEnd();
    });

    startTicker();
    draw();
}

function seekTo(newElapsed) {
    if (!player || playingIdx === -1) return;
    const idx       = playingIdx;
    const target    = Math.max(0, Math.min(duration, Math.round(newElapsed)));
    const wasPaused = paused;

    killPlayer(player);
    player = null;
    clearInterval(ticker);
    ticker = null;

    elapsed = target;
    paused  = false;

    const songPath = path.join(SONGS_DIR, filtered[idx]);
    player = spawnPlayer(songPath, target);

    player.on("error", () => { player = null; cleanupSeekFile(); draw(); });
    player.on("close", (code, signal) => {
        if (signal === "SIGKILL") return;
        player = null;
        clearInterval(ticker);
        ticker = null;
        cleanupSeekFile();
        handleSongEnd();
    });

    startTicker();

    if (wasPaused) {
        try { player.kill("SIGSTOP"); } catch (_) {}
        paused = true;
    }
    draw();
}

function restartPlayerInPlace() {
    if (!player || playingIdx === -1) return;
    const idx          = playingIdx;
    const savedElapsed = elapsed;
    const savedDuration= duration;
    const wasPaused    = paused;

    killPlayer(player);
    player = null;
    clearInterval(ticker);
    ticker = null;

    elapsed  = savedElapsed;
    duration = savedDuration;
    paused   = false;

    const songPath = path.join(SONGS_DIR, filtered[idx]);
    player = spawnPlayer(songPath, savedElapsed);

    player.on("error", () => { player = null; cleanupSeekFile(); draw(); });
    player.on("close", (code, signal) => {
        if (signal === "SIGKILL") return;
        player = null;
        clearInterval(ticker);
        ticker = null;
        cleanupSeekFile();
        handleSongEnd();
    });

    startTicker();

    if (wasPaused) {
        try { player.kill("SIGSTOP"); } catch (_) {}
        paused = true;
    }
}

function handleSongEnd() {
    if (loopMode === "SINGLE") {
        playSong(playingIdx === -1 ? cursorIdx : playingIdx);
        return;
    }

    const list = filtered.length > 0 ? filtered : songs;
    const current = playingIdx;

    let next;
    if (shuffle) {
        if (list.length <= 1) { next = 0; }
        else {
            do { next = Math.floor(Math.random() * list.length); } while (next === current);
        }
    } else {
        next = current + 1;
        if (next >= list.length) {
            if (loopMode === "ALL") next = 0;
            else { playingIdx = -1; elapsed = 0; draw(); return; }
        }
    }

    playSong(next);
}

function togglePause() {
    if (!player) { playSong(cursorIdx); return; }
    if (paused) {
        try { player.kill("SIGCONT"); } catch (_) {}
        paused = false;
        notify("▶ Resumed");
    } else {
        try { player.kill("SIGSTOP"); } catch (_) {}
        paused = true;
        notify("⏸ Paused");
    }
    draw();
}

function nextSong() {
    const list = filtered.length > 0 ? filtered : songs;
    if (list.length === 0) return;
    const current = player ? playingIdx : cursorIdx;

    let next;
    if (shuffle) {
        if (list.length <= 1) { next = 0; }
        else {
            do { next = Math.floor(Math.random() * list.length); } while (next === current);
        }
    } else {
        next = (current + 1) % list.length;
    }
    playSong(next);
}

function prevSong() {
    const list = filtered.length > 0 ? filtered : songs;
    if (list.length === 0) return;
    const current = player ? playingIdx : cursorIdx;

    let prev;
    if (shuffle) {
        if (list.length <= 1) { prev = 0; }
        else {
            do { prev = Math.floor(Math.random() * list.length); } while (prev === current);
        }
    } else {
        prev = (current - 1 + list.length) % list.length;
    }
    playSong(prev);
}

function setVolume(v) {
    volume = Math.max(0, Math.min(100, v));
    muted = false;
    if (player) restartPlayerInPlace();
    notify(`🔊 Volume: ${volume}%`);
    draw();
}

function toggleMute() {
    muted = !muted;
    if (player) restartPlayerInPlace();
    notify(muted ? "🔇 MUTED" : `🔊 Volume: ${volume}%`);
    draw();
}

function cycleSpeed() {
    const idx = SPEEDS.indexOf(speed);
    speed = SPEEDS[(idx + 1) % SPEEDS.length];
    if (player) restartPlayerInPlace();
    notify(`⚡ Speed: ${SPEED_LABELS[speed]}`);
    draw();
}

// ─── Search ───────────────────────────────────────────────────────────────────
function applyFilter() {
    if (!searchQuery) {
        filtered = [...songs];
    } else {
        filtered = songs.filter(s => cleanName(s).toLowerCase().includes(searchQuery.toLowerCase()));
    }
    cursorIdx = Math.min(cursorIdx, Math.max(0, filtered.length - 1));
    draw();
}

// ─── MP3 Duration Parser ──────────────────────────────────────────────────────
function parseMp3Duration(filePath) {
    // Try macOS native afinfo first
    try {
        const out = execSync(`afinfo "${filePath}"`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
        const m = out.match(/estimated duration:\s*([\d.]+)/);
        if (m) return Math.max(1, Math.round(parseFloat(m[1])));
    } catch (_) {}

    // Fallback: parse ID3 and first MPEG header
    try {
        const stat = fs.statSync(filePath);
        const fd = fs.openSync(filePath, "r");
        const head = Buffer.alloc(10);
        fs.readSync(fd, head, 0, 10, 0);

        let id3Size = 0;
        if (head.slice(0, 3).toString() === "ID3") {
            id3Size = 10 + (((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f));
        }

        const chunk = Buffer.alloc(8192);
        fs.readSync(fd, chunk, 0, 8192, id3Size);
        fs.closeSync(fd);

        for (let i = 0; i < chunk.length - 4; i++) {
            if (chunk[i] === 0xff && (chunk[i + 1] & 0xe0) === 0xe0) {
                const version = (chunk[i + 1] & 0x18) >> 3;
                const layer = (chunk[i + 1] & 0x06) >> 1;
                const brIdx = (chunk[i + 2] & 0xf0) >> 4;
                if (version === 3 && layer === 1 && brIdx > 0 && brIdx < 15) {
                    const br = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320][brIdx] * 1000;
                    const audioBytes = stat.size - id3Size;
                    return Math.max(1, Math.round((audioBytes * 8) / br));
                }
            }
        }
    } catch (_) {}
    return 240;
}

// ─── Boot & Cleanup ───────────────────────────────────────────────────────────
function cleanupAndExit() {
    if (player) killPlayer(player);
    clearInterval(ticker);
    cleanupSeekFile();
    process.stdout.write("\x1b[?25h\n");
    process.exit(0);
}

process.on("exit", () => { if (player) killPlayer(player); cleanupSeekFile(); });
process.on("SIGINT", cleanupAndExit);
process.on("SIGTERM", cleanupAndExit);

// Hide cursor for clean UI
process.stdout.write("\x1b[?25l");

fs.readdir(SONGS_DIR, (err, files) => {
    songs = (files || []).filter(f => f.endsWith(".mp3")).sort();
    filtered = [...songs];
    draw();
});

// ─── Key Input ────────────────────────────────────────────────────────────────
listenKeys((key, arg) => {
    // Search mode
    if (searchMode) {
        if (key === "ESC" || key === "ENTER") {
            searchMode = false;
            if (key === "ENTER" && filtered.length > 0) playSong(0);
            else draw();
        } else if (key === "BACKSPACE") {
            searchQuery = searchQuery.slice(0, -1);
            applyFilter();
        } else if (key === "CHAR") {
            searchQuery += arg;
            applyFilter();
        }
        return;
    }

    if (key === "UP") {
        cursorIdx = Math.max(0, cursorIdx - 1);
        draw();
    } else if (key === "DOWN") {
        cursorIdx = Math.min(filtered.length - 1, cursorIdx + 1);
        draw();
    } else if (key === "ENTER") {
        playSong(cursorIdx);
    } else if (key === "SPACE") {
        togglePause();
    } else if (key === "NEXT") {
        nextSong();
    } else if (key === "PREV") {
        prevSong();
    } else if (key === "LOOP") {
        if (loopMode === "OFF") loopMode = "SINGLE";
        else if (loopMode === "SINGLE") loopMode = "ALL";
        else loopMode = "OFF";
        notify(`🔁 Loop: ${loopMode}`);
        draw();
    } else if (key === "SHUFFLE") {
        shuffle = !shuffle;
        notify(`🔀 Shuffle: ${shuffle ? "ON" : "OFF"}`);
        draw();
    } else if (key === "VOL_UP") {
        setVolume(volume + 10);
    } else if (key === "VOL_DOWN") {
        setVolume(volume - 10);
    } else if (key === "MUTE") {
        toggleMute();
    } else if (key === "SEARCH") {
        searchMode = true;
        searchQuery = "";
        applyFilter();
    } else if (key === "ESC") {
        if (searchQuery) { searchQuery = ""; applyFilter(); }
    } else if (key === "NUM") {
        const i = arg - 1;
        if (i >= 0 && i < filtered.length) playSong(i);
    } else if (key === "LEFT") {
        if (player) {
            seekTo(elapsed - 5);
            notify(`⏪ -5s (${fmt(Math.max(0, elapsed - 5))})`);
        }
    } else if (key === "RIGHT") {
        if (player) {
            seekTo(elapsed + 5);
            notify(`⏩ +5s (${fmt(Math.min(duration, elapsed + 5))})`);
        }
    } else if (key === "SPEED") {
        cycleSpeed();
    } else if (key === "QUIT") {
        cleanupAndExit();
    }
});