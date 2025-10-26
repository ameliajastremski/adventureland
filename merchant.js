let bank_items = ["candy0", "candy1"];
let sell_items = ["wbreeches", "wgloves", "wcap", "wshoes"];
let compound_items = ["intamulet", "dexamulet", "stramulet"];
let main_character_name = 'Ammage';
let fancypots_position = G.maps.main.npcs.filter(npc => npc.id == "fancypots")[0].position;
let fancypots = {x: fancypots_position[0], y: fancypots_position[1]};

setInterval(routine, 1000/4);

function routine() {
    if (character.moving || smart.moving) return;
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
    else if (character.map == "bank") {
        smart_move("main");
    }
    else {

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

        let compoundable_item_indexes = get_compoundable_item();
        if (compoundable_item_indexes.length >= 3) {
            if(!character.q.compound) {
                game_log("compounding items");
                smart_move(find_npc("newupgrade")).then(() => {
                    compound(compoundable_item_indexes[0], compoundable_item_indexes[1], compoundable_item_indexes[2], 38);
                });
            }
        }

        

        open_stand();
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
        for (let l = 0; l < 4; l++) {
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