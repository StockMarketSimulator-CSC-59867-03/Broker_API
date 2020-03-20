"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var express = require('express');
var router = express.Router();
/* GET broker API page. */
router.get('/', function (req, res, next) {
    res.send("root of broker API");
});
exports.default = router;
//# sourceMappingURL=broker.js.map