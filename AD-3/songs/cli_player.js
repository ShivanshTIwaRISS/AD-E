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

// Loop and Shuffle States
let loopMode = "OFF"; // "OFF", "SINGLE", "ALL"
let isShuffle = false;
let seekFeedback = "";

// Dancing ASCII Characters
const DANCE_FRAMES = [
    // Frame 0
    [
        "  (•_•)      (❛‿❛)      /\\_/\\  ",
        "  <) )>      /👗\\     ( o.o ) ~🐾",
        "  /   \\      /   \\     > ^ <   "
    ],
    // Frame 1
    [
        "  (•_•)      (❛‿❛)      /\\_/\\  ",
        "  \\( )/      \\👗/     ( =.= ) 🐾~",
        "  /   \\      /   \\     > ^ <   "
    ],
    // Frame 2
    [
        " \\(•_•)/    \\(❛‿❛)/     /\\_/\\  ",
        "   ) )       /👗\\     ( 0.0 ) ~🐾",
        "  /   \\      /   \\     > ^ <   "
    ],
    // Frame 3
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

// Get the index of the next song to play
function getNextIndex() {
    if (songs.length === 0) return 0;
    if (isShuffle) {
        if (songs.length === 1) return 0;
        let nextIndex = playingIndex;
        while (nextIndex === playingIndex) {
            nextIndex = Math.floor(Math.random() * songs.length);
        }
        return nextIndex;
    } else {
        let nextIndex = playingIndex + 1;
        if (nextIndex >= songs.length) {
            if (loopMode === "ALL") {
                return 0; // Wrap around to the beginning
            } else {
                return -1; // Stop playing
            }
        }
        return nextIndex;
    }
}

// Get the index of the previous song to play
function getPrevIndex() {
    if (songs.length === 0) return 0;
    if (isShuffle) {
        if (songs.length === 1) return 0;
        let prevIndex = playingIndex;
        while (prevIndex === playingIndex) {
            prevIndex = Math.floor(Math.random() * songs.length);
        }
        return prevIndex;
    } else {
        let prevIndex = playingIndex - 1;
        if (prevIndex < 0) {
            if (loopMode === "ALL") {
                return songs.length - 1; // Wrap around to the end
            } else {
                return -1; // Stop playing
            }
        }
        return prevIndex;
    }
}

// Draw Menu and Status Dashboard
function renderSongs() {
    redrawUI();
    console.log("🎵 \x1b[35mCLI Music Player - Refined Edition\x1b[0m");
    console.log("---------------------------------------------------------");
    console.log("\x1b[90m↑/↓: Navigate  | Enter: Play | Space: Pause/Resume | n/p: Next/Prev\x1b[0m");
    console.log("\x1b[90ml: Loop Toggle | s: Shuffle  | ←/→: Jump 10s       | Ctrl+C: Exit\x1b[0m");
    console.log("---------------------------------------------------------");

    const loopStatus = loopMode === "SINGLE" ? "🔂 Single" : (loopMode === "ALL" ? "🔁 All" : "Off");
    const shuffleStatus = isShuffle ? "🔀 On" : "Off";
    console.log(`Loop Mode: \x1b[35m${loopStatus}\x1b[0m | Shuffle: \x1b[35m${shuffleStatus}\x1b[0m\n`);

    songs.forEach((song, index) => {
        if (index === currentIndex) {
            console.log(` > \x1b[36m${song}\x1b[0m`);
        } else {
            console.log(`   ${song}`);
        }
    });

    console.log("\n---------------------------------------------------------");
    if (playingIndex !== -1 && currentSongProcess) {
        // Draw Dancing Characters
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
        console.log(`Playing  : \x1b[36m${songs[playingIndex]}\x1b[0m`);
        console.log(`Progress : [${bar}] ${Math.floor(percent * 100)}% (${formatTime(currentTime)} / ${formatTime(currentDuration)})`);
        if (seekFeedback) {
            console.log(seekFeedback);
        }
    } else {
        console.log("Status   : \x1b[90mStopped\x1b[0m");
        console.log("Select a song and press Enter to play.");
    }
    console.log("---------------------------------------------------------");
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

                if (loopMode === "SINGLE") {
                    // Loop the same song
                    playCurrentSong();
                } else {
                    // Move to the next song
                    const nextIndex = getNextIndex();
                    if (nextIndex === -1) {
                        stopSong();
                        renderSongs();
                    } else {
                        currentIndex = nextIndex; // Align highlight
                        playCurrentSong();
                    }
                }
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
        if (playingIndex === -1) {
            currentIndex = (currentIndex + 1) % songs.length;
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
            currentIndex = (currentIndex - 1 + songs.length) % songs.length;
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
        // OFF -> SINGLE -> ALL -> OFF
        if (loopMode === "OFF") {
            loopMode = "SINGLE";
        } else if (loopMode === "SINGLE") {
            loopMode = "ALL";
        } else {
            loopMode = "OFF";
        }
        renderSongs();
    }
    if (key === "SHUFFLE") {
        isShuffle = !isShuffle;
        renderSongs();
    }
    if (key === "RIGHT") {
        if (playingIndex !== -1 && currentSongProcess) {
            currentTime = Math.min(currentDuration, currentTime + 10);
            seekFeedback = "   \x1b[33m⚡ Seeked +10s (Visual - afplay limitation) ⚡\x1b[0m";
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
            seekFeedback = "   \x1b[33m⚡ Seeked -10s (Visual - afplay limitation) ⚡\x1b[0m";
            setTimeout(() => {
                seekFeedback = "";
                renderSongs();
            }, 1500);
            renderSongs();
        }
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