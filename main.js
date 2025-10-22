setInterval(routine_move, 1000/4);
setInterval(routine_attack, 1000/4);
setInterval(routine, 1000/4);

let farm_monsters = ["snake", "osnake"];

function routine_move() {
    // todo : if mpot count == 0 || hpot count == 0 then go to town
    // todo : if near no required monsters and hpot count == 9999 and mpot count == 9999 then go to hunting area
    if (!character.moving && !smart.moving) {  
        if (get_near_monsters_count(farm_monsters) == 0) {
            smart_move(farm_monsters[0]);
        }
        else {
            let target = get_targeted_monster();
            if (target)  {
                if (!is_in_range(target))
                {
                    move(
                        character.x+(target.x-character.x)/2,
                        character.y+(target.y-character.y)/2
                        );
                    // Walk half the distance
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
        if (get_near_monsters_count(farm_monsters) == 0) {
            return;
        }

        let target = get_targeted_monster();
        
        if (!target)
        {
            target = get_nearest_monster();
            if (target) change_target(target);
            else
            {
                set_message("No Monsters");
                return;
            }
        }

        if (is_in_range(target))
        {
            attack(target);
        }
    }
}

function routine() {
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

function sum_to_numbers(number1, number2) {
    let result = number1 + number2;
    return result;
}

function merge_inventory_items() {
    for (let i = 0; i < 42; i++) {
        let item = character.items[i];
        if (item && item.name == "hpot1" && i != 41) {
            swap(41, i);
        }

        if (item && item.name == "mpot1" && i != 40) {
            swap(40, i);
        }
    }

    for (let i = 0; i < 42; i++) {
        let item = character.items[i];
        if (item && item.q) {
            let same_items = get_inventory_item_indexes(item.name);
            let operations_count = same_items.length - 1;
            if (operations_count > 0) {
                for (let j = operations_count; j > 0; j--) {
                    swap(same_items[j], same_items[j-1]);
                }
            }
        }
    }
}

function get_inventory_item_indexes(item_name) {
    let indexes = [];
    for (let i = 0; i < 42; i++) {
        let item = character.items[i];
        if (item != null && item.name === item_name) {
            indexes.push(i);
        }
    }
    return indexes;
}

function get_near_monsters_count(mtypes) {
    let r = character.range + 400;
    var result = {};
    for (id in parent.entities)
    {
        var entity = parent.entities[id];

        if (entity.mtype != null && mtypes.includes(entity.mtype) && parent.G.monsters[entity.mtype])
        {
            if (distance(entity, character) < r) {
                result[id] = entity;
            }
        }
    }

    return Object.keys(result).length;
}