import {
  authenticate,
  sameOrigin,
  serviceClient,
  serverError,
} from "@/server/config";
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const auth = await authenticate(request);
  if (!auth)
    return Response.json({ error: "Sign in required" }, { status: 401 });
  const db = serviceClient();
  if (!db)
    return Response.json(
      { error: "Account management is not configured" },
      { status: 503 },
    );
  try {
    const { error } = await db.auth.admin.deleteUser(auth.user.id);
    if (error) throw error;
    return Response.json({ deleted: true });
  } catch (e) {
    return serverError("account_delete_failed", e);
  }
}
