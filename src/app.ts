var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');


var admin = require('firebase-admin');
var functions = require('firebase-functions');
let serviceAccount = process.env.FIREBASE_API_KEY;

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(serviceAccount))
});


import IndexMiddleWare, * as indexRouter from './routes/index';

import Broker from './routes/broker';
import { match } from 'assert';


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

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
});

db.collection("BuyOrders")
  .onSnapshot(snapshot =>{
    let changes = snapshot.docChanges();
    changes.forEach(change =>{
      if(change.type == 'added'){
        console.log('monkey balls')
        let order = broker.generateOrder(change.doc);
        broker.addBuyOrderToMap(order);
        broker.executeMatchesForOrder(order);
      }
    });
  });

db.collection("SellOrders")
  .onSnapshot(snapshot =>{
    let changes = snapshot.docChanges();
    changes.forEach(change =>{
      if(change.type == 'added'){
        let order = broker.generateOrder(change.doc);
        broker.addSellOrderToMap(order);
        broker.executeMatchesForOrder(order);
      }
    });
  });

export = app;