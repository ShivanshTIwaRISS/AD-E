#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const listenKeys = require("../../AD-4/raw_io");

const SONGS_DIR = __dirname;

let songs = [];
let filteredSongs = [];
let currentIndex = 0;
let playingIndex = -1;
let currentSongProcess = null;
let progressInterval = null;
let currentDuration = 0;
let currentTime = 0;
let isPaused = false;
let isInitialRender = true;

let loopMode = "OFF"; // "OFF", "SINGLE", "ALL"
let isShuffle = false;
let volume = 80;
let isMuted = false;
let seekFeedback = "";
let searchMode = false;
let searchQuery = "";
let currentTheme = "NEON_VIPER";
let activeTab = "PLAYER"; // "PLAYER", "HELP"

const THEMES = {
    NEON_VIPER: { primary: "\x1b[38;5;51m", accent: "\x1b[38;5;198m", highlight: "\x1b[38;5;226m", dim: "\x1b[38;5;242m", box: "\x1b[38;5;141m" },
    BOLLYWOOD_GOLD: { primary: "\x1b[38;5;220m", accent: "\x1b[38;5;208m", highlight: "\x1b[38;5;196m", dim: "\x1b[38;5;244m", box: "\x1b[38;5;214m" },
    CYBER_GREEN: { primary: "\x1b[38;5;46m", accent: "\x1b[38;5;51m", highlight: "\x1b[38;5;226m", dim: "\x1b[38;5;240m", box: "\x1b[38;5;34m" },
    SUNSET_PURPLE: { primary: "\x1b[38;5;135m", accent: "\x1b[38;5;205m", highlight: "\x1b[38;5;227m", dim: "\x1b[38;5;243m", box: "\x1b[38;5;99m" }
};
const THEME_KEYS = Object.keys(THEMES);

// Audio Visualizer Bars (12 columns x 4 frames)
const VISUALIZER_FRAMES = [
    [" ▂▃▄▅▆▇█▇▆▅▄", "▄▅▆▇█▇▆▅▄▃▂ ", "▇▆▅▄▃▂ ▂▃▄▅▆"],
    ["▃▄▅▆▇█▇▆▅▄▃▂", "▆▇█▇▆▅▄▃▂ ▂▃", "▅▄▃▂ ▂▃▄▅▆▇█"],
    ["▅▆▇█▇▆▅▄▃▂ ▂", "█▇▆▅▄▃▂ ▂▃▄▅", "▃▂ ▂▃▄▅▆▇█▇▆"],
    ["▇█▇▆▅▄▃▂ ▂▃▄", "▃▂ ▂▃▄▅▆▇█▇▆", "▂ ▂▃▄▅▆▇█▇▆▅"]
];

// Animated ASCII Dancers with stage lights
const DANCE_FRAMES = [
    [
        "  ✨ (•_•) ✨      💃 (❛‿❛) 💃      🐱 /\\_/\\ 🐱 ",
        "  <)   )>          /👗\\            ( o.o ) ~🐾",
        "  /     \\          /   \\            > ^ <     "
    ],
    [
        "  🎶 (•_•) 🎶      💃 (❛‿❛) 💃      🐱 /\\_/\\ 🐱 ",
        "  \\(   )/          \\👗/            ( =.= ) 🐾~",
        "  /     \\          /   \\            > ^ <     "
    ],
    [
        "  🔥 \\(•_•)/ 🔥    💃 \\(❛‿❛)/ 💃    🐱 /\\_/\\ 🐱 ",
        "     (   )          /👗\\            ( 0.0 ) ~🐾",
        "    /     \\         /   \\            > ^ <     "
    ],
    [
        "  ⚡ (•_•) ⚡      💃 (❛‿❛) 💃      🐱 /\\_/\\ 🐱 ",
        "  <)   )\\          ~👗~            ( -.- ) 🐾~",
        "  /     \\           / \\             > ^ <     "
    ]
];

const PAUSED_FRAME = [
    "     (x_x) zZZ        (◡_◡) zZZ        /\\_/\\  zZZ",
    "     <) )>            /👗\\            ( z.z )    ",
    "     /   \\            /   \\            > ^ <     "
];

function redrawUI() {
    if (isInitialRender) {
        console.clear();
        isInitialRender = false;
    } else {
        process.stdout.write("\x1b[H\x1b[J");
    }
}

function stopSong() {
    if (currentSongProcess) {
        currentSongProcess.kill("SIGKILL");
        currentSongProcess = null;
    }

    clearInterval(progressInterval);
    isPaused = false;
    playingIndex = -1;
}

process.on("exit", stopSong);
process.on("SIGINT", () => {
    stopSong();
    process.exit(0);
});
process.on("SIGTERM", () => {
    stopSong();
    process.exit(0);
});

function listSongs(directoryPath) {
    const lsProcess = spawn("ls", [directoryPath]);
    let output = "";
    lsProcess.stdout.on("data", (data) => {
        output += data.toString();
    });
    lsProcess.on("close", () => {
        songs = output.trim().split(/\r?\n/).filter((file) => file.endsWith(".mp3"));
        applySearchFilter();
    });
    lsProcess.stderr.on("data", (data) => {
        console.log("Error:", data.toString());
    });
}

function applySearchFilter() {
    if (!searchQuery) {
        filteredSongs = [...songs];
    } else {
        filteredSongs = songs.filter(s => s.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (currentIndex >= filteredSongs.length) {
        currentIndex = Math.max(0, filteredSongs.length - 1);
    }
    renderUI();
}

function getNextIndex() {
    const activeList = filteredSongs.length > 0 ? filteredSongs : songs;
    if (activeList.length === 0) return 0;

    if (isShuffle) {
        if (activeList.length === 1) return 0;
        let nextIndex = playingIndex;
        while (nextIndex === playingIndex) {
            nextIndex = Math.floor(Math.random() * activeList.length);
        }
        return nextIndex;
    } else {
        let nextIndex = playingIndex + 1;
        if (nextIndex >= activeList.length) {
            return loopMode === "ALL" ? 0 : -1;
        }
        return nextIndex;
    }
}

function getPrevIndex() {
    const activeList = filteredSongs.length > 0 ? filteredSongs : songs;
    if (activeList.length === 0) return 0;

    if (isShuffle) {
        if (activeList.length === 1) return 0;
        let prevIndex = playingIndex;
        while (prevIndex === playingIndex) {
            prevIndex = Math.floor(Math.random() * activeList.length);
        }
        return prevIndex;
    } else {
        let prevIndex = playingIndex - 1;
        if (prevIndex < 0) {
            return loopMode === "ALL" ? activeList.length - 1 : -1;
        }
        return prevIndex;
    }
}

function getEffectiveVolume() {
    return isMuted ? 0 : volume / 100;
}

function cleanSongTitle(filename) {
    return filename
        .replace(/\.mp3$/i, "")
        .replace(/_/g, " ")
        .replace(/-/g, " ");
}

function renderUI() {
    redrawUI();
    const t = THEMES[currentTheme];
    const b = t.box;
    const reset = "\x1b[0m";

    console.log(`${b}╔═══════════════════════════════════════════════════════════════════════════╗${reset}`);
    console.log(`${b}║ ${t.accent}🎧 BOLLYWOOD CLI MUSIC PLAYER PRO v2.0${reset}  ${t.dim}[Theme: ${currentTheme}]${reset}        ${b}║${reset}`);
    console.log(`${b}╠═══════════════════════════════════════════════════════════════════════════╣${reset}`);

    // Quick Action Bar
    const loopTxt = loopMode === "SINGLE" ? "🔂 Single" : (loopMode === "ALL" ? "🔁 Playlist" : "Off");
    const shufTxt = isShuffle ? "🔀 On" : "Off";
    const volTxt = isMuted ? "\x1b[31mMUTED\x1b[0m" : `🔊 ${volume}%`;
    console.log(`${b}║${reset}  Loop: ${t.accent}${loopTxt.padEnd(10)}${reset} | Shuffle: ${t.accent}${shufTxt.padEnd(5)}${reset} | Vol: ${t.accent}${volTxt.padEnd(10)}${reset} | Tab: ${t.highlight}[h] Help${reset} ${b}║${reset}`);
    console.log(`${b}╠═══════════════════════════════════════════════════════════════════════════╣${reset}`);

    if (activeTab === "HELP") {
        renderHelpTab(t, b, reset);
        return;
    }

    if (searchMode || searchQuery) {
        console.log(`${b}║${reset}  🔍 Search: ${t.highlight}${searchQuery}${searchMode ? "█" : ""}${reset} (${filteredSongs.length} found)${" ".repeat(30 - searchQuery.length)} ${b}║${reset}`);
        console.log(`${b}╠═══════════════════════════════════════════════════════════════════════════╣${reset}`);
    }

    // Playlist Render
    console.log(`${b}║${reset}  ${t.dim}PLAYLIST (${filteredSongs.length} TRACKS):${reset}${" ".repeat(46)} ${b}║${reset}`);
    if (filteredSongs.length === 0) {
        console.log(`${b}║${reset}    ${t.dim}No tracks matched your search query.${reset}${" ".repeat(28)} ${b}║${reset}`);
    } else {
        filteredSongs.forEach((song, idx) => {
            const cleanName = cleanSongTitle(song);
            const truncated = cleanName.length > 42 ? cleanName.substring(0, 39) + "..." : cleanName.padEnd(42);
            const numTag = idx < 9 ? `[${idx + 1}]` : "   ";

            if (idx === currentIndex) {
                const isPlayingThis = idx === playingIndex && currentSongProcess;
                const icon = isPlayingThis ? (isPaused ? "⏸ " : "▶ ") : "👉";
                console.log(`${b}║${reset} ${t.highlight}${numTag} ${icon} ${t.primary}${truncated}${reset} ${t.accent}⭐ SELECTED${reset} ${b}║${reset}`);
            } else if (idx === playingIndex && currentSongProcess) {
                console.log(`${b}║${reset} ${t.dim}${numTag} 🎵 ${reset}${t.accent}${truncated}${reset} ${t.dim}(Playing)${reset}  ${b}║${reset}`);
            } else {
                console.log(`${b}║${reset} ${t.dim}${numTag}    ${truncated}${reset}            ${b}║${reset}`);
            }
        });
    }

    console.log(`${b}╠═══════════════════════════════════════════════════════════════════════════╣${reset}`);

    // Now Playing Dashboard & Audio Visualizer
    if (playingIndex !== -1 && currentSongProcess && filteredSongs[playingIndex]) {
        const frames = isPaused ? PAUSED_FRAME : DANCE_FRAMES[currentTime % DANCE_FRAMES.length];
        const viz = isPaused ? "  ░░░░░░░░░░░░ PAUSED ░░░░░░░░░░░░  " : `  ${t.accent}${VISUALIZER_FRAMES[currentTime % VISUALIZER_FRAMES.length].join("  ")}${reset}  `;
        
        console.log(`${b}║${reset}  ${t.dim}DYNAMIC AUDIO STAGE & VISUALIZER:${reset}${" ".repeat(34)} ${b}║${reset}`);
        frames.forEach(line => {
            console.log(`${b}║${reset}  ${line.padEnd(69)} ${b}║${reset}`);
        });
        console.log(`${b}║${reset}${viz}${" ".repeat(28)} ${b}║${reset}`);
        console.log(`${b}╟───────────────────────────────────────────────────────────────────────────╢${reset}`);

        const width = 34;
        const percent = currentDuration > 0 ? currentTime / currentDuration : 0;
        const filled = Math.min(width, Math.floor(width * percent));
        const bar = "█".repeat(filled) + "░".repeat(width - filled);
        const statusText = isPaused ? "\x1b[33m⏸ PAUSED\x1b[0m" : "\x1b[32m▶ PLAYING\x1b[0m";
        const currentTitle = cleanSongTitle(filteredSongs[playingIndex]);
        const shortTitle = currentTitle.length > 30 ? currentTitle.substring(0, 27) + "..." : currentTitle.padEnd(30);

        console.log(`${b}║${reset}  Track   : ${t.primary}${shortTitle}${reset} | Status: ${statusText.padEnd(18)} ${b}║${reset}`);
        console.log(`${b}║${reset}  Progress: ${t.accent}[${bar}]${reset} ${Math.floor(percent * 100).toString().padStart(3)}% (${formatTime(currentTime)} / ${formatTime(currentDuration)}) ${b}║${reset}`);
        
        if (seekFeedback) {
            console.log(`${b}║${reset}  ${seekFeedback.padEnd(69)} ${b}║${reset}`);
        }
    } else {
        console.log(`${b}║${reset}  ${t.dim}STATUS: STOPPED. Select a track using ↑/↓ or 1-9 and press ENTER.${reset}   ${b}║${reset}`);
    }

    console.log(`${b}╠═══════════════════════════════════════════════════════════════════════════╣${reset}`);
    console.log(`${b}║${reset} ${t.dim}[↑/↓] Nav  [Enter] Play  [Space] Pause  [n/p] Next/Prev  [+] Vol  [/] Search${reset} ${b}║${reset}`);
    console.log(`${b}╚═══════════════════════════════════════════════════════════════════════════╝${reset}`);
}

function renderHelpTab(t, b, reset) {
    console.log(`${b}║${reset}  ${t.highlight}📖 CONTROLS & SHORTCUTS GUIDE:${reset}${" ".repeat(40)} ${b}║${reset}`);
    console.log(`${b}║${reset}                                                                           ${b}║${reset}`);
    console.log(`${b}║${reset}   • ${t.primary}ENTER${reset}      : Play highlighted song                               ${b}║${reset}`);
    console.log(`${b}║${reset}   • ${t.primary}SPACE${reset}      : Pause / Resume playback                             ${b}║${reset}`);
    console.log(`${b}║${reset}   • ${t.primary}n / p${reset}      : Skip to Next / Previous track                       ${b}║${reset}`);
    console.log(`${b}║${reset}   • ${t.primary}+ / -${reset}      : Increase / Decrease Volume (10% step)               ${b}║${reset}`);
    console.log(`${b}║${reset}   • ${t.primary}m${reset}          : Toggle Mute / Unmute                                ${b}║${reset}`);
    console.log(`${b}║${reset}   • ${t.primary}l / s${reset}      : Toggle Loop Mode / Shuffle Mode                     ${b}║${reset}`);
    console.log(`${b}║${reset}   • ${t.primary}t${reset}          : Switch Color Theme (4 neon presets)                 ${b}║${reset}`);
    console.log(`${b}║${reset}   • ${t.primary}/${reset}          : Live Search Mode (Type to filter playlist)          ${b}║${reset}`);
    console.log(`${b}║${reset}   • ${t.primary}1 - 9${reset}      : Quick Jump & Play track index                       ${b}║${reset}`);
    console.log(`${b}║${reset}   • ${t.primary}h${reset}          : Toggle this Help Menu / Main Player View            ${b}║${reset}`);
    console.log(`${b}║${reset}   • ${t.primary}Ctrl + C${reset}   : Stop music and exit player                          ${b}║${reset}`);
    console.log(`${b}║${reset}                                                                           ${b}║${reset}`);
    console.log(`${b}╠═══════════════════════════════════════════════════════════════════════════╣${reset}`);
    console.log(`${b}║${reset}  ${t.accent}Press 'h' or 'ESC' to return to the player...${reset}${" ".repeat(28)} ${b}║${reset}`);
    console.log(`${b}╚═══════════════════════════════════════════════════════════════════════════╝${reset}`);
}

function playSong(songPath) {
    stopSong();

    getDuration(songPath, (duration) => {
        currentDuration = duration || 180;
        currentTime = 0;
        isPaused = false;
        playingIndex = currentIndex;

        const effectiveVol = getEffectiveVolume();
        currentSongProcess = spawn("afplay", ["-v", effectiveVol.toString(), songPath]);

        currentSongProcess.on("error", () => {
            stopSong();
            renderUI();
        });

        startProgress();

        currentSongProcess.on("close", () => {
            if (currentSongProcess) {
                clearInterval(progressInterval);
                currentSongProcess = null;

                if (loopMode === "SINGLE") {
                    playCurrentSong();
                } else {
                    const nextIndex = getNextIndex();
                    if (nextIndex === -1) {
                        stopSong();
                        renderUI();
                    } else {
                        currentIndex = nextIndex;
                        playCurrentSong();
                    }
                }
            }
        });
    });
}

function playCurrentSong() {
    if (filteredSongs.length === 0) return;
    const songPath = path.join(SONGS_DIR, filteredSongs[currentIndex]);
    playSong(songPath);
}

function togglePlayPause() {
    if (filteredSongs.length === 0) return;

    if (playingIndex === -1 || !currentSongProcess) {
        playCurrentSong();
        return;
    }

    if (isPaused) {
        currentSongProcess.kill("SIGCONT");
        isPaused = false;
        startProgress();
    } else {
        currentSongProcess.kill("SIGSTOP");
        isPaused = true;
        clearInterval(progressInterval);
        renderUI();
    }
}

listSongs(SONGS_DIR);

listenKeys((key, extra) => {
    if (searchMode) {
        if (key === "ENTER") {
            searchMode = false;
            if (filteredSongs.length > 0) {
                currentIndex = 0;
                playCurrentSong();
            } else {
                renderUI();
            }
            return;
        }
        if (key === "ESC") {
            searchMode = false;
            searchQuery = "";
            applySearchFilter();
            return;
        }
        if (key === "BACKSPACE") {
            searchQuery = searchQuery.slice(0, -1);
            applySearchFilter();
            return;
        }
        if (key === "CHAR" || key.startsWith("NUM_") || key === "SPACE") {
            const charToAdd = key === "SPACE" ? " " : (key.startsWith("NUM_") ? key.replace("NUM_", "") : extra);
            if (charToAdd && charToAdd.length === 1) {
                searchQuery += charToAdd;
                applySearchFilter();
            }
            return;
        }
    }

    if (songs.length === 0) return;

    if (key === "CHAR" && (extra === "h" || extra === "H")) {
        activeTab = activeTab === "HELP" ? "PLAYER" : "HELP";
        renderUI();
        return;
    }

    if (key === "ESC") {
        if (activeTab === "HELP") {
            activeTab = "PLAYER";
            renderUI();
            return;
        }
        if (searchQuery) {
            searchQuery = "";
            applySearchFilter();
        }
        return;
    }

    if (activeTab === "HELP") return;

    if (key === "SEARCH") {
        searchMode = true;
        renderUI();
        return;
    }

    if (key.startsWith("NUM_")) {
        const num = parseInt(key.replace("NUM_", ""), 10) - 1;
        if (num >= 0 && num < filteredSongs.length) {
            currentIndex = num;
            playCurrentSong();
        }
        return;
    }

    if (key === "UP") {
        currentIndex--;
        if (currentIndex < 0) currentIndex = 0;
        renderUI();
    }
    if (key === "DOWN") {
        currentIndex++;
        if (currentIndex >= filteredSongs.length) {
            currentIndex = Math.max(0, filteredSongs.length - 1);
        }
        renderUI();
    }
    if (key === "ENTER") {
        playCurrentSong();
    }
    if (key === "NEXT") {
        if (playingIndex === -1) {
            currentIndex = (currentIndex + 1) % filteredSongs.length;
            playCurrentSong();
        } else {
            const nextIndex = getNextIndex();
            if (nextIndex !== -1) {
                currentIndex = nextIndex;
                playCurrentSong();
            } else {
                stopSong();
                renderUI();
            }
        }
    }
    if (key === "PREV") {
        if (playingIndex === -1) {
            currentIndex = (currentIndex - 1 + filteredSongs.length) % filteredSongs.length;
            playCurrentSong();
        } else {
            const prevIndex = getPrevIndex();
            if (prevIndex !== -1) {
                currentIndex = prevIndex;
                playCurrentSong();
            } else {
                stopSong();
                renderUI();
            }
        }
    }
    if (key === "SPACE") {
        togglePlayPause();
    }
    if (key === "LOOP") {
        if (loopMode === "OFF") loopMode = "SINGLE";
        else if (loopMode === "SINGLE") loopMode = "ALL";
        else loopMode = "OFF";
        renderUI();
    }
    if (key === "SHUFFLE") {
        isShuffle = !isShuffle;
        renderUI();
    }
    if (key === "VOL_UP") {
        volume = Math.min(100, volume + 10);
        if (isMuted) isMuted = false;
        if (playingIndex !== -1 && currentSongProcess) playCurrentSong();
        else renderUI();
    }
    if (key === "VOL_DOWN") {
        volume = Math.max(0, volume - 10);
        if (playingIndex !== -1 && currentSongProcess) playCurrentSong();
        else renderUI();
    }
    if (key === "MUTE") {
        isMuted = !isMuted;
        if (playingIndex !== -1 && currentSongProcess) playCurrentSong();
        else renderUI();
    }
    if (key === "THEME") {
        const idx = THEME_KEYS.indexOf(currentTheme);
        currentTheme = THEME_KEYS[(idx + 1) % THEME_KEYS.length];
        renderUI();
    }
    if (key === "RIGHT") {
        if (playingIndex !== -1 && currentSongProcess) {
            currentTime = Math.min(currentDuration, currentTime + 10);
            seekFeedback = "   \x1b[38;5;226m⚡ Seeked +10s (Visual Jump) ⚡\x1b[0m";
            setTimeout(() => {
                seekFeedback = "";
                renderUI();
            }, 1500);
            renderUI();
        }
    }
    if (key === "LEFT") {
        if (playingIndex !== -1 && currentSongProcess) {
            currentTime = Math.max(0, currentTime - 10);
            seekFeedback = "   \x1b[38;5;226m⚡ Seeked -10s (Visual Jump) ⚡\x1b[0m";
            setTimeout(() => {
                seekFeedback = "";
                renderUI();
            }, 1500);
            renderUI();
        }
    }
});

function parseMp3Duration(filePath) {
    try {
        const stats = fs.statSync(filePath);
        const fd = fs.openSync(filePath, "r");
        const header = Buffer.alloc(10);
        fs.readSync(fd, header, 0, 10, 0);

        let id3Size = 0;
        if (header.toString("utf8", 0, 3) === "ID3") {
            id3Size = 10 + (((header[6] & 0x7f) << 21) | ((header[7] & 0x7f) << 14) | ((header[8] & 0x7f) << 7) | (header[9] & 0x7f));
        }

        const buf = Buffer.alloc(4096);
        fs.readSync(fd, buf, 0, 4096, id3Size);
        fs.closeSync(fd);

        for (let i = 0; i < buf.length - 4; i++) {
            if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
                const version = (buf[i + 1] & 0x18) >> 3;
                const layer = (buf[i + 1] & 0x06) >> 1;
                const bitrateIdx = (buf[i + 2] & 0xf0) >> 4;

                if (version === 3 && layer === 1) {
                    const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
                    const bitrate = bitrates[bitrateIdx] * 1000;
                    if (bitrate > 0) {
                        const audioBytes = stats.size - id3Size;
                        return Math.round((audioBytes * 8) / bitrate);
                    }
                }
            }
        }
    } catch (e) {}
    return 180;
}

function getDuration(songPath, callback) {
    const ffprobe = spawn("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        songPath
    ]);

    let output = "";
    let hasCallbackBeenCalled = false;

    ffprobe.on("error", () => {
        if (!hasCallbackBeenCalled) {
            hasCallbackBeenCalled = true;
            callback(parseMp3Duration(songPath));
        }
    });

    ffprobe.stdout.on("data", (data) => {
        output += data.toString();
    });

    ffprobe.on("close", () => {
        if (!hasCallbackBeenCalled) {
            hasCallbackBeenCalled = true;
            const parsed = parseFloat(output);
            if (isNaN(parsed) || parsed <= 0) {
                callback(parseMp3Duration(songPath));
            } else {
                callback(Math.floor(parsed));
            }
        }
    });
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function startProgress() {
    clearInterval(progressInterval);

    renderUI();

    progressInterval = setInterval(() => {
        currentTime++;

        renderUI();

        if (currentTime >= currentDuration) {
            clearInterval(progressInterval);
        }
    }, 1000);
}