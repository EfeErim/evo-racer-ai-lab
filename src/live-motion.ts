/** Champion replay speed on Training while no generation race is available. */
export const CHAMPION_REPLAY_RATE = 2;
/** Results plays the champion at real speed. */
export const RESULTS_REPLAY_RATE = 1;

export function shouldAnimateReplay(
  reducedMotion: boolean,
  frameCount: number,
): boolean {
  return !reducedMotion && Number.isInteger(frameCount) && frameCount > 1;
}
