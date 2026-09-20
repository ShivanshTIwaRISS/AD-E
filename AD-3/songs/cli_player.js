#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const listenKeys = require("../../AD-4/raw_io");

const SONGS_DIR = __dirname;

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
let searchMode = false;
let searchQuery = "";
let notification = "";
let notifTimer = null;
let frame = 0;

// ─── Animation frames (clean note bars) ───────────────────────────────────────
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
const W = process.stdout.columns || 72;
const LINE = "─".repeat(W - 2);

function fmt(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

function cleanName(f) {
    return f.replace(/\.mp3$/i, "").replace(/[_]/g, " ");
}

function notify(msg) {
    notification = msg;
    clearTimeout(notifTimer);
    notifTimer = setTimeout(() => { notification = ""; draw(); }, 1800);
}

function out(line) { process.stdout.write(line + "\n"); }

function draw() {
    // Jump cursor to top-left, then wipe everything below
    process.stdout.write("\x1b[H\x1b[J");

    const C = "\x1b[96m", M = "\x1b[95m", Y = "\x1b[93m", G = "\x1b[92m",
          R = "\x1b[91m", D = "\x1b[90m", B = "\x1b[1m", X = "\x1b[0m";

    // Header
    out(`${C}┌${LINE}┐${X}`);
    const title = `${B}${M}  🎵  MUSIC PLAYER CLI  🎵${X}`;
    const volStr = muted ? `${R}MUTED${X}` : `${G}VOL ${volume}%${X}`;
    const loopStr = loopMode === "SINGLE" ? `${Y}🔂 ONE${X}` : loopMode === "ALL" ? `${Y}🔁 ALL${X}` : `${D}LOOP OFF${X}`;
    const shufStr = shuffle ? `${Y}🔀 ON${X}` : `${D}SHUF OFF${X}`;
    out(`${C}│${X}  ${title}   ${loopStr}  ${shufStr}  ${volStr}  ${C}│${X}`);
    out(`${C}├${LINE}┤${X}`);

    // Search bar
    if (searchMode || searchQuery) {
        const q = searchQuery + (searchMode ? "\x1b[5m█\x1b[25m" : "");
        out(`${C}│${X}  🔍 Search: ${Y}${q}${X}  (${filtered.length} results)${C}│${X}`);
        out(`${C}├${LINE}┤${X}`);
    }

    // Playlist
    out(`${C}│${X}  ${D}PLAYLIST  (↑/↓ navigate · Enter play · n/p next/prev · / search)${X}  ${C}│${X}`);
    out(`${C}│${X}${C}│${X}`);

    if (filtered.length === 0) {
        out(`${C}│${X}   ${D}  No songs found.${X}                                       ${C}│${X}`);
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

            const padded = name.length > W - 18 ? name.substring(0, W - 21) + "..." : name;
            out(`${C}│${X}  ${num} ${icon}${nameColor}${padded}${X}${C}│${X}`);
        });
    }

    out(`${C}│${X}${C}│${X}`);
    out(`${C}├${LINE}┤${X}`);

    // Now playing dashboard
    if (playingIdx !== -1 && player && filtered[playingIdx]) {
        const name = cleanName(filtered[playingIdx]);
        const pct = duration > 0 ? elapsed / duration : 0;
        const barW = W - 16;
        const filled = Math.floor(barW * pct);
        const progressBar = `${G}${"█".repeat(filled)}${D}${"░".repeat(barW - filled)}${X}`;
        const statusStr = paused ? `${Y}⏸  PAUSED${X}` : `${G}▶  PLAYING${X}`;

        // Animated visualizer (only when playing)
        const vizFrame = paused ? "▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁" : BARS[frame % BARS.length];
        const viz = paused
            ? `${D}${vizFrame}${X}`
            : `${G}${vizFrame}${X}`;

        out(`${C}│${X}  ${statusStr}   ${B}${M}${name}${X}`);
        out(`${C}│${X}  ${viz}  ${viz}  ${viz}  ${viz}`);
        out(`${C}│${X}  ${Y}${fmt(elapsed)}${X} ${progressBar} ${Y}${fmt(duration)}${X}  ${Math.floor(pct * 100)}%`);
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
    out(`${C}│${X}  ${D}[Space] Pause  [n/p] Next/Prev  [+/-] Vol  [m] Mute  [l] Loop  [s] Shuffle  [/] Search  [Ctrl+C] Exit${X}`);
    out(`${C}└${LINE}┘${X}`);
}

// ─── Playback ─────────────────────────────────────────────────────────────────
function stopSong() {
    if (player) {
        player.kill("SIGKILL");
        player = null;
    }
    clearInterval(ticker);
    ticker = null;
    paused = false;
    playingIdx = -1;
    elapsed = 0;
    duration = 0;
    frame = 0;
}

function playSong(idx) {
    if (idx < 0 || idx >= filtered.length) return;

    // Kill any existing process first, synchronously
    if (player) {
        player.kill("SIGKILL");
        player = null;
    }
    clearInterval(ticker);
    ticker = null;

    cursorIdx = idx;
    playingIdx = idx;
    paused = false;
    elapsed = 0;
    frame = 0;

    const songPath = path.join(SONGS_DIR, filtered[idx]);
    duration = parseMp3Duration(songPath);

    const vol = muted ? 0 : volume / 100;
    player = spawn("afplay", ["-v", String(vol), songPath]);

    player.on("error", () => {
        player = null;
        draw();
    });

    player.on("close", (code, signal) => {
        if (signal === "SIGKILL") return; // we killed it intentionally
        player = null;
        clearInterval(ticker);
        ticker = null;
        handleSongEnd();
    });

    ticker = setInterval(() => {
        if (!paused) {
            elapsed++;
            frame++;
            if (elapsed > duration) elapsed = duration;
        }
        draw();
    }, 1000);

    draw();
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
            else { playingIdx = -1; draw(); return; }
        }
    }

    playSong(next);
}

function togglePause() {
    if (!player) { playSong(cursorIdx); return; }
    if (paused) {
        player.kill("SIGCONT");
        paused = false;
    } else {
        player.kill("SIGSTOP");
        paused = true;
    }
    draw();
}

function nextSong() {
    const current = player ? playingIdx : cursorIdx;
    const list = filtered;
    if (list.length === 0) return;

    let next;
    if (shuffle) {
        do { next = Math.floor(Math.random() * list.length); } while (next === current && list.length > 1);
    } else {
        next = (current + 1) % list.length;
    }
    playSong(next);
}

function prevSong() {
    const current = player ? playingIdx : cursorIdx;
    const list = filtered;
    if (list.length === 0) return;

    let prev;
    if (shuffle) {
        do { prev = Math.floor(Math.random() * list.length); } while (prev === current && list.length > 1);
    } else {
        prev = (current - 1 + list.length) % list.length;
    }
    playSong(prev);
}

function setVolume(v) {
    volume = Math.max(0, Math.min(100, v));
    muted = false;
    // Restart with new volume if playing — kill old, spawn new at same seek offset
    if (player) {
        const wasPlaying = !paused;
        const savedElapsed = elapsed;
        const savedDuration = duration;
        const savedIdx = playingIdx;

        player.kill("SIGKILL");
        player = null;
        clearInterval(ticker);
        ticker = null;

        const songPath = path.join(SONGS_DIR, filtered[savedIdx]);
        player = spawn("afplay", ["-v", String(volume / 100), songPath]);

        player.on("error", () => { player = null; draw(); });
        player.on("close", (code, signal) => {
            if (signal === "SIGKILL") return;
            player = null;
            clearInterval(ticker);
            ticker = null;
            handleSongEnd();
        });

        elapsed = savedElapsed;
        duration = savedDuration;
        paused = !wasPlaying;

        ticker = setInterval(() => {
            if (!paused) { elapsed++; frame++; if (elapsed > duration) elapsed = duration; }
            draw();
        }, 1000);

        if (paused) player.kill("SIGSTOP");
    }
    notify(`Volume: ${volume}%`);
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

// ─── MP3 Duration Parser (no ffprobe needed) ──────────────────────────────────
function parseMp3Duration(filePath) {
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

// ─── Boot ─────────────────────────────────────────────────────────────────────
process.on("exit", () => { if (player) player.kill("SIGKILL"); });
process.on("SIGINT", () => { if (player) player.kill("SIGKILL"); process.stdout.write("\x1b[?25h\n"); process.exit(0); });
process.on("SIGTERM", () => { if (player) player.kill("SIGKILL"); process.exit(0); });

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
        notify(`Loop: ${loopMode}`);
        draw();
    } else if (key === "SHUFFLE") {
        shuffle = !shuffle;
        notify(`Shuffle: ${shuffle ? "ON" : "OFF"}`);
        draw();
    } else if (key === "VOL_UP") {
        setVolume(volume + 10);
    } else if (key === "VOL_DOWN") {
        setVolume(volume - 10);
    } else if (key === "MUTE") {
        muted = !muted;
        if (player) setVolume(volume);
        else { notify(muted ? "Muted" : `Volume: ${volume}%`); draw(); }
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
        if (player) { elapsed = Math.max(0, elapsed - 10); notify("⏪ -10s"); draw(); }
    } else if (key === "RIGHT") {
        if (player) { elapsed = Math.min(duration, elapsed + 10); notify("⏩ +10s"); draw(); }
    }
});