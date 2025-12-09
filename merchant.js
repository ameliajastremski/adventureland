const colorGreen = "#1ED97C";
const colorWhite = "#EFF6FF";
const colorShading = "#909CC0";
const colorNavy = "#1C222B";
const colorRed = "#FF0000";

// , "wbreeches", "wattire", "wshoes",  "wcap", "wgloves"
let bank_items = ["ornament", "mistletoe", "candy0", "candy1", "candycane", "poison", "gslime", "beewings", "funtoken", "feather0", "gem0", "x0", "x1", "x2", "x3", "x4", "x5", "x6", "x7", "x8"];
let sell_items = ["slimestaff", "stinger", "glolipop", "ringsj", "hpbelt", "hpamulet", "wbreeches", "wattire", "wshoes",  "wcap", "wgloves"];
let compound_items = ["intamulet", "dexamulet", "stramulet", "lostearring"];
let main_character_name = 'Ammage';
let fancypots_position = G.maps.main.npcs.filter(npc => npc.id == "fancypots")[0].position;
let fancypots = {x: fancypots_position[0], y: fancypots_position[1]};

setInterval(routine, 1000/4);

function routine() {
    // close stand if moving
    if ((character.moving || smart.moving || (smart.searching && !smart.found)) && character.stand) close_stand();
    
    if (character.moving || smart.moving || (smart.searching && !smart.found)) return;

    // store items in bank
    if (has_any_bank_item()) {
        close_stand();

        // go to bank
        for (let i = 0; i < bank_items.length; i++) {
            let bank_item_name = bank_items[i];
            if (has_item(bank_item_name)) {
                smart_move("bank").then(() => {
                    let inventory_item_indexes = get_inventory_item_indexes(bank_item_name);
                    for (let inventory_item_index of inventory_item_indexes) {
                        bank_store(inventory_item_index);
                    }
                });
            }
        }
    }
    else if (character.map == "bank" && !has_any_bank_item()) {
        // all items stored, go back to main
        smart_move("main");
    }
    else {
        let compoundable_item_indexes = get_compoundable_item();
        let hpot_count = inventory_item_count("hpot1");
        let mpot_count = inventory_item_count("mpot1");
        let hpot_to_buy = 9999 - hpot_count;
        let mpot_to_buy = 9999 - mpot_count;
        let can_buy_pots = character.gold >= (hpot_to_buy * G.items.hpot1.g) + (mpot_to_buy * G.items.mpot1.g);
        // sell items to fancypots
        if (has_some_item(sell_items)) {
            game_log("going to fancypots to sell items");
            if (distance(character, fancypots) < 200) {
                game_log("near fancy pots");
                for (let i = 0; i < 42; i++) {
                    let item = character.items[i];
                    if (item && sell_items.includes(item.name)) {
                        sell(i, 1);
                    }
                }
            }
            else {
                smart_move("fancypots");
            }
        }
        else if (compoundable_item_indexes.length >= 3) {
            if (!character.q.compound) {
                game_log("compounding items");
                smart_move(find_npc("newupgrade")).then(() => {
                    compound(compoundable_item_indexes[0], compoundable_item_indexes[1], compoundable_item_indexes[2], 38);
                });
            }
        }
        else if ((hpot_count < 9999 || mpot_count < 9999) && can_buy_pots) {
            game_log("going to fancypots to buy potions");
            smart_move("fancypots").then(() => {
                buy("hpot1", hpot_to_buy);
                buy("mpot1", mpot_to_buy);
            });
        }
        else {
            open_stand();
        }
    }
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
    if (character.moving || smart.moving || (smart.searching && !smart.found)) {
        game_log("busy, cannot help " + name + " " + character.moving + " " + smart.moving + " " + smart.searching, colorRed);
        return;
    }

    let hpot_count = inventory_item_count("hpot1");
    let mpot_count = inventory_item_count("mpot1");
    
    if (hpot_count < 9999 || mpot_count < 9999) return;

    close_stand();

    let party_member = parent.party[name];
    if (party_member) {
        game_log("received cm from " + name + ": " + JSON.stringify(data));
        smart_move(parent.party[name]).then(() => {
            let hpot_to_send = 9999 - data.hpot_count;
            let mpot_to_send = 9999 - data.mpot_count;

            let hpot_index = get_inventory_item_indexes("hpot1")[0];
            let mpot_index = get_inventory_item_indexes("mpot1")[0];

            send_item(name, hpot_index, hpot_to_send);
            send_item(name, mpot_index, mpot_to_send);
        });
    }
}