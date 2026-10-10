import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.post('/firebase-login', AuthController.firebaseLogin);
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.get('/me', authenticate, AuthController.getMe);
router.post('/switch-demo/:role', AuthController.switchDemoRole);

export default router;
