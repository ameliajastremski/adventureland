// send all items to merchant
for (i = 0; i < 40; i++) {
	send_item('AMerchant', i, 100);	
}


// go to mage
smart_move(parent.party["Ammage"])

// invite to party
send_party_invite('Ammage');
