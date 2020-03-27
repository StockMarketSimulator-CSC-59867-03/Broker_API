var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');


var admin = require('firebase-admin');
var functions = require('firebase-functions');
let serviceAccount = require('../keys/stock-market-sim-firebase-adminsdk.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


import IndexMiddleWare, * as indexRouter from './routes/index';

import Broker from './routes/broker';


var app = express();


app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const broker = new Broker();
const cors = require('cors');
const db = admin.firestore();
app.use(cors({ origin: true, credentials: true }));
app.use('/', indexRouter.default);
app.use("/broker", broker.router);


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

console.log("5");



// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
});

const sessionID = 'fVO1CcjJ4p7ZXmKz9Fig';

db.collection("Sessions")
.doc(sessionID)
.collection("Buy Orders")
.onSnapshot(snapshot =>{
  let changes = snapshot.docChanges();
  changes.forEach(change =>{
    if(change.type == 'added'){
      const stockName = change.doc.data().Stock;

      broker.getRelevantBuyOrders(sessionID,stockName)
      .then((buyOrders : any) =>{
        
        broker.getRelevantSellOrders(sessionID,stockName)
        .then((sellOrders : any) =>{

          broker.checkOrdersForMatches(buyOrders,sellOrders,sessionID);
        });
      });
    }
  });
});

db.collection("Sessions")
.doc(sessionID)
.collection("Sell Orders")
.onSnapshot(snapshot =>{
  var buyOrders: { user: any; price: any; quantity: any; stock: any; time: any; }[] = [];
  var sellOrders: { user: any; price: any; quantity: any; stock: any; time: any; }[] = [];
  let changes = snapshot.docChanges();
  changes.forEach(change =>{
    if(change.type == 'added'){
      const stockName = change.doc.data().Stock;

      broker.getRelevantBuyOrders(sessionID,stockName)
      .then((buyOrders : any) =>{
        
        broker.getRelevantSellOrders(sessionID,stockName)
        .then((sellOrders : any) =>{

          broker.checkOrdersForMatches(buyOrders,sellOrders,sessionID);
        });
      });
    }
  });
});

// db.collection("Sessions").doc("5BfhIdQHUYqXlmrfD1ql").collection("BuyOrder")
// .onSnapshot(function(snapshot) {
//   snapshot.docChanges().forEach(function(change) {
//       if (change.type === "added") {
//           let buy = change.doc.data();
//           broker.addBuyOrder(buy);
//       }
//       if (change.type === "removed") {
//           console.log("Removed: ", change.doc.data());
//       }
//   });
// });


// db.collection("Sessions").doc("5BfhIdQHUYqXlmrfD1ql").collection("SellOrder")
// .onSnapshot(function(snapshot) {
//   snapshot.docChanges().forEach(function(change) {
//       if (change.type === "added") {
//           let sell = change.doc.data();
//           broker.addSellOrder(sell);
//       }
//       if (change.type === "removed") {
//           console.log("Removed: ", change.doc.data());
//       }
//   });
// });




export = app;