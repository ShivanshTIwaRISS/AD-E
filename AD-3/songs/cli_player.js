#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");
const listenKeys = require("../../AD-4/raw_io");

const SONGS_DIR = __dirname;

let songs = [];
let currentIndex = 0;
let currentSongProcess = null;
let progressInterval = null;
let currentDuration = 0;
let currentTime = 0;

function stopSong() {
    if (currentSongProcess) {
        currentSongProcess.kill();
        currentSongProcess = null;
    }

    clearInterval(progressInterval);
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
    lsProcess.on("close", () => {songs = output.trim().split(/\r?\n/).filter((file) => file.endsWith(".mp3"));
        renderSongs();
    });
    lsProcess.stderr.on("data", (data) => {
        console.log("Error:", data.toString());
    });
}
// Draw Menu
function renderSongs() {
    console.clear();
    console.log("🎵 CLI Music Player");
    console.log("-------------------");
    console.log("↑ Up Arrow");
    console.log("↓ Down Arrow");
    console.log("Enter Play Song");
    console.log("n Next Song");
    console.log("p Previous Song");
    console.log("Ctrl+C Exit\n");
    songs.forEach((song, index) => {
        if (index === currentIndex) {
            console.log(`> ${song}`);
        } else {
            console.log(`  ${song}`);
        }
    });
}
// Play Song
function playSong(songPath) {

    stopSong();

    currentDuration = 180; // assume 3 min

    currentSongProcess = spawn(
        "afplay",
        [songPath]
    );

    startProgress();

    currentSongProcess.on("close", () => {

        clearInterval(progressInterval);

        currentSongProcess = null;

        renderSongs();
    });
}

function playCurrentSong() {
    const songPath = path.join(
        SONGS_DIR,
        songs[currentIndex]
    );

    playSong(songPath);
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
            currentIndex = songs.length - 1;
        }
        renderSongs();
    }
    if (key === "DOWN") {
        currentIndex++;
        if (currentIndex >= songs.length) {
            currentIndex = 0;
        }
        renderSongs();
    }
    if (key === "ENTER") {
        playCurrentSong();
    }
    if (key === "NEXT") {
        currentIndex++;
        if (currentIndex >= songs.length) {
            currentIndex = 0;
        }
        playCurrentSong();
    }
    if (key === "PREV") {
        currentIndex--;
        if (currentIndex < 0) {
            currentIndex = songs.length - 1;
        }
        playCurrentSong();
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
        callback(Math.floor(parseFloat(output)));
    });
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function drawProgress() {
    const width = 30;

    const percent =
        currentDuration > 0
            ? currentTime / currentDuration
            : 0;

    const filled = Math.floor(width * percent);

    const bar =
        "█".repeat(filled) +
        "░".repeat(width - filled);

    console.clear();

    console.log("🎵 CLI Music Player");
    console.log("-------------------");
    console.log(`Playing: ${songs[currentIndex]}\n`);

    console.log(
        `[${bar}] ${Math.floor(percent * 100)}%`
    );

    console.log(
        `${formatTime(currentTime)} / ${formatTime(currentDuration)}`
    );
}

function startProgress() {
    clearInterval(progressInterval);

    currentTime = 0;

    drawProgress();

    progressInterval = setInterval(() => {
        currentTime++;

        drawProgress();

        if (currentTime >= currentDuration) {
            clearInterval(progressInterval);
        }
    }, 1000);
}