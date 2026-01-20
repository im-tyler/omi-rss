import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { EthicalPaywallBypassService } from '../services/paywall';

const router = Router();
const paywallService = new EthicalPaywallBypassService();

// Attempt to bypass paywall ethically
const bypassPaywallSchema = z.object({
  body: z.object({
    url: z.string().url(),
  }),
});

router.post(
  '/bypass',
  authenticateToken,
  validateRequest(bypassPaywallSchema),
  async (req, res, next) => {
    try {
      const { url } = req.body;
      const result = await paywallService.attemptBypass({ url });
      
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// Get bypass suggestions
const bypassSuggestionsSchema = z.object({
  query: z.object({
    url: z.string().url(),
  }),
});

router.get(
  '/suggestions',
  authenticateToken,
  validateRequest(bypassSuggestionsSchema),
  async (req, res, next) => {
    try {
      const { url } = req.query as { url: string };
      const suggestions = await paywallService.getBypassSuggestions(url);
      
      res.json({ suggestions });
    } catch (error) {
      next(error);
    }
  }
);

export default router;