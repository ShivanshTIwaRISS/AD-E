if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
}
process.stdin.resume();

module.exports = function(callback) {
    process.stdin.on("data", (data) => {
        // Ctrl+C
        if (data[0] === 0x03) {
            process.exit(0);
        }

        // Escape sequence (Arrow keys)
        if (data[0] === 0x1b && data[1] === 0x5b) {
            if (data[2] === 0x41) callback("UP");
            if (data[2] === 0x42) callback("DOWN");
            if (data[2] === 0x43) callback("RIGHT");
            if (data[2] === 0x44) callback("LEFT");
            return;
        }

        // Single Escape key
        if (data.length === 1 && data[0] === 0x1b) {
            callback("ESC");
            return;
        }

        // Enter key
        if (data[0] === 0x0d || data[0] === 0x0a) {
            callback("ENTER");
            return;
        }

        // Backspace key (0x08 or 0x7f)
        if (data[0] === 0x08 || data[0] === 0x7f) {
            callback("BACKSPACE");
            return;
        }

        const char = data.toString("utf8");

        // Specific character handlers
        if (char === "n" || char === "N") callback("NEXT");
        else if (char === "p" || char === "P") callback("PREV");
        else if (char === " ") callback("SPACE");
        else if (char === "l" || char === "L") callback("LOOP");
        else if (char === "s" || char === "S") callback("SHUFFLE");
        else if (char === "+" || char === "=") callback("VOL_UP");
        else if (char === "-" || char === "_") callback("VOL_DOWN");
        else if (char === "m" || char === "M") callback("MUTE");
        else if (char === "t" || char === "T") callback("THEME");
        else if (char === "/") callback("SEARCH");
        else if (char >= "1" && char <= "9") callback("NUM_" + char);
        else callback("CHAR", char);
    });
};