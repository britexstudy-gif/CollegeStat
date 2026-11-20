import { AccountScope, type AccountToken } from "./account-owner";

export class AdminLogoChangedError extends Error {
  constructor() {
    super(
      "The account or edited record changed. Choose the logo again in the current record.",
    );
    this.name = "AdminLogoChangedError";
  }
}

type UploadFile = { type: string; size: number };
type Dependencies<FileType extends UploadFile> = {
  getSession: () => Promise<{
    data: { session: { access_token: string; user: { id: string } } | null };
    error?: unknown;
  }>;
  upload: (input: {
    path: string;
    file: FileType;
    contentType: string;
    accessToken: string;
  }) => Promise<{ error?: unknown }>;
  publicUrl: (path: string) => string;
  randomId: () => string;
};

/** Pin both editor identity and auth generation before any asynchronous work. */
export async function uploadAdminLogo<FileType extends UploadFile>(
  file: FileType,
  context: {
    scope: AccountScope;
    token: AccountToken;
    isEditorCurrent: () => boolean;
  },
  dependencies: Dependencies<FileType>,
): Promise<string> {
  const initiating = { ...context.token };
  const assertCurrent = () => {
    if (
      !initiating.owner ||
      !context.scope.isCurrent(initiating) ||
      !context.isEditorCurrent()
    )
      throw new AdminLogoChangedError();
  };
  assertCurrent();
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  if (file.size > 5242880 || !extensions[file.type])
    throw new Error("Choose a PNG, JPEG, or WebP under 5 MB.");
  const session = await dependencies.getSession();
  assertCurrent();
  if (session.error)
    throw new Error("Your session could not be checked. Please retry.");
  const authenticated = session.data.session;
  if (
    !authenticated?.access_token ||
    authenticated.user.id !== initiating.owner
  )
    throw new AdminLogoChangedError();
  const path = dependencies.randomId() + "." + extensions[file.type];
  assertCurrent();
  // The storage request must use this exact session token, rather than whatever
  // account the shared client restores after a later auth transition.
  const result = await dependencies.upload({
    path,
    file,
    contentType: file.type,
    accessToken: authenticated.access_token,
  });
  assertCurrent();
  if (result.error)
    throw new Error(
      "Logo upload failed. Check your connection and staff storage access, then retry.",
    );
  const url = dependencies.publicUrl(path);
  if (!url.startsWith("https://"))
    throw new Error("Storage did not return a valid logo URL.");
  return url;
}
