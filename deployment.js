const path = "C:/LocalDev/amelia/adventureland/";
const files = { 1 : { path : "farm.js", name : "farm" }, 2 : { path : "merchant.js", name : "merchant" } };

const fs = require('fs');
const util = require('util');

// Convert fs.readFile into Promise version of same    
const readFile = util.promisify(fs.readFile);

parent.api_call("list_codes", {
    callback: function () {
        if (show_game_log) game_log("updating from local");
        for (let slot in files) {
            let file = files[slot];
            let name = file.name;
            readFile(path + file.path, 'utf8').then(content => {
                let data = { name: name, slot: slot, code: content };
                parent.api_call("save_code", data);
                if (show_game_log) game_log("saved to slot [" + slot + "] as " + name);
            }).catch((err) => {
                if (show_game_log) game_log(err);
            });
        }
    }
});
