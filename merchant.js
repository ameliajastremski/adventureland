let bank_items = ["candy0", "candy1"];

setInterval(routine, 1000/4);

function routine() {
    if (has_any_bank_item()) {
        close_stand();
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
        open_stand();
    }
}

function has_item(item_name) {
    let count = inventory_item_count(item_name);
    return count > 0;
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