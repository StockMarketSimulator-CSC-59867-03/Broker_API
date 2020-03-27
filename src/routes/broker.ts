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

	generateOrder(doc : any){
		const id = doc.id;
		const user = doc.data().User;
		const price = doc.data().Price;
		const quantity = doc.data().Quantity;
		const stock = doc.data().Stock;
		const time = doc.data().Time;
		const order = {
		  id:id,
		  user:user,
		  price:price,
		  quantity:quantity,
		  stock:stock,
		  time:time
		};
		return order;
	}

	buyComparator(buyingPrice : number, currentPrice : number){
		return buyingPrice > currentPrice;
	}

	sellComparator(sellingPrice : number, currentPrice : number){
		return sellingPrice < currentPrice;
	}
	
	addOrderToBuyList(order : any, orderList : any){
		return this.addOrderToList(order,orderList,this.buyComparator);
	}

	addOrderToSellList(order : any, orderList : any){
		return this.addOrderToList(order,orderList,this.sellComparator);
	}

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


getRelevantBuyOrders(sessionID : string, stockName : string){
	return new Promise((resolve,reject) =>{
	  var buyOrders: { user: any; price: any; quantity: any; stock: any; time: any; }[] = [];
	  db.collection("Sessions")
	  .doc(sessionID)
	  .collection("Buy Orders")
	  .where('Stock','==',stockName)
	  .get()
	  .then((snapshot) => {
		snapshot.docs.forEach(doc => {
		  var order = this.generateOrder(doc);
		  buyOrders = this.addOrderToBuyList(order,buyOrders);
		});
		resolve(buyOrders);
	  });
	});
  }
  
  getRelevantSellOrders(sessionID : string, stockName : string){
	return new Promise((resolve,reject) =>{
	  var sellOrders: { user: any; price: any; quantity: any; stock: any; time: any; }[] = [];
	  db.collection("Sessions")
	  .doc(sessionID)
	  .collection("Sell Orders")
	  .where('Stock','==',stockName)
	  .get()
	  .then((snapshot) => {
		snapshot.docs.forEach(doc => {
		  var order = this.generateOrder(doc);
		  sellOrders = this.addOrderToSellList(order,sellOrders);
		}); 
		resolve(sellOrders);
	  });
	});
  }
  
  deleteOrder(order : any, orderType : string, sessionID : string){
	let deleteOrder = db.collection('Sessions')
						.doc(sessionID)
						.collection(orderType + ' Orders')
						.doc(order.id)
						.delete();
  }
  
  deleteBuyOrder(order : any, sessionID : string){
	this.deleteOrder(order,'Buy',sessionID);
  }
  
  deleteSellOrder(order : any, sessionID : string){
	this.deleteOrder(order,'Sell',sessionID);
  }
  
  updateOrder(order : any, orderType : string, sessionID : string, newQuantity : number){
	let updateOrder = db.collection('Sessions')
						.doc(sessionID)
						.collection(orderType + ' Orders')
						.doc(order.id)
						.update({Quantity:newQuantity});
  }
  
  updateBuyOrder(order : any, sessionID : string, newQuantity : number){
	this.updateOrder(order,'Buy',sessionID,newQuantity);
  }
  
  updateSellorder(order : any, sessionID : string, newQuantity : number){
	this.updateOrder(order,'Sell',sessionID,newQuantity);
  }
  
  checkOrdersForMatches(buyOrders : any, sellOrders : any, sessionID : string){
	var matchingComplete = false;
	var buyIndex = 0;
	var sellIndex = 0;
	while(!matchingComplete && (buyIndex < buyOrders.length) && (sellIndex < sellOrders.length)){
	  var highestBuy = buyOrders[buyIndex];
	  var lowestSell = sellOrders[sellIndex];
	  if(highestBuy < lowestSell){
		matchingComplete = true;
	  }
	  else {
		//matches are completed at sellingPrice
		var sellingPrice = lowestSell.price;
		var buyQuantity = highestBuy.quantity;
		var sellQuantity = lowestSell.quantity;
		var remainingQuantity = Math.abs(buyQuantity - sellQuantity);
		if(buyQuantity > sellQuantity){
		  this.updateBuyOrder(highestBuy,sessionID,remainingQuantity);
		  this.deleteSellOrder(lowestSell,sessionID);
		  sellIndex++;
		}
		else if(sellQuantity > buyQuantity){
		  this.updateSellorder(lowestSell,sessionID,remainingQuantity);
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