// let gooPosition = find_monster('goo');
// let goResult = smart_move(gooPosition);

// if (goResult == true) {
//     let target = target_monster('goo');
//     if (target) {
//         let attackResult = attack('goo');
//     }
// }

setInterval(routine_move, 1000/4);
setInterval(routine_attack, 1000/4);
setInterval(routine, 1000/4);

function routine_move() {
    // todo : if mpot count == 0 || hpot count == 0 then go to town
    // todo : if near no required monsters and hpot count == 9999 and mpot count == 9999 then go to hunting area

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

function routine_attack() {
 if (character.rip) {
        return;
    }
    else {
        // todo : if mpot count == 0 || hpot count == 0 then do not attack monsters


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