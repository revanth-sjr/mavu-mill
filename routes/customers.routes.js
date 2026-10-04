const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/customers.controller');

router.get('/', authenticate, ctrl.list);
router.post('/', authenticate, ctrl.create);

module.exports = router;
