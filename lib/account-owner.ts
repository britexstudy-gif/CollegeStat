export type AccountOwner = string | null;
export type AccountToken = { owner: AccountOwner; generation: number };

/** Auth events invalidate pending account work before React runs any effects. */
export class AccountScope {
  private owner: AccountOwner = null;
  private generation = 0;
  private listeners = new Set<(token: AccountToken) => void>();

  changeOwner(owner: AccountOwner) {
    if (owner === this.owner) return false;
    this.owner = owner;
    this.generation++;
    for (const listener of this.listeners) {
      try {
        listener(this.capture());
      } catch {
        // A cancelled consumer must not interrupt the auth transition.
      }
    }
    return true;
  }

  subscribe(listener: (token: AccountToken) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  capture(): AccountToken {
    return { owner: this.owner, generation: this.generation };
  }

  isOwner(owner: AccountOwner) {
    return owner === this.owner;
  }

  isCurrent(token: AccountToken) {
    return token.owner === this.owner && token.generation === this.generation;
  }
}

export type OwnedAccount<Profile> = {
  owner: AccountOwner;
  loaded: boolean;
  profile: Profile | null;
  saved: string[];
  savedScholarships: string[];
  compare: string[];
};

export function emptyAccount<Profile>(
  owner: AccountOwner = null,
): OwnedAccount<Profile> {
  return {
    owner,
    loaded: owner === null,
    profile: null,
    saved: [],
    savedScholarships: [],
    compare: [],
  };
}

export function changeAccountOwner<Profile>(
  account: OwnedAccount<Profile>,
  owner: AccountOwner,
): OwnedAccount<Profile> {
  if (account.owner === owner) return account;
  const next = emptyAccount<Profile>(owner);
  // An anonymous visitor can sign in to save their current local selection.
  // Research owned by a signed-in account never crosses to another identity.
  if (account.owner === null && owner !== null) next.compare = account.compare;
  return next;
}

export function visibleAccount<Profile>(
  account: OwnedAccount<Profile>,
  owner: AccountOwner,
): OwnedAccount<Profile> {
  return account.owner === owner ? account : emptyAccount<Profile>(owner);
}
