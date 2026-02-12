const colorGreen = "#1ED97C";
const colorWhite = "#EFF6FF";
const colorShading = "#909CC0";
const colorNavy = "#1C222B";
const colorRed = "#FF0000";

const event_monsters = [ "wabbit", "mrpumpkin", "mrgreen", "grinch", "dragold" ];

setInterval(routine_move, 250);
setInterval(routine_attack, 250);
setInterval(routine, 250);
setInterval(loot_chests, 2000);
setInterval(go_to_event, 2000);

function go_to_event() {
    for (let mtype of event_monsters) {
        let event_monster = parent.S[mtype];
        if (event_monster?.live) {
            let target = character.target ? get_entity(character.target) : null;
            if (!target || target.mtype != mtype) {
                smart_move(event_monster).then(() => {
                    let monster = get_nearest_monster({ mtype: mtype });
                    if (monster) {
                        change_target(monster);
                        smart_move(monster);
                    }
                });
            }
        }
    }
}

// let farm_monsters = ["osnake", "snake"];
// let farm_monsters = ["rat"];
let farm_monsters = ["crab", "dragold", "pinkgoo"];
let tank = "AWarrior";
let merchant_name = 'AMerchant';
let main_character_name = 'Ammage';
let my_characters = [merchant_name, "AWarrior", "AmRanger"];
let items_not_for_merchant = ["hpot1", "mpot1", "tracker", "goldbooster", "luckbooster", "xpbooster", "handofmidas", "snowball", "wgloves"];
let sell_items = ["slimestaff", "stinger", "glolipop", "ringsj", "hpbelt", "hpamulet", "wbreeches", "wattire", "wshoes", "wcap"];

let fancypots_position = G.maps.main.npcs.filter(npc => npc.id == "fancypots")[0].position;
let fancypots = { x: fancypots_position[0], y: fancypots_position[1] };

let show_game_log = false;

let loot_character = "Ammage";
let is_looting_chests = false;
let loot_chests_timer = null;
let loot_amount = 50;
let loot_items = { "gloves" : { loot : { name :"handofmidas", level : 5 }, wear : { name :"wgloves", level : 8 } } };

start();

function start() {
    if (game.graphics) {
        load_code('metrics');
    }
}

function routine_move() {
    check_holiday_spirit();

    if (is_moving(character) || is_transporting(character) || (smart.moving && smart.searching && !smart.found)) {
        // || (!smart.moving && smart.searching && smart.found && (!character.target || !get_entity(character.target)))
        return;
    }

    let event_live = false;
    for (let mtype of event_monsters) {
        let event_monster = parent.S[mtype];
        if (event_monster?.live) {
            event_live = true;
            let target = character.target ? get_entity(character.target) : null;
            if (!target || target.mtype != mtype) {
                smart_move(event_monster).then(() => {
                    let monster = get_nearest_monster({ mtype: mtype });
                    if (monster) {
                        change_target(monster);
                        smart_move(monster);
                    }
                });
                return;
            }
        }
    }

    if (event_live) return;

    let target = get_targeted_monster();
    let smart_destination = get_smart_destination();
    if (target && is_moving(character) && distance(character, target) > character.range && ((smart_destination && (smart_destination.map !== character.map || distance(character, target) < distance(smart_destination, target))) || (!smart.moving && distance(character, target) < distance({ x: character.going_x, y: character.going_y, map: character.map }, target)))) {
        stop("move");
        stop("smart");
        set_message("stop");
        game_log("stop");
    }

    if (!character.moving && !smart.moving) {  
        
        if ((target && !farm_monsters.includes(target.mtype)) || (get_near_mtypes_monsters_count(farm_monsters) == 0 && !target)) {
            let farm_area = get_farming_area();
            if (farm_area) {
                smart_move(farm_area);
            }
            else {
                smart_move(farm_monsters[0])
            }
        }
        else if (target && !is_in_range(target))  {
            if (can_move_to(target.x, target.y)) {
                move(target.x, target.y);
            }
            else {
                smart_move(target);
            }
        }
    }
}

function get_smart_destination() {
    if (!smart.moving) return null;
    else if (smart.plot && smart.plot.length > 0) {
        return smart.plot[smart.plot.length - 1];
    }
    else return null;
}

function get_farming_area() {
    let areas = get_farming_areas(farm_monsters[0], ["main"]);
    if (areas.length > 0) {
        // let area = areas[Math.floor(Math.random() * areas.length)];
        let area = areas[0];

        // if (character.name == "AmRanger") {
        //     area = areas[0];
        // }

        // if (areas.length > 1 && character.name == "AWarrior") {
        //     area = areas[1];
        // }

        // if (areas.length > 2 && character.name == main_character_name) {
        //     area = areas[2];
        // }

        let x1 = area[0];
        let y1 = area[1];
        let x2 = area[2];
        let y2 = area[3];

        let x = (x1 + x2) / 2;
        let y = (y1 + y2) / 2;
        let result_area = { map: "main", x: x, y: y, x1: x1, y1: y1, x2: x2, y2: y2 };
        return result_area;
    }
    else {
        return null;
    }
}

function routine_attack() {
 if (character.rip) {
        return;
    }
    else {
        // todo : if mpot count == 0 || hpot count == 0 then do not attack monsters
        // if (get_near_mtypes_monsters_count(farm_monsters) == 0) {
        //     return;
        // }

        let target = get_targeted_monster();
        
        if (!target || (!farm_monsters.includes(target.mtype) && !target.target))
        {
            if (target) change_target(null);

            monster = get_nearest_monster();
            if (monster && (farm_monsters.includes(monster.mtype) || (monster.target && my_characters.includes(monster.target)))) {
                change_target(monster);
            }
            else
            {
                set_message("no monsters");
                return;
            }
        }

        target = get_targeted_monster();

        if (is_in_range(target) && can_attack(target))
        {
            // game_log("use skills", colorGreen);
			use_skills(target);
            if (target.hp > 0) {
                attack(target);
            }
        }
    }
}

// initialize to 1 minute ago so the first CM can be sent immediately
let last_merchant_cm = new Date(Date.now() - 60 * 1000);

function routine() {
    if (character.rip) {
        check_rip();
        return;
    }
    else {
        regen();
    }

    // start all my characters if not active
    if (!character.controller) {
        check_online();
    }

    // if merchant is near then send all items and gold to merchant
    let merchant = get_entity(merchant_name);
    if (parent.party[merchant_name] && merchant && distance(character, merchant) < 300) {
        // send all items to merchant
        for (i = 0; i < 42; i++) {
            let item = character.items[i];
            if (item && !items_not_for_merchant.includes(item.name) && !is_loot_item(item)) {
                send_item(merchant_name, i, item.q ? item.q : 1);
            }
        }

        if (character.gold > 100000) {
            send_gold(merchant_name, character.gold);
        }
    }

    // if character.esize < 10 or character.gold > 1000000 or hpot count < 500 || mpot count < 500 then send message to merchant
    let esize = character.esize;
    let gold = character.gold;
    let hpot_count = inventory_item_count("hpot1");
    let mpot_count = inventory_item_count("mpot1");
    let now = new Date();
    
    // if more than 1 minute since last cm then send
    if (parent.party[merchant_name] && now - last_merchant_cm > 6000) {
        let msg = { "type" : "help", "esize": esize, "gold": gold, "hpot_count": hpot_count, "mpot_count": mpot_count, "mluck" : character?.s?.mluck?.ms ? character.s.mluck.ms : 0 };
        send_cm(merchant_name, msg);
        party_say("help");
        last_merchant_cm = now;
        // game_log("sent CM to merchant: " + JSON.stringify(msg));
    
        // }
        // else {
        //     game_log("merchant nearby");
        // }
    }

    // sell items to fancypots
    if (character.map == "main" && distance(character, fancypots) < 200) {
        for (let i = 0; i < 42; i++) {
            let item = character.items[i];
            if (item && sell_items.includes(item.name) && !is_loot_item(item)) {
                game_log("near fancy pots > selling " + item.name);
                sell(i, 1);
            }
        }
    }

    // alchemy no more => sell items if mage
    // if (character.ctype == "mage" && character.level >= 40 && character.mp >= 500 && !is_on_cooldown('alchemy')) {
    //     for (let i = 0; i < 42; i++) {
    //         let item = character.items[i];
    //         if (item && sell_items.includes(item.name) && !is_loot_item(item)) {
    //             if (i == 0) {
    //                 use_skill('alchemy');
    //             }
    //             else {
    //                 swap(i, 0);
    //             }
    //             break;
    //         }
    //     }
    // }

    // send items to party mage if not mage
    if (character.ctype != "mage" && is_party_mage_nearby()) {
        for (let i = 0; i < 42; i++) {
            let item = character.items[i];
            if (item && sell_items.includes(item.name) && !is_loot_item(item)) {
                send_item(get_party_mage_name(), i, item.q ? item.q : 1);
            }
        }
    }
    
    merge_inventory_items();
}

function is_loot_item(item) {
    return (item && loot_items.gloves.loot.name == item.name && loot_items.gloves.loot.level == item.level) || (item && loot_items.gloves.wear.name == item.name && loot_items.gloves.wear.level == item.level);
}

function count_format(count) {
    if (count > 1000) {
        return Math.floor(count / 1000) + "K";
    }
    return count;
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

function check_online() {
    if (!character.controller) {
        let active_characters = get_active_characters();
        
        for (let party_name of my_characters) {
            if (party_name !== character.name) {
                let character_active = false;
                for (let character_name in active_characters) {
                    if (party_name == character_name) {
                        character_active = true;
                    }
                }

                if (!character_active) {
                    if (party_name != merchant_name) {
                        start_character(party_name, 'farm');
                    }
                    else {
                        start_character(party_name, 'merchant');
                    }
                }
                else {
                    // invite all my characters if not in party
                    if (!parent.party[party_name]) {
                        send_party_invite(party_name);
                    }
                }
            }
        }
    }
}

let last_respawn = new Date();
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

function on_party_invite(name) // called by the inviter's name
{
    if (name == main_character_name || name == "HexMer" || name == "HexNeo") {
	    accept_party_invite(name);
    }
}

function sleep(time) {
    if (time > 0) game_log("sleeping for " + time + " ms");
    return new Promise((resolve) => setTimeout(resolve, time));
}

function loot_some_chests() {
    game_log("looting some chests");
    let chest_ix = 0;
    for (let id of Object.keys(parent.chests)) {
        parent.open_chest(id);
        chest_ix++;
        if (chest_ix >= loot_amount) {
            break;
        }
    }
}

function loot_chests() {
    // Prevent concurrent executions
    if (is_looting_chests) {
        return;
    }
    
    // no loot character defined, just open all chests
    if (!loot_character) {
        if (Object.keys(parent.chests) && Object.keys(parent.chests).length >= 1) {
            for (let id of Object.keys(parent.chests)) {
                parent.open_chest(id);
            }
        }
        return;
    }

    is_looting_chests = true;
    // Safety timer: reset flag after 2 seconds if still true
    loot_chests_timer = setTimeout(() => {
        game_log("loot_chests timer expired, resetting flag");
        is_looting_chests = false;
    }, 2000);
    
    // await sleep(character.s?.penalty_cd ?? 0);
    sleep(character.s?.penalty_cd ?? 0).then(() => {
        if (parent.chests) {
            const booster = character.items.findIndex(i => i && i.name.endsWith('booster'));
            let hand_of_midas = locate_item("handofmidas");
            if (character.name === loot_character) {
                // game_log("looting as looter > 1 " + loot_character);
                let current_gloves = character?.slots?.gloves?.name == "handofmidas" ? loot_items["gloves"].wear : character?.slots?.gloves;
                // show_json(Object.keys(parent.chests).length);
                if (Object.keys(parent.chests) && Object.keys(parent.chests).length >= loot_amount) {
                    game_log("looting as looter > " + loot_character);
                    
                    if (hand_of_midas != -1) {
                        game_log("using handofmidas");
                        equip(hand_of_midas, 'gloves');
                    }

                    if (booster > -1) {
                        game_log("looting as looter > has booster");
                        if (character.items[booster].name !== 'goldbooster') {
                            game_log("looting with booster > should switch to goldbooster");
                            shift(booster, 'goldbooster').then(() => {
                                // Object.keys(parent.chests)
                                // making 50 chest a time to avoid disconnect
                                loot_some_chests();

                                game_log("looted switching back to luckbooster");
                                shift(booster, 'luckbooster');
                                if (current_gloves && current_gloves.name) {
                                    let index = get_leveled_item_index(current_gloves.name, current_gloves.level);
                                    if (index > -1) {
                                        game_log("switched back gloves");
                                        equip(index, 'gloves');
                                    }
                                }
                            }).catch(() => {  });
                        }
                        else {
                            game_log("looting with booster > already at goldbooster");
                            // Object.keys(parent.chests)
                            loot_some_chests();

                            game_log("looted switching back to luckbooster");
                            shift(booster, 'luckbooster');
                            if (current_gloves && current_gloves.name) {
                                let index = get_leveled_item_index(current_gloves.name, current_gloves.level);
                                if (index > -1) {
                                    game_log("switched back gloves");
                                    equip(index, 'gloves');
                                }
                            }
                        }
                    }
                    else if (hand_of_midas != -1) {
                        game_log("looting as looter > has no booster > but has handofmidas");
                        loot_some_chests();
                        if (current_gloves && current_gloves.name) {
                            let index = get_leveled_item_index(current_gloves.name, current_gloves.level);
                            if (index > -1) {
                                equip(index, 'gloves');
                            }
                        }
                        
                    }
                    else {
                        game_log("looting as looter > has no booster > has no handofmidas");
                        loot_some_chests();
                    }
                }
            }
            else {
                // not a loot character
                if (Object.keys(parent.chests) && Object.keys(parent.chests).length >= 1) {
                    // loot_character check without booster and hand of midas
                    // not a loot character
                    let loot_entity = get_entity(loot_character);
                    if (loot_entity && distance(character, loot_entity) < 800 && parent.party_list && parent.party_list.includes(loot_character)) {
                        // loot character is near => no need to loot
                    }
                    else {
                        if (booster != -1 && character.items[booster].name !== 'goldbooster') {
                            shift(booster, 'goldbooster').then(() => {
                                loot().then(() => {
                                    loot_some_chests();
                                    shift(booster, 'xpbooster');
                                });
                            });
                        }
                        else {
                            game_log("looting chest no looter nearby");
                            loot_some_chests();
                        }
                    }
                }
            }
        }
        // Clear timer and reset flag
        if (loot_chests_timer) {
            clearTimeout(loot_chests_timer);
            loot_chests_timer = null;
        }
        is_looting_chests = false;
    });
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

function get_near_mtypes_monsters_count(mtypes) {
    let r = character.range + 400;
    var result = {};
    for (id in parent.entities)
    {
        var entity = parent.entities[id];

        if (entity.mtype != null && (!mtypes || mtypes.includes(entity.mtype)) && parent.G.monsters[entity.mtype])
        {
            if (distance(entity, character) < r) {
                result[id] = entity;
            }
        }
    }

    return Object.keys(result).length;
}

function get_percent(value_current, value_max) {
    return Math.round(value_current / (value_max / 100.0));
}

// Returns the party mage's name if any exists in the party, otherwise null
function get_party_mage_name() {
    let party = parent.party;
    if (!party) return null;
    for (let name in party) {
        if (name) {
            let party_member = party[name];
            // let player = get_entity(party_member.name);
            if (party_member && party_member.type === 'mage') {
                return name;
            }
        }
    }
    return null;
}

// Returns true if a party mage exists and is within the optional `maxDist` (default: 500)
function is_party_mage_nearby(maxDist = 500) {
    const mageName = get_party_mage_name();
    if (!mageName) return false;
    const player = get_player(mageName);
    if (!player) return false;
    return distance(character, player) <= maxDist;
}

function get_supershot_damage() {
  return 1.5 * character.attack;
}

async function use_skills(target) {
    switch (character.ctype) {
        case 'warrior':
            await use_warrior_skills(target);
            break;
        case 'paladin':
            await use_paladin_skills(target);
            break;
        case 'mage':
            await use_mage_skills(target);
            break;
        case 'ranger':
            await use_ranger_skills(target);
            break;
        case 'priest':
            await use_priest_skills(target);
            break;
        case 'rogue':
            await use_rogue_skills(target);
            break;
    }
}

async function use_warrior_skills(target) {
    // Cleave NB! aoe
    if (target.max_hp < (character.attack * 3)) {
        if (target.level == 1 && !is_boss(target) && can_cast(G.skills.cleave, target) && character.slots["mainhand"] && character.slots["mainhand"].name && (parent.G.items[character.slots["mainhand"].name].wtype == "axe" || parent.G.items[character.slots["mainhand"].name].wtype == "scythe") && get_percent(character.mp, character.max_mp) > 15) {
            // game_log("Casting Cleave", colorGreen);
            use_skill('cleave', target);
        }
    }

    if (can_cast(G.skills.warcry, character) && get_percent(character.mp, character.max_mp) > 10) {
        use_skill('warcry', character.name);
    }
}

async function use_mage_skills(target) {
    // burst
    
    var manaburst_damage = get_manaburst_damage();
    // manaburst NB! aoe
    // use manaburst if can use controlled manaburst
    if (!can_cast(G.skills.cburst, target) && can_use('burst') && target.hp >= manaburst_damage && character.mp > 2000 && get_percent(character.mp, character.max_mp) > 75) { 
        if (show_game_log) game_log("Casting Mana Burst for " + manaburst_damage + " dmg", colorGreen);
        use_skill('burst', target);
    }

    // var m_count = get_near_monsters_count();
    var m_count = get_near_monsters_count();
    var m_hl_count = get_near_hilevel_monsters_count();

    
    // can kill with 3 shots, no danger to use aoe
    if (target.max_hp < (character.attack * 3)) {
        // avoid monsters count > 5 to get not terrified
        if (target.level == 1 && m_count > 1 && m_count < 5 && m_hl_count < 1 && !is_boss(target) && can_cast(G.skills.cburst, target) && character.mp > 2000 && get_percent(character.mp, character.max_mp) > 75 && target.hp / 0.555 < character.mp_cost && is_on_cooldown("attack")) {
            // game_log("Casting Controlled Mana Burst", colorGreen);
            use_skill('cburst', [[target.id, target.hp / 0.555]]);
            // use_skill('cburst', target);
        }
    }

    if (can_cast(G.skills.cburst, target) && character.mp > 2000 && get_percent(character.mp, character.max_mp) > 75 && target.hp / 0.555 < character.mana_cost) {
        var targets = [];
        targets.push([target, target.hp / 0.555]);
        use_skill('cburst', targets);
    }

    //energize tank
    if (tank) {
        var tank_entity = get_entity(tank);
        if (tank_entity && tank_entity.target) {
            var tank_target = get_entity(tank_entity.target);
            if (tank_target && tank_target.target == tank_entity.name && tank_target.hp < tank_target.max_hp) {
                if (can_cast(G.skills.energize, tank_entity) && get_percent(character.mp, character.max_mp) > 50 && tank_entity.mp < tank_entity.max_mp) {
                    // game_log("PartyHeal > " + name, colorGreen);
                    use_skill('energize', tank_entity.name);
                }
            }
            else if (tank_target && !tank_target.target && tank_entity.mp < tank_entity.max_mp) {
                // tank restore 
                if (can_cast(G.skills.energize, tank_entity) && get_percent(character.mp, character.max_mp) > 50 && tank_entity.mp < tank_entity.max_mp) {
                    // game_log("PartyHeal > " + name, colorGreen);
                    use_skill('energize', tank_entity.name);
                }
            }
        }
    }

    let party = get_party_members();
    for (var member in party) {
        // game_log("party > " + member);
        var party_member = party[member];
        var name = party_member.name;

        let player = get_player(party_member.name);
        if (player != null) {
            if (can_cast(G.skills.energize, player) && get_percent(character.mp, character.max_mp) > 33 && party_member.mp < party_member.max_mp) {
                // game_log("PartyHeal > " + name, colorGreen);
                use_skill('energize', name);
            }
        }
    }

    // reflection tank
    if (tank) {
        var tank_entity = get_entity(tank);
        if (tank_entity && tank_entity.target) {
            var tank_target = get_entity(tank_entity.target);
            if (tank_target && tank_target.target == tank_entity.name && tank_target.hp < tank_target.max_hp) {
                if (is_boss(tank_target) || is_hard_to_kill(tank_target)) {
                    let monster = tank_target;
                    if (monster && monster.target == tank_entity.name && distance(monster, tank_entity) <= monster.range) {
                        if (can_cast(G.skills.reflection, tank_entity)) {
                            use_skill('reflection', tank_entity.name);
                        }
                    }
                }
            }
        }
    }

    // reflection self
    if (is_boss(character.target) || is_hard_to_kill(character.target)) {
        let monster = get_monster(character.target);
        if (monster && monster.target == character.name && distance(monster, character) <= monster.range) {
            if (can_cast(G.skills.reflection, character) && get_percent(character.mp, character.max_mp) > 10) {
                use_skill('reflection', character.name);
            }
        }
    }

    // reflection party
    for (var member in party) {
        // game_log("party > " + member);
        var party_member = party[member];
        var name = party_member.name;
        let player = get_player(party_member.name);
        if (player != null) {
            if (is_boss(player.target) || is_hard_to_kill(player.target)) {
                let monster = get_monster(player.target);
                if (monster && monster.target == name && distance(monster, player) <= monster.range) {
                    if (can_cast(G.skills.reflection, player) && get_percent(character.mp, character.max_mp) > 10) {
                        use_skill('reflection', name);
                    }
                }
            }
        }
    }

    if (target && get_item_count('essenceofnature') > 0 && (!target.c || !target.c.includes('taunted'))) {
        for (var name in party) {
            // var party_member = party[name];
            let player = get_player(name);
            if (player && ((tank && name == main_name) || (!tank && name !== character.name))) { 
                let monster = get_monster(player.target);
                if (monster && monster.target == name) {
                    if (!has_buff(monster, 'tangled') && can_cast(G.skills.entangle, monster) && character.mp >= 360) {
                        use_skill('entangle', monster);
                    }
                }
            }
        }
    }
}

async function use_ranger_skills(target) {
    // game_log("Using ranger skills on " + target.mtype);
    // huntersmark
    if (can_cast(G.skills.huntersmark, target) && get_percent(character.mp, character.max_mp) > 25 && !is_oneshot_target(target)) {
        // game_log("Hunter's mark", colorGreen);
        use_skill("huntersmark", target);
    }
    else {
        // game_log("Cannot cast Hunter's mark", colorRed);
    }

    // supershot
    if (can_cast(G.skills.supershot, target) && get_percent(character.mp, character.max_mp) > 25 && !is_oneshot_target(target)) {
        var supershot_damage = get_supershot_damage();
        // game_log("Sniping for " + supershot_damage + " dmg and " + Math.round(get_distance(target, character)) + " distance", colorGreen);
        use_skill("supershot", target);
    }
    else {
        // game_log("Cannot cast Supershot", colorRed);
    }

    // piercingshot
    if (can_cast(G.skills.piercingshot, target) && !is_oneshot_target(target)) {
        // game_log("piercingshot", colorGreen);
        use_skill('piercingshot', target);
    }
    else {
        // game_log("Cannot cast Piercing Shot", colorRed);
    }

    // poisonarrow
    if (can_cast(G.skills.poisonarrow, target) && quantity('poison') > 0 && !is_oneshot_target(target) && (!target.c || !target.c.includes('poisoned'))) {
        // game_log("poisonarrow", colorGreen);
        use_skill('poisonarrow', target);
    }
    else {
        // game_log("Cannot cast Poison Arrow", colorRed);
    }

    // 4fingers
    if (can_cast(G.skills["4fingers"], target) && !is_oneshot_target(target)) {
        // game_log("4fingers", colorGreen);
        use_skill('4fingers', target);
    }
    else {
        // game_log("Cannot cast 4 Fingers", colorRed);
    }

    // 5-shot NB! aoe
    if (can_cast(G.skills["5shot"], target) && target.max_hp < (character.attack * 5)) {
        var m_count = get_near_monsters_count();
        var m_hl_count = get_near_hilevel_monsters_count();
        if (target.level == 1 && !is_boss(target) && !is_hard_to_kill(target) && m_count >= 5 && m_hl_count < 1 && character.mp > 500 && get_percent(character.mp, character.max_mp) > 25) {
            // game_log("5shot", colorGreen);
            use_skill('5shot', target);
        }
    }
    else {
        // game_log("5shot != " + target.max_hp  + " target.max_hp", colorRed);
    }

    // 3-shot NB! aoe
    if (can_cast(G.skills["3shot"], target) && target.max_hp < (character.attack * 3)) {
        var m_count = get_near_monsters_count();
        var m_hl_count = get_near_hilevel_monsters_count();
        if (target.level == 1 && !is_boss(target) && !is_hard_to_kill(target) && m_count >= 3 && m_hl_count < 1 && character.mp > 500 && get_percent(character.mp, character.max_mp) > 25) {
            // game_log("3shot", colorGreen);
            use_skill("3shot", target);
        }
        else {
            // game_log("3shot !!= " + m_count + " m_count " + m_hl_count + " m_hl_count", colorGreen);
        }
    }
    else {
        // game_log("3shot != " + target.max_hp  + " target.max_hp", colorRed);
    }
}

function can_cast(cast_skill, target) {
    if (!target || !cast_skill || target == null || cast_skill == null) return false;
    
    if (target && cast_skill) {
        let skills = Object.fromEntries(Object.entries(G.skills).filter(([skillName, skill]) => skill.class && skill.class.includes(character.ctype)));
        let skill_key = cast_skill.type && cast_skill.type == "skill" ? get_skill_key(skills, cast_skill.name) : cast_skill;
        let skill = cast_skill.name ? cast_skill : skills[skill_key];
        let range = get_distance_between(character.x, character.y, target.x, target.y);
        return (is_in_range(target, skill_key) && !is_on_cooldown(skill_key) && can_use(skill_key) && ((skill.range && range <= skill.range) || !skill.range) && ((skill.level && character.level >= skill.level) || !skill.level) && ((skill.mp && character.mp >= skill.mp) || !skill.mp));
    }
    return false;
}

function get_skill_key(skills, skill_name) {
    for (let key in skills) {
        if (skills[key].name == skill_name) {
            return key;
        }
    }
    return null;
}

function is_oneshot_target(target) {
    if (target.hp == target.max_hp && character.attack >= target.max_hp && !is_boss(target)) {
        return true;
    }

    return false;
}

function get_near_hilevel_monsters_count() {
    var near_monsters = get_near_monsters(character.x, character.y, character.range, 1);
    var result = 0;
    for (id in near_monsters) result++;
    return result;
}

function get_near_monsters_count() {
    var near_monsters = get_near_monsters();
    var result = 0;
    for (id in near_monsters) result++;
    return result;
}

function get_near_monsters(mx, my, radius, min_level) {
    let x = mx && my ? mx : character.x;
    let y = mx && my ? my : character.y;
    let r = radius ? radius : 400;
    let l = min_level ? min_level : 0;
    let map = character.map;
    var result = {};
    for (id in parent.entities)
	{
		var entity = parent.entities[id];
		
        if (entity.map == map) {
            // bosses
            // if(entity.mtype != null && (parent.G.monsters[entity.mtype].respawn == -1 || parent.G.monsters[entity.mtype].respawn > 60*2))
            if(entity.mtype != null && parent.G.monsters[entity.mtype])
			{
                if (get_distance_between(entity.x, entity.y, x, y) < r && (!entity.level || entity.level > l))
                {
                    result[id] = entity;
                }
            }
        }
    }

    return result;
}

function get_distance_between(x1, y1, x2, y2) {
    return Math.sqrt(((x2 - x1) * (x2 - x1)) + ((y2 - y1) * (y2 - y1)));
}

function is_boss(target) {
    return target && (target.mtype == "snowman" || target.mtype == "phoenix" || target.mtype == "mvampire" || target.mtype == "crabxx" || target.mtype == "greenjr" || target.mtype == "grinch" || target.mtype == "pinkgoo" || target.mtype == "dragold" || target.mtype == "squigtoad");
}

function is_hard_to_kill(target) {
    if (target && target.max_hp > character.attack && (((character.attack - get_resistance(target)) * 8) < target.max_hp)) {
        return true;
    }
    return false;
}

function check_holiday_spirit() {
    if (parent.S.holidayseason && !character.s.holidayspirit) { 
        if (is_moving(character) || is_transporting(character) || (smart.moving && smart.searching && !smart.found)) {
            return;
        }
        else {
            smart_move("newyear_tree").then(() => {
                parent.socket.emit("interaction", { type: "newyear_tree" });
            });
        }
    }
}

function get_farming_areas(monster_type, maps) {
    let result = [];
    for (let map_name of maps) {
        if (G.maps[map_name] && G.maps[map_name].monsters) {
            let areas = G.maps[map_name].monsters.filter(monster => monster.type === monster_type).map(m => m.boundary);
            if (areas) {
                for (let area of areas) {
                    result.push(area);
                }
            }
        }
    }
    return result;
}

function get_manaburst_damage() {
    return 0.555 * character.mp;
}

function get_party_members() {
    // use this for near members only
    // parent.party_list [ "HexMer", "HexPri", "HexNeo", "HexReo" ]
    if (parent.party_list && parent.party_list != null) {
        return Object.values(parent.entities).filter(char => is_character(character) && !char.rip && parent.party_list.includes(char.id));
    }
    else return [];
}

function get_item_count(name)
{
    // b["q"] || 1
    var result = character.items.filter(item => item != null && item.name == name).reduce((a,b) => (a + (b && b != null ? (b.q && b.q != null ? b.q : 1) : 0)), 0);
    return result;
}

function get_resistance(target) {
    if (target) {
        let magic_damage = (character.ctype === "mage" || character.ctype === "priest");
        if (magic_damage && target.resistance) return target.resistance;
        else if (target.armor) return target.armor;
        else return 0;
    }
    else return 0;
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

game.on("event", function (data) {
    // has_buff > character.s["easterluck"]
    if (data.name == "wabbit" && !has_buff(character, "easterluck")) {
        let wabbit = parent.S.wabbit;
        if (wabbit && wabbit.live && distance(character, wabbit) > 100) {
            smart_move({ x: wabbit.x, y: wabbit.y, map: wabbit.map }).then(() => {
                let target_monster = get_nearest_monster({ type: "wabbit" });
                if (target_monster) {
                    change_target(target_monster);
                }
            }).catch(() => {
                state.use_town = "wabbit";
                use_skill('town');
            });
        }
    }

    if (data.name == "pinkgoo")
	{
		smart_move(data).then(() => {
            let target_monster = get_nearest_monster({ type: "pinkgoo" });
            if (target_monster) {
                change_target(target_monster);
            }
        });
	}

    if (data.name == "dragold")
	{
		smart_move(data).then(() => {
            let target_monster = get_nearest_monster({ type: "dragold" });
            if (target_monster) {
                change_target(target_monster);
            }
        });
	}
});