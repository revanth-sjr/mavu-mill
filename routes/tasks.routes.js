const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/tasks.controller');

router.get('/', authenticate, ctrl.list);
router.get('/counts', authenticate, ctrl.counts);
router.get('/next-token', authenticate, ctrl.getNextToken);
router.post('/', authenticate, ctrl.create);
router.put('/:id/status', authenticate, ctrl.updateStatus);
router.post('/:id/bill', authenticate, ctrl.billTask);
router.post('/:id/remind', authenticate, ctrl.sendReminder);
router.delete('/:id', authenticate, ctrl.remove);

module.exports = router;
