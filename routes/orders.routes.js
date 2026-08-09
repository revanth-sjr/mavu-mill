const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/orders.controller');

router.get('/', authenticate, ctrl.list);
router.post('/', authenticate, ctrl.create);
router.delete('/', authenticate, requireAdmin, ctrl.clearAll);

module.exports = router;
