#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");
const listenKeys = require("../../AD-4/raw_io");

const SONGS_DIR = __dirname;

let songs = [];
let currentIndex = 0;
let playingIndex = -1;
let currentSongProcess = null;
let progressInterval = null;
let currentDuration = 0;
let currentTime = 0;
let isPaused = false;
let isInitialRender = true;

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
        // Use SIGKILL to reliably terminate the process immediately,
        // even if it is currently in a stopped (SIGSTOP) state.
        currentSongProcess.kill("SIGKILL");
        currentSongProcess = null;
    }

    clearInterval(progressInterval);
    isPaused = false;
    playingIndex = -1;
}

// Ensure audio stops when Node exits
process.on("exit", stopSong);
process.on("SIGINT", () => {
    stopSong();
    process.exit(0);
});
process.on("SIGTERM", () => {
    stopSong();
    process.exit(0);
});

// List Songs
function listSongs(directoryPath) {
    const lsProcess = spawn("ls", [directoryPath]);
    let output = "";
    lsProcess.stdout.on("data", (data) => {
        output += data.toString();
    });
    lsProcess.on("close", () => {
        songs = output.trim().split(/\r?\n/).filter((file) => file.endsWith(".mp3"));
        renderSongs();
    });
    lsProcess.stderr.on("data", (data) => {
        console.log("Error:", data.toString());
    });
}

// Draw Menu and Status
function renderSongs() {
    redrawUI();
    console.log("🎵 \x1b[35mCLI Music Player - Refined Edition\x1b[0m");
    console.log("-----------------------------------------");
    console.log("\x1b[90m↑/↓: Navigate | Enter: Play | Space: Pause/Resume | n/p: Next/Prev | Ctrl+C: Exit\x1b[0m\n");

    songs.forEach((song, index) => {
        if (index === currentIndex) {
            console.log(` > \x1b[36m${song}\x1b[0m`);
        } else {
            console.log(`   ${song}`);
        }
    });

    console.log("\n-----------------------------------------");
    if (playingIndex !== -1 && currentSongProcess) {
        const width = 30;
        const percent = currentDuration > 0 ? currentTime / currentDuration : 0;
        const filled = Math.min(width, Math.floor(width * percent));
        const bar = "█".repeat(filled) + "░".repeat(width - filled);
        const statusText = isPaused ? "\x1b[33mPaused\x1b[0m" : "\x1b[32mPlaying\x1b[0m";

        console.log(`Status : ${statusText}`);
        console.log(`Playing: \x1b[36m${songs[playingIndex]}\x1b[0m`);
        console.log(`Progress: [${bar}] ${Math.floor(percent * 100)}% (${formatTime(currentTime)} / ${formatTime(currentDuration)})`);
    } else {
        console.log("Status : \x1b[90mStopped\x1b[0m");
        console.log("Select a song and press Enter to play.");
    }
    console.log("-----------------------------------------");
}

// Play Song
function playSong(songPath) {
    stopSong();

    // Dynamically retrieve song duration
    getDuration(songPath, (duration) => {
        currentDuration = duration || 180; // Fallback to 180 seconds if ffprobe fails
        currentTime = 0;
        isPaused = false;
        playingIndex = currentIndex;

        currentSongProcess = spawn("afplay", [songPath]);

        startProgress();

        currentSongProcess.on("close", () => {
            // Check if the process closed naturally (not manually stopped/skipped)
            if (currentSongProcess) {
                clearInterval(progressInterval);
                currentSongProcess = null;

                // Auto-play the next song (wrapped)
                let nextIndex = playingIndex + 1;
                if (nextIndex >= songs.length) {
                    nextIndex = 0;
                }
                currentIndex = nextIndex; // Update menu selection highlight
                playCurrentSong();
            }
        });
    });
}

function playCurrentSong() {
    if (songs.length === 0) return;
    const songPath = path.join(
        SONGS_DIR,
        songs[currentIndex]
    );

    playSong(songPath);
}

function togglePlayPause() {
    if (songs.length === 0) return;

    if (playingIndex === -1 || !currentSongProcess) {
        // If not playing, start playing selection
        playCurrentSong();
        return;
    }

    if (isPaused) {
        // Resume playback
        currentSongProcess.kill("SIGCONT");
        isPaused = false;
        startProgress();
    } else {
        // Pause playback
        currentSongProcess.kill("SIGSTOP");
        isPaused = true;
        clearInterval(progressInterval);
        renderSongs(); // Update UI to show Paused state
    }
}

// Start
listSongs(SONGS_DIR);

// Listen For Keys
listenKeys((key) => {
    if (songs.length === 0) {
        return;
    }
    if (key === "UP") {
        currentIndex--;
        if (currentIndex < 0) {
            currentIndex = 0; // Clamp to top
        }
        renderSongs();
    }
    if (key === "DOWN") {
        currentIndex++;
        if (currentIndex >= songs.length) {
            currentIndex = songs.length - 1; // Clamp to bottom
        }
        renderSongs();
    }
    if (key === "ENTER") {
        playCurrentSong();
    }
    if (key === "NEXT") {
        // Skip next (wraps around)
        currentIndex++;
        if (currentIndex >= songs.length) {
            currentIndex = 0;
        }
        playCurrentSong();
    }
    if (key === "PREV") {
        // Skip previous (wraps around)
        currentIndex--;
        if (currentIndex < 0) {
            currentIndex = songs.length - 1;
        }
        playCurrentSong();
    }
    if (key === "SPACE") {
        togglePlayPause();
    }
});

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

    ffprobe.stdout.on("data", (data) => {
        output += data.toString();
    });

    ffprobe.on("close", () => {
        const parsed = parseFloat(output);
        if (isNaN(parsed)) {
            callback(0);
        } else {
            callback(Math.floor(parsed));
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