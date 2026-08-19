#!/Users/shivanshtiwari/.local/state/fnm_multishells/56719_1786947617251/bin/node
const { spawn } = require("child_process");
const path = require("path");

const SONGS_DIR = __dirname;
let songs = [];

// List Songs
function listSongs(directoryPath) {
    const lsProcess = spawn("ls", [directoryPath]);
    let output = "";
    lsProcess.stdout.on("data", (data) => {output += data.toString();});
    lsProcess.on("close", () => {songs = output.trim().split(/\r?\n/).filter((file) =>file.endsWith(".mp3"));
        console.log("\nAvailable Songs:\n");
        songs.forEach((song, index) => {
            console.log(`${index}: ${song}`);
        });
        console.log("\nEnter Song Number:");
    });
    lsProcess.stderr.on("data", (data) => {
        console.log("Error:", data.toString());
    });
}
// Play Song
function playSong(songPath) {
    spawn("afplay", [songPath]);
}
listSongs(SONGS_DIR);
// User Input
process.stdin.on("data", (data) => {
    const choice = Number(data.toString().trim());
    if (isNaN(choice) ||choice < 0 ||choice >= songs.length) {
        console.log("Invalid Song Number");
        return;
    }
    const songPath = path.join(SONGS_DIR,songs[choice]);
    console.log(`\nPlaying: ${songs[choice]}\n`);
    playSong(songPath);
});