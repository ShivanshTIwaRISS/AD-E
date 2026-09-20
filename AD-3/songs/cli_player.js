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

let loopMode = "OFF";
let isShuffle = false;
let volume = 80;
let isMuted = false;
let seekFeedback = "";
let searchMode = false;
let searchQuery = "";

function clearScreen() {
    process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
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
    clearScreen();
    process.exit(0);
});
process.on("SIGTERM", () => {
    stopSong();
    clearScreen();
    process.exit(0);
});

function listSongs(directoryPath) {
    fs.readdir(directoryPath, (err, files) => {
        if (err) {
            songs = [];
        } else {
            songs = files.filter(f => f.endsWith(".mp3")).sort();
        }
        applySearchFilter();
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
    const list = filteredSongs.length > 0 ? filteredSongs : songs;
    if (list.length === 0) return 0;

    if (isShuffle) {
        if (list.length === 1) return 0;
        let nextIndex = playingIndex;
        while (nextIndex === playingIndex) {
            nextIndex = Math.floor(Math.random() * list.length);
        }
        return nextIndex;
    } else {
        let nextIndex = playingIndex + 1;
        if (nextIndex >= list.length) {
            return loopMode === "ALL" ? 0 : -1;
        }
        return nextIndex;
    }
}

function getPrevIndex() {
    const list = filteredSongs.length > 0 ? filteredSongs : songs;
    if (list.length === 0) return 0;

    if (isShuffle) {
        if (list.length === 1) return 0;
        let prevIndex = playingIndex;
        while (prevIndex === playingIndex) {
            prevIndex = Math.floor(Math.random() * list.length);
        }
        return prevIndex;
    } else {
        let prevIndex = playingIndex - 1;
        if (prevIndex < 0) {
            return loopMode === "ALL" ? list.length - 1 : -1;
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
    clearScreen();

    console.log("\x1b[36m=========================================================================\x1b[0m");
    console.log("🎵 \x1b[1m\x1b[35mBOLLYWOOD & HOLLYWOOD CLI MUSIC PLAYER\x1b[0m");
    console.log("\x1b[36m=========================================================================\x1b[0m");

    const loopTxt = loopMode === "SINGLE" ? "Repeat One" : (loopMode === "ALL" ? "Repeat All" : "Off");
    const shufTxt = isShuffle ? "On" : "Off";
    const volTxt = isMuted ? "\x1b[31mMuted\x1b[0m" : `${volume}%`;

    console.log(`Loop: \x1b[33m${loopTxt}\x1b[0m | Shuffle: \x1b[33m${shufTxt}\x1b[0m | Vol: \x1b[33m${volTxt}\x1b[0m`);
    console.log("\x1b[36m-------------------------------------------------------------------------\x1b[0m");

    if (searchMode || searchQuery) {
        console.log(`🔍 Search: \x1b[33m${searchQuery}${searchMode ? "█" : ""}\x1b[0m (${filteredSongs.length} tracks found)`);
        console.log("\x1b[36m-------------------------------------------------------------------------\x1b[0m");
    }

    console.log("\x1b[90mPLAYLIST:\x1b[0m");
    if (filteredSongs.length === 0) {
        console.log("   \x1b[90m(No songs found)\x1b[0m");
    } else {
        filteredSongs.forEach((song, idx) => {
            const cleanName = cleanSongTitle(song);
            const numTag = idx < 9 ? `[${idx + 1}]` : "   ";

            if (idx === currentIndex) {
                const isPlayingThis = idx === playingIndex && currentSongProcess;
                const statusTag = isPlayingThis ? (isPaused ? "\x1b[33m[PAUSED]\x1b[0m" : "\x1b[32m[PLAYING]\x1b[0m") : "";
                console.log(` > \x1b[1m\x1b[36m${numTag} ${cleanName}\x1b[0m ${statusTag}`);
            } else if (idx === playingIndex && currentSongProcess) {
                console.log(`   \x1b[32m${numTag} ${cleanName} (Now Playing)\x1b[0m`);
            } else {
                console.log(`   \x1b[90m${numTag}\x1b[0m ${cleanName}`);
            }
        });
    }

    console.log("\x1b[36m-------------------------------------------------------------------------\x1b[0m");

    if (playingIndex !== -1 && currentSongProcess && filteredSongs[playingIndex]) {
        const width = 30;
        const percent = currentDuration > 0 ? currentTime / currentDuration : 0;
        const filled = Math.min(width, Math.floor(width * percent));
        const bar = "█".repeat(filled) + "░".repeat(width - filled);
        const statusText = isPaused ? "\x1b[33mPAUSED\x1b[0m" : "\x1b[32mPLAYING\x1b[0m";
        const currentTitle = cleanSongTitle(filteredSongs[playingIndex]);

        console.log(`Status   : ${statusText}`);
        console.log(`Playing  : \x1b[1m\x1b[35m${currentTitle}\x1b[0m`);
        console.log(`Progress : [\x1b[32m${bar}\x1b[0m] ${Math.floor(percent * 100)}% (${formatTime(currentTime)} / ${formatTime(currentDuration)})`);
        if (seekFeedback) {
            console.log(seekFeedback);
        }
    } else {
        console.log("Status   : \x1b[90mStopped\x1b[0m");
        console.log("Select any song with ↑/↓ or 1-9 and press ENTER to play.");
    }

    console.log("\x1b[36m-------------------------------------------------------------------------\x1b[0m");
    console.log("\x1b[90mCONTROLS:\x1b[0m");
    console.log(" ↑/↓    : Navigate Selection     | Enter : Play Selected Song");
    console.log(" Space  : Pause / Resume Audio   | n / p : Skip to Next / Previous Track");
    console.log(" + / -  : Volume Up / Down       | m     : Toggle Mute");
    console.log(" l / s  : Loop Mode / Shuffle    | /     : Search Songs");
    console.log(" 1 - 9  : Quick Direct Play      | ← / → : Seek 10 Seconds");
    console.log(" Ctrl+C : Exit Player");
    console.log("\x1b[36m=========================================================================\x1b[0m");
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

    if (key === "SEARCH") {
        searchMode = true;
        renderUI();
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
    if (key === "RIGHT") {
        if (playingIndex !== -1 && currentSongProcess) {
            currentTime = Math.min(currentDuration, currentTime + 10);
            seekFeedback = "   \x1b[33m⚡ Seeked +10s ⚡\x1b[0m";
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
            seekFeedback = "   \x1b[33m⚡ Seeked -10s ⚡\x1b[0m";
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