const colorGreen = "#1ED97C";
const colorWhite = "#EFF6FF";
const colorShading = "#909CC0";
const colorNavy = "#1C222B";
const colorRed = "#FF0000";

// , "wbreeches", "wattire", "wshoes",  "wcap", "wgloves"
let bank_items = ["cupid", "snakefang", "brownenvelope", "frogt", "pstem", "ink", "snakeoil", "seashell", "essenceoffire", "goldenegg", "candypop", "seashell", "firebow", "ornament", "mistletoe", "candy0", "candy1", "candycane", "poison", "gslime", "beewings", "funtoken", "feather0", "gem0", "x0", "x1", "x2", "x3", "x4", "x5", "x6", "x7", "x8"];
let sell_items = ["intamulet", "dexamulet", "stramulet", "crabclaw", "vitscroll", "slimestaff", "stinger", "glolipop", "ringsj", "hpbelt", "hpamulet", "wbreeches", "wattire", "wshoes", "wcap", "cclaw", "vitearring", "rattail"];
// ,  "lostearring"
let compound_items = ["intearring", "dexearring", "strearring"];
let main_character_name = 'Ammage';
let fancypots_position = G.maps.main.npcs.filter(npc => npc.id == "fancypots")[0].position;
let fancypots = {x: fancypots_position[0], y: fancypots_position[1]};
// let merchant_stand_place = { x: -21, y: -313, map: "mansion" };
let merchant_stand_place = { x: 10, y: 10, map: "main" };
let help_queue = [];
let last_respawn = new Date();
let cooperating = { 'HexMer' : { items : {"intearring": { level : -1 }, "dexearring": { level : -1 }, "strearring": { level : -1 } }  }, 'HexNeo' : { items : { "xmace" : { level : 0 }, "fireblade"  : { level : 0 }, "firestaff" : { level : 0 }, "firebow" : { level : 0 } } } };

setInterval(routine, 250);
setInterval(buff_luck, 1000);
setInterval(sell_some, 250);
setInterval(buy_pots, 250);
setInterval(merge_inventory_items, 5000);
setInterval(cooperate, 1000);


function cooperate() {
    for (const name of Object.keys(cooperating)) {
        let entity = get_entity(name);
        if (!entity || distance(character, entity) > 500) {
            // game_log("too far to cooperate with " + name, colorShading);
            continue;
        }

        // game_log("cooperating with " + name, colorGreen);

        let item = cooperating[name];
        if (item && item.items) {
            for (const item_name of Object.keys(item.items)) {
                let item_info = item.items[item_name];
                if (item_info) {
                    let item_index = item_info.level == -1 ? locate_item(item_name) : get_leveled_item_index(item_name, item_info.level);
                    if (item_index == -1) {
                        continue;
                    }

                    game_log("sending " + item_name + " to " + name, colorGreen);

                    send_item(name, item_index, character.items[item_index].q ? character.items[item_index].q : 1);
                }
            }
        }
    }
}

function routine() {
    if (character.rip) {
        check_rip();
        return;
    }
    else {
        regen();
    }
    
    // cannot do change direction while moving
    if (character.moving || smart.moving || (smart.searching && !smart.found)) {
        // close stand if moving
        if (character.stand) close_stand();
        return;
    }

    // store items in bank
    let lost_earring_index = get_leveled_item_index("lostearring", 2);
    if (has_any_bank_item() || lost_earring_index != -1) {
        if (character.stand) close_stand();

        // go to bank
        if (has_bank_item() || lost_earring_index != -1) {
            if (character.map != "bank") {
                smart_move("bank").then(() => {
                    store_bank_items();
                });
            }
            else {
                store_bank_items();
            }
        }
        else if (character.map == "bank") {
            smart_move("main");
        }
    }
    else if (character.map == "bank" && !has_any_bank_item()) {
        // all items stored, go back to main
        smart_move("main");
    }
    else {
        let compoundable_item_indexes = get_compoundable_item();
        // go to sell items to fancypots
        if (has_some_item(sell_items) || character.esize == 0) {
            smart_move("fancypots");
            return;
        }
        else if (compoundable_item_indexes.length >= 3) {
            if (!character.q.compound) {
                
                let upgrade_npc = find_npc("newupgrade");
                if (distance(character, upgrade_npc) < 200) {
                    let scroll_index = get_scroll_index(compoundable_item_indexes[0]);
                    if (scroll_index != -1) {
                        game_log("compounding items");
                        cast_massproduction();
                        compound(compoundable_item_indexes[0], compoundable_item_indexes[1], compoundable_item_indexes[2], scroll_index);
                    }
                    else {
                        game_log("need scroll to compound");
                    }
                }
                else {
                    let scroll_index = get_scroll_index(compoundable_item_indexes[0]);
                    if (scroll_index != -1) {
                        smart_move(find_npc("newupgrade")).then(() => {
                            game_log("compounding items");
                            cast_massproduction();
                            compound(compoundable_item_indexes[0], compoundable_item_indexes[1], compoundable_item_indexes[2], scroll_index);
                        });
                    }
                    else {
                        game_log("need scroll to compound");
                    }
                }
            }
        }
        else if (need_pots()) {
            let fancypots_npc = find_npc("fancypots");
            if (distance(character, fancypots_npc) > 200) {
                game_log("going to fancypots to buy potions");
                smart_move("fancypots").then(() => {
                    buy_pots();
                });
            }
            else {
                buy_pots();
            }
        }
        else if (help_queue && Object.keys(help_queue).length > 0) {
            help();
        }
        else {
            // go to merchant stand place
            if (distance(character, merchant_stand_place) > 100) {
                smart_move(merchant_stand_place).then(() => {
                    open_stand();
                });
            }
            else {
                open_stand();
            }
        }
    }

    help();
}

function has_bank_item() {
    for (let i = 0; i < bank_items.length; i++) {
        let bank_item_name = bank_items[i];
        if (has_item(bank_item_name)) {
            return true;
        }
    }
    return false;
}

function store_bank_items() {
    if (character.map == "bank") {
        let lost_earring_index = get_leveled_item_index("lostearring", 2);
        for (let i = 0; i < bank_items.length; i++) {
            let bank_item_name = bank_items[i];
            if (lost_earring_index != -1) {
                game_log("storing lost earring +2");
                bank_store(lost_earring_index);
                lost_earring_index = -1; // only store once
            }

            let inventory_item_indexes = get_inventory_item_indexes(bank_item_name);
            for (let inventory_item_index of inventory_item_indexes) {
                bank_store(inventory_item_index);
            }
        }

        smart_move("main");
    }
}

function sell_some() {
    if (has_some_item(sell_items) && distance(character, fancypots) < 200) {
        // game_log("going to fancypots to sell items");
        // game_log("near fancy pots");
        for (let i = 0; i < 42; i++) {
            let item = character.items[i];
            if (item && sell_items.includes(item.name)) {
                game_log("selling " + item.name);
                sell(i, item.q ? item.q :1);
            }
        }
    }
}

function need_pots() {
    let hpot_count = inventory_item_count("hpot1");
    let mpot_count = inventory_item_count("mpot1");
    let hpot_to_buy = hpot_count < 9999 ? 9999 - hpot_count : 0;
    let mpot_to_buy = mpot_count < 9999 ? 9999 - mpot_count : 0;

    if (hpot_to_buy == 0 && mpot_to_buy == 0) {
        return false;
    }

    if (mpot_to_buy > 0 && character.gold <= (mpot_to_buy * G.items.mpot1.g)) {
        mpot_to_buy = Math.floor(character.gold / G.items.mpot1.g);
    }

    if (hpot_to_buy > 0 && (character.gold - (mpot_to_buy * G.items.mpot1.g)) <= (hpot_to_buy * G.items.hpot1.g)) {
        hpot_to_buy = Math.floor((character.gold - (mpot_to_buy * G.items.mpot1.g)) / G.items.hpot1.g);
    }

    if (hpot_to_buy == 0 && mpot_to_buy == 0) {
        return false;
    }

    return true;
}

function buy_pots() {
    let hpot_count = inventory_item_count("hpot1");
    let mpot_count = inventory_item_count("mpot1");
    let hpot_to_buy = hpot_count < 9999 ? 9999 - hpot_count : 0;
    let mpot_to_buy = mpot_count < 9999 ? 9999 - mpot_count : 0;

    if (hpot_to_buy == 0 && mpot_to_buy == 0) {
        return;
    }

    let fancypots_npc = find_npc("fancypots");

    if (mpot_to_buy > 0 && character.gold <= (mpot_to_buy * G.items.mpot1.g)) {
        mpot_to_buy = Math.floor(character.gold / G.items.mpot1.g);
    }

    if (hpot_to_buy > 0 && (character.gold - (mpot_to_buy * G.items.mpot1.g)) <= (hpot_to_buy * G.items.hpot1.g)) {
        hpot_to_buy = Math.floor((character.gold - (mpot_to_buy * G.items.mpot1.g)) / G.items.hpot1.g);
    }

    if (hpot_to_buy == 0 && mpot_to_buy == 0) {
        return;
    }

    if (distance(character, fancypots_npc) < 300) {
        if (hpot_to_buy > 0) buy("hpot1", hpot_to_buy);
        if (mpot_to_buy > 0) buy("mpot1", mpot_to_buy);
    }
}

function buff_luck() {
    // luck
    for (const id in parent.entities) {
        var current = parent.entities[id];
        //makes sure its a player
        if (current && is_character(current) && current.ctype != 'merchant') {
            //determines if they already have a mluck boost and if it's from you
            if (current.s.mluck && current?.s?.mluck?.f && current?.s?.mluck?.f != character.name && !current?.s?.mluck?.strong) {
                if (is_in_range(current, "mluck") && can_use("mluck")) {
                    use_skill("mluck", current.name);
                }
            }
            else {
                //if they dont already have a boost then boost them
                if (is_in_range(current, "mluck") && can_use("mluck")) {
                    // use_luck(current);
                    use_skill("mluck", current.name);
                }
            }
        }
    }
}

function cast_massproduction() {
    if (character.ctype != "merchant") return;

    regen();

    if (!character.s || !character.s['massproductionpp']) {
        if (character.level >= 60 && character.mp >= 200) {
            use_skill('massproductionpp');
        }
    }

    if (!character.s || !character.s['massproduction']) {
        if (character.level >= 60 && character.mp >= 200) {
            use_skill('massproduction');
        }
    }
}

function regen() {
    let hpot_count = inventory_item_count("hpot1");
    let mpot_count = inventory_item_count("mpot1");
    set_message("" + count_format(hpot_count) + " " + count_format(mpot_count) + " " + character.esize);

    // todo : if in town and hpot count < 9999 || mpot count < 9999 then buy pots

    let current_mp = character.mp;
    let current_hp = character.hp;

    let max_mp = character.max_mp;
    let max_hp = character.max_hp;

    let mp_required = max_mp - current_mp;
    let hp_required = max_hp - current_hp;

    if (mp_required > 500) {
        use_skill('use_mp');
    }

    if (hp_required > 500) {
        use_skill('use_hp');
    }
}

function count_format(count) {
    if (count > 1000) {
        return Math.floor(count / 1000) + "K";
    }
    return count;
}

function merge_inventory_items() {
    for (let i = 0; i < 42; i++) {
        let item = character.items[i];

        if (item && item.name == "hpot1" && i != 41) {
            let item1 = character.items[41];
            let item2 = character.items[i];
            if (item1 && item2 && item1.q && item2.q && (item1.q + item2.q) <= 9999) {
                swap(41, i);
            }
        }

        if (item && item.name == "mpot1" && i != 40) {
            let item1 = character.items[40];
            let item2 = character.items[i];
            if (item1 && item2 && item1.q && item2.q && (item1.q + item2.q) <= 9999) {
                swap(40, i);
            }
        }
    }

    for (let i = 0; i < 42; i++) {
        let item = character.items[i];
        if (item && item.q) {
            let same_items = get_inventory_item_indexes(item.name);
            let operations_count = same_items.length - 1;
            if (operations_count > 0) {
                for (let j = operations_count; j > 0; j--) {
                    let item1 = character.items[same_items[j]];
                    let item2 = character.items[same_items[j-1]];
                    if (item1 && item2 && item1.q && item2.q && (item1.q + item2.q) <= 9999) {
                        swap(same_items[j], same_items[j-1]);
                    }
                }
            }
        }
    }
}

function get_scroll_index(item_index) {
    let item = character.items[item_index];
    let i = item.level || 0;
    if (item) {
        let item_def = parent.G.items[item.name];
        if (item_def) {
            let is_compound = item_def.compound;
            let is_upgrade = item_def.upgrade;
            if (!is_compound && !is_upgrade) return -1;
            let scroll_prefix = is_compound ? "c" : "";
            let scroll_name = item_def.grades ? (item_def.grades[0] > i ? scroll_prefix + "scroll0" : (item_def.grades[1] > i ? scroll_prefix + "scroll1" : scroll_prefix + "scroll2")) : (i >= 3 ? scroll_prefix + "scroll1" : scroll_prefix + "scroll0");
            return locate_item(scroll_name);
        }
    }

    return -1;
}

function on_party_invite(name) // called by the inviter's name
{
    game_log("Party request from " + name);
    if (name == main_character_name) {
	    accept_party_invite(name);
    }
}

function on_party_request(name) // called by the inviter's name - request = someone requesting to join your existing party
{
    game_log("Party request from " + name);
	if (name == main_character_name) {
	    accept_party_invite(name);
    }
}

function has_item(item_name) {
    let count = inventory_item_count(item_name);
    return count > 0;
}

function has_some_item(items) {
    for (let i = 0; i < items.length; i++) {
        let item_name = items[i];
        if (has_item(item_name)) {
            return true;
        }
    }
    return false;
}

function get_compoundable_item() {
    for (let i = 0; i < compound_items.length; i++) {
        let item_name = compound_items[i];
        for (let l = 0; l < 2; l++) {
            for (let j = 0; j < 42; j++) {
                let item = character.items[j];
                if (item && item.name === item_name) {
                    let item_level = item.level || 0;
                    let items_with_same_level = get_inventory_item_indexes(item_name, item_level);
                    if (items_with_same_level.length >= 3) {
                        return items_with_same_level.slice(0, 3);
                    }
                }
            }
        }
    }

    return [];
}

function has_any_bank_item() {
    for (let i = 0; i < bank_items.length; i++) {
        let bank_item_name = bank_items[i];
        if (has_item(bank_item_name)) {
            return true;
        }
    }
    return false;
}

function inventory_item_count(item_name) {
    let result = 0;
    for (let i = 0; i < 42; i++) {
        let item = character.items[i];
        if (item != null && item.name === item_name) {
            if (!item.q) {
                result += 1;
            } else {
                result += item.q;
            }
        }
    }
    return result;
}

function get_inventory_item_indexes(item_name, level) {
    if (!level) {
        level = 0;
    }
    
    let indexes = [];
    for (let i = 0; i < 42; i++) {
        let item = character.items[i];
        if (item != null && item.name === item_name && ((item.level && item.level === level) || (!item.level && level == 0))) {
            indexes.push(i);
        }
    }
    return indexes;
}

function on_cm(name, data)
{
    if (parent.party[name] == null) return;

    if (data.type == "help") {
        help_queue[name] = { timestamp: Date.now(), data: data, on_the_way: false };
        game_log("received help request from " + name, colorGreen);
    }

    // if (character.moving || smart.moving || (smart.searching && !smart.found)) {
    //     game_log("busy, cannot help " + name + " " + character.moving + " " + smart.moving + " " + smart.searching, colorRed);
    //     return;
    // }



    // let hpot_count = inventory_item_count("hpot1");
    // let mpot_count = inventory_item_count("mpot1");
    
    // if (hpot_count < 9999 || mpot_count < 9999) return;

    // close_stand();

    // let party_member = parent.party[name];
    // if (party_member) {
    //     game_log("received cm from " + name + ": " + JSON.stringify(data));
    //     smart_move(parent.party[name]).then(() => {
    //         let hpot_to_send = 9999 - data.hpot_count;
    //         let mpot_to_send = 9999 - data.mpot_count;

    //         let hpot_index = get_inventory_item_indexes("hpot1")[0];
    //         let mpot_index = get_inventory_item_indexes("mpot1")[0];

    //         send_item(name, hpot_index, hpot_to_send);
    //         send_item(name, mpot_index, mpot_to_send);
    //     });
    // }
}

function help() {
    for (const name in help_queue) {
        let help_request = help_queue[name];
        let help_entity = get_entity(name);
        
        if (help_request.on_the_way) {
            game_log("already on the way to help " + name, colorShading);
            if (!help_entity || distance(character, help_entity) > 300) {
                return;
            }
        }

        if (Date.now() - help_request.timestamp > 60000) {
            delete help_queue[name];
            continue;
        }
        else {
            // nearby lets help
            if (help_entity && distance(character, help_entity) < 300) {
                let hpot_to_send = 9999 - help_request.data.hpot_count;
                let mpot_to_send = 9999 - help_request.data.mpot_count;

                let hpot_index = locate_item("hpot1");
                let mpot_index = locate_item("mpot1");

                delete help_queue[name];
                send_item(name, hpot_index, hpot_to_send);
                send_item(name, mpot_index, mpot_to_send);
                delete help_queue[name];
                continue;
            }
            else {
                help_queue[name].on_the_way = true;
                smart_move(parent.party[name]);
            }


            // if (character.moving || smart.moving || (smart.searching && !smart.found)) {
            //     game_log("busy, cannot help " + name + " " + character.moving + " " + smart.moving + " " + smart.searching, colorRed);
            //     return;
            // }
            // else {
            //     game_log("going to help " + name, colorGreen);
            //     help_queue[name].on_the_way = true;
            //     smart_move(parent.party[name]).then(() => {
            //         let hpot_to_send = 9999 - help_request.data.hpot_count;
            //         let mpot_to_send = 9999 - help_request.data.mpot_count;

            //         let hpot_index = locate_item("hpot1");
            //         let mpot_index = locate_item("mpot1");

            //         send_item(name, hpot_index, hpot_to_send);
            //         send_item(name, mpot_index, mpot_to_send);
            //         delete help_queue[name];
            //      });
            // }
        }
    }
}

function get_leveled_item_index(name, level) {
    if (character.items) {
        for (var i = 0; i < character.items.length; i++) {
            var item = character.items[i];
            if (item && item != null && item.name == name) {
                if ((!level && (!item.level || item.level == 0)) || (level == 0 && (!item.level || item.level == 0)) || item.level == level) {
                    return i;
                }
            }
        }
    }
    return -1;
}

function check_rip() {
    if (character.rip) {
        let now = new Date();
        var secondsWait = Math.round((last_respawn.valueOf() - now.valueOf() + 10000) / 1000);
        if (secondsWait < 0) {
            respawn();
            last_respawn = new Date();
        }
        else {
            set_message("rip " + secondsWait + "s");
        }
        return;
    }
}