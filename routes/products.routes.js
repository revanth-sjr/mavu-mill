const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/products.controller');

router.get('/', authenticate, ctrl.list);
router.post('/', authenticate, requireAdmin, ctrl.create);
router.put('/:id', authenticate, requireAdmin, ctrl.updateRate);
router.delete('/:id', authenticate, requireAdmin, ctrl.remove);

module.exports = router;
