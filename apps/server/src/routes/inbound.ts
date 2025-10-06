import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

// Twilio will POST incoming SMS here
router.post("/inbound", async (req: Request, res: Response) => {
  try {
    const { From, Body } = req.body;

    console.log("📩 Inbound SMS:", { From, Body });

    // You can extend this to save to DB or trigger logic
    // For now, just respond to Twilio so it doesn't error out
    res.set("Content-Type", "text/xml");
    res.send(`<Response><Message>Got your message: ${Body}</Message></Response>`);
  } catch (err) {
    console.error("Inbound error:", err);
    res.status(500).send("Server error");
  }
});

export default router;
