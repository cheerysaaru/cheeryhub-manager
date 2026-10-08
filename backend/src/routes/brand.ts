import type { AppRequest } from "../types/index";
import { Database } from "../db/client";

export async function getBrand(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const db = new Database(req.env?.DB!);
    const user = await db.getUserById(req.user.id);

    if (!user) {
      return new Response(
        JSON.stringify({
          error: "User not found",
          code: "NOT_FOUND",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const brand = {
      name: user.name || "My Productivity",
      avatar: user.avatar || null,
      bio: user.bio || "",
      theme: user.theme || "light",
      color: user.themeColor || "#3b82f6",
    };

    return new Response(JSON.stringify({ data: brand }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error getting brand:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to get brand settings",
        code: "INTERNAL_ERROR",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function updateBrand(req: AppRequest): Promise<Response> {
  if (!req.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { name, avatar, bio, theme, color } = req.body as any;

  try {
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push("name = ?1");
      values.push(name);
    }
    if (avatar !== undefined) {
      updates.push("avatar = ?2");
      values.push(avatar);
    }
    if (bio !== undefined) {
      updates.push("bio = ?3");
      values.push(bio);
    }
    if (theme !== undefined) {
      updates.push("theme = ?4");
      values.push(theme);
    }
    if (color !== undefined) {
      updates.push("themeColor = ?5");
      values.push(color);
    }

    if (updates.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No fields to update",
          code: "VALIDATION_ERROR",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const db = new Database(req.env?.DB!);
    const updateIdx = values.length + 1;
    await db.run(
      `UPDATE User SET ${updates.join(", ")} WHERE id = ?${updateIdx}`,
      [...values, req.user.id],
    );

    const updated = await db.getUserById(req.user.id);

    if (!updated) {
      return new Response(
        JSON.stringify({
          error: "Failed to update user",
          code: "UPDATE_FAILED",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const brand = {
      name: updated.name || "My Productivity",
      avatar: updated.avatar || null,
      bio: updated.bio || "",
      theme: updated.theme || "light",
      color: updated.themeColor || "#3b82f6",
    };

    return new Response(JSON.stringify({ data: brand }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating brand:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to update brand settings",
        code: "INTERNAL_ERROR",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
