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
		//this.stockMaps();  
	}

	//convert order documents retrieved from the database into order objects
	generateOrder(doc : any){
		const id = doc.id;
		const sessionID = doc.data().sessionID;
		const user = doc.data().user;
		const price = doc.data().price;
		const quantity = doc.data().quantity;
		const stock = doc.data().stock;
		const time = doc.data().time;
		const order = {
		  id:id,
		  sessionID:sessionID,
		  user:user,
		  price:price,
		  quantity:quantity,
		  stock:stock,
		  time:time
		};
		return order;
	}

	//price comparison function for buy orders (true when buyingPrice -> higher priority)
	buyComparator(buyingPrice : number, currentPrice : number){
		return buyingPrice > currentPrice;
	}

	//price comparison function for sell orders (true when sellingPrice -> higher priority)
	sellComparator(sellingPrice : number, currentPrice : number){
		return sellingPrice < currentPrice;
	}
	
	//adds order to orderList; orders list based on buy order priority
	addOrderToBuyList(order : any, orderList : any){
		return this.addOrderToList(order,orderList,this.buyComparator);
	}

	//adds order to orderList; orders list based on sell order priority
	addOrderToSellList(order : any, orderList : any){
		return this.addOrderToList(order,orderList,this.sellComparator);
	}

	//adds order to correct position in array according to the comparator used
	addOrderToList(order : any, orderList : any, 
		comparator : (orderPrice : number, currentPrice : number) => any){
		var location = -1;
		var x;
		if(orderList.length == 0){
		  orderList.push(order);
		}
		else{
		  var orderPrice = order.price;
		  var orderTime = order.time;
		  for(x of orderList){
			var currentPrice = x.price;
			var currentTime = x.time;
			if(comparator(orderPrice,currentPrice)){
			  break;
			}
			else if((orderPrice == currentPrice) && (orderTime < currentTime)){
			  break;
			}
			location++;
		  }
		  orderList.splice(location+1,0,order);
		}
		return orderList;
	}

	//returns a promise that resolves the list of buy orders in order of priority
	getRelevantBuyOrders(sessionID : string, stockName : string){
		return new Promise((resolve,reject) =>{
			var buyOrders: {id : any, sessionID : any, user: any; price: any; quantity: any; stock: any; time: any; }[] = [];
			db.collection("BuyOrders")
			.where('stock','==',stockName)
			.where('sessionID','==',sessionID)
			.get()
			.then((snapshot) => {
				snapshot.docs.forEach(doc => {
					var order = this.generateOrder(doc);
					buyOrders = this.addOrderToBuyList(order,buyOrders);
					if(!order){
						reject();
					}
				});
				resolve(buyOrders);
			}).catch((error : any) =>{
				console.error(error);
				reject();
			});
		});
	}
  
	//returns a promise that resolves the list of sell orders in order of priority
	getRelevantSellOrders(sessionID : string, stockName : string){
		return new Promise((resolve,reject) =>{
			var sellOrders: { id : any, sessionID : any, user: any; price: any; quantity: any; stock: any; time: any; }[] = [];
			db.collection("SellOrders")
			.where('stock','==',stockName)
			.where('sessionID','==',sessionID)
			.get()
			.then((snapshot) => {
				snapshot.docs.forEach(doc => {
					var order = this.generateOrder(doc);
					sellOrders = this.addOrderToSellList(order,sellOrders);
					if(!order){
						reject();
					}
				}); 
				resolve(sellOrders);
			}).catch((error : any) =>{
				console.error(error);
				reject();
			});;
		});
	}
  
	//deletes order using order id, sessionID, and order type
	deleteOrder(order : any, orderType : string, sessionID : string){
		let deleteOrder = db.collection(orderType + 'Orders')
							.doc(order.id)
							.delete()
							.catch(error => {console.log(error)});
	}
  
	//deletes buy order based on order id and sessionID
	deleteBuyOrder(order : any, sessionID : string){
		this.deleteOrder(order,'Buy',sessionID);
	}

	//deletes sell order based on order id and sessionID
	deleteSellOrder(order : any, sessionID : string){
		this.deleteOrder(order,'Sell',sessionID);
	}
	
	//update order quantity to newQuantity
	updateOrderQuantity(order : any, orderType : string, sessionID : string, newQuantity : number){
		let updateOrderQuantity = db.collection(orderType + 'Orders')
									.doc(order.id)
									.update({quantity:newQuantity})
									.catch(error => {console.log(error)});
	}
	
	//update buy order quantity to newQuantity
	updateBuyOrderQuantity(order : any, sessionID : string, newQuantity : number){
		this.updateOrderQuantity(order,'Buy',sessionID,newQuantity);
	}
  
	//update sell order quantity to newQuantity
	updateSellOrderQuantity(order : any, sessionID : string, newQuantity : number){
		this.updateOrderQuantity(order,'Sell',sessionID,newQuantity);
	}
  
	updateLocalOrderQuantity(order : any, newQuantity : number){
		order.quantity = newQuantity;
	}

	//performs all possible matches for the given buyOrders and sellOrders; updates tables accordingly
	checkOrdersForMatches(buyOrders : any, sellOrders : any, sessionID : string){
		var matchingComplete = false;
		var buyIndex = 0;
		var sellIndex = 0;
		while(!matchingComplete && (buyIndex < buyOrders.length) && (sellIndex < sellOrders.length)){
			var highestBuy = buyOrders[buyIndex];
			var highestBuyPrice = highestBuy.price;
			var lowestSell = sellOrders[sellIndex];
			var lowestSellPrice = lowestSell.price;
			if(highestBuyPrice < lowestSellPrice){
				matchingComplete = true;
			}
			else {
			//matches are completed at sellingPrice
				var sellingPrice = lowestSell.price;
				var buyQuantity = highestBuy.quantity;
				var sellQuantity = lowestSell.quantity;
				var remainingQuantity = Math.abs(buyQuantity - sellQuantity);
				if(buyQuantity > sellQuantity){
					this.updateBuyOrderQuantity(highestBuy,sessionID,remainingQuantity);
					this.updateLocalOrderQuantity(highestBuy,remainingQuantity);
					this.deleteSellOrder(lowestSell,sessionID);
					sellIndex++;
				}
				else if(sellQuantity > buyQuantity){
					this.updateSellOrderQuantity(lowestSell,sessionID,remainingQuantity);
					this.updateLocalOrderQuantity(lowestSell,remainingQuantity);
					this.deleteBuyOrder(highestBuy,sessionID);
					buyIndex++;
				}
				else{
					this.deleteBuyOrder(highestBuy,sessionID);
					this.deleteSellOrder(lowestSell,sessionID);
					buyIndex++;
					sellIndex++;
				}
			}
		}
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