export const REVIEWER_INVITE_CONTEXT_COOKIE = "klimaguy-reviewer-invite";
export const REVIEWER_INVITE_CONTEXT_MAX_AGE = 15 * 60;

export const reviewerInviteCookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: REVIEWER_INVITE_CONTEXT_MAX_AGE,
};
