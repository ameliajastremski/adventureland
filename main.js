const colorGreen = "#1ED97C";
const colorWhite = "#EFF6FF";
const colorShading = "#909CC0";
const colorNavy = "#1C222B";
const colorRed = "#FF0000";

setInterval(routine_move, 1000/4);
setInterval(routine_attack, 1000/4);
setInterval(routine, 1000/4);

let farm_monsters = ["bee"];
let merchant_name = 'AMerchant';
let main_character_name = 'Ammage';
let my_characters = [merchant_name, "AWarrior", "AmRanger"];
let items_not_for_merchant = ["hpot1", "mpot1", "tracker"];

function routine_move() {
    check_holiday_spirit();

    if (!character.moving && !smart.moving) {  
        let target = get_targeted_monster();
        if (target && !farm_monsters.includes(target.mtype)) {
            smart_move(farm_monsters[0]);
        }
        else {
            if (get_near_mtypes_monsters_count(farm_monsters) == 0) {
                smart_move(farm_monsters[0]);
            }
            else {
                if (target)  {
                    if (!is_in_range(target))
                    {
                        if (can_move_to(target.x, target.y)) {
                            move(target.x, target.y);
                        }
                        else {
                            smart_move(target);
                        }
                    }
                }
            }
        }
    }
}

function routine_attack() {
 if (character.rip) {
        return;
    }
    else {
        // todo : if mpot count == 0 || hpot count == 0 then do not attack monsters
        if (get_near_mtypes_monsters_count(farm_monsters) == 0) {
            return;
        }

        let target = get_targeted_monster();
        
        if (!target || !farm_monsters.includes(target.mtype))
        {
            target = get_nearest_monster();
            if (target) change_target(target);
            else
            {
                set_message("No Monsters");
                return;
            }
        }

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

    // start all my characters if not active
    if (!character.controller) {
        check_online();
    }

    // if merchant is near then send all items and gold to merchant
    let merchant = parent.entities[merchant_name];
    if (merchant && distance(character, merchant) < 300) {
        // send all items to merchant
        for (i = 0; i < 42; i++) {
            let item = character.items[i];
            if (item && !items_not_for_merchant.includes(item.name)) {
                send_item(merchant_name, i, 100);
            }
        }

        send_gold(merchant_name, character.gold);
    }

    // if character.esize < 10 or character.gold > 1000000 or hpot count < 500 || mpot count < 500 then send message to merchant
    let esize = character.esize;
    let gold = character.gold;
    let hpot_count = inventory_item_count("hpot1");
    let mpot_count = inventory_item_count("mpot1");
    if (esize < 10 || gold > 500000 || hpot_count < 500 || mpot_count < 500) {
        let msg = { "esize": esize, "gold": gold, "hpot_count": hpot_count, "mpot_count": mpot_count };
        // if more than 1 minute since last cm then send
        let now = new Date();
        let merchant_near = parent.entities[merchant_name];
        let merchant = parent.party[merchant_name];
        if (merchant && !merchant_near) {
            if (now - last_merchant_cm > 60000) {
                send_cm(merchant_name, msg);
                party_say("help");
                last_merchant_cm = now;
                game_log("Sent CM to merchant: " + JSON.stringify(msg));
            }
        }
        else {
            game_log("No merchant to send CM to");
        }
    }
    
    if (!character.rip) {
        let hpot_count = inventory_item_count("hpot1");
        let mpot_count = inventory_item_count("mpot1");

        set_message("" + hpot_count + " " + mpot_count);

        merge_inventory_items();

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

        // use_hp_or_mp();
        loot();
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
                        start_character(party_name, 'main');
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
    if (name == main_character_name) {
	    accept_party_invite(name);
    }
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
    // controlled manaburst NB! aoe
    if (!can_cast(MageSkills.ControlledManaBurst, target) && can_use(MageSkills.ManaBurst.name) && target.hp >= manaburst_damage && character.mp > 2000 && get_percent(character.mp, character.max_mp) > 75) { 
        game_log("Casting Mana Burst for " + manaburst_damage + " dmg", colorGreen);
        use_skill(MageSkills.ManaBurst.name, target);
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
            // use_skill(MageSkills.ControlledManaBurst.name, target);
        }
    }

    if (can_cast(G.skills.cburst, target) && character.mp > 2000 && get_percent(character.mp, character.max_mp) > 75 && target.hp / 0.555 < character.mana_cost) {
        var targets = [];
        targets.push([target, target.hp / 0.555]);
        use_skill('cburst', targets);
    }

    //energize
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
                parent.socket.emit("interaction",{type:"newyear_tree"});
            });
        }
    }
}