// apps/server/src/routes/twilio.ts
import { Router } from "express";
const router = Router();

router.post("/webhook/inbound", (req, res) => {
  // TODO: record inbound messages later
  console.log("Inbound SMS", req.body);
  res.status(200).send("ok");
});

export default router;
