/**
 * Latest-request-wins guard for one kind of request to the local core.
 *
 * `begin()` starts a request and returns a check that stays true until another
 * request of the same kind begins or the kind is cancelled, for example when
 * the player leaves the page that asked. A stale response is then dropped
 * instead of overwriting newer state. Cancelling never undoes work the core
 * already did; it only stops the browser from applying the late answer.
 */
export class RequestGate {
  #version = 0;

  begin(): () => boolean {
    this.#version += 1;
    return this.current();
  }

  /** A check for the request already in flight, without starting a new one. */
  current(): () => boolean {
    const version = this.#version;
    return () => version === this.#version;
  }

  cancel(): void {
    this.#version += 1;
  }
}

/** Every kind of request whose late responses must not win. */
export interface RequestGates {
  /** Setup validation on the Set up page. */
  readonly setupValidation: RequestGate;
  /** Start, observe, pause/resume/stop and opening or resuming a saved run. */
  readonly run: RequestGate;
  readonly runLibrary: RequestGate;
  /** The one pending action of the saved-run list (open, resume, export, delete). */
  readonly runLibraryAction: RequestGate;
  readonly presetGeometry: RequestGate;
  readonly trackLibrary: RequestGate;
  /** The one pending Track Builder command (generate, save, delete, assist). */
  readonly trackCommand: RequestGate;
  /** Draft validation and assisted closure of the piece editor. */
  readonly trackValidation: RequestGate;
  readonly trackImport: RequestGate;
}

export function createRequestGates(): RequestGates {
  return {
    setupValidation: new RequestGate(),
    run: new RequestGate(),
    runLibrary: new RequestGate(),
    runLibraryAction: new RequestGate(),
    presetGeometry: new RequestGate(),
    trackLibrary: new RequestGate(),
    trackCommand: new RequestGate(),
    trackValidation: new RequestGate(),
    trackImport: new RequestGate(),
  };
}
