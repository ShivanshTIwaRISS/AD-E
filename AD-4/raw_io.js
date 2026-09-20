if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
}
process.stdin.resume();
process.stdin.setEncoding("utf8");

module.exports = function listenKeys(callback) {
    process.stdin.on("data", (key) => {
        if (key === "\u0003") {
            process.exit(0);
        }
        if (key === "\u001b[A" || key === "\u001bOA") { callback("UP");    return; }
        if (key === "\u001b[B" || key === "\u001bOB") { callback("DOWN");  return; }
        if (key === "\u001b[C" || key === "\u001bOC") { callback("RIGHT"); return; }
        if (key === "\u001b[D" || key === "\u001bOD") { callback("LEFT");  return; }
        if (key === "\u001b")   { callback("ESC");   return; }
        if (key === "\r" || key === "\n") { callback("ENTER"); return; }
        if (key === "\u007f" || key === "\u0008") { callback("BACKSPACE"); return; }
        if (key === " ")  { callback("SPACE");   return; }
        if (key === "n" || key === "N" || key === "]") { callback("NEXT");    return; }
        if (key === "p" || key === "P" || key === "[") { callback("PREV");    return; }
        if (key === "l" || key === "L") { callback("LOOP");    return; }
        if (key === "s" || key === "S") { callback("SHUFFLE"); return; }
        if (key === "+" || key === "=") { callback("VOL_UP");  return; }
        if (key === "-" || key === "_") { callback("VOL_DOWN");return; }
        if (key === "m" || key === "M") { callback("MUTE");    return; }
        if (key === "f" || key === "F") { callback("SPEED");   return; }
        if (key === "/")                { callback("SEARCH");  return; }
        if (key === "q" || key === "Q") { callback("QUIT");    return; }
        if (key >= "1" && key <= "9")  { callback("NUM", parseInt(key, 10)); return; }
        callback("CHAR", key);
    });
};