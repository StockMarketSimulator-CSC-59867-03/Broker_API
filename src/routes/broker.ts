import * as express from 'express';
import { type } from 'os';
import { match } from 'assert';
const fbAdmin = require('firebase-admin');
const functions = require('firebase-functions');
const db = fbAdmin.firestore();
const buyType = 'BUY';
const sellType = 'SELL';



class Broker {
  public path = "/";
  public router = express.Router();
  private sessionBuyOrders;
  private sessionSellOrders;
  constructor() {
    //this.stockMaps();
    this.sessionBuyOrders = new Map();
    this.sessionSellOrders = new Map();
  }

  //convert order documents retrieved from the database into order objects
  generateOrder(doc: any) {
    const id = doc.id;
    const sessionID = doc.data().sessionID;
    const userID = doc.data().user;
    const price = doc.data().price;
    const quantity = doc.data().quantity;
    const stock = doc.data().stock;
    const time = doc.data().time;
    const order = {
      id: id,
      sessionID: sessionID,
      userID: userID,
      price: price,
      quantity: quantity,
      stock: stock,
      time: time
    };
    return order;
  }

  //checks if array contains an order with the specified order id
  arrayContainsOrder(order : any, array : any){
    let orderID = order.id;
    let currentOrder;
    if(array == undefined || order == undefined){
      return false;
    }
    for(currentOrder of array){
      let currentOrderID = currentOrder.id;
      if(currentOrderID === orderID){
        return true;
      }
    }
      return false;
  }

  getSessionOrderList(orderType : string){
    return (orderType === buyType) ? this.sessionBuyOrders : this.sessionSellOrders;
  }

  addOrderToMap(order : any, orderType : string){
    let sessionOrderList = this.getSessionOrderList(orderType);
    let sessionID = order.sessionID;
    let currentOrders;
    if(sessionOrderList.has(sessionID)){
      currentOrders = sessionOrderList.get(sessionID);
      if(!this.arrayContainsOrder(order, currentOrders)){
        if(orderType === buyType){
          currentOrders = this.addOrderToBuyList(order,currentOrders);
        }
        else if(orderType === sellType){
          currentOrders = this.addOrderToSellList(order,currentOrders);
        }
        sessionOrderList.set(sessionID,currentOrders);
      }
    }
    else{
      currentOrders = new Array(order);
      sessionOrderList.set(sessionID,currentOrders);
    }
  }

  addBuyOrderToMap(buyOrder : any){
    this.addOrderToMap(buyOrder,buyType)
  }

  addSellOrderToMap(sellorder : any){
    this.addOrderToMap(sellorder,sellType);
  }

  updateOrderQuantityFromMap(order: any, sessionID: string, newQuantity: number, orderType : string){
    let sessionOrderList = this.getSessionOrderList(orderType);
    let currentOrders = sessionOrderList.get(sessionID);
    let currentOrder;
    for(var c = 0; c < currentOrders.length; c++){
      currentOrder = currentOrders[c];
      if(order.id === currentOrder.id){
        currentOrder.quantity = newQuantity;
        continue;
      }
    }
  }

  updateBuyOrderQuantityFromMap(order: any, sessionID: string, newQuantity: number){
    this.updateOrderQuantityFromMap(order,sessionID,newQuantity,buyType);
  }

  updateSellOrderQuantityFromMap(order: any, sessionID: string, newQuantity: number){
    this.updateOrderQuantityFromMap(order,sessionID,newQuantity,sellType);
  }

  deleteOrderFromMap(order: any, sessionID: string, orderType : string){
    let sessionOrderList = this.getSessionOrderList(orderType);
    let currentOrders = sessionOrderList.get(sessionID);
    let currentOrder;
    for(var c = 0; c < currentOrders.length; c++){
      currentOrder = currentOrders[c];
      if(order.id === currentOrder.id){
        currentOrders.splice(c,1);
        continue;
      }
    }
  }

  deleteBuyOrderFromMap(order: any, sessionID: string){
    this.deleteOrderFromMap(order,sessionID,buyType);
  }

  deleteSellOrderFromMap(order: any, sessionID: string){
    this.deleteOrderFromMap(order,sessionID,sellType);
  }

  //price comparison function for buy orders (true when buyingPrice -> higher priority)
  buyComparator(buyingPrice: number, currentPrice: number) {
    return buyingPrice > currentPrice;
  }

  //price comparison function for sell orders (true when sellingPrice -> higher priority)
  sellComparator(sellingPrice: number, currentPrice: number) {
    return sellingPrice < currentPrice;
  }

  //adds order to orderList; orders list based on buy order priority
  addOrderToBuyList(order: any, orderList: any) {
    return this.addOrderToList(order, orderList, this.buyComparator);
  }

  //adds order to orderList; orders list based on sell order priority
  addOrderToSellList(order: any, orderList: any) {
    return this.addOrderToList(order, orderList, this.sellComparator);
  }

  //adds order to correct position in array according to the comparator used
  addOrderToList(
    order: any,
    orderList: any,
    comparator: (orderPrice: number, currentPrice: number) => any
  ) {
    var location = -1;
    var x;
    if (orderList.length == 0) {
      orderList.push(order);
    } else {
      var orderPrice = order.price;
      var orderTime = order.time;
      for (x of orderList) {
        var currentPrice = x.price;
        var currentTime = x.time;
        if (comparator(orderPrice, currentPrice)) {
          break;
        } else if (orderPrice == currentPrice && orderTime < currentTime) {
          break;
        }
        location++;
      }
      orderList.splice(location + 1, 0, order);
    }
    return orderList;
  }

  getRelevantOrders(sessionID : string, stockName : string, orderType : string){
    let sessionOrderList = this.getSessionOrderList(orderType);
    let currentOrders = sessionOrderList.get(sessionID);
    let relevantOrders = new Array();
    let currentOrder;
    if(currentOrders != undefined){
      for(currentOrder of currentOrders){
        let currentStockName = currentOrder.stock;
        if(stockName === currentStockName){
          if(orderType === buyType){
            relevantOrders = this.addOrderToBuyList(currentOrder,relevantOrders);
          }
          else if(orderType === sellType){
            relevantOrders = this.addOrderToSellList(currentOrder,relevantOrders);
          }
        }
      }
    }
    return relevantOrders;
  }

  //returns a promise that resolves the list of buy orders in order of priority
  getRelevantBuyOrders(sessionID: string, stockName: string) {
    return this.getRelevantOrders(sessionID,stockName,buyType);
  }

  //returns a promise that resolves the list of sell orders in order of priority
  getRelevantSellOrders(sessionID: string, stockName: string) {
    return this.getRelevantOrders(sessionID,stockName,sellType);
  }

  //deletes order using order id, sessionID, and order type
  deleteOrder(order: any, orderType: string, sessionID: string) {
    let deleteOrder = db
      .collection(orderType + "Orders")
      .doc(order.id)
      .delete()
      .catch(error => {
        console.log(error);
      });
  }

  //deletes buy order based on order id and sessionID
  deleteBuyOrder(order: any, sessionID: string) {
    this.deleteOrder(order, "Buy", sessionID);
  }

  //deletes sell order based on order id and sessionID
  deleteSellOrder(order: any, sessionID: string) {
    this.deleteOrder(order, "Sell", sessionID);
  }

  //update order quantity to newQuantity
  updateOrderQuantity(
    order: any,
    orderType: string,
    sessionID: string,
    newQuantity: number
  ) {
    let updateOrderQuantity = db
      .collection(orderType + "Orders")
      .doc(order.id)
      .update({ quantity: newQuantity })
      .catch(error => {
        console.log(error);
      });
  }

  //update buy order quantity to newQuantity
  updateBuyOrderQuantity(order: any, sessionID: string, newQuantity: number) {
    this.updateOrderQuantity(order, "Buy", sessionID, newQuantity);
  }

  //update sell order quantity to newQuantity
  updateSellOrderQuantity(order: any, sessionID: string, newQuantity: number) {
    this.updateOrderQuantity(order, "Sell", sessionID, newQuantity);
  }

  updateLocalOrderQuantity(order: any, newQuantity: number) {
    order.quantity = newQuantity;
  }

  updateStockPrice(sessionID: any, time: any, stock: any, price: any) {
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
      .doc(formatted_date)
      .get()
      .then(doc => {
        if (doc.exists) {
          doc.ref.update({
            data: fbAdmin.firestore.FieldValue.arrayUnion({
              dateTime: time,
              price: matchedPrice
            })
          });
        } else {
          doc.ref.set({
            data: [{ dateTime: time, price: matchedPrice }]
          });
        }
      });

    db.collection("Sessions")
      .doc(sessionID)
      .collection("Stocks")
      .doc(stock)
      .get()
      .then(doc => {
        doc.ref.update({
          price: matchedPrice
        });
      });
  }

  addCompletedOrder(
    buyOrder: any,
    sellOrder: any,
    sessionID: any,
    matchedPrice: any,
    matchedQuantity: any,
    functionArray: any
  ) {
    let time = new Date().getTime();

    this.performBuySellTransaction(
      sessionID,
      buyOrder.userID,
      sellOrder.userID,
      buyOrder.stock,
      matchedPrice,
      matchedQuantity
    )
      .then(() => {
        db.collection("Sessions")
          .doc(sessionID)
          .collection("CompletedOrders")
          .add({
            price: matchedPrice,
            quantity: matchedQuantity,
            stock: buyOrder.stock,
            time: time,
            buyerID: buyOrder.userID,
            sellerID: sellOrder.userID
          })
          .then(() => {
            functionArray.forEach(func => {
              func();
            });
            this.updateStockPrice(
              sessionID,
              time,
              buyOrder.stock,
              matchedPrice
            );
            this.sendBuyOrderConfirmation(
              buyOrder.userID,
              buyOrder,
              matchedPrice,
              matchedQuantity
            );
            this.sendSellOrderConfirmation(
              sellOrder.userID,
              sellOrder,
              matchedPrice,
              matchedQuantity
            );
          });
      })
      .catch((err: any) => {
        console.log(err);
        if (err.code == 0) {
          this.sendBuyOrderError(
            buyOrder.userID,
            buyOrder,
            matchedPrice,
            matchedQuantity
          );
        } else if (err.code == 1) {
          this.sendSellOrderError(
            sellOrder.userID,
            sellOrder,
            matchedPrice,
            matchedQuantity
          );
        }
      });
  }

  //Rejects if users don't have enough capital and stocks
  performBuySellTransaction(
    sessionID: string,
    buyerID: string,
    sellerID: string,
    symbol: string,
    price: number,
    quantity: number
  ): Promise<any> {
    var buyerRef = db
      .collection("Sessions")
      .doc(sessionID)
      .collection("Users")
      .doc(buyerID);

    let buyerStock = buyerRef.collection("Stocks").doc(symbol);

    var sellerRef = db
      .collection("Sessions")
      .doc(sessionID)
      .collection("Users")
      .doc(sellerID);

    let sellerStock = sellerRef.collection("Stocks").doc(symbol);

    return db.runTransaction((transaction: any) => {
      return transaction
        .getAll(buyerStock, sellerStock, buyerRef, sellerRef)
        .then((docs: any) => {
          if (buyerID != "bot" && buyerID != "admin") {
            let buyerDoc = docs[0].data();
            let buyerBalance = docs[2].data().liquid;

            if (buyerDoc == null) {
              buyerDoc = { quantity: 0 };
            }

            let newBuyerQuantity = quantity + buyerDoc.quantity;
            let cost = price * quantity;

            let newBalance = buyerBalance - cost;

            if (newBalance < 0 || buyerBalance == null) {
              return Promise.reject({
                code: 0,
                msg: "Buyer doesn't have balance"
              });
            }

            transaction.update(buyerRef, {
              liquid: buyerBalance - cost
            });

            transaction.set(buyerStock, {
              initalValue: buyerDoc.initalValue + cost,
              quantity: newBuyerQuantity
            });
          }

          if (sellerID != "bot" && sellerID != "admin") {
            let sellerDoc = docs[1].data();
            let sellerBalance = docs[3].data().liquid;

            let newSellerQuantity = sellerDoc.quantity - quantity;
            let gain = price * quantity;

            if (newSellerQuantity < 0 || sellerDoc == null) {
              return Promise.reject({
                code: 1,
                msg: "Seller doesn't have stock to sell"
              });
            }

            transaction.update(sellerRef, {
              liquid: sellerBalance + gain
            });

            transaction.set(sellerStock, {
              initalValue: sellerDoc.initalValue - gain,
              quantity: newSellerQuantity
            });
          }
        });
    });
  }

  notifyUser(userID: any, title: any, message: any, type: any) {
    db.collection("User")
      .doc(userID)
      .collection("Notifications")
      .add({
        userID: userID,
        title: title,
        body: message,
        time: new Date().getTime(),
        type: type
      });
  }

  sendBuyOrderConfirmation(
    userID: any,
    buyOrder: any,
    purchasingPrice: number,
    purchasingQuantity
  ) {
    var messageTitle = "Buy Order Confirmation";
    var messageBody =
      "Your request to purchase the following stock has been succesfully confirmed:";
    var purchaseDetails =
      "\nStock Name: " +
      buyOrder.stock +
      "\nPurchase Price: " +
      purchasingPrice +
      "\nPurchasing Quantity: " +
      purchasingQuantity;
    var messageType = "PurchaseConfirmation";
    this.notifyUser(
      userID,
      messageTitle,
      messageBody + purchaseDetails,
      messageType
    );
  }

  sendSellOrderConfirmation(
    userID: any,
    sellOrder: any,
    sellingPrice: number,
    sellingQuantity: number
  ) {
    var messageTitle = "Sell Order Confirmation";
    var messageBody =
      "Your request to sell the following stock has been succesfully confirmed:";
    var purchaseDetails =
      "\nStock Name: " +
      sellOrder.stock +
      "\nSelling Price: " +
      sellingPrice +
      "\nSelling Quantity: " +
      sellingQuantity;
    var messageType = "SaleConfirmation";
    this.notifyUser(
      userID,
      messageTitle,
      messageBody + purchaseDetails,
      messageType
    );
  }

  sendBuyOrderError(
    userID: any,
    buyOrder: any,
    purchasingPrice: number,
    purchasingQuantity
  ) {
    var messageTitle = "Buy Order";
    var messageBody =
      "Your request to purchase the following stock has been rejected";
    var purchaseDetails =
      "\nStock Name: " +
      buyOrder.stock +
      "\nPurchase Price: " +
      purchasingPrice +
      "\nPurchasing Quantity: " +
      purchasingQuantity;
    var messageType = "INSTANT";
    this.notifyUser(
      userID,
      messageTitle,
      messageBody + purchaseDetails,
      messageType
    );
  }

  sendSellOrderError(
    userID: any,
    sellOrder: any,
    sellingPrice: number,
    sellingQuantity: number
  ) {
    var messageTitle = "Sell Order ";
    var messageBody =
      "Your request to sell the following stock has been rejected";
    var purchaseDetails =
      "\nStock Name: " +
      sellOrder.stock +
      "\nSelling Price: " +
      sellingPrice +
      "\nSelling Quantity: " +
      sellingQuantity;
    var messageType = "INSTANT";
    this.notifyUser(
      userID,
      messageTitle,
      messageBody + purchaseDetails,
      messageType
    );
  }

  //performs all possible matches for the given buyOrders and sellOrders; updates tables accordingly
  checkOrdersForMatches(buyOrders: any, sellOrders: any, sessionID: string) {
    var matchingComplete = false;
    var buyIndex = 0;
    var sellIndex = 0;
    while (
      !matchingComplete &&
      buyOrders != undefined &&
      sellOrders != undefined &&
      buyIndex < buyOrders.length &&
      sellIndex < sellOrders.length
    ) {
      var highestBuy = buyOrders[buyIndex];
      var highestBuyPrice = highestBuy.price;
      var lowestSell = sellOrders[sellIndex];
      var lowestSellPrice = lowestSell.price;

      if (highestBuyPrice < lowestSellPrice) {
        matchingComplete = true;
      } else {
        //matches are completed at sellingPrice
        var sellingPrice = lowestSell.price;
        var buyQuantity = highestBuy.quantity;
        var sellQuantity = lowestSell.quantity;
        var remainingQuantity = Math.abs(buyQuantity - sellQuantity);
        if (buyQuantity > sellQuantity) {
          let functionArray = [];
          functionArray.push(
            this.updateBuyOrderQuantity.bind(
              this,
              highestBuy,
              sessionID,
              remainingQuantity
            )
          );
          functionArray.push(
            this.updateLocalOrderQuantity.bind(
              this,
              highestBuy,
              remainingQuantity
            )
          );
          functionArray.push(
            this.deleteSellOrder.bind(this, lowestSell, sessionID)
          );
          functionArray.push(
            this.updateBuyOrderQuantityFromMap.bind(
              this,
              highestBuy,
              sessionID,
              remainingQuantity
            )
          );
          functionArray.push(
            this.deleteSellOrderFromMap.bind(
              this,
              lowestSell,
              sessionID
            )
          );
          this.addCompletedOrder(
            highestBuy,
            lowestSell,
            sessionID,
            sellingPrice,
            sellQuantity,
            functionArray
          );
          sellIndex++;
        } else if (sellQuantity > buyQuantity) {
          let functionArray = [];
          functionArray.push(
            this.updateSellOrderQuantity.bind(
              this,
              lowestSell,
              sessionID,
              remainingQuantity
            )
          );
          functionArray.push(
            this.updateLocalOrderQuantity.bind(
              this,
              lowestSell,
              remainingQuantity
            )
          );
          functionArray.push(
            this.deleteBuyOrder.bind(this, highestBuy, sessionID)
          );
          functionArray.push(
            this.updateSellOrderQuantityFromMap.bind(
              this,
              lowestSell,
              sessionID,
              remainingQuantity
            )
          );
          functionArray.push(
            this.deleteBuyOrderFromMap.bind(
              this,
              highestBuy,
              sessionID
            )
          );
          this.addCompletedOrder(
            highestBuy,
            lowestSell,
            sessionID,
            sellingPrice,
            buyQuantity,
            functionArray
          );
          buyIndex++;
        } else {
          let functionArray = [];
          functionArray.push(
            this.deleteBuyOrder.bind(this, highestBuy, sessionID)
          );
          functionArray.push(
            this.deleteSellOrder.bind(this, lowestSell, sessionID)
          );

          functionArray.push(
            this.deleteBuyOrderFromMap.bind(
              this,
              highestBuy,
              sessionID
            )
          );

          functionArray.push(
            this.deleteSellOrderFromMap.bind(
              this,
              lowestSell,
              sessionID
            )
          );

          this.addCompletedOrder(
            highestBuy,
            lowestSell,
            sessionID,
            sellingPrice,
            buyQuantity,
            functionArray
          );
          buyIndex++;
          sellIndex++;
        }
      }
    }
  }

  executeMatchesForOrder(order : any){
    const stockName = order.stock;
    const sessionID = order.sessionID;
    let relevantBuyOrders = this.getRelevantBuyOrders(sessionID,stockName);
    let relevantSellOrders = this.getRelevantSellOrders(sessionID,stockName);
    this.checkOrdersForMatches(relevantBuyOrders,relevantSellOrders,sessionID);
    console.log('buy orders');
    console.log(this.sessionBuyOrders);
    console.log('sell orders');
    console.log(this.sessionSellOrders);
  }
}
export default Broker;