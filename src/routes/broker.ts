import * as express from 'express';
import { type } from 'os';
const fbAdmin = require('firebase-admin');
const functions = require('firebase-functions');
const db = fbAdmin.firestore();



class Broker{
  
    public path = '/';
	public router = express.Router();
	
    constructor(){
		//this.stockMaps();  
	}

	//convert order documents retrieved from the database into order objects
	generateOrder(doc : any){
		const id = doc.id;
		const sessionID = doc.data().sessionID;
		const userID = doc.data().user;
		const price = doc.data().price;
		const quantity = doc.data().quantity;
		const stock = doc.data().stock;
		const time = doc.data().time;
		const order = {
		  id:id,
		  sessionID:sessionID,
		  userID:userID,
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
			var buyOrders: {id : any, sessionID : any, userID: any; price: any; quantity: any; stock: any; time: any; }[] = [];
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
			var sellOrders: { id : any, sessionID : any, userID: any; price: any; quantity: any; stock: any; time: any; }[] = [];
			db.collection("SellOrders")
			.where('stock','==',stockName)
			.where('sessionID','==',sessionID)
			.get()
			.then((snapshot) => {
				snapshot.docs.forEach(doc => {
					var order = this.generateOrder(doc);
					console.log(order);
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

	updateStockPrice(sessionID:any, time:any, stock:any, price:any){
		let date = new Date(time);
		let year = date.getFullYear();
		let month = ("0" + (date.getMonth() + 1)).slice(-2);
		let day = ("0" + date.getDate()).slice(-2);
		let formatted_date = year + "-" + month + "-" + day;
		let matchedPrice = price;

		db.collection("Sessions")
		  .doc(sessionID)
		  .collection("Stocks")
		  .doc(stock)
		  .collection("Stock History")
		  .doc(formatted_date).get().then((doc) => {
			  if(doc.exists)
			  {
				doc.ref.update({
					data: fbAdmin.firestore.FieldValue.arrayUnion({dateTime: time, price: parseFloat(matchedPrice)})
				})
			  }
			  else
			  {
				  doc.ref.set({
					data: [{dateTime: time, price: parseFloat(matchedPrice)}]
				  })
			  }
		  })

		db.collection("Sessions")
		  .doc(sessionID)
		  .collection("Stocks")
		  .doc(stock).get().then((doc) => {
			  doc.ref.update({
				  price: parseFloat(matchedPrice)
			  })
		  })
	}

	addCompletedOrder(buyOrder : any, sellOrder : any, sessionID : any, matchedPrice : number, matchedQuantity : number){
		let time = new Date().getTime();
		db.collection('Sessions')
		  .doc(sessionID)
		  .collection('CompletedOrders')
		  .add({
			price : matchedPrice,
			quantity : matchedQuantity,
			stock : buyOrder.stock,
			time : time,
			buyerID : buyOrder.userID,
			sellerID : sellOrder.userID, 
		  });
		this.updateStockPrice(sessionID, time, buyOrder.stock, matchedPrice);
	}

	notifyUser(userID : any, title : any, message : any, type : any){
		db.collection('User')
		  .doc(userID)
		  .collection('Notifications')
		  .add({
			userID : userID,
			title : title,
			body : message,
			time : new Date().getTime(),
			type : type,
		  });
	}

	sendBuyOrderConfirmation(userID : any, buyOrder : any, purchasingPrice : number, purchasingQuantity){
		var messageTitle = 'Buy Order Confirmation';
		var messageBody = 'Your request to purchase the following stock has been succesfully confirmed:';
		var purchaseDetails = '\nStock Name: ' + buyOrder.stock + '\nPurchase Price: ' + purchasingPrice + '\nPurchasing Quantity: ' + purchasingQuantity;  
		var messageType = 'PurchaseConfirmation';
		this.notifyUser(userID,messageTitle,messageBody+purchaseDetails,messageType);
	}

	sendSellOrderConfirmation(userID : any, sellOrder : any, sellingPrice : number, sellingQuantity : number){
		var messageTitle = 'Sell Order Confirmation';
		var messageBody = 'Your request to sell the following stock has been succesfully confirmed:';
		var purchaseDetails = '\nStock Name: ' + sellOrder.stock + '\nSelling Price: ' + sellingPrice + '\nSelling Quantity: ' + sellingQuantity;  
		var messageType = 'SaleConfirmation';
		this.notifyUser(userID,messageTitle,messageBody+purchaseDetails,messageType);
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
			var buyerID = highestBuy.userID;
			var sellerID = lowestSell.userID;

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
					this.addCompletedOrder(highestBuy,lowestSell,sessionID,sellingPrice,sellQuantity);
					this.sendBuyOrderConfirmation(buyerID,highestBuy,sellingPrice,sellQuantity);
					this.sendSellOrderConfirmation(sellerID,lowestSell,sellingPrice,sellQuantity);
					sellIndex++;
				}
				else if(sellQuantity > buyQuantity){
					this.updateSellOrderQuantity(lowestSell,sessionID,remainingQuantity);
					this.updateLocalOrderQuantity(lowestSell,remainingQuantity);
					this.deleteBuyOrder(highestBuy,sessionID);
					this.addCompletedOrder(highestBuy,lowestSell,sessionID,sellingPrice,buyQuantity);
					this.sendBuyOrderConfirmation(buyerID,highestBuy,sellingPrice,buyQuantity);
					this.sendSellOrderConfirmation(sellerID,lowestSell,sellingPrice,buyQuantity);
					buyIndex++;
				}
				else{
					this.deleteBuyOrder(highestBuy,sessionID);
					this.deleteSellOrder(lowestSell,sessionID);
					this.addCompletedOrder(highestBuy,lowestSell,sessionID,sellingPrice,buyQuantity);
					this.sendBuyOrderConfirmation(buyerID,highestBuy,sellingPrice,buyQuantity);
					this.sendSellOrderConfirmation(sellerID,lowestSell,sellingPrice,sellQuantity);
					buyIndex++;
					sellIndex++;
				}
			}
		}
	}
	
	
}
export default Broker;