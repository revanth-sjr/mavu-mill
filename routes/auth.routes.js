const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/auth.controller');

router.post('/login', ctrl.login);
router.get('/me', authenticate, ctrl.me);
router.put('/profile', authenticate, ctrl.updateProfile);
router.post('/refresh', authenticate, ctrl.refreshToken);
router.put('/change-password', authenticate, ctrl.changePassword);
router.get('/users', authenticate, requireAdmin, ctrl.listUsers);
router.post('/register', authenticate, requireAdmin, ctrl.register);
router.put('/users/:id/password', authenticate, requireAdmin, ctrl.resetUserPassword);
router.delete('/users/:id', authenticate, requireAdmin, ctrl.deleteUser);

module.exports = router;
