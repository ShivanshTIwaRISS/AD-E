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
