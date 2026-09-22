const colorGreen = "#1ED97C";
const colorWhite = "#EFF6FF";
const colorShading = "#909CC0";
const colorNavy = "#1C222B";
const colorRed = "#FF0000";

// Everything the fighters loot ends up in this bag, and the old rule was an allow list of names
// to bank — which has to be extended for every item in the game. It was not, so 39 of 42 slots
// filled up with reefglass, stormfeathers and anniversary gifts and there was no room left for a
// second stack of potions. The rule is inverted now : name what has to stay in the bag, bank the
// rest. The old list is in the history, it decided nothing that this one does not.
//   • what a cooperating player is waiting for is added on top of this, see is_keep_item()
//   • sell_items go to fancypots for gold and compound_items wait for a set of three
let keep_items = [
    "hpot1", "mpot1", "hpot0", "mpot0",          // the reason for the whole supply run
    "stand0", "stand1",                          // the stand we sell from
    "computer", "supercomputer", "tracker",
    "cscroll0", "cscroll1", "cscroll2",          // compounding
    "scroll0", "scroll1", "scroll2",             // upgrading
    "offering", "offeringp",
    "elixirluck",
];
// a bank trip is worth making once this many stacks have piled up, or as soon as the bag is
// nearly full : a merchant with no free slot cannot take items and cannot restock potions
const bank_trip_at = 6;
const bank_trip_esize = 5;
let sell_items = ["wgloves", "intamulet", "dexamulet", "stramulet", "crabclaw", "vitscroll", "slimestaff", "stinger", "glolipop", "ringsj", "hpbelt", "hpamulet", "wbreeches", "wattire", "wshoes", "wcap", "cclaw", "vitearring", "rattail"];
// ,  "lostearring"
let compound_items = ["intearring", "dexearring", "strearring"];
let main_character_name = 'ARogue';
// the fighters of our account : they join the cooperating party, this merchant never does
// (a party holds only 1 merchant and 9 fighters, and the cooperating party has its own merchant)
let my_characters = [main_character_name, "AWarrior", "AmRanger"];
let fancypots_position = G.maps.main.npcs.filter(npc => npc.id == "fancypots")[0].position;
let fancypots = {x: fancypots_position[0], y: fancypots_position[1]};
// let merchant_stand_place = { x: -21, y: -313, map: "mansion" };
let merchant_stand_place = { x: 10, y: 10, map: "main" };
let help_queue = [];
// how many potions a fighter should be carrying, how many we carry ourselves, and how low our
// own bag may get before the walk back to fancypots is worth it. One stack was never enough to
// fill even a single fighter and leave something for the other two, and with the bag no longer
// clogged with loot there is room for a second one. Restocking after every single delivery only
// kept us walking, the fighters have hours of potions in the bag by then
const pot_target = 9999;        // per fighter
const pot_stack = 9999;         // one slot holds this much, buy() gets no more in one call
const pot_carry = 19998;        // two stacks each, enough for two fighters in one trip
const pot_restock_at = 6000;
let last_respawn = new Date();
// Crafting materials the fighters loot and we have no use for. Both cooperating players take
// them, so whichever of the two is within range gets the stack — they are added to every entry
// in cooperating below instead of being repeated in it. level -1 means any level, and these
// have none. Being listed here also keeps them out of the bank, see is_keep_item()
let cooperating_materials = {
    "frostcore": { level : -1 },        // Frost Core
    "ascale": { level : -1 },           // Armadillo Scale
    "stormfeather": { level : -1 },     // Storm Feather
    "spores": { level : -1 },           // Spores
    "cxjar": { level : -1 },            // CX Jar
    "anniversarygift": { level : -1 },  // Anniversary Gift
    "voidthread": { level : -1 },       // Void Thread
    "cscale": { level : -1 },           // Croc Scale
    "cshell": { level : -1 },           // Crab Shell
    "marketparcel": { level : -1 },     // Market Parcel — exclusive, Merrit shop supplies
};
let cooperating = { 'HexMer' : { items : {"offeringp": { level : -1 }, "intearring": { level : -1 }, "dexearring": { level : -1 }, "strearring": { level : -1 }, "intring": { level : -1 }, "vitring": { level : -1 }, "strring": { level : -1 }, "dexring": { level : -1 } }  }, 'HexNeo' : { items : { "shield" : { level : 0 }, "mcape" : { level : 0 }, "xmace" : { level : 0 }, "fireblade"  : { level : 0 }, "firestaff" : { level : 0 }, "firebow" : { level : 0 }, "ololipop" : { level : 0 }, "intring" : { level : -1 }, "vitring" : { level : -1 }, "strring" : { level : -1 }, "dexring" : { level : -1 } } } };

for (const cooperating_name of Object.keys(cooperating)) {
    cooperating[cooperating_name].items = Object.assign({}, cooperating[cooperating_name].items, cooperating_materials);
}

setInterval(routine, 250);
setInterval(buff_luck, 1000);
setInterval(sell_some, 250);
setInterval(buy_pots, 250);
setInterval(merge_inventory_items, 5000);
setInterval(cooperate, 1000);

// anniversary event : kiss.js runs its own visit loop and adds the Kiss button. The
// merchant runs this file instead of farm.js, so it needs its own load to take part
load_code('kiss');


// a receiver whose inventory is full answers with a "no space" game response. remember that and
// leave him alone for a while instead of hammering him with sends every second
const no_space_wait = 10000;
let no_space_until = {};
let last_send_target = null;

function can_receive_items(name) {
    return !no_space_until[name] || Date.now() > no_space_until[name];
}

function on_game_response(data) {
    let response = typeof data == "string" ? data : (data ? data.response : null);
    if (!response || !("" + response).toLowerCase().includes("space")) {
        return;
    }

    // the response does not always name the receiver, fall back to whoever we sent to last
    let name = (data && data.name) ? data.name : last_send_target;
    if (!name) {
        return;
    }

    no_space_until[name] = Date.now() + no_space_wait;
    game_log(name + " has no space [" + response + "], waiting " + (no_space_wait / 1000) + "s", colorShading);
}

function cooperate() {
    for (const name of Object.keys(cooperating)) {
        let entity = get_entity(name);
        if (!entity || distance(character, entity) > 500) {
            // game_log("too far to cooperate with " + name, colorShading);
            continue;
        }

        if (!can_receive_items(name)) {
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

                    last_send_target = name;
                    send_item(name, item_index, character.items[item_index].q ? character.items[item_index].q : 1);
                }
            }
        }
    }
}

function routine() {
    // kiss.js is walking us to the featured player, leave the stand and the moving alone
    if (typeof is_kissing == "function" && is_kissing()) return;

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
    if (should_bank() || lost_earring_index != -1) {
        if (character.stand) close_stand();

        // go to bank
        if (has_any_bank_item() || lost_earring_index != -1) {
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
    else if (character.map == "bank" && !should_bank()) {
        // all items stored, go back to main
        smart_move("main");
    }
    else {
        let compoundable_item_indexes = get_compoundable_item();
        // go to sell items to fancypots
        if (has_some_item(sell_items)) {
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
        else if (has_pots_for_queue()) {
            // a fighter waiting for potions we are actually carrying is the reason we carry
            // them : deliver first and restock afterwards. With nothing he can use in the bag
            // this falls through to the restock trip instead of walking out empty
            help();
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

// an item that has a job to do here : potions, the stand, scrolls, and whatever a cooperating
// player is still waiting to be handed. Everything else is loot passing through
function is_keep_item(name) {
    if (!name) return false;
    if (keep_items.includes(name)) return true;
    if (sell_items.includes(name)) return true;      // sold at fancypots, not banked
    if (compound_items.includes(name)) return true;  // waiting for a set of three

    for (const player of Object.keys(cooperating)) {
        let items = cooperating[player].items;
        if (items && items[name]) return true;
    }

    return false;
}

function get_bankable_indexes() {
    let indexes = [];
    for (let i = 0; i < 42; i++) {
        let item = character.items[i];
        if (!item || !item.name || is_keep_item(item.name)) continue;
        indexes.push(i);
    }
    return indexes;
}

// whether the walk to the bank is worth it right now
function should_bank() {
    let bankable = get_bankable_indexes().length;
    if (bankable == 0) return false;
    return bankable >= bank_trip_at || character.esize <= bank_trip_esize;
}

function store_bank_items() {
    if (character.map == "bank") {
        let lost_earring_index = get_leveled_item_index("lostearring", 2);
        if (lost_earring_index != -1) {
            game_log("storing lost earring +2");
            bank_store(lost_earring_index);
        }

        for (let index of get_bankable_indexes()) {
            bank_store(index);
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

// whether the walk back to fancypots is worth making. buy_pots() still tops the bag up to a full
// stack whenever we are standing near the NPC anyway, so this only decides about the trip
function need_pots() {
    let hpot_count = inventory_item_count("hpot1");
    let mpot_count = inventory_item_count("mpot1");
    let hpot_to_buy = hpot_count < pot_restock_at ? pot_carry - hpot_count : 0;
    let mpot_to_buy = mpot_count < pot_restock_at ? pot_carry - mpot_count : 0;

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
    let hpot_to_buy = hpot_count < pot_carry ? pot_carry - hpot_count : 0;
    let mpot_to_buy = mpot_count < pot_carry ? pot_carry - mpot_count : 0;

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
        // one call cannot bring in more than a single stack, and this runs four times a second,
        // so the second stack fills itself on the next tick
        if (hpot_to_buy > 0) buy("hpot1", Math.min(hpot_to_buy, pot_stack));
        if (mpot_to_buy > 0) buy("mpot1", Math.min(mpot_to_buy, pot_stack));
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

// a party holds only 1 merchant and 9 fighters : the cooperating party's merchant takes that slot,
// so this merchant stays out of every party and keeps serving our fighters from the outside
function on_party_invite(name) // called by the inviter's name
{
    game_log("Party invite from " + name + " > ignored, merchant stays out of party", colorShading);
}

function on_party_request(name) // called by the inviter's name - request = someone requesting to join your existing party
{
    game_log("Party request from " + name + " > ignored, merchant stays out of party", colorShading);
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
    return get_bankable_indexes().length > 0;
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
    // we are not in a party anymore, so trust our own characters instead of parent.party
    if (!my_characters.includes(name)) return;

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
                // still walking to this one, but the others in the queue are not his to block
                continue;
            }
        }

        if (Date.now() - help_request.timestamp > 60000) {
            delete help_queue[name];
            continue;
        }
        else {
            // nearby lets help
            if (help_entity && distance(character, help_entity) < 300) {
                if (!can_receive_items(name)) {
                    continue;
                }

                // everyone still queued needs a share : we carry one stack of each pot at most,
                // so the first fighter served must not walk off with all of it
                let waiting = Object.keys(help_queue).length;

                delete help_queue[name];
                last_send_target = name;
                send_pots(name, "hpot1", pot_target - help_request.data.hpot_count, waiting);
                send_pots(name, "mpot1", pot_target - help_request.data.mpot_count, waiting);
                continue;
            }
            else {
                // the help CM carries the position, parent.party is empty for a merchant out of party
                // a visible entity is on our own map, otherwise use the position from the help request
                let help_position = help_entity ? { map: character.map, x: help_entity.x, y: help_entity.y } : help_request.data;
                if (help_position && help_position.map) {
                    help_queue[name].on_the_way = true;
                    smart_move({ map: help_position.map, x: help_position.x, y: help_position.y });
                }
                else {
                    game_log("no position to help " + name, colorRed);
                    delete help_queue[name];
                }
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

// Hand over potions, taking two things into account that used to lose the whole delivery:
//
//   • a fighter can be carrying more than a full stack already (they use far fewer health
//     potions than mana ones), and pot_target minus that is a negative quantity. send_item
//     fails on it, and because the health potions went first, the mana ones behind them in
//     help() never left the bag — which is how the damagers ended up with no mana potions.
//   • locate_item() returns the FIRST stack of a name, not the biggest. Carrying 9999 mana
//     potions in slot 40 and a leftover single one in slot 10 meant every send took the stack
//     of one. Take the biggest stack instead, and never ask it for more than it holds.
function send_pots(name, pot_name, wanted, receivers) {
    if (!(wanted > 0)) return;

    let best = -1;
    let available = 0;
    for (let index of get_inventory_item_indexes(pot_name)) {
        let item = character.items[index];
        let quantity = item && item.q ? item.q : 0;
        if (quantity > available) {
            available = quantity;
            best = index;
        }
    }

    if (best == -1 || available <= 0) {
        game_log("no " + pot_name + " to send to " + name, colorRed);
        return;
    }

    let share = receivers > 1 ? Math.floor(available / receivers) : available;
    let to_send = Math.min(wanted, share);
    if (to_send <= 0) return;

    game_log("sending " + to_send + " " + pot_name + " to " + name, colorGreen);
    send_item(name, best, to_send);
}

// is there someone in the queue we can actually serve right now? Walking out to deliver nothing
// and walking off to restock with a full bag are both wasted trips
function has_pots_for_queue() {
    let hpot_count = inventory_item_count("hpot1");
    let mpot_count = inventory_item_count("mpot1");

    for (const name in help_queue) {
        let data = help_queue[name] ? help_queue[name].data : null;
        if (!data) continue;
        if (hpot_count > 0 && pot_target - data.hpot_count > 0) return true;
        if (mpot_count > 0 && pot_target - data.mpot_count > 0) return true;
    }

    return false;
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