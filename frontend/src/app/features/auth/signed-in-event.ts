/** Emitted by the sign-in and register forms once a session has been stored. */
export interface SignedInEvent {
  readonly username: string;
  /** Known right after registration; used to pre-fill the account set-up form. */
  readonly email?: string;
}
