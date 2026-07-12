export type CampaignRunGate = {
  targetCount: number;
  dailyLimitReached: boolean;
  withinWindow: boolean;
  locked: boolean;
};

export type CampaignRunDisabledReason =
  | "noTargets"
  | "dailyLimitReached"
  | "outsideWindow"
  | null;

export function canRunNextCampaign(c: CampaignRunGate): boolean {
  return (
    c.targetCount > 0 &&
    !c.dailyLimitReached &&
    c.withinWindow &&
    !c.locked
  );
}

export function campaignRunDisabledReason(
  c: CampaignRunGate,
): CampaignRunDisabledReason {
  if (c.locked) return null;
  if (c.targetCount === 0) return "noTargets";
  if (c.dailyLimitReached) return "dailyLimitReached";
  if (!c.withinWindow) return "outsideWindow";
  return null;
}
