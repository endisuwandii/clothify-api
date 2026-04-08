import { createMiddleware } from "hono/factory";
import { PrivateUser } from "../user/schema";
import { db } from "../../lib/db";
import { verifyToken } from "../../lib/token";

type Env = {
  Variables: {
    user: PrivateUser;
  };
};

/**
 * Check for header and token
 *
 * Authorization: Bearer <token>
 */

export const checkAuthorized = createMiddleware<Env>(async (c, next) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      return c.json({ message: "Authorization header is required" }, 401);
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return c.json({ message: "Token is required" }, 401);
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return c.json({ message: "Invalid token" }, 401);
    }

    const user = await db.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      return c.json({ message: "User is no longer available" }, 401);
    }

    c.set("user", user);

    await next();
  } catch (error) {
    console.error("🚨 ERROR DI MIDDLEWARE:", error);
    return c.json({ message: "Failed to check authorized user" }, 401);
  }
});
