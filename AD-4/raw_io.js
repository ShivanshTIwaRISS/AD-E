if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
}
process.stdin.resume();
module.exports = function(callback) {
    process.stdin.on("data", (data) => {
        if (data[0] === 0x03) {
            process.exit(0);
        }
        if (data[0] === 0x1b && data[1] === 0x5b) {
            if (data[2] === 0x41) {
                callback("UP");
            }
            if (data[2] === 0x42) {
                callback("DOWN");
            }
            if (data[2] === 0x43) {
                callback("RIGHT");
            }
            if (data[2] === 0x44) {
                callback("LEFT");
            }
        }
        if (data[0] === 0x0d) {
            callback("ENTER");
        }
        if (data[0] === 0x6e || data[0] === 0x4e) {
            callback("NEXT");
        }
        if (data[0] === 0x70 || data[0] === 0x50) {
            callback("PREV");
        }
        if (data[0] === 0x20) {
            callback("SPACE");
        }
        if (data[0] === 0x6c || data[0] === 0x4c) {
            callback("LOOP");
        }
        if (data[0] === 0x73 || data[0] === 0x53) {
            callback("SHUFFLE");
        }
    });
};