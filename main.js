let gooPosition = find_monster('goo');
let goResult = smart_move(gooPosition);

if (goResult == true) {
    let target = target_monster('goo');
    if (target) {
        let attackResult = attack('goo');
    }
}