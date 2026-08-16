"use strict";

class UnavailablePasswordResetDelivery {
  constructor() { this.available = false; this.requiresEmail = true; }
  async deliver() { return false; }
}

class CapturePasswordResetDelivery {
  constructor() { this.available = true; this.requiresEmail = false; this.messages = []; }
  async deliver(message) { this.messages.push({ ...message }); return true; }
  latest(userId) { return [...this.messages].reverse().find(item => !userId || item.userId === userId) || null; }
  clear() { this.messages.length = 0; }
}

const passwordResetDelivery = new UnavailablePasswordResetDelivery();
let activeDelivery = passwordResetDelivery;
function getPasswordResetDelivery() { return activeDelivery; }
function setPasswordResetDeliveryForTests(delivery) { if (process.env.NODE_ENV !== "test") throw new Error("TEST_DELIVERY_FORBIDDEN"); activeDelivery = delivery || passwordResetDelivery; }

module.exports = { UnavailablePasswordResetDelivery, CapturePasswordResetDelivery, passwordResetDelivery, getPasswordResetDelivery, setPasswordResetDeliveryForTests };
