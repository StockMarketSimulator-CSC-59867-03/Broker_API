import * as express from 'express';
import { type } from 'os';
const fbAdmin = require('firebase-admin');
const functions = require('firebase-functions');
const db = fbAdmin.firestore();



class Broker{
  
    public path = '/';
	public router = express.Router();
	
	public buyOrders = new Map();
	public sellOrders = new Map();
	
    constructor(){
		this.stockMaps();  
	}
	
	
	getBuyData(){
		return this.buyOrders;
	}
	getSellData(){
		return this.sellOrders;
	}
	//listener uses to add buy order
	addBuyOrder(buy){
		if (this.buyOrders.has(buy.name)){
			this.buyOrders.get(buy.name).push(buy);
		}
		else{
			this.buyOrders.set(buy.name,[buy]);
		}
		console.log("Current Buy Orders:")
		console.log(this.buyOrders);
	}
	//listener uses to add sell order
	addSellOrder(sell){
		if (this.sellOrders.has(sell.name)){
			this.sellOrders.get(sell.name).push(sell);
		}
		else{
			this.sellOrders.set(sell.name,[sell]);
		}
		console.log("Current Sell Orders:")
		console.log(this.sellOrders);
	}

	//creates initial order maps based on database current order collections
	stockMaps(){

		let dbbuyRef = db.collection("Sessions").doc("5BfhIdQHUYqXlmrfD1ql").collection("BuyOrder")
			let allBuyOrders = dbbuyRef.get()
			  .then(snapshot => {
				snapshot.forEach(doc => {
					if (this.buyOrders.has(doc.data().name)){
						this.buyOrders.get(doc.data().name).push(doc.data());
					}
					else{
						this.buyOrders.set(doc.data().name,[doc.data()]);
					}

				});
				console.log("Existing buy order map ===================================");
				console.log(this.buyOrders);
			  })
			  .catch(err => {
				console.log('Error getting documents', err);
			  });
		
		let dbsellRef = db.collection("Sessions").doc("5BfhIdQHUYqXlmrfD1ql").collection("SellOrder")
			let allSellOrders = dbsellRef.get()
			  .then(snapshot => {
				snapshot.forEach(doc => {
					if (this.sellOrders.has(doc.data().name)){
						this.sellOrders.get(doc.data().name).push(doc.data());
					}
					else{
						this.sellOrders.set(doc.data().name,[doc.data()]);
					}
				});
				console.log("Existing sell order map ===================================");
				console.log(this.sellOrders);
			  })
			  .catch(err => {
				console.log('Error getting documents', err);
			  });
		
	}
	
	
}
export default Broker;