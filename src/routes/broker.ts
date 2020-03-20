var express = require('express');
var router = express.Router();

/* GET broker API page. */
router.get('/', function(req, res, next) {
	res.send("root of broker API");
});

export default router;