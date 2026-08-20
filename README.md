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
