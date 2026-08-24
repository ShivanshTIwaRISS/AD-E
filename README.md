# AD-E
# AD-3: CLI Music Player

## Topics Covered

* Node.js Child Processes
* `spawn()` Function
* Listing Files using `ls`
* Playing Audio using `afplay`
* Reading User Input from Terminal
* Raw Keyboard Input
* Arrow Key Detection
* CLI Menu Navigation

## What We Built

A terminal-based music player that:

* Reads all `.mp3` files from the current directory
* Displays songs in the terminal
* Allows navigation using Up (↑) and Down (↓) arrow keys
* Plays the selected song when Enter is pressed
* Exits on `Ctrl + C`

## Commands Used

### List Songs

```javascript
spawn("ls", [directoryPath]);
```

### Play Song

```javascript
spawn("afplay", [songPath]);
```

### Raw Input

```javascript
process.stdin.setRawMode(true);
```

## Files

* `cli_player.js` - Main music player
* `raw_io.js` - Keyboard input handling

## Learning

* Working with child processes
* Event-driven programming in Node.js
* Handling keyboard events
* Building interactive CLI applications

---

# AD-4: Raw Terminal Input and Keyboard Event Handling

## Topics Covered

* Raw Input Mode in Node.js
* Reading Keyboard Events
* Arrow Key Detection
* Special Key Handling
* Event-Driven Programming

## What We Built

A keyboard input handler that can:

* Detect Up Arrow (↑)
* Detect Down Arrow (↓)
* Detect Enter Key
* Detect Ctrl + C
* Trigger custom actions based on key presses

## Concepts Used

### Raw Mode

Terminal input is normally line-buffered, meaning input is received only after pressing Enter.

Using raw mode:

```javascript
process.stdin.setRawMode(true);
```

allows key presses to be captured instantly.

### Listening for Keyboard Events

```javascript
process.stdin.on("data", (data) => {
    console.log(data);
});
```

Every key press generates a Buffer object that can be analyzed.

### Arrow Key Detection

Arrow keys generate escape sequences.

#### Up Arrow

```javascript
data[0] === 0x1b &&
data[1] === 0x5b &&
data[2] === 0x41
```

#### Down Arrow

```javascript
data[0] === 0x1b &&
data[1] === 0x5b &&
data[2] === 0x42
```

### Enter Key

```javascript
data[0] === 0x0d
```

### Ctrl + C

```javascript
data[0] === 0x03
```

Used to terminate the application.

## Files

### raw_io.js

Responsible for:

* Capturing keyboard input
* Detecting special keys
* Sending key events to other modules

## Learning Outcomes

* Understanding terminal input streams
* Working with Buffer objects
* Detecting special keyboard keys
* Building reusable input handlers
* Creating interactive CLI applications

## Applications

This module can be reused in:

* CLI Music Players
* Terminal Games
* Interactive Menus
* File Explorers
* Command Line Tools

---

# AD-5: CLI Music Player — Bug Fixes & Controls Upgrade

## Topics Covered

* Child Process Lifecycle Management
* Killing Background Processes
* Process Signal Handling (`SIGINT`, `SIGTERM`, `exit`)
* Hex Key Code Detection
* Modular Playback Logic

## What We Fixed & Added

### Bug Fix: Ctrl+C Not Stopping Audio

Previously, pressing `Ctrl + C` would exit the Node.js process but leave `afplay` running in the background, continuing to play audio.

**Root Cause:** `spawn("afplay", ...)` was called without saving a reference to the child process, so there was no way to kill it on exit.

**Fix:** Store the process reference and kill it explicitly on exit.

```javascript
let currentSongProcess = null;

function stopSong() {
    if (currentSongProcess) {
        currentSongProcess.kill();
        currentSongProcess = null;
    }
}

process.on("exit", stopSong);
process.on("SIGINT", () => { stopSong(); process.exit(0); });
process.on("SIGTERM", () => { stopSong(); process.exit(0); });
```

### New Feature: Next (`n`) and Previous (`p`) Song Controls

Added two new keyboard shortcuts to skip between songs without using the menu:

| Key | Action |
|-----|--------|
| `n` | Skip to next song and play it |
| `p` | Go back to previous song and play it |

Both keys wrap around (last → first, first → last).

#### Key Detection in raw_io.js

```javascript
// n / N
if (data[0] === 0x6e || data[0] === 0x4e) {
    callback("NEXT");
}
// p / P
if (data[0] === 0x70 || data[0] === 0x50) {
    callback("PREV");
}
```

#### Handler in cli_player.js

```javascript
if (key === "NEXT") {
    currentIndex++;
    if (currentIndex >= songs.length) currentIndex = 0;
    playCurrentSong();
}
if (key === "PREV") {
    currentIndex--;
    if (currentIndex < 0) currentIndex = songs.length - 1;
    playCurrentSong();
}
```

### Refactor: `playCurrentSong()` Helper

Extracted the play logic into a reusable function to avoid duplication across `ENTER`, `NEXT`, and `PREV` handlers.

```javascript
function playCurrentSong() {
    const songPath = path.join(SONGS_DIR, songs[currentIndex]);
    console.clear();
    console.log(`Playing: ${songs[currentIndex]}\n`);
    playSong(songPath);
    setTimeout(() => { renderSongs(); }, 1000);
}
```

## Full Controls Reference

| Key         | Action              |
|-------------|---------------------|
| ↑ Up Arrow  | Move selection up   |
| ↓ Down Arrow| Move selection down |
| Enter       | Play selected song  |
| `n`         | Next song           |
| `p`         | Previous song       |
| Ctrl+C      | Exit (stops audio)  |

## Files Modified

* `AD-3/songs/cli_player.js` — Added `stopSong`, `playCurrentSong`, process signal handlers, `NEXT`/`PREV` key handling
* `AD-4/raw_io.js` — Added `n`/`N` and `p`/`P` key byte detection

## Learning

* Always keep a reference to child processes you need to control
* Use `process.on("SIGINT")` to intercept Ctrl+C for graceful cleanup
* Hex values for ASCII keys: `n` = `0x6e`, `p` = `0x70`
* Refactoring repeated logic into helper functions keeps handlers clean
