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
        if (key === "\u001b[A") { callback("UP");    return; }
        if (key === "\u001b[B") { callback("DOWN");  return; }
        if (key === "\u001b[C") { callback("RIGHT"); return; }
        if (key === "\u001b[D") { callback("LEFT");  return; }
        if (key === "\u001b")   { callback("ESC");   return; }
        if (key === "\r" || key === "\n") { callback("ENTER"); return; }
        if (key === "\u007f" || key === "\u0008") { callback("BACKSPACE"); return; }
        if (key === " ")  { callback("SPACE");   return; }
        if (key === "n" || key === "N") { callback("NEXT");    return; }
        if (key === "p" || key === "P") { callback("PREV");    return; }
        if (key === "l" || key === "L") { callback("LOOP");    return; }
        if (key === "s" || key === "S") { callback("SHUFFLE"); return; }
        if (key === "+" || key === "=") { callback("VOL_UP");  return; }
        if (key === "-" || key === "_") { callback("VOL_DOWN");return; }
        if (key === "m" || key === "M") { callback("MUTE");    return; }
        if (key === "/")                { callback("SEARCH");  return; }
        if (key >= "1" && key <= "9")  { callback("NUM", parseInt(key, 10)); return; }
        callback("CHAR", key);
    });
};