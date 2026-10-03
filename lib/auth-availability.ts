export type AuthAvailability = {
  google: boolean;
  apple: boolean;
  telegram: boolean;
  email: boolean;
  signup: boolean;
};

/** Only enable actions confirmed by Auth, never by user metadata or a UI flag. */
export function authAvailability(
  settings: unknown,
  customProviders: unknown = [],
): AuthAvailability {
  const value =
    settings && typeof settings === "object"
      ? (settings as Record<string, unknown>)
      : {};
  const external =
    value.external && typeof value.external === "object"
      ? (value.external as Record<string, unknown>)
      : {};
  const telegram =
    Array.isArray(customProviders) &&
    customProviders.some((provider) => {
      if (!provider || typeof provider !== "object") return false;
      return (
        provider.identifier === "custom:telegram" &&
        provider.enabled === true &&
        provider.provider_type === "oidc" &&
        provider.issuer === "https://oauth.telegram.org"
      );
    });
  return {
    google: external.google === true,
    apple: external.apple === true,
    telegram,
    email: external.email === true,
    signup: value.disable_signup === false,
  };
}
