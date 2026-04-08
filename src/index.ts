import { cors } from "hono/cors";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";

// --- LOCAL MODULES ---
import { db } from "./lib/db";
import { signToken } from "./lib/token";
import { checkAuthorized } from "./modules/auth/middleware";

// --- SCHEMAS ---
import {
  ProductSlugParamSchema,
  ProductSchema,
  ProductsSchema,
} from "./modules/product/schema";
import {
  RegisterUserSchema,
  LoginUserSchema,
  TokenSchema,
  UserIdParamSchema,
  UserSchema,
  UsersSchema,
  PrivateUserSchema,
} from "./modules/user/schema";
import { AddCartItemSchema, CartItemSchema } from "./modules/cart/schema";

const app = new OpenAPIHono();

// ==========================================
// 1. GLOBAL MIDDLEWARE
// ==========================================
app.use(cors());

// ==========================================
// 2. OPENAPI & SCALAR UI CONFIGURATION
// ==========================================
app.doc("/openapi.json", {
  openapi: "3.0.0",
  info: {
    title: "Clothify API",
    version: "1.0.0",
  },
});

app.get(
  "/",
  Scalar({
    pageTitle: "Clothify API Reference",
    url: "/openapi.json",
  }),
);

// ==========================================
// 3. ROUTES: PRODUCTS
// ==========================================
app.openapi(
  createRoute({
    method: "get",
    path: "/products",
    responses: {
      200: {
        description: "Get all products",
        content: { "application/json": { schema: ProductsSchema } },
      },
    },
  }),
  async (c) => {
    const products = await db.product.findMany();
    return c.json(products);
  },
);

app.openapi(
  createRoute({
    method: "get",
    path: "/products/{slug}",
    request: { params: ProductSlugParamSchema },
    responses: {
      200: {
        description: "Get one product by slug",
        content: { "application/json": { schema: ProductSchema } },
      },
      404: {
        description: "Product by slug not found",
      },
    },
  }),
  async (c) => {
    const { slug } = c.req.valid("param");
    const product = await db.product.findUnique({ where: { slug } });

    if (!product) return c.notFound();
    return c.json(product);
  },
);

// ==========================================
// 4. ROUTES: USERS
// ==========================================
app.openapi(
  createRoute({
    method: "get",
    path: "/users",
    responses: {
      200: {
        description: "Get all users",
        content: { "application/json": { schema: UsersSchema } },
      },
    },
  }),
  async (c) => {
    const users = await db.user.findMany({
      omit: { email: true },
    });
    return c.json(users);
  },
);

app.openapi(
  createRoute({
    method: "get",
    path: "/users/{id}",
    request: { params: UserIdParamSchema },
    responses: {
      200: {
        description: "Get one user by ID",
        content: { "application/json": { schema: UserSchema } },
      },
      404: {
        description: "User by id not found",
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const user = await db.user.findUnique({
      where: { id },
      omit: { email: true },
    });

    if (!user) return c.notFound();
    return c.json(user);
  },
);

// ==========================================
// 5. ROUTES: AUTHENTICATION
// ==========================================
app.openapi(
  createRoute({
    method: "post",
    path: "/auth/register",
    request: {
      body: { content: { "application/json": { schema: RegisterUserSchema } } },
    },
    responses: {
      201: {
        description: "Registered new user",
        content: { "application/json": { schema: UsersSchema } },
      },
      400: {
        description: "Failed to register new user",
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    try {
      const hash = await Bun.password.hash(body.password);
      const user = await db.user.create({
        data: {
          username: body.username,
          email: body.email,
          fullName: body.fullName,
          password: { create: { hash } },
        },
      });
      return c.json(user, 201);
    } catch (error) {
      return c.json({ message: "Username or email already exist" }, 400);
    }
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/auth/login",
    request: {
      body: { content: { "application/json": { schema: LoginUserSchema } } },
    },
    responses: {
      200: {
        description: "Logged in to user",
        content: { "text/plain": { schema: TokenSchema } },
      },
      400: { description: "Failed to login user" },
      404: { description: "User not found" },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    try {
      const user = await db.user.findUnique({
        where: { email: body.email },
        include: { password: true },
      });

      if (!user) return c.notFound();
      if (!user.password?.hash)
        return c.json({ message: "User has no password" });

      const isMatch = await Bun.password.verify(
        body.password,
        user.password.hash,
      );
      if (!isMatch) return c.json({ message: "Password incorrect" });

      const token = await signToken(user.id);
      return c.text(token);
    } catch (error) {
      return c.json({ message: "Email or password is incorrect" }, 400);
    }
  },
);

app.openapi(
  createRoute({
    method: "get",
    path: "/auth/me",
    middleware: checkAuthorized,
    responses: {
      200: {
        description: "Get authenticated user",
        content: { "application/json": { schema: PrivateUserSchema } },
      },
    },
  }),
  async (c) => {
    const user = c.get("user");
    return c.json(user);
  },
);

// ==========================================
// 6. ROUTES: CART
// ==========================================
app.openapi(
  createRoute({
    method: "get",
    path: "/cart", // FIX: Sebelumnya "/", ini bentrok sama Scalar UI
    middleware: checkAuthorized,
    responses: {
      200: {
        description: "Get cart",
        content: { "application/json": { schema: CartItemSchema } },
      },
      404: { description: "Cart not found" },
    },
  }),
  async (c) => {
    const user = c.get("user");
    const cart = await db.cart.findFirst({
      where: { userId: user.id },
      include: { items: { include: { product: true } } },
    });

    if (!cart) {
      const newCart = await db.cart.create({
        data: { userId: user.id },
        include: { items: { include: { product: true } } },
      });
      return c.json(newCart);
    }

    return c.json(cart);
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/cart/item",
    middleware: checkAuthorized,
    request: {
      // ✅ REQUEST: Pake yang santai (Frontend cuma ngirim ID & Quantity)
      body: { content: { "application/json": { schema: AddCartItemSchema } } },
    },
    responses: {
      200: {
        description: "Add item to cart",
        // ✅ RESPONSE: Pake yang ketat (Backend ngembaliin data lengkap)
        content: { "application/json": { schema: CartItemSchema } },
      },
      400: { description: "Failed to add item to cart" },
    },
  }),
  async (c) => {
    try {
      const body = c.req.valid("json");
      const user = c.get("user");

      // 1. Cari keranjang user (Pake 'let' biar bisa diisi ulang)
      let cart = await db.cart.findFirst({
        where: { userId: user.id },
      });

      // 2. LOGIKA BARU: Kalau keranjang belum ada, bikinin otomatis!
      if (!cart) {
        cart = await db.cart.create({
          data: { userId: user.id },
        });
      }

      // 3. Cek apakah barang udah ada di keranjang
      const existingItem = await db.cartItem.findFirst({
        where: { cartId: cart.id, productId: body.productId },
      });

      // 4. Kalau barang udah ada, tambahin aja quantity-nya
      if (existingItem) {
        const updatedItem = await db.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: existingItem.quantity + body.quantity },
          include: { product: true },
        });
        return c.json(updatedItem);
      }

      // 5. Kalau barang belum ada, bikin item baru di keranjang
      const newCartItem = await db.cartItem.create({
        data: {
          cartId: cart.id,
          productId: body.productId,
          quantity: body.quantity,
        },
        include: { product: true },
      });

      return c.json(newCartItem);
    } catch (error) {
      console.log(error);
      return c.json({ message: "Failed to add item to cart" }, 400);
    }
  },
);

/* // Route Delete Cart Item (Masih di-comment, tapi path sudah dirapihkan)
app.openapi(
  createRoute({
    method: "delete",
    path: "/cart/items/{id}",
    middleware: checkAuthorized,
    responses: {
      200: { description: "Cart item deleted successfully" },
      404: { description: "Cart item not found" },
    },
  }),
  async (c) => {
    try {
      const id = c.req.param("id");
      const item = await db.cartItem.findUnique({ where: { id: id } });

      if (!item) return c.json({ message: "Cart item not found" }, 404);

      await db.cartItem.delete({ where: { id: id } });
      return c.json({ message: `Cart item '${id}' deleted successfully`, deletedItem: item });
    } catch (error) {
      console.error(error);
      return c.json({ error: "Failed to delete cart item" }, 400);
    }
  },
);
*/

export default app;
