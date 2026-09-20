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

# AD-6: CLI Music Player — Progress Bar & Playback Tracking

## Topics Covered

* Playback Progress Tracking
* Timers using `setInterval()`
* CLI Progress Bar Rendering
* Time Formatting
* Dynamic Terminal Updates
* Process Cleanup

## What We Added

### New Feature: Playback Progress Bar

Added a real-time progress bar while a song is playing.

Example:

```text
🎵 CLI Music Player
-------------------
Playing: song.mp3

[██████████████░░░░░░░░░░░░░░] 48%

1:26 / 3:00
```

The progress bar updates every second and displays:

* Current playback time
* Total duration
* Completion percentage

---

## Progress Tracking Variables

```javascript
let progressInterval = null;
let currentDuration = 180;
let currentTime = 0;
```

These variables are used to:

* Track elapsed playback time
* Store song duration
* Manage progress updates

---

## Time Formatting

Created a helper function to convert seconds into `MM:SS` format.

```javascript
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    return `${mins}:${secs.toString().padStart(2, "0")}`;
}
```

Example:

```text
65 seconds → 1:05
125 seconds → 2:05
```

---

## Progress Bar Rendering

A visual progress bar is generated using filled and empty blocks.

```javascript
const bar =
    "█".repeat(filled) +
    "░".repeat(width - filled);
```

The bar length changes according to playback progress.

---

## Dynamic Screen Updates

The terminal screen is refreshed every second.

```javascript
setInterval(() => {
    currentTime++;
    drawProgress();
}, 1000);
```

This creates the effect of a live updating media player.

---

## Process Cleanup

The progress timer is stopped whenever:

* A new song starts
* The current song ends
* The application exits

```javascript
clearInterval(progressInterval);
```

This prevents multiple timers from running simultaneously.

---

## Updated Playback Flow

```text
User Presses Enter
        ↓
Play Song
        ↓
Start Progress Timer
        ↓
Update Progress Every Second
        ↓
Song Ends / User Changes Song
        ↓
Stop Timer
        ↓
Return To Menu
```

---

## Files Modified

### `AD-3/songs/cli_player.js`

Added:

* Progress tracking variables
* Progress bar renderer
* Time formatter
* Progress timer logic
* Cleanup of active timers

No changes were required in:

### `AD-4/raw_io.js`

Keyboard handling remains unchanged.

---

## Learning Outcomes

* Using `setInterval()` for periodic updates
* Building live-updating terminal interfaces
* Creating CLI progress bars
* Formatting time for user-friendly output
* Managing timer lifecycles
* Preventing resource leaks with proper cleanup

---

## Current Controls

| Key | Action |
|------|---------|
| ↑ Up Arrow | Move selection up |
| ↓ Down Arrow | Move selection down |
| Enter | Play selected song |
| n | Next song |
| p | Previous song |
| Ctrl + C | Exit and stop audio |

---

## Applications

The same progress tracking approach can be used in:

* CLI Music Players
* Video Players
* Download Managers
* File Copy Utilities
* Build Tools
* Terminal Dashboards

---

# AD-7: CLI Music Player — Refinement Challenge

## Topics Covered

* Advanced State Management (Navigation selection, Playback index, Loop and Shuffle states)
* In-place redrawing using ANSI Escape Sequences (`\x1b[H\x1b[J`)
* Signal-based Process Control (`SIGSTOP` & `SIGCONT`)
* Defensive Raw Mode input checking (`process.stdin.isTTY`)
* Integration of `ffprobe` for Dynamic Metadata query
* Kernel-level Process Termination (`SIGKILL` vs `SIGTERM`)
* ASCII Character Animation synchronised with progress intervals

## What We Refined & Enhanced

An interactive terminal-based music player dashboard that:

* **Clamps Selection**: Prevents moving the menu highlight cursor above the first song or below the last song.
* **In-place Redrawing**: Writes directly over the current output without scrolling or flickering.
* **Pause / Resume**: Toggles the audio output using the Spacebar, freezing/unfreezing the progress bar.
* **Real Song Duration**: Dynamically queries the MP3 duration instead of assuming a default value.
* **Graceful Exit**: Instantly terminates active and paused processes on exit to prevent resource leakage.
* **Loop Toggle**: Press `l`/`L` to switch loop modes: `Off` (plays straight through), `Single` (repeats current track), or `All` (repeats the entire list).
* **Shuffle Toggle**: Press `s`/`S` to play tracks in random order.
* **Visual Seeking**: Press Left/Right Arrow keys to jump backward/forward 10 seconds (with visual progress changes and seeking notifications).
* **Dancing ASCII Animation**: Displays animated ASCII art characters (🕺 Boy, 💃 Girl, 🐱 Cat) side-by-side that dance to the music when playing and go to sleep when paused.

## Code Examples

### Spacebar Capture & Extended Keys in `raw_io.js`
```javascript
if (data[0] === 0x20) {
    callback("SPACE");
}
if (data[0] === 0x6c || data[0] === 0x4c) {
    callback("LOOP");
}
if (data[0] === 0x73 || data[0] === 0x53) {
    callback("SHUFFLE");
}
```

### Pause/Resume Process Handling in `cli_player.js`
```javascript
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
```

### ASCII Dancer Frames (Changing every second)
```javascript
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
    ]
];
```

## Refined Controls Reference

| Key          | Action                                                    |
|--------------|-----------------------------------------------------------|
| ↑ Up Arrow   | Move selection up (clamped)                               |
| ↓ Down Arrow | Move selection down (clamped)                             |
| Enter        | Play selected song                                        |
| Spacebar     | Pause / Resume song                                       |
| `n`          | Skip to next song (wrapped/shuffle-aware)                 |
| `p`          | Skip to previous song (wrapped/shuffle-aware)             |
| `l`          | Toggle loop mode (`Off` -> `🔂 Single` -> `🔁 All`)       |
| `s`          | Toggle shuffle mode (`Off` / `🔀 On`)                    |
| ← / → Arrows | Seek 10 seconds backward/forward (visually)              |
| Ctrl + C     | Exit and clean up all processes                           |

---

# AD-8: CLI Music Player Pro — Ultimate Features & Native Audio Engine

## Topics Covered

* Native MP3 Header Parsing for Frame-accurate Duration fallback
* Real-time Interactive Terminal Search & Live Filtering
* Volume Control Scaling (`-v` flag integration with `afplay`)
* Dynamic ANSI Color Themes (`Cyan`, `Green`, `Magenta`, `Yellow`)
* Numeric Quick-Key Direct Song Selection (`1`-`9`)
* Full Keyboard Event Mapping in Node.js Raw Mode

## What We Added

An end-to-end full-featured terminal audio dashboard with:

* **Native MP3 Header Parser**: Extracts duration directly from MP3 frame headers if `ffprobe` is not installed, eliminating duration fallback errors.
* **Live Search & Filter**: Press `/` to enter search mode, filter songs in real-time as you type, and press `Enter` to play the top result.
* **Volume Control & Mute**: Press `+`/`-` to adjust audio volume dynamically (0%-100%) and `m` to mute/unmute playback instantly.
* **Numeric Direct Selection**: Press numbers `1` through `9` to jump directly to and play the corresponding track index.
* **Color Themes**: Press `t` to cycle between terminal color palettes (`CYAN`, `GREEN`, `MAGENTA`, `YELLOW`).

## Complete Controls Reference

| Key          | Action                                                    |
|--------------|-----------------------------------------------------------|
| ↑ / ↓ Arrows | Navigate selection up / down                              |
| Enter        | Play selected song                                        |
| Spacebar     | Pause / Resume playback                                   |
| `n` / `p`     | Skip to Next / Previous track                             |
| `+` / `-`     | Increase / Decrease volume (by 10%)                       |
| `m`          | Toggle Mute                                               |
| `l`          | Toggle Loop Mode (`Off` -> `Single` -> `All`)             |
| `s`          | Toggle Shuffle Mode (`Off` / `On`)                        |
| `t`          | Switch ANSI Color Theme                                   |
| `/`          | Activate Search mode (type to filter live)                |
| `1` - `9`    | Quick play track 1 to 9                                   |
| ← / → Arrows | Visual 10s seek jump                                      |
| Esc          | Clear search / exit search mode                           |
| Ctrl + C     | Stop audio and exit application                           |