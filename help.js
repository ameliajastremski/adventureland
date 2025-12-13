// send all items to merchant
for (i = 0; i < 40; i++) {
	send_item('AMerchant', i, 100);	
}

// go to mage
smart_move(parent.party["Ammage"])

// invite to party
send_party_invite('Ammage');

// upgrade first 8 items
function prep() {
    use_skill('use_mp');
    use_skill('massproduction');
}
prep(); upgrade(0, 35).then(() => { prep(); upgrade(1, 35).then(() => { prep(); upgrade(2, 35).then(() => { prep(); upgrade(3, 35).then(() => { prep(); upgrade(4, 35).then(() => { prep(); upgrade(5, 35).then(() => { prep(); upgrade(6, 35)})})})})})});

prep(); upgrade(0, 39, 40).then(() => { prep(); upgrade(1, 39, 40).then(() => { prep(); upgrade(2, 39, 40).then(() => { prep(); upgrade(3, 39, 40).then(() => { prep(); upgrade(4, 39, 40).then(() => { prep(); upgrade(5, 39, 40).then(() => { prep(); upgrade(6, 39, 40)})})})})})});
prep(); upgrade(0, 39).then(() => { prep(); upgrade(1, 39).then(() => { prep(); upgrade(2, 39).then(() => { prep(); upgrade(3, 39).then(() => { prep(); upgrade(4, 39)})})})});
prep(); upgrade(0, 39, 40).then(() => { prep(); upgrade(1, 39, 40).then(() => { prep(); upgrade(2, 39, 40).then(() => { prep(); upgrade(3, 39, 40).then(() => { prep(); upgrade(4, 39, 40)})})})});

// exchange
exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0).then(()=>{exchange(0)})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})})

// create basket of eggs
setInterval(() => auto_craft("basketofeggs"), 1)

// 134052
