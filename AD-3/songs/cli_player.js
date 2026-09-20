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

// Player States
let loopMode = "OFF";
let isShuffle = false;
let volume = 100;
let isMuted = false;
let seekFeedback = "";
let searchMode = false;
let searchQuery = "";
let currentTheme = "CYAN";

// Color Themes
const THEMES = {
    CYAN: { primary: "\x1b[36m", accent: "\x1b[35m", highlight: "\x1b[33m", dim: "\x1b[90m" },
    GREEN: { primary: "\x1b[32m", accent: "\x1b[36m", highlight: "\x1b[33m", dim: "\x1b[90m" },
    MAGENTA: { primary: "\x1b[35m", accent: "\x1b[33m", highlight: "\x1b[36m", dim: "\x1b[90m" },
    YELLOW: { primary: "\x1b[33m", accent: "\x1b[32m", highlight: "\x1b[35m", dim: "\x1b[90m" }
};
const THEME_KEYS = Object.keys(THEMES);

// Dancing Visualizer ASCII Characters
const DANCE_FRAMES = [
    [
        "  (•_•)      (❛‿❛)      /\\_/\\  ",
        "  <) )>      /👗\\     ( o.o ) ~🐾",
        "  /   \\      /   \\     > ^ <   "
    ],
    [
        "  (•_•)      (❛‿❛)      /\\_/\\  ",
        "  \\( )/      \\👗/     ( =.= ) 🐾~",
        "  /   \\      /   \\     > ^ <   "
    ],
    [
        " \\(•_•)/    \\(❛‿❛)/     /\\_/\\  ",
        "   ) )       /👗\\     ( 0.0 ) ~🐾",
        "  /   \\      /   \\     > ^ <   "
    ],
    [
        "  (•_•)      (❛‿❛)      /\\_/\\  ",
        "  <) )\\      ~👗~     ( -.- ) 🐾~",
        "  /   \\       / \\      > ^ <   "
    ]
];

const PAUSED_FRAME = [
    "  (x_x)      (◡_◡)      /\\_/\\  ",
    "  <) )>      /👗\\     ( z.z )  ",
    "  /   \\      /   \\     > ^ <   "
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
    renderSongs();
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
            if (loopMode === "ALL") {
                return 0;
            } else {
                return -1;
            }
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
            if (loopMode === "ALL") {
                return activeList.length - 1;
            } else {
                return -1;
            }
        }
        return prevIndex;
    }
}

function getEffectiveVolume() {
    return isMuted ? 0 : volume / 100;
}

function renderSongs() {
    redrawUI();
    const t = THEMES[currentTheme];

    console.log(`🎵 ${t.accent}CLI Music Player Pro - Dynamic Audio Engine\x1b[0m`);
    console.log("---------------------------------------------------------");
    console.log(`${t.dim}↑/↓: Navigate  | Enter: Play | Space: Pause/Resume | n/p: Next/Prev\x1b[0m`);
    console.log(`${t.dim}+/-: Volume    | m: Mute     | l: Loop     | s: Shuffle | t: Theme\x1b[0m`);
    console.log(`${t.dim}/: Search      | 1-9: Quick  | ←/→: Seek 10s| Esc: Reset search\x1b[0m`);
    console.log("---------------------------------------------------------");

    const loopStatus = loopMode === "SINGLE" ? "🔂 Single" : (loopMode === "ALL" ? "🔁 All" : "Off");
    const shuffleStatus = isShuffle ? "🔀 On" : "Off";
    const volumeStatus = isMuted ? "\x1b[31mMuted\x1b[0m" : `${volume}%`;
    
    console.log(`Loop: ${t.accent}${loopStatus}\x1b[0m | Shuffle: ${t.accent}${shuffleStatus}\x1b[0m | Volume: ${t.accent}${volumeStatus}\x1b[0m | Theme: ${t.accent}${currentTheme}\x1b[0m`);

    if (searchMode || searchQuery) {
        console.log(`Search: ${t.highlight}${searchQuery}${searchMode ? "█" : ""}\x1b[0m (${filteredSongs.length} matches)\n`);
    } else {
        console.log("");
    }

    if (filteredSongs.length === 0) {
        console.log(`   ${t.dim}(No songs found matching query)\x1b[0m`);
    } else {
        filteredSongs.forEach((song, index) => {
            const numPrefix = index < 9 ? `${t.dim}[${index + 1}]\x1b[0m ` : "    ";
            if (index === currentIndex) {
                console.log(`${numPrefix}> ${t.primary}${song}\x1b[0m`);
            } else {
                console.log(`${numPrefix}  ${song}`);
            }
        });
    }

    console.log("\n---------------------------------------------------------");
    if (playingIndex !== -1 && currentSongProcess && filteredSongs[playingIndex]) {
        const frames = isPaused ? PAUSED_FRAME : DANCE_FRAMES[currentTime % DANCE_FRAMES.length];
        console.log("   🕺 Boy       💃 Girl      🐱 Cat");
        frames.forEach(line => console.log(line));
        console.log("");

        const width = 30;
        const percent = currentDuration > 0 ? currentTime / currentDuration : 0;
        const filled = Math.min(width, Math.floor(width * percent));
        const bar = "█".repeat(filled) + "░".repeat(width - filled);
        const statusText = isPaused ? "\x1b[33mPaused\x1b[0m" : "\x1b[32mPlaying\x1b[0m";

        console.log(`Status   : ${statusText}`);
        console.log(`Playing  : ${t.primary}${filteredSongs[playingIndex]}\x1b[0m`);
        console.log(`Progress : [${bar}] ${Math.floor(percent * 100)}% (${formatTime(currentTime)} / ${formatTime(currentDuration)})`);
        if (seekFeedback) {
            console.log(seekFeedback);
        }
    } else {
        console.log(`Status   : ${t.dim}Stopped\x1b[0m`);
        console.log("Select a song and press Enter to play.");
    }
    console.log("---------------------------------------------------------");
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

        currentSongProcess.on("error", (err) => {
            stopSong();
            renderSongs();
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
                        renderSongs();
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
        renderSongs();
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
                renderSongs();
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

    if (key === "SEARCH") {
        searchMode = true;
        renderSongs();
        return;
    }

    if (key === "ESC") {
        if (searchQuery) {
            searchQuery = "";
            applySearchFilter();
        }
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
        renderSongs();
    }
    if (key === "DOWN") {
        currentIndex++;
        if (currentIndex >= filteredSongs.length) {
            currentIndex = Math.max(0, filteredSongs.length - 1);
        }
        renderSongs();
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
                renderSongs();
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
                renderSongs();
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
        renderSongs();
    }
    if (key === "SHUFFLE") {
        isShuffle = !isShuffle;
        renderSongs();
    }
    if (key === "VOL_UP") {
        volume = Math.min(100, volume + 10);
        if (isMuted) isMuted = false;
        if (playingIndex !== -1 && currentSongProcess) playCurrentSong();
        else renderSongs();
    }
    if (key === "VOL_DOWN") {
        volume = Math.max(0, volume - 10);
        if (playingIndex !== -1 && currentSongProcess) playCurrentSong();
        else renderSongs();
    }
    if (key === "MUTE") {
        isMuted = !isMuted;
        if (playingIndex !== -1 && currentSongProcess) playCurrentSong();
        else renderSongs();
    }
    if (key === "THEME") {
        const idx = THEME_KEYS.indexOf(currentTheme);
        currentTheme = THEME_KEYS[(idx + 1) % THEME_KEYS.length];
        renderSongs();
    }
    if (key === "RIGHT") {
        if (playingIndex !== -1 && currentSongProcess) {
            currentTime = Math.min(currentDuration, currentTime + 10);
            seekFeedback = "   \x1b[33m⚡ Seeked +10s (Visual) ⚡\x1b[0m";
            setTimeout(() => {
                seekFeedback = "";
                renderSongs();
            }, 1500);
            renderSongs();
        }
    }
    if (key === "LEFT") {
        if (playingIndex !== -1 && currentSongProcess) {
            currentTime = Math.max(0, currentTime - 10);
            seekFeedback = "   \x1b[33m⚡ Seeked -10s (Visual) ⚡\x1b[0m";
            setTimeout(() => {
                seekFeedback = "";
                renderSongs();
            }, 1500);
            renderSongs();
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

    renderSongs();

    progressInterval = setInterval(() => {
        currentTime++;

        renderSongs();

        if (currentTime >= currentDuration) {
            clearInterval(progressInterval);
        }
    }, 1000);
}