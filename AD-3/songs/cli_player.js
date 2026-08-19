#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");
const listenKeys = require("../../AD-4/raw_io");

const SONGS_DIR = __dirname;

let songs = [];
let currentIndex = 0;

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
    spawn("afplay", [songPath]);
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
        const songPath = path.join(
            SONGS_DIR,
            songs[currentIndex]
        );
        console.clear();
        console.log(`Playing: ${songs[currentIndex]}\n`);
        playSong(songPath);
        setTimeout(() => {
            renderSongs();
        }, 1000);
    }
});